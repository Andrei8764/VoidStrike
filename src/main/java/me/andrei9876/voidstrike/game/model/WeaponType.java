package me.andrei9876.voidstrike.game.model;

public enum WeaponType {

    PISTOL("Pistol", 0, 25, 420, 850, 12, 900, 0.035),
    RIFLE("Rifle", 0, 22, 120, 950, 30, 1600, 0.075),
    SMG("SMG", 250, 16, 85, 820, 40, 1400, 0.105),
    SHOTGUN("Shotgun", 400, 14, 750, 760, 8, 1800, 0.22),
    SNIPER("Sniper", 650, 90, 1200, 1300, 5, 2200, 0.01);

    private final String displayName;
    private final int price;
    private final int damage;
    private final long cooldownMs;
    private final double bulletSpeed;
    private final int magazineSize;
    private final long reloadMs;
    private final double spread;

    WeaponType(
            String displayName,
            int price,
            int damage,
            long cooldownMs,
            double bulletSpeed,
            int magazineSize,
            long reloadMs,
            double spread
    ) {
        this.displayName = displayName;
        this.price = price;
        this.damage = damage;
        this.cooldownMs = cooldownMs;
        this.bulletSpeed = bulletSpeed;
        this.magazineSize = magazineSize;
        this.reloadMs = reloadMs;
        this.spread = spread;
    }

    public String getDisplayName() {
        return displayName;
    }

    public int getPrice() {
        return price;
    }

    public int getDamage() {
        return damage;
    }

    public long getCooldownMs() {
        return cooldownMs;
    }

    public double getBulletSpeed() {
        return bulletSpeed;
    }

    public int getMagazineSize() {
        return magazineSize;
    }

    public long getReloadMs() {
        return reloadMs;
    }

    public double getSpread() {
        return spread;
    }
}
