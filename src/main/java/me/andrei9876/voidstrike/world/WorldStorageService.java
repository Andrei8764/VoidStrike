package me.andrei9876.voidstrike.world;

import me.andrei9876.voidstrike.VoidStrikeApplication;
import me.andrei9876.voidstrike.config.WorldStorageProperties;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.boot.system.ApplicationHome;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;

@Service
public class WorldStorageService {

    private static final Logger log = LoggerFactory.getLogger(WorldStorageService.class);

    private static final String DEFAULT_SCENE_RESOURCE = "static/world/scene.json";
    private static final String DEFAULT_COLLISION_PROFILES_RESOURCE = "static/world/collision-profiles.json";

    private final Path dataDir;

    public WorldStorageService(WorldStorageProperties properties) {
        this.dataDir = resolveDataDir(properties.getDataDir());
    }

    @PostConstruct
    public void initialize() throws IOException {
        Files.createDirectories(dataDir);
        seedFileIfMissing(scenePath(), DEFAULT_SCENE_RESOURCE);
        seedFileIfMissing(collisionProfilesPath(), DEFAULT_COLLISION_PROFILES_RESOURCE);
        log.info("[world] using external world data directory {}", dataDir);
    }

    public Path scenePath() {
        return dataDir.resolve("scene.json");
    }

    public Path collisionProfilesPath() {
        return dataDir.resolve("collision-profiles.json");
    }

    private void seedFileIfMissing(Path destination, String classpathResource) throws IOException {
        if (Files.exists(destination)) {
            return;
        }

        ClassPathResource resource = new ClassPathResource(classpathResource);
        if (!resource.exists()) {
            throw new IOException("Missing bundled default world resource: " + classpathResource);
        }

        Path parent = destination.getParent();
        if (parent != null) {
            Files.createDirectories(parent);
        }

        try (InputStream inputStream = resource.getInputStream()) {
            Files.copy(inputStream, destination, StandardCopyOption.REPLACE_EXISTING);
        }
        log.info("[world] seeded {} from bundled defaults", destination);
    }

    private Path resolveDataDir(Path configuredDataDir) {
        Path safeDataDir = configuredDataDir == null ? Path.of("data/world") : configuredDataDir;
        if (safeDataDir.isAbsolute()) {
            return safeDataDir.normalize();
        }

        Path applicationDir = new ApplicationHome(VoidStrikeApplication.class)
                .getDir()
                .toPath()
                .toAbsolutePath()
                .normalize();
        return applicationDir.resolve(safeDataDir).normalize();
    }
}
