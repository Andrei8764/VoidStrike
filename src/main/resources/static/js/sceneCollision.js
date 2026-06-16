import {
    FLY_VERTICAL_SPEED,
    PLAYER_BUNNYHOP_SPEED_BOOST,
    PLAYER_COLLIDER_HEIGHT,
    PLAYER_GRAVITY,
    PLAYER_GROUND_SNAP_EPSILON,
    PLAYER_JUMP_VELOCITY,
    PLAYER_RADIUS,
    PLAYER_STEP_UP_HEIGHT,
    WORLD_HEIGHT,
    WORLD_WIDTH
} from "./config.js";
import { clamp } from "./utils.js";

let sceneCollisionBoxes = [];
let collisionLoadPromise = null;
let collisionDataLoaded = false;
let lastCollisionHashes = { scene: "n/a", profiles: "n/a" };

// Sanity bounds for a single collision box (world units, post-scale).
// Anything outside is treated as a corrupt/suspect profile value.
const COLLISION_MAX_HALF = 4096;
const COLLISION_MAX_HEIGHT = 8192;
const COLLISION_MIN_DIM = 0.05;
const DEG2RAD = Math.PI / 180;

const collisionWarningKeys = new Set();

function warnCollisionOnce(key, message) {
    if (collisionWarningKeys.has(key)) {
        return;
    }
    collisionWarningKeys.add(key);
    console.warn(`[collision] ${message}`);
}

// Deterministic, dependency-free 32-bit FNV-1a hash, returned as 8 hex chars.
// Used purely to let the operator confirm client/server are reading the same files.
function hashString(text) {
    let h = 0x811c9dc5;
    const str = String(text ?? "");
    for (let i = 0; i < str.length; i += 1) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16).padStart(8, "0");
}

function createDefaultProfile() {
    return {
        halfWidth: 48,
        halfDepth: 48,
        height: 64,
        solid: true,
        walkable: true,
        yawOffsetDeg: 0,
        offsetLocalX: 0,
        offsetLocalY: 0,
        offsetLocalZ: 0,
        elevationLift: 0,
        kind: "",
        wallAxis: "",
        thickness: 0,
        boxes: []
    };
}

function readCollisionTemplate(node, fallback) {
    const halfWidth = Number(node?.halfWidth ?? fallback.halfWidth);
    const halfDepth = Number(node?.halfDepth ?? fallback.halfDepth);
    const height = Number(node?.height ?? fallback.height);
    const yawOffsetDeg = Number(node?.yawOffsetDeg ?? fallback.yawOffsetDeg ?? 0);
    const offsetLocalX = Number(node?.offsetLocalX ?? fallback.offsetLocalX ?? 0);
    const offsetLocalY = Number(node?.offsetLocalY ?? fallback.offsetLocalY ?? 0);
    const offsetLocalZ = Number(node?.offsetLocalZ ?? fallback.offsetLocalZ ?? 0);
    const elevationLift = Number(node?.elevationLift ?? fallback.elevationLift ?? 0);
    const kind = String(node?.kind ?? fallback.kind ?? "").toLowerCase();
    const wallAxis = String(node?.wallAxis ?? fallback.wallAxis ?? "").toLowerCase();
    const thickness = Number(node?.thickness ?? fallback.thickness ?? 0);
    const boxesRaw = Array.isArray(node?.boxes) ? node.boxes : [];
    const boxes = boxesRaw
        .filter(part => part && typeof part === "object")
        .map(part => ({
            halfWidth: Number(part.halfWidth ?? halfWidth),
            halfDepth: Number(part.halfDepth ?? halfDepth),
            height: Number(part.height ?? height),
            yawOffsetDeg: Number(part.yawOffsetDeg ?? yawOffsetDeg),
            offsetLocalX: Number(part.offsetLocalX ?? offsetLocalX),
            offsetLocalY: Number(part.offsetLocalY ?? offsetLocalY),
            offsetLocalZ: Number(part.offsetLocalZ ?? offsetLocalZ)
        }));

    return {
        halfWidth,
        halfDepth,
        height,
        solid: node?.solid ?? fallback.solid,
        walkable: node?.walkable ?? fallback.walkable,
        yawOffsetDeg,
        offsetLocalX,
        offsetLocalY,
        offsetLocalZ,
        elevationLift,
        kind,
        wallAxis,
        thickness,
        boxes
    };
}

