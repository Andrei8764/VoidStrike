package me.andrei9876.voidstrike.world.collision;

import java.util.Locale;

public final class ModelScanFilter {

    private static final String[] NON_SOLID_TOKENS = {
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
    };

    public static boolean isRoofLike(String modelPath) {
        String path = String.valueOf(modelPath == null ? "" : modelPath).toLowerCase(Locale.ROOT);
        return path.contains("/roof-")
                || path.contains("-roof-")
                || path.contains("roof-slant")
                || path.contains("roof-detailed");
    }

    public static boolean isRoadLike(String modelPath) {
        String path = String.valueOf(modelPath == null ? "" : modelPath).toLowerCase(Locale.ROOT);
        return path.contains("/road-")
                || path.contains("asphalt")
                || path.contains("pavement")
                || path.contains("/road-dirt");
    }

    private ModelScanFilter() {
    }

    public static boolean shouldScan(String modelPath) {
        String path = String.valueOf(modelPath == null ? "" : modelPath).toLowerCase(Locale.ROOT);
        if (path.isBlank()) {
            return false;
        }
        for (String token : NON_SOLID_TOKENS) {
            if (path.contains(token)) {
                return false;
            }
        }
        return true;
    }
}
