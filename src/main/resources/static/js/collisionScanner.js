import * as THREE from "/vendor/three/build/three.module.js";
import {
    collectMeshTargets,
    isAlwaysNonSolidModel,
    isRoadLikeModelPath,
    isRoofLikeModelPath,
    isWallLikeModelPath,
    measureExtentsFromVertices,
    measureModelLocalColliderBounds,
    normalizeProfileMeasurements,
    readEffectiveRootScale,
    readSceneScale
} from "./collisionMeasure.js";

export const DEFAULT_SCAN_OPTIONS = {
    cellSize: 2.0,
    heightSlices: 16,
    minOccupancyRatio: 0.35,
    surfaceRayDensity: 4,
    interiorProbeCount: 8,
    percentileTrim: [0.005, 0.995],
    playerMargin: 0.0,
    maxParts: 12,
    maxRescanRetries: 3,
    interiorVoidMinCells: 4,
    mergeSliceIoU: 0.85,
    rectangularFillThreshold: 0.92,
    compoundFillThreshold: 0.85,
    coverageTarget: 0.96,
    coverageSampleCount: 2500,
    refineCoverage: false,
    refineCellSteps: null
};

/** Max accuracy: fine grid, many rays, refine cell size until coverage target. */
export const AGGRESSIVE_SCAN_OPTIONS = {
    cellSize: 1.0,
    heightSlices: 32,
    minOccupancyRatio: 0.25,
    surfaceRayDensity: 8,
    interiorProbeCount: 12,
    percentileTrim: [0.001, 0.999],
    playerMargin: 0.0,
    maxParts: 24,
    maxRescanRetries: 4,
    interiorVoidMinCells: 3,
    mergeSliceIoU: 0.92,
    rectangularFillThreshold: 0.88,
    compoundFillThreshold: 0.82,
    coverageTarget: 0.99,
    coverageSampleCount: 10000,
    refineCoverage: true,
    refineCellSteps: [1.0, 0.75, 0.5, 0.35, 0.25]
};

export function resolveScanOptions(userOptions = {}) {
    const aggressive = userOptions.aggressive === true
        || userOptions.mode === "aggressive";
    const base = aggressive ? AGGRESSIVE_SCAN_OPTIONS : DEFAULT_SCAN_OPTIONS;
    const { aggressive: _a, mode: _m, ...rest } = userOptions;
    return { ...base, ...rest, aggressive };
}

const COLLISION_MIN_DIM = 0.05;
const PROFILE_MAX_HALF = 1024;
const PROFILE_MAX_HEIGHT = 2048;

const _rayOrigin = new THREE.Vector3();
const _rayDir = new THREE.Vector3(0, -1, 0);
const _hitLocal = new THREE.Vector3();
const _invRootMatrix = new THREE.Matrix4();
const _raycaster = new THREE.Raycaster();

/** Profile units = geometry-local * profileNorm (e.g. ~128 for .obj at scene scale 1). */
function getProfileNorm(rootScale, sceneScale) {
    return {
        x: rootScale.x / Math.max(1e-6, sceneScale.x),
        y: rootScale.y / Math.max(1e-6, sceneScale.y),
        z: rootScale.z / Math.max(1e-6, sceneScale.z)
    };
}

function geomCellSize(worldCellSize, rootScale) {
    const footprintScale = Math.max(rootScale.x, rootScale.z, 1e-6);
    return worldCellSize / footprintScale;
}

function clampDim(value, max = PROFILE_MAX_HALF) {
    const v = Number(value);
    if (!Number.isFinite(v) || v <= 0) {
        return COLLISION_MIN_DIM;
    }
    return Number(Math.min(v, max).toFixed(2));
}

