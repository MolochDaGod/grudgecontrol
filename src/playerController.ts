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

THREE.Mesh.prototype.raycast = acceleratedRaycast;

let controllerInstance: PlayerController | null = null;
const clock = new THREE.Clock();

type PlayerControllerOptions = {
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
        scale: number;
        gravity?: number;
        jumpHeight?: number;
        speed?: number;
        rotateY?: number;
    };
    initPos?: THREE.Vector3;
    intDirection?: THREE.Vector3;
    mouseSensity?: number;
    minCamDistance?: number;
    maxCamDistance?: number;
    colliderMeshUrl?: string;
    isShowMobileControls?: boolean;
    thirdMouseMode?: 0 | 1 | 2 | 3;
};

class PlayerController {
    loader: GLTFLoader = new GLTFLoader();
    //  基本配置与参数
    scene!: THREE.Scene;
    camera!: THREE.PerspectiveCamera;
    controls!: OrbitControls;
    playerModel!: {
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
        scale: number;
        gravity?: number;
        jumpHeight?: number;
        speed?: number;
        rotateY?: number;
    };
    initPos!: THREE.Vector3;
    intDirection!: THREE.Vector3;
    visualizeDepth!: number;
    gravity!: number;
    jumpHeight!: number;
    playerSpeed!: number;
    mouseSensity!: number;
    originPlayerSpeed!: number;
    colliderMeshUrl!: string;
    isShowMobileControls!: boolean;
    thirdMouseMode!: 0 | 1 | 2 | 3; // 0: 隐藏鼠标控制朝向及视角，1: 隐藏鼠标仅控制视角，2: 显示鼠标拖拽控制朝向及视角, 3: 显示鼠标拖拽仅控制视角

    playerRadius: number = 45;
    playerHeight: number = 180;
    isFirstPerson: boolean = false;
    boundingBoxMinY: number = 0;
    // 测试参数
    displayPlayer: boolean = false;
    displayCollider: boolean = false;
    displayVisualizer: boolean = false;

    // 场景对象
    collider: THREE.Mesh | null = null;
    visualizer: MeshBVHHelper | null = null;
    player!: THREE.Mesh & { capsuleInfo?: any };
    person: THREE.Object3D | null = null;

    // 状态开关
    playerIsOnGround: boolean = false;
    isupdate: boolean = true;
    isFlying: boolean = false;

    // 输入状态
    fwdPressed: boolean = false;
    bkdPressed: boolean = false;
    lftPressed: boolean = false;
    rgtPressed: boolean = false;
    spacePressed: boolean = false;
    ctPressed: boolean = false;
    shiftPressed: boolean = false;

    // 移动端输入
    prevJoyState = { dirX: 0, dirY: 0, shift: false };
    nippleModule: any = null;

    // 移动控制相关
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

    // 第三人称
    _camCollisionLerp: number = 0.18; // 平滑系数
    _camEpsilon: number = 0.35; // 摄像机与障碍物之间的安全距离（米）
    _minCamDistance: number = 1.0; // 摄像机最小距离
    _maxCamDistance: number = 4.4; // 摄像机最大距离
    orginMaxCamDistance: number = 4.4;

    // 物理/运动
    playerVelocity = new THREE.Vector3(); // 玩家速度向量
    readonly upVector = new THREE.Vector3(0, 1, 0);

    //  临时复用向量/矩阵
    readonly tempVector = new THREE.Vector3();
    readonly tempVector2 = new THREE.Vector3();
    readonly tempBox = new THREE.Box3();
    readonly tempMat = new THREE.Matrix4();
    readonly tempSegment = new THREE.Line3();

    // 动画相关
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
    controlDroneAction!: THREE.AnimationAction;
    actionState!: THREE.AnimationAction;
    // 检测动画定时
    recheckAnimTimer: any | null = null;

    //  复用向量：用于相机朝向 / 移动
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

    readonly _personToCam = new THREE.Vector3();

