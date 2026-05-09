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

    private static final int KILL_REWARD = 150;

    private static final double MAP_WIDTH = 1600;
    private static final double MAP_HEIGHT = 900;
    private static final double PLAYER_MAX_SPEED = 410;
    private static final double PLAYER_ACCELERATION = 2200;
    private static final double PLAYER_SPRINT_SPEED_MULTIPLIER = 1.45;
    private static final double PLAYER_SPRINT_ACCELERATION_MULTIPLIER = 1.2;
    private static final double PLAYER_AIR_ACCELERATION_MULTIPLIER = 0.45;
    private static final double GRAVITY = 1350;
    private static final double JUMP_VELOCITY = 520;
    private static final double BUNNYHOP_SPEED_BOOST = 1.09;
    private static final double PLAYER_FRICTION = 9.5;
    private static final double PLAYER_STOP_SPEED = 90;
    private static final double PLAYER_RADIUS = 20;
    private static final double MAX_BULLET_Z = 700;
    private static final double PLAYER_BODY_MAX_Z = 88;
    private static final double PLAYER_HEAD_MIN_Z = 52;
    private static final double PLAYER_HEAD_MAX_Z = 86;
    private static final double BULLET_SPAWN_Z = 60;
    private static final double BULLET_MUZZLE_FORWARD_OFFSET = 58;
    private static final double BULLET_MUZZLE_SIDE_OFFSET = 0;
    private static final double BULLET_MUZZLE_PITCH_OFFSET = 18;
    private static final double BULLET_HIT_RADIUS = 14;
    private static final double HEADSHOT_RADIUS = 11;
    private static final int KILL_FEED_LIMIT = 6;
    private static final long KILL_FEED_TTL_MS = 8_000;
    private static final int CHAT_LIMIT = 40;
    private static final long CHAT_TTL_MS = 300_000;

    private static final long ROUND_DURATION_MS = 180_000;
    private static final long ROUND_END_DISPLAY_MS = 10_000;

    private static final List<Obstacle> OBSTACLES = List.of(
            // Garduri / cover la spawn RED
            new Obstacle(120, 120, 34, 210),
            new Obstacle(120, 570, 34, 210),
            new Obstacle(190, 210, 145, 34),
            new Obstacle(190, 655, 145, 34),

            // Hambar mare rosu
            new Obstacle(405, 120, 255, 190),
            new Obstacle(465, 310, 68, 95),
            new Obstacle(592, 310, 68, 95),

            // Sopron / zona de lemn
            new Obstacle(250, 405, 235, 42),
            new Obstacle(250, 405, 36, 160),
            new Obstacle(449, 405, 36, 160),

            // Baloți de fan si lazi in curte
            new Obstacle(560, 515, 95, 55),
            new Obstacle(705, 420, 70, 70),
            new Obstacle(770, 570, 125, 58),
            new Obstacle(930, 455, 72, 72),

            // Garaj rosu in dreapta
            new Obstacle(1085, 185, 270, 155),
            new Obstacle(1135, 340, 80, 70),

            // Garduri / cover dreapta
            new Obstacle(1110, 555, 320, 35),
            new Obstacle(1190, 655, 155, 38),
            new Obstacle(1370, 120, 34, 210),
            new Obstacle(1370, 570, 34, 210),

            // Garduri / cover la spawn BLUE
            new Obstacle(1280, 210, 145, 34),
            new Obstacle(1280, 655, 145, 34),

            // Props mici pentru cover extra
            new Obstacle(650, 720, 75, 45),
            new Obstacle(870, 230, 80, 45)
    );

    private final String id;
    private final ObjectMapper objectMapper;

    private final Map<String, WebSocketSession> sessions;
    private final Map<String, PlayerState> players;
    private final List<BulletState> bullets = new ArrayList<>();
    private final List<KillFeedEvent> killFeed = new ArrayList<>();
    private final List<ChatEvent> chatMessages = new ArrayList<>();

    private int roundNumber = 1;
    private int redScore = 0;
    private int blueScore = 0;
    private long roundEndsAt = System.currentTimeMillis() + ROUND_DURATION_MS;
    private boolean roundEnding = false;
    private long nextRoundStartsAt = 0;
    private boolean roundTimerPaused = false;
    private long roundTimerPausedAt = 0;

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

    public synchronized void addPlayer(WebSocketSession session, String playerName, String characterModel) {
        String playerId = session.getId();
        String team = chooseTeam();

        double spawnX = team.equals("RED") ? 85 : MAP_WIDTH - 85;
        double spawnY = 260 + Math.random() * 380;

        sessions.put(playerId, session);
        players.put(playerId, new PlayerState(playerId, playerName, team, characterModel, spawnX, spawnY));
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

    public synchronized void handleWeaponBuy(String playerId, int weaponSlot) {
        PlayerState player = players.get(playerId);

        if (player == null) {
            return;
        }

        WeaponType weapon = getWeaponBySlot(weaponSlot);

        if (weapon != null && player.buyWeapon(weapon)) {
            player.switchWeapon(weapon);
        }
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

        if (!roundEnding && players.size() < 2) {
            if (!roundTimerPaused) {
                roundTimerPaused = true;
                roundTimerPausedAt = now;
            }
            return;
        }

        if (roundTimerPaused) {
            roundEndsAt += now - roundTimerPausedAt;
            roundTimerPaused = false;
            roundTimerPausedAt = 0;
        }

        if (!roundEnding && now >= roundEndsAt) {
            roundEnding = true;
            nextRoundStartsAt = now + ROUND_END_DISPLAY_MS;
            bullets.clear();
            return;
        }

        if (!roundEnding || now < nextRoundStartsAt) {
            return;
        }

        roundNumber++;
        redScore = 0;
        blueScore = 0;
        roundEndsAt = now + ROUND_DURATION_MS;
        roundEnding = false;
        nextRoundStartsAt = 0;
        bullets.clear();
        killFeed.clear();

        for (PlayerState player : players.values()) {
            respawnPlayer(player);
            player.resetRoundStats();
            player.resetBalance();
        }
    }

    public synchronized void handleChatMessage(String playerId, String text) {
        PlayerState player = players.get(playerId);

        if (player == null || text == null) {
            return;
        }

        String normalizedText = text.trim();

        if (normalizedText.isEmpty()) {
            return;
        }

        if (normalizedText.length() > 180) {
            normalizedText = normalizedText.substring(0, 180);
        }

        chatMessages.add(new ChatEvent(
                player.getName(),
                player.getTeam(),
                normalizedText,
                System.currentTimeMillis()
        ));

        while (chatMessages.size() > CHAT_LIMIT) {
            chatMessages.remove(0);
        }
    }

    private void updatePlayers(double deltaSeconds) {
        if (roundEnding) {
            return;
        }

        long now = System.currentTimeMillis();

        for (PlayerState player : players.values()) {
            player.finishReloadIfNeeded(now);
            handleWeaponPurchase(player);
            handleWeaponSwitch(player);

            if (player.isReload()) {
                player.startReload(now);
            }

            updatePlayerMovement(player, deltaSeconds);
            updatePlayerVerticalMovement(player, deltaSeconds);

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

    private void handleWeaponPurchase(PlayerState player) {
        Integer buyWeaponSlot = player.getBuyWeaponSlot();

        if (buyWeaponSlot == null) {
            return;
        }

        WeaponType weapon = getWeaponBySlot(buyWeaponSlot);

        if (weapon != null && player.buyWeapon(weapon)) {
            player.switchWeapon(weapon);
        }

        player.clearBuyWeaponSlot();
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
            boolean sprinting = player.isSprint() && forward > 0;
            boolean airborne = player.getZ() > 0.001;
            double maxSpeed = sprinting
                    ? PLAYER_MAX_SPEED * PLAYER_SPRINT_SPEED_MULTIPLIER
                    : PLAYER_MAX_SPEED;
            double acceleration = sprinting
                    ? PLAYER_ACCELERATION * PLAYER_SPRINT_ACCELERATION_MULTIPLIER
                    : PLAYER_ACCELERATION;

            if (airborne) {
                acceleration *= PLAYER_AIR_ACCELERATION_MULTIPLIER;
            }

            accelerate(player, wishDirectionX, wishDirectionY, maxSpeed, acceleration, deltaSeconds);
        }

        double nextX = player.getX() + player.getVelocityX() * deltaSeconds;
        double nextY = player.getY() + player.getVelocityY() * deltaSeconds;

        movePlayerWithCollision(player, nextX, nextY);
    }

    private void updatePlayerVerticalMovement(PlayerState player, double deltaSeconds) {
        boolean onGround = player.getZ() <= 0.001;

        if (player.isJump() && onGround) {
            player.setVelocityZ(JUMP_VELOCITY);
            player.setVelocityX(player.getVelocityX() * BUNNYHOP_SPEED_BOOST);
            player.setVelocityY(player.getVelocityY() * BUNNYHOP_SPEED_BOOST);
            onGround = false;
        }

        if (!onGround) {
            player.setVelocityZ(player.getVelocityZ() - GRAVITY * deltaSeconds);
            player.setZ(player.getZ() + player.getVelocityZ() * deltaSeconds);

            if (player.getZ() <= 0) {
                player.setZ(0);
                player.setVelocityZ(0);
            }
        }
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
        WeaponType weapon = getWeaponBySlot(player.getWeaponSlot());

        if (weapon != null) {
            player.switchWeapon(weapon);
        }
    }

    private WeaponType getWeaponBySlot(int slot) {
        return switch (slot) {
            case 1 -> WeaponType.PISTOL;
            case 2 -> WeaponType.RIFLE;
            case 3 -> WeaponType.SMG;
            case 4 -> WeaponType.SHOTGUN;
            case 5 -> WeaponType.SNIPER;
            default -> null;
        };
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

            double forwardX = Math.cos(player.getAngle());
            double forwardY = Math.sin(player.getAngle());
            double rightX = -Math.sin(player.getAngle());
            double rightY = Math.cos(player.getAngle());

            double muzzleForwardOffset = Math.cos(finalPitch) * BULLET_MUZZLE_FORWARD_OFFSET;

            double muzzleX = player.getX()
                    + forwardX * muzzleForwardOffset
                    + rightX * BULLET_MUZZLE_SIDE_OFFSET;

            double muzzleY = player.getY()
                    + forwardY * muzzleForwardOffset
                    + rightY * BULLET_MUZZLE_SIDE_OFFSET;

            double muzzleZ = player.getZ()
                    + BULLET_SPAWN_Z
                    + Math.sin(finalPitch) * BULLET_MUZZLE_PITCH_OFFSET;

            BulletState bullet = new BulletState(
                    "b-" + System.nanoTime() + "-" + i,
                    player.getId(),
                    weapon.getDamage(),
                    muzzleX,
                    muzzleY,
                    muzzleZ,
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
                    || bullet.getZ() > MAX_BULLET_Z;

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

                ClosestPointOnSegment closestPoint = closestPointOnBulletPathToPlayer(bullet, player);
                double playerZ = player.getZ();
                boolean headshot = isHeadshot(closestPoint, playerZ);
                boolean bodyshot = isBodyshot(closestPoint, playerZ);

                if (headshot || bodyshot) {
                    player.setHp(headshot ? 0 : player.getHp() - bullet.getDamage());
                    bulletIterator.remove();

                    if (player.getHp() <= 0) {
                        attacker.addKill();
                        attacker.addKillReward(KILL_REWARD);
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

    private boolean isHeadshot(ClosestPointOnSegment closestPoint, double playerZ) {
        return closestPoint.horizontalDistance <= HEADSHOT_RADIUS
                && closestPoint.z >= playerZ + PLAYER_HEAD_MIN_Z
                && closestPoint.z <= playerZ + PLAYER_HEAD_MAX_Z;
    }

    private boolean isBodyshot(ClosestPointOnSegment closestPoint, double playerZ) {
        if (closestPoint.z < playerZ || closestPoint.z > playerZ + PLAYER_BODY_MAX_Z) {
            return false;
        }

        // Stricter near shoulders/neck to avoid grazing hits above the model.
        double upperBodyStartZ = playerZ + PLAYER_BODY_MAX_Z - 16;
        double allowedRadius = closestPoint.z >= upperBodyStartZ
                ? BULLET_HIT_RADIUS * 0.72
                : BULLET_HIT_RADIUS;

        return closestPoint.horizontalDistance <= allowedRadius;
    }

    private ClosestPointOnSegment closestPointOnBulletPathToPlayer(BulletState bullet, PlayerState player) {
        double startX = bullet.getPreviousX();
        double startY = bullet.getPreviousY();
        double startZ = bullet.getPreviousZ();
        double endX = bullet.getX();
        double endY = bullet.getY();
        double endZ = bullet.getZ();

        double segmentX = endX - startX;
        double segmentY = endY - startY;
        double segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;

        double t;
        if (segmentLengthSquared <= 1e-9) {
            t = 0.0;
        } else {
            double playerOffsetX = player.getX() - startX;
            double playerOffsetY = player.getY() - startY;
            t = (playerOffsetX * segmentX + playerOffsetY * segmentY) / segmentLengthSquared;
            t = clamp(t, 0, 1);
        }

        double closestX = startX + segmentX * t;
        double closestY = startY + segmentY * t;
        double closestZ = startZ + (endZ - startZ) * t;
        double horizontalDistance = distance(closestX, closestY, player.getX(), player.getY());

        return new ClosestPointOnSegment(horizontalDistance, closestZ);
    }

    private void addTeamScore(String team) {
        if (team.equals("RED")) {
            redScore++;
        } else {
            blueScore++;
        }
    }

    private void respawnPlayer(PlayerState player) {
        double spawnX = player.getTeam().equals("RED") ? 85 : MAP_WIDTH - 85;
        double spawnY = 260 + Math.random() * 380;

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

    private void pruneChat(long now) {
        chatMessages.removeIf(event -> now - event.createdAt() > CHAT_TTL_MS);
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
        long countdownReferenceTime = roundTimerPaused ? roundTimerPausedAt : now;
        long timeLeftSeconds = roundEnding
                ? Math.max(0, (nextRoundStartsAt - now) / 1000)
                : Math.max(0, (roundEndsAt - countdownReferenceTime) / 1000);

        pruneKillFeed(now);
        pruneChat(now);

        GameSnapshot snapshot = new GameSnapshot(
                players.values()
                        .stream()
                        .map(player -> new GameSnapshot.PlayerView(
                                player.getId(),
                                player.getName(),
                                player.getTeam(),
                                player.getCharacterModel(),
                                player.getX(),
                                player.getY(),
                                player.getZ(),
                                player.getVelocityX(),
                                player.getVelocityY(),
                                player.getVelocityZ(),
                                player.getAngle(),
                                player.getPitch(),
                                player.getLastProcessedInputSequence(),
                                player.getHp(),
                                player.getKills(),
                                player.getDeaths(),
                                player.getBalance(),
                                player.getWeapon().getDisplayName(),
                                player.getAmmo(),
                                player.getWeapon().getMagazineSize(),
                                player.isReloading(),
                                player.getUnlockedWeapons()
                                        .stream()
                                        .map(WeaponType::getDisplayName)
                                        .toList()
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

                chatMessages.stream()
                        .map(message -> new GameSnapshot.ChatMessageView(
                                message.player(),
                                message.team(),
                                message.text(),
                                message.createdAt()
                        ))
                        .toList(),

                new GameSnapshot.RoundView(
                        roundNumber,
                        timeLeftSeconds,
                        redScore,
                        blueScore,
                        roundEnding ? "ENDING" : "PLAYING",
                        getTopPlayersByKd()
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

    private List<GameSnapshot.TopPlayerView> getTopPlayersByKd() {
        return players.values()
                .stream()
                .sorted(
                        Comparator.comparingDouble(this::calculateKd)
                                .reversed()
                                .thenComparing(PlayerState::getKills, Comparator.reverseOrder())
                                .thenComparing(PlayerState::getDeaths)
                )
                .limit(3)
                .map(player -> new GameSnapshot.TopPlayerView(
                        player.getName(),
                        player.getTeam(),
                        player.getKills(),
                        player.getDeaths(),
                        calculateKd(player)
                ))
                .toList();
    }

    private double calculateKd(PlayerState player) {
        if (player.getDeaths() == 0) {
            return player.getKills();
        }

        return Math.round(((double) player.getKills() / player.getDeaths()) * 100.0) / 100.0;
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

    private record ChatEvent(String player, String team, String text, long createdAt) {
    }

    private record ClosestPointOnSegment(double horizontalDistance, double z) {
    }

    public String getId() {
        return id;
    }

    public synchronized int getPlayerCount() {
        return players.size();
    }
}