function tightenWallFootprint(halfWidth, halfDepth) {
    const w = halfWidth;
    const d = halfDepth;
    const longSide = Math.max(w, d);
    const shortSide = Math.min(w, d);
    const aspect = shortSide / Math.max(longSide, 1e-6);
    if (aspect > 0.72) {
        const thinHalf = Math.max(3.5, Math.min(shortSide * 0.14, longSide * 0.065));
        if (w >= d) {
            return { halfWidth: longSide * 0.96, halfDepth: thinHalf };
        }
        return { halfWidth: thinHalf, halfDepth: longSide * 0.96 };
    }
    return { halfWidth: w * 0.96, halfDepth: d * 0.96 };
}

function createGrid(cols, rows) {
    return Array.from({ length: rows }, () => new Uint8Array(cols));
}

function gridCopy(grid) {
    return grid.map(row => row.slice());
}

function gridIoU(a, b) {
    let inter = 0;
    let union = 0;
    for (let r = 0; r < a.length; r += 1) {
        for (let c = 0; c < a[r].length; c += 1) {
            const av = a[r][c] > 0;
            const bv = b[r][c] > 0;
            if (av && bv) {
                inter += 1;
            }
            if (av || bv) {
                union += 1;
            }
        }
    }
    return union > 0 ? inter / union : 1;
}

function countOccupied(grid) {
    let n = 0;
    for (let r = 0; r < grid.length; r += 1) {
        for (let c = 0; c < grid[r].length; c += 1) {
            if (grid[r][c] > 0) {
                n += 1;
            }
        }
    }
    return n;
}

function countConnectedComponents(grid) {
    const rows = grid.length;
    const cols = grid[0]?.length || 0;
    const visited = createGrid(cols, rows);
    let components = 0;
    const stack = [];

    for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c < cols; c += 1) {
            if (!grid[r][c] || visited[r][c]) {
                continue;
            }
            components += 1;
            stack.length = 0;
            stack.push(r, c);
            visited[r][c] = 1;
            while (stack.length > 0) {
                const cr = stack.pop();
                const cc = stack.pop();
                if (cr > 0 && !visited[cr - 1][cc] && grid[cr - 1][cc]) {
                    visited[cr - 1][cc] = 1;
                    stack.push(cr - 1, cc);
                }
                if (cr + 1 < rows && !visited[cr + 1][cc] && grid[cr + 1][cc]) {
                    visited[cr + 1][cc] = 1;
                    stack.push(cr + 1, cc);
                }
                if (cc > 0 && !visited[cr][cc - 1] && grid[cr][cc - 1]) {
                    visited[cr][cc - 1] = 1;
                    stack.push(cr, cc - 1);
                }
                if (cc + 1 < cols && !visited[cr][cc + 1] && grid[cr][cc + 1]) {
                    visited[cr][cc + 1] = 1;
                    stack.push(cr, cc + 1);
                }
            }
        }
    }
    return components;
}

function computePcaYawDeg(grid, xMin, zMin, cellSize) {
    const points = [];
    for (let r = 0; r < grid.length; r += 1) {
        for (let c = 0; c < grid[r].length; c += 1) {
            if (grid[r][c]) {
                points.push({
                    x: xMin + (c + 0.5) * cellSize,
                    z: zMin + (r + 0.5) * cellSize
                });
            }
        }
    }
    if (points.length < 3) {
        return 0;
    }
    let mx = 0;
    let mz = 0;
    for (const p of points) {
        mx += p.x;
        mz += p.z;
    }
    mx /= points.length;
    mz /= points.length;
    let cxx = 0;
    let czz = 0;
    let cxz = 0;
    for (const p of points) {
        const dx = p.x - mx;
        const dz = p.z - mz;
        cxx += dx * dx;
        czz += dz * dz;
        cxz += dx * dz;
    }
    const angle = 0.5 * Math.atan2(2 * cxz, cxx - czz);
    return angle * (180 / Math.PI);
}

function rotatePoint(x, z, yawRad) {
    const cos = Math.cos(yawRad);
    const sin = Math.sin(yawRad);
    return {
        x: x * cos - z * sin,
        z: x * sin + z * cos
    };
}

function inverseRotatePoint(x, z, yawRad) {
    const cos = Math.cos(yawRad);
    const sin = Math.sin(yawRad);
    return {
        x: x * cos + z * sin,
        z: -x * sin + z * cos
    };
}

