import * as THREE from "/vendor/three/build/three.module.js";
import { GLTFLoader } from "/vendor/three/examples/jsm/loaders/GLTFLoader.js";
import { OBJLoader } from "/vendor/three/examples/jsm/loaders/OBJLoader.js";
import { MTLLoader } from "/vendor/three/examples/jsm/loaders/MTLLoader.js";
import { adsScopeElement, canvas, crosshairElement, editorHudElement, editorSelectedModelElement, nameLabelsElement } from "./dom.js";
import {
    getRenderableBullets,
    getRenderableRemotePlayers,
    getSelfPlayer,
    mouse,
    state
} from "./state.js";
import { PLAYER_MAX_SPEED, WORLD_HEIGHT, WORLD_WIDTH } from "./config.js";

const PLAYER_HEIGHT = 72;
const CAMERA_EYE_HEIGHT = 54;
const CAMERA_CROUCH_EYE_HEIGHT = 40;
const CAMERA_BACK_OFFSET = 6;
const CAMERA_LOOK_DISTANCE = 120;
const BULLET_RADIUS = 0.85;
const BULLET_LENGTH = 10;
const BULLET_TRAIL_LENGTH = 16;
const OBSTACLE_HEIGHT = 84;
const RENDER_COLLISION_OBSTACLES = false;
const OBJ_WORLD_SCALE = 128;
const MODEL_GROUND_EPSILON = 0.02;
const PERFORMANCE_AUTOGRID_LIMIT = 56;
const CHARACTER_HEIGHT = 58;
const CHARACTER_YAW_OFFSET = Math.PI / 2;
const REMOTE_RUN_SPEED_THRESHOLD = PLAYER_MAX_SPEED * 1.08;
const WEAPON_AIM_SMOOTHING = 0.18;
const WEAPON_IDLE_PITCH = 0.08;
const WEAPON_RAISED_PITCH = -0.18;
const REMOTE_WEAPON_IDLE_TO_BACK_DELAY_MS = 3000;
const REMOTE_WEAPON_COMBAT_BLEND_IN = 0.34;
const REMOTE_WEAPON_COMBAT_BLEND_OUT = 0.08;
const REMOTE_WEAPON_LOWERED_PITCH = 0.72;
const REMOTE_WEAPON_HAND_OFFSETS = {
    default: { x: 0.65, y: 1.2, z: 0.01 },
    SMG: { x: 0.70, y: 1.2, z: -0.2 },
    Pistol: { x: 0.65, y: 1.2, z: -0.2  },
    Shotgun: { x: 0.67, y: 1.2, z: -0.35 },
    Sniper: { x: 0.67, y: 1.2, z: 0.20 }
};
const REMOTE_WEAPON_MUZZLE_LIFT = {
    default: 0.08,
    Pistol: 0.05,
    SMG: 0.07,
    Shotgun: 0.10,
    Sniper: 0.12
};
let REMOTE_BACK_POS_X = 0.2;
let REMOTE_BACK_POS_Y = 1.6;
let REMOTE_BACK_POS_Z = -0.7;
let REMOTE_BACK_ROT_X = 80 * Math.PI / 180;
let REMOTE_BACK_ROT_Y = 318 * Math.PI / 180;
let REMOTE_BACK_ROT_Z = 75 * Math.PI / 180;
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
const VIEWMODEL_HIP_POS = new THREE.Vector3(0.62, -0.56, -1.02);
const VIEWMODEL_ADS_POS = new THREE.Vector3(0.22, -0.34, -0.84);
const VIEWMODEL_HIP_ROT = new THREE.Euler(-0.30, Math.PI + 0.18, 0.04);
const VIEWMODEL_ADS_ROT = new THREE.Euler(-0.12, Math.PI + 0.04, 0);
const VIEWMODEL_BLEND_SPEED = 0.18;
const ADS_WEAPON_OFFSET_X = 0.02;
const ADS_WEAPON_OFFSET_Y = -0.04;
const ADS_WEAPON_OFFSET_Z = 0.18;
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
const ALL_OBJ_MODEL_FILES = [
    "balcony-ladder-bottom.obj","balcony-ladder-top.obj","balcony-type-a.obj","cliff-corner.obj","cliff-side.obj",
    "detail-awning-small.obj","detail-awning-wide.obj","detail-barrier-strong-damaged.obj","detail-barrier-strong-type-a.obj","detail-barrier-strong-type-b.obj",
    "detail-barrier-type-a.obj","detail-barrier-type-b.obj","detail-beam.obj","detail-bench.obj","detail-block.obj",
    "detail-bricks-type-a.obj","detail-bricks-type-b.obj","detail-cables-type-a.obj","detail-cables-type-b.obj","detail-dumpster-closed.obj",
    "detail-dumpster-open.obj","detail-light-double.obj","detail-light-single.obj","detail-light-traffic.obj","door-type-a.obj",
    "door-type-b.obj","grass.obj","grass-corner.obj","grass-corner-inner.obj","grass-hill.obj",
    "pallet.obj","pallet-small.obj","planks.obj","road-asphalt-center.obj","road-asphalt-corner.obj",
    "road-asphalt-corner-inner.obj","road-asphalt-corner-outer.obj","road-asphalt-damaged.obj","road-asphalt-pavement.obj","road-asphalt-side.obj",
    "road-asphalt-straight.obj","road-dirt-center.obj","road-dirt-corner.obj","road-dirt-corner-inner.obj","road-dirt-corner-outer.obj",
    "road-dirt-damaged.obj","road-dirt-pavement.obj","road-dirt-side.obj","road-dirt-straight.obj","road-dirt-tile.obj",
    "roof-metal-poles.obj","roof-metal-type-a.obj","roof-metal-type-b.obj","scaffolding-floor.obj","scaffolding-poles.obj",
    "scaffolding-structure.obj","tree-large.obj","tree-park-large.obj","tree-park-pine-large.obj","tree-pine-large.obj",
    "tree-pine-small.obj","tree-shrub.obj","tree-small.obj","truck-flat.obj","truck-green.obj",
    "truck-green-cargo.obj","truck-grey.obj","truck-grey-cargo.obj","wall-a.obj","wall-a-column.obj",
    "wall-a-column-painted.obj","wall-a-corner.obj","wall-a-corner-painted.obj","wall-a-detail.obj","wall-a-detail-painted.obj",
    "wall-a-diagonal.obj","wall-a-door.obj","wall-a-flat.obj","wall-a-flat-garage.obj","wall-a-flat-painted.obj",
    "wall-a-flat-window.obj","wall-a-garage.obj","wall-a-low.obj","wall-a-low-painted.obj","wall-a-open.obj",
    "wall-a-painted.obj","wall-a-painted-diagonal.obj","wall-a-roof.obj","wall-a-roof-detailed.obj","wall-a-roof-slant.obj",
    "wall-a-roof-slant-detailed.obj","wall-a-window.obj","wall-b.obj","wall-b-column.obj","wall-b-corner.obj",
    "wall-b-detail-painted.obj","wall-b-diagonal.obj","wall-b-door.obj","wall-b-flat.obj","wall-b-flat-garage.obj",
    "wall-b-flat-window.obj","wall-b-garage.obj","wall-b-low.obj","wall-b-open.obj","wall-broken-type-a.obj",
    "wall-broken-type-b.obj","wall-b-roof.obj","wall-b-roof-detailed.obj","wall-b-roof-slant.obj","wall-b-roof-slant-detailed.obj",
    "wall-b-window.obj","wall-c-flat.obj","wall-c-flat-low.obj","wall-fence.obj","wall-steps-type-a.obj",
    "wall-steps-type-b.obj","wall-type-a.obj","wall-type-b.obj","window-small-type-a.obj","window-small-type-b.obj",
    "window-wide-type-a.obj","window-wide-type-b.obj","window-wide-type-c.obj","window-wide-type-d.obj"
];

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);

const camera3d = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.8, 3000);
scene.add(camera3d);
const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: "high-performance"
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.sortObjects = true;

