import * as THREE from "/vendor/three/build/three.module.js";
import { GLTFLoader } from "/vendor/three/examples/jsm/loaders/GLTFLoader.js";
import { adsScopeElement, canvas, crosshairElement, nameLabelsElement } from "./dom.js";
import {
    getRenderableBullets,
    getRenderableRemotePlayers,
    getSelfPlayer,
    mouse,
    state
} from "./state.js";
import { PLAYER_MAX_SPEED, WORLD_HEIGHT, WORLD_WIDTH } from "./config.js";

const PLAYER_HEIGHT = 72;
const CAMERA_EYE_HEIGHT = 62;
const CAMERA_BACK_OFFSET = 6;
const CAMERA_LOOK_DISTANCE = 120;
const BULLET_RADIUS = 1.6;
const BULLET_LENGTH = 14;
const OBSTACLE_HEIGHT = 84;
const CHARACTER_HEIGHT = 58;
const CHARACTER_YAW_OFFSET = Math.PI / 2    ;
const REMOTE_RUN_SPEED_THRESHOLD = PLAYER_MAX_SPEED * 1.08;
const WEAPON_AIM_SMOOTHING = 0.18;
const WEAPON_IDLE_PITCH = 0.08;
const WEAPON_RAISED_PITCH = -0.18;
const WEAPON_SHOT_RAISE_DECAY = 0.72;
const WEAPON_RECOIL_DECAY = 0.68;
const WEAPON_RECOIL_KICK_BACK = 2.8;
const WEAPON_RECOIL_KICK_UP = 1.1;
const WEAPON_RECOIL_PITCH = 0.2;
const WEAPON_RUN_SWAY_POS = 0.34;
const WEAPON_RUN_SWAY_ROT = 0.03;
const WEAPON_RECOIL_MIN_Z_OFFSET = -0.18;
const WEAPON_MODEL_ROT_X = 0;
const WEAPON_MODEL_ROT_Y = Math.PI;
const WEAPON_MODEL_ROT_Z = 0;
const WEAPON_MODEL_SCALE = 1.75;
const WEAPON_MODEL_LOCAL_X = 0.2;
const WEAPON_MODEL_LOCAL_Y = 0.02;
const WEAPON_MODEL_LOCAL_Z = 0.55;
const VIEWMODEL_HIP_POS = new THREE.Vector3(0.36, -0.36, -0.85);
const VIEWMODEL_ADS_POS = new THREE.Vector3(0.04, -0.22, -0.58);
const VIEWMODEL_HIP_ROT = new THREE.Euler(-0.24, Math.PI + 0.05, 0.02);
const VIEWMODEL_ADS_ROT = new THREE.Euler(-0.1, Math.PI, 0);
const VIEWMODEL_BLEND_SPEED = 0.18;
const CAMERA_FOV_HIP = 75;
const CAMERA_FOV_ADS = 62;
const CAMERA_FOV_BLEND = 0.16;
const WALK_ARM_SWING = 0.14;
const WALK_LEG_SWING = 0.48;
const WALK_SWING_SPEED = 4.4;
const IDLE_SWAY = 0.03;
const MOVE_FACTOR_SMOOTHING = 0.2;
const GAIT_WEIGHT_SMOOTHING = 0.16;
const MOVE_START_THRESHOLD = 0.14;
const MOVE_STOP_THRESHOLD = 0.08;
const WALK_CYCLE_HZ = 1.6;
const RUN_CYCLE_HZ = 2.25;
const WALK_RUN_THRESHOLD = 0.62;
const IDLE_PHASE_SPEED = 0.008;
const WALK_PHASE_SPEED = 0.11;
const RUN_PHASE_SPEED = 0.19;
const BODY_YAW_SMOOTHING = 0.22;
const STABLE_BLOCK_WALK = true;
const DEBUG_WEAPON_ANCHOR = false;
const DEBUG_REMOTE_MARKERS = false;
const TEAM_COLORS = {
    RED: 0xef4444,
    BLUE: 0x3b82f6
};
const SINGLE_CHARACTER_MODEL = "a_character_body.glb";
const MODULAR_CHARACTER_PARTS = {
    body: "/models/a_character_body.glb",
    head: "/models/a_character_head.glb",
    armLeft: "/models/a_arm_left.glb",
    legLeft: "/models/a_leg_left.glb",
    legRight: "/models/a_leg_right.glb",
    armRight: "/models/a_arm_right.glb"
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);

const camera3d = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 4000);
scene.add(camera3d);
const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true
});
renderer.setPixelRatio(window.devicePixelRatio || 1);
renderer.shadowMap.enabled = false;

const ambientLight = new THREE.HemisphereLight(0xffffff, 0x355e2c, 1.1);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.7);
directionalLight.position.set(300, 600, 300);
scene.add(directionalLight);

