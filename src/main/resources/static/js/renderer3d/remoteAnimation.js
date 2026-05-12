export function normalizeAngle(angle) {
    let normalized = angle;
    while (normalized <= -Math.PI) {
        normalized += Math.PI * 2;
    }
    while (normalized > Math.PI) {
        normalized -= Math.PI * 2;
    }
    return normalized;
}

export function lerpAngle(from, to, t) {
    const delta = normalizeAngle(to - from);
    return normalizeAngle(from + delta * t);
}

export function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
