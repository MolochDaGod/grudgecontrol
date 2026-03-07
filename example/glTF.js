import {
    ACESFilmicToneMapping,
    AmbientLight,
    EquirectangularReflectionMapping,
    Mesh,
    MeshBasicMaterial,
    PerspectiveCamera,
    Scene,
    SphereGeometry,
    Vector3,
    WebGLRenderer,
} from "three";
import { MapControls } from "three/examples/jsm/Addons.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { playerController } from "../src/playerController";
import { GUI } from 'three/examples/jsm/libs/lil-gui.module.min.js';
import Stats from 'three/examples/jsm/libs/stats.module.js';
import { CSM } from "three/examples/jsm/csm/CSM.js";
import { CSMHelper } from "three/examples/jsm/csm/CSMHelper.js"

let player;
const scene = new Scene();

let camera;
let renderer;
let controls;
let gltfLoader;
let guiParams = null;
let raycastSphere = null;

let stats = null;
let csm = null;
let csmHelper = null;

const modelUrl = "./glb/burnout_revenge_-_central_route_crash_junction.glb";

const pos = new Vector3(21.5, 4, 15);

// 人物模型配置
const PLAYER_MODELS = {
    person1: {
        url: "./glb/person1.glb",
        scale: 0.001,
        idleAnim: "idle1",
        walkAnim: "walk",
        runAnim: "run",
        jumpAnim: "jump",
        flyAnim: "flying",
        flyIdleAnim: "flyidle",
        enterCarAnim: "enterCar",
        exitCarAnim: "exitCar",
        headObjName: "mixamorigHead",
        rotateY: Math.PI,
    },
    person2: {
        url: "./glb/person2.glb",
        scale: 0.001,
        idleAnim: "idle1",
        walkAnim: "walk",
        runAnim: "run",
        jumpAnim: "jump",
        flyAnim: "flying",
        flyIdleAnim: "flyidle",
        enterCarAnim: "enterCar",
        exitCarAnim: "exitCar",
        headObjName: "mixamorigHead",
        rotateY: Math.PI,
    },
    person3: {
        url: "./glb/person3.glb",
        scale: 0.005,
        idleAnim: "idle",
        walkAnim: "walk",
        runAnim: "run",
        jumpAnim: "jump",
        flyAnim: "flying",
        flyIdleAnim: "flyidle",
        enterCarAnim: "enterCar",
        exitCarAnim: "exitCar",
        headObjName: "mixamorigHead",
        rotateY: Math.PI,
    },
};

// 车辆配置
const VEHICLE_CONFIGS = {
    bugatti: {
        url: "./glb/bugatti.glb",
        scale: 0.1,
        wheelsNames: ["Wheel_LF", "Wheel_RF", "Wheel_LR", "Wheel_RR"],
        animations: { openDoorAnim: "openDoorLF" },
        boardingPoint: new Vector3(0.5, 0, 1.8),
        seatOffset: new Vector3(0, 0.6, 0),
        chassisRatio: 0.15,
        suspensionRestLengthRatio: 0.2,
    },
    landRover: {
        url: "./glb/landRover.glb",
        scale: 0.115,
        wheelsNames: ["WheelFL", "WheelFR", "WheelBL", "WheelBR"],
        animations: { openDoorAnim: "opendoor" },
        boardingPoint: new Vector3(0.8, 0, 1.5),
        seatOffset: new Vector3(0, 0.5, 0),
        chassisRatio: 0.4,
        suspensionRestLengthRatio: 0.2,
    },
    tesla: {
        url: "./glb/tesla2.glb",
        scale: 0.115,
        position: new Vector3(80, 80, 80),
        wheelsNames: ["WHEEL_LF", "WHEEL_RF", "WHEEL_LR", "WHEEL_RR"],
        animations: { openDoorAnim: "opendoor" },
        boardingPoint: new Vector3(0.7, 0, 1.3),
        seatOffset: new Vector3(0.1, 0.4, 0),
        chassisRatio: 0.4,
        suspensionRestLengthRatio: 0.2,
        followVehicleDirection: false,
    },
};