const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_WIDTH, WORLD_HEIGHT),
    new THREE.MeshStandardMaterial({ color: 0x5d7a2f, roughness: 0.92, metalness: 0.05 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.set(WORLD_WIDTH / 2, 0, WORLD_HEIGHT / 2);
scene.add(ground);

const obstacleGroup = new THREE.Group();
scene.add(obstacleGroup);

const remotePlayerGroup = new THREE.Group();
scene.add(remotePlayerGroup);

const bulletGroup = new THREE.Group();
scene.add(bulletGroup);

const worldModelGroup = new THREE.Group();
scene.add(worldModelGroup);
const worldPrimitiveGroup = new THREE.Group();
scene.add(worldPrimitiveGroup);

const gltfLoader = new GLTFLoader();
const remotePlayerRoots = new Map();
const remotePlayerModelPaths = new Map();
const remotePlayerAnimPhase = new Map();
const remotePlayerLabels = new Map();
const remotePlayerWeaponModelPaths = new Map();
const remotePlayerWeaponAnchors = new Map();
const remotePlayerWeaponAim = new Map();
const remotePlayerLastAmmo = new Map();
const remotePlayerShotRaise = new Map();
const remotePlayerWeaponRecoil = new Map();
const remotePlayerRightArm = new Map();
const remotePlayerMoveFactor = new Map();
const remotePlayerGaitWeight = new Map();
const remotePlayerArmRotX = new Map();
const remotePlayerLegRotX = new Map();
const remotePlayerBodyYaw = new Map();
const remotePlayerLocomotionState = new Map();
const remotePlayerWeaponRot = new Map();
const remotePlayerMoving = new Map();
const ARM_ROTATION_SMOOTHING = 0.2;
const ARM_ROTATION_MAX_DELTA = 0.02;
const LEG_ROTATION_SMOOTHING = 0.2;
const LEG_ROTATION_MAX_DELTA = 0.024;
const characterTemplateCache = new Map();
const weaponTemplateCache = new Map();
let modularCharacterTemplatePromise = null;

let obstaclesCacheKey = "";
let worldSceneLoaded = false;
let lastAnimationTimeMs = performance.now();
let localViewModelPath = null;
let localViewModelObject = null;
let localFirstPersonBody = null;
const localViewModelPivot = new THREE.Group();
camera3d.add(localViewModelPivot);
localViewModelPivot.position.copy(VIEWMODEL_HIP_POS);
localViewModelPivot.rotation.copy(VIEWMODEL_HIP_ROT);
const localBodyPivot = new THREE.Group();
camera3d.add(localBodyPivot);
localBodyPivot.position.set(0, -1.05, -0.38);

function createLocalViewModelFallback() {
    const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.26, 0.16, 0.72),
        new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.45, metalness: 0.22 })
    );
    mesh.position.set(0.12, -0.02, 0.1);
    mesh.rotation.set(-0.06, Math.PI, 0);
    mesh.renderOrder = 50;
    mesh.frustumCulled = false;
    return mesh;
}

function toRadians(value) {
    return (value || 0) * Math.PI / 180;
}

function readScale(scale) {
    if (typeof scale === "number") {
        return { x: scale, y: scale, z: scale };
    }

    return {
        x: scale?.x ?? 1,
        y: scale?.y ?? 1,
        z: scale?.z ?? 1
    };
}

function createMissingModelPlaceholder(modelDef) {
    const size = modelDef.placeholderSize || { x: 120, y: 100, z: 120 };
    const position = modelDef.position || {};

    const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(size.x ?? 120, size.y ?? 100, size.z ?? 120),
        new THREE.MeshStandardMaterial({
            color: 0xef4444,
            wireframe: true
        })
    );

    mesh.position.set(
        position.x ?? 0,
        position.y ?? (size.y ?? 100) / 2,
        position.z ?? 0
    );

    worldModelGroup.add(mesh);
}

function getCharacterModelPathForPlayer(player) {
    return `/models/${SINGLE_CHARACTER_MODEL}`;
}

function tintCharacter(root, colorHex) {
    root.traverse(node => {
        if (!node.isMesh || !node.material) {
            return;
        }

        if (!node.material.color) {
            return;
        }

        node.material = node.material.clone();
        node.material.color.lerp(new THREE.Color(colorHex), 0.15);
    });
}

function normalizeCharacterModel(root, targetHeight) {
    const box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3();
    box.getSize(size);

    if (size.y <= 0.0001) {
        return;
    }

    const scale = targetHeight / size.y;
    root.scale.setScalar(scale);

    const normalizedBox = new THREE.Box3().setFromObject(root);
    const offset = new THREE.Vector3();
    normalizedBox.getCenter(offset);

    root.position.x -= offset.x;
    root.position.z -= offset.z;
    root.position.y -= normalizedBox.min.y;
}

function normalizeDetachedPartModel(root, targetSize) {
    const box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);

    if (maxDim <= 0.0001) {
        return;
    }

    const scale = targetSize / maxDim;
    root.scale.setScalar(scale);

    const scaledBox = new THREE.Box3().setFromObject(root);
    const center = new THREE.Vector3();
    scaledBox.getCenter(center);

    root.position.x -= center.x;
    root.position.y -= center.y;
    root.position.z -= center.z;
}

function loadCharacterTemplate(path) {
    if (characterTemplateCache.has(path)) {
        return characterTemplateCache.get(path);
    }

    const promise = new Promise((resolve, reject) => {
        gltfLoader.load(
            path,
            gltf => {
                resolve(gltf.scene);
            },
            undefined,
            error => reject(error)
        );
    });

    characterTemplateCache.set(path, promise);
    return promise;
}

function loadWeaponTemplate(path) {
    if (weaponTemplateCache.has(path)) {
        return weaponTemplateCache.get(path);
    }

    const promise = new Promise((resolve, reject) => {
        gltfLoader.load(
            path,
            gltf => resolve(gltf.scene),
            undefined,
            error => reject(error)
        );
    });

    weaponTemplateCache.set(path, promise);
    return promise;
}

