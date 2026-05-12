export function createCollisionDebugController({
    THREE,
    camera3d,
    canvas,
    worldModelGroup,
    nameLabelsElement,
    getEditorTopLevelRoot,
    getEditorModelByIndex
}) {
    const collisionDebugGroup = new THREE.Group();
    collisionDebugGroup.visible = false;

    let collisionDebugBuilt = false;
    let collisionDebugEntries = [];
    let collisionDebugHoverLabel = null;
    const collisionDebugRaycaster = new THREE.Raycaster();
    const collisionDebugCenterNdc = new THREE.Vector2(0, 0);
    const collisionProfileRaycaster = new THREE.Raycaster();

    function readScale(scale) {
        if (typeof scale === "number") {
            return { x: scale, y: scale, z: scale };
        }
        return {
            x: scale?.x ?? 1,
            y: scale?.y ?? 1,
            z: scale?.z ?? 1
        };
    }

    function readUniformScale(scale) {
        if (typeof scale === "number" && Number.isFinite(scale) && scale > 0) {
            return scale;
        }
        const parsed = readScale(scale);
        const x = Number(parsed.x);
        const y = Number(parsed.y);
        const z = Number(parsed.z);
        if (Number.isFinite(x) && x > 0 && Number.isFinite(y) && y > 0 && Number.isFinite(z) && z > 0) {
            return (x + y + z) / 3;
        }
        return 1;
    }

    function readModelYawDegrees(modelDef) {
        const yawDegValue = Number(modelDef?.rotationDegrees?.y);
        if (Number.isFinite(yawDegValue)) {
            return yawDegValue;
        }
        const yawRadValue = Number(modelDef?.rotation?.y);
        if (Number.isFinite(yawRadValue)) {
            return yawRadValue * (180 / Math.PI);
        }
        return 0;
    }

    function readCollisionTemplate(node, fallback) {
        return {
            halfWidth: Number(node?.halfWidth ?? fallback.halfWidth),
            halfDepth: Number(node?.halfDepth ?? fallback.halfDepth),
            height: Number(node?.height ?? fallback.height),
            solid: node?.solid ?? fallback.solid,
            walkable: node?.walkable ?? fallback.walkable,
            yawOffsetDeg: Number(node?.yawOffsetDeg ?? fallback.yawOffsetDeg ?? 0),
            offsetLocalX: Number(node?.offsetLocalX ?? fallback.offsetLocalX ?? 0),
            offsetLocalY: Number(node?.offsetLocalY ?? fallback.offsetLocalY ?? 0)
        };
    }

    function resolveCollisionTemplateForPath(modelPath, profiles) {
        const normalized = (modelPath || "").toLowerCase();
        const defaultTemplate = profiles.default || {
            halfWidth: 48, halfDepth: 48, height: 64, solid: true, walkable: true, yawOffsetDeg: 0, offsetLocalX: 0, offsetLocalY: 0
        };
        const exact = Array.isArray(profiles.exact) ? profiles.exact : [];
        const exactMatch = exact.find(item => (item?.value || "").toLowerCase() === normalized);
        if (exactMatch) {
            return readCollisionTemplate(exactMatch, defaultTemplate);
        }
        const prefix = Array.isArray(profiles.prefix) ? profiles.prefix : [];
        const prefixMatch = prefix.find(item => normalized.startsWith((item?.value || "").toLowerCase()));
        if (prefixMatch) {
            return readCollisionTemplate(prefixMatch, defaultTemplate);
        }
        return defaultTemplate;
    }

    async function buildCollisionDebugBoxes() {
        collisionDebugHoverLabel?.remove();
        collisionDebugHoverLabel = null;
        collisionDebugEntries = [];
        collisionDebugGroup.clear();
        try {
            const [sceneResponse, profileResponse] = await Promise.all([
                fetch("/world/scene.json", { cache: "no-store" }),
                fetch("/world/collision-profiles.json", { cache: "no-store" })
            ]);
            if (!sceneResponse.ok || !profileResponse.ok) {
                return;
            }
            const sceneConfig = await sceneResponse.json();
            const profiles = await profileResponse.json();
            const models = Array.isArray(sceneConfig.models) ? sceneConfig.models : [];

            for (const modelDef of models) {
                if (modelDef?.enabled === false || !modelDef?.path) {
                    continue;
                }
                const template = resolveCollisionTemplateForPath(modelDef.path, profiles);
                if (!template?.solid) {
                    continue;
                }

                const modelScale = readUniformScale(modelDef.scale);
                const width = Math.max(1, template.halfWidth * 2 * modelScale);
                const depth = Math.max(1, template.halfDepth * 2 * modelScale);
                const height = Math.max(1, template.height * modelScale);
                const geometry = new THREE.BoxGeometry(width, height, depth);
                const material = new THREE.MeshBasicMaterial({
                    color: template.walkable ? 0x22d3ee : 0xef4444,
                    wireframe: true,
                    transparent: true,
                    opacity: 0.48,
                    depthWrite: false
                });
                const mesh = new THREE.Mesh(geometry, material);
                mesh.position.set(
                    modelDef.position?.x ?? 0,
                    (modelDef.position?.y ?? 0) + (height / 2),
                    modelDef.position?.z ?? 0
                );
                const yawDeg = readModelYawDegrees(modelDef);
                const yawOffsetDeg = Number(template?.yawOffsetDeg ?? 0);
                const finalYawDeg = yawDeg + yawOffsetDeg;
                const finalYawRad = (finalYawDeg * Math.PI) / 180;
                mesh.rotation.y = finalYawRad;
                const offsetLocalX = Number(template?.offsetLocalX ?? 0) * modelScale;
                const offsetLocalY = Number(template?.offsetLocalY ?? 0) * modelScale;
                const cosYaw = Math.cos(finalYawRad);
                const sinYaw = Math.sin(finalYawRad);
                mesh.position.x += (offsetLocalX * cosYaw) - (offsetLocalY * sinYaw);
                mesh.position.z += (offsetLocalX * sinYaw) + (offsetLocalY * cosYaw);
                mesh.userData.collisionModelName = String(modelDef.path || "").replace("/models/", "");
                mesh.userData.collisionYawDeg = Math.round(finalYawDeg);
                collisionDebugGroup.add(mesh);
                collisionDebugEntries.push({ mesh });
            }
            collisionDebugBuilt = true;
        } catch (_error) {
        }
    }

    function getCollisionProfileSuggestionAtCrosshair() {
        collisionProfileRaycaster.setFromCamera(collisionDebugCenterNdc, camera3d);
        const hits = collisionProfileRaycaster.intersectObjects(worldModelGroup.children, true);
        if (hits.length === 0) {
            return null;
        }

        const root = getEditorTopLevelRoot(hits[0].object);
        if (!root) {
            return null;
        }

        root.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(root);
        const size = new THREE.Vector3();
        box.getSize(size);

        const index = root.userData?.editorModelIndex;
        const modelDef = Number.isInteger(index) && index >= 0 ? getEditorModelByIndex(index) : null;
        const modelScale = Number(modelDef?.scale ?? 1) || 1;
        const divisor = Math.abs(modelScale) > 0.0001 ? Math.abs(modelScale) : 1;

        const halfWidth = size.x / 2 / divisor;
        const halfDepth = size.z / 2 / divisor;
        const height = size.y / divisor;
        const modelPath = String(root.userData?.modelPath || modelDef?.path || "").toLowerCase();
        if (!modelPath) {
            return null;
        }

        return {
            value: modelPath,
            halfWidth: Number(halfWidth.toFixed(2)),
            halfDepth: Number(halfDepth.toFixed(2)),
            height: Number(height.toFixed(2)),
            yawOffsetDeg: 0,
            offsetLocalX: 0,
            offsetLocalY: 0,
            solid: true,
            walkable: true
        };
    }

    async function setCollisionDebugVisible(visible) {
        const next = Boolean(visible);
        if (next) {
            await buildCollisionDebugBoxes();
        }
        collisionDebugGroup.visible = next;
        if (!next && collisionDebugHoverLabel) {
            collisionDebugHoverLabel.style.display = "none";
        }
    }

    function updateCollisionDebugLabels() {
        if (!collisionDebugGroup.visible || collisionDebugEntries.length === 0 || !nameLabelsElement) {
            return;
        }

        if (!collisionDebugHoverLabel) {
            collisionDebugHoverLabel = document.createElement("div");
            collisionDebugHoverLabel.className = "nameLabel";
            collisionDebugHoverLabel.style.display = "none";
            nameLabelsElement.appendChild(collisionDebugHoverLabel);
        }

        collisionDebugRaycaster.setFromCamera(collisionDebugCenterNdc, camera3d);
        const hits = collisionDebugRaycaster.intersectObjects(collisionDebugGroup.children, false);
        if (hits.length === 0) {
            collisionDebugHoverLabel.style.display = "none";
            return;
        }

        const hitMesh = hits[0].object;
        const worldPoint = hits[0].point.clone();
        worldPoint.y += 8;
        const projected = worldPoint.project(camera3d);
        const visible = projected.z > -1 && projected.z < 1;
        if (!visible) {
            collisionDebugHoverLabel.style.display = "none";
            return;
        }

        const screenX = (projected.x * 0.5 + 0.5) * canvas.clientWidth;
        const screenY = (-projected.y * 0.5 + 0.5) * canvas.clientHeight;
        const modelName = hitMesh.userData?.collisionModelName || "unknown";
        const yawDeg = Number(hitMesh.userData?.collisionYawDeg ?? 0);
        collisionDebugHoverLabel.textContent = `${modelName} | ry=${yawDeg}`;
        collisionDebugHoverLabel.style.display = "block";
        collisionDebugHoverLabel.style.left = `${screenX}px`;
        collisionDebugHoverLabel.style.top = `${screenY}px`;
    }

    return {
        group: collisionDebugGroup,
        getCollisionProfileSuggestionAtCrosshair,
        setCollisionDebugVisible,
        updateCollisionDebugLabels
    };
}
