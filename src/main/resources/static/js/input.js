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
import { appendConsoleLine } from "./devConsole.js";
import { resolveScanOptions } from "./collisionScanner.js";
import { joinGame, sendAdminCommand, sendChatMessage } from "./websocket.js";
import {
    clearEditorSceneModels,
    cycleEditorModel,
    editorHandleCanvasClick,
    editorHandleKeyDown,
    getCollisionProfileSuggestionAtCrosshair,
    getCollisionProfileSuggestionsForScene,
    getCollisionDiagnosticsAtCrosshair,
    scanCollisionProfileAtCrosshair,
    scanCollisionProfilesForScene,
    resolveModelPathAtCrosshair,
    showScanPreviewFromProfile,
    saveEditorScene,
    setEditorModelToNone,
    setAnisotropyLevel,
    setCollisionDebugVisible,
    setAimDebugVisible,
    rebuildCollisionDebugBoxes,
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
import { reloadSceneCollision, getCollisionHashes, getSceneCollisionBoxCount } from "./sceneCollision.js";
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
            if (event.code === "Escape") {
                event.preventDefault();
                chatInputElement.blur();
                return;
            }

            if (event.code !== "Enter") {
                return;
            }

            event.preventDefault();
            const text = chatInputElement.value.trim();

            if (text.length === 0) {
                chatInputElement.blur();
                return;
            }

            sendChatMessage(text);
            chatInputElement.value = "";
            chatInputElement.blur();
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
        if (state.editorMode && (event.button === 0 || event.button === 2)) {
            event.preventDefault();
            if (event.button === 2) {
                state.ads = false;
            }
            editorHandleCanvasClick(event.clientX, event.clientY, {
                cycleSelection: event.shiftKey,
                selectOnly: event.button === 2 || event.altKey,
                forcePlace: event.button === 0 && event.ctrlKey
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

function focusChatInput() {
    if (!chatInputElement) {
        return;
    }

    mouse.down = false;
    state.ads = false;
    keys.up = false;
    keys.down = false;
    keys.left = false;
    keys.right = false;
    keys.sprint = false;
    keys.crouch = false;
    keys.descend = false;
    keys.jump = false;

    if (document.pointerLockElement) {
        document.exitPointerLock();
    }

    chatInputElement.focus();
}

function isChatInputActive() {
    return document.activeElement === chatInputElement;
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

    if (isChatInputActive()) {
        return;
    }

    if (event.code === "KeyT" && !event.repeat) {
        event.preventDefault();
        focusChatInput();
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

function parseConsoleToggleArg(arg, currentValue) {
    if (arg === "on" || arg === "1" || arg === "true") {
        return true;
    }
    if (arg === "off" || arg === "0" || arg === "false") {
        return false;
    }
    return !currentValue;
}

function scaleColboxPayload(payload, scale) {
    payload.halfWidth = Number((payload.halfWidth * scale).toFixed(2));
    payload.halfDepth = Number((payload.halfDepth * scale).toFixed(2));
    payload.height = Number((payload.height * scale).toFixed(2));
    if (Number.isFinite(Number(payload.thickness)) && payload.thickness > 0) {
        payload.thickness = Number((payload.thickness * scale).toFixed(2));
    }
    payload.boxes = [{
        halfWidth: payload.halfWidth,
        halfDepth: payload.halfDepth,
        height: payload.height,
        offsetLocalX: payload.offsetLocalX ?? 0,
        offsetLocalY: payload.offsetLocalY ?? 0,
        offsetLocalZ: payload.offsetLocalZ ?? 0,
        yawOffsetDeg: payload.yawOffsetDeg ?? 0
    }];
    return payload;
}

function finalizeColboxPayload(payload) {
    payload.boxes = [{
        halfWidth: payload.halfWidth,
        halfDepth: payload.halfDepth,
        height: payload.height,
        offsetLocalX: payload.offsetLocalX ?? 0,
        offsetLocalY: payload.offsetLocalY ?? 0,
        offsetLocalZ: payload.offsetLocalZ ?? 0,
        yawOffsetDeg: payload.yawOffsetDeg ?? 0
    }];
    return payload;
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
            if (state.collisionDebugVisible) {
                void rebuildCollisionDebugBoxes();
            }
        })
        .catch(() => {
            appendConsoleLine("reloadcollision server ok, client reload failed — restart server after code update");
        });
}

async function clearCollisionProfilesRequest() {
    let response = await fetch("/api/world/collision-profiles", { method: "DELETE" });
    if (!response.ok) {
        response = await fetch("/api/world/collision-profiles/clear", { method: "POST" });
    }
    return response;
}

function runScanCollisionAllCommand(flagParts) {
    const flags = Array.isArray(flagParts) ? flagParts : [];
    const save = flags.includes("--save") || flags.includes("save");
    const onlyMissing = flags.includes("--only-missing") || flags.includes("only-missing");
    const fast = flags.includes("--fast") || flags.includes("fast") || flags.includes("--balanced");
    const aggressive = !fast || flags.includes("--aggressive") || flags.includes("aggressive");
    const useClient = flags.includes("--client");
    void (async () => {
        if (useClient) {
            const options = resolveScanOptions({ aggressive });
            let existing = {};
            if (onlyMissing) {
                try {
                    const response = await fetch("/world/collision-profiles.json", { cache: "no-store" });
                    if (response.ok) {
                        existing = await response.json();
                    }
                } catch (_error) {
                }
            }
            const exact = Array.isArray(existing.exact) ? existing.exact : [];
            const hasScanMeta = path => {
                const entry = exact.find(item => String(item?.value || "").toLowerCase() === path);
                return entry?.scanMeta?.version >= 1;
            };

            const profiles = scanCollisionProfilesForScene("all", options)
                .filter(profile => !onlyMissing || !hasScanMeta(profile.value));

            if (profiles.length === 0) {
                appendConsoleLine("scanCollisionAll: no models to scan");
                return;
            }

            appendConsoleLine(`scanCollisionAll(client): ${profiles.length} profile(s)${save ? " (saving)" : " (preview)"}`);
            let saved = 0;
            for (const profile of profiles) {
                const coverage = ((profile.scanMeta?.coverage || 0) * 100).toFixed(1);
                appendConsoleLine(`  ${profile.value}: +${profile.boxes?.length || 0} -${profile.antiBoxes?.length || 0} cov=${coverage}% cell=${profile.scanMeta?.cellSize}`);
                if (!save) {
                    continue;
                }
                try {
                    const response = await fetch("/api/world/collision-profile", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(profile)
                    });
                    if (response.ok) {
                        saved += 1;
                    }
                } catch (_error) {
                }
            }
            if (save) {
                appendConsoleLine(`scanCollisionAll saved ${saved}/${profiles.length}`);
                reloadCollisionOnServerAndClient();
            }
            return;
        }

        const targetsResponse = await fetch(
            `/api/world/collision-profiles/scan-targets?onlyMissing=${onlyMissing ? "true" : "false"}`,
            { cache: "no-store" }
        );
        const targetsBody = targetsResponse.ok ? await targetsResponse.json() : null;
        const paths = Array.isArray(targetsBody?.paths) ? targetsBody.paths : [];
        if (paths.length === 0) {
            appendConsoleLine("scanCollisionAll(server): no models to scan");
            return;
        }

        appendConsoleLine(`scanCollisionAll(server${aggressive ? ", aggressive" : ", balanced"}): ${paths.length} model(s), cate unul...`);
        const startedAt = performance.now();
        let saved = 0;
        let failed = 0;
        for (let i = 0; i < paths.length; i += 1) {
            const modelPath = paths[i];
            appendConsoleLine(`  [${i + 1}/${paths.length}] ${modelPath}...`);
            let profile = null;
            let savedOk = false;
            let scanWarnings = [];
            for (const attempt of [{ fast, label: aggressive ? "aggressive" : "balanced" }, { fast: true, label: "fast-retry" }]) {
                try {
                    const response = await fetch("/api/world/collision-profiles/server-scan", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            modelPath,
                            aggressive: !attempt.fast,
                            fast: attempt.fast,
                            save
                        })
                    });
                    const body = response.ok ? await response.json() : null;
                    if (response.status === 504 && !attempt.fast) {
                        appendConsoleLine(`    timeout — retry fast...`);
                        continue;
                    }
                    if (!response.ok || !body?.profile) {
                        if (attempt.fast) {
                            appendConsoleLine(`    FAIL ${response.status}${body?.error ? `: ${body.error}` : ""}`);
                        }
                        break;
                    }
                    profile = body.profile;
                    savedOk = Boolean(save && body.saved);
                    scanWarnings = Array.isArray(body.warnings) ? body.warnings : [];
                    if (attempt.fast) {
                        appendConsoleLine(`    ok (${attempt.label})`);
                    }
                    break;
                } catch (error) {
                    if (attempt.fast) {
                        appendConsoleLine(`    FAIL ${error?.message || "network error"}`);
                    }
                }
            }
            if (!profile) {
                failed += 1;
                continue;
            }
            const coverage = ((profile.scanMeta?.coverage || 0) * 100).toFixed(1);
            appendConsoleLine(`    +${profile.boxes?.length || 0} -${profile.antiBoxes?.length || 0} cov=${coverage}% cell=${profile.scanMeta?.cellSize}`);
            if (scanWarnings.length > 0) {
                appendConsoleLine(`    warn: ${scanWarnings.join(", ")}`);
            }
            if (savedOk) {
                saved += 1;
            }
        }
        const elapsed = ((performance.now() - startedAt) / 1000).toFixed(1);
        appendConsoleLine(`scanCollisionAll(server): GATA in ${elapsed}s — ok ${paths.length - failed}/${paths.length}${save ? `, saved ${saved}` : ""}`);
        if (save && saved > 0) {
            appendConsoleLine("scanCollisionAll: ruleaza reloadcollision");
            reloadCollisionOnServerAndClient();
        }
        try {
            const missingResponse = await fetch("/api/world/collision-profiles/missing", { cache: "no-store" });
            const missingBody = missingResponse.ok ? await missingResponse.json() : null;
            const missingCount = Number(missingBody?.count) || 0;
            if (missingCount > 0) {
                appendConsoleLine(`colmissing: inca ${missingCount} model(e) fara hitbox — ruleaza 'colmissing' sau scancollisionall --save`);
            }
        } catch (_error) {
        }
    })();
}

