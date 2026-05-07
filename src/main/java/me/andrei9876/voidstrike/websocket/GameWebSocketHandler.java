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
import tools.jackson.databind.ObjectMapper;

@Component
public class GameWebSocketHandler extends TextWebSocketHandler {

    private static final int MIN_NAME_LENGTH = 3;
    private static final int MAX_NAME_LENGTH = 16;
    private static final String NAME_PATTERN = "^[a-zA-Z0-9_-]+$";

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

        if (payload.contains("\"type\":\"join\"") || payload.contains("\"type\": \"join\"")) {
            handleJoinMessage(session, payload);
            return;
        }

        ClientInputMessage input = objectMapper.readValue(payload, ClientInputMessage.class);

        if (!"input".equals(input.getType())) {
            return;
        }

        GameRoom room = gameRoomManager.getRoomForPlayer(session.getId());

        if (room == null) {
            session.sendMessage(new TextMessage("""
                    {
                      "type": "error",
                      "message": "You must join with a valid name before playing."
                    }
                    """));
            return;
        }

        room.handleInput(session.getId(), input);
    }

    private void handleJoinMessage(WebSocketSession session, String payload) throws Exception {
        if (gameRoomManager.getRoomForPlayer(session.getId()) != null) {
            session.sendMessage(new TextMessage("""
                    {
                      "type": "error",
                      "message": "You are already in a room."
                    }
                    """));
            return;
        }

        JoinGameMessage joinMessage = objectMapper.readValue(payload, JoinGameMessage.class);
        String playerName = normalizeName(joinMessage.getName());

        String validationError = validatePlayerName(playerName);

        if (validationError != null) {
            session.sendMessage(new TextMessage("""
                    {
                      "type": "nameRejected",
                      "message": "%s"
                    }
                    """.formatted(validationError)));
            return;
        }

        GameRoom room = gameRoomManager.joinRoom(session, playerName);

        String welcomeMessage = """
                {
                  "type": "joined",
                  "playerId": "%s",
                  "roomId": "%s",
                  "name": "%s"
                }
                """.formatted(session.getId(), room.getId(), playerName);

        session.sendMessage(new TextMessage(welcomeMessage));
    }

    private String normalizeName(String name) {
        if (name == null) {
            return "";
        }

        return name.trim();
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

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        gameRoomManager.leaveRoom(session.getId());
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) {
        gameRoomManager.leaveRoom(session.getId());
    }
}