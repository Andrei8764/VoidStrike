export function getWeaponModelPathByName(weaponName) {
    switch (weaponName) {
        case "Pistol":
            return "/models/blaster-a.glb";
        case "Rifle":
            return "/models/blaster-f.glb";
        case "SMG":
            return "/models/blaster-j.glb";
        case "Shotgun":
            return "/models/blaster-n.glb";
        case "Sniper":
            return "/models/blaster-q.glb";
        default:
            return "/models/blaster.glb";
    }
}

export function getWeaponScaleByName(weaponName, WEAPON_MODEL_SCALE) {
    switch (weaponName) {
        case "SMG":
        case "Pistol":
        case "Shotgun":
        case "Sniper":
            return WEAPON_MODEL_SCALE * 0.50;
        default:
            return WEAPON_MODEL_SCALE;
    }
}

export function getLocalWeaponOffsetByName(weaponName, base) {
    switch (weaponName) {
        case "SMG":
        case "Pistol":
        case "Shotgun":
        case "Sniper":
            return { x: base.x + 0.20, y: base.y - 0.08, z: base.z - 0.12 };
        default:
            return { x: base.x + 0.14, y: base.y - 0.06, z: base.z - 0.10 };
    }
}

export function getHipViewModelPosByWeapon(weaponName, THREE, VIEWMODEL_HIP_POS) {
    switch (weaponName) {
        case "Rifle":
            return new THREE.Vector3(0.66, -0.58, -1.05);
        case "Pistol":
            return new THREE.Vector3(0.68, -0.60, -1.08);
        case "Shotgun":
            return new THREE.Vector3(0.70, -0.62, -1.10);
        case "Sniper":
            return new THREE.Vector3(0.72, -0.63, -1.12);
        default:
            return VIEWMODEL_HIP_POS;
    }
}

export function getRemoteWeaponAnchorOffsetByName(weaponName, REMOTE_WEAPON_HAND_OFFSETS) {
    return REMOTE_WEAPON_HAND_OFFSETS[weaponName] || REMOTE_WEAPON_HAND_OFFSETS.default;
}

export function getRemoteWeaponMuzzleLiftByName(weaponName, REMOTE_WEAPON_MUZZLE_LIFT) {
    return REMOTE_WEAPON_MUZZLE_LIFT[weaponName] ?? REMOTE_WEAPON_MUZZLE_LIFT.default;
}

export function normalizeWeaponModel(root, targetLength, THREE) {
    const box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);

    if (maxDim <= 0.0001) {
        return;
    }

    const scale = targetLength / maxDim;
    root.scale.setScalar(scale);

    const normalizedBox = new THREE.Box3().setFromObject(root);
    const center = new THREE.Vector3();
    normalizedBox.getCenter(center);

    root.position.x -= center.x;
    root.position.y -= center.y;
    root.position.z -= center.z;
}

export function createWeaponPlaceholder(THREE) {
    return new THREE.Mesh(
        new THREE.BoxGeometry(14, 4, 3),
        new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.55, metalness: 0.18 })
    );
}
