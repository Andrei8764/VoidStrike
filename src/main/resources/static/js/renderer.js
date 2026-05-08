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
        mouse.pitch = state.viewPitch;
        return;
    }

    if (state.viewAngle === 0 && self.angle !== 0) {
        state.viewAngle = self.angle;
    }

    mouse.angle = state.viewAngle;
    mouse.pitch = state.viewPitch;
}

export function render() {
    context.clearRect(0, 0, canvas.width, canvas.height);

    drawFirstPersonScene();
    drawGunOverlay();

    if (state.ads) {
        drawAdsSight();
    } else {
        drawCrosshair();
    }

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
    drawProjectedSun(self);
    drawProjectedGrid(self);
    drawMovementFloorStreaks();
    drawProjectedBulletTrails(self);

    const objects = [
        ...getBoundaryWallSegments().map((segment, index) => ({
            ...segment,
            depth: getWallSortDepth(self, segment),
            color: ["#2563eb", "#0891b2", "#7c3aed", "#0f766e"][index % 4],
            accent: ["#bfdbfe", "#67e8f9", "#ddd6fe", "#99f6e4"][index % 4]
        })),
        ...getObstacleWallSegments().map((segment, index) => ({
            ...segment,
            depth: getWallSortDepth(self, segment),
            color: ["#f97316", "#dc2626", "#16a34a", "#9333ea", "#0284c7"][index % 5],
            accent: ["#fed7aa", "#fecaca", "#bbf7d0", "#e9d5ff", "#bae6fd"][index % 5]
        })),
        ...getProjectedPlayers(self),
        ...getProjectedBullets(self)
    ];

    objects
        .filter(object => object.type === "wall" || object.depth > NEAR_PLANE)
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
    const horizon = getHorizon();
    const time = performance.now() * 0.001;

    const sky = context.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, "#38bdf8");
    sky.addColorStop(0.45, "#7dd3fc");
    sky.addColorStop(1, "#dbeafe");

    context.fillStyle = sky;
    context.fillRect(0, 0, canvas.width, horizon);

    drawClouds(horizon, time);

    const floor = context.createLinearGradient(0, horizon, 0, canvas.height);
    floor.addColorStop(0, "#86efac");
    floor.addColorStop(0.3, "#22c55e");
    floor.addColorStop(0.7, "#15803d");
    floor.addColorStop(1, "#052e16");

    context.fillStyle = floor;
    context.fillRect(0, horizon, canvas.width, canvas.height - horizon);

    const glow = context.createRadialGradient(
        canvas.width * 0.5,
        horizon,
        20,
        canvas.width * 0.5,
        horizon,
        canvas.height * 0.85
    );

    glow.addColorStop(0, "rgba(255, 255, 255, 0.12)");
    glow.addColorStop(0.45, "rgba(250, 204, 21, 0.07)");
    glow.addColorStop(1, "rgba(0, 0, 0, 0)");

    context.fillStyle = glow;
    context.fillRect(0, horizon, canvas.width, canvas.height - horizon);
}

function drawClouds(horizon, time) {
    context.save();

    context.fillStyle = "rgba(255, 255, 255, 0.38)";

    for (let i = 0; i < 7; i++) {
        const baseX = ((i * 280 + time * 18) % (canvas.width + 260)) - 130;
        const baseY = horizon * (0.18 + (i % 3) * 0.14);
        const scale = 0.7 + (i % 4) * 0.18;

        context.beginPath();
        context.ellipse(baseX, baseY, 52 * scale, 18 * scale, 0, 0, Math.PI * 2);
        context.ellipse(baseX + 42 * scale, baseY + 4 * scale, 48 * scale, 16 * scale, 0, 0, Math.PI * 2);
        context.ellipse(baseX - 38 * scale, baseY + 5 * scale, 44 * scale, 15 * scale, 0, 0, Math.PI * 2);
        context.fill();
    }

    context.restore();
}

function drawProjectedGrid(self) {
    const spacing = 120;
    const moving = keys.up || keys.down || keys.left || keys.right;
    const pulse = moving ? 0.05 + Math.abs(Math.sin(state.bobTime)) * 0.08 : 0;

    context.save();
    context.strokeStyle = `rgba(240, 253, 244, ${0.13 + pulse})`;
    context.lineWidth = moving ? 1.4 : 1;

    for (let x = 0; x <= WORLD_WIDTH; x += spacing) {
        drawProjectedFloorLine(self, x, 0, x, WORLD_HEIGHT);
    }

    for (let y = 0; y <= WORLD_HEIGHT; y += spacing) {
        drawProjectedFloorLine(self, 0, y, WORLD_WIDTH, y);
    }

    context.restore();
}

