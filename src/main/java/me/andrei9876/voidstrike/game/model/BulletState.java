package me.andrei9876.voidstrike.game.model;

public class BulletState {

    private final String id;
    private final String ownerId;

    private double x;
    private double y;
    private final double velocityX;
    private final double velocityY;

    private long lifeMs;

    public BulletState(String id, String ownerId, double x, double y, double velocityX, double velocityY) {
        this.id = id;
        this.ownerId = ownerId;
        this.x = x;
        this.y = y;
        this.velocityX = velocityX;
        this.velocityY = velocityY;
        this.lifeMs = 1200;
    }

    public void update(double deltaSeconds) {
        x += velocityX * deltaSeconds;
        y += velocityY * deltaSeconds;
        lifeMs -= (long) (deltaSeconds * 1000);
    }

    public boolean isExpired() {
        return lifeMs <= 0;
    }

    public String getId() {
        return id;
    }

    public String getOwnerId() {
        return ownerId;
    }

    public double getX() {
        return x;
    }

    public double getY() {
        return y;
    }
}