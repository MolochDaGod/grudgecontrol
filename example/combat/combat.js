import * as THREE from "three";
import { MapControls } from "three/examples/jsm/controls/MapControls.js";
import { playerController } from "../../src/playerController";
import { GRUDGE_CHARACTERS, buildPlayerModelConfig } from "../grudge/grudgeRoster.js";

// ── DOM ──────────────────────────────────────────────────────────────────────
const container = document.querySelector("#container");
const loadingEl = document.querySelector("#loading");
const loadStatus = document.querySelector("#load-status");
const crosshair = document.querySelector("#crosshair");
const targetFrame = document.querySelector("#target-frame");
const tfName = document.querySelector("#tf-name");
const tfKind = document.querySelector("#tf-kind");
const tfHp = document.querySelector("#tf-hp");
const aliveCountEl = document.querySelector("#alive-count");
const hitCountEl = document.querySelector("#hit-count");

let hitCount = 0;

// ── Scene / renderer ─────────────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d0f14);
scene.fog = new THREE.Fog(0x0d0f14, 1500, 6000);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
container.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(55, container.clientWidth / container.clientHeight, 1, 12000);
camera.position.set(0, 300, 600);

const controls = new MapControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI / 2.05;

// ── Static world (ground + platforms) — used as the collider ─────────────────
const staticGroup = new THREE.Group();
const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(8000, 8000, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x161c28, roughness: 0.95, metalness: 0.05 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
staticGroup.add(ground);

const platMat = new THREE.MeshStandardMaterial({ color: 0x232c40, roughness: 0.85 });
for (const p of [
    { pos: [700, 90, -300], size: [400, 180, 400] },
    { pos: [-800, 150, 250], size: [360, 300, 360] },
    { pos: [200, 60, -1100], size: [700, 120, 300] },
]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(...p.size), platMat);
    m.position.set(...p.pos);
    m.castShadow = m.receiveShadow = true;
    staticGroup.add(m);
}
scene.add(staticGroup);

const grid = new THREE.GridHelper(8000, 80, 0x2a3346, 0x1b2230);
grid.position.y = 0.5;
scene.add(grid);

// ── Lighting ─────────────────────────────────────────────────────────────────
scene.add(new THREE.HemisphereLight(0xb8c8e8, 0x14101a, 0.6));
const sun = new THREE.DirectionalLight(0xffe8c8, 1.5);
sun.position.set(600, 1200, 400);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 4000;
const sc = sun.shadow.camera;
sc.left = sc.bottom = -1500; sc.right = sc.top = 1500;
scene.add(sun);

// ── Enemies (targets) ────────────────────────────────────────────────────────
const enemyMat = () => new THREE.MeshStandardMaterial({ color: 0x9b3b3b, roughness: 0.6, emissive: 0x000000 });
const enemies = [];

function makeEnemy(name, pos) {
    const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(34, 110, 6, 12), enemyMat());
    mesh.castShadow = true;
    mesh.position.copy(pos);
    mesh.name = name;
    mesh.userData = { name, hp: 100, maxHp: 100, alive: true, home: pos.clone() };
    scene.add(mesh);

    const bar = document.createElement("div");
    bar.className = "enemy-hp";
    bar.innerHTML = "<i style='width:100%'></i>";
    container.appendChild(bar);

    const e = { mesh, bar, fill: bar.firstChild };
    enemies.push(e);
    return e;
}

const COUNT = 6;
for (let i = 0; i < COUNT; i++) {
    const a = (i / COUNT) * Math.PI * 2;
    makeEnemy(`Gruda Raider ${i + 1}`, new THREE.Vector3(Math.cos(a) * 760, 90, Math.sin(a) * 760));
}

// ── Effects ──────────────────────────────────────────────────────────────────
const effects = [];

function tracer(origin, dir, dist) {
    const end = origin.clone().addScaledVector(dir, dist);
    const geo = new THREE.BufferGeometry().setFromPoints([origin, end]);
    const mat = new THREE.LineBasicMaterial({ color: 0xffd27f, transparent: true, opacity: 0.95 });
    const line = new THREE.Line(geo, mat);
    scene.add(line);
    effects.push({ obj: line, mat, ttl: 0.09, age: 0, kind: "fade" });
}