init();

function isMobileDevice() {
    return (navigator.maxTouchPoints && navigator.maxTouchPoints > 0) || "ontouchstart" in window || /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function setupCSMMaterial(material) {
    if (!material || !csm) return;
    const mats = Array.isArray(material) ? material : [material];
    mats.forEach((m) => csm.setupMaterial(m));
}

async function init() {
    const cont = document.querySelector("#container");

    // 渲染器
    renderer = new WebGLRenderer({ antialias: true });
    renderer.setSize(cont.clientWidth, cont.clientHeight);
    // renderer.shadowMap.enabled = !isMobileDevice();
    renderer.shadowMap.enabled = true;
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.setAnimationLoop(animate);
    cont.appendChild(renderer.domElement);

    // 相机
    camera = new PerspectiveCamera(60, cont.clientWidth / cont.clientHeight, 0.01, 1000);
    camera.position.copy(pos);
    camera.lookAt(pos.x, pos.y, pos.z + 1);

    // 控制器
    controls = new MapControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.maxDistance = 2000;
    controls.dampingFactor = 0.1;
    controls.rotateSpeed = 1;
    controls.maxPolarAngle = Math.PI / 2;
    controls.target.set(pos.x, pos.y, pos.z + 1);

    const maxTextureSize = renderer.capabilities.maxTextureSize;
    const shadowMapSize = Math.min(2048, maxTextureSize);
    // 级联阴影
    csm = new CSM({
        maxFar: 30, // 阴影最远渲染距离
        cascades: 3, // 级联层数
        mode: "practical", // 分割算法
        parent: scene,
        shadowMapSize: shadowMapSize,
        shadowBias: -0.00001,
        lightDirection: new Vector3(-1, -2, -1).normalize(),
        lightIntensity: 10,
        lightNear: 0.1, // 光源视锥近裁剪面
        lightFar: 50, // 光源视锥远裁剪面
        camera: camera,
        fade: true, // 级联边界淡入淡出过渡
        lightMargin: 30, // 光源包围盒扩展余量
    });
    csm.lights.forEach((light, index) => {
        const biasMult = Math.pow(2, index);
        light.shadow.bias = -0.0001 * biasMult;
        light.shadow.normalBias = 0.002 * biasMult;
    });

    // 环境光
    const ambient = new AmbientLight(0xffffff, 5);
    scene.add(ambient);

    // 背景
    new HDRLoader().load(
        "./img/1.hdr",
        (texture) => {
            texture.mapping = EquirectangularReflectionMapping;
            scene.background = texture;
        },
        undefined,
        (err) => console.warn("HDR 加载失败：", err)
    );

    // 帧率显示
    stats = new Stats();
    Object.assign(stats.dom.style, {
        position: "fixed",
        bottom: "0",
        left: "0",
        top: "auto",
        zIndex: "9998",
    });
    document.body.appendChild(stats.dom);

    // 射线交点可视化小球
    const sphereGeo = new SphereGeometry(0.05, 16, 16);
    const sphereMat = new MeshBasicMaterial({ color: 0x00ffff, opacity: 0.8, transparent: true, depthTest: false });
    raycastSphere = new Mesh(sphereGeo, sphereMat);
    raycastSphere.visible = false;
    raycastSphere.renderOrder = 999;
    scene.add(raycastSphere);

    // 加载场景
    initGltfLoader();
    await initGLBScene(modelUrl);
    renderer.render(scene, camera);

    // 人物控制器
    player = playerController();
    await player.init({
        scene,
        camera,
        controls,
        playerModel: PLAYER_MODELS.person1,
        initPos: pos,
        minCamDistance: 50,
        maxCamDistance: 220,
        enableOverShoulderView: true,
    });

    // 阴影
    player.getPerson()?.traverse((child) => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            setupCSMMaterial(child.material);
        }
    });

    // 调试
    initGUI();

    window.addEventListener("resize", onWindowResize, false);

    // 关闭加载页面
    window.hideLoader();
}