function buildOccupancyGrid(meshes, bounds, cellSize, yLow, yHigh, options, root) {
    const xMin = bounds.xMin;
    const xMax = bounds.xMax;
    const zMin = bounds.zMin;
    const zMax = bounds.zMax;
    const MAX_GRID_DIM = 384;
    let localCell = cellSize;
    while (Math.ceil((xMax - xMin) / localCell) > MAX_GRID_DIM
        || Math.ceil((zMax - zMin) / localCell) > MAX_GRID_DIM) {
        localCell *= 1.25;
    }
    const cols = Math.max(1, Math.ceil((xMax - xMin) / localCell));
    const rows = Math.max(1, Math.ceil((zMax - zMin) / localCell));
    const grid = createGrid(cols, rows);
    const rayY = yHigh + localCell * 4;
    const jitter = localCell * 0.22;
    _invRootMatrix.copy(root.matrixWorld).invert();

    for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c < cols; c += 1) {
            const cx = xMin + (c + 0.5) * localCell;
            const cz = zMin + (r + 0.5) * localCell;
            const probes = [
                [cx, cz],
                [cx - jitter, cz - jitter],
                [cx + jitter, cz - jitter],
                [cx - jitter, cz + jitter],
                [cx + jitter, cz + jitter]
            ];
            for (let p = 0; p < options.surfaceRayDensity && p < probes.length; p += 1) {
                const [px, pz] = probes[p];
                _rayOrigin.set(px, rayY, pz);
                root.localToWorld(_rayOrigin);
                _rayDir.set(0, -1, 0);
                _raycaster.set(_rayOrigin, _rayDir);
                const hits = _raycaster.intersectObjects(meshes, false);
                for (const hit of hits) {
                    _hitLocal.copy(hit.point);
                    _hitLocal.applyMatrix4(_invRootMatrix);
                    if (_hitLocal.y >= yLow - 0.01 && _hitLocal.y <= yHigh + 0.01) {
                        grid[r][c] = 1;
                        break;
                    }
                }
                if (grid[r][c]) {
                    break;
                }
            }
        }
    }
    return { grid, cols, rows, xMin, zMin };
}

function scanLayers(meshes, bounds, options, root, modelPath = "") {
    const yMin = bounds.yMin;
    const yMax = bounds.yMax;
    const sliceH = (yMax - yMin) / options.heightSlices;
    const slices = [];
    for (let i = 0; i < options.heightSlices; i += 1) {
        const low = yMin + i * sliceH;
        const high = yMin + (i + 1) * sliceH;
        const { grid, xMin, zMin } = buildOccupancyGrid(
            meshes, bounds, options.localCellSize, low, high, options, root
        );
        if (countOccupied(grid) === 0) {
            continue;
        }
        slices.push({ baseY: low, topY: high, grid, xMin, zMin });
    }
    const mergeIoU = isRoadLikeModelPath(modelPath)
        ? Math.max(options.mergeSliceIoU, 0.96)
        : options.mergeSliceIoU;
    return mergeVerticalSlices(slices, mergeIoU);
}

function mergeVerticalSlices(slices, iouThreshold) {
    if (slices.length === 0) {
        return [];
    }
    const merged = [{ ...slices[0], grid: gridCopy(slices[0].grid) }];
    for (let i = 1; i < slices.length; i += 1) {
        const prev = merged[merged.length - 1];
        const cur = slices[i];
        const iou = gridIoU(prev.grid, cur.grid);
        if (iou >= iouThreshold) {
            prev.topY = cur.topY;
            for (let r = 0; r < prev.grid.length; r += 1) {
                for (let c = 0; c < prev.grid[r].length; c += 1) {
                    prev.grid[r][c] = prev.grid[r][c] || cur.grid[r][c] ? 1 : 0;
                }
            }
        } else {
            merged.push({ ...cur, grid: gridCopy(cur.grid) });
        }
    }
    return merged;
}