function buildFallbackProfileConfig() {
    const defaultProfile = createDefaultProfile();
    return {
        defaultProfile,
        exactOnly: false,
        exact: new Map(),
        prefix: [
            { prefix: "/models/road-", collider: readCollisionTemplate({ halfWidth: 64, halfDepth: 64, height: 8, solid: false, walkable: true }, defaultProfile) },
            { prefix: "/models/grass", collider: readCollisionTemplate({ halfWidth: 64, halfDepth: 64, height: 8, solid: false, walkable: true }, defaultProfile) },
            { prefix: "/models/wall-", collider: readCollisionTemplate({ halfWidth: 64, halfDepth: 64, height: 96, solid: true, walkable: true }, defaultProfile) },
            { prefix: "/models/window-", collider: readCollisionTemplate({ halfWidth: 48, halfDepth: 24, height: 96, solid: true, walkable: true }, defaultProfile) },
            { prefix: "/models/door-", collider: readCollisionTemplate({ halfWidth: 40, halfDepth: 20, height: 96, solid: true, walkable: true }, defaultProfile) },
            { prefix: "/models/truck-", collider: readCollisionTemplate({ halfWidth: 92, halfDepth: 56, height: 88, solid: true, walkable: true }, defaultProfile) },
            { prefix: "/models/detail-block", collider: readCollisionTemplate({ halfWidth: 56, halfDepth: 56, height: 72, solid: true, walkable: true }, defaultProfile) },
            { prefix: "/models/detail-barrier", collider: readCollisionTemplate({ halfWidth: 52, halfDepth: 36, height: 52, solid: true, walkable: true }, defaultProfile) }
        ]
    };
}

function parseProfileConfig(rawProfiles) {
    const config = buildFallbackProfileConfig();

    if (!rawProfiles || typeof rawProfiles !== "object") {
        return config;
    }

    if (rawProfiles.default && typeof rawProfiles.default === "object") {
        config.defaultProfile = readCollisionTemplate(rawProfiles.default, config.defaultProfile);
    }

    const exact = Array.isArray(rawProfiles.exact) ? rawProfiles.exact : [];
    for (const item of exact) {
        const value = String(item?.value || "").toLowerCase();
        if (!value) {
            continue;
        }
        config.exact.set(value, readCollisionTemplate(item, config.defaultProfile));
    }

    const prefix = Array.isArray(rawProfiles.prefix) ? rawProfiles.prefix : [];
    if (Array.isArray(rawProfiles.prefix)) {
        config.prefix = prefix.length > 0
            ? prefix
                .map(item => {
                    const prefixValue = String(item?.value || "").toLowerCase();
                    if (!prefixValue) {
                        return null;
                    }
                    return {
                        prefix: prefixValue,
                        collider: readCollisionTemplate(item, config.defaultProfile)
                    };
                })
                .filter(Boolean)
            : [];
    }

    if (rawProfiles.exactOnly === true) {
        config.exactOnly = true;
        config.prefix = [];
    }

    return config;
}

// Returns { collider, source } where source is "exact" | "prefix" | "default".
// "prefix"/"default" are treated as fallbacks for debug visibility.
function resolveCollisionProfileWithSource(modelPath, profileConfig) {
    const normalized = String(modelPath || "").toLowerCase();
    if (!normalized) {
        return null;
    }

    const exact = profileConfig.exact.get(normalized);
    if (exact) {
        return { collider: exact, source: "exact" };
    }

    if (profileConfig.exactOnly) {
        return null;
    }

    for (const prefixProfile of profileConfig.prefix) {
        if (normalized.startsWith(prefixProfile.prefix)) {
            return { collider: prefixProfile.collider, source: "prefix" };
        }
    }

    return { collider: profileConfig.defaultProfile, source: "default" };
}