function loadModularCharacterTemplate() {
    if (modularCharacterTemplatePromise) {
        return modularCharacterTemplatePromise;
    }

    modularCharacterTemplatePromise = Promise.all([
        loadCharacterTemplate(MODULAR_CHARACTER_PARTS.body),
        loadCharacterTemplate(MODULAR_CHARACTER_PARTS.head),
        loadCharacterTemplate(MODULAR_CHARACTER_PARTS.armLeft),
        loadCharacterTemplate(MODULAR_CHARACTER_PARTS.armRight),
        loadCharacterTemplate(MODULAR_CHARACTER_PARTS.legLeft),
        loadCharacterTemplate(MODULAR_CHARACTER_PARTS.legRight)
    ]).then(parts => {
        const root = new THREE.Group();
        for (const part of parts) {
            root.add(part.clone(true));
        }
        normalizeCharacterModel(root, CHARACTER_HEIGHT);
        return root;
    });

    return modularCharacterTemplatePromise;
}

function getWeaponModelPathByName(weaponName) {
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

function normalizeWeaponModel(root, targetLength) {
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

function createWeaponPlaceholder() {
    return new THREE.Mesh(
        new THREE.BoxGeometry(14, 4, 3),
        new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.55, metalness: 0.18 })
    );
}

function ensureWeaponAnchor(root, player) {
    if (remotePlayerWeaponAnchors.has(player.id)) {
        return remotePlayerWeaponAnchors.get(player.id);
    }

    const weaponAnchor = new THREE.Group();
    weaponAnchor.position.set(12.2, CHARACTER_HEIGHT * 0.69, 5.8);
    const baseWeapon = createWeaponPlaceholder();
    baseWeapon.name = "baseWeapon";
    baseWeapon.position.set(WEAPON_MODEL_LOCAL_X, WEAPON_MODEL_LOCAL_Y, WEAPON_MODEL_LOCAL_Z);
    baseWeapon.rotation.set(WEAPON_MODEL_ROT_X, WEAPON_MODEL_ROT_Y, WEAPON_MODEL_ROT_Z);
    weaponAnchor.add(baseWeapon);

    if (DEBUG_WEAPON_ANCHOR) {
        const pivot = new THREE.Mesh(
            new THREE.SphereGeometry(3.2, 12, 12),
            new THREE.MeshStandardMaterial({ color: 0x22d3ee, emissive: 0x0ea5e9, emissiveIntensity: 1.0 })
        );
        pivot.name = "weaponPivotDebug";
        weaponAnchor.add(pivot);
    }

    root.add(weaponAnchor);
    remotePlayerWeaponAnchors.set(player.id, weaponAnchor);
    return weaponAnchor;
}

function ensureLimbRig(root, player) {
    const cached = remotePlayerRightArm.get(player.id);
    if (cached) {
        return cached;
    }

    const model = root.children.find(child => child.type === "Group" || child.type === "Scene");
    if (!model || model.children.length < 6) {
        return null;
    }

    // Modelul are brațele inversate față de naming; mapăm explicit pentru mâna dreaptă vizuală corectă.
    const rig = {
        armLeft: model.children[3] || null,
        armRight: model.children[2] || null,
        legLeft: model.children[4] || null,
        legRight: model.children[5] || null
    };
    remotePlayerRightArm.set(player.id, rig);
    return rig;
}

function syncPlayerWeapon(player, root) {
    const weaponPath = getWeaponModelPathByName(player.weapon);
    const previousPath = remotePlayerWeaponModelPaths.get(player.id);
    const weaponAnchor = ensureWeaponAnchor(root, player);

    if (previousPath === weaponPath && weaponAnchor.children.length > 0) {
        return;
    }

    remotePlayerWeaponModelPaths.set(player.id, weaponPath);

    loadWeaponTemplate(weaponPath)
        .then(template => {
            const weaponModel = template.clone(true);
            normalizeWeaponModel(weaponModel, WEAPON_MODEL_SCALE);
            weaponModel.position.set(WEAPON_MODEL_LOCAL_X, WEAPON_MODEL_LOCAL_Y, WEAPON_MODEL_LOCAL_Z);
            weaponModel.rotation.set(WEAPON_MODEL_ROT_X, WEAPON_MODEL_ROT_Y, WEAPON_MODEL_ROT_Z);
            weaponAnchor.clear();
            const baseWeapon = createWeaponPlaceholder();
            baseWeapon.name = "baseWeapon";
            baseWeapon.position.set(WEAPON_MODEL_LOCAL_X, WEAPON_MODEL_LOCAL_Y, WEAPON_MODEL_LOCAL_Z);
            baseWeapon.rotation.set(WEAPON_MODEL_ROT_X, WEAPON_MODEL_ROT_Y, WEAPON_MODEL_ROT_Z);
            baseWeapon.material.opacity = DEBUG_WEAPON_ANCHOR ? 0.5 : 0.0;
            baseWeapon.material.transparent = true;
            weaponAnchor.add(baseWeapon);

            if (DEBUG_WEAPON_ANCHOR) {
                const pivot = new THREE.Mesh(
                    new THREE.SphereGeometry(3.2, 12, 12),
                    new THREE.MeshStandardMaterial({ color: 0x22d3ee, emissive: 0x0ea5e9, emissiveIntensity: 1.0 })
                );
                pivot.name = "weaponPivotDebug";
                weaponAnchor.add(pivot);
            }

            weaponAnchor.add(weaponModel);
            console.log("[weapon-debug] attached model", player.id, weaponPath, weaponAnchor.position);
        })
        .catch(() => {
            console.warn("[weapon-debug] failed model, using fallback", player.id, weaponPath);
            if (weaponAnchor.children.length === 0) {
                const fallback = createWeaponPlaceholder();
                fallback.name = "baseWeapon";
                fallback.position.set(WEAPON_MODEL_LOCAL_X, WEAPON_MODEL_LOCAL_Y, WEAPON_MODEL_LOCAL_Z);
                fallback.rotation.set(WEAPON_MODEL_ROT_X, WEAPON_MODEL_ROT_Y, WEAPON_MODEL_ROT_Z);
                weaponAnchor.add(fallback);
            }
        });
}

