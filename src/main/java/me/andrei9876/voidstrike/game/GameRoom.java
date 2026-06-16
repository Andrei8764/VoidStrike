package me.andrei9876.voidstrike.game;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.JsonNode;
import me.andrei9876.voidstrike.game.model.BulletState;
import me.andrei9876.voidstrike.game.model.ClientInputMessage;
import me.andrei9876.voidstrike.game.model.GameSnapshot;
import me.andrei9876.voidstrike.game.model.PlayerState;
import me.andrei9876.voidstrike.game.model.WeaponType;
import me.andrei9876.voidstrike.world.WorldStorageService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.ConcurrentWebSocketSessionDecorator;

import java.io.IOException;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.Map;

public class GameRoom {

    private static final Logger log = LoggerFactory.getLogger(GameRoom.class);

    public static final int MAX_PLAYERS = 32;

    private static final int KILL_REWARD = 150;

    private static final double MAP_WIDTH = 3800;
    private static final double MAP_HEIGHT = 3400;
    private static final double PLAYER_MAX_SPEED = 460;
    private static final double PLAYER_ACCELERATION = 2550;
    private static final double PLAYER_SPRINT_SPEED_MULTIPLIER = 1.45;
    private static final double PLAYER_CROUCH_SPEED_MULTIPLIER = 0.52;
    private static final double PLAYER_SPRINT_ACCELERATION_MULTIPLIER = 1.2;
    private static final double PLAYER_CROUCH_ACCELERATION_MULTIPLIER = 0.62;
    private static final double PLAYER_AIR_ACCELERATION_MULTIPLIER = 0.45;
    private static final double GRAVITY = 1350;
    private static final double JUMP_VELOCITY = 520;
    private static final double BUNNYHOP_SPEED_BOOST = 1.09;
    private static final double PLAYER_FRICTION = 7.4;
    private static final double PLAYER_STOP_SPEED = 82;
    private static final double PLAYER_RADIUS = 20;
    private static final double MAX_BULLET_Z = 700;
    private static final double PLAYER_BODY_MAX_Z = 64;
    private static final double PLAYER_HEAD_MIN_Z = 42;
    private static final double PLAYER_HEAD_MAX_Z = 64;
    private static final double PLAYER_CROUCH_BODY_MAX_Z = 48;
    private static final double PLAYER_CROUCH_HEAD_MIN_Z = 30;
    private static final double PLAYER_CROUCH_HEAD_MAX_Z = 48;
    private static final double PLAYER_EYE_HEIGHT_STAND = 54;
    private static final double PLAYER_EYE_HEIGHT_CROUCH = 40;
    private static final double BULLET_EYE_FORWARD_OFFSET = 4;
    private static final double ADS_SPREAD_MULTIPLIER = 0.2;
    private static final double ADS_SPRAY_BUILDUP_PER_SHOT = 0.045;
    private static final double HIP_SPRAY_BUILDUP_PER_SHOT = 0.14;
    private static final double ADS_MAX_SPRAY_MULTIPLIER = 1.2;
    private static final double HIP_MAX_SPRAY_MULTIPLIER = 2.8;
    private static final double FLY_VERTICAL_SPEED = 520;
    private static final double HEADSHOT_RADIUS = 10;
    private static final int KILL_FEED_LIMIT = 6;
    private static final long KILL_FEED_TTL_MS = 8_000;
    private static final int DAMAGE_FEED_LIMIT = 12;
    private static final long DAMAGE_FEED_TTL_MS = 8_000;
    private static final int CHAT_LIMIT = 40;
    private static final long CHAT_TTL_MS = 300_000;

    private static final long ROUND_DURATION_MS = 180_000;
    private static final long ROUND_END_DISPLAY_MS = 10_000;
    private static final long CLIMB_COOLDOWN_MS = 250;
    private static final double CLIMB_TRIGGER_RADIUS = 40;
    private static final double LADDER_FRONT_OFFSET = PLAYER_RADIUS + 6;
    private static final double LADDER_LANDING_SEARCH_STEP = 6;
    private static final int LADDER_LANDING_SEARCH_RINGS = 4;

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
            new Obstacle(870, 230, 80, 45),

            // Extended arena sections for large matches
            new Obstacle(1680, 220, 210, 120),
            new Obstacle(2060, 250, 260, 120),
            new Obstacle(2400, 210, 320, 130),
            new Obstacle(1880, 760, 210, 140),
            new Obstacle(2250, 830, 260, 140),
            new Obstacle(2530, 980, 180, 210),
            new Obstacle(1670, 1320, 230, 120),
            new Obstacle(2050, 1370, 260, 130),
            new Obstacle(2380, 1450, 260, 130),

            new Obstacle(900, 1030, 180, 120),
            new Obstacle(1200, 1120, 220, 110),
            new Obstacle(1540, 1040, 210, 120),

