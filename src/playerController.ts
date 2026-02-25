import type { RigidBody, World } from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import { acceleratedRaycast, MeshBVH, MeshBVHHelper } from "three-mesh-bvh";
import type { GLTF } from "three/examples/jsm/Addons.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";
import flyIconModule from "../assets/imgs/fly.png";
import jumpIconModule from "../assets/imgs/jump.png";
import viewIconModule from "../assets/imgs/view.png";
import { ObstacleChecker, PathPlanner } from "./utils/pathPlanner";
import { createVehicleController } from "./utils/useVehicleController";

THREE.Mesh.prototype.raycast = acceleratedRaycast;

let controllerInstance: PlayerController | null = null;
const clock = new THREE.Clock();

export type PlayerControllerOptions = {
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    playerModel: {
        url: string;
        idleAnim: string;
        walkAnim: string;
        runAnim: string;
        jumpAnim: string;
        leftWalkAnim?: string;
        rightWalkAnim?: string;
        backwardAnim?: string;
        flyAnim?: string;
        flyIdleAnim?: string;
        enterCarAnim?: string;
        exitCarAnim?: string;
        scale: number;
        gravity?: number;
        jumpHeight?: number;
        speed?: number;
        rotateY?: number;
        headObjName?: string;
    };
    initPos?: THREE.Vector3;
    mouseSensity?: number;
    minCamDistance?: number;
    maxCamDistance?: number;
    colliderMeshUrl?: string;
    isShowMobileControls?: boolean;
    thirdMouseMode?: 0 | 1 | 2 | 3;
    enableZoom?: boolean;
};

export type vehicleOptions = {
    url: string;
    position: THREE.Vector3;
    wheelsNames: string[];
    scale?: number;
    animations: {
        openDoorAnim?: string;
    };
    boardingPoint: THREE.Vector3;
    seatOffset?: THREE.Vector3;
    chassisRatio?: number;
    suspensionRestLengthRatio?: number;
};

// ==================== 多车辆实例类型 ====================
export type VehicleInstance = {
    vehicleGroup: THREE.Group;
    chassisBody: RigidBody;
    vehicleController: any;
    updateWheelVisuals: () => void;
    vehicleMixer?: THREE.AnimationMixer;
    vehicleActions?: Map<string, THREE.AnimationAction>;
    vehiclIsOpenDoor: boolean;
    vehicleBBox: THREE.Box3;
    pathPlanner: PathPlanner;
    // 每辆车独立的参数
    scale: number;
    boardingPoint: THREE.Vector3;
    seatOffset: THREE.Vector3;
    enterVehicleTime: number;
    chassisRatio: number;
    suspensionRestLengthRatio: number;
    size: {
        l: number;
        w: number;
        h: number;
    };
};

class PlayerController {
    // ==================== 基本配置与参数 ====================
    loader: GLTFLoader = new GLTFLoader();
    scene!: THREE.Scene;
    camera!: THREE.PerspectiveCamera;
    controls!: OrbitControls;
    playerModel!: PlayerControllerOptions["playerModel"];
    initPos!: THREE.Vector3;
    gravity!: number;
    jumpHeight!: number;
    playerSpeed!: number;
    mouseSensity!: number;
    originPlayerSpeed!: number;
    colliderMeshUrl!: string;
    isShowMobileControls!: boolean;
    thirdMouseMode!: 0 | 1 | 2 | 3;
    enableZoom!: boolean;
    controllerMode: 0 | 1 = 0; // 0: 人物 1: 车辆
    isChangeControllerTransitionTimer: any = null;

    // ==================== 玩家基本属性 ====================
    playerRadius: number = 45;
    playerHeight: number = 180; // 玩家参考身高
    isFirstPerson: boolean = false;
    boundingBoxMinY: number = 0;

    // ==================== 测试参数 ====================
    displayPlayer: boolean = false;
    displayCollider: boolean = false;
    displayVisualizer: boolean = false;

    // ==================== 场景对象 ====================
    collider: THREE.Mesh | null = null;
    visualizer: MeshBVHHelper | null = null;
    player!: THREE.Mesh & { capsuleInfo?: any };
    person: THREE.Object3D | null = null;
    personHead: THREE.Object3D | null = null;
    collected: THREE.BufferGeometry[] = [];

    dynamicCollider: THREE.Mesh | null = null;
    dynamicCollected: THREE.BufferGeometry[] = [];

    // ==================== 多车辆相关 ====================
    vehicles: VehicleInstance[] = []; // 所有已加载车辆
    activeVehicle: VehicleInstance | null = null; // 当前驾驶/交互的车辆

    vehicleLength: number = 6; // 车辆参考长度
    readonly wheelSteeringQuat = new THREE.Quaternion();
    readonly wheelRotationQuat = new THREE.Quaternion();
    RAPIER: any | null = null;
    world: World | null = null;

    // 全局车辆共享参数
    vehicleParams = {
        debug: {
            showPhysicsBox: false,
        },
        chassis: {
            linearDamping: 0.5,
            angularDamping: 0.5,
        },
        model: {
            rotation: -Math.PI / 2,
        },
        power: {
            accelerateForce: 50, // 推进
            brakeForce: 200, // 刹车
            maxSpeed: 10000, // 最大速度
        },
        steering: {
            maxSteerAngle: Math.PI / 4,
            steerSpeed: 0.5,
            steerReturnSpeed: 1,
        },
    };

    camBehindDir = new THREE.Vector3(0, 0, 1);

    // ==================== 上车相关 ====================
    isMovingToBoardingPoint: boolean = false;
    boardingWaypoints: THREE.Vector3[] = [];
    currentWaypointIndex: number = 0;
    boardingTargetDir: THREE.Vector3 | null = null;
    boardingMoveSpeed: number = 300;
    boardingRotateSpeed: number = 10;
    flip180Quat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
    enterVehicleTimer: any | null = null;
    closeVehicleDoorTimer: any | null = null;
    boardingPointWorld: THREE.Vector3 | null = null;

    // ==================== 状态开关 ====================
    playerIsOnGround: boolean = false;
    isupdate: boolean = true;
    isFlying: boolean = false;

    // ==================== 输入状态 ====================
    fwdPressed: boolean = false;
    bkdPressed: boolean = false;
    lftPressed: boolean = false;
    rgtPressed: boolean = false;
    spacePressed: boolean = false;
    ctPressed: boolean = false;
    shiftPressed: boolean = false;

    // ==================== 移动端输入 ====================
    prevJoyState = { dirX: 0, dirY: 0, shift: false };
    nippleModule: any = null;
    joystickManager: any = null;
    joystickZoneEl: HTMLDivElement | null = null;
    lookAreaEl: HTMLDivElement | null = null;
    jumpBtnEl: HTMLButtonElement | null = null;
    flyBtnEl: HTMLButtonElement | null = null;
    viewBtnEl: HTMLButtonElement | null = null;
    lookPointerId: number | null = null;
    isLookDown = false;
    lastTouchX = 0;
    lastTouchY = 0;

    // ==================== 第三人称相机参数 ====================
    _camCollisionLerp: number = 0.18;
    _camEpsilon: number = 0.35;
    _minCamDistance: number = 1.0;
    _maxCamDistance: number = 4.4;
    orginMaxCamDistance: number = 4.4;

    // ==================== 物理/运动 ====================
    playerVelocity = new THREE.Vector3();
    readonly upVector = new THREE.Vector3(0, 1, 0);

    // ==================== 临时复用向量/矩阵 ====================
    readonly tempVector = new THREE.Vector3();
    readonly tempVector2 = new THREE.Vector3();
    readonly tempBox = new THREE.Box3();
    readonly tempMat = new THREE.Matrix4();
    readonly tempSegment = new THREE.Line3();

    // ==================== 动画相关 ====================
    personMixer?: THREE.AnimationMixer;
    personActions?: Map<string, THREE.AnimationAction>;
    idleAction!: THREE.AnimationAction;
    walkAction!: THREE.AnimationAction;
    leftWalkAction!: THREE.AnimationAction;
    rightWalkAction!: THREE.AnimationAction;
    backwardAction!: THREE.AnimationAction;
    jumpAction!: THREE.AnimationAction;
    runAction!: THREE.AnimationAction;
    flyidleAction!: THREE.AnimationAction;
    flyAction!: THREE.AnimationAction;
    actionState!: THREE.AnimationAction;
    recheckAnimTimer: any | null = null;

    // ==================== 相机朝向/移动复用向量 ====================
    readonly camDir = new THREE.Vector3();
    readonly moveDir = new THREE.Vector3();
    readonly targetQuat = new THREE.Quaternion();
    readonly targetMat = new THREE.Matrix4();
    readonly rotationSpeed = 10;
    readonly DIR_FWD = new THREE.Vector3(0, 0, -1);
    readonly DIR_BKD = new THREE.Vector3(0, 0, 1);
    readonly DIR_LFT = new THREE.Vector3(-1, 0, 0);
    readonly DIR_RGT = new THREE.Vector3(1, 0, 0);
    readonly DIR_UP = new THREE.Vector3(0, 1, 0);

