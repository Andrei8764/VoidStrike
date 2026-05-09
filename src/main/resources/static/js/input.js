import {
    canvas,
    chatInputElement,
    characterSelect,
    devConsoleElement,
    devConsoleInputElement,
    devConsoleOutputElement,
    joinButton,
    nameError,
    nameInput,
    scoreboardElement,
    shopCategoryTabs,
    weaponShopButtons,
    weaponShopElement
} from "./dom.js";
import { getSelfPlayer, keys, mouse, state } from "./state.js";
import { resumeAudio } from "./audio.js";
import { joinGame, sendAdminCommand, sendChatMessage } from "./websocket.js";
import { setWallhackEnabled, updateMouseWorldPosition } from "./renderer3d.js";
import { initWeaponShopPreview, previewWeaponModel } from "./weaponShopPreview.js";
import { MOUSE_SENSITIVITY } from "./config.js";
import { clamp, normalizeAngle } from "./utils.js";

export function registerInputHandlers() {
    initWeaponShopPreview();

    if (characterSelect) {
        characterSelect.value = state.selectedCharacterModel;
        characterSelect.addEventListener("change", () => {
            state.selectedCharacterModel = characterSelect.value;
        });
    }

    joinButton.addEventListener("click", joinGame);

    weaponShopButtons.forEach(button => {
        button.addEventListener("mouseenter", () => {
            previewWeaponModel(button.dataset.model, button.dataset.preview);
        });

        button.addEventListener("pointerdown", event => {
            event.preventDefault();
            event.stopPropagation();

            const weaponSlot = Number(button.dataset.weaponSlot);

            buyWeaponImmediately(weaponSlot);
            setShopVisible(false);
        });
    });

    shopCategoryTabs.forEach(tab => {
        tab.addEventListener("click", () => {
            setShopCategory(tab.dataset.shopCategory || "all");
        });
    });

    setShopCategory("all");

    weaponShopElement.addEventListener("pointerdown", event => {
        event.preventDefault();
        event.stopPropagation();
    });

    weaponShopElement.addEventListener("mousedown", event => {
        event.preventDefault();
        event.stopPropagation();
    });

    weaponShopElement.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
    });

    nameInput.addEventListener("keydown", event => {
        if (event.code === "Enter") {
            joinGame();
        }
    });

    nameInput.addEventListener("input", () => {
        nameError.textContent = "";
    });

    if (chatInputElement) {
        chatInputElement.addEventListener("keydown", event => {
            if (event.code !== "Enter") {
                return;
            }

            event.preventDefault();
            const text = chatInputElement.value.trim();

            if (text.length === 0) {
                return;
            }

            sendChatMessage(text);
            chatInputElement.value = "";
        });
    }

    if (devConsoleInputElement) {
        devConsoleInputElement.addEventListener("keydown", event => {
            if (event.code !== "Enter") {
                if (event.code === "Escape") {
                    event.preventDefault();
                    setConsoleVisible(false);
                }
                return;
            }

            event.preventDefault();
            const command = devConsoleInputElement.value.trim();
            if (command.length === 0) {
                return;
            }

            runConsoleCommand(command);
            devConsoleInputElement.value = "";
        });
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    canvas.addEventListener("keyup", handleKeyUp);

    canvas.addEventListener("mousemove", event => {
        const rect = canvas.getBoundingClientRect();

        mouse.x = event.clientX - rect.left;
        mouse.y = event.clientY - rect.top;

        if (document.pointerLockElement === canvas && !state.shopVisible) {
            state.viewAngle = normalizeAngle(state.viewAngle + event.movementX * MOUSE_SENSITIVITY);
            state.viewPitch = clamp(state.viewPitch - event.movementY * MOUSE_SENSITIVITY, -0.55, 0.55);
        }

        updateMouseWorldPosition();
    });

    canvas.addEventListener("mousedown", event => {
        if (state.shopVisible) {
            event.preventDefault();
            return;
        }

        if (event.button === 0) {
            resumeAudio();
            canvas.requestPointerLock();
            mouse.down = true;
        }

        if (event.button === 2) {
            resumeAudio();
            canvas.requestPointerLock();
            const self = getSelfPlayer();
            if (!self?.reloading) {
                state.ads = true;
            }
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

function buyWeaponImmediately(weaponSlot) {
    state.selectedWeaponSlot = weaponSlot;

    if (!state.joined || !state.socket || state.socket.readyState !== WebSocket.OPEN) {
        return;
    }

    state.socket.send(JSON.stringify({
        type: "buyWeapon",
        weaponSlot: weaponSlot
    }));
}

function setShopVisible(visible) {
    state.shopVisible = visible;
    weaponShopElement.classList.toggle("hidden", !visible);

    if (visible) {
        mouse.down = false;
        state.ads = false;

        if (document.pointerLockElement) {
            document.exitPointerLock();
        }

        weaponShopElement.focus();
        const firstVisibleWeapon = [...weaponShopButtons]
            .find(button => button.style.display !== "none");

        if (firstVisibleWeapon) {
            previewWeaponModel(firstVisibleWeapon.dataset.model, firstVisibleWeapon.dataset.preview);
        }
    }
}

function setShopCategory(category) {
    shopCategoryTabs.forEach(tab => {
        tab.classList.toggle("active", tab.dataset.shopCategory === category);
    });

    weaponShopButtons.forEach(button => {
        const weaponCategory = button.dataset.category;
        const visible = category === "all" || weaponCategory === category;
        button.style.display = visible ? "" : "none";
    });

    const firstVisibleWeapon = [...weaponShopButtons]
        .find(button => button.style.display !== "none");

    if (firstVisibleWeapon) {
        previewWeaponModel(firstVisibleWeapon.dataset.model, firstVisibleWeapon.dataset.preview);
    }
}

function handleKeyDown(event) {
    if (event.code === "Backquote") {
        event.preventDefault();
        setConsoleVisible(!state.consoleVisible);
        return;
    }

    if (state.consoleVisible) {
        const consoleFocused = document.activeElement === devConsoleInputElement;

        if (event.code === "Escape") {
            event.preventDefault();
            setConsoleVisible(false);
            return;
        }

        if (!consoleFocused) {
            event.preventDefault();
            devConsoleInputElement?.focus();
        }
        return;
    }

    if (event.repeat && (event.code === "KeyB" || event.code === "Escape")) {
        event.preventDefault();
        return;
    }

    if (event.code === "Escape" && state.shopVisible) {
        event.preventDefault();
        setShopVisible(false);
        return;
    }

    if (event.code === "KeyB") {
        event.preventDefault();
        setShopVisible(!state.shopVisible);
        return;
    }

    if (state.shopVisible) {
        event.preventDefault();
        return;
    }

    if (document.activeElement === chatInputElement) {
        return;
    }

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
        case "ShiftLeft":
        case "ShiftRight":
            keys.sprint = true;
            break;
        case "Space":
            keys.jump = true;
            event.preventDefault();
            break;
        case "KeyR":
            state.reloadRequested = true;
            state.ads = false;
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
        case "ShiftLeft":
        case "ShiftRight":
            keys.sprint = false;
            break;
        case "Space":
            keys.jump = false;
            event.preventDefault();
            break;
        case "Tab":
            event.preventDefault();
            state.scoreboardVisible = false;
            scoreboardElement.classList.add("hidden");
            break;
    }
}

function setConsoleVisible(visible) {
    state.consoleVisible = visible;
    devConsoleElement?.classList.toggle("hidden", !visible);
    if (visible) {
        state.shopVisible = false;
        weaponShopElement.classList.add("hidden");
        devConsoleInputElement?.focus();
        mouse.down = false;
        state.ads = false;
        if (document.pointerLockElement) {
            document.exitPointerLock();
        }
    } else if (document.activeElement === devConsoleInputElement) {
        devConsoleInputElement.blur();
    }
}

function appendConsoleLine(text) {
    if (!devConsoleOutputElement) {
        return;
    }

    const line = document.createElement("div");
    line.textContent = text;
    devConsoleOutputElement.appendChild(line);
    devConsoleOutputElement.scrollTop = devConsoleOutputElement.scrollHeight;
}

function runConsoleCommand(rawCommand) {
    const normalized = rawCommand.trim();
    appendConsoleLine(`> ${normalized}`);
    const parts = normalized.split(/\s+/);
    const command = parts[0]?.toLowerCase();
    const arg = parts[1]?.toLowerCase();

    if (command === "wallhack") {
        let enabled = state.wallhackEnabled;
        if (arg === "on" || arg === "1" || arg === "true") {
            enabled = true;
        } else if (arg === "off" || arg === "0" || arg === "false") {
            enabled = false;
        } else {
            enabled = !enabled;
        }

        state.wallhackEnabled = enabled;
        setWallhackEnabled(enabled);
        appendConsoleLine(`wallhack ${enabled ? "ON" : "OFF"}`);
        return;
    }

    if (command === "freeze" || command === "money") {
        const sent = sendAdminCommand(normalized);
        appendConsoleLine(sent ? "ok" : "socket not ready");
        return;
    }

    appendConsoleLine("commands: freeze on|off|toggle, money <amount>, wallhack on|off|toggle");
}