function runConsoleCommand(rawCommand) {
    const normalized = rawCommand.trim();
    appendConsoleLine(`> ${normalized}`);
    const parts = normalized.split(/\s+/);
    let command = parts[0]?.toLowerCase();
    if (command === "autoscanall") {
        parts[0] = "scancollisionall";
        command = "scancollisionall";
    } else if (command === "autoscan" && parts[1]?.toLowerCase() === "all") {
        parts.splice(0, 2);
        parts.unshift("scancollisionall");
        command = "scancollisionall";
    }
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

    if (command === "colinfo" || command === "hbinfo" || command === "colliderinfo") {
        void (async () => {
            const info = await getCollisionDiagnosticsAtCrosshair();
            if (!info) {
                appendConsoleLine("colinfo: no model under crosshair");
                return;
            }
            appendConsoleLine(`colinfo ${info.path}`);
            appendConsoleLine(`  scale=(${info.sceneScale.x},${info.sceneScale.y},${info.sceneScale.z}) yaw=${info.yawDeg} solid=${info.solid} walk=${info.walkable} elevLift=${info.elevationLift}`);
            if (info.kind) {
                appendConsoleLine(`  kind=${info.kind} wallAxis=${info.wallAxis || "-"}`);
            }
            appendConsoleLine(`  boxes=${info.boxCount}`);
            info.boxes.forEach((b, i) => {
                const suspect = b.suspect ? " SUSPECT" : "";
                appendConsoleLine(`  #${i} profile(hw=${b.profile.halfWidth} hd=${b.profile.halfDepth} h=${b.profile.height}) -> world(hw=${b.worldHalfWidth} hd=${b.worldHalfDepth} h=${b.worldHeight})${suspect}`);
                appendConsoleLine(`     offLocal(x=${b.offsetLocal.x} y=${b.offsetLocal.y} z=${b.offsetLocal.z}) offWorld(x=${b.offsetWorld.x} z=${b.offsetWorld.z})`);
            });
        })();
        return;
    }

    if (command === "colhash" || command === "collisionhash") {
        const hashes = getCollisionHashes();
        appendConsoleLine(`client collision: scene#${hashes.scene} profiles#${hashes.profiles} boxes=${hashes.boxes}`);
        appendConsoleLine("compare with server (run 'coldebug on' -> chat shows scene#/profiles#)");
        const sent = sendAdminCommand("coldebug on");
        if (!sent) {
            appendConsoleLine("colhash: socket not ready (cannot query server)");
        }
        return;
    }

    if (command === "colmissing" || command === "missingcol") {
        void (async () => {
            try {
                const response = await fetch("/api/world/collision-profiles/missing", { cache: "no-store" });
                const body = response.ok ? await response.json() : null;
                const paths = Array.isArray(body?.paths) ? body.paths : [];
                if (paths.length === 0) {
                    appendConsoleLine("colmissing: toate modelele solid din scena au profil exact");
                    return;
                }
                appendConsoleLine(`colmissing: ${paths.length} model(e) fara profil exact valid:`);
                paths.forEach(path => appendConsoleLine(`  ${path}`));
                appendConsoleLine("ruleaza: scancollisionall --save (fara --only-missing)");
            } catch (error) {
                appendConsoleLine(`colmissing: failed ${error?.message || "network error"}`);
            }
        })();
        return;
    }

    if (command === "colprofile" || command === "colliderprofile" || command === "hbprofile") {
        const suggestion = getCollisionProfileSuggestionAtCrosshair();
        if (!suggestion) {
            appendConsoleLine("colprofile: no model under crosshair");
            return;
        }
        appendConsoleLine(`colprofile ${suggestion.value}`);
        appendConsoleLine(`  auto hw=${suggestion.halfWidth} hd=${suggestion.halfDepth} h=${suggestion.height}`);
        if (suggestion.kind) {
            appendConsoleLine(`  kind=${suggestion.kind} wallAxis=${suggestion.wallAxis || "-"} thickness=${suggestion.thickness ?? "-"}`);
        }
        appendConsoleLine(`  tip: setcolbox scale 0.25 to shrink | setcolbox <hw> <hd> <h> manual`);
        return;
    }

    if (command === "setcolbox" || command === "savecolbox" || command === "setcollisionbox") {
        const suggestion = getCollisionProfileSuggestionAtCrosshair();
        if (!suggestion) {
            appendConsoleLine("setcolbox: no model under crosshair");
            return;
        }

        const numbers = parts.slice(1).map(Number);
        let payload = { ...suggestion };
        let scaleNote = "";

        if (parts.length === 3 && (parts[1] === "scale" || parts[1] === "shrink" || parts[1] === "mul")) {
            const scale = numbers[1];
            if (!Number.isFinite(scale) || scale <= 0 || scale > 1) {
                appendConsoleLine("setcolbox: scale must be >0 and <=1 (e.g. setcolbox scale 0.25)");
                return;
            }
            scaleColboxPayload(payload, scale);
            scaleNote = ` x${scale}`;
        } else if (parts.length === 2) {
            const arg = numbers[0];
            if (arg > 0 && arg <= 1) {
                scaleColboxPayload(payload, arg);
                scaleNote = ` x${arg}`;
            } else if (!Number.isFinite(arg) || arg <= 0) {
                appendConsoleLine("setcolbox: invalid height/scale");
                appendConsoleLine("usage: setcolbox [height] | setcolbox <0..1 scale> | setcolbox scale <0..1> | setcolbox <halfW> <halfD> <height>");
                return;
            } else {
                payload.height = Number(arg.toFixed(2));
                finalizeColboxPayload(payload);
            }
        } else if (parts.length === 4) {
            const [halfWidth, halfDepth, height] = numbers;
            if (![halfWidth, halfDepth, height].every(v => Number.isFinite(v) && v > 0)) {
                appendConsoleLine("setcolbox: invalid numbers");
                appendConsoleLine("usage: setcolbox [height] | setcolbox <0..1 scale> | setcolbox scale <0..1> | setcolbox <halfW> <halfD> <height>");
                return;
            }
            payload.halfWidth = Number(halfWidth.toFixed(2));
            payload.halfDepth = Number(halfDepth.toFixed(2));
            payload.height = Number(height.toFixed(2));
            finalizeColboxPayload(payload);
        } else if (parts.length === 1) {
            finalizeColboxPayload(payload);
        } else if (parts.length > 1) {
            appendConsoleLine("usage: setcolbox [height] | setcolbox <0..1 scale> | setcolbox scale <0..1> | setcolbox <halfW> <halfD> <height>");
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
                    appendConsoleLine("setcolbox: save failed");
                    return;
                }
                appendConsoleLine(`setcolbox saved ${payload.value} hw=${payload.halfWidth} hd=${payload.halfDepth} h=${payload.height}${scaleNote}`);
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
            const boxHalfW = Number(Math.max(4, suggestion.halfWidth * 0.96).toFixed(2));
            const boxHalfD = Number(Math.max(4, suggestion.halfDepth * 0.96).toFixed(2));
            const boxH = Number(Math.max(4, suggestion.height * 0.98).toFixed(2));
            payload = {
                ...suggestion,
                halfWidth: boxHalfW,
                halfDepth: boxHalfD,
                height: boxH,
                boxes: [{
                    halfWidth: boxHalfW,
                    halfDepth: boxHalfD,
                    height: boxH,
                    offsetLocalX: suggestion.offsetLocalX ?? 0,
                    offsetLocalY: suggestion.offsetLocalY ?? 0,
                    offsetLocalZ: suggestion.offsetLocalZ ?? 0,
                    yawOffsetDeg: 0
                }]
            };
        } else if (parts.length === 4) {
            const [halfWidth, halfDepth, height] = numbers;
            if (![halfWidth, halfDepth, height].every(v => Number.isFinite(v) && v > 0)) {
                appendConsoleLine("setcolboxes: invalid numbers");
                return;
            }
            payload = {
                ...suggestion,
                halfWidth,
                halfDepth,
                height,
                boxes: [{
                    halfWidth,
                    halfDepth,
                    height,
                    offsetLocalX: suggestion.offsetLocalX ?? 0,
                    offsetLocalY: suggestion.offsetLocalY ?? 0,
                    offsetLocalZ: suggestion.offsetLocalZ ?? 0,
                    yawOffsetDeg: 0
                }]
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
            appendConsoleLine("single: setcolboxes <halfW> <halfD> <height>");
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

    if (command === "autoscan" || command === "scanprofile") {
        if (parts[1]?.toLowerCase() === "all") {
            appendConsoleLine("autoscan all: scan intreg harta (server)...");
            runScanCollisionAllCommand(parts.slice(2));
            return;
        }
        const save = parts.includes("save") || parts.includes("--save");
        const fast = parts.includes("--fast") || parts.includes("fast") || parts.includes("--balanced");
        const aggressive = !fast || parts.includes("--aggressive") || parts.includes("aggressive");
        const useClient = parts.includes("--client");
        void (async () => {
            if (useClient) {
                const options = resolveScanOptions({ aggressive });
                const profile = scanCollisionProfileAtCrosshair(options);
                if (!profile) {
                    appendConsoleLine("autoscan: no model under crosshair or scan failed");
                    return;
                }
                const cov = ((profile.scanMeta?.coverage || 0) * 100).toFixed(1);
                const target = ((profile.scanMeta?.coverageTarget || 0.99) * 100).toFixed(0);
                appendConsoleLine(`autoscan(client) ${profile.value}: +${profile.boxes?.length || 0} -${profile.antiBoxes?.length || 0} coverage=${cov}% (target ${target}%) cell=${profile.scanMeta?.cellSize}`);
                if (!save) {
                    appendConsoleLine("autoscan preview only (use 'autoscan save' to persist)");
                    return;
                }
                const response = await fetch("/api/world/collision-profile", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(profile)
                });
                if (response.ok) {
                    appendConsoleLine(`autoscan saved ${profile.value}`);
                    reloadCollisionOnServerAndClient();
                } else {
                    appendConsoleLine("autoscan: save failed");
                }
                return;
            }

            const target = resolveModelPathAtCrosshair();
            if (!target) {
                appendConsoleLine("autoscan: no model under crosshair");
                return;
            }
            appendConsoleLine(`autoscan(server): scanning ${target.modelPath}...`);
            const startedAt = performance.now();
            const response = await fetch("/api/world/collision-profiles/server-scan", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    modelPath: target.modelPath,
                    aggressive,
                    fast,
                    save
                })
            });
            let body = null;
            try {
                body = await response.json();
            } catch (_error) {
            }
            if (!response.ok || !body?.profile) {
                appendConsoleLine(`autoscan(server): failed — ${body?.error || response.status}`);
                return;
            }
            const profile = body.profile;
            showScanPreviewFromProfile(profile, target.modelDef);
            const cov = ((profile.scanMeta?.coverage || 0) * 100).toFixed(1);
            const covTarget = ((profile.scanMeta?.coverageTarget || 0.99) * 100).toFixed(0);
            appendConsoleLine(`autoscan(server) ${profile.value}: +${profile.boxes?.length || 0} -${profile.antiBoxes?.length || 0} coverage=${cov}% (target ${covTarget}%) cell=${profile.scanMeta?.cellSize} (${((performance.now() - startedAt) / 1000).toFixed(1)}s)`);
            if (body.warnings?.length) {
                appendConsoleLine(`autoscan warnings: ${body.warnings.join(", ")}`);
            }
            if (save) {
                appendConsoleLine(`autoscan GATA — saved ${profile.value}`);
                reloadCollisionOnServerAndClient();
            } else {
                appendConsoleLine("autoscan GATA — preview only (use 'autoscan save' to persist)");
            }
        })();
        return;
    }

    if (command === "scancollisionall") {
        runScanCollisionAllCommand(parts.slice(1));
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

    if (command === "clearcolboxes" || command === "clearhitboxes" || command === "clearcollision"
        || command === "removecolboxes" || command === "wipecolboxes") {
        void (async () => {
            try {
                const response = await clearCollisionProfilesRequest();
                if (!response.ok) {
                    appendConsoleLine("clearcolboxes: delete failed (restart server?)");
                    return;
                }
                appendConsoleLine("clearcolboxes: all collision removed");
                reloadCollisionOnServerAndClient();
            } catch (_error) {
                appendConsoleLine("clearcolboxes: delete failed (restart server?)");
            }
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

    if (command === "aimdebug" || command === "aimdbg") {
        const enabled = parseConsoleToggleArg(arg, Boolean(state.aimDebugVisible));
        setAimDebugVisible(enabled);
        appendConsoleLine(`aimdebug ${enabled ? "ON" : "OFF"} (camera ray=yellow, server ray=red, player hitboxes=green/orange)`);
        return;
    }

    if (command === "debughealth" || command === "healthdebug" || command === "hpdebug") {
        const enabled = parseConsoleToggleArg(arg, Boolean(state.healthDebugVisible));
        state.healthDebugVisible = enabled;
        appendConsoleLine(`debughealth ${enabled ? "ON" : "OFF"} (HP bar above players)`);
        return;
    }

    if (command === "debugdamage" || command === "damagedebug" || command === "dmgdebug") {
        const enabled = parseConsoleToggleArg(arg, Boolean(state.damageDebugVisible));
        state.damageDebugVisible = enabled;
        if (enabled) {
            state.lastDamageEventIds.clear();
        }
        appendConsoleLine(`debugdamage ${enabled ? "ON" : "OFF"} (logs HEADHIT/BODY hits in console)`);
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
        void setCollisionDebugVisible(enabled).then(() => {
            const count = getSceneCollisionBoxCount();
            appendConsoleLine(`hitbox ${enabled ? "ON" : "OFF"} (${count} collision boxes)`);
            if (enabled && count === 0) {
                appendConsoleLine("hitbox: no boxes — run autocolboxes all 0 or setcolbox on a model");
            }
        });
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
        if (arg === "none" || (arg === "model" && (parts[2] || "").toLowerCase() === "none")) {
            if (!state.editorMode) {
                appendConsoleLine("editor model none: turn on editor first (editor on)");
                return;
            }
            setEditorModelToNone();
            appendConsoleLine("editor model: none");
            return;
        }
        void toggleEditorMode();
        appendConsoleLine(`editor ${state.editorMode ? "OFF" : "ON"}`);
        return;
    }

    if (command === "freeze" || command === "money" || command === "fly" || command === "noclip" || command === "ghost"
        || command === "setspawn" || command === "spawnpoint" || command === "tp" || command === "respawn"
        || command === "coldebug" || command === "collisiondebug") {
        const sent = sendAdminCommand(normalized);
        appendConsoleLine(sent ? "ok" : "socket not ready");
        return;
    }

    if (command === "reloadcollision" || command === "reloadcol" || command === "reloadprofiles") {
        reloadCollisionOnServerAndClient();
        return;
    }

    appendConsoleLine("commands: freeze on|off|toggle, money <amount>, fly on|off|toggle, noclip on|off|toggle, setspawn here|red|blue|list|clear, tp <x> <y> [z] | tp <playerName>, respawn [playerName|all], reloadcollision, coldebug on|off, aimdebug on|off|toggle, debughealth on|off|toggle, debugdamage on|off|toggle, hitbox on|off|toggle, colinfo, colhash, colmissing, colprofile, setcolbox [height|scale], setcolboxes, autoscan [save], autoscan all [save], scancollisionall [--save] [--only-missing] [--fast], autocolboxes [scope] [density|0=adaptive], clearcolboxes, backmount ..., handoffset ..., wallhack ..., performancemode ..., perfhud ..., editor ...");
}
