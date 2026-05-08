import {
    canvas,
    joinButton,
    nameError,
    nameInput,
    scoreboardElement
} from "./dom.js";
import { keys, mouse, state } from "./state.js";
import { resumeAudio } from "./audio.js";
import { joinGame } from "./websocket.js";
import { updateMouseWorldPosition } from "./renderer.js";
import { MOUSE_SENSITIVITY } from "./config.js";
import { clamp, normalizeAngle } from "./utils.js";

export function registerInputHandlers() {
    joinButton.addEventListener("click", joinGame);

    nameInput.addEventListener("keydown", event => {
        if (event.code === "Enter") {
            joinGame();
        }
    });

    nameInput.addEventListener("input", () => {
        nameError.textContent = "";
    });

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    canvas.addEventListener("keyup", handleKeyUp);

    canvas.addEventListener("mousemove", event => {
        const rect = canvas.getBoundingClientRect();

        mouse.x = event.clientX - rect.left;
        mouse.y = event.clientY - rect.top;

        if (document.pointerLockElement === canvas) {
            state.viewAngle = normalizeAngle(state.viewAngle + event.movementX * MOUSE_SENSITIVITY);
            state.viewPitch = clamp(state.viewPitch - event.movementY * MOUSE_SENSITIVITY, -0.55, 0.55);
        }

        updateMouseWorldPosition();
    });

    canvas.addEventListener("mousedown", event => {
        if (event.button === 0) {
            resumeAudio();
            canvas.requestPointerLock();
            mouse.down = true;
        }

        if (event.button === 2) {
            resumeAudio();
            canvas.requestPointerLock();
            state.ads = true;
        }
    });

    canvas.addEventListener("mouseup", event => {
        if (event.button === 0) {
            mouse.down = false;
        }

        if (event.button === 2) {
            state.ads = false;
        }
    });

    canvas.addEventListener("contextmenu", event => {
        event.preventDefault();
    });
}

function handleKeyDown(event) {
    switch (event.code) {
        case "KeyW":
        case "ArrowUp":
            keys.up = true;
            break;
        case "KeyS":
        case "ArrowDown":
            keys.down = true;
            break;
        case "KeyA":
        case "ArrowLeft":
            keys.left = true;
            break;
        case "KeyD":
        case "ArrowRight":
            keys.right = true;
            break;
        case "KeyR":
            state.reloadRequested = true;
            break;
        case "Digit1":
        case "Numpad1":
            state.selectedWeaponSlot = 1;
            break;
        case "Digit2":
        case "Numpad2":
            state.selectedWeaponSlot = 2;
            break;
        case "Digit3":
        case "Numpad3":
            state.selectedWeaponSlot = 3;
            break;
        case "Digit4":
        case "Numpad4":
            state.selectedWeaponSlot = 4;
            break;
        case "Digit5":
        case "Numpad5":
            state.selectedWeaponSlot = 5;
            break;
        case "Tab":
            event.preventDefault();
            state.scoreboardVisible = true;
            scoreboardElement.classList.remove("hidden");
            break;
    }
}

function handleKeyUp(event) {
    switch (event.code) {
        case "KeyW":
        case "ArrowUp":
            keys.up = false;
            break;
        case "KeyS":
        case "ArrowDown":
            keys.down = false;
            break;
        case "KeyA":
        case "ArrowLeft":
            keys.left = false;
            break;
        case "KeyD":
        case "ArrowRight":
            keys.right = false;
            break;
        case "Tab":
            event.preventDefault();
            state.scoreboardVisible = false;
            scoreboardElement.classList.add("hidden");
            break;
    }
}