function readModelScale(scale) {
    if (typeof scale === "number" && Number.isFinite(scale) && scale > 0) {
        return { x: scale, y: scale, z: scale };
    }

    const sx = Number(scale?.x ?? 1);
    const sy = Number(scale?.y ?? 1);
    const sz = Number(scale?.z ?? 1);

    if (Number.isFinite(sx) && sx > 0 && Number.isFinite(sy) && sy > 0 && Number.isFinite(sz) && sz > 0) {
        return { x: sx, y: sy, z: sz };
    }

    return { x: 1, y: 1, z: 1 };
}

function readModelYawDeg(modelDef) {
    const yawDegValue = Number(modelDef?.rotationDegrees?.y);
    if (Number.isFinite(yawDegValue)) {
        return yawDegValue;
    }

    const yawRadValue = Number(modelDef?.rotation?.y);
    if (Number.isFinite(yawRadValue)) {
        return yawRadValue * (180 / Math.PI);
    }

    return 0;
}

function isWallLikeModelPath(modelPath) {
    const path = String(modelPath || "").toLowerCase();
        return path.includes("/wall-")
            || path.includes("/door-")
            || path.includes("/window-")
            || path.includes("/planks.obj");
    }

// Wall/door/window footprints come out of measurement as near-square tile bounding
// boxes, which would block the whole tile. We thin them down to a slab.
//
// Preferred (deterministic) scheme: profile carries `kind:"wall"`, `wallAxis:"x"|"z"`
// and a normalized `thickness`. wallAxis is the axis the wall PLANE runs along, so the
// OTHER axis becomes the thin one. Falls back to the legacy path-based heuristic when
// those fields are absent, so old profiles keep working. Must stay byte-for-byte
// identical to the server (GameRoom.tightenWallFootprint).
function tightenWallFootprint(halfWidth, halfDepth, modelPath, collider, scaleX, scaleZ) {
    const kind = collider ? String(collider.kind || "").toLowerCase() : "";
    if (kind === "wall") {
        const axis = String(collider.wallAxis || "").toLowerCase();
        const rawThickness = Number(collider.thickness);
        const hasThickness = Number.isFinite(rawThickness) && rawThickness > 0;
        if (axis === "x") {
            const thin = hasThickness ? rawThickness * scaleZ : Math.min(halfWidth, halfDepth);
            return { halfWidth, halfDepth: thin };
        }
        if (axis === "z") {
            const thin = hasThickness ? rawThickness * scaleX : Math.min(halfWidth, halfDepth);
            return { halfWidth: thin, halfDepth };
        }
        if (hasThickness) {
            if (halfWidth >= halfDepth) {
                return { halfWidth, halfDepth: rawThickness * scaleZ };
            }
            return { halfWidth: rawThickness * scaleX, halfDepth };
        }
    }

    const path = String(modelPath || "").toLowerCase();
    if (!isWallLikeModelPath(path)) {
        return { halfWidth, halfDepth };
    }

    let w = halfWidth;
    let d = halfDepth;
    const longSide = Math.max(w, d);
    const shortSide = Math.min(w, d);
    const aspect = shortSide / Math.max(longSide, 1e-6);

    if (path.includes("diagonal") || path.includes("slant")) {
        const shrink = path.includes("diagonal") ? 0.5 : 0.58;
        return { halfWidth: w * shrink, halfDepth: d * shrink };
    }

    if (path.includes("corner")) {
        return { halfWidth: w * 0.62, halfDepth: d * 0.62 };
    }

    if (aspect > 0.72) {
        const thinHalf = Math.max(3.5, Math.min(shortSide * 0.14, longSide * 0.065));
        if (w >= d) {
            w = longSide * 0.96;
            d = thinHalf;
        } else {
            w = thinHalf;
            d = longSide * 0.96;
        }
    } else {
        w *= 0.96;
        d *= 0.96;
    }

    return { halfWidth: w, halfDepth: d };
}

