package me.andrei9876.voidstrike.game;

import org.springframework.stereotype.Service;
import org.springframework.web.socket.WebSocketSession;
import tools.jackson.databind.ObjectMapper;

import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class GameRoomManager {

    private final ObjectMapper objectMapper;

    private final Map<String, GameRoom> rooms = new ConcurrentHashMap<>();
    private final Map<String, String> playerRoomIds = new ConcurrentHashMap<>();

    public GameRoomManager(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public synchronized GameRoom joinRoom(WebSocketSession session, String playerName) {
        Optional<GameRoom> roomWithSlot = rooms.values()
                .stream()
                .filter(room -> room.hasFreeSlot() && room.isPlayerNameAvailable(playerName))
                .findFirst();

        GameRoom room = roomWithSlot.orElseGet(this::createRoom);

        room.addPlayer(session, playerName);
        playerRoomIds.put(session.getId(), room.getId());

        return room;
    }

    public synchronized void leaveRoom(String playerId) {
        String roomId = playerRoomIds.remove(playerId);

        if (roomId == null) {
            return;
        }

        GameRoom room = rooms.get(roomId);

        if (room == null) {
            return;
        }

        room.removePlayer(playerId);

        if (room.getPlayerCount() == 0) {
            rooms.remove(roomId);
        }
    }

    public GameRoom getRoomForPlayer(String playerId) {
        String roomId = playerRoomIds.get(playerId);

        if (roomId == null) {
            return null;
        }

        return rooms.get(roomId);
    }

    public Iterable<GameRoom> getRooms() {
        return rooms.values();
    }

    private GameRoom createRoom() {
        String roomId = "room-" + System.nanoTime();

        GameRoom room = new GameRoom(
                roomId,
                objectMapper,
                new ConcurrentHashMap<>(),
                new ConcurrentHashMap<>()
        );

        rooms.put(roomId, room);

        return room;
    }
}