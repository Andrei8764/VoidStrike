import * as THREE from "/vendor/three/build/three.module.js";
import { GLTFLoader } from "/vendor/three/examples/jsm/loaders/GLTFLoader.js";
import { characterPreviewCanvas, characterSelect } from "./dom.js";
import { state } from "./state.js";

let renderer = null;
let scene = null;
let camera = null;
let light = null;
let loader = null;
let currentModel = null;
let currentModelPath = null;
let animationFrameId = null;
const MODULAR_PREVIEW_FILES = [
    "/models/a_character_body.glb",
    "/models/a_character_head.glb",
    "/models/a_arm_left.glb",
    "/models/a_arm_right.glb",
    "/models/a_leg_left.glb",
    "/models/a_leg_right.glb"
];

function normalizeModel(root, targetHeight) {
    const box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3();
    box.getSize(size);

    if (size.y < 0.001) {
        return;
    }

    const scale = targetHeight / size.y;
    root.scale.setScalar(scale);

    const normalizedBox = new THREE.Box3().setFromObject(root);
    const center = new THREE.Vector3();
    normalizedBox.getCenter(center);

    root.position.x -= center.x;
    root.position.z -= center.z;
    root.position.y -= normalizedBox.min.y;
}

function createPlaceholder() {
    return new THREE.Mesh(
        new THREE.CapsuleGeometry(0.24, 0.6, 4, 8),
        new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.6, metalness: 0.1 })
    );
}

function loadPreviewModel(characterModel) {
    if (!scene || !loader) {
        return;
    }

    const path = `/models/${characterModel}`;

    if (path === currentModelPath) {
        return;
    }

    currentModelPath = path;

    if (currentModel) {
        scene.remove(currentModel);
        currentModel = null;
    }

    if (characterModel === "a_character_body.glb") {
        Promise.all(MODULAR_PREVIEW_FILES.map(file => new Promise((resolve, reject) => {
            loader.load(file, gltf => resolve(gltf.scene), undefined, reject);
        })))
            .then(parts => {
                const root = new THREE.Group();
                for (const part of parts) {
                    root.add(part.clone(true));
                }
                normalizeModel(root, 1.15);
                root.rotation.y = Math.PI / 5;
                currentModel = root;
                scene.add(root);
            })
            .catch(() => {
                currentModel = createPlaceholder();
                scene.add(currentModel);
            });
        return;
    }

    loader.load(
        path,
        gltf => {
            const root = gltf.scene;
            normalizeModel(root, 1.15);
            root.rotation.y = Math.PI / 5;
            currentModel = root;
            scene.add(root);
        },
        undefined,
        () => {
            currentModel = createPlaceholder();
            scene.add(currentModel);
        }
    );
}

function animatePreview() {
    if (!renderer || !scene || !camera) {
        return;
    }

    if (currentModel) {
        currentModel.rotation.y += 0.01;
    }

    renderer.render(scene, camera);
    animationFrameId = requestAnimationFrame(animatePreview);
}

export function initCharacterPreview() {
    if (!characterPreviewCanvas || !characterSelect) {
        return;
    }

    renderer = new THREE.WebGLRenderer({
        canvas: characterPreviewCanvas,
        antialias: true,
        alpha: true
    });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setSize(characterPreviewCanvas.clientWidth, characterPreviewCanvas.clientHeight, false);

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(
        42,
        characterPreviewCanvas.clientWidth / Math.max(characterPreviewCanvas.clientHeight, 1),
        0.01,
        100
    );
    camera.position.set(0, 0.72, 2.55);
    camera.lookAt(0, 0.62, 0);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x4b5563, 1.1);
    scene.add(hemi);

    light = new THREE.DirectionalLight(0xffffff, 0.9);
    light.position.set(2.4, 3.3, 2.2);
    scene.add(light);

    const floor = new THREE.Mesh(
        new THREE.CircleGeometry(1.2, 24),
        new THREE.MeshStandardMaterial({ color: 0x2f4f22, roughness: 0.9, metalness: 0.05 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.001;
    scene.add(floor);

    loader = new GLTFLoader();

    loadPreviewModel(state.selectedCharacterModel);

    characterSelect.addEventListener("change", () => {
        state.selectedCharacterModel = characterSelect.value;
        loadPreviewModel(state.selectedCharacterModel);
    });

    if (animationFrameId === null) {
        animatePreview();
    }
}
