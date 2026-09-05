import * as THREE from "three";
import { MeshBVH, BVHHelper, acceleratedRaycast } from "three-mesh-bvh";
import type { GLTF } from "three/examples/jsm/Addons.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";

import { MobileControls } from "./utils/mobileControls";
import type { PlayerControllerOptions, PlayerModelOptions, VehicleInstance, VehicleOptions, DynamicColliderEntry, KeyMap, AttackDef, DodgeOptions } from "./types";
import { AnimationSystem } from "./systems/AnimationSystem";
import { CameraSystem } from "./systems/CameraSystem";
import { InputSystem } from "./systems/InputSystem";
import { VehicleSystem } from "./systems/VehicleSystem";
import { CombatSystem } from "./systems/CombatSystem";
import { TargetSystem } from "./systems/TargetSystem";
import { applyCapsuleCollision, createCollisionTemps, type CollisionTemps } from "./utils/capsuleCollision";
import { loadExternalAnimationClips, loadModelAsset } from "./utils/grudgeAssetLoader";

THREE.Mesh.prototype.raycast = acceleratedRaycast;

const clock = new THREE.Clock();

function isMobileDevice() {
    return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

export class playerController {

    // ==================== Scene refs ====================
    loader: GLTFLoader = new GLTFLoader(); // GLTF loader
    scene!: THREE.Scene; // 3D scene
    camera!: THREE.PerspectiveCamera; // Perspective camera
    controls!: OrbitControls; // Orbit controls

    // ==================== Player config ====================
    playerModelConfig!: PlayerModelOptions; // Model options
    private initPos: THREE.Vector3 = new THREE.Vector3(0, 0, 0); // Spawn position
    gravity = -2400; // Gravity acceleration
    jumpHeight = 600; // Jump initial velocity
    playerSpeed = 300; // Walk speed
    playerFlySpeed = 2100; // Fly speed
    private curPlayerSpeed = 0; // Current actual speed
    enableOverShoulderView = false; // Over-shoulder view toggle
    private isShowMobileControls = true; // Show mobile controls

    // ==================== Player capsule ====================
    private playerCapsuleRadius = 30; // Capsule radius
    private playerCapsuleRadiusRatio = 1; // Radius scale ratio
    private playerCapsuleHeight = 180; // Capsule height
    isFirstPerson = false; // First-person state

    // ==================== Runtime state ====================
    controllerMode: 0 | 1 = 0; // 0 walk 1 vehicle
    playerIsOnGround = false; // On ground
    isupdate = true; // Frame-update toggle
    timeScale = 1; // Time scale
    isFlying = false; // Flying state
    isChangeControllerTransitionTimer: any = null; // Mode-switch timer
    enableToward = true; // Enable facing input

    // ==================== Jump / dodge ====================
    maxJumps = 2; // Max jumps (includes double jump)
    private jumpCount = 0; // Jumps used
    isDodging = false; // Currently dodging
    dodgeSpeed = 1400; // Dodge speed base (scaled by scale)
    dodgeDuration = 0.28; // Dodge duration (seconds)
    dodgeCooldownMs = 550; // Dodge cooldown (ms)
    dodgeIframes = true; // Dodge i-frames
    dodgeDoubleTapMs = 250; // Double-tap window (ms)
    dodgeAnimKey: string | null = null; // Dodge animation key
    private dodgeTimer = 0; // Dodge time remaining (seconds)
    private dodgeCooldownUntil = 0; // Dodge cooldown end timestamp (ms)
    private dodgeDir = new THREE.Vector3(); // Dodge direction (world XZ)

    // ==================== Player objects ====================
    playerCapsule!: THREE.Mesh & { capsuleInfo?: any }; // Player collision capsule
    playerModel: THREE.Object3D | null = null; // Model root
    playerModelHead: THREE.Object3D | null = null; // Head bone

    // ==================== Colliders ====================
    collider: THREE.Mesh | null = null; // Static collider
    private visualizer: BVHHelper | null = null; // BVH visualizer
    collected: THREE.BufferGeometry[] = []; // Static geometry collection
    private dynamicColliders: DynamicColliderEntry[] = []; // Dynamic collider list
    activeDynamicCollider: DynamicColliderEntry | null = null; // Dynamic collider currently stood on

    // ==================== Collision thresholds ====================
    private readonly slopeAngleThreshold = 50; // Slope threshold (degrees)
    private readonly maxStepHeight = 40; // Max step / vertical-face height to skip

    // ==================== Mobile ====================
    mobileControls: MobileControls | null = null; // Mobile controls
    private isNearVehicle = false; // Near a vehicle
    private nearCheckLocal = new THREE.Vector3(); // Near-check local coords
    private nearCheckWorld = new THREE.Vector3(); // Near-check world coords

    // ==================== Debug ====================
    private displayPlayer = false; // Show player collider
    private displayCollider = false; // Show scene collider
    private displayVisualizer = false; // Show BVH helper

    // ==================== Direction constants & reused vectors ====================
    private rotationSpeed = 10; // Facing rotation speed
    upVector = new THREE.Vector3(0, 1, 0); // World up
    private DIR_FWD = new THREE.Vector3(0, 0, -1); // Forward
    private DIR_BKD = new THREE.Vector3(0, 0, 1); // Back
    private DIR_LFT = new THREE.Vector3(-1, 0, 0); // Left
    private DIR_RGT = new THREE.Vector3(1, 0, 0); // Right

    playerAcceleration = 30; // XZ acceleration response
    playerDeceleration = 30; // XZ deceleration response
    private decelBase = 300; // Deceleration base speed
    playerVelocity = new THREE.Vector3(); // Player velocity
    private camDir = new THREE.Vector3(); // Camera direction cache
    private moveDir = new THREE.Vector3(); // Move direction cache
    private xzDir = new THREE.Vector3(); // Step direction cache
    targetQuat = new THREE.Quaternion(); // Target quaternion
    targetMat = new THREE.Matrix4(); // Target transform matrix
    private staticTemps: CollisionTemps = createCollisionTemps(); // Static collision temps
    private dynTemps: CollisionTemps = createCollisionTemps();    // Dynamic collision temps
    private groundRaycaster = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0)); // Ground ray

    // ==================== Event callbacks ====================
    onAnimationChange?: (name: string, action: THREE.AnimationAction) => void; // Animation change callback
    onBeforeViewChange?: (isFirstPerson: boolean) => void; // Before view-change callback
    onViewChange?: (isFirstPerson: boolean) => void; // After view-change callback
    onGroundChange?: (onGround: boolean) => void; // Grounded-state callback
    onVehicleEnter?: (vehicle: VehicleInstance) => void; // Enter-vehicle callback
    onVehicleExit?: (vehicle: VehicleInstance) => void; // Exit-vehicle callback
    onTowardChange?: (dx: number, dy: number, speed: number) => void; // Facing-change callback

    // ==================== Subsystems ====================
    animation = new AnimationSystem(this); // Animation system
    cam = new CameraSystem(this); // Camera system
    input = new InputSystem(this); // Input system
    vehicle = new VehicleSystem(this); // Vehicle system
    target = new TargetSystem(this); // Target lock (Tab hard lock + soft lock)
    combat = new CombatSystem(this); // Combat (LMB melee / RMB ranged / MMB knockback)

    constructor() {
        (this.groundRaycaster as any).firstHitOnly = true;
    }

    // ==================== Init ====================

    // Main init entry
    async init(opts: PlayerControllerOptions, callback?: () => void) {
        const m = opts.playerModelConfig;
        const s = m.scale ?? 1;

        this.scene = opts.scene;
        this.camera = opts.camera;
        this.camera.rotation.order = "YXZ";
        this.controls = opts.controls;

        this.playerModelConfig = m;
        this.initPos = opts.initPos ? opts.initPos.clone() : this.initPos;

        // Apply player params
        const pm = this.playerModelConfig;
        this.gravity = (pm.gravity ?? this.gravity) * s;
        this.jumpHeight = (pm.jumpHeight ?? this.jumpHeight) * s;
        this.playerSpeed = (pm.speed ?? this.playerSpeed) * s;
        this.playerFlySpeed = (pm.flySpeed ?? this.playerFlySpeed) * s;
        this.curPlayerSpeed = this.playerSpeed;
        this.playerCapsuleRadiusRatio = pm.capsuleRadiusRatio ?? this.playerCapsuleRadiusRatio;
        this.playerAcceleration = pm.acceleration ?? this.playerAcceleration;
        this.playerDeceleration = pm.deceleration ?? this.playerDeceleration;
        this.decelBase = this.playerSpeed;

        // Apply camera params
        this.cam.sensitivity = opts.mouseSensitivity ?? this.cam.sensitivity;
        this.cam.mouseMode = opts.thirdMouseMode ?? this.cam.mouseMode;
        this.cam.enableSpringCamera = opts.enableSpringCamera ?? this.cam.enableSpringCamera;
        this.cam.springCameraTime = opts.springCameraTime ?? this.cam.springCameraTime;
        this.cam.zoomEnabled = opts.enableZoom ?? this.cam.zoomEnabled;
        this.cam.minDist = (opts.minCamDistance ?? this.cam.minDist) * s;
        this.cam.maxDist = (opts.maxCamDistance ?? this.cam.maxDist) * s;
        this.cam.lookAtHeightRatio = opts.camLookAtHeightRatio ?? this.cam.lookAtHeightRatio;
        this.cam.originMaxDist = this.cam.maxDist;
        this.cam.epsilon = this.cam.epsilon * s;

        this.isShowMobileControls = (opts.isShowMobileControls ?? this.isShowMobileControls) && isMobileDevice();
        this.enableOverShoulderView = opts.enableOverShoulderView ?? this.enableOverShoulderView;
        this.isFirstPerson = opts.isFirstPerson ?? this.isFirstPerson;
        this.timeScale = opts.timeScale ?? this.timeScale;

        // Custom key map
        if (opts.keyMap) this.input.buildKeyMap(opts.keyMap);

        // Init mobile controls
        if (this.isShowMobileControls) {
            this.mobileControls = new MobileControls(i => this.input.setInput(i), this.controls);
            await this.mobileControls.init(opts.mobileControls);
        }

        await this.initLoader();
        this.buildStaticCollider(opts.staticCollider);
        await this.loadPlayerModelGLB();

        // Register dynamic colliders at init
        if (opts.dynamicCollider) {
            const list = Array.isArray(opts.dynamicCollider) ? opts.dynamicCollider : [opts.dynamicCollider];
            for (const obj of list) this.addDynamicCollider(obj);
        }

        this.input.bindEvents();
        this.cam.setCamPos();
        this.cam.initControls();
        this.cam.setOverShoulder(this.isFirstPerson ? false : this.enableOverShoulderView);
        callback?.();
    }

    // Init loaders
    private async initLoader() {
        const dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath("https://unpkg.com/three@0.182.0/examples/jsm/libs/draco/gltf/");
        this.loader.setDRACOLoader(dracoLoader);
    }

    // ==================== Player model ====================

    // Load model and animations
    private async loadPlayerModelGLB() {
        try {
            const { scene, animations: embeddedAnimations } = await loadModelAsset(this.playerModelConfig.url);
            this.playerModel = scene;

            let animations = [...embeddedAnimations];
            if (this.playerModelConfig.animationUrls) {
                const external = await loadExternalAnimationClips(
                    this.playerModelConfig.animationUrls,
                    this.playerModel,
                );
                animations = [...animations, ...external];
            }

            // Init animation mixer
            this.animation.mixer = new THREE.AnimationMixer(this.playerModel);
            this.animation.clips = animations;
            this.animation.actions = new Map();

            // Build action mapping
            const mc = this.playerModelConfig;
            const isThreePartJump = Array.isArray(mc.jumpAnim);
            this.animation.hasThreePartJump = isThreePartJump;
            const mappings: [string, string][] = [
                [mc.idleAnim, "idle"],
                [mc.walkAnim, "walking"],
                [mc.leftWalkAnim || mc.walkAnim, "left_walking"],
                [mc.rightWalkAnim || mc.walkAnim, "right_walking"],
                [mc.backwardAnim || mc.walkAnim, "walking_backward"],
                ...(isThreePartJump
                    ? [] as [string, string][]
                    : [[mc.jumpAnim as string, "jumping"]] as [string, string][]),
                [mc.runAnim, "running"],
                [mc.flyIdleAnim || mc.idleAnim, "flyidle"],
                [mc.flyAnim || mc.idleAnim, "flying"],
                [mc.flyHoverForwardAnim || mc.flyAnim || mc.idleAnim, "flyHoverForward"],
                [mc.flyHoverBackAnim || mc.flyIdleAnim || mc.idleAnim, "flyHoverBack"],
                [mc.flyHoverLeftAnim || mc.flyIdleAnim || mc.idleAnim, "flyHoverLeft"],
                [mc.flyHoverRightAnim || mc.flyIdleAnim || mc.idleAnim, "flyHoverRight"],
                [mc.flyHoverUpAnim || mc.flyIdleAnim || mc.idleAnim, "flyHoverUp"],
                [mc.flyHoverDownAnim || mc.flyIdleAnim || mc.idleAnim, "flyHoverDown"],
                [mc.enterCarAnim || mc.idleAnim, "enterCar"],
                [mc.exitCarAnim || mc.idleAnim, "exitCar"],
            ];

            for (const [clipName, actionName] of mappings) {
                const clip = animations.find(a => a.name === clipName);
                if (!clip) continue;
                const action = this.animation.mixer.clipAction(clip);
                if (actionName === "jumping") {
                    action.setLoop(THREE.LoopOnce, 1);
                    action.clampWhenFinished = true;
                    action.setEffectiveTimeScale(1.2);
                } else {
                    action.setLoop(THREE.LoopRepeat, Infinity);
                    action.setEffectiveTimeScale(1);
                }
                action.enabled = true;
                action.setEffectiveWeight(0);
                this.animation.actions.set(actionName, action);
            }

            // Register three-part jump clips
            if (isThreePartJump) {
                const [startClip, loopClip, endClip] = mc.jumpAnim as [string, string, string];
                const jumpDefs: [string, string, number, boolean][] = [
                    [startClip, "jumpStart", THREE.LoopOnce, true],
                    [loopClip, "jumpLoop", THREE.LoopRepeat, false],
                    [endClip, "jumpEnd", THREE.LoopOnce, true],
                ];
                for (const [clipName, key, loop, clamp] of jumpDefs) {
                    const clip = animations.find(a => a.name === clipName);
                    if (!clip) { console.warn(`Jump animation clip not found: "${clipName}"`); continue; }
                    const action = this.animation.mixer!.clipAction(clip);
                    action.setLoop(loop as THREE.AnimationActionLoopStyles, loop === THREE.LoopOnce ? 1 : Infinity);
                    action.clampWhenFinished = clamp;
                    action.setEffectiveTimeScale(key === "jumpStart" ? 1.2 : 1);
                    action.enabled = true;
                    action.setEffectiveWeight(0);
                    this.animation.actions.set(key, action);
                }
            }

            // Register default action set
            const defaultSet = new Map<string, THREE.AnimationAction>();
            for (const key of ["idle", "walking", "walking_backward", "running", "jumping", "flyidle", "flying"]) {
                const action = this.animation.actions.get(key);
                if (action) defaultSet.set(key, action);
            }
            this.animation.sets.set("default", defaultSet);

            this.animation.actions.get("idle")?.setEffectiveWeight(1);
            this.animation.actions.get("idle")?.play();
            this.animation.state = this.animation.actions.get("idle")!;

            // Listen for animation finished
            this.animation.mixerCb = (ev: any) => {
                const done: THREE.AnimationAction = ev.action;
                const resolveGroundAnim = () => {
                    if (this.input.fwd) { this.animation.playByName(this.input.shift ? "running" : "walking"); return; }
                    if (this.input.bkd) { this.animation.playByName("walking_backward"); return; }
                    if (this.input.rgt || this.input.lft) { this.animation.playByName("walking"); return; }
                    this.animation.playByName("idle");
                };
                if (done === this.animation.actions?.get("jumping")) { resolveGroundAnim(); return; }
                if (done === this.animation.actions?.get("jumpStart")) { this.animation.playByName("jumpLoop"); return; }
                if (done === this.animation.actions?.get("jumpEnd")) { resolveGroundAnim(); return; }
                if (done === this.animation.actions?.get("enterCar")) this.vehicle.onEnterAnimFinished();
            };
            this.animation.mixer.addEventListener("finished", this.animation.mixerCb);

            this.animation.mixer.update(0);
            this.playerModel.updateMatrixWorld(true);

            // Compute capsule size
            const { size } = this.getBbox(this.playerModel);
            const modelScale = this.playerCapsuleHeight / size.y;

            const s = this.playerModelConfig.scale;
            const r = this.playerCapsuleRadius * s * this.playerCapsuleRadiusRatio;
            const h = this.playerCapsuleHeight * s;

            // Create capsule mesh
            this.playerCapsule = new THREE.Mesh(
                new RoundedBoxGeometry(r * 2, h, r * 2, 1, 75),
                new THREE.MeshStandardMaterial({
                    color: new THREE.Color(1, 0, 0),
                    shadowSide: THREE.DoubleSide,
                    depthTest: false,
                    wireframe: true,
                    depthWrite: false,
                }),
            );
            const segmentLength = h - 2 * r;
            this.playerCapsule.geometry.translate(0, -segmentLength / 2, 0);
            this.playerCapsule.capsuleInfo = {
                radius: r,
                segment: new THREE.Line3(new THREE.Vector3(), new THREE.Vector3(0, -segmentLength, 0)),
            };
            this.playerCapsule.name = "capsule";
            (this.playerCapsule.material as THREE.Material).visible = this.displayPlayer;
            this.scene.add(this.playerCapsule);
            this.reset();
            this.playerCapsule.rotateY(this.playerModelConfig.rotateY ?? 0);

            // Attach model to capsule
            this.playerModel.scale.multiplyScalar(modelScale * s);
            this.playerModel.position.set(0, -segmentLength - r, 0);
            this.playerModel.traverse((child: any) => {
                if (child.name === this.playerModelConfig?.headBoneName) this.playerModelHead = child;
            });
            this.playerCapsule.add(this.playerModel);
            this.reset();
        } catch (e) {
            console.error("Failed to load player model:", e);
        }
    }

    // Switch player model
    async switchPlayerModel(newPlayerModel: PlayerModelOptions) {
        // Save current state
        const savedPos = this.playerCapsule.position.clone();
        const savedQuat = this.playerCapsule.quaternion.clone();
        const wasFirstPerson = this.isFirstPerson;

        if (wasFirstPerson) this.scene.attach(this.camera);
        if (this.playerCapsule) this.scene.remove(this.playerCapsule);
        if (this.playerModel) { this.playerCapsule.remove(this.playerModel); this.playerModel = null; this.playerModelHead = null; }

        // Clear old animation resources
        const anim = this.animation;
        if (anim.mixer) {
            if (anim.mixerCb) { anim.mixer.removeEventListener("finished", anim.mixerCb); anim.mixerCb = undefined; }
            anim.mixer.stopAllAction();
            anim.mixer.uncacheRoot(anim.mixer.getRoot());
            anim.mixer = undefined;
            anim.actions = undefined;
        }

        // Update scale-related params
        const ratio = newPlayerModel.scale / this.playerModelConfig.scale;
        this.playerModelConfig = { ...this.playerModelConfig, ...newPlayerModel };

        this.gravity *= ratio;
        this.jumpHeight *= ratio;
        this.playerSpeed *= ratio;
        this.playerFlySpeed *= ratio;
        this.curPlayerSpeed *= ratio;
        this.cam.epsilon *= ratio;
        this.cam.minDist *= ratio;
        this.cam.maxDist *= ratio;
        this.cam.originMaxDist *= ratio;

        await this.loadPlayerModelGLB();
        this.playerCapsule.position.copy(savedPos);
        this.playerCapsule.quaternion.copy(savedQuat);
        if (wasFirstPerson) this.cam.setFirstPerson();
        this.setDebug(this.displayCollider);
    }

    // ==================== Collider build and query ====================

    // Get bounding box
    private getBbox(object: THREE.Object3D) {
        const bbox = new THREE.Box3().setFromObject(object);
        const center = new THREE.Vector3();
        const size = new THREE.Vector3();
        bbox.getCenter(center);
        bbox.getSize(size);
        return { bbox, center, size };
    }

    // Fill required attributes
    private ensureAttributesMinimal(geom: THREE.BufferGeometry): THREE.BufferGeometry | null {
        if (!geom.attributes.position) return null;
        if (!geom.attributes.normal) geom.computeVertexNormals();
        if (!geom.attributes.uv) {
            const count = geom.attributes.position.count;
            geom.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(count * 2), 2));
        }
        return geom;
    }

    // Unify attribute layout
    private unifiedAttribute(collected: THREE.BufferGeometry[]) {
        type AttrMeta = { itemSize: number; arrayCtor: any; examples: number; normalized: boolean };
        const attrMap = new Map<string, AttrMeta>();
        const attrConflict = new Set<string>();
        const required = new Set(["position", "normal", "uv"]);

        // Drop non-required attributes
        for (const g of collected)
            for (const name of Object.keys(g.attributes))
                if (!required.has(name)) g.deleteAttribute(name);

        // Collect attribute metadata
        for (const g of collected) {
            for (const name of Object.keys(g.attributes)) {
                const attr = g.attributes[name] as THREE.BufferAttribute;
                const ctor = (attr.array as any).constructor;
                if (!attrMap.has(name)) {
                    attrMap.set(name, { itemSize: attr.itemSize, arrayCtor: ctor, examples: 1, normalized: attr.normalized });
                } else {
                    const m = attrMap.get(name)!;
                    if (m.itemSize !== attr.itemSize || m.arrayCtor !== ctor || m.normalized !== attr.normalized) attrConflict.add(name);
                    else m.examples++;
                }
            }
        }

        // Remove conflicting attributes
        for (const name of attrConflict) {
            for (const g of collected) if (g.attributes[name]) g.deleteAttribute(name);
            attrMap.delete(name);
        }

        // Fill missing attributes
        for (const [name, meta] of attrMap) {
            for (const g of collected) {
                if (!g.attributes[name]) {
                    const count = g.attributes.position.count;
                    g.setAttribute(name, new THREE.BufferAttribute(new meta.arrayCtor(count * meta.itemSize), meta.itemSize, meta.normalized));
                }
            }
        }
        return collected;
    }

    // Build static collider
    buildStaticCollider(sources?: THREE.Object3D | THREE.Object3D[]) {
        this.collected = [];
        if (this.collider) { this.scene.remove(this.collider); this.collider = null; }

        const collectMesh = (mesh: THREE.Mesh | THREE.LineSegments) => {
            try {
                let geom = mesh.geometry.clone();
                geom.applyMatrix4(mesh.matrixWorld);
                if (geom.index) geom = geom.toNonIndexed();
                const safe = this.ensureAttributesMinimal(geom);
                if (safe) this.collected.push(safe);
            } catch (e) {
                console.warn("Error processing mesh:", mesh, e);
            }
        };

        // Collect collision meshes: use given objects if passed, otherwise traverse the whole scene
        if (sources) {
            const list = Array.isArray(sources) ? sources : [sources];
            for (const obj of list) {
                obj.updateMatrixWorld(true);
                obj.traverse(c => {
                    const a = c as any;
                    if ((a.isMesh || a.isLineSegments) && a.geometry && c.name !== "capsule") collectMesh(a);
                });
            }
        } else {
            this.scene.traverse(c => {
                const m = c as THREE.Mesh;
                if (m?.isMesh && m.geometry && c.name !== "capsule") collectMesh(m);
            });
        }

        if (!this.collected.length) return;
        this.collected = this.unifiedAttribute(this.collected);

        // Merge and build BVH
        const merged = BufferGeometryUtils.mergeGeometries(this.collected, false);
        if (!merged) { console.error("Failed to merge geometries"); return; }
        (merged as any).boundsTree = new MeshBVH(merged, { maxDepth: 100 });
        this.collider = new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ opacity: 0.5, transparent: true, wireframe: true, depthTest: true, side: THREE.DoubleSide }));
        this.collider.layers.enable(1);

        if (this.displayCollider) this.scene.add(this.collider);
        if (this.displayVisualizer) {
            if (this.visualizer) this.scene.remove(this.visualizer);
            this.visualizer = new BVHHelper(this.collider, 10);
            this.scene.add(this.visualizer);
        }
    }

    // Register a dynamic collider
    addDynamicCollider(source: THREE.Object3D) {
        if (this.dynamicColliders.find(e => e.source === source)) return;
        source.updateMatrixWorld(true);

        // Collect meshes; keep geometry in source local space
        const collected: THREE.BufferGeometry[] = [];
        const invSource = new THREE.Matrix4().copy(source.matrixWorld).invert();
        source.traverse(c => {
            const m = c as THREE.Mesh;
            if (!m?.isMesh || !m.geometry || c.name === "capsule") return;
            try {
                let geom = (m.geometry as THREE.BufferGeometry).clone();
                geom.applyMatrix4(new THREE.Matrix4().multiplyMatrices(invSource, m.matrixWorld));
                if (geom.index) geom = geom.toNonIndexed();
                const safe = this.ensureAttributesMinimal(geom);
                if (safe) collected.push(safe);
            } catch (e) { console.warn("Error processing dynamic mesh:", m, e); }
        });

        if (!collected.length) return;
        const unified = this.unifiedAttribute(collected);
        const merged = BufferGeometryUtils.mergeGeometries(unified, false);
        if (!merged) { console.error("Failed to merge dynamic geometries"); return; }
        (merged as any).boundsTree = new MeshBVH(merged);

        const mesh = new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ opacity: 0.5, transparent: true, wireframe: true, depthTest: true, side: THREE.DoubleSide }));
        mesh.matrixAutoUpdate = false;
        mesh.matrix.copy(source.matrixWorld);
        mesh.updateMatrixWorld(true);

        this.dynamicColliders.push({ source, mesh, prevWorldMatrix: new THREE.Matrix4().copy(source.matrixWorld), deltaPos: new THREE.Vector3(), deltaRotY: 0 });
        if (this.displayCollider) this.scene.add(mesh);
    }

    // Unregister a dynamic collider
    removeDynamicCollider(source: THREE.Object3D) {
        const idx = this.dynamicColliders.findIndex(e => e.source === source);
        if (idx === -1) return;
        const entry = this.dynamicColliders[idx];
        this.scene.remove(entry.mesh);
        entry.mesh.geometry.dispose();
        (entry.mesh.material as THREE.Material).dispose();
        if (this.activeDynamicCollider === entry) this.activeDynamicCollider = null;
        this.dynamicColliders.splice(idx, 1);
    }

    // Clear all dynamic colliders
    clearDynamicColliders() {
        for (const entry of this.dynamicColliders) {
            this.scene.remove(entry.mesh);
            entry.mesh.geometry.dispose();
            (entry.mesh.material as THREE.Material).dispose();
        }
        this.dynamicColliders = [];
        this.activeDynamicCollider = null;
    }

    // Update dynamic colliders
    private updateDynamicColliders() {
        if (!this.playerCapsule) return;
        const playerWorldPos = this.playerCapsule.position.clone();

        for (const entry of this.dynamicColliders) {
            // Transform player position into the platform's previous-frame local space
            const prevInv = new THREE.Matrix4().copy(entry.prevWorldMatrix).invert();
            const playerInLocal = playerWorldPos.clone().applyMatrix4(prevInv);

            // Update mesh to follow source
            entry.source.updateMatrixWorld(true);
            entry.mesh.matrix.copy(entry.source.matrixWorld);
            entry.mesh.updateMatrixWorld(true);

            // Transform back to new world space for the full displacement including rotation
            const playerInNewWorld = playerInLocal.clone().applyMatrix4(entry.source.matrixWorld);
            entry.deltaPos.subVectors(playerInNewWorld, playerWorldPos);

            // This-frame platform Y-axis rotation delta
            const prevEuler = new THREE.Euler().setFromRotationMatrix(entry.prevWorldMatrix, "YXZ");
            const curEuler = new THREE.Euler().setFromRotationMatrix(entry.source.matrixWorld, "YXZ");
            entry.deltaRotY = curEuler.y - prevEuler.y;

            // Store current matrix for next frame
            entry.prevWorldMatrix.copy(entry.source.matrixWorld);
        }
    }

    // Whether to skip triangle collision
    private shouldSkipTriCollision(tri: any, dir: THREE.Vector3): boolean {
        const normal = tri.getNormal(new THREE.Vector3());
        const normalYAangle = normal.angleTo(this.upVector) * 180 / Math.PI;
        // Skip collision on slopes shallower than slopeAngleThreshold degrees
        if (normalYAangle < this.slopeAngleThreshold) return true;
        // Ignore collisions on vertical faces shorter than the step threshold
        if (normalYAangle > 80 && normalYAangle < 100) {
            const triHeight = Math.max(tri.a.y, tri.b.y, tri.c.y) - Math.min(tri.a.y, tri.b.y, tri.c.y); // Triangle Y height
            if (triHeight < this.maxStepHeight * this.playerModelConfig.scale) return true; // Threshold height
            // else {
            //     // console.log('blocked:', 'current tri height', triHeight, "threshold", this.maxStepHeight * this.playerModelConfig.scale);
            // }
        }
        // console.log('collision tri normal vs world up angle:', normalYAangle.toFixed(2), '°');
        // console.log('collision triangle:', tri, "push-out direction:", dir);
        return false;
    }

    // ==================== Main loop ====================

    // Main loop
    async update(delta = clock.getDelta()) {
        if (!this.isupdate || !this.playerCapsule || !this.collider) return;
        delta = Math.min(delta, 1 / 40) * this.timeScale;
        if (this.controllerMode === 1) {
            this.vehicle.updateVehicle(delta);
        } else {
            this.updatePlayer(delta);
            if (this.isChangeControllerTransitionTimer) this.vehicle.updateInertia(delta);
        }
    }

    // Player frame update
    updatePlayer(delta: number) {
        // Update dynamic collider poses and deltas
        this.updateDynamicColliders();

        const v = this.vehicle;
        if (v.isMovingToBoarding) v.updateMoveTo(delta);

        // Enter-vehicle door-close timing
        if (v.isBoardingAnim) {
            const action = this.animation.actions?.get("enterCar");
            if (action) {
                const duration = action.getClip().duration;
                const remaining = ((duration - action.time) / action.getEffectiveTimeScale()) * 1000;
                if (!v.doorClosed && remaining <= 500) { v.doorClosed = true; v.openDoor(false); }
                if (action.time >= duration) {
                    v.isBoardingAnim = false;
                    v.doorClosed = false;
                    v.onEnterAnimFinished();
                    return;
                }
            }
        }

        // Exit-vehicle door-close timing
        if (v.isExitAnim) {
            const action = this.animation.actions?.get("exitCar");
            if (action) {
                const duration = action.getClip().duration;
                const remaining = ((duration - action.time) / action.getEffectiveTimeScale()) * 1000;
                if (!v.exitDoorClosed && remaining <= 500) { v.exitDoorClosed = true; v.openDoor(false); }
                if (action.time >= duration) { v.isExitAnim = false; v.exitDoorClosed = false; this.onVehicleExit?.(v.active!); }
            }
        }

        // Early-out in vehicle mode
        if (this.controllerMode === 1) {
            // Update animations
            this.animation.updateMixers(delta);
            return;
        }

        // Compute move direction
        this.camera.getWorldDirection(this.camDir);
        const angle = 2 * Math.PI - (Math.atan2(this.camDir.z, this.camDir.x) + Math.PI / 2);

        // Keyed move direction
        this.moveDir.set(0, 0, 0);
        if (this.input.fwd) this.moveDir.add(this.DIR_FWD);
        if (this.input.bkd) this.moveDir.add(this.DIR_BKD);
        if (this.input.lft) this.moveDir.add(this.DIR_LFT);
        if (this.input.rgt) this.moveDir.add(this.DIR_RGT);
        if (this.isFlying) {
            if (this.input.fwd) this.moveDir.copy(this.camDir);
            if (this.input.space) this.moveDir.y += 1;
            this.curPlayerSpeed = this.input.shift ? this.playerFlySpeed * 2 : this.playerFlySpeed;
        } else {
            this.curPlayerSpeed = this.input.shift ? this.playerSpeed * 2 : this.playerSpeed;
        }

        this.moveDir.normalize(); // Normalize direction
        if (!this.isFlying || !this.input.fwd) this.moveDir.applyAxisAngle(this.upVector, angle); // Apply camera yaw

        // Velocity drive
        const accelStep = this.playerAcceleration * this.decelBase * delta; // Accel step
        const decelStep = this.playerDeceleration * this.decelBase * delta; // Decel step
        const lockMove = this.combat.isAttacking && !!this.combat.currentDef?.lockMovement; // Attack locks movement
        if (this.isDodging) {
            // Dodge: dash at fixed speed along dodgeDir, ignore normal accel/decel
            const ds = this.dodgeSpeed * this.playerModelConfig.scale;
            this.playerVelocity.x = this.dodgeDir.x * ds;
            this.playerVelocity.z = this.dodgeDir.z * ds;
            this.dodgeTimer -= delta;
            if (this.dodgeTimer <= 0) this.isDodging = false;
        } else if (lockMove) {
            // Attack lock: zero horizontal velocity
            this.playerVelocity.x = 0;
            this.playerVelocity.z = 0;
        } else {
            const targetX = this.moveDir.x * this.curPlayerSpeed; // Target speed X
            const targetZ = this.moveDir.z * this.curPlayerSpeed; // Target speed Z
            const diffX = targetX - this.playerVelocity.x; // Speed delta X
            const diffZ = targetZ - this.playerVelocity.z; // Speed delta Z
            // Clamp XZ as a single 2D vector
            const hasXZInput = this.moveDir.x !== 0 || this.moveDir.z !== 0;
            const xzDiffLen = Math.hypot(diffX, diffZ);
            if (xzDiffLen > 0) {
                const xzApplied = Math.min(xzDiffLen, hasXZInput ? accelStep : decelStep);
                this.playerVelocity.x += (diffX / xzDiffLen) * xzApplied;
                this.playerVelocity.z += (diffZ / xzDiffLen) * xzApplied;
            }
            if (this.isFlying) {
                const targetY = this.moveDir.y * this.curPlayerSpeed;
                const diffY = targetY - this.playerVelocity.y;
                this.playerVelocity.y += Math.sign(diffY) * Math.min(Math.abs(diffY), this.moveDir.y !== 0 ? accelStep : decelStep);
            }
        }

        // Ground check
        const s = this.playerModelConfig.scale;
        this.groundRaycaster.ray.origin.copy(this.playerCapsule.position);
        const staticHits = this.groundRaycaster.intersectObject(this.collider!, false);

        // Also test dynamic colliders; keep the highest ground point
        let bestHit: THREE.Intersection | undefined = staticHits[0];
        let hitEntry: DynamicColliderEntry | null = null;
        for (const entry of this.dynamicColliders) {
            const dynHits = this.groundRaycaster.intersectObject(entry.mesh, false);
            if (dynHits.length > 0 && (!bestHit || dynHits[0].point.y > bestHit.point.y)) {
                bestHit = dynHits[0];
                hitEntry = entry;
            }
        }
        // Update active dynamic collider
        this.activeDynamicCollider = hitEntry;

        if (!this.isFlying) {
            if (bestHit) {
                const capsuleInfo = this.playerCapsule.capsuleInfo;
                const snapH = parseFloat((-capsuleInfo.segment.end.y + capsuleInfo.radius).toFixed(6));
                const maxH = parseFloat((snapH * 1.2).toFixed(6));
                const snapY = bestHit.point.y + snapH;
                const dist = parseFloat((this.playerCapsule.position.y - bestHit.point.y).toFixed(6));
                if (dist > maxH) {
                    this.applyGravity(delta);
                } else if (this.playerVelocity.y <= 0) {
                    if (this.playerIsOnGround) {
                        // Already grounded: follow terrain (slopes, dynamic platforms)
                        this.snapToGround(snapY);
                    } else {
                        // Falling: snap only if this frame's velocity reaches the land point, else keep gravity
                        const predictedY = this.playerCapsule.position.y + this.playerVelocity.y * delta;
                        if (predictedY <= snapY) {
                            this.snapToGround(snapY);
                        } else {
                            this.applyGravity(delta);
                        }
                    }
                }
            } else {
                this.applyGravity(delta);
            }
            // Apply gravity velocity
            this.playerCapsule.position.y += this.playerVelocity.y * delta;
        }

        // Stepped collision move
        const capsuleInfo = this.playerCapsule.capsuleInfo;
        const xzSpeed = Math.hypot(this.playerVelocity.x, this.playerVelocity.z);
        const totalDist = this.isFlying ? this.playerVelocity.length() * delta : xzSpeed * delta;
        this.xzDir.set(this.playerVelocity.x, this.isFlying ? this.playerVelocity.y : 0, this.playerVelocity.z).normalize();
        const maxStep = capsuleInfo.radius * 0.8;
        const steps = Math.ceil(totalDist / maxStep) || 1;
        const stepDist = totalDist / steps;
        for (let i = 0; i < steps; i++) {
            this.playerCapsule.position.addScaledVector(this.xzDir, stepDist);
            this.playerCapsule.updateMatrixWorld();

            if (!v.isMovingToBoarding) {
                // Static collision
                applyCapsuleCollision(
                    this.playerCapsule,
                    capsuleInfo,
                    this.collider!,
                    this.staticTemps,
                    (tri: any, dir: THREE.Vector3) => !this.isFlying && this.playerIsOnGround && this.shouldSkipTriCollision(tri, dir),
                );

                // Dynamic collision
                for (const dynEntry of this.dynamicColliders) {
                    this.playerCapsule.updateMatrixWorld();
                    applyCapsuleCollision(
                        this.playerCapsule,
                        capsuleInfo,
                        dynEntry.mesh,
                        this.dynTemps,
                        (tri: any, dir: THREE.Vector3) => !this.isFlying && this.playerIsOnGround && this.shouldSkipTriCollision(tri, dir),
                    );
                }
            }
        }

        // Dynamic platform carries the player
        if (this.activeDynamicCollider && this.playerIsOnGround && !this.isFlying) {
            this.playerCapsule.position.add(this.activeDynamicCollider.deltaPos);
            if (this.activeDynamicCollider.deltaRotY !== 0) {
                this.playerCapsule.rotateY(this.activeDynamicCollider.deltaRotY);
            }
        }

        // Player facing (combat takes over facing during soft-lock attacks)
        const softFace = this.combat.isAttacking && this.combat.softLockFacing && !!this.target.getActive();
        if (!this.isFirstPerson && !softFace) {
            const camDirFlat = this.camDir.clone().setY(0).normalize().negate();
            const moveDirFlat = this.moveDir.clone().normalize().negate();

            if (!this.isFlying) {
                if (this.cam.mouseMode === 4 || this.cam.mouseMode === 5) {
                    // mode 4/5: capsule yaw always matches camera horizontal facing; mouse rotation turns the character
                    this.targetMat.lookAt(this.playerCapsule.position, this.playerCapsule.position.clone().add(camDirFlat), this.playerCapsule.up);
                    this.playerCapsule.quaternion.copy(this.targetQuat.setFromRotationMatrix(this.targetMat));
                } else if (this.cam.mouseMode === 0 || this.cam.mouseMode === 2) {
                    const lookTarget = this.playerCapsule.position.clone().add(moveDirFlat.lengthSq() > 0 ? moveDirFlat : camDirFlat);
                    this.targetMat.lookAt(this.playerCapsule.position, lookTarget, this.playerCapsule.up);
                    this.playerCapsule.quaternion.slerp(this.targetQuat.setFromRotationMatrix(this.targetMat), Math.min(1, this.rotationSpeed * delta));
                } else if (moveDirFlat.lengthSq() > 0) {
                    this.targetMat.lookAt(this.playerCapsule.position, this.playerCapsule.position.clone().add(moveDirFlat), this.playerCapsule.up);
                    this.playerCapsule.quaternion.slerp(this.targetQuat.setFromRotationMatrix(this.targetMat), Math.min(1, this.rotationSpeed * delta));
                }
            } else {
                const lookTarget = this.playerCapsule.position.clone().add(this.input.fwd ? moveDirFlat : camDirFlat);
                this.targetMat.lookAt(this.playerCapsule.position, lookTarget, this.playerCapsule.up);
                this.playerCapsule.quaternion.slerp(this.targetQuat.setFromRotationMatrix(this.targetMat), Math.min(1, this.rotationSpeed * delta));
            }
        }

        // Third-person camera follow
        if (!this.isFirstPerson) {
            const lookTarget = this.cam.springTarget(this.cam.getLookAtPoint(), delta);
            this.camera.position.sub(this.controls.target);
            this.camera.position.add(lookTarget);
            this.controls.target.copy(lookTarget);
            this.controls.update();

            if (!this.cam.zoomEnabled) {
                this.cam.updateWithRaycast(
                    this.controls.target,
                );
            }
        }

        // Mobile vehicle-button proximity
        if (this.isShowMobileControls && this.vehicle.list.length) {
            let near = false;
            for (const veh of this.vehicle.list) {
                this.nearCheckLocal.copy(veh.boardingPoint).multiplyScalar(veh.scale);
                veh.vehicleGroup.localToWorld(this.nearCheckWorld.copy(this.nearCheckLocal));
                if (this.playerCapsule.position.distanceTo(this.nearCheckWorld) < 800 * this.playerModelConfig.scale) { near = true; break; }
            }
            if (near !== this.isNearVehicle) {
                this.isNearVehicle = near;
                this.mobileControls?.syncVehicleBtn(near);
            }
        }

        // Update targeting and combat
        this.target.update(delta);
        this.combat.update(delta);
        // Set animation
        this.animation.setAnimationByPressed();
        // Update animation mixers
        this.animation.updateMixers(delta);
    }

    // ==================== Internal helpers ====================

    // Sync debug visibility
    syncDebugVisibility() {
        if (!this.playerCapsule) return;
        const dbg = this.displayCollider;
        const isVehicle = this.controllerMode === 1;

        // Static collider: shown in both modes
        if (this.collider) {
            if (dbg) { if (!this.scene.children.includes(this.collider)) this.scene.add(this.collider); }
            else this.scene.remove(this.collider);
        }

        // Player capsule wireframe: walk mode only
        (this.playerCapsule.material as THREE.Material).visible = dbg && !isVehicle;

        // Dynamic collider wireframes: walk mode only
        for (const entry of this.dynamicColliders) {
            if (dbg && !isVehicle) { if (!this.scene.children.includes(entry.mesh)) this.scene.add(entry.mesh); }
            else this.scene.remove(entry.mesh);
        }

        // Rapier physics debug: vehicle mode only
        this.vehicle.params.debug.showPhysicsBox = dbg && isVehicle;
        for (const v of this.vehicle.list) {
            if (!v.physicsBoxMesh) continue;
            if (dbg && isVehicle) { if (!v.vehicleGroup.children.includes(v.physicsBoxMesh)) v.vehicleGroup.add(v.physicsBoxMesh); }
            else v.vehicleGroup.remove(v.physicsBoxMesh);
        }
    }

    // Set grounded state
    setOnGround(val: boolean) {
        if (this.playerIsOnGround === val) return;
        this.playerIsOnGround = val;
        this.onGroundChange?.(val);
        if (val) { this.jumpCount = 0; this.animation.onLand(); }
        else this.animation.onBecomeAirborne();
    }

    // Apply gravity
    private applyGravity(delta: number) {
        this.playerVelocity.y += delta * this.gravity;
        this.setOnGround(false);
    }

    // Snap to ground
    private snapToGround(groundY: number) {
        this.playerVelocity.y = 0;
        this.playerCapsule.position.y = groundY;
        this.setOnGround(true);
    }

    // ==================== Jump / dodge / facing ====================

    // Request jump (supports double jump). Fly/vehicle handled by InputSystem.
    requestJump() {
        if (this.controllerMode === 1 || this.isFlying || this.isDodging) return;
        if (this.playerIsOnGround) {
            this.jumpCount = 1;
            this.animation.startJump();
            this.playerVelocity.y = this.jumpHeight;
            this.setOnGround(false);
        } else if (this.jumpCount < this.maxJumps) {
            // Double jump
            this.jumpCount++;
            this.animation.startJump(true);
            this.playerVelocity.y = this.jumpHeight;
            // Back-jump fire: trigger one ranged shot when jumping backward in air (kiting)
            if (this.input.bkd) this.combat.fire();
        }
    }

    // Start dodge/dash (called on double-tap direction). If dirWorld is omitted, use current move dir or facing.
    startDodge(dirWorld?: THREE.Vector3) {
        if (this.controllerMode === 1 || this.isFlying || this.isDodging) return;
        const now = performance.now();
        if (now < this.dodgeCooldownUntil) return;
        const d = this.dodgeDir;
        if (dirWorld && dirWorld.lengthSq() > 1e-6) d.copy(dirWorld);
        else if (this.moveDir.lengthSq() > 1e-6) d.copy(this.moveDir);
        else this.playerCapsule.getWorldDirection(d);
        d.setY(0);
        if (d.lengthSq() < 1e-6) return;
        d.normalize();
        this.isDodging = true;
        this.dodgeTimer = this.dodgeDuration;
        this.dodgeCooldownUntil = now + this.dodgeCooldownMs;
        if (this.dodgeAnimKey) this.animation.play(this.dodgeAnimKey, { force: true });
    }

    // Configure dodge params
    setDodgeOptions(opts: DodgeOptions) {
        if (opts.speed != null) this.dodgeSpeed = opts.speed;
        if (opts.durationMs != null) this.dodgeDuration = opts.durationMs / 1000;
        if (opts.cooldownMs != null) this.dodgeCooldownMs = opts.cooldownMs;
        if (opts.iframes != null) this.dodgeIframes = opts.iframes;
        if (opts.doubleTapMs != null) this.dodgeDoubleTapMs = opts.doubleTapMs;
        if (opts.clip) { this.dodgeAnimKey = "dodge"; this.animation.register("dodge", opts.clip, { loop: false, clampWhenFinished: true }); }
    }

    // Convert local input direction to camera-relative world direction (XZ plane)
    getCameraRelativeDir(localX: number, localZ: number, out = new THREE.Vector3()) {
        this.camera.getWorldDirection(this.camDir);
        const angle = 2 * Math.PI - (Math.atan2(this.camDir.z, this.camDir.x) + Math.PI / 2);
        out.set(localX, 0, localZ);
        if (out.lengthSq() > 0) out.normalize().applyAxisAngle(this.upVector, angle);
        return out;
    }

    // Change scale at runtime
    setPlayerScale(newScale: number) {
        if (newScale <= 0) return;
        const ratio = newScale / this.playerModelConfig.scale;
        this.playerModelConfig.scale = newScale;

        // Update scale-related params
        this.gravity *= ratio;
        this.jumpHeight *= ratio;
        this.playerSpeed *= ratio;
        this.playerFlySpeed *= ratio;
        this.curPlayerSpeed *= ratio;
        this.cam.epsilon *= ratio;
        this.cam.minDist *= ratio;
        this.controls.minDistance *= ratio;
        this.cam.maxDist *= ratio;
        this.cam.originMaxDist *= ratio;

        if (this.isFirstPerson) this.scene.attach(this.camera);
        this.playerCapsule?.scale.multiplyScalar(ratio);
        if (this.playerCapsule?.capsuleInfo) {
            this.playerCapsule.capsuleInfo.radius *= ratio;
            this.playerCapsule.capsuleInfo.segment.end.y *= ratio;
        }
        if (this.isFirstPerson) this.cam.setFirstPerson();
    }

    // Reset player position
    reset(position?: THREE.Vector3) {
        if (!this.playerCapsule) return;
        this.playerVelocity.set(0, 0, 0);
        this.playerCapsule.position.copy(position ?? this.initPos);
    }

    // ==================== API ====================

    // Get current position
    getPosition() { return this.playerCapsule?.position; }
    // Get velocity
    getVelocity() { return this.playerVelocity.clone(); }
    // Get first-person state
    getIsFirstPerson() { return this.isFirstPerson; }
    // Get flying state
    getIsFlying() { return this.isFlying; }
    // Get grounded state
    getIsOnGround() { return this.playerIsOnGround; }
    // Get controller mode
    getControllerMode() { return this.controllerMode; }
    // Get player model
    getPlayerModel() { return this.playerModel; }
    // Get capsule
    getPlayerCapsule() { return this.playerCapsule; }
    // Get active vehicle
    getActiveVehicle() { return this.vehicle.active; }
    // Get all vehicles
    getAllVehicles() { return this.vehicle.list; }
    // Get collider
    getCollider() { return this.collider; }
    // Get dynamic collider currently stood on
    getActiveDynamicCollider() { return this.activeDynamicCollider; }
    // Get dodge state
    getIsDodging() { return this.isDodging; }
    // Whether dodge i-frames are active
    isInvulnerable() { return this.isDodging && this.dodgeIframes; }

    // --- Combat / targeting ---
    // Register a melee move
    registerAttack(key: string, def: AttackDef) { this.combat.registerAttack(key, def); }
    // Register a combo
    registerCombo(name: string, keys: string[], opts?: { primary?: boolean }) { this.combat.registerCombo(name, keys, opts); }
    // LMB melee (primary combo)
    attack() { return this.combat.attackPrimary(); }
    // Heavy attack
    heavyAttack() { return this.combat.attackHeavy(); }
    // RMB aim/fire
    aimFire() { return this.combat.fire(); }
    // Set aiming state
    setAiming(on: boolean) { this.combat.setAiming(on); }
    // MMB knockback
    knock() { return this.combat.knock(); }
    // Register lockable targets
    registerTargets(targets: THREE.Object3D[]) { this.target.register(targets); }
    // Tab cycle targets
    cycleTarget(dir: 1 | -1 = 1) { this.target.cycle(dir); }
    // Clear hard-lock target
    clearTarget() { this.target.clearHard(); }
    // Get active target (hard lock first, else soft lock)
    getActiveTarget() { return this.target.getActive(); }

    // Set mouse sensitivity
    setMouseSensitivity(value: number) {
        this.cam.sensitivity = value;
        this.controls.rotateSpeed = value * 0.05;
    }

    // --- Player params ---
    // Set gravity
    setGravity(gravity: number) { this.gravity = gravity * this.playerModelConfig.scale; }
    // Set jump height
    setJumpHeight(jumpHeight: number) { this.jumpHeight = jumpHeight * this.playerModelConfig.scale; }
    // Set walk speed
    setPlayerSpeed(speed: number) { this.playerSpeed = speed * this.playerModelConfig.scale; this.curPlayerSpeed = this.playerSpeed; }
    // Set fly speed
    setPlayerFlySpeed(flySpeed: number) { this.playerFlySpeed = flySpeed * this.playerModelConfig.scale; }
    // Set facing-input toggle
    setEnableToward(v: boolean) { this.enableToward = v; }

    // --- Camera params ---
    // Set camera min distance
    setMinCamDistance(dist: number) { this.cam.minDist = dist * this.playerModelConfig.scale; }
    // Set camera max distance
    setMaxCamDistance(dist: number) { this.cam.maxDist = dist * this.playerModelConfig.scale; this.cam.originMaxDist = this.cam.maxDist; }
    // Set look-at height ratio
    setCamLookAtHeightRatio(ratio: number) { this.cam.lookAtHeightRatio = ratio; }
    // Set mouse mode
    setThirdMouseMode(mode: 0 | 1 | 2 | 3 | 4 | 5) { this.cam.mouseMode = mode; this.cam.setPointerLock(); }
    // Set zoom toggle
    setEnableZoom(enable: boolean) { this.cam.zoomEnabled = enable; this.controls.enableZoom = enable; }

    // --- Debug ---
    // Toggle debug display
    setDebug(debug: boolean) {
        this.displayCollider = debug;
        this.syncDebugVisibility();
    }

    // --- Animation ---
    // Play animation by name
    playPlayerAnimationByName(name: string, fade?: number) { this.animation.playByName(name, fade); }
    // Register a custom animation
    registerAnimation(key: string, clipName: string, opts?: Parameters<AnimationSystem["register"]>[2]) { this.animation.register(key, clipName, opts); }
    // Play a registered animation
    playAnimation(key: string, opts?: Parameters<AnimationSystem["play"]>[1]) { this.animation.play(key, opts); }
    // Register a locomotion set
    registerLocomotionSet(setName: string, map: Parameters<AnimationSystem["registerLocomotionSet"]>[1]) { this.animation.registerLocomotionSet(setName, map); }
    // Switch locomotion set
    switchLocomotionSet(setName: string, fade?: number) { this.animation.switchLocomotionSet(setName, fade); }
    // Get current animation name
    getCurrentPlayerAnimationName() { return this.animation.getCurrentName(); }
    // Get current locomotion set name
    getCurrentLocomotionSet() { return this.animation.currentLocomotionSet; }

    // --- Camera ---
    // Toggle view mode
    changeView() { this.cam.changeView(); }
    // Set first-person
    setFirstPersonCamera(v = 0) { this.cam.setFirstPerson(v); }
    // Set over-shoulder view
    setOverShoulderView(v: boolean) { this.cam.setOverShoulder(v); }
    // Screen-center raycast
    getCenterScreenRaycastHit() { return this.cam.getCenterHit(); }

    // --- Input ---
    // Set input state
    setInput(input: Parameters<InputSystem["setInput"]>[0]) { this.input.setInput(input); }
    // Custom key map at runtime
    setKeyMap(map?: KeyMap) { this.input.buildKeyMap(map); }
    // Bind input events
    onAllEvent() { this.input.bindEvents(); }
    // Unbind input events
    offAllEvent() { this.input.unbindEvents(); }

    // --- Vehicle ---
    // Load vehicle model
    loadVehicleModel(opts: VehicleOptions) { return this.vehicle.load(opts); }

    // --- Destroy ---
    destroy() {
        this.input.unbindEvents();
        this.combat.dispose();
        this.target.dispose();

        // Clear player objects
        if (this.playerCapsule) { this.playerCapsule.remove(this.camera); this.scene.remove(this.playerCapsule); }
        (this.playerCapsule as any) = null;
        if (this.playerModel) { this.scene.remove(this.playerModel); this.playerModel = null; }

        // Clear colliders and camera
        this.cam.resetControls();
        if (this.visualizer) { this.scene.remove(this.visualizer); this.visualizer = null; }
        if (this.collider) { this.scene.remove(this.collider); this.collider = null; }
        this.mobileControls?.destroy();
        this.mobileControls = null;

        // Clear dynamic colliders
        this.clearDynamicColliders();

        // Clear all vehicles
        for (const v of this.vehicle.list) { this.scene.remove(v.vehicleGroup); v.pathPlanner?.dispose(); v.vehicleController?.destroy?.(); }
        this.vehicle.list = [];
        this.vehicle.active = null;
    }
}