function toLocal(box, x, y) {
    const dx = x - box.centerX;
    const dy = y - box.centerY;
    return {
        x: dx * box.cosYaw + dy * box.sinYaw,
        y: -dx * box.sinYaw + dy * box.cosYaw
    };
}

function boxIntersectsCylinder(box, x, y, z, radius, height) {
    if (z >= box.topZ || z + height <= box.baseZ) {
        return false;
    }

    const local = toLocal(box, x, y);
    const closestX = clamp(local.x, -box.halfWidth, box.halfWidth);
    const closestY = clamp(local.y, -box.halfDepth, box.halfDepth);
    const dx = local.x - closestX;
    const dy = local.y - closestY;
    return dx * dx + dy * dy <= radius * radius;
}

function boxSupportsPoint(box, x, y) {
    const local = toLocal(box, x, y);
    return Math.abs(local.x) <= box.halfWidth && Math.abs(local.y) <= box.halfDepth;
}

function boxComputePushOut(box, x, y, radius, fromX, fromY) {
    const local = toLocal(box, x, y);
    const lx = local.x;
    const ly = local.y;
    let localPushX;
    let localPushY;

    if (Math.abs(lx) <= box.halfWidth && Math.abs(ly) <= box.halfDepth) {
        const fromLocal = toLocal(box, fromX, fromY);
        const fromDeltaX = fromLocal.x - lx;
        const fromDeltaY = fromLocal.y - ly;
        const spawnLikeOverlap = fromDeltaX * fromDeltaX + fromDeltaY * fromDeltaY < 1;

        if (spawnLikeOverlap) {
            const overlapX = box.halfWidth + radius - Math.abs(lx);
            const overlapY = box.halfDepth + radius - Math.abs(ly);
            if (overlapX <= overlapY) {
                localPushX = (lx >= 0 ? 1 : -1) * overlapX;
                localPushY = 0;
            } else {
                localPushX = 0;
                localPushY = (ly >= 0 ? 1 : -1) * overlapY;
            }
        } else {
        const fromDirX = fromLocal.x >= 0 ? 1 : -1;
        const fromDirY = fromLocal.y >= 0 ? 1 : -1;
        const exitX = fromDirX * (box.halfWidth + radius) - lx;
        const exitY = fromDirY * (box.halfDepth + radius) - ly;
        const fromOutsideX = Math.abs(fromLocal.x) > box.halfWidth;
        const fromOutsideY = Math.abs(fromLocal.y) > box.halfDepth;

        let useX;
        if (fromOutsideX && !fromOutsideY) {
            useX = true;
        } else if (!fromOutsideX && fromOutsideY) {
            useX = false;
        } else {
            useX = Math.abs(exitX) <= Math.abs(exitY);
        }

        if (useX) {
            localPushX = exitX;
            localPushY = 0;
        } else {
            localPushX = 0;
            localPushY = exitY;
        }
        }
    } else {
        const closestX = clamp(lx, -box.halfWidth, box.halfWidth);
        const closestY = clamp(ly, -box.halfDepth, box.halfDepth);
        const dx = lx - closestX;
        const dy = ly - closestY;
        const distSq = dx * dx + dy * dy;
        if (distSq >= radius * radius) {
            return null;
        }
        const dist = Math.sqrt(distSq);
        if (dist < 1e-6) {
            localPushX = (lx >= 0 ? 1 : -1) * radius;
            localPushY = 0;
        } else {
            const overlap = radius - dist;
            localPushX = (dx / dist) * overlap;
            localPushY = (dy / dist) * overlap;
        }
    }

    return {
        x: localPushX * box.cosYaw - localPushY * box.sinYaw,
        y: localPushX * box.sinYaw + localPushY * box.cosYaw
    };
}