function getWeaponPathForSelf(self) {
    return getWeaponModelPathByName(self?.weapon);
}

function syncLocalViewModel(self) {
    if (!self) {
        if (localViewModelObject) {
            localViewModelPivot.remove(localViewModelObject);
            localViewModelObject = null;
            localViewModelPath = null;
        }
        if (localFirstPersonBody) {
            localBodyPivot.remove(localFirstPersonBody);
            localFirstPersonBody = null;
        }
        if (adsScopeElement) {
            adsScopeElement.classList.add("hidden");
        }
        return;
    }

    const weaponPath = getWeaponPathForSelf(self);
    if (!weaponPath) {
        return;
    }

    if (localViewModelPath === weaponPath && localViewModelObject) {
        return;
    }

    if (!localViewModelObject) {
        localViewModelObject = createLocalViewModelFallback();
        localViewModelPivot.add(localViewModelObject);
    }

    localViewModelPath = weaponPath;
    loadWeaponTemplate(weaponPath)
        .then(template => {
            if (localViewModelPath !== weaponPath) {
                return;
            }

            const model = template.clone(true);
            normalizeWeaponModel(model, WEAPON_MODEL_SCALE);
            model.position.set(WEAPON_MODEL_LOCAL_X, WEAPON_MODEL_LOCAL_Y, WEAPON_MODEL_LOCAL_Z);
            model.rotation.set(WEAPON_MODEL_ROT_X, WEAPON_MODEL_ROT_Y, WEAPON_MODEL_ROT_Z);
            model.traverse(node => {
                if (!node.isMesh || !node.material) {
                    return;
                }
                node.frustumCulled = false;
                node.renderOrder = 50;
                node.material.depthTest = true;
                node.material.depthWrite = true;
            });

            if (localViewModelObject) {
                localViewModelPivot.remove(localViewModelObject);
            }

            localViewModelObject = model;
            localViewModelPivot.add(localViewModelObject);
        })
        .catch(() => {
        });

    if (!localFirstPersonBody) {
        loadModularCharacterTemplate()
            .then(template => {
                if (!getSelfPlayer()) {
                    return;
                }

                const model = template.clone(true);
                model.traverse(node => {
                    if (!node.isMesh || !node.material) {
                        return;
                    }
                    node.frustumCulled = false;
                    node.renderOrder = 45;
                });

                model.scale.setScalar(0.42);
                model.position.set(0.0, -0.58, -0.15);
                model.rotation.set(0, Math.PI, 0);

                localFirstPersonBody = model;
                localBodyPivot.add(localFirstPersonBody);
            })
            .catch(() => {
            });
    }
}

function updateLocalViewModel(self) {
    if (self?.reloading && state.ads) {
        state.ads = false;
    }

    const adsWeight = state.ads ? 1 : 0;
    const targetPos = adsWeight > 0.5 ? VIEWMODEL_ADS_POS : VIEWMODEL_HIP_POS;
    const targetRot = adsWeight > 0.5 ? VIEWMODEL_ADS_ROT : VIEWMODEL_HIP_ROT;

    localViewModelPivot.position.lerp(targetPos, VIEWMODEL_BLEND_SPEED);
    localViewModelPivot.rotation.x += (targetRot.x - localViewModelPivot.rotation.x) * VIEWMODEL_BLEND_SPEED;
    localViewModelPivot.rotation.y += (targetRot.y - localViewModelPivot.rotation.y) * VIEWMODEL_BLEND_SPEED;
    localViewModelPivot.rotation.z += (targetRot.z - localViewModelPivot.rotation.z) * VIEWMODEL_BLEND_SPEED;

    if (localViewModelObject) {
        const recoilOffset = Math.min(1, state.recoilKick / 18);
        localViewModelObject.position.z = WEAPON_MODEL_LOCAL_Z - recoilOffset * 0.22;
        localViewModelObject.position.y = WEAPON_MODEL_LOCAL_Y + recoilOffset * 0.06;
    }

    if (crosshairElement) {
        crosshairElement.classList.toggle("hidden", !self);
        const recoilSpread = Math.min(18, state.recoilKick || 0);
        const adsTighten = state.ads ? 3 : 0;
        const dynamicGap = Math.max(5, 8 + recoilSpread - adsTighten);
        crosshairElement.style.setProperty("--crosshair-gap", `${dynamicGap.toFixed(2)}px`);
    }

    if (adsScopeElement) {
        adsScopeElement.classList.add("hidden");
    }
}

function normalizeAngle(angle) {
    let normalized = angle;

    while (normalized > Math.PI) {
        normalized -= Math.PI * 2;
    }

    while (normalized < -Math.PI) {
        normalized += Math.PI * 2;
    }

    return normalized;
}

