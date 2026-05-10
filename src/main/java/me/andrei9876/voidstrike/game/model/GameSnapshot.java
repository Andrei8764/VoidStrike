package me.andrei9876.voidstrike.game.model;

import java.util.List;

public class GameSnapshot {

    private final String type = "snapshot";
    private final List<PlayerView> players;
    private final List<BulletView> bullets;
    private final List<ObstacleView> obstacles;
    private final List<KillFeedView> killFeed;
    private final List<ChatMessageView> chatMessages;
    private final RoundView round;

    public GameSnapshot(
            List<PlayerView> players,
            List<BulletView> bullets,
            List<ObstacleView> obstacles,
            List<KillFeedView> killFeed,
            List<ChatMessageView> chatMessages,
            RoundView round
    ) {
        this.players = players;
        this.bullets = bullets;
        this.obstacles = obstacles;
        this.killFeed = killFeed;
        this.chatMessages = chatMessages;
        this.round = round;
    }

    public String getType() {
        return type;
    }

    public List<PlayerView> getPlayers() {
        return players;
    }

    public List<BulletView> getBullets() {
        return bullets;
    }

    public List<ObstacleView> getObstacles() {
        return obstacles;
    }

    public List<KillFeedView> getKillFeed() {
        return killFeed;
    }

    public List<ChatMessageView> getChatMessages() {
        return chatMessages;
    }

    public RoundView getRound() {
        return round;
    }

    public record PlayerView(
            String id,
            String name,
            String team,
            String characterModel,
            double x,
            double y,
            double z,
            double velocityX,
            double velocityY,
            double velocityZ,
            boolean crouching,
            double angle,
            double pitch,
            long lastProcessedInputSequence,
            int hp,
            int kills,
            int deaths,
            int balance,
            String weapon,
            int ammo,
            int magazineSize,
            boolean ads,
            boolean shooting,
            boolean reloading,
            List<String> unlockedWeapons
    ) {
    }

    public record BulletView(
        String id,
        double x,
        double y,
        double z,
        double velocityX,
        double velocityY,
        double velocityZ
) {
}

    public record ObstacleView(
            double x,
            double y,
            double width,
            double height
    ) {
    }

    public record KillFeedView(
            String attacker,
            String victim,
            String weapon,
            long createdAt
    ) {
    }

    public record ChatMessageView(
            String player,
            String team,
            String text,
            long createdAt
    ) {
    }

    public record RoundView(
            int roundNumber,
            long timeLeftSeconds,
            int redScore,
            int blueScore,
            String status,
            List<TopPlayerView> topPlayers
    ) {
    }

    public record TopPlayerView(
            String name,
            String team,
            int kills,
            int deaths,
            double kd
    ) {
    }
}
