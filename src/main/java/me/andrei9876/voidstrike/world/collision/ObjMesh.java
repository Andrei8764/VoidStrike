package me.andrei9876.voidstrike.world.collision;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;

public final class ObjMesh {

    private static final int SPATIAL_GRID = 48;

    public record Vec3(double x, double y, double z) {
    }

    public record Triangle(Vec3 a, Vec3 b, Vec3 c) {
        String key() {
            return triKey(a) + "|" + triKey(b) + "|" + triKey(c);
        }

        private static String triKey(Vec3 v) {
            return Math.round(v.x * 1e5) + "," + Math.round(v.y * 1e5) + "," + Math.round(v.z * 1e5);
        }
    }

    public record Bounds(
            double xMin, double xMax,
            double yMin, double yMax,
            double zMin, double zMax
    ) {
        double spanX() {
            return xMax - xMin;
        }

        double spanZ() {
            return zMax - zMin;
        }
    }

    private final List<Triangle> triangles;
    private final double gridXMin;
    private final double gridZMin;
    private final double gridCellW;
    private final double gridCellH;
    private final int gridCols;
    private final int gridRows;
    private final int[][] bucketIndices;

    private ObjMesh(List<Triangle> triangles, Bounds bounds) {
        this.triangles = List.copyOf(triangles);
        double pad = 1e-4;
        this.gridXMin = bounds.xMin() - pad;
        this.gridZMin = bounds.zMin() - pad;
        double spanX = Math.max(pad, bounds.xMax() - bounds.xMin() + pad * 2);
        double spanZ = Math.max(pad, bounds.zMax() - bounds.zMin() + pad * 2);
        this.gridCols = SPATIAL_GRID;
        this.gridRows = SPATIAL_GRID;
        this.gridCellW = spanX / gridCols;
        this.gridCellH = spanZ / gridRows;
        int bucketCount = gridCols * gridRows;
        List<Integer>[] buckets = new List[bucketCount];
        for (int i = 0; i < bucketCount; i += 1) {
            buckets[i] = new ArrayList<>();
        }
        for (int triIndex = 0; triIndex < triangles.size(); triIndex += 1) {
            Triangle tri = triangles.get(triIndex);
            double triXMin = Math.min(tri.a.x, Math.min(tri.b.x, tri.c.x));
            double triXMax = Math.max(tri.a.x, Math.max(tri.b.x, tri.c.x));
            double triZMin = Math.min(tri.a.z, Math.min(tri.b.z, tri.c.z));
            double triZMax = Math.max(tri.a.z, Math.max(tri.b.z, tri.c.z));
            int colMin = clampCol((triXMin - gridXMin) / gridCellW);
            int colMax = clampCol((triXMax - gridXMin) / gridCellW);
            int rowMin = clampRow((triZMin - gridZMin) / gridCellH);
            int rowMax = clampRow((triZMax - gridZMin) / gridCellH);
            for (int row = rowMin; row <= rowMax; row += 1) {
                for (int col = colMin; col <= colMax; col += 1) {
                    buckets[row * gridCols + col].add(triIndex);
                }
            }
        }
        this.bucketIndices = new int[bucketCount][];
        for (int i = 0; i < bucketCount; i += 1) {
            List<Integer> bucket = buckets[i];
            bucketIndices[i] = new int[bucket.size()];
            for (int j = 0; j < bucket.size(); j += 1) {
                bucketIndices[i][j] = bucket.get(j);
            }
        }
    }

    public static ObjMesh load(Path objPath) throws IOException {
        List<Vec3> vertices = new ArrayList<>();
        HashSet<String> seen = new HashSet<>();
        List<Triangle> triangles = new ArrayList<>();

        for (String rawLine : Files.readAllLines(objPath)) {
            String line = rawLine.trim();
            if (line.isEmpty() || line.startsWith("#")) {
                continue;
            }
            if (line.startsWith("v ")) {
                String[] parts = line.split("\\s+");
                if (parts.length >= 4) {
                    vertices.add(new Vec3(
                            Double.parseDouble(parts[1]),
                            Double.parseDouble(parts[2]),
                            Double.parseDouble(parts[3])
                    ));
                }
                continue;
            }
            if (!line.startsWith("f ")) {
                continue;
            }
            String[] parts = line.split("\\s+");
            List<Integer> indices = new ArrayList<>();
            for (int i = 1; i < parts.length; i += 1) {
                String token = parts[i];
                int slash = token.indexOf('/');
                String indexToken = slash >= 0 ? token.substring(0, slash) : token;
                int idx = Integer.parseInt(indexToken);
                if (idx < 0) {
                    idx = vertices.size() + idx + 1;
                }
                indices.add(idx - 1);
            }
            for (int i = 1; i + 1 < indices.size(); i += 1) {
                int i0 = indices.get(0);
                int i1 = indices.get(i);
                int i2 = indices.get(i + 1);
                if (i0 < 0 || i1 < 0 || i2 < 0
                        || i0 >= vertices.size() || i1 >= vertices.size() || i2 >= vertices.size()) {
                    continue;
                }
                Triangle tri = new Triangle(vertices.get(i0), vertices.get(i1), vertices.get(i2));
                if (seen.add(tri.key())) {
                    triangles.add(tri);
                }
            }
        }

        if (triangles.isEmpty()) {
            throw new IOException("No triangles found in OBJ: " + objPath);
        }
        Bounds bounds = measureBoundsFromTriangles(triangles, new double[]{0.001, 0.999});
        return new ObjMesh(triangles, bounds);
    }