function knockRing(center) {
    const geo = new THREE.RingGeometry(40, 70, 32);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffb14d, transparent: true, opacity: 0.7, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(geo, mat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(center.x, center.y - 80, center.z);
    scene.add(ring);
    effects.push({ obj: ring, mat, ttl: 0.35, age: 0, kind: "ring" });
}

function flash(mesh) {
    mesh.material.emissive.setHex(0xff5a2a);
    mesh.userData._flashUntil = performance.now() + 110;
}

function updateEffects(dt) {
    for (let i = effects.length - 1; i >= 0; i--) {
        const fx = effects[i];
        fx.age += dt;
        const t = fx.age / fx.ttl;
        if (fx.kind === "ring") {
            const s = 1 + t * 6;
            fx.obj.scale.set(s, s, s);
        }
        fx.mat.opacity = Math.max(0, (fx.kind === "ring" ? 0.7 : 0.95) * (1 - t));
        if (fx.age >= fx.ttl) {
            scene.remove(fx.obj);
            fx.obj.geometry.dispose();
            fx.mat.dispose();
            effects.splice(i, 1);
        }
    }
    // Revert hit flashes.
    const now = performance.now();
    for (const e of enemies) {
        if (e.mesh.userData._flashUntil && now >= e.mesh.userData._flashUntil) {
            e.mesh.material.emissive.setHex(0x000000);
            e.mesh.userData._flashUntil = 0;
        }
    }
}

// ── Damage / death / respawn ─────────────────────────────────────────────────
function damage(target, amount) {
    const ud = target.userData;
    if (!ud.alive) return;
    ud.hp = Math.max(0, ud.hp - amount);
    flash(target);
    hitCount++;
    if (ud.hp <= 0) die(target);
}

function die(target) {
    const ud = target.userData;
    ud.alive = false;
    target.visible = false;
    setTimeout(() => {
        ud.hp = ud.maxHp;
        ud.alive = true;
        target.visible = true;
        target.position.copy(ud.home);
    }, 2500);
}

function knockback(target, dir, force) {
    target.position.addScaledVector(dir, force * 0.25);
    target.position.y = target.userData.home.y;
}

// ── Player ───────────────────────────────────────────────────────────────────
let player;
let lastRing = 0;
const tmp = new THREE.Vector3();

async function init() {
    const human = GRUDGE_CHARACTERS.find((c) => c.id === "human");
    loadStatus.textContent = `Loading ${human.name}…`;

    player = new playerController();
    await player.init({
        scene,
        camera,
        controls,
        playerModelConfig: buildPlayerModelConfig(human),
        initPos: new THREE.Vector3(0, 120, 0),
        staticCollider: staticGroup,           // collide with ground/platforms, not enemies
        enableSpringCamera: true,
        springCameraTime: 0.06,
        thirdMouseMode: 1,
        minCamDistance: 200,
        maxCamDistance: 650,
    });

    // ── Combat setup ──────────────────────────────────────────────────────────
    const c = player.combat;
    // Three-hit melee combo (no dedicated clips on the base pack → timed swings).
    player.registerAttack("slash1", { range: 170, arcDeg: 75, damage: 12, durationMs: 320, comboWindowMs: 480, hitFraction: 0.45 });
    player.registerAttack("slash2", { range: 170, arcDeg: 75, damage: 14, durationMs: 320, comboWindowMs: 480, hitFraction: 0.45 });
    player.registerAttack("slash3", { range: 200, arcDeg: 90, damage: 22, durationMs: 460, comboWindowMs: 300, hitFraction: 0.5 });
    player.registerCombo("primary", ["slash1", "slash2", "slash3"], { primary: true });

    c.configureRanged({ damage: 14, cooldownMs: 260, range: 5000 });
    c.configureKnock({ radius: 360, force: 760, cooldownMs: 1400, damage: 6 });
    player.setDodgeOptions({ speed: 1700, durationMs: 280, cooldownMs: 520 });

    // Targets + alive predicate.
    player.registerTargets(enemies.map((e) => e.mesh));
    player.target.configure({ isAlive: (o) => o.userData.alive, maxRange: 6500, softLockRange: 3800 });

    // ── Events → damage / effects ─────────────────────────────────────────────
    c.onAttackHit = (hits, ev) => { for (const h of hits) damage(h.target, ev.def.damage ?? 10); };
    c.onFire = (origin, dir) => { tracer(origin, dir, (c.ranged.range ?? 5000) * 0.6); };
    c.onRangedHit = (hit) => { damage(hit.target, hit.damage); };
    c.onKnock = (ev) => {
        knockback(ev.target, ev.direction, ev.force);
        if (ev.damage) damage(ev.target, ev.damage);
        const now = performance.now();
        if (now - lastRing > 250 && player.getPosition()) { lastRing = now; knockRing(player.getPosition()); }
    };

    // Target frame UI.
    player.target.onTargetChange = (active, info) => {
        if (!active) { targetFrame.classList.remove("show"); return; }
        targetFrame.classList.add("show");
        tfName.textContent = active.userData?.name ?? active.name ?? "Target";
        tfKind.textContent = info?.hard ? "Locked" : "Soft";
    };

    // Crosshair toggles with pointer lock.
    document.addEventListener("pointerlockchange", () => {
        crosshair.style.display = document.pointerLockElement ? "block" : "none";
    });

    loadingEl.classList.add("hidden");
    renderer.setAnimationLoop(animate);
}

// ── Per-frame ────────────────────────────────────────────────────────────────
function animate() {
    const dt = Math.min(0.05, clock.getDelta());
    if (player) player.update(dt);

    // Simple enemy approach AI so melee/knock are demonstrable.
    const ppos = player?.getPosition();
    let aliveN = 0;
    for (const e of enemies) {
        const ud = e.mesh.userData;
        if (ud.alive) {
            aliveN++;
            if (ppos) {
                tmp.copy(ppos).sub(e.mesh.position); tmp.y = 0;
                const d = tmp.length();
                if (d > 240) { tmp.normalize(); e.mesh.position.addScaledVector(tmp, 90 * dt); e.mesh.position.y = ud.home.y; }
            }
        }
        // Floating HP bar.
        const sp = player?.target?.getScreenPosition(e.mesh, container.clientWidth, container.clientHeight);
        if (sp && sp.visible && ud.alive) {
            e.bar.style.display = "block";
            e.bar.style.left = `${sp.x}px`;
            e.bar.style.top = `${sp.y - 70}px`;
            e.fill.style.width = `${(ud.hp / ud.maxHp) * 100}%`;
        } else {
            e.bar.style.display = "none";
        }
    }

    // Active target frame HP.
    const active = player?.getActiveTarget?.();
    if (active && active.userData) tfHp.style.width = `${(active.userData.hp / active.userData.maxHp) * 100}%`;

    aliveCountEl.textContent = String(aliveN);
    hitCountEl.textContent = String(hitCount);

    updateEffects(dt);
    renderer.render(scene, camera);
}

const clock = new THREE.Clock();

function onResize() {
    const w = container.clientWidth, h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
}
window.addEventListener("resize", onResize);

init().catch((err) => {
    console.error(err);
    loadStatus.textContent = "Failed to initialize combat showcase";
});
