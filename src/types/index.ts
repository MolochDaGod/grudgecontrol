import * as THREE from "three";
import type { RigidBody } from "@dimforge/rapier3d-compat";
import type { PathPlanner } from "../utils/pathPlanner";

// ==================== 玩家配置 ====================

export type PlayerModelOptions = {
    url: string; // 模型路径（GLB/GLTF）
    scale: number; // 模型缩放
    idleAnim: string; // 静止动画名
    walkAnim: string; // 行走动画名
    runAnim: string; // 跑步动画名
    jumpAnim: string | [startAnim: string, loopAnim: string, endAnim: string]; // 跳跃动画名；或 [起跳, 循环, 落地] 三段
    leftWalkAnim?: string; // 左移动画，默认复用 walkAnim
    rightWalkAnim?: string; // 右移动画，默认复用 walkAnim
    backwardAnim?: string; // 后退动画，默认复用 walkAnim
    flyAnim?: string; // 飞行动画，默认复用 idleAnim
    flyIdleAnim?: string; // 飞行待机动画，默认复用 idleAnim
    flyHoverForwardAnim?: string; // 飞行前进悬停动画，默认复用 flyAnim
    flyHoverBackAnim?: string; // 飞行后退悬停动画，默认复用 flyIdleAnim
    flyHoverLeftAnim?: string; // 飞行左移悬停动画，默认复用 flyIdleAnim
    flyHoverRightAnim?: string; // 飞行右移悬停动画，默认复用 flyIdleAnim
    flyHoverUpAnim?: string; // 飞行上升悬停动画，默认复用 flyIdleAnim
    flyHoverDownAnim?: string; // 飞行下降悬停动画，默认复用 flyIdleAnim
    enterCarAnim?: string; // 上车动画
    exitCarAnim?: string; // 下车动画
    gravity?: number; // 重力基准值（按 scale 缩放），默认 -2400
    jumpHeight?: number; // 跳跃高度基准值（按 scale 缩放），默认 600
    speed?: number; // 移动速度基准值（按 scale 缩放），默认 300
    flySpeed?: number; // 飞行速度基准值（按 scale 缩放），默认 2100
    rotateY?: number; // 人物初始朝向（弧度），默认 0
    headBoneName?: string; // 头部骨骼名，用于第一人称相机挂载
    firstPersonCameraOffset?: [number, number, number]; // 第一人称相机局部偏移
    capsuleRadiusRatio?: number; // 胶囊体半径倍率，默认 1
    acceleration?: number; // XZ 加速响应速度，默认 30
    deceleration?: number; // XZ 减速响应速度，默认 30
    /** External animation GLB/FBX URLs keyed by clip name (idle, walk, run, jump, …) */
    animationUrls?: Record<string, string>;
};

export type MobileControlsOptions = {
    joystick?: boolean; // 是否显示摇杆，默认 true
    jump?: boolean; // 是否显示跳跃按钮，默认 true
    fly?: boolean; // 是否显示飞行按钮，默认 true
    view?: boolean; // 是否显示视角切换按钮，默认 true
    vehicle?: boolean; // 是否显示上下车按钮，默认 true
};

// 可重映射的输入动作
export type KeyAction =
    | "forward" | "backward" | "left" | "right"
    | "sprint" | "jump" | "toggleView" | "toggleFly" | "toggleVehicle"
    | "attack" | "attackHeavy" | "aim" | "knock" | "targetNext" | "targetPrev";

// 自定义键位映射：未填用默认键，传 code/数组覆盖，传 null 禁用
export type KeyMap = Partial<Record<KeyAction, string | string[] | null>>;

