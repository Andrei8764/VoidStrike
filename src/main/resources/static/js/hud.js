import {
    ammoElement,
    blueScoreElement,
    connectionStatusElement,
    hpElement,
    killFeedElement,
    magazineElement,
    redScoreElement,
    reloadStatusElement,
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
    }
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