function lerpAngle(from, to, t) {
    return from + normalizeAngle(to - from) * t;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function updateWeaponAim(player, root, runLean, pitchLean, gaitWeight, phase) {
    const rig = ensureLimbRig(root, player);
    const weaponAnchor = ensureWeaponAnchor(root, player);
    if (rig?.armRight && weaponAnchor.parent !== rig.armRight) {
        rig.armRight.add(weaponAnchor);
        weaponAnchor.position.set(2.0, -0.8, 2.2);
    }
    const current = remotePlayerWeaponAim.get(player.id) || { yaw: 0, pitch: 0 };

    const previousAmmo = remotePlayerLastAmmo.get(player.id);
    const currentAmmo = player.ammo ?? 0;
    const shotDetected = previousAmmo !== undefined && currentAmmo < previousAmmo;
    remotePlayerLastAmmo.set(player.id, currentAmmo);

    let raise = remotePlayerShotRaise.get(player.id) || 0;
    let recoil = remotePlayerWeaponRecoil.get(player.id) || 0;

    if (shotDetected) {
        raise = Math.min(1, raise + 0.9);
        recoil = Math.min(1, recoil + 0.95);
    }

    const runSwayPos = STABLE_BLOCK_WALK
        ? 0
        : (gaitWeight > 0.02 ? Math.sin(phase * 6.2) * WEAPON_RUN_SWAY_POS * gaitWeight : 0);
    const runSwayRot = STABLE_BLOCK_WALK
        ? 0
        : (gaitWeight > 0.02 ? Math.sin(phase * 3.6) * WEAPON_RUN_SWAY_ROT * gaitWeight : 0);

    const targetYaw = 0;
    const pitchFromShot = WEAPON_IDLE_PITCH * (1 - raise) + WEAPON_RAISED_PITCH * raise;
    const targetPitch = pitchFromShot
        - (player.pitch || 0) * 0.22
        + (STABLE_BLOCK_WALK ? 0 : runLean * 0.2)
        + (STABLE_BLOCK_WALK ? 0 : pitchLean * 0.12)
        + recoil * WEAPON_RECOIL_PITCH
        + runSwayRot;

    const nextYaw = lerpAngle(current.yaw, targetYaw, WEAPON_AIM_SMOOTHING);
    const nextPitch = lerpAngle(current.pitch, targetPitch, WEAPON_AIM_SMOOTHING);

    const currentWeaponRot = remotePlayerWeaponRot.get(player.id) || { yaw: 0, pitch: 0 };
    const smoothWeaponYaw = lerpAngle(currentWeaponRot.yaw, nextYaw, 0.24);
    const smoothWeaponPitch = lerpAngle(currentWeaponRot.pitch, nextPitch, 0.24);
    remotePlayerWeaponAim.set(player.id, { yaw: nextYaw, pitch: nextPitch });
    remotePlayerWeaponRot.set(player.id, { yaw: smoothWeaponYaw, pitch: smoothWeaponPitch });
    weaponAnchor.rotation.y = smoothWeaponYaw;
    weaponAnchor.rotation.x = smoothWeaponPitch;
    const basePosX = rig?.armRight ? 0.4 : 12.2;
    const basePosY = rig?.armRight ? 1.1 : CHARACTER_HEIGHT * 0.69;
    const basePosZ = rig?.armRight ? 0.3 : 5.8;
    weaponAnchor.position.x = basePosX + runSwayPos * 0.12;
    weaponAnchor.position.y = basePosY + recoil * (WEAPON_RECOIL_KICK_UP * 0.9);
    const recoilBackZ = basePosZ - recoil * (WEAPON_RECOIL_KICK_BACK * 0.28) + runSwayPos * 0.2;
    weaponAnchor.position.z = Math.max(basePosZ + WEAPON_RECOIL_MIN_Z_OFFSET, recoilBackZ);

    const nextRaise = raise * WEAPON_SHOT_RAISE_DECAY;
    const nextRecoil = recoil * WEAPON_RECOIL_DECAY;
    remotePlayerShotRaise.set(player.id, nextRaise < 0.01 ? 0 : nextRaise);
    remotePlayerWeaponRecoil.set(player.id, nextRecoil < 0.01 ? 0 : nextRecoil);

    if (!rig) {
        return;
    }

    const walkIntensity = gaitWeight > 0.02 ? (0.25 + Math.min(gaitWeight, 1) * 0.55) : 0;
    const walk = gaitWeight > 0.02
        ? Math.sin(phase * WALK_SWING_SPEED) * walkIntensity
        : Math.sin(phase * 2.2) * IDLE_SWAY * 0.4;
    const easedWalk = Math.sin((Math.PI / 2) * walk);
    const armSwing = easedWalk * WALK_ARM_SWING;
    const legSwing = easedWalk * WALK_LEG_SWING;

    const prevArm = remotePlayerArmRotX.get(player.id) || { left: 0, right: 0 };
    const targetLeftArm = -armSwing * 0.8;
    const targetRightArm = armSwing * 0.55;
    const nextLeftArm = prevArm.left + (targetLeftArm - prevArm.left) * ARM_ROTATION_SMOOTHING;
    const nextRightArm = prevArm.right + (targetRightArm - prevArm.right) * ARM_ROTATION_SMOOTHING;
    const smoothLeftArm = prevArm.left + clamp(nextLeftArm - prevArm.left, -ARM_ROTATION_MAX_DELTA, ARM_ROTATION_MAX_DELTA);
    const smoothRightArm = prevArm.right + clamp(nextRightArm - prevArm.right, -ARM_ROTATION_MAX_DELTA, ARM_ROTATION_MAX_DELTA);
    remotePlayerArmRotX.set(player.id, { left: smoothLeftArm, right: smoothRightArm });
    const prevLeg = remotePlayerLegRotX.get(player.id) || { left: 0, right: 0 };
    const targetLeftLeg = legSwing;
    const targetRightLeg = -legSwing;
    const nextLeftLeg = prevLeg.left + (targetLeftLeg - prevLeg.left) * LEG_ROTATION_SMOOTHING;
    const nextRightLeg = prevLeg.right + (targetRightLeg - prevLeg.right) * LEG_ROTATION_SMOOTHING;
    const smoothLeftLeg = prevLeg.left + clamp(nextLeftLeg - prevLeg.left, -LEG_ROTATION_MAX_DELTA, LEG_ROTATION_MAX_DELTA);
    const smoothRightLeg = prevLeg.right + clamp(nextRightLeg - prevLeg.right, -LEG_ROTATION_MAX_DELTA, LEG_ROTATION_MAX_DELTA);
    remotePlayerLegRotX.set(player.id, { left: smoothLeftLeg, right: smoothRightLeg });

    if (rig.armLeft) {
        rig.armLeft.rotation.x = smoothLeftArm;
    }
    if (rig.armRight) {
        rig.armRight.rotation.x = smoothRightArm;
    }
    if (rig.legLeft) {
        rig.legLeft.rotation.x = smoothLeftLeg;
    }
    if (rig.legRight) {
        rig.legRight.rotation.x = smoothRightLeg;
    }
}

function createRemoteFallbackCapsule(player) {
    const color = TEAM_COLORS[player.team] || 0xffffff;
    return new THREE.Mesh(
        new THREE.CapsuleGeometry(10, 30, 4, 8),
        new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.1 })
    );
}

