package me.andrei9876.voidstrike.game.model;

public class ClientInputMessage {

    private String type;
    private long sequence;
    private boolean up;
    private boolean down;
    private boolean left;
    private boolean right;
    private boolean sprint;
    private boolean jump;
    private boolean descend;
    private boolean crouch;
    private boolean shoot;
    private boolean ads;
    private boolean reload;
    private boolean climb;
    private int weaponSlot;
    private Integer buyWeaponSlot;
    private double angle;
    private double pitch;

    public String getType() {
        return type;
    }

    public long getSequence() {
        return sequence;
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

    public boolean isSprint() {
        return sprint;
    }

    public boolean isJump() {
        return jump;
    }

    public boolean isDescend() {
        return descend;
    }

    public boolean isCrouch() {
        return crouch;
    }

    public boolean isShoot() {
        return shoot;
    }

    public boolean isAds() {
        return ads;
    }

    public boolean isReload() {
        return reload;
    }

    public boolean isClimb() {
        return climb;
    }

    public int getWeaponSlot() {
        return weaponSlot;
    }

    public Integer getBuyWeaponSlot() {
        return buyWeaponSlot;
    }

    public double getAngle() {
        return angle;
    }

    public double getPitch() {
        return pitch;
    }

    public void setType(String type) {
        this.type = type;
    }

    public void setSequence(long sequence) {
        this.sequence = sequence;
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

    public void setSprint(boolean sprint) {
        this.sprint = sprint;
    }

    public void setJump(boolean jump) {
        this.jump = jump;
    }

    public void setDescend(boolean descend) {
        this.descend = descend;
    }

    public void setCrouch(boolean crouch) {
        this.crouch = crouch;
    }

    public void setShoot(boolean shoot) {
        this.shoot = shoot;
    }

    public void setAds(boolean ads) {
        this.ads = ads;
    }

    public void setReload(boolean reload) {
        this.reload = reload;
    }

    public void setClimb(boolean climb) {
        this.climb = climb;
    }

    public void setWeaponSlot(int weaponSlot) {
        this.weaponSlot = weaponSlot;
    }

    public void setBuyWeaponSlot(Integer buyWeaponSlot) {
        this.buyWeaponSlot = buyWeaponSlot;
    }

    public void setAngle(double angle) {
        this.angle = angle;
    }

    public void setPitch(double pitch) {
        this.pitch = pitch;
    }
}
