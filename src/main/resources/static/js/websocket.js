import {
    characterSelect,
    joinButton,
    nameError,
    nameInput,
    nameOverlay,
    playerNameElement
} from "./dom.js";
import { getSelfPlayer, keys, mouse, state } from "./state.js";
import {
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
import { updateAimAngle } from "./renderer3d.js";
import { buildCurrentInput, reconcileLocalPlayer } from "./prediction.js";
import { ensureSceneCollisionLoaded } from "./sceneCollision.js";
import { addBulletInterpolationSnapshot, addRemoteInterpolationSnapshot } from "./interpolation.js";
import {
    configureServerTickRate,
    resetNetworkClock,
    updateNetworkClock
} from "./networkClock.js";

const ENEMY_SHOT_HEAR_DISTANCE = 520;

export function connectWebSocket() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${window.location.host}/ws/game`;

    state.joined = false;
    resetNetworkClock();
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
            state.selectedCharacterModel = message.characterModel || state.selectedCharacterModel;
            configureServerTickRate(message.tickRate);

            playerNameElement.textContent = state.playerName;
            nameOverlay.classList.add("hidden");

            ensureSceneCollisionLoaded();
            startSendingInput();
            return;
        }

        if (message.type === "snapshot") {
            if (typeof message.serverTime === "number") {
                updateNetworkClock(message.serverTime);
            }

            state.players = message.players;
            state.bullets = message.bullets;
            state.obstacles = message.obstacles || state.obstacles;
            state.killFeed = message.killFeed || [];
            state.chatMessages = message.chatMessages || [];
            state.round = message.round;

            const snapshotServerTime = typeof message.serverTime === "number"
                ? message.serverTime
                : performance.now();

            addRemoteInterpolationSnapshot(message.players, snapshotServerTime);
            addBulletInterpolationSnapshot(message.bullets, snapshotServerTime);
            detectWeaponPurchase();
            detectLocalKillSounds();
            detectMvpSound();
            detectRoundEndSound();
            reconcileLocalPlayer();

            detectLocalShot();
            detectNearbyEnemyShots();
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
        state.chatMessages = [];
        state.remotePlayerAmmo.clear();
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
    state.selectedCharacterModel = characterSelect?.value || state.selectedCharacterModel;

    state.socket.send(JSON.stringify({
        type: "join",
        name: requestedName,
        characterModel: state.selectedCharacterModel
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

        state.inputSequence += 1;
        const input = buildCurrentInput(state.inputSequence);

        if (input.climb) {
            state.climbDebugUntil = Date.now() + 2500;
            state.climbDebugLastSequence = input.sequence;
            const self = getSelfPlayer();
            console.log("[CLIMB_DEBUG] send_input", {
                sequence: input.sequence,
                pos: self ? { x: self.x, y: self.y, z: self.z } : null,
                vel: self ? { x: self.velocityX, y: self.velocityY, z: self.velocityZ } : null,
                angle: input.angle,
                pitch: input.pitch
            });
        }

        state.pendingInputs.push(input);

        state.socket.send(JSON.stringify(input));

        state.reloadRequested = false;
        state.climbRequested = false;
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

export function sendChatMessage(text) {
    if (!state.socket || state.socket.readyState !== WebSocket.OPEN || !state.joined) {
        return;
    }

    state.socket.send(JSON.stringify({
        type: "chat",
        text
    }));
}

export function sendAdminCommand(command) {
    if (!state.socket || state.socket.readyState !== WebSocket.OPEN || !state.joined) {
        return false;
    }

    state.socket.send(JSON.stringify({
        type: "adminCommand",
        command
    }));
    return true;
}

function detectNearbyEnemyShots() {
    const self = getSelfPlayer();

    if (!self) {
        state.remotePlayerAmmo.clear();
        return;
    }

    const activeRemotePlayerIds = new Set();

    for (const player of state.players) {
        if (player.id === state.playerId) {
            continue;
        }

        activeRemotePlayerIds.add(player.id);

        const previousAmmo = state.remotePlayerAmmo.get(player.id);
        state.remotePlayerAmmo.set(player.id, player.ammo);

        if (previousAmmo === undefined || player.ammo >= previousAmmo) {
            continue;
        }

        const dx = player.x - self.x;
        const dy = player.y - self.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance <= ENEMY_SHOT_HEAR_DISTANCE) {
            playShootSound(player.weapon);
        }
    }

    for (const playerId of state.remotePlayerAmmo.keys()) {
        if (!activeRemotePlayerIds.has(playerId)) {
            state.remotePlayerAmmo.delete(playerId);
        }
    }
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
