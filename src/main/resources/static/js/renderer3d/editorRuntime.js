export function createEditorRuntime(env) {
    async function toggleEditorMode() {
        const state = env.getState();
        state.editorMode = !state.editorMode;
        if (state.editorMode) {
            await env.ensureEditorModelCatalog();
            env.getMouse().down = false;
            state.ads = false;
            env.ensureEditorPreview();
            env.updateWorldModelRenderMode();
        }
        env.updateEditorHud();
        if (!state.editorMode) {
            env.clearEditorSelectionHighlight();
            env.cancelEditorDraft();
            env.clearEditorPreview();
            env.rebuildInstancedWorldModels();
        }
    }

    function cycleEditorModel(direction) {
        const state = env.getState();
        const catalog = env.getEditorModelCatalog();
        if (!state.editorMode || catalog.length === 0) {
            return;
        }
        env.setEditorModelCursor((env.getEditorModelCursor() + direction + catalog.length) % catalog.length);
        env.updateEditorHud();
        env.ensureEditorPreview();
    }

    function editorHandleCanvasClick(clientX, clientY, options = {}) {
        const state = env.getState();
        if (!state.editorMode) {
            return false;
        }
        const rect = env.getCanvas().getBoundingClientRect();
        const pointerX = typeof clientX === "number" ? (clientX - rect.left) : env.getMouse().x;
        const pointerY = typeof clientY === "number" ? (clientY - rect.top) : env.getMouse().y;
        const ndc = env.getEditorPointerNdc(pointerX, pointerY);
        const selectOnly = Boolean(options.selectOnly);

        if (env.getEditorDraftModel() && env.getEditorDraftRoot()) {
            env.clearEditorSelectionHighlight();
            const placement = env.resolveEditorPlacementPoint(ndc);
            if (!placement) {
                return true;
            }
            const draft = env.getEditorDraftModel();
            draft.position.x = placement.x;
            draft.position.y = placement.y;
            draft.position.z = placement.z;
            env.applyModelTransform(env.getEditorDraftRoot(), draft);
            return true;
        }

        if (!selectOnly) {
            env.clearEditorSelectionHighlight();
            const placement = env.resolveEditorPlacementPoint(ndc);
            if (!placement) {
                return true;
            }
            const path = env.getEditorModelCatalog()[env.getEditorModelCursor()];
            if (!path) {
                return true;
            }
            const draft = {
                enabled: true,
                path,
                position: { x: placement.x, y: placement.y, z: placement.z },
                rotationDegrees: { y: 0 },
                scale: 1
            };
            env.setEditorDraftModel(draft);
            env.clearEditorPreview();
            env.loadWorldModel(draft, root => {
                env.setEditorDraftRoot(root);
                env.applyDraftVisual(root);
            });
            return true;
        }

        env.getEditorRaycaster().setFromCamera(ndc, env.getCamera3d());
        const modelHits = env.getEditorRaycaster().intersectObjects(env.getWorldModelGroup().children, true);
        if (modelHits.length > 0) {
            const uniqueRoots = [];
            const seen = new Set();
            for (const hit of modelHits) {
                const root = env.getEditorTopLevelRoot(hit.object);
                if (!root || seen.has(root.uuid)) {
                    continue;
                }
                seen.add(root.uuid);
                uniqueRoots.push(root);
            }
            if (uniqueRoots.length > 0) {
                const pickSignature = uniqueRoots.map(root => root.uuid).join("|");
                const cycleRequested = Boolean(options.cycleSelection);
                if (!cycleRequested || pickSignature !== env.getEditorLastPickSignature()) {
                    env.setEditorLastPickSignature(pickSignature);
                    env.setEditorLastPickRoots(uniqueRoots);
                    env.setEditorLastPickCursor(0);
                } else {
                    env.setEditorLastPickCursor((env.getEditorLastPickCursor() + 1) % env.getEditorLastPickRoots().length);
                }
                const topRoot = env.getEditorLastPickRoots()[env.getEditorLastPickCursor()];
                if (topRoot && typeof topRoot.userData.editorModelIndex === "number") {
                    if (!cycleRequested && topRoot === env.getSelectedEditorRoot()) {
                        env.clearEditorSelectionHighlight();
                        return true;
                    }
                    env.setEditorSelection(topRoot, topRoot.userData.editorModelIndex);
                    return true;
                }
            }
        }
        env.clearEditorSelectionHighlight();
        return true;
    }

    function editorHandleKeyDown(event) {
        const state = env.getState();
        if (!state.editorMode) {
            return false;
        }
        if (env.getEditorDraftModel() && env.getEditorDraftRoot()) {
            const transformedDraft = env.applyEditorTransformByKey(event.code, env.getEditorDraftModel(), env.getEditorDraftRoot());
            if (transformedDraft) {
                return true;
            }
        }
        if (event.code === "Enter") {
            if (env.getEditorDraftModel() && env.getEditorDraftRoot()) {
                env.clearDraftVisual(env.getEditorDraftRoot());
                const models = env.getEditorSceneModels();
                const nextIndex = models.length;
                models.push(env.getEditorDraftModel());
                env.getEditorDraftRoot().userData.editorModelIndex = nextIndex;
                env.clearEditorSelectionHighlight();
                env.setEditorDraftModel(null);
                env.setEditorDraftRoot(null);
                env.ensureEditorPreview();
                return true;
            }
            return false;
        }
        if (event.code === "Escape") {
            if (env.getEditorDraftModel() || env.getEditorDraftRoot()) {
                env.cancelEditorDraft();
                return true;
            }
            return false;
        }
        if (event.code === "Delete" || event.code === "Backspace") {
            if (env.getEditorDraftModel() || env.getEditorDraftRoot()) {
                env.cancelEditorDraft();
                return true;
            }
            if (env.getSelectedEditorRoot() && env.getSelectedEditorModelIndex() >= 0) {
                env.getWorldModelGroup().remove(env.getSelectedEditorRoot());
                env.getEditorSceneModels().splice(env.getSelectedEditorModelIndex(), 1);
                for (const child of env.getWorldModelGroup().children) {
                    if (typeof child.userData.editorModelIndex === "number" && child.userData.editorModelIndex > env.getSelectedEditorModelIndex()) {
                        child.userData.editorModelIndex -= 1;
                    }
                }
                env.clearEditorSelectionHighlight();
            }
            return true;
        }
        if (event.code === "KeyL") {
            if (env.getSelectedEditorModelIndex() >= 0) {
                const source = env.getEditorSceneModels()[env.getSelectedEditorModelIndex()];
                if (source) {
                    const duplicate = {
                        ...source,
                        position: { x: (source.position?.x ?? 0) + 80, y: source.position?.y ?? 0, z: (source.position?.z ?? 0) + 80 },
                        rotationDegrees: { y: source.rotationDegrees?.y ?? 0 }
                    };
                    const nextIndex = env.getEditorSceneModels().length;
                    env.getEditorSceneModels().push(duplicate);
                    env.loadWorldModel(duplicate, root => {
                        root.userData.editorModelIndex = nextIndex;
                        env.setEditorSelection(root, nextIndex);
                    });
                }
            }
            return true;
        }
        return env.applyEditorTransformByKey(event.code);
    }

    async function saveEditorScene() {
        const response = await env.fetchImpl("/api/world/scene", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ version: 1, models: env.getEditorSceneModels(), primitives: [] })
        });
        if (!response.ok) {
            throw new Error(`Save failed: ${response.status}`);
        }
    }

    function clearEditorSceneModels() {
        env.cancelEditorDraft();
        env.clearEditorSelectionHighlight();
        env.clearInstancedWorldModels();
        env.getWorldModelGroup().clear();
        env.setEditorSceneModels([]);
        env.setEditorLastPickSignature("");
        env.setEditorLastPickRoots([]);
        env.setEditorLastPickCursor(0);
        if (env.getState().editorMode) {
            env.ensureEditorPreview();
            env.updateWorldModelRenderMode();
        } else {
            env.clearEditorPreview();
            env.rebuildInstancedWorldModels();
        }
    }

    function updateEditorPreviewPosition() {
        if (!env.getState().editorMode || !env.getEditorPreviewRoot() || env.getEditorDraftRoot()) {
            return;
        }
        const ndc = env.getEditorPointerNdc();
        const placement = env.resolveEditorPlacementPoint(ndc);
        if (!placement) {
            return;
        }
        const previewRoot = env.getEditorPreviewRoot();
        previewRoot.position.x = placement.x;
        previewRoot.position.y = placement.y;
        previewRoot.position.z = placement.z;
    }

    return {
        toggleEditorMode,
        cycleEditorModel,
        editorHandleCanvasClick,
        editorHandleKeyDown,
        saveEditorScene,
        clearEditorSceneModels,
        updateEditorPreviewPosition
    };
}
