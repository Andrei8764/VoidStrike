package me.andrei9876.voidstrike.game.model;

import java.util.Collections;
import java.util.EnumSet;
import java.util.Set;

public class PlayerState {

    private final String id;
    private final String name;
    private final String team;
    private final String characterModel;

    private Integer buyWeaponSlot;

    private double x;
    private double y;
    private double z;
    private double velocityX;
    private double velocityY;
    private double velocityZ;
    private double angle;
    private double pitch;
    private int hp;

    private int kills;
    private int deaths;
    private int balance;
    private final Set<WeaponType> unlockedWeapons;

    private WeaponType weapon;
    private int ammo;
    private boolean reloading;
    private long reloadEndsAt;

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

    private long lastProcessedInputSequence;
    private long lastShotAt;
    private long lastClimbAt;
    private boolean flyEnabled;

    public PlayerState(String id, String name, String team, String characterModel, double x, double y) {
        this.id = id;
        this.name = name;
        this.team = team;
        this.characterModel = characterModel;
        this.x = x;
        this.y = y;

        this.velocityX = 0.0;
        this.velocityY = 0.0;
        this.velocityZ = 0.0;
        this.angle = 0.0;
        this.pitch = 0.0;
        this.hp = 100;

        this.kills = 0;
        this.deaths = 0;
        this.balance = 0;

        this.unlockedWeapons = EnumSet.of(WeaponType.PISTOL, WeaponType.RIFLE);

        this.weapon = WeaponType.RIFLE;
        this.ammo = weapon.getMagazineSize();
        this.reloading = false;
        this.reloadEndsAt = 0;

        this.lastProcessedInputSequence = 0;
        this.lastShotAt = 0;
        this.z = 0.0;
    }

    public void applyInput(ClientInputMessage input) {
        this.lastProcessedInputSequence = input.getSequence();

        this.up = input.isUp();
        this.down = input.isDown();
        this.left = input.isLeft();
        this.right = input.isRight();
        this.sprint = input.isSprint();
        this.jump = input.isJump();
        this.descend = input.isDescend();
        this.crouch = input.isCrouch();
        this.shoot = input.isShoot();
        this.ads = input.isAds();
        this.reload = input.isReload();
        this.climb = input.isClimb();
        this.weaponSlot = input.getWeaponSlot();
        this.buyWeaponSlot = input.getBuyWeaponSlot();
        this.angle = input.getAngle();
        this.pitch = Math.max(-0.55, Math.min(0.55, input.getPitch()));
    }

    public Integer getBuyWeaponSlot() {
        return buyWeaponSlot;
    }

    public void clearBuyWeaponSlot() {
        this.buyWeaponSlot = null;
    }

    public void respawn(double x, double y) {
        this.x = x;
        this.y = y;
        this.velocityX = 0.0;
        this.velocityY = 0.0;
        this.velocityZ = 0.0;
        this.z = 0.0;

        this.hp = 100;
        this.ammo = weapon.getMagazineSize();

        this.reloading = false;
        this.reloadEndsAt = 0;

        this.up = false;
        this.down = false;
        this.left = false;
        this.right = false;
        this.sprint = false;
        this.jump = false;
        this.descend = false;
        this.crouch = false;
        this.shoot = false;
        this.ads = false;
        this.reload = false;
        this.climb = false;
    }

    public void switchWeapon(WeaponType newWeapon) {
        if (newWeapon == null) {
            return;
        }

        if (this.weapon == newWeapon || this.reloading || !unlockedWeapons.contains(newWeapon)) {
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

    public void addKillReward(int amount) {
        if (amount <= 0) {
            return;
        }

        this.balance += amount;
    }

    public void addBalance(int amount) {
        this.balance = Math.max(0, this.balance + amount);
    }

    public void resetBalance() {
        this.balance = 0;
    }

    public void resetRoundStats() {
        this.kills = 0;
        this.deaths = 0;
    }

    public boolean buyWeapon(WeaponType weaponType) {
        if (weaponType == null) {
            return false;
        }

        if (unlockedWeapons.contains(weaponType)) {
            return true;
        }

        if (balance < weaponType.getPrice()) {
            return false;
        }

        balance -= weaponType.getPrice();
        unlockedWeapons.add(weaponType);
        return true;
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

    public String getCharacterModel() {
        return characterModel;
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

    public double getZ() {
        return z;
    }

    public double getVelocityZ() {
        return velocityZ;
    }

    public double getAngle() {
        return angle;
    }

    public double getPitch() {
        return pitch;
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

    public int getBalance() {
        return balance;
    }

    public Set<WeaponType> getUnlockedWeapons() {
        return Collections.unmodifiableSet(unlockedWeapons);
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

    public boolean isAds() {
        return ads;
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

    public boolean isReload() {
        return reload;
    }

    public boolean isClimb() {
        return climb;
    }

    public int getWeaponSlot() {
        return weaponSlot;
    }

    public long getLastProcessedInputSequence() {
        return lastProcessedInputSequence;
    }

    public long getLastShotAt() {
        return lastShotAt;
    }

    public long getLastClimbAt() {
        return lastClimbAt;
    }

    public long getReloadEndsAt() {
        return reloadEndsAt;
    }

    public boolean isFlyEnabled() {
        return flyEnabled;
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

    public void setZ(double z) {
        this.z = Math.max(0, z);
    }

    public void setVelocityZ(double velocityZ) {
        this.velocityZ = velocityZ;
    }

    public void setHp(int hp) {
        this.hp = Math.max(0, Math.min(100, hp));
    }

    public void setLastShotAt(long lastShotAt) {
        this.lastShotAt = lastShotAt;
    }

    public void setLastClimbAt(long lastClimbAt) {
        this.lastClimbAt = lastClimbAt;
    }

    public void setBalance(int balance) {
        this.balance = Math.max(0, balance);
    }

    public void setFlyEnabled(boolean flyEnabled) {
        this.flyEnabled = flyEnabled;
    }
}