function createRemoteRoot(player) {
    const root = new THREE.Group();
    const placeholder = createRemoteFallbackCapsule(player);
    placeholder.name = "placeholder";
    root.add(placeholder);

    loadModularCharacterTemplate()
        .then(template => {
            const model = template.clone(true);
            tintCharacter(model, TEAM_COLORS[player.team] || 0xffffff);
            const debugHead = root.getObjectByName("remoteDebugHead") || null;
            root.clear();
            root.add(model);
            remotePlayerRightArm.delete(player.id);

            if (debugHead) {
                root.add(debugHead);
            }
        })
        .catch(() => {
        });

    return root;
}

function ensureNameLabel(player) {
    if (!nameLabelsElement) {
        return null;
    }

    if (remotePlayerLabels.has(player.id)) {
        return remotePlayerLabels.get(player.id);
    }

    const label = document.createElement("div");
    label.className = "nameLabel";
    label.textContent = player.name;
    label.style.display = "none";
    nameLabelsElement.appendChild(label);
    remotePlayerLabels.set(player.id, label);
    return label;
}

function updateNameLabel(player, root) {
    const label = ensureNameLabel(player);

    if (!label) {
        return;
    }

    const worldPoint = new THREE.Vector3(root.position.x, root.position.y + CHARACTER_HEIGHT + 14, root.position.z);
    const projected = worldPoint.project(camera3d);
    const visible = projected.z > -1 && projected.z < 1;

    if (!visible) {
        label.style.display = "none";
        return;
    }

    const screenX = (projected.x * 0.5 + 0.5) * canvas.clientWidth;
    const screenY = (-projected.y * 0.5 + 0.5) * canvas.clientHeight;

    label.style.display = "block";
    label.style.left = `${screenX}px`;
    label.style.top = `${screenY}px`;
}