// Validates a single profile box dimension. Flags NaN / negative / zero / absurd
// values, clamps them to a safe range and reports the box as suspect for debugging.
function sanitizeBoxDims(modelPath, halfWidth, halfDepth, height) {
    let suspect = false;
    let hw = Number(halfWidth);
    let hd = Number(halfDepth);
    let h = Number(height);

    if (!Number.isFinite(hw) || hw <= 0) {
        warnCollisionOnce(`${modelPath}:hw`, `${modelPath}: invalid halfWidth (${halfWidth}); clamped`);
        hw = COLLISION_MIN_DIM;
        suspect = true;
    }
    if (!Number.isFinite(hd) || hd <= 0) {
        warnCollisionOnce(`${modelPath}:hd`, `${modelPath}: invalid halfDepth (${halfDepth}); clamped`);
        hd = COLLISION_MIN_DIM;
        suspect = true;
    }
    if (!Number.isFinite(h) || h <= 0) {
        warnCollisionOnce(`${modelPath}:h`, `${modelPath}: invalid height (${height}); clamped`);
        h = COLLISION_MIN_DIM;
        suspect = true;
    }
    if (hw > COLLISION_MAX_HALF || hd > COLLISION_MAX_HALF || h > COLLISION_MAX_HEIGHT) {
        warnCollisionOnce(`${modelPath}:huge`, `${modelPath}: oversized box hw=${hw.toFixed(1)} hd=${hd.toFixed(1)} h=${h.toFixed(1)}; clamped`);
        hw = Math.min(hw, COLLISION_MAX_HALF);
        hd = Math.min(hd, COLLISION_MAX_HALF);
        h = Math.min(h, COLLISION_MAX_HEIGHT);
        suspect = true;
    }

    return { halfWidth: hw, halfDepth: hd, height: h, suspect };
}

// Builds world-space oriented collision boxes from a scene + collision profiles.
//
// World transform (identical to the Three.js renderer, which rotates each model with
// root.rotation.y = +toRadians(rotationDegrees.y) using Three's RotationY):
//   worldX = position.x + (offX*scaleX)*cos + (offDepth*scaleZ)*sin
//   centerY(=worldZ) = position.z - (offX*scaleX)*sin + (offDepth*scaleZ)*cos
//   baseZ(=vertical)  = position.y + elevationLift + (offUp*scaleY)
//
// Profile field convention (authored normalized at scale = 1):
//   offsetLocalX -> lateral (model local X)
//   offsetLocalY -> depth   (model local Z)
//   offsetLocalZ -> vertical (model local Y / up)   <-- vertical, NOT a planar axis
//
// elevationLift is stored in WORLD units (measured post-objScale) so it is NOT scaled.
// We store cosYaw=cos(yaw), sinYaw=-sin(yaw) so the existing toLocal()/computePushOut()
// inverse pair reproduces Three's RotationY without altering that math.
function buildSceneCollisionBoxes(sceneConfig, rawProfiles) {
    const profileConfig = parseProfileConfig(rawProfiles);
    const models = Array.isArray(sceneConfig?.models) ? sceneConfig.models : [];
    const boxes = [];

    for (const modelDef of models) {
        if (modelDef?.enabled === false || !modelDef?.path) {
            continue;
        }

        const modelPath = String(modelDef.path).toLowerCase();
        const resolved = resolveCollisionProfileWithSource(modelPath, profileConfig);
        if (!resolved) {
            continue;
        }
        const collider = resolved.collider;
        const isFallback = resolved.source !== "exact";
        if (isFallback) {
            warnCollisionOnce(`${modelPath}:fallback`, `${modelPath}: no exact profile, using ${resolved.source} fallback`);
        }

        const effectiveSolid = collider.solid;
        const modelScale = readModelScale(modelDef.scale);
        const centerX = Number(modelDef.position?.x ?? 0);
        const centerY = Number(modelDef.position?.z ?? 0);
        const modelElevation = Number(modelDef.position?.y ?? 0) + Number(collider.elevationLift ?? 0);
        const parts = Array.isArray(collider.boxes) && collider.boxes.length > 0
            ? collider.boxes
            : [collider];

        for (const part of parts) {
            const yawDeg = readModelYawDeg(modelDef) + Number(part.yawOffsetDeg ?? 0);
            const yawRad = yawDeg * DEG2RAD;
            let halfWidth = Number(part.halfWidth) * modelScale.x;
            let halfDepth = Number(part.halfDepth) * modelScale.z;
            if (collider.kind === "wall" || isWallLikeModelPath(modelPath)) {
                const tightened = tightenWallFootprint(halfWidth, halfDepth, modelPath, collider, modelScale.x, modelScale.z);
                halfWidth = tightened.halfWidth;
                halfDepth = tightened.halfDepth;
            }
            const height = Number(part.height) * modelScale.y;
            const sanitized = sanitizeBoxDims(modelPath, halfWidth, halfDepth, height);

            const cosYaw = Math.cos(yawRad);
            const sinYaw = -Math.sin(yawRad);
            const localOffsetX = Number(part.offsetLocalX ?? 0) * modelScale.x;
            const localOffsetDepth = Number(part.offsetLocalY ?? 0) * modelScale.z;
            const localOffsetUp = Number(part.offsetLocalZ ?? 0) * modelScale.y;
            const worldOffsetX = localOffsetX * cosYaw - localOffsetDepth * sinYaw;
            const worldOffsetY = localOffsetX * sinYaw + localOffsetDepth * cosYaw;
            const baseZ = Math.max(0, modelElevation + localOffsetUp);
            const topZ = Math.max(baseZ, baseZ + sanitized.height);

            boxes.push({
                centerX: centerX + worldOffsetX,
                centerY: centerY + worldOffsetY,
                halfWidth: sanitized.halfWidth,
                halfDepth: sanitized.halfDepth,
                cosYaw,
                sinYaw,
                baseZ,
                topZ,
                solid: effectiveSolid,
                walkable: collider.walkable,
                modelPath,
                isFallback,
                suspect: sanitized.suspect
            });
        }
    }

    return boxes;
}

