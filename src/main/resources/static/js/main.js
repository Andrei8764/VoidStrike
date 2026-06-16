import { connectWebSocket } from "./websocket.js";
import { registerInputHandlers } from "./input.js";
import { initCharacterPreview } from "./characterPreview.js";
import { updateBulletInterpolation, updateRemoteInterpolation } from "./interpolation.js";
import { fpsBadgeElement, perfHudElement } from "./dom.js";
import {
    getRendererPerfStats,
    render,
    resizeCanvas,
    updateAimAngle,
    updateCamera,
    updateMouseWorldPosition
} from "./renderer3d.js";
import { keys, state } from "./state.js";
import { tickLocalPrediction } from "./prediction.js";
import { ensureSceneCollisionLoaded } from "./sceneCollision.js";
import { updateMinimap } from "./minimap.js";

let fpsFrameCount = 0;
let lastFrameTime = performance.now();
let fpsLastTime = performance.now();
let fpsCurrent = 0;
let frameTimeSum = 0;
let frameTimeSamples = 0;
let lastPerfHudUpdate = 0;

if (new URLSearchParams(window.location.search).get("moveDebug") === "1") {
    state.movementDebug = true;
}

resizeCanvas();
registerInputHandlers();
initCharacterPreview();
ensureSceneCollisionLoaded();
connectWebSocket();
requestAnimationFrame(gameLoop);

window.addEventListener("resize", resizeCanvas);

function gameLoop() {
    const frameStart = performance.now();
    const deltaSeconds = Math.min((frameStart - lastFrameTime) / 1000, 0.05);
    lastFrameTime = frameStart;
    const now = frameStart;

    updateAimAngle();
    tickLocalPrediction(deltaSeconds);
    fpsFrameCount += 1;
    const elapsed = now - fpsLastTime;
    if (elapsed >= 500) {
        fpsCurrent = Math.round((fpsFrameCount * 1000) / elapsed);
        fpsFrameCount = 0;
        fpsLastTime = now;
        if (state.showFps && fpsBadgeElement) {
            fpsBadgeElement.textContent = `FPS: ${fpsCurrent}`;
        }
    }

    updateRemoteInterpolation();
    updateBulletInterpolation();
    updateMinimap();
    updateCamera();
    updateMouseWorldPosition();

    if (keys.up || keys.down || keys.left || keys.right) {
        state.bobTime += 0.12;
    } else {
        state.bobTime *= 0.9;
    }

    state.recoilKick *= 0.88;

    render();
    const frameEnd = performance.now();
    frameTimeSum += (frameEnd - frameStart);
    frameTimeSamples += 1;

    if (state.perfHudVisible && perfHudElement && now - lastPerfHudUpdate >= 350) {
        const stats = getRendererPerfStats();
        const avgFrame = frameTimeSamples > 0 ? frameTimeSum / frameTimeSamples : 0;
        const meshCount = state.editorMode ? "-" : String(state.players.length);
        perfHudElement.textContent =
`FPS         ${fpsCurrent}
Frame ms    ${avgFrame.toFixed(2)}
DPR         ${stats.dpr.toFixed(2)}
Scale       ${(state.renderScale || 1).toFixed(2)}
Draw calls  ${stats.calls}
Triangles   ${stats.triangles}
Geometries  ${stats.geometries}
Textures    ${stats.textures}
Players     ${meshCount}
Perf mode   ${state.performanceMode ? "ON" : "OFF"}`;
        frameTimeSum = 0;
        frameTimeSamples = 0;
        lastPerfHudUpdate = now;
    }

    requestAnimationFrame(gameLoop);
}
