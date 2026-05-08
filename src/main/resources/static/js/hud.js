import {
    ammoElement,
    balanceElement,
    blueScoreElement,
    connectionStatusElement,
    hpElement,
    killFeedElement,
    magazineElement,
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
    killFeedElement.innerHTML = state.killFeed.map(event => `
        <div class="killFeedItem">
            <span>${escapeHtml(event.attacker)}</span>
            <strong>${escapeHtml(event.weapon)}</strong>
            <span>${escapeHtml(event.victim)}</span>
        </div>
    `).join("");
}