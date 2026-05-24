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

    function getRotationSafeSize(root) {
        const originalX = root.rotation.x;
        const originalY = root.rotation.y;
        const originalZ = root.rotation.z;
        root.rotation.y = 0;
        root.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(root);
        const size = new THREE.Vector3();
        box.getSize(size);
        root.rotation.set(originalX, originalY, originalZ);
        root.updateMatrixWorld(true);
        return size;
    }

    function readCollisionTemplate(node, fallback) {
        const halfWidth = Number(node?.halfWidth ?? fallback.halfWidth);
        const halfDepth = Number(node?.halfDepth ?? fallback.halfDepth);
        const height = Number(node?.height ?? fallback.height);
        const yawOffsetDeg = Number(node?.yawOffsetDeg ?? fallback.yawOffsetDeg ?? 0);
        const offsetLocalX = Number(node?.offsetLocalX ?? fallback.offsetLocalX ?? 0);
        const offsetLocalY = Number(node?.offsetLocalY ?? fallback.offsetLocalY ?? 0);
        const offsetLocalZ = Number(node?.offsetLocalZ ?? fallback.offsetLocalZ ?? 0);
        const boxesRaw = Array.isArray(node?.boxes) ? node.boxes : [];
        const boxes = boxesRaw
            .filter(part => part && typeof part === "object")
            .map(part => ({
                halfWidth: Number(part.halfWidth ?? halfWidth),
                halfDepth: Number(part.halfDepth ?? halfDepth),
                height: Number(part.height ?? height),
                yawOffsetDeg: Number(part.yawOffsetDeg ?? yawOffsetDeg),
                offsetLocalX: Number(part.offsetLocalX ?? offsetLocalX),
                offsetLocalY: Number(part.offsetLocalY ?? offsetLocalY),
                offsetLocalZ: Number(part.offsetLocalZ ?? offsetLocalZ)
            }));
        return {
            halfWidth,
            halfDepth,
            height,
            solid: node?.solid ?? fallback.solid,
            walkable: node?.walkable ?? fallback.walkable,
            yawOffsetDeg,
            offsetLocalX,
            offsetLocalY,
            offsetLocalZ,
            boxes
        };
    }

    function resolveCollisionTemplateForPath(modelPath, profiles) {
        const normalized = (modelPath || "").toLowerCase();
        const defaultTemplate = profiles.default || {
            halfWidth: 48, halfDepth: 48, height: 64, solid: true, walkable: true, yawOffsetDeg: 0, offsetLocalX: 0, offsetLocalY: 0, offsetLocalZ: 0
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

                const scale = readScale(modelDef.scale);
                const safeScaleX = Number.isFinite(Number(scale.x)) && Number(scale.x) > 0 ? Number(scale.x) : 1;
                const safeScaleY = Number.isFinite(Number(scale.y)) && Number(scale.y) > 0 ? Number(scale.y) : 1;
                const safeScaleZ = Number.isFinite(Number(scale.z)) && Number(scale.z) > 0 ? Number(scale.z) : 1;
                const parts = Array.isArray(template.boxes) && template.boxes.length > 0
                    ? template.boxes
                    : [template];
                for (const part of parts) {
                    const width = Math.max(1, Number(part.halfWidth || 0) * 2 * safeScaleX);
                    const depth = Math.max(1, Number(part.halfDepth || 0) * 2 * safeScaleZ);
                    const height = Math.max(1, Number(part.height || 0) * safeScaleY);
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
                    const yawOffsetDeg = Number(part?.yawOffsetDeg ?? 0);
                    const finalYawDeg = yawDeg + yawOffsetDeg;
                    const finalYawRad = (finalYawDeg * Math.PI) / 180;
                    mesh.rotation.y = finalYawRad;
                    const offsetLocalX = Number(part?.offsetLocalX ?? 0) * safeScaleX;
                    const offsetLocalY = Number(part?.offsetLocalY ?? 0) * safeScaleZ;
                    const offsetLocalZ = Number(part?.offsetLocalZ ?? 0) * safeScaleY;
                    const cosYaw = Math.cos(finalYawRad);
                    const sinYaw = Math.sin(finalYawRad);
                    mesh.position.x += (offsetLocalX * cosYaw) - (offsetLocalY * sinYaw);
                    mesh.position.z += (offsetLocalX * sinYaw) + (offsetLocalY * cosYaw);
                    mesh.position.y += offsetLocalZ;
                    mesh.userData.collisionModelName = String(modelDef.path || "").replace("/models/", "");
                    mesh.userData.collisionYawDeg = Math.round(finalYawDeg);
                    collisionDebugGroup.add(mesh);
                    collisionDebugEntries.push({ mesh });
                }
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
        const size = getRotationSafeSize(root);

        const index = root.userData?.editorModelIndex;
        const modelDef = Number.isInteger(index) && index >= 0 ? getEditorModelByIndex(index) : null;
        const scale = readScale(modelDef?.scale);
        const safeScaleX = Math.abs(Number(scale?.x ?? 1)) > 0.0001 ? Math.abs(Number(scale.x)) : 1;
        const safeScaleY = Math.abs(Number(scale?.y ?? 1)) > 0.0001 ? Math.abs(Number(scale.y)) : 1;
        const safeScaleZ = Math.abs(Number(scale?.z ?? 1)) > 0.0001 ? Math.abs(Number(scale.z)) : 1;

        const halfWidth = size.x / 2 / safeScaleX;
        const halfDepth = size.z / 2 / safeScaleZ;
        const height = size.y / safeScaleY;
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
            offsetLocalZ: 0,
            solid: true,
            walkable: true
        };
    }

    function buildStackedBoxes(halfWidth, halfDepth, height, count, topScale = 0.35) {
        const safeCount = Math.max(1, Math.min(96, Math.floor(count || 1)));
        const segmentHeight = Math.max(0.5, height / safeCount);
        const boxes = [];
        for (let i = 0; i < safeCount; i += 1) {
            const t = safeCount <= 1 ? 0 : (i / (safeCount - 1));
            const profileScale = (1 - t) + (t * topScale);
            boxes.push({
                halfWidth: Number(Math.max(1, halfWidth * profileScale).toFixed(2)),
                halfDepth: Number(Math.max(1, halfDepth * profileScale).toFixed(2)),
                height: Number(segmentHeight.toFixed(2)),
                offsetLocalX: 0,
                offsetLocalY: 0,
                offsetLocalZ: Number((i * segmentHeight).toFixed(2)),
                yawOffsetDeg: 0
            });
        }
        return boxes;
    }

    function estimateAdaptiveBoxCount(halfWidth, halfDepth, height, minCount, maxCount) {
        const footprint = Math.max(1, halfWidth * halfDepth);
        const tallness = Math.max(0.35, height / Math.max(8, Math.min(halfWidth, halfDepth) * 2));
        const complexity = Math.sqrt(footprint) * 0.12 + (tallness * 2.2);
        const raw = Math.round(complexity);
        return Math.max(minCount, Math.min(maxCount, raw));
    }

    function isAlwaysNonSolidModel(modelPath) {
        const path = String(modelPath || "").toLowerCase();
        if (!path) {
            return false;
        }
        const nonSolidTokens = [
            "/road-",
            "/grass",
            "/cloud",
            "/tree-",
            "tree-park-",
            "tree-pine-",
            "tree-shrub",
            "/detail-light-",
            "/detail-cables-",
            "/detail-awning-",
            "/scaffolding-",
            "/balcony-ladder-",
            "/window-",
            "/sign",
            "/roof-metal-poles"
        ];
        return nonSolidTokens.some(token => path.includes(token));
    }

    function buildAutoBoxesForModel(modelPath, halfWidth, halfDepth, height, density = 16) {
        const path = (modelPath || "").toLowerCase();
        const safeDensity = Math.max(1, Math.min(96, Math.floor(Number(density) || 16)));
        const adaptiveMode = Number(density) <= 0;

        const oneBox = (w, d, h, offX = 0, offY = 0, offZ = 0, yaw = 0) => ([{
            halfWidth: Number(Math.max(1, w).toFixed(2)),
            halfDepth: Number(Math.max(1, d).toFixed(2)),
            height: Number(Math.max(1, h).toFixed(2)),
            offsetLocalX: Number(offX.toFixed(2)),
            offsetLocalY: Number(offY.toFixed(2)),
            offsetLocalZ: Number(offZ.toFixed(2)),
            yawOffsetDeg: Number(yaw.toFixed(2))
        }]);

        if (path.includes("tree")) {
            const count = adaptiveMode
                ? estimateAdaptiveBoxCount(halfWidth, halfDepth, height, 4, 18)
                : safeDensity;
            return buildStackedBoxes(halfWidth * 0.34, halfDepth * 0.34, Math.max(8, height * 0.88), count, 0.28);
        }

        if (path.includes("/wall-") || path.includes("/door-") || path.includes("/window-")) {
            return oneBox(halfWidth * 0.96, halfDepth * 0.96, Math.max(8, height * 0.98));
        }

        if (path.includes("/truck-") || path.includes("/car-")) {
            const pairCount = adaptiveMode
                ? estimateAdaptiveBoxCount(halfWidth, halfDepth, height, 2, 6)
                : Math.max(2, Math.min(6, safeDensity));
            if (pairCount <= 2) {
                const bodyH = Number(Math.max(10, height * 0.62).toFixed(2));
                const cabinH = Number(Math.max(8, height * 0.38).toFixed(2));
                return [
                    {
                        halfWidth: Number(Math.max(6, halfWidth * 0.9).toFixed(2)),
                        halfDepth: Number(Math.max(6, halfDepth * 0.9).toFixed(2)),
                        height: bodyH,
                        offsetLocalX: 0,
                        offsetLocalY: 0,
                        offsetLocalZ: 0,
                        yawOffsetDeg: 0
                    },
                    {
                        halfWidth: Number(Math.max(4, halfWidth * 0.55).toFixed(2)),
                        halfDepth: Number(Math.max(4, halfDepth * 0.45).toFixed(2)),
                        height: cabinH,
                        offsetLocalX: Number((halfWidth * 0.18).toFixed(2)),
                        offsetLocalY: 0,
                        offsetLocalZ: Number((bodyH * 0.35).toFixed(2)),
                        yawOffsetDeg: 0
                    }
                ];
            }
            const bodyCount = Math.max(1, Math.floor(pairCount * 0.7));
            const cabinCount = Math.max(1, pairCount - bodyCount);
            const bodyHeight = Math.max(10, height * 0.62);
            const cabinHeight = Math.max(8, height * 0.38);
            const bodyBoxes = buildStackedBoxes(halfWidth * 0.9, halfDepth * 0.9, bodyHeight, bodyCount, 0.92);
            const cabinBoxes = buildStackedBoxes(halfWidth * 0.55, halfDepth * 0.45, cabinHeight, cabinCount, 0.85)
                .map(box => ({
                    ...box,
                    offsetLocalX: Number((box.offsetLocalX + (halfWidth * 0.18)).toFixed(2)),
                    offsetLocalZ: Number((box.offsetLocalZ + (bodyHeight * 0.35)).toFixed(2))
                }));
            return [...bodyBoxes, ...cabinBoxes];
        }
        if (path.includes("rock") || path.includes("bush") || path.includes("shrub")) {
            const count = adaptiveMode
                ? estimateAdaptiveBoxCount(halfWidth, halfDepth, height, 2, 10)
                : safeDensity;
            return buildStackedBoxes(halfWidth * 0.72, halfDepth * 0.72, Math.max(6, height * 0.82), count, 0.48);
        }

        // Open-under props: keep collision only on upper section so players can pass underneath.
        if (path.includes("awning")
            || path.includes("scaffolding")
            || path.includes("ladder")
            || path.includes("light-")
            || path.includes("roof-metal-poles")
            || path.includes("sign")) {
            const topHeight = Math.max(6, height * 0.34);
            const topOffsetZ = Math.max(0, height * 0.56);
            return oneBox(halfWidth * 0.84, halfDepth * 0.84, topHeight, 0, 0, topOffsetZ);
        }

        if (path.includes("/detail-") || path.includes("/crate") || path.includes("/barrier")) {
            return oneBox(halfWidth * 0.9, halfDepth * 0.9, Math.max(6, height * 0.95));
        }
        const genericCount = adaptiveMode
            ? estimateAdaptiveBoxCount(halfWidth, halfDepth, height, 1, 3)
            : safeDensity;
        if (genericCount <= 1) {
            return oneBox(halfWidth, halfDepth, height);
        }
        return buildStackedBoxes(halfWidth, halfDepth, height, genericCount, 0.82);
    }

    function getCollisionProfileSuggestionsForScene(filter = "all", density = 16) {
        const normalizedFilter = String(filter || "all").toLowerCase();
        const byPath = new Map();
        for (const root of worldModelGroup.children) {
            root.updateMatrixWorld(true);
            const size = getRotationSafeSize(root);

            const index = root.userData?.editorModelIndex;
            const modelDef = Number.isInteger(index) && index >= 0 ? getEditorModelByIndex(index) : null;
            const modelPath = String(root.userData?.modelPath || modelDef?.path || "").toLowerCase();
            if (!modelPath) {
                continue;
            }
            if (normalizedFilter !== "all" && !modelPath.includes(normalizedFilter)) {
                continue;
            }

            const scale = readScale(modelDef?.scale);
            const safeScaleX = Math.abs(Number(scale?.x ?? 1)) > 0.0001 ? Math.abs(Number(scale.x)) : 1;
            const safeScaleY = Math.abs(Number(scale?.y ?? 1)) > 0.0001 ? Math.abs(Number(scale.y)) : 1;
            const safeScaleZ = Math.abs(Number(scale?.z ?? 1)) > 0.0001 ? Math.abs(Number(scale.z)) : 1;
            const halfWidth = size.x / 2 / safeScaleX;
            const halfDepth = size.z / 2 / safeScaleZ;
            const height = size.y / safeScaleY;

            if (!byPath.has(modelPath)) {
                byPath.set(modelPath, []);
            }
            byPath.get(modelPath).push({ halfWidth, halfDepth, height });
        }

        const suggestions = [];
        for (const [modelPath, samples] of byPath.entries()) {
            if (!samples || samples.length === 0) {
                continue;
            }
            const avgHalfWidth = samples.reduce((sum, item) => sum + item.halfWidth, 0) / samples.length;
            const avgHalfDepth = samples.reduce((sum, item) => sum + item.halfDepth, 0) / samples.length;
            const avgHeight = samples.reduce((sum, item) => sum + item.height, 0) / samples.length;
            const boxes = buildAutoBoxesForModel(modelPath, avgHalfWidth, avgHalfDepth, avgHeight, density);
            const solid = !isAlwaysNonSolidModel(modelPath);
            suggestions.push({
                value: modelPath,
                halfWidth: Number(avgHalfWidth.toFixed(2)),
                halfDepth: Number(avgHalfDepth.toFixed(2)),
                height: Number(avgHeight.toFixed(2)),
                yawOffsetDeg: 0,
                offsetLocalX: 0,
                offsetLocalY: 0,
                offsetLocalZ: 0,
                solid,
                walkable: true,
                boxes
            });
        }
        return suggestions;
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
        getCollisionProfileSuggestionsForScene,
        setCollisionDebugVisible,
        updateCollisionDebugLabels
    };
}