function findLargestRectangle(grid) {
    const rows = grid.length;
    const cols = grid[0]?.length || 0;
    const heights = new Int32Array(cols);
    let bestArea = 0;
    let best = null;

    for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c < cols; c += 1) {
            heights[c] = grid[r][c] ? heights[c] + 1 : 0;
        }
        const stack = [];
        for (let c = 0; c <= cols; c += 1) {
            const h = c < cols ? heights[c] : 0;
            while (stack.length > 0 && heights[stack[stack.length - 1]] > h) {
                const top = stack.pop();
                const height = heights[top];
                const width = stack.length === 0 ? c : c - stack[stack.length - 1] - 1;
                const area = height * width;
                if (area > bestArea) {
                    bestArea = area;
                    const colStart = stack.length === 0 ? 0 : stack[stack.length - 1] + 1;
                    best = { rowStart: r - height + 1, rowEnd: r, colStart, colEnd: colStart + width - 1 };
                }
            }
            stack.push(c);
        }
    }
    return best;
}

function clearRectangle(grid, rect) {
    for (let r = rect.rowStart; r <= rect.rowEnd; r += 1) {
        for (let c = rect.colStart; c <= rect.colEnd; c += 1) {
            grid[r][c] = 0;
        }
    }
}

function gridRectToBox(rect, layer, cellSize, yawOffsetDeg, profileNorm) {
    const yawRad = yawOffsetDeg * (Math.PI / 180);
    const xMin = layer.xMin + rect.colStart * cellSize;
    const xMax = layer.xMin + (rect.colEnd + 1) * cellSize;
    const zMin = layer.zMin + rect.rowStart * cellSize;
    const zMax = layer.zMin + (rect.rowEnd + 1) * cellSize;
    const cx = (xMin + xMax) / 2;
    const cz = (zMin + zMax) / 2;
    const hw = (xMax - xMin) / 2;
    const hd = (zMax - zMin) / 2;
    const inv = inverseRotatePoint(cx, cz, yawRad);
    const layerHeight = layer.topY - layer.baseY;
    return {
        halfWidth: clampDim(hw * profileNorm.x),
        halfDepth: clampDim(hd * profileNorm.z),
        height: clampDim(layerHeight * profileNorm.y, PROFILE_MAX_HEIGHT),
        offsetLocalX: Number((inv.x * profileNorm.x).toFixed(2)),
        offsetLocalY: Number((inv.z * profileNorm.z).toFixed(2)),
        offsetLocalZ: Number((layer.baseY * profileNorm.y).toFixed(2)),
        yawOffsetDeg: Number(yawOffsetDeg.toFixed(2))
    };
}

function trimProfileParts(boxes, maxParts) {
    if (boxes.length <= maxParts) {
        return boxes;
    }
    return [...boxes]
        .sort((a, b) => (b.halfWidth * b.halfDepth * b.height) - (a.halfWidth * a.halfDepth * a.height))
        .slice(0, maxParts);
}

function decomposeGridToBoxes(grid, layer, cellSize, yawOffsetDeg, profileNorm, maxParts) {
    const working = gridCopy(grid);
    const boxes = [];
    while (countOccupied(working) > 0 && boxes.length < maxParts) {
        const rect = findLargestRectangle(working);
        if (!rect) {
            break;
        }
        boxes.push(gridRectToBox(rect, layer, cellSize, yawOffsetDeg, profileNorm));
        clearRectangle(working, rect);
    }
    return boxes;
}

function floodFillExterior(freeGrid) {
    const rows = freeGrid.length;
    const cols = freeGrid[0]?.length || 0;
    const exterior = createGrid(cols, rows);
    const queue = [];

    function enqueue(r, c) {
        if (r < 0 || c < 0 || r >= rows || c >= cols || exterior[r][c]) {
            return;
        }
        if (freeGrid[r][c] === 0) {
            return;
        }
        exterior[r][c] = 1;
        queue.push([r, c]);
    }

    for (let c = 0; c < cols; c += 1) {
        enqueue(0, c);
        enqueue(rows - 1, c);
    }
    for (let r = 0; r < rows; r += 1) {
        enqueue(r, 0);
        enqueue(r, cols - 1);
    }

    while (queue.length > 0) {
        const [r, c] = queue.pop();
        enqueue(r - 1, c);
        enqueue(r + 1, c);
        enqueue(r, c - 1);
        enqueue(r, c + 1);
    }
    return exterior;
}

