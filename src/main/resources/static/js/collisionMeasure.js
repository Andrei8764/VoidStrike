import * as THREE from "/vendor/three/build/three.module.js";

export const OBJ_WORLD_SCALE = 128;

const _vertexMeasure = new THREE.Vector3();
const _invRootMatrix = new THREE.Matrix4();

export function readScale(scale) {
    if (typeof scale === "number") {
        return { x: scale, y: scale, z: scale };
    }
    return {
        x: scale?.x ?? 1,
        y: scale?.y ?? 1,
        z: scale?.z ?? 1
    };
}

export function readSceneScale(modelDef) {
    return readScale(modelDef?.scale);
}

export function readEffectiveRootScale(root, modelDef, modelPath) {
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

export function scaleMeasuredExtents(extents, sx, sy, sz) {
    return {
        halfWidth: extents.halfWidth * sx,
        halfDepth: extents.halfDepth * sz,
        height: extents.height * sy,
        offsetLocalX: extents.offsetLocalX * sx,
        offsetLocalY: extents.offsetLocalY * sz,
        offsetLocalZ: extents.offsetLocalZ * sy
    };
}

export function normalizeProfileMeasurements(measured, modelDef) {
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

export function collectVerticesInRootSpace(root) {
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

export function percentileSorted(sorted, q) {
    if (sorted.length === 0) {
        return 0;
    }
    const idx = Math.floor((sorted.length - 1) * q);
    return sorted[idx];
}

export function measureExtentsFromVertices(root, percentileTrim = [0.02, 0.98]) {
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

    const [qLow, qHigh] = percentileTrim;
    const xMin = percentileSorted(xs, qLow);
    const xMax = percentileSorted(xs, qHigh);
    const yMin = percentileSorted(ys, qLow);
    const yMax = percentileSorted(ys, qHigh);
    const zMin = percentileSorted(zs, qLow);
    const zMax = percentileSorted(zs, qHigh);

    return {
        halfWidth: Math.max(0.5, (xMax - xMin) / 2),
        halfDepth: Math.max(0.5, (zMax - zMin) / 2),
        height: Math.max(0.5, yMax - yMin),
        offsetLocalX: (xMin + xMax) / 2,
        offsetLocalY: (zMin + zMax) / 2,
        offsetLocalZ: yMin,
        xMin, xMax, yMin, yMax, zMin, zMax
    };
}

export function isRoofLikeModelPath(modelPath) {
    const path = String(modelPath || "").toLowerCase();
    return path.includes("/roof-")
        || path.includes("-roof-")
        || path.includes("roof-slant")
        || path.includes("roof-detailed");
}

export function isWallLikeModelPath(modelPath) {
    if (isRoofLikeModelPath(modelPath)) {
        return false;
    }
    const path = String(modelPath || "").toLowerCase();
    return path.includes("/wall-")
        || path.includes("/door-")
        || path.includes("/window-")
        || path.includes("/planks.obj");
}

export function isRoadLikeModelPath(modelPath) {
    const path = String(modelPath || "").toLowerCase();
    return path.includes("/road-")
        || path.includes("asphalt")
        || path.includes("pavement")
        || path.includes("/road-dirt");
}

export function isAlwaysNonSolidModel(modelPath) {
    const path = String(modelPath || "").toLowerCase();
    if (!path) {
        return false;
    }
    const nonSolidTokens = [
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

export function collectMeshTargets(root) {
    const meshes = [];
    root.traverse(node => {
        if (node.isMesh && node.geometry) {
            meshes.push(node);
        }
    });
    return meshes;
}

export function measureModelLocalColliderBounds(root, modelDef, percentileTrim = [0.02, 0.98]) {
    const originalY = root.rotation.y;
    root.rotation.y = 0;
    root.updateMatrixWorld(true);

    const rootPos = new THREE.Vector3();
    root.getWorldPosition(rootPos);

    const modelPath = String(modelDef?.path || root.userData?.modelPath || "");
    const rootScale = readEffectiveRootScale(root, modelDef, modelPath);
    const fromVertices = measureExtentsFromVertices(root, percentileTrim);
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
        elevationLift,
        rootScale,
        bounds: fromVertices
    };
}
