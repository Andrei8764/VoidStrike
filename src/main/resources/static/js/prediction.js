import {
    CLIENT_DELTA_SECONDS,
    PLAYER_ACCELERATION,
    PLAYER_AIR_ACCELERATION_MULTIPLIER,
    PLAYER_FRICTION,
    PLAYER_MAX_SPEED,
    PLAYER_SPRINT_ACCELERATION_MULTIPLIER,
    PLAYER_SPRINT_SPEED_MULTIPLIER,
    PLAYER_STOP_SPEED,
    PREDICTION_ERROR_THRESHOLD
} from "./config.js";
import { keys, mouse, state } from "./state.js";
import {
    movePlayerWithCollision,
    resolvePlayerPenetration,
    updatePlayerVerticalMovement
} from "./sceneCollision.js";
import { clamp } from "./utils.js";

function syncPredictedSelfToPlayersArray() {
    const selfIndex = state.players.findIndex(player => player.id === state.playerId);

    if (selfIndex < 0 || !state.predictedSelf) {
        return;
    }

    state.players[selfIndex] = {
        ...state.players[selfIndex],
        x: state.predictedSelf.x,
        y: state.predictedSelf.y,
        z: state.predictedSelf.z,
        velocityX: state.predictedSelf.velocityX,
        velocityY: state.predictedSelf.velocityY,
        velocityZ: state.predictedSelf.velocityZ,
        angle: state.predictedSelf.angle,
        pitch: state.predictedSelf.pitch,
        crouching: state.predictedSelf.crouching
    };
}

export function buildCurrentInput(sequence = null) {
    return {
        type: "input",
        sequence: sequence ?? state.inputSequence + 1,
        up: keys.up,
        down: keys.down,
        left: keys.left,
        right: keys.right,
        sprint: keys.sprint,
        crouch: keys.crouch,
        jump: keys.jump,
        descend: keys.descend,
        shoot: mouse.down,
        ads: state.ads,
        reload: state.reloadRequested,
        climb: state.climbRequested,
        weaponSlot: state.selectedWeaponSlot,
        buyWeaponSlot: state.buyWeaponSlot,
        angle: mouse.angle,
        pitch: mouse.pitch
    };
}

export function tickLocalPrediction(deltaSeconds) {
    if (!state.joined || !state.playerId) {
        return;
    }

    if (!state.predictedSelf) {
        const serverSelf = state.players.find(player => player.id === state.playerId);

        if (!serverSelf) {
            return;
        }

        state.predictedSelf = {
            ...serverSelf
        };
    }

    const input = buildCurrentInput();
    state.predictedSelf.angle = input.angle;
    state.predictedSelf.pitch = input.pitch;
    simulatePredictedMovement(state.predictedSelf, input, deltaSeconds);
    syncPredictedSelfToPlayersArray();
}

export function reconcileLocalPlayer() {
    const serverSelf = state.players.find(player => player.id === state.playerId);

    if (!serverSelf) {
        state.predictedSelf = null;
        state.pendingInputs = [];
        return;
    }

    if (!state.predictedSelf) {
        state.predictedSelf = {
            ...serverSelf
        };
        return;
    }

    state.pendingInputs = state.pendingInputs.filter(
        input => input.sequence > serverSelf.lastProcessedInputSequence
    );

    const errorX = serverSelf.x - state.predictedSelf.x;
    const errorY = serverSelf.y - state.predictedSelf.y;
    const errorZ = (serverSelf.z || 0) - (state.predictedSelf.z || 0);
    const errorDistance = Math.sqrt(errorX * errorX + errorY * errorY);
    const now = Date.now();
    const climbDebugActive = now <= (state.climbDebugUntil || 0);

    if (climbDebugActive) {
        console.log("[CLIMB_DEBUG] before_reconcile", {
            sequence: state.climbDebugLastSequence,
            predicted: {
                x: state.predictedSelf.x,
                y: state.predictedSelf.y,
                z: state.predictedSelf.z
            },
            server: {
                x: serverSelf.x,
                y: serverSelf.y,
                z: serverSelf.z
            },
            errorDistance
        });
    }

    state.predictedSelf = {
        ...serverSelf
    };

    for (const input of state.pendingInputs) {
        simulatePredictedMovement(state.predictedSelf, input, CLIENT_DELTA_SECONDS);
    }

    if (errorDistance > PREDICTION_ERROR_THRESHOLD) {
        const correctionStrength = clamp(errorDistance / 50, 0.12, 0.4);
        state.predictedSelf.x += errorX * correctionStrength;
        state.predictedSelf.y += errorY * correctionStrength;

        if (climbDebugActive) {
            console.log("[CLIMB_DEBUG] correction_applied", {
                sequence: state.climbDebugLastSequence,
                corrected: {
                    x: state.predictedSelf.x,
                    y: state.predictedSelf.y,
                    z: state.predictedSelf.z
                },
                threshold: PREDICTION_ERROR_THRESHOLD
            });
        }
    } else if (climbDebugActive) {
        console.log("[CLIMB_DEBUG] no_correction", {
            sequence: state.climbDebugLastSequence,
            threshold: PREDICTION_ERROR_THRESHOLD
        });
    }

    if (errorDistance > PREDICTION_ERROR_THRESHOLD * 1.5 && !state.predictedSelf.noclipEnabled) {
        resolvePlayerPenetration(state.predictedSelf, serverSelf.x, serverSelf.y);
    }

    if (Math.abs(errorZ) > 0.35) {
        state.predictedSelf.z = (state.predictedSelf.z || 0) + errorZ * 0.28;
    }

    syncPredictedSelfToPlayersArray();
}

export function predictLocalPlayer(input, deltaSeconds) {
    if (!state.predictedSelf) {
        const serverSelf = state.players.find(player => player.id === state.playerId);

        if (!serverSelf) {
            return;
        }

        state.predictedSelf = {
            ...serverSelf
        };
    }

    state.predictedSelf.angle = input.angle;
    state.predictedSelf.pitch = input.pitch;
    simulatePredictedMovement(state.predictedSelf, input, deltaSeconds);
    syncPredictedSelfToPlayersArray();
}

function simulatePredictedMovement(player, input, deltaSeconds) {
    const fromX = player.x;
    const fromY = player.y;
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
        const sprinting = input.sprint && forward > 0;
        const crouching = Boolean(input.crouch);
        const airborne = (player.z || 0) > 0.001 && !player.flyEnabled && !player.noclipEnabled;
        let maxSpeed = sprinting
            ? PLAYER_MAX_SPEED * PLAYER_SPRINT_SPEED_MULTIPLIER
            : PLAYER_MAX_SPEED;
        let acceleration = sprinting
            ? PLAYER_ACCELERATION * PLAYER_SPRINT_ACCELERATION_MULTIPLIER
            : PLAYER_ACCELERATION;
        if (crouching) {
            maxSpeed *= 0.52;
            acceleration *= 0.62;
        }
        const finalAcceleration = airborne
            ? acceleration * PLAYER_AIR_ACCELERATION_MULTIPLIER
            : acceleration;

        acceleratePredictedPlayer(
            player,
            wishDirectionX,
            wishDirectionY,
            maxSpeed,
            finalAcceleration,
            deltaSeconds
        );
    }

    const nextX = player.x + player.velocityX * deltaSeconds;
    const nextY = player.y + player.velocityY * deltaSeconds;

    movePlayerWithCollision(player, nextX, nextY);
    updatePlayerVerticalMovement(player, input, deltaSeconds);
    resolvePlayerPenetration(player, fromX, fromY);
    player.crouching = Boolean(input.crouch);
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

