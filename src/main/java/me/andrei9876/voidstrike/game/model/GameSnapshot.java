package me.andrei9876.voidstrike.game.model;

import java.util.List;

public class GameSnapshot {

    private final String type = "snapshot";
    private final List<PlayerView> players;
    private final List<BulletView> bullets;
    private final List<ObstacleView> obstacles;
    private final List<KillFeedView> killFeed;
    private final RoundView round;

    public GameSnapshot(
            List<PlayerView> players,
            List<BulletView> bullets,
            List<ObstacleView> obstacles,
            List<KillFeedView> killFeed,
            RoundView round
    ) {
        this.players = players;
        this.bullets = bullets;
        this.obstacles = obstacles;
        this.killFeed = killFeed;
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

    public RoundView getRound() {
        return round;
    }

    public record PlayerView(
            String id,
            String name,
            String team,
            double x,
            double y,
            double velocityX,
            double velocityY,
            double angle,
            long lastProcessedInputSequence,
            int hp,
            int kills,
            int deaths,
            String weapon,
            int ammo,
            int magazineSize,
            boolean reloading
    ) {
    }

    public record BulletView(
            String id,
            double x,
            double y,
            double velocityX,
            double velocityY
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

    public record RoundView(
            int roundNumber,
            long timeLeftSeconds,
            int redScore,
            int blueScore
    ) {
    }
}
