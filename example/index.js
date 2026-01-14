import {
  ACESFilmicToneMapping,
  AmbientLight,
  DirectionalLight,
  EquirectangularReflectionMapping,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { playerController } from "../src/playerController";

const player = playerController();
const scene = new Scene();

let camera;
let renderer;
let controls;
let gltfLoader;

let isUpdatePlayer = false; // 是否更新玩家位置
const modelUrl = "./glb/burnout_revenge_-_central_route_crash_junction.glb";

const pos = new Vector3(21.88, 3, 10.98);

// 判断是否移动端
function isMobileDevice() {
  return (
    (navigator.maxTouchPoints && navigator.maxTouchPoints > 0) ||
    "ontouchstart" in window ||
    /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
  );
}

init();

async function init() {
  // 渲染器
  renderer = new WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.6;
  renderer.shadowMap.enabled = !isMobileDevice();
  renderer.setAnimationLoop(animate);
  document.body.appendChild(renderer.domElement);

  // 相机
  camera = new PerspectiveCamera(
    70,
    window.innerWidth / window.innerHeight,
    0.01,
    1000
  );
  camera.rotation.order = "YXZ";
  camera.position.copy(pos);
  camera.lookAt(pos.x, pos.y, pos.z + 1);

  // 控制器
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxDistance = 2000;
  controls.dampingFactor = 0.1;
  controls.rotateSpeed = 1;
  controls.maxPolarAngle = Math.PI / 2;
  controls.target.set(pos.x, pos.y, pos.z + 1);

  // 平行光
  const color = 0xffffff;
  const intensity = 10;
  const light = new DirectionalLight(color, intensity);
  light.position.set(50, 50, 50);
  light.target.position.set(0, 0, 0);
  light.castShadow = true;
  light.shadow.camera.top = 40;
  light.shadow.camera.bottom = -40;
  light.shadow.camera.left = -40;
  light.shadow.camera.right = 40;
  light.shadow.mapSize.width = 7680;
  light.shadow.mapSize.height = 7680;
  light.shadow.bias = -0.0005;
  light.shadow.camera.near = 0;
  light.shadow.camera.far = 100;
  scene.add(light);
  scene.add(light.target);
  // 环境光
  const ambient = new AmbientLight(0xffffff, 3.0);
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
  isUpdatePlayer = true; // 启用玩家更新

  // 初始化玩家控制器
  player.init({
    scene,
    camera,
    controls,
    playerModel: {
      url: "./glb/person.glb",
      scale: 0.001,
      idleAnim: "idle",
      walkAnim: "walk",
      runAnim: "run",
      jumpAnim: "jump",
      flyAnim: "flying",
      flyIdleAnim: "flyidle",
    },
    initPos: pos,
    minCamDistance: 50,
    maxCamDistance: 300,
  });

  window.addEventListener("resize", onWindowResize, false);
}
// GLTF加载器
function initGltfLoader() {
  gltfLoader = new GLTFLoader();

  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath(
    "https://unpkg.com/three@0.180.0/examples/jsm/libs/draco/"
  );
  gltfLoader.setDRACOLoader(dracoLoader);

  const ktx2Loader = new KTX2Loader();
  ktx2Loader.setTranscoderPath(
    "https://unpkg.com/three@0.180.0/examples/jsm/libs/basis/"
  );
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
  if (isUpdatePlayer) {
    if (player && typeof player.update === "function") player.update(); // 更新玩家
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
