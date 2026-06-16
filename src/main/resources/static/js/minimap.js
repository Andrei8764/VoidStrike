import { minimapCanvas, minimapContext } from "./dom.js";
import { state, getSelfPlayer, getRenderableRemotePlayers } from "./state.js";
import {
    computePlayableBounds,
    getSolidCollisionBoxes,
    isSceneCollisionReady
} from "./sceneCollision.js";

const TEAM_COLORS = {
    RED: "#ef4444",
    BLUE: "#3b82f6"
};
const SELF_COLOR = "#22c55e";

let staticCacheCanvas = null;
let staticCacheBoundsKey = null;

function normalizeTeam(team) {
    return String(team || "").toUpperCase();
}

function boundsKey(bounds) {
    return `${bounds.minX}|${bounds.minY}|${bounds.maxX}|${bounds.maxY}`;
}

function computeMinimapViewport(bounds, canvasW, canvasH) {
    const worldW = Math.max(bounds.maxX - bounds.minX, 1);
    const worldH = Math.max(bounds.maxY - bounds.minY, 1);
    const scale = Math.min(canvasW / worldW, canvasH / worldH);
    const drawW = worldW * scale;
    const drawH = worldH * scale;
    const offsetX = (canvasW - drawW) / 2;
    const offsetY = (canvasH - drawH) / 2;

    return {
        bounds,
        scale,
        offsetX,
        offsetY,
        worldToPixel(x, y) {
            return {
                px: offsetX + (x - bounds.minX) * scale,
                py: offsetY + (y - bounds.minY) * scale
            };
        }
    };
}

function drawCollisionBox(ctx, box, viewport) {
    const { px, py } = viewport.worldToPixel(box.centerX, box.centerY);
    const halfWidth = box.halfWidth * viewport.scale;
    const halfDepth = box.halfDepth * viewport.scale;
    const yaw = Math.atan2(-box.sinYaw, box.cosYaw);

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(yaw);
    ctx.fillRect(-halfWidth, -halfDepth, halfWidth * 2, halfDepth * 2);
    ctx.restore();
}

function rebuildMinimapStaticCache(bounds) {
    if (!minimapCanvas) {
        return null;
    }

    const key = boundsKey(bounds);
    if (staticCacheCanvas && staticCacheBoundsKey === key) {
        return staticCacheCanvas;
    }

    const cacheCanvas = document.createElement("canvas");
    cacheCanvas.width = minimapCanvas.width;
    cacheCanvas.height = minimapCanvas.height;
    const cacheContext = cacheCanvas.getContext("2d");
    if (!cacheContext) {
        return null;
    }

    const viewport = computeMinimapViewport(bounds, cacheCanvas.width, cacheCanvas.height);

    cacheContext.fillStyle = "rgba(5, 8, 16, 0.75)";
    cacheContext.fillRect(0, 0, cacheCanvas.width, cacheCanvas.height);

    if (isSceneCollisionReady()) {
        cacheContext.fillStyle = "rgba(100, 116, 139, 0.55)";
        for (const box of getSolidCollisionBoxes()) {
            drawCollisionBox(cacheContext, box, viewport);
        }
    }

    cacheContext.strokeStyle = "rgba(125, 211, 252, 0.45)";
    cacheContext.strokeRect(0.5, 0.5, cacheCanvas.width - 1, cacheCanvas.height - 1);

    staticCacheCanvas = cacheCanvas;
    staticCacheBoundsKey = key;
    return staticCacheCanvas;
}

function drawPlayerDot(ctx, x, y, radius, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
}

function drawDirectionWedge(ctx, px, py, angle, radius) {
    const tipX = px + Math.cos(angle) * radius;
    const tipY = py + Math.sin(angle) * radius;
    const leftX = px + Math.cos(angle + 2.4) * (radius * 0.55);
    const leftY = py + Math.sin(angle + 2.4) * (radius * 0.55);
    const rightX = px + Math.cos(angle - 2.4) * (radius * 0.55);
    const rightY = py + Math.sin(angle - 2.4) * (radius * 0.55);

    ctx.fillStyle = SELF_COLOR;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(leftX, leftY);
    ctx.lineTo(rightX, rightY);
    ctx.closePath();
    ctx.fill();
}

export function updateMinimap() {
    if (!minimapCanvas || !minimapContext) {
        return;
    }

    minimapCanvas.classList.toggle("hidden", !state.joined);
    if (!state.joined) {
        return;
    }

    const self = getSelfPlayer();
    const bounds = computePlayableBounds();
    const staticCache = rebuildMinimapStaticCache(bounds);
    const viewport = computeMinimapViewport(bounds, minimapCanvas.width, minimapCanvas.height);

    minimapContext.clearRect(0, 0, minimapCanvas.width, minimapCanvas.height);
    if (staticCache) {
        minimapContext.drawImage(staticCache, 0, 0);
    } else {
        minimapContext.fillStyle = "rgba(5, 8, 16, 0.75)";
        minimapContext.fillRect(0, 0, minimapCanvas.width, minimapCanvas.height);
        minimapContext.strokeStyle = "rgba(125, 211, 252, 0.45)";
        minimapContext.strokeRect(0.5, 0.5, minimapCanvas.width - 1, minimapCanvas.height - 1);
    }

    if (!self) {
        return;
    }

    const selfTeam = normalizeTeam(self.team);

    for (const teammate of getRenderableRemotePlayers()) {
        if (normalizeTeam(teammate.team) !== selfTeam) {
            continue;
        }
        if ((teammate.hp ?? 0) <= 0) {
            continue;
        }

        const { px, py } = viewport.worldToPixel(teammate.x, teammate.y);
        const teamColor = TEAM_COLORS[selfTeam] || "#e2e8f0";
        drawPlayerDot(minimapContext, px, py, 3, teamColor);
    }

    const { px: selfPx, py: selfPy } = viewport.worldToPixel(self.x, self.y);
    drawPlayerDot(minimapContext, selfPx, selfPy, 4, SELF_COLOR);
    if (Number.isFinite(self.angle)) {
        drawDirectionWedge(minimapContext, selfPx, selfPy, self.angle, 7);
    }
}

export function invalidateMinimapCache() {
    staticCacheCanvas = null;
    staticCacheBoundsKey = null;
}
