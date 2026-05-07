package me.andrei9876.voidstrike.game;

import me.andrei9876.voidstrike.game.model.BulletState;
import me.andrei9876.voidstrike.game.model.ClientInputMessage;
import me.andrei9876.voidstrike.game.model.GameSnapshot;
import me.andrei9876.voidstrike.game.model.PlayerState;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Map;

public class GameRoom {

    public static final int MAX_PLAYERS = 16;

    private static final double MAP_WIDTH = 1600;
    private static final double MAP_HEIGHT = 900;
    private static final double PLAYER_SPEED = 260;
    private static final double BULLET_SPEED = 700;
    private static final double PLAYER_RADIUS = 20;
    private static final double BULLET_HIT_RADIUS = 28;
    private static final int BULLET_DAMAGE = 25;
    private static final long SHOT_COOLDOWN_MS = 250;

    private final String id;
    private final ObjectMapper objectMapper;

    private final Map<String, WebSocketSession> sessions;
    private final Map<String, PlayerState> players;
    private final List<BulletState> bullets = new ArrayList<>();

    public GameRoom(
            String id,
            ObjectMapper objectMapper,
            Map<String, WebSocketSession> sessions,
            Map<String, PlayerState> players
    ) {
        this.id = id;
        this.objectMapper = objectMapper;
        this.sessions = sessions;
        this.players = players;
    }

    public synchronized boolean hasFreeSlot() {
        return players.size() < MAX_PLAYERS;
    }

    public synchronized boolean isPlayerNameAvailable(String name) {
        return players.values()
                .stream()
                .noneMatch(player -> player.getName().equalsIgnoreCase(name));
    }

    public synchronized void addPlayer(WebSocketSession session, String playerName) {
        String playerId = session.getId();

        double spawnX = 100 + Math.random() * (MAP_WIDTH - 200);
        double spawnY = 100 + Math.random() * (MAP_HEIGHT - 200);

        sessions.put(playerId, session);
        players.put(playerId, new PlayerState(playerId, playerName, spawnX, spawnY));
    }

    public synchronized void removePlayer(String playerId) {
        sessions.remove(playerId);
        players.remove(playerId);
        bullets.removeIf(bullet -> bullet.getOwnerId().equals(playerId));
    }

    public synchronized void handleInput(String playerId, ClientInputMessage input) {
        PlayerState player = players.get(playerId);

        if (player == null) {
            return;
        }

        player.applyInput(input);
    }

    public synchronized void tick(double deltaSeconds) {
        updatePlayers(deltaSeconds);
        updateBullets(deltaSeconds);
        handleBulletHits();
        broadcastSnapshot();
    }

    private void updatePlayers(double deltaSeconds) {
        long now = System.currentTimeMillis();

        for (PlayerState player : players.values()) {
            double dx = 0;
            double dy = 0;

            if (player.isUp()) {
                dy -= 1;
            }

            if (player.isDown()) {
                dy += 1;
            }

            if (player.isLeft()) {
                dx -= 1;
            }

            if (player.isRight()) {
                dx += 1;
            }

            double length = Math.sqrt(dx * dx + dy * dy);

            if (length > 0) {
                dx /= length;
                dy /= length;
            }

            double nextX = player.getX() + dx * PLAYER_SPEED * deltaSeconds;
            double nextY = player.getY() + dy * PLAYER_SPEED * deltaSeconds;

            player.setX(clamp(nextX, PLAYER_RADIUS, MAP_WIDTH - PLAYER_RADIUS));
            player.setY(clamp(nextY, PLAYER_RADIUS, MAP_HEIGHT - PLAYER_RADIUS));

            if (player.isShoot() && now - player.getLastShotAt() >= SHOT_COOLDOWN_MS) {
                spawnBullet(player);
                player.setLastShotAt(now);
            }
        }
    }

    private void spawnBullet(PlayerState player) {
        double velocityX = Math.cos(player.getAngle()) * BULLET_SPEED;
        double velocityY = Math.sin(player.getAngle()) * BULLET_SPEED;

        BulletState bullet = new BulletState(
                "b-" + System.nanoTime(),
                player.getId(),
                player.getX(),
                player.getY(),
                velocityX,
                velocityY
        );

        bullets.add(bullet);
    }

    private void updateBullets(double deltaSeconds) {
        Iterator<BulletState> iterator = bullets.iterator();

        while (iterator.hasNext()) {
            BulletState bullet = iterator.next();
            bullet.update(deltaSeconds);

            boolean outsideMap = bullet.getX() < 0
                    || bullet.getX() > MAP_WIDTH
                    || bullet.getY() < 0
                    || bullet.getY() > MAP_HEIGHT;

            if (bullet.isExpired() || outsideMap) {
                iterator.remove();
            }
        }
    }

    private void handleBulletHits() {
        Iterator<BulletState> bulletIterator = bullets.iterator();

        while (bulletIterator.hasNext()) {
            BulletState bullet = bulletIterator.next();

            for (PlayerState player : players.values()) {
                if (player.getId().equals(bullet.getOwnerId())) {
                    continue;
                }

                double distance = distance(bullet.getX(), bullet.getY(), player.getX(), player.getY());

                if (distance <= BULLET_HIT_RADIUS) {
                    player.setHp(player.getHp() - BULLET_DAMAGE);
                    bulletIterator.remove();

                    if (player.getHp() <= 0) {
                        respawnPlayer(player);
                    }

                    break;
                }
            }
        }
    }

    private void respawnPlayer(PlayerState player) {
        double spawnX = 100 + Math.random() * (MAP_WIDTH - 200);
        double spawnY = 100 + Math.random() * (MAP_HEIGHT - 200);

        player.respawn(spawnX, spawnY);
    }

    private void broadcastSnapshot() {
        GameSnapshot snapshot = new GameSnapshot(
                players.values()
                        .stream()
                        .map(player -> new GameSnapshot.PlayerView(
                                player.getId(),
                                player.getName(),
                                player.getX(),
                                player.getY(),
                                player.getAngle(),
                                player.getHp()
                        ))
                        .toList(),
                bullets.stream()
                        .map(bullet -> new GameSnapshot.BulletView(
                                bullet.getId(),
                                bullet.getX(),
                                bullet.getY()
                        ))
                        .toList()
        );

        try {
            String json = objectMapper.writeValueAsString(snapshot);
            TextMessage message = new TextMessage(json);

            for (WebSocketSession session : sessions.values()) {
                if (session.isOpen()) {
                    session.sendMessage(message);
                }
            }
        } catch (IOException exception) {
            throw new IllegalStateException("Could not broadcast game snapshot", exception);
        }
    }

    private double distance(double ax, double ay, double bx, double by) {
        double dx = ax - bx;
        double dy = ay - by;

        return Math.sqrt(dx * dx + dy * dy);
    }

    private double clamp(double value, double min, double max) {
        return Math.max(min, Math.min(max, value));
    }

    public String getId() {
        return id;
    }

    public synchronized int getPlayerCount() {
        return players.size();
    }
}