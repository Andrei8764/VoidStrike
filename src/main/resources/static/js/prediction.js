import {
    CLIENT_DELTA_SECONDS,
    PLAYER_ACCELERATION,
    PLAYER_AIR_ACCELERATION_MULTIPLIER,
    PLAYER_FRICTION,
    PLAYER_MAX_SPEED,
    PLAYER_SPRINT_ACCELERATION_MULTIPLIER,
    PLAYER_SPRINT_SPEED_MULTIPLIER,
    PLAYER_STOP_SPEED,
    PREDICTION_ERROR_THRESHOLD,
    PREDICTION_HARD_SNAP_THRESHOLD,
    SERVER_DELTA_SECONDS,
    SERVER_TICK_INTERVAL_MS
} from "./config.js";
import { keys, mouse, state } from "./state.js";
import {
    movePlayerWithCollision,
    resolvePlayerPenetration,
    updatePlayerVerticalMovement
} from "./sceneCollision.js";

const MAX_PREDICTION_STEPS_PER_FRAME = 5;
let predictionAccumulator = 0;

function getPredictionDeltaSeconds() {
    return CLIENT_DELTA_SECONDS;
}

function logMovementDebug(label, data) {
    if (!state.movementDebug) {
        return;
    }

    console.log(`[MOVE_DEBUG] ${label}`, data);
}

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

    predictionAccumulator += deltaSeconds;
    const predictionDt = getPredictionDeltaSeconds();
    let steps = 0;

    while (predictionAccumulator >= predictionDt && steps < MAX_PREDICTION_STEPS_PER_FRAME) {
        const input = buildCurrentInput();
        state.predictedSelf.angle = input.angle;
        state.predictedSelf.pitch = input.pitch;
        simulatePredictedMovement(state.predictedSelf, input, predictionDt);
        predictionAccumulator -= predictionDt;
        steps += 1;
    }

    state.predictionRemainder = predictionAccumulator;
    syncPredictedSelfToPlayersArray();
}

export function reconcileLocalPlayer() {
    const serverSelf = state.players.find(player => player.id === state.playerId);

    if (!serverSelf) {
        state.predictedSelf = null;
        state.pendingInputs = [];
        predictionAccumulator = 0;
        state.predictionRemainder = 0;
        return;
    }

    if (!state.predictedSelf) {
        state.predictedSelf = {
            ...serverSelf
        };
        predictionAccumulator = 0;
        state.predictionRemainder = 0;
        return;
    }

    state.pendingInputs = state.pendingInputs.filter(
        input => input.sequence > serverSelf.lastProcessedInputSequence
    );

    const errorX = serverSelf.x - state.predictedSelf.x;
    const errorY = serverSelf.y - state.predictedSelf.y;
    const errorZ = (serverSelf.z || 0) - (state.predictedSelf.z || 0);
    const preSnapErrorDistance = Math.sqrt(errorX * errorX + errorY * errorY);

    if (state.movementDebug
        && (preSnapErrorDistance > PREDICTION_ERROR_THRESHOLD || preSnapErrorDistance > 15)) {
        logMovementDebug("before_reconcile", {
            preSnapErrorDistance,
            errorX,
            errorY,
            errorZ,
            pendingInputs: state.pendingInputs.length,
            lastProcessedInputSequence: serverSelf.lastProcessedInputSequence,
            predicted: {
                x: state.predictedSelf.x,
                y: state.predictedSelf.y,
                z: state.predictedSelf.z
            },
            server: {
                x: serverSelf.x,
                y: serverSelf.y,
                z: serverSelf.z
            }
        });
    }

    state.predictedSelf = {
        ...serverSelf
    };
    predictionAccumulator = 0;
    state.predictionRemainder = 0;

    const serverDt = (state.serverTickIntervalMs || SERVER_TICK_INTERVAL_MS) / 1000 || SERVER_DELTA_SECONDS;
    const pendingCount = state.pendingInputs.length;

    if (pendingCount > 0 && preSnapErrorDistance <= PREDICTION_HARD_SNAP_THRESHOLD) {
        const forwardInput = state.pendingInputs.at(-1);
        simulatePredictedMovement(state.predictedSelf, forwardInput, serverDt);
    } else if (preSnapErrorDistance > PREDICTION_HARD_SNAP_THRESHOLD) {
        logMovementDebug("hard_snap_skip_replay", {
            preSnapErrorDistance,
            threshold: PREDICTION_HARD_SNAP_THRESHOLD
        });
    }

    if (state.movementDebug) {
        const residualX = serverSelf.x - state.predictedSelf.x;
        const residualY = serverSelf.y - state.predictedSelf.y;
        const residualDistance = Math.sqrt(residualX * residualX + residualY * residualY);

        if (preSnapErrorDistance > PREDICTION_ERROR_THRESHOLD || preSnapErrorDistance > 15) {
            logMovementDebug("after_reconcile", {
                preSnapErrorDistance,
                residualDistance,
                final: {
                    x: state.predictedSelf.x,
                    y: state.predictedSelf.y,
                    z: state.predictedSelf.z
                }
            });
        }
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
