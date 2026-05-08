package me.andrei9876.voidstrike.websocket;

import me.andrei9876.voidstrike.game.GameRoom;
import me.andrei9876.voidstrike.game.GameRoomManager;
import me.andrei9876.voidstrike.game.model.ClientInputMessage;
import me.andrei9876.voidstrike.game.model.JoinGameMessage;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@Component
public class GameWebSocketHandler extends TextWebSocketHandler {

    private static final int MIN_NAME_LENGTH = 3;
    private static final int MAX_NAME_LENGTH = 16;
    private static final String NAME_PATTERN = "^[a-zA-Z0-9_-]+$";
    private static final String CHARACTER_PATTERN = "^character-[a-r]\\.glb$";
    private static final String DEFAULT_CHARACTER_MODEL = "character-a.glb";

    private final ObjectMapper objectMapper;
    private final GameRoomManager gameRoomManager;

    public GameWebSocketHandler(ObjectMapper objectMapper, GameRoomManager gameRoomManager) {
        this.objectMapper = objectMapper;
        this.gameRoomManager = gameRoomManager;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        session.sendMessage(new TextMessage("""
                {
                  "type": "connected",
                  "message": "Send a join message with a valid name."
                }
                """));
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        String payload = message.getPayload();

        JsonNode json;
        try {
            json = objectMapper.readTree(payload);
        } catch (Exception e) {
            sendError(session, "Invalid JSON.");
            return;
        }

        String type = json.has("type") ? json.get("type").asText() : "";

        if ("join".equals(type)) {
            handleJoinMessage(session, payload);
            return;
        }

        GameRoom room = gameRoomManager.getRoomForPlayer(session.getId());

        if (room == null) {
            sendError(session, "You must join with a valid name before playing.");
            return;
        }

        if ("buyWeapon".equals(type)) {
            int weaponSlot = json.has("weaponSlot") ? json.get("weaponSlot").asInt() : 0;
            room.handleWeaponBuy(session.getId(), weaponSlot);
            return;
        }

        if ("chat".equals(type)) {
            String text = json.has("text") ? json.get("text").asText() : "";
            room.handleChatMessage(session.getId(), text);
            return;
        }

        if ("input".equals(type)) {
            ClientInputMessage input = objectMapper.readValue(payload, ClientInputMessage.class);
            room.handleInput(session.getId(), input);
        }
    }

    private void handleJoinMessage(WebSocketSession session, String payload) throws Exception {
        if (gameRoomManager.getRoomForPlayer(session.getId()) != null) {
            sendError(session, "You are already in a room.");
            return;
        }

        JoinGameMessage joinMessage = objectMapper.readValue(payload, JoinGameMessage.class);
        String playerName = normalizeName(joinMessage.getName());
        String characterModel = normalizeCharacterModel(joinMessage.getCharacterModel());

        String validationError = validatePlayerName(playerName);

        if (validationError != null) {
            session.sendMessage(new TextMessage("""
                    {
                      "type": "nameRejected",
                      "message": "%s"
                    }
                    """.formatted(escapeJson(validationError))));
            return;
        }

        GameRoom room = gameRoomManager.joinRoom(session, playerName, characterModel);

        session.sendMessage(new TextMessage("""
                {
                  "type": "joined",
                  "playerId": "%s",
                  "roomId": "%s",
                  "name": "%s",
                  "characterModel": "%s"
                }
                """.formatted(
                escapeJson(session.getId()),
                escapeJson(room.getId()),
                escapeJson(playerName),
                escapeJson(characterModel)
        )));
    }

    private String normalizeName(String name) {
        return name == null ? "" : name.trim();
    }

    private String normalizeCharacterModel(String characterModel) {
        if (characterModel == null) {
            return DEFAULT_CHARACTER_MODEL;
        }

        String normalized = characterModel.trim().toLowerCase();

        if (!normalized.matches(CHARACTER_PATTERN)) {
            return DEFAULT_CHARACTER_MODEL;
        }

        return normalized;
    }

    private String validatePlayerName(String name) {
        if (name.length() < MIN_NAME_LENGTH) {
            return "Numele trebuie să aibă cel puțin 3 caractere.";
        }

        if (name.length() > MAX_NAME_LENGTH) {
            return "Numele trebuie să aibă maximum 16 caractere.";
        }

        if (!name.matches(NAME_PATTERN)) {
            return "Numele poate conține doar litere, cifre, _ și -.";
        }

        return null;
    }

    private void sendError(WebSocketSession session, String message) throws Exception {
        session.sendMessage(new TextMessage("""
                {
                  "type": "error",
                  "message": "%s"
                }
                """.formatted(escapeJson(message))));
    }

    private String escapeJson(String value) {
        if (value == null) {
            return "";
        }

        return value
                .replace("\\", "\\\\")
                .replace("\"", "\\\"");
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        gameRoomManager.leaveRoom(session.getId());
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) {
        gameRoomManager.leaveRoom(session.getId());
    }
}
