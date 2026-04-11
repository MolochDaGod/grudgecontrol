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
    jumpAnim: string;
    leftWalkAnim?: string;
    rightWalkAnim?: string;
    backwardAnim?: string;
    flyAnim?: string;
    flyIdleAnim?: string;
    enterCarAnim?: string;
    exitCarAnim?: string;
    gravity?: number;
    jumpHeight?: number;
    speed?: number;
    flySpeed?: number;
    rotateY?: number;
    headObjName?: string;
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
    playerModel: PlayerModelOptions;
    initPos?: THREE.Vector3;
    mouseSensitivity?: number;
    minCamDistance?: number;
    maxCamDistance?: number;
    colliderMeshUrl?: string;
    isShowMobileControls?: boolean;
    mobileControls?: MobileControlsOptions;
    thirdMouseMode?: 0 | 1 | 2 | 3;
    enableZoom?: boolean;
    enableOverShoulderView?: boolean;
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
};
