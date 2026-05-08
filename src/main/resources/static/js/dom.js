export const canvas = document.getElementById("gameCanvas");
export const context = canvas.getContext("2d");

export const nameOverlay = document.getElementById("nameOverlay");
export const nameInput = document.getElementById("nameInput");
export const joinButton = document.getElementById("joinButton");
export const nameError = document.getElementById("nameError");

export const connectionStatusElement = document.getElementById("connectionStatus");
export const playerNameElement = document.getElementById("playerName");
export const hpElement = document.getElementById("hp");
export const teamElement = document.getElementById("team");
export const balanceElement = document.getElementById("balance");
export const weaponElement = document.getElementById("weapon");
export const ammoElement = document.getElementById("ammo");
export const magazineElement = document.getElementById("magazine");
export const reloadStatusElement = document.getElementById("reloadStatus");

export const roundNumberElement = document.getElementById("roundNumber");
export const roundTimerElement = document.getElementById("roundTimer");
export const redScoreElement = document.getElementById("redScore");
export const blueScoreElement = document.getElementById("blueScore");

export const scoreboardElement = document.getElementById("scoreboard");
export const scoreboardBodyElement = document.getElementById("scoreboardBody");
export const killFeedElement = document.getElementById("killFeed");
export const weaponShopElement = document.getElementById("weaponShop");
export const weaponShopButtons = document.querySelectorAll("#weaponShop button[data-weapon-slot]");
export const purchaseNotificationElement = document.getElementById("purchaseNotification");

export const roundEndOverlayElement = document.getElementById("roundEndOverlay");
export const roundEndBodyElement = document.getElementById("roundEndBody");
export const nextRoundCountdownElement = document.getElementById("nextRoundCountdown");