async function fetchCollisionData() {
    try {
        const [sceneResponse, profileResponse] = await Promise.all([
            fetch("/world/scene.json", { cache: "no-store" }),
            fetch("/world/collision-profiles.json", { cache: "no-store" })
        ]);

        if (!sceneResponse.ok || !profileResponse.ok) {
            throw new Error("Failed to load scene collision data");
        }

        const sceneText = await sceneResponse.text();
        const profileText = await profileResponse.text();
        lastCollisionHashes = {
            scene: hashString(sceneText),
            profiles: hashString(profileText)
        };
        const sceneConfig = JSON.parse(sceneText);
        const profiles = JSON.parse(profileText);
        sceneCollisionBoxes = buildSceneCollisionBoxes(sceneConfig, profiles);
        collisionDataLoaded = true;
    } catch (error) {
        sceneCollisionBoxes = [];
        collisionDataLoaded = false;
        throw error;
    }
}

export function getCollisionHashes() {
    return { ...lastCollisionHashes, boxes: sceneCollisionBoxes.length };
}

export function isSceneCollisionReady() {
    return collisionDataLoaded;
}

export function getSceneCollisionBoxCount() {
    return sceneCollisionBoxes.length;
}

export function ensureSceneCollisionLoaded() {
    if (!collisionLoadPromise) {
        collisionLoadPromise = fetchCollisionData().catch(error => {
            collisionLoadPromise = null;
            console.warn("[collision] load failed", error);
        });
    }

    return collisionLoadPromise;
}

export async function reloadSceneCollision() {
    collisionLoadPromise = fetchCollisionData();
    await collisionLoadPromise;
    return sceneCollisionBoxes.length;
}

export function collidesWithObstacle(x, y, z, radius = PLAYER_RADIUS, height = PLAYER_COLLIDER_HEIGHT) {
    for (const box of sceneCollisionBoxes) {
        if (box.solid && boxIntersectsCylinder(box, x, y, z, radius, height)) {
            return true;
        }
    }

    return false;
}

