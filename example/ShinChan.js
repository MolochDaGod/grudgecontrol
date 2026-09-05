import {
    ACESFilmicToneMapping,
    AmbientLight,
    EquirectangularReflectionMapping,
    PerspectiveCamera,
    Scene,
    Vector3,
    WebGLRenderer,
} from "three";
import { MapControls } from "three/examples/jsm/Addons.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";
import { playerController } from "../src/playerController";
import Stats from 'three/examples/jsm/libs/stats.module.js';
import { CSM } from "three/examples/jsm/csm/CSM.js";

let player;
let fallResetThreshold = -Infinity;
const scene = new Scene();

let camera;
let renderer;
let controls;
let gltfLoader;
let stats = null;
let csm = null;

// CSM baseline params
const CSM_BASE = { maxFar: 30, lightNear: 0.1, lightFar: 50, lightMargin: 30, lightIntensity: 10 };

const modelUrl = "./glb/crayon_shin-chan_nohara_house.glb";
const pos = new Vector3(3, 0.4, -1);

init();

function setupCSMMaterial(material) {
    if (!material || !csm) return;
    const mats = Array.isArray(material) ? material : [material];
    mats.forEach((m) => csm.setupMaterial(m));
}

function createCSM(shadowMapSize, scale) {
    const c = new CSM({
        maxFar: CSM_BASE.maxFar * scale,
        cascades: 3,
        mode: "practical",
        parent: scene,
        shadowMapSize,
        shadowBias: -0.00001,
        lightDirection: new Vector3(-1, -2, -1).normalize(),
        lightIntensity: CSM_BASE.lightIntensity,
        lightNear: CSM_BASE.lightNear * scale,
        lightFar: CSM_BASE.lightFar * scale,
        camera,
        fade: true,
        lightMargin: CSM_BASE.lightMargin * scale,
    });
    c.lights.forEach((light, index) => {
        const biasMult = Math.pow(2, index);
        light.shadow.bias = -0.0001 * biasMult;
        light.shadow.normalBias = 0.002 * biasMult;
    });
    return c;
}

async function init() {
    const cont = document.querySelector("#container");

    // Renderer
    renderer = new WebGLRenderer({ antialias: true });
    renderer.setSize(cont.clientWidth, cont.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.setAnimationLoop(animate);
    cont.appendChild(renderer.domElement);

    // Camera
    camera = new PerspectiveCamera(60, cont.clientWidth / cont.clientHeight, 0.01, 1000);
    camera.position.copy(pos);
    camera.lookAt(pos.x, pos.y, pos.z + 1);

    // Controls
    controls = new MapControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.maxDistance = 2000;
    controls.dampingFactor = 0.1;
    controls.rotateSpeed = 1;
    controls.maxPolarAngle = Math.PI / 2;
    controls.target.set(pos.x, pos.y, pos.z + 1);

    const maxTextureSize = renderer.capabilities.maxTextureSize;
    const shadowMapSize = Math.min(2048, maxTextureSize);
    // Cascaded shadows
    csm = createCSM(shadowMapSize, 1);
    csm.lights.forEach((light, index) => {
        const biasMult = Math.pow(2, index);
        light.shadow.bias = -0.0001 * biasMult;
        light.shadow.normalBias = 0.002 * biasMult;
    });

    // Ambient light
    const ambient = new AmbientLight(0xffffff, 3);
    scene.add(ambient);

    // Background
    new HDRLoader().load(
        "./img/1.hdr",
        (texture) => {
            texture.mapping = EquirectangularReflectionMapping;
            scene.background = texture;
        },
        undefined,
        (err) => console.warn("HDR load failed:", err)
    );

    // FPS display
    stats = new Stats();
    Object.assign(stats.dom.style, {
        position: "fixed",
        bottom: "0",
        left: "0",
        top: "auto",
        zIndex: "9998",
    });
    document.body.appendChild(stats.dom);

    // Load scene
    initGltfLoader();
    await initGLBScene(modelUrl);
    renderer.render(scene, camera);

    // Player controller
    player = new playerController();
    await player.init({
        scene,
        camera,
        controls,
        playerModelConfig: {
            url: "./glb/ShinChan.glb",
            scale: 0.005,
            idleAnim: "idle",
            walkAnim: "walk",
            runAnim: "run",
            jumpAnim: "jump",
            flyAnim: "flying",
            flyIdleAnim: "flyidle",
            enterCarAnim: "enterCar",
            exitCarAnim: "exitCar",
            headBoneName: "mixamorigHead",
            rotateY: Math.PI,
            capsuleRadiusRatio: 1.3,
            firstPersonCameraOffset: [0, 220, 250],
        },
        initPos: pos,
        minCamDistance: 50,
        maxCamDistance: 220,
        enableOverShoulderView: true,

    });

    // Shadows
    player.getPlayerModel()?.traverse((child) => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            setupCSMMaterial(child.material);
        }
    });

    window.addEventListener("resize", onWindowResize, false);

    // Compute fall-reset threshold
    const collider = player.getCollider();
    if (collider?.geometry?.boundingBox) {
        const s = player.playerModelConfig.scale;
        fallResetThreshold = collider.geometry.boundingBox.min.y - player.playerCapsuleHeight * s * 3;
    }

    // Hide loading overlay
    window.hideLoader();
}

// Init GLB loader
function initGltfLoader() {
    gltfLoader = new GLTFLoader();
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath("https://unpkg.com/three@0.180.0/examples/jsm/libs/draco/");
    gltfLoader.setDRACOLoader(dracoLoader);
}

// Load scene
async function initGLBScene(url, modelScale = [1, 1, 1]) {
    try {
        const gltf = await gltfLoader.loadAsync(url);
        const model = gltf.scene;
        model.name = "sceneGLB";
        model.scale.set(...modelScale);
        model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                setupCSMMaterial(child.material);
            }
        });
        scene.add(model);
    } catch (e) {
        console.error("GLB load failed:", e);
    }
}

// Per-frame update
function animate() {
    if (player) {
        player.update();
        if (!player.isFlying && player.getPosition()?.y < fallResetThreshold) {
            player.reset();
        }
    } else {
        controls.update();
    }

    csm?.update();

    renderer.render(scene, camera);

    stats?.update();
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(window.devicePixelRatio * 1);
}
