import * as THREE from "three";
import { acceleratedRaycast, MeshBVH, MeshBVHHelper } from "three-mesh-bvh";
import type { GLTF } from "three/examples/jsm/Addons.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { World } from "@dimforge/rapier3d-compat";

import { MobileControls } from "./utils/mobileControls";
import { loadVehicleModel } from "./utils/vehicleLoader";
import type { PlayerControllerOptions, PlayerModelOptions, VehicleOptions, VehicleInstance } from "./types";

THREE.Mesh.prototype.raycast = acceleratedRaycast;

let controllerInstance: PlayerController | null = null;
const clock = new THREE.Clock();

function isMobileDevice() {
    return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

class PlayerController {

    // ==================== 场景引用 ====================
    loader: GLTFLoader = new GLTFLoader();
    scene!: THREE.Scene;
    camera!: THREE.PerspectiveCamera;
    controls!: OrbitControls;

    // ==================== 玩家配置 ====================
    // 基础引用（由 init 注入）
    playerModel!: PlayerModelOptions;
    initPos!: THREE.Vector3;
    // 物理参数
    gravity: number = -2400;
    jumpHeight: number = 600;
    playerSpeed: number = 300;
    playerFlySpeed: number = 2100;
    curPlayerSpeed: number = 0;
    // 交互参数
    mouseSensitivity: number = 5;
    thirdMouseMode: 0 | 1 | 2 | 3 = 1;
    enableZoom: boolean = false;
    playerFlyEnabled: boolean = true;
    isShowMobileControls: boolean = true;
    enableOverShoulderView: boolean = false;


    // ==================== 玩家胶囊体 ====================
    playerCapsuleRadius: number = 45;
    playerCapsuleHeight: number = 180;
    playerCapsuleRadiusRatio: number = 1;
    isFirstPerson: boolean = false;
    boundingBoxMinY: number = 0;

    // ==================== 运行状态 ====================
    controllerMode: 0 | 1 = 0;   // 0:人物  1:车辆
    playerIsOnGround: boolean = false;
    isupdate: boolean = true;
    isFlying: boolean = false;
    isChangeControllerTransitionTimer: any = null;

    // ==================== 输入按键 ====================
    fwdPressed: boolean = false;
    bkdPressed: boolean = false;
    lftPressed: boolean = false;
    rgtPressed: boolean = false;
    spacePressed: boolean = false;
    ctPressed: boolean = false;
    shiftPressed: boolean = false;

    // ==================== 相机参数 ====================
    camCollisionLerp: number = 0.18;
    camEpsilon: number = 35;
    minCamDistance: number = 100;
    maxCamDistance: number = 440;
    orginMaxCamDistance: number = 440;

    // ==================== 场景碰撞体 ====================
    collider: THREE.Mesh | null = null;
    visualizer: MeshBVHHelper | null = null;
    player!: THREE.Mesh & { capsuleInfo?: any };
    person: THREE.Object3D | null = null;
    personHead: THREE.Object3D | null = null;
    collected: THREE.BufferGeometry[] = [];
    dynamicCollider: THREE.Mesh | null = null;
    dynamicCollected: THREE.BufferGeometry[] = [];

    // ==================== 车辆系统 ====================
    vehicles: VehicleInstance[] = [];
    activeVehicle: VehicleInstance | null = null;
    vehicleLength: number = 6;
    RAPIER: any | null = null;
    world: World | null = null;
    wheelSteeringQuat = new THREE.Quaternion();
    wheelRotationQuat = new THREE.Quaternion();
    camBehindDir = new THREE.Vector3(0, 0, 1);
    vehicleParams = {
        debug: { showPhysicsBox: false },
        chassis: { linearDamping: 0.5, angularDamping: 0.5 },
        model: { rotation: -Math.PI / 2 },
        power: { accelerateForce: 50, brakeForce: 200, maxSpeed: 10000 },
        steering: { maxSteerAngle: Math.PI / 4, steerSpeed: 0.5, steerReturnSpeed: 1 },
        followVehicleDirection: true,
    };

    // ==================== 上车流程 ====================
    isMovingToBoardingPoint: boolean = false;
    boardingWaypoints: THREE.Vector3[] = [];
    currentWaypointIndex: number = 0;
    boardingTargetDir: THREE.Vector3 | null = null;
    boardingMoveSpeed: number = 300;
    boardingRotateSpeed: number = 10;
    boardingPointWorld: THREE.Vector3 | null = null;
    isBoardingAnimPlaying: boolean = false;
    closeDoorTriggered: boolean = false;
    isExitAnimPlaying: boolean = false;
    closeExitDoorTriggered: boolean = false;
    closeVehicleDoorTimer: any | null = null;
    flip180Quat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);

    // ==================== 动画系统 ====================
    personMixer?: THREE.AnimationMixer;
    personMixerFinishedCb?: (ev: any) => void;
    personActions?: Map<string, THREE.AnimationAction>;
    actionState!: THREE.AnimationAction;
    animationSets: Map<string, Map<string, THREE.AnimationAction>> = new Map();
    recheckAnimTimer: any | null = null;
    allAnimations: THREE.AnimationClip[] = [];

    // ==================== 移动端控制 ====================
    mobileControls: MobileControls | null = null;
    nearCheckLocal = new THREE.Vector3();
    nearCheckWorld = new THREE.Vector3();
    isNearVehicle = false;

    // ==================== 调试显示 ====================
    displayPlayer: boolean = false;
    displayCollider: boolean = false;
    displayVisualizer: boolean = false;

    // ==================== 方向常量 ====================
    rotationSpeed = 10;
    DIR_FWD = new THREE.Vector3(0, 0, -1);
    DIR_BKD = new THREE.Vector3(0, 0, 1);
    DIR_LFT = new THREE.Vector3(-1, 0, 0);
    DIR_RGT = new THREE.Vector3(1, 0, 0);
    DIR_UP = new THREE.Vector3(0, 1, 0);

    // ==================== 复用向量 ====================
    upVector = new THREE.Vector3(0, 1, 0);
    playerVelocity = new THREE.Vector3();
    camDir = new THREE.Vector3();
    moveDir = new THREE.Vector3();
    targetQuat = new THREE.Quaternion();
    targetMat = new THREE.Matrix4();
    tempVector = new THREE.Vector3();
    tempVector2 = new THREE.Vector3();
    tempBox = new THREE.Box3();
    tempMat = new THREE.Matrix4();
    tempSegment = new THREE.Line3();

    // ==================== 射线检测 ====================
    personToCam = new THREE.Vector3();
    originTmp = new THREE.Vector3();
    raycaster = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0));
    raycasterPersonToCam = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3());
    centerRay = new THREE.Raycaster();
    centerMouse = new THREE.Vector2();

    constructor() {
        (this.raycaster as any).firstHitOnly = true;
        (this.raycasterPersonToCam as any).firstHitOnly = true;
    }

    // ==================== 初始化 ====================

    // 初始化控制器
    async init(opts: PlayerControllerOptions, callback?: () => void) {
        const m = opts.playerModel;
        const s = m.scale ?? 1;

        // 场景引用赋值
        this.scene = opts.scene;
        this.camera = opts.camera;
        this.camera.rotation.order = "YXZ";
        this.controls = opts.controls;

        // 玩家模型配置
        this.playerModel = m;
        this.initPos = opts.initPos
            ? new THREE.Vector3(opts.initPos.x, opts.initPos.y, opts.initPos.z)
            : new THREE.Vector3(0, 0, 0);

        // 物理运行时值  传入值/字段默认值 * scale
        const pm = this.playerModel;
        this.gravity = (pm.gravity ?? this.gravity) * s;
        this.jumpHeight = (pm.jumpHeight ?? this.jumpHeight) * s;
        this.playerSpeed = (pm.speed ?? this.playerSpeed) * s;
        this.playerFlySpeed = (pm.flySpeed ?? this.playerFlySpeed) * s;
        this.curPlayerSpeed = this.playerSpeed;
        this.playerFlyEnabled = pm.flyEnabled ?? this.playerFlyEnabled;
        this.playerCapsuleRadiusRatio = pm.capsuleRadiusRatio ?? this.playerCapsuleRadiusRatio;

        // 相机参数
        this.mouseSensitivity = opts.mouseSensitivity ?? this.mouseSensitivity;
        this.thirdMouseMode = opts.thirdMouseMode ?? this.thirdMouseMode;
        this.enableZoom = opts.enableZoom ?? this.enableZoom;
        this.minCamDistance = (opts.minCamDistance ?? this.minCamDistance) * s;
        this.maxCamDistance = (opts.maxCamDistance ?? this.maxCamDistance) * s;
        this.orginMaxCamDistance = this.maxCamDistance;
        this.camEpsilon = this.camEpsilon * s;

        // UI 参数
        this.isShowMobileControls = (opts.isShowMobileControls ?? this.isShowMobileControls) && isMobileDevice();
        this.enableOverShoulderView = opts.enableOverShoulderView ?? this.enableOverShoulderView;

        // 移动端控制
        if (this.isShowMobileControls) {
            this.mobileControls = new MobileControls(i => this.setInput(i), this.controls);
            await this.mobileControls.init(opts.mobileControls);
        }

        await this.createBVH(opts.colliderMeshUrl);
        await this.loadPersonGLB();

        this.onAllEvent();
        this.setCameraPos();
        this.setControls();
        this.setOverShoulderView(this.enableOverShoulderView);
        callback?.();
    }

    // 过肩视角切换
    setOverShoulderView(enable: boolean) {
        if (!enable || this.controllerMode === 1) { this.camera.clearViewOffset(); return; }
        const w = window.innerWidth;
        const h = window.innerHeight;
        this.camera.setViewOffset(w, h, w * 0.15, 0, w, h);
    }

    // 初始化加载器
    async initLoader() {
        const dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath("https://unpkg.com/three@0.182.0/examples/jsm/libs/draco/gltf/");
        this.loader.setDRACOLoader(dracoLoader);
    }

    // 初始化物理引擎
    async initRapier() {
        if (this.RAPIER) return;
        this.RAPIER = await import("@dimforge/rapier3d-compat");
        await this.RAPIER.init();

        this.world = new this.RAPIER.World(new this.RAPIER.Vector3(0, -9.81, 0)) as World;
        (this.world as any).maxCcdSubsteps = 2;

        const addTrimesh = (RAPIER: any, world: any, geom: THREE.BufferGeometry) => {
            let g = geom.index ? geom.clone().toNonIndexed() : geom.clone();
            const pos = g.attributes.position;
            const count = pos.count;
            const verts = new Float32Array(count * 3);
            const tmp = new THREE.Vector3();
            for (let i = 0; i < count; i++) {
                tmp.fromBufferAttribute(pos, i);
                verts[i * 3] = tmp.x; verts[i * 3 + 1] = tmp.y; verts[i * 3 + 2] = tmp.z;
            }
            const indices = count > 65535 ? new Uint32Array(count) : new Uint16Array(count);
            for (let i = 0; i < count; i++) indices[i] = i;

            const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
            world.createCollider(
                RAPIER.ColliderDesc.trimesh(verts, indices).setRestitution(0).setFriction(0.8),
                body,
            );
        };

        for (const g of this.collected) addTrimesh(this.RAPIER, this.world, g);

        const groundBody = this.world.createRigidBody(this.RAPIER.RigidBodyDesc.fixed());
        groundBody.userData = { outOfBounds: true };
    }

    // ==================== 玩家模型 ====================

    // 加载玩家模型
    async loadPersonGLB() {
        try {
            const gltf = await this.loader.loadAsync(this.playerModel.url) as GLTF;
            this.person = gltf.scene;

            // 绑定动画
            this.personMixer = new THREE.AnimationMixer(this.person);
            const animations = gltf.animations ?? [];
            // console.log('animations', animations)
            this.allAnimations = animations;
            this.personActions = new Map();

            const mappings: [string, string][] = [
                [this.playerModel.idleAnim, "idle"],
                [this.playerModel.walkAnim, "walking"],
                [this.playerModel.leftWalkAnim || this.playerModel.walkAnim, "left_walking"],
                [this.playerModel.rightWalkAnim || this.playerModel.walkAnim, "right_walking"],
                [this.playerModel.backwardAnim || this.playerModel.walkAnim, "walking_backward"],
                [this.playerModel.jumpAnim, "jumping"],
                [this.playerModel.runAnim, "running"],
                [this.playerModel.flyIdleAnim || this.playerModel.idleAnim, "flyidle"],
                [this.playerModel.flyAnim || this.playerModel.idleAnim, "flying"],
                [this.playerModel.enterCarAnim || this.playerModel.idleAnim, "enterCar"],
                [this.playerModel.exitCarAnim || this.playerModel.idleAnim, "exitCar"],
            ];

            for (const [clipName, actionName] of mappings) {
                const clip = animations.find(a => a.name === clipName);
                if (!clip) continue;
                const action = this.personMixer.clipAction(clip);
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
                this.personActions.set(actionName, action);
            }

            // 保存默认动画集
            const defaultSet = new Map<string, THREE.AnimationAction>();
            const locomotionKeys = ["idle", "walking", "walking_backward", "running", "jumping", "flyidle", "flying"];
            for (const key of locomotionKeys) {
                const action = this.personActions.get(key);
                if (action) defaultSet.set(key, action);
            }
            this.animationSets.set("default", defaultSet);

            // 执行idle动画
            this.personActions.get("idle")?.setEffectiveWeight(1);
            this.personActions.get("idle")?.play();
            this.actionState = this.personActions.get("idle")!;

            // 动画结束回调
            this.personMixerFinishedCb = (ev: any) => {
                const done: THREE.AnimationAction = ev.action;
                if (done === this.personActions?.get("jumping")) {
                    if (this.fwdPressed) { this.playPersonAnimationByName(this.shiftPressed ? "running" : "walking"); return; }
                    if (this.bkdPressed) { this.playPersonAnimationByName("walking_backward"); return; }
                    if (this.rgtPressed || this.lftPressed) { this.playPersonAnimationByName("walking"); return; }
                    this.playPersonAnimationByName("idle");
                }
                if (done === this.personActions?.get("enterCar")) this.onEnterCarAnimFinished();
            };
            this.personMixer.addEventListener("finished", this.personMixerFinishedCb);

            // 步进到第一帧，让骨骼更新到idle姿态
            this.personMixer.update(0);
            // 强制更新世界矩阵
            this.person.updateMatrixWorld(true);

            // 计算胶囊体尺寸
            const { size } = this.getBbox(this.person);
            const modelScale = this.playerCapsuleHeight / size.y;
            this.playerCapsuleRadius = Number(Math.min(size.x, size.z).toFixed(0)) * modelScale * this.playerCapsuleRadiusRatio;
            this.playerCapsuleHeight = Number(size.y.toFixed(0)) * modelScale;

            const s = this.playerModel.scale;
            const r = this.playerCapsuleRadius * s;
            const h = this.playerCapsuleHeight * s;

            // 创建碰撞胶囊体
            this.player = new THREE.Mesh(
                new RoundedBoxGeometry(r * 2, h, r * 2, 1, 75),
                new THREE.MeshStandardMaterial({
                    color: new THREE.Color(1, 0, 0),
                    shadowSide: THREE.DoubleSide,
                    depthTest: false, transparent: true,
                    opacity: this.displayPlayer ? 0.5 : 0,
                    wireframe: true, depthWrite: false,
                }),
            );
            this.player.geometry.translate(0, -h * 0.25, 0);
            this.player.capsuleInfo = {
                radius: r,
                segment: new THREE.Line3(new THREE.Vector3(), new THREE.Vector3(0, -h * 0.5, 0)),
            };
            this.player.name = "capsule";
            this.scene.add(this.player);
            this.reset();
            this.player.rotateY(this.playerModel.rotateY ?? 0);

            // 摆放视觉模型
            this.person.scale.multiplyScalar(modelScale * s);
            this.person.position.set(0, -h * 0.75, 0);
            this.person.traverse((child: any) => {
                if (child.name === this.playerModel?.headObjName) this.personHead = child;
            });
            this.player.add(this.person);
            this.reset();


        } catch (e) {
            console.error("加载玩家模型失败:", e);
        }
    }

    // 切换玩家模型
    async switchPlayerModel(newPlayerModel: PlayerModelOptions) {
        const savedPos = this.player.position.clone();
        const savedQuat = this.player.quaternion.clone();
        const wasFirstPerson = this.isFirstPerson;

        // 清理旧模型
        if (wasFirstPerson) this.scene.attach(this.camera);
        if (this.player) this.scene.remove(this.player);
        if (this.person) { this.player.remove(this.person); this.person = null; this.personHead = null; }

        if (this.personMixer) {
            if (this.personMixerFinishedCb) {
                this.personMixer.removeEventListener("finished", this.personMixerFinishedCb);
                this.personMixerFinishedCb = undefined;
            }
            this.personMixer.stopAllAction();
            this.personMixer.uncacheRoot(this.personMixer.getRoot());
            this.personMixer = undefined;
            this.personActions = undefined;
        }

        // 等比缩放物理参数
        const ratio = newPlayerModel.scale / this.playerModel.scale;
        this.playerModel = { ...this.playerModel, ...newPlayerModel };

        this.gravity *= ratio;
        this.jumpHeight *= ratio;
        this.playerSpeed *= ratio;
        this.playerFlySpeed *= ratio;
        this.curPlayerSpeed *= ratio;
        this.camEpsilon *= ratio;
        this.minCamDistance *= ratio;
        this.maxCamDistance *= ratio;
        this.orginMaxCamDistance *= ratio;

        // 重新加载
        await this.loadPersonGLB();
        this.player.position.copy(savedPos);
        this.player.quaternion.copy(savedQuat);
        if (wasFirstPerson) this.setFirstPersonCamera();
        this.setDebug(this.displayCollider);
    }

    // 播放动画
    playPersonAnimationByName(name: string, fade = 0.18) {
        if (!this.personActions || this.ctPressed) return;
        const next = this.personActions.get(name);
        if (!next || this.actionState === next) return;

        const prev = this.actionState;
        next.reset();
        next.setEffectiveWeight(1);

        // 上下车动画单次播放
        if (name === "enterCar" || name === "exitCar") {
            const duration = next.getClip().duration;
            const enterTime = this.activeVehicle?.enterVehicleTime ?? 1.5;
            next.setEffectiveTimeScale(duration / enterTime);
            next.setLoop(THREE.LoopOnce, 1);
            next.clampWhenFinished = true;
        }

        next.play();
        if (prev && prev !== next) { prev.fadeOut(fade); next.fadeIn(fade); }
        else next.fadeIn(fade);

        this.actionState = next;
    }

    // 注册自定义动画
    registerAnimation(key: string, clipName: string, opts?: {
        loop?: boolean;
        timeScale?: number;
        duration?: number;
        clampWhenFinished?: boolean;
        onFinished?: () => void; // 播完回调
    }) {
        if (!this.personMixer || !this.personActions) return;

        const mixer = this.personMixer;
        const clip = this.allAnimations.find(c => c.name === clipName);
        if (!clip) { console.warn(`找不到 "${clipName}" 动画`); return; }

        const action = mixer.clipAction(clip);

        const timeScale = opts?.duration
            ? clip.duration / opts.duration
            : (opts?.timeScale ?? 1);
        action.setLoop(opts?.loop === false ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
        action.clampWhenFinished = opts?.clampWhenFinished ?? false;
        action.setEffectiveTimeScale(timeScale);
        action.enabled = true;
        action.setEffectiveWeight(0);

        this.personActions.set(key, action);

        // 注册回调
        if (opts?.onFinished) {
            this.personMixer.addEventListener("finished", (ev: any) => {
                if (ev.action === action) opts.onFinished!();
            });
        }
    }

    // 注册locomotion动画集（idle/walking/running/jumping等替换用）
    registerLocomotionSet(setName: string, map: Partial<Record<"idle" | "walking" | "walking_backward" | "running" | "jumping" | "flyidle" | "flying", string>>) {
        if (!this.personMixer) return;
        const set = new Map<string, THREE.AnimationAction>();
        for (const [key, clipName] of Object.entries(map) as [string, string][]) {
            const clip = this.allAnimations.find(c => c.name === clipName);
            if (!clip) { console.warn(`registerLocomotionSet: 找不到 "${clipName}"`); continue; }
            const action = this.personMixer.clipAction(clip);
            if (key === "jumping") {
                action.setLoop(THREE.LoopOnce, 1);
                action.clampWhenFinished = true;
                action.setEffectiveTimeScale(1.2);
            } else {
                action.setLoop(THREE.LoopRepeat, Infinity);
                action.setEffectiveTimeScale(1);
            }
            action.enabled = true;
            action.setEffectiveWeight(0);
            set.set(key, action);
        }
        this.animationSets.set(setName, set);
    }

    // 切换locomotion动画集
    switchLocomotionSet(setName: string, fade = 0.18) {
        if (!this.personActions) return;
        const set = this.animationSets.get(setName);
        if (!set) { console.warn(`switchLocomotionSet: 未找到集合 "${setName}"`); return; }
        for (const [key, newAction] of set.entries()) {
            const oldAction = this.personActions.get(key);
            if (oldAction === newAction) continue;
            if (oldAction) { oldAction.fadeOut(fade); }
            this.personActions.set(key, newAction);
            // 若当前正在播放该 key，立即接管
            if (this.actionState === oldAction) {
                newAction.reset();
                newAction.setEffectiveWeight(1);
                newAction.fadeIn(fade);
                newAction.play();
                this.actionState = newAction;
            }
        }
    }

    // 外部播放动画
    playAnimation(key: string, opts?: {
        fade?: number;           // 过渡时间
        force?: boolean;         // 强制重置重播
    }) {
        if (!this.personActions) return;
        if (!this.personActions.has(key)) {
            console.warn(`playAnimation: "${key}" 未注册`); return;
        }
        if (opts?.force) {
            const action = this.personActions.get(key)!;
            action.reset();
        }
        this.playPersonAnimationByName(key, opts?.fade ?? 0.18);
    }

    // ==================== 车辆 ====================

    // 加载车辆模型
    async loadVehicleModel(opts: VehicleOptions) {
        try {
            if (!this.playerModel.enterCarAnim) {
                return console.warn("未配置上车动画，不执行车辆相关逻辑");
            }
            await this.initRapier();
            if (!this.world) return;

            const instance = await loadVehicleModel(opts, {
                loader: this.loader,
                scene: this.scene,
                world: this.world,
                RAPIER: this.RAPIER,
                vehicleParams: this.vehicleParams,
                vehicleLength: this.vehicleLength,
                playerScale: this.playerModel.scale,
            });

            this.vehicles.push(instance);
            this.setControllerTransition();
        } catch (e) {
            console.error("加载车辆模型失败:", e);
        }
    }

    // 获取包围盒
    getBbox(object: THREE.Object3D) {
        const bbox = new THREE.Box3().setFromObject(object);
        const center = new THREE.Vector3();
        const size = new THREE.Vector3();
        bbox.getCenter(center);
        bbox.getSize(size);
        return { bbox, center, size };
    }

    // 开关车门动画
    openVehicleDoor(isOpen = true) {
        const v = this.activeVehicle;
        if (!v?.vehicleActions) return;
        const next = v.vehicleActions.get("openDoor");
        if (!next) return;

        const duration = next.getClip().duration;
        next.reset();
        next.setEffectiveWeight(1);

        if (isOpen) {
            next.setEffectiveTimeScale(duration * 2);
            next.time = 0;
            v.vehiclIsOpenDoor = true;
        } else {
            next.setEffectiveTimeScale(-duration * 2);
            next.time = duration;
            v.vehiclIsOpenDoor = false;
        }

        next.setLoop(THREE.LoopOnce, 1);
        next.clampWhenFinished = true;
        next.play();
    }

    // 触发上车流程
    enterVehicle() {
        if (!this.vehicles.length || this.isMovingToBoardingPoint) return;

        // 寻找最近可上车辆
        let nearestVehicle: VehicleInstance | null = null;
        let nearestDist = Infinity;
        let nearBoardingPointWorld: THREE.Vector3 | null = null;

        for (const v of this.vehicles) {
            const boardingLocal = v.boardingPoint.clone().multiplyScalar(v.scale);
            const boardingWorld = v.vehicleGroup.localToWorld(boardingLocal);
            const dist = this.player.position.distanceTo(boardingWorld);
            if (dist < 800 * this.playerModel.scale && dist < nearestDist) {
                nearestDist = dist;
                nearestVehicle = v;
                nearBoardingPointWorld = boardingWorld;
            }
        }

        if (!nearestVehicle || !nearBoardingPointWorld) return;

        this.activeVehicle = nearestVehicle;
        const v = nearestVehicle;
        const vel = v.chassisBody.linvel();
        if (Math.sqrt(vel.x ** 2 + vel.z ** 2) > 0.1) return;

        // 启动寻路
        this.boardingPointWorld = nearBoardingPointWorld;
        this.boardingWaypoints = v.pathPlanner.findPath(this.player.position.clone(), nearBoardingPointWorld);
        this.currentWaypointIndex = 0;
        this.boardingTargetDir = new THREE.Vector3(0, 0, 1).applyQuaternion(v.vehicleGroup.quaternion).normalize();
        this.isMovingToBoardingPoint = true;
        this.playPersonAnimationByName("walking");
    }

    // 寻路移动到上车点
    updateMoveToBoardingPoint(delta: number) {
        if (!this.isMovingToBoardingPoint || !this.boardingTargetDir || !this.boardingWaypoints.length) return;

        if (this.currentWaypointIndex >= this.boardingWaypoints.length) {
            this.finalizeBoarding(delta);
            return;
        }

        const waypoint = this.boardingWaypoints[this.currentWaypointIndex];
        const currentPos = this.player.position.clone();
        const isLast = this.currentWaypointIndex === this.boardingWaypoints.length - 1;
        const threshold = isLast ? 0 : 10 * this.playerModel.scale;
        const horizDist = new THREE.Vector2(waypoint.x - currentPos.x, waypoint.z - currentPos.z).length();

        if (horizDist > threshold) {
            const moveDir = new THREE.Vector3(waypoint.x - currentPos.x, 0, waypoint.z - currentPos.z).normalize();
            this.player.position.add(moveDir.clone().multiplyScalar(Math.min(this.boardingMoveSpeed * this.playerModel.scale * delta, horizDist)));
            this.targetMat.lookAt(this.player.position, this.player.position.clone().add(moveDir), this.player.up);
            this.targetQuat.setFromRotationMatrix(this.targetMat).multiply(this.flip180Quat);
            this.player.quaternion.slerp(this.targetQuat, Math.min(1, this.boardingRotateSpeed * delta));
        } else {
            this.currentWaypointIndex++;
        }
    }

    // 最终对齐朝向
    finalizeBoarding(delta: number) {
        const v = this.activeVehicle;
        if (!this.boardingTargetDir || !v || !this.isMovingToBoardingPoint) return;

        const currentDir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.player.quaternion).normalize();
        if (currentDir.angleTo(this.boardingTargetDir) > 0.01) {
            // 持续旋转对齐
            const lookTarget = this.player.position.clone().add(this.boardingTargetDir);
            this.targetMat.lookAt(this.player.position, lookTarget, this.player.up);
            this.targetQuat.setFromRotationMatrix(this.targetMat);
            this.player.quaternion.slerp(this.targetQuat, Math.min(1, this.boardingRotateSpeed * delta));
        } else {
            // 对齐完成，播放上车动画
            this.boardingWaypoints = [];
            this.currentWaypointIndex = 0;
            this.boardingTargetDir = null;
            v.pathPlanner?.clearVisualization();

            this.playPersonAnimationByName("enterCar");
            this.isBoardingAnimPlaying = true;
            this.closeDoorTriggered = false;
            if (!v.vehiclIsOpenDoor) this.openVehicleDoor();
            this.player.rotation.copy(v.vehicleGroup.rotation);
            this.player.quaternion.multiply(this.flip180Quat);
        }
    }

    // 上车动画完成
    onEnterCarAnimFinished() {
        const v = this.activeVehicle;
        if (!v || !this.isMovingToBoardingPoint) return;
        this.player.updateMatrixWorld(true);
        const offsetY = this.boardingPointWorld!.y - this.player.position.y;
        this.controllerMode = 1;
        this.syncMobileControllerMode();
        this.setOverShoulderView(false);
        v.vehicleGroup.attach(this.player);
        this.player.position.add(v.seatOffset.clone().multiplyScalar(v.scale).add(new THREE.Vector3(0, offsetY, 0)));
        this.isMovingToBoardingPoint = false;
    }

    // 触发下车流程
    exitVehicle() {
        const v = this.activeVehicle;
        if (!v) return;

        // 重置上车状态
        this.isMovingToBoardingPoint = false;
        this.boardingWaypoints = [];
        this.currentWaypointIndex = 0;
        this.boardingTargetDir = null;

        // 播放下车动画
        const vel = v.chassisBody.linvel();
        if (Math.sqrt(vel.x ** 2 + vel.z ** 2) < 0.1) {
            this.playPersonAnimationByName("exitCar");
            this.isExitAnimPlaying = true;
            this.closeExitDoorTriggered = false;
        } else {
            this.playPersonAnimationByName("idle");
        }

        this.openVehicleDoor(true);
        this.controllerMode = 0;
        this.syncMobileControllerMode();
        this.setOverShoulderView(this.enableOverShoulderView);
        this.scene.attach(this.player);
        if (this.isFirstPerson) this.setFirstPersonCamera();
        this.setControllerTransition();
    }

    // ==================== 相机与视角 ====================

    // 切换第一/三人称
    changeView() {
        this.isFirstPerson = !this.isFirstPerson;
        if (this.isFirstPerson) {
            // 读取人物当前世界朝向（本地+Z轴），对齐到第一人称控制轴
            const playerFwd = new THREE.Vector3(0, 0, 1).applyQuaternion(this.player.quaternion);
            // 水平分量
            const flatDir = new THREE.Vector3(playerFwd.x, 0, playerFwd.z).normalize();
            if (flatDir.lengthSq() > 0.001) {
                const yAngle = Math.atan2(flatDir.x, flatDir.z);
                this.player.rotation.set(0, yAngle, 0);
            }
            this.setFirstPersonCamera();
            this.setOverShoulderView(false);
        } else {
            this.controls.enabled = true;
            this.scene.attach(this.camera);
            const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.player.quaternion);
            const angle = Math.atan2(dir.z, dir.x);
            const s = this.playerModel.scale;
            this.camera.position.copy(this.player.position).add(new THREE.Vector3(Math.cos(angle) * 400 * s, 200 * s, Math.sin(angle) * 400 * s));
            this.controls.target.copy(this.player.position);
            this.controls.enableZoom = this.enableZoom;
            this.setOverShoulderView(this.enableOverShoulderView);
        }
        this.setPointerLock();
    }

    // 设置第一人称相机
    setFirstPersonCamera(vertAngle = 0) {
        this.controls.enabled = false;
        if (this.personHead) {
            this.personHead.attach(this.camera);
            this.camera.position.set(0, 10, 20);
        } else {
            this.player.attach(this.camera);
            this.camera.position.set(0, 40 * this.playerModel.scale, 30 * this.playerModel.scale);
        }
        // Y固定π，X保留垂直角度
        this.camera.rotation.set(
            THREE.MathUtils.clamp(vertAngle, -1.1, 1.4),
            Math.PI,
            0,
        );
        this.controls.enableZoom = false;
    }

    // 设置鼠标锁定
    setPointerLock() {
        if (!document.body.requestPointerLock) return;
        if (((this.thirdMouseMode === 0 || this.thirdMouseMode === 1) && !this.isFirstPerson) || this.isFirstPerson) {
            document.body.requestPointerLock();
        } else {
            document.exitPointerLock();
        }
    }

    // 初始相机位置
    setCameraPos() {
        requestAnimationFrame(() => {
            if (!this.isFirstPerson) {
                const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.player.quaternion);
                const angle = Math.atan2(dir.z, dir.x);
                const s = this.playerModel.scale;
                this.camera.position.copy(this.player.position)
                    .add(new THREE.Vector3(Math.cos(angle) * 400 * s, 200 * s, Math.sin(angle) * 400 * s));
                this.controls.enableZoom = this.enableZoom;
            } else {
                this.person!.add(this.camera);
                this.camera.position.set(0, 40 * this.playerModel.scale, 30 * this.playerModel.scale);
            }
            this.camera.updateProjectionMatrix();
        });
    }

    // 初始化轨道控制
    setControls() {
        this.controls.enableZoom = this.enableZoom;
        this.controls.rotateSpeed = this.mouseSensitivity * 0.05;
        this.controls.maxPolarAngle = Math.PI * (300 / 360);
        this.controls.mouseButtons = { LEFT: 0, MIDDLE: 1, RIGHT: 2 };
    }

    // 重置轨道控制
    resetControls() {
        if (!this.controls) return;
        this.controls.enabled = true;
        this.controls.enablePan = true;
        this.controls.maxPolarAngle = Math.PI / 2;
        this.controls.rotateSpeed = 1;
        this.controls.enableZoom = true;
        this.controls.mouseButtons = { LEFT: 0, MIDDLE: 1, RIGHT: 2 };
    }

    // 视角旋转处理
    setToward(dx: number, dy: number, speed: number) {
        const sens = this.mouseSensitivity;
        if (this.controllerMode === 0) {
            // 人物模式
            if (this.isFirstPerson) {
                if (this.isMovingToBoardingPoint) return;
                this.player.rotateY(-dx * speed * sens);
                this.camera.rotation.x = THREE.MathUtils.clamp(this.camera.rotation.x + (-dy * speed * sens), -1.1, 1.4);
            } else {
                this.orbitCamera(this.player.position, -dx * speed * sens, -dy * speed * sens);
            }
        } else {
            // 车辆模式
            const v = this.activeVehicle;
            if (!v) return;
            if (this.isFirstPerson) {
                this.camera.rotation.y = THREE.MathUtils.clamp(this.camera.rotation.y + (-dx * speed * sens), Math.PI * (3 / 4), Math.PI * (5 / 4));
                this.camera.rotation.x = THREE.MathUtils.clamp(this.camera.rotation.x + (-dy * speed * sens), 0, Math.PI * (1 / 3));
            } else {
                this.orbitCamera(v.vehicleGroup.position, -dx * speed * sens, -dy * speed * sens);
            }
        }
    }

    // 球面轨道旋转
    private orbitCamera(target: THREE.Vector3, deltaX: number, deltaY: number) {
        const distance = this.camera.position.distanceTo(target);
        const cur = this.camera.position.clone().sub(target);
        let theta = Math.atan2(cur.x, cur.z) + deltaX;
        let phi = Math.acos(THREE.MathUtils.clamp(cur.y / distance, -1, 1)) + deltaY;
        phi = Math.max(0.1, Math.min(Math.PI - 0.1, phi));
        this.camera.position.set(
            target.x + distance * Math.sin(phi) * Math.sin(theta),
            target.y + distance * Math.cos(phi),
            target.z + distance * Math.sin(phi) * Math.cos(theta),
        );
        this.camera.lookAt(target);
    }

    // ==================== 碰撞体构建 ====================

    // 补全几何属性
    ensureAttributesMinimal(geom: THREE.BufferGeometry): THREE.BufferGeometry | null {
        if (!geom.attributes.position) return null;
        if (!geom.attributes.normal) geom.computeVertexNormals();
        if (!geom.attributes.uv) {
            const count = geom.attributes.position.count;
            geom.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(count * 2), 2));
        }
        return geom;
    }

    // 统一几何属性格式
    unifiedAttribute(collected: THREE.BufferGeometry[]) {
        type AttrMeta = { itemSize: number; arrayCtor: any; examples: number; normalized: boolean };
        const attrMap = new Map<string, AttrMeta>();
        const attrConflict = new Set<string>();
        const required = new Set(["position", "normal", "uv"]);

        // 剔除非必要属性
        for (const g of collected)
            for (const name of Object.keys(g.attributes))
                if (!required.has(name)) g.deleteAttribute(name);

        // 统计属性元信息
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

        // 移除冲突属性
        for (const name of attrConflict) {
            for (const g of collected) if (g.attributes[name]) g.deleteAttribute(name);
            attrMap.delete(name);
        }

        // 补全缺失属性
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

    // 构建静态 BVH
    async createBVH(meshUrl = ""): Promise<void> {
        await this.initLoader();

        const collectMesh = (mesh: THREE.Mesh) => {
            try {
                let geom = (mesh.geometry as THREE.BufferGeometry).clone();
                geom.applyMatrix4(mesh.matrixWorld);
                if (geom.index) geom = geom.toNonIndexed();
                const safe = this.ensureAttributesMinimal(geom);
                if (safe) this.collected.push(safe);
            } catch (e) {
                console.warn("处理网格时出错：", mesh, e);
            }
        };

        // 收集网格
        if (meshUrl === "") {
            if (this.collider) { this.scene.remove(this.collider); this.collider = null; }
            this.scene.traverse(c => {
                const m = c as THREE.Mesh;
                if (m?.isMesh && m.geometry && c.name !== "capsule") collectMesh(m);
            });
        } else {
            const gltf = await this.loader.loadAsync(meshUrl);
            const root = gltf.scene.children[0] as any;
            if (root?.geometry) {
                collectMesh(root);
            } else {
                root?.traverse((c: any) => {
                    if (c?.isMesh && c.geometry && c.name !== "capsule") collectMesh(c);
                });
            }
        }

        if (!this.collected.length) return;
        this.collected = this.unifiedAttribute(this.collected);

        // 合并并生成 BVH
        const merged = BufferGeometryUtils.mergeGeometries(this.collected, false);
        if (!merged) { console.error("合并几何失败"); return; }

        (merged as any).boundsTree = new MeshBVH(merged, { maxDepth: 100 });
        this.collider = new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ opacity: 0.5, transparent: true, wireframe: true, depthTest: true, side: THREE.DoubleSide }));

        if (this.displayCollider) this.scene.add(this.collider);
        if (this.displayVisualizer) {
            if (this.visualizer) this.scene.remove(this.visualizer);
            this.visualizer = new MeshBVHHelper(this.collider, 0);
            this.scene.add(this.visualizer);
        }
        this.boundingBoxMinY = (this.collider as any).geometry.boundingBox.min.y;
    }

    // 构建动态 BVH
    createDynamicBVH(objects: THREE.Object3D[] = []) {
        if (this.dynamicCollider) { this.scene.remove(this.dynamicCollider); this.dynamicCollider = null; }
        this.dynamicCollected = [];

        objects.forEach(obj => obj.traverse(c => {
            const m = c as THREE.Mesh;
            if (m?.isMesh && m.geometry && c.name !== "capsule") {
                try {
                    let geom = (m.geometry as THREE.BufferGeometry).clone();
                    geom.applyMatrix4(m.matrixWorld);
                    if (geom.index) geom = geom.toNonIndexed();
                    const safe = this.ensureAttributesMinimal(geom);
                    if (safe) this.dynamicCollected.push(safe);
                } catch (e) {
                    console.warn("处理网格时出错：", m, e);
                }
            }
        }));

        if (!this.dynamicCollected.length) return;
        this.dynamicCollected = this.unifiedAttribute(this.dynamicCollected);
        const merged = BufferGeometryUtils.mergeGeometries(this.dynamicCollected, false);
        if (!merged) { console.error("合并几何失败"); return; }
        (merged as any).boundsTree = new MeshBVH(merged);
        this.dynamicCollider = new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ opacity: 0.5, transparent: true, wireframe: true, depthTest: true, side: THREE.DoubleSide }));
        if (this.displayCollider) this.scene.add(this.dynamicCollider);
    }

    // ==================== 控制器过渡 ====================

    // 车辆切换过渡
    setControllerTransition() {
        if (this.isChangeControllerTransitionTimer) {
            clearTimeout(this.isChangeControllerTransitionTimer);
            this.isChangeControllerTransitionTimer = null;
        }
        const vGroups = this.vehicles.map(v => v.vehicleGroup);
        this.createDynamicBVH(vGroups);
        this.isChangeControllerTransitionTimer = setTimeout(() => {
            this.isChangeControllerTransitionTimer = null;
            this.vehicles.forEach(v => this.clearVehicleVelocity(v));
            this.createDynamicBVH(vGroups);
        }, 3000);
    }

    // 清零车辆速度
    private clearVehicleVelocity(v: VehicleInstance) {
        if (!v || !this.world || !this.RAPIER) return;
        const { chassisBody, vehicleController } = v;
        const ZERO = new this.RAPIER.Vector3(0, 0, 0);
        chassisBody.setLinvel(ZERO, true);
        chassisBody.setAngvel(ZERO, true);
        for (let i = 0; i < 4; i++) { vehicleController.setWheelEngineForce(i, 0); vehicleController.setWheelBrake(i, 1e6); }
        vehicleController.updateVehicle(1 / 60);
        this.world.timestep = 1 / 60;
        this.world.step();
        chassisBody.setLinvel(ZERO, true);
        chassisBody.setAngvel(ZERO, true);
        for (let i = 0; i < 4; i++) vehicleController.setWheelBrake(i, 0);
    }

    // ==================== 循环更新 ====================

    // 主循环更新
    async update(delta: number = clock.getDelta()) {
        if (!this.isupdate || !this.player || !this.collider) return;
        delta = Math.min(delta, 1 / 40);
        if (this.controllerMode === 1) {
            this.updateVehicle(delta);
        } else {
            this.updatePlayer(delta);
            if (this.isChangeControllerTransitionTimer) this.updateVehicleInertia(delta);
        }
    }

    // 车辆帧更新
    updateVehicle(delta: number) {
        const v = this.activeVehicle;
        if (!v || !this.world) return;
        const { vehicleController, chassisBody, vehicleGroup } = v;

        // 上坡补偿
        const rotation = chassisBody.rotation();
        const quat = new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w);
        const forward = new THREE.Vector3(1, 0, 0).applyQuaternion(quat);
        const slopeAngle = Math.asin(forward.y);
        const factor = (slopeAngle < -0.05 && this.fwdPressed) ? -Math.sin(slopeAngle) * 10 : 1;

        // 驱动力
        const accelerateForce = this.vehicleParams.power.accelerateForce * v.speedMultiplier;
        const maxSpeed = this.vehicleParams.power.maxSpeed * v.speedMultiplier;
        const engineForce = (Number(this.fwdPressed) - Number(this.bkdPressed)) * accelerateForce * factor;
        for (let i = 0; i < 4; i++) vehicleController.setWheelEngineForce(i, engineForce);

        // 刹车
        const wheelBrake = Number(this.spacePressed) * this.vehicleParams.power.brakeForce * delta;
        for (let i = 0; i < 4; i++) vehicleController.setWheelBrake(i, wheelBrake);

        // 转向
        const currentSteering = vehicleController.wheelSteering(0) || 0;
        const steerDir = Number(this.lftPressed) - Number(this.rgtPressed);
        const steerSpeed = steerDir === 0 ? this.vehicleParams.steering.steerReturnSpeed : this.vehicleParams.steering.steerSpeed;
        const steering = THREE.MathUtils.lerp(currentSteering, this.vehicleParams.steering.maxSteerAngle * steerDir, 1 - Math.pow(1 - steerSpeed, delta));
        vehicleController.setWheelSteering(0, steering);
        vehicleController.setWheelSteering(1, steering);

        // 漂移
        const driftFriction = ((this.rgtPressed || this.lftPressed) && this.shiftPressed) ? 0.5 : 2;
        vehicleController.setWheelSideFrictionStiffness(2, driftFriction);
        vehicleController.setWheelSideFrictionStiffness(3, driftFriction);

        this.updateVehicleInertia(delta);

        // 第三人称相机
        if (!this.isFirstPerson) {
            const lookTarget = vehicleGroup.position.clone();
            this.camera.position.sub(this.controls.target);
            this.controls.target.copy(lookTarget);
            this.camera.position.add(lookTarget);
            this.controls.update();

            // 以车辆包围盒为基准计算相机距离
            const velocity = chassisBody.linvel();
            const currentSpeed = new THREE.Vector3(velocity.x, velocity.y, velocity.z).length();
            const speedRatio = Math.min(currentSpeed / maxSpeed, 1);
            const baseDist = v.size.l * 0.8;
            const maxDist = v.size.l * 5;
            const desiredDist = THREE.MathUtils.lerp(baseDist, maxDist, speedRatio);
            const minSafeDist = baseDist;

            // 相机碰撞检测
            this.personToCam.subVectors(this.camera.position, vehicleGroup.position);
            const direction = this.personToCam.clone().normalize();
            this.raycasterPersonToCam.set(vehicleGroup.position, direction);
            this.raycasterPersonToCam.far = desiredDist;

            const hits = this.raycasterPersonToCam.intersectObject(this.collider!, false);
            if (hits.length > 0) {
                const safeDist = Math.max(hits[0].distance - this.camEpsilon, minSafeDist);
                this.camera.position.lerp(vehicleGroup.position.clone().add(direction.clone().multiplyScalar(safeDist)), this.camCollisionLerp);
            } else {
                this.raycasterPersonToCam.far = maxDist;
                const maxHits = this.raycasterPersonToCam.intersectObject(this.collider!, false);
                const safeDist = maxHits.length > 0
                    ? Math.min(desiredDist, maxHits[0].distance - this.camEpsilon)
                    : desiredDist;
                this.camera.position.lerp(vehicleGroup.position.clone().add(direction.clone().multiplyScalar(safeDist)), this.camCollisionLerp);
            }

            // 行驶时跟随车辆后方
            if ((this.fwdPressed || this.bkdPressed) && this.vehicleParams.followVehicleDirection) {
                const vel = chassisBody.linvel();
                const velVec = new THREE.Vector3(vel.x, vel.y, vel.z);
                if (velVec.length() > 0.3) {
                    this.camBehindDir.lerp(velVec.normalize().negate(), this.camCollisionLerp).normalize();
                    const targetCamPos = lookTarget.clone()
                        .add(this.camBehindDir.clone().multiplyScalar(desiredDist))
                        .add(new THREE.Vector3(0, v.size.h, 0));
                    this.camera.position.lerp(targetCamPos, this.camCollisionLerp);
                    this.controls.update();
                }
            }
        }

        // 翻车检测
        const vehicleUp = this.upVector.clone().applyQuaternion(vehicleGroup.quaternion);
        if (vehicleUp.angleTo(this.upVector) > Math.PI / 2) {
            const size = new THREE.Vector3();
            v.vehicleBBox?.getSize(size);
            const t = chassisBody.translation();
            chassisBody.setTranslation(new this.RAPIER.Vector3(t.x, t.y + size.y, t.z), true);
            chassisBody.setRotation(new this.RAPIER.Quaternion(0, 0, 0, 1), true);
            chassisBody.setLinvel(new this.RAPIER.Vector3(0, 0, 0), true);
            chassisBody.setAngvel(new this.RAPIER.Vector3(0, 0, 0), true);
        }
    }

    // 物理步进 & 同步
    updateVehicleInertia(delta: number) {
        if (!this.world) return;
        this.world.timestep = delta;
        this.world.step();

        for (const v of this.vehicles) {
            const { vehicleController, chassisBody, vehicleGroup, updateWheelVisuals } = v;
            vehicleController.updateVehicle(delta);
            if (chassisBody.isSleeping()) continue;

            // 限速
            const vel = chassisBody.linvel();
            const speed = new THREE.Vector3(vel.x, vel.y, vel.z).length();
            const max = this.vehicleParams.power.maxSpeed * v.speedMultiplier;
            if (speed > max) {
                const s = max / speed;
                chassisBody.setLinvel(new this.RAPIER.Vector3(vel.x * s, vel.y * s, vel.z * s), true);
            }

            // 同步视觉位置
            const t = chassisBody.translation();
            const r = chassisBody.rotation();
            vehicleGroup.position.set(t.x, t.y, t.z);
            vehicleGroup.quaternion.set(r.x, r.y, r.z, r.w);
            updateWheelVisuals?.();
        }
    }

    // 缩放玩家比例
    setPlayerScale(newScale: number) {
        if (newScale <= 0) return;
        const ratio = newScale / this.playerModel.scale;
        this.playerModel.scale = newScale;

        // 等比缩放所有物理参数
        this.gravity *= ratio;
        this.jumpHeight *= ratio;
        this.playerSpeed *= ratio;
        this.playerFlySpeed *= ratio;
        this.curPlayerSpeed *= ratio;
        this.camEpsilon *= ratio;
        this.minCamDistance *= ratio;
        this.maxCamDistance *= ratio;
        this.orginMaxCamDistance *= ratio;

        // 缩放碰撞体
        if (this.isFirstPerson) this.scene.attach(this.camera);
        this.player?.scale.multiplyScalar(ratio);
        if (this.player?.capsuleInfo) this.player.capsuleInfo.radius *= ratio;
        if (this.isFirstPerson) this.setFirstPersonCamera();
    }

    // 玩家帧更新
    updatePlayer(delta: number) {
        if (this.isMovingToBoardingPoint) this.updateMoveToBoardingPoint(delta);
        if (!this.isFlying) this.player.position.addScaledVector(this.playerVelocity, delta);

        // 上车关门计时
        if (this.isBoardingAnimPlaying) {
            const action = this.personActions?.get("enterCar");
            if (action) {
                const duration = action.getClip().duration;
                const remaining = ((duration - action.time) / action.getEffectiveTimeScale()) * 1000;
                if (!this.closeDoorTriggered && remaining <= 500) { this.closeDoorTriggered = true; this.openVehicleDoor(false); }
                if (action.time >= duration) {
                    this.isBoardingAnimPlaying = false;
                    this.closeDoorTriggered = false;
                    this.onEnterCarAnimFinished();
                    return;
                }
            }
        }

        // 下车关门计时
        if (this.isExitAnimPlaying) {
            const action = this.personActions?.get("exitCar");
            if (action) {
                const duration = action.getClip().duration;
                const remaining = ((duration - action.time) / action.getEffectiveTimeScale()) * 1000;
                if (!this.closeExitDoorTriggered && remaining <= 500) { this.closeExitDoorTriggered = true; this.openVehicleDoor(false); }
                if (action.time >= duration) { this.isExitAnimPlaying = false; this.closeExitDoorTriggered = false; }
            }
        }

        this.updateMixers(delta);
        if (this.controllerMode === 1) return;

        // 计算移动方向
        this.camera.getWorldDirection(this.camDir);
        const angle = 2 * Math.PI - (Math.atan2(this.camDir.z, this.camDir.x) + Math.PI / 2);

        this.moveDir.set(0, 0, 0);
        if (this.fwdPressed) this.moveDir.add(this.DIR_FWD);
        if (this.bkdPressed) this.moveDir.add(this.DIR_BKD);
        if (this.lftPressed) this.moveDir.add(this.DIR_LFT);
        if (this.rgtPressed) this.moveDir.add(this.DIR_RGT);

        // 飞行 / 地面速度
        if (this.isFlying) {
            this.moveDir.y = this.fwdPressed ? this.camDir.y : 0;
            if (this.spacePressed) this.moveDir.add(this.DIR_UP);
            this.curPlayerSpeed = this.shiftPressed ? this.playerFlySpeed * 2 : this.playerFlySpeed;
        } else {
            this.curPlayerSpeed = this.shiftPressed ? this.playerSpeed * 2 : this.playerSpeed;
        }

        this.moveDir.normalize().applyAxisAngle(this.upVector, angle);
        this.player.position.addScaledVector(this.moveDir, this.curPlayerSpeed * delta);

        // 地面检测
        this.raycaster.ray.origin.copy(this.player.position);
        const hits = this.raycaster.intersectObject(this.collider!, false);
        if (hits.length > 0 && !this.isFlying) {
            const dist = this.player.position.y - hits[0].point.y;
            const s = this.playerModel.scale;
            const maxH = this.playerCapsuleHeight * s * 0.9;
            const h = this.playerCapsuleHeight * s * 0.75;
            const minH = this.playerCapsuleHeight * s * 0.7;

            if (dist >= maxH) {
                this.playerVelocity.y += delta * this.gravity;
                this.player.position.addScaledVector(this.playerVelocity, delta);
                this.playerIsOnGround = false;
            } else if (dist >= h && dist < maxH) {
                if (!this.spacePressed) {
                    this.playerVelocity.set(0, 0, 0);
                    this.playerIsOnGround = true;
                    this.player.position.y = THREE.MathUtils.lerp(this.player.position.y, hits[0].point.y + h, Math.min(1, 15 * delta));
                }
            } else if (dist >= minH) {
                this.playerVelocity.set(0, 0, 0); this.playerIsOnGround = true; this.player.position.y = hits[0].point.y + h;
            } else {
                const targetY = hits[0].point.y + h;
                this.playerVelocity.set(0, 0, 0); this.playerIsOnGround = true;
                this.player.position.y = THREE.MathUtils.lerp(this.player.position.y, targetY, Math.min(1, 15 * delta));
            }
        }

        this.player.updateMatrixWorld();

        // BVH 胶囊体碰撞
        const capsuleInfo = this.player.capsuleInfo;
        this.tempBox.makeEmpty();
        this.tempMat.copy(this.collider!.matrixWorld).invert();
        this.tempSegment.copy(capsuleInfo.segment);
        this.tempSegment.start.applyMatrix4(this.player.matrixWorld).applyMatrix4(this.tempMat);
        this.tempSegment.end.applyMatrix4(this.player.matrixWorld).applyMatrix4(this.tempMat);
        this.tempBox.expandByPoint(this.tempSegment.start).expandByPoint(this.tempSegment.end);
        this.tempBox.expandByScalar(capsuleInfo.radius);

        if (!this.isMovingToBoardingPoint) {
            const resolveCollision = (collider: THREE.Mesh | null) => {
                if (!collider) return;
                (collider.geometry as any)?.boundsTree?.shapecast({
                    intersectsBounds: (box: THREE.Box3) => box.intersectsBox(this.tempBox),
                    intersectsTriangle: (tri: any) => {
                        const distance = tri.closestPointToSegment(this.tempSegment, this.tempVector, this.tempVector2);
                        if (distance < capsuleInfo.radius) {
                            const normal = tri.getNormal(new THREE.Vector3());
                            if (!this.isFlying && Math.abs(normal.y) > 0.5) return;
                            // 台阶排除：接触点低于 脚底+25%人物高 跳过
                            if (!this.isFlying && Math.abs(normal.y) <= 0.5) {
                                const e = this.collider!.matrixWorld.elements;
                                const contactWorldY = e[1] * this.tempVector.x + e[5] * this.tempVector.y + e[9] * this.tempVector.z + e[13];
                                const s = this.playerModel.scale;
                                const feetY = this.player.position.y - this.playerCapsuleHeight * s * 0.75;
                                if (contactWorldY < feetY + this.playerCapsuleHeight * s * 0.25) return;
                            }
                            const dir = this.tempVector2.sub(this.tempVector).normalize();
                            const depth = capsuleInfo.radius - distance;
                            this.tempSegment.start.addScaledVector(dir, depth);
                            this.tempSegment.end.addScaledVector(dir, depth);
                        }
                    },
                });
            };
            resolveCollision(this.collider);
            resolveCollision(this.dynamicCollider);
        }

        // 应用碰撞偏移
        const newPos = this.tempVector.copy(this.tempSegment.start).applyMatrix4(this.collider!.matrixWorld);
        const deltaVec = this.tempVector2.subVectors(newPos, this.player.position);
        const offset = Math.max(0, deltaVec.length() - 1e-5);
        this.player.position.add(deltaVec.normalize().multiplyScalar(offset));

        // 玩家朝向
        if (!this.isFirstPerson) {
            const camDirFlat = this.camDir.clone().setY(0).normalize().negate();
            const moveDirFlat = this.moveDir.clone().normalize().negate();

            if (!this.isFlying) {
                if (this.thirdMouseMode === 0 || this.thirdMouseMode === 2) {
                    const lookTarget = this.player.position.clone().add(moveDirFlat.lengthSq() > 0 ? moveDirFlat : camDirFlat);
                    this.targetMat.lookAt(this.player.position, lookTarget, this.player.up);
                    this.player.quaternion.slerp(this.targetQuat.setFromRotationMatrix(this.targetMat), Math.min(1, this.rotationSpeed * delta));
                } else if (moveDirFlat.lengthSq() > 0) {
                    this.targetMat.lookAt(this.player.position, this.player.position.clone().add(moveDirFlat), this.player.up);
                    this.player.quaternion.slerp(this.targetQuat.setFromRotationMatrix(this.targetMat), Math.min(1, this.rotationSpeed * delta));
                }
            } else {
                const lookTarget = this.player.position.clone().add(this.fwdPressed ? moveDirFlat : camDirFlat);
                this.targetMat.lookAt(this.player.position, lookTarget, this.player.up);
                this.player.quaternion.slerp(this.targetQuat.setFromRotationMatrix(this.targetMat), Math.min(1, this.rotationSpeed * delta));
            }
        }

        // 第三人称相机跟随
        if (!this.isFirstPerson) {
            const lookTarget = this.player.position.clone();
            lookTarget.y += (this.playerCapsuleHeight / 8) * this.playerModel.scale;
            this.camera.position.sub(this.controls.target);
            this.controls.target.copy(lookTarget);
            this.camera.position.add(lookTarget);
            this.controls.update();

            if (!this.enableZoom) {
                this.updateCameraWithRaycast(
                    this.player.position,
                    this.personToCam.subVectors(this.camera.position, this.player.position).length(),
                    this.maxCamDistance,
                );
            }
        }

        // 掉落重置
        if (this.player.position.y < this.boundingBoxMinY - 1) {
            this.raycaster.ray.origin.set(this.player.position.x, 10000, this.player.position.z);
            const fallHits = this.raycaster.intersectObject(this.collider!, false);
            this.reset(new THREE.Vector3(
                this.player.position.x,
                fallHits.length > 0 ? fallHits[0].point.y + 5 : this.player.position.y + 15,
                this.player.position.z,
            ));
        }

        // 移动端车辆按钮检测
        if (this.isShowMobileControls && this.vehicles.length) {
            let near = false;
            for (const v of this.vehicles) {
                this.nearCheckLocal.copy(v.boardingPoint).multiplyScalar(v.scale);
                v.vehicleGroup.localToWorld(this.nearCheckWorld.copy(this.nearCheckLocal));
                if (this.player.position.distanceTo(this.nearCheckWorld) < 800 * this.playerModel.scale) { near = true; break; }
            }
            if (near !== this.isNearVehicle) {
                this.isNearVehicle = near;
                this.mobileControls?.syncVehicleBtn(near);
            }
        }
    }

    // 相机碰撞射线
    private updateCameraWithRaycast(origin: THREE.Vector3, desiredDist: number, maxDist: number) {
        this.personToCam.subVectors(this.camera.position, origin);
        const direction = this.personToCam.clone().normalize();
        this.raycasterPersonToCam.set(origin, direction);
        this.raycasterPersonToCam.far = desiredDist;

        const hits = this.raycasterPersonToCam.intersectObject(this.collider!, false);
        if (hits.length > 0) {
            // 有遮挡，缩短距离
            const safeDist = Math.max(hits[0].distance - this.camEpsilon, this.minCamDistance);
            const targetCamPos = origin.clone().add(direction.multiplyScalar(safeDist));
            this.camera.position.lerp(targetCamPos, this.camCollisionLerp);
        } else {
            // 无遮挡，推到最大距离
            this.raycasterPersonToCam.far = maxDist;
            const maxHits = this.raycasterPersonToCam.intersectObject(this.collider!, false);
            const safeDist = maxHits.length > 0
                ? Math.min(maxDist, maxHits[0].distance - this.camEpsilon)
                : maxDist;
            const targetCamPos = origin.clone().add(direction.multiplyScalar(safeDist));
            this.camera.position.lerp(targetCamPos, this.camCollisionLerp);
        }
    }

    // 屏幕中心射线
    getCenterScreenRaycastHit(): THREE.Intersection | undefined {
        if (!this.collider) return undefined;
        this.camera.updateMatrixWorld();
        this.centerRay.setFromCamera(this.centerMouse, this.camera);
        return this.centerRay.intersectObject(this.collider, false)[0];
    }

    // 获取当前人物动画名称
    getCurrentPersonAnimationName(): string | null {
        return this.actionState?.getClip()?.name ?? null;
    }

    // 更新动画混合器
    private updateMixers(delta: number) {
        this.personMixer?.update(delta);
        for (const v of this.vehicles) v.vehicleMixer?.update(delta);
    }

    // 重置玩家位置
    reset(position?: THREE.Vector3) {
        if (!this.player) return;
        this.playerVelocity.set(0, 0, 0);
        this.player.position.copy(position ?? this.initPos);
    }

    // 获取玩家位置
    getPosition() { return this.player?.position; }

    // ==================== 输入处理 ====================

    // 外部输入接口
    setInput(input: Partial<{
        moveX: 1 | 0 | -1; moveY: 1 | 0 | -1;
        lookDeltaX: number; lookDeltaY: number;
        jump: boolean; shift: boolean;
        toggleView: boolean; toggleFly: boolean; toggleVehicle: boolean;
    }>) {
        // 移动方向
        if (typeof input.moveX === "number") { this.lftPressed = input.moveX === -1; this.rgtPressed = input.moveX === 1; this.setAnimationByPressed(); }
        if (typeof input.moveY === "number") { this.fwdPressed = input.moveY === 1; this.bkdPressed = input.moveY === -1; this.setAnimationByPressed(); }

        // 视角旋转
        if (typeof input.lookDeltaX === "number" && typeof input.lookDeltaY === "number") {
            this.setToward(input.lookDeltaX, input.lookDeltaY, 0.002);
        }

        // 跳跃
        if (typeof input.jump === "boolean") {
            if (input.jump) {
                this.cancelBoarding();
                this.spacePressed = true;
                if (this.controllerMode === 1) return;
                if (!this.playerIsOnGround || this.isFlying) return;
                this.playPersonAnimationByName("jumping");
                this.playerVelocity.y = this.jumpHeight;
                this.playerIsOnGround = false;
            } else {
                this.spacePressed = false;
            }
        }

        // 其他按键
        if (typeof input.shift === "boolean") { this.shiftPressed = input.shift; this.setAnimationByPressed(); }
        if (input.toggleView) this.changeView();

        if (input.toggleFly && this.playerFlyEnabled && this.controllerMode === 0) {
            this.isFlying = !this.isFlying;
            this.setAnimationByPressed();
            if (!this.isFlying && !this.playerIsOnGround) this.playPersonAnimationByName("jumping");
        }

        if (input.toggleVehicle) {
            if (this.controllerMode === 0) this.enterVehicle(); else this.exitVehicle();
        }
    }

    // 取消上车寻路
    private cancelBoarding() {
        this.isMovingToBoardingPoint = false;
        this.boardingWaypoints = [];
        this.currentWaypointIndex = 0;
        this.boardingTargetDir = null;
    }

    // 按键动画同步
    private setAnimationByPressed = () => {
        this.maxCamDistance = this.orginMaxCamDistance;
        this.cancelBoarding();

        // 清理上下车动画状态
        if (this.isExitAnimPlaying) { this.isExitAnimPlaying = false; this.closeExitDoorTriggered = false; }
        if (this.isBoardingAnimPlaying) { this.isBoardingAnimPlaying = false; this.closeDoorTriggered = false; }
        if (this.closeVehicleDoorTimer) { clearTimeout(this.closeVehicleDoorTimer); this.closeVehicleDoorTimer = null; }

        // 飞行动画
        if (this.isFlying) {
            if (!this.fwdPressed) { this.playPersonAnimationByName("flyidle"); return; }
            this.playPersonAnimationByName("flying");
            this.maxCamDistance = this.orginMaxCamDistance * 2;
            return;
        }

        // 地面动画
        if (this.playerIsOnGround) {
            if (!this.fwdPressed && !this.bkdPressed && !this.lftPressed && !this.rgtPressed) {
                this.playPersonAnimationByName("idle"); return;
            }
            if (this.fwdPressed) { this.playPersonAnimationByName(this.shiftPressed ? "running" : "walking"); return; }
            if (!this.isFirstPerson && (this.lftPressed || this.rgtPressed || this.bkdPressed)) {
                this.playPersonAnimationByName(this.shiftPressed ? "running" : "walking"); return;
            }
            if (this.lftPressed) { this.playPersonAnimationByName("left_walking"); return; }
            if (this.rgtPressed) { this.playPersonAnimationByName("right_walking"); return; }
            if (this.bkdPressed) { this.playPersonAnimationByName("walking_backward"); return; }
        }

        if (this.recheckAnimTimer !== null) clearTimeout(this.recheckAnimTimer);
        this.recheckAnimTimer = setTimeout(() => { this.setAnimationByPressed(); this.recheckAnimTimer = null; }, 200);
    };

    // ==================== 事件处理 ====================

    // 键盘按下事件
    private boundOnKeydown = async (e: KeyboardEvent) => {
        if (e.ctrlKey && ["KeyW", "KeyA", "KeyS", "KeyD"].includes(e.code)) e.preventDefault();
        switch (e.code) {
            case "KeyW": case "ArrowUp": this.fwdPressed = true; this.setAnimationByPressed(); break;
            case "KeyS": case "ArrowDown": this.bkdPressed = true; this.setAnimationByPressed(); break;
            case "KeyD": case "ArrowRight": this.rgtPressed = true; this.setAnimationByPressed(); break;
            case "KeyA": case "ArrowLeft": this.lftPressed = true; this.setAnimationByPressed(); break;
            case "ShiftLeft": case "ShiftRight":
                this.shiftPressed = true;
                this.setAnimationByPressed();
                this.controls.mouseButtons = { LEFT: 2, MIDDLE: 1, RIGHT: 0 };
                break;
            case "Space":
                this.cancelBoarding();
                this.spacePressed = true;
                if (this.controllerMode === 1) return;
                if (!this.playerIsOnGround || this.isFlying) return;
                if (this.personActions?.get("jumping") === this.actionState) return;
                this.playPersonAnimationByName("jumping");
                this.playerVelocity.y = this.jumpHeight;
                this.playerIsOnGround = false;
                break;
            case "ControlLeft": this.ctPressed = true; break;
            case "KeyV": this.changeView(); break;
            case "KeyF":
                if (this.controllerMode === 0 && this.playerFlyEnabled) {
                    this.isFlying = !this.isFlying;
                    this.setAnimationByPressed();
                    if (!this.isFlying && !this.playerIsOnGround) this.playPersonAnimationByName("jumping");
                }
                break;
            case "KeyE":
                if (this.isFlying) return;
                if (this.controllerMode === 0) this.enterVehicle(); else this.exitVehicle();
                break;
        }
    };

    // 键盘抬起事件
    private boundOnKeyup = (e: KeyboardEvent) => {
        switch (e.code) {
            case "KeyW": case "ArrowUp": this.fwdPressed = false; this.setAnimationByPressed(); break;
            case "KeyS": case "ArrowDown": this.bkdPressed = false; this.setAnimationByPressed(); break;
            case "KeyD": case "ArrowRight": this.rgtPressed = false; this.setAnimationByPressed(); break;
            case "KeyA": case "ArrowLeft": this.lftPressed = false; this.setAnimationByPressed(); break;
            case "ShiftLeft": case "ShiftRight":
                this.shiftPressed = false;
                this.setAnimationByPressed();
                this.controls.mouseButtons = { LEFT: 0, MIDDLE: 1, RIGHT: 2 };
                break;
            case "Space": this.spacePressed = false; break;
            case "ControlLeft": this.ctPressed = false; break;
        }
    };

    private mouseMove = (e: MouseEvent) => { if (document.pointerLockElement === document.body) this.setToward(e.movementX, e.movementY, 0.0001); };
    private mouseClick = () => this.setPointerLock();

    // 注册所有事件
    onAllEvent() {
        this.isupdate = true;
        this.setPointerLock();
        window.addEventListener("keydown", this.boundOnKeydown);
        window.addEventListener("keyup", this.boundOnKeyup);
        window.addEventListener("mousemove", this.mouseMove);
        window.addEventListener("click", this.mouseClick);
    }

    // 注销所有事件
    offAllEvent() {
        this.isupdate = false;
        document.exitPointerLock();
        window.removeEventListener("keydown", this.boundOnKeydown);
        window.removeEventListener("keyup", this.boundOnKeyup);
        window.removeEventListener("mousemove", this.mouseMove);
        window.removeEventListener("click", this.mouseClick);
    }

    // ==================== 移动端同步 ====================

    // 同步移动端按钮
    private syncMobileControllerMode() {
        this.mobileControls?.syncControllerModeBtn(this.controllerMode);
    }

    // ==================== Setters ====================

    // 设置鼠标灵敏度
    setMouseSensitivity(value: number) {
        this.mouseSensitivity = value;
        this.controls.rotateSpeed = value * 0.05;
    }

    // 设置重力
    setGravity(gravity: number) { this.gravity = gravity * this.playerModel.scale; }
    // 设置跳跃高度
    setJumpHeight(jumpHeight: number) { this.jumpHeight = jumpHeight * this.playerModel.scale; }
    // 设置移动速度
    setPlayerSpeed(speed: number) { this.playerSpeed = speed * this.playerModel.scale; this.curPlayerSpeed = this.playerSpeed; }
    // 设置飞行速度
    setPlayerFlySpeed(flySpeed: number) { this.playerFlySpeed = flySpeed * this.playerModel.scale; }
    // 设置最小相机距离
    setMinCamDistance(dist: number) { this.minCamDistance = dist * this.playerModel.scale; }
    // 设置最大相机距离
    setMaxCamDistance(dist: number) { this.maxCamDistance = dist * this.playerModel.scale; this.orginMaxCamDistance = this.maxCamDistance; }
    // 设置鼠标模式
    setThirdMouseMode(mode: 0 | 1 | 2 | 3) { this.thirdMouseMode = mode; this.setPointerLock(); }
    // 设置滚轮缩放
    setEnableZoom(enable: boolean) { this.enableZoom = enable; this.controls.enableZoom = enable; }

    // 设置调试显示
    setDebug(debug: boolean) {
        if (this.collider) this.scene.remove(this.collider);
        if (debug) {
            this.scene.add(this.collider!);
            (this.player.material as THREE.Material).opacity = 0.5;
        } else {
            (this.player.material as THREE.Material).opacity = 0;
        }
    }

    // ==================== 销毁 ====================

    // 销毁控制器
    destroy() {
        // 注销事件
        this.offAllEvent();

        // 清理玩家
        if (this.player) { this.player.remove(this.camera); this.scene.remove(this.player); }
        (this.player as any) = null;
        if (this.person) { this.scene.remove(this.person); this.person = null; }

        // 清理场景
        this.resetControls();
        if (this.visualizer) { this.scene.remove(this.visualizer); this.visualizer = null; }
        if (this.collider) { this.scene.remove(this.collider); this.collider = null; }

        // 清理移动端
        this.mobileControls?.destroy();
        this.mobileControls = null;

        // 清理车辆
        for (const v of this.vehicles) { this.scene.remove(v.vehicleGroup); v.pathPlanner?.dispose(); v.vehicleController?.destroy?.(); }
        this.vehicles = [];
        this.activeVehicle = null;

        controllerInstance = null;
    }
}

