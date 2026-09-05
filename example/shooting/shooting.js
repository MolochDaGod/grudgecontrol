import * as THREE from "three";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import Stats from "three/examples/jsm/libs/stats.module.js";

import { createSceneSetup } from "./core/SceneSetup.js";
import { LocalPlayer } from "./player/LocalPlayer.js";
import { DecalSystem } from "./weapon/DecalSystem.js";
import { WeaponController, MODE } from "./weapon/WeaponController.js";
import { ShootingEffects } from "./weapon/effects.js";
import { HUD } from "./ui/HUD.js";
import { ZombieManager } from "./zombie/ZombieManager.js";

const base = import.meta.env.BASE_URL;

const initPos = new THREE.Vector3(33.21, 4.6, 2.6);

const NORMAL_MAX_CAM = 220;
const MOUSE_SENSITIVITY = 5;
const PLAYER_MODEL_URL = base + "./glb/person15.glb";
const FIRST_PERSON_PITCH_OFFSET_BY_MODEL = {
    [base + "./glb/person15.glb"]: Math.PI * (16 / 180),
};

async function init() {
    const container = document.querySelector("#container");

    let tiles, localPlayer, weapon, zombieManager;

    // ==================== 1. Scene basics ====================
    const { scene, renderer, camera, controls, bakeProbes } = createSceneSetup({ container });

    // Attach audio listener
    const listener = new THREE.AudioListener();
    camera.add(listener);

    camera.position.copy(initPos);
    camera.lookAt(initPos.x, initPos.y, initPos.z + 1);
    controls.target.set(initPos.x, initPos.y, initPos.z + 1);

    const stats = new Stats();
    Object.assign(stats.dom.style, {
        position: "fixed",
        bottom: "0px",
        left: "0px",
        top: "auto",
        zIndex: "9998",
        display: "block",
    });
    document.body.appendChild(stats.dom);

    const timer = new THREE.Timer();
    let _prevGunEngaged = false;
    renderer.setAnimationLoop(() => {
        timer.update();
        const elapsed = timer.getElapsed();
        const dt = timer.getDelta();

        if (localPlayer && weapon && zombieManager) {
            const spineIK = localPlayer.spineIK;
            const gunEngaged = weapon.isGunEngaged();

            // Switch to mouseMode 5 while firing/aiming (lock facing to camera); otherwise use 1
            if (gunEngaged !== _prevGunEngaged) {
                localPlayer.setThirdMouseMode(gunEngaged ? 5 : 1);
                _prevGunEngaged = gunEngaged;
            }

            // Restore spine bones to last frame's clean animation pose
            if (gunEngaged) spineIK.restoreBones();

            // Drive animation and physics (pass dt so the upper-body mixer stays in sync with the main mixer)
            localPlayer ? localPlayer.update(dt) : controls.update();

            // Apply spine IK and facing (after player.update(), before weapon.update())
            if (gunEngaged) {
                if (localPlayer.getIsFirstPerson()) {
                    localPlayer.applyHipsCorrection();
                    spineIK.applyAim1P(camera, localPlayer.pitchTarget1P);
                } else {
                    // console.log('apply 3P IK');
                    localPlayer.applyHipsCorrection();
                    spineIK.applyAim3P(camera, true);
                }
            }

            // Update weapon state (FX, ray hits, fire cadence) — bones already include IK
            weapon.update(elapsed, dt);

            // Zombie AI
            zombieManager.update(dt, localPlayer.getPosition());

        } else {
            controls?.update();
        }

        renderer.render(scene, camera);
        stats.update();
    });


    // ==================== 2. Asset loaders ====================
    const gltfLoader = new GLTFLoader();

    const draco = new DRACOLoader();
    draco.setDecoderPath("https://unpkg.com/three@0.180.0/examples/jsm/libs/draco/");
    gltfLoader.setDRACOLoader(draco);

    const ktx2 = new KTX2Loader();
    ktx2.setTranscoderPath("https://unpkg.com/three@0.180.0/examples/jsm/libs/basis/");
    ktx2.detectSupport(renderer);
    gltfLoader.setKTX2Loader(ktx2);

    // ==================== 3. Scene model ====================
    const { scene: mapScene } = await gltfLoader.loadAsync(
        base + "./glb/horror_corridor.glb"
    );
    mapScene.name = "sceneGLB";
    mapScene.scale.set(0.09, 0.09, 0.09);
    scene.add(mapScene);
    scene.updateMatrixWorld(true);
    bakeProbes();

    document.addEventListener("contextmenu", (e) => e.preventDefault());

    // ==================== 4. Local player ====================
    localPlayer = new LocalPlayer({ scene, camera, controls });
    await localPlayer.init({
        playerModelConfig: {
            url: PLAYER_MODEL_URL,
            scale: 0.01,
            idleAnim: "idle1",
            walkAnim: "walk",
            runAnim: "run",
            jumpAnim: "jump",
            flyAnim: "flying",
            flyIdleAnim: "flyidle",
            enterCarAnim: "enterCar",
            exitCarAnim: "exitCar",
            headBoneName: "mixamorigHead",
            firstPersonPitchOffset: FIRST_PERSON_PITCH_OFFSET_BY_MODEL[PLAYER_MODEL_URL] ?? 0,
            rotateY: - Math.PI / 2,
        },
        initPos: initPos,
        minCamDistance: 10,
        maxCamDistance: NORMAL_MAX_CAM,
        enableOverShoulderView: true,
        mouseSensitivity: MOUSE_SENSITIVITY,
        camLookAtHeightRatio: 0.9,
        keyMap: { toggleFly: null }, 
    });

    localPlayer.getPlayerModel()?.traverse((c) => {
        if (c.isMesh) {
            c.frustumCulled = false;
            c.castShadow = true;
            c.receiveShadow = true;
        }
    });

    // ==================== 5. HUD ====================
    const weaponSlots = [
        { key: "1", mode: "primary", label: "Rifle" },
        { key: "4", mode: "normal", label: "Fists" },
    ];
    const hud = new HUD(weaponSlots);
    hud.build();

    // ==================== 6. Effects ====================
    let effects = new ShootingEffects(scene, {
        listener,
        flashScale: 0.15,
        smokeSize: 0.8
    });
    await effects.load(
        base + "./img/muzzle_flash.png",
        base + "./img/smoke.png",
        base + "./audio/gun_shot.mp3",
        base + "./audio/reload.mp3",
    );

    // ==================== 7. Decal system ====================
    const decalSystem = new DecalSystem(scene, 60, 0.25);
    await decalSystem.loadMaterials(["img/bullet_hole2.png"], base);

    // ==================== 8. Zombie manager ====================
    zombieManager = new ZombieManager(scene, {
        loader: gltfLoader,
        collider: localPlayer.getCollider(),
        modelUrl: base + "./glb/zombie.glb",
        scale: 0.01,
        walkAnim: "walking",
        idleAnim: "Idle",
        punchAnim: "punching",
        runAnim: "running",
        rotateY: Math.PI,
        speed: 120,
    });

    // ==================== 9. Weapon controller ====================
    weapon = new WeaponController({
        scene,
        camera,
        localPlayer,
        decalSystem,
        effects,
        hud,
        zombieManager,
    });

    await weapon.load(gltfLoader, base);
    weapon.setupAnimations();
    weapon.bindInput();
    weapon.switchMode(MODE.PRIMARY);

    // Let LocalPlayer's 1P pitch driver know the weapon state
    localPlayer.setGunEngagedGetter(() => weapon.isGunEngaged());

    // Initial weapon-slot highlight
    hud.update(weapon.getMode());

    // ==================== 10. Mouse picking ====================
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const getMousePickingPoint = (event) => {
        const rect = container.getBoundingClientRect();
        // Normalize mouse position to NDC
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        // Test all scene objects (including 3D Tiles and the player model)
        const intersects = raycaster.intersectObjects(scene.children, true);

        if (intersects.length > 0) {
            return intersects[0].point;
        }
        return null;
    };

    container.addEventListener("mousedown", (e) => {
        // Only pick on click when the pointer is not locked (not in first-person control)
        if (document.pointerLockElement !== renderer.domElement) {
            const point = getMousePickingPoint(e);
            if (point) {
                console.log("Mouse click 3D point:", point);
                // You can add logic here, e.g. spawn a zombie at the click:
                // zombieManager.spawnZombie(point);
            }
        }
    });

    // ==================== Zombie waves ====================
    await Promise.all([
        zombieManager.startWave({ origin: new THREE.Vector3(2.012, 4.6, -0.78), count: 5, radius: 1 }),
        zombieManager.startWave({ origin: new THREE.Vector3(-3.731, 4.6, -1.824), count: 2, radius: 1 }),
        zombieManager.startWave({ origin: new THREE.Vector3(11.911, 4.6, -4.010), count: 2, radius: 1 }),
        zombieManager.startWave({ origin: new THREE.Vector3(13.567, 4.6, 7.001), count: 2, radius: 1 }),
    ]);

    window.hideLoader?.();

    // ==================== Start Screen ====================
    await new Promise((resolve) => {
        const screen = document.getElementById("start-screen");
        screen.addEventListener("mousedown", (e) => e.stopPropagation());
        screen.addEventListener("mouseup", (e) => e.stopPropagation());
        screen.addEventListener("click", (e) => e.stopPropagation());
        screen.style.display = "flex";
        document.getElementById("start-btn").addEventListener("click", () => {
            screen.remove();
            document.body.style.cursor = "none";
            document.body.requestPointerLock?.();
            resolve();
        }, { once: true });
    });

    // ==================== Window resize ====================
    window.addEventListener("resize", () => {
        const cont = document.querySelector("#container");
        if (!cont) return;
        camera.aspect = cont.clientWidth / cont.clientHeight;
        renderer.setSize(cont.clientWidth, cont.clientHeight);
        camera.updateProjectionMatrix();
    });
}

init();
