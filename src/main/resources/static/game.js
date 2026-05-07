const canvas = document.getElementById("gameCanvas");
const context = canvas.getContext("2d");

const nameOverlay = document.getElementById("nameOverlay");
const nameInput = document.getElementById("nameInput");
const joinButton = document.getElementById("joinButton");
const nameError = document.getElementById("nameError");

const connectionStatusElement = document.getElementById("connectionStatus");
const playerNameElement = document.getElementById("playerName");
const playerIdElement = document.getElementById("playerId");
const roomIdElement = document.getElementById("roomId");
const hpElement = document.getElementById("hp");

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
let roomId = null;
let joined = false;

let inputIntervalId = null;

let players = [];
let bullets = [];

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
            roomId = message.roomId;
            playerName = message.name;

            playerIdElement.textContent = playerId;
            roomIdElement.textContent = roomId;
            playerNameElement.textContent = playerName;

            nameOverlay.classList.add("hidden");

            startSendingInput();
            return;
        }

        if (message.type === "snapshot") {
            players = message.players;
            bullets = message.bullets;

            updateHud();
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
            angle: mouse.angle
        }));
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
    drawMapBorder();
    drawGrid();
    drawBullets();
    drawPlayers();
    drawCrosshair();
    drawMinimap();
}

function drawBackground() {
    context.fillStyle = "#070a12";
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

function drawPlayers() {
    for (const player of players) {
        const screenX = player.x - camera.x;
        const screenY = player.y - camera.y;
        const isSelf = player.id === playerId;

        drawPlayerBody(screenX, screenY, player.angle, isSelf);
        drawHealthBar(screenX, screenY - 34, player.hp);
        drawPlayerName(screenX, screenY + 38, isSelf ? player.name + " (YOU)" : player.name);
    }
}

function drawPlayerBody(x, y, angle, isSelf) {
    context.save();
    context.translate(x, y);

    context.fillStyle = isSelf ? "#22c55e" : "#ef4444";
    context.strokeStyle = isSelf ? "#bbf7d0" : "#fecaca";
    context.lineWidth = 3;
    context.shadowColor = isSelf ? "#22c55e" : "#ef4444";
    context.shadowBlur = 16;

    context.beginPath();
    context.arc(0, 0, PLAYER_RADIUS, 0, Math.PI * 2);
    context.fill();
    context.stroke();

    context.rotate(angle);

    context.fillStyle = isSelf ? "#dcfce7" : "#fee2e2";
    context.fillRect(PLAYER_RADIUS - 2, -5, 28, 10);

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
    context.save();

    context.strokeStyle = mouse.down ? "#f87171" : "#93c5fd";
    context.lineWidth = 2;

    context.beginPath();
    context.moveTo(mouse.x - 10, mouse.y);
    context.lineTo(mouse.x - 4, mouse.y);
    context.moveTo(mouse.x + 4, mouse.y);
    context.lineTo(mouse.x + 10, mouse.y);
    context.moveTo(mouse.x, mouse.y - 10);
    context.lineTo(mouse.x, mouse.y - 4);
    context.moveTo(mouse.x, mouse.y + 4);
    context.lineTo(mouse.x, mouse.y + 10);
    context.stroke();

    context.beginPath();
    context.arc(mouse.x, mouse.y, 14, 0, Math.PI * 2);
    context.stroke();

    context.restore();
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

    for (const player of players) {
        const px = x + player.x / WORLD_WIDTH * width;
        const py = y + player.y / WORLD_HEIGHT * height;

        context.fillStyle = player.id === playerId ? "#22c55e" : "#ef4444";

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

function shortId(id) {
    if (!id) {
        return "-";
    }

    return id.substring(0, 6);
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}