function syncObstacles() {
    const obstacles = state.obstacles || [];
    const nextKey = JSON.stringify(obstacles);

    if (nextKey === obstaclesCacheKey) {
        return;
    }

    obstaclesCacheKey = nextKey;
    obstacleGroup.clear();

    for (const obstacle of obstacles) {
        const geometry = new THREE.BoxGeometry(obstacle.width, OBSTACLE_HEIGHT, obstacle.height);
        const material = new THREE.MeshStandardMaterial({
            color: 0x8b5a2b,
            roughness: 0.9,
            metalness: 0.04
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(
            obstacle.x + obstacle.width / 2,
            OBSTACLE_HEIGHT / 2,
            obstacle.y + obstacle.height / 2
        );
        obstacleGroup.add(mesh);
    }
}

async function loadWorldScene() {
    if (worldSceneLoaded) {
        return;
    }

    worldSceneLoaded = true;

    try {
        const response = await fetch("/world/scene.json", { cache: "no-store" });

        if (!response.ok) {
            return;
        }

        const sceneConfig = await response.json();
        const modelDefs = Array.isArray(sceneConfig.models) ? sceneConfig.models : [];
        const primitiveDefs = Array.isArray(sceneConfig.primitives) ? sceneConfig.primitives : [];

        for (const primitiveDef of primitiveDefs) {
            if ((primitiveDef.type || "box") !== "box") {
                continue;
            }

            const size = primitiveDef.size || {};
            const position = primitiveDef.position || {};
            const rotation = primitiveDef.rotation || {};
            const material = primitiveDef.material || {};

            const width = size.x ?? 100;
            const height = size.y ?? 80;
            const depth = size.z ?? 100;

            const mesh = new THREE.Mesh(
                new THREE.BoxGeometry(width, height, depth),
                new THREE.MeshStandardMaterial({
                    color: typeof material.color === "number" ? material.color : 0x8b5a2b,
                    roughness: material.roughness ?? 0.88,
                    metalness: material.metalness ?? 0.05
                })
            );

            mesh.position.set(
                position.x ?? 0,
                position.y ?? height / 2,
                position.z ?? 0
            );
            mesh.rotation.set(
                rotation.x ?? 0,
                rotation.y ?? 0,
                rotation.z ?? 0
            );

            worldPrimitiveGroup.add(mesh);
        }

        for (const modelDef of modelDefs) {
            if (modelDef.enabled === false) {
                continue;
            }

            if (!modelDef.path) {
                continue;
            }

            gltfLoader.load(
                modelDef.path,
                gltf => {
                    const root = gltf.scene;
                    const position = modelDef.position || {};
                    const rotation = modelDef.rotation || {};
                    const rotationDegrees = modelDef.rotationDegrees || {};
                    const scale = readScale(modelDef.scale);

                    root.position.set(
                        position.x ?? 0,
                        position.y ?? 0,
                        position.z ?? 0
                    );
                    root.rotation.set(
                        rotation.x ?? toRadians(rotationDegrees.x),
                        rotation.y ?? toRadians(rotationDegrees.y),
                        rotation.z ?? toRadians(rotationDegrees.z)
                    );
                    root.scale.set(
                        scale.x,
                        scale.y,
                        scale.z
                    );

                    root.traverse(node => {
                        if (!node.isMesh) {
                            return;
                        }

                        node.castShadow = false;
                        node.receiveShadow = false;
                    });

                    worldModelGroup.add(root);
                },
                undefined,
                () => {
                    createMissingModelPlaceholder(modelDef);
                }
            );
        }
    } catch (_error) {
    }
}

function syncRemotePlayers() {
    const nowMs = performance.now();
    const deltaTime = Math.min(0.05, Math.max(0.001, (nowMs - lastAnimationTimeMs) / 1000));
    lastAnimationTimeMs = nowMs;

    const activePlayerIds = new Set();

    for (const player of getRenderableRemotePlayers()) {
        activePlayerIds.add(player.id);

        let root = remotePlayerRoots.get(player.id);

        if (!root) {
            root = createRemoteRoot(player);
            remotePlayerRoots.set(player.id, root);
            remotePlayerModelPaths.set(player.id, getCharacterModelPathForPlayer(player));
            remotePlayerGroup.add(root);

            if (DEBUG_REMOTE_MARKERS) {
                const debugHead = new THREE.Mesh(
                    new THREE.SphereGeometry(4, 12, 12),
                    new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 0.8 })
                );
                debugHead.name = "remoteDebugHead";
                debugHead.position.set(0, CHARACTER_HEIGHT + 10, 0);
                root.add(debugHead);
            }
        } else {
            const currentPath = getCharacterModelPathForPlayer(player);
            const previousPath = remotePlayerModelPaths.get(player.id);

            if (currentPath !== previousPath) {
                remotePlayerGroup.remove(root);
                root = createRemoteRoot(player);
                remotePlayerRoots.set(player.id, root);
                remotePlayerModelPaths.set(player.id, currentPath);
                remotePlayerGroup.add(root);
            }
        }

        const velocityX = player.velocityX || 0;
        const velocityY = player.velocityY || 0;
        const speed = Math.sqrt(velocityX * velocityX + velocityY * velocityY);
        const targetMoveFactor = Math.min(speed / PLAYER_MAX_SPEED, 1.8);
        const previousMoveFactor = remotePlayerMoveFactor.get(player.id) || 0;
        const moveFactor = previousMoveFactor + (targetMoveFactor - previousMoveFactor) * MOVE_FACTOR_SMOOTHING;
        remotePlayerMoveFactor.set(player.id, moveFactor);

        const wasMoving = remotePlayerMoving.get(player.id) || false;
        const isMoving = wasMoving ? moveFactor > MOVE_STOP_THRESHOLD : moveFactor > MOVE_START_THRESHOLD;
        remotePlayerMoving.set(player.id, isMoving);

        const previousGaitWeight = remotePlayerGaitWeight.get(player.id) || 0;
        const targetGaitWeight = isMoving ? 1 : 0;
        const gaitWeight = previousGaitWeight + (targetGaitWeight - previousGaitWeight) * GAIT_WEIGHT_SMOOTHING;
        remotePlayerGaitWeight.set(player.id, gaitWeight);

        const previousLocomotionState = remotePlayerLocomotionState.get(player.id) || "idle";
        const locomotionState = !isMoving ? "idle" : (moveFactor < WALK_RUN_THRESHOLD ? "walk" : "run");
        remotePlayerLocomotionState.set(player.id, locomotionState);
        let phase = remotePlayerAnimPhase.get(player.id) || 0;
        if (!isMoving) {
            phase += IDLE_PHASE_SPEED;
        } else {
            const cycleHz = locomotionState === "run" ? RUN_CYCLE_HZ : WALK_CYCLE_HZ;
            phase += deltaTime * Math.PI * 2 * cycleHz;
        }
        remotePlayerAnimPhase.set(player.id, phase);

        const bobAmount = STABLE_BLOCK_WALK ? 0 : (gaitWeight > 0.02 ? Math.sin(phase * 8) * 1.2 * gaitWeight : 0);
        const pitchLean = STABLE_BLOCK_WALK ? 0 : (gaitWeight > 0.02 ? Math.cos(phase * 8) * 0.022 * gaitWeight : 0);
        const runLean = STABLE_BLOCK_WALK ? 0 : (speed > REMOTE_RUN_SPEED_THRESHOLD ? -0.08 : 0);

        syncPlayerWeapon(player, root);
        updateWeaponAim(player, root, runLean, pitchLean, gaitWeight, phase);

        root.position.set(player.x, (player.z || 0) + bobAmount, player.y);
        const targetYaw = player.angle + CHARACTER_YAW_OFFSET;
        const previousYaw = remotePlayerBodyYaw.get(player.id) ?? targetYaw;
        const smoothYaw = lerpAngle(previousYaw, targetYaw, BODY_YAW_SMOOTHING);
        remotePlayerBodyYaw.set(player.id, smoothYaw);
        root.rotation.y = smoothYaw;
        // Keep the body stable; only arm/weapon should animate for aiming/recoil.
        root.rotation.z = 0;
        root.rotation.x = 0;
        updateNameLabel(player, root);
    }

    for (const [playerId, root] of remotePlayerRoots.entries()) {
        if (activePlayerIds.has(playerId)) {
            continue;
        }

        remotePlayerGroup.remove(root);
        remotePlayerRoots.delete(playerId);
        remotePlayerModelPaths.delete(playerId);
        remotePlayerAnimPhase.delete(playerId);
        remotePlayerWeaponModelPaths.delete(playerId);
        remotePlayerWeaponAnchors.delete(playerId);
        remotePlayerWeaponAim.delete(playerId);
        remotePlayerLastAmmo.delete(playerId);
        remotePlayerShotRaise.delete(playerId);
        remotePlayerWeaponRecoil.delete(playerId);
        remotePlayerRightArm.delete(playerId);
        remotePlayerMoveFactor.delete(playerId);
        remotePlayerGaitWeight.delete(playerId);
        remotePlayerArmRotX.delete(playerId);
        remotePlayerLegRotX.delete(playerId);
        remotePlayerBodyYaw.delete(playerId);
        remotePlayerLocomotionState.delete(playerId);
        remotePlayerWeaponRot.delete(playerId);
        remotePlayerMoving.delete(playerId);

        const label = remotePlayerLabels.get(playerId);
        if (label) {
            label.remove();
            remotePlayerLabels.delete(playerId);
        }
    }
}

