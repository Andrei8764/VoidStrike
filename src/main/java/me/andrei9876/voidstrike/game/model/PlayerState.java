package me.andrei9876.voidstrike.game.model;

public class PlayerState {

    private final String id;
    private final String name;

    private double x;
    private double y;
    private double angle;
    private int hp;

    private boolean up;
    private boolean down;
    private boolean left;
    private boolean right;
    private boolean shoot;

    private long lastShotAt;

    public PlayerState(String id, String name, double x, double y) {
        this.id = id;
        this.name = name;
        this.x = x;
        this.y = y;
        this.angle = 0.0;
        this.hp = 100;
    }

    public void applyInput(ClientInputMessage input) {
        this.up = input.isUp();
        this.down = input.isDown();
        this.left = input.isLeft();
        this.right = input.isRight();
        this.shoot = input.isShoot();
        this.angle = input.getAngle();
    }

    public void respawn(double x, double y) {
        this.x = x;
        this.y = y;
        this.hp = 100;
        this.up = false;
        this.down = false;
        this.left = false;
        this.right = false;
        this.shoot = false;
    }

    public String getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public double getX() {
        return x;
    }

    public double getY() {
        return y;
    }

    public double getAngle() {
        return angle;
    }

    public int getHp() {
        return hp;
    }

    public boolean isUp() {
        return up;
    }

    public boolean isDown() {
        return down;
    }

    public boolean isLeft() {
        return left;
    }

    public boolean isRight() {
        return right;
    }

    public boolean isShoot() {
        return shoot;
    }

    public long getLastShotAt() {
        return lastShotAt;
    }

    public void setX(double x) {
        this.x = x;
    }

    public void setY(double y) {
        this.y = y;
    }

    public void setHp(int hp) {
        this.hp = hp;
    }

    public void setLastShotAt(long lastShotAt) {
        this.lastShotAt = lastShotAt;
    }
}