// ==================== 导出 API ====================

export function playerController() {
    if (!controllerInstance) controllerInstance = new PlayerController();
    const c = controllerInstance;
    return {
        init: (opts: PlayerControllerOptions, cb?: () => void) => c.init(opts, cb),
        loadVehicleModel: (opts: VehicleOptions) => c.loadVehicleModel(opts),
        update: (dt?: number) => c.update(dt),
        destroy: () => c.destroy(),
        reset: (pos?: THREE.Vector3) => c.reset(pos),
        setInput: (i: Parameters<typeof c.setInput>[0]) => c.setInput(i),
        changeView: () => c.changeView(),
        getPosition: () => c.getPosition(),
        getCenterScreenRaycastHit: () => c.getCenterScreenRaycastHit(),
        getCurrentPersonAnimationName: () => c.getCurrentPersonAnimationName(),
        getPerson: () => c.person,
        getActiveVehicle: () => c.activeVehicle,
        getAllVehicles: () => c.vehicles,
        switchPlayerModel: (model: PlayerModelOptions) => c.switchPlayerModel(model),
        setPlayerScale: (scale: number) => c.setPlayerScale(scale),
        setMouseSensitivity: (v: number) => c.setMouseSensitivity(v),
        setGravity: (v: number) => c.setGravity(v),
        setJumpHeight: (v: number) => c.setJumpHeight(v),
        setPlayerSpeed: (v: number) => c.setPlayerSpeed(v),
        setPlayerFlySpeed: (v: number) => c.setPlayerFlySpeed(v),
        setMinCamDistance: (v: number) => c.setMinCamDistance(v),
        setMaxCamDistance: (v: number) => c.setMaxCamDistance(v),
        setThirdMouseMode: (v: 0 | 1 | 2 | 3) => c.setThirdMouseMode(v),
        setEnableZoom: (v: boolean) => c.setEnableZoom(v),
        setDebug: (v: boolean) => c.setDebug(v),
        setOverShoulderView: (v: boolean) => c.setOverShoulderView(v),
        registerAnimation: (key: string, clipName: string, opts?: {
            loop?: boolean;
            timeScale?: number;
            clampWhenFinished?: boolean;
            onFinished?: () => void;
        }) => c.registerAnimation(key, clipName, opts),
        playAnimation: (key: string, opts?: {
            fade?: number;
            force?: boolean;
        }) => c.playAnimation(key, opts),
        registerLocomotionSet: (setName: string, map: Partial<Record<"idle" | "walking" | "walking_backward" | "running" | "jumping" | "flyidle" | "flying", string>>) => c.registerLocomotionSet(setName, map),
        switchLocomotionSet: (setName: string, fade?: number) => c.switchLocomotionSet(setName, fade),
    };
}

export type playerController = ReturnType<typeof playerController>;

export function onAllEvent(): void { if (!controllerInstance) controllerInstance = new PlayerController(); controllerInstance.onAllEvent(); }
export function offAllEvent(): void { controllerInstance?.offAllEvent(); }

export type { PlayerControllerOptions, PlayerModelOptions, VehicleOptions, VehicleInstance, MobileControlsOptions } from "./types";
