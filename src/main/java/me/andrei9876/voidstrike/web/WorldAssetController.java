package me.andrei9876.voidstrike.web;

import me.andrei9876.voidstrike.world.WorldStorageService;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;

@RestController
public class WorldAssetController {

    private final WorldStorageService worldStorageService;

    public WorldAssetController(WorldStorageService worldStorageService) {
        this.worldStorageService = worldStorageService;
    }

    @GetMapping(value = "/world/scene.json", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<String> getScene() throws IOException {
        return jsonFile(Files.readString(worldStorageService.scenePath()));
    }

    @GetMapping(value = "/world/collision-profiles.json", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<String> getCollisionProfiles() throws IOException {
        Path path = worldStorageService.collisionProfilesPath();
        if (!Files.exists(path)) {
            return jsonFile("{\"exactOnly\":true,\"exact\":[],\"prefix\":[]}");
        }
        return jsonFile(Files.readString(path));
    }

    private ResponseEntity<String> jsonFile(String body) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(Duration.ZERO).cachePrivate().mustRevalidate())
                .contentType(MediaType.APPLICATION_JSON)
                .body(body);
    }
}