    // ==================== 射线检测 ====================
    readonly _personToCam = new THREE.Vector3();
    readonly _originTmp = new THREE.Vector3();
    readonly _raycaster = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0));
    readonly _raycasterPersonToCam = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3());

    constructor() {
        (this._raycaster as any).firstHitOnly = true;
        (this._raycasterPersonToCam as any).firstHitOnly = true;
    }

    // ==================== 初始化相关方法 ====================

    async init(opts: PlayerControllerOptions, callback?: () => void) {
        this.scene = opts.scene;
        this.camera = opts.camera;
        this.camera.rotation.order = "YXZ";
        this.controls = opts.controls;
        this.playerModel = opts.playerModel;
        this.initPos = opts.initPos ?? new THREE.Vector3(0, 0, 0);
        this.mouseSensity = opts.mouseSensity ?? 5;

        const s = this.playerModel.scale;
        this.gravity = (opts.playerModel.gravity ?? -2400) * s;
        this.jumpHeight = (opts.playerModel.jumpHeight ?? 800) * s;
        this.originPlayerSpeed = (opts.playerModel.speed ?? 400) * s;
        this.playerSpeed = this.originPlayerSpeed;
        this.playerModel.rotateY = opts.playerModel.rotateY ?? 0;

        this._camCollisionLerp = 0.18;
        this._camEpsilon = 35 * s;
        this._minCamDistance = (opts.minCamDistance ?? 100) * s;
        this._maxCamDistance = (opts.maxCamDistance ?? 440) * s;
        this.orginMaxCamDistance = this._maxCamDistance;
        this.thirdMouseMode = opts.thirdMouseMode ?? 1;
        this.enableZoom = opts.enableZoom ?? false;

        const isMobileDevice = () => (navigator.maxTouchPoints && navigator.maxTouchPoints > 0) || "ontouchstart" in window || /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
        this.isShowMobileControls = (opts.isShowMobileControls ?? true) && isMobileDevice();
        if (this.isShowMobileControls) {
            await this.initMobileControls();
        }

        await this.createBVH(opts.colliderMeshUrl);
        await this.loadPersonGLB();

        this.onAllEvent();
        this.setCameraPos();
        this.setControls();
        if (callback) callback();
    }

    async initLoader() {
        const dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath("https://unpkg.com/three@0.180.0/examples/jsm/libs/draco/gltf/");
        dracoLoader.setDecoderConfig({ type: "js" });
        this.loader.setDRACOLoader(dracoLoader);
    }

    async initRapier() {
        if (this.RAPIER) return;
        this.RAPIER = await import("@dimforge/rapier3d-compat");
        await this.RAPIER.init();

        const gravity = new this.RAPIER.Vector3(0, -9.81, 0);
        this.world = new this.RAPIER.World(gravity) as World;
        (this.world as any).maxCcdSubsteps = 2;

        const addGeometryAsTrimesh = (RAPIER: any, world: any, geom: THREE.BufferGeometry) => {
            let geometry = geom.index ? geom.clone().toNonIndexed() : geom.clone();
            const posAttr = geometry.attributes.position;
            const vertexCount = posAttr.count;
            if (vertexCount % 3 !== 0) {
                console.warn("顶点数不是3的倍数，三角形可能不完整");
            }
            const vertices = new Float32Array(vertexCount * 3);
            const tmp = new THREE.Vector3();
            for (let i = 0; i < vertexCount; i++) {
                tmp.fromBufferAttribute(posAttr, i);
                vertices[i * 3 + 0] = tmp.x;
                vertices[i * 3 + 1] = tmp.y;
                vertices[i * 3 + 2] = tmp.z;
            }
            const indices = vertexCount > 65535 ? new Uint32Array(vertexCount) : new Uint16Array(vertexCount);
            for (let i = 0; i < vertexCount; i++) indices[i] = i;

            const bodyDesc = RAPIER.RigidBodyDesc.fixed();
            const body = world.createRigidBody(bodyDesc);
            // const flags = RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES;
            const colliderDesc = RAPIER.ColliderDesc.trimesh(vertices, indices).setRestitution(0).setFriction(0.8);
            world.createCollider(colliderDesc, body);
        };

        for (const g of this.collected) {
            addGeometryAsTrimesh(this.RAPIER, this.world, g);
        }

        const groundDesc = this.RAPIER.RigidBodyDesc.fixed();
        const groundBody = this.world.createRigidBody(groundDesc);
        groundBody.userData = { outOfBounds: true };
    }

    // ==================== 玩家模型相关方法 ====================

    async loadPersonGLB() {
        try {
            const gltf: GLTF = await this.loader.loadAsync(this.playerModel.url);
            this.person = gltf.scene;
            const { size } = this.getBbox(this.person);
            const ratio = this.playerHeight / size.y;
            const power = Math.round(Math.log10(ratio));
            const modelScale = Math.pow(10, power);
            this.playerRadius = Number(Math.min(size.x, size.z).toFixed(0)) * modelScale;
            this.playerHeight = Number(size.y.toFixed(0)) * modelScale;

            const scale = this.playerModel.scale;
            const material = new THREE.MeshStandardMaterial({
                color: new THREE.Color(1, 0, 0),
                shadowSide: THREE.DoubleSide,
                depthTest: false,
                transparent: true,
                opacity: this.displayPlayer ? 0.5 : 0,
                wireframe: true,
                depthWrite: false,
            });

            const r = this.playerRadius * scale;
            const h = this.playerHeight * scale;
            this.player = new THREE.Mesh(new RoundedBoxGeometry(r * 2, h, r * 2, 1, 75), material);
            this.player.geometry.translate(0, -h * 0.25, 0);
            this.player.capsuleInfo = {
                radius: r,
                segment: new THREE.Line3(new THREE.Vector3(), new THREE.Vector3(0, -h * 0.5, 0)),
            };
            this.player.name = "capsule";
            this.scene.add(this.player);
            this.reset();
            this.player.rotateY(this.playerModel.rotateY ?? 0);

            this.person.scale.multiplyScalar(modelScale * scale);
            this.person.position.set(0, -h * 0.75, 0);
            this.person.traverse((child: any) => {
                if (child.name == this.playerModel?.headObjName) {
                    this.personHead = child;
                }
            });
            this.player.add(this.person);
            this.reset();

            this.personMixer = new THREE.AnimationMixer(this.person);
            const animations = gltf.animations ?? [];
            this.personActions = new Map<string, THREE.AnimationAction>();

            const animationMappings: [string, string][] = [
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

            const findClip = (name: string) => animations.find((a: any) => a.name === name);
            for (const [clipName, actionName] of animationMappings) {
                const clip = findClip(clipName);
                if (!clip) continue;
                const action = this.personMixer.clipAction(clip);
                if (actionName === "jumping") {
                    action.setLoop(THREE.LoopOnce, 1);
                    action.clampWhenFinished = true;
                    action.setEffectiveTimeScale(1.2);
                } else {
                    action.setLoop(THREE.LoopRepeat, Infinity);
                    action.clampWhenFinished = false;
                    action.setEffectiveTimeScale(1);
                }
                action.enabled = true;
                action.setEffectiveWeight(0);
                this.personActions.set(actionName, action);
            }

            this.idleAction = this.personActions.get("idle")!;
            this.walkAction = this.personActions.get("walking")!;
            this.leftWalkAction = this.personActions.get("left_walking")!;
            this.rightWalkAction = this.personActions.get("right_walking")!;
            this.backwardAction = this.personActions.get("walking_backward")!;
            this.jumpAction = this.personActions.get("jumping")!;
            this.runAction = this.personActions.get("running")!;
            this.flyidleAction = this.personActions.get("flyidle")!;
            this.flyAction = this.personActions.get("flying")!;

            this.idleAction.setEffectiveWeight(1);
            this.idleAction.play();
            this.actionState = this.idleAction;

            this.personMixer.addEventListener("finished", (ev: any) => {
                const finishedAction: THREE.AnimationAction = ev.action;
                if (finishedAction === this.jumpAction) {
                    if (this.fwdPressed) {
                        this.playPersonAnimationByName(this.shiftPressed ? "running" : "walking");
                        return;
                    }
                    if (this.bkdPressed) {
                        this.playPersonAnimationByName("walking_backward");
                        return;
                    }
                    if (this.rgtPressed || this.lftPressed) {
                        this.playPersonAnimationByName("walking");
                        return;
                    }
                    this.playPersonAnimationByName("idle");
                }
            });
        } catch (error) {
            console.error("加载玩家模型失败:", error);
        }
    }

    playPersonAnimationByName(name: string, fade = 0.18) {
        if (!this.personActions || this.ctPressed) return;
        const next = this.personActions.get(name);
        if (!next || this.actionState === next) return;

        const duration = next.getClip().duration;
        const prev = this.actionState;

        next.reset();
        next.setEffectiveWeight(1);

        if (name == "enterCar" || name == "exitCar") {
            const enterTime = this.activeVehicle?.enterVehicleTime ?? 1.5;
            next.setEffectiveTimeScale(duration / enterTime);
            next.setLoop(THREE.LoopOnce, 1);
            next.clampWhenFinished = true;
        }

        next.play();

        if (prev && prev !== next) {
            prev.fadeOut(fade);
            next.fadeIn(fade);
        } else {
            next.fadeIn(fade);
        }

        this.actionState = next;
    }

    // ==================== 车辆模型相关 ====================

    /**
     * 加载车辆模型
     */
    async loadVehicleModel(opts: vehicleOptions) {
        try {
            if (!this.playerModel.enterCarAnim) {
                return console.warn("未配置上车动画，不执行车辆相关逻辑");
            }

            // 物理引擎只初始化一次
            await this.initRapier();
            if (!this.world) return;

            const scale = opts.scale ?? 1;
            const chassisRatio = opts.chassisRatio ?? 0.2;
            const suspensionRestLengthRatio = opts.suspensionRestLengthRatio ?? 0.2;

            // 参数乘以系数
            this.vehicleParams.power.accelerateForce = 50 * scale;
            this.vehicleParams.power.brakeForce = 200 * scale;
            this.vehicleParams.power.maxSpeed = 10000 * scale;

            // 加载模型
            const vehicleModel = await this.loader.loadAsync(opts.url);

            const { size: originalSize } = this.getBbox(vehicleModel.scene);
            const ratio = this.vehicleLength / Math.max(originalSize.x, originalSize.y, originalSize.z);
            const power = Math.round(Math.log10(ratio));
            const modelScale = Math.pow(10, power);

            // 动画混合器
            const vehicleMixer = new THREE.AnimationMixer(vehicleModel.scene);
            const animations = vehicleModel.animations ?? [];
            const vehicleActions = new Map<string, THREE.AnimationAction>();

            const findClip = (name: string) => animations.find((a: any) => a.name === name);
            const openDoorClip = findClip(opts.animations?.openDoorAnim || "");
            if (openDoorClip) {
                const action = vehicleMixer.clipAction(openDoorClip);
                action.setLoop(THREE.LoopOnce, 1);
                action.clampWhenFinished = true;
                action.setEffectiveTimeScale(openDoorClip.duration);
                action.enabled = true;
                action.setEffectiveWeight(0);
                vehicleActions.set("openDoor", action);
            }

            // 按名称顺序查找轮子
            const wheelObjects: THREE.Object3D[] = [];
            for (const wheelName of opts.wheelsNames) {
                let found = false;
                vehicleModel.scene.traverse((child) => {
                    if (child.name === wheelName && !found) {
                        wheelObjects.push(child);
                        found = true;
                    }
                });
                if (!found) console.warn(`未找到轮子: ${wheelName}`);
            }

            // 临时挂载以获取世界坐标
            const tempGroup = new THREE.Group();
            this.scene.add(tempGroup);
            vehicleModel.scene.scale.multiplyScalar(modelScale * scale);
            vehicleModel.scene.rotateY(this.vehicleParams.model.rotation);
            const { size, bbox, center } = this.getBbox(vehicleModel.scene);
            vehicleModel.scene.position.set(-center.x, -center.y, -center.z);
            tempGroup.add(vehicleModel.scene);
            tempGroup.updateMatrixWorld(true);

            const wheelsInfo: any[] = [];
            let wheelRadius = 0;
            let wheelWidth = 0;
            let suspensionRestLength = 0;
            let chassisHeight = 0;
            let wheelSizeInit = false;

            for (let i = 0; i < wheelObjects.length; i++) {
                const wheel = wheelObjects[i];
                const worldPos = new THREE.Vector3();
                const worldQuat = new THREE.Quaternion();
                const worldScale = new THREE.Vector3();
                wheel.getWorldPosition(worldPos);
                wheel.getWorldQuaternion(worldQuat);
                wheel.getWorldScale(worldScale);

                if (!wheelSizeInit) {
                    const { size: ws } = this.getBbox(wheel);
                    wheelRadius = Number((Math.max(ws.x, ws.y, ws.z) / 2).toFixed(2));
                    wheelWidth = Number(Math.min(ws.x, ws.y, ws.z).toFixed(2));
                    suspensionRestLength = Number((wheelRadius * 2 * suspensionRestLengthRatio).toFixed(2));
                    chassisHeight = Number((wheelRadius * 2 * chassisRatio).toFixed(2));
                    wheelSizeInit = true;
                }

                wheelsInfo.push({
                    axleCs: new THREE.Vector3(0, 0, -1),
                    position: worldPos,
                    quaternion: worldQuat,
                    scale: worldScale,
                    radius: wheelRadius,
                    width: wheelWidth,
                    suspensionRestLength,
                    object: wheel,
                });
            }

            tempGroup.remove(vehicleModel.scene);
            this.scene.remove(tempGroup);

            // 创建 vehicleGroup
            const vehicleGroup = new THREE.Group();
            this.scene.add(vehicleGroup);
            vehicleGroup.add(vehicleModel.scene);
            vehicleGroup.updateMatrixWorld(true);

            // 创建轮子包装组
            const wheelWrappers: THREE.Group[] = [];
            for (let i = 0; i < wheelsInfo.length; i++) {
                const wheel = wheelsInfo[i];
                const localPos = vehicleGroup.worldToLocal(wheel.position.clone());
                const wheelWrapper = new THREE.Group();
                wheelWrapper.position.copy(localPos);

                const wheelObj = wheelsInfo[i].object;
                if (wheelObj.parent) wheelObj.parent.remove(wheelObj);
                wheelObj.position.set(0, 0, 0);
                wheelObj.quaternion.copy(wheel.quaternion);
                wheelObj.scale.copy(wheel.scale);
                wheelObj.updateMatrixWorld();

                wheelWrapper.add(wheelObj);
                vehicleGroup.add(wheelWrapper);
                wheelWrappers.push(wheelWrapper);
            }

            // 车身刚体与碰撞体
            const halfExtents = size.clone().multiplyScalar(0.5);
            halfExtents.y -= chassisHeight / 2;
            vehicleModel.scene.position.y -= chassisHeight / 2;
            halfExtents.x *= 0.95;
            halfExtents.z *= 0.95;

            const chassisDesc = this.RAPIER.RigidBodyDesc.dynamic()
                .setTranslation(opts.position.x, opts.position.y, opts.position.z)
                .setLinearDamping(this.vehicleParams.chassis.linearDamping)
                .setAngularDamping(this.vehicleParams.chassis.angularDamping)
                .setCanSleep(false)
                .setAdditionalMass(10);
            const chassisBody = this.world.createRigidBody(chassisDesc);
            const chassisCollider = this.RAPIER.ColliderDesc.cuboid(halfExtents.x, halfExtents.y, halfExtents.z);
            this.world.createCollider(chassisCollider, chassisBody);

            if (this.vehicleParams.debug.showPhysicsBox) {
                const debugBox = new THREE.Mesh(
                    new THREE.BoxGeometry(halfExtents.x * 2, halfExtents.y * 2, halfExtents.z * 2),
                    new THREE.MeshBasicMaterial({
                        color: 0xff0000,
                        wireframe: true,
                        transparent: true,
                        opacity: 0.3,
                    })
                );
                vehicleGroup.add(debugBox);
            }

            vehicleGroup.position.copy(opts.position);
            vehicleGroup.updateMatrixWorld(true);

            // 创建车辆控制器
            const { vehicle, updateWheelVisuals } = createVehicleController(this.world, chassisBody, wheelWrappers, wheelsInfo);

            // 组装 VehicleInstance
            const vehicleInstance: VehicleInstance = {
                vehicleGroup,
                chassisBody,
                vehicleController: vehicle,
                updateWheelVisuals,
                vehicleMixer,
                vehicleActions,
                vehiclIsOpenDoor: false,
                vehicleBBox: bbox.clone(),
                pathPlanner: new PathPlanner(this._createObstacleCheckerFor(vehicleGroup, bbox, scale), {
                    debugEnabled: false,
                    scene: this.scene,
                    scale: this.playerModel.scale,
                }),
                scale,
                boardingPoint: opts.boardingPoint,
                seatOffset: opts.seatOffset ?? new THREE.Vector3(0, 0, 0),
                enterVehicleTime: 1.5,
                chassisRatio,
                suspensionRestLengthRatio,
                size: {
                    l: Math.max(size.x, size.z),
                    w: Math.min(size.x, size.z),
                    h: size.y,
                },
            };

            this.vehicles.push(vehicleInstance);
            console.log(`车辆加载完成，当前共 ${this.vehicles.length} 辆车`, vehicleInstance);
            // 初始化过渡
            this.setControllerTransition();
        } catch (error) {
            console.error("加载车辆模型失败:", error);
        }
    }

    getBbox(object: THREE.Object3D) {
        const bbox = new THREE.Box3().setFromObject(object);
        const center = new THREE.Vector3();
        const size = new THREE.Vector3();
        bbox.getCenter(center);
        bbox.getSize(size);
        return { bbox, center, size };
    }

    /**
     * 为指定车辆创建障碍物检测器
     */
    private _createObstacleCheckerFor(vehicleGroup: THREE.Group, bbox: THREE.Box3, scale: number): ObstacleChecker {
        return {
            isBlocked: (start: THREE.Vector3, end: THREE.Vector3): boolean => {
                const vehiclePos = vehicleGroup.position;
                const vehicleQuat = vehicleGroup.quaternion;

                const center = new THREE.Vector3();
                const size = new THREE.Vector3();
                bbox.getCenter(center);
                bbox.getSize(size);

                center.applyQuaternion(vehicleQuat).add(vehiclePos);

                const halfSize = size.clone().multiplyScalar(0.5 * scale);
                const corners: THREE.Vector3[] = [];
                for (let x = -1; x <= 1; x += 2) {
                    for (let y = -1; y <= 1; y += 2) {
                        for (let z = -1; z <= 1; z += 2) {
                            const localCorner = new THREE.Vector3(halfSize.x * x, halfSize.y * y, halfSize.z * z);
                            const worldCorner = localCorner.applyQuaternion(vehicleQuat).add(center);
                            corners.push(worldCorner);
                        }
                    }
                }

                const expandedBBox = new THREE.Box3();
                corners.forEach((corner) => expandedBBox.expandByPoint(corner));
                expandedBBox.expandByScalar(100 * this.playerModel.scale);

                const direction = new THREE.Vector3().subVectors(end, start);
                const length = direction.length();
                direction.normalize();

                const ray = new THREE.Ray(start, direction);
                const intersection = new THREE.Vector3();
                const intersects = ray.intersectBox(expandedBBox, intersection);
                return intersects !== null && start.distanceTo(intersection) < length;
            },

            getNavigationNodes: (start: THREE.Vector3, _goal: THREE.Vector3): THREE.Vector3[] => {
                const nodes: THREE.Vector3[] = [];
                const vehiclePos = vehicleGroup.position;
                const vehicleQuat = vehicleGroup.quaternion;

                const vehicleForward = new THREE.Vector3(0, 0, 1).applyQuaternion(vehicleQuat);
                const vehicleRight = new THREE.Vector3(1, 0, 0).applyQuaternion(vehicleQuat);

                const bboxSize = new THREE.Vector3();
                bbox.getSize(bboxSize);

                const halfLength = (bboxSize.z / 2) * scale;
                const halfWidth = (bboxSize.x / 2) * scale;

                const bypassMargin = 300 * this.playerModel.scale;
                const extendedMargin = 500 * this.playerModel.scale;
                const groundY = start.y;

                for (const margin of [bypassMargin, extendedMargin]) {
                    nodes.push(
                        vehiclePos
                            .clone()
                            .add(vehicleForward.clone().multiplyScalar(halfLength + margin))
                            .add(vehicleRight.clone().multiplyScalar(-halfWidth - margin))
                            .setY(groundY)
                    );
                    nodes.push(
                        vehiclePos
                            .clone()
                            .add(vehicleForward.clone().multiplyScalar(halfLength + margin))
                            .add(vehicleRight.clone().multiplyScalar(halfWidth + margin))
                            .setY(groundY)
                    );
                    nodes.push(
                        vehiclePos
                            .clone()
                            .add(vehicleForward.clone().multiplyScalar(-halfLength - margin))
                            .add(vehicleRight.clone().multiplyScalar(-halfWidth - margin))
                            .setY(groundY)
                    );
                    nodes.push(
                        vehiclePos
                            .clone()
                            .add(vehicleForward.clone().multiplyScalar(-halfLength - margin))
                            .add(vehicleRight.clone().multiplyScalar(halfWidth + margin))
                            .setY(groundY)
                    );
                }

                return nodes;
            },
        };
    }

    /**
     * 开关车门动画（操作当前 activeVehicle）
     */
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

    /**
     * 上车：自动寻找最近的车辆
     */
    enterVehicle() {
        if (this.vehicles.length === 0) return;

        // 遍历所有车辆，找距离最近的上车点
        let nearestVehicle: VehicleInstance | null = null;
        let nearestDist = Infinity;
        let nearBoardingPointWorld: THREE.Vector3 | null = null;

        for (const v of this.vehicles) {
            // 计算上车点世界坐标
            const boardingPointLocal = v.boardingPoint.clone().multiplyScalar(v.scale);
            const boardingPointWorld = new THREE.Vector3();
            v.vehicleGroup.localToWorld(boardingPointWorld.copy(boardingPointLocal));

            const dist = this.player.position.distanceTo(boardingPointWorld);
            if (dist < 800 * this.playerModel.scale && dist < nearestDist) {
                nearestDist = dist;
                nearestVehicle = v;
                nearBoardingPointWorld = boardingPointWorld;
            }
        }

        if (!nearestVehicle || !nearBoardingPointWorld) return;

        // 锁定目标车辆
        this.activeVehicle = nearestVehicle;
        const v = nearestVehicle;

        this.boardingPointWorld = nearBoardingPointWorld;
        // 计算车辆朝向
        const vehicleForward = new THREE.Vector3(0, 0, 1).applyQuaternion(v.vehicleGroup.quaternion).normalize();

        // 路径规划
        const path = v.pathPlanner.findPath(this.player.position.clone(), this.boardingPointWorld);
        this.boardingWaypoints = path;
        this.currentWaypointIndex = 0;
        this.boardingTargetDir = vehicleForward;
        this.isMovingToBoardingPoint = true;

        this.playPersonAnimationByName("walking");
    }

    /**
     * 走向上车点
     */
    updateMoveToBoardingPoint(delta: number) {
        if (!this.isMovingToBoardingPoint || !this.boardingTargetDir || this.boardingWaypoints.length === 0) {
            return;
        }

        if (this.currentWaypointIndex >= this.boardingWaypoints.length) {
            this.finalizeBoarding(delta);
            return;
        }

        const currentWaypoint = this.boardingWaypoints[this.currentWaypointIndex];
        const currentPos = this.player.position.clone();

        const horizontalDistance = new THREE.Vector2(currentWaypoint.x - currentPos.x, currentWaypoint.z - currentPos.z).length();

        const isLastWaypoint = this.currentWaypointIndex === this.boardingWaypoints.length - 1;
        const waypointThreshold = isLastWaypoint ? 0 : 10 * this.playerModel.scale;

        if (horizontalDistance > waypointThreshold) {
            const moveDir = new THREE.Vector3(currentWaypoint.x - currentPos.x, 0, currentWaypoint.z - currentPos.z).normalize();

            const moveDistance = Math.min(this.boardingMoveSpeed * this.playerModel.scale * delta, horizontalDistance);
            this.player.position.add(moveDir.multiplyScalar(moveDistance));

            const lookTarget = this.player.position.clone().add(moveDir);
            this.targetMat.lookAt(this.player.position, lookTarget, this.player.up);
            this.targetQuat.setFromRotationMatrix(this.targetMat);
            this.targetQuat.multiply(this.flip180Quat);
            const rotateAlpha = Math.min(1, this.boardingRotateSpeed * delta);
            this.player.quaternion.slerp(this.targetQuat, rotateAlpha);
        } else {
            this.currentWaypointIndex++;
        }
    }

    /**
     * 完成上车
     */
    finalizeBoarding(delta: number) {
        const v = this.activeVehicle;
        if (!this.boardingTargetDir || !v) return;

        const currentDir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.player.quaternion).normalize();
        const targetDir = this.boardingTargetDir.clone().normalize();
        const angleDiff = currentDir.angleTo(targetDir);

        if (angleDiff > 0.01) {
            const lookTarget = this.player.position.clone().add(targetDir);
            this.targetMat.lookAt(this.player.position, lookTarget, this.player.up);
            this.targetQuat.setFromRotationMatrix(this.targetMat);
            const rotateAlpha = Math.min(1, this.boardingRotateSpeed * delta);
            this.player.quaternion.slerp(this.targetQuat, rotateAlpha);
        } else {
            this.boardingWaypoints = [];
            this.currentWaypointIndex = 0;
            this.boardingTargetDir = null;

            v.pathPlanner?.clearVisualization();

            this.playPersonAnimationByName("enterCar");
            if (!v.vehiclIsOpenDoor) this.openVehicleDoor();
            this.player.rotation.copy(v.vehicleGroup.rotation);
            this.player.quaternion.multiply(this.flip180Quat);

            this.closeVehicleDoorTimer = setTimeout(
                () => {
                    this.openVehicleDoor(false);
                },
                v.enterVehicleTime * 1000 - 500
            );

            this.enterVehicleTimer = setTimeout(() => {
                if (this.boardingPointWorld) {
                    const offsetY = this.boardingPointWorld.y - this.player.position.y;
                    this.controllerMode = 1;
                    v.vehicleGroup.attach(this.player);
                    this.player.position.add(
                        v.seatOffset
                            .clone()
                            .multiplyScalar(v.scale)
                            .add(new THREE.Vector3(0, offsetY, 0))
                    );
                    this.isMovingToBoardingPoint = false;
                    if (this.isChangeControllerTransitionTimer) {
                        clearTimeout(this.isChangeControllerTransitionTimer);
                        this.isChangeControllerTransitionTimer = null;
                    }
                }
            }, v.enterVehicleTime * 1000);
        }
    }

    /**
     * 下车
     */
    exitVehicle() {
        const v = this.activeVehicle;
        if (!v) return;

        this.isMovingToBoardingPoint = false;
        this.boardingWaypoints = [];
        this.currentWaypointIndex = 0;
        this.boardingTargetDir = null;

        const vel = v.chassisBody.linvel();
        const velSpeed = new THREE.Vector3(vel.x, vel.y, vel.z).length();

        if (velSpeed > 0.1) {
            this.playPersonAnimationByName("idle");
        } else {
            this.playPersonAnimationByName("exitCar");
        }

        this.openVehicleDoor(true);
        this.closeVehicleDoorTimer = setTimeout(
            () => {
                this.openVehicleDoor(false);
            },
            v.enterVehicleTime * 1000 - 500
        );

        this.controllerMode = 0;
        this.scene.attach(this.player);

        if (this.isFirstPerson) {
            this.setFirstPersonCamera();
        }

        this.setControllerTransition();
    }

    // ==================== 相机与视角控制 ====================

    changeView() {
        this.isFirstPerson = !this.isFirstPerson;

        if (this.isFirstPerson) {
            this.setFirstPersonCamera();
        } else {
            this.scene.attach(this.camera);
            const worldPos = this.player.position.clone();
            const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.player.quaternion);
            const angle = Math.atan2(dir.z, dir.x);
            const offset = new THREE.Vector3(Math.cos(angle) * 400 * this.playerModel.scale, 200 * this.playerModel.scale, Math.sin(angle) * 400 * this.playerModel.scale);
            this.camera.position.copy(worldPos).add(offset);
            this.controls.target.copy(worldPos);
            this.controls.enableZoom = this.enableZoom;
        }

        this.setPointerLock();
    }

    setFirstPersonCamera() {
        if (this.personHead) {
            this.personHead?.attach(this.camera);
            this.camera.position.set(0, 10, 20);
        } else {
            this.player.attach(this.camera);
            this.camera.position.set(0, 40 * this.playerModel.scale, 30 * this.playerModel.scale);
        }
        this.camera.rotation.set(0, Math.PI, 0);
        this.controls.enableZoom = false;
    }

    setPointerLock() {
        if (((this.thirdMouseMode === 0 || this.thirdMouseMode === 1) && !this.isFirstPerson) || this.isFirstPerson) {
            document.body.requestPointerLock();
        } else {
            document.exitPointerLock();
        }
    }

    setCameraPos() {
        setTimeout(() => {
            if (this.isFirstPerson) {
                this.person.add(this.camera);
                this.camera.position.set(0, 40 * this.playerModel.scale, 30 * this.playerModel.scale);
            } else {
                const worldPos = this.player.position.clone();
                const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.player.quaternion);
                const angle = Math.atan2(dir.z, dir.x);
                const offset = new THREE.Vector3(Math.cos(angle) * 400 * this.playerModel.scale, -100 * this.playerModel.scale, Math.sin(angle) * 400 * this.playerModel.scale);
                this.camera.position.copy(worldPos).add(offset);
                this.controls.enableZoom = this.enableZoom;
            }
            this.camera.updateProjectionMatrix();
        }, 0);
    }

    setControls() {
        // this.controls.enabled = !(this.thirdMouseMode === 0 || this.thirdMouseMode === 1);
        this.controls.enableZoom = this.enableZoom;
        this.controls.rotateSpeed = this.mouseSensity * 0.05;
        this.controls.maxPolarAngle = Math.PI * (300 / 360);
        this.controls.mouseButtons = { LEFT: 0, MIDDLE: 1, RIGHT: 2 };
    }

    resetControls() {
        if (!this.controls) return;
        this.controls.enabled = true;
        this.controls.enablePan = true;
        this.controls.maxPolarAngle = Math.PI / 2;
        this.controls.rotateSpeed = 1;
        this.controls.enableZoom = true;
        this.controls.mouseButtons = { LEFT: 0, MIDDLE: 1, RIGHT: 2 };
    }

    setToward(dx: number, dy: number, speed: number) {
        if (this.controllerMode == 0) {
            if (this.isFirstPerson) {
                if (this.isMovingToBoardingPoint) return;
                const yaw = -dx * speed * this.mouseSensity;
                const pitch = -dy * speed * this.mouseSensity;
                this.player.rotateY(yaw);
                this.camera.rotation.x = THREE.MathUtils.clamp(this.camera.rotation.x + pitch, -1.1, 1.4);
            } else {
                const sensitivity = this.mouseSensity;
                const deltaX = -dx * speed * sensitivity;
                const deltaY = -dy * speed * sensitivity;
                const target = this.player.position.clone();
                const distance = this.camera.position.distanceTo(target);
                const currentPosition = this.camera.position.clone().sub(target);
                let theta = Math.atan2(currentPosition.x, currentPosition.z);
                let phi = Math.acos(currentPosition.y / distance);
                theta += deltaX;
                phi += deltaY;
                phi = Math.max(0.1, Math.min(Math.PI - 0.1, phi));
                const newX = distance * Math.sin(phi) * Math.sin(theta);
                const newY = distance * Math.cos(phi);
                const newZ = distance * Math.sin(phi) * Math.cos(theta);
                this.camera.position.set(target.x + newX, target.y + newY, target.z + newZ);
                this.camera.lookAt(target);
            }
        } else {
            const v = this.activeVehicle;
            if (!v) return;
            if (this.isFirstPerson) {
                const yaw = -dx * speed * this.mouseSensity;
                const pitch = -dy * speed * this.mouseSensity;
                this.camera.rotation.y = THREE.MathUtils.clamp(this.camera.rotation.y + yaw, Math.PI * (3 / 4), Math.PI * (5 / 4));
                this.camera.rotation.x = THREE.MathUtils.clamp(this.camera.rotation.x + pitch, 0, Math.PI * (1 / 3));
            } else {
                const sensitivity = this.mouseSensity;
                const deltaX = -dx * speed * sensitivity;
                const deltaY = -dy * speed * sensitivity;
                const target = v.vehicleGroup.position.clone();
                const distance = this.camera.position.distanceTo(target);
                const currentPosition = this.camera.position.clone().sub(target);
                let theta = Math.atan2(currentPosition.x, currentPosition.z);
                let phi = Math.acos(currentPosition.y / distance);
                theta += deltaX;
                phi += deltaY;
                phi = Math.max(0.1, Math.min(Math.PI - 0.1, phi));
                const newX = distance * Math.sin(phi) * Math.sin(theta);
                const newY = distance * Math.cos(phi);
                const newZ = distance * Math.sin(phi) * Math.cos(theta);
                this.camera.position.set(target.x + newX, target.y + newY, target.z + newZ);
                this.camera.lookAt(target);
            }
        }
    }

    // ==================== 物理与碰撞检测 ====================

    ensureAttributesMinimal = (geom: THREE.BufferGeometry): THREE.BufferGeometry | null => {
        if (!geom.attributes.position) return null;
        if (!geom.attributes.normal) geom.computeVertexNormals();
        if (!geom.attributes.uv) {
            const count = geom.attributes.position.count;
            const dummyUV = new Float32Array(count * 2);
            geom.setAttribute("uv", new THREE.BufferAttribute(dummyUV, 2));
        }
        return geom;
    };

    unifiedAttribute(collected: THREE.BufferGeometry[]) {
        type AttrMeta = {
            itemSize: number;
            arrayCtor: any;
            examples: number;
            normalized: boolean;
        };
        const attrMap = new Map<string, AttrMeta>();
        const attrConflict = new Set<string>();
        const requiredAttrs = new Set(["position", "normal", "uv"]);

        for (const g of collected) {
            const attrNames = Object.keys(g.attributes);
            for (const name of attrNames) {
                if (!requiredAttrs.has(name)) {
                    g.deleteAttribute(name);
                }
            }
        }

        for (const g of collected) {
            for (const name of Object.keys(g.attributes)) {
                const attr = g.attributes[name] as THREE.BufferAttribute;
                const ctor = (attr.array as any).constructor;
                const itemSize = attr.itemSize;
                const normalized = attr.normalized;

                if (!attrMap.has(name)) {
                    attrMap.set(name, { itemSize, arrayCtor: ctor, examples: 1, normalized });
                } else {
                    const m = attrMap.get(name)!;
                    if (m.itemSize !== itemSize || m.arrayCtor !== ctor || m.normalized !== normalized) {
                        attrConflict.add(name);
                    } else {
                        m.examples++;
                    }
                }
            }
        }

        if (attrConflict.size) {
            for (const g of collected) {
                for (const name of Array.from(attrConflict)) {
                    if (g.attributes[name]) g.deleteAttribute(name);
                }
            }
            for (const name of attrConflict) attrMap.delete(name);
        }

        const attrNames = Array.from(attrMap.keys());
        for (const g of collected) {
            const count = g.attributes.position.count;
            for (const name of attrNames) {
                if (!g.attributes[name]) {
                    const meta = attrMap.get(name)!;
                    const len = count * meta.itemSize;
                    const array = new meta.arrayCtor(len);
                    g.setAttribute(name, new THREE.BufferAttribute(array, meta.itemSize, meta.normalized));
                }
            }
        }

        return collected;
    }

    async createBVH(meshUrl: string = ""): Promise<void> {
        await this.initLoader();

        if (meshUrl === "") {
            if (this.collider) {
                this.scene.remove(this.collider);
                this.collider = null;
            }

            this.scene.traverse((c) => {
                const mesh = c as THREE.Mesh;
                if (mesh?.isMesh && mesh.geometry && c.name !== "capsule") {
                    try {
                        let geom = (mesh.geometry as THREE.BufferGeometry).clone();
                        geom.applyMatrix4(mesh.matrixWorld);
                        if (geom.index) geom = geom.toNonIndexed();
                        const safe = this.ensureAttributesMinimal(geom);
                        if (safe) this.collected.push(safe);
                    } catch (e) {
                        console.warn("处理网格时出错：", mesh, e);
                    }
                }
            });
            if (!this.collected.length) return;
            this.collected = this.unifiedAttribute(this.collected);
        } else {
            const gltf: GLTF = await this.loader.loadAsync(meshUrl);
            const mesh = gltf.scene.children[0] as THREE.Mesh;
            mesh.name = "BVH加载模型";
            let geom = mesh.geometry.clone();
            geom.applyMatrix4(mesh.matrixWorld);
            if (geom.index) geom = geom.toNonIndexed();
            const safe = this.ensureAttributesMinimal(geom);
            if (safe) this.collected.push(safe);
        }

        const merged = BufferGeometryUtils.mergeGeometries(this.collected, false);
        if (!merged) {
            console.error("合并几何失败");
            return;
        }

        (merged as any).boundsTree = new MeshBVH(merged, { maxDepth: 100 });
        this.collider = new THREE.Mesh(
            merged,
            new THREE.MeshBasicMaterial({
                opacity: 0.5,
                transparent: true,
                wireframe: true,
                depthTest: true,
            })
        );

        if (this.displayCollider) this.scene.add(this.collider);
        if (this.displayVisualizer) {
            if (this.visualizer) this.scene.remove(this.visualizer);
            this.visualizer = new MeshBVHHelper(this.collider, 0);
            this.scene.add(this.visualizer);
        }

        this.boundingBoxMinY = (this.collider as any).geometry.boundingBox.min.y;
    }

    createDynamicBVH(objects: THREE.Object3D[] = []) {
        if (this.dynamicCollider) {
            this.scene.remove(this.dynamicCollider);
            this.dynamicCollider = null;
        }
        this.dynamicCollected = [];
        objects.forEach((object: THREE.Object3D) => {
            object.traverse((c) => {
                const mesh = c as THREE.Mesh;
                if (mesh?.isMesh && mesh.geometry && c.name !== "capsule") {
                    try {
                        let geom = (mesh.geometry as THREE.BufferGeometry).clone();
                        geom.applyMatrix4(mesh.matrixWorld);
                        if (geom.index) geom = geom.toNonIndexed();
                        const safe = this.ensureAttributesMinimal(geom);
                        if (safe) this.dynamicCollected.push(safe);
                    } catch (e) {
                        console.warn("处理网格时出错：", mesh, e);
                    }
                }
            });
        });

        if (!this.dynamicCollected.length) return;
        this.dynamicCollected = this.unifiedAttribute(this.dynamicCollected);

        const merged = BufferGeometryUtils.mergeGeometries(this.dynamicCollected, false);
        if (!merged) {
            console.error("合并几何失败");
            return;
        }
        (merged as any).boundsTree = new MeshBVH(merged);
        this.dynamicCollider = new THREE.Mesh(
            merged,
            new THREE.MeshBasicMaterial({
                opacity: 0.5,
                transparent: true,
                wireframe: true,
                depthTest: true,
            })
        );
        if (this.displayCollider) this.scene.add(this.dynamicCollider);
    }

    getAngleWithYAxis(normal: { x: number; y: number; z: number }): number {
        const yAxis = { x: 0, y: 1, z: 0 };
        const dotProduct = normal.x * yAxis.x + normal.y * yAxis.y + normal.z * yAxis.z;
        const normalMagnitude = Math.sqrt(normal.x * normal.x + normal.y * normal.y + normal.z * normal.z);
        const cosTheta = dotProduct / normalMagnitude;
        return Math.acos(cosTheta);
    }

    // ==================== 设置控制器过渡 ====================

    setControllerTransition() {
        if (this.isChangeControllerTransitionTimer) {
            clearTimeout(this.isChangeControllerTransitionTimer);
            this.isChangeControllerTransitionTimer = null;
        }
        this.isChangeControllerTransitionTimer = setTimeout(() => {
            this.isChangeControllerTransitionTimer = null;
            // 用 activeVehicle 创建动态碰撞体，并清除所有车辆速度
            let vGroups: THREE.Group[] = [];
            for (const v of this.vehicles) {
                this.clearVehicleVelocity(v);
                vGroups.push(v.vehicleGroup);
            }
            this.createDynamicBVH(vGroups);
        }, 3000);
    }

    // 清除车辆速度
    private clearVehicleVelocity(v: VehicleInstance) {
        if (!v || !this.world || !this.RAPIER) return;

        const { chassisBody, vehicleController } = v;
        const ZERO = new this.RAPIER.Vector3(0, 0, 0);

        // 第一次清刚体速度
        chassisBody.setLinvel(ZERO, true);
        chassisBody.setAngvel(ZERO, true);

        // 清轮子引擎力，施加极大刹车力
        const BIG_BRAKE = 1e6;
        for (let i = 0; i < 4; i++) {
            vehicleController.setWheelEngineForce(i, 0);
            vehicleController.setWheelBrake(i, BIG_BRAKE);
        }

        // 让控制器用上面的参数覆盖内部轮速缓存
        vehicleController.updateVehicle(1 / 60);
        this.world.timestep = 1 / 60;
        this.world.step();

        // 第二次清刚体速度
        chassisBody.setLinvel(ZERO, true);
        chassisBody.setAngvel(ZERO, true);

        // 刹车力归零，避免影响下次正常驾驶
        for (let i = 0; i < 4; i++) {
            vehicleController.setWheelBrake(i, 0);
        }
    }

    // ==================== 循环更新 ====================

    async update(delta: number = clock.getDelta()) {
        if (!this.isupdate || !this.player || !this.collider) return;

        delta = Math.min(delta, 1 / 30);

        if (this.controllerMode == 1) {
            this.updateVehicle(delta);
        } else {
            this.updatePlayer(delta);
            if (this.isChangeControllerTransitionTimer) this.updateVehicleInertia(delta);
        }
    }

    /**
     * 更新当前驾驶的车辆
     */
    updateVehicle(delta: number) {
        const v = this.activeVehicle;
        if (!v || !this.world) return;

        const { vehicleController, chassisBody, vehicleGroup } = v;

        // 坡度检测与额外推力补偿
        const rotation = chassisBody.rotation();
        const quat = new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w);
        const forward = new THREE.Vector3(1, 0, 0).applyQuaternion(quat);
        const slopeAngle = Math.asin(forward.y);
        let factor = 1;
        if (slopeAngle < -0.05 && this.fwdPressed) {
            factor = -Math.sin(slopeAngle) * 10;
        }
        const engineForce = (Number(this.fwdPressed) * this.vehicleParams.power.accelerateForce - Number(this.bkdPressed) * this.vehicleParams.power.accelerateForce) * factor;

        vehicleController.setWheelEngineForce(0, engineForce);
        vehicleController.setWheelEngineForce(1, engineForce);
        vehicleController.setWheelEngineForce(2, engineForce);
        vehicleController.setWheelEngineForce(3, engineForce);

        const wheelBrake = Number(this.spacePressed) * this.vehicleParams.power.brakeForce * delta;
        vehicleController.setWheelBrake(0, wheelBrake);
        vehicleController.setWheelBrake(1, wheelBrake);
        vehicleController.setWheelBrake(2, wheelBrake);
        vehicleController.setWheelBrake(3, wheelBrake);

        // 转向
        const currentSteering = vehicleController.wheelSteering(0) || 0;
        const steerDirection = Number(this.lftPressed) - Number(this.rgtPressed);
        let steerSpeed: number;
        if (steerDirection === 0) {
            steerSpeed = this.vehicleParams.steering.steerReturnSpeed || 0.15;
        } else {
            steerSpeed = this.vehicleParams.steering.steerSpeed || 0.08;
        }
        const steerLerpFactor = 1.0 - Math.pow(1.0 - steerSpeed, delta);
        const targetSteering = this.vehicleParams.steering.maxSteerAngle * steerDirection;
        const steering = THREE.MathUtils.lerp(currentSteering, targetSteering, steerLerpFactor);
        vehicleController.setWheelSteering(0, steering);
        vehicleController.setWheelSteering(1, steering);

        // 漂移
        if ((this.rgtPressed || this.lftPressed) && this.shiftPressed) {
            vehicleController.setWheelSideFrictionStiffness(2, 0.5);
            vehicleController.setWheelSideFrictionStiffness(3, 0.5);
        } else {
            vehicleController.setWheelSideFrictionStiffness(2, 2);
            vehicleController.setWheelSideFrictionStiffness(3, 2);
        }

        // 更新所有车辆物理和位置
        this.updateVehicleInertia(delta);

        // 相机跟随
        if (!this.isFirstPerson) {
            const lookTarget = vehicleGroup.position.clone();
            this.camera.position.sub(this.controls.target);
            this.controls.target.copy(lookTarget);
            this.camera.position.add(lookTarget);
            this.controls.update();

            const velocity = chassisBody.linvel();
            const currentSpeed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y + velocity.z * velocity.z);
            const maxSpeed = this.vehicleParams.power.maxSpeed * v.scale;
            const speedRatio = Math.min(currentSpeed / maxSpeed, 1.0);
            const baseCamDistance = v.size.l * 0.8;
            const maxCamDistanceLimit = v.size.l * 5;
            const targetDistance = THREE.MathUtils.lerp(baseCamDistance, maxCamDistanceLimit, speedRatio);

            this._personToCam.subVectors(this.camera.position, vehicleGroup.position);
            const origin = vehicleGroup.position.clone().add(new THREE.Vector3(0, 0, 0));
            const direction = this._personToCam.clone().normalize();
            const desiredDist = targetDistance;
            this._raycasterPersonToCam.set(origin, direction);
            this._raycasterPersonToCam.far = desiredDist;
            const intersects = this._raycasterPersonToCam.intersectObject(this.collider as THREE.Object3D, false);
            if (intersects.length > 0) {
                const hit = intersects[0];
                const safeDist = Math.max(hit.distance - this._camEpsilon, this._minCamDistance);
                const targetCamPos = origin.clone().add(direction.clone().multiplyScalar(safeDist));
                this.camera.position.lerp(targetCamPos, this._camCollisionLerp);
            } else {
                this._raycasterPersonToCam.far = maxCamDistanceLimit;
                const intersectsMaxDis = this._raycasterPersonToCam.intersectObject(this.collider as THREE.Object3D, false);
                let safeDist = desiredDist;
                if (intersectsMaxDis.length) {
                    const hitMax = intersectsMaxDis[0];
                    safeDist = Math.min(desiredDist, hitMax.distance - this._camEpsilon);
                }
                const targetCamPos = origin.clone().add(direction.clone().multiplyScalar(safeDist));
                this.camera.position.lerp(targetCamPos, this._camCollisionLerp);
            }

            if (this.fwdPressed || this.bkdPressed) {
                const vel = chassisBody.linvel();
                const velHorizontal = new THREE.Vector3(vel.x, vel.y, vel.z);
                const velSpeed = velHorizontal.length();
                if (velSpeed > 0.3) {
                    const targetBehindDir = velHorizontal.clone().normalize().negate();
                    this.camBehindDir.lerp(targetBehindDir, this._camCollisionLerp).normalize();
                    const camHeightOffset = v.size.h;
                    const targetCamPos = lookTarget
                        .clone()
                        .add(this.camBehindDir.clone().multiplyScalar(desiredDist))
                        .add(new THREE.Vector3(0, camHeightOffset, 0));
                    this.camera.position.lerp(targetCamPos, this._camCollisionLerp);
                    this.controls.update();
                }
            }
        }

        // 翻车检测
        const vehicleUp = this.upVector.clone().applyQuaternion(vehicleGroup.quaternion);
        const angleWithUp = vehicleUp.angleTo(this.upVector);
        if (angleWithUp > Math.PI / 2) {
            const size = new THREE.Vector3();
            v.vehicleBBox?.getSize(size);
            const translation2 = chassisBody.translation();
            chassisBody.setTranslation(new this.RAPIER.Vector3(translation2.x, translation2.y + size.y, translation2.z), true);
            chassisBody.setRotation(new this.RAPIER.Quaternion(0, 0, 0, 1), true);
            chassisBody.setLinvel(new this.RAPIER.Vector3(0, 0, 0), true);
            chassisBody.setAngvel(new this.RAPIER.Vector3(0, 0, 0), true);
        }
    }

    /**
     * 更新所有车辆物理和位置
     */
    updateVehicleInertia(delta: number) {
        if (!this.world) return;

        // 更新所有车辆的物理
        this.world.timestep = delta;
        this.world.step();

        for (const v of this.vehicles) {
            const { vehicleController, chassisBody, vehicleGroup, updateWheelVisuals } = v;

            vehicleController.updateVehicle(delta);

            const velocity = chassisBody.linvel();
            const currentSpeed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y + velocity.z * velocity.z);
            const maxSpeed = this.vehicleParams.power.maxSpeed * v.scale;
            if (currentSpeed > maxSpeed) {
                const s = maxSpeed / currentSpeed;
                chassisBody.setLinvel(new this.RAPIER.Vector3(velocity.x * s, velocity.y * s, velocity.z * s), true);
            }

            const translation = chassisBody.translation();
            const rotationSync = chassisBody.rotation();
            vehicleGroup.position.set(translation.x, translation.y, translation.z);
            vehicleGroup.quaternion.set(rotationSync.x, rotationSync.y, rotationSync.z, rotationSync.w);

            if (updateWheelVisuals) updateWheelVisuals();
        }
    }

    /**
     * 更新人物
     */
    updatePlayer(delta: number) {
        if (this.isMovingToBoardingPoint) {
            this.updateMoveToBoardingPoint(delta);
        }

        if (!this.isFlying) {
            this.player.position.addScaledVector(this.playerVelocity, delta);
        }

        this.updateMixers(delta);

        this.camera.getWorldDirection(this.camDir);
        let angle = Math.atan2(this.camDir.z, this.camDir.x) + Math.PI / 2;
        angle = 2 * Math.PI - angle;

        this.moveDir.set(0, 0, 0);
        if (this.fwdPressed) this.moveDir.add(this.DIR_FWD);
        if (this.bkdPressed) this.moveDir.add(this.DIR_BKD);
        if (this.lftPressed) this.moveDir.add(this.DIR_LFT);
        if (this.rgtPressed) this.moveDir.add(this.DIR_RGT);

        if (this.isFlying) {
            if (this.fwdPressed) this.moveDir.y = this.camDir.y;
            else this.moveDir.y = 0;
            if (this.spacePressed) this.moveDir.add(this.DIR_UP);
        }

        if (this.isFlying && this.fwdPressed) {
            this.playerSpeed = this.shiftPressed ? this.originPlayerSpeed * 12 : this.originPlayerSpeed * 7;
        } else {
            this.playerSpeed = this.shiftPressed ? this.originPlayerSpeed * 2 : this.originPlayerSpeed;
        }

        this.moveDir.normalize().applyAxisAngle(this.upVector, angle);
        this.player.position.addScaledVector(this.moveDir, this.playerSpeed * delta);

        // 向下射线检测地面
        let playerDistanceFromGround = Infinity;
        this._originTmp.set(this.player.position.x, this.player.position.y, this.player.position.z);
        this._raycaster.ray.origin.copy(this._originTmp);
        const intersects = this._raycaster.intersectObject(this.collider as THREE.Object3D, false);

        if (intersects.length > 0) {
            playerDistanceFromGround = this.player.position.y - intersects[0].point.y;
            const maxH = this.playerHeight * this.playerModel.scale * 0.9;
            const h = this.playerHeight * this.playerModel.scale * 0.75;
            const minH = this.playerHeight * this.playerModel.scale * 0.7;

            if (!this.isFlying) {
                if (playerDistanceFromGround >= maxH) {
                    this.playerVelocity.y += delta * this.gravity;
                    this.player.position.addScaledVector(this.playerVelocity, delta);
                    this.playerIsOnGround = false;
                } else if (playerDistanceFromGround >= h && playerDistanceFromGround < maxH) {
                    if (!this.spacePressed) {
                        this.playerVelocity.set(0, 0, 0);
                        this.playerIsOnGround = true;
                        this.player.position.y = intersects[0].point.y + h;
                    }
                } else if (playerDistanceFromGround >= minH && playerDistanceFromGround < h) {
                    this.playerVelocity.set(0, 0, 0);
                    this.playerIsOnGround = true;
                    this.player.position.y = intersects[0].point.y + h;
                } else if (playerDistanceFromGround < minH) {
                    this.playerVelocity.set(0, 0, 0);
                    this.player.position.set(this.player.position.x, intersects[0].point.y + h, this.player.position.z);
                    this.playerIsOnGround = true;
                }
            }
        }

        this.player.updateMatrixWorld();

        // BVH 碰撞检测
        const capsuleInfo = this.player.capsuleInfo;
        this.tempBox.makeEmpty();
        this.tempMat.copy(this.collider!.matrixWorld).invert();
        this.tempSegment.copy(capsuleInfo.segment);
        this.tempSegment.start.applyMatrix4(this.player.matrixWorld).applyMatrix4(this.tempMat);
        this.tempSegment.end.applyMatrix4(this.player.matrixWorld).applyMatrix4(this.tempMat);
        this.tempBox.expandByPoint(this.tempSegment.start);
        this.tempBox.expandByPoint(this.tempSegment.end);
        this.tempBox.expandByScalar(capsuleInfo.radius);

        if (!this.isMovingToBoardingPoint) {
            (this.collider?.geometry as any)?.boundsTree?.shapecast({
                intersectsBounds: (box: THREE.Box3) => box.intersectsBox(this.tempBox),
                intersectsTriangle: (tri: any) => {
                    const triPoint = this.tempVector;
                    const capsulePoint = this.tempVector2;
                    const distance = tri.closestPointToSegment(this.tempSegment, triPoint, capsulePoint);
                    if (distance < capsuleInfo.radius) {
                        const normal = tri.getNormal(new THREE.Vector3());
                        if (normal.y > 0.5 && !this.isFlying) return;
                        const depth = capsuleInfo.radius - distance;
                        const direction = capsulePoint.sub(triPoint).normalize();
                        this.tempSegment.start.addScaledVector(direction, depth);
                        this.tempSegment.end.addScaledVector(direction, depth);
                    }
                },
            });

            (this.dynamicCollider?.geometry as any)?.boundsTree?.shapecast({
                intersectsBounds: (box: THREE.Box3) => box.intersectsBox(this.tempBox),
                intersectsTriangle: (tri: any) => {
                    const triPoint = this.tempVector;
                    const capsulePoint = this.tempVector2;
                    const distance = tri.closestPointToSegment(this.tempSegment, triPoint, capsulePoint);
                    if (distance < capsuleInfo.radius) {
                        const depth = capsuleInfo.radius - distance;
                        const direction = capsulePoint.sub(triPoint).normalize();
                        this.tempSegment.start.addScaledVector(direction, depth);
                        this.tempSegment.end.addScaledVector(direction, depth);
                    }
                },
            });
        }

        const newPosition = this.tempVector.copy(this.tempSegment.start).applyMatrix4(this.collider!.matrixWorld);
        const deltaVector = this.tempVector2.subVectors(newPosition, this.player.position);
        const offset = Math.max(0, deltaVector.length() - 1e-5);
        deltaVector.normalize().multiplyScalar(offset);
        this.player.position.add(deltaVector);

        // 第三人称-朝向
        if (!this.isFirstPerson && !this.isFlying) {
            this.camDir.y = 0;
            this.camDir.normalize();
            this.camDir.negate();
            this.moveDir.normalize();
            this.moveDir.negate();

            let lookTarget: THREE.Vector3;
            if (this.thirdMouseMode === 0 || this.thirdMouseMode === 2) {
                if (this.moveDir.lengthSq() > 0) {
                    lookTarget = this.player.position.clone().add(this.moveDir);
                } else {
                    lookTarget = this.player.position.clone().add(this.camDir);
                }
                this.targetMat.lookAt(this.player.position, lookTarget, this.player.up);
                this.targetQuat.setFromRotationMatrix(this.targetMat);
                const alpha = Math.min(1, this.rotationSpeed * delta);
                this.player.quaternion.slerp(this.targetQuat, alpha);
            }
            if ((this.thirdMouseMode === 1 || this.thirdMouseMode === 3) && this.moveDir.lengthSq() > 0) {
                lookTarget = this.player.position.clone().add(this.moveDir);
                this.targetMat.lookAt(this.player.position, lookTarget, this.player.up);
                this.targetQuat.setFromRotationMatrix(this.targetMat);
                const alpha = Math.min(1, this.rotationSpeed * delta);
                this.player.quaternion.slerp(this.targetQuat, alpha);
            }
        }

        // 飞行模式朝向
        if (this.isFlying) {
            if (!this.isFirstPerson) {
                this.camDir.y = 0;
                this.camDir.normalize();
                this.camDir.negate();
                this.moveDir.normalize();
                this.moveDir.negate();
                const lookTarget = this.player.position.clone().add(this.fwdPressed ? this.moveDir : this.camDir);
                this.targetMat.lookAt(this.player.position, lookTarget, this.player.up);
                this.targetQuat.setFromRotationMatrix(this.targetMat);
                const alpha = Math.min(1, this.rotationSpeed * delta);
                this.player.quaternion.slerp(this.targetQuat, alpha);
            }
        }

        // 第三人称-相机跟随
        if (!this.isFirstPerson) {
            const lookTarget = this.player.position.clone();
            lookTarget.y += (this.playerHeight / 6) * this.playerModel.scale;
            this.camera.position.sub(this.controls.target);
            this.controls.target.copy(lookTarget);
            this.camera.position.add(lookTarget);
            this.controls.update();

            // 当视线被遮挡时的处理
            if (!this.enableZoom) {
                this._personToCam.subVectors(this.camera.position, this.player.position);
                const origin = this.player.position.clone();
                const direction = this._personToCam.clone().normalize();
                const desiredDist = this._personToCam.length();
                this._raycasterPersonToCam.set(origin, direction);
                this._raycasterPersonToCam.far = desiredDist;

                const intersectsCamera = this._raycasterPersonToCam.intersectObject(this.collider as THREE.Object3D, false);

                if (intersectsCamera.length > 0) {
                    const hit = intersectsCamera[0];
                    const safeDist = Math.max(hit.distance - this._camEpsilon, this._minCamDistance);
                    const targetCamPos = origin.clone().add(direction.clone().multiplyScalar(safeDist));
                    this.camera.position.lerp(targetCamPos, this._camCollisionLerp);
                } else {
                    this._raycasterPersonToCam.far = this._maxCamDistance;
                    const intersectsMaxDis = this._raycasterPersonToCam.intersectObject(this.collider as THREE.Object3D, false);
                    let safeDist = this._maxCamDistance;
                    if (intersectsMaxDis.length) {
                        const hitMax = intersectsMaxDis[0];
                        safeDist = hitMax.distance - this._camEpsilon;
                    }
                    const targetCamPos = origin.clone().add(direction.clone().multiplyScalar(safeDist));
                    this.camera.position.lerp(targetCamPos, this._camCollisionLerp);
                }
            }
        }

        // 掉出场景重置
        if (this.player.position.y < this.boundingBoxMinY - 1) {
            this._originTmp.set(this.player.position.x, 10000, this.player.position.z);
            this._raycaster.ray.origin.copy(this._originTmp);
            const intersectsFall = this._raycaster.intersectObject(this.collider as THREE.Object3D, false);

            if (intersectsFall.length > 0) {
                console.log("玩家为bug意外掉落");
                this.reset(new THREE.Vector3(this.player.position.x, intersectsFall[0].point.y + 5, this.player.position.z));
            } else {
                console.log("玩家正常掉落");
                this.reset(new THREE.Vector3(this.player.position.x, this.player.position.y + 15, this.player.position.z));
            }
        }
    }

    /**
     * 更新模型动画
     */
    private updateMixers(delta: number) {
        if (this.personMixer) this.personMixer.update(delta);
        // 更新所有车辆动画
        for (const v of this.vehicles) {
            v.vehicleMixer?.update(delta);
        }
    }

    reset(position?: THREE.Vector3) {
        if (!this.player) return;
        this.playerVelocity.set(0, 0, 0);
        this.player.position.copy(position ?? this.initPos);
    }

    getPosition() {
        return this.player.position;
    }

    // ==================== 输入处理 ====================

    setInput(
        input: Partial<{
            moveX: 1 | 0 | -1;
            moveY: 1 | 0 | -1;
            lookDeltaX: number;
            lookDeltaY: number;
            jump: boolean;
            shift: boolean;
            toggleView: boolean;
            toggleFly: boolean;
        }>
    ) {
        if (typeof input.moveX === "number") {
            this.lftPressed = input.moveX === -1;
            this.rgtPressed = input.moveX === 1;
            this.setAnimationByPressed();
        }
        if (typeof input.moveY === "number") {
            this.fwdPressed = input.moveY === 1;
            this.bkdPressed = input.moveY === -1;
            this.setAnimationByPressed();
        }

        if (typeof input.lookDeltaX === "number" && typeof input.lookDeltaY === "number") {
            this.setToward(input.lookDeltaX, input.lookDeltaY, 0.002);
        }

        if (typeof input.jump === "boolean") {
            if (input.jump) {
                this.spacePressed = true;
                if (!this.playerIsOnGround || this.isFlying) return;
                this.playPersonAnimationByName("jumping");
                this.playerVelocity.y = this.jumpHeight;
                this.playerIsOnGround = false;
            } else {
                this.spacePressed = false;
            }
        }

        if (typeof input.shift === "boolean") {
            this.shiftPressed = input.shift;
        }

        if (input.toggleView) {
            this.changeView();
        }

        if (input.toggleFly) {
            this.isFlying = !this.isFlying;
            this.setAnimationByPressed();
            if (!this.isFlying && !this.playerIsOnGround) {
                this.playPersonAnimationByName("jumping");
            }
        }
    }

    private setAnimationByPressed = () => {
        this._maxCamDistance = this.orginMaxCamDistance;
        if (this.isMovingToBoardingPoint) {
            this.isMovingToBoardingPoint = false;
            this.boardingWaypoints = [];
            this.currentWaypointIndex = 0;
            this.boardingTargetDir = null;
        }

        if (this.enterVehicleTimer) {
            clearTimeout(this.enterVehicleTimer);
            this.enterVehicleTimer = null;
        }
        if (this.closeVehicleDoorTimer) {
            clearTimeout(this.closeVehicleDoorTimer);
            this.closeVehicleDoorTimer = null;
        }

        if (this.isFlying) {
            if (!this.fwdPressed) {
                this.playPersonAnimationByName("flyidle");
                return;
            }
            this.playPersonAnimationByName("flying");
            this._maxCamDistance = this.orginMaxCamDistance * 2;
            return;
        }

        if (this.playerIsOnGround) {
            if (!this.fwdPressed && !this.bkdPressed && !this.lftPressed && !this.rgtPressed) {
                this.playPersonAnimationByName("idle");
                return;
            }

            if (this.fwdPressed) {
                this.playPersonAnimationByName(this.shiftPressed ? "running" : "walking");
                return;
            }

            if (!this.isFirstPerson && (this.lftPressed || this.rgtPressed || this.bkdPressed)) {
                this.playPersonAnimationByName(this.shiftPressed ? "running" : "walking");
                return;
            }

            if (this.lftPressed) {
                this.playPersonAnimationByName("left_walking");
                return;
            }
            if (this.rgtPressed) {
                this.playPersonAnimationByName("right_walking");
                return;
            }
            if (this.bkdPressed) {
                this.playPersonAnimationByName("walking_backward");
                return;
            }
        }

        if (this.recheckAnimTimer !== null) {
            clearTimeout(this.recheckAnimTimer);
        }
        this.recheckAnimTimer = setTimeout(() => {
            this.setAnimationByPressed();
            this.recheckAnimTimer = null;
        }, 200);
    };

    // ==================== 事件处理 ====================

    private _boundOnKeydown = async (e: KeyboardEvent) => {
        if (e.ctrlKey && ["KeyW", "KeyA", "KeyS", "KeyD"].includes(e.code)) {
            e.preventDefault();
        }
        switch (e.code) {
            case "KeyW":
            case "ArrowUp":
                this.fwdPressed = true;
                this.setAnimationByPressed();
                break;
            case "KeyS":
            case "ArrowDown":
                this.bkdPressed = true;
                this.setAnimationByPressed();
                break;
            case "KeyD":
            case "ArrowRight":
                this.rgtPressed = true;
                this.setAnimationByPressed();
                break;
            case "KeyA":
            case "ArrowLeft":
                this.lftPressed = true;
                this.setAnimationByPressed();
                break;
            case "ShiftLeft":
            case "ShiftRight":
                this.shiftPressed = true;
                this.setAnimationByPressed();
                this.controls.mouseButtons = { LEFT: 2, MIDDLE: 1, RIGHT: 0 };
                break;
            case "Space":
                this.spacePressed = true;
                if (!this.playerIsOnGround || this.isFlying) return;
                const next = this.personActions?.get("jumping");
                if (next && this.actionState === next) return;
                this.playPersonAnimationByName("jumping");
                this.playerVelocity.y = this.jumpHeight;
                this.playerIsOnGround = false;
                break;
            case "ControlLeft":
                this.ctPressed = true;
                break;
            case "KeyV":
                this.changeView();
                break;
            case "KeyF":
                if (this.controllerMode == 1) return;
                this.isFlying = !this.isFlying;
                this.setAnimationByPressed();
                if (!this.isFlying && !this.playerIsOnGround) {
                    this.playPersonAnimationByName("jumping");
                }
                break;
            case "KeyE":
                if (this.isFlying) return;
                if (this.controllerMode == 0) {
                    this.enterVehicle();
                } else {
                    this.exitVehicle();
                }
                break;
        }
    };

    private _boundOnKeyup = (e: KeyboardEvent) => {
        switch (e.code) {
            case "KeyW":
            case "ArrowUp":
                this.fwdPressed = false;
                this.setAnimationByPressed();
                break;
            case "KeyS":
            case "ArrowDown":
                this.bkdPressed = false;
                this.setAnimationByPressed();
                break;
            case "KeyD":
            case "ArrowRight":
                this.rgtPressed = false;
                this.setAnimationByPressed();
                break;
            case "KeyA":
            case "ArrowLeft":
                this.lftPressed = false;
                this.setAnimationByPressed();
                break;
            case "ShiftLeft":
            case "ShiftRight":
                this.shiftPressed = false;
                this.setAnimationByPressed();
                this.controls.mouseButtons = { LEFT: 0, MIDDLE: 1, RIGHT: 2 };
                break;
            case "Space":
                this.spacePressed = false;
                break;
            case "ControlLeft":
                this.ctPressed = false;
                break;
        }
    };

    private _mouseMove = (e: MouseEvent) => {
        if (document.pointerLockElement !== document.body) return;
        this.setToward(e.movementX, e.movementY, 0.0001);
    };

    private _mouseClick = (_e: MouseEvent) => {
        this.setPointerLock();
    };

    onAllEvent() {
        this.isupdate = true;
        this.setPointerLock();
        window.addEventListener("keydown", this._boundOnKeydown);
        window.addEventListener("keyup", this._boundOnKeyup);
        window.addEventListener("mousemove", this._mouseMove);
        window.addEventListener("click", this._mouseClick);
    }

    offAllEvent() {
        this.isupdate = false;
        document.exitPointerLock();
        window.removeEventListener("keydown", this._boundOnKeydown);
        window.removeEventListener("keyup", this._boundOnKeyup);
        window.removeEventListener("mousemove", this._mouseMove);
        window.removeEventListener("click", this._mouseClick);
    }

    // ==================== 移动端控制 ====================

    onPointerDown = (e: PointerEvent) => {
        if (e.pointerType !== "touch") return;
        this.isLookDown = true;
        this.lookPointerId = e.pointerId;
        this.lastTouchX = e.clientX;
        this.lastTouchY = e.clientY;
        this.lookAreaEl?.setPointerCapture?.(e.pointerId);
        e.preventDefault();
    };

    onPointerMove = (e: PointerEvent) => {
        if (!this.isLookDown || e.pointerId !== this.lookPointerId) return;
        const dx = e.clientX - this.lastTouchX;
        const dy = e.clientY - this.lastTouchY;
        this.lastTouchX = e.clientX;
        this.lastTouchY = e.clientY;
        this.setInput({ lookDeltaX: dx, lookDeltaY: dy });
        e.preventDefault();
    };

    onPointerUp = (e: PointerEvent) => {
        if (e.pointerId !== this.lookPointerId) return;
        this.isLookDown = false;
        this.lookPointerId = null;
        this.lookAreaEl?.releasePointerCapture?.(e.pointerId);
    };

    async initMobileControls() {
        this.controls.maxPolarAngle = Math.PI * (300 / 360);
        this.controls.touches = { ONE: null as any, TWO: null as any };
        this.nippleModule = await import("nipplejs");
        const nipple = this.nippleModule?.default;
        const JOY_SIZE = 120;
        const container = document.body;

        this.joystickZoneEl = document.createElement("div");
        this.joystickZoneEl.id = "joy-zone";
        Object.assign(this.joystickZoneEl.style, {
            position: "absolute",
            left: "16px",
            bottom: "16px",
            width: `${JOY_SIZE + 40}px`,
            height: `${JOY_SIZE + 40}px`,
            touchAction: "none",
            zIndex: "999",
            pointerEvents: "auto",
            WebkitUserSelect: "none",
            userSelect: "none",
        });
        container.appendChild(this.joystickZoneEl);

        ["touchstart", "touchmove", "touchend", "touchcancel"].forEach((evtName) => {
            this.joystickZoneEl?.addEventListener(evtName, (e) => e.preventDefault(), {
                passive: false,
            });
        });

        this.joystickManager = nipple.create({
            zone: this.joystickZoneEl,
            mode: "static",
            position: {
                left: `${(JOY_SIZE + 40) / 2}px`,
                bottom: `${(JOY_SIZE + 40) / 2}px`,
            },
            color: "#ffffff",
            size: JOY_SIZE,
            multitouch: true,
            maxNumberOfNipples: 1,
        });

        this.joystickManager.on("move", (_evt: any, data: any) => {
            if (!data) return;
            const rawX = data.vector?.x ?? 0;
            const rawY = data.vector?.y ?? 0;
            const distance = data.distance ?? 0;
            const deadzone = 0.5;
            const dirX = rawX > deadzone ? 1 : rawX < -deadzone ? -1 : 0;
            const dirY = rawY > deadzone ? 1 : rawY < -deadzone ? -1 : 0;
            const sprintThreshold = JOY_SIZE / 2;
            const isSprinting = distance >= sprintThreshold;
            const prev = this.prevJoyState || { dirX: 0, dirY: 0, shift: false };
            if (dirX === prev.dirX && dirY === prev.dirY && isSprinting === prev.shift) return;
            this.prevJoyState = { dirX, dirY, shift: isSprinting };
            this.setInput({ moveX: dirX, moveY: dirY, shift: isSprinting });
        });

        this.joystickManager.on("end", () => {
            const prev = this.prevJoyState || { dirX: 0, dirY: 0, shift: false };
            if (prev.dirX !== 0 || prev.dirY !== 0 || prev.shift !== false) {
                this.prevJoyState = { dirX: 0, dirY: 0, shift: false };
                this.setInput({ moveX: 0, moveY: 0, shift: false });
            }
        });

        this.lookAreaEl = document.createElement("div");
        Object.assign(this.lookAreaEl.style, {
            position: "absolute",
            right: "0",
            bottom: "0",
            width: "50%",
            height: "100%",
            zIndex: "998",
            touchAction: "none",
            WebkitUserSelect: "none",
            userSelect: "none",
        });
        container.appendChild(this.lookAreaEl);

        ["touchstart", "touchmove", "touchend", "touchcancel"].forEach((evtName) => {
            this.lookAreaEl?.addEventListener(evtName, (e) => e.preventDefault(), {
                passive: false,
            });
        });

        this.lookAreaEl.addEventListener("pointerdown", this.onPointerDown, { passive: false });
        this.lookAreaEl.addEventListener("pointermove", this.onPointerMove, { passive: false });
        this.lookAreaEl.addEventListener("pointerup", this.onPointerUp, { passive: false });
        this.lookAreaEl.addEventListener("pointercancel", this.onPointerUp, { passive: false });

        const createBtn = (rightPx: number, bottomPx: number, bgUrl?: string) => {
            const btn = document.createElement("button");
            const styles: Partial<CSSStyleDeclaration> = {
                position: "absolute",
                right: `${rightPx}px`,
                bottom: `${bottomPx}px`,
                width: "56px",
                height: "56px",
                zIndex: "1000",
                borderRadius: "50%",
                border: "2px solid black",
                background: "rgba(0,0,0)",
                padding: "20px",
                opacity: "0.95",
                touchAction: "none",
                fontSize: "14px",
                userSelect: "none",
                overflow: "hidden",
                boxSizing: "border-box",
                backgroundColor: "transparent",
                backgroundRepeat: "no-repeat, no-repeat",
                backgroundPosition: "center center, center center",
                backgroundSize: "100% 100%, 80% 80%",
            };

            if (bgUrl) {
                const overlayColor = "rgba(0,0,0,0.5)";
                styles.backgroundImage = `linear-gradient(${overlayColor}, ${overlayColor}), url("${bgUrl}")`;
            }

            Object.assign(btn.style, styles);
            container.appendChild(btn);
            ["touchstart", "touchend", "touchcancel"].forEach((evtName) => {
                btn.addEventListener(evtName, (e) => e.preventDefault(), { passive: false });
            });
            return btn;
        };

        this.jumpBtnEl = createBtn(14, 14, jumpIconModule);
        this.jumpBtnEl.addEventListener(
            "touchstart",
            (e) => {
                e.preventDefault();
                this.setInput({ jump: true });
            },
            { passive: false }
        );
        this.jumpBtnEl.addEventListener(
            "touchend",
            (e) => {
                e.preventDefault();
                this.setInput({ jump: false });
            },
            { passive: false }
        );
        this.jumpBtnEl.addEventListener(
            "touchcancel",
            (e) => {
                e.preventDefault();
                this.setInput({ jump: false });
            },
            { passive: false }
        );

        this.flyBtnEl = createBtn(14, 14 + 80, flyIconModule);
        this.flyBtnEl.addEventListener(
            "touchstart",
            (e) => {
                e.preventDefault();
                this.setInput({ toggleFly: true });
            },
            { passive: false }
        );

        this.viewBtnEl = createBtn(14, 14 + 200, viewIconModule);
        this.viewBtnEl.addEventListener(
            "touchstart",
            (e) => {
                e.preventDefault();
                this.setInput({ toggleView: true });
            },
            { passive: false }
        );
    }

    destroyMobileControls() {
        try {
            if (this.joystickManager && this.joystickManager.destroy) {
                this.joystickManager.destroy();
                this.joystickManager = null;
            }
            if (this.joystickZoneEl?.parentElement) {
                this.joystickZoneEl.parentElement.removeChild(this.joystickZoneEl);
                this.joystickZoneEl = null;
            }
            if (this.lookAreaEl?.parentElement) {
                this.lookAreaEl.parentElement.removeChild(this.lookAreaEl);
                this.lookAreaEl = null;
            }
            if (this.jumpBtnEl?.parentElement) {
                this.jumpBtnEl.parentElement.removeChild(this.jumpBtnEl);
                this.jumpBtnEl = null;
            }
            if (this.flyBtnEl?.parentElement) {
                this.flyBtnEl.parentElement.removeChild(this.flyBtnEl);
                this.flyBtnEl = null;
            }
            if (this.viewBtnEl?.parentElement) {
                this.viewBtnEl.parentElement.removeChild(this.viewBtnEl);
                this.viewBtnEl = null;
            }
            this.lookAreaEl?.removeEventListener("pointerdown", this.onPointerDown);
            this.lookAreaEl?.removeEventListener("pointermove", this.onPointerMove);
            this.lookAreaEl?.removeEventListener("pointerup", this.onPointerUp);
            this.lookAreaEl?.removeEventListener("pointercancel", this.onPointerUp);
        } catch (e) {
            console.warn("销毁移动端摇杆控制时出错：", e);
        }
    }

    // ==================== 销毁 ====================

    destroy() {
        this.offAllEvent();
        if (this.player) {
            this.player.remove(this.camera);
            this.scene.remove(this.player);
        }
        (this.player as any) = null;
        if (this.person) {
            this.scene.remove(this.person);
            this.person = null;
        }

        this.resetControls();

        if (this.visualizer) {
            this.scene.remove(this.visualizer);
            this.visualizer = null;
        }
        if (this.collider) {
            this.scene.remove(this.collider);
            this.collider = null;
        }

        this.destroyMobileControls();

        // 清理所有车辆
        for (const v of this.vehicles) {
            this.scene.remove(v.vehicleGroup);
            v.pathPlanner?.dispose();
        }
        this.vehicles = [];
        this.activeVehicle = null;

        controllerInstance = null;
    }
}

// ==================== 导出API ====================

export function playerController() {
    if (!controllerInstance) controllerInstance = new PlayerController();
    const c = controllerInstance;
    return {
        init: (opts: PlayerControllerOptions, callback?: () => void) => c.init(opts, callback),
        changeView: () => c.changeView(),
        reset: (pos?: THREE.Vector3) => c.reset(pos),
        update: (dt?: number) => c.update(dt),
        destroy: () => c.destroy(),
        setInput: (i: any) => c.setInput(i),
        getposition: () => c.getPosition(),
        loadVehicleModel: (params: vehicleOptions) => c.loadVehicleModel(params),
        getPreson: () => c.person,
        getActiveVehicle: () => c.activeVehicle,
        getAllVehicles: () => c.vehicles,
    };
}

export function onAllEvent(): void {
    if (!controllerInstance) controllerInstance = new PlayerController();
    controllerInstance.onAllEvent();
}

export function offAllEvent(): void {
    if (!controllerInstance) return;
    controllerInstance.offAllEvent();
}