export function findSupportTopAt(x, y, currentZ) {
    let top = 0;

    for (const box of sceneCollisionBoxes) {
        if (!box.walkable || !boxSupportsPoint(box, x, y)) {
            continue;
        }

        if (currentZ + PLAYER_GROUND_SNAP_EPSILON < box.topZ) {
            continue;
        }

        if (box.topZ > top) {
            top = box.topZ;
        }
    }

    return top;
}

function findWalkableStepTopAt(x, y, currentZ, maxStepHeight) {
    let best = currentZ;

    for (const box of sceneCollisionBoxes) {
        if (!box.walkable || !boxSupportsPoint(box, x, y)) {
            continue;
        }

        if (box.topZ <= currentZ + PLAYER_GROUND_SNAP_EPSILON) {
            continue;
        }

        if (box.topZ - currentZ > maxStepHeight) {
            continue;
        }

        if (box.topZ > best) {
            best = box.topZ;
        }
    }

    return best;
}

function applyWalkableRampStep(player) {
    const z = player.z || 0;
    const stepTop = findWalkableStepTopAt(player.x, player.y, z, PLAYER_STEP_UP_HEIGHT);

    if (stepTop > z + PLAYER_GROUND_SNAP_EPSILON
        && !collidesWithObstacle(player.x, player.y, stepTop)) {
        player.z = stepTop;
        player.velocityZ = 0;
    }
}

const PENETRATION_RESOLVE_PASSES = 4;
const MOVEMENT_COLLISION_STEP = 4;

export function movePlayerWithCollision(player, nextX, nextY) {
    if (player.noclipEnabled) {
        player.x = clamp(nextX, PLAYER_RADIUS, WORLD_WIDTH - PLAYER_RADIUS);
        player.y = clamp(nextY, PLAYER_RADIUS, WORLD_HEIGHT - PLAYER_RADIUS);
        return;
    }

    const startX = player.x;
    const startY = player.y;
    const deltaX = nextX - startX;
    const deltaY = nextY - startY;
    const travelDistance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    const steps = Math.max(1, Math.ceil(travelDistance / MOVEMENT_COLLISION_STEP));
    const playerZ = player.z || 0;

    for (let i = 1; i <= steps; i += 1) {
        const t = i / steps;
        const stepX = startX + deltaX * t;
        const stepY = startY + deltaY * t;
        const clampedX = clamp(stepX, PLAYER_RADIUS, WORLD_WIDTH - PLAYER_RADIUS);
        const clampedY = clamp(stepY, PLAYER_RADIUS, WORLD_HEIGHT - PLAYER_RADIUS);

        if (!collidesWithObstacle(clampedX, player.y, playerZ)) {
            player.x = clampedX;
        } else {
            const stepTopX = findSupportTopAt(clampedX, player.y, playerZ + PLAYER_STEP_UP_HEIGHT);
            if (stepTopX > playerZ
                && stepTopX - playerZ <= PLAYER_STEP_UP_HEIGHT
                && !collidesWithObstacle(clampedX, player.y, stepTopX)) {
                player.x = clampedX;
                player.z = stepTopX;
                player.velocityZ = 0;
            } else {
                player.velocityX = 0;
            }
        }

        if (!collidesWithObstacle(player.x, clampedY, player.z || 0)) {
            player.y = clampedY;
        } else {
            const stepTopY = findSupportTopAt(player.x, clampedY, (player.z || 0) + PLAYER_STEP_UP_HEIGHT);
            if (stepTopY > (player.z || 0)
                && stepTopY - (player.z || 0) <= PLAYER_STEP_UP_HEIGHT
                && !collidesWithObstacle(player.x, clampedY, stepTopY)) {
                player.y = clampedY;
                player.z = stepTopY;
                player.velocityZ = 0;
            } else {
                player.velocityY = 0;
            }
        }
    }

    resolvePlayerPenetration(player, startX, startY);
    applyWalkableRampStep(player);
}

