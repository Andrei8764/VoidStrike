import { connectWebSocket } from "./websocket.js";
import { registerInputHandlers } from "./input.js";
import { initCharacterPreview } from "./characterPreview.js";
import { updateBulletInterpolation, updateRemoteInterpolation } from "./interpolation.js";
import { fpsBadgeElement } from "./dom.js";
import {
    render,
    resizeCanvas,
    updateAimAngle,
    updateCamera,
    updateMouseWorldPosition
} from "./renderer3d.js";
import { keys, state } from "./state.js";

let fpsFrameCount = 0;
let fpsLastTime = performance.now();
let fpsCurrent = 0;

resizeCanvas();
registerInputHandlers();
initCharacterPreview();
connectWebSocket();
requestAnimationFrame(gameLoop);

window.addEventListener("resize", resizeCanvas);

function gameLoop() {
    const now = performance.now();
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
    updateCamera();
    updateMouseWorldPosition();
    updateAimAngle();

    if (keys.up || keys.down || keys.left || keys.right) {
        state.bobTime += 0.12;
    } else {
        state.bobTime *= 0.9;
    }

    state.recoilKick *= 0.88;

    render();

    requestAnimationFrame(gameLoop);
}
