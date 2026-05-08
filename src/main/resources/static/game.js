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
const FOV = Math.PI / 3;
const WALL_HEIGHT = 170;
const NEAR_PLANE = 8;
const MOUSE_SENSITIVITY = 0.0024;

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
let viewAngle = 0;
let bobTime = 0;

let inputSequence = 0;
let pendingInputs = [];
let predictedSelf = null;

let remotePlayerStates = new Map();
let interpolatedRemotePlayers = new Map();

let bulletStates = new Map();
let interpolatedBullets = new Map();
let fadingBulletTrails = [];

const CLIENT_TICK_RATE = 60;
const CLIENT_DELTA_SECONDS = 1 / CLIENT_TICK_RATE;
const PREDICTION_ERROR_THRESHOLD = 2.5;
const REMOTE_INTERPOLATION_DELAY_MS = 100;
const REMOTE_SNAP_DISTANCE = 220;
const BULLET_INTERPOLATION_DELAY_MS = 55;
const BULLET_MAX_EXTRAPOLATION_MS = 80;
const BULLET_FADE_MS = 120;
const BULLET_TRAIL_LENGTH_MS = 90;
const BULLET_FADE_MS = 120;

const PLAYER_MAX_SPEED = 410;
const PLAYER_ACCELERATION = 2200;
const PLAYER_FRICTION = 9.5;
const PLAYER_STOP_SPEED = 90;

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

    if (document.pointerLockElement === canvas) {
        viewAngle = normalizeAngle(viewAngle + event.movementX * MOUSE_SENSITIVITY);
    }

    updateMouseWorldPosition();
});

canvas.addEventListener("mousedown", event => {
    if (event.button === 0) {
        resumeAudio();
        canvas.requestPointerLock();
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

            addRemoteInterpolationSnapshot(message.players);
            addBulletInterpolationSnapshot(message.bullets);
            reconcileLocalPlayer();

            detectLocalShot();
            detectReloadSound();
            updateHud();
            updateScoreboard();
            updateKillFeed();
        }
    };

    socket.onclose = () => {
        joined = false;
        predictedSelf = null;
        pendingInputs = [];
        inputSequence = 0;
        remotePlayerStates.clear();
        interpolatedRemotePlayers.clear();
        bulletStates.clear();
        interpolatedBullets.clear();
        fadingBulletTrails = [];
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

        const input = {
            type: "input",
            sequence: ++inputSequence,
            up: keys.up,
            down: keys.down,
            left: keys.left,
            right: keys.right,
            shoot: mouse.down,
            reload: reloadRequested,
            weaponSlot: selectedWeaponSlot,
            angle: mouse.angle
        };

        predictLocalPlayer(input, CLIENT_DELTA_SECONDS);
        pendingInputs.push(input);

        socket.send(JSON.stringify(input));

        reloadRequested = false;
    }, 1000 / CLIENT_TICK_RATE);
}

function stopSendingInput() {
    if (inputIntervalId !== null) {
        clearInterval(inputIntervalId);
        inputIntervalId = null;
    }
}

function gameLoop() {
    updateRemoteInterpolation();
    updateBulletInterpolation();
    updateCamera();
    updateMouseWorldPosition();
    updateAimAngle();

    if (keys.up || keys.down || keys.left || keys.right) {
        bobTime += 0.12;
    } else {
        bobTime *= 0.9;
    }

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
        mouse.angle = viewAngle;
        return;
    }

    if (viewAngle === 0 && self.angle !== 0) {
        viewAngle = self.angle;
    }

    mouse.angle = viewAngle;
}

function render() {
    context.clearRect(0, 0, canvas.width, canvas.height);

    drawFirstPersonScene();
    drawGunOverlay();
    drawCrosshair();
    drawMinimap();
    drawVignette();
}

function drawBackground() {
    context.fillStyle = "#080b12";
    context.fillRect(0, 0, canvas.width, canvas.height);
}

