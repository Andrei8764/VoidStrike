package me.andrei9876.voidstrike.game;

import tools.jackson.databind.ObjectMapper;
import me.andrei9876.voidstrike.game.model.BulletState;
import me.andrei9876.voidstrike.game.model.ClientInputMessage;
import me.andrei9876.voidstrike.game.model.GameSnapshot;
import me.andrei9876.voidstrike.game.model.PlayerState;
import me.andrei9876.voidstrike.game.model.WeaponType;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Iterator;
import java.util.List;
import java.util.Map;

public class GameRoom {

    public static final int MAX_PLAYERS = 32;

    private static final double MAP_WIDTH = 1600;
    private static final double MAP_HEIGHT = 900;
    private static final double PLAYER_MAX_SPEED = 410;
    private static final double PLAYER_ACCELERATION = 2200;
    private static final double PLAYER_FRICTION = 9.5;
    private static final double PLAYER_STOP_SPEED = 90;
    private static final double PLAYER_RADIUS = 20;
    private static final double PLAYER_HEIGHT = 145;
    private static final double PLAYER_HEAD_MIN_Z = 108;
    private static final double PLAYER_HEAD_MAX_Z = 152;
    private static final double BULLET_SPAWN_Z = 92;
    private static final double BULLET_HIT_RADIUS = 28;
    private static final double HEADSHOT_RADIUS = 19;
    private static final int KILL_FEED_LIMIT = 6;
    private static final long KILL_FEED_TTL_MS = 8_000;

    private static final long ROUND_DURATION_MS = 180_000;
    private static final List<Obstacle> OBSTACLES = List.of(
            new Obstacle(360, 130, 150, 130),
            new Obstacle(650, 80, 140, 240),
            new Obstacle(1010, 130, 220, 120),
            new Obstacle(220, 390, 210, 130),
            new Obstacle(590, 390, 160, 160),
            new Obstacle(850, 380, 160, 170),
            new Obstacle(1180, 390, 210, 130),
            new Obstacle(370, 660, 220, 115),
            new Obstacle(780, 650, 160, 140),
            new Obstacle(1080, 660, 150, 115)
    );

    private final String id;
    private final ObjectMapper objectMapper;

    private final Map<String, WebSocketSession> sessions;
    private final Map<String, PlayerState> players;
    private final List<BulletState> bullets = new ArrayList<>();
    private final List<KillFeedEvent> killFeed = new ArrayList<>();

    private int roundNumber = 1;
    private int redScore = 0;
    private int blueScore = 0;
    private long roundEndsAt = System.currentTimeMillis() + ROUND_DURATION_MS;

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
        String team = chooseTeam();

        double spawnX = team.equals("RED") ? 160 : MAP_WIDTH - 160;
        double spawnY = 140 + Math.random() * (MAP_HEIGHT - 280);

