package me.andrei9876.voidstrike.game.model;

public class BulletState {

    private final String id;
    private final String ownerId;
    private final int damage;

    private double x;
    private double y;
    private final double velocityX;
    private final double velocityY;

    private long lifeMs;

    public BulletState(String id, String ownerId, int damage, double x, double y, double velocityX, double velocityY) {
        this.id = id;
        this.ownerId = ownerId;
        this.damage = damage;
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

    public int getDamage() {
        return damage;
    }

    public double getX() {
        return x;
    }

    public double getY() {
        return y;
    }

    public double getVelocityX() {
        return velocityX;
    }

    public double getVelocityY() {
        return velocityY;
    }
}