function drawFirstPersonScene() {
    const self = getSelfPlayer();

    if (!self) {
        drawBackground();
        drawFloorLighting();
        drawGrid();
        return;
    }

    drawSkyAndFloor();
    drawProjectedGrid(self);
    drawProjectedBulletTrails(self);

    const objects = [
        ...getBoundaryWallSegments().map(segment => ({
            ...segment,
            depth: getWallDepth(self, segment),
            color: "#1f3a55",
            accent: "#38bdf8"
        })),
        ...getObstacleWallSegments().map(segment => ({
            ...segment,
            depth: getWallDepth(self, segment),
            color: "#26364f",
            accent: "#94a3b8"
        })),
        ...getProjectedPlayers(self),
        ...getProjectedBullets(self)
    ];

    objects
        .filter(object => object.depth > NEAR_PLANE)
        .sort((a, b) => b.depth - a.depth)
        .forEach(object => {
            if (object.type === "sprite") {
                drawProjectedSprite(object);
            } else {
                drawProjectedWall(self, object);
            }
        });
}

function drawSkyAndFloor() {
    const horizon = canvas.height * 0.48;
    const sky = context.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, "#7dd3fc");
    sky.addColorStop(0.55, "#93c5fd");
    sky.addColorStop(1, "#dbeafe");

    context.fillStyle = sky;
    context.fillRect(0, 0, canvas.width, horizon);

    const floor = context.createLinearGradient(0, horizon, 0, canvas.height);
    floor.addColorStop(0, "#475569");
    floor.addColorStop(0.35, "#334155");
    floor.addColorStop(1, "#111827");

    context.fillStyle = floor;
    context.fillRect(0, horizon, canvas.width, canvas.height - horizon);
}

function drawProjectedGrid(self) {
    const spacing = 120;

    context.save();
    context.strokeStyle = "rgba(226, 232, 240, 0.12)";
    context.lineWidth = 1;

    for (let x = 0; x <= WORLD_WIDTH; x += spacing) {
        drawProjectedFloorLine(self, x, 0, x, WORLD_HEIGHT);
    }

    for (let y = 0; y <= WORLD_HEIGHT; y += spacing) {
        drawProjectedFloorLine(self, 0, y, WORLD_WIDTH, y);
    }

    context.restore();
}

function drawProjectedFloorLine(self, ax, ay, bx, by) {
    const start = projectWorldPoint(self, ax, ay);
    const end = projectWorldPoint(self, bx, by);

    if (start.depth <= NEAR_PLANE || end.depth <= NEAR_PLANE) {
        return;
    }

    const y1 = getGroundScreenY(start.depth);
    const y2 = getGroundScreenY(end.depth);

    context.beginPath();
    context.moveTo(start.x, y1);
    context.lineTo(end.x, y2);
    context.stroke();
}

function drawProjectedWall(self, wall) {
    const start = projectWorldPoint(self, wall.x1, wall.y1);
    const end = projectWorldPoint(self, wall.x2, wall.y2);

    if (start.depth <= NEAR_PLANE || end.depth <= NEAR_PLANE) {
        return;
    }

    const bottomA = getGroundScreenY(start.depth);
    const bottomB = getGroundScreenY(end.depth);
    const topA = bottomA - getProjectedHeight(start.depth, WALL_HEIGHT);
    const topB = bottomB - getProjectedHeight(end.depth, WALL_HEIGHT);
    const shade = clamp(1 - wall.depth / 1300, 0.28, 0.95);

    context.save();
    context.globalAlpha = shade;
    context.fillStyle = wall.color;
    context.beginPath();
    context.moveTo(start.x, topA);
    context.lineTo(end.x, topB);
    context.lineTo(end.x, bottomB);
    context.lineTo(start.x, bottomA);
    context.closePath();
    context.fill();

    context.globalAlpha = clamp(shade + 0.15, 0.35, 1);
    context.strokeStyle = wall.accent;
    context.lineWidth = 2;
    context.stroke();
    context.restore();
}

