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

    const OBJ_WORLD_SCALE = 128;

    function readEffectiveRootScale(root, modelDef, modelPath) {
        const path = String(modelPath || modelDef?.path || "").toLowerCase();
        const objMul = path.endsWith(".obj")
            ? Number(modelDef?.objScaleMultiplier ?? OBJ_WORLD_SCALE)
            : 1;
        const sceneScale = readSceneScale(modelDef);
        if (modelDef?.path) {
            return {
                x: sceneScale.x * objMul,
                y: sceneScale.y * objMul,
                z: sceneScale.z * objMul
            };
        }
        return {
            x: Math.abs(root.scale.x) || (sceneScale.x * objMul),
            y: Math.abs(root.scale.y) || (sceneScale.y * objMul),
            z: Math.abs(root.scale.z) || (sceneScale.z * objMul)
        };
    }

    function scaleMeasuredExtents(extents, sx, sy, sz) {
        return {
            halfWidth: extents.halfWidth * sx,
            halfDepth: extents.halfDepth * sz,
            height: extents.height * sy,
            offsetLocalX: extents.offsetLocalX * sx,
            offsetLocalY: extents.offsetLocalY * sz,
            offsetLocalZ: extents.offsetLocalZ * sy
        };
    }

    function readSceneScale(modelDef) {
        return readScale(modelDef?.scale);
    }

    function resolveSceneModelDef(root, modelDef) {
        if (modelDef?.path) {
            return modelDef;
        }
        const path = String(root.userData?.modelPath || "");
        const pathLower = path.toLowerCase();
        const objMul = pathLower.endsWith(".obj") ? OBJ_WORLD_SCALE : 1;
        return {
            path,
            scale: {
                x: Math.max(1e-6, Math.abs(root.scale.x) / objMul),
                y: Math.max(1e-6, Math.abs(root.scale.y) / objMul),
                z: Math.max(1e-6, Math.abs(root.scale.z) / objMul)
            },
            position: {
                x: root.position.x,
                y: root.position.y,
                z: root.position.z
            }
        };
    }

    function normalizeProfileMeasurements(measured, modelDef) {
        const sceneScale = readSceneScale(modelDef);
        const sx = Math.max(1e-6, sceneScale.x);
        const sy = Math.max(1e-6, sceneScale.y);
        const sz = Math.max(1e-6, sceneScale.z);
        return {
            halfWidth: measured.halfWidth / sx,
            halfDepth: measured.halfDepth / sz,
            height: measured.height / sy,
            offsetLocalX: measured.offsetLocalX / sx,
            offsetLocalY: measured.offsetLocalY / sz,
            offsetLocalZ: measured.offsetLocalZ / sy,
            elevationLift: measured.elevationLift
        };
    }

    function buildProfileSuggestionFromMeasurement(measured, modelPath, modelDef) {
        const normalized = normalizeProfileMeasurements(measured, modelDef);
        const suggestion = sanitizeSuggestion({
            value: modelPath,
            halfWidth: Number(normalized.halfWidth.toFixed(2)),
            halfDepth: Number(normalized.halfDepth.toFixed(2)),
            height: Number(normalized.height.toFixed(2)),
            yawOffsetDeg: 0,
            offsetLocalX: Number(normalized.offsetLocalX.toFixed(2)),
            offsetLocalY: Number(normalized.offsetLocalY.toFixed(2)),
            offsetLocalZ: Number(normalized.offsetLocalZ.toFixed(2)),
            elevationLift: Number(normalized.elevationLift.toFixed(2)),
            solid: !isAlwaysNonSolidModel(modelPath),
            walkable: true
        });

        // Persist wall slab metadata so reload does not re-expand to the full tile bbox.
        if (isWallLikeModelPath(modelPath)) {
            const thin = Math.min(suggestion.halfWidth, suggestion.halfDepth);
            suggestion.kind = "wall";
            suggestion.wallAxis = suggestion.halfWidth >= suggestion.halfDepth ? "x" : "z";
            suggestion.thickness = Number(thin.toFixed(2));
        }

        return suggestion;
    }

    function isWallLikeModelPath(modelPath) {
        const path = String(modelPath || "").toLowerCase();
        return path.includes("/wall-")
            || path.includes("/door-")
            || path.includes("/window-")
            || path.includes("/planks.obj");
    }

    function tightenWallFootprint(halfWidth, halfDepth, modelPath, collider, scaleX = 1, scaleZ = 1) {
        const kind = collider ? String(collider.kind || "").toLowerCase() : "";
        if (kind === "wall") {
            const axis = String(collider.wallAxis || "").toLowerCase();
            const rawThickness = Number(collider.thickness);
            const hasThickness = Number.isFinite(rawThickness) && rawThickness > 0;
            if (axis === "x") {
                const thin = hasThickness ? rawThickness * scaleZ : Math.min(halfWidth, halfDepth);
                return { halfWidth, halfDepth: thin };
            }
            if (axis === "z") {
                const thin = hasThickness ? rawThickness * scaleX : Math.min(halfWidth, halfDepth);
                return { halfWidth: thin, halfDepth };
            }
            if (hasThickness) {
                if (halfWidth >= halfDepth) {
                    return { halfWidth, halfDepth: rawThickness * scaleZ };
                }
                return { halfWidth: rawThickness * scaleX, halfDepth };
            }
        }

        const path = String(modelPath || "").toLowerCase();
        if (!isWallLikeModelPath(path)) {
            return { halfWidth, halfDepth };
        }

        let w = halfWidth;
        let d = halfDepth;
        const longSide = Math.max(w, d);
        const shortSide = Math.min(w, d);
        const aspect = shortSide / Math.max(longSide, 1e-6);

        if (path.includes("diagonal") || path.includes("slant")) {
            const shrink = path.includes("diagonal") ? 0.5 : 0.58;
            return { halfWidth: w * shrink, halfDepth: d * shrink };
        }

        if (path.includes("corner")) {
            return { halfWidth: w * 0.62, halfDepth: d * 0.62 };
        }

        // Square bbox on a tile wall -> thin slab (128 x ~12), not a full 128 x 128 block.
        if (aspect > 0.72) {
            const thinHalf = Math.max(3.5, Math.min(shortSide * 0.14, longSide * 0.065));
            if (w >= d) {
                w = longSide * 0.96;
                d = thinHalf;
            } else {
                w = thinHalf;
                d = longSide * 0.96;
            }
        } else {
            w *= 0.96;
            d *= 0.96;
        }

        return { halfWidth: w, halfDepth: d };
    }

    const _vertexMeasure = new THREE.Vector3();
    const _invRootMatrix = new THREE.Matrix4();

    function collectVerticesInRootSpace(root) {
        const points = [];
        _invRootMatrix.copy(root.matrixWorld).invert();
        root.traverse(node => {
            if (!node.isMesh || !node.geometry) {
                return;
            }
            const position = node.geometry.getAttribute("position");
            if (!position) {
                return;
            }
            for (let i = 0; i < position.count; i += 1) {
                _vertexMeasure.fromBufferAttribute(position, i);
                node.localToWorld(_vertexMeasure);
                _vertexMeasure.applyMatrix4(_invRootMatrix);
                points.push(_vertexMeasure.x, _vertexMeasure.y, _vertexMeasure.z);
            }
        });
        return points;
    }

    function percentileSorted(sorted, q) {
        if (sorted.length === 0) {
            return 0;
        }
        const idx = Math.floor((sorted.length - 1) * q);
        return sorted[idx];
    }

    function measureExtentsFromVertices(root) {
        const flat = collectVerticesInRootSpace(root);
        if (flat.length < 24) {
            return null;
        }

        const xs = [];
        const ys = [];
        const zs = [];
        for (let i = 0; i < flat.length; i += 3) {
            xs.push(flat[i]);
            ys.push(flat[i + 1]);
            zs.push(flat[i + 2]);
        }
        xs.sort((a, b) => a - b);
        ys.sort((a, b) => a - b);
        zs.sort((a, b) => a - b);

        const xMin = percentileSorted(xs, 0.02);
        const xMax = percentileSorted(xs, 0.98);
        const yMin = percentileSorted(ys, 0.02);
        const yMax = percentileSorted(ys, 0.98);
        const zMin = percentileSorted(zs, 0.02);
        const zMax = percentileSorted(zs, 0.98);

        return {
            halfWidth: Math.max(0.5, (xMax - xMin) / 2),
            halfDepth: Math.max(0.5, (zMax - zMin) / 2),
            height: Math.max(0.5, yMax - yMin),
            offsetLocalX: (xMin + xMax) / 2,
            offsetLocalY: (zMin + zMax) / 2,
            offsetLocalZ: yMin
        };
    }

    function measureModelLocalColliderBounds(root, modelDef) {
        const originalY = root.rotation.y;
        root.rotation.y = 0;
        root.updateMatrixWorld(true);

        const rootPos = new THREE.Vector3();
        root.getWorldPosition(rootPos);

        const modelPath = String(modelDef?.path || root.userData?.modelPath || "");
        const rootScale = readEffectiveRootScale(root, modelDef, modelPath);
        const fromVertices = measureExtentsFromVertices(root);
        let halfWidth;
        let halfDepth;
        let height;
        let offsetLocalX;
        let offsetLocalY;
        let offsetLocalZ;

        if (fromVertices) {
            const scaled = scaleMeasuredExtents(fromVertices, rootScale.x, rootScale.y, rootScale.z);
            halfWidth = scaled.halfWidth;
            halfDepth = scaled.halfDepth;
            height = scaled.height;
            offsetLocalX = scaled.offsetLocalX;
            offsetLocalY = scaled.offsetLocalY;
            offsetLocalZ = scaled.offsetLocalZ;
        } else {
            const bounds = new THREE.Box3().setFromObject(root);
            const size = new THREE.Vector3();
            bounds.getSize(size);
            const centerX = (bounds.min.x + bounds.max.x) / 2;
            const centerZ = (bounds.min.z + bounds.max.z) / 2;
            halfWidth = Math.max(0.5, size.x / 2);
            halfDepth = Math.max(0.5, size.z / 2);
            height = Math.max(0.5, size.y);
            offsetLocalX = centerX - rootPos.x;
            offsetLocalY = centerZ - rootPos.z;
            offsetLocalZ = bounds.min.y - rootPos.y;
        }

        const tightened = tightenWallFootprint(halfWidth, halfDepth, modelPath);
        halfWidth = tightened.halfWidth;
        halfDepth = tightened.halfDepth;

        const sceneY = Number(modelDef?.position?.y ?? 0);
        const elevationLift = rootPos.y - sceneY;

        root.rotation.y = originalY;
        root.updateMatrixWorld(true);

        return {
            halfWidth,
            halfDepth,
            height,
            offsetLocalX,
            offsetLocalY,
            offsetLocalZ,
            elevationLift
        };
    }

    function readCollisionTemplate(node, fallback) {
        const halfWidth = Number(node?.halfWidth ?? fallback.halfWidth);
        const halfDepth = Number(node?.halfDepth ?? fallback.halfDepth);
        const height = Number(node?.height ?? fallback.height);
        const yawOffsetDeg = Number(node?.yawOffsetDeg ?? fallback.yawOffsetDeg ?? 0);
        const offsetLocalX = Number(node?.offsetLocalX ?? fallback.offsetLocalX ?? 0);
        const offsetLocalY = Number(node?.offsetLocalY ?? fallback.offsetLocalY ?? 0);
        const offsetLocalZ = Number(node?.offsetLocalZ ?? fallback.offsetLocalZ ?? 0);
        const elevationLift = Number(node?.elevationLift ?? fallback.elevationLift ?? 0);
        const kind = String(node?.kind ?? fallback.kind ?? "").toLowerCase();
        const wallAxis = String(node?.wallAxis ?? fallback.wallAxis ?? "").toLowerCase();
        const thickness = Number(node?.thickness ?? fallback.thickness ?? 0);
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
            elevationLift,
            kind,
            wallAxis,
            thickness,
            boxes
        };
    }

    // Returns { template, source } where source is exact|prefix|default.
    function resolveCollisionTemplateForPath(modelPath, profiles) {
        const normalized = (modelPath || "").toLowerCase();
        const defaultTemplate = profiles.default || {
            halfWidth: 48, halfDepth: 48, height: 64, solid: true, walkable: true, yawOffsetDeg: 0, offsetLocalX: 0, offsetLocalY: 0, offsetLocalZ: 0, elevationLift: 0
        };
        const exact = Array.isArray(profiles.exact) ? profiles.exact : [];
        const exactMatch = exact.find(item => (item?.value || "").toLowerCase() === normalized);
        if (exactMatch) {
            return { template: readCollisionTemplate(exactMatch, defaultTemplate), source: "exact" };
        }
        if (profiles.exactOnly === true) {
            return null;
        }
        const prefix = Array.isArray(profiles.prefix) ? profiles.prefix : [];
        const prefixMatch = prefix.find(item => normalized.startsWith((item?.value || "").toLowerCase()));
        if (prefixMatch) {
            return { template: readCollisionTemplate(prefixMatch, defaultTemplate), source: "prefix" };
        }
        return { template: readCollisionTemplate(defaultTemplate, defaultTemplate), source: "default" };
    }

    function isSuspectBoxDims(halfWidth, halfDepth, height) {
        const values = [halfWidth, halfDepth, height];
        if (values.some(v => !Number.isFinite(v) || v <= 0)) {
            return true;
        }
        return halfWidth > 4096 || halfDepth > 4096 || height > 8192;
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
                const resolved = resolveCollisionTemplateForPath(modelDef.path, profiles);
                if (!resolved) {
                    continue;
                }
                const template = resolved.template;
                const isFallback = resolved.source !== "exact";

                const scale = readScale(modelDef.scale);
                const safeScaleX = Number.isFinite(Number(scale.x)) && Number(scale.x) > 0 ? Number(scale.x) : 1;
                const safeScaleY = Number.isFinite(Number(scale.y)) && Number(scale.y) > 0 ? Number(scale.y) : 1;
                const safeScaleZ = Number.isFinite(Number(scale.z)) && Number(scale.z) > 0 ? Number(scale.z) : 1;
                const modelElevation = Number(modelDef.position?.y ?? 0) + Number(template.elevationLift ?? 0);
                const parts = Array.isArray(template.boxes) && template.boxes.length > 0
                    ? template.boxes
                    : [template];
                for (const part of parts) {
                    let halfWidth = Number(part.halfWidth || 0) * safeScaleX;
                    let halfDepth = Number(part.halfDepth || 0) * safeScaleZ;
                    if (template.kind === "wall" || isWallLikeModelPath(modelDef.path)) {
                        const tightened = tightenWallFootprint(halfWidth, halfDepth, modelDef.path, template, safeScaleX, safeScaleZ);
                        halfWidth = tightened.halfWidth;
                        halfDepth = tightened.halfDepth;
                    }
                    const rawHeight = Number(part.height || 0) * safeScaleY;
                    const suspect = isSuspectBoxDims(halfWidth, halfDepth, rawHeight);
                    const width = Math.max(1, halfWidth * 2);
                    const depth = Math.max(1, halfDepth * 2);
                    const height = Math.max(1, rawHeight);
                    const offsetLocalUp = Number(part?.offsetLocalZ ?? 0) * safeScaleY;
                    const baseZ = modelElevation + offsetLocalUp;
                    const isSolid = Boolean(template.solid);
                    const isWalkable = Boolean(template.walkable);
                    // Colour priority: suspect (magenta) > fallback (white) > normal palette.
                    let color;
                    if (suspect) {
                        color = 0xff00ff;
                    } else if (isFallback) {
                        color = 0xffffff;
                    } else {
                        color = !isSolid && isWalkable
                            ? 0x22d3ee
                            : (isSolid && isWalkable ? 0xf59e0b : 0xef4444);
                    }
                    const geometry = new THREE.BoxGeometry(width, height, depth);
                    const material = new THREE.MeshBasicMaterial({
                        color,
                        wireframe: true,
                        transparent: true,
                        opacity: suspect ? 0.85 : (isSolid ? 0.52 : 0.34),
                        depthWrite: false
                    });
                    const mesh = new THREE.Mesh(geometry, material);
                    mesh.position.set(
                        modelDef.position?.x ?? 0,
                        baseZ + (height / 2),
                        modelDef.position?.z ?? 0
                    );
                    const yawDeg = readModelYawDegrees(modelDef);
                    const yawOffsetDeg = Number(part?.yawOffsetDeg ?? 0);
                    const finalYawDeg = yawDeg + yawOffsetDeg;
                    const finalYawRad = (finalYawDeg * Math.PI) / 180;
                    // The debug mesh is rotated by +yaw (Three.js RotationY), matching the model.
                    mesh.rotation.y = finalYawRad;
                    const offsetLocalX = Number(part?.offsetLocalX ?? 0) * safeScaleX;
                    const offsetLocalDepth = Number(part?.offsetLocalY ?? 0) * safeScaleZ;
                    const cosYaw = Math.cos(finalYawRad);
                    const sinYaw = Math.sin(finalYawRad);
                    // Three.js RotationY(+yaw): worldX = ox*cos + oz*sin, worldZ = -ox*sin + oz*cos.
                    // This now matches the authoritative runtime build (sceneCollision.js / GameRoom).
                    mesh.position.x += (offsetLocalX * cosYaw) + (offsetLocalDepth * sinYaw);
                    mesh.position.z += (-offsetLocalX * sinYaw) + (offsetLocalDepth * cosYaw);
                    mesh.userData.collisionModelName = String(modelDef.path || "").replace("/models/", "");
                    mesh.userData.collisionYawDeg = Math.round(finalYawDeg);
                    mesh.userData.collisionSolid = isSolid;
                    mesh.userData.collisionWalkable = isWalkable;
                    mesh.userData.collisionFallback = isFallback;
                    mesh.userData.collisionSuspect = suspect;
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

        const index = root.userData?.editorModelIndex;
        const modelDef = resolveSceneModelDef(
            root,
            Number.isInteger(index) && index >= 0 ? getEditorModelByIndex(index) : null
        );
        const measured = measureModelLocalColliderBounds(root, modelDef);
        const modelPath = String(modelDef.path || root.userData?.modelPath || "").toLowerCase();
        if (!modelPath) {
            return null;
        }

        return buildProfileSuggestionFromMeasurement(measured, modelPath, modelDef);
    }

    // Full diagnostics for the model under the crosshair: resolved profile source,
    // scene scale, profile vs final world dimensions, local + world offsets, yaw,
    // solid/walkable and per-box list. Backs the `colinfo` console command.
    async function getCollisionDiagnosticsAtCrosshair() {
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
        const index = root.userData?.editorModelIndex;
        const modelDef = resolveSceneModelDef(
            root,
            Number.isInteger(index) && index >= 0 ? getEditorModelByIndex(index) : null
        );
        const modelPath = String(modelDef.path || root.userData?.modelPath || "");
        if (!modelPath) {
            return null;
        }

        let profiles = {};
        try {
            const response = await fetch("/world/collision-profiles.json", { cache: "no-store" });
            if (response.ok) {
                profiles = await response.json();
            }
        } catch (_error) {
        }

        const resolved = resolveCollisionTemplateForPath(modelPath, profiles);
        const template = resolved.template;
        const scale = readScale(modelDef.scale);
        const sx = Number.isFinite(Number(scale.x)) && Number(scale.x) > 0 ? Number(scale.x) : 1;
        const sy = Number.isFinite(Number(scale.y)) && Number(scale.y) > 0 ? Number(scale.y) : 1;
        const sz = Number.isFinite(Number(scale.z)) && Number(scale.z) > 0 ? Number(scale.z) : 1;
        const yawDeg = readModelYawDegrees(modelDef);
        const yawRad = yawDeg * Math.PI / 180;
        const cosYaw = Math.cos(yawRad);
        const sinYaw = Math.sin(yawRad);
        const parts = Array.isArray(template.boxes) && template.boxes.length > 0 ? template.boxes : [template];

        const boxes = parts.map(part => {
            let hw = Number(part.halfWidth || 0) * sx;
            let hd = Number(part.halfDepth || 0) * sz;
            if (template.kind === "wall" || isWallLikeModelPath(modelPath)) {
                const tightened = tightenWallFootprint(hw, hd, modelPath, template, sx, sz);
                hw = tightened.halfWidth;
                hd = tightened.halfDepth;
            }
            const oX = Number(part.offsetLocalX ?? 0) * sx;
            const oDepth = Number(part.offsetLocalY ?? 0) * sz;
            return {
                profile: {
                    halfWidth: Number(part.halfWidth ?? 0),
                    halfDepth: Number(part.halfDepth ?? 0),
                    height: Number(part.height ?? 0)
                },
                worldHalfWidth: Number(hw.toFixed(2)),
                worldHalfDepth: Number(hd.toFixed(2)),
                worldHeight: Number((Number(part.height || 0) * sy).toFixed(2)),
                offsetLocal: {
                    x: Number((part.offsetLocalX ?? 0)),
                    y: Number((part.offsetLocalY ?? 0)),
                    z: Number((part.offsetLocalZ ?? 0))
                },
                offsetWorld: {
                    x: Number(((oX * cosYaw) + (oDepth * sinYaw)).toFixed(2)),
                    z: Number(((-oX * sinYaw) + (oDepth * cosYaw)).toFixed(2))
                },
                suspect: isSuspectBoxDims(hw, hd, Number(part.height || 0) * sy)
            };
        });

        return {
            path: modelPath,
            source: resolved.source,
            isFallback: resolved.source !== "exact",
            sceneScale: { x: sx, y: sy, z: sz },
            yawDeg: Number(yawDeg.toFixed(2)),
            solid: Boolean(template.solid),
            walkable: Boolean(template.walkable),
            kind: template.kind || "",
            wallAxis: template.wallAxis || "",
            elevationLift: Number(template.elevationLift ?? 0),
            boxCount: boxes.length,
            boxes
        };
    }

    function buildStackedBoxes(halfWidth, halfDepth, height, count, topScale = 0.35, baseOffset = {}) {
        const baseOffsetLocalX = Number(baseOffset.offsetLocalX ?? 0);
        const baseOffsetLocalY = Number(baseOffset.offsetLocalY ?? 0);
        const baseOffsetLocalZ = Number(baseOffset.offsetLocalZ ?? 0);
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
                offsetLocalX: baseOffsetLocalX,
                offsetLocalY: baseOffsetLocalY,
                offsetLocalZ: Number((baseOffsetLocalZ + (i * segmentHeight)).toFixed(2)),
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

    function buildAutoBoxesForModel(modelPath, halfWidth, halfDepth, height, density = 16, offsets = {}) {
        const path = (modelPath || "").toLowerCase();
        const safeDensity = Math.max(1, Math.min(96, Math.floor(Number(density) || 16)));
        const adaptiveMode = Number(density) <= 0;
        const baseOffsetLocalX = Number(offsets.offsetLocalX ?? 0);
        const baseOffsetLocalY = Number(offsets.offsetLocalY ?? 0);
        const baseOffsetLocalZ = Number(offsets.offsetLocalZ ?? 0);

        const oneBox = (w, d, h, offX = baseOffsetLocalX, offY = baseOffsetLocalY, offZ = baseOffsetLocalZ, yaw = 0) => ([{
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
            return buildStackedBoxes(halfWidth * 0.34, halfDepth * 0.34, Math.max(8, height * 0.88), count, 0.28, offsets);
        }

        if (path.includes("/wall-") || path.includes("/door-") || path.includes("/window-")) {
            const tightened = tightenWallFootprint(halfWidth, halfDepth, path);
            return oneBox(tightened.halfWidth, tightened.halfDepth, Math.max(8, height * 0.98));
        }

        if (path.includes("/truck-") || path.includes("/car-")) {
            const bodyH = Number(Math.max(10, height * 0.62).toFixed(2));
            const cabinH = Number(Math.max(8, height * 0.38).toFixed(2));
            return [
                {
                    halfWidth: Number(Math.max(6, halfWidth * 0.92).toFixed(2)),
                    halfDepth: Number(Math.max(6, halfDepth * 0.92).toFixed(2)),
                    height: bodyH,
                    offsetLocalX: baseOffsetLocalX,
                    offsetLocalY: baseOffsetLocalY,
                    offsetLocalZ: baseOffsetLocalZ,
                    yawOffsetDeg: 0
                },
                {
                    halfWidth: Number(Math.max(4, halfWidth * 0.58).toFixed(2)),
                    halfDepth: Number(Math.max(4, halfDepth * 0.48).toFixed(2)),
                    height: cabinH,
                    offsetLocalX: Number((baseOffsetLocalX + halfWidth * 0.18).toFixed(2)),
                    offsetLocalY: baseOffsetLocalY,
                    offsetLocalZ: Number((baseOffsetLocalZ + bodyH * 0.35).toFixed(2)),
                    yawOffsetDeg: 0
                }
            ];
        }
        if (path.includes("rock") || path.includes("bush") || path.includes("shrub")) {
            const count = adaptiveMode
                ? estimateAdaptiveBoxCount(halfWidth, halfDepth, height, 2, 10)
                : safeDensity;
            return buildStackedBoxes(halfWidth * 0.72, halfDepth * 0.72, Math.max(6, height * 0.82), count, 0.48, offsets);
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
            ? 1
            : safeDensity;
        if (genericCount <= 1) {
            return oneBox(halfWidth * 0.96, halfDepth * 0.96, height * 0.98);
        }
        return buildStackedBoxes(halfWidth * 0.96, halfDepth * 0.96, height * 0.98, genericCount, 0.88, offsets);
    }

    function averageSamples(samples, key) {
        return samples.reduce((sum, item) => sum + item[key], 0) / samples.length;
    }

    // Profiles are authored normalized at scale=1 (i.e. ~object * objScale 128), so a wall
    // half-extent of ~64 is normal. Clamp generated values so autocolboxes never persists
    // NaN / non-positive / absurd dimensions into collision-profiles.json.
    const PROFILE_MAX_HALF = 1024;
    const PROFILE_MAX_HEIGHT = 2048;
    const PROFILE_MIN_DIM = 0.5;

    function clampProfileDim(value, max) {
        const v = Number(value);
        if (!Number.isFinite(v) || v <= 0) {
            return PROFILE_MIN_DIM;
        }
        return Number(Math.min(v, max).toFixed(2));
    }

    function sanitizeSuggestion(suggestion) {
        suggestion.halfWidth = clampProfileDim(suggestion.halfWidth, PROFILE_MAX_HALF);
        suggestion.halfDepth = clampProfileDim(suggestion.halfDepth, PROFILE_MAX_HALF);
        suggestion.height = clampProfileDim(suggestion.height, PROFILE_MAX_HEIGHT);
        if (Array.isArray(suggestion.boxes)) {
            suggestion.boxes.forEach(box => {
                box.halfWidth = clampProfileDim(box.halfWidth, PROFILE_MAX_HALF);
                box.halfDepth = clampProfileDim(box.halfDepth, PROFILE_MAX_HALF);
                box.height = clampProfileDim(box.height, PROFILE_MAX_HEIGHT);
            });
        }
        ["offsetLocalX", "offsetLocalY", "offsetLocalZ", "elevationLift"].forEach(key => {
            if (!Number.isFinite(Number(suggestion[key]))) {
                suggestion[key] = 0;
            }
        });
        return suggestion;
    }

    function getCollisionProfileSuggestionsForScene(filter = "all", density = 16) {
        const normalizedFilter = String(filter || "all").toLowerCase();
        const byPath = new Map();
        for (const root of worldModelGroup.children) {
            root.updateMatrixWorld(true);

            const index = root.userData?.editorModelIndex;
            const modelDef = resolveSceneModelDef(
                root,
                Number.isInteger(index) && index >= 0 ? getEditorModelByIndex(index) : null
            );
            const modelPath = String(modelDef.path || root.userData?.modelPath || "").toLowerCase();
            if (!modelPath) {
                continue;
            }
            if (normalizedFilter !== "all" && !modelPath.includes(normalizedFilter)) {
                continue;
            }

            const measured = measureModelLocalColliderBounds(root, modelDef);
            const normalized = normalizeProfileMeasurements(measured, modelDef);
            if (!byPath.has(modelPath)) {
                byPath.set(modelPath, []);
            }
            byPath.get(modelPath).push(normalized);
        }

        const suggestions = [];
        for (const [modelPath, samples] of byPath.entries()) {
            if (!samples || samples.length === 0) {
                continue;
            }
            const avgHalfWidth = averageSamples(samples, "halfWidth");
            const avgHalfDepth = averageSamples(samples, "halfDepth");
            const avgHeight = averageSamples(samples, "height");
            const offsets = {
                offsetLocalX: averageSamples(samples, "offsetLocalX"),
                offsetLocalY: averageSamples(samples, "offsetLocalY"),
                offsetLocalZ: averageSamples(samples, "offsetLocalZ")
            };
            const elevationLift = averageSamples(samples, "elevationLift");
            const boxes = buildAutoBoxesForModel(modelPath, avgHalfWidth, avgHalfDepth, avgHeight, density, offsets);
            const solid = !isAlwaysNonSolidModel(modelPath);
            suggestions.push(sanitizeSuggestion({
                value: modelPath,
                halfWidth: Number(avgHalfWidth.toFixed(2)),
                halfDepth: Number(avgHalfDepth.toFixed(2)),
                height: Number(avgHeight.toFixed(2)),
                yawOffsetDeg: 0,
                offsetLocalX: Number(offsets.offsetLocalX.toFixed(2)),
                offsetLocalY: Number(offsets.offsetLocalY.toFixed(2)),
                offsetLocalZ: Number(offsets.offsetLocalZ.toFixed(2)),
                elevationLift: Number(elevationLift.toFixed(2)),
                solid,
                walkable: true,
                boxes
            }));
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

    async function rebuildCollisionDebugBoxes() {
        collisionDebugBuilt = false;
        if (collisionDebugGroup.visible) {
            await buildCollisionDebugBoxes();
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
        const solid = hitMesh.userData?.collisionSolid ? "solid" : "nonsolid";
        const walkable = hitMesh.userData?.collisionWalkable ? "walk" : "nowalk";
        const flags = [];
        if (hitMesh.userData?.collisionFallback) {
            flags.push("FALLBACK");
        }
        if (hitMesh.userData?.collisionSuspect) {
            flags.push("SUSPECT");
        }
        const flagText = flags.length > 0 ? ` | ${flags.join("/")}` : "";
        collisionDebugHoverLabel.textContent = `${modelName} | ry=${yawDeg} | ${solid}/${walkable}${flagText}`;
        collisionDebugHoverLabel.style.display = "block";
        collisionDebugHoverLabel.style.left = `${screenX}px`;
        collisionDebugHoverLabel.style.top = `${screenY}px`;
    }

    return {
        group: collisionDebugGroup,
        getCollisionProfileSuggestionAtCrosshair,
        getCollisionProfileSuggestionsForScene,
        getCollisionDiagnosticsAtCrosshair,
        setCollisionDebugVisible,
        rebuildCollisionDebugBoxes,
        updateCollisionDebugLabels
    };
}