export type PlayerControllerOptions = {
    scene: THREE.Scene; // three.js 场景实例
    camera: THREE.PerspectiveCamera; // three.js 相机实例
    controls: any; // 外部相机控制器，通常为 OrbitControls
    playerModelConfig: PlayerModelOptions; // 角色模型与参数配置
    initPos?: THREE.Vector3; // 初始出生点，默认 (0,0,0)
    mouseSensitivity?: number; // 鼠标灵敏度，默认 5
    minCamDistance?: number; // 第三人称最小镜头距离，默认 100
    maxCamDistance?: number; // 第三人称最大镜头距离，默认 440
    camLookAtHeightRatio?: number; // 相机看向点高度比例（0=底部 1=顶部），默认 0.8
    staticCollider?: THREE.Object3D | THREE.Object3D[]; // 静态碰撞体来源，不传则遍历整个场景
    dynamicCollider?: THREE.Object3D | THREE.Object3D[]; // 初始化时注册的动态碰撞体
    isShowMobileControls?: boolean; // 移动端是否显示虚拟控制 UI，默认 true
    mobileControls?: MobileControlsOptions; // 移动端按钮显隐配置
    thirdMouseMode?: 0 | 1 | 2 | 3 | 4 | 5; // 第三人称鼠标控制模式，默认 1
    enableZoom?: boolean; // 是否允许滚轮缩放，默认 false
    enableOverShoulderView?: boolean; // 是否启用过肩视角，默认 false
    isFirstPerson?: boolean; // 初始是否进入第一人称，默认 false
    enableSpringCamera?: boolean; // 是否启用弹簧相机，默认 false
    springCameraTime?: number; // 弹簧相机平滑时间（秒），默认 0.05
    timeScale?: number; // 时间缩放系数，<1 慢动作 >1 快进，默认 1
    keyMap?: KeyMap; // 自定义键位映射
};

// ==================== 战斗配置 (Combat) ====================

// 单个攻击招式定义
export type AttackDef = {
    clip: string; // 模型中的攻击动画片段名
    timeScale?: number; // 播放速度倍率，默认 1
    durationMs?: number; // 指定动画时长（毫秒），优先于 timeScale 推导速度
    damage?: number; // 伤害数值，透传给 onHit 消费方
    cooldownMs?: number; // 该招式再次触发的最小间隔（毫秒），默认 0
    comboWindowMs?: number; // 招式结束后允许衔接下一段连击的时间窗（毫秒），默认 350
    hitFraction?: number; // 命中判定发生在动画的进度点（0~1），默认 0.5
    range?: number; // 近战触及距离（世界单位，按 scale 缩放），默认 120
    arcDeg?: number; // 近战命中锥形半角（度），默认 60
    lockMovement?: boolean; // 出招期间是否锁定 XZ 位移，默认 false
    element?: string; // 自定义伤害类型标签
    next?: string; // 快速衔接的默认下一段招式 key
};

// 近战命中结果
export type MeleeHit = {
    target: THREE.Object3D; // 命中的目标对象
    point: THREE.Vector3; // 命中点（目标世界坐标）
    distance: number; // 与攻击者的距离
};

// 攻击事件载荷
export type AttackEvent = {
    key: string; // 招式 key
    index: number; // 连击序号（从 0 开始）
    combo: string | null; // 当前连击名（无则为 null）
    def: AttackDef; // 招式定义
};

// 战斗系统配置
export type CombatOptions = {
    allowAerialAttacks?: boolean; // 是否允许在空中（跳跃下落）出招，默认 true
    allowFlyingAttacks?: boolean; // 是否允许在飞行模式出招，默认 false
    bufferInput?: boolean; // 是否缓存出招输入以衔接连击，默认 true
    targets?: THREE.Object3D[]; // 默认近战/远程命中候选目标
    softLockFacing?: boolean; // 出招时是否自动面向当前目标（软锁定），默认 true
};

// 远程攻击招式定义（RMB 矄准/射击）
export type RangedDef = {
    clip?: string; // 射击动画片段名（可选）
    timeScale?: number; // 播放速度倍率，默认 1
    damage?: number; // 伤害数值
    cooldownMs?: number; // 射速间隔（毫秒），默认 300
    range?: number; // 射程（世界单位，按 scale 缩放），默认 4000
    spread?: number; // 散布角（弧度），默认 0
    element?: string; // 伤害类型标签
    muzzleOffset?: [number, number, number]; // 枪口局部偏移
};

// 远程命中结果
export type RangedHit = {
    target: THREE.Object3D; // 命中目标
    point: THREE.Vector3; // 命中点
    distance: number; // 命中距离
    damage: number; // 伤害数值
};

// 击退（中键 MMB）配置
export type KnockOptions = {
    clip?: string; // 击退动画片段名（可选）
    radius?: number; // 生效半径（世界单位，按 scale 缩放），默认 220
    force?: number; // 击退力度，默认 600
    arcDeg?: number; // 生效锥形半角（度），360=全周，默认 360
    cooldownMs?: number; // 冷却（毫秒），默认 1200
    damage?: number; // 附带伤害，默认 0
};