function findInteriorVoids(occupiedGrid) {
    const rows = occupiedGrid.length;
    const cols = occupiedGrid[0]?.length || 0;
    const freeGrid = createGrid(cols, rows);
    for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c < cols; c += 1) {
            freeGrid[r][c] = occupiedGrid[r][c] ? 0 : 1;
        }
    }
    const exterior = floodFillExterior(freeGrid);
    const interior = createGrid(cols, rows);
    for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c < cols; c += 1) {
            if (freeGrid[r][c] && !exterior[r][c]) {
                interior[r][c] = 1;
            }
        }
    }
    return interior;
}

function singleBoxFromBounds(bounds, profileNorm, yawOffsetDeg = 0) {
    return {
        halfWidth: clampDim(((bounds.xMax - bounds.xMin) / 2) * profileNorm.x),
        halfDepth: clampDim(((bounds.zMax - bounds.zMin) / 2) * profileNorm.z),
        height: clampDim((bounds.yMax - bounds.yMin) * profileNorm.y, PROFILE_MAX_HEIGHT),
        offsetLocalX: Number((((bounds.xMin + bounds.xMax) / 2) * profileNorm.x).toFixed(2)),
        offsetLocalY: Number((((bounds.zMin + bounds.zMax) / 2) * profileNorm.z).toFixed(2)),
        offsetLocalZ: Number((bounds.yMin * profileNorm.y).toFixed(2)),
        yawOffsetDeg: Number(yawOffsetDeg.toFixed(2))
    };
}

function sanitizeProfilePart(part) {
    return {
        halfWidth: clampDim(part.halfWidth),
        halfDepth: clampDim(part.halfDepth),
        height: clampDim(part.height, PROFILE_MAX_HEIGHT),
        offsetLocalX: Number(part.offsetLocalX ?? 0),
        offsetLocalY: Number(part.offsetLocalY ?? 0),
        offsetLocalZ: Number(part.offsetLocalZ ?? 0),
        yawOffsetDeg: Number(part.yawOffsetDeg ?? 0)
    };
}

