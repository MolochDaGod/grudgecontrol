import { ACESFilmicToneMapping, AmbientLight, DirectionalLight, EquirectangularReflectionMapping, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from "three";
import { MapControls } from "three/examples/jsm/Addons.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { playerController } from "../src/playerController";

let player;
const scene = new Scene();

let camera;
let renderer;
let controls;
let gltfLoader;

const modelUrl = "./glb/burnout_revenge_-_central_route_crash_junction.glb";

const pos = new Vector3(21.5, 4, 15);

// 判断是否移动端
function isMobileDevice() {
    return (navigator.maxTouchPoints && navigator.maxTouchPoints > 0) || "ontouchstart" in window || /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

init();

async function init() {
    const cont = document.querySelector("#container");
    // 渲染器
    renderer = new WebGLRenderer({ antialias: true });
    renderer.setSize(cont.clientWidth, cont.clientHeight);
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.shadowMap.enabled = !isMobileDevice();
    renderer.setAnimationLoop(animate);
    cont.appendChild(renderer.domElement);

    // 相机
    camera = new PerspectiveCamera(70, cont.clientWidth / cont.clientHeight, 0.01, 1000);
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

    // 平行光
    const light = new DirectionalLight(0xffffff, 8);
    light.position.set(50, 50, 50);
    light.target.position.set(0, 0, 0);
    light.castShadow = true;
    light.shadow.camera.top = 40;
    light.shadow.camera.bottom = -40;
    light.shadow.camera.left = -40;
    light.shadow.camera.right = 40;
    light.shadow.mapSize.width = 5120;
    light.shadow.mapSize.height = 5120;
    light.shadow.bias = -0.0005;
    light.shadow.camera.near = 0;
    light.shadow.camera.far = 100;
    scene.add(light);
    scene.add(light.target);
    // 环境光
    const ambient = new AmbientLight(0xffffff, 4);
    scene.add(ambient);

    // 背景
    new HDRLoader().load(
        "./img/1.hdr",
        (texture) => {
            texture.mapping = EquirectangularReflectionMapping;
            scene.background = texture;
        },
        undefined,
        (err) => {
            console.warn("HDR 加载失败：", err);
        }
    );

    // 加载场景
    initGltfLoader();
    await initGLBScene(modelUrl);

    // 首次渲染
    renderer.render(scene, camera);

    // 初始化玩家控制器
    player = playerController();
    await player.init({
        scene,
        camera,
        controls,
        playerModel: {
            url: "./glb/person.glb",
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
        initPos: pos,
        minCamDistance: 50,
        maxCamDistance: 250,
        thirdMouseMode: 1,
    });

    await player.loadVehicleModel({
        url: "./glb/bugatti.glb",
        scale: 0.1,
        position: new Vector3(22, 3.69, 14.5),
        wheelsNames: [
            "Wheel_LF", // 前左
            "Wheel_RF", // 前右
            "Wheel_LR", // 后左
            "Wheel_RR", // 后右
        ],
        animations: {
            openDoorAnim: "openDoorLF",
        },
        boardingPoint: new Vector3(0.5, 0, 1.8),
        seatOffset: new Vector3(0, 0.6, 0),
        chassisRatio: 0.15,
        suspensionRestLengthRatio: 0.2,
    });

    // 开启人物 车辆模型阴影
    player.getPerson()?.traverse((child) => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });
    player.getAllVehicles().forEach((v) => {
        v.vehicleGroup?.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
    });

    window.addEventListener("resize", onWindowResize, false);
}
// GLTF加载器
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

// 加载GLB
async function initGLBScene(url) {
    try {
        const gltf = await gltfLoader.loadAsync(url);
        const model = gltf.scene;
        model.name = "sceneGLB";
        model.scale.set(10, 10, 10);
        model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true; // 接收阴影
            }
        });
        scene.add(model);
    } catch (e) {
        console.error("GLB 加载失败：", e);
    }
}

function animate() {
    if (player) {
        player.update(); // 更新玩家
    } else {
        controls.update();
    }
    renderer.render(scene, camera);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(window.devicePixelRatio * 1);
}
