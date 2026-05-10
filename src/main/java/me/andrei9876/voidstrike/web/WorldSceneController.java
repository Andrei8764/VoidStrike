package me.andrei9876.voidstrike.web;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
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

    private static final Path SCENE_PATH = Path.of("src/main/resources/static/world/scene.json");
    private static final Path MODELS_PATH = Path.of("src/main/resources/static/models");

    private final ObjectMapper objectMapper;

    public WorldSceneController(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    @GetMapping(value = "/scene", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<JsonNode> getScene() throws IOException {
        JsonNode node = objectMapper.readTree(Files.readString(SCENE_PATH));
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

        Files.writeString(SCENE_PATH, objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(sanitized));

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
}

