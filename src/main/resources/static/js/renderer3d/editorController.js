export function updateEditorHud(editorHudElement, editorSelectedModelElement, editorMode, editorModelCatalog, editorModelCursor) {
    if (!editorHudElement) {
        return;
    }
    editorHudElement.classList.toggle("hidden", !editorMode);
    if (editorSelectedModelElement) {
        const current = editorModelCatalog[editorModelCursor] || "-";
        editorSelectedModelElement.textContent = `Model: ${current.replace("/models/", "")}`;
    }
}

export function getEditorPointerNdc(THREE, canvas, pointerX, pointerY) {
    const rect = canvas.getBoundingClientRect();
    return new THREE.Vector2(
        ((pointerX - rect.left) / rect.width) * 2 - 1,
        -((pointerY - rect.top) / rect.height) * 2 + 1
    );
}

export function resolveEditorPlacementPoint({
    editorRaycaster,
    camera3d,
    worldModelGroup,
    worldPrimitiveGroup,
    editorDraftRoot,
    editorPreviewRoot,
    editorGroundPlane,
    editorGroundHit,
    MODEL_GROUND_EPSILON,
    ndc
}) {
    editorRaycaster.setFromCamera(ndc, camera3d);

    const placementTargets = [
        ...worldModelGroup.children,
        ...worldPrimitiveGroup.children
    ].filter(object => object !== editorDraftRoot && object !== editorPreviewRoot);

    const hits = editorRaycaster.intersectObjects(placementTargets, true);
    if (hits.length > 0) {
        return {
            x: Math.round(hits[0].point.x),
            y: Math.round(hits[0].point.y + MODEL_GROUND_EPSILON),
            z: Math.round(hits[0].point.z)
        };
    }

    if (!editorRaycaster.ray.intersectPlane(editorGroundPlane, editorGroundHit)) {
        return null;
    }

    return {
        x: Math.round(editorGroundHit.x),
        y: 0,
        z: Math.round(editorGroundHit.z)
    };
}

export async function ensureEditorModelCatalog(fetchImpl, currentCatalog, ALL_OBJ_MODEL_FILES) {
    if (currentCatalog.length > 0) {
        return currentCatalog;
    }
    try {
        const response = await fetchImpl("/api/world/models", { cache: "no-store" });
        if (!response.ok) {
            return ALL_OBJ_MODEL_FILES.map(name => `/models/${name}`);
        }
        const list = await response.json();
        if (Array.isArray(list) && list.length > 0) {
            return list;
        }
    } catch (_error) {
    }
    return ALL_OBJ_MODEL_FILES.map(name => `/models/${name}`);
}

export function applyEditorTransformByKey(code, modelDef, applyModelTransform, targetRoot) {
    if (!modelDef || !targetRoot) {
        return false;
    }

    const moveStep = 30;
    const rotStep = 15;
    const scaleStep = 0.05;
    switch (code) {
        case "ArrowUp":
            modelDef.position.z -= moveStep;
            break;
        case "ArrowDown":
            modelDef.position.z += moveStep;
            break;
        case "ArrowLeft":
            modelDef.position.x -= moveStep;
            break;
        case "ArrowRight":
            modelDef.position.x += moveStep;
            break;
        case "KeyR":
            modelDef.position.y += moveStep * 0.5;
            break;
        case "KeyF":
            modelDef.position.y -= moveStep * 0.5;
            break;
        case "KeyQ":
            modelDef.rotationDegrees.y -= rotStep;
            break;
        case "KeyE":
            modelDef.rotationDegrees.y += rotStep;
            break;
        case "KeyZ":
            modelDef.scale = Math.max(0.05, (modelDef.scale || 1) - scaleStep);
            break;
        case "KeyX":
            modelDef.scale = Math.min(20, (modelDef.scale || 1) + scaleStep);
            break;
        default:
            return false;
    }

    applyModelTransform(targetRoot, modelDef);
    return true;
}
