const canvas = document.getElementById("gameCanvas");
const context = canvas.getContext("2d");

const nameOverlay = document.getElementById("nameOverlay");
const nameInput = document.getElementById("nameInput");
const joinButton = document.getElementById("joinButton");
const nameError = document.getElementById("nameError");

const connectionStatusElement = document.getElementById("connectionStatus");
const playerNameElement = document.getElementById("playerName");
const hpElement = document.getElementById("hp");
const teamElement = document.getElementById("team");
const weaponElement = document.getElementById("weapon");
const ammoElement = document.getElementById("ammo");
const magazineElement = document.getElementById("magazine");
const reloadStatusElement = document.getElementById("reloadStatus");
const roundNumberElement = document.getElementById("roundNumber");
const roundTimerElement = document.getElementById("roundTimer");
const redScoreElement = document.getElementById("redScore");
const blueScoreElement = document.getElementById("blueScore");
const scoreboardElement = document.getElementById("scoreboard");
const scoreboardBodyElement = document.getElementById("scoreboardBody");
const killFeedElement = document.getElementById("killFeed");

const WORLD_WIDTH = 1600;
const WORLD_HEIGHT = 900;

const PLAYER_RADIUS = 20;
const BULLET_RADIUS = 5;

const MIN_NAME_LENGTH = 3;
const MAX_NAME_LENGTH = 16;
const NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;

let socket = null;
let playerId = null;
let playerName = null;
let joined = false;

let players = [];
let bullets = [];
let obstacles = [];
let killFeed = [];
let round = null;

let selectedWeaponSlot = 2;
let reloadRequested = false;
let scoreboardVisible = false;
let lastSelfAmmo = null;
let recoilKick = 0;
let lastReloading = false;

const audioContext = new (window.AudioContext || window.webkitAudioContext)();

let inputIntervalId = null;

const keys = {
    up: false,
    down: false,
    left: false,
    right: false
};

const mouse = {
    x: 0,
    y: 0,
    worldX: 0,
    worldY: 0,
    down: false,
    angle: 0
};

const camera = {
    x: 0,
    y: 0
};

resizeCanvas();
connectWebSocket();
requestAnimationFrame(gameLoop);

joinButton.addEventListener("click", joinGame);

nameInput.addEventListener("keydown", event => {
    if (event.code === "Enter") {
        joinGame();
    }
});

nameInput.addEventListener("input", () => {
    nameError.textContent = "";
});

window.addEventListener("resize", resizeCanvas);

window.addEventListener("keydown", event => {
    switch (event.code) {
        case "KeyW":
        case "ArrowUp":
            keys.up = true;
            break;
        case "KeyS":
        case "ArrowDown":
            keys.down = true;
            break;
        case "KeyA":
        case "ArrowLeft":
            keys.left = true;
            break;
        case "KeyD":
        case "ArrowRight":
            keys.right = true;
            break;
        case "KeyR":
            reloadRequested = true;
            break;
        case "Digit1":
        case "Numpad1":
            selectedWeaponSlot = 1;
            break;
        case "Digit2":
        case "Numpad2":
            selectedWeaponSlot = 2;
            break;
        case "Digit3":
        case "Numpad3":
            selectedWeaponSlot = 3;
            break;
        case "Digit4":
        case "Numpad4":
            selectedWeaponSlot = 4;
            break;
        case "Digit5":
        case "Numpad5":
            selectedWeaponSlot = 5;
            break;
        case "Tab":
            event.preventDefault();
            scoreboardVisible = true;
            scoreboardElement.classList.remove("hidden");
            break;
    }
});

window.addEventListener("keyup", event => {
    switch (event.code) {
        case "KeyW":
        case "ArrowUp":
            keys.up = false;
            break;
        case "KeyS":
        case "ArrowDown":
            keys.down = false;
            break;
        case "KeyA":
        case "ArrowLeft":
            keys.left = false;
            break;
        case "KeyD":
        case "ArrowRight":
            keys.right = false;
            break;
        case "Tab":
            event.preventDefault();
            scoreboardVisible = false;
            scoreboardElement.classList.add("hidden");
            break;
    }
});

canvas.addEventListener("keyup", event => {
    switch (event.code) {
        case "KeyW":
        case "ArrowUp":
            keys.up = false;
            break;
        case "KeyS":
        case "ArrowDown":
            keys.down = false;
            break;
        case "KeyA":
        case "ArrowLeft":
            keys.left = false;
            break;
        case "KeyD":
        case "ArrowRight":
            keys.right = false;
            break;
        case "Tab":
            event.preventDefault();
            scoreboardVisible = false;
            scoreboardElement.classList.add("hidden");
            break;
    }
});

