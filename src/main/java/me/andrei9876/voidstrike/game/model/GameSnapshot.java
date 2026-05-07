package me.andrei9876.voidstrike.game.model;

import java.util.List;

public class GameSnapshot {

    private final String type = "snapshot";
    private final List<PlayerView> players;
    private final List<BulletView> bullets;

    public GameSnapshot(List<PlayerView> players, List<BulletView> bullets) {
        this.players = players;
        this.bullets = bullets;
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

    public record PlayerView(
            String id,
            String name,
            double x,
            double y,
            double angle,
            int hp
    ) {
    }

    public record BulletView(
            String id,
            double x,
            double y
    ) {
    }
}