    readonly _originTmp = new THREE.Vector3();
    readonly _raycaster = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0));
    readonly _raycasterPersonToCam = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3());

    // 射线检测时只返回第一个碰撞
    constructor() {
        (this._raycaster as any).firstHitOnly = true;
        (this._raycasterPersonToCam as any).firstHitOnly = true;
    }

    // 初始化
    async init(opts: PlayerControllerOptions, callback?: () => void) {
        this.scene = opts.scene;
        this.camera = opts.camera;
        this.camera.rotation.order = "YXZ";
        this.controls = opts.controls;
        this.playerModel = opts.playerModel;
        this.initPos = opts.initPos ? opts.initPos : new THREE.Vector3(0, 0, 0);
        this.intDirection = opts.intDirection ? opts.intDirection : new THREE.Vector3(0, 0, -1);
        this.mouseSensity = opts.mouseSensity ? opts.mouseSensity : 5;

        const s = this.playerModel.scale;
        this.visualizeDepth = 0 * s;
        this.gravity = opts.playerModel.gravity ? opts.playerModel.gravity * s : -2400 * s;
        this.jumpHeight = opts.playerModel.jumpHeight ? opts.playerModel.jumpHeight * s : 800 * s;
        this.originPlayerSpeed = opts.playerModel.speed ? opts.playerModel.speed * s : 400 * s;
        this.playerSpeed = this.originPlayerSpeed;
        this.playerModel.rotateY = opts.playerModel.rotateY ? opts.playerModel.rotateY : 0;

        this._camCollisionLerp = 0.18;
        this._camEpsilon = 35 * s;
        this._minCamDistance = opts.minCamDistance ? opts.minCamDistance * s : 100 * s;
        this._maxCamDistance = opts.maxCamDistance ? opts.maxCamDistance * s : 440 * s;
        this.orginMaxCamDistance = this._maxCamDistance;
        this.thirdMouseMode = opts.thirdMouseMode ?? 1;

        // 判断是否移动端
        function isMobileDevice() {
            return (navigator.maxTouchPoints && navigator.maxTouchPoints > 0) || "ontouchstart" in window || /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
        }

        this.isShowMobileControls = (opts.isShowMobileControls ?? true) && isMobileDevice();
        if (this.isShowMobileControls) {
            this.initMobileControls();
        }

        // 创建bvh
        await this.createBVH(opts.colliderMeshUrl);

        // 创建玩家
        this.createPlayer();

        // 加载玩家模型
        await this.loadPersonGLB();

        // 等待资源加载完毕再设置摄像机
        if (this.isFirstPerson && this.person) {
            this.person.add(this.camera);
        }
        this.onAllEvent(); // 绑定事件
        this.setCameraPos();
        this.setControls();
        if (callback) callback();
    }

    // 第一/三视角切换
    changeView() {
        this.isFirstPerson = !this.isFirstPerson;
        if (this.isFirstPerson) {
            this.player.attach(this.camera);
            this.camera.position.set(0, 40 * this.playerModel.scale, 30 * this.playerModel.scale);
            this.camera.rotation.set(0, Math.PI, 0);
            this.setPointerLock();
        } else {
            this.scene.attach(this.camera);
            const worldPos = this.player.position.clone();
            const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.player.quaternion);
            const angle = Math.atan2(dir.z, dir.x);
            const offset = new THREE.Vector3(Math.cos(angle) * 400 * this.playerModel.scale, 200 * this.playerModel.scale, Math.sin(angle) * 400 * this.playerModel.scale);
            this.camera.position.copy(worldPos).add(offset);
            this.controls.target.copy(worldPos);
            this.setPointerLock();
        }
    }

    setPointerLock() {
        if (((this.thirdMouseMode == 0 || this.thirdMouseMode == 1) && !this.isFirstPerson) || this.isFirstPerson) document.body.requestPointerLock(); // 锁定鼠标
    }

    // 摄像机/控制器设置
    setCameraPos() {
        if (this.isFirstPerson) {
            this.camera.position.set(0, 40 * this.playerModel.scale, 30 * this.playerModel.scale);
        } else {
            const worldPos = this.player.position.clone();
            const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.player.quaternion);
            const angle = Math.atan2(dir.z, dir.x);
            const offset = new THREE.Vector3(Math.cos(angle) * 400 * this.playerModel.scale, -100 * this.playerModel.scale, Math.sin(angle) * 400 * this.playerModel.scale);
            this.camera.position.copy(worldPos).add(offset);
        }
        this.camera.updateProjectionMatrix();
    }

    // 设置控制器
    setControls() {
        if (this.thirdMouseMode == 0 || this.thirdMouseMode == 1) {
            this.controls.enabled = false;
        } else {
            this.controls.enabled = true;
        }

        this.controls.rotateSpeed = this.mouseSensity * 0.05;
        this.controls.maxPolarAngle = Math.PI * (300 / 360);
    }

    // 重置控制器
    resetControls() {
        if (!this.controls) return;
        this.controls.enabled = true;
        this.controls.enablePan = true;
        this.controls.maxPolarAngle = Math.PI / 2;
        this.controls.rotateSpeed = 1;
        this.controls.enableZoom = true;
        this.controls.mouseButtons = {
            LEFT: 0,
            MIDDLE: 1,
            RIGHT: 2,
        };
    }

    // 初始化加载器
    async initLoader() {
        const dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath("https://unpkg.com/three@0.180.0/examples/jsm/libs/draco/gltf/");
        dracoLoader.setDecoderConfig({ type: "js" });
        this.loader.setDRACOLoader(dracoLoader);
    }

    // 人物与动画加载
    async loadPersonGLB() {
        try {
            const gltf: GLTF = await this.loader.loadAsync(this.playerModel.url);
            this.person = gltf.scene;
            const sc = this.playerModel.scale;
            const h = this.playerHeight * sc;
            this.person.scale.set(sc, sc, sc);
            this.person.position.set(0, -h * 0.75, 0);
            this.person.traverse((child: any) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });
            this.player.add(this.person);
            this.reset();

            // 创建人物 mixer 与 actions
            this.personMixer = new THREE.AnimationMixer(this.person);
            const animations = gltf.animations ?? [];
            this.personActions = new Map<string, THREE.AnimationAction>();
            // 取出动作并注册到 map
            const findClip = (name: string) => animations.find((a: any) => a.name === name);
            const regs: [string, string][] = [
                [this.playerModel.idleAnim, "idle"],
                [this.playerModel.walkAnim, "walking"],
                [this.playerModel.leftWalkAnim || this.playerModel.walkAnim, "left_walking"],
                [this.playerModel.rightWalkAnim || this.playerModel.walkAnim, "right_walking"],
                [this.playerModel.backwardAnim || this.playerModel.walkAnim, "walking_backward"],
                [this.playerModel.jumpAnim, "jumping"],
                [this.playerModel.runAnim, "running"],
                [this.playerModel.flyIdleAnim || this.playerModel.idleAnim, "flyidle"],
                [this.playerModel.flyAnim || this.playerModel.idleAnim, "flying"],
            ];

            // 注册动作并设置循环模式
            for (const [key, clipName] of regs) {
                const clip = findClip(key);
                if (!clip) continue;
                const action = this.personMixer.clipAction(clip);

                if (clipName === "jumping") {
                    action.setLoop(THREE.LoopOnce, 1); // 播放一次
                    action.clampWhenFinished = true;
                    action.setEffectiveTimeScale(1.2); // 播放速度
                } else {
                    action.setLoop(THREE.LoopRepeat, Infinity); // 循环播放
                    action.clampWhenFinished = false;
                    action.setEffectiveTimeScale(1);
                }

                action.enabled = true; // 激活
                action.setEffectiveWeight(0); // 初始权重为0
                this.personActions.set(clipName, action);
            }

            // 把actions激活
            this.idleAction = this.personActions.get("idle")!;
            this.walkAction = this.personActions.get("walking")!;
            this.leftWalkAction = this.personActions.get("left_walking")!;
            this.rightWalkAction = this.personActions.get("right_walking")!;
            this.backwardAction = this.personActions.get("walking_backward")!;
            this.jumpAction = this.personActions.get("jumping")!;
            this.runAction = this.personActions.get("running")!;
            this.flyidleAction = this.personActions.get("flyidle")!;
            this.flyAction = this.personActions.get("flying")!;

            // 激活空闲动作
            this.idleAction.setEffectiveWeight(1);
            this.idleAction.play();
            this.actionState = this.idleAction;

            this.personMixer.addEventListener("finished", (ev: any) => {
                const finishedAction: THREE.AnimationAction = ev.action;

                if (finishedAction === this.jumpAction) {
                    // jump 播放结束后的逻辑
                    if (this.fwdPressed) {
                        if (this.shiftPressed) this.playPersonAnimationByName("running");
                        else this.playPersonAnimationByName("walking");
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
        } catch (error) {}
    }

    // 平滑切换人物动画
    playPersonAnimationByName(name: string, fade = 0.18) {
        // console.log("播放动画", name);
        if (!this.personActions) return;
        if (this.ctPressed) return;

        const next = this.personActions.get(name);
        if (!next) return;

        // 如果是同一个action，直接返回
        if (this.actionState === next) return;

        const prev = this.actionState;

        // 对于一次性动作先reset()
        next.reset();
        next.setEffectiveWeight(1);
        next.play();

        if (prev && prev !== next) {
            // 让 prev 淡出，next 淡入
            prev.fadeOut(fade);
            next.fadeIn(fade);
        } else {
            // 直接淡入
            next.fadeIn(fade);
        }

        this.actionState = next;
    }

    // 创建玩家胶囊体
    createPlayer() {
        const material = new THREE.MeshStandardMaterial({
            color: new THREE.Color(1, 0, 0),
            shadowSide: THREE.DoubleSide,
            depthTest: false,
        });
        material.transparent = true;
        material.opacity = this.displayPlayer ? 0.5 : 0;
        material.wireframe = true;
        material.depthWrite = false;

        const r = this.playerRadius * this.playerModel.scale;
        const h = this.playerHeight * this.playerModel.scale;
        this.player = new THREE.Mesh(new RoundedBoxGeometry(r * 2, h, r * 2, 1, 75), material) as typeof this.player;

        this.player.geometry.translate(0, -h * 0.25, 0);
        this.player.capsuleInfo = {
            radius: r,
            segment: new THREE.Line3(new THREE.Vector3(), new THREE.Vector3(0, -h * 0.5, 0)),
        };

        this.player.name = "capsule";
        this.scene.add(this.player);
        this.reset();

        // 设置朝向
        this.player.rotateY(this.playerModel.rotateY ?? 0);
    }

    // 获取法线与Y轴的夹角
    getAngleWithYAxis(normal: { x: number; y: number; z: number }): number {
        // Y轴正方向向量
        const yAxis = { x: 0, y: 1, z: 0 };

        // 向量点积
        const dotProduct = normal.x * yAxis.x + normal.y * yAxis.y + normal.z * yAxis.z;

        // 向量模长
        const normalMagnitude = Math.sqrt(normal.x * normal.x + normal.y * normal.y + normal.z * normal.z);
        const yAxisMagnitude = 1; // Y轴单位向量长度为1

        // 计算夹角余弦值
        const cosTheta = dotProduct / (normalMagnitude * yAxisMagnitude);

        // 返回夹角（弧度）
        return Math.acos(cosTheta);
    }

    // 每帧更新
    async update(delta: number = clock.getDelta()) {
        if (!this.isupdate || !this.player || !this.collider) return;
        delta = Math.min(delta, 1 / 30);

        if (!this.isFlying) this.player.position.addScaledVector(this.playerVelocity, delta);
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
            if (this.fwdPressed) {
                this.moveDir.y = this.camDir.y;
            } else {
                this.moveDir.y = 0;
            }
            if (this.spacePressed) {
                this.moveDir.add(this.DIR_UP);
            }
        }
        // 设置速度
        if (this.isFlying && this.fwdPressed) {
            this.playerSpeed = this.shiftPressed ? this.originPlayerSpeed * 12 : this.originPlayerSpeed * 7;
        } else {
            this.playerSpeed = this.shiftPressed ? this.originPlayerSpeed * 2 : this.originPlayerSpeed;
        }
        this.moveDir.normalize().applyAxisAngle(this.upVector, angle);
        this.player.position.addScaledVector(this.moveDir, this.playerSpeed * delta);

        // 向下射线检测地面高度
        let playerDistanceFromGround = Infinity;
        this._originTmp.set(this.player.position.x, this.player.position.y, this.player.position.z);
        this._raycaster.ray.origin.copy(this._originTmp);
        const intersects = this._raycaster.intersectObject(this.collider as THREE.Object3D, false);
        if (intersects.length > 0) {
            playerDistanceFromGround = this.player.position.y - intersects[0].point.y;
            const normal = intersects[0].normal as THREE.Vector3;
            const angle = (this.getAngleWithYAxis(normal) * 180) / Math.PI;
            const maxH = this.playerHeight * this.playerModel.scale * 0.9; // 坡度高度阈值
            const h = this.playerHeight * this.playerModel.scale * 0.75; // 正常高度
            const minH = this.playerHeight * this.playerModel.scale * 0.7; // 最小高度

            if (this.isFlying) {
            } else {
                if (playerDistanceFromGround > maxH) {
                    this.playerVelocity.y += delta * this.gravity;
                    this.player.position.addScaledVector(this.playerVelocity, delta);
                    this.playerIsOnGround = false;
                } else if (playerDistanceFromGround > h && playerDistanceFromGround < maxH) {
                    if (angle >= 0 && angle < 5) {
                        // 平地
                        // this.player.position.y = intersects[0].point.y + h;
                        // this.playerVelocity.set(0, 0, 0);
                        this.playerVelocity.y += delta * this.gravity;
                        this.player.position.addScaledVector(this.playerVelocity, delta);
                        this.playerIsOnGround = true;
                    } else {
                        // 坡地
                        this.playerVelocity.set(0, 0, 0);
                        this.playerIsOnGround = true;
                    }
                } else if (playerDistanceFromGround > minH && playerDistanceFromGround < h) {
                    // 误差范围内 在平地
                    this.playerVelocity.set(0, 0, 0);
                    this.playerIsOnGround = true;
                } else if (playerDistanceFromGround < minH) {
                    // 强行拉回
                    this.playerVelocity.set(0, 0, 0);
                    this.player.position.set(this.player.position.x, intersects[0].point.y + h, this.player.position.z);
                    this.playerIsOnGround = true;
                }
            }
        }

        // 更新玩家矩阵
        this.player.updateMatrixWorld();
        // 碰撞检测
        const capsuleInfo = this.player.capsuleInfo;
        this.tempBox.makeEmpty();
        this.tempMat.copy(this.collider!.matrixWorld).invert();
        this.tempSegment.copy(capsuleInfo.segment);
        this.tempSegment.start.applyMatrix4(this.player.matrixWorld).applyMatrix4(this.tempMat);
        this.tempSegment.end.applyMatrix4(this.player.matrixWorld).applyMatrix4(this.tempMat);

        this.tempBox.expandByPoint(this.tempSegment.start);
        this.tempBox.expandByPoint(this.tempSegment.end);
        this.tempBox.expandByScalar(capsuleInfo.radius);

        const bvh = this.collider?.geometry as any;
        bvh?.boundsTree?.shapecast({
            // 检测包围盒碰撞
            intersectsBounds: (box: THREE.Box3) => box.intersectsBox(this.tempBox),
            // 检测三角形碰撞
            intersectsTriangle: (tri: any) => {
                const triPoint = this.tempVector;
                const capsulePoint = this.tempVector2;
                const distance = tri.closestPointToSegment(this.tempSegment, triPoint, capsulePoint);
                // 距离小于人物半径，发生碰撞
                if (distance < capsuleInfo.radius) {
                    const depth = capsuleInfo.radius - distance;
                    const direction = capsulePoint.sub(triPoint).normalize();
                    this.tempSegment.start.addScaledVector(direction, depth);
                    this.tempSegment.end.addScaledVector(direction, depth);
                }
            },
        });

        // 设置玩家位置
        const newPosition = this.tempVector.copy(this.tempSegment.start).applyMatrix4(this.collider!.matrixWorld);
        const deltaVector = this.tempVector2.subVectors(newPosition, this.player.position);
        // 应用位移
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
            if (this.thirdMouseMode == 0 || this.thirdMouseMode == 2) {
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
            if ((this.thirdMouseMode == 1 || this.thirdMouseMode == 3) && this.moveDir.lengthSq() > 0) {
                lookTarget = this.player.position.clone().add(this.moveDir);
                this.targetMat.lookAt(this.player.position, lookTarget, this.player.up);
                this.targetQuat.setFromRotationMatrix(this.targetMat);
                const alpha = Math.min(1, this.rotationSpeed * delta);
                this.player.quaternion.slerp(this.targetQuat, alpha);
            }
        }

        // 飞行
        if (this.isFlying) {
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

        // 第三人称-相机跟随
        if (!this.isFirstPerson) {
            const lookTarget = this.player.position.clone();
            lookTarget.y += 30 * this.playerModel.scale;
            this.camera.position.sub(this.controls.target); // 减去控制器向量
            this.controls.target.copy(lookTarget); // 设置控制器目标
            this.camera.position.add(lookTarget); // 设置相机位置
            this.controls.update(); // 更新控制器

            // 当视线被遮挡时判断
            this._personToCam.subVectors(this.camera.position, this.player.position); // 计算从player指向camera的向量（camera - player）
            const origin = this.player.position.clone().add(new THREE.Vector3(0, 0, 0)); // 射线起点
            const direction = this._personToCam.clone().normalize(); // 方向
            const desiredDist = this._personToCam.length(); // 与期望距离
            this._raycasterPersonToCam.set(origin, direction);
            this._raycasterPersonToCam.far = desiredDist;

            // 做相交检测
            const intersects = this._raycasterPersonToCam.intersectObject(this.collider as THREE.Object3D, false);
            if (intersects.length > 0) {
                // 相机拉近
                const hit = intersects[0]; // 找到第一个命中
                const safeDist = Math.max(hit.distance - this._camEpsilon, this._minCamDistance); // 计算安全距离（hit.distance是从origin到碰撞点的距离）
                const targetCamPos = origin.clone().add(direction.clone().multiplyScalar(safeDist)); // 目标相机位置 = origin + direction * safeDist
                this.camera.position.lerp(targetCamPos, this._camCollisionLerp); // 平滑移动相机到targetCamPos
            } else {
                // 相机恢复
                // const dis = this.player.position.distanceTo(this.camera.position); // 计算当前人物到相机距离
                this._raycasterPersonToCam.far = this._maxCamDistance;
                // 检查预设相机位置是否有遮挡
                const intersectsMaxDis = this._raycasterPersonToCam.intersectObject(this.collider as THREE.Object3D, false);
                // 恢复相机
                let safeDist = this._maxCamDistance;
                if (intersectsMaxDis.length) {
                    const hitMax = intersectsMaxDis[0]; // 找到第一个命中
                    safeDist = hitMax.distance - this._camEpsilon;
                }
                const targetCamPos = origin.clone().add(direction.clone().multiplyScalar(safeDist));
                this.camera.position.lerp(targetCamPos, this._camCollisionLerp);
            }
        }

        // 掉出场景重置
        if (this.player.position.y < this.boundingBoxMinY - 1) {
            // 检测当前位置与碰撞体是否相交
            this._originTmp.set(this.player.position.x, 10000, this.player.position.z);
            this._raycaster.ray.origin.copy(this._originTmp);
            const intersects = this._raycaster.intersectObject(this.collider as THREE.Object3D, false);
            if (intersects.length > 0) {
                // 出现碰撞 说明玩家为bug意外掉落
                console.log("玩家为bug意外掉落");
                this.reset(new THREE.Vector3(this.player.position.x, intersects[0].point.y + 5, this.player.position.z));
            } else {
                // 无碰撞 正常掉落
                console.log("玩家正常掉落");
                this.reset(new THREE.Vector3(this.player.position.x, this.player.position.y + 15, this.player.position.z));
            }
        }
    }

    // 重置
    reset(position?: THREE.Vector3) {
        if (!this.player) return;
        this.playerVelocity.set(0, 0, 0);
        this.player.position.copy(position ? position : this.initPos);
    }

    // 销毁
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

        // 清理 BVH 可视化
        if (this.visualizer) {
            this.scene.remove(this.visualizer);
            this.visualizer = null;
        }
        if (this.collider) {
            this.scene.remove(this.collider);
            this.collider = null;
        }

        this.destroyMobileControls();

        controllerInstance = null;
    }

    // 事件绑定
    onAllEvent() {
        this.isupdate = true;
        this.setPointerLock();

        window.addEventListener("keydown", this._boundOnKeydown);
        window.addEventListener("keyup", this._boundOnKeyup);
        window.addEventListener("mousemove", this._mouseMove);
        window.addEventListener("click", this._mouseClick);
    }

    // 事件解绑
    offAllEvent() {
        this.isupdate = false;
        document.exitPointerLock();
        window.removeEventListener("keydown", this._boundOnKeydown);
        window.removeEventListener("keyup", this._boundOnKeyup);
        window.removeEventListener("mousemove", this._mouseMove);
        window.removeEventListener("click", this._mouseClick);
    }

    getPosition() {
        return this.player.position;
    }

    // 键盘按下事件
    private _boundOnKeydown = async (e: KeyboardEvent) => {
        if (e.ctrlKey && (e.code === "KeyW" || e.code === "KeyA" || e.code === "KeyS" || e.code === "KeyD")) {
            e.preventDefault();
        }
        switch (e.code) {
            case "KeyW":
                this.fwdPressed = true;
                this.setAnimationByPressed();
                break;
            case "KeyS":
                this.bkdPressed = true;
                this.setAnimationByPressed();
                break;
            case "KeyD":
                this.rgtPressed = true;
                this.setAnimationByPressed();
                break;
            case "KeyA":
                this.lftPressed = true;
                this.setAnimationByPressed();
                break;
            case "ShiftLeft":
                this.shiftPressed = true;
                this.setAnimationByPressed();
                this.controls.mouseButtons = {
                    LEFT: 2,
                    MIDDLE: 1,
                    RIGHT: 0,
                };
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
                this.isFlying = !this.isFlying;
                this.setAnimationByPressed();
                if (!this.isFlying && !this.playerIsOnGround) this.playPersonAnimationByName("jumping");
                break;
        }
    };

    // 键盘抬起事件
    private _boundOnKeyup = (e: KeyboardEvent) => {
        switch (e.code) {
            case "KeyW":
                this.fwdPressed = false;
                this.setAnimationByPressed();
                break;
            case "KeyS":
                this.bkdPressed = false;
                this.setAnimationByPressed();
                break;
            case "KeyD":
                this.rgtPressed = false;
                this.setAnimationByPressed();
                break;
            case "KeyA":
                this.lftPressed = false;
                this.setAnimationByPressed();
                break;
            case "ShiftLeft":
                this.shiftPressed = false;
                this.setAnimationByPressed();
                this.controls.mouseButtons = {
                    LEFT: 0,
                    MIDDLE: 1,
                    RIGHT: 2,
                };
                break;
            case "Space":
                this.spacePressed = false;
                break;
            case "ControlLeft":
                this.ctPressed = false;
                break;
        }
    };

    // 根据按键设置人物动画
    setAnimationByPressed = () => {
        this._maxCamDistance = this.orginMaxCamDistance;
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
                if (this.shiftPressed) {
                    this.playPersonAnimationByName("running");
                } else {
                    this.playPersonAnimationByName("walking");
                }
                return;
            }
            // 第三人称下动画统一使用 前进 动画
            if (!this.isFirstPerson && (this.lftPressed || this.rgtPressed || this.bkdPressed)) {
                if (this.shiftPressed) {
                    this.playPersonAnimationByName("running");
                } else {
                    this.playPersonAnimationByName("walking");
                }
                return;
            }
            // 第一人称下根据方向播放不同动画
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

        // 销毁旧的定时器
        if (this.recheckAnimTimer !== null) {
            clearTimeout(this.recheckAnimTimer);
        }
        // 200ms后检测动画
        this.recheckAnimTimer = setTimeout(() => {
            this.setAnimationByPressed();
            this.recheckAnimTimer = null;
        }, 200);
    };

    // 鼠标移动事件
    private _mouseMove = (e: MouseEvent) => {
        // 记录状态
        if (document.pointerLockElement !== document.body) return;
        this.setToward(e.movementX, e.movementY, 0.0001);
    };

    private _mouseClick = (e: MouseEvent) => {
        this.setPointerLock();
    };

    // 更新模型动画
    private updateMixers(delta: number) {
        if (this.personMixer) this.personMixer.update(delta);
    }

    // BVH构建
    async createBVH(meshUrl: string = ""): Promise<void> {
        await this.initLoader(); // 初始化加载器

        const ensureAttributesMinimal = (geom: THREE.BufferGeometry): THREE.BufferGeometry | null => {
            if (!geom.attributes.position) {
                // console.warn("跳过无 position 的几何体", geom);
                return null;
            }
            if (!geom.attributes.normal) geom.computeVertexNormals();
            if (!geom.attributes.uv) {
                const count = geom.attributes.position.count;
                const dummyUV = new Float32Array(count * 2);
                geom.setAttribute("uv", new THREE.BufferAttribute(dummyUV, 2));
            }
            return geom;
        };

        const collected: THREE.BufferGeometry[] = [];
        if (meshUrl == "") {
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
                        const safe = ensureAttributesMinimal(geom);
                        if (safe) collected.push(safe);
                    } catch (e) {
                        console.warn("处理网格时出错：", mesh, e);
                    }
                }
            });

            if (!collected.length) {
                return;
            }

            // 统一属性集合
            type AttrMeta = { itemSize: number; arrayCtor: any; examples: number };
            const attrMap = new Map<string, AttrMeta>();
            const attrConflict = new Set<string>();

            for (const g of collected) {
                for (const name of Object.keys(g.attributes)) {
                    const attr = g.attributes[name] as THREE.BufferAttribute;
                    const ctor = (attr.array as any).constructor;
                    const itemSize = attr.itemSize;
                    if (!attrMap.has(name)) {
                        attrMap.set(name, { itemSize, arrayCtor: ctor, examples: 1 });
                    } else {
                        const m = attrMap.get(name)!;
                        if (m.itemSize !== itemSize || m.arrayCtor !== ctor) attrConflict.add(name);
                        else m.examples++;
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
                        g.setAttribute(name, new THREE.BufferAttribute(array, meta.itemSize));
                    }
                }
            }
        } else {
            const gltf: GLTF = await this.loader.loadAsync(meshUrl, (xhr) => {});
            const mesh = gltf.scene.children[0] as THREE.Mesh;
            mesh.name = "BVH加载模型";

            // 推入几何体
            let geom = mesh.geometry.clone();
            geom.applyMatrix4(mesh.matrixWorld);
            if (geom.index) geom = geom.toNonIndexed();
            const safe = ensureAttributesMinimal(geom);
            if (safe) collected.push(safe);
        }

        // 合并几何体
        const merged = BufferGeometryUtils.mergeGeometries(collected, false);
        if (!merged) {
            console.error("合并几何失败");
            return;
        }

        // 构建bvh
        (merged as any).boundsTree = new MeshBVH(merged, {
            maxDepth: 100,
        });
        this.collider = new THREE.Mesh(
            merged,
            new THREE.MeshBasicMaterial({
                opacity: 0.5,
                transparent: true,
                wireframe: true,
            })
        );

        if (this.displayCollider) this.scene.add(this.collider);
        if (this.displayVisualizer) {
            if (this.visualizer) this.scene.remove(this.visualizer);
            this.visualizer = new MeshBVHHelper(this.collider, this.visualizeDepth);
            this.scene.add(this.visualizer);
        }
        this.boundingBoxMinY = (this.collider as any).geometry.boundingBox.min.y;
        // console.log("bvh加载模型成功", this.collider);
    }

    // 设置朝向
    setToward(dx: number, dy: number, speed: number) {
        if (this.isFirstPerson) {
            const yaw = -dx * speed * this.mouseSensity;
            const pitch = -dy * speed * this.mouseSensity;
            this.player.rotateY(yaw);
            this.camera.rotation.x = THREE.MathUtils.clamp(this.camera.rotation.x + pitch, -1.1, 1.4);
        } else {
            const sensitivity = this.mouseSensity;
            const deltaX = -dx * speed * sensitivity;
            const deltaY = -dy * speed * sensitivity;
            // 获取目标点
            const target = this.player.position.clone();
            // 计算相机到目标的距离
            const distance = this.camera.position.distanceTo(target);
            // 计算当前角度
            const currentPosition = this.camera.position.clone().sub(target);
            let theta = Math.atan2(currentPosition.x, currentPosition.z);
            let phi = Math.acos(currentPosition.y / distance);
            // 应用旋转
            theta += deltaX;
            phi += deltaY;
            // 限制phi角度
            phi = Math.max(0.1, Math.min(Math.PI - 0.1, phi));
            // 计算新的相机位置
            const newX = distance * Math.sin(phi) * Math.sin(theta);
            const newY = distance * Math.cos(phi);
            const newZ = distance * Math.sin(phi) * Math.cos(theta);
            this.camera.position.set(target.x + newX, target.y + newY, target.z + newZ);
            this.camera.lookAt(target);
        }
    }

    // 设置输入
    setInput(
        input: Partial<{
            moveX: 1 | 0 | -1; // 摇杆移动X轴
            moveY: 1 | 0 | -1; // 摇杆移动Y轴
            lookDeltaX: number;
            lookDeltaY: number;
            jump: boolean; // 跳跃
            shift: boolean; // 加速
            toggleView: boolean; // 切换视角
            toggleFly: boolean; // 切换飞行
        }>
    ) {
        // 控制人物移动
        if (typeof input.moveX === "number") {
            this.lftPressed = input.moveX == -1;
            this.rgtPressed = input.moveX == 1;
            this.setAnimationByPressed();
        }
        if (typeof input.moveY === "number") {
            this.fwdPressed = input.moveY == 1;
            this.bkdPressed = input.moveY == -1;
            this.setAnimationByPressed();
        }

        // 控制朝向
        if (typeof input.lookDeltaX === "number" && typeof input.lookDeltaY === "number") {
            this.setToward(input.lookDeltaX, input.lookDeltaY, 0.002);
        }

        // 跳跃
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

        // 加速
        if (typeof input.shift === "boolean") {
            this.shiftPressed = input.shift;
        }

        // 切换视角
        if (input.toggleView) {
            this.changeView();
        }

        // 切换飞行
        if (input.toggleFly) {
            this.isFlying = !this.isFlying;
            this.setAnimationByPressed();
            if (!this.isFlying && !this.playerIsOnGround) this.playPersonAnimationByName("jumping");
        }
    }

    onPointerDown = (e: PointerEvent) => {
        // 仅响应触控
        if (e.pointerType !== "touch") return;
        this.isLookDown = true;
        this.lookPointerId = e.pointerId;
        this.lastTouchX = e.clientX;
        this.lastTouchY = e.clientY;

        this.lookAreaEl?.setPointerCapture && this.lookAreaEl.setPointerCapture(e.pointerId);
        e.preventDefault();
    };

    onPointerMove = (e: PointerEvent) => {
        if (!this.isLookDown || e.pointerId !== this.lookPointerId) return;
        const dx = e.clientX - this.lastTouchX;
        const dy = e.clientY - this.lastTouchY;
        this.lastTouchX = e.clientX;
        this.lastTouchY = e.clientY;

        this.setInput({
            lookDeltaX: dx,
            lookDeltaY: dy,
        });
        e.preventDefault();
    };

    onPointerUp = (e: PointerEvent) => {
        if (e.pointerId !== this.lookPointerId) return;
        this.isLookDown = false;
        this.lookPointerId = null;
        this.lookAreaEl?.releasePointerCapture && this.lookAreaEl.releasePointerCapture(e.pointerId);
    };

    // 初始化移动端摇杆控制
    async initMobileControls() {
        this.controls.maxPolarAngle = Math.PI * (300 / 360);
        this.controls.touches = { ONE: null as any, TWO: null as any }; // 防止触摸触发
        this.nippleModule = await import("nipplejs");
        const nipple = this.nippleModule?.default;
        const JOY_SIZE = 120; // 摇杆直径（px）

        // 容器
        const container = document.body;

        // 摇杆容器
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

        // 阻止touch的默认行为
        ["touchstart", "touchmove", "touchend", "touchcancel"].forEach((evtName) => {
            this.joystickZoneEl?.addEventListener(
                evtName,
                (e) => {
                    e.preventDefault();
                },
                { passive: false }
            );
        });

        // 创建摇杆
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

            // 归一化
            const dirX = rawX > deadzone ? 1 : rawX < -deadzone ? -1 : 0;
            const dirY = rawY > deadzone ? 1 : rawY < -deadzone ? -1 : 0;

            // 加速判断
            const sprintThreshold = JOY_SIZE / 2;
            const isSprinting = distance >= sprintThreshold;

            // 无变化，不触发
            const prev = this.prevJoyState || { dirX: 0, dirY: 0, shift: false };
            if (dirX === prev.dirX && dirY === prev.dirY && isSprinting === prev.shift) {
                return;
            }

            // 保存当前状态
            this.prevJoyState = { dirX, dirY, shift: isSprinting };

            // 调用 setInput
            this.setInput({ moveX: dirX, moveY: dirY, shift: isSprinting });
        });

        this.joystickManager.on("end", () => {
            const prev = this.prevJoyState || { dirX: 0, dirY: 0, shift: false };
            if (prev.dirX !== 0 || prev.dirY !== 0 || prev.shift !== false) {
                this.prevJoyState = { dirX: 0, dirY: 0, shift: false };
                this.setInput({ moveX: 0, moveY: 0, shift: false });
            }
        });

        // 右侧区域
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

        // 阻止touch的默认行为
        ["touchstart", "touchmove", "touchend", "touchcancel"].forEach((evtName) => {
            this.lookAreaEl?.addEventListener(
                evtName,
                (e) => {
                    e.preventDefault();
                },
                { passive: false }
            );
        });

        // 监听
        this.lookAreaEl.addEventListener("pointerdown", this.onPointerDown, {
            passive: false,
        });
        this.lookAreaEl.addEventListener("pointermove", this.onPointerMove, {
            passive: false,
        });
        this.lookAreaEl.addEventListener("pointerup", this.onPointerUp, {
            passive: false,
        });
        this.lookAreaEl.addEventListener("pointercancel", this.onPointerUp, {
            passive: false,
        });

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
                btn.addEventListener(
                    evtName,
                    (e) => {
                        e.preventDefault();
                    },
                    { passive: false }
                );
            });

            return btn;
        };

        // 跳跃
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

        // 切换飞行
        this.flyBtnEl = createBtn(14, 14 + 80, flyIconModule);
        this.flyBtnEl.addEventListener(
            "touchstart",
            (e) => {
                e.preventDefault();
                this.setInput({ toggleFly: true });
            },
            { passive: false }
        );

        // 切换视角
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

    // 销毁移动端摇杆控制
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

            // 监听
            this.lookAreaEl?.removeEventListener("pointerdown", this.onPointerDown);
            this.lookAreaEl?.removeEventListener("pointermove", this.onPointerMove);
            this.lookAreaEl?.removeEventListener("pointerup", this.onPointerUp);
            this.lookAreaEl?.removeEventListener("pointercancel", this.onPointerUp);
        } catch (e) {
            console.warn("销毁移动端摇杆控制时出错：", e);
        }
    }
}

// 导出API
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
        position: () => c.getPosition(),
    };
}

// 打开所有事件
export function onAllEvent(): void {
    if (!controllerInstance) controllerInstance = new PlayerController();
    controllerInstance.onAllEvent();
}

// 关闭所有事件
export function offAllEvent(): void {
    if (!controllerInstance) return;
    controllerInstance.offAllEvent();
}
