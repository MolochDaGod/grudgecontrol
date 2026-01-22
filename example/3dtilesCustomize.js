import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import Stats from "three/examples/jsm/libs/stats.module.js";
import { TilesRenderer } from "3d-tiles-renderer";
import { playerController } from "../src/playerController";

let camera, scene, renderer, controls, stats;
let tiles = null;
let player = null;
let hasLoadedTiles = false;

const overlay = document.getElementById("overlay");
const tilesUrlInput = document.getElementById("tilesUrlInput");
const confirmBtn = document.getElementById("confirmBtn");
const loadingOverlay = document.getElementById("loadingOverlay");
const hud = document.getElementById("hud");

init();

function init() {
    const container = document.getElementById("container");
    scene = new THREE.Scene();

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.shadowMap.enabled = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.6;
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setAnimationLoop(animate);
    container.appendChild(renderer.domElement);

    stats = new Stats();
    const statsDom = stats.dom;
    statsDom.style.position = "absolute";
    statsDom.style.top = "0";
    statsDom.style.right = "0";
    statsDom.style.left = "auto";
    container.appendChild(statsDom);

    camera = new THREE.PerspectiveCamera(70, container.clientWidth / container.clientHeight, 0.01, 1000);
    camera.position.set(10, 10, 10);
    camera.lookAt(new THREE.Vector3(0, 0, 0));

    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 0);
    controls.enablePan = false;
    controls.maxDistance = 1000;

    const light = new THREE.DirectionalLight(0xffffff, 3);
    light.position.set(25, 40, 25);
    light.target.position.set(0, 0, 0);
    light.castShadow = true;
    light.shadow.camera.top = 35;
    light.shadow.camera.bottom = -35;
    light.shadow.camera.left = -35;
    light.shadow.camera.right = 35;
    light.shadow.mapSize.width = 5120;
    light.shadow.mapSize.height = 5120;
    light.shadow.camera.near = 30;
    light.shadow.camera.far = 75;
    light.shadow.bias = -0.0005;
    scene.add(light);

    const ambient = new THREE.AmbientLight(0xffffff, 5);
    scene.add(ambient);

    new HDRLoader().load(
        "./img/1.hdr",
        (texture) => {
            texture.mapping = THREE.EquirectangularReflectionMapping;
            scene.background = texture;
        },
        undefined,
        (err) => {}
    );

    window.addEventListener("resize", onWindowResize, false);
    confirmBtn.addEventListener("click", () => confirmUrl());
    tilesUrlInput.addEventListener("keyup", (e) => {
        if (e.key === "Enter") confirmUrl();
    });
}

async function confirmUrl() {
    const url = tilesUrlInput.value.trim();
    if (!url) return;

    overlay.style.display = "none";
    loadingOverlay.style.display = "flex";

    if (!hasLoadedTiles) {
        try {
            await initTiles(url);
            await initPlayer();
            hasLoadedTiles = true;
            hud.style.display = "block";
        } catch (e) {
            console.error("加载 tiles 失败", e);
            overlay.style.display = "flex";
        } finally {
            loadingOverlay.style.display = "none";
        }
    } else {
        loadingOverlay.style.display = "none";
    }
}

async function initTiles(url) {
    tiles = new TilesRenderer(url);
    scene.add(tiles.group);

    tiles.setCamera(camera);
    tiles.setResolutionFromRenderer(camera, renderer);

    const gltfLoader = new GLTFLoader();
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath("https://unpkg.com/three@0.180.0/examples/jsm/libs/draco/");
    gltfLoader.setDRACOLoader(dracoLoader);
    const ktx2Loader = new KTX2Loader();
    ktx2Loader.setTranscoderPath("https://unpkg.com/three@0.180.0/examples/jsm/libs/basis/");
    ktx2Loader.detectSupport(renderer);
    gltfLoader.setKTX2Loader(ktx2Loader);

    tiles.manager.addHandler(/\.(gltf|glb)$/g, gltfLoader);
    tiles.errorTarget = 4;
    tiles.lruCache.maxSize = 8000;
    tiles.lruCache.maxBytesSize = 4 * 2 ** 30;
    tiles.group.name = "tiles";

    tiles.addEventListener("load-model", onLoadModel);
    function onLoadModel({ scene }) {
        scene.traverse((c) => {
            if (c.isMesh) {
                c.castShadow = true;
                c.receiveShadow = true;
            }
        });
    }

    let loadedTileSetHandled = false;
    const tileSetLoaded = new Promise((resolve) => {
        const loadTileSet = () => {
            if (!tiles) return;
            if (loadedTileSetHandled) {
                tiles.removeEventListener("load-tileset", loadTileSet);
                resolve();
                return;
            }
            const scale = 1;
            const sphere = new THREE.Sphere();
            tiles.getBoundingSphere(sphere);
            const center = sphere.center.clone();
            const radius = sphere.radius;
            const offset = new THREE.Vector3(0, Math.min(radius * scale, 900), 0);
            const root = tiles.root;

            let m = [1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0];
            if (root?.children?.length > 1 && root?.children[0].content?.uri?.includes("tileset.json")) {
                if (root?.children[0]?.children) {
                    m = root?.children[0]?.children[0]?.transform;
                    loadedTileSetHandled = true;
                }
            } else {
                m = root.transform;
                loadedTileSetHandled = true;
            }

            const rotationMat3 = new THREE.Matrix3().set(m[0], m[1], m[2], m[8], m[9], m[10], -m[4], -m[5], -m[6]);
            const rotationMat4 = new THREE.Matrix4().setFromMatrix3(rotationMat3);

            const translationMatrix1 = new THREE.Matrix4().makeTranslation(center.x, center.y, center.z);
            const translationMatrix2 = new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z);
            const scaleMatrix = new THREE.Matrix4().makeScale(scale, scale, scale);
            let finalMatrix = new THREE.Matrix4().multiplyMatrices(translationMatrix1, scaleMatrix.clone().multiply(rotationMat4)).multiply(translationMatrix2);

            const moveToOrigin = new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z);
            finalMatrix = moveToOrigin.multiply(finalMatrix);

            tiles.group.matrix.copy(finalMatrix);
            tiles.group.matrixAutoUpdate = false;
            tiles.group.updateMatrixWorld(true);

            renderer.render(scene, camera);

            controls.target.set(0, 0, 0);
            camera.position.copy(offset);
            camera.lookAt(0, 0, 0);
            camera.updateProjectionMatrix();
        };

        tiles?.addEventListener("load-tileset", loadTileSet);
    });
    await tileSetLoaded;

    const tilesLoadEnd = new Promise((resolve) => {
        const loadEnd = () => {
            tiles?.removeEventListener("tiles-load-end", loadEnd);
            resolve();
        };
        tiles?.addEventListener("tiles-load-end", loadEnd);
    });

    await tilesLoadEnd;
}

async function initPlayer() {
    player = playerController();
    const pos = new THREE.Vector3(0, 0, 0);
    renderer.render(scene, camera);
    await player.init({
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
    });
}

function animate() {
    if (tiles) {
        tiles.setResolutionFromRenderer(camera, renderer);
        tiles.setCamera(camera);
        camera.updateMatrixWorld();
        tiles.update();
    }
    if (player) player.update();
    if (stats) stats.update();
    renderer.render(scene, camera);
}

function onWindowResize() {
    if (!camera || !renderer) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.updateProjectionMatrix();
}
