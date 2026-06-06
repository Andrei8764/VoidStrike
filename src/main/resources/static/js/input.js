import {
    canvas,
    chatInputElement,
    characterSelect,
    devConsoleElement,
    devConsoleInputElement,
    devConsoleOutputElement,
    fpsBadgeElement,
    perfHudElement,
    joinButton,
    nameError,
    nameInput,
    scoreboardElement,
    settingAnisotropyElement,
    settingPerformanceModeElement,
    settingRenderScaleElement,
    settingRenderScaleValueElement,
    settingShowFpsElement,
    settingTextureFilterElement,
    settingToneMappingElement,
    settingsPanelElement,
    shopCategoryTabs,
    weaponShopButtons,
    weaponShopElement
} from "./dom.js";
import { getSelfPlayer, keys, mouse, state } from "./state.js";
import { resumeAudio } from "./audio.js";
import { joinGame, sendAdminCommand, sendChatMessage } from "./websocket.js";
import {
    clearEditorSceneModels,
    cycleEditorModel,
    editorHandleCanvasClick,
    editorHandleKeyDown,
    getCollisionProfileSuggestionAtCrosshair,
    getCollisionProfileSuggestionsForScene,
    saveEditorScene,
    setAnisotropyLevel,
    setCollisionDebugVisible,
    setRemoteHandMountOffset,
    setPerformanceMode,
    setRemoteBackMountTransform,
    setRenderScale,
    setTextureFilterMode,
    setToneMappingEnabled,
    setWallhackEnabled,
    toggleEditorMode,
    updateMouseWorldPosition
} from "./renderer3d.js";
import { initWeaponShopPreview, previewWeaponModel } from "./weaponShopPreview.js";
import { MOUSE_SENSITIVITY } from "./config.js";
import { reloadSceneCollision } from "./sceneCollision.js";
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
        if (state.editorMode && event.button === 0) {
            event.preventDefault();
            editorHandleCanvasClick(event.clientX, event.clientY, {
                cycleSelection: event.shiftKey,
                selectOnly: event.altKey
            });
            return;
        }

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

    canvas.addEventListener("wheel", event => {
        if (!state.editorMode) {
            return;
        }
        event.preventDefault();
        if (event.deltaY < 0) {
            cycleEditorModel(-1);
        } else if (event.deltaY > 0) {
            cycleEditorModel(1);
        }
    }, { passive: false });

    if (settingPerformanceModeElement) {
        settingPerformanceModeElement.checked = state.performanceMode;
        settingPerformanceModeElement.addEventListener("change", () => {
            setPerformanceMode(settingPerformanceModeElement.checked);
        });
    }

    if (settingShowFpsElement) {
        settingShowFpsElement.checked = state.showFps;
        settingShowFpsElement.addEventListener("change", () => {
            setShowFpsEnabled(settingShowFpsElement.checked);
        });
    }

    if (settingRenderScaleElement) {
        settingRenderScaleElement.value = String(state.renderScale ?? 1);
        if (settingRenderScaleValueElement) {
            settingRenderScaleValueElement.textContent = `${Number(settingRenderScaleElement.value).toFixed(2)}x`;
        }
        settingRenderScaleElement.addEventListener("input", () => {
            const value = Number(settingRenderScaleElement.value);
            if (settingRenderScaleValueElement) {
                settingRenderScaleValueElement.textContent = `${value.toFixed(2)}x`;
            }
        });
        settingRenderScaleElement.addEventListener("change", () => {
            setRenderScale(Number(settingRenderScaleElement.value));
        });
    }

    if (settingToneMappingElement) {
        settingToneMappingElement.checked = state.toneMappingEnabled;
        settingToneMappingElement.addEventListener("change", () => {
            setToneMappingEnabled(settingToneMappingElement.checked);
        });
    }

    if (settingTextureFilterElement) {
        settingTextureFilterElement.value = state.textureFilter || "smooth";
        settingTextureFilterElement.addEventListener("change", () => {
            setTextureFilterMode(settingTextureFilterElement.value);
        });
    }

    if (settingAnisotropyElement) {
        settingAnisotropyElement.value = state.anisotropyLevel || "max";
        settingAnisotropyElement.addEventListener("change", () => {
            setAnisotropyLevel(settingAnisotropyElement.value);
        });
    }

    if (fpsBadgeElement) {
        fpsBadgeElement.addEventListener("click", () => {
            setShowFpsEnabled(!state.showFps);
        });
    }
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
    if (event.code === "F7") {
        event.preventDefault();
        setSettingsVisible(!state.settingsVisible);
        return;
    }

    if (event.code === "F6") {
        event.preventDefault();
        void toggleEditorMode();
        return;
    }

    if (event.code === "F8") {
        event.preventDefault();
        setPerfHudVisible(!state.perfHudVisible);
        return;
    }

    if (state.editorMode) {
        mouse.down = false;
        state.ads = false;
        if (event.ctrlKey && event.code === "KeyS") {
            event.preventDefault();
            void saveEditorScene()
                .then(() => appendConsoleLine("scene saved"))
                .catch(() => appendConsoleLine("scene save failed"));
            return;
        }
        if (event.code === "BracketLeft") {
            event.preventDefault();
            cycleEditorModel(-1);
            return;
        }
        if (event.code === "BracketRight") {
            event.preventDefault();
            cycleEditorModel(1);
            return;
        }
        if (editorHandleKeyDown(event)) {
            event.preventDefault();
            return;
        }
    }

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

    if (!state.joined) {
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
        case "ControlLeft":
        case "ControlRight":
            keys.crouch = true;
            break;
        case "KeyC":
            keys.descend = true;
            break;
        case "Space":
            keys.jump = true;
            event.preventDefault();
            break;
        case "KeyR":
            state.reloadRequested = true;
            state.ads = false;
            break;
        case "KeyE":
            state.climbRequested = true;
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
        case "ControlLeft":
        case "ControlRight":
            keys.crouch = false;
            break;
        case "KeyC":
            keys.descend = false;
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

function setSettingsVisible(visible) {
    state.settingsVisible = visible;
    settingsPanelElement?.classList.toggle("hidden", !visible);
    if (!visible) {
        return;
    }

    settingPerformanceModeElement.checked = state.performanceMode;
    settingShowFpsElement.checked = state.showFps;
    if (settingRenderScaleElement) {
        settingRenderScaleElement.value = String(state.renderScale ?? 1);
    }
    if (settingRenderScaleValueElement) {
        settingRenderScaleValueElement.textContent = `${Number(state.renderScale ?? 1).toFixed(2)}x`;
    }
    if (settingToneMappingElement) {
        settingToneMappingElement.checked = state.toneMappingEnabled;
    }
    if (settingTextureFilterElement) {
        settingTextureFilterElement.value = state.textureFilter || "smooth";
    }
    if (settingAnisotropyElement) {
        settingAnisotropyElement.value = state.anisotropyLevel || "max";
    }
}

function setShowFpsEnabled(enabled) {
    state.showFps = Boolean(enabled);
    fpsBadgeElement?.classList.toggle("hidden", !state.showFps);
    if (settingShowFpsElement) {
        settingShowFpsElement.checked = state.showFps;
    }
}

function setPerfHudVisible(enabled) {
    state.perfHudVisible = Boolean(enabled);
    perfHudElement?.classList.toggle("hidden", !state.perfHudVisible);
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

function reloadCollisionOnServerAndClient() {
    const sent = sendAdminCommand("reloadcollision");
    if (!sent) {
        appendConsoleLine("reloadcollision failed (socket not ready)");
        return;
    }

    reloadSceneCollision()
        .then(boxCount => {
            appendConsoleLine(`reloadcollision ok (${boxCount} boxes)`);
        })
        .catch(() => {
            appendConsoleLine("reloadcollision server ok, client reload failed");
        });
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

    if (command === "performancemode" || command === "perf") {
        let enabled = state.performanceMode;
        if (arg === "on" || arg === "1" || arg === "true") {
            enabled = true;
        } else if (arg === "off" || arg === "0" || arg === "false") {
            enabled = false;
        } else {
            enabled = !enabled;
        }
        setPerformanceMode(enabled);
        appendConsoleLine(`performanceMode ${enabled ? "ON" : "OFF"}`);
        return;
    }

    if (command === "backmount") {
        if (parts.length < 7) {
            appendConsoleLine("usage: backmount <x> <y> <z> <rxDeg> <ryDeg> <rzDeg>");
            return;
        }

        const x = Number(parts[1]);
        const y = Number(parts[2]);
        const z = Number(parts[3]);
        const rxDeg = Number(parts[4]);
        const ryDeg = Number(parts[5]);
        const rzDeg = Number(parts[6]);

        if (![x, y, z, rxDeg, ryDeg, rzDeg].every(Number.isFinite)) {
            appendConsoleLine("backmount invalid numbers");
            return;
        }

        setRemoteBackMountTransform({ x, y, z, rxDeg, ryDeg, rzDeg });
        appendConsoleLine(`backmount x=${x.toFixed(2)} y=${y.toFixed(2)} z=${z.toFixed(2)} rx=${rxDeg.toFixed(1)} ry=${ryDeg.toFixed(1)} rz=${rzDeg.toFixed(1)}`);
        return;
    }

    if (command === "handoffset") {
        if (parts.length < 4) {
            appendConsoleLine("usage: handoffset <x> <y> <z> [weapon]");
            return;
        }
        const x = Number(parts[1]);
        const y = Number(parts[2]);
        const z = Number(parts[3]);
        const weaponToken = (parts[4] || "").toLowerCase();
        const weaponMap = {
            smg: "SMG",
            pistol: "Pistol",
            shotgun: "Shotgun",
            sniper: "Sniper",
            rifle: "Rifle",
            default: "default",
            all: "default"
        };
        const weapon = weaponToken ? (weaponMap[weaponToken] || null) : null;

        if (![x, y, z].every(Number.isFinite)) {
            appendConsoleLine("handoffset invalid numbers");
            return;
        }
        if (weaponToken && !weapon) {
            appendConsoleLine("handoffset weapon must be: smg|pistol|shotgun|sniper|rifle|default");
            return;
        }

        setRemoteHandMountOffset({ x, y, z, weapon });
        appendConsoleLine(`handoffset ${weapon || "default"} x=${x.toFixed(2)} y=${y.toFixed(2)} z=${z.toFixed(2)}`);
        return;
    }

    if (command === "colprofile" || command === "colliderprofile" || command === "hbprofile") {
        const suggestion = getCollisionProfileSuggestionAtCrosshair();
        if (!suggestion) {
            appendConsoleLine("colprofile: no model under crosshair");
            return;
        }
        appendConsoleLine(`{ "value": "${suggestion.value}", "halfWidth": ${suggestion.halfWidth}, "halfDepth": ${suggestion.halfDepth}, "height": ${suggestion.height}, "solid": ${suggestion.solid}, "walkable": ${suggestion.walkable} }`);
        return;
    }

    if (command === "setcolbox" || command === "savecolbox" || command === "setcollisionbox") {
        const suggestion = getCollisionProfileSuggestionAtCrosshair();
        if (!suggestion) {
            appendConsoleLine("setcolbox: no model under crosshair");
            return;
        }

        void (async () => {
            try {
                const response = await fetch("/api/world/collision-profile", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(suggestion)
                });
                if (!response.ok) {
                    appendConsoleLine("setcolbox: save failed");
                    return;
                }
                appendConsoleLine(`setcolbox saved ${suggestion.value} hw=${suggestion.halfWidth} hd=${suggestion.halfDepth} h=${suggestion.height}`);
                reloadCollisionOnServerAndClient();
            } catch (_error) {
                appendConsoleLine("setcolbox: save failed");
            }
        })();
        return;
    }

    if (command === "setcolboxes" || command === "savecolboxes" || command === "setcollisionboxes") {
        const suggestion = getCollisionProfileSuggestionAtCrosshair();
        if (!suggestion) {
            appendConsoleLine("setcolboxes: no model under crosshair");
            return;
        }

        const numbers = parts.slice(1).map(Number);
        let payload = null;

        if (parts.length === 1) {
            const baseHalfW = Math.max(4, Number((suggestion.halfWidth * 0.34).toFixed(2)));
            const baseHalfD = Math.max(4, Number((suggestion.halfDepth * 0.34).toFixed(2)));
            const baseH = Math.max(8, Number((suggestion.height * 0.28).toFixed(2)));
            const midHalfW = Math.max(3, Number((suggestion.halfWidth * 0.2).toFixed(2)));
            const midHalfD = Math.max(3, Number((suggestion.halfDepth * 0.2).toFixed(2)));
            const midH = Math.max(8, Number((suggestion.height * 0.5).toFixed(2)));
            payload = {
                ...suggestion,
                halfWidth: baseHalfW,
                halfDepth: baseHalfD,
                height: Math.max(baseH, midH),
                boxes: [
                    { halfWidth: baseHalfW, halfDepth: baseHalfD, height: baseH, offsetLocalX: 0, offsetLocalY: 0, offsetLocalZ: 0, yawOffsetDeg: 0 },
                    { halfWidth: midHalfW, halfDepth: midHalfD, height: midH, offsetLocalX: 0, offsetLocalY: 0, offsetLocalZ: Number((baseH * 0.4).toFixed(2)), yawOffsetDeg: 0 }
                ]
            };
        } else if (parts.length === 7) {
            const [baseHalfW, baseHalfD, baseH, topHalfW, topHalfD, topH] = numbers;
            if (![baseHalfW, baseHalfD, baseH, topHalfW, topHalfD, topH].every(Number.isFinite)) {
                appendConsoleLine("setcolboxes: invalid numbers");
                return;
            }
            payload = {
                ...suggestion,
                halfWidth: baseHalfW,
                halfDepth: baseHalfD,
                height: Math.max(baseH, topH),
                boxes: [
                    { halfWidth: baseHalfW, halfDepth: baseHalfD, height: baseH, offsetLocalX: 0, offsetLocalY: 0, offsetLocalZ: 0, yawOffsetDeg: 0 },
                    { halfWidth: topHalfW, halfDepth: topHalfD, height: topH, offsetLocalX: 0, offsetLocalY: 0, offsetLocalZ: Number((baseH * 0.4).toFixed(2)), yawOffsetDeg: 0 }
                ]
            };
        } else if (parts.length === 13) {
            const [
                baseHalfW, baseHalfD, baseH, baseOffX, baseOffY, baseYaw,
                topHalfW, topHalfD, topH, topOffX, topOffY, topYaw
            ] = numbers;
            if (![baseHalfW, baseHalfD, baseH, baseOffX, baseOffY, baseYaw, topHalfW, topHalfD, topH, topOffX, topOffY, topYaw].every(Number.isFinite)) {
                appendConsoleLine("setcolboxes: invalid numbers");
                return;
            }
            payload = {
                ...suggestion,
                halfWidth: baseHalfW,
                halfDepth: baseHalfD,
                height: Math.max(baseH, topH),
                boxes: [
                    { halfWidth: baseHalfW, halfDepth: baseHalfD, height: baseH, offsetLocalX: baseOffX, offsetLocalY: baseOffY, offsetLocalZ: 0, yawOffsetDeg: baseYaw },
                    { halfWidth: topHalfW, halfDepth: topHalfD, height: topH, offsetLocalX: topOffX, offsetLocalY: topOffY, offsetLocalZ: 0, yawOffsetDeg: topYaw }
                ]
            };
        } else if (parts.length === 15) {
            const [
                baseHalfW, baseHalfD, baseH, baseOffX, baseOffY, baseOffZ, baseYaw,
                topHalfW, topHalfD, topH, topOffX, topOffY, topOffZ, topYaw
            ] = numbers;
            if (![baseHalfW, baseHalfD, baseH, baseOffX, baseOffY, baseOffZ, baseYaw, topHalfW, topHalfD, topH, topOffX, topOffY, topOffZ, topYaw].every(Number.isFinite)) {
                appendConsoleLine("setcolboxes: invalid numbers");
                return;
            }
            payload = {
                ...suggestion,
                halfWidth: baseHalfW,
                halfDepth: baseHalfD,
                height: Math.max(baseH + Math.max(0, baseOffZ), topH + Math.max(0, topOffZ)),
                boxes: [
                    { halfWidth: baseHalfW, halfDepth: baseHalfD, height: baseH, offsetLocalX: baseOffX, offsetLocalY: baseOffY, offsetLocalZ: baseOffZ, yawOffsetDeg: baseYaw },
                    { halfWidth: topHalfW, halfDepth: topHalfD, height: topH, offsetLocalX: topOffX, offsetLocalY: topOffY, offsetLocalZ: topOffZ, yawOffsetDeg: topYaw }
                ]
            };
        } else {
            appendConsoleLine("usage: setcolboxes");
            appendConsoleLine("auto: setcolboxes");
            appendConsoleLine("simple: setcolboxes <baseHalfW> <baseHalfD> <baseH> <topHalfW> <topHalfD> <topH>");
            appendConsoleLine("advanced: setcolboxes <bHW> <bHD> <bH> <bOffX> <bOffY> <bYaw> <tHW> <tHD> <tH> <tOffX> <tOffY> <tYaw>");
            appendConsoleLine("advancedZ: setcolboxes <bHW> <bHD> <bH> <bOffX> <bOffY> <bOffZ> <bYaw> <tHW> <tHD> <tH> <tOffX> <tOffY> <tOffZ> <tYaw>");
            return;
        }

        void (async () => {
            try {
                const response = await fetch("/api/world/collision-profile", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });
                if (!response.ok) {
                    appendConsoleLine("setcolboxes: save failed");
                    return;
                }
                appendConsoleLine(`setcolboxes saved ${suggestion.value}`);
                reloadCollisionOnServerAndClient();
            } catch (_error) {
                appendConsoleLine("setcolboxes: save failed");
            }
        })();
        return;
    }

    if (command === "autocolboxes" || command === "autohitbox" || command === "autocollision") {
        const token1 = (parts[1] || "").toLowerCase();
        const token2 = (parts[2] || "").toLowerCase();
        let scope = "all";
        let density = 0;
        if (token1) {
            const parsed = Number(token1);
            if (Number.isFinite(parsed)) {
                density = parsed;
            } else {
                scope = token1;
            }
        }
        if (token2) {
            const parsed = Number(token2);
            if (Number.isFinite(parsed)) {
                density = parsed;
            }
        }
        density = Math.max(0, Math.min(96, Math.floor(density)));
        const suggestions = getCollisionProfileSuggestionsForScene(scope, density);
        if (!Array.isArray(suggestions) || suggestions.length === 0) {
            appendConsoleLine("autocolboxes: no scene models found");
            return;
        }
        void (async () => {
            let saved = 0;
            for (const suggestion of suggestions) {
                try {
                    const response = await fetch("/api/world/collision-profile", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(suggestion)
                    });
                    if (response.ok) {
                        saved += 1;
                    }
                } catch (_error) {
                }
            }
            appendConsoleLine(`autocolboxes(${scope}, ${density === 0 ? "adaptive" : density}) saved ${saved}/${suggestions.length} profiles`);
            reloadCollisionOnServerAndClient();
        })();
        return;
    }

    if (command === "perfhud" || command === "debugfps") {
        let enabled = state.perfHudVisible;
        if (arg === "on" || arg === "1" || arg === "true") {
            enabled = true;
        } else if (arg === "off" || arg === "0" || arg === "false") {
            enabled = false;
        } else {
            enabled = !enabled;
        }
        setPerfHudVisible(enabled);
        appendConsoleLine(`perfhud ${enabled ? "ON" : "OFF"}`);
        return;
    }

    if (command === "hitbox" || command === "collisionbox" || command === "colbox") {
        let enabled = Boolean(state.collisionDebugVisible);
        if (arg === "on" || arg === "1" || arg === "true") {
            enabled = true;
        } else if (arg === "off" || arg === "0" || arg === "false") {
            enabled = false;
        } else {
            enabled = !enabled;
        }
        state.collisionDebugVisible = enabled;
        void setCollisionDebugVisible(enabled);
        appendConsoleLine(`hitbox ${enabled ? "ON" : "OFF"}`);
        return;
    }

    if (command === "editor") {
        if (arg === "on" && !state.editorMode) {
            void toggleEditorMode();
            appendConsoleLine("editor ON");
            return;
        }
        if (arg === "off" && state.editorMode) {
            void toggleEditorMode();
            appendConsoleLine("editor OFF");
            return;
        }
        if (arg === "save") {
            void saveEditorScene()
                .then(() => appendConsoleLine("scene saved"))
                .catch(() => appendConsoleLine("scene save failed"));
            return;
        }
        if (arg === "clear") {
            clearEditorSceneModels();
            appendConsoleLine("editor scene cleared (run 'editor save' to persist)");
            return;
        }
        void toggleEditorMode();
        appendConsoleLine(`editor ${state.editorMode ? "OFF" : "ON"}`);
        return;
    }

    if (command === "freeze" || command === "money" || command === "fly" || command === "tp" || command === "respawn"
        || command === "coldebug" || command === "collisiondebug") {
        const sent = sendAdminCommand(normalized);
        appendConsoleLine(sent ? "ok" : "socket not ready");
        return;
    }

    if (command === "reloadcollision" || command === "reloadcol" || command === "reloadprofiles") {
        reloadCollisionOnServerAndClient();
        return;
    }

    appendConsoleLine("commands: freeze on|off|toggle, money <amount>, fly on|off|toggle, tp <x> <y> [z] | tp <playerName>, respawn [playerName|all], reloadcollision, coldebug on|off, hitbox on|off|toggle, colprofile, setcolbox, setcolboxes (auto if no args), autocolboxes [scope] [density|0=adaptive], backmount <x> <y> <z> <rxDeg> <ryDeg> <rzDeg>, handoffset <x> <y> <z> [weapon], wallhack on|off|toggle, performancemode on|off|toggle, perfhud on|off|toggle, editor on|off|save|clear");
}