function buildProfileFromScan(root, modelDef, modelPath, options) {
    const measured = measureModelLocalColliderBounds(root, modelDef, options.percentileTrim);
    const sceneScale = readSceneScale(modelDef);
    const rootScale = measured.rootScale || readEffectiveRootScale(root, modelDef, modelPath);
    const profileNorm = getProfileNorm(rootScale, sceneScale);
    const normalized = normalizeProfileMeasurements(measured, modelDef);
    const meshes = collectMeshTargets(root);
    if (meshes.length === 0 || !measured.bounds) {
        return null;
    }

    const bounds = measured.bounds;
    const scanOptions = {
        ...options,
        localCellSize: geomCellSize(options.cellSize, rootScale)
    };
    let boxes = [];
    let antiBoxes = [];

    // Slanted roofs: horizontal slice grid produces vertical slivers — use one AABB.
    if (isRoofLikeModelPath(modelPath)) {
        boxes = [singleBoxFromBounds(bounds, profileNorm)];
        antiBoxes = [];
    } else {
        const layers = scanLayers(meshes, bounds, scanOptions, root, modelPath);

    if (layers.length === 0) {
        return { tooManyParts: true };
    } else {
        for (const layer of layers) {
            const yawOffsetDeg = computePcaYawDeg(layer.grid, layer.xMin, layer.zMin, scanOptions.localCellSize);
            const yawRad = -yawOffsetDeg * (Math.PI / 180);
            const cols = layer.grid[0].length;
            const rows = layer.grid.length;
            const rotatedGrid = createGrid(cols, rows);
            for (let r = 0; r < rows; r += 1) {
                for (let c = 0; c < cols; c += 1) {
                    if (!layer.grid[r][c]) {
                        continue;
                    }
                    const wx = layer.xMin + (c + 0.5) * scanOptions.localCellSize;
                    const wz = layer.zMin + (r + 0.5) * scanOptions.localCellSize;
                    const rp = rotatePoint(wx, wz, yawRad);
                    const lc = Math.floor((rp.x - layer.xMin) / scanOptions.localCellSize);
                    const lr = Math.floor((rp.z - layer.zMin) / scanOptions.localCellSize);
                    if (lr >= 0 && lr < rows && lc >= 0 && lc < cols) {
                        rotatedGrid[lr][lc] = 1;
                    }
                }
            }

            const totalCells = cols * rows;
            const occupied = countOccupied(rotatedGrid);
            const fillRatio = occupied / Math.max(1, totalCells);
            const components = countConnectedComponents(rotatedGrid);

            if (fillRatio > options.rectangularFillThreshold && components <= 1) {
                let minC = cols;
                let maxC = -1;
                let minR = rows;
                let maxR = -1;
                for (let r = 0; r < rows; r += 1) {
                    for (let c = 0; c < cols; c += 1) {
                        if (rotatedGrid[r][c]) {
                            minC = Math.min(minC, c);
                            maxC = Math.max(maxC, c);
                            minR = Math.min(minR, r);
                            maxR = Math.max(maxR, r);
                        }
                    }
                }
                if (maxC >= minC) {
                    boxes.push(gridRectToBox(
                        { rowStart: minR, rowEnd: maxR, colStart: minC, colEnd: maxC },
                        layer,
                        scanOptions.localCellSize,
                        yawOffsetDeg,
                        profileNorm
                    ));
                }
            } else {
                boxes.push(...decomposeGridToBoxes(
                    rotatedGrid,
                    layer,
                    scanOptions.localCellSize,
                    yawOffsetDeg,
                    profileNorm,
                    options.maxParts
                ));
            }

            const interior = findInteriorVoids(rotatedGrid);
            if (countOccupied(interior) >= options.interiorVoidMinCells) {
                antiBoxes.push(...decomposeGridToBoxes(
                    interior,
                    layer,
                    scanOptions.localCellSize,
                    yawOffsetDeg,
                    profileNorm,
                    options.maxParts
                ));
            }
        }
    }
    }

    if (boxes.length === 0) {
        return { tooManyParts: true };
    }

    if (boxes.length + antiBoxes.length > options.maxParts) {
        antiBoxes.length = 0;
    }
    if (boxes.length > options.maxParts) {
        boxes = trimProfileParts(boxes, options.maxParts);
    }

    boxes = boxes.map(sanitizeProfilePart);
    antiBoxes = antiBoxes.map(sanitizeProfilePart);

    if (boxes[0].halfWidth < 2 && boxes[0].halfDepth < 2) {
        return { tooManyParts: true };
    }

    const primary = boxes[0];
    let halfWidth = primary.halfWidth;
    let halfDepth = primary.halfDepth;

    const solid = isRoadLikeModelPath(modelPath) || !isAlwaysNonSolidModel(modelPath);
    let kind = "";
    let wallAxis = "";
    let thickness = 0;

    if (isRoofLikeModelPath(modelPath)) {
        kind = "roof";
    } else if (isRoadLikeModelPath(modelPath)) {
        kind = "road";
    } else if (isWallLikeModelPath(modelPath)) {
        const tightened = tightenWallFootprint(halfWidth, halfDepth);
        halfWidth = tightened.halfWidth;
        halfDepth = tightened.halfDepth;
        kind = "wall";
        wallAxis = halfWidth >= halfDepth ? "x" : "z";
        thickness = Math.min(halfWidth, halfDepth);
        if (boxes.length === 1) {
            boxes[0].halfWidth = halfWidth;
            boxes[0].halfDepth = halfDepth;
        }
    }

    return {
        value: modelPath,
        halfWidth,
        halfDepth,
        height: primary.height,
        yawOffsetDeg: 0,
        offsetLocalX: primary.offsetLocalX,
        offsetLocalY: primary.offsetLocalY,
        offsetLocalZ: primary.offsetLocalZ,
        elevationLift: Number(normalized.elevationLift.toFixed(2)),
        solid,
        walkable: true,
        kind,
        wallAxis,
        thickness: thickness > 0 ? Number(thickness.toFixed(2)) : 0,
        boxes,
        antiBoxes,
        _meshes: meshes,
        _bounds: bounds,
        _profileNorm: profileNorm
    };
}

export function scanCollisionProfile(root, modelDef, userOptions = {}) {
    const modelPath = String(modelDef?.path || root.userData?.modelPath || "").toLowerCase();
    if (!modelPath) {
        return null;
    }

    const originalY = root.rotation.y;
    root.rotation.y = 0;
    root.updateMatrixWorld(true);

    const baseOptions = resolveScanOptions(userOptions);
    const cellSteps = baseOptions.refineCoverage
        ? (Array.isArray(baseOptions.refineCellSteps) && baseOptions.refineCellSteps.length > 0
            ? baseOptions.refineCellSteps
            : [baseOptions.cellSize, baseOptions.cellSize * 0.75, baseOptions.cellSize * 0.5])
        : [baseOptions.cellSize];

    let bestResult = null;
    let bestCoverage = -1;
    let bestOptions = baseOptions;

    for (const cellSize of cellSteps) {
        let options = { ...baseOptions, cellSize };
        let result = null;

        for (let attempt = 0; attempt <= options.maxRescanRetries; attempt += 1) {
            result = buildProfileFromScan(root, modelDef, modelPath, options);
            if (!result || !result.tooManyParts) {
                break;
            }
            options = { ...options, cellSize: options.cellSize * 2 };
        }

        if (!result || result.tooManyParts) {
            continue;
        }

        const { _meshes, _bounds, _profileNorm, ...profileDraft } = result;
        const sampleCount = Number(options.coverageSampleCount) || 2500;
        const coverage = validateProfileCoverage(
            root, profileDraft, sampleCount, _meshes, _bounds, root, _profileNorm
        );

        if (coverage > bestCoverage) {
            bestCoverage = coverage;
            bestResult = { result, options };
            bestOptions = options;
        }

        if (baseOptions.refineCoverage && coverage >= (baseOptions.coverageTarget ?? 0.99)) {
            break;
        }
    }

    root.rotation.y = originalY;
    root.updateMatrixWorld(true);

    if (!bestResult) {
        return null;
    }

    const { result, options } = bestResult;
    const { _meshes, _bounds, _profileNorm, ...profile } = result;

    profile.scanMeta = {
        version: 1,
        mode: baseOptions.aggressive ? "aggressive" : "balanced",
        cellSize: options.cellSize,
        generatedAt: new Date().toISOString(),
        positiveCount: profile.boxes.length,
        antiCount: profile.antiBoxes.length,
        coverage: Number(bestCoverage.toFixed(4)),
        coverageTarget: baseOptions.coverageTarget ?? 0.96,
        refineSteps: cellSteps.length
    };

    return profile;
}

function pointInProfilePart(part, x, y, z, profileNorm) {
    const yawRad = Number(part.yawOffsetDeg ?? 0) * (Math.PI / 180);
    const cos = Math.cos(yawRad);
    const sin = -Math.sin(yawRad);
    const ox = Number(part.offsetLocalX ?? 0) * profileNorm.x;
    const oy = Number(part.offsetLocalY ?? 0) * profileNorm.z;
    const oz = Number(part.offsetLocalZ ?? 0) * profileNorm.y;
    const dx = x - ox;
    const dz = z - oy;
    const lx = dx * cos + dz * sin;
    const lz = -dx * sin + dz * cos;
    const hw = Number(part.halfWidth) * profileNorm.x;
    const hd = Number(part.halfDepth) * profileNorm.z;
    const h = Number(part.height) * profileNorm.y;
    return Math.abs(lx) <= hw && Math.abs(lz) <= hd && y >= oz && y <= oz + h;
}

function profileContainsPoint(profile, x, y, z, profileNorm) {
    const parts = Array.isArray(profile.boxes) && profile.boxes.length > 0 ? profile.boxes : [profile];
    const inPositive = parts.some(part => pointInProfilePart(part, x, y, z, profileNorm));
    if (!inPositive) {
        return false;
    }
    const antis = Array.isArray(profile.antiBoxes) ? profile.antiBoxes : [];
    return !antis.some(part => pointInProfilePart(part, x, y, z, profileNorm));
}

function meshContainsPoint(meshes, x, y, z, root) {
    _rayOrigin.set(x, y + 500, z);
    root.localToWorld(_rayOrigin);
    _rayDir.set(0, -1, 0);
    _raycaster.set(_rayOrigin, _rayDir);
    const down = _raycaster.intersectObjects(meshes, false);
    _invRootMatrix.copy(root.matrixWorld).invert();
    if (down.length > 0) {
        _hitLocal.copy(down[0].point).applyMatrix4(_invRootMatrix);
        if (_hitLocal.y <= y + 0.5) {
            return true;
        }
    }
    _rayOrigin.set(x, y - 500, z);
    root.localToWorld(_rayOrigin);
    _rayDir.set(0, 1, 0);
    _raycaster.set(_rayOrigin, _rayDir);
    const up = _raycaster.intersectObjects(meshes, false);
    if (up.length > 0) {
        _hitLocal.copy(up[0].point).applyMatrix4(_invRootMatrix);
        return _hitLocal.y >= y - 0.5;
    }
    return false;
}

export function validateProfileCoverage(root, profile, sampleCount = 10000, meshesOverride = null, boundsOverride = null, rootForRays = null, profileNormOverride = null) {
    const originalY = root.rotation.y;
    root.rotation.y = 0;
    root.updateMatrixWorld(true);

    const modelPath = String(profile.value || root.userData?.modelPath || "");
    const rootScale = readEffectiveRootScale(root, { path: modelPath, scale: { x: 1, y: 1, z: 1 } }, modelPath);
    const profileNorm = profileNormOverride || getProfileNorm(rootScale, { x: 1, y: 1, z: 1 });
    const rayRoot = rootForRays || root;

    const meshes = meshesOverride || collectMeshTargets(root);
    let bounds = boundsOverride;
    if (!bounds) {
        bounds = measureExtentsFromVertices(root, [0.005, 0.995]);
    }

    if (!bounds || meshes.length === 0) {
        root.rotation.y = originalY;
        root.updateMatrixWorld(true);
        return 0;
    }

    let agree = 0;
    const samples = Math.max(100, sampleCount);
    for (let i = 0; i < samples; i += 1) {
        const x = bounds.xMin + Math.random() * (bounds.xMax - bounds.xMin);
        const y = bounds.yMin + Math.random() * (bounds.yMax - bounds.yMin);
        const z = bounds.zMin + Math.random() * (bounds.zMax - bounds.zMin);
        const meshSolid = meshContainsPoint(meshes, x, y, z, rayRoot);
        const profileSolid = profileContainsPoint(profile, x, y, z, profileNorm);
        if (meshSolid === profileSolid) {
            agree += 1;
        }
    }

    root.rotation.y = originalY;
    root.updateMatrixWorld(true);
    return agree / samples;
}

export function scanCollisionProfileForRoots(roots, modelDefs, userOptions = {}) {
    const byPath = new Map();
    for (let i = 0; i < roots.length; i += 1) {
        const root = roots[i];
        const modelDef = modelDefs[i];
        const path = String(modelDef?.path || root.userData?.modelPath || "").toLowerCase();
        if (!path || byPath.has(path)) {
            continue;
        }
        root.updateMatrixWorld(true);
        const profile = scanCollisionProfile(root, modelDef, userOptions);
        if (profile) {
            byPath.set(path, profile);
        }
    }
    return Array.from(byPath.values());
}