function applyPerformanceModeSettings() {
    const baseDpr = window.devicePixelRatio || 1;
    const scale = Math.max(0.6, Math.min(1.5, state.renderScale || 1));
    if (state.performanceMode) {
        renderer.setPixelRatio(Math.min(baseDpr * scale, 1.25));
        renderer.shadowMap.enabled = false;
    } else {
        renderer.setPixelRatio(Math.min(baseDpr * scale, 2));
        renderer.shadowMap.enabled = false;
    }
    if (state.toneMappingEnabled) {
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.1;
    } else {
        renderer.toneMapping = THREE.NoToneMapping;
        renderer.toneMappingExposure = 1.0;
    }
}
applyPerformanceModeSettings();

const ambientLight = new THREE.HemisphereLight(0xffffff, 0x355e2c, 1.1);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.7);
directionalLight.position.set(300, 600, 300);
scene.add(directionalLight);

const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_WIDTH, WORLD_HEIGHT),
    new THREE.MeshStandardMaterial({ color: 0x4b5563, roughness: 0.96, metalness: 0.02 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.set(WORLD_WIDTH / 2, 0, WORLD_HEIGHT / 2);
ground.receiveShadow = false;
scene.add(ground);

const obstacleGroup = new THREE.Group();
scene.add(obstacleGroup);

const remotePlayerGroup = new THREE.Group();
scene.add(remotePlayerGroup);

const bulletGroup = new THREE.Group();
scene.add(bulletGroup);

const worldModelGroup = new THREE.Group();
scene.add(worldModelGroup);
const worldInstancedGroup = new THREE.Group();
scene.add(worldInstancedGroup);
const worldPrimitiveGroup = new THREE.Group();
scene.add(worldPrimitiveGroup);
const editorPreviewGroup = new THREE.Group();
scene.add(editorPreviewGroup);
let wallhackEnabled = false;
const editorRaycaster = new THREE.Raycaster();
const editorGroundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const editorGroundHit = new THREE.Vector3();
let editorModelCatalog = [];
let editorModelCursor = 0;
let editorSceneModels = [];
let selectedEditorRoot = null;
let selectedEditorModelIndex = -1;
let editorLastPickSignature = "";
let editorLastPickRoots = [];
let editorLastPickCursor = 0;
let editorDraftModel = null;
let editorDraftRoot = null;
let editorPreviewRoot = null;
let editorPreviewModelPath = null;
let editorPreviewRequestId = 0;

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
const remotePlayerWeaponCombatBlend = new Map();
const remotePlayerWeaponInBackMount = new Map();
const remotePlayerLastShotAt = new Map();
const bulletVisuals = new Map();
const ARM_ROTATION_SMOOTHING = 0.2;
const ARM_ROTATION_MAX_DELTA = 0.02;
const LEG_ROTATION_SMOOTHING = 0.2;
const LEG_ROTATION_MAX_DELTA = 0.024;
const characterTemplateCache = new Map();
const weaponTemplateCache = new Map();
const objTemplatePromiseCache = new Map();
let modularCharacterTemplatePromise = null;

let obstaclesCacheKey = "";
let worldSceneLoaded = false;
let worldSceneSignature = "";
let worldSceneSyncInFlight = false;
let lastWorldSceneSyncAtMs = 0;
const WORLD_SCENE_SYNC_INTERVAL_MS = 1500;
let lastAnimationTimeMs = performance.now();
let localViewModelPath = null;
let localViewModelObject = null;
let localFirstPersonBody = null;
let localWeaponOffsetX = WEAPON_MODEL_LOCAL_X;
let localWeaponOffsetY = WEAPON_MODEL_LOCAL_Y;
let localWeaponOffsetZ = WEAPON_MODEL_LOCAL_Z;
const localViewModelPivot = new THREE.Group();
camera3d.add(localViewModelPivot);
localViewModelPivot.position.copy(VIEWMODEL_HIP_POS);
localViewModelPivot.rotation.copy(VIEWMODEL_HIP_ROT);
const localBodyPivot = new THREE.Group();
camera3d.add(localBodyPivot);
localBodyPivot.position.set(0, -1.05, -0.38);

function collectMeshNodes(root) {
    const meshes = [];
    root.traverse(node => {
        if (node.isMesh) {
            meshes.push(node);
        }
    });
    return meshes;
}

function clearInstancedWorldModels() {
    worldInstancedGroup.clear();
}

function updateWorldModelRenderMode() {
    const useInstanced = !state.editorMode;
    worldInstancedGroup.visible = useInstanced;
    for (const root of worldModelGroup.children) {
        if (root.userData?.instancedHidden) {
            root.visible = !useInstanced;
        } else {
            root.visible = true;
        }
    }
}

function rebuildInstancedWorldModels() {
    clearInstancedWorldModels();

    const byPath = new Map();
    for (const root of worldModelGroup.children) {
        const path = root.userData?.modelPath;
        if (!path) {
            root.userData.instancedHidden = false;
            continue;
        }
        if (!byPath.has(path)) {
            byPath.set(path, []);
        }
        byPath.get(path).push(root);
    }

    for (const roots of byPath.values()) {
        if (!roots || roots.length < 3) {
            for (const root of roots || []) {
                root.userData.instancedHidden = false;
            }
            continue;
        }

        const firstMeshes = collectMeshNodes(roots[0]);
        if (firstMeshes.length === 0) {
            for (const root of roots) {
                root.userData.instancedHidden = false;
            }
            continue;
        }

        const meshLists = [];
        let compatible = true;
        for (const root of roots) {
            root.updateMatrixWorld(true);
            const meshes = collectMeshNodes(root);
            if (meshes.length !== firstMeshes.length) {
                compatible = false;
                break;
            }
            meshLists.push(meshes);
        }

        if (!compatible) {
            for (const root of roots) {
                root.userData.instancedHidden = false;
            }
            continue;
        }

        for (let meshIndex = 0; meshIndex < firstMeshes.length; meshIndex += 1) {
            const templateMesh = firstMeshes[meshIndex];
            const instancedMesh = new THREE.InstancedMesh(
                templateMesh.geometry,
                templateMesh.material,
                roots.length
            );
            instancedMesh.castShadow = false;
            instancedMesh.receiveShadow = false;
            for (let instanceIndex = 0; instanceIndex < roots.length; instanceIndex += 1) {
                instancedMesh.setMatrixAt(instanceIndex, meshLists[instanceIndex][meshIndex].matrixWorld);
            }
            instancedMesh.instanceMatrix.needsUpdate = true;
            worldInstancedGroup.add(instancedMesh);
        }

        for (const root of roots) {
            root.userData.instancedHidden = true;
        }
    }

    updateWorldModelRenderMode();
}

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

function hashString(text) {
    let hash = 0;
    for (let index = 0; index < text.length; index += 1) {
        hash = ((hash << 5) - hash) + text.charCodeAt(index);
        hash |= 0;
    }
    return Math.abs(hash);
}

function computeCoplanarBias(modelDef) {
    const path = (modelDef.path || "").toLowerCase();
    if (!path.endsWith(".obj")) {
        return 0;
    }

    const px = Math.round(modelDef.position?.x ?? 0);
    const py = Math.round(modelDef.position?.y ?? 0);
    const pz = Math.round(modelDef.position?.z ?? 0);
    const ry = Math.round(modelDef.rotationDegrees?.y ?? 0);
    const seed = `${path}|${px}|${py}|${pz}|${ry}`;
    const bucket = hashString(seed) % 5;
    return bucket * 0.015;
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

function applyWallhackToObject(root, enabled) {
    root.traverse(node => {
        if (!node.isMesh || !node.material) {
            return;
        }

        const material = node.material;
        if (enabled) {
            material.transparent = true;
            material.opacity = 0.2;
            material.depthWrite = false;
        } else {
            material.transparent = false;
            material.opacity = 1;
            material.depthWrite = true;
        }
        material.needsUpdate = true;
    });
}

function applyWallhackState() {
    applyWallhackToObject(obstacleGroup, wallhackEnabled);
    applyWallhackToObject(worldPrimitiveGroup, wallhackEnabled);
    applyWallhackToObject(worldModelGroup, wallhackEnabled);
}

export function setWallhackEnabled(enabled) {
    wallhackEnabled = Boolean(enabled);
    applyWallhackState();
}

export function setPerformanceMode(enabled) {
    state.performanceMode = Boolean(enabled);
    applyPerformanceModeSettings();
    resizeCanvas();
}

export function setRenderScale(value) {
    state.renderScale = Math.max(0.6, Math.min(1.5, Number(value) || 1));
    applyPerformanceModeSettings();
    resizeCanvas();
}

export function setToneMappingEnabled(enabled) {
    state.toneMappingEnabled = Boolean(enabled);
    applyPerformanceModeSettings();
}

function resolveAnisotropyLevel() {
    const max = renderer.capabilities.getMaxAnisotropy();
    if (state.anisotropyLevel === "max") {
        return max;
    }
    const parsed = Number(state.anisotropyLevel);
    if (!Number.isFinite(parsed)) {
        return Math.min(8, max);
    }
    return Math.max(1, Math.min(parsed, max));
}

function retuneWorldMaterials() {
    const targets = [worldModelGroup, editorPreviewGroup];
    for (const group of targets) {
        group.traverse(node => {
            if (!node.isMesh || !node.material) {
                return;
            }
            const materials = Array.isArray(node.material) ? node.material : [node.material];
            for (const material of materials) {
                if (!material?.map) {
                    continue;
                }
                if (state.textureFilter === "crisp") {
                    material.map.generateMipmaps = false;
                    material.map.magFilter = THREE.NearestFilter;
                    material.map.minFilter = THREE.NearestFilter;
                } else {
                    material.map.generateMipmaps = true;
                    material.map.magFilter = THREE.LinearFilter;
                    material.map.minFilter = THREE.LinearMipmapLinearFilter;
                }
                material.map.anisotropy = resolveAnisotropyLevel();
                material.map.needsUpdate = true;
                material.needsUpdate = true;
            }
        });
    }
}

export function setTextureFilterMode(mode) {
    state.textureFilter = mode === "crisp" ? "crisp" : "smooth";
    retuneWorldMaterials();
}

export function setAnisotropyLevel(level) {
    state.anisotropyLevel = level;
    retuneWorldMaterials();
}

export function setRemoteBackMountTransform(config) {
    if (Number.isFinite(config?.x)) {
        REMOTE_BACK_POS_X = config.x;
    }
    if (Number.isFinite(config?.y)) {
        REMOTE_BACK_POS_Y = config.y;
    }
    if (Number.isFinite(config?.z)) {
        REMOTE_BACK_POS_Z = config.z;
    }
    if (Number.isFinite(config?.rxDeg)) {
        REMOTE_BACK_ROT_X = config.rxDeg * Math.PI / 180;
    }
    if (Number.isFinite(config?.ryDeg)) {
        REMOTE_BACK_ROT_Y = config.ryDeg * Math.PI / 180;
    }
    if (Number.isFinite(config?.rzDeg)) {
        REMOTE_BACK_ROT_Z = config.rzDeg * Math.PI / 180;
    }
}

export function setRemoteHandMountOffset(config) {
    const key = config?.weapon && REMOTE_WEAPON_HAND_OFFSETS[config.weapon]
        ? config.weapon
        : "default";
    const target = REMOTE_WEAPON_HAND_OFFSETS[key];
    if (Number.isFinite(config?.x)) {
        target.x = config.x;
    }
    if (Number.isFinite(config?.y)) {
        target.y = config.y;
    }
    if (Number.isFinite(config?.z)) {
        target.z = config.z;
    }
}

function updateEditorHud() {
    if (!editorHudElement) {
        return;
    }
    editorHudElement.classList.toggle("hidden", !state.editorMode);
    if (editorSelectedModelElement) {
        const current = editorModelCatalog[editorModelCursor] || "-";
        editorSelectedModelElement.textContent = `Model: ${current.replace("/models/", "")}`;
    }
}

function clearEditorSelectionHighlight() {
    if (!selectedEditorRoot) {
        return;
    }
    selectedEditorRoot.traverse(node => {
        if (!node.isMesh || !node.material) {
            return;
        }
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        for (const material of materials) {
            if (material.emissive && material.userData?.editorPrevEmissiveHex !== undefined) {
                material.emissive.setHex(material.userData.editorPrevEmissiveHex);
                material.emissiveIntensity = material.userData.editorPrevEmissiveIntensity ?? material.emissiveIntensity;
                delete material.userData.editorPrevEmissiveHex;
                delete material.userData.editorPrevEmissiveIntensity;
                material.needsUpdate = true;
            }
        }
    });
    selectedEditorRoot = null;
    selectedEditorModelIndex = -1;
}

function setEditorSelection(root, index) {
    clearEditorSelectionHighlight();
    if (!root || index < 0) {
        return;
    }
    selectedEditorRoot = root;
    selectedEditorModelIndex = index;
    root.traverse(node => {
        if (!node.isMesh || !node.material) {
            return;
        }
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        for (const material of materials) {
            if (!material.emissive) {
                continue;
            }
            material.userData = material.userData || {};
            material.userData.editorPrevEmissiveHex = material.emissive.getHex();
            material.userData.editorPrevEmissiveIntensity = material.emissiveIntensity ?? 1;
            material.emissive.setHex(0xfacc15);
            material.emissiveIntensity = 0.35;
            material.needsUpdate = true;
        }
    });
}

function applyDraftVisual(root) {
    root.traverse(node => {
        if (!node.isMesh || !node.material) {
            return;
        }
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        for (const material of materials) {
            if (!material.emissive) {
                continue;
            }
            material.userData = material.userData || {};
            if (material.userData.editorDraftPrevEmissiveHex === undefined) {
                material.userData.editorDraftPrevEmissiveHex = material.emissive.getHex();
                material.userData.editorDraftPrevEmissiveIntensity = material.emissiveIntensity ?? 1;
            }
            material.emissive.setHex(0x22d3ee);
            material.emissiveIntensity = 0.45;
            material.needsUpdate = true;
        }
    });
}

function clearDraftVisual(root) {
    if (!root) {
        return;
    }
    root.traverse(node => {
        if (!node.isMesh || !node.material) {
            return;
        }
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        for (const material of materials) {
            if (!material.emissive || !material.userData) {
                continue;
            }
            if (material.userData.editorDraftPrevEmissiveHex !== undefined) {
                material.emissive.setHex(material.userData.editorDraftPrevEmissiveHex);
                material.emissiveIntensity = material.userData.editorDraftPrevEmissiveIntensity ?? material.emissiveIntensity;
                delete material.userData.editorDraftPrevEmissiveHex;
                delete material.userData.editorDraftPrevEmissiveIntensity;
                material.needsUpdate = true;
            }
        }
    });
}

function cancelEditorDraft() {
    if (editorDraftRoot) {
        worldModelGroup.remove(editorDraftRoot);
    }
    editorDraftModel = null;
    editorDraftRoot = null;
    ensureEditorPreview();
}

function clearEditorPreview() {
    if (editorPreviewRoot) {
        editorPreviewGroup.remove(editorPreviewRoot);
    }
    editorPreviewRoot = null;
    editorPreviewModelPath = null;
}

function applyPreviewVisual(root) {
    root.traverse(node => {
        if (!node.isMesh || !node.material) {
            return;
        }
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        for (const material of materials) {
            material.userData = material.userData || {};
            if (material.userData.editorPreviewPrevOpacity === undefined) {
                material.userData.editorPreviewPrevOpacity = material.opacity ?? 1;
                material.userData.editorPreviewPrevTransparent = material.transparent ?? false;
            }
            material.transparent = true;
            material.opacity = 0.5;
            if (material.emissive) {
                material.emissive.setHex(0x22d3ee);
                material.emissiveIntensity = 0.2;
            }
            material.needsUpdate = true;
        }
    });
}

function ensureEditorPreview() {
    if (!state.editorMode || editorModelCatalog.length === 0) {
        clearEditorPreview();
        return;
    }
    if (editorDraftRoot) {
        clearEditorPreview();
        return;
    }

    const path = editorModelCatalog[editorModelCursor];
    if (!path) {
        clearEditorPreview();
        return;
    }
    if (editorPreviewRoot && editorPreviewModelPath === path) {
        return;
    }

    clearEditorPreview();
    editorPreviewModelPath = path;
    const requestId = ++editorPreviewRequestId;
    const previewModel = {
        enabled: true,
        path,
        position: { x: 0, y: 0, z: 0 },
        rotationDegrees: { y: 0 },
        scale: 1
    };
    loadWorldModel(previewModel, root => {
        if (requestId !== editorPreviewRequestId || !state.editorMode || editorDraftRoot) {
            worldModelGroup.remove(root);
            return;
        }
        worldModelGroup.remove(root);
        applyPreviewVisual(root);
        editorPreviewRoot = root;
        editorPreviewGroup.add(root);
    }, worldModelGroup);
}

function getEditorTopLevelRoot(object) {
    let current = object;
    while (current && current.parent && current.parent !== worldModelGroup) {
        current = current.parent;
    }
    return current?.parent === worldModelGroup ? current : null;
}

function getEditorPointerNdc(pointerX = mouse.x, pointerY = mouse.y) {
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    const x = (pointerX / Math.max(width, 1)) * 2 - 1;
    const y = -(pointerY / Math.max(height, 1)) * 2 + 1;
    return { x, y };
}

function resolveEditorPlacementPoint(ndc) {
    editorRaycaster.setFromCamera(ndc, camera3d);

    const placementTargets = [
        ...worldModelGroup.children,
        ...worldPrimitiveGroup.children
    ].filter(object => object !== editorDraftRoot && object !== editorPreviewRoot);

    const hits = editorRaycaster.intersectObjects(placementTargets, true);
    if (hits.length > 0) {
        return {
            x: Math.round(hits[0].point.x),
            y: Math.round(hits[0].point.y + MODEL_GROUND_EPSILON),
            z: Math.round(hits[0].point.z)
        };
    }

    if (!editorRaycaster.ray.intersectPlane(editorGroundPlane, editorGroundHit)) {
        return null;
    }

    return {
        x: Math.round(editorGroundHit.x),
        y: 0,
        z: Math.round(editorGroundHit.z)
    };
}

async function ensureEditorModelCatalog() {
    if (editorModelCatalog.length > 0) {
        return;
    }
    try {
        const response = await fetch("/api/world/models", { cache: "no-store" });
        if (!response.ok) {
            return;
        }
        const list = await response.json();
        if (Array.isArray(list) && list.length > 0) {
            editorModelCatalog = list;
            editorModelCursor = 0;
            updateEditorHud();
            return;
        }
    } catch (_error) {
    }
    editorModelCatalog = ALL_OBJ_MODEL_FILES.map(name => `/models/${name}`);
    editorModelCursor = 0;
    updateEditorHud();
}

function applyEditorTransformByKey(code, modelDefOverride = null, rootOverride = null) {
    const modelDef = modelDefOverride || editorSceneModels[selectedEditorModelIndex];
    const targetRoot = rootOverride || selectedEditorRoot;
    if (!modelDef || !targetRoot) {
        return false;
    }

    const moveStep = 30;
    const rotStep = 15;
    const scaleStep = 0.05;
    switch (code) {
        case "ArrowUp":
            modelDef.position.z -= moveStep;
            break;
        case "ArrowDown":
            modelDef.position.z += moveStep;
            break;
        case "ArrowLeft":
            modelDef.position.x -= moveStep;
            break;
        case "ArrowRight":
            modelDef.position.x += moveStep;
            break;
        case "KeyR":
            modelDef.position.y += moveStep * 0.5;
            break;
        case "KeyF":
            modelDef.position.y -= moveStep * 0.5;
            break;
        case "KeyQ":
            modelDef.rotationDegrees.y -= rotStep;
            break;
        case "KeyE":
            modelDef.rotationDegrees.y += rotStep;
            break;
        case "KeyZ":
            modelDef.scale = Math.max(0.05, (modelDef.scale || 1) - scaleStep);
            break;
        case "KeyX":
            modelDef.scale = Math.min(20, (modelDef.scale || 1) + scaleStep);
            break;
        default:
            return false;
    }

    applyModelTransform(targetRoot, modelDef);
    return true;
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

function getWeaponScaleByName(weaponName) {
    switch (weaponName) {
        case "SMG":
            return WEAPON_MODEL_SCALE * 0.50;
        case "Pistol":
            return WEAPON_MODEL_SCALE * 0.50;
        case "Shotgun":
            return WEAPON_MODEL_SCALE * 0.50;
        case "Sniper":
            return WEAPON_MODEL_SCALE * 0.50;
        default:
            return WEAPON_MODEL_SCALE;
    }
}

function getLocalWeaponOffsetByName(weaponName) {
    switch (weaponName) {
        case "SMG":
            return { x: WEAPON_MODEL_LOCAL_X + 0.20, y: WEAPON_MODEL_LOCAL_Y - 0.08, z: WEAPON_MODEL_LOCAL_Z - 0.12 };
        case "Pistol":
            return { x: WEAPON_MODEL_LOCAL_X + 0.20, y: WEAPON_MODEL_LOCAL_Y - 0.08, z: WEAPON_MODEL_LOCAL_Z - 0.12 };
        case "Shotgun":
            return { x: WEAPON_MODEL_LOCAL_X + 0.20, y: WEAPON_MODEL_LOCAL_Y - 0.08, z: WEAPON_MODEL_LOCAL_Z - 0.12 };
        case "Sniper":
            return { x: WEAPON_MODEL_LOCAL_X + 0.20, y: WEAPON_MODEL_LOCAL_Y - 0.08, z: WEAPON_MODEL_LOCAL_Z - 0.12 };
        default:
            return { x: WEAPON_MODEL_LOCAL_X + 0.14, y: WEAPON_MODEL_LOCAL_Y - 0.06, z: WEAPON_MODEL_LOCAL_Z - 0.10 };
    }
}

function getHipViewModelPosByWeapon(weaponName) {
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

function getRemoteWeaponAnchorOffsetByName(weaponName) {
    return REMOTE_WEAPON_HAND_OFFSETS[weaponName] || REMOTE_WEAPON_HAND_OFFSETS.default;
}

function getRemoteWeaponMuzzleLiftByName(weaponName) {
    return REMOTE_WEAPON_MUZZLE_LIFT[weaponName] ?? REMOTE_WEAPON_MUZZLE_LIFT.default;
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
    const weaponScale = getWeaponScaleByName(player.weapon);
    const previousPath = remotePlayerWeaponModelPaths.get(player.id);
    const weaponAnchor = ensureWeaponAnchor(root, player);

    if (previousPath === weaponPath && weaponAnchor.children.length > 0) {
        return;
    }

    remotePlayerWeaponModelPaths.set(player.id, weaponPath);

    loadWeaponTemplate(weaponPath)
        .then(template => {
            const weaponModel = template.clone(true);
            weaponModel.rotation.set(WEAPON_MODEL_ROT_X, WEAPON_MODEL_ROT_Y, WEAPON_MODEL_ROT_Z);
            normalizeWeaponModel(weaponModel, weaponScale);
            weaponModel.position.set(WEAPON_MODEL_LOCAL_X, WEAPON_MODEL_LOCAL_Y, WEAPON_MODEL_LOCAL_Z);
            weaponModel.traverse(node => {
                if (!node.isMesh) {
                    return;
                }
                if (Array.isArray(node.material)) {
                    node.material = node.material.map(material => material?.clone?.() ?? material);
                } else if (node.material?.clone) {
                    node.material = node.material.clone();
                }
                // Prevent incorrect frustum culling from hiding remote weapons at oblique angles.
                node.frustumCulled = false;
                node.renderOrder = 32;
                if (Array.isArray(node.material)) {
                    for (const material of node.material) {
                        if (!material) {
                            continue;
                        }
                        material.depthTest = true;
                        material.depthWrite = true;
                        material.transparent = false;
                        material.needsUpdate = true;
                    }
                } else if (node.material) {
                    node.material.depthTest = true;
                    node.material.depthWrite = true;
                    node.material.transparent = false;
                    node.material.needsUpdate = true;
                }
                if (node.geometry) {
                    node.geometry.computeBoundingSphere();
                    node.geometry.computeBoundingBox();
                }
            });
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
    const weaponScale = getWeaponScaleByName(self.weapon);
    const localWeaponOffset = getLocalWeaponOffsetByName(self.weapon);
    localWeaponOffsetX = localWeaponOffset.x;
    localWeaponOffsetY = localWeaponOffset.y;
    localWeaponOffsetZ = localWeaponOffset.z;
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
            model.rotation.set(WEAPON_MODEL_ROT_X, WEAPON_MODEL_ROT_Y, WEAPON_MODEL_ROT_Z);
            normalizeWeaponModel(model, weaponScale);
            model.position.set(localWeaponOffsetX, localWeaponOffsetY, localWeaponOffsetZ);
            model.traverse(node => {
                if (!node.isMesh || !node.material) {
                    return;
                }
                if (Array.isArray(node.material)) {
                    node.material = node.material.map(material => material?.clone?.() ?? material);
                } else if (node.material.clone) {
                    node.material = node.material.clone();
                }
                node.frustumCulled = false;
                node.renderOrder = 50;
                if (Array.isArray(node.material)) {
                    for (const material of node.material) {
                        if (!material) {
                            continue;
                        }
                        // First-person weapon should not clip into player body/world.
                        material.depthTest = false;
                        material.depthWrite = false;
                        material.needsUpdate = true;
                    }
                } else {
                    // First-person weapon should not clip into player body/world.
                    node.material.depthTest = false;
                    node.material.depthWrite = false;
                    node.material.needsUpdate = true;
                }
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
    const targetHipPos = getHipViewModelPosByWeapon(self?.weapon);
    const targetPos = adsWeight > 0.5 ? VIEWMODEL_ADS_POS : targetHipPos;
    const targetRot = adsWeight > 0.5 ? VIEWMODEL_ADS_ROT : VIEWMODEL_HIP_ROT;

    localViewModelPivot.position.lerp(targetPos, VIEWMODEL_BLEND_SPEED);
    localViewModelPivot.rotation.x += (targetRot.x - localViewModelPivot.rotation.x) * VIEWMODEL_BLEND_SPEED;
    localViewModelPivot.rotation.y += (targetRot.y - localViewModelPivot.rotation.y) * VIEWMODEL_BLEND_SPEED;
    localViewModelPivot.rotation.z += (targetRot.z - localViewModelPivot.rotation.z) * VIEWMODEL_BLEND_SPEED;

    if (localViewModelObject) {
        const recoilOffset = Math.min(1, state.recoilKick / 18);
        const adsOffsetWeight = state.ads ? 1 : 0;
        const targetWeaponX = localWeaponOffsetX + ADS_WEAPON_OFFSET_X * adsOffsetWeight;
        const targetWeaponY = localWeaponOffsetY + ADS_WEAPON_OFFSET_Y * adsOffsetWeight;
        const targetWeaponZ = localWeaponOffsetZ + ADS_WEAPON_OFFSET_Z * adsOffsetWeight;

        localViewModelObject.position.x += (targetWeaponX - localViewModelObject.position.x) * VIEWMODEL_BLEND_SPEED;
        localViewModelObject.position.z += ((targetWeaponZ - recoilOffset * 0.22) - localViewModelObject.position.z) * VIEWMODEL_BLEND_SPEED;
        localViewModelObject.position.y += ((targetWeaponY + recoilOffset * 0.06) - localViewModelObject.position.y) * VIEWMODEL_BLEND_SPEED;
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
        remotePlayerLastShotAt.set(player.id, performance.now());
    }
    const nowMs = performance.now();
    const lastShotAt = remotePlayerLastShotAt.get(player.id) ?? -1e12;
    const adsActive = Boolean(player.ads);
    const shootingActive = Boolean(player.shooting);
    const shootingRecently = adsActive || (nowMs - lastShotAt <= REMOTE_WEAPON_IDLE_TO_BACK_DELAY_MS);
    const prevCombatBlend = remotePlayerWeaponCombatBlend.get(player.id) ?? 0;
    const targetCombatBlend = shootingRecently ? 1 : 0;
    const blendRate = targetCombatBlend > prevCombatBlend
        ? REMOTE_WEAPON_COMBAT_BLEND_IN
        : REMOTE_WEAPON_COMBAT_BLEND_OUT;
    let combatBlend = prevCombatBlend + (targetCombatBlend - prevCombatBlend) * blendRate;
    if (adsActive || shotDetected) {
        combatBlend = 1;
    }
    remotePlayerWeaponCombatBlend.set(player.id, combatBlend);

    const shouldBackMount = combatBlend < 0.45 || !rig?.armRight;
    const bodyMountParent = rig?.armRight?.parent || root;
    const inBackMount = remotePlayerWeaponInBackMount.get(player.id) ?? false;
    if (shouldBackMount !== inBackMount) {
        if (shouldBackMount) {
            bodyMountParent.add(weaponAnchor);
            weaponAnchor.position.set(REMOTE_BACK_POS_X, REMOTE_BACK_POS_Y, REMOTE_BACK_POS_Z);
            weaponAnchor.rotation.set(REMOTE_BACK_ROT_X, REMOTE_BACK_ROT_Y, REMOTE_BACK_ROT_Z);
        } else if (rig?.armRight) {
            rig.armRight.add(weaponAnchor);
            const remoteAnchorOffset = getRemoteWeaponAnchorOffsetByName(player.weapon);
            weaponAnchor.position.set(remoteAnchorOffset.x, remoteAnchorOffset.y, remoteAnchorOffset.z);
            weaponAnchor.rotation.set(0, 0, 0);
        }
        remotePlayerWeaponInBackMount.set(player.id, shouldBackMount);
    } else if (shouldBackMount && weaponAnchor.parent !== bodyMountParent) {
        bodyMountParent.add(weaponAnchor);
        weaponAnchor.position.set(REMOTE_BACK_POS_X, REMOTE_BACK_POS_Y, REMOTE_BACK_POS_Z);
        weaponAnchor.rotation.set(REMOTE_BACK_ROT_X, REMOTE_BACK_ROT_Y, REMOTE_BACK_ROT_Z);
    } else if (!shouldBackMount && rig?.armRight && weaponAnchor.parent !== rig.armRight) {
        rig.armRight.add(weaponAnchor);
        const remoteAnchorOffset = getRemoteWeaponAnchorOffsetByName(player.weapon);
        weaponAnchor.position.set(remoteAnchorOffset.x, remoteAnchorOffset.y, remoteAnchorOffset.z);
        weaponAnchor.rotation.set(0, 0, 0);
    }

    const runSwayPos = STABLE_BLOCK_WALK
        ? 0
        : (gaitWeight > 0.02 ? Math.sin(phase * 6.2) * WEAPON_RUN_SWAY_POS * gaitWeight : 0);
    const runSwayRot = STABLE_BLOCK_WALK
        ? 0
        : (gaitWeight > 0.02 ? Math.sin(phase * 3.6) * WEAPON_RUN_SWAY_ROT * gaitWeight : 0);

    const targetYaw = 0;
    const pitchFromShot = WEAPON_IDLE_PITCH * (1 - raise) + WEAPON_RAISED_PITCH * raise;
    const shotWeight = Math.min(1, Math.max(0, raise * 1.35 + recoil * 0.45));
    let combatWeight = Math.min(1, Math.max(0, combatBlend * (0.25 + shotWeight * 0.75)));
    const adsWeight = player.ads ? 1 : 0;
    const aimingNow = adsActive || shootingActive || shotDetected;
    if (aimingNow) {
        combatWeight = 1;
    }
    const weaponMuzzleLift = getRemoteWeaponMuzzleLiftByName(player.weapon);
    const aimStabilized = aimingNow ? 1 : 0;
    const swayFactor = 1 - aimStabilized;
    const liftFactor = 1 - aimStabilized;
    const combatPitch = pitchFromShot
        - (player.pitch || 0) * 0.95
        + (STABLE_BLOCK_WALK ? 0 : runLean * 0.2 * swayFactor)
        + (STABLE_BLOCK_WALK ? 0 : pitchLean * 0.12 * swayFactor)
        + recoil * WEAPON_RECOIL_PITCH
        + runSwayRot * swayFactor
        - weaponMuzzleLift * (0.6 + 0.4 * adsWeight) * liftFactor;
    const targetPitch = REMOTE_WEAPON_LOWERED_PITCH * (1 - combatWeight) + combatPitch * combatWeight;

    const nextYaw = lerpAngle(current.yaw, targetYaw, WEAPON_AIM_SMOOTHING);
    const nextPitch = lerpAngle(current.pitch, targetPitch, WEAPON_AIM_SMOOTHING);

    const currentWeaponRot = remotePlayerWeaponRot.get(player.id) || { yaw: 0, pitch: 0 };
    const smoothWeaponYaw = lerpAngle(currentWeaponRot.yaw, nextYaw, 0.24);
    const smoothWeaponPitch = lerpAngle(currentWeaponRot.pitch, nextPitch, 0.24);
    remotePlayerWeaponAim.set(player.id, { yaw: nextYaw, pitch: nextPitch });
    remotePlayerWeaponRot.set(player.id, { yaw: smoothWeaponYaw, pitch: smoothWeaponPitch });
    if (shouldBackMount) {
        weaponAnchor.rotation.x += (REMOTE_BACK_ROT_X - weaponAnchor.rotation.x) * 0.16;
        weaponAnchor.rotation.y += (REMOTE_BACK_ROT_Y - weaponAnchor.rotation.y) * 0.16;
        weaponAnchor.rotation.z += (REMOTE_BACK_ROT_Z - weaponAnchor.rotation.z) * 0.16;
    } else {
        weaponAnchor.rotation.z = 0;
        weaponAnchor.rotation.y = smoothWeaponYaw;
        weaponAnchor.rotation.x = smoothWeaponPitch;
    }
    const remoteAnchorOffset = getRemoteWeaponAnchorOffsetByName(player.weapon);
    const basePosX = rig?.armRight ? remoteAnchorOffset.x : 12.2;
    const basePosY = rig?.armRight ? remoteAnchorOffset.y : CHARACTER_HEIGHT * 0.69;
    const basePosZ = rig?.armRight ? remoteAnchorOffset.z : 5.8;
    const loweredPosX = basePosX;
    const loweredPosY = basePosY;
    const loweredPosZ = basePosZ;
    const combatPosX = basePosX;
    const combatPosY = basePosY;
    const combatPosZ = basePosZ;
    if (shouldBackMount) {
        weaponAnchor.position.x += (REMOTE_BACK_POS_X - weaponAnchor.position.x) * 0.16;
        weaponAnchor.position.y += (REMOTE_BACK_POS_Y - weaponAnchor.position.y) * 0.16;
        weaponAnchor.position.z += (REMOTE_BACK_POS_Z - weaponAnchor.position.z) * 0.16;
    } else {
        weaponAnchor.position.x = loweredPosX * (1 - combatWeight) + combatPosX * combatWeight;
        weaponAnchor.position.y = loweredPosY * (1 - combatWeight) + combatPosY * combatWeight;
        weaponAnchor.position.z = loweredPosZ * (1 - combatWeight) + combatPosZ * combatWeight;
    }

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
    label.textContent = player.name;
    label.style.left = `${screenX}px`;
    label.style.top = `${screenY}px`;
}

function syncObstacles() {
    if (!RENDER_COLLISION_OBSTACLES) {
        if (obstacleGroup.children.length > 0) {
            obstacleGroup.clear();
            applyWallhackState();
        }
        return;
    }

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

    applyWallhackState();
}

function applyModelTransform(root, modelDef) {
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
    const objScaleMultiplier = (modelDef.path || "").toLowerCase().endsWith(".obj")
        ? (modelDef.objScaleMultiplier ?? OBJ_WORLD_SCALE)
        : 1;

    root.scale.set(
        scale.x * objScaleMultiplier,
        scale.y * objScaleMultiplier,
        scale.z * objScaleMultiplier
    );

    // Only lift if geometry dips below terrain; do not force everything to ground.
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    if (Number.isFinite(box.min.y)) {
        if (box.min.y < 0) {
            root.position.y += -box.min.y;
        }
        // Keep every model slightly above ground to avoid depth fighting with terrain.
        root.position.y += MODEL_GROUND_EPSILON;
        // Add tiny deterministic per-model bias to reduce coplanar prop z-fighting.
        root.position.y += computeCoplanarBias(modelDef);
        root.updateMatrixWorld(true);
    }

    root.traverse(node => {
        if (!node.isMesh) {
            return;
        }
        node.castShadow = false;
        node.receiveShadow = false;

        const applyMaterialTuning = material => {
            if (!material) {
                return;
            }
            if (material.map) {
                material.map.wrapS = THREE.RepeatWrapping;
                material.map.wrapT = THREE.RepeatWrapping;
                material.map.colorSpace = THREE.SRGBColorSpace;
                if (state.textureFilter === "crisp") {
                    material.map.generateMipmaps = false;
                    material.map.magFilter = THREE.NearestFilter;
                    material.map.minFilter = THREE.NearestFilter;
                } else {
                    material.map.generateMipmaps = true;
                    material.map.magFilter = THREE.LinearFilter;
                    material.map.minFilter = THREE.LinearMipmapLinearFilter;
                }
                material.map.anisotropy = resolveAnisotropyLevel();
                material.map.needsUpdate = true;
            }
            if (material.color) {
                material.color.setRGB(1, 1, 1);
            }
            const name = (material.name || "").toLowerCase();
            const isFoliage = name.includes("tree") || name.includes("leaf") || name.includes("foliage");
            const isRoadLike = name.includes("asphalt") || name.includes("road") || name.includes("pavement") || name.includes("tile");
            // Use alpha cutout (not blended transparency) for stable depth and less flicker.
            material.transparent = false;
            material.alphaTest = isFoliage ? 0.5 : 0;
            material.depthWrite = true;
            material.side = (isFoliage || isRoadLike) ? THREE.DoubleSide : THREE.FrontSide;
            // Alpha-to-coverage can shimmer on weaker GPUs or without MSAA.
            material.alphaToCoverage = false;
            material.depthTest = true;
            // Stabilize coplanar surfaces (roads/tiles/foliage planes) to reduce z-fighting flicker.
            const needsDepthBias = isFoliage || isRoadLike;
            material.polygonOffset = needsDepthBias;
            material.polygonOffsetFactor = needsDepthBias ? -1 : 0;
            material.polygonOffsetUnits = needsDepthBias ? -1 : 0;
            material.needsUpdate = true;
        };

        if (Array.isArray(node.material)) {
            node.material.forEach(applyMaterialTuning);
        } else {
            applyMaterialTuning(node.material);
        }
    });
}

function loadObjModel(modelDef, onLoaded, targetGroup = worldModelGroup) {
    function cloneTemplateWithUniqueMaterials(template) {
        const clone = template.clone(true);
        clone.traverse(node => {
            if (!node.isMesh || !node.material) {
                return;
            }
            if (Array.isArray(node.material)) {
                node.material = node.material.map(material => material?.clone?.() ?? material);
            } else if (node.material.clone) {
                node.material = node.material.clone();
            }
        });
        return clone;
    }

    function getObjTemplatePromise() {
        const cacheKey = `${modelDef.path}|${modelDef.mtlPath || ""}`;
        if (objTemplatePromiseCache.has(cacheKey)) {
            return objTemplatePromiseCache.get(cacheKey);
        }

        const promise = new Promise(resolve => {
            const mtlPath = modelDef.mtlPath || modelDef.path.replace(/\.obj$/i, ".mtl");
            const lastSlashIndex = mtlPath.lastIndexOf("/");
            const mtlDir = lastSlashIndex >= 0 ? mtlPath.slice(0, lastSlashIndex + 1) : "/";
            const mtlFile = lastSlashIndex >= 0 ? mtlPath.slice(lastSlashIndex + 1) : mtlPath;
            const localMtlLoader = new MTLLoader();
            localMtlLoader.setMaterialOptions({
                wrap: THREE.RepeatWrapping,
                side: THREE.FrontSide
            });
            localMtlLoader.setPath(mtlDir);
            localMtlLoader.setResourcePath(mtlDir);
            localMtlLoader.load(
                mtlFile,
                materials => {
                    materials.preload();
                    const localObjLoader = new OBJLoader();
                    localObjLoader.setMaterials(materials);
                    localObjLoader.load(
                        modelDef.path,
                        obj => resolve(obj),
                        undefined,
                        () => resolve(null)
                    );
                },
                undefined,
                () => {
                    const localObjLoader = new OBJLoader();
                    localObjLoader.load(
                        modelDef.path,
                        obj => resolve(obj),
                        undefined,
                        () => resolve(null)
                    );
                }
            );
        });

        objTemplatePromiseCache.set(cacheKey, promise);
        return promise;
    }

    void getObjTemplatePromise().then(template => {
        if (!template) {
            createMissingModelPlaceholder(modelDef);
            return;
        }
        const obj = cloneTemplateWithUniqueMaterials(template);
        applyModelTransform(obj, modelDef);
        obj.userData.modelPath = modelDef.path || "";
        targetGroup.add(obj);
        if (onLoaded) {
            onLoaded(obj);
        }
    });
}

function loadWorldModel(modelDef, onLoaded, targetGroup = worldModelGroup) {
    const path = (modelDef.path || "").toLowerCase();
    if (path.endsWith(".obj")) {
        loadObjModel(modelDef, onLoaded, targetGroup);
        return;
    }

    gltfLoader.load(
        modelDef.path,
        gltf => {
            const root = gltf.scene;
            applyModelTransform(root, modelDef);
            root.userData.modelPath = modelDef.path || "";
            targetGroup.add(root);
            if (onLoaded) {
                onLoaded(root);
            }
        },
        undefined,
        () => {
            createMissingModelPlaceholder(modelDef);
        }
    );
}

function applyWorldSceneConfig(sceneConfig) {
    let modelDefs = Array.isArray(sceneConfig.models) ? sceneConfig.models : [];
    const primitiveDefs = Array.isArray(sceneConfig.primitives) ? sceneConfig.primitives : [];
    if (sceneConfig.autoPopulateAllObjs) {
        const spacingX = 260;
        const spacingZ = 260;
        const columns = 12;
        const startX = 420;
        const startZ = 420;
        const generatedDefs = ALL_OBJ_MODEL_FILES.slice(0, PERFORMANCE_AUTOGRID_LIMIT).map((fileName, index) => {
            const col = index % columns;
            const row = Math.floor(index / columns);
            return {
                enabled: true,
                path: `/models/${fileName}`,
                position: { x: startX + col * spacingX, y: 0, z: startZ + row * spacingZ },
                rotationDegrees: { y: (index % 4) * 90 },
                scale: 1.0
            };
        });
        modelDefs = [...modelDefs, ...generatedDefs];
    }

    worldPrimitiveGroup.clear();
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

    editorSceneModels = [];
    clearEditorSelectionHighlight();
    cancelEditorDraft();
    clearInstancedWorldModels();
    worldModelGroup.clear();

    for (const modelDef of modelDefs) {
        if (modelDef.enabled === false) {
            continue;
        }

        if (!modelDef.path) {
            continue;
        }

        const normalizedModelDef = {
            enabled: true,
            path: modelDef.path,
            position: {
                x: modelDef.position?.x ?? 0,
                y: modelDef.position?.y ?? 0,
                z: modelDef.position?.z ?? 0
            },
            rotationDegrees: {
                y: modelDef.rotationDegrees?.y ?? 0
            },
            scale: typeof modelDef.scale === "number" ? modelDef.scale : 1
        };
        const nextIndex = editorSceneModels.length;
        editorSceneModels.push(normalizedModelDef);
        loadWorldModel(normalizedModelDef, root => {
            root.userData.editorModelIndex = nextIndex;
            root.userData.modelPath = normalizedModelDef.path || "";
            rebuildInstancedWorldModels();
        });
    }

    retuneWorldMaterials();
    applyWallhackState();
    rebuildInstancedWorldModels();
}

async function syncWorldSceneIfNeeded(force = false) {
    const now = performance.now();
    if (!force && now - lastWorldSceneSyncAtMs < WORLD_SCENE_SYNC_INTERVAL_MS) {
        return;
    }
    if (worldSceneSyncInFlight) {
        return;
    }
    worldSceneSyncInFlight = true;
    lastWorldSceneSyncAtMs = now;

    try {
        const response = await fetch("/world/scene.json", { cache: "no-store" });
        if (!response.ok) {
            return;
        }
        const sceneText = await response.text();
        if (!force && sceneText === worldSceneSignature) {
            return;
        }
        worldSceneSignature = sceneText;
        const sceneConfig = JSON.parse(sceneText);
        applyWorldSceneConfig(sceneConfig);
        worldSceneLoaded = true;
    } catch (_error) {
    } finally {
        worldSceneSyncInFlight = false;
    }
}

async function loadWorldScene() {
    if (worldSceneLoaded) {
        return;
    }

    await syncWorldSceneIfNeeded(true);
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

        const crouchVisualOffset = player.crouching ? -14 : 0;
        root.position.set(player.x, (player.z || 0) + bobAmount + crouchVisualOffset, player.y);
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
        remotePlayerWeaponCombatBlend.delete(playerId);
        remotePlayerWeaponInBackMount.delete(playerId);
        remotePlayerLastShotAt.delete(playerId);

        const label = remotePlayerLabels.get(playerId);
        if (label) {
            label.remove();
            remotePlayerLabels.delete(playerId);
        }
    }
}

function syncBullets() {
    const activeBulletIds = new Set();

    for (const bullet of getRenderableBullets()) {
        activeBulletIds.add(bullet.id);

        let container = bulletVisuals.get(bullet.id);
        if (!container) {
            container = createBulletVisual();
            bulletVisuals.set(bullet.id, container);
            bulletGroup.add(container);
        }

        container.position.set(
            bullet.x,
            Math.max(2, bullet.z || 2),
            bullet.y
        );
        container.lookAt(
            bullet.x + (bullet.velocityX || 0),
            Math.max(2, (bullet.z || 2) + (bullet.velocityZ || 0)),
            bullet.y + (bullet.velocityY || 0)
        );
    }

    for (const [bulletId, visual] of bulletVisuals.entries()) {
        if (activeBulletIds.has(bulletId)) {
            continue;
        }
        bulletGroup.remove(visual);
        bulletVisuals.delete(bulletId);
    }
}


function createBulletVisual() {
    const container = new THREE.Group();

    const core = new THREE.Mesh(
        new THREE.CylinderGeometry(BULLET_RADIUS, BULLET_RADIUS * 0.92, BULLET_LENGTH, 8),
        new THREE.MeshStandardMaterial({
            color: 0xffffff,
            emissive: 0xfacc15,
            emissiveIntensity: 1.6,
            roughness: 0.08,
            metalness: 0.85
        })
    );
    core.rotation.x = Math.PI / 2;
    core.renderOrder = 42;
    container.add(core);

    const glow = new THREE.Mesh(
        new THREE.CylinderGeometry(BULLET_RADIUS * 1.7, BULLET_RADIUS * 1.5, BULLET_LENGTH * 0.92, 8),
        new THREE.MeshBasicMaterial({
            color: 0xf59e0b,
            transparent: true,
            opacity: 0.35,
            depthWrite: false
        })
    );
    glow.rotation.x = Math.PI / 2;
    glow.renderOrder = 43;
    container.add(glow);

    const trail = new THREE.Mesh(
        new THREE.CylinderGeometry(BULLET_RADIUS * 0.6, BULLET_RADIUS * 1.35, BULLET_TRAIL_LENGTH, 8),
        new THREE.MeshBasicMaterial({
            color: 0xfb923c,
            transparent: true,
            opacity: 0.24,
            depthWrite: false
        })
    );
    trail.rotation.x = Math.PI / 2;
    trail.position.z = -BULLET_TRAIL_LENGTH * 0.72;
    trail.renderOrder = 41;
    container.add(trail);

    return container;
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
    const eyeY = (self.crouching ? CAMERA_CROUCH_EYE_HEIGHT : CAMERA_EYE_HEIGHT) + (self.z || 0);
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

export function getRendererPerfStats() {
    const memory = renderer.info?.memory || {};
    const renderInfo = renderer.info?.render || {};
    return {
        dpr: renderer.getPixelRatio(),
        calls: renderInfo.calls || 0,
        triangles: renderInfo.triangles || 0,
        lines: renderInfo.lines || 0,
        points: renderInfo.points || 0,
        geometries: memory.geometries || 0,
        textures: memory.textures || 0
    };
}

export async function toggleEditorMode() {
    state.editorMode = !state.editorMode;
    if (state.editorMode) {
        await ensureEditorModelCatalog();
        mouse.down = false;
        state.ads = false;
        ensureEditorPreview();
        updateWorldModelRenderMode();
    }
    updateEditorHud();
    if (!state.editorMode) {
        clearEditorSelectionHighlight();
        cancelEditorDraft();
        clearEditorPreview();
        rebuildInstancedWorldModels();
    }
}

export function cycleEditorModel(direction) {
    if (!state.editorMode || editorModelCatalog.length === 0) {
        return;
    }
    editorModelCursor = (editorModelCursor + direction + editorModelCatalog.length) % editorModelCatalog.length;
    updateEditorHud();
    ensureEditorPreview();
}

export function editorHandleCanvasClick(clientX, clientY, options = {}) {
    if (!state.editorMode) {
        return false;
    }
    const rect = canvas.getBoundingClientRect();
    const pointerX = typeof clientX === "number" ? (clientX - rect.left) : mouse.x;
    const pointerY = typeof clientY === "number" ? (clientY - rect.top) : mouse.y;
    const ndc = getEditorPointerNdc(pointerX, pointerY);
    const selectOnly = Boolean(options.selectOnly);

    if (editorDraftModel && editorDraftRoot) {
        clearEditorSelectionHighlight();
        const placement = resolveEditorPlacementPoint(ndc);
        if (!placement) {
            return true;
        }
        editorDraftModel.position.x = placement.x;
        editorDraftModel.position.y = placement.y;
        editorDraftModel.position.z = placement.z;
        applyModelTransform(editorDraftRoot, editorDraftModel);
        return true;
    }

    if (!selectOnly) {
        clearEditorSelectionHighlight();
        const placement = resolveEditorPlacementPoint(ndc);
        if (!placement) {
            return true;
        }

        const path = editorModelCatalog[editorModelCursor];
        if (!path) {
            return true;
        }
        editorDraftModel = {
            enabled: true,
            path,
            position: {
                x: placement.x,
                y: placement.y,
                z: placement.z
            },
            rotationDegrees: { y: 0 },
            scale: 1
        };
        clearEditorPreview();
        loadWorldModel(editorDraftModel, root => {
            editorDraftRoot = root;
            applyDraftVisual(root);
        });
        return true;
    }

    editorRaycaster.setFromCamera(ndc, camera3d);
    const modelHits = editorRaycaster.intersectObjects(worldModelGroup.children, true);
    if (modelHits.length > 0) {
        const uniqueRoots = [];
        const seen = new Set();
        for (const hit of modelHits) {
            const root = getEditorTopLevelRoot(hit.object);
            if (!root || seen.has(root.uuid)) {
                continue;
            }
            seen.add(root.uuid);
            uniqueRoots.push(root);
        }

        if (uniqueRoots.length > 0) {
            const pickSignature = uniqueRoots.map(root => root.uuid).join("|");
            const cycleRequested = Boolean(options.cycleSelection);

            if (!cycleRequested || pickSignature !== editorLastPickSignature) {
                editorLastPickSignature = pickSignature;
                editorLastPickRoots = uniqueRoots;
                editorLastPickCursor = 0;
            } else {
                editorLastPickCursor = (editorLastPickCursor + 1) % editorLastPickRoots.length;
            }

            const topRoot = editorLastPickRoots[editorLastPickCursor];
            if (topRoot && typeof topRoot.userData.editorModelIndex === "number") {
                if (!cycleRequested && topRoot === selectedEditorRoot) {
                    clearEditorSelectionHighlight();
                    return true;
                }
                setEditorSelection(topRoot, topRoot.userData.editorModelIndex);
                return true;
            }
        }
    }

    clearEditorSelectionHighlight();
    return true;
}

export function editorHandleKeyDown(event) {
    if (!state.editorMode) {
        return false;
    }

    if (editorDraftModel && editorDraftRoot) {
        const transformedDraft = applyEditorTransformByKey(event.code, editorDraftModel, editorDraftRoot);
        if (transformedDraft) {
            return true;
        }
    }

    if (event.code === "Enter") {
        if (editorDraftModel && editorDraftRoot) {
            clearDraftVisual(editorDraftRoot);
            const nextIndex = editorSceneModels.length;
            editorSceneModels.push(editorDraftModel);
            editorDraftRoot.userData.editorModelIndex = nextIndex;
            clearEditorSelectionHighlight();
            editorDraftModel = null;
            editorDraftRoot = null;
            ensureEditorPreview();
            return true;
        }
        return false;
    }

    if (event.code === "Escape") {
        if (editorDraftModel || editorDraftRoot) {
            cancelEditorDraft();
            return true;
        }
        return false;
    }

    if (event.code === "Delete" || event.code === "Backspace") {
        if (editorDraftModel || editorDraftRoot) {
            cancelEditorDraft();
            return true;
        }
        if (selectedEditorRoot && selectedEditorModelIndex >= 0) {
            worldModelGroup.remove(selectedEditorRoot);
            editorSceneModels.splice(selectedEditorModelIndex, 1);
            for (const child of worldModelGroup.children) {
                if (typeof child.userData.editorModelIndex === "number" && child.userData.editorModelIndex > selectedEditorModelIndex) {
                    child.userData.editorModelIndex -= 1;
                }
            }
            clearEditorSelectionHighlight();
        }
        return true;
    }

    if (event.code === "KeyL") {
        if (selectedEditorModelIndex >= 0) {
            const source = editorSceneModels[selectedEditorModelIndex];
            if (source) {
                const duplicate = {
                    ...source,
                    position: {
                        x: (source.position?.x ?? 0) + 80,
                        y: source.position?.y ?? 0,
                        z: (source.position?.z ?? 0) + 80
                    },
                    rotationDegrees: { y: source.rotationDegrees?.y ?? 0 }
                };
                const nextIndex = editorSceneModels.length;
                editorSceneModels.push(duplicate);
                loadWorldModel(duplicate, root => {
                    root.userData.editorModelIndex = nextIndex;
                    setEditorSelection(root, nextIndex);
                });
            }
        }
        return true;
    }

    return applyEditorTransformByKey(event.code);
}

export async function saveEditorScene() {
    const payload = {
        version: 1,
        models: editorSceneModels,
        primitives: []
    };
    const response = await fetch("/api/world/scene", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });
    if (!response.ok) {
        throw new Error(`Save failed: ${response.status}`);
    }
}

export function clearEditorSceneModels() {
    cancelEditorDraft();
    clearEditorSelectionHighlight();
    clearInstancedWorldModels();
    worldModelGroup.clear();
    editorSceneModels = [];
    editorLastPickSignature = "";
    editorLastPickRoots = [];
    editorLastPickCursor = 0;
    if (state.editorMode) {
        ensureEditorPreview();
        updateWorldModelRenderMode();
    } else {
        clearEditorPreview();
        rebuildInstancedWorldModels();
    }
}

function updateEditorPreviewPosition() {
    if (!state.editorMode || !editorPreviewRoot || editorDraftRoot) {
        return;
    }
    const ndc = getEditorPointerNdc();
    const placement = resolveEditorPlacementPoint(ndc);
    if (!placement) {
        return;
    }
    editorPreviewRoot.position.x = placement.x;
    editorPreviewRoot.position.y = placement.y;
    editorPreviewRoot.position.z = placement.z;
}

export function render() {
    if (!worldSceneLoaded) {
        void loadWorldScene();
    } else {
        void syncWorldSceneIfNeeded(false);
    }

    syncObstacles();
    syncRemotePlayers();
    syncBullets();
    updateEditorPreviewPosition();
    const self = state.editorMode ? null : getSelfPlayer();
    syncLocalViewModel(self);
    updateLocalViewModel(self);
    localViewModelPivot.visible = !state.editorMode;
    localBodyPivot.visible = !state.editorMode && !state.ads;
    updateCameraFromSelf();
    renderer.render(scene, camera3d);
}

resizeCanvas();
