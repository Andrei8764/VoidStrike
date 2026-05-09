import {
    ammoElement,
    balanceElement,
    blueScoreElement,
    connectionStatusElement,
    hpElement,
    killFeedElement,
    chatMessagesElement,
    magazineElement,
    minimapCanvas,
    minimapContext,
    nextRoundCountdownElement,
    purchaseNotificationElement,
    redScoreElement,
    reloadStatusElement,
    roundEndBodyElement,
    roundEndOverlayElement,
    roundNumberElement,
    roundTimerElement,
    scoreboardBodyElement,
    teamElement,
    weaponElement
} from "./dom.js";
import { state } from "./state.js";
import { WORLD_HEIGHT, WORLD_WIDTH } from "./config.js";
import { escapeHtml, formatTime } from "./utils.js";
import { getSelfPlayer } from "./state.js";

export function setConnectionStatus(status) {
    connectionStatusElement.textContent = status;
    connectionStatusElement.className = status;
}

export function updateHud() {
    const self = getSelfPlayer();

    if (self) {
        hpElement.textContent = self.hp;
        teamElement.textContent = self.team;
        teamElement.className = self.team.toLowerCase();
        balanceElement.textContent = self.balance ?? 0;
        weaponElement.textContent = self.weapon;
        ammoElement.textContent = self.ammo;
        magazineElement.textContent = self.magazineSize;
        reloadStatusElement.textContent = self.reloading ? "Reloading..." : "";
    }

    if (state.round) {
        roundNumberElement.textContent = state.round.roundNumber;
        roundTimerElement.textContent = formatTime(state.round.timeLeftSeconds);
        redScoreElement.textContent = state.round.redScore;
        blueScoreElement.textContent = state.round.blueScore;
        updateRoundEndOverlay();
    }

    updateMinimap();
    updateChat();
}

function updateRoundEndOverlay() {
    if (state.round.status !== "ENDING") {
        roundEndOverlayElement.classList.add("hidden");
        return;
    }

    nextRoundCountdownElement.textContent = state.round.timeLeftSeconds;
    roundEndBodyElement.innerHTML = (state.round.topPlayers || []).map((player, index) => `
        <tr class="${player.team.toLowerCase()}">
            <td>${index + 1}</td>
            <td>${escapeHtml(player.name)}</td>
            <td>${player.team}</td>
            <td>${player.kills}</td>
            <td>${player.deaths}</td>
            <td>${Number(player.kd).toFixed(2)}</td>
        </tr>
    `).join("");

    roundEndOverlayElement.classList.remove("hidden");
}

export function showPurchaseNotification(weaponName) {
    purchaseNotificationElement.textContent = `Ai cumpărat ${weaponName}! Arma a fost echipată.`;

    if (state.purchaseNotificationTimeoutId !== null) {
        clearTimeout(state.purchaseNotificationTimeoutId);
    }

    state.purchaseNotificationTimeoutId = setTimeout(() => {
        purchaseNotificationElement.classList.add("hidden");
        state.purchaseNotificationTimeoutId = null;
    }, 2500);
}

export function updateScoreboard() {
    const sortedPlayers = [...state.players].sort((a, b) => b.kills - a.kills);

    scoreboardBodyElement.innerHTML = sortedPlayers.map(player => `
        <tr class="${player.team.toLowerCase()}">
            <td>${escapeHtml(player.name)}</td>
            <td>${player.team}</td>
            <td>${player.kills}</td>
            <td>${player.deaths}</td>
            <td>${player.weapon}</td>
            <td>${player.hp}</td>
        </tr>
    `).join("");
}

export function updateKillFeed() {
    const playerByName = new Map(
        state.players.map(player => [player.name, player])
    );

    killFeedElement.innerHTML = state.killFeed.map(event => `
        <div class="killFeedItem">
            <span><span class="killHeadTexture" style="background-image:url('${escapeHtml(getHeadTexturePath(playerByName.get(event.attacker)?.characterModel))}')" aria-hidden="true"></span>${escapeHtml(event.attacker)}</span>
            <strong>${escapeHtml(event.weapon)}</strong>
            <span><span class="killHeadTexture" style="background-image:url('${escapeHtml(getHeadTexturePath(playerByName.get(event.victim)?.characterModel))}')" aria-hidden="true"></span>${escapeHtml(event.victim)}</span>
        </div>
    `).join("");
}

function getHeadTexturePath(characterModel) {
    const normalized = (characterModel || "").toLowerCase();

    if (normalized.startsWith("character-") && normalized.endsWith(".glb")) {
        const letter = normalized.substring("character-".length, "character-".length + 1);
        if (letter >= "a" && letter <= "r") {
            return `/models/Textures/texture-${letter}.png`;
        }
    }

    if (normalized.startsWith("a_character")) {
        return "/models/Textures/texture-a.png";
    }

    return "/models/Textures/texture-a.png";
}

function updateChat() {
    if (!chatMessagesElement) {
        return;
    }

    chatMessagesElement.innerHTML = state.chatMessages.map(message => `
        <div class="chatLine">
            <span class="chatName ${message.team.toLowerCase()}">${escapeHtml(message.player)}:</span>
            <span>${escapeHtml(message.text)}</span>
        </div>
    `).join("");

    chatMessagesElement.scrollTop = chatMessagesElement.scrollHeight;
}

function updateMinimap() {
    if (!minimapCanvas || !minimapContext) {
        return;
    }

    const self = getSelfPlayer();
    minimapContext.clearRect(0, 0, minimapCanvas.width, minimapCanvas.height);

    minimapContext.fillStyle = "rgba(5, 8, 16, 0.75)";
    minimapContext.fillRect(0, 0, minimapCanvas.width, minimapCanvas.height);

    minimapContext.strokeStyle = "rgba(125, 211, 252, 0.45)";
    minimapContext.strokeRect(0.5, 0.5, minimapCanvas.width - 1, minimapCanvas.height - 1);

    if (!self) {
        return;
    }

    const visiblePlayers = state.players.filter(player => (
        player.id === self.id || player.team === self.team
    ));

    for (const player of visiblePlayers) {
        const px = player.x / WORLD_WIDTH * minimapCanvas.width;
        const py = player.y / WORLD_HEIGHT * minimapCanvas.height;

        minimapContext.fillStyle = player.id === self.id ? "#22c55e" : "#e2e8f0";
        minimapContext.beginPath();
        minimapContext.arc(px, py, player.id === self.id ? 3.5 : 2.8, 0, Math.PI * 2);
        minimapContext.fill();
    }
}