            new Obstacle(260, 1000, 120, 290),
            new Obstacle(2360, 440, 120, 290),
            new Obstacle(2460, 1220, 120, 290)
    );

    private static final List<LadderZone> LADDER_ZONES = List.of();
    private static final List<Obstacle> COLLISION_OBSTACLES = List.of();
    private static final double DEFAULT_PLAYER_COLLIDER_HEIGHT = 72;
    private static final double PLAYER_GROUND_SNAP_EPSILON = 1.5;
    private static final double PLAYER_STEP_UP_HEIGHT = 20;
    private static final int PENETRATION_RESOLVE_PASSES = 4;
    private static final int SPAWN_TRIES = 48;
    private static final double SPAWN_Y_MIN = 200;
    private static final double SPAWN_Y_MAX = MAP_HEIGHT - 200;
    private static final double SPAWN_X_RED = 520;
    private static final double SPAWN_X_BLUE = MAP_WIDTH - 520;
    private static final double SPAWN_RING_STEP = 26;
    private static final double SPAWN_GRID_MAX_RADIUS = 720;
    private static final double SPAWN_GEOMETRY_MARGIN = 18;
    private static final double SPAWN_PLAYER_CLEARANCE = PLAYER_RADIUS * 2.8;
    private static final double SPAWN_MAP_MARGIN = PLAYER_RADIUS + 40;
    private static final double BULLET_COLLISION_EXPAND = 1.25;
    private static final double[][] SPAWN_FOOTPRINT_SAMPLES = {
            {0, 0},
            {PLAYER_RADIUS * 0.82, 0},
            {-PLAYER_RADIUS * 0.82, 0},
            {0, PLAYER_RADIUS * 0.82},
            {0, -PLAYER_RADIUS * 0.82}
    };
    private static final double MOVEMENT_COLLISION_STEP = 4;

    private final String id;
    private final ObjectMapper objectMapper;
    private final WorldStorageService worldStorageService;

    private final Map<String, WebSocketSession> sessions;
    private final Map<String, PlayerState> players;
    private final List<BulletState> bullets = new ArrayList<>();
    private final List<KillFeedEvent> killFeed = new ArrayList<>();
    private final List<DamageFeedEvent> damageFeed = new ArrayList<>();
    private final List<ChatEvent> chatMessages = new ArrayList<>();
    private final List<CollisionBox> sceneCollisionBoxes = new ArrayList<>();
    private final CollisionProfileConfig collisionProfileConfig;
    private final Map<String, List<StoredSpawnPoint>> customSpawnPoints = new HashMap<>();
    private final Map<String, Integer> customSpawnRoundRobin = new HashMap<>();
    private volatile boolean collisionDebugLogging = false;
    private volatile String sceneHash = "n/a";
    private volatile String profilesHash = "n/a";

    // Sanity bounds for a single collision box (world units, post-scale). Mirrors the
    // client (sceneCollision.js) so both sides reject/clamp the same corrupt values.
    private static final double COLLISION_MAX_HALF = 4096.0;
    private static final double COLLISION_MAX_HEIGHT = 8192.0;
    private static final double COLLISION_MIN_DIM = 0.05;
    private final java.util.Set<String> collisionWarningKeys = java.util.concurrent.ConcurrentHashMap.newKeySet();

    private int roundNumber = 1;
    private int redScore = 0;
    private int blueScore = 0;
    private long roundEndsAt = System.currentTimeMillis() + ROUND_DURATION_MS;
    private boolean roundEnding = false;
    private long nextRoundStartsAt = 0;
    private boolean roundTimerPaused = false;
    private long roundTimerPausedAt = 0;
    private boolean adminRoundFrozen = false;

    private final int websocketSendTimeLimitMs;
    private final int websocketSendBufferSizeBytes;

    public GameRoom(
            String id,
            ObjectMapper objectMapper,
            WorldStorageService worldStorageService,
            Map<String, WebSocketSession> sessions,
            Map<String, PlayerState> players,
            int websocketSendTimeLimitMs,
            int websocketSendBufferSizeBytes
    ) {
        this.id = id;
        this.objectMapper = objectMapper;
        this.worldStorageService = worldStorageService;
        this.sessions = sessions;
        this.players = players;
        this.websocketSendTimeLimitMs = websocketSendTimeLimitMs;
        this.websocketSendBufferSizeBytes = websocketSendBufferSizeBytes;
        this.collisionProfileConfig = loadCollisionProfileConfig();
        this.sceneCollisionBoxes.addAll(loadSceneCollisionBoxes());
        recomputeCollisionHashes();
        loadCustomSpawnPoints();
        long solidBoxes = this.sceneCollisionBoxes.stream().filter(box -> box.solid).count();
        log.info("[collision] room {} loaded {} collision boxes ({} solid) scene#={} profiles#={}",
                id, this.sceneCollisionBoxes.size(), solidBoxes, sceneHash, profilesHash);
    }

    // Deterministic 32-bit FNV-1a (8 hex chars). Identical algorithm to the client
    // (sceneCollision.js hashString) so the two hashes can be compared to confirm both
    // sides loaded the same scene.json / collision-profiles.json.
    private static String fnv1aHex(String text) {
        int h = 0x811c9dc5;
        String str = text == null ? "" : text;
        for (int i = 0; i < str.length(); i++) {
            h ^= str.charAt(i);
            h *= 0x01000193;
        }
        return String.format("%08x", h);
    }

    private void recomputeCollisionHashes() {
        try {
            sceneHash = Files.exists(worldStorageService.scenePath())
                    ? fnv1aHex(Files.readString(worldStorageService.scenePath()))
                    : "missing";
        } catch (Exception _ignored) {
            sceneHash = "error";
        }
        try {
            profilesHash = Files.exists(worldStorageService.collisionProfilesPath())
                    ? fnv1aHex(Files.readString(worldStorageService.collisionProfilesPath()))
                    : "missing";
        } catch (Exception _ignored) {
            profilesHash = "error";
        }
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

        SpawnPoint spawn = findSafeSpawn(team, null);

        WebSocketSession outboundSession = new ConcurrentWebSocketSessionDecorator(
                session,
                websocketSendTimeLimitMs,
                websocketSendBufferSizeBytes
        );

        sessions.put(playerId, outboundSession);
        PlayerState player = new PlayerState(playerId, playerName, team, characterModel, spawn.x(), spawn.y());
        applySpawnToPlayer(player, spawn);
        players.put(playerId, player);
    }

    private void applySpawnToPlayer(PlayerState player, SpawnPoint spawn) {
        player.respawn(spawn.x(), spawn.y());
        if (spawn.usesCustomZ()) {
            player.setZ(clamp(spawn.z(), 0, MAX_BULLET_Z));
            player.setVelocityX(0);
            player.setVelocityY(0);
            player.setVelocityZ(0);
            return;
        }
        finalizeSpawnGeometry(player);
    }

    private SpawnPoint findSafeSpawn(String team) {
        return findSafeSpawn(team, null);
    }

    private SpawnPoint findSafeSpawn(String team, PlayerState excludePlayer) {
        List<StoredSpawnPoint> custom = customSpawnPoints.getOrDefault(team, List.of());
        if (!custom.isEmpty()) {
            return findSafeSpawnFromCustomPoints(team, custom, excludePlayer);
        }

        SpawnPoint ingressSpawn = findSafeSpawnFromIngress(team, excludePlayer);
        if (ingressSpawn != null) {
            return ingressSpawn;
        }

        double baseX = "RED".equals(team) ? SPAWN_X_RED : SPAWN_X_BLUE;
        double baseY = SPAWN_Y_MIN + Math.random() * (SPAWN_Y_MAX - SPAWN_Y_MIN);

        if (isSpawnPointSafe(baseX, baseY, excludePlayer)) {
            return new SpawnPoint(baseX, baseY);
        }

        for (int i = 0; i < SPAWN_TRIES; i += 1) {
            double angle = Math.random() * Math.PI * 2;
            double ring = 1 + (i / 8.0);
            double radius = ring * SPAWN_RING_STEP;
            double x = baseX + Math.cos(angle) * radius;
            double y = baseY + Math.sin(angle) * radius;
            x = clamp(x, SPAWN_MAP_MARGIN, MAP_WIDTH - SPAWN_MAP_MARGIN);
            y = clamp(y, SPAWN_Y_MIN, SPAWN_Y_MAX);
            if (isSpawnPointSafe(x, y, excludePlayer)) {
                return new SpawnPoint(x, y);
            }
        }

        SpawnPoint gridSpawn = findSafeSpawnByGridSearch(team, excludePlayer);
        if (gridSpawn != null) {
            return gridSpawn;
        }

        double centerX = MAP_WIDTH / 2.0;
        for (double y = SPAWN_Y_MIN; y <= SPAWN_Y_MAX; y += SPAWN_RING_STEP) {
            if (isSpawnPointSafe(centerX, y, excludePlayer)) {
                return new SpawnPoint(centerX, y);
            }
        }

        SpawnPoint globalSpawn = findSafeSpawnGlobalSearch(team, excludePlayer);
        if (globalSpawn != null) {
            return globalSpawn;
        }

        log.warn("[spawn] no safe spawn found for team {}, trying map center", team);
        return findSafeSpawnNearPoint(MAP_WIDTH / 2.0, MAP_HEIGHT / 2.0, excludePlayer);
    }

    private SpawnPoint findSafeSpawnFromCustomPoints(String team, List<StoredSpawnPoint> custom, PlayerState excludePlayer) {
        int count = custom.size();
        int start = customSpawnRoundRobin.getOrDefault(team, 0) % count;
        customSpawnRoundRobin.put(team, (start + 1) % count);

        List<StoredSpawnPoint> ordered = new ArrayList<>(count);
        for (int offset = 0; offset < count; offset += 1) {
            ordered.add(custom.get((start + offset) % count));
        }
        ordered.sort(Comparator.comparingInt(anchor -> countPlayersNear(anchor.x(), anchor.y(), excludePlayer)));

        for (StoredSpawnPoint anchor : ordered) {
            SpawnPoint spawn = resolveCustomAnchorSpawn(anchor, excludePlayer);
            if (isSpawnPointSafe(spawn.x(), spawn.y(), excludePlayer)) {
                return spawn;
            }
        }

        return resolveCustomAnchorSpawn(ordered.get(0), excludePlayer);
    }

    private SpawnPoint resolveCustomAnchorSpawn(StoredSpawnPoint anchor, PlayerState excludePlayer) {
        SpawnPoint spread = findSafeSpawnNearPoint(anchor.x(), anchor.y(), excludePlayer);
        double dx = spread.x() - anchor.x();
        double dy = spread.y() - anchor.y();
        if (dx * dx + dy * dy < 4.0) {
            return new SpawnPoint(anchor.x(), anchor.y(), anchor.z());
        }
        return spread;
    }

    private int countPlayersNear(double x, double y, PlayerState excludePlayer) {
        int nearby = 0;
        double clearanceSq = SPAWN_PLAYER_CLEARANCE * SPAWN_PLAYER_CLEARANCE;
        for (PlayerState other : players.values()) {
            if (other == excludePlayer) {
                continue;
            }
            double dx = other.getX() - x;
            double dy = other.getY() - y;
            if (dx * dx + dy * dy < clearanceSq) {
                nearby += 1;
            }
        }
        return nearby;
    }

    private SpawnPoint findSafeSpawnNearPoint(double originX, double originY, PlayerState excludePlayer) {
        if (isSpawnPointSafe(originX, originY, excludePlayer)) {
            return new SpawnPoint(originX, originY);
        }

        for (int ring = 1; ring <= 48; ring += 1) {
            double radius = ring * SPAWN_RING_STEP;
            for (int i = 0; i < 16; i += 1) {
                double angle = (Math.PI * 2 * i) / 16;
                double x = clamp(
                        originX + Math.cos(angle) * radius,
                        SPAWN_MAP_MARGIN,
                        MAP_WIDTH - SPAWN_MAP_MARGIN
                );
                double y = clamp(
                        originY + Math.sin(angle) * radius,
                        SPAWN_Y_MIN,
                        SPAWN_Y_MAX
                );
                if (isSpawnPointSafe(x, y, excludePlayer)) {
                    return new SpawnPoint(x, y);
                }
            }
        }

        log.error("[spawn] no validated spawn found near ({}, {})", originX, originY);
        return new SpawnPoint(
                clamp(originX, SPAWN_MAP_MARGIN, MAP_WIDTH - SPAWN_MAP_MARGIN),
                clamp(originY, SPAWN_Y_MIN, SPAWN_Y_MAX)
        );
    }

    private SpawnPoint findSafeSpawnGlobalSearch(String team, PlayerState excludePlayer) {
        double teamAnchorX = "RED".equals(team) ? SPAWN_X_RED : SPAWN_X_BLUE;
        SpawnPoint best = null;
        double bestDistSq = Double.MAX_VALUE;

        for (double x = SPAWN_MAP_MARGIN; x <= MAP_WIDTH - SPAWN_MAP_MARGIN; x += SPAWN_RING_STEP) {
            for (double y = SPAWN_Y_MIN; y <= SPAWN_Y_MAX; y += SPAWN_RING_STEP) {
                if (!isSpawnPointSafe(x, y, excludePlayer)) {
                    continue;
                }
                double dx = x - teamAnchorX;
                double dy = y - (MAP_HEIGHT / 2.0);
                double distSq = dx * dx + dy * dy;
                if (distSq < bestDistSq) {
                    bestDistSq = distSq;
                    best = new SpawnPoint(x, y);
                }
            }
        }

        return best;
    }

    private SpawnPoint findSafeSpawnFromIngress(String team, PlayerState excludePlayer) {
        double ingressX = teamSpawnIngressPoint(team, 0)[0];
        int inwardDir = "RED".equals(team) ? 1 : -1;
        double minX = SPAWN_MAP_MARGIN;
        double maxX = MAP_WIDTH - SPAWN_MAP_MARGIN;

        for (double inward = 0; inward <= SPAWN_GRID_MAX_RADIUS; inward += SPAWN_RING_STEP) {
            double x = clamp(ingressX + inwardDir * inward, minX, maxX);
            for (double y = SPAWN_Y_MIN; y <= SPAWN_Y_MAX; y += SPAWN_RING_STEP) {
                if (isSpawnPointSafe(x, y, excludePlayer)) {
                    return new SpawnPoint(x, y);
                }
            }
        }

        return null;
    }

    private SpawnPoint findSafeSpawnByGridSearch(String team, PlayerState excludePlayer) {
        double baseX = "RED".equals(team) ? SPAWN_X_RED : SPAWN_X_BLUE;
        int xDirection = "RED".equals(team) ? 1 : -1;
        double midY = (SPAWN_Y_MIN + SPAWN_Y_MAX) / 2.0;

        for (double radius = 0; radius <= SPAWN_GRID_MAX_RADIUS; radius += SPAWN_RING_STEP) {
            for (double y = SPAWN_Y_MIN; y <= SPAWN_Y_MAX; y += SPAWN_RING_STEP) {
                double x = clamp(
                        baseX + xDirection * radius,
                        SPAWN_MAP_MARGIN,
                        MAP_WIDTH - SPAWN_MAP_MARGIN
                );
                if (isSpawnPointSafe(x, y, excludePlayer)) {
                    return new SpawnPoint(x, y);
                }
            }

            for (int side = -1; side <= 1; side += 2) {
                double y = clamp(midY + side * radius, SPAWN_Y_MIN, SPAWN_Y_MAX);
                for (double xOffset = 0; xOffset <= radius; xOffset += SPAWN_RING_STEP) {
                    double x = clamp(
                            baseX + xDirection * xOffset,
                            SPAWN_MAP_MARGIN,
                            MAP_WIDTH - SPAWN_MAP_MARGIN
                    );
                    if (isSpawnPointSafe(x, y, excludePlayer)) {
                        return new SpawnPoint(x, y);
                    }
                }
            }
        }

        return null;
    }

    private boolean isSpawnPointSafe(double x, double y, PlayerState excludePlayer) {
        if (!isSpawnPointGeometrySafe(x, y)) {
            return false;
        }
        for (PlayerState other : players.values()) {
            if (other == excludePlayer) {
                continue;
            }
            double dx = other.getX() - x;
            double dy = other.getY() - y;
            if (dx * dx + dy * dy < SPAWN_PLAYER_CLEARANCE * SPAWN_PLAYER_CLEARANCE) {
                return false;
            }
        }
        return true;
    }

    private double spawnGroundZAt(double x, double y) {
        return findWalkableSurfaceTopAt(x, y);
    }

    private double findWalkableSurfaceTopAt(double x, double y) {
        double top = 0;
        for (CollisionBox box : sceneCollisionBoxes) {
            if (!box.walkable || !box.supportsPoint(x, y)) {
                continue;
            }
            if (box.topZ > top) {
                top = box.topZ;
            }
        }
        return top;
    }

    private boolean isSpawnPointGeometrySafe(double x, double y) {
        double spawnZ = spawnGroundZAt(x, y);
        double spawnRadius = PLAYER_RADIUS + SPAWN_GEOMETRY_MARGIN;

        for (double[] sample : SPAWN_FOOTPRINT_SAMPLES) {
            if (collidesWithObstacle(x + sample[0], y + sample[1], spawnZ, spawnRadius, DEFAULT_PLAYER_COLLIDER_HEIGHT)) {
                return false;
            }
        }

        return !collidesWithObstacle(x, y, spawnZ, PLAYER_RADIUS, DEFAULT_PLAYER_COLLIDER_HEIGHT);
    }

    private double[] teamSpawnIngressPoint(String team, double y) {
        double ingressX = "RED".equals(team) ? SPAWN_X_RED : SPAWN_X_BLUE;
        return new double[]{ingressX, clamp(y, SPAWN_Y_MIN, SPAWN_Y_MAX)};
    }

    private boolean isPlayerOverlappingSolid(PlayerState player) {
        return collidesWithObstacle(
                player.getX(),
                player.getY(),
                player.getZ(),
                PLAYER_RADIUS,
                DEFAULT_PLAYER_COLLIDER_HEIGHT
        );
    }

    private void finalizeSpawnGeometry(PlayerState player) {
        finalizeSpawnGeometry(player, false);
    }

    private void finalizeSpawnGeometry(PlayerState player, boolean preserveVerticalPosition) {
        if (!preserveVerticalPosition) {
            player.setZ(spawnGroundZAt(player.getX(), player.getY()));
        }
        double[] ingress = teamSpawnIngressPoint(player.getTeam(), player.getY());

        for (int pass = 0; pass < PENETRATION_RESOLVE_PASSES * 2; pass++) {
            resolvePlayerPenetration(player, ingress[0], ingress[1]);
            if (!isPlayerOverlappingSolid(player)) {
                break;
            }
        }

        if (!preserveVerticalPosition) {
            player.setZ(spawnGroundZAt(player.getX(), player.getY()));
        }

        if (isPlayerOverlappingSolid(player)) {
            relocateSpawnIfBlocked(player, preserveVerticalPosition);
        }

        if (isPlayerOverlappingSolid(player)) {
            SpawnPoint safeSpawn = findSafeSpawn(player.getTeam(), player);
            player.setX(safeSpawn.x);
            player.setY(safeSpawn.y);
            if (!preserveVerticalPosition) {
                player.setZ(spawnGroundZAt(safeSpawn.x, safeSpawn.y));
            }
            player.setVelocityX(0);
            player.setVelocityY(0);
            player.setVelocityZ(0);

            ingress = teamSpawnIngressPoint(player.getTeam(), player.getY());
            for (int pass = 0; pass < PENETRATION_RESOLVE_PASSES * 2; pass++) {
                resolvePlayerPenetration(player, ingress[0], ingress[1]);
                if (!isPlayerOverlappingSolid(player)) {
                    break;
                }
            }
            if (!preserveVerticalPosition) {
                player.setZ(spawnGroundZAt(player.getX(), player.getY()));
            }
        }
    }

    private void relocateSpawnIfBlocked(PlayerState player, boolean preserveVerticalPosition) {
        double originX = player.getX();
        double originY = player.getY();

        for (int ring = 1; ring <= 32; ring += 1) {
            double radius = ring * SPAWN_RING_STEP;
            for (int i = 0; i < 12; i += 1) {
                double angle = (Math.PI * 2 * i) / 12;
                double x = clamp(originX + Math.cos(angle) * radius, SPAWN_MAP_MARGIN, MAP_WIDTH - SPAWN_MAP_MARGIN);
                double y = clamp(originY + Math.sin(angle) * radius, SPAWN_Y_MIN, SPAWN_Y_MAX);
                if (!isSpawnPointGeometrySafe(x, y)) {
                    continue;
                }

                player.setX(x);
                player.setY(y);
                if (!preserveVerticalPosition) {
                    player.setZ(spawnGroundZAt(x, y));
                }

                double[] ingress = teamSpawnIngressPoint(player.getTeam(), y);
                for (int pass = 0; pass < PENETRATION_RESOLVE_PASSES * 2; pass++) {
                    resolvePlayerPenetration(player, ingress[0], ingress[1]);
                    if (!isPlayerOverlappingSolid(player)) {
                        if (!preserveVerticalPosition) {
                            player.setZ(spawnGroundZAt(player.getX(), player.getY()));
                        }
                        return;
                    }
                }
            }
        }

        log.warn("[spawn] could not clear geometry for {} at ({}, {}), searching for safe spawn",
                player.getName(),
                String.format(Locale.ROOT, "%.1f", originX),
                String.format(Locale.ROOT, "%.1f", originY));

        SpawnPoint safeSpawn = findSafeSpawnNearPoint(originX, originY, player);
        player.setX(safeSpawn.x);
        player.setY(safeSpawn.y);
        if (!preserveVerticalPosition) {
            player.setZ(spawnGroundZAt(safeSpawn.x, safeSpawn.y));
        }
        player.setVelocityX(0);
        player.setVelocityY(0);
        player.setVelocityZ(0);
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

    public synchronized void handleAdminCommand(String playerId, String rawCommand) {
        PlayerState requester = players.get(playerId);
        if (requester == null || rawCommand == null) {
            return;
        }

        String trimmed = rawCommand.trim();
        if (trimmed.isEmpty()) {
            addSystemChat("Usage: freeze on|off|toggle, money <amount>, fly on|off|toggle, noclip on|off|toggle, setspawn here|red|blue|list|clear, tp <x> <y> [z] | tp <playerName>, respawn [playerName|all], reloadcollision, coldebug on|off");
            return;
        }

        String[] parts = trimmed.split("\\s+");
        String command = parts[0].toLowerCase(Locale.ROOT);

        switch (command) {
            case "freeze" -> handleFreezeCommand(parts);
            case "money" -> handleMoneyCommand(requester, parts);
            case "fly" -> handleFlyCommand(requester, parts);
            case "noclip", "ghost" -> handleNoclipCommand(requester, parts);
            case "setspawn", "spawnpoint" -> handleSetSpawnCommand(requester, parts);
            case "tp" -> handleTeleportCommand(requester, parts);
            case "respawn" -> handleRespawnCommand(requester, parts);
            case "reloadcollision", "reloadcol", "reloadprofiles" -> handleReloadCollisionCommand();
            case "coldebug", "collisiondebug" -> handleCollisionDebugCommand(parts);
            default -> addSystemChat("Unknown command: " + command);
        }
    }

    private void handleCollisionDebugCommand(String[] parts) {
        String arg = parts.length > 1 ? parts[1].toLowerCase(Locale.ROOT) : "toggle";
        boolean enabled = switch (arg) {
            case "on", "1", "true" -> true;
            case "off", "0", "false" -> false;
            default -> !collisionDebugLogging;
        };
        collisionDebugLogging = enabled;
        log.info("[collision] debug logging {} ({} solid/walkable boxes loaded) scene#={} profiles#={}",
                enabled ? "ON" : "OFF", sceneCollisionBoxes.size(), sceneHash, profilesHash);
        addSystemChat("Collision debug logging " + (enabled ? "ON" : "OFF")
                + " (" + sceneCollisionBoxes.size() + " boxes, scene#" + sceneHash + " profiles#" + profilesHash + ")");
    }

    private void handleReloadCollisionCommand() {
        try {
            CollisionProfileConfig reloadedConfig = loadCollisionProfileConfig();
            collisionProfileConfig.exact.clear();
            collisionProfileConfig.exact.putAll(reloadedConfig.exact);
            collisionProfileConfig.prefix.clear();
            collisionProfileConfig.prefix.addAll(reloadedConfig.prefix);
            collisionProfileConfig.defaultProfile = reloadedConfig.defaultProfile;
            collisionProfileConfig.exactOnly = reloadedConfig.exactOnly;

            sceneCollisionBoxes.clear();
            sceneCollisionBoxes.addAll(loadSceneCollisionBoxes());
            recomputeCollisionHashes();
            log.info("[collision] reloaded {} boxes exactOnly={} scene#={} profiles#={}",
                    sceneCollisionBoxes.size(), collisionProfileConfig.exactOnly, sceneHash, profilesHash);
            addSystemChat("Collision profiles reloaded (" + sceneCollisionBoxes.size()
                    + " boxes, exactOnly=" + collisionProfileConfig.exactOnly
                    + ", scene#" + sceneHash + " profiles#" + profilesHash + ")");
        } catch (Exception e) {
            addSystemChat("Collision reload failed");
        }
    }

    public synchronized void tick(double deltaSeconds) {
        updateRound();
        updatePlayers(deltaSeconds);
        updateBullets(deltaSeconds);
        broadcastSnapshot();
    }

    private void updateRound() {
        long now = System.currentTimeMillis();

        if (adminRoundFrozen) {
            if (!roundTimerPaused) {
                roundTimerPaused = true;
                roundTimerPausedAt = now;
            }
            return;
        }

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
        damageFeed.clear();

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

            tryUseLadder(player, now);

            double preMoveX = player.getX();
            double preMoveY = player.getY();
            updatePlayerMovement(player, deltaSeconds);
            updatePlayerVerticalMovement(player, deltaSeconds);
            if (!player.isNoclipEnabled()) {
                resolvePlayerPenetration(player, preMoveX, preMoveY);
            }

            if (!player.isShoot()) {
                player.resetConsecutiveShots();
            } else {
                long sinceLastShot = now - player.getLastShotAt();
                if (sinceLastShot > player.getWeapon().getCooldownMs() * 3L) {
                    player.resetConsecutiveShots();
                }
            }

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
            boolean crouching = player.isCrouch();
            boolean airborne = player.getZ() > 0.001 && !player.isFlyEnabled() && !player.isNoclipEnabled();
            double maxSpeed = sprinting
                    ? PLAYER_MAX_SPEED * PLAYER_SPRINT_SPEED_MULTIPLIER
                    : PLAYER_MAX_SPEED;
            double acceleration = sprinting
                    ? PLAYER_ACCELERATION * PLAYER_SPRINT_ACCELERATION_MULTIPLIER
                    : PLAYER_ACCELERATION;
            if (crouching) {
                maxSpeed *= PLAYER_CROUCH_SPEED_MULTIPLIER;
                acceleration *= PLAYER_CROUCH_ACCELERATION_MULTIPLIER;
            }

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
        if (player.isFlyEnabled() || player.isNoclipEnabled()) {
            double verticalIntent = 0;
            if (player.isJump()) {
                verticalIntent += 1;
            }
            if (player.isDescend()) {
                verticalIntent -= 1;
            }

            player.setVelocityZ(verticalIntent * FLY_VERTICAL_SPEED);
            double nextZ = clamp(player.getZ() + player.getVelocityZ() * deltaSeconds, 0, MAX_BULLET_Z);
            player.setZ(nextZ);
            return;
        }

        double supportTop = findSupportTopAt(player.getX(), player.getY(), player.getZ() + PLAYER_GROUND_SNAP_EPSILON);
        boolean supportedByObject = supportTop > 0
                && player.getZ() <= supportTop + PLAYER_GROUND_SNAP_EPSILON
                && player.getVelocityZ() <= 0;
        if (supportedByObject) {
            player.setZ(supportTop);
            player.setVelocityZ(0);
        }

        boolean onGround = player.getZ() <= 0.001 || supportedByObject;

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

        // Final snap after movement integration to keep stable contact on top faces.
        double postMoveSupportTop = findSupportTopAt(player.getX(), player.getY(), player.getZ() + PLAYER_GROUND_SNAP_EPSILON);
        if (player.getVelocityZ() <= 0
                && postMoveSupportTop > 0
                && player.getZ() <= postMoveSupportTop + PLAYER_GROUND_SNAP_EPSILON) {
            player.setZ(postMoveSupportTop);
            player.setVelocityZ(0);
        }
    }

    private void tryUseLadder(PlayerState player, long now) {
        if (LADDER_ZONES.isEmpty()) {
            return;
        }

        if (!player.isClimb()) {
            return;
        }

        if (now - player.getLastClimbAt() < CLIMB_COOLDOWN_MS) {
            return;
        }

        for (LadderZone zone : LADDER_ZONES) {
            if (!zone.isNear(player.getX(), player.getY(), CLIMB_TRIGGER_RADIUS)) {
                continue;
            }

            double triggerToLeftDistanceSq = distanceSquared(
                    zone.triggerX(), zone.triggerY(), zone.leftTargetX(), zone.leftTargetY()
            );
            double triggerToRightDistanceSq = distanceSquared(
                    zone.triggerX(), zone.triggerY(), zone.rightTargetX(), zone.rightTargetY()
            );

            // Wall side = endpoint physically closest to this ladder trigger.
            double preferredX = triggerToLeftDistanceSq <= triggerToRightDistanceSq
                    ? zone.leftTargetX()
                    : zone.rightTargetX();
            double preferredY = triggerToLeftDistanceSq <= triggerToRightDistanceSq
                    ? zone.leftTargetY()
                    : zone.rightTargetY();
            double alternateX = triggerToLeftDistanceSq <= triggerToRightDistanceSq
                    ? zone.rightTargetX()
                    : zone.leftTargetX();
            double alternateY = triggerToLeftDistanceSq <= triggerToRightDistanceSq
                    ? zone.rightTargetY()
                    : zone.leftTargetY();

            double[] landing = findLadderLandingInFrontOfLadder(zone, preferredX, preferredY);
            if (landing == null) {
                landing = findLadderLandingInFrontOfLadder(zone, alternateX, alternateY);
            }
            if (landing == null) {
                return;
            }

            player.setX(landing[0]);
            player.setY(landing[1]);
            player.setVelocityX(0);
            player.setVelocityY(0);
            player.setZ(0);
            player.setVelocityZ(0);
            player.setLastClimbAt(now);
            return;
        }
    }

    private double[] findLadderLanding(double targetX, double targetY) {
        if (!collidesWithObstacle(targetX, targetY, PLAYER_RADIUS)) {
            return new double[]{targetX, targetY};
        }

        for (int ring = 1; ring <= LADDER_LANDING_SEARCH_RINGS; ring++) {
            double distance = ring * LADDER_LANDING_SEARCH_STEP;

            for (int i = 0; i < 8; i++) {
                double angle = i * (Math.PI / 4.0);
                double candidateX = targetX + Math.cos(angle) * distance;
                double candidateY = targetY + Math.sin(angle) * distance;
                double clampedX = clamp(candidateX, PLAYER_RADIUS, MAP_WIDTH - PLAYER_RADIUS);
                double clampedY = clamp(candidateY, PLAYER_RADIUS, MAP_HEIGHT - PLAYER_RADIUS);

                if (!collidesWithObstacle(clampedX, clampedY, PLAYER_RADIUS)) {
                    return new double[]{clampedX, clampedY};
                }
            }
        }

        return null;
    }

    private double[] findLadderLandingInFrontOfLadder(LadderZone zone, double sideHintX, double sideHintY) {
        double dirX = sideHintX - zone.triggerX();
        double dirY = sideHintY - zone.triggerY();
        double dirLength = Math.sqrt(dirX * dirX + dirY * dirY);
        if (dirLength < 0.0001) {
            return null;
        }

        dirX /= dirLength;
        dirY /= dirLength;

        double targetX = zone.triggerX() + dirX * LADDER_FRONT_OFFSET;
        double targetY = zone.triggerY() + dirY * LADDER_FRONT_OFFSET;
        double clampedX = clamp(targetX, PLAYER_RADIUS, MAP_WIDTH - PLAYER_RADIUS);
        double clampedY = clamp(targetY, PLAYER_RADIUS, MAP_HEIGHT - PLAYER_RADIUS);

        return findLadderLanding(clampedX, clampedY);
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
            double baseSpread = weapon.getSpread();
            boolean ads = player.isAds();
            double sprayBuildup = ads ? ADS_SPRAY_BUILDUP_PER_SHOT : HIP_SPRAY_BUILDUP_PER_SHOT;
            double maxSprayMultiplier = ads ? ADS_MAX_SPRAY_MULTIPLIER : HIP_MAX_SPRAY_MULTIPLIER;
            double sprayMultiplier = 1.0 + player.getConsecutiveShots() * sprayBuildup;
            if (ads) {
                sprayMultiplier *= ADS_SPREAD_MULTIPLIER;
            }
            sprayMultiplier = Math.min(sprayMultiplier, maxSprayMultiplier);

            double spreadRadius = baseSpread * sprayMultiplier;
            double spreadAngle = Math.random() * Math.PI * 2;
            double spreadDistance = spreadRadius * Math.sqrt(Math.random());
            double yawSpread = Math.cos(spreadAngle) * spreadDistance;
            double pitchSpread = Math.sin(spreadAngle) * spreadDistance * 0.85;

            double finalAngle = player.getAngle() + yawSpread;
            double finalPitch = Math.max(-0.55, Math.min(0.55, player.getPitch() + pitchSpread));

            double lookDirX = Math.cos(finalAngle) * Math.cos(finalPitch);
            double lookDirY = Math.sin(finalAngle) * Math.cos(finalPitch);
            double lookDirZ = Math.sin(finalPitch);
            double eyeHeight = player.isCrouch() ? PLAYER_EYE_HEIGHT_CROUCH : PLAYER_EYE_HEIGHT_STAND;
            double spawnX = player.getX() + lookDirX * BULLET_EYE_FORWARD_OFFSET;
            double spawnY = player.getY() + lookDirY * BULLET_EYE_FORWARD_OFFSET;
            double spawnZ = player.getZ() + eyeHeight + lookDirZ * BULLET_EYE_FORWARD_OFFSET;
            double velocityX = lookDirX * weapon.getBulletSpeed();
            double velocityY = lookDirY * weapon.getBulletSpeed();
            double velocityZ = lookDirZ * weapon.getBulletSpeed();

            BulletState bullet = new BulletState(
                    "b-" + System.nanoTime() + "-" + i,
                    player.getId(),
                    weapon.getDamage(),
                    spawnX,
                    spawnY,
                    spawnZ,
                    velocityX,
                    velocityY,
                    velocityZ
            );

            bullets.add(bullet);
        }

        player.incrementConsecutiveShots();
    }

    private void updateBullets(double deltaSeconds) {
        Iterator<BulletState> iterator = bullets.iterator();

        while (iterator.hasNext()) {
            BulletState bullet = iterator.next();
            bullet.update(deltaSeconds);

            if (tryResolveBulletPlayerHit(bullet)) {
                iterator.remove();
                continue;
            }

            boolean outsideMap = bullet.getX() < 0
                    || bullet.getX() > MAP_WIDTH
                    || bullet.getY() < 0
                    || bullet.getY() > MAP_HEIGHT
                    || bullet.getZ() < 0
                    || bullet.getZ() > MAX_BULLET_Z;

            if (bullet.isExpired() || outsideMap || bulletIntersectsSolid(bullet)) {
                iterator.remove();
            }
        }
    }

    private boolean bulletIntersectsSolid(BulletState bullet) {
        for (CollisionBox box : sceneCollisionBoxes) {
            if (box.solid && box.intersectsSegment3D(
                    bullet.getPreviousX(),
                    bullet.getPreviousY(),
                    bullet.getPreviousZ(),
                    bullet.getX(),
                    bullet.getY(),
                    bullet.getZ()
            )) {
                return true;
            }
        }
        return false;
    }

    private boolean tryResolveBulletPlayerHit(BulletState bullet) {
        PlayerState attacker = players.get(bullet.getOwnerId());
        if (attacker == null) {
            return false;
        }

        PlayerState hitPlayer = null;
        boolean headshot = false;
        double bestDistance = Double.MAX_VALUE;

        for (PlayerState player : players.values()) {
            if (player.getId().equals(bullet.getOwnerId())) {
                continue;
            }

            if (player.getTeam().equals(attacker.getTeam())) {
                continue;
            }

            double playerZ = player.getZ();
            boolean crouching = player.isCrouch();
            double headMin = crouching ? PLAYER_CROUCH_HEAD_MIN_Z : PLAYER_HEAD_MIN_Z;
            double headMax = crouching ? PLAYER_CROUCH_HEAD_MAX_Z : PLAYER_HEAD_MAX_Z;
            double bodyMaxZ = crouching ? PLAYER_CROUCH_BODY_MAX_Z : PLAYER_BODY_MAX_Z;

            if (segmentIntersectsPlayerZone(
                    bullet,
                    player,
                    headMin,
                    headMax,
                    HEADSHOT_RADIUS
            )) {
                double headCenterZ = playerZ + (headMin + headMax) * 0.5;
                double hitDistance = distanceToPlayerZoneCenter(bullet, player.getX(), player.getY(), headCenterZ);
                if (hitDistance < bestDistance) {
                    hitPlayer = player;
                    headshot = true;
                    bestDistance = hitDistance;
                }
                continue;
            }

            if (segmentIntersectsPlayerZone(
                    bullet,
                    player,
                    0,
                    bodyMaxZ,
                    PLAYER_RADIUS
            )) {
                double bodyCenterZ = playerZ + bodyMaxZ * 0.5;
                double hitDistance = distanceToPlayerZoneCenter(bullet, player.getX(), player.getY(), bodyCenterZ);
                if (hitDistance < bestDistance) {
                    hitPlayer = player;
                    headshot = false;
                    bestDistance = hitDistance;
                }
            }
        }

        if (hitPlayer == null) {
            return false;
        }

        int previousHp = hitPlayer.getHp();
        int damageDealt = headshot ? previousHp : bullet.getDamage();
        hitPlayer.setHp(headshot ? 0 : previousHp - bullet.getDamage());
        addDamageEvent(attacker, hitPlayer, headshot ? "HEAD" : "BODY", damageDealt, hitPlayer.getHp());

        if (hitPlayer.getHp() <= 0) {
            attacker.addKill();
            attacker.addKillReward(KILL_REWARD);
            hitPlayer.addDeath();
            addTeamScore(attacker.getTeam());
            addKillFeedEvent(attacker, hitPlayer, headshot);
            respawnPlayer(hitPlayer);
        }

        return true;
    }

    private boolean segmentIntersectsPlayerZone(
            BulletState bullet,
            PlayerState player,
            double zoneMinOffset,
            double zoneMaxOffset,
            double radius
    ) {
        double playerZ = player.getZ();
        return segmentIntersectsVerticalCylinder(
                bullet.getPreviousX(),
                bullet.getPreviousY(),
                bullet.getPreviousZ(),
                bullet.getX(),
                bullet.getY(),
                bullet.getZ(),
                player.getX(),
                player.getY(),
                playerZ + zoneMinOffset,
                playerZ + zoneMaxOffset,
                radius
        );
    }

    private double distanceToPlayerZoneCenter(
            BulletState bullet,
            double centerX,
            double centerY,
            double centerZ
    ) {
        double segmentX = bullet.getX() - bullet.getPreviousX();
        double segmentY = bullet.getY() - bullet.getPreviousY();
        double segmentZ = bullet.getZ() - bullet.getPreviousZ();
        double segmentLengthSquared = segmentX * segmentX + segmentY * segmentY + segmentZ * segmentZ;

        double t;
        if (segmentLengthSquared <= 1e-9) {
            t = 0.0;
        } else {
            double offsetX = centerX - bullet.getPreviousX();
            double offsetY = centerY - bullet.getPreviousY();
            double offsetZ = centerZ - bullet.getPreviousZ();
            t = (offsetX * segmentX + offsetY * segmentY + offsetZ * segmentZ) / segmentLengthSquared;
            t = clamp(t, 0, 1);
        }

        double closestX = bullet.getPreviousX() + segmentX * t;
        double closestY = bullet.getPreviousY() + segmentY * t;
        double closestZ = bullet.getPreviousZ() + segmentZ * t;
        double dx = closestX - centerX;
        double dy = closestY - centerY;
        double dz = closestZ - centerZ;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    private boolean segmentIntersectsVerticalCylinder(
            double startX,
            double startY,
            double startZ,
            double endX,
            double endY,
            double endZ,
            double centerX,
            double centerY,
            double zMin,
            double zMax,
            double radius
    ) {
        double dx = endX - startX;
        double dy = endY - startY;
        double dz = endZ - startZ;
        double fx = startX - centerX;
        double fy = startY - centerY;
        double radiusSquared = radius * radius;

        if (dx * dx + dy * dy <= 1e-9) {
            if (fx * fx + fy * fy > radiusSquared) {
                return false;
            }
            double zLow = Math.min(startZ, endZ);
            double zHigh = Math.max(startZ, endZ);
            return zHigh >= zMin && zLow <= zMax;
        }

        double a = dx * dx + dy * dy;
        double b = 2.0 * (fx * dx + fy * dy);
        double c = fx * fx + fy * fy - radiusSquared;
        double discriminant = b * b - 4.0 * a * c;
        if (discriminant < 0) {
            return false;
        }

        double sqrtDiscriminant = Math.sqrt(discriminant);
        double tEnter = (-b - sqrtDiscriminant) / (2.0 * a);
        double tExit = (-b + sqrtDiscriminant) / (2.0 * a);
        double tMin = Math.max(0.0, Math.min(tEnter, tExit));
        double tMax = Math.min(1.0, Math.max(tEnter, tExit));
        if (tMin > tMax) {
            return false;
        }

        double zAtMin = startZ + dz * tMin;
        double zAtMax = startZ + dz * tMax;
        double segmentZLow = Math.min(zAtMin, zAtMax);
        double segmentZHigh = Math.max(zAtMin, zAtMax);
        return segmentZHigh >= zMin && segmentZLow <= zMax;
    }

    private void addTeamScore(String team) {
        if (team.equals("RED")) {
            redScore++;
        } else {
            blueScore++;
        }
    }

    private void respawnPlayer(PlayerState player) {
        SpawnPoint spawn = findSafeSpawn(player.getTeam(), player);
        applySpawnToPlayer(player, spawn);
    }

    private void handleRespawnCommand(PlayerState requester, String[] parts) {
        if (parts.length <= 1) {
            respawnPlayer(requester);
            addSystemChat(requester.getName() + " respawned");
            return;
        }

        String targetToken = String.join(" ", java.util.Arrays.copyOfRange(parts, 1, parts.length)).trim();
        if (targetToken.equalsIgnoreCase("all")) {
            for (PlayerState player : players.values()) {
                respawnPlayer(player);
            }
            addSystemChat(requester.getName() + " respawned all players");
            return;
        }

        PlayerState target = players.values().stream()
                .filter(player -> player.getName().equalsIgnoreCase(targetToken))
                .findFirst()
                .orElse(null);
        if (target == null) {
            addSystemChat("Player not found: " + targetToken);
            return;
        }

        respawnPlayer(target);
        addSystemChat(requester.getName() + " respawned " + target.getName());
    }

    private void movePlayerWithCollision(PlayerState player, double nextX, double nextY) {
        if (player.isNoclipEnabled()) {
            player.setX(clamp(nextX, PLAYER_RADIUS, MAP_WIDTH - PLAYER_RADIUS));
            player.setY(clamp(nextY, PLAYER_RADIUS, MAP_HEIGHT - PLAYER_RADIUS));
            return;
        }

        double startX = player.getX();
        double startY = player.getY();
        double deltaX = nextX - startX;
        double deltaY = nextY - startY;
        double travelDistance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        int steps = Math.max(1, (int) Math.ceil(travelDistance / MOVEMENT_COLLISION_STEP));

        for (int i = 1; i <= steps; i++) {
            double t = (double) i / steps;
            double stepX = startX + deltaX * t;
            double stepY = startY + deltaY * t;

            double clampedX = clamp(stepX, PLAYER_RADIUS, MAP_WIDTH - PLAYER_RADIUS);
            double clampedY = clamp(stepY, PLAYER_RADIUS, MAP_HEIGHT - PLAYER_RADIUS);

            if (!collidesWithObstacle(clampedX, player.getY(), player.getZ(), PLAYER_RADIUS, DEFAULT_PLAYER_COLLIDER_HEIGHT)) {
                player.setX(clampedX);
            } else {
                double stepTopX = findSupportTopAt(clampedX, player.getY(), player.getZ() + PLAYER_STEP_UP_HEIGHT);
                if (stepTopX > player.getZ()
                        && stepTopX - player.getZ() <= PLAYER_STEP_UP_HEIGHT
                        && !collidesWithObstacle(clampedX, player.getY(), stepTopX, PLAYER_RADIUS, DEFAULT_PLAYER_COLLIDER_HEIGHT)) {
                    player.setX(clampedX);
                    player.setZ(stepTopX);
                    player.setVelocityZ(0);
                } else {
                    player.setVelocityX(0);
                }
            }

            if (!collidesWithObstacle(player.getX(), clampedY, player.getZ(), PLAYER_RADIUS, DEFAULT_PLAYER_COLLIDER_HEIGHT)) {
                player.setY(clampedY);
            } else {
                double stepTopY = findSupportTopAt(player.getX(), clampedY, player.getZ() + PLAYER_STEP_UP_HEIGHT);
                if (stepTopY > player.getZ()
                        && stepTopY - player.getZ() <= PLAYER_STEP_UP_HEIGHT
                        && !collidesWithObstacle(player.getX(), clampedY, stepTopY, PLAYER_RADIUS, DEFAULT_PLAYER_COLLIDER_HEIGHT)) {
                    player.setY(clampedY);
                    player.setZ(stepTopY);
                    player.setVelocityZ(0);
                } else {
                    player.setVelocityY(0);
                }
            }
        }

        resolvePlayerPenetration(player, startX, startY);
        applyWalkableRampStep(player);
    }

    private void applyWalkableRampStep(PlayerState player) {
        double z = player.getZ();
        double stepTop = findWalkableStepTopAt(player.getX(), player.getY(), z, PLAYER_STEP_UP_HEIGHT);
        if (stepTop > z + PLAYER_GROUND_SNAP_EPSILON
                && !collidesWithObstacle(player.getX(), player.getY(), stepTop, PLAYER_RADIUS, DEFAULT_PLAYER_COLLIDER_HEIGHT)) {
            player.setZ(stepTop);
            player.setVelocityZ(0);
        }
    }

    private double findWalkableStepTopAt(double x, double y, double currentZ, double maxStepHeight) {
        double best = currentZ;
        for (CollisionBox box : sceneCollisionBoxes) {
            if (!box.walkable || !box.supportsPoint(x, y)) {
                continue;
            }
            if (box.topZ <= currentZ + PLAYER_GROUND_SNAP_EPSILON) {
                continue;
            }
            if (box.topZ - currentZ > maxStepHeight) {
                continue;
            }
            if (box.topZ > best) {
                best = box.topZ;
            }
        }
        return best;
    }

    private boolean collidesWithObstacle(double x, double y) {
        if (COLLISION_OBSTACLES.stream().anyMatch(obstacle -> obstacle.contains(x, y))) {
            return true;
        }
        return sceneCollisionBoxes.stream().anyMatch(box -> box.contains(x, y, 1));
    }

    private boolean collidesWithObstacle(double x, double y, double radius) {
        if (COLLISION_OBSTACLES.stream().anyMatch(obstacle -> obstacle.intersectsCircle(x, y, radius))) {
            return true;
        }
        return collidesWithObstacle(x, y, 0, radius, DEFAULT_PLAYER_COLLIDER_HEIGHT);
    }


    private boolean collidesWithObstacle(double x, double y, double z, double radius, double height) {
        if (COLLISION_OBSTACLES.stream().anyMatch(obstacle -> obstacle.intersectsCircle(x, y, radius))) {
            return true;
        }
        for (CollisionBox box : sceneCollisionBoxes) {
            if (box.solid && box.intersectsCylinder(x, y, z, radius, height)) {
                return true;
            }
        }
        return false;
    }

    private double findSupportTopAt(double x, double y, double currentZ) {
        double top = 0;
        for (CollisionBox box : sceneCollisionBoxes) {
            if (!box.walkable || !box.supportsPoint(x, y)) {
                continue;
            }
            if (currentZ + PLAYER_GROUND_SNAP_EPSILON < box.topZ) {
                continue;
            }
            if (box.topZ > top) {
                top = box.topZ;
            }
        }
        return top;
    }

    /**
     * Safety-net depenetration: if a player ends a tick overlapping solid geometry (after a
     * spawn, teleport, profile reload, or a sliding edge-case), push them back out along the
     * minimum-translation axis. This is the authoritative anti-noclip guarantee — sliding
     * prevents entering geometry, this guarantees we never stay inside it.
     */
    private boolean resolvePlayerPenetration(PlayerState player, double fromX, double fromY) {
        boolean resolvedAny = false;

        for (int pass = 0; pass < PENETRATION_RESOLVE_PASSES; pass++) {
            boolean resolvedThisPass = false;
            double playerZ = player.getZ();

            for (CollisionBox box : sceneCollisionBoxes) {
                if (!box.solid) {
                    continue;
                }
                if (playerZ >= box.topZ || playerZ + DEFAULT_PLAYER_COLLIDER_HEIGHT <= box.baseZ) {
                    continue;
                }

                double[] push = box.computePushOut(player.getX(), player.getY(), PLAYER_RADIUS, fromX, fromY);
                if (push == null) {
                    continue;
                }

                double newX = clamp(player.getX() + push[0], PLAYER_RADIUS, MAP_WIDTH - PLAYER_RADIUS);
                double newY = clamp(player.getY() + push[1], PLAYER_RADIUS, MAP_HEIGHT - PLAYER_RADIUS);
                player.setX(newX);
                player.setY(newY);

                double pushLength = Math.sqrt(push[0] * push[0] + push[1] * push[1]);
                if (pushLength > 1e-6) {
                    double nx = push[0] / pushLength;
                    double ny = push[1] / pushLength;
                    double velocityIntoBox = player.getVelocityX() * nx + player.getVelocityY() * ny;
                    if (velocityIntoBox < 0) {
                        player.setVelocityX(player.getVelocityX() - velocityIntoBox * nx);
                        player.setVelocityY(player.getVelocityY() - velocityIntoBox * ny);
                    }
                }

                resolvedThisPass = true;
                resolvedAny = true;
            }

            if (!resolvedThisPass) {
                break;
            }
        }

        if (resolvedAny && collisionDebugLogging) {
            log.warn("[collision] depenetrated player {} -> ({}, {}, {})",
                    player.getName(),
                    String.format(Locale.ROOT, "%.1f", player.getX()),
                    String.format(Locale.ROOT, "%.1f", player.getY()),
                    String.format(Locale.ROOT, "%.1f", player.getZ()));
        }

        return resolvedAny;
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

    private void addDamageEvent(
            PlayerState attacker,
            PlayerState victim,
            String hitType,
            int damage,
            int remainingHp
    ) {
        damageFeed.add(new DamageFeedEvent(
                attacker.getName(),
                victim.getName(),
                hitType,
                damage,
                remainingHp,
                attacker.getWeapon().getDisplayName(),
                System.currentTimeMillis()
        ));

        damageFeed.sort(Comparator.comparingLong(DamageFeedEvent::createdAt).reversed());

        while (damageFeed.size() > DAMAGE_FEED_LIMIT) {
            damageFeed.remove(damageFeed.size() - 1);
        }
    }

    private void pruneKillFeed(long now) {
        killFeed.removeIf(event -> now - event.createdAt() > KILL_FEED_TTL_MS);
    }

    private void pruneDamageFeed(long now) {
        damageFeed.removeIf(event -> now - event.createdAt() > DAMAGE_FEED_TTL_MS);
    }

    private void handleFreezeCommand(String[] parts) {
        String mode = parts.length > 1 ? parts[1].toLowerCase(Locale.ROOT) : "toggle";
        switch (mode) {
            case "on", "1", "true" -> adminRoundFrozen = true;
            case "off", "0", "false" -> adminRoundFrozen = false;
            default -> adminRoundFrozen = !adminRoundFrozen;
        }
        addSystemChat("Round freeze: " + (adminRoundFrozen ? "ON" : "OFF"));
    }

    private void handleMoneyCommand(PlayerState requester, String[] parts) {
        if (parts.length < 2) {
            addSystemChat("Usage: money <amount>");
            return;
        }

        int amount;
        try {
            amount = Integer.parseInt(parts[1]);
        } catch (NumberFormatException _ignored) {
            addSystemChat("Invalid amount: " + parts[1]);
            return;
        }

        requester.addBalance(amount);
        addSystemChat(requester.getName() + " balance: $" + requester.getBalance());
    }

    private void handleFlyCommand(PlayerState requester, String[] parts) {
        String mode = parts.length > 1 ? parts[1].toLowerCase(Locale.ROOT) : "toggle";
        boolean enabled = requester.isFlyEnabled();
        switch (mode) {
            case "on", "1", "true" -> enabled = true;
            case "off", "0", "false" -> enabled = false;
            default -> enabled = !enabled;
        }

        requester.setFlyEnabled(enabled);
        if (!enabled) {
            requester.setVelocityZ(0);
            if (requester.getZ() < 0) {
                requester.setZ(0);
            }
        }
        addSystemChat(requester.getName() + " fly: " + (enabled ? "ON" : "OFF"));
    }

    private void handleNoclipCommand(PlayerState requester, String[] parts) {
        String mode = parts.length > 1 ? parts[1].toLowerCase(Locale.ROOT) : "toggle";
        boolean enabled = requester.isNoclipEnabled();
        switch (mode) {
            case "on", "1", "true" -> enabled = true;
            case "off", "0", "false" -> enabled = false;
            default -> enabled = !enabled;
        }

        requester.setNoclipEnabled(enabled);
        if (enabled) {
            requester.setFlyEnabled(true);
        }
        addSystemChat(requester.getName() + " noclip: " + (enabled ? "ON" : "OFF") + " (Space=up, Ctrl=down)");
    }

    private void handleSetSpawnCommand(PlayerState requester, String[] parts) {
        String arg = parts.length > 1 ? parts[1].toLowerCase(Locale.ROOT) : "here";

        if (arg.equals("list")) {
            appendSpawnPointList("RED");
            appendSpawnPointList("BLUE");
            return;
        }

        if (arg.equals("clear")) {
            String teamArg = parts.length > 2 ? parts[2].toUpperCase(Locale.ROOT) : "ALL";
            if (teamArg.equals("ALL")) {
                customSpawnPoints.put("RED", new ArrayList<>());
                customSpawnPoints.put("BLUE", new ArrayList<>());
                saveCustomSpawnPoints();
                addSystemChat("Custom spawn points cleared for RED and BLUE");
            } else if (teamArg.equals("RED") || teamArg.equals("BLUE")) {
                customSpawnPoints.put(teamArg, new ArrayList<>());
                saveCustomSpawnPoints();
                addSystemChat("Custom spawn points cleared for " + teamArg);
            } else {
                addSystemChat("Usage: setspawn clear [red|blue|all]");
            }
            return;
        }

        String team;
        if (arg.equals("here")) {
            team = requester.getTeam();
        } else if (arg.equals("red") || arg.equals("blue")) {
            team = arg.toUpperCase(Locale.ROOT);
        } else {
            addSystemChat("Usage: setspawn here|red|blue|list|clear [red|blue|all]");
            return;
        }

        StoredSpawnPoint point = new StoredSpawnPoint(
                requester.getX(),
                requester.getY(),
                requester.getZ(),
                requester.getName()
        );
        customSpawnPoints.computeIfAbsent(team, ignored -> new ArrayList<>()).add(point);
        saveCustomSpawnPoints();
        addSystemChat(String.format(
                Locale.ROOT,
                "%s spawn #%d saved at x=%.1f y=%.1f z=%.1f",
                team,
                customSpawnPoints.get(team).size(),
                point.x(),
                point.y(),
                point.z()
        ));
    }

    private void appendSpawnPointList(String team) {
        List<StoredSpawnPoint> points = customSpawnPoints.getOrDefault(team, List.of());
        if (points.isEmpty()) {
            addSystemChat(team + " spawns: (none — using auto spawn)");
            return;
        }
        for (int i = 0; i < points.size(); i += 1) {
            StoredSpawnPoint point = points.get(i);
            addSystemChat(String.format(
                    Locale.ROOT,
                    "%s #%d: x=%.1f y=%.1f z=%.1f%s",
                    team,
                    i + 1,
                    point.x(),
                    point.y(),
                    point.z(),
                    point.label() == null || point.label().isBlank() ? "" : " (" + point.label() + ")"
            ));
        }
    }

    private void loadCustomSpawnPoints() {
        customSpawnPoints.put("RED", new ArrayList<>());
        customSpawnPoints.put("BLUE", new ArrayList<>());
        try {
            if (!Files.exists(worldStorageService.spawnPointsPath())) {
                return;
            }
            JsonNode root = objectMapper.readTree(Files.readString(worldStorageService.spawnPointsPath()));
            loadTeamSpawnPoints(root.path("RED"), "RED");
            loadTeamSpawnPoints(root.path("BLUE"), "BLUE");
            log.info("[spawn] loaded {} RED and {} BLUE custom spawn points",
                    customSpawnPoints.get("RED").size(),
                    customSpawnPoints.get("BLUE").size());
        } catch (Exception error) {
            log.warn("[spawn] failed to load custom spawn points: {}", error.getMessage());
        }
    }

    private void loadTeamSpawnPoints(JsonNode nodes, String team) {
        if (!nodes.isArray()) {
            return;
        }
        List<StoredSpawnPoint> loaded = new ArrayList<>();
        for (JsonNode node : nodes) {
            double x = node.path("x").asDouble(Double.NaN);
            double y = node.path("y").asDouble(Double.NaN);
            double z = node.path("z").asDouble(0);
            if (!Double.isFinite(x) || !Double.isFinite(y)) {
                continue;
            }
            loaded.add(new StoredSpawnPoint(x, y, z, node.path("label").asText("")));
        }
        customSpawnPoints.put(team, loaded);
    }

    private void saveCustomSpawnPoints() {
        try {
            var root = objectMapper.createObjectNode();
            root.put("version", 1);
            root.set("RED", spawnPointsToJson(customSpawnPoints.getOrDefault("RED", List.of())));
            root.set("BLUE", spawnPointsToJson(customSpawnPoints.getOrDefault("BLUE", List.of())));
            objectMapper.writerWithDefaultPrettyPrinter().writeValue(worldStorageService.spawnPointsPath().toFile(), root);
        } catch (Exception error) {
            log.warn("[spawn] failed to save custom spawn points: {}", error.getMessage());
            addSystemChat("setspawn save failed");
        }
    }

    private JsonNode spawnPointsToJson(List<StoredSpawnPoint> points) {
        var array = objectMapper.createArrayNode();
        for (StoredSpawnPoint point : points) {
            var node = objectMapper.createObjectNode();
            node.put("x", point.x());
            node.put("y", point.y());
            node.put("z", point.z());
            if (point.label() != null && !point.label().isBlank()) {
                node.put("label", point.label());
            }
            array.add(node);
        }
        return array;
    }

    private void handleTeleportCommand(PlayerState requester, String[] parts) {
        if (parts.length < 2) {
            addSystemChat("Usage: tp <x> <y> [z] | tp <playerName>");
            return;
        }

        if (parts.length >= 3) {
            try {
                double x = Double.parseDouble(parts[1]);
                double y = Double.parseDouble(parts[2]);
                double z = parts.length >= 4 ? Double.parseDouble(parts[3]) : requester.getZ();

                requester.setX(clamp(x, PLAYER_RADIUS, MAP_WIDTH - PLAYER_RADIUS));
                requester.setY(clamp(y, PLAYER_RADIUS, MAP_HEIGHT - PLAYER_RADIUS));
                requester.setZ(clamp(z, 0, MAX_BULLET_Z));
                requester.setVelocityX(0);
                requester.setVelocityY(0);
                requester.setVelocityZ(0);
                finalizeSpawnGeometry(requester, parts.length >= 4);
                addSystemChat(requester.getName() + " teleported to (" +
                        Math.round(requester.getX()) + ", " +
                        Math.round(requester.getY()) + ", " +
                        Math.round(requester.getZ()) + ")");
                return;
            } catch (NumberFormatException _ignored) {
                // Fall through to player-name teleport usage.
            }
        }

        String targetName = String.join(" ", java.util.Arrays.copyOfRange(parts, 1, parts.length)).trim();
        if (targetName.isEmpty()) {
            addSystemChat("Usage: tp <x> <y> [z] | tp <playerName>");
            return;
        }

        PlayerState target = players.values().stream()
                .filter(player -> player.getName().equalsIgnoreCase(targetName))
                .findFirst()
                .orElse(null);

        if (target == null) {
            addSystemChat("Player not found: " + targetName);
            return;
        }

        requester.setX(target.getX());
        requester.setY(target.getY());
        requester.setZ(target.getZ());
        requester.setVelocityX(0);
        requester.setVelocityY(0);
        requester.setVelocityZ(0);
        finalizeSpawnGeometry(requester);
        addSystemChat(requester.getName() + " teleported to " + target.getName());
    }

    private void addSystemChat(String text) {
        chatMessages.add(new ChatEvent(
                "SERVER",
                "SYSTEM",
                text,
                System.currentTimeMillis()
        ));
        while (chatMessages.size() > CHAT_LIMIT) {
            chatMessages.remove(0);
        }
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
        if (sessions.isEmpty()) {
            return;
        }

        long now = System.currentTimeMillis();
        long countdownReferenceTime = roundTimerPaused ? roundTimerPausedAt : now;
        long timeLeftSeconds = roundEnding
                ? Math.max(0, (nextRoundStartsAt - now) / 1000)
                : Math.max(0, (roundEndsAt - countdownReferenceTime) / 1000);

        pruneKillFeed(now);
        pruneDamageFeed(now);
        pruneChat(now);

        GameSnapshot snapshot = new GameSnapshot(
                now,
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
                                player.isCrouch(),
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
                                player.isAds(),
                                player.isShoot(),
                                player.isReloading(),
                                player.getUnlockedWeapons()
                                        .stream()
                                        .map(WeaponType::getDisplayName)
                                        .toList(),
                                player.isFlyEnabled(),
                                player.isNoclipEnabled()
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

                COLLISION_OBSTACLES.stream()
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

                damageFeed.stream()
                        .map(event -> new GameSnapshot.DamageFeedView(
                                event.attacker(),
                                event.victim(),
                                event.hitType(),
                                event.damage(),
                                event.remainingHp(),
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

    private double distanceSquared(double ax, double ay, double bx, double by) {
        double dx = ax - bx;
        double dy = ay - by;
        return dx * dx + dy * dy;
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

    private record DamageFeedEvent(
            String attacker,
            String victim,
            String hitType,
            int damage,
            int remainingHp,
            String weapon,
            long createdAt
    ) {
    }

    private record LadderZone(
            double triggerX,
            double triggerY,
            double leftTargetX,
            double leftTargetY,
            double rightTargetX,
            double rightTargetY
    ) {
        boolean isNear(double x, double y, double radius) {
            double dx = x - triggerX;
            double dy = y - triggerY;
            return dx * dx + dy * dy <= radius * radius;
        }
    }

    private record ChatEvent(String player, String team, String text, long createdAt) {
    }

    private record SpawnPoint(double x, double y, Double z) {
        SpawnPoint(double x, double y) {
            this(x, y, null);
        }

        boolean usesCustomZ() {
            return z != null;
        }
    }

    private record StoredSpawnPoint(double x, double y, double z, String label) {
    }

    private record CollisionBox(
            double centerX,
            double centerY,
            double halfWidth,
            double halfDepth,
            double cosYaw,
            double sinYaw,
            double baseZ,
            double topZ,
            boolean solid,
            boolean walkable
    ) {
        private LocalPoint toLocal(double x, double y) {
            double dx = x - centerX;
            double dy = y - centerY;
            double localX = dx * cosYaw + dy * sinYaw;
            double localY = -dx * sinYaw + dy * cosYaw;
            return new LocalPoint(localX, localY);
        }

        boolean contains(double x, double y, double z) {
            LocalPoint p = toLocal(x, y);
            return Math.abs(p.x) <= halfWidth
                    && Math.abs(p.y) <= halfDepth
                    && z >= baseZ
                    && z <= topZ;
        }

        boolean intersectsPoint3D(double x, double y, double z) {
            return contains(x, y, z);
        }

        boolean intersectsSegment3D(double x0, double y0, double z0, double x1, double y1, double z1) {
            double segMinZ = Math.min(z0, z1);
            double segMaxZ = Math.max(z0, z1);
            if (segMaxZ < baseZ || segMinZ > topZ) {
                return false;
            }

            LocalPoint a = toLocal(x0, y0);
            LocalPoint b = toLocal(x1, y1);
            return segmentIntersectsLocalRect(
                    a.x,
                    a.y,
                    b.x,
                    b.y,
                    halfWidth + BULLET_COLLISION_EXPAND,
                    halfDepth + BULLET_COLLISION_EXPAND
            );
        }

        private static boolean segmentIntersectsLocalRect(
                double ax,
                double ay,
                double bx,
                double by,
                double halfWidth,
                double halfDepth
        ) {
            double dx = bx - ax;
            double dy = by - ay;
            double t0 = 0.0;
            double t1 = 1.0;
            double[][] edges = {
                    {-dx, ax + halfWidth},
                    {dx, halfWidth - ax},
                    {-dy, ay + halfDepth},
                    {dy, halfDepth - ay}
            };

            for (double[] edge : edges) {
                double p = edge[0];
                double q = edge[1];
                if (Math.abs(p) < 1e-9) {
                    if (q < 0.0) {
                        return false;
                    }
                    continue;
                }
                double t = q / p;
                if (p < 0.0) {
                    if (t > t1) {
                        return false;
                    }
                    if (t > t0) {
                        t0 = t;
                    }
                } else {
                    if (t < t0) {
                        return false;
                    }
                    if (t < t1) {
                        t1 = t;
                    }
                }
            }

            return t0 <= t1;
        }

        boolean supportsPoint(double x, double y) {
            LocalPoint p = toLocal(x, y);
            return Math.abs(p.x) <= halfWidth && Math.abs(p.y) <= halfDepth;
        }

        boolean intersectsCylinder(double x, double y, double z, double radius, double height) {
            if (z >= topZ) {
                return false;
            }
            if (z + height <= baseZ) {
                return false;
            }

            LocalPoint p = toLocal(x, y);
            double closestX = Math.max(-halfWidth, Math.min(p.x, halfWidth));
            double closestY = Math.max(-halfDepth, Math.min(p.y, halfDepth));
            double dx = p.x - closestX;
            double dy = p.y - closestY;
            return dx * dx + dy * dy <= radius * radius;
        }

        /**
         * Minimum-translation push-out for a circle of {@code radius} centred at (x,y) that
         * overlaps this box footprint. Returns the world-space {dx,dy} that moves the circle
         * just outside the box, or {@code null} when there is no overlap. Z-overlap must be
         * checked by the caller; this is the 2D (top-down) resolution axis.
         */
        double[] computePushOut(double x, double y, double radius, double fromX, double fromY) {
            LocalPoint p = toLocal(x, y);
            double lx = p.x;
            double ly = p.y;
            double localPushX;
            double localPushY;

            if (Math.abs(lx) <= halfWidth && Math.abs(ly) <= halfDepth) {
                // Centre is inside the footprint. Resolving along the minimum-translation axis
                // can shove the player out the OPPOSITE face once the centre crosses the
                // midline -> that is the "teleport through the object" bug. Instead we always
                // exit toward the side the player came from (their pre-move position), which
                // guarantees we never pass through to the far side.
                LocalPoint from = toLocal(fromX, fromY);
                double fromDeltaX = from.x - lx;
                double fromDeltaY = from.y - ly;
                boolean spawnLikeOverlap = fromDeltaX * fromDeltaX + fromDeltaY * fromDeltaY < 1.0;

                if (spawnLikeOverlap) {
                    double overlapX = halfWidth + radius - Math.abs(lx);
                    double overlapY = halfDepth + radius - Math.abs(ly);
                    if (overlapX <= overlapY) {
                        localPushX = (lx >= 0 ? 1 : -1) * overlapX;
                        localPushY = 0;
                    } else {
                        localPushX = 0;
                        localPushY = (ly >= 0 ? 1 : -1) * overlapY;
                    }
                } else {
                double fromDirX = from.x >= 0 ? 1 : -1;
                double fromDirY = from.y >= 0 ? 1 : -1;
                double exitX = fromDirX * (halfWidth + radius) - lx;
                double exitY = fromDirY * (halfDepth + radius) - ly;
                boolean fromOutsideX = Math.abs(from.x) > halfWidth;
                boolean fromOutsideY = Math.abs(from.y) > halfDepth;

                boolean useX;
                if (fromOutsideX && !fromOutsideY) {
                    useX = true;
                } else if (!fromOutsideX && fromOutsideY) {
                    useX = false;
                } else {
                    useX = Math.abs(exitX) <= Math.abs(exitY);
                }

                if (useX) {
                    localPushX = exitX;
                    localPushY = 0;
                } else {
                    localPushX = 0;
                    localPushY = exitY;
                }
                }
            } else {
                double closestX = Math.max(-halfWidth, Math.min(lx, halfWidth));
                double closestY = Math.max(-halfDepth, Math.min(ly, halfDepth));
                double dx = lx - closestX;
                double dy = ly - closestY;
                double distSq = dx * dx + dy * dy;
                if (distSq >= radius * radius) {
                    return null;
                }
                double dist = Math.sqrt(distSq);
                if (dist < 1e-6) {
                    localPushX = (lx >= 0 ? 1 : -1) * radius;
                    localPushY = 0;
                } else {
                    double overlap = radius - dist;
                    localPushX = dx / dist * overlap;
                    localPushY = dy / dist * overlap;
                }
            }

            double worldX = localPushX * cosYaw - localPushY * sinYaw;
            double worldY = localPushX * sinYaw + localPushY * cosYaw;
            return new double[]{worldX, worldY};
        }
    }

    private record LocalPoint(double x, double y) {
    }

    private static boolean isWallLikeModelPath(String modelPath) {
        if (modelPath == null || modelPath.isBlank()) {
            return false;
        }
        return modelPath.contains("/wall-")
                || modelPath.contains("/door-")
                || modelPath.contains("/window-")
                || modelPath.contains("/planks.obj");
    }

    // See sceneCollision.js tightenWallFootprint - kept byte-for-byte equivalent.
    // Preferred deterministic scheme: profile kind="wall" + wallAxis ("x"/"z") + thickness.
    // Falls back to the legacy path heuristic for old profiles.
    private static double[] tightenWallFootprint(double halfWidth, double halfDepth, String modelPath,
                                                 ColliderTemplate collider, double scaleX, double scaleZ) {
        String kind = collider == null ? "" : collider.kind == null ? "" : collider.kind.toLowerCase(Locale.ROOT);
        if (kind.equals("wall")) {
            String axis = collider.wallAxis == null ? "" : collider.wallAxis.toLowerCase(Locale.ROOT);
            double rawThickness = collider.thickness;
            boolean hasThickness = Double.isFinite(rawThickness) && rawThickness > 0;
            if (axis.equals("x")) {
                double thin = hasThickness ? rawThickness * scaleZ : Math.min(halfWidth, halfDepth);
                return new double[]{halfWidth, thin};
            }
            if (axis.equals("z")) {
                double thin = hasThickness ? rawThickness * scaleX : Math.min(halfWidth, halfDepth);
                return new double[]{thin, halfDepth};
            }
            if (hasThickness) {
                if (halfWidth >= halfDepth) {
                    return new double[]{halfWidth, rawThickness * scaleZ};
                }
                return new double[]{rawThickness * scaleX, halfDepth};
            }
        }

        if (!isWallLikeModelPath(modelPath)) {
            return new double[]{halfWidth, halfDepth};
        }

        double w = halfWidth;
        double d = halfDepth;
        double longSide = Math.max(w, d);
        double shortSide = Math.min(w, d);
        double aspect = shortSide / Math.max(longSide, 1e-6);

        if (modelPath.contains("diagonal") || modelPath.contains("slant")) {
            double shrink = modelPath.contains("diagonal") ? 0.5 : 0.58;
            return new double[]{w * shrink, d * shrink};
        }

        if (modelPath.contains("corner")) {
            return new double[]{w * 0.62, d * 0.62};
        }

        if (aspect > 0.72) {
            double thinHalf = Math.max(3.5, Math.min(shortSide * 0.14, longSide * 0.065));
            if (w >= d) {
                w = longSide * 0.96;
                d = thinHalf;
            } else {
                w = thinHalf;
                d = longSide * 0.96;
            }
        } else {
            w *= 0.96;
            d *= 0.96;
        }

        return new double[]{w, d};
    }

    private void warnCollisionOnce(String key, String message) {
        if (collisionWarningKeys.add(key)) {
            log.warn("[collision] {}", message);
        }
    }

    // Validates one box's dimensions. Flags NaN / <=0 / absurd values, clamps to a safe
    // range and warns once per model path. Mirrors client sanitizeBoxDims.
    private double[] sanitizeBoxDims(String modelPath, double halfWidth, double halfDepth, double height) {
        double hw = halfWidth;
        double hd = halfDepth;
        double h = height;
        if (!Double.isFinite(hw) || hw <= 0) {
            warnCollisionOnce(modelPath + ":hw", modelPath + ": invalid halfWidth (" + halfWidth + "); clamped");
            hw = COLLISION_MIN_DIM;
        }
        if (!Double.isFinite(hd) || hd <= 0) {
            warnCollisionOnce(modelPath + ":hd", modelPath + ": invalid halfDepth (" + halfDepth + "); clamped");
            hd = COLLISION_MIN_DIM;
        }
        if (!Double.isFinite(h) || h <= 0) {
            warnCollisionOnce(modelPath + ":h", modelPath + ": invalid height (" + height + "); clamped");
            h = COLLISION_MIN_DIM;
        }
        if (hw > COLLISION_MAX_HALF || hd > COLLISION_MAX_HALF || h > COLLISION_MAX_HEIGHT) {
            warnCollisionOnce(modelPath + ":huge", modelPath + ": oversized box; clamped");
            hw = Math.min(hw, COLLISION_MAX_HALF);
            hd = Math.min(hd, COLLISION_MAX_HALF);
            h = Math.min(h, COLLISION_MAX_HEIGHT);
        }
        return new double[]{hw, hd, h};
    }

    private List<CollisionBox> loadSceneCollisionBoxes() {
        List<CollisionBox> boxes = new ArrayList<>();
        try {
            if (!Files.exists(worldStorageService.scenePath())) {
                return boxes;
            }

            var root = objectMapper.readTree(Files.readString(worldStorageService.scenePath()));
            var models = root.path("models");
            if (!models.isArray()) {
                return boxes;
            }

            for (var model : models) {
                if (!model.path("enabled").asBoolean(true)) {
                    continue;
                }
                String path = model.path("path").asText("").toLowerCase(Locale.ROOT);
                ResolvedProfile resolved = resolveCollisionProfileWithSource(path);
                if (resolved == null) {
                    continue;
                }
                var collider = resolved.collider();
                boolean isFallback = !"exact".equals(resolved.source());
                if (isFallback) {
                    warnCollisionOnce(path + ":fallback",
                            path + ": no exact profile, using " + resolved.source() + " fallback");
                }
                // Collision profiles are authored per-model via the editor tooling, so the
                // `solid` flag is the single source of truth. The previous substring whitelist
                // silently overrode authored profiles and let players noclip through objects
                // whose path did not match (benches, beams, bricks, dumpsters, ...).
                boolean effectiveSolid = collider.solid;
                ModelScale modelScale = readModelScale(model.path("scale"));
                double x = model.path("position").path("x").asDouble(0);
                double y = model.path("position").path("z").asDouble(0);
                double modelElevation = model.path("position").path("y").asDouble(0) + collider.elevationLift;
                List<ColliderPart> parts = collider.parts == null || collider.parts.isEmpty()
                        ? List.of(new ColliderPart(
                        collider.halfWidth,
                        collider.halfDepth,
                        collider.height,
                        collider.yawOffsetDeg,
                        collider.offsetLocalX,
                        collider.offsetLocalY,
                        collider.offsetLocalZ
                ))
                        : collider.parts;

                for (ColliderPart part : parts) {
                    double yawDeg = readModelYawDeg(model) + part.yawOffsetDeg;
                    double yawRad = Math.toRadians(yawDeg);
                    double halfWidth = part.halfWidth * modelScale.x();
                    double halfDepth = part.halfDepth * modelScale.z();
                    if ("wall".equals(collider.kind) || isWallLikeModelPath(path)) {
                        double[] tightened = tightenWallFootprint(halfWidth, halfDepth, path, collider, modelScale.x(), modelScale.z());
                        halfWidth = tightened[0];
                        halfDepth = tightened[1];
                    }
                    double height = part.height * modelScale.y();
                    // Validate + clamp corrupt dimensions (NaN / <=0 / absurd). Mirrors client.
                    double[] safeDims = sanitizeBoxDims(path, halfWidth, halfDepth, height);
                    halfWidth = safeDims[0];
                    halfDepth = safeDims[1];
                    height = safeDims[2];
                    // sinYaw negated so the OBB matches the Three.js renderer (RotationY(+yaw)).
                    double cosYaw = Math.cos(yawRad);
                    double sinYaw = -Math.sin(yawRad);
                    double localOffsetX = part.offsetLocalX * modelScale.x();
                    double localOffsetDepth = part.offsetLocalY * modelScale.z();
                    double localOffsetUp = part.offsetLocalZ * modelScale.y();
                    double worldOffsetX = localOffsetX * cosYaw - localOffsetDepth * sinYaw;
                    double worldOffsetY = localOffsetX * sinYaw + localOffsetDepth * cosYaw;
                    double baseZ = Math.max(0, modelElevation + localOffsetUp);
                    double topZ = Math.max(baseZ, baseZ + height);
                    boxes.add(new CollisionBox(x + worldOffsetX, y + worldOffsetY, halfWidth, halfDepth, cosYaw, sinYaw, baseZ, topZ, effectiveSolid, collider.walkable));
                }
            }
        } catch (Exception _ignored) {
        }
        return boxes;
    }

    private ModelScale readModelScale(JsonNode scaleNode) {
        if (scaleNode == null || scaleNode.isMissingNode() || scaleNode.isNull()) {
            return new ModelScale(1.0, 1.0, 1.0);
        }
        if (scaleNode.isNumber()) {
            double scale = scaleNode.asDouble(1.0);
            double safeScale = Double.isFinite(scale) && scale > 0 ? scale : 1.0;
            return new ModelScale(safeScale, safeScale, safeScale);
        }
        if (scaleNode.isObject()) {
            double sx = scaleNode.path("x").asDouble(1.0);
            double sy = scaleNode.path("y").asDouble(1.0);
            double sz = scaleNode.path("z").asDouble(1.0);
            if (Double.isFinite(sx) && sx > 0 && Double.isFinite(sy) && sy > 0 && Double.isFinite(sz) && sz > 0) {
                return new ModelScale(sx, sy, sz);
            }
        }
        return new ModelScale(1.0, 1.0, 1.0);
    }

    private double readModelYawDeg(JsonNode modelNode) {
        if (modelNode == null || modelNode.isMissingNode() || modelNode.isNull()) {
            return 0.0;
        }
        JsonNode rotationDegreesY = modelNode.path("rotationDegrees").path("y");
        if (rotationDegreesY.isNumber()) {
            return rotationDegreesY.asDouble(0.0);
        }
        JsonNode rotationY = modelNode.path("rotation").path("y");
        if (rotationY.isNumber()) {
            return Math.toDegrees(rotationY.asDouble(0.0));
        }
        return 0.0;
    }

    private ColliderTemplate resolveCollisionProfile(String modelPath) {
        ResolvedProfile resolved = resolveCollisionProfileWithSource(modelPath);
        return resolved == null ? null : resolved.collider();
    }

    private record ResolvedProfile(ColliderTemplate collider, String source) {
    }

    // Mirrors client resolveCollisionProfileWithSource: source is exact|prefix|default,
    // where prefix/default are treated as fallbacks for debug visibility.
    private ResolvedProfile resolveCollisionProfileWithSource(String modelPath) {
        if (modelPath == null || modelPath.isEmpty()) {
            return null;
        }

        ColliderTemplate exact = collisionProfileConfig.exact.get(modelPath);
        if (exact != null) {
            return new ResolvedProfile(exact, "exact");
        }
        if (collisionProfileConfig.exactOnly) {
            return null;
        }
        for (PrefixColliderProfile prefixProfile : collisionProfileConfig.prefix) {
            if (modelPath.startsWith(prefixProfile.prefix)) {
                return new ResolvedProfile(prefixProfile.collider, "prefix");
            }
        }
        return new ResolvedProfile(collisionProfileConfig.defaultProfile, "default");
    }

    private CollisionProfileConfig loadCollisionProfileConfig() {
        CollisionProfileConfig config = new CollisionProfileConfig();
        // Reasonable fallback defaults if file is missing.
        config.defaultProfile = new ColliderTemplate(48, 48, 64, true, true, 0, 0, 0, 0, 0, "", "", 0, List.of());
        config.prefix.add(new PrefixColliderProfile("/models/road-", new ColliderTemplate(64, 64, 8, false, true, 0, 0, 0, 0, 0, "", "", 0, List.of())));
        config.prefix.add(new PrefixColliderProfile("/models/grass", new ColliderTemplate(64, 64, 8, false, true, 0, 0, 0, 0, 0, "", "", 0, List.of())));
        config.prefix.add(new PrefixColliderProfile("/models/wall-", new ColliderTemplate(64, 64, 96, true, true, 0, 0, 0, 0, 0, "", "", 0, List.of())));
        config.prefix.add(new PrefixColliderProfile("/models/window-", new ColliderTemplate(48, 24, 96, true, true, 0, 0, 0, 0, 0, "", "", 0, List.of())));
        config.prefix.add(new PrefixColliderProfile("/models/door-", new ColliderTemplate(40, 20, 96, true, true, 0, 0, 0, 0, 0, "", "", 0, List.of())));
        config.prefix.add(new PrefixColliderProfile("/models/truck-", new ColliderTemplate(92, 56, 88, true, true, 0, 0, 0, 0, 0, "", "", 0, List.of())));
        config.prefix.add(new PrefixColliderProfile("/models/detail-block", new ColliderTemplate(56, 56, 72, true, true, 0, 0, 0, 0, 0, "", "", 0, List.of())));
        config.prefix.add(new PrefixColliderProfile("/models/detail-barrier", new ColliderTemplate(52, 36, 52, true, true, 0, 0, 0, 0, 0, "", "", 0, List.of())));

        try {
            if (!Files.exists(worldStorageService.collisionProfilesPath())) {
                return config;
            }
            var root = objectMapper.readTree(Files.readString(worldStorageService.collisionProfilesPath()));

            var defaults = root.path("default");
            if (defaults.isObject()) {
                config.defaultProfile = readColliderTemplate(defaults, config.defaultProfile);
            }

            var exact = root.path("exact");
            if (exact.isArray()) {
                for (var item : exact) {
                    String value = item.path("value").asText("").toLowerCase(Locale.ROOT);
                    if (value.isEmpty()) {
                        continue;
                    }
                    var collider = readColliderTemplate(item, config.defaultProfile);
                    config.exact.put(value, collider);
                }
            }

            var prefix = root.path("prefix");
            if (prefix.isArray()) {
                config.prefix.clear();
                for (var item : prefix) {
                    String value = item.path("value").asText("").toLowerCase(Locale.ROOT);
                    if (value.isEmpty()) {
                        continue;
                    }
                    var collider = readColliderTemplate(item, config.defaultProfile);
                    config.prefix.add(new PrefixColliderProfile(value, collider));
                }
            }

            if (root.path("exactOnly").asBoolean(false)) {
                config.exactOnly = true;
                config.prefix.clear();
            }
        } catch (Exception _ignored) {
        }
        return config;
    }

    private ColliderTemplate readColliderTemplate(tools.jackson.databind.JsonNode node, ColliderTemplate fallback) {
        if (node == null || !node.isObject()) {
            return fallback;
        }
        double halfWidth = node.path("halfWidth").asDouble(fallback.halfWidth);
        double halfDepth = node.path("halfDepth").asDouble(fallback.halfDepth);
        double height = node.path("height").asDouble(fallback.height);
        boolean solid = node.path("solid").asBoolean(fallback.solid);
        boolean walkable = node.path("walkable").asBoolean(fallback.walkable);
        double yawOffsetDeg = node.path("yawOffsetDeg").asDouble(fallback.yawOffsetDeg);
        double offsetLocalX = node.path("offsetLocalX").asDouble(fallback.offsetLocalX);
        double offsetLocalY = node.path("offsetLocalY").asDouble(fallback.offsetLocalY);
        double offsetLocalZ = node.path("offsetLocalZ").asDouble(fallback.offsetLocalZ);
        double elevationLift = node.path("elevationLift").asDouble(fallback.elevationLift);
        String kind = node.path("kind").asText(fallback.kind == null ? "" : fallback.kind).toLowerCase(Locale.ROOT);
        String wallAxis = node.path("wallAxis").asText(fallback.wallAxis == null ? "" : fallback.wallAxis).toLowerCase(Locale.ROOT);
        double thickness = node.path("thickness").asDouble(fallback.thickness);
        List<ColliderPart> parts = new ArrayList<>();
        JsonNode partsNode = node.path("boxes");
        if (partsNode.isArray()) {
            for (JsonNode partNode : partsNode) {
                if (!partNode.isObject()) {
                    continue;
                }
                double partHalfWidth = partNode.path("halfWidth").asDouble(halfWidth);
                double partHalfDepth = partNode.path("halfDepth").asDouble(halfDepth);
                double partHeight = partNode.path("height").asDouble(height);
                double partYawOffsetDeg = partNode.path("yawOffsetDeg").asDouble(yawOffsetDeg);
                double partOffsetLocalX = partNode.path("offsetLocalX").asDouble(offsetLocalX);
                double partOffsetLocalY = partNode.path("offsetLocalY").asDouble(offsetLocalY);
                double partOffsetLocalZ = partNode.path("offsetLocalZ").asDouble(offsetLocalZ);
                parts.add(new ColliderPart(partHalfWidth, partHalfDepth, partHeight, partYawOffsetDeg, partOffsetLocalX, partOffsetLocalY, partOffsetLocalZ));
            }
        }
        return new ColliderTemplate(halfWidth, halfDepth, height, solid, walkable, yawOffsetDeg, offsetLocalX, offsetLocalY, offsetLocalZ, elevationLift, kind, wallAxis, thickness, parts);
    }

    private record ColliderTemplate(
            double halfWidth,
            double halfDepth,
            double height,
            boolean solid,
            boolean walkable,
            double yawOffsetDeg,
            double offsetLocalX,
            double offsetLocalY,
            double offsetLocalZ,
            double elevationLift,
            String kind,
            String wallAxis,
            double thickness,
            List<ColliderPart> parts
    ) {
    }

    private record ColliderPart(
            double halfWidth,
            double halfDepth,
            double height,
            double yawOffsetDeg,
            double offsetLocalX,
            double offsetLocalY,
            double offsetLocalZ
    ) {
    }

    private record ModelScale(
            double x,
            double y,
            double z
    ) {
    }

    private static class CollisionProfileConfig {
        final java.util.Map<String, ColliderTemplate> exact = new java.util.HashMap<>();
        final List<PrefixColliderProfile> prefix = new ArrayList<>();
        ColliderTemplate defaultProfile;
        boolean exactOnly;
    }

    private record PrefixColliderProfile(String prefix, ColliderTemplate collider) {
    }

    public String getId() {
        return id;
    }

    public synchronized int getPlayerCount() {
        return players.size();
    }
}
