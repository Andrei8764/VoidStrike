package me.andrei9876.voidstrike.game.model;

public class PlayerState {

    private final String id;
    private final String name;
    private final String team;

    private double x;
    private double y;
    private double velocityX;
    private double velocityY;
    private double angle;
    private int hp;

    private int kills;
    private int deaths;

    private WeaponType weapon;
    private int ammo;
    private boolean reloading;
    private long reloadEndsAt;

    private boolean up;
    private boolean down;
    private boolean left;
    private boolean right;
    private boolean shoot;
    private boolean reload;
    private int weaponSlot;

    private long lastShotAt;

    public PlayerState(String id, String name, String team, double x, double y) {
        this.id = id;
        this.name = name;
        this.team = team;
        this.x = x;
        this.y = y;
        this.velocityX = 0.0;
        this.velocityY = 0.0;
        this.angle = 0.0;
        this.hp = 100;
        this.kills = 0;
        this.deaths = 0;
        this.weapon = WeaponType.RIFLE;
        this.ammo = weapon.getMagazineSize();
        this.reloading = false;
        this.reloadEndsAt = 0;
    }

    public void applyInput(ClientInputMessage input) {
        this.up = input.isUp();
        this.down = input.isDown();
        this.left = input.isLeft();
        this.right = input.isRight();
        this.shoot = input.isShoot();
        this.reload = input.isReload();
        this.weaponSlot = input.getWeaponSlot();
        this.angle = input.getAngle();
    }

    public void respawn(double x, double y) {
        this.x = x;
        this.y = y;
        this.velocityX = 0.0;
        this.velocityY = 0.0;
        this.hp = 100;
        this.ammo = weapon.getMagazineSize();
        this.reloading = false;
        this.reloadEndsAt = 0;
        this.up = false;
        this.down = false;
        this.left = false;
        this.right = false;
        this.shoot = false;
        this.reload = false;
    }

    public void switchWeapon(WeaponType newWeapon) {
        if (this.weapon == newWeapon || this.reloading) {
            return;
        }

        this.weapon = newWeapon;
        this.ammo = newWeapon.getMagazineSize();
        this.lastShotAt = 0;
    }

    public void startReload(long now) {
        if (reloading || ammo >= weapon.getMagazineSize()) {
            return;
        }

        this.reloading = true;
        this.reloadEndsAt = now + weapon.getReloadMs();
    }

    public void finishReloadIfNeeded(long now) {
        if (reloading && now >= reloadEndsAt) {
            this.reloading = false;
            this.ammo = weapon.getMagazineSize();
        }
    }

    public void consumeAmmo() {
        this.ammo = Math.max(0, ammo - 1);
    }

    public void addKill() {
        this.kills++;
    }

    public void addDeath() {
        this.deaths++;
    }

    public String getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public String getTeam() {
        return team;
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

    public double getAngle() {
        return angle;
    }

    public int getHp() {
        return hp;
    }

    public int getKills() {
        return kills;
    }

    public int getDeaths() {
        return deaths;
    }

    public WeaponType getWeapon() {
        return weapon;
    }

    public int getAmmo() {
        return ammo;
    }

    public boolean isReloading() {
        return reloading;
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

    public long getLastShotAt() {
        return lastShotAt;
    }

    public void setX(double x) {
        this.x = x;
    }

    public void setY(double y) {
        this.y = y;
    }

    public void setVelocityX(double velocityX) {
        this.velocityX = velocityX;
    }

    public void setVelocityY(double velocityY) {
        this.velocityY = velocityY;
    }

    public void setHp(int hp) {
        this.hp = hp;
    }

    public void setLastShotAt(long lastShotAt) {
        this.lastShotAt = lastShotAt;
    }
}