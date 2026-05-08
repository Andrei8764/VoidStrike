import { canvas, context } from "./dom.js";
import {
    camera,
    getRenderableBullets,
    getRenderablePlayers,
    getRenderableRemotePlayers,
    getSelfPlayer,
    keys,
    mouse,
    state
} from "./state.js";
import {
    FOV,
    NEAR_PLANE,
    WALL_HEIGHT,
    WORLD_HEIGHT,
    WORLD_WIDTH
} from "./config.js";
import { clamp } from "./utils.js";

export function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

export function updateCamera() {
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

export function updateMouseWorldPosition() {
    mouse.worldX = mouse.x + camera.x;
    mouse.worldY = mouse.y + camera.y;
}

export function updateAimAngle() {
    const self = getSelfPlayer();

    if (!self) {
        mouse.angle = state.viewAngle;
        return;
    }

    if (state.viewAngle === 0 && self.angle !== 0) {
        state.viewAngle = self.angle;
    }

    mouse.angle = state.viewAngle;
}

export function render() {
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
    return state.obstacles.flatMap(obstacle => {
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
    const cos = Math.cos(state.viewAngle);
    const sin = Math.sin(state.viewAngle);
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

function drawProjectedBulletTrails(self) {
    context.save();

    for (const trail of state.fadingBulletTrails) {
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
    const size = 10 + state.recoilKick;
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
    context.arc(x, y, 14 + state.recoilKick * 0.4, 0, Math.PI * 2);
    context.stroke();

    context.restore();
}

function drawGunOverlay() {
    const self = getSelfPlayer();

    if (!self) {
        return;
    }

    const moving = keys.up || keys.down || keys.left || keys.right;
    const sway = Math.sin(state.bobTime) * (moving ? 7 : 1.5);
    const bob = Math.abs(Math.cos(state.bobTime)) * (moving ? 8 : 2);
    const recoil = state.recoilKick * 0.9;
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
    for (const obstacle of state.obstacles) {
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

        context.fillStyle = player.id === state.playerId
            ? "#22c55e"
            : player.team === "RED"
                ? "#ef4444"
                : "#3b82f6";

        context.beginPath();
        context.arc(px, py, 4, 0, Math.PI * 2);
        context.fill();

        if (player.id === state.playerId) {
            context.strokeStyle = "#bbf7d0";
            context.beginPath();
            context.moveTo(px, py);
            context.lineTo(px + Math.cos(state.viewAngle) * 16, py + Math.sin(state.viewAngle) * 16);
            context.stroke();
        }
    }

    context.restore();
}