canvas.addEventListener("mousemove", event => {
    const rect = canvas.getBoundingClientRect();

    mouse.x = event.clientX - rect.left;
    mouse.y = event.clientY - rect.top;

    updateMouseWorldPosition();
});

canvas.addEventListener("mousedown", event => {
    if (event.button === 0) {
        resumeAudio();
        mouse.down = true;
    }
});

canvas.addEventListener("mouseup", event => {
    if (event.button === 0) {
        mouse.down = false;
    }
});

canvas.addEventListener("contextmenu", event => {
    event.preventDefault();
});

function connectWebSocket() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${window.location.host}/ws/game`;

    joined = false;
    setConnectionStatus("connecting");
    socket = new WebSocket(url);

    socket.onopen = () => {
        setConnectionStatus("connected");
    };

    socket.onmessage = event => {
        const message = JSON.parse(event.data);

        if (message.type === "connected") {
            return;
        }

        if (message.type === "nameRejected") {
            joined = false;
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
            joined = true;
            playerId = message.playerId;
            playerName = message.name;

            playerNameElement.textContent = playerName;

            nameOverlay.classList.add("hidden");

            startSendingInput();
            return;
        }

        if (message.type === "snapshot") {
            players = message.players;
            bullets = message.bullets;
            obstacles = message.obstacles || obstacles;
            killFeed = message.killFeed || [];
            round = message.round;

            detectLocalShot();
            detectReloadSound();
            updateHud();
            updateScoreboard();
            updateKillFeed();
        }
    };

    socket.onclose = () => {
        joined = false;
        setConnectionStatus("disconnected");
        stopSendingInput();

        nameOverlay.classList.remove("hidden");
        joinButton.disabled = false;

        setTimeout(() => {
            connectWebSocket();
        }, 1500);
    };

    socket.onerror = () => {
        setConnectionStatus("disconnected");
    };
}

function joinGame() {
    resumeAudio();

    if (!socket || socket.readyState !== WebSocket.OPEN) {
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

    socket.send(JSON.stringify({
        type: "join",
        name: requestedName
    }));
}

function resumeAudio() {
    if (audioContext.state === "suspended") {
        audioContext.resume();
    }
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

    inputIntervalId = setInterval(() => {
        if (!joined || !socket || socket.readyState !== WebSocket.OPEN) {
            return;
        }

        updateAimAngle();

        socket.send(JSON.stringify({
            type: "input",
            up: keys.up,
            down: keys.down,
            left: keys.left,
            right: keys.right,
            shoot: mouse.down,
            reload: reloadRequested,
            weaponSlot: selectedWeaponSlot,
            angle: mouse.angle
        }));

        reloadRequested = false;
    }, 1000 / 30);
}

function stopSendingInput() {
    if (inputIntervalId !== null) {
        clearInterval(inputIntervalId);
        inputIntervalId = null;
    }
}

function gameLoop() {
    updateCamera();
    updateMouseWorldPosition();
    updateAimAngle();

    recoilKick *= 0.88;

    render();

    requestAnimationFrame(gameLoop);
}

function updateCamera() {
    const self = getSelfPlayer();

    if (!self) {
        camera.x = WORLD_WIDTH / 2 - canvas.width / 2;
        camera.y = WORLD_HEIGHT / 2 - canvas.height / 2;
        return;
    }

    camera.x = self.x - canvas.width / 2;
    camera.y = self.y - canvas.height / 2;

    camera.x = clamp(camera.x, 0, Math.max(0, WORLD_WIDTH - canvas.width));
    camera.y = clamp(camera.y, 0, Math.max(0, WORLD_HEIGHT - canvas.height));
}

function updateMouseWorldPosition() {
    mouse.worldX = mouse.x + camera.x;
    mouse.worldY = mouse.y + camera.y;
}

function updateAimAngle() {
    const self = getSelfPlayer();

    if (!self) {
        mouse.angle = 0;
        return;
    }

    mouse.angle = Math.atan2(mouse.worldY - self.y, mouse.worldX - self.x);
}

function render() {
    context.clearRect(0, 0, canvas.width, canvas.height);

    drawBackground();
    drawFloorLighting();
    drawGrid();
    drawSpawnZones();
    drawObstacles();
    drawMapBorder();
    drawBullets();
    drawPlayers();
    drawGunOverlay();
    drawCrosshair();
    drawMinimap();
    drawVignette();
}

function drawBackground() {
    context.fillStyle = "#080b12";
    context.fillRect(0, 0, canvas.width, canvas.height);
}

function drawFloorLighting() {
    const gradient = context.createRadialGradient(
        canvas.width / 2,
        canvas.height / 2,
        60,
        canvas.width / 2,
        canvas.height / 2,
        Math.max(canvas.width, canvas.height) * 0.7
    );

    gradient.addColorStop(0, "rgba(26, 39, 62, 0.72)");
    gradient.addColorStop(0.55, "rgba(11, 18, 32, 0.84)");
    gradient.addColorStop(1, "rgba(3, 7, 18, 1)");

    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
}

function drawMapBorder() {
    const x = -camera.x;
    const y = -camera.y;

    context.save();
    context.strokeStyle = "#38bdf8";
    context.lineWidth = 4;
    context.shadowColor = "#38bdf8";
    context.shadowBlur = 14;
    context.strokeRect(x, y, WORLD_WIDTH, WORLD_HEIGHT);
    context.restore();
}

function drawGrid() {
    const gridSize = 80;

    const startX = Math.floor(camera.x / gridSize) * gridSize;
    const startY = Math.floor(camera.y / gridSize) * gridSize;

    context.save();
    context.strokeStyle = "rgba(120, 170, 255, 0.08)";
    context.lineWidth = 1;

    for (let x = startX; x <= camera.x + canvas.width; x += gridSize) {
        context.beginPath();
        context.moveTo(x - camera.x, 0);
        context.lineTo(x - camera.x, canvas.height);
        context.stroke();
    }

    for (let y = startY; y <= camera.y + canvas.height; y += gridSize) {
        context.beginPath();
        context.moveTo(0, y - camera.y);
        context.lineTo(canvas.width, y - camera.y);
        context.stroke();
    }

    context.restore();
}

function drawSpawnZones() {
    context.save();

    context.fillStyle = "rgba(239, 68, 68, 0.12)";
    context.fillRect(-camera.x, -camera.y, 320, WORLD_HEIGHT);

    context.fillStyle = "rgba(59, 130, 246, 0.12)";
    context.fillRect(WORLD_WIDTH - 320 - camera.x, -camera.y, 320, WORLD_HEIGHT);

    context.restore();
}

function drawObstacles() {
    const depth = 22;

    context.save();

    for (const obstacle of obstacles) {
        const x = obstacle.x - camera.x;
        const y = obstacle.y - camera.y;
        const width = obstacle.width;
        const height = obstacle.height;

        context.fillStyle = "rgba(0, 0, 0, 0.28)";
        context.fillRect(x + 10, y + 14, width, height);

        context.fillStyle = "#172033";
        context.fillRect(x, y + depth, width, height - depth);

        context.fillStyle = "#273754";
        context.beginPath();
        context.moveTo(x, y + depth);
        context.lineTo(x + depth, y);
        context.lineTo(x + width + depth, y);
        context.lineTo(x + width, y + depth);
        context.closePath();
        context.fill();

        context.fillStyle = "#111827";
        context.beginPath();
        context.moveTo(x + width, y + depth);
        context.lineTo(x + width + depth, y);
        context.lineTo(x + width + depth, y + height - depth);
        context.lineTo(x + width, y + height);
        context.closePath();
        context.fill();

        context.strokeStyle = "rgba(125, 211, 252, 0.32)";
        context.lineWidth = 1.5;
        context.strokeRect(x, y + depth, width, height - depth);
    }

    context.restore();
}

function drawPlayers() {
    for (const player of players) {
        const screenX = player.x - camera.x;
        const screenY = player.y - camera.y;
        const isSelf = player.id === playerId;

        drawPlayerBody(screenX, screenY, player.angle, isSelf, player.team);
        drawHealthBar(screenX, screenY - 34, player.hp);
        drawPlayerName(screenX, screenY + 38, isSelf ? player.name + " (YOU)" : player.name);
    }
}

function drawPlayerBody(x, y, angle, isSelf, team) {
    const mainColor = team === "RED" ? "#ef4444" : "#3b82f6";
    const outlineColor = team === "RED" ? "#fecaca" : "#bfdbfe";

    context.save();
    context.translate(x, y);

    context.fillStyle = "rgba(0, 0, 0, 0.34)";
    context.beginPath();
    context.ellipse(4, 13, PLAYER_RADIUS + 8, PLAYER_RADIUS * 0.72, 0, 0, Math.PI * 2);
    context.fill();

    context.translate(0, -8);

    const bodyGradient = context.createRadialGradient(-8, -9, 4, 0, 0, PLAYER_RADIUS + 10);
    bodyGradient.addColorStop(0, isSelf ? "#86efac" : outlineColor);
    bodyGradient.addColorStop(1, isSelf ? "#16a34a" : mainColor);

    context.fillStyle = isSelf ? "#22c55e" : mainColor;
    context.strokeStyle = isSelf ? "#bbf7d0" : outlineColor;
    context.lineWidth = 3;
    context.shadowColor = isSelf ? "#22c55e" : mainColor;
    context.shadowBlur = 16;

    context.beginPath();
    context.ellipse(0, 0, PLAYER_RADIUS, PLAYER_RADIUS + 6, 0, 0, Math.PI * 2);
    context.fillStyle = bodyGradient;
    context.fill();
    context.stroke();

    context.rotate(angle);

    context.fillStyle = "#e5e7eb";
    context.fillRect(PLAYER_RADIUS - 2, -5, 36, 10);
    context.fillStyle = "#94a3b8";
    context.fillRect(PLAYER_RADIUS + 21, -3, 18, 6);

    context.restore();
}

function drawHealthBar(x, y, hp) {
    const width = 44;
    const height = 7;
    const percentage = clamp(hp / 100, 0, 1);

    context.fillStyle = "rgba(0, 0, 0, 0.55)";
    context.fillRect(x - width / 2, y, width, height);

    context.fillStyle = percentage > 0.5 ? "#22c55e" : percentage > 0.25 ? "#facc15" : "#ef4444";
    context.fillRect(x - width / 2, y, width * percentage, height);

    context.strokeStyle = "rgba(255, 255, 255, 0.4)";
    context.strokeRect(x - width / 2, y, width, height);
}

function drawPlayerName(x, y, name) {
    context.save();
    context.fillStyle = "#dbeafe";
    context.font = "12px Arial";
    context.textAlign = "center";
    context.fillText(name, x, y);
    context.restore();
}

function drawBullets() {
    context.save();

    for (const bullet of bullets) {
        const screenX = bullet.x - camera.x;
        const screenY = bullet.y - camera.y;

        context.fillStyle = "#facc15";
        context.shadowColor = "#facc15";
        context.shadowBlur = 14;

        context.beginPath();
        context.arc(screenX, screenY, BULLET_RADIUS, 0, Math.PI * 2);
        context.fill();
    }

    context.restore();
}

function drawCrosshair() {
    const size = 10 + recoilKick;

    context.save();

    context.strokeStyle = mouse.down ? "#f87171" : "#93c5fd";
    context.lineWidth = 2;

    context.beginPath();
    context.moveTo(mouse.x - size, mouse.y);
    context.lineTo(mouse.x - 4, mouse.y);
    context.moveTo(mouse.x + 4, mouse.y);
    context.lineTo(mouse.x + size, mouse.y);
    context.moveTo(mouse.x, mouse.y - size);
    context.lineTo(mouse.x, mouse.y - 4);
    context.moveTo(mouse.x, mouse.y + 4);
    context.lineTo(mouse.x, mouse.y + size);
    context.stroke();

    context.beginPath();
    context.arc(mouse.x, mouse.y, 14 + recoilKick * 0.4, 0, Math.PI * 2);
    context.stroke();

    context.restore();
}

function drawGunOverlay() {
    const self = getSelfPlayer();

    if (!self) {
        return;
    }

    const sway = Math.sin(performance.now() / 120) * (keys.up || keys.down || keys.left || keys.right ? 2 : 0);
    const recoil = recoilKick * 0.9;
    const baseX = canvas.width * 0.64 + sway;
    const baseY = canvas.height - 92 + recoil;

    context.save();
    context.translate(baseX, baseY);

    context.fillStyle = "rgba(0, 0, 0, 0.38)";
    context.fillRect(-22, 24, 250, 24);

    context.fillStyle = "#0f172a";
    context.fillRect(0, -8, 210, 42);
    context.fillStyle = "#334155";
    context.fillRect(22, -20, 120, 18);
    context.fillStyle = "#64748b";
    context.fillRect(150, -4, 80, 14);
    context.fillStyle = "#111827";
    context.fillRect(54, 30, 42, 58);
    context.fillStyle = self.team === "RED" ? "#ef4444" : "#3b82f6";
    context.fillRect(10, 2, 10, 24);

    context.restore();
}

function drawVignette() {
    const gradient = context.createRadialGradient(
        canvas.width / 2,
        canvas.height / 2,
        Math.min(canvas.width, canvas.height) * 0.22,
        canvas.width / 2,
        canvas.height / 2,
        Math.max(canvas.width, canvas.height) * 0.72
    );

    gradient.addColorStop(0, "rgba(0, 0, 0, 0)");
    gradient.addColorStop(1, "rgba(0, 0, 0, 0.42)");

    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
}

function drawMinimap() {
    const width = 220;
    const height = 124;
    const margin = 18;

    const x = canvas.width - width - margin;
    const y = margin;

    context.save();

    context.fillStyle = "rgba(5, 8, 16, 0.72)";
    context.strokeStyle = "rgba(125, 211, 252, 0.45)";
    context.lineWidth = 1;
    context.fillRect(x, y, width, height);
    context.strokeRect(x, y, width, height);

    context.fillStyle = "rgba(148, 163, 184, 0.35)";
    for (const obstacle of obstacles) {
        context.fillRect(
            x + obstacle.x / WORLD_WIDTH * width,
            y + obstacle.y / WORLD_HEIGHT * height,
            obstacle.width / WORLD_WIDTH * width,
            obstacle.height / WORLD_HEIGHT * height
        );
    }

    for (const player of players) {
        const px = x + player.x / WORLD_WIDTH * width;
        const py = y + player.y / WORLD_HEIGHT * height;

        context.fillStyle = player.id === playerId ? "#22c55e" : player.team === "RED" ? "#ef4444" : "#3b82f6";

        context.beginPath();
        context.arc(px, py, 4, 0, Math.PI * 2);
        context.fill();
    }

    context.restore();
}

function updateHud() {
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

    if (round) {
        roundNumberElement.textContent = round.roundNumber;
        roundTimerElement.textContent = formatTime(round.timeLeftSeconds);
        redScoreElement.textContent = round.redScore;
        blueScoreElement.textContent = round.blueScore;
    }
}

function updateScoreboard() {
    const sortedPlayers = [...players].sort((a, b) => b.kills - a.kills);

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

function updateKillFeed() {
    killFeedElement.innerHTML = killFeed.map(event => `
        <div class="killFeedItem">
            <span>${escapeHtml(event.attacker)}</span>
            <strong>${escapeHtml(event.weapon)}</strong>
            <span>${escapeHtml(event.victim)}</span>
        </div>
    `).join("");
}

function detectLocalShot() {
    const self = getSelfPlayer();

    if (!self) {
        return;
    }

    if (lastSelfAmmo !== null && self.ammo < lastSelfAmmo) {
        playShootSound(self.weapon);
        recoilKick = Math.min(18, recoilKick + getRecoilKick(self.weapon));
    }

    lastSelfAmmo = self.ammo;
}

function detectReloadSound() {
    const self = getSelfPlayer();

    if (!self) {
        lastReloading = false;
        return;
    }

    if (self.reloading && !lastReloading) {
        playReloadSound();
    }

    lastReloading = self.reloading;
}

function playShootSound(weapon) {
    const now = audioContext.currentTime;
    const punch = audioContext.createOscillator();
    const snap = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const filter = audioContext.createBiquadFilter();

    punch.type = "square";
    snap.type = "sawtooth";
    punch.frequency.value = weapon === "Sniper" ? 78 : weapon === "SMG" ? 160 : 118;
    snap.frequency.value = weapon === "Sniper" ? 240 : 340;

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1800, now);
    filter.frequency.exponentialRampToValueAtTime(220, now + 0.12);

    gain.gain.setValueAtTime(weapon === "Sniper" ? 0.12 : 0.075, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (weapon === "Sniper" ? 0.16 : 0.09));

    punch.connect(filter);
    snap.connect(filter);
    filter.connect(gain);
    gain.connect(audioContext.destination);

    punch.start(now);
    snap.start(now);
    punch.stop(now + 0.14);
    snap.stop(now + 0.08);
}

function playReloadSound() {
    playTone("triangle", 260, 0.035, 0.08, 0);
    playTone("square", 190, 0.025, 0.07, 0.1);
    playTone("triangle", 360, 0.025, 0.08, 0.22);
}

function playTone(type, frequency, volume, duration, delay) {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const start = audioContext.currentTime + delay;

    oscillator.type = type;
    oscillator.frequency.value = frequency;

    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);

    oscillator.connect(gain);
    gain.connect(audioContext.destination);

    oscillator.start(start);
    oscillator.stop(start + duration);
}

function getRecoilKick(weapon) {
    switch (weapon) {
        case "Pistol":
            return 4;
        case "Rifle":
            return 6;
        case "SMG":
            return 5;
        case "Shotgun":
            return 12;
        case "Sniper":
            return 15;
        default:
            return 5;
    }
}

function getSelfPlayer() {
    return players.find(player => player.id === playerId);
}

function setConnectionStatus(status) {
    connectionStatusElement.textContent = status;
    connectionStatusElement.className = status;
}

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;

    return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function escapeHtml(value) {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll("\"", "&quot;")
        .replaceAll("'", "&#039;");
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