// 初始化glb加载器
function initGltfLoader() {
    gltfLoader = new GLTFLoader();
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath("https://unpkg.com/three@0.180.0/examples/jsm/libs/draco/");
    gltfLoader.setDRACOLoader(dracoLoader);
    const ktx2Loader = new KTX2Loader();
    ktx2Loader.setTranscoderPath("https://unpkg.com/three@0.180.0/examples/jsm/libs/basis/");
    ktx2Loader.detectSupport(renderer);
    gltfLoader.setKTX2Loader(ktx2Loader);
}

// 加载场景
async function initGLBScene(url) {
    try {
        const gltf = await gltfLoader.loadAsync(url);
        const model = gltf.scene;
        model.name = "sceneGLB";
        model.scale.set(10, 10, 10);
        model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                setupCSMMaterial(child.material);
            }
        });
        scene.add(model);
    } catch (e) {
        console.error("GLB 加载失败：", e);
    }
}

// 每帧调用
function animate() {
    if (player) {
        player.update();
        updateCenterRaycast();
    } else {
        controls.update();
    }

    csm?.update();
    csmHelper?.update();

    renderer.render(scene, camera);

    stats?.update();

}

// 更新中心射线交点
function updateCenterRaycast() {
    if (!guiParams?.centerRaycast) return;
    const hit = player.getCenterScreenRaycastHit();
    if (hit) {
        raycastSphere.position.copy(hit.point);
        raycastSphere.visible = true;
    } else {
        raycastSphere.visible = false;
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(window.devicePixelRatio * 1);
}

// 调试
function initGUI() {
    const gui = new GUI({ title: "Debug Panel", width: 280 });
    Object.assign(gui.domElement.style, {
        position: "fixed",
        top: "12px",
        right: "12px",
        zIndex: "9999",
    });

    ["pointerdown", "mousedown", "click"].forEach((type) => {
        gui.domElement.addEventListener(type, (e) => e.stopPropagation());
    });

    const params = {
        playerModel: "person1",
        vehicleType: "bugatti",
        showFPS: true,
        mouseSensitivity: 5,
        gravity: -2400,
        jumpHeight: 600,
        playerSpeed: 300,
        playerFlySpeed: 2100,
        minCamDistance: 50,
        maxCamDistance: 220,
        thirdMouseMode: 1,
        enableZoom: false,
        debug: false,
        enableOverShoulderView: true,
        centerRaycast: false,
        // playerScale: 1,
    };

    const defaults = { ...params };

    gui.add(params, "playerModel", Object.keys(PLAYER_MODELS))
        .name("Player Model")
        .onChange(async (v) => {
            await player.switchPlayerModel(PLAYER_MODELS[v]);
            player.getPerson()?.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                    setupCSMMaterial(child.material);
                }
            });
        });

    const vehicleFolder = gui.addFolder("Add Vehicle");
    ["pointerdown", "mousedown", "click"].forEach((type) => {
        vehicleFolder.domElement.addEventListener(type, (e) => e.stopPropagation());
    });

    vehicleFolder.add(params, "vehicleType", Object.keys(VEHICLE_CONFIGS)).name("Vehicle Type");

    const spawnController = vehicleFolder.add(
        {
            spawn: async () => {
                if (player.getAllVehicles().length >= 5) {
                    alert("For performance reasons, the demo supports a maximum of 5 vehicles.");
                    return;
                }

                const cfg = VEHICLE_CONFIGS[params.vehicleType];
                if (!cfg) return;
                const playerPos = player.getPosition();

                // 取相机朝向的水平分量，沿该方向偏移生成车辆
                const camDir = new Vector3();
                camera.getWorldDirection(camDir);
                camDir.y = 0;
                camDir.normalize();

                const spawnPos = playerPos.clone().addScaledVector(camDir, 0.5);
                spawnPos.y = playerPos.y;

                await player.loadVehicleModel({ ...cfg, position: spawnPos });
                player.getAllVehicles().at(-1)?.vehicleGroup?.traverse((child) => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                        setupCSMMaterial(child.material);
                        // 设置金属材质
                        child.material.metalness = 0.8;
                        child.material.roughness = 0.0;
                    }
                });
            },
        },
        "spawn"
    ).name("Spawn Vehicle");

    ["pointerdown", "mousedown", "click"].forEach((type) => {
        spawnController.domElement.addEventListener(type, (e) => e.stopPropagation());
    });

    gui.add(params, "showFPS").name("Show FPS")
        .onChange((v) => {
            if (v) {
                stats.dom.style.display = "block";
            } else {
                stats.dom.style.display = "none";
            }
        });

    gui.add(params, "mouseSensitivity", 1, 20, 0.1).onChange((v) => player.setMouseSensitivity(v));
    gui.add(params, "gravity", -6000, 0, 50).onChange((v) => player.setGravity(v));
    gui.add(params, "jumpHeight", 0, 2000, 10).onChange((v) => player.setJumpHeight(v));
    gui.add(params, "playerSpeed", 0, 1000, 10).onChange((v) => player.setPlayerSpeed(v));
    gui.add(params, "playerFlySpeed", 0, 5000, 10).onChange((v) => player.setPlayerFlySpeed(v));
    gui.add(params, "minCamDistance", 0, 200, 1).onChange((v) => player.setMinCamDistance(v));
    gui.add(params, "maxCamDistance", 50, 1000, 1).onChange((v) => player.setMaxCamDistance(v));
    gui.add(params, "thirdMouseMode", { 0: 0, 1: 1, 2: 2, 3: 3 }).onChange((v) => player.setThirdMouseMode(Number(v)));
    gui.add(params, "enableZoom").onChange((v) => player.setEnableZoom(v));
    gui.add(params, "debug").onChange((v) => player.setDebug(v));
    gui.add(params, "enableOverShoulderView").onChange((v) => player.setOverShoulderView(v));
    gui.add(params, "centerRaycast").name("Center Raycast Debug")
        .onChange((v) => { if (!v) raycastSphere.visible = false; });
    // gui.add(params, "playerScale", 0.001, 0.005, 0.0001)
    //     .name("Player Scale")
    //     .onChange((v) => player.setPlayerScale(v, params.playerScaleDuration));

    const resetController = gui.add(
        {
            resetToDefault: () => {
                Object.assign(params, defaults);
                gui.controllers.forEach((c) => c.updateDisplay());
                gui.folders.forEach((f) => f.controllers.forEach((c) => c.updateDisplay()));

                player.setMouseSensitivity(defaults.mouseSensitivity);
                player.setGravity(defaults.gravity);
                player.setJumpHeight(defaults.jumpHeight);
                player.setPlayerSpeed(defaults.playerSpeed);
                player.setPlayerFlySpeed(defaults.playerFlySpeed);
                player.setMinCamDistance(defaults.minCamDistance);
                player.setMaxCamDistance(defaults.maxCamDistance);
                player.setThirdMouseMode(defaults.thirdMouseMode);
                player.setEnableZoom(defaults.enableZoom);
                player.setDebug(defaults.debug);
                player.setOverShoulderView(defaults.enableOverShoulderView);
                raycastSphere.visible = false;

                if (stats) stats.dom.style.display = "none";
            },
        },
        "resetToDefault"
    ).name("Reset to Default");

    ["pointerdown", "mousedown", "click"].forEach((type) => {
        resetController.domElement.addEventListener(type, (e) => e.stopPropagation());
    });

    // gui.add({ csmDebug: false }, "csmDebug").name("CSM Debug").onChange((v) => {
    //     if (v) {
    //         csmHelper = new CSMHelper(csm);
    //         csmHelper.displayFrustum = true;
    //         csmHelper.displayPlanes = true;
    //         scene.add(csmHelper);
    //         console.log('csmHelper', csmHelper);
    //     } else {
    //         if (csmHelper) { scene.remove(csmHelper); csmHelper = null; }
    //     }
    // });

    guiParams = params;
}