function syncBullets() {
    bulletGroup.clear();

    for (const bullet of getRenderableBullets()) {
        const mesh = new THREE.Mesh(
            new THREE.CylinderGeometry(BULLET_RADIUS, BULLET_RADIUS, BULLET_LENGTH, 10),
            new THREE.MeshStandardMaterial({
                color: 0xfef08a,
                emissive: 0xf59e0b,
                emissiveIntensity: 1.35,
                roughness: 0.12,
                metalness: 0.72
            })
        );
        mesh.rotation.x = Math.PI / 2;
        mesh.renderOrder = 42;

        mesh.position.set(
            bullet.x,
            Math.max(2, bullet.z || 2),
            bullet.y
        );
        mesh.lookAt(
            bullet.x + (bullet.velocityX || 0),
            Math.max(2, (bullet.z || 2) + (bullet.velocityZ || 0)),
            bullet.y + (bullet.velocityY || 0)
        );

        bulletGroup.add(mesh);
    }
}

function updateCameraFromSelf() {
    const self = getSelfPlayer();

    if (!self) {
        camera3d.position.set(WORLD_WIDTH / 2, 180, WORLD_HEIGHT / 2 + 220);
        camera3d.lookAt(WORLD_WIDTH / 2, 0, WORLD_HEIGHT / 2);
        camera3d.fov += (CAMERA_FOV_HIP - camera3d.fov) * CAMERA_FOV_BLEND;
        camera3d.updateProjectionMatrix();
        return;
    }

    const cosYaw = Math.cos(self.angle);
    const sinYaw = Math.sin(self.angle);
    const horizontalPitchFactor = Math.cos(self.pitch);

    const lookDirection = new THREE.Vector3(
        cosYaw * horizontalPitchFactor,
        Math.sin(self.pitch),
        sinYaw * horizontalPitchFactor
    ).normalize();

    const eyeX = self.x - cosYaw * CAMERA_BACK_OFFSET;
    const eyeY = CAMERA_EYE_HEIGHT + (self.z || 0);
    const eyeZ = self.y - sinYaw * CAMERA_BACK_OFFSET;

    camera3d.position.set(eyeX, eyeY, eyeZ);

    const lookTarget = new THREE.Vector3(
        self.x + lookDirection.x * CAMERA_LOOK_DISTANCE,
        eyeY + lookDirection.y * CAMERA_LOOK_DISTANCE,
        self.y + lookDirection.z * CAMERA_LOOK_DISTANCE
    );

    camera3d.lookAt(lookTarget);

    const targetFov = state.ads ? CAMERA_FOV_ADS : CAMERA_FOV_HIP;
    camera3d.fov += (targetFov - camera3d.fov) * CAMERA_FOV_BLEND;
    camera3d.updateProjectionMatrix();
}

export function resizeCanvas() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    renderer.setSize(width, height, false);
    camera3d.aspect = width / Math.max(height, 1);
    camera3d.updateProjectionMatrix();
}

export function updateCamera() {
    updateCameraFromSelf();
}

export function updateMouseWorldPosition() {
    const self = getSelfPlayer();

    if (!self) {
        mouse.worldX = WORLD_WIDTH / 2;
        mouse.worldY = WORLD_HEIGHT / 2;
        return;
    }

    mouse.worldX = self.x + Math.cos(state.viewAngle) * 100;
    mouse.worldY = self.y + Math.sin(state.viewAngle) * 100;
}

export function updateAimAngle() {
    const self = getSelfPlayer();

    if (!self) {
        mouse.angle = state.viewAngle;
        mouse.pitch = state.viewPitch;
        return;
    }

    if (state.viewAngle === 0 && self.angle !== 0) {
        state.viewAngle = self.angle;
    }

    mouse.angle = state.viewAngle;
    mouse.pitch = state.viewPitch;
}

export function render() {
    if (!worldSceneLoaded) {
        void loadWorldScene();
    }

    syncObstacles();
    syncRemotePlayers();
    syncBullets();
    const self = getSelfPlayer();
    syncLocalViewModel(self);
    updateLocalViewModel(self);
    updateCameraFromSelf();
    renderer.render(scene, camera3d);
}

resizeCanvas();
