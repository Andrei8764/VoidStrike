package me.andrei9876.voidstrike.world.collision;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

import java.time.Instant;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.Comparator;
import java.util.Locale;
import java.util.Random;

public final class CollisionProfileScanner {

    private static final double COLLISION_MIN_DIM = 0.05;
    private static final double PROFILE_MAX_HALF = 1024;
    private static final double PROFILE_MAX_HEIGHT = 2048;

    private record ProfileNorm(double x, double y, double z) {
    }

    private record ProfilePart(
            double halfWidth,
            double halfDepth,
            double height,
            double offsetLocalX,
            double offsetLocalY,
            double offsetLocalZ,
            double yawOffsetDeg
    ) {
    }

    private record LayerSlice(double baseY, double topY, byte[][] grid, double xMin, double zMin) {
    }

    private record GridRect(int rowStart, int rowEnd, int colStart, int colEnd) {
    }

    private final ObjectMapper objectMapper;

    public CollisionProfileScanner(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public ObjectNode scan(String modelPath, ObjMesh mesh, CollisionScanOptions baseOptions) {
        ProfileNorm profileNorm = profileNormForPath(modelPath);
        double rootFootprint = Math.max(profileNorm.x, profileNorm.z);
        ObjMesh.Bounds bounds = mesh.measureBounds(baseOptions.percentileTrim());

        ObjectNode bestProfile = null;
        double bestCoverage = -1;
        double bestCell = baseOptions.cellSize();
        boolean usedCoarseRetry = false;

        for (double cellStep : baseOptions.refineCellSteps()) {
            CollisionScanOptions options = baseOptions;
            ObjectNode profile = null;
            double geomCell = options.effectiveGeomCellSize(bounds.spanX(), bounds.spanZ(), rootFootprint);
            geomCell = options.geomCellSize(rootFootprint) * (cellStep / options.cellSize());

            for (int attempt = 0; attempt <= options.maxRescanRetries(); attempt += 1) {
                profile = buildProfile(modelPath, mesh, bounds, profileNorm, options, geomCell);
                if (profile != null) {
                    break;
                }
                geomCell *= 2;
            }
            if (profile == null) {
                continue;
            }

            double coverage = validateCoverage(mesh, profile, bounds, profileNorm, options.coverageSampleCount());
            if (coverage > bestCoverage) {
                bestCoverage = coverage;
                bestProfile = profile.deepCopy();
                bestCell = cellStep;
            }
            if (options.refineCoverage() && coverage >= options.coverageTarget()) {
                break;
            }
        }

        if (bestProfile == null) {
            CollisionScanOptions coarse = CollisionScanOptions.coarseRetry(baseOptions.aggressive());
            double geomBase = coarse.effectiveGeomCellSize(bounds.spanX(), bounds.spanZ(), rootFootprint);
            for (int attempt = 0; attempt <= coarse.maxRescanRetries(); attempt += 1) {
                double geomCell = geomBase * Math.pow(2, attempt);
                ObjectNode profile = buildProfile(modelPath, mesh, bounds, profileNorm, coarse, geomCell);
                if (profile == null) {
                    continue;
                }
                double coverage = validateCoverage(mesh, profile, bounds, profileNorm, coarse.coverageSampleCount());
                bestProfile = profile;
                bestCoverage = coverage;
                bestCell = coarse.cellSize() * Math.pow(2, attempt);
                usedCoarseRetry = true;
                break;
            }
        }

        if (bestProfile == null) {
            return null;
        }

        if (bestCoverage < 0.65 && bestProfile.path("antiBoxes").size() > 0) {
            bestProfile.set("antiBoxes", objectMapper.createArrayNode());
        }

        ObjectNode scanMeta = objectMapper.createObjectNode();
        scanMeta.put("version", 1);
        scanMeta.put("mode", usedCoarseRetry ? "coarse" : (baseOptions.aggressive() ? "aggressive" : "balanced"));
        scanMeta.put("cellSize", bestCell);
        scanMeta.put("generatedAt", Instant.now().toString());
        scanMeta.put("positiveCount", bestProfile.path("boxes").size());
        scanMeta.put("antiCount", bestProfile.path("antiBoxes").size());
        scanMeta.put("coverage", round4(bestCoverage));
        scanMeta.put("coverageTarget", baseOptions.coverageTarget());
        scanMeta.put("refineSteps", baseOptions.refineCellSteps().size());
        scanMeta.put("scanner", "server");
        bestProfile.set("scanMeta", scanMeta);
        return bestProfile;
    }

    private ObjectNode buildProfile(
            String modelPath,
            ObjMesh mesh,
            ObjMesh.Bounds bounds,
            ProfileNorm profileNorm,
            CollisionScanOptions options,
            double geomCell
    ) {
        List<ProfilePart> boxes = new ArrayList<>();
        List<ProfilePart> antiBoxes = new ArrayList<>();

        if (ModelScanFilter.isRoofLike(modelPath)) {
            boxes.add(singleBoxFromBounds(bounds, profileNorm, 0));
        } else {
            List<LayerSlice> layers = scanLayers(mesh, bounds, options, geomCell, modelPath);

            if (layers.isEmpty()) {
                OccupancyGrid fullHeight = buildOccupancyGrid(
                        mesh, bounds, geomCell, bounds.yMin(), bounds.yMax(), options
                );
                if (countOccupied(fullHeight.grid()) > 0) {
                    layers = List.of(new LayerSlice(
                            bounds.yMin(),
                            bounds.yMax(),
                            gridCopy(fullHeight.grid()),
                            fullHeight.xMin(),
                            fullHeight.zMin()
                    ));
                }
            }
            if (layers.isEmpty()) {
                return null;
            }
            int partBudget = options.maxParts();
            for (LayerSlice layer : layers) {
                double yawOffsetDeg = computePcaYawDeg(layer.grid, layer.xMin, layer.zMin, geomCell);
                double yawRad = -Math.toRadians(yawOffsetDeg);
                int rows = layer.grid.length;
                int cols = layer.grid[0].length;
                byte[][] rotated = createGrid(cols, rows);
                for (int r = 0; r < rows; r += 1) {
                    for (int c = 0; c < cols; c += 1) {
                        if (layer.grid[r][c] == 0) {
                            continue;
                        }
                        double wx = layer.xMin + (c + 0.5) * geomCell;
                        double wz = layer.zMin + (r + 0.5) * geomCell;
                        double[] rp = rotatePoint(wx, wz, yawRad);
                        int lc = (int) Math.floor((rp[0] - layer.xMin) / geomCell);
                        int lr = (int) Math.floor((rp[1] - layer.zMin) / geomCell);
                        if (lr >= 0 && lr < rows && lc >= 0 && lc < cols) {
                            rotated[lr][lc] = 1;
                        }
                    }
                }

                int occupied = countOccupied(rotated);
                int totalCells = cols * rows;
                double fillRatio = occupied / (double) Math.max(1, totalCells);
                int components = countConnectedComponents(rotated);

                if (fillRatio > options.rectangularFillThreshold() && components <= 1) {
                    int minC = cols;
                    int maxC = -1;
                    int minR = rows;
                    int maxR = -1;
                    for (int r = 0; r < rows; r += 1) {
                        for (int c = 0; c < cols; c += 1) {
                            if (rotated[r][c] != 0) {
                                minC = Math.min(minC, c);
                                maxC = Math.max(maxC, c);
                                minR = Math.min(minR, r);
                                maxR = Math.max(maxR, r);
                            }
                        }
                    }
                    if (maxC >= minC) {
                        boxes.add(gridRectToBox(
                                new GridRect(minR, maxR, minC, maxC),
                                layer, geomCell, yawOffsetDeg, profileNorm
                        ));
                    }
                } else {
                    int remaining = Math.max(1, partBudget - boxes.size());
                    boxes.addAll(decomposeGridToBoxes(
                            rotated, layer, geomCell, yawOffsetDeg, profileNorm, remaining
                    ));
                }

                if (boxes.size() >= partBudget) {
                    break;
                }

                byte[][] interior = findInteriorVoids(rotated);
                if (countOccupied(interior) >= options.interiorVoidMinCells() && boxes.size() < partBudget) {
                    int remaining = partBudget - boxes.size();
                    antiBoxes.addAll(decomposeGridToBoxes(
                            interior, layer, geomCell, yawOffsetDeg, profileNorm, remaining
                    ));
                }
            }
        }

        if (boxes.isEmpty()) {
            return null;
        }
        if (boxes.size() + antiBoxes.size() > options.maxParts()) {
            antiBoxes.clear();
        }
        if (boxes.size() > options.maxParts()) {
            boxes = trimToMaxParts(boxes, options.maxParts());
        }

        ProfilePart primary = sanitizePart(boxes.get(0));
        double halfWidth = primary.halfWidth();
        double halfDepth = primary.halfDepth();
        boolean solid = !isAlwaysNonSolid(modelPath);
        String kind = "";
        String wallAxis = "";
        double thickness = 0;

        if (ModelScanFilter.isRoofLike(modelPath)) {
            kind = "roof";
        } else if (ModelScanFilter.isRoadLike(modelPath)) {
            kind = "road";
        } else if (isWallLike(modelPath)) {
            double[] tightened = tightenWallFootprint(halfWidth, halfDepth);
            halfWidth = tightened[0];
            halfDepth = tightened[1];
            kind = "wall";
            wallAxis = halfWidth >= halfDepth ? "x" : "z";
            thickness = Math.min(halfWidth, halfDepth);
            if (boxes.size() == 1) {
                ProfilePart only = boxes.get(0);
                boxes.set(0, new ProfilePart(halfWidth, halfDepth, only.height(), only.offsetLocalX(), only.offsetLocalY(), only.offsetLocalZ(), only.yawOffsetDeg()));
            }
        }

        ObjectNode profile = objectMapper.createObjectNode();
        profile.put("value", modelPath.toLowerCase(Locale.ROOT));
        profile.put("halfWidth", halfWidth);
        profile.put("halfDepth", halfDepth);
        profile.put("height", primary.height());
        profile.put("yawOffsetDeg", 0);
        profile.put("offsetLocalX", primary.offsetLocalX());
        profile.put("offsetLocalY", primary.offsetLocalY());
        profile.put("offsetLocalZ", primary.offsetLocalZ());
        profile.put("elevationLift", 0);
        profile.put("solid", solid);
        profile.put("walkable", true);
        if (!kind.isBlank()) {
            profile.put("kind", kind);
            profile.put("wallAxis", wallAxis);
            profile.put("thickness", round2(thickness));
        }
        profile.set("boxes", partsToArray(boxes));
        profile.set("antiBoxes", partsToArray(antiBoxes));
        return profile;
    }

    private List<LayerSlice> scanLayers(ObjMesh mesh, ObjMesh.Bounds bounds, CollisionScanOptions options, double geomCell, String modelPath) {
        double yMin = bounds.yMin();
        double yMax = bounds.yMax();
        double sliceH = (yMax - yMin) / options.heightSlices();
        List<LayerSlice> slices = new ArrayList<>();
        for (int i = 0; i < options.heightSlices(); i += 1) {
            double low = yMin + i * sliceH;
            double high = yMin + (i + 1) * sliceH;
            OccupancyGrid grid = buildOccupancyGrid(mesh, bounds, geomCell, low, high, options);
            if (countOccupied(grid.grid()) == 0) {
                continue;
            }
            slices.add(new LayerSlice(low, high, gridCopy(grid.grid()), grid.xMin(), grid.zMin()));
        }
        double mergeIoU = ModelScanFilter.isRoadLike(modelPath)
                ? Math.max(options.mergeSliceIoU(), 0.96)
                : options.mergeSliceIoU();
        return mergeVerticalSlices(slices, mergeIoU);
    }

    private OccupancyGrid buildOccupancyGrid(
            ObjMesh mesh,
            ObjMesh.Bounds bounds,
            double cellSize,
            double yLow,
            double yHigh,
            CollisionScanOptions options
    ) {
        double xMin = bounds.xMin();
        double xMax = bounds.xMax();
        double zMin = bounds.zMin();
        double zMax = bounds.zMax();
        int cols = Math.max(1, (int) Math.ceil((xMax - xMin) / cellSize));
        int rows = Math.max(1, (int) Math.ceil((zMax - zMin) / cellSize));
        byte[][] grid = createGrid(cols, rows);
        double rayY = yHigh + cellSize * 4;
        double jitter = cellSize * 0.22;
        double[][] probes = {
                {0, 0},
                {-jitter, -jitter},
                {jitter, -jitter},
                {-jitter, jitter},
                {jitter, jitter},
                {-jitter, 0},
                {jitter, 0},
                {0, -jitter}
        };

        for (int r = 0; r < rows; r += 1) {
            for (int c = 0; c < cols; c += 1) {
                double cx = xMin + (c + 0.5) * cellSize;
                double cz = zMin + (r + 0.5) * cellSize;
                for (int p = 0; p < options.surfaceRayDensity() && p < probes.length; p += 1) {
                    double px = cx + probes[p][0];
                    double pz = cz + probes[p][1];
                    if (mesh.rayDownHitsSlice(px, rayY, pz, yLow, yHigh)) {
                        grid[r][c] = 1;
                        break;
                    }
                }
            }
        }
        return new OccupancyGrid(grid, xMin, zMin);
    }

    private record OccupancyGrid(byte[][] grid, double xMin, double zMin) {
    }

    private List<LayerSlice> mergeVerticalSlices(List<LayerSlice> slices, double iouThreshold) {
        if (slices.isEmpty()) {
            return List.of();
        }
        List<LayerSlice> merged = new ArrayList<>();
        merged.add(new LayerSlice(slices.get(0).baseY, slices.get(0).topY, gridCopy(slices.get(0).grid), slices.get(0).xMin, slices.get(0).zMin));
        for (int i = 1; i < slices.size(); i += 1) {
            LayerSlice prev = merged.get(merged.size() - 1);
            LayerSlice cur = slices.get(i);
            if (gridIoU(prev.grid, cur.grid) >= iouThreshold) {
                byte[][] nextGrid = gridCopy(prev.grid);
                for (int r = 0; r < nextGrid.length; r += 1) {
                    for (int c = 0; c < nextGrid[r].length; c += 1) {
                        nextGrid[r][c] = (byte) ((prev.grid[r][c] != 0 || cur.grid[r][c] != 0) ? 1 : 0);
                    }
                }
                merged.set(merged.size() - 1, new LayerSlice(prev.baseY, cur.topY, nextGrid, prev.xMin, prev.zMin));
            } else {
                merged.add(new LayerSlice(cur.baseY, cur.topY, gridCopy(cur.grid), cur.xMin, cur.zMin));
            }
        }
        return merged;
    }

    private List<ProfilePart> decomposeGridToBoxes(
            byte[][] grid,
            LayerSlice layer,
            double cellSize,
            double yawOffsetDeg,
            ProfileNorm profileNorm,
            int maxParts
    ) {
        byte[][] working = gridCopy(grid);
        List<ProfilePart> boxes = new ArrayList<>();
        while (countOccupied(working) > 0 && boxes.size() < maxParts) {
            GridRect rect = findLargestRectangle(working);
            if (rect == null) {
                break;
            }
            boxes.add(gridRectToBox(rect, layer, cellSize, yawOffsetDeg, profileNorm));
            clearRectangle(working, rect);
        }
        return boxes;
    }

    private byte[][] findInteriorVoids(byte[][] occupiedGrid) {
        int rows = occupiedGrid.length;
        int cols = occupiedGrid[0].length;
        byte[][] freeGrid = createGrid(cols, rows);
        for (int r = 0; r < rows; r += 1) {
            for (int c = 0; c < cols; c += 1) {
                freeGrid[r][c] = (byte) (occupiedGrid[r][c] != 0 ? 0 : 1);
            }
        }
        byte[][] exterior = floodFillExterior(freeGrid);
        byte[][] interior = createGrid(cols, rows);
        for (int r = 0; r < rows; r += 1) {
            for (int c = 0; c < cols; c += 1) {
                if (freeGrid[r][c] != 0 && exterior[r][c] == 0) {
                    interior[r][c] = 1;
                }
            }
        }
        return interior;
    }

    private byte[][] floodFillExterior(byte[][] freeGrid) {
        int rows = freeGrid.length;
        int cols = freeGrid[0].length;
        byte[][] exterior = createGrid(cols, rows);
        Deque<int[]> queue = new ArrayDeque<>();

        for (int c = 0; c < cols; c += 1) {
            enqueueExterior(freeGrid, exterior, queue, 0, c);
            enqueueExterior(freeGrid, exterior, queue, rows - 1, c);
        }
        for (int r = 0; r < rows; r += 1) {
            enqueueExterior(freeGrid, exterior, queue, r, 0);
            enqueueExterior(freeGrid, exterior, queue, r, cols - 1);
        }

        while (!queue.isEmpty()) {
            int[] cell = queue.removeFirst();
            int r = cell[0];
            int c = cell[1];
            enqueueExterior(freeGrid, exterior, queue, r - 1, c);
            enqueueExterior(freeGrid, exterior, queue, r + 1, c);
            enqueueExterior(freeGrid, exterior, queue, r, c - 1);
            enqueueExterior(freeGrid, exterior, queue, r, c + 1);
        }
        return exterior;
    }

    private void enqueueExterior(byte[][] freeGrid, byte[][] exterior, Deque<int[]> queue, int r, int c) {
        if (r < 0 || c < 0 || r >= freeGrid.length || c >= freeGrid[0].length || exterior[r][c] != 0) {
            return;
        }
        if (freeGrid[r][c] == 0) {
            return;
        }
        exterior[r][c] = 1;
        queue.addLast(new int[]{r, c});
    }

    private double validateCoverage(
            ObjMesh mesh,
            ObjectNode profile,
            ObjMesh.Bounds bounds,
            ProfileNorm profileNorm,
            int sampleCount
    ) {
        Random random = new Random(42);
        int samples = Math.max(100, sampleCount);
        int agree = 0;
        for (int i = 0; i < samples; i += 1) {
            double x = bounds.xMin() + random.nextDouble() * (bounds.xMax() - bounds.xMin());
            double y = bounds.yMin() + random.nextDouble() * (bounds.yMax() - bounds.yMin());
            double z = bounds.zMin() + random.nextDouble() * (bounds.zMax() - bounds.zMin());
            boolean meshSolid = mesh.containsPoint(x, y, z);
            boolean profileSolid = profileContainsPoint(profile, x, y, z, profileNorm);
            if (meshSolid == profileSolid) {
                agree += 1;
            }
        }
        return agree / (double) samples;
    }

    private boolean profileContainsPoint(ObjectNode profile, double x, double y, double z, ProfileNorm profileNorm) {
        List<ProfilePart> parts = readParts(profile.path("boxes"));
        if (parts.isEmpty()) {
            parts = List.of(new ProfilePart(
                    profile.path("halfWidth").asDouble(1),
                    profile.path("halfDepth").asDouble(1),
                    profile.path("height").asDouble(1),
                    profile.path("offsetLocalX").asDouble(0),
                    profile.path("offsetLocalY").asDouble(0),
                    profile.path("offsetLocalZ").asDouble(0),
                    profile.path("yawOffsetDeg").asDouble(0)
            ));
        }
        boolean inPositive = parts.stream().anyMatch(part -> pointInPart(part, x, y, z, profileNorm));
        if (!inPositive) {
            return false;
        }
        return readParts(profile.path("antiBoxes")).stream().noneMatch(part -> pointInPart(part, x, y, z, profileNorm));
    }

    private List<ProfilePart> readParts(tools.jackson.databind.JsonNode node) {
        List<ProfilePart> parts = new ArrayList<>();
        if (!node.isArray()) {
            return parts;
        }
        for (tools.jackson.databind.JsonNode part : node) {
            parts.add(new ProfilePart(
                    part.path("halfWidth").asDouble(1),
                    part.path("halfDepth").asDouble(1),
                    part.path("height").asDouble(1),
                    part.path("offsetLocalX").asDouble(0),
                    part.path("offsetLocalY").asDouble(0),
                    part.path("offsetLocalZ").asDouble(0),
                    part.path("yawOffsetDeg").asDouble(0)
            ));
        }
        return parts;
    }

    private boolean pointInPart(ProfilePart part, double x, double y, double z, ProfileNorm profileNorm) {
        double yawRad = Math.toRadians(part.yawOffsetDeg());
        double cos = Math.cos(yawRad);
        double sin = -Math.sin(yawRad);
        double ox = part.offsetLocalX() / profileNorm.x();
        double oy = part.offsetLocalY() / profileNorm.z();
        double oz = part.offsetLocalZ() / profileNorm.y();
        double dx = x - ox;
        double dz = z - oy;
        double lx = dx * cos + dz * sin;
        double lz = -dx * sin + dz * cos;
        double hw = part.halfWidth() / profileNorm.x();
        double hd = part.halfDepth() / profileNorm.z();
        double h = part.height() / profileNorm.y();
        return Math.abs(lx) <= hw && Math.abs(lz) <= hd && y >= oz && y <= oz + h;
    }

    private ArrayNode partsToArray(List<ProfilePart> parts) {
        ArrayNode array = objectMapper.createArrayNode();
        for (ProfilePart part : parts) {
            ObjectNode node = objectMapper.createObjectNode();
            node.put("halfWidth", part.halfWidth());
            node.put("halfDepth", part.halfDepth());
            node.put("height", part.height());
            node.put("offsetLocalX", part.offsetLocalX());
            node.put("offsetLocalY", part.offsetLocalY());
            node.put("offsetLocalZ", part.offsetLocalZ());
            node.put("yawOffsetDeg", part.yawOffsetDeg());
            array.add(node);
        }
        return array;
    }

    private ProfilePart gridRectToBox(
            GridRect rect,
            LayerSlice layer,
            double cellSize,
            double yawOffsetDeg,
            ProfileNorm profileNorm
    ) {
        double xMin = layer.xMin + rect.colStart * cellSize;
        double xMax = layer.xMin + (rect.colEnd + 1) * cellSize;
        double zMin = layer.zMin + rect.rowStart * cellSize;
        double zMax = layer.zMin + (rect.rowEnd + 1) * cellSize;
        double cx = (xMin + xMax) / 2;
        double cz = (zMin + zMax) / 2;
        double hw = (xMax - xMin) / 2;
        double hd = (zMax - zMin) / 2;
        double[] inv = inverseRotatePoint(cx, cz, Math.toRadians(yawOffsetDeg));
        double layerHeight = layer.topY - layer.baseY;
        return sanitizePart(new ProfilePart(
                clampDim(hw * profileNorm.x()),
                clampDim(hd * profileNorm.z()),
                clampDim(layerHeight * profileNorm.y(), PROFILE_MAX_HEIGHT),
                round2(inv[0] * profileNorm.x()),
                round2(inv[1] * profileNorm.z()),
                round2(layer.baseY * profileNorm.y()),
                round2(yawOffsetDeg)
        ));
    }

    private ProfilePart singleBoxFromBounds(ObjMesh.Bounds bounds, ProfileNorm profileNorm, double yawOffsetDeg) {
        return sanitizePart(new ProfilePart(
                clampDim(((bounds.xMax() - bounds.xMin()) / 2) * profileNorm.x()),
                clampDim(((bounds.zMax() - bounds.zMin()) / 2) * profileNorm.z()),
                clampDim((bounds.yMax() - bounds.yMin()) * profileNorm.y(), PROFILE_MAX_HEIGHT),
                round2(((bounds.xMin() + bounds.xMax()) / 2) * profileNorm.x()),
                round2(((bounds.zMin() + bounds.zMax()) / 2) * profileNorm.z()),
                round2(bounds.yMin() * profileNorm.y()),
                yawOffsetDeg
        ));
    }

    private ProfilePart sanitizePart(ProfilePart part) {
        return new ProfilePart(
                clampDim(part.halfWidth()),
                clampDim(part.halfDepth()),
                clampDim(part.height(), PROFILE_MAX_HEIGHT),
                round2(part.offsetLocalX()),
                round2(part.offsetLocalY()),
                round2(part.offsetLocalZ()),
                round2(part.yawOffsetDeg())
        );
    }

    private static List<ProfilePart> trimToMaxParts(List<ProfilePart> boxes, int maxParts) {
        if (boxes.size() <= maxParts) {
            return boxes;
        }
        List<ProfilePart> sorted = new ArrayList<>(boxes);
        sorted.sort(Comparator.comparingDouble(CollisionProfileScanner::partVolume).reversed());
        return new ArrayList<>(sorted.subList(0, maxParts));
    }

    private static double partVolume(ProfilePart part) {
        return part.halfWidth() * part.halfDepth() * part.height();
    }

    private static ProfileNorm profileNormForPath(String modelPath) {
        double sceneScale = 1;
        double objMul = modelPath.toLowerCase(Locale.ROOT).endsWith(".obj")
                ? CollisionScanOptions.OBJ_WORLD_SCALE
                : 1;
        return new ProfileNorm(
                objMul * sceneScale / sceneScale,
                objMul * sceneScale / sceneScale,
                objMul * sceneScale / sceneScale
        );
    }

    private static byte[][] createGrid(int cols, int rows) {
        byte[][] grid = new byte[rows][cols];
        return grid;
    }

    private static byte[][] gridCopy(byte[][] grid) {
        byte[][] copy = new byte[grid.length][];
        for (int r = 0; r < grid.length; r += 1) {
            copy[r] = grid[r].clone();
        }
        return copy;
    }

    private static int countOccupied(byte[][] grid) {
        int n = 0;
        for (byte[] row : grid) {
            for (byte cell : row) {
                if (cell != 0) {
                    n += 1;
                }
            }
        }
        return n;
    }

    private static int countConnectedComponents(byte[][] grid) {
        int rows = grid.length;
        int cols = grid[0].length;
        byte[][] visited = createGrid(cols, rows);
        int components = 0;
        Deque<int[]> stack = new ArrayDeque<>();

        for (int r = 0; r < rows; r += 1) {
            for (int c = 0; c < cols; c += 1) {
                if (grid[r][c] == 0 || visited[r][c] != 0) {
                    continue;
                }
                components += 1;
                stack.clear();
                stack.push(new int[]{r, c});
                visited[r][c] = 1;
                while (!stack.isEmpty()) {
                    int[] cell = stack.pop();
                    int cr = cell[0];
                    int cc = cell[1];
                    pushIfOccupied(grid, visited, stack, cr - 1, cc);
                    pushIfOccupied(grid, visited, stack, cr + 1, cc);
                    pushIfOccupied(grid, visited, stack, cr, cc - 1);
                    pushIfOccupied(grid, visited, stack, cr, cc + 1);
                }
            }
        }
        return components;
    }

    private static void pushIfOccupied(byte[][] grid, byte[][] visited, Deque<int[]> stack, int r, int c) {
        if (r < 0 || c < 0 || r >= grid.length || c >= grid[0].length || visited[r][c] != 0 || grid[r][c] == 0) {
            return;
        }
        visited[r][c] = 1;
        stack.push(new int[]{r, c});
    }

    private static double gridIoU(byte[][] a, byte[][] b) {
        int inter = 0;
        int union = 0;
        for (int r = 0; r < a.length; r += 1) {
            for (int c = 0; c < a[r].length; c += 1) {
                boolean av = a[r][c] != 0;
                boolean bv = b[r][c] != 0;
                if (av && bv) {
                    inter += 1;
                }
                if (av || bv) {
                    union += 1;
                }
            }
        }
        return union > 0 ? inter / (double) union : 1;
    }

    private static GridRect findLargestRectangle(byte[][] grid) {
        int rows = grid.length;
        int cols = grid[0].length;
        int[] heights = new int[cols];
        int bestArea = 0;
        GridRect best = null;

        for (int r = 0; r < rows; r += 1) {
            for (int c = 0; c < cols; c += 1) {
                heights[c] = grid[r][c] != 0 ? heights[c] + 1 : 0;
            }
            Deque<Integer> stack = new ArrayDeque<>();
            for (int c = 0; c <= cols; c += 1) {
                int h = c < cols ? heights[c] : 0;
                while (!stack.isEmpty() && heights[stack.peekLast()] > h) {
                    int top = stack.removeLast();
                    int height = heights[top];
                    int width = stack.isEmpty() ? c : c - stack.peekLast() - 1;
                    int area = height * width;
                    if (area > bestArea) {
                        bestArea = area;
                        int colStart = stack.isEmpty() ? 0 : stack.peekLast() + 1;
                        best = new GridRect(r - height + 1, r, colStart, colStart + width - 1);
                    }
                }
                stack.addLast(c);
            }
        }
        return best;
    }

    private static void clearRectangle(byte[][] grid, GridRect rect) {
        for (int r = rect.rowStart; r <= rect.rowEnd; r += 1) {
            for (int c = rect.colStart; c <= rect.colEnd; c += 1) {
                grid[r][c] = 0;
            }
        }
    }

    private static double computePcaYawDeg(byte[][] grid, double xMin, double zMin, double cellSize) {
        List<double[]> points = new ArrayList<>();
        for (int r = 0; r < grid.length; r += 1) {
            for (int c = 0; c < grid[r].length; c += 1) {
                if (grid[r][c] != 0) {
                    points.add(new double[]{xMin + (c + 0.5) * cellSize, zMin + (r + 0.5) * cellSize});
                }
            }
        }
        if (points.size() < 3) {
            return 0;
        }
        double mx = 0;
        double mz = 0;
        for (double[] p : points) {
            mx += p[0];
            mz += p[1];
        }
        mx /= points.size();
        mz /= points.size();
        double cxx = 0;
        double czz = 0;
        double cxz = 0;
        for (double[] p : points) {
            double dx = p[0] - mx;
            double dz = p[1] - mz;
            cxx += dx * dx;
            czz += dz * dz;
            cxz += dx * dz;
        }
        return Math.toDegrees(0.5 * Math.atan2(2 * cxz, cxx - czz));
    }

    private static double[] rotatePoint(double x, double z, double yawRad) {
        double cos = Math.cos(yawRad);
        double sin = Math.sin(yawRad);
        return new double[]{x * cos - z * sin, x * sin + z * cos};
    }

    private static double[] inverseRotatePoint(double x, double z, double yawRad) {
        double cos = Math.cos(yawRad);
        double sin = Math.sin(yawRad);
        return new double[]{x * cos + z * sin, -x * sin + z * cos};
    }

    private static double[] tightenWallFootprint(double halfWidth, double halfDepth) {
        double w = halfWidth;
        double d = halfDepth;
        double longSide = Math.max(w, d);
        double shortSide = Math.min(w, d);
        double aspect = shortSide / Math.max(longSide, 1e-6);
        if (aspect > 0.72) {
            double thinHalf = Math.max(3.5, Math.min(shortSide * 0.14, longSide * 0.065));
            if (w >= d) {
                return new double[]{longSide * 0.96, thinHalf};
            }
            return new double[]{thinHalf, longSide * 0.96};
        }
        return new double[]{w * 0.96, d * 0.96};
    }

    private static boolean isWallLike(String modelPath) {
        if (ModelScanFilter.isRoofLike(modelPath)) {
            return false;
        }
        String path = modelPath.toLowerCase(Locale.ROOT);
        return path.contains("/wall-")
                || path.contains("/door-")
                || path.contains("/window-")
                || path.contains("/planks.obj");
    }

    private static boolean isAlwaysNonSolid(String modelPath) {
        String path = modelPath.toLowerCase(Locale.ROOT);
        return path.contains("/grass")
                || path.contains("/tree-")
                || path.contains("/detail-light-");
    }

    private static double clampDim(double value) {
        return clampDim(value, PROFILE_MAX_HALF);
    }

    private static double clampDim(double value, double max) {
        if (!Double.isFinite(value) || value <= 0) {
            return COLLISION_MIN_DIM;
        }
        return round2(Math.min(value, max));
    }

    private static double round2(double value) {
        return Math.round(value * 100.0) / 100.0;
    }

    private static double round4(double value) {
        return Math.round(value * 10000.0) / 10000.0;
    }
}