        sessions.put(playerId, session);
        players.put(playerId, new PlayerState(playerId, playerName, team, spawnX, spawnY));
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
        updateRound();
        updatePlayers(deltaSeconds);
        updateBullets(deltaSeconds);
        handleBulletHits();
        broadcastSnapshot();
    }

    private void updateRound() {
        long now = System.currentTimeMillis();

        if (now < roundEndsAt) {
            return;
        }

        roundNumber++;
        roundEndsAt = now + ROUND_DURATION_MS;
        bullets.clear();

        for (PlayerState player : players.values()) {
            respawnPlayer(player);
        }
    }

    private void updatePlayers(double deltaSeconds) {
        long now = System.currentTimeMillis();

        for (PlayerState player : players.values()) {
            player.finishReloadIfNeeded(now);
            handleWeaponSwitch(player);

            if (player.isReload()) {
                player.startReload(now);
            }

            updatePlayerMovement(player, deltaSeconds);

            if (canShoot(player, now)) {
                spawnBullet(player);
                player.consumeAmmo();
                player.setLastShotAt(now);

                if (player.getAmmo() <= 0) {
                    player.startReload(now);
                }
            }
        }
    }

    private void updatePlayerMovement(PlayerState player, double deltaSeconds) {
        double forward = 0;
        double strafe = 0;

        if (player.isUp()) {
            forward += 1;
        }

        if (player.isDown()) {
            forward -= 1;
        }

        if (player.isLeft()) {
            strafe -= 1;
        }

        if (player.isRight()) {
            strafe += 1;
        }

        applyFriction(player, deltaSeconds);

        double length = Math.sqrt(forward * forward + strafe * strafe);

        if (length > 0) {
            forward /= length;
            strafe /= length;

            double cos = Math.cos(player.getAngle());
            double sin = Math.sin(player.getAngle());

            double wishDirectionX = cos * forward - sin * strafe;
            double wishDirectionY = sin * forward + cos * strafe;

            accelerate(player, wishDirectionX, wishDirectionY, PLAYER_MAX_SPEED, PLAYER_ACCELERATION, deltaSeconds);
        }

        double nextX = player.getX() + player.getVelocityX() * deltaSeconds;
        double nextY = player.getY() + player.getVelocityY() * deltaSeconds;

        movePlayerWithCollision(player, nextX, nextY);
    }

    private void applyFriction(PlayerState player, double deltaSeconds) {
        double speed = Math.sqrt(
                player.getVelocityX() * player.getVelocityX()
                        + player.getVelocityY() * player.getVelocityY()
        );

        if (speed < 0.001) {
            player.setVelocityX(0);
            player.setVelocityY(0);
            return;
        }

        double control = Math.max(speed, PLAYER_STOP_SPEED);
        double drop = control * PLAYER_FRICTION * deltaSeconds;
        double newSpeed = Math.max(speed - drop, 0);
        double scale = newSpeed / speed;

        player.setVelocityX(player.getVelocityX() * scale);
        player.setVelocityY(player.getVelocityY() * scale);
    }

    private void accelerate(
            PlayerState player,
            double wishDirectionX,
            double wishDirectionY,
            double maxSpeed,
            double acceleration,
            double deltaSeconds
    ) {
        double currentSpeed = player.getVelocityX() * wishDirectionX + player.getVelocityY() * wishDirectionY;
        double addSpeed = maxSpeed - currentSpeed;

        if (addSpeed <= 0) {
            return;
        }

        double accelerationSpeed = acceleration * deltaSeconds;

        if (accelerationSpeed > addSpeed) {
            accelerationSpeed = addSpeed;
        }

        player.setVelocityX(player.getVelocityX() + accelerationSpeed * wishDirectionX);
        player.setVelocityY(player.getVelocityY() + accelerationSpeed * wishDirectionY);
    }

    private void handleWeaponSwitch(PlayerState player) {
        WeaponType weapon = switch (player.getWeaponSlot()) {
            case 1 -> WeaponType.PISTOL;
            case 2 -> WeaponType.RIFLE;
            case 3 -> WeaponType.SMG;
            case 4 -> WeaponType.SHOTGUN;
            case 5 -> WeaponType.SNIPER;
            default -> null;
        };

        if (weapon != null) {
            player.switchWeapon(weapon);
        }
    }

    private boolean canShoot(PlayerState player, long now) {
        return player.isShoot()
                && !player.isReloading()
                && player.getAmmo() > 0
                && now - player.getLastShotAt() >= player.getWeapon().getCooldownMs();
    }

    private void spawnBullet(PlayerState player) {
        WeaponType weapon = player.getWeapon();

        int bulletCount = weapon == WeaponType.SHOTGUN ? 6 : 1;

        for (int i = 0; i < bulletCount; i++) {
            double spread = (Math.random() - 0.5) * weapon.getSpread();
            double finalAngle = player.getAngle() + spread;
            double finalPitch = player.getPitch();

            double horizontalSpeed = Math.cos(finalPitch) * weapon.getBulletSpeed();
            double velocityX = Math.cos(finalAngle) * horizontalSpeed;
            double velocityY = Math.sin(finalAngle) * horizontalSpeed;
            double velocityZ = Math.sin(finalPitch) * weapon.getBulletSpeed();

            BulletState bullet = new BulletState(
                    "b-" + System.nanoTime() + "-" + i,
                    player.getId(),
                    weapon.getDamage(),
                    player.getX() + Math.cos(player.getAngle()) * PLAYER_RADIUS,
                    player.getY() + Math.sin(player.getAngle()) * PLAYER_RADIUS,
                    BULLET_SPAWN_Z,
                    velocityX,
                    velocityY,
                    velocityZ
            );

            bullets.add(bullet);
        }
    }

    private void updateBullets(double deltaSeconds) {
        Iterator<BulletState> iterator = bullets.iterator();

        while (iterator.hasNext()) {
            BulletState bullet = iterator.next();
            bullet.update(deltaSeconds);

            boolean outsideMap = bullet.getX() < 0
                    || bullet.getX() > MAP_WIDTH
                    || bullet.getY() < 0
                    || bullet.getY() > MAP_HEIGHT
                    || bullet.getZ() < 0
                    || bullet.getZ() > PLAYER_HEIGHT + 80;

            if (bullet.isExpired() || outsideMap || collidesWithObstacle(bullet.getX(), bullet.getY())) {
                iterator.remove();
            }
        }
    }

    private void handleBulletHits() {
        Iterator<BulletState> bulletIterator = bullets.iterator();

        while (bulletIterator.hasNext()) {
            BulletState bullet = bulletIterator.next();
            PlayerState attacker = players.get(bullet.getOwnerId());

            if (attacker == null) {
                bulletIterator.remove();
                continue;
            }

            for (PlayerState player : players.values()) {
                if (player.getId().equals(bullet.getOwnerId())) {
                    continue;
                }

                if (player.getTeam().equals(attacker.getTeam())) {
                    continue;
                }

                double bodyDistance = distance(bullet.getX(), bullet.getY(), player.getX(), player.getY());
                boolean headshot = isHeadshot(bullet, player);

                if (headshot || bodyDistance <= BULLET_HIT_RADIUS) {
                    player.setHp(headshot ? 0 : player.getHp() - bullet.getDamage());
                    bulletIterator.remove();

                    if (player.getHp() <= 0) {
                        attacker.addKill();
                        player.addDeath();
                        addTeamScore(attacker.getTeam());
                        addKillFeedEvent(attacker, player, headshot);
                        respawnPlayer(player);
                    }

                    break;
                }
            }
        }
    }

    private boolean isHeadshot(BulletState bullet, PlayerState player) {
        double distance = distance(bullet.getX(), bullet.getY(), player.getX(), player.getY());

        return distance <= HEADSHOT_RADIUS
                && bullet.getZ() >= PLAYER_HEAD_MIN_Z
                && bullet.getZ() <= PLAYER_HEAD_MAX_Z;
    }

    private void addTeamScore(String team) {
        if (team.equals("RED")) {
            redScore++;
        } else {
            blueScore++;
        }
    }

    private void respawnPlayer(PlayerState player) {
        double spawnX = player.getTeam().equals("RED") ? 160 : MAP_WIDTH - 160;
        double spawnY = 140 + Math.random() * (MAP_HEIGHT - 280);

        player.respawn(spawnX, spawnY);
    }

    private void movePlayerWithCollision(PlayerState player, double nextX, double nextY) {
        double clampedX = clamp(nextX, PLAYER_RADIUS, MAP_WIDTH - PLAYER_RADIUS);
        double clampedY = clamp(nextY, PLAYER_RADIUS, MAP_HEIGHT - PLAYER_RADIUS);

        if (!collidesWithObstacle(clampedX, player.getY(), PLAYER_RADIUS)) {
            player.setX(clampedX);
        } else {
            player.setVelocityX(0);
        }

        if (!collidesWithObstacle(player.getX(), clampedY, PLAYER_RADIUS)) {
            player.setY(clampedY);
        } else {
            player.setVelocityY(0);
        }
    }

    private boolean collidesWithObstacle(double x, double y) {
        return OBSTACLES.stream().anyMatch(obstacle -> obstacle.contains(x, y));
    }

    private boolean collidesWithObstacle(double x, double y, double radius) {
        return OBSTACLES.stream().anyMatch(obstacle -> obstacle.intersectsCircle(x, y, radius));
    }

    private void addKillFeedEvent(PlayerState attacker, PlayerState victim, boolean headshot) {
        String weaponName = attacker.getWeapon().getDisplayName();

        if (headshot) {
            weaponName = weaponName + " HEADSHOT";
        }

        killFeed.add(new KillFeedEvent(
                attacker.getName(),
                victim.getName(),
                weaponName,
                System.currentTimeMillis()
        ));

        killFeed.sort(Comparator.comparingLong(KillFeedEvent::createdAt).reversed());

        while (killFeed.size() > KILL_FEED_LIMIT) {
            killFeed.remove(killFeed.size() - 1);
        }
    }

    private void pruneKillFeed(long now) {
        killFeed.removeIf(event -> now - event.createdAt() > KILL_FEED_TTL_MS);
    }

    private String chooseTeam() {
        long redPlayers = players.values()
                .stream()
                .filter(player -> player.getTeam().equals("RED"))
                .count();

        long bluePlayers = players.values()
                .stream()
                .filter(player -> player.getTeam().equals("BLUE"))
                .count();

        return redPlayers <= bluePlayers ? "RED" : "BLUE";
    }

    private void broadcastSnapshot() {
        long now = System.currentTimeMillis();
        long timeLeftSeconds = Math.max(0, (roundEndsAt - now) / 1000);
        pruneKillFeed(now);

        GameSnapshot snapshot = new GameSnapshot(
                players.values()
                        .stream()
                        .map(player -> new GameSnapshot.PlayerView(
                                player.getId(),
                                player.getName(),
                                player.getTeam(),
                                player.getX(),
                                player.getY(),
                                player.getVelocityX(),
                                player.getVelocityY(),
                                player.getAngle(),
                                player.getLastProcessedInputSequence(),
                                player.getHp(),
                                player.getKills(),
                                player.getDeaths(),
                                player.getWeapon().getDisplayName(),
                                player.getAmmo(),
                                player.getWeapon().getMagazineSize(),
                                player.isReloading()
                        ))
                        .toList(),
                    bullets.stream()
                            .map(bullet -> new GameSnapshot.BulletView(
                                    bullet.getId(),
                                    bullet.getX(),
                                    bullet.getY(),
                                    bullet.getZ(),
                                    bullet.getVelocityX(),
                                    bullet.getVelocityY(),
                                    bullet.getVelocityZ()
                            ))
                            .toList(),
                    OBSTACLES.stream()
                            .map(obstacle -> new GameSnapshot.ObstacleView(
                                    obstacle.x(),
                                    obstacle.y(),
                                    obstacle.width(),
                                    obstacle.height()
                            ))
                            .toList(),
                killFeed.stream()
                        .map(event -> new GameSnapshot.KillFeedView(
                                event.attacker(),
                                event.victim(),
                                event.weapon(),
                                event.createdAt()
                        ))
                        .toList(),
                new GameSnapshot.RoundView(
                        roundNumber,
                        timeLeftSeconds,
                        redScore,
                        blueScore
                )
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

    private record Obstacle(double x, double y, double width, double height) {

        boolean contains(double pointX, double pointY) {
            return pointX >= x && pointX <= x + width && pointY >= y && pointY <= y + height;
        }

        boolean intersectsCircle(double circleX, double circleY, double radius) {
            double closestX = Math.max(x, Math.min(circleX, x + width));
            double closestY = Math.max(y, Math.min(circleY, y + height));
            double dx = circleX - closestX;
            double dy = circleY - closestY;

            return dx * dx + dy * dy <= radius * radius;
        }
    }

    private record KillFeedEvent(String attacker, String victim, String weapon, long createdAt) {
    }

    public String getId() {
        return id;
    }

    public synchronized int getPlayerCount() {
        return players.size();
    }
}
