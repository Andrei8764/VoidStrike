package me.andrei9876.voidstrike.game.model;

public class ClientInputMessage {

    private String type;
    private boolean up;
    private boolean down;
    private boolean left;
    private boolean right;
    private boolean shoot;
    private boolean reload;
    private int weaponSlot;
    private double angle;

    public String getType() {
        return type;
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

    public boolean isReload() {
        return reload;
    }

    public int getWeaponSlot() {
        return weaponSlot;
    }

    public double getAngle() {
        return angle;
    }

    public void setType(String type) {
        this.type = type;
    }

    public void setUp(boolean up) {
        this.up = up;
    }

    public void setDown(boolean down) {
        this.down = down;
    }

    public void setLeft(boolean left) {
        this.left = left;
    }

    public void setRight(boolean right) {
        this.right = right;
    }

    public void setShoot(boolean shoot) {
        this.shoot = shoot;
    }

    public void setReload(boolean reload) {
        this.reload = reload;
    }

    public void setWeaponSlot(int weaponSlot) {
        this.weaponSlot = weaponSlot;
    }

    public void setAngle(double angle) {
        this.angle = angle;
    }
}