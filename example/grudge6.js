import * as THREE from "three";
import { MapControls } from "three/examples/jsm/controls/MapControls.js";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";
import { playerController } from "../src/playerController";
import { GRUDGE_CHARACTERS, buildPlayerModelConfig } from "./grudge/grudgeRoster.js";

let player;
let activeCharId = "human";

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d0f14);
scene.fog = new THREE.Fog(0x0d0f14, 40, 120);

const container = document.querySelector("#container");
const loadStatus = document.querySelector("#load-status");
const loadingEl = document.querySelector("#loading");
const charList = document.querySelector("#char-list");

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
container.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(55, container.clientWidth / container.clientHeight, 0.1, 500);
camera.position.set(0, 8, 14);

const controls = new MapControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI / 2.05;
controls.minDistance = 4;
controls.maxDistance = 60;
controls.target.set(0, 2, 0);

// Ground + showcase terrain
const groundGeo = new THREE.PlaneGeometry(80, 80, 1, 1);
const groundMat = new THREE.MeshStandardMaterial({ color: 0x1a2030, roughness: 0.92, metalness: 0.05 });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const grid = new THREE.GridHelper(80, 40, 0x3a4558, 0x222a38);
grid.position.y = 0.02;
scene.add(grid);

// Decorative platforms for collision testing
const platformMat = new THREE.MeshStandardMaterial({ color: 0x2a3348, roughness: 0.8, metalness: 0.1 });
const platforms = [
    { pos: [8, 1.5, -6], size: [6, 3, 6] },
    { pos: [-10, 2.5, 4], size: [5, 5, 5] },
    { pos: [0, 4, -14], size: [8, 8, 4] },
];
for (const p of platforms) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...p.size), platformMat);
    mesh.position.set(...p.pos);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
}

// Lighting
const hemi = new THREE.HemisphereLight(0xb8c8e8, 0x1a1420, 0.55);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xffe8c8, 1.4);
sun.position.set(18, 28, 12);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 80;
sun.shadow.camera.left = -30;
sun.shadow.camera.right = 30;
sun.shadow.camera.top = 30;
sun.shadow.camera.bottom = -30;
scene.add(sun);

// Character picker UI
function renderCharList() {
    charList.innerHTML = "";
    for (const ch of GRUDGE_CHARACTERS) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `char-btn${ch.id === activeCharId ? " active" : ""}`;
        btn.innerHTML = `
            <span class="char-swatch" style="background:${ch.color}"></span>
            <span class="char-meta">
                <span class="char-name">${ch.name}</span>
                <span class="char-faction">${ch.faction}</span>
            </span>`;
        btn.addEventListener("click", () => switchCharacter(ch.id));
        charList.appendChild(btn);
    }
}

async function switchCharacter(id) {
    const ch = GRUDGE_CHARACTERS.find((c) => c.id === id);
    if (!ch || !player || id === activeCharId) return;
    activeCharId = id;
    renderCharList();
    loadStatus.textContent = `Switching to ${ch.name}…`;
    loadingEl.classList.remove("hidden");
    try {
        await player.switchPlayerModel(buildPlayerModelConfig(ch));
    } catch (err) {
        console.error(err);
        loadStatus.textContent = `Failed to load ${ch.name}`;
        return;
    }
    loadingEl.classList.add("hidden");
}

async function init() {
    renderCharList();

    const hdr = new HDRLoader();
    try {
        const tex = await hdr.loadAsync("./img/1.hdr");
        tex.mapping = THREE.EquirectangularReflectionMapping;
        scene.environment = tex;
    } catch {
        // HDR optional for showcase
    }

    const startChar = GRUDGE_CHARACTERS.find((c) => c.id === activeCharId);
    loadStatus.textContent = `Loading ${startChar.name}…`;

    player = new playerController();
    await player.init({
        scene,
        camera,
        controls,
        playerModelConfig: buildPlayerModelConfig(startChar),
        initPos: new THREE.Vector3(0, 2, 0),
        staticCollider: scene,
        enableSpringCamera: true,
        springCameraTime: 0.06,
        thirdMouseMode: 1,
        minCamDistance: 80,
        maxCamDistance: 320,
    });

    loadingEl.classList.add("hidden");
    renderer.setAnimationLoop(animate);
}

function animate() {
    player.update();
    renderer.render(scene, camera);
}

function onResize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
}

window.addEventListener("resize", onResize);
init().catch((err) => {
    console.error(err);
    loadStatus.textContent = "Failed to initialize showcase";
});