function drawMovementFloorStreaks() {
    const moving = keys.up || keys.down || keys.left || keys.right;

    if (!moving) {
        return;
    }

    const horizon = getHorizon();
    const time = performance.now() * 0.001;

    context.save();
    context.globalAlpha = 0.08 + Math.abs(Math.sin(state.bobTime)) * 0.06;
    context.strokeStyle = "rgba(255, 255, 255, 0.45)";
    context.lineWidth = 1.4;
    context.lineCap = "round";

    for (let i = 0; i < 10; i++) {
        const progress = ((time * 1.35 + i * 0.17) % 1);
        const y = horizon + progress * (canvas.height - horizon);
        const centerOffset = (i - 5) * 64;
        const x = canvas.width / 2 + centerOffset * progress;
        const length = 12 + progress * 46;

        context.beginPath();
        context.moveTo(x, y);
        context.lineTo(x - centerOffset * 0.045, y + length);
        context.stroke();
    }

    context.restore();
}

function drawProjectedFloorLine(self, ax, ay, bx, by) {
    const startCamera = getCameraSpacePoint(self, ax, ay);
    const endCamera = getCameraSpacePoint(self, bx, by);
    const clipped = clipCameraSegment(startCamera, endCamera);

    if (!clipped) {
        return;
    }

    const start = projectCameraSpacePoint(clipped.start);
    const end = projectCameraSpacePoint(clipped.end);

    const y1 = getGroundScreenY(start.depth);
    const y2 = getGroundScreenY(end.depth);

    context.beginPath();
    context.moveTo(start.x, y1);
    context.lineTo(end.x, y2);
    context.stroke();
}

function drawProjectedWall(self, wall) {
    const startCamera = getCameraSpacePoint(self, wall.x1, wall.y1);
    const endCamera = getCameraSpacePoint(self, wall.x2, wall.y2);
    const clipped = clipCameraSegment(startCamera, endCamera);

    if (!clipped) {
        return;
    }

    const start = projectCameraSpacePoint(clipped.start);
    const end = projectCameraSpacePoint(clipped.end);

    const bottomA = getGroundScreenY(start.depth);
    const bottomB = getGroundScreenY(end.depth);
    const topA = bottomA - getProjectedHeight(start.depth, WALL_HEIGHT);
    const topB = bottomB - getProjectedHeight(end.depth, WALL_HEIGHT);
    const shade = clamp(1 - wall.depth / 1300, 0.45, 1);

    context.save();

    context.globalAlpha = 1;

    const wallGradient = context.createLinearGradient(start.x, topA, end.x, bottomB);
    wallGradient.addColorStop(0, wall.accent);
    wallGradient.addColorStop(0.42, wall.color);
    wallGradient.addColorStop(1, "#111827");

    context.fillStyle = wallGradient;

    context.beginPath();
    context.moveTo(start.x, topA);
    context.lineTo(end.x, topB);
    context.lineTo(end.x, bottomB);
    context.lineTo(start.x, bottomA);
    context.closePath();
    context.fill();

    context.globalAlpha = clamp(shade + 0.12, 0.55, 1);
    context.strokeStyle = wall.accent;
    context.lineWidth = 2;
    context.stroke();

    if (Math.min(start.depth, end.depth) > 60) {
        context.globalAlpha = clamp(shade * 0.32, 0.12, 0.32);
        context.strokeStyle = "rgba(255, 255, 255, 0.72)";
        context.lineWidth = 1;

        context.beginPath();
        context.moveTo(start.x, topA + 12);
        context.lineTo(end.x, topB + 12);
        context.stroke();
    }

    context.restore();
}

function drawProjectedSprite(sprite) {
    context.save();
    context.translate(sprite.x, sprite.y);
    context.globalAlpha = sprite.alpha;

    if (sprite.kind === "player") {
        drawProjectedEnemy(sprite);
    } else {
        context.fillStyle = sprite.shadow || "rgba(0, 0, 0, 0.32)";
        context.beginPath();
        context.ellipse(
            0,
            sprite.height * 0.42,
            sprite.width * 0.42,
            sprite.height * 0.08,
            0,
            0,
            Math.PI * 2
        );
        context.fill();

        context.fillStyle = sprite.color;
        context.strokeStyle = sprite.accent;
        context.lineWidth = 2;

        context.beginPath();
        context.ellipse(
            0,
            0,
            sprite.width * 0.34,
            sprite.height * 0.5,
            0,
            0,
            Math.PI * 2
        );
        context.fill();
        context.stroke();
    }

    if (sprite.label) {
        context.fillStyle = "#f8fafc";
        context.font = `${Math.max(10, Math.min(15, sprite.width * 0.12))}px Arial`;
        context.textAlign = "center";
        context.fillText(sprite.label, 0, -sprite.height * 0.62);
    }

    context.restore();
}

function drawProjectedEnemy(sprite) {
    const teamColor = sprite.color;
    const teamAccent = sprite.accent;
    const dark = "#111827";
    const armor = "#1e293b";
    const metal = "#64748b";
    const visor = "#67e8f9";

    context.fillStyle = "rgba(0, 0, 0, 0.36)";
    context.beginPath();
    context.ellipse(
        0,
        sprite.height * 0.46,
        sprite.width * 0.46,
        sprite.height * 0.08,
        0,
        0,
        Math.PI * 2
    );
    context.fill();

    context.strokeStyle = teamAccent;
    context.lineWidth = Math.max(1, sprite.width * 0.035);

    const bodyWidth = sprite.width * 0.58;
    const bodyHeight = sprite.height * 0.38;
    const bodyY = -sprite.height * 0.06;

    context.fillStyle = teamColor;
    roundRect(
        -bodyWidth / 2,
        bodyY - bodyHeight / 2,
        bodyWidth,
        bodyHeight,
        sprite.width * 0.12
    );
    context.fill();
    context.stroke();

    context.fillStyle = armor;
    roundRect(
        -bodyWidth * 0.28,
        bodyY - bodyHeight * 0.24,
        bodyWidth * 0.56,
        bodyHeight * 0.48,
        sprite.width * 0.08
    );
    context.fill();

    const headRadius = sprite.width * 0.21;
    const headY = -sprite.height * 0.36;

    context.fillStyle = "#f8c8a4";
    context.beginPath();
    context.arc(0, headY, headRadius, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = dark;
    context.beginPath();
    context.arc(0, headY - headRadius * 0.18, headRadius * 1.08, Math.PI, Math.PI * 2);
    context.fill();

    context.fillStyle = metal;
    roundRect(
        -headRadius * 1.02,
        headY - headRadius * 0.52,
        headRadius * 2.04,
        headRadius * 0.72,
        headRadius * 0.22
    );
    context.fill();

    context.fillStyle = visor;
    roundRect(
        -headRadius * 0.75,
        headY - headRadius * 0.22,
        headRadius * 1.5,
        headRadius * 0.34,
        headRadius * 0.16
    );
    context.fill();

    context.fillStyle = "rgba(255, 255, 255, 0.65)";
    context.fillRect(
        -headRadius * 0.52,
        headY - headRadius * 0.14,
        headRadius * 0.52,
        Math.max(1, headRadius * 0.07)
    );

    context.strokeStyle = armor;
    context.lineWidth = Math.max(2, sprite.width * 0.07);
    context.lineCap = "round";

    context.beginPath();
    context.moveTo(-bodyWidth * 0.45, bodyY - bodyHeight * 0.14);
    context.lineTo(-sprite.width * 0.42, bodyY + bodyHeight * 0.28);
    context.stroke();

    context.beginPath();
    context.moveTo(bodyWidth * 0.45, bodyY - bodyHeight * 0.12);
    context.lineTo(sprite.width * 0.46, bodyY + bodyHeight * 0.1);
    context.stroke();

    context.beginPath();
    context.moveTo(bodyWidth * 0.45, bodyY - bodyHeight * 0.12);
    context.lineTo(sprite.width * 0.46, bodyY + bodyHeight * 0.1);
    context.stroke();

    drawEnemyAimedWeapon(sprite, bodyY, bodyHeight, dark, armor);

    context.strokeStyle = dark;
    context.lineWidth = Math.max(2, sprite.width * 0.075);

    context.beginPath();

    context.strokeStyle = dark;
    context.lineWidth = Math.max(2, sprite.width * 0.075);

    context.beginPath();
    context.moveTo(-bodyWidth * 0.18, bodyY + bodyHeight * 0.45);
    context.lineTo(-sprite.width * 0.22, sprite.height * 0.38);
    context.stroke();

    context.beginPath();
    context.moveTo(bodyWidth * 0.18, bodyY + bodyHeight * 0.45);
    context.lineTo(sprite.width * 0.22, sprite.height * 0.38);
    context.stroke();

    context.fillStyle = teamAccent;
    context.fillRect(
        -bodyWidth * 0.08,
        bodyY - bodyHeight * 0.42,
        bodyWidth * 0.16,
        bodyHeight * 0.18
    );
}

function drawEnemyAimedWeapon(sprite, bodyY, bodyHeight, dark, armor) {
    const frontAmount = clamp(sprite.aimAtSelfAmount || 0, 0, 1);
    const sideAmount = 1 - frontAmount;

    const sideAim = Math.sin(sprite.relativeAimAngle || 0);

    const sideShoulderX = sprite.width * 0.28;
    const sideShoulderY = bodyY - bodyHeight * 0.08;

    const frontCenterX = sprite.width * 0.16;
    const frontCenterY = bodyY - bodyHeight * 0.08 - (sprite.pitch || 0) * sprite.height * 0.12;

    const weaponX = sideShoulderX * sideAmount + frontCenterX * frontAmount;
    const weaponY = sideShoulderY * sideAmount + frontCenterY * frontAmount;

    const sideWeaponLength = sprite.width * 0.68;
    const frontWeaponLength = sprite.width * 0.14;
    const weaponLength = sideWeaponLength * sideAmount + frontWeaponLength * frontAmount;

    const sideWeaponAngle = sideAim * 0.42 - (sprite.pitch || 0) * 0.18;
    const weaponAngle = sideWeaponAngle * sideAmount;

    context.save();
    context.translate(weaponX, weaponY);
    context.rotate(weaponAngle);

    context.globalAlpha = sprite.alpha;

    context.strokeStyle = armor;
    context.lineWidth = Math.max(2, sprite.width * 0.055);
    context.lineCap = "round";

    context.beginPath();
    context.moveTo(-sprite.width * (0.08 + frontAmount * 0.06), sprite.height * 0.04);
    context.lineTo(sprite.width * 0.1, sprite.height * (0.12 - frontAmount * 0.06));
    context.stroke();

    if (frontAmount > 0.15) {
        context.beginPath();
        context.moveTo(sprite.width * 0.12 * frontAmount, sprite.height * 0.07 * frontAmount);
        context.lineTo(sprite.width * 0.03 * frontAmount, sprite.height * 0.02 * frontAmount);
        context.stroke();
    }

    context.strokeStyle = dark;
    context.lineWidth = Math.max(2, sprite.width * (0.05 + frontAmount * 0.008));

    context.beginPath();
    context.moveTo(0, 0);
    context.lineTo(weaponLength, 0);
    context.stroke();

    if (frontAmount < 0.8) {
        context.fillStyle = dark;
        roundRect(
            weaponLength * 0.58,
            -sprite.height * 0.025,
            sprite.width * 0.24 * sideAmount,
            sprite.height * 0.05,
            sprite.width * 0.016
        );
        context.fill();
    }

    context.fillStyle = armor;
    roundRect(
        sprite.width * 0.08,
        sprite.height * 0.025,
        sprite.width * (0.16 - frontAmount * 0.07),
        sprite.height * 0.075,
        sprite.width * 0.016
    );
    context.fill();

    if (frontAmount > 0.08) {
        context.globalAlpha = sprite.alpha * frontAmount;

        context.fillStyle = "#020617";
        context.beginPath();
        context.arc(weaponLength, 0, sprite.width * 0.055, 0, Math.PI * 2);
        context.fill();

        context.strokeStyle = "#475569";
        context.lineWidth = Math.max(1, sprite.width * 0.018);
        context.beginPath();
        context.arc(weaponLength, 0, sprite.width * 0.068, 0, Math.PI * 2);
        context.stroke();

        context.fillStyle = "#111827";
        roundRect(
            weaponLength - sprite.width * 0.045,
            sprite.height * 0.04,
            sprite.width * 0.09,
            sprite.height * 0.11,
            sprite.width * 0.018
        );
        context.fill();
    }

    context.restore();
}

function drawEnemyWeaponPointingAtViewer(sprite, shoulderX, shoulderY, dark, armor) {
    const centerX = shoulderX + sprite.width * 0.14;
    const centerY = shoulderY - (sprite.pitch || 0) * sprite.height * 0.18;

    context.save();
    context.translate(centerX, centerY);

    context.strokeStyle = armor;
    context.lineWidth = Math.max(2, sprite.width * 0.06);
    context.lineCap = "round";

    context.beginPath();
    context.moveTo(-sprite.width * 0.18, sprite.height * 0.08);
    context.lineTo(-sprite.width * 0.03, sprite.height * 0.02);
    context.stroke();

    context.beginPath();
    context.moveTo(sprite.width * 0.18, sprite.height * 0.08);
    context.lineTo(sprite.width * 0.03, sprite.height * 0.02);
    context.stroke();

    context.fillStyle = dark;
    roundRect(
        -sprite.width * 0.18,
        -sprite.height * 0.055,
        sprite.width * 0.36,
        sprite.height * 0.11,
        sprite.width * 0.035
    );
    context.fill();

    context.fillStyle = "#020617";
    context.beginPath();
    context.arc(0, 0, sprite.width * 0.105, 0, Math.PI * 2);
    context.fill();

    context.strokeStyle = "#475569";
    context.lineWidth = Math.max(1, sprite.width * 0.025);
    context.beginPath();
    context.arc(0, 0, sprite.width * 0.12, 0, Math.PI * 2);
    context.stroke();

    context.fillStyle = "#111827";
    roundRect(
        -sprite.width * 0.08,
        sprite.height * 0.055,
        sprite.width * 0.16,
        sprite.height * 0.15,
        sprite.width * 0.025
    );
    context.fill();

    context.restore();
}

function getSmoothRemoteWeaponAim(player, self) {
    const targetAngle = player.angle || 0;
    const targetPitch = player.pitch || 0;
    const now = performance.now();

    const angleToSelf = Math.atan2(self.y - player.y, self.x - player.x);
    const aimDifferenceToSelf = Math.abs(normalizeAngle(targetAngle - angleToSelf));

    const fullFrontAngle = 0.08;
    const noFrontAngle = 0.32;
    const targetFrontAmount = clamp(
        1 - (aimDifferenceToSelf - fullFrontAngle) / (noFrontAngle - fullFrontAngle),
        0,
        1
    );

    if (!state.remoteWeaponAimStates.has(player.id)) {
        state.remoteWeaponAimStates.set(player.id, {
            angle: targetAngle,
            pitch: targetPitch,
            frontAmount: targetFrontAmount,
            updatedAt: now
        });
    }

    const aimState = state.remoteWeaponAimStates.get(player.id);
    const deltaSeconds = Math.min((now - aimState.updatedAt) / 1000, 0.05);

    const angleSmoothSpeed = 8;
    const frontSmoothSpeed = 4;

    const angleBlend = 1 - Math.exp(-angleSmoothSpeed * deltaSeconds);
    const frontBlend = 1 - Math.exp(-frontSmoothSpeed * deltaSeconds);

    aimState.angle = lerpAngleValue(aimState.angle, targetAngle, angleBlend);
    aimState.pitch = aimState.pitch + (targetPitch - aimState.pitch) * angleBlend;
    aimState.frontAmount = aimState.frontAmount + (targetFrontAmount - aimState.frontAmount) * frontBlend;
    aimState.updatedAt = now;

    return aimState;
}


function getProjectedPlayers(self) {
    const remotePlayers = getRenderableRemotePlayers();
    const remotePlayerIds = new Set(remotePlayers.map(player => player.id));

    for (const playerId of state.remoteWeaponAimStates.keys()) {
        if (!remotePlayerIds.has(playerId)) {
            state.remoteWeaponAimStates.delete(playerId);
        }
    }

    return remotePlayers
        .filter(player => isWorldPointVisibleFromSelf(self, player.x, player.y))
        .map(player => {
            const projected = projectWorldPoint(self, player.x, player.y);
            const height = getProjectedHeight(projected.depth, 80);
            const width = height * 0.42;

            const smoothAim = getSmoothRemoteWeaponAim(player, self);
            const relativeAimAngle = normalizeAngle(smoothAim.angle - state.viewAngle);

        return {
            type: "sprite",
            kind: "player",
            depth: projected.depth,
            x: projected.x,
            y: getGroundScreenY(projected.depth) - height / 2,
            width,
            height,
            color: player.team === "RED" ? "#ef4444" : "#3b82f6",
            accent: player.team === "RED" ? "#fecaca" : "#bfdbfe",
            alpha: clamp(1 - projected.depth / 1700, 0.35, 1),
            label: player.name,
            relativeAimAngle,
            aimAtSelfAmount: smoothAim.frontAmount,
            pitch: smoothAim.pitch
        };
    });
}

function getProjectedBullets(self) {
    return getRenderableBullets()
        .filter(bullet => isWorldPointVisibleFromSelf(self, bullet.x, bullet.y))
        .map(bullet => {
            const projected = projectWorldPoint(self, bullet.x, bullet.y);
            const size = getProjectedHeight(projected.depth, 8);
            const bulletZ = (bullet.z ?? 8) * 0.62;

            return {
                type: "sprite",
                kind: "bullet",
                depth: projected.depth,
                x: projected.x,
                y: getGroundScreenY(projected.depth) - getProjectedHeight(projected.depth, bulletZ),
                width: size,
                height: size,
                color: "#facc15",
                accent: "#fef3c7",
                shadow: "rgba(250, 204, 21, 0.22)",
                alpha: bullet.alpha ?? 1
            };
        });
}

function drawProjectedBulletTrails(self) {
    context.save();

    for (const trail of state.fadingBulletTrails) {
        if (isWorldPointVisibleFromSelf(self, trail.x, trail.y)) {
            drawProjectedBulletTrail(self, trail, trail.alpha);
        }
    }

    for (const bullet of getRenderableBullets()) {
        if (isWorldPointVisibleFromSelf(self, bullet.x, bullet.y)) {
            drawProjectedBulletTrail(self, bullet, bullet.alpha ?? 1);
        }
    }

    context.restore();
}

function drawProjectedSun(self) {
    const sunWorldX = WORLD_WIDTH * 0.5;
    const sunWorldY = -900;
    const projected = projectWorldPoint(self, sunWorldX, sunWorldY);
    const horizon = getHorizon();

    if (projected.depth <= NEAR_PLANE) {
        return;
    }

    const sunX = projected.x;
    const sunY = Math.max(70, horizon * 0.26);
    const radius = Math.max(42, Math.min(96, canvas.width * 0.06));

    context.save();

    const glow = context.createRadialGradient(
        sunX,
        sunY,
        radius * 0.15,
        sunX,
        sunY,
        radius * 2.4
    );

    glow.addColorStop(0, "rgba(254, 240, 138, 0.95)");
    glow.addColorStop(0.24, "rgba(250, 204, 21, 0.55)");
    glow.addColorStop(1, "rgba(250, 204, 21, 0)");

    context.fillStyle = glow;
    context.beginPath();
    context.arc(sunX, sunY, radius * 2.4, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = "#fde047";
    context.beginPath();
    context.arc(sunX, sunY, radius * 0.52, 0, Math.PI * 2);
    context.fill();

    context.strokeStyle = "rgba(254, 249, 195, 0.7)";
    context.lineWidth = 3;

    for (let i = 0; i < 12; i++) {
        const angle = i / 12 * Math.PI * 2 + performance.now() * 0.0004;
        context.beginPath();
        context.moveTo(
            sunX + Math.cos(angle) * radius * 0.78,
            sunY + Math.sin(angle) * radius * 0.78
        );
        context.lineTo(
            sunX + Math.cos(angle) * radius * 1.15,
            sunY + Math.sin(angle) * radius * 1.15
        );
        context.stroke();
    }

    context.restore();
}

function drawProjectedBulletTrail(self, bullet, alpha) {
    const velocityX = bullet.velocityX || 0;
    const velocityY = bullet.velocityY || 0;
    const velocityZ = bullet.velocityZ || 0;
    const speed = Math.sqrt(velocityX * velocityX + velocityY * velocityY + velocityZ * velocityZ);

    if (speed < 0.001 || alpha <= 0) {
        return;
    }

    const directionX = velocityX / speed;
    const directionY = velocityY / speed;
    const directionZ = velocityZ / speed;
    const trailLength = clamp(speed * 0.024, 10, 58);


    const visualZScale = 0.62;
    const bulletZ = (bullet.z ?? 8) * visualZScale;
    const head = projectWorldPoint(self, bullet.x, bullet.y);
    const tail = projectWorldPoint(
        self,
        bullet.x - directionX * trailLength,
        bullet.y - directionY * trailLength
    );

    if (head.depth <= NEAR_PLANE || tail.depth <= NEAR_PLANE) {
        return;
    }

    const tailZ = (bullet.z ?? 8) * visualZScale - directionZ * trailLength * visualZScale;
    const headY = getGroundScreenY(head.depth) - getProjectedHeight(head.depth, bulletZ);
    const tailY = getGroundScreenY(tail.depth) - getProjectedHeight(tail.depth, tailZ);

    const gradient = context.createLinearGradient(tail.x, tailY, head.x, headY);
    gradient.addColorStop(0, "rgba(250, 204, 21, 0)");
    gradient.addColorStop(0.4, `rgba(250, 204, 21, ${0.22 * alpha})`);
    gradient.addColorStop(1, `rgba(254, 243, 199, ${0.95 * alpha})`);

    context.strokeStyle = gradient;
    context.lineWidth = clamp(getProjectedHeight(head.depth, 4), 0.8, 2.6);
    context.lineCap = "round";
    context.shadowColor = "#facc15";
    context.shadowBlur = 6;

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

function drawAdsSight() {
    const x = canvas.width / 2;
    const y = canvas.height / 2;
    const recoil = state.recoilKick * 0.25;
    const ringRadius = 58 + recoil;
    const innerRadius = 18 + recoil * 0.35;

    context.save();

    context.fillStyle = "rgba(0, 0, 0, 0.28)";
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.strokeStyle = "rgba(15, 23, 42, 0.92)";
    context.lineWidth = 16;
    context.beginPath();
    context.arc(x, y, ringRadius + 10, 0, Math.PI * 2);
    context.stroke();

    context.strokeStyle = "#020617";
    context.lineWidth = 7;
    context.beginPath();
    context.arc(x, y, ringRadius, 0, Math.PI * 2);
    context.stroke();

    context.strokeStyle = "#475569";
    context.lineWidth = 2;
    context.beginPath();
    context.arc(x, y, ringRadius - 8, 0, Math.PI * 2);
    context.stroke();

    context.strokeStyle = "rgba(248, 250, 252, 0.92)";
    context.lineWidth = 2;

    context.beginPath();
    context.moveTo(x - ringRadius + 13, y);
    context.lineTo(x - innerRadius, y);
    context.moveTo(x + innerRadius, y);
    context.lineTo(x + ringRadius - 13, y);
    context.moveTo(x, y - ringRadius + 13);
    context.lineTo(x, y - innerRadius);
    context.moveTo(x, y + innerRadius);
    context.lineTo(x, y + ringRadius - 13);
    context.stroke();

    context.strokeStyle = "#ef4444";
    context.lineWidth = 2;
    context.beginPath();
    context.arc(x, y, 3.5 + recoil * 0.12, 0, Math.PI * 2);
    context.stroke();

    context.fillStyle = "#ef4444";
    context.beginPath();
    context.arc(x, y, 1.5, 0, Math.PI * 2);
    context.fill();

    context.strokeStyle = "rgba(239, 68, 68, 0.65)";
    context.lineWidth = 1;
    context.beginPath();
    context.arc(x, y, 9 + recoil * 0.2, 0, Math.PI * 2);
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

    if (state.ads) {
        drawAdsGunOverlay(self, recoil);
        return;
    }

    const baseX = canvas.width * 0.58 + sway;
    const baseY = canvas.height - 112 + bob + recoil;

    context.save();
    context.translate(baseX, baseY);
    context.rotate(-0.045);

    switch (self.weapon) {
        case "Pistol":
            drawPistolOverlay(self);
            break;
        case "SMG":
            drawSmgOverlay(self);
            break;
        case "Shotgun":
            drawShotgunOverlay(self);
            break;
        case "Sniper":
            drawSniperOverlay(self);
            break;
        case "Rifle":
        default:
            drawRifleOverlay(self);
            break;
    }

    context.restore();
}

function drawRifleOverlay(self) {
    context.fillStyle = "rgba(0, 0, 0, 0.42)";
    context.fillRect(-28, 46, 330, 28);

    context.fillStyle = "#0f172a";
    roundRect(14, -18, 218, 38, 8);
    context.fill();

    context.fillStyle = "#334155";
    roundRect(88, -58, 72, 24, 6);
    context.fill();

    context.fillStyle = "#020617";
    roundRect(232, -10, 118, 16, 3);
    context.fill();

    context.fillStyle = self.team === "RED" ? "#ef4444" : "#3b82f6";
    context.fillRect(24, -11, 9, 24);
}

function drawPistolOverlay(self) {
    context.fillStyle = "rgba(0, 0, 0, 0.38)";
    context.fillRect(-10, 48, 180, 22);

    context.fillStyle = "#111827";
    roundRect(18, -10, 145, 32, 7);
    context.fill();

    context.fillStyle = "#020617";
    roundRect(150, -4, 54, 12, 3);
    context.fill();

    context.strokeStyle = "#020617";
    context.lineWidth = 8;
    context.lineCap = "round";
    context.beginPath();
    context.moveTo(62, 20);
    context.lineTo(48, 78);
    context.stroke();

    context.fillStyle = self.team === "RED" ? "#ef4444" : "#3b82f6";
    context.fillRect(26, -4, 8, 20);
}

function drawSmgOverlay(self) {
    context.fillStyle = "rgba(0, 0, 0, 0.42)";
    context.fillRect(-26, 48, 285, 24);

    context.fillStyle = "#1e293b";
    roundRect(10, -14, 190, 34, 7);
    context.fill();

    context.fillStyle = "#020617";
    roundRect(190, -8, 92, 14, 3);
    context.fill();

    context.fillStyle = "#334155";
    roundRect(60, -36, 82, 16, 5);
    context.fill();

    context.fillStyle = "#020617";
    roundRect(92, 20, 42, 70, 5);
    context.fill();

    context.fillStyle = self.team === "RED" ? "#ef4444" : "#3b82f6";
    context.fillRect(22, -7, 8, 22);
}

function drawShotgunOverlay(self) {
    context.fillStyle = "rgba(0, 0, 0, 0.45)";
    context.fillRect(-34, 48, 370, 25);

    context.fillStyle = "#3f2412";
    roundRect(0, -12, 170, 34, 8);
    context.fill();

    context.fillStyle = "#020617";
    roundRect(160, -10, 210, 12, 3);
    context.fill();

    context.fillStyle = "#111827";
    roundRect(160, 8, 210, 10, 3);
    context.fill();

    context.strokeStyle = "#020617";
    context.lineWidth = 9;
    context.lineCap = "round";
    context.beginPath();
    context.moveTo(72, 20);
    context.lineTo(50, 84);
    context.stroke();

    context.fillStyle = self.team === "RED" ? "#ef4444" : "#3b82f6";
    context.fillRect(22, -4, 9, 22);
}

function drawSniperOverlay(self) {
    context.fillStyle = "rgba(0, 0, 0, 0.48)";
    context.fillRect(-46, 50, 430, 24);

    context.fillStyle = "#0f172a";
    roundRect(8, -14, 230, 32, 7);
    context.fill();

    context.fillStyle = "#020617";
    roundRect(224, -8, 190, 11, 3);
    context.fill();

    context.fillStyle = "#111827";
    roundRect(70, -58, 128, 26, 8);
    context.fill();

    context.strokeStyle = "#475569";
    context.lineWidth = 5;
    context.beginPath();
    context.arc(134, -45, 32, 0, Math.PI * 2);
    context.stroke();

    context.fillStyle = "#020617";
    roundRect(112, 18, 38, 74, 5);
    context.fill();

    context.fillStyle = self.team === "RED" ? "#ef4444" : "#3b82f6";
    context.fillRect(22, -6, 8, 22);
}

function drawAdsGunOverlay(self, recoil) {
    const x = canvas.width / 2;
    const y = canvas.height - 118 + recoil * 0.7;

    context.save();
    context.translate(x, y);

    context.fillStyle = "rgba(0, 0, 0, 0.5)";
    context.fillRect(-132, 62, 264, 26);

    context.fillStyle = "#020617";
    roundRect(-118, 18, 236, 34, 8);
    context.fill();

    context.fillStyle = "#111827";
    roundRect(-76, -18, 152, 34, 10);
    context.fill();

    context.strokeStyle = "#475569";
    context.lineWidth = 5;
    context.beginPath();
    context.arc(0, -2, 44, 0, Math.PI * 2);
    context.stroke();

    context.strokeStyle = "#020617";
    context.lineWidth = 13;
    context.beginPath();
    context.arc(0, -2, 55, 0, Math.PI * 2);
    context.stroke();

    context.fillStyle = "#1e293b";
    roundRect(-96, 48, 192, 28, 6);
    context.fill();

    context.fillStyle = self.team === "RED" ? "#ef4444" : "#3b82f6";
    context.fillRect(-104, 26, 8, 20);

    context.restore();
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
            context.lineTo(
                px + Math.cos(state.viewAngle) * 16,
                py + Math.sin(state.viewAngle) * 16
            );
            context.stroke();
        }
    }

    context.restore();
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

function getWallSortDepth(self, wall) {
    const start = getCameraSpacePoint(self, wall.x1, wall.y1);
    const end = getCameraSpacePoint(self, wall.x2, wall.y2);

    return Math.max(start.depth, end.depth);
}

function isWorldPointVisibleFromSelf(self, targetX, targetY) {
    for (const obstacle of state.obstacles) {
        if (lineIntersectsObstacle(self.x, self.y, targetX, targetY, obstacle)) {
            return false;
        }
    }

    return true;
}

function lineIntersectsObstacle(x1, y1, x2, y2, obstacle) {
    const left = obstacle.x;
    const right = obstacle.x + obstacle.width;
    const top = obstacle.y;
    const bottom = obstacle.y + obstacle.height;

    if (x1 > left && x1 < right && y1 > top && y1 < bottom) {
        return false;
    }

    if (x2 > left && x2 < right && y2 > top && y2 < bottom) {
        return true;
    }

    return lineSegmentsIntersect(x1, y1, x2, y2, left, top, right, top)
        || lineSegmentsIntersect(x1, y1, x2, y2, right, top, right, bottom)
        || lineSegmentsIntersect(x1, y1, x2, y2, right, bottom, left, bottom)
        || lineSegmentsIntersect(x1, y1, x2, y2, left, bottom, left, top);
}

function lineSegmentsIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
    const denominator = (ax - bx) * (cy - dy) - (ay - by) * (cx - dx);

    if (Math.abs(denominator) < 0.000001) {
        return false;
    }

    const t = ((ax - cx) * (cy - dy) - (ay - cy) * (cx - dx)) / denominator;
    const u = -((ax - bx) * (ay - cy) - (ay - by) * (ax - cx)) / denominator;

    return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

function getCameraSpacePoint(self, worldX, worldY) {
    const dx = worldX - self.x;
    const dy = worldY - self.y;
    const cos = Math.cos(state.viewAngle);
    const sin = Math.sin(state.viewAngle);

    return {
        side: -sin * dx + cos * dy,
        depth: cos * dx + sin * dy
    };
}

function clipCameraSegment(start, end) {
    const startInside = start.depth > NEAR_PLANE;
    const endInside = end.depth > NEAR_PLANE;

    if (!startInside && !endInside) {
        return null;
    }

    const clippedStart = { ...start };
    const clippedEnd = { ...end };

    if (startInside !== endInside) {
        const amount = (NEAR_PLANE - start.depth) / (end.depth - start.depth);
        const clippedPoint = {
            side: start.side + (end.side - start.side) * amount,
            depth: NEAR_PLANE
        };

        if (startInside) {
            clippedEnd.side = clippedPoint.side;
            clippedEnd.depth = clippedPoint.depth;
        } else {
            clippedStart.side = clippedPoint.side;
            clippedStart.depth = clippedPoint.depth;
        }
    }

    return {
        start: clippedStart,
        end: clippedEnd
    };
}

function projectCameraSpacePoint(point) {
    const projection = canvas.width / (2 * Math.tan(FOV / 2));

    return {
        x: canvas.width / 2 + point.side / Math.max(point.depth, NEAR_PLANE) * projection,
        depth: point.depth
    };
}

function projectWorldPoint(self, worldX, worldY) {
    const cameraPoint = getCameraSpacePoint(self, worldX, worldY);

    return projectCameraSpacePoint(cameraPoint);
}

function getGroundScreenY(depth) {
    const horizon = getHorizon();
    const projection = canvas.width / (2 * Math.tan(FOV / 2));

    return horizon + 70 / Math.max(depth, NEAR_PLANE) * projection;
}

function getProjectedHeight(depth, worldHeight) {
    const projection = canvas.width / (2 * Math.tan(FOV / 2));

    return worldHeight / Math.max(depth, NEAR_PLANE) * projection;
}

function getHorizon() {
    return canvas.height * 0.48 + state.viewPitch * canvas.height * 0.55;
}

function lerpAngleValue(from, to, amount) {
    return from + normalizeAngle(to - from) * amount;
}

function normalizeAngle(angle) {
    let normalized = angle;

    while (normalized > Math.PI) {
        normalized -= Math.PI * 2;
    }

    while (normalized < -Math.PI) {
        normalized += Math.PI * 2;
    }

    return normalized;
}

function roundRect(x, y, width, height, radius) {
    const finalRadius = Math.min(radius, width / 2, height / 2);

    context.beginPath();
    context.moveTo(x + finalRadius, y);
    context.lineTo(x + width - finalRadius, y);
    context.quadraticCurveTo(x + width, y, x + width, y + finalRadius);
    context.lineTo(x + width, y + height - finalRadius);
    context.quadraticCurveTo(x + width, y + height, x + width - finalRadius, y + height);
    context.lineTo(x + finalRadius, y + height);
    context.quadraticCurveTo(x, y + height, x, y + height - finalRadius);
    context.lineTo(x, y + finalRadius);
    context.quadraticCurveTo(x, y, x + finalRadius, y);
    context.closePath();
}