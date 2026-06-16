package me.andrei9876.voidstrike.world.collision;

import me.andrei9876.voidstrike.world.WorldStorageService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

@Service
public class CollisionScanService {

    private static final Logger log = LoggerFactory.getLogger(CollisionScanService.class);

    private final ObjectMapper objectMapper;
    private final WorldStorageService worldStorageService;
    private final CollisionProfileScanner scanner;

    public CollisionScanService(
            ObjectMapper objectMapper,
            WorldStorageService worldStorageService
    ) {
        this.objectMapper = objectMapper;
        this.worldStorageService = worldStorageService;
        this.scanner = new CollisionProfileScanner(objectMapper);
    }

    public ObjectNode scanModel(String modelPath, boolean aggressive) throws IOException {
        String normalized = normalizeModelPath(modelPath);
        Path objPath = resolveObjPath(normalized);
        ObjMesh mesh = ObjMesh.load(objPath);
        CollisionScanOptions options = CollisionScanOptions.resolve(aggressive);
        ObjectNode profile = scanner.scan(normalized, mesh, options);
        return profile;
    }

    public List<ObjectNode> scanSceneModels(boolean aggressive, boolean onlyMissing) throws IOException {
        List<String> targets = listScanTargets(onlyMissing);
        List<ObjectNode> profiles = new ArrayList<>();
        int scanned = 0;
        for (String path : targets) {
            scanned += 1;
            try {
                ObjectNode profile = scanModel(path, aggressive);
                if (profile != null) {
                    profiles.add(profile);
                }
                log.info("[collision-scan] {}/{} done: {}", scanned, targets.size(), path);
            } catch (Exception ex) {
                log.warn("[collision-scan] {}/{} skipped {}: {}", scanned, targets.size(), path, ex.getMessage());
            }
        }
        log.info("[collision-scan] batch complete: {} profile(s) from {} model(s)", profiles.size(), targets.size());
        return profiles;
    }

    public List<String> listMissingExactProfiles() throws IOException {
        Set<String> scenePaths = new LinkedHashSet<>();
        for (String path : collectSceneModelPaths()) {
            if (ModelScanFilter.shouldScan(path)) {
                scenePaths.add(path);
            }
        }
        Set<String> exact = new LinkedHashSet<>();
        List<String> missing = new ArrayList<>();
        Path profilesPath = worldStorageService.collisionProfilesPath();
        if (Files.exists(profilesPath)) {
            JsonNode root = objectMapper.readTree(Files.readString(profilesPath));
            JsonNode exactNode = root.path("exact");
            if (exactNode.isArray()) {
                for (JsonNode entry : exactNode) {
                    String path = normalizeModelPath(entry.path("value").asText(""));
                    if (path.isBlank()) {
                        continue;
                    }
                    if (!entry.path("scanMeta").path("fallback").asText("").isBlank()) {
                        continue;
                    }
                    exact.add(path);
                }
            }
        }
        for (String path : scenePaths) {
            if (!exact.contains(path) && !missing.contains(path)) {
                missing.add(path);
            }
        }
        return missing;
    }

    public List<String> listScanTargets(boolean onlyMissing) throws IOException {
        Set<String> paths = collectSceneModelPaths();
        List<String> filtered = new ArrayList<>();
        for (String path : paths) {
            if (ModelScanFilter.shouldScan(path)) {
                filtered.add(path);
            }
        }
        if (!onlyMissing) {
            return filtered;
        }
        Set<String> existing = loadScannedModelPaths();
        List<String> toScan = new ArrayList<>();
        for (String path : filtered) {
            if (!existing.contains(path)) {
                toScan.add(path);
            }
        }
        return toScan;
    }

    public Set<String> collectSceneModelPaths() throws IOException {
        JsonNode scene = objectMapper.readTree(Files.readString(worldStorageService.scenePath()));
        Set<String> paths = new LinkedHashSet<>();
        JsonNode models = scene.path("models");
        if (models.isArray()) {
            for (JsonNode model : models) {
                String path = normalizeModelPath(model.path("path").asText(""));
                if (!path.isBlank()) {
                    paths.add(path);
                }
            }
        }
        return paths;
    }

    private Set<String> loadScannedModelPaths() throws IOException {
        Set<String> scanned = new LinkedHashSet<>();
        Path profilesPath = worldStorageService.collisionProfilesPath();
        if (!Files.exists(profilesPath)) {
            return scanned;
        }
        JsonNode root = objectMapper.readTree(Files.readString(profilesPath));
        JsonNode exact = root.path("exact");
        if (!exact.isArray()) {
            return scanned;
        }
        for (JsonNode entry : exact) {
            if (entry.path("scanMeta").path("version").asInt(0) >= 1) {
                scanned.add(normalizeModelPath(entry.path("value").asText("")));
            }
        }
        return scanned;
    }

    public Path resolveObjPath(String modelPath) throws IOException {
        String relative = modelPath.startsWith("/models/")
                ? modelPath.substring("/models/".length())
                : modelPath;
        Path devPath = Path.of(System.getProperty("user.dir"), "src/main/resources/static/models", relative);
        if (Files.isRegularFile(devPath)) {
            return devPath;
        }
        ClassPathResource resource = new ClassPathResource("static/models/" + relative);
        if (!resource.exists()) {
            throw new IOException("Model not found: " + modelPath);
        }
        Path cacheDir = Path.of(System.getProperty("java.io.tmpdir"), "voidstrike-obj-cache");
        Files.createDirectories(cacheDir);
        Path cached = cacheDir.resolve(relative.replace('/', '_'));
        if (!Files.exists(cached) || Files.getLastModifiedTime(cached).toMillis() < resource.lastModified()) {
            try (InputStream input = resource.getInputStream()) {
                Files.copy(input, cached, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
            }
        }
        return cached;
    }

    public static String normalizeModelPath(String modelPath) {
        return modelPath.trim().toLowerCase(Locale.ROOT);
    }

    public ArrayNode profilesToArray(List<ObjectNode> profiles) {
        ArrayNode array = objectMapper.createArrayNode();
        profiles.forEach(array::add);
        return array;
    }
}
