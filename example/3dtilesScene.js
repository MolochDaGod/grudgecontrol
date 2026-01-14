import { TilesRenderer } from "3d-tiles-renderer";
import { CesiumIonAuthPlugin } from "3d-tiles-renderer/core/plugins";
import {
  GLTFExtensionsPlugin,
  ReorientationPlugin,
  TileCompressionPlugin,
  TilesFadePlugin,
} from "3d-tiles-renderer/plugins";
import {
  ACESFilmicToneMapping,
  AmbientLight,
  DirectionalLight,
  EquirectangularReflectionMapping,
  MathUtils,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";
import { playerController } from "../src/playerController";

let player = null;

let camera;
let controls;
let tiles;
let renderer;
let scene;

init();

function init() {
  scene = new Scene();

  // 渲染器
  renderer = new WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.6;
  renderer.setAnimationLoop(animate);
  document.body.appendChild(renderer.domElement);

  // 相机
  camera = new PerspectiveCamera(
    70,
    window.innerWidth / window.innerHeight,
    0.01,
    10000
  );
  camera.position.set(1e3, 1e3, 1e3).multiplyScalar(0.5);

  // 控制器
  controls = new OrbitControls(camera, renderer.domElement);

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

  // 3DTiles
  reinstantiateTiles();

  initPlayer();

  // 窗口大小监听
  onWindowResize();
  window.addEventListener("resize", onWindowResize, false);
}

function initPlayer() {
  player = playerController();
  const pos = new Vector3(100, 100, 100);
  renderer.render(scene, camera);
  player.init({
    scene,
    camera,
    controls,
    playerModel: {
      url: "./glb/person.glb",
      scale: 0.01,
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
    colliderMeshUrl: "./glb/EiffelCollider.glb",
  });
}

function reinstantiateTiles() {
  tiles = new TilesRenderer();
  const apiToken =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJmMzgwMGY3ZS1jOTMwLTQyNmQtOTkyNS03MDE4ZjlkYmY0MTYiLCJpZCI6MjIzMDk3LCJpYXQiOjE3MTg3NjgwNTN9.FcpK7jiFPzWZL8m6VxRbG7ly8LMecpXnDAMZJX_UehM";
  tiles.registerPlugin(
    new CesiumIonAuthPlugin({
      apiToken: apiToken,
      assetId: "2275207",
      autoRefreshToken: true,
    })
  );
  tiles.registerPlugin(new TileCompressionPlugin());
  tiles.registerPlugin(new TilesFadePlugin());
  tiles.registerPlugin(
    new GLTFExtensionsPlugin({
      dracoLoader: new DRACOLoader().setDecoderPath(
        "https://unpkg.com/three@0.153.0/examples/jsm/libs/draco/gltf/"
      ),
    })
  );
  tiles.registerPlugin(
    new ReorientationPlugin({
      lat: 48.8584 * MathUtils.DEG2RAD,
      lon: 2.2945 * MathUtils.DEG2RAD,
    })
  );

  scene.add(tiles.group);
  tiles.setResolutionFromRenderer(camera, renderer);
  tiles.setCamera(camera);
}

function animate() {
  if (!tiles) return;

  tiles.setResolutionFromRenderer(camera, renderer);
  tiles.setCamera(camera);
  camera.updateMatrixWorld();
  tiles.update();

  if (player) player.update();

  renderer.render(scene, camera);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  renderer.setSize(window.innerWidth, window.innerHeight);

  camera.updateProjectionMatrix();
  renderer.setPixelRatio(window.devicePixelRatio);
  tiles.setResolutionFromRenderer(camera, renderer);
}
