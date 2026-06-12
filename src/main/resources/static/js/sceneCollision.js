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
        boxes
    };
}

function buildFallbackProfileConfig() {
    const defaultProfile = createDefaultProfile();
    return {
        defaultProfile,
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
    if (prefix.length > 0) {
        config.prefix = prefix
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
            .filter(Boolean);
    }

    return config;
}

function resolveCollisionProfile(modelPath, profileConfig) {
    const normalized = String(modelPath || "").toLowerCase();
    if (!normalized) {
        return null;
    }

    const exact = profileConfig.exact.get(normalized);
    if (exact) {
        return exact;
    }

    for (const prefixProfile of profileConfig.prefix) {
        if (normalized.startsWith(prefixProfile.prefix)) {
            return prefixProfile.collider;
        }
    }

    return profileConfig.defaultProfile;
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

function buildSceneCollisionBoxes(sceneConfig, rawProfiles) {
    const profileConfig = parseProfileConfig(rawProfiles);
    const models = Array.isArray(sceneConfig?.models) ? sceneConfig.models : [];
    const boxes = [];

    for (const modelDef of models) {
        if (modelDef?.enabled === false || !modelDef?.path) {
            continue;
        }

        const modelPath = String(modelDef.path).toLowerCase();
        const collider = resolveCollisionProfile(modelPath, profileConfig);
        if (!collider) {
            continue;
        }

        const effectiveSolid = collider.solid;
        const modelScale = readModelScale(modelDef.scale);
        const centerX = Number(modelDef.position?.x ?? 0);
        const centerY = Number(modelDef.position?.z ?? 0);
        const parts = Array.isArray(collider.boxes) && collider.boxes.length > 0
            ? collider.boxes
            : [collider];

        for (const part of parts) {
            const yawDeg = readModelYawDeg(modelDef) + Number(part.yawOffsetDeg ?? 0);
            const yawRad = (yawDeg * Math.PI) / 180;
            const halfWidth = Number(part.halfWidth) * modelScale.x;
            const halfDepth = Number(part.halfDepth) * modelScale.z;
            const height = Number(part.height) * modelScale.y;
            const cosYaw = Math.cos(yawRad);
            const sinYaw = Math.sin(yawRad);
            const localOffsetX = Number(part.offsetLocalX ?? 0) * modelScale.x;
            const localOffsetY = Number(part.offsetLocalY ?? 0) * modelScale.z;
            const localOffsetZ = Number(part.offsetLocalZ ?? 0) * modelScale.y;
            const worldOffsetX = localOffsetX * cosYaw - localOffsetY * sinYaw;
            const worldOffsetY = localOffsetX * sinYaw + localOffsetY * cosYaw;
            const baseZ = Math.max(0, localOffsetZ);
            const topZ = Math.max(baseZ, baseZ + height);

            boxes.push({
                centerX: centerX + worldOffsetX,
                centerY: centerY + worldOffsetY,
                halfWidth,
                halfDepth,
                cosYaw,
                sinYaw,
                baseZ,
                topZ,
                solid: effectiveSolid,
                walkable: collider.walkable
            });
        }
    }

    return boxes;
}

async function fetchCollisionData() {
    const [sceneResponse, profileResponse] = await Promise.all([
        fetch("/world/scene.json", { cache: "no-store" }),
        fetch("/world/collision-profiles.json", { cache: "no-store" })
    ]);

    if (!sceneResponse.ok || !profileResponse.ok) {
        throw new Error("Failed to load scene collision data");
    }

    const sceneConfig = await sceneResponse.json();
    const profiles = await profileResponse.json();
    sceneCollisionBoxes = buildSceneCollisionBoxes(sceneConfig, profiles);
}

export function isSceneCollisionReady() {
    return sceneCollisionBoxes.length > 0;
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

const PENETRATION_RESOLVE_PASSES = 4;
const MOVEMENT_COLLISION_STEP = 4;

export function movePlayerWithCollision(player, nextX, nextY) {
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
}

export function resolvePlayerPenetration(player, fromX = player.x, fromY = player.y) {
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
    if (player.flyEnabled) {
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
