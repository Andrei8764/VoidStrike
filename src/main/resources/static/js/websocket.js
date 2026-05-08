import {
    joinButton,
    nameError,
    nameInput,
    nameOverlay,
    playerNameElement
} from "./dom.js";
import { getSelfPlayer, keys, mouse, state } from "./state.js";
import {
    CLIENT_DELTA_SECONDS,
    CLIENT_TICK_RATE,
    MAX_NAME_LENGTH,
    MIN_NAME_LENGTH,
    NAME_PATTERN
} from "./config.js";
import {
    getRecoilKick,
    playDoubleKillSound,
    playHeadshotSound,
    playInfinitySound,
    playMvpSound,
    playReloadSound,
    playShootSound,
    resumeAudio
} from "./audio.js";
import {
    setConnectionStatus,
    showPurchaseNotification,
    updateHud,
    updateKillFeed,
    updateScoreboard
} from "./hud.js";
import { updateAimAngle } from "./renderer.js";
import { predictLocalPlayer, reconcileLocalPlayer } from "./prediction.js";
import { addBulletInterpolationSnapshot, addRemoteInterpolationSnapshot } from "./interpolation.js";

export function connectWebSocket() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${window.location.host}/ws/game`;

    state.joined = false;
    setConnectionStatus("connecting");
    state.socket = new WebSocket(url);

    state.socket.onopen = () => {
        setConnectionStatus("connected");
    };

    state.socket.onmessage = event => {
        const message = JSON.parse(event.data);

        if (message.type === "connected") {
            return;
        }

        if (message.type === "nameRejected") {
            state.joined = false;
            joinButton.disabled = false;
            nameError.textContent = message.message;
            nameOverlay.classList.remove("hidden");
            return;
        }

        if (message.type === "error") {
            nameError.textContent = message.message;
            return;
        }

        if (message.type === "joined") {
            state.joined = true;
            state.playerId = message.playerId;
            state.playerName = message.name;

            playerNameElement.textContent = state.playerName;
            nameOverlay.classList.add("hidden");

            startSendingInput();
            return;
        }

        if (message.type === "snapshot") {
            state.players = message.players;
            state.bullets = message.bullets;
            state.obstacles = message.obstacles || state.obstacles;
            state.killFeed = message.killFeed || [];
            state.round = message.round;

            addRemoteInterpolationSnapshot(message.players);
            addBulletInterpolationSnapshot(message.bullets);
            detectWeaponPurchase();
            detectLocalKillSounds();
            detectMvpSound();
            detectRoundEndSound();
            reconcileLocalPlayer();

            detectLocalShot();
            detectReloadSound();
            updateHud();
            updateScoreboard();
            updateKillFeed();
        }
    };

    state.socket.onclose = () => {
        state.joined = false;
        state.predictedSelf = null;
        state.pendingInputs = [];
        state.inputSequence = 0;
        state.lastUnlockedWeapons = [];
        state.lastKillFeedEventIds.clear();
        state.lastLocalKillAt = 0;
        state.lastRoundNumber = null;
        state.lastRoundStatus = null;
        state.roundEndSoundPlayedForRound = null;
        state.remotePlayerStates.clear();

        setConnectionStatus("disconnected");
        stopSendingInput();

        nameOverlay.classList.remove("hidden");
        joinButton.disabled = false;

        setTimeout(() => {
            connectWebSocket();
        }, 1500);
    };

    state.socket.onerror = () => {
        setConnectionStatus("disconnected");
    };
}

export function joinGame() {
    resumeAudio();

    if (!state.socket || state.socket.readyState !== WebSocket.OPEN) {
        nameError.textContent = "Conexiunea nu este încă pregătită.";
        return;
    }

    const requestedName = nameInput.value.trim();
    const validationError = validatePlayerName(requestedName);

    if (validationError) {
        nameError.textContent = validationError;
        return;
    }

    joinButton.disabled = true;
    nameError.textContent = "";

    state.socket.send(JSON.stringify({
        type: "join",
        name: requestedName
    }));
}

function validatePlayerName(name) {
    if (name.length < MIN_NAME_LENGTH) {
        return "Numele trebuie să aibă cel puțin 3 caractere.";
    }

    if (name.length > MAX_NAME_LENGTH) {
        return "Numele trebuie să aibă maximum 16 caractere.";
    }

    if (!NAME_PATTERN.test(name)) {
        return "Numele poate conține doar litere, cifre, _ și -.";
    }

    return null;
}

function startSendingInput() {
    stopSendingInput();

    state.inputIntervalId = setInterval(() => {
        if (!state.joined || !state.socket || state.socket.readyState !== WebSocket.OPEN) {
            return;
        }

        updateAimAngle();

        const input = {
            type: "input",
            sequence: ++state.inputSequence,
            up: keys.up,
            down: keys.down,
            left: keys.left,
            right: keys.right,
            shoot: mouse.down,
            reload: state.reloadRequested,
            weaponSlot: state.selectedWeaponSlot,
            buyWeaponSlot: state.buyWeaponSlot,
            angle: mouse.angle,
            pitch: mouse.pitch
        };

        predictLocalPlayer(input, CLIENT_DELTA_SECONDS);
        state.pendingInputs.push(input);

        state.socket.send(JSON.stringify(input));

        state.reloadRequested = false;
        state.buyWeaponSlot = null;
    }, 1000 / CLIENT_TICK_RATE);
}

function stopSendingInput() {
    if (state.inputIntervalId !== null) {
        clearInterval(state.inputIntervalId);
        state.inputIntervalId = null;
    }
}

function detectLocalShot() {
    const self = getSelfPlayer();

    if (!self) {
        return;
    }

    if (state.lastSelfAmmo !== null && self.ammo < state.lastSelfAmmo) {
        playShootSound(self.weapon);
        state.recoilKick = Math.min(18, state.recoilKick + getRecoilKick(self.weapon));
    }

    state.lastSelfAmmo = self.ammo;
}

function detectReloadSound() {
    const self = getSelfPlayer();

    if (!self) {
        state.lastReloading = false;
        return;
    }

    if (self.reloading && !state.lastReloading) {
        playReloadSound();
    }

    state.lastReloading = self.reloading;
}

function detectLocalKillSounds() {
    const selfName = state.playerName;

    if (!selfName || !state.killFeed.length) {
        return;
    }

    const activeEventIds = new Set();

    for (const event of state.killFeed) {
        const eventId = `${event.attacker}-${event.victim}-${event.weapon}-${event.createdAt}`;
        activeEventIds.add(eventId);

        if (state.lastKillFeedEventIds.has(eventId)) {
            continue;
        }

        if (event.attacker !== selfName) {
            continue;
        }

        const now = Date.now();
        const isHeadshot = event.weapon.includes("HEADSHOT");
        const isDoubleKill = now - state.lastLocalKillAt <= 4000;

        if (isHeadshot) {
            playHeadshotSound();
        }

        if (isDoubleKill) {
            playDoubleKillSound();
        }

        state.lastLocalKillAt = now;
    }

    state.lastKillFeedEventIds = activeEventIds;
}

function detectMvpSound() {
    if (!state.round) {
        return;
    }

    if (state.lastRoundNumber === null) {
        state.lastRoundNumber = state.round.roundNumber;
        return;
    }

    if (state.round.roundNumber === state.lastRoundNumber) {
        return;
    }

    const self = state.players.find(player => player.id === state.playerId);

    if (!self) {
        state.lastRoundNumber = state.round.roundNumber;
        return;
    }

    const highestKills = Math.max(...state.players.map(player => player.kills));

    if (self.kills > 0 && self.kills === highestKills) {
        playMvpSound();
    }

    state.lastRoundNumber = state.round.roundNumber;
}

function detectRoundEndSound() {
    if (!state.round) {
        return;
    }

    if (
        state.round.status === "ENDING"
        && state.roundEndSoundPlayedForRound !== state.round.roundNumber
    ) {
        playInfinitySound();
        state.roundEndSoundPlayedForRound = state.round.roundNumber;
    }

    state.lastRoundStatus = state.round.status;
}

function detectWeaponPurchase() {
    const serverSelf = state.players.find(player => player.id === state.playerId);

    if (!serverSelf) {
        state.lastUnlockedWeapons = [];
        return;
    }

    const unlockedWeapons = serverSelf.unlockedWeapons || [];

    if (state.lastUnlockedWeapons.length === 0) {
        state.lastUnlockedWeapons = [...unlockedWeapons];
        return;
    }

    const newlyUnlockedWeapon = unlockedWeapons.find(
        weapon => !state.lastUnlockedWeapons.includes(weapon)
    );

    if (newlyUnlockedWeapon) {
        showPurchaseNotification(newlyUnlockedWeapon);
    }

    state.lastUnlockedWeapons = [...unlockedWeapons];
}