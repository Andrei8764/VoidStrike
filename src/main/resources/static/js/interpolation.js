import {
    BULLET_FADE_MS,
    BULLET_INTERPOLATION_DELAY_MS,
    BULLET_MAX_EXTRAPOLATION_MS,
    PLAYER_RADIUS,
    REMOTE_INTERPOLATION_DELAY_MS,
    REMOTE_SNAP_DISTANCE,
    WORLD_HEIGHT,
    WORLD_WIDTH
} from "./config.js";
import { state } from "./state.js";
import { clamp, getDistance, lerp, lerpAngle } from "./utils.js";

export function addRemoteInterpolationSnapshot(snapshotPlayers) {
    const receivedAt = performance.now();
    const remoteIdsInSnapshot = new Set();

    for (const player of snapshotPlayers) {
        if (player.id === state.playerId) {
            continue;
        }

        remoteIdsInSnapshot.add(player.id);

        if (!state.remotePlayerStates.has(player.id)) {
            state.remotePlayerStates.set(player.id, []);
        }

        const buffer = state.remotePlayerStates.get(player.id);

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

    for (const playerIdInMap of state.remotePlayerStates.keys()) {
        if (!remoteIdsInSnapshot.has(playerIdInMap)) {
            state.remotePlayerStates.delete(playerIdInMap);
            state.interpolatedRemotePlayers.delete(playerIdInMap);
        }
    }
}

export function updateRemoteInterpolation() {
    const renderTime = performance.now() - REMOTE_INTERPOLATION_DELAY_MS;

    for (const [remotePlayerId, buffer] of state.remotePlayerStates.entries()) {
        if (buffer.length === 0) {
            continue;
        }

        if (buffer.length === 1) {
            state.interpolatedRemotePlayers.set(remotePlayerId, {
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
            state.interpolatedRemotePlayers.set(remotePlayerId, extrapolated);
            continue;
        }

        const duration = newer.timestamp - older.timestamp;
        const progress = duration <= 0 ? 1 : clamp((renderTime - older.timestamp) / duration, 0, 1);
        const distance = getDistance(older.player.x, older.player.y, newer.player.x, newer.player.y);

        if (distance > REMOTE_SNAP_DISTANCE) {
            state.interpolatedRemotePlayers.set(remotePlayerId, {
                ...newer.player
            });
            continue;
        }

        state.interpolatedRemotePlayers.set(remotePlayerId, {
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

export function addBulletInterpolationSnapshot(snapshotBullets) {
    const receivedAt = performance.now();
    const bulletIdsInSnapshot = new Set();

    for (const bullet of snapshotBullets) {
        bulletIdsInSnapshot.add(bullet.id);

        if (!state.bulletStates.has(bullet.id)) {
            state.bulletStates.set(bullet.id, []);
        }

        const buffer = state.bulletStates.get(bullet.id);

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

    for (const [bulletId, buffer] of state.bulletStates.entries()) {
        if (!bulletIdsInSnapshot.has(bulletId)) {
            const last = buffer[buffer.length - 1];

            if (last) {
                state.fadingBulletTrails.push({
                    ...last.bullet,
                    createdAt: receivedAt,
                    alpha: 1
                });
            }

            state.bulletStates.delete(bulletId);
            state.interpolatedBullets.delete(bulletId);
        }
    }
}

export function updateBulletInterpolation() {
    const now = performance.now();
    const renderTime = now - BULLET_INTERPOLATION_DELAY_MS;

    for (const [bulletId, buffer] of state.bulletStates.entries()) {
        if (buffer.length === 0) {
            continue;
        }

        if (buffer.length === 1) {
            const extrapolated = extrapolateBullet(buffer[0].bullet, renderTime - buffer[0].timestamp);
            state.interpolatedBullets.set(bulletId, extrapolated);
            continue;
        }

        while (buffer.length >= 2 && buffer[1].timestamp <= renderTime) {
            buffer.shift();
        }

        const older = buffer[0];
        const newer = buffer[1];

        if (!newer) {
            const extrapolated = extrapolateBullet(older.bullet, renderTime - older.timestamp);
            state.interpolatedBullets.set(bulletId, extrapolated);
            continue;
        }

        const duration = newer.timestamp - older.timestamp;
        const progress = duration <= 0 ? 1 : clamp((renderTime - older.timestamp) / duration, 0, 1);

        state.interpolatedBullets.set(bulletId, {
            ...newer.bullet,
            x: lerp(older.bullet.x, newer.bullet.x, progress),
            y: lerp(older.bullet.y, newer.bullet.y, progress),
            velocityX: lerp(older.bullet.velocityX || 0, newer.bullet.velocityX || 0, progress),
            velocityY: lerp(older.bullet.velocityY || 0, newer.bullet.velocityY || 0, progress),
            alpha: 1
        });
    }

    state.fadingBulletTrails = state.fadingBulletTrails
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