import { connectWebSocket } from "./websocket.js";
import { registerInputHandlers } from "./input.js";
import { updateBulletInterpolation, updateRemoteInterpolation } from "./interpolation.js";
import {
    render,
    resizeCanvas,
    updateAimAngle,
    updateCamera,
    updateMouseWorldPosition
} from "./renderer.js";
import { keys, state } from "./state.js";

resizeCanvas();
registerInputHandlers();
connectWebSocket();
requestAnimationFrame(gameLoop);

window.addEventListener("resize", resizeCanvas);

function gameLoop() {
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