    public int triangleCount() {
        return triangles.size();
    }

    public Bounds measureBounds(double[] percentileTrim) {
        return measureBoundsFromTriangles(triangles, percentileTrim);
    }

    private static Bounds measureBoundsFromTriangles(List<Triangle> triangles, double[] percentileTrim) {
        double[] xs = new double[triangles.size() * 3];
        double[] ys = new double[triangles.size() * 3];
        double[] zs = new double[triangles.size() * 3];
        int n = 0;
        for (Triangle tri : triangles) {
            for (Vec3 v : List.of(tri.a, tri.b, tri.c)) {
                xs[n] = v.x;
                ys[n] = v.y;
                zs[n] = v.z;
                n += 1;
            }
        }
        java.util.Arrays.sort(xs, 0, n);
        java.util.Arrays.sort(ys, 0, n);
        java.util.Arrays.sort(zs, 0, n);
        return new Bounds(
                percentile(xs, n, percentileTrim[0]),
                percentile(xs, n, percentileTrim[1]),
                percentile(ys, n, percentileTrim[0]),
                percentile(ys, n, percentileTrim[1]),
                percentile(zs, n, percentileTrim[0]),
                percentile(zs, n, percentileTrim[1])
        );
    }

    private static double percentile(double[] sorted, int length, double q) {
        if (length == 0) {
            return 0;
        }
        int idx = (int) Math.floor((length - 1) * q);
        return sorted[Math.max(0, Math.min(length - 1, idx))];
    }

    public boolean rayDownHitsSlice(double x, double rayY, double z, double yLow, double yHigh) {
        Vec3 origin = new Vec3(x, rayY, z);
        Vec3 dir = new Vec3(0, -1, 0);
        for (int triIndex : candidateTriangles(x, z)) {
            Double t = intersectRayTriangle(origin, dir, triangles.get(triIndex));
            if (t == null || t <= 0) {
                continue;
            }
            double hitY = rayY - t;
            if (hitY >= yLow - 0.01 && hitY <= yHigh + 0.01) {
                return true;
            }
        }
        return false;
    }

    public boolean containsPoint(double x, double y, double z) {
        if (rayDownHitsSlice(x, y + 500, z, y - 0.5, y + 0.5)) {
            return true;
        }
        Vec3 origin = new Vec3(x, y - 500, z);
        Vec3 dir = new Vec3(0, 1, 0);
        for (int triIndex : candidateTriangles(x, z)) {
            Double t = intersectRayTriangle(origin, dir, triangles.get(triIndex));
            if (t != null && t > 0) {
                double hitY = (y - 500) + t;
                if (hitY >= y - 0.5) {
                    return true;
                }
            }
        }
        return false;
    }

    private int[] candidateTriangles(double x, double z) {
        int col = clampCol((x - gridXMin) / gridCellW);
        int row = clampRow((z - gridZMin) / gridCellH);
        return bucketIndices[row * gridCols + col];
    }

    private int clampCol(double value) {
        int col = (int) Math.floor(value);
        return Math.max(0, Math.min(gridCols - 1, col));
    }

    private int clampRow(double value) {
        int row = (int) Math.floor(value);
        return Math.max(0, Math.min(gridRows - 1, row));
    }

    private static Double intersectRayTriangle(Vec3 origin, Vec3 dir, Triangle tri) {
        double eps = 1e-8;
        Vec3 e1 = sub(tri.b, tri.a);
        Vec3 e2 = sub(tri.c, tri.a);
        Vec3 h = cross(dir, e2);
        double a = dot(e1, h);
        if (a > -eps && a < eps) {
            return null;
        }
        double f = 1.0 / a;
        Vec3 s = sub(origin, tri.a);
        double u = f * dot(s, h);
        if (u < 0 || u > 1) {
            return null;
        }
        Vec3 q = cross(s, e1);
        double v = f * dot(dir, q);
        if (v < 0 || u + v > 1) {
            return null;
        }
        double t = f * dot(e2, q);
        return t;
    }

    private static Vec3 sub(Vec3 a, Vec3 b) {
        return new Vec3(a.x - b.x, a.y - b.y, a.z - b.z);
    }

    private static double dot(Vec3 a, Vec3 b) {
        return a.x * b.x + a.y * b.y + a.z * b.z;
    }

    private static Vec3 cross(Vec3 a, Vec3 b) {
        return new Vec3(
                a.y * b.z - a.z * b.y,
                a.z * b.x - a.x * b.z,
                a.x * b.y - a.y * b.x
        );
    }
}
