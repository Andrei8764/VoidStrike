export function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

export function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;

    return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

export function escapeHtml(value) {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll("\"", "&quot;")
        .replaceAll("'", "&#039;");
}

export function getDistance(ax, ay, bx, by) {
    const dx = ax - bx;
    const dy = ay - by;

    return Math.sqrt(dx * dx + dy * dy);
}

export function lerp(from, to, progress) {
    return from + (to - from) * progress;
}

export function normalizeAngle(angle) {
    while (angle <= -Math.PI) {
        angle += Math.PI * 2;
    }

    while (angle > Math.PI) {
        angle -= Math.PI * 2;
    }

    return angle;
}

export function lerpAngle(from, to, progress) {
    const difference = normalizeAngle(to - from);

    return normalizeAngle(from + difference * progress);
}