// 击退事件载荷
export type KnockEvent = {
    target: THREE.Object3D; // 被击退目标
    direction: THREE.Vector3; // 击退方向（单位向量）
    force: number; // 击退力度
    damage: number; // 附带伤害
};

// 闪避/冲刺（双击方向键）配置
export type DodgeOptions = {
    clip?: string; // 闪避动画片段名（可选）
    speed?: number; // 闪避初速度基准（按 scale 缩放），默认 1400
    durationMs?: number; // 闪避持续时间（毫秒），默认 280
    cooldownMs?: number; // 冷却（毫秒），默认 550
    iframes?: boolean; // 闪避期间是否提供无敌帧，默认 true
    doubleTapMs?: number; // 双击识别窗口（毫秒），默认 250
};

// 目标锁定系统配置
export type TargetOptions = {
    maxRange?: number; // 可锁定最大距离（按 scale 缩放），默认 6000
    softLockRange?: number; // 软锁定生效距离（按 scale 缩放），默认 3000
    maxAngleDeg?: number; // 锁定候选相对镜头前方的最大半角（度），默认 70
    isAlive?: (target: THREE.Object3D) => boolean; // 判定目标是否存活，默认总是 true
};

// 当前目标信息（供 UI 目标框/血条使用）
export type TargetInfo = {
    object: THREE.Object3D; // 目标对象
    hard: boolean; // 是否为 Tab 硬锁定（false=软锁定）
    distance: number; // 与玩家距离
};

// ==================== 车辆配置 ====================

export type VehicleOptions = {
    url: string; // 车辆模型路径（GLB/GLTF）
    position: THREE.Vector3; // 车辆初始世界坐标
    wheelsNames: string[]; // 车轮节点名，顺序：左前、右前、左后、右后
    scale?: number; // 车辆模型缩放，默认 1
    animations: { openDoorAnim?: string }; // 车门开关动画名
    boardingPoint: THREE.Vector3; // 上车点，局部坐标
    seatOffset?: THREE.Vector3; // 角色上车后座位偏移，默认 (0,0,0)
    chassisRatio?: number; // 底盘高度比例，默认 0.2
    suspensionRestLengthRatio?: number; // 悬挂静止长度比例，默认 0.2
    followVehicleDirection?: boolean; // 驾驶时镜头是否跟随车辆朝向，默认 true
    speedMultiplier?: number; // 单车速度倍率，默认 1
};

export type VehicleInstance = {
    vehicleGroup: THREE.Group; // 车辆模型组
    chassisBody: RigidBody; // 底盘刚体
    vehicleController: any; // Rapier 车辆控制器
    updateWheelVisuals: () => void; // 同步车轮视觉的回调
    vehicleMixer?: THREE.AnimationMixer; // 车辆动画混合器
    vehicleActions?: Map<string, THREE.AnimationAction>; // 车辆动画动作表
    vehiclIsOpenDoor: boolean; // 车门是否打开
    vehicleBBox: THREE.Box3; // 车辆包围盒
    pathPlanner: PathPlanner; // 上车路径规划器
    scale: number; // 车辆缩放
    boardingPoint: THREE.Vector3; // 上车点，局部坐标
    seatOffset: THREE.Vector3; // 座位偏移
    enterVehicleTime: number; // 上车动画时长
    chassisRatio: number; // 底盘高度比例
    suspensionRestLengthRatio: number; // 悬挂静止长度比例
    size: { l: number; w: number; h: number }; // 车辆尺寸（长、宽、高）
    speedMultiplier: number; // 单车速度倍率
    physicsBoxMesh?: THREE.Mesh; // 物理盒体调试网格
};

export type DynamicColliderEntry = {
    source: THREE.Object3D; // 原始物体
    mesh: THREE.Mesh; // BVH网格（本地空间几何）
    prevWorldMatrix: THREE.Matrix4; // 上一帧世界矩阵
    deltaPos: THREE.Vector3; // 本帧位移增量
    deltaRotY: number; // 本帧 Y 轴旋转增量（弧度）
}