export function resolvePlayerPenetration(player, fromX = player.x, fromY = player.y) {
    if (player.noclipEnabled) {
        return false;
    }

    let resolvedAny = false;

    for (let pass = 0; pass < PENETRATION_RESOLVE_PASSES; pass += 1) {
        let resolvedThisPass = false;
        const playerZ = player.z || 0;

        for (const box of sceneCollisionBoxes) {
            if (!box.solid) {
                continue;
            }
            if (playerZ >= box.topZ || playerZ + PLAYER_COLLIDER_HEIGHT <= box.baseZ) {
                continue;
            }

            const push = boxComputePushOut(box, player.x, player.y, PLAYER_RADIUS, fromX, fromY);
            if (!push) {
                continue;
            }

            player.x = clamp(player.x + push.x, PLAYER_RADIUS, WORLD_WIDTH - PLAYER_RADIUS);
            player.y = clamp(player.y + push.y, PLAYER_RADIUS, WORLD_HEIGHT - PLAYER_RADIUS);

            const pushLength = Math.sqrt(push.x * push.x + push.y * push.y);
            if (pushLength > 1e-6) {
                const nx = push.x / pushLength;
                const ny = push.y / pushLength;
                const velocityIntoBox = (player.velocityX || 0) * nx + (player.velocityY || 0) * ny;
                if (velocityIntoBox < 0) {
                    player.velocityX = (player.velocityX || 0) - velocityIntoBox * nx;
                    player.velocityY = (player.velocityY || 0) - velocityIntoBox * ny;
                }
            }

            resolvedThisPass = true;
            resolvedAny = true;
        }

        if (!resolvedThisPass) {
            break;
        }
    }

    return resolvedAny;
}

export function updatePlayerVerticalMovement(player, input, deltaSeconds) {
    if (player.flyEnabled || player.noclipEnabled) {
        let verticalIntent = 0;
        if (input.jump) {
            verticalIntent += 1;
        }
        if (input.descend) {
            verticalIntent -= 1;
        }

        player.velocityZ = verticalIntent * FLY_VERTICAL_SPEED;
        const nextZ = clamp((player.z || 0) + player.velocityZ * deltaSeconds, 0, 700);
        player.z = nextZ;
        return;
    }

    const z = player.z || 0;
    let velocityZ = player.velocityZ || 0;
    const supportTop = findSupportTopAt(player.x, player.y, z + PLAYER_GROUND_SNAP_EPSILON);
    const supportedByObject = supportTop > 0
        && z <= supportTop + PLAYER_GROUND_SNAP_EPSILON
        && velocityZ <= 0;

    if (supportedByObject) {
        player.z = supportTop;
        player.velocityZ = 0;
        velocityZ = 0;
    }

    let onGround = z <= 0.001 || supportedByObject;

    if (input.jump && onGround) {
        velocityZ = PLAYER_JUMP_VELOCITY;
        player.velocityX = (player.velocityX || 0) * PLAYER_BUNNYHOP_SPEED_BOOST;
        player.velocityY = (player.velocityY || 0) * PLAYER_BUNNYHOP_SPEED_BOOST;
        onGround = false;
    }

    if (!onGround) {
        velocityZ -= PLAYER_GRAVITY * deltaSeconds;
        const nextZ = (player.z || 0) + velocityZ * deltaSeconds;
        player.z = Math.max(0, nextZ);
        player.velocityZ = player.z <= 0 ? 0 : velocityZ;

        if (player.z <= 0) {
            player.z = 0;
            player.velocityZ = 0;
        }
    }

    const postMoveSupportTop = findSupportTopAt(player.x, player.y, (player.z || 0) + PLAYER_GROUND_SNAP_EPSILON);
    if ((player.velocityZ || 0) <= 0
        && postMoveSupportTop > 0
        && (player.z || 0) <= postMoveSupportTop + PLAYER_GROUND_SNAP_EPSILON) {
        player.z = postMoveSupportTop;
        player.velocityZ = 0;
    }
}
