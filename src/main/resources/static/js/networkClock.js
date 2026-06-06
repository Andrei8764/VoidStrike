import { state } from "./state.js";
import {
    BULLET_INTERPOLATION_DELAY_MS,
    REMOTE_INTERPOLATION_DELAY_MS,
    SERVER_TICK_INTERVAL_MS
} from "./config.js";

const CLOCK_SMOOTHING = 0.12;
const LATENCY_SMOOTHING = 0.15;

export function resetNetworkClock() {
    state.lastServerTime = null;
    state.lastSnapshotReceivedAt = 0;
    state.clockOffsetMs = 0;
    state.networkLatencyMs = 0;
    state.serverTickIntervalMs = SERVER_TICK_INTERVAL_MS;
}

export function configureServerTickRate(tickRate) {
    if (!Number.isFinite(tickRate) || tickRate <= 0) {
        return;
    }

    state.serverTickIntervalMs = 1000 / tickRate;
}

export function updateNetworkClock(serverTime) {
    const receivedAt = performance.now();

    if (state.lastServerTime !== null) {
        const serverDelta = serverTime - state.lastServerTime;
        const localDelta = receivedAt - state.lastSnapshotReceivedAt;
        const latencySample = Math.max(0, localDelta - serverDelta);
        state.networkLatencyMs += (latencySample - state.networkLatencyMs) * LATENCY_SMOOTHING;
    }

    const targetOffset = serverTime - receivedAt;
    state.clockOffsetMs += (targetOffset - state.clockOffsetMs) * CLOCK_SMOOTHING;
    state.lastServerTime = serverTime;
    state.lastSnapshotReceivedAt = receivedAt;
}

export function getEstimatedServerTime() {
    if (state.lastServerTime === null) {
        return performance.now();
    }

    return performance.now() + state.clockOffsetMs;
}

export function getRemoteRenderTime() {
    const latencyPadding = Math.min(80, state.networkLatencyMs * 0.5);
    return getEstimatedServerTime() - REMOTE_INTERPOLATION_DELAY_MS - latencyPadding;
}

export function getBulletRenderTime() {
    const latencyPadding = Math.min(50, state.networkLatencyMs * 0.35);
    return getEstimatedServerTime() - BULLET_INTERPOLATION_DELAY_MS - latencyPadding;
}
