package me.andrei9876.voidstrike.web;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;
import me.andrei9876.voidstrike.world.WorldStorageService;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

@RestController
@RequestMapping("/api/world")
public class WorldSceneController {

    private static final Path MODELS_PATH = Path.of("src/main/resources/static/models");

    private final ObjectMapper objectMapper;
    private final WorldStorageService worldStorageService;

    public WorldSceneController(ObjectMapper objectMapper, WorldStorageService worldStorageService) {
        this.objectMapper = objectMapper;
        this.worldStorageService = worldStorageService;
    }

    @GetMapping(value = "/scene", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<JsonNode> getScene() throws IOException {
        JsonNode node = objectMapper.readTree(Files.readString(worldStorageService.scenePath()));
        return ResponseEntity.ok(node);
    }

    @PostMapping(value = "/scene", consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<JsonNode> saveScene(@RequestBody JsonNode scene) throws IOException {
        if (!scene.isObject()) {
            return ResponseEntity.badRequest().body(objectMapper.createObjectNode().put("error", "Scene payload must be an object"));
        }

        ObjectNode sanitized = objectMapper.createObjectNode();
        sanitized.put("version", scene.path("version").asInt(1));

        ArrayNode models = objectMapper.createArrayNode();
        JsonNode incomingModels = scene.path("models");
        if (incomingModels.isArray()) {
            for (JsonNode model : incomingModels) {
                if (!model.isObject()) {
                    continue;
                }
                String path = model.path("path").asText("");
                if (!path.startsWith("/models/")) {
                    continue;
                }

                ObjectNode cleanModel = objectMapper.createObjectNode();
                cleanModel.put("enabled", model.path("enabled").asBoolean(true));
                cleanModel.put("path", path);

                ObjectNode position = objectMapper.createObjectNode();
                JsonNode inPos = model.path("position");
                position.put("x", inPos.path("x").asDouble(0));
                position.put("y", inPos.path("y").asDouble(0));
                position.put("z", inPos.path("z").asDouble(0));
                cleanModel.set("position", position);

                ObjectNode rotationDegrees = objectMapper.createObjectNode();
                JsonNode inRot = model.path("rotationDegrees");
                rotationDegrees.put("y", inRot.path("y").asDouble(0));
                cleanModel.set("rotationDegrees", rotationDegrees);

                JsonNode scale = model.path("scale");
                cleanModel.put("scale", scale.isNumber() ? scale.asDouble(1) : 1);
                models.add(cleanModel);
            }
        }
        sanitized.set("models", models);
        sanitized.set("primitives", objectMapper.createArrayNode());

        Files.writeString(worldStorageService.scenePath(), objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(sanitized));

        return ResponseEntity.ok(objectMapper.createObjectNode()
                .put("ok", true)
                .put("savedModels", models.size()));
    }

    @GetMapping(value = "/models", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<JsonNode> getObjModels() throws IOException {
        List<String> modelPaths = new ArrayList<>();
        if (Files.isDirectory(MODELS_PATH)) {
            try (var stream = Files.list(MODELS_PATH)) {
                stream.filter(path -> path.getFileName().toString().toLowerCase().endsWith(".obj"))
                        .map(path -> "/models/" + path.getFileName())
                        .sorted(Comparator.naturalOrder())
                        .forEach(modelPaths::add);
            }
        }

        ArrayNode result = objectMapper.createArrayNode();
        modelPaths.forEach(result::add);
        return ResponseEntity.ok(result);
    }

    @PostMapping(value = "/collision-profile", consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<JsonNode> saveCollisionProfile(@RequestBody JsonNode payload) throws IOException {
        if (!payload.isObject()) {
            return ResponseEntity.badRequest().body(objectMapper.createObjectNode().put("error", "Payload must be an object"));
        }

        String value = payload.path("value").asText("").toLowerCase();
        if (!value.startsWith("/models/")) {
            return ResponseEntity.badRequest().body(objectMapper.createObjectNode().put("error", "value must start with /models/"));
        }

        double halfWidth = Math.max(0.1, payload.path("halfWidth").asDouble(1));
        double halfDepth = Math.max(0.1, payload.path("halfDepth").asDouble(1));
        double height = Math.max(0.1, payload.path("height").asDouble(1));
        boolean solid = payload.path("solid").asBoolean(true);
        boolean walkable = payload.path("walkable").asBoolean(true);
        double yawOffsetDeg = payload.path("yawOffsetDeg").asDouble(0);
        double offsetLocalX = payload.path("offsetLocalX").asDouble(0);
        double offsetLocalY = payload.path("offsetLocalY").asDouble(0);
        double offsetLocalZ = payload.path("offsetLocalZ").asDouble(0);
        double elevationLift = payload.path("elevationLift").asDouble(0);
        String kind = payload.path("kind").asText("");
        String wallAxis = payload.path("wallAxis").asText("");
        double thickness = payload.path("thickness").asDouble(0);
        ArrayNode boxes = objectMapper.createArrayNode();
        JsonNode boxesNode = payload.path("boxes");
        if (boxesNode.isArray()) {
            for (JsonNode part : boxesNode) {
                if (!part.isObject()) {
                    continue;
                }
                ObjectNode cleanPart = objectMapper.createObjectNode();
                cleanPart.put("halfWidth", Math.max(0.1, part.path("halfWidth").asDouble(halfWidth)));
                cleanPart.put("halfDepth", Math.max(0.1, part.path("halfDepth").asDouble(halfDepth)));
                cleanPart.put("height", Math.max(0.1, part.path("height").asDouble(height)));
                cleanPart.put("yawOffsetDeg", part.path("yawOffsetDeg").asDouble(yawOffsetDeg));
                cleanPart.put("offsetLocalX", part.path("offsetLocalX").asDouble(offsetLocalX));
                cleanPart.put("offsetLocalY", part.path("offsetLocalY").asDouble(offsetLocalY));
                cleanPart.put("offsetLocalZ", part.path("offsetLocalZ").asDouble(offsetLocalZ));
                boxes.add(cleanPart);
            }
        }

        ObjectNode root;
        if (Files.exists(worldStorageService.collisionProfilesPath())) {
            JsonNode parsed = objectMapper.readTree(Files.readString(worldStorageService.collisionProfilesPath()));
            root = parsed != null && parsed.isObject() ? (ObjectNode) parsed : objectMapper.createObjectNode();
        } else {
            root = objectMapper.createObjectNode();
        }

        ArrayNode exact;
        JsonNode exactNode = root.path("exact");
        if (exactNode.isArray()) {
            exact = (ArrayNode) exactNode;
        } else {
            exact = objectMapper.createArrayNode();
            root.set("exact", exact);
        }

        ObjectNode entry = objectMapper.createObjectNode();
        entry.put("value", value);
        entry.put("halfWidth", halfWidth);
        entry.put("halfDepth", halfDepth);
        entry.put("height", height);
        entry.put("solid", solid);
        entry.put("walkable", walkable);
        entry.put("yawOffsetDeg", yawOffsetDeg);
        entry.put("offsetLocalX", offsetLocalX);
        entry.put("offsetLocalY", offsetLocalY);
        entry.put("offsetLocalZ", offsetLocalZ);
        entry.put("elevationLift", elevationLift);
        if (!kind.isBlank()) {
            entry.put("kind", kind);
        }
        if (!wallAxis.isBlank()) {
            entry.put("wallAxis", wallAxis);
        }
        if (thickness > 0) {
            entry.put("thickness", thickness);
        }
        if (!boxes.isEmpty()) {
            entry.set("boxes", boxes);
        }

        boolean updated = false;
        for (int i = 0; i < exact.size(); i++) {
            JsonNode node = exact.get(i);
            String currentValue = node.path("value").asText("").toLowerCase();
            if (value.equals(currentValue)) {
                exact.set(i, entry);
                updated = true;
                break;
            }
        }
        if (!updated) {
            exact.add(entry);
        }

        String serialized = objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(root);
        writeCollisionProfiles(serialized);

        return ResponseEntity.ok(objectMapper.createObjectNode()
                .put("ok", true)
                .put("value", value)
                .put("updated", updated));
    }

    /** Clears all profiles; exactOnly mode = zero collision boxes until profiles are saved again. */
    @DeleteMapping(value = "/collision-profiles", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<JsonNode> clearCollisionProfilesDelete() throws IOException {
        return clearCollisionProfiles();
    }

    @PostMapping(value = "/collision-profiles/clear", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<JsonNode> clearCollisionProfilesPost() throws IOException {
        return clearCollisionProfiles();
    }

    private ResponseEntity<JsonNode> clearCollisionProfiles() throws IOException {
        ObjectNode root = createEmptyCollisionProfilesRoot();
        writeCollisionProfiles(objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(root));
        return ResponseEntity.ok(objectMapper.createObjectNode()
                .put("ok", true)
                .put("exactOnly", true)
                .put("boxes", 0));
    }

    private ObjectNode createEmptyCollisionProfilesRoot() {
        ObjectNode root = objectMapper.createObjectNode();
        root.put("exactOnly", true);
        root.set("exact", objectMapper.createArrayNode());
        root.set("prefix", objectMapper.createArrayNode());
        return root;
    }

    private void writeCollisionProfiles(String serialized) throws IOException {
        Path srcParent = worldStorageService.collisionProfilesPath().getParent();
        if (srcParent != null) {
            Files.createDirectories(srcParent);
        }
        Files.writeString(worldStorageService.collisionProfilesPath(), serialized);
    }
}
