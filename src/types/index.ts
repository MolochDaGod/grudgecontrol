import * as THREE from "three";
import type { RigidBody } from "@dimforge/rapier3d-compat";
import type { PathPlanner } from "../utils/pathPlanner";

// ==================== 玩家配置 ====================

export type PlayerModelOptions = {
    url: string;
    scale: number;
    idleAnim: string;
    walkAnim: string;
    runAnim: string;
    jumpAnim: string | [string, string, string];
    leftWalkAnim?: string;
    rightWalkAnim?: string;
    backwardAnim?: string;
    flyAnim?: string;
    flyIdleAnim?: string;
    flyHoverForwardAnim?: string;
    flyHoverBackAnim?: string;
    flyHoverLeftAnim?: string;
    flyHoverRightAnim?: string;
    flyHoverUpAnim?: string;
    flyHoverDownAnim?: string;
    enterCarAnim?: string;
    exitCarAnim?: string;
    gravity?: number;
    jumpHeight?: number;
    speed?: number;
    flySpeed?: number;
    rotateY?: number;
    headBoneName?: string;
    firstPersonCameraOffset?: [number, number, number];
    flyEnabled?: boolean;
    capsuleRadiusRatio?: number;
};

export type MobileControlsOptions = {
    joystick?: boolean;
    jump?: boolean;
    fly?: boolean;
    view?: boolean;
    vehicle?: boolean;
};

export type PlayerControllerOptions = {
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: any;
    playerModelConfig: PlayerModelOptions;
    initPos?: THREE.Vector3;
    mouseSensitivity?: number;
    minCamDistance?: number;
    maxCamDistance?: number;
    camLookAtHeightRatio?: number;
    staticCollider?: THREE.Object3D | THREE.Object3D[];
    dynamicCollider?: THREE.Object3D | THREE.Object3D[];
    isShowMobileControls?: boolean;
    mobileControls?: MobileControlsOptions;
    thirdMouseMode?: 0 | 1 | 2 | 3 | 4 | 5;
    enableZoom?: boolean;
    enableOverShoulderView?: boolean;
    shoulderOffsetDist?: number;
    isFirstPerson?: boolean;
};

// ==================== 车辆配置 ====================

export type VehicleOptions = {
    url: string;
    position: THREE.Vector3;
    wheelsNames: string[];
    scale?: number;
    animations: { openDoorAnim?: string };
    boardingPoint: THREE.Vector3;
    seatOffset?: THREE.Vector3;
    chassisRatio?: number;
    suspensionRestLengthRatio?: number;
    followVehicleDirection?: boolean;
    speedMultiplier?: number;
};

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
    scale: number;
    boardingPoint: THREE.Vector3;
    seatOffset: THREE.Vector3;
    enterVehicleTime: number;
    chassisRatio: number;
    suspensionRestLengthRatio: number;
    size: { l: number; w: number; h: number };
    speedMultiplier: number;
    physicsBoxMesh?: THREE.Mesh;
};

export type DynamicColliderEntry = {
    source: THREE.Object3D; // 原始物体
    mesh: THREE.Mesh; // BVH网格（本地空间几何）
    prevWorldMatrix: THREE.Matrix4; // 上一帧世界矩阵
    deltaPos: THREE.Vector3; // 本帧位移增量
    deltaRotY: number; // 本帧 Y 轴旋转增量（弧度）
}