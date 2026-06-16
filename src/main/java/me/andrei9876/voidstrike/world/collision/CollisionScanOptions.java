package me.andrei9876.voidstrike.world.collision;

import java.util.List;

public record CollisionScanOptions(
        double cellSize,
        int heightSlices,
        double minOccupancyRatio,
        int surfaceRayDensity,
        double[] percentileTrim,
        int maxParts,
        int maxRescanRetries,
        int interiorVoidMinCells,
        double mergeSliceIoU,
        double rectangularFillThreshold,
        double coverageTarget,
        int coverageSampleCount,
        boolean refineCoverage,
        List<Double> refineCellSteps,
        boolean aggressive
) {
    public static final double OBJ_WORLD_SCALE = 128.0;
    private static final int MAX_GRID_DIM = 192;

    public static CollisionScanOptions balanced() {
        return new CollisionScanOptions(
                2.0, 16, 0.35, 4, new double[]{0.005, 0.995},
                12, 3, 4, 0.85, 0.92, 0.96, 2500,
                false, List.of(2.0), false
        );
    }

    public static CollisionScanOptions aggressivePreset() {
        return new CollisionScanOptions(
                1.0, 16, 0.25, 6, new double[]{0.001, 0.999},
                24, 5, 3, 0.92, 0.88, 0.97, 2000,
                true, List.of(1.0, 0.75, 0.5), true
        );
    }

    /** Last-resort grid scan: coarse cells, fewer slices, no anti-boxes — still compound boxes, not raw bbox. */
    public static CollisionScanOptions coarseRetry(boolean aggressive) {
        return new CollisionScanOptions(
                aggressive ? 2.0 : 3.0,
                8,
                0.20,
                4,
                aggressive ? new double[]{0.001, 0.999} : new double[]{0.005, 0.995},
                32,
                8,
                999,
                0.70,
                0.75,
                0.85,
                1200,
                false,
                List.of(aggressive ? 2.0 : 3.0),
                aggressive
        );
    }

    public static CollisionScanOptions resolve(boolean aggressive) {
        return aggressive ? aggressivePreset() : balanced();
    }

    public double geomCellSize(double rootFootprintScale) {
        return cellSize / Math.max(1e-6, rootFootprintScale);
    }

    public double effectiveGeomCellSize(double spanX, double spanZ, double rootFootprintScale) {
        double geom = geomCellSize(rootFootprintScale);
        while (Math.ceil(spanX / geom) > MAX_GRID_DIM || Math.ceil(spanZ / geom) > MAX_GRID_DIM) {
            geom *= 1.25;
        }
        return geom;
    }
}