function drawProjectedSprite(sprite) {
    context.save();
    context.translate(sprite.x, sprite.y);

    context.globalAlpha = sprite.alpha;
    context.fillStyle = sprite.shadow || "rgba(0, 0, 0, 0.32)";
    context.beginPath();
    context.ellipse(0, sprite.height * 0.42, sprite.width * 0.42, sprite.height * 0.08, 0, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = sprite.color;
    context.strokeStyle = sprite.accent;
    context.lineWidth = 2;
    context.beginPath();
    context.ellipse(0, 0, sprite.width * 0.34, sprite.height * 0.5, 0, 0, Math.PI * 2);
    context.fill();
    context.stroke();

    if (sprite.label) {
        context.fillStyle = "#f8fafc";
        context.font = `${Math.max(10, Math.min(15, sprite.width * 0.12))}px Arial`;
        context.textAlign = "center";
        context.fillText(sprite.label, 0, -sprite.height * 0.62);
    }

    context.restore();
}

function getProjectedPlayers(self) {
    return getRenderableRemotePlayers()
        .map(player => {
            const projected = projectWorldPoint(self, player.x, player.y);
            const height = getProjectedHeight(projected.depth, 130);
            const width = height * 0.42;

            return {
                type: "sprite",
                depth: projected.depth,
                x: projected.x,
                y: getGroundScreenY(projected.depth) - height / 2,
                width,
                height,
                color: player.team === "RED" ? "#ef4444" : "#3b82f6",
                accent: player.team === "RED" ? "#fecaca" : "#bfdbfe",
                alpha: clamp(1 - projected.depth / 1700, 0.35, 1),
                label: player.name
            };
        });
}

function getProjectedBullets(self) {
    return getRenderableBullets().map(bullet => {
        const projected = projectWorldPoint(self, bullet.x, bullet.y);
        const size = getProjectedHeight(projected.depth, 18);

        return {
            type: "sprite",
            depth: projected.depth,
            x: projected.x,
            y: getGroundScreenY(projected.depth) - size,
            width: size,
            height: size,
            color: "#facc15",
            accent: "#fef3c7",
            shadow: "rgba(250, 204, 21, 0.22)",
            alpha: bullet.alpha ?? 1
        };
    });
}

function getBoundaryWallSegments() {
    return [
        createWall(0, 0, WORLD_WIDTH, 0),
        createWall(WORLD_WIDTH, 0, WORLD_WIDTH, WORLD_HEIGHT),
        createWall(WORLD_WIDTH, WORLD_HEIGHT, 0, WORLD_HEIGHT),
        createWall(0, WORLD_HEIGHT, 0, 0)
    ];
}

function getObstacleWallSegments() {
    return obstacles.flatMap(obstacle => {
        const x = obstacle.x;
        const y = obstacle.y;
        const right = obstacle.x + obstacle.width;
        const bottom = obstacle.y + obstacle.height;

        return [
            createWall(x, y, right, y),
            createWall(right, y, right, bottom),
            createWall(right, bottom, x, bottom),
            createWall(x, bottom, x, y)
        ];
    });
}

function createWall(x1, y1, x2, y2) {
    return {
        type: "wall",
        x1,
        y1,
        x2,
        y2,
        depth: 0
    };
}

function getWallDepth(self, wall) {
    const midpointX = (wall.x1 + wall.x2) / 2;
    const midpointY = (wall.y1 + wall.y2) / 2;

    return projectWorldPoint(self, midpointX, midpointY).depth;
}

function projectWorldPoint(self, worldX, worldY) {
    const dx = worldX - self.x;
    const dy = worldY - self.y;
    const cos = Math.cos(viewAngle);
    const sin = Math.sin(viewAngle);
    const side = -sin * dx + cos * dy;
    const depth = cos * dx + sin * dy;
    const projection = canvas.width / (2 * Math.tan(FOV / 2));

    return {
        x: canvas.width / 2 + side / Math.max(depth, NEAR_PLANE) * projection,
        depth
    };
}

function getGroundScreenY(depth) {
    const horizon = canvas.height * 0.48;
    const projection = canvas.width / (2 * Math.tan(FOV / 2));

    return horizon + 70 / Math.max(depth, NEAR_PLANE) * projection;
}

function getProjectedHeight(depth, worldHeight) {
    const projection = canvas.width / (2 * Math.tan(FOV / 2));

    return worldHeight / Math.max(depth, NEAR_PLANE) * projection;
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

    for (const trail of fadingBulletTrails) {
        drawBulletTrail(trail, trail.alpha);
    }

    for (const bullet of getRenderableBullets()) {
        drawBulletTrail(bullet, bullet.alpha ?? 1);

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

function drawProjectedBulletTrails(self) {
    context.save();

    for (const trail of fadingBulletTrails) {
        drawProjectedBulletTrail(self, trail, trail.alpha);
    }

    for (const bullet of getRenderableBullets()) {
        drawProjectedBulletTrail(self, bullet, bullet.alpha ?? 1);
    }

    context.restore();
}

function drawProjectedBulletTrail(self, bullet, alpha) {
    const velocityX = bullet.velocityX || 0;
    const velocityY = bullet.velocityY || 0;
    const speed = Math.sqrt(velocityX * velocityX + velocityY * velocityY);

    if (speed < 0.001 || alpha <= 0) {
        return;
    }

    const directionX = velocityX / speed;
    const directionY = velocityY / speed;
    const trailLength = clamp(speed * 0.035, 16, 95);

    const head = projectWorldPoint(self, bullet.x, bullet.y);
    const tail = projectWorldPoint(
        self,
        bullet.x - directionX * trailLength,
        bullet.y - directionY * trailLength
    );

    if (head.depth <= NEAR_PLANE || tail.depth <= NEAR_PLANE) {
        return;
    }

    const headY = getGroundScreenY(head.depth) - getProjectedHeight(head.depth, 8);
    const tailY = getGroundScreenY(tail.depth) - getProjectedHeight(tail.depth, 8);

    const gradient = context.createLinearGradient(tail.x, tailY, head.x, headY);
    gradient.addColorStop(0, "rgba(250, 204, 21, 0)");
    gradient.addColorStop(0.4, `rgba(250, 204, 21, ${0.22 * alpha})`);
    gradient.addColorStop(1, `rgba(254, 243, 199, ${0.95 * alpha})`);

    context.strokeStyle = gradient;
    context.lineWidth = clamp(getProjectedHeight(head.depth, 8), 1.5, 5);
    context.lineCap = "round";
    context.shadowColor = "#facc15";
    context.shadowBlur = 10;

    context.beginPath();
    context.moveTo(tail.x, tailY);
    context.lineTo(head.x, headY);
    context.stroke();
}

function drawCrosshair() {
    const size = 10 + recoilKick;
    const x = canvas.width / 2;
    const y = canvas.height / 2;

    context.save();

    context.strokeStyle = mouse.down ? "#f87171" : "#93c5fd";
    context.lineWidth = 2;

    context.beginPath();
    context.moveTo(x - size, y);
    context.lineTo(x - 4, y);
    context.moveTo(x + 4, y);
    context.lineTo(x + size, y);
    context.moveTo(x, y - size);
    context.lineTo(x, y - 4);
    context.moveTo(x, y + 4);
    context.lineTo(x, y + size);
    context.stroke();

    context.beginPath();
    context.arc(x, y, 14 + recoilKick * 0.4, 0, Math.PI * 2);
    context.stroke();

    context.restore();
}

function drawGunOverlay() {
    const self = getSelfPlayer();

    if (!self) {
        return;
    }

    const moving = keys.up || keys.down || keys.left || keys.right;
    const sway = Math.sin(bobTime) * (moving ? 7 : 1.5);
    const bob = Math.abs(Math.cos(bobTime)) * (moving ? 8 : 2);
    const recoil = recoilKick * 0.9;
    const baseX = canvas.width * 0.64 + sway;
    const baseY = canvas.height - 92 + bob + recoil;

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

    for (const player of getRenderablePlayers()) {
        const px = x + player.x / WORLD_WIDTH * width;
        const py = y + player.y / WORLD_HEIGHT * height;

        context.fillStyle = player.id === playerId ? "#22c55e" : player.team === "RED" ? "#ef4444" : "#3b82f6";

        context.beginPath();
        context.arc(px, py, 4, 0, Math.PI * 2);
        context.fill();

        if (player.id === playerId) {
            context.strokeStyle = "#bbf7d0";
            context.beginPath();
            context.moveTo(px, py);
            context.lineTo(px + Math.cos(viewAngle) * 16, py + Math.sin(viewAngle) * 16);
            context.stroke();
        }
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

function reconcileLocalPlayer() {
    const serverSelf = players.find(player => player.id === playerId);

    if (!serverSelf) {
        predictedSelf = null;
        pendingInputs = [];
        return;
    }

    if (!predictedSelf) {
        predictedSelf = {
            ...serverSelf
        };
        return;
    }

    pendingInputs = pendingInputs.filter(input => input.sequence > serverSelf.lastProcessedInputSequence);

    const errorX = serverSelf.x - predictedSelf.x;
    const errorY = serverSelf.y - predictedSelf.y;
    const errorDistance = Math.sqrt(errorX * errorX + errorY * errorY);

    predictedSelf = {
        ...serverSelf
    };

    for (const input of pendingInputs) {
        simulatePredictedMovement(predictedSelf, input, CLIENT_DELTA_SECONDS);
    }

    if (errorDistance > PREDICTION_ERROR_THRESHOLD) {
        predictedSelf.x = predictedSelf.x * 0.85 + serverSelf.x * 0.15;
        predictedSelf.y = predictedSelf.y * 0.85 + serverSelf.y * 0.15;
    }
}

function predictLocalPlayer(input, deltaSeconds) {
    if (!predictedSelf) {
        const serverSelf = players.find(player => player.id === playerId);

        if (!serverSelf) {
            return;
        }

        predictedSelf = {
            ...serverSelf
        };
    }

    predictedSelf.angle = input.angle;
    simulatePredictedMovement(predictedSelf, input, deltaSeconds);

    const selfIndex = players.findIndex(player => player.id === playerId);

    if (selfIndex >= 0) {
        players[selfIndex] = {
            ...players[selfIndex],
            x: predictedSelf.x,
            y: predictedSelf.y,
            velocityX: predictedSelf.velocityX,
            velocityY: predictedSelf.velocityY,
            angle: predictedSelf.angle
        };
    }
}

function simulatePredictedMovement(player, input, deltaSeconds) {
    let forward = 0;
    let strafe = 0;

    if (input.up) {
        forward += 1;
    }

    if (input.down) {
        forward -= 1;
    }

    if (input.left) {
        strafe -= 1;
    }

    if (input.right) {
        strafe += 1;
    }

    applyPredictedFriction(player, deltaSeconds);

    const length = Math.sqrt(forward * forward + strafe * strafe);

    if (length > 0) {
        forward /= length;
        strafe /= length;

        const cos = Math.cos(input.angle);
        const sin = Math.sin(input.angle);

        const wishDirectionX = cos * forward - sin * strafe;
        const wishDirectionY = sin * forward + cos * strafe;

        acceleratePredictedPlayer(
            player,
            wishDirectionX,
            wishDirectionY,
            PLAYER_MAX_SPEED,
            PLAYER_ACCELERATION,
            deltaSeconds
        );
    }

    const nextX = player.x + player.velocityX * deltaSeconds;
    const nextY = player.y + player.velocityY * deltaSeconds;

    movePredictedPlayerWithCollision(player, nextX, nextY);
}

function applyPredictedFriction(player, deltaSeconds) {
    const velocityX = player.velocityX || 0;
    const velocityY = player.velocityY || 0;
    const speed = Math.sqrt(velocityX * velocityX + velocityY * velocityY);

    if (speed < 0.001) {
        player.velocityX = 0;
        player.velocityY = 0;
        return;
    }

    const control = Math.max(speed, PLAYER_STOP_SPEED);
    const drop = control * PLAYER_FRICTION * deltaSeconds;
    const newSpeed = Math.max(speed - drop, 0);
    const scale = newSpeed / speed;

    player.velocityX = velocityX * scale;
    player.velocityY = velocityY * scale;
}

function acceleratePredictedPlayer(player, wishDirectionX, wishDirectionY, maxSpeed, acceleration, deltaSeconds) {
    const velocityX = player.velocityX || 0;
    const velocityY = player.velocityY || 0;

    const currentSpeed = velocityX * wishDirectionX + velocityY * wishDirectionY;
    const addSpeed = maxSpeed - currentSpeed;

    if (addSpeed <= 0) {
        return;
    }

    let accelerationSpeed = acceleration * deltaSeconds;

    if (accelerationSpeed > addSpeed) {
        accelerationSpeed = addSpeed;
    }

    player.velocityX = velocityX + accelerationSpeed * wishDirectionX;
    player.velocityY = velocityY + accelerationSpeed * wishDirectionY;
}

function movePredictedPlayerWithCollision(player, nextX, nextY) {
    const clampedX = clamp(nextX, PLAYER_RADIUS, WORLD_WIDTH - PLAYER_RADIUS);
    const clampedY = clamp(nextY, PLAYER_RADIUS, WORLD_HEIGHT - PLAYER_RADIUS);

    if (!predictedCircleCollidesWithObstacle(clampedX, player.y, PLAYER_RADIUS)) {
        player.x = clampedX;
    } else {
        player.velocityX = 0;
    }

    if (!predictedCircleCollidesWithObstacle(player.x, clampedY, PLAYER_RADIUS)) {
        player.y = clampedY;
    } else {
        player.velocityY = 0;
    }
}

function predictedCircleCollidesWithObstacle(circleX, circleY, radius) {
    return obstacles.some(obstacle => {
        const closestX = clamp(circleX, obstacle.x, obstacle.x + obstacle.width);
        const closestY = clamp(circleY, obstacle.y, obstacle.y + obstacle.height);
        const dx = circleX - closestX;
        const dy = circleY - closestY;

        return dx * dx + dy * dy <= radius * radius;
    });
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
    if (predictedSelf) {
        return predictedSelf;
    }

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

function addRemoteInterpolationSnapshot(snapshotPlayers) {
    const receivedAt = performance.now();
    const remoteIdsInSnapshot = new Set();

    for (const player of snapshotPlayers) {
        if (player.id === playerId) {
            continue;
        }

        remoteIdsInSnapshot.add(player.id);

        if (!remotePlayerStates.has(player.id)) {
            remotePlayerStates.set(player.id, []);
        }

        const buffer = remotePlayerStates.get(player.id);

        buffer.push({
            timestamp: receivedAt,
            player: {
                ...player
            }
        });

        while (buffer.length > 8) {
            buffer.shift();
        }
    }

    for (const playerIdInMap of remotePlayerStates.keys()) {
        if (!remoteIdsInSnapshot.has(playerIdInMap)) {
            remotePlayerStates.delete(playerIdInMap);
            interpolatedRemotePlayers.delete(playerIdInMap);
        }
    }
}

function updateRemoteInterpolation() {
    const renderTime = performance.now() - REMOTE_INTERPOLATION_DELAY_MS;

    for (const [remotePlayerId, buffer] of remotePlayerStates.entries()) {
        if (buffer.length === 0) {
            continue;
        }

        if (buffer.length === 1) {
            interpolatedRemotePlayers.set(remotePlayerId, {
                ...buffer[0].player
            });
            continue;
        }

        while (buffer.length >= 2 && buffer[1].timestamp <= renderTime) {
            buffer.shift();
        }

        const older = buffer[0];
        const newer = buffer[1];

        if (!newer) {
            const extrapolated = extrapolateRemotePlayer(older.player, renderTime - older.timestamp);
            interpolatedRemotePlayers.set(remotePlayerId, extrapolated);
            continue;
        }

        const duration = newer.timestamp - older.timestamp;
        const progress = duration <= 0 ? 1 : clamp((renderTime - older.timestamp) / duration, 0, 1);

        const distance = getDistance(older.player.x, older.player.y, newer.player.x, newer.player.y);

        if (distance > REMOTE_SNAP_DISTANCE) {
            interpolatedRemotePlayers.set(remotePlayerId, {
                ...newer.player
            });
            continue;
        }

        interpolatedRemotePlayers.set(remotePlayerId, {
            ...newer.player,
            x: lerp(older.player.x, newer.player.x, progress),
            y: lerp(older.player.y, newer.player.y, progress),
            velocityX: lerp(older.player.velocityX || 0, newer.player.velocityX || 0, progress),
            velocityY: lerp(older.player.velocityY || 0, newer.player.velocityY || 0, progress),
            angle: lerpAngle(older.player.angle, newer.player.angle, progress)
        });
    }
}

function extrapolateRemotePlayer(player, millisecondsSinceSnapshot) {
    const maxExtrapolationMs = 120;
    const seconds = Math.min(millisecondsSinceSnapshot, maxExtrapolationMs) / 1000;

    return {
        ...player,
        x: clamp(player.x + (player.velocityX || 0) * seconds, PLAYER_RADIUS, WORLD_WIDTH - PLAYER_RADIUS),
        y: clamp(player.y + (player.velocityY || 0) * seconds, PLAYER_RADIUS, WORLD_HEIGHT - PLAYER_RADIUS)
    };
}

function getRenderablePlayers() {
    const self = getSelfPlayer();

    return [
        ...(self ? [self] : []),
        ...getRenderableRemotePlayers()
    ];
}

function getRenderableRemotePlayers() {
    return players
        .filter(player => player.id !== playerId)
        .map(player => interpolatedRemotePlayers.get(player.id) || player);
}

function getDistance(ax, ay, bx, by) {
    const dx = ax - bx;
    const dy = ay - by;

    return Math.sqrt(dx * dx + dy * dy);
}

function lerp(from, to, progress) {
    return from + (to - from) * progress;
}

function lerpAngle(from, to, progress) {
    let difference = normalizeAngle(to - from);

    return normalizeAngle(from + difference * progress);
}

function normalizeAngle(angle) {
    while (angle <= -Math.PI) {
        angle += Math.PI * 2;
    }

    while (angle > Math.PI) {
        angle -= Math.PI * 2;
    }

    return angle;
}

function addBulletInterpolationSnapshot(snapshotBullets) {
    const receivedAt = performance.now();
    const bulletIdsInSnapshot = new Set();

    for (const bullet of snapshotBullets) {
        bulletIdsInSnapshot.add(bullet.id);

        if (!bulletStates.has(bullet.id)) {
            bulletStates.set(bullet.id, []);
        }

        const buffer = bulletStates.get(bullet.id);

        buffer.push({
            timestamp: receivedAt,
            bullet: {
                ...bullet
            }
        });

        while (buffer.length > 5) {
            buffer.shift();
        }
    }

    for (const [bulletId, buffer] of bulletStates.entries()) {
        if (!bulletIdsInSnapshot.has(bulletId)) {
            const last = buffer[buffer.length - 1];

            if (last) {
                fadingBulletTrails.push({
                    ...last.bullet,
                    createdAt: receivedAt,
                    alpha: 1
                });
            }

            bulletStates.delete(bulletId);
            interpolatedBullets.delete(bulletId);
        }
    }
}

function updateBulletInterpolation() {
    const now = performance.now();
    const renderTime = now - BULLET_INTERPOLATION_DELAY_MS;

    for (const [bulletId, buffer] of bulletStates.entries()) {
        if (buffer.length === 0) {
            continue;
        }

        if (buffer.length === 1) {
            const extrapolated = extrapolateBullet(buffer[0].bullet, renderTime - buffer[0].timestamp);
            interpolatedBullets.set(bulletId, extrapolated);
            continue;
        }

        while (buffer.length >= 2 && buffer[1].timestamp <= renderTime) {
            buffer.shift();
        }

        const older = buffer[0];
        const newer = buffer[1];

        if (!newer) {
            const extrapolated = extrapolateBullet(older.bullet, renderTime - older.timestamp);
            interpolatedBullets.set(bulletId, extrapolated);
            continue;
        }

        const duration = newer.timestamp - older.timestamp;
        const progress = duration <= 0 ? 1 : clamp((renderTime - older.timestamp) / duration, 0, 1);

        interpolatedBullets.set(bulletId, {
            ...newer.bullet,
            x: lerp(older.bullet.x, newer.bullet.x, progress),
            y: lerp(older.bullet.y, newer.bullet.y, progress),
            velocityX: lerp(older.bullet.velocityX || 0, newer.bullet.velocityX || 0, progress),
            velocityY: lerp(older.bullet.velocityY || 0, newer.bullet.velocityY || 0, progress),
            alpha: 1
        });
    }

    fadingBulletTrails = fadingBulletTrails
        .map(trail => {
            const age = now - trail.createdAt;
            const alpha = clamp(1 - age / BULLET_FADE_MS, 0, 1);

            return {
                ...trail,
                alpha
            };
        })
        .filter(trail => trail.alpha > 0);
}

function extrapolateBullet(bullet, millisecondsSinceSnapshot) {
    const seconds = clamp(millisecondsSinceSnapshot, 0, BULLET_MAX_EXTRAPOLATION_MS) / 1000;

    return {
        ...bullet,
        x: bullet.x + (bullet.velocityX || 0) * seconds,
        y: bullet.y + (bullet.velocityY || 0) * seconds,
        alpha: 1
    };
}

function getRenderableBullets() {
    if (interpolatedBullets.size === 0) {
        return bullets;
    }

    return [...interpolatedBullets.values()];
}
