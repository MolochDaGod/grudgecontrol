import * as THREE from "three";
import type { RigidBody } from "@dimforge/rapier3d-compat";
import type { PathPlanner } from "../utils/pathPlanner";

// ==================== Player config ====================

export type PlayerModelOptions = {
    url: string; // Model path (GLB/GLTF)
    scale: number; // Model scale
    idleAnim: string; // Idle animation name
    walkAnim: string; // Walk animation name
    runAnim: string; // Run animation name
    jumpAnim: string | [startAnim: string, loopAnim: string, endAnim: string]; // Jump clip name; or [start, loop, land] three-part
    leftWalkAnim?: string; // Strafe-left animation, defaults to walkAnim
    rightWalkAnim?: string; // Strafe-right animation, defaults to walkAnim
    backwardAnim?: string; // Walk-back animation, defaults to walkAnim
    flyAnim?: string; // Fly animation, defaults to idleAnim
    flyIdleAnim?: string; // Fly-idle animation, defaults to idleAnim
    flyHoverForwardAnim?: string; // Fly hover-forward animation, defaults to flyAnim
    flyHoverBackAnim?: string; // Fly hover-back animation, defaults to flyIdleAnim
    flyHoverLeftAnim?: string; // Fly hover-left animation, defaults to flyIdleAnim
    flyHoverRightAnim?: string; // Fly hover-right animation, defaults to flyIdleAnim
    flyHoverUpAnim?: string; // Fly hover-up animation, defaults to flyIdleAnim
    flyHoverDownAnim?: string; // Fly hover-down animation, defaults to flyIdleAnim
    enterCarAnim?: string; // Enter-vehicle animation
    exitCarAnim?: string; // Exit-vehicle animation
    gravity?: number; // Gravity base (scaled by scale), default -2400
    jumpHeight?: number; // Jump-height base (scaled by scale), default 600
    speed?: number; // Move-speed base (scaled by scale), default 300
    flySpeed?: number; // Fly-speed base (scaled by scale), default 2100
    rotateY?: number; // Initial facing yaw (radians), default 0
    headBoneName?: string; // Head bone name for first-person camera attach
    firstPersonCameraOffset?: [number, number, number]; // First-person camera local offset
    capsuleRadiusRatio?: number; // Capsule radius multiplier, default 1
    acceleration?: number; // XZ acceleration response, default 30
    deceleration?: number; // XZ deceleration response, default 30
    /** External animation GLB/FBX URLs keyed by clip name (idle, walk, run, jump, …) */
    animationUrls?: Record<string, string>;
};

export type MobileControlsOptions = {
    joystick?: boolean; // Show joystick, default true
    jump?: boolean; // Show jump button, default true
    fly?: boolean; // Show fly button, default true
    view?: boolean; // Show view-toggle button, default true
    vehicle?: boolean; // Show enter/exit vehicle button, default true
};

// Remappable input actions
export type KeyAction =
    | "forward" | "backward" | "left" | "right"
    | "sprint" | "jump" | "toggleView" | "toggleFly" | "toggleVehicle"
    | "attack" | "attackHeavy" | "aim" | "knock" | "targetNext" | "targetPrev";

// Custom key map: omit to keep defaults, pass code/array to override, pass null to disable
export type KeyMap = Partial<Record<KeyAction, string | string[] | null>>;

export type PlayerControllerOptions = {
    scene: THREE.Scene; // three.js scene instance
    camera: THREE.PerspectiveCamera; // three.js camera instance
    controls: any; // External camera controls, usually OrbitControls
    playerModelConfig: PlayerModelOptions; // Character model and parameter config
    initPos?: THREE.Vector3; // Spawn position, default (0,0,0)
    mouseSensitivity?: number; // Mouse sensitivity, default 5
    minCamDistance?: number; // Third-person min camera distance, default 100
    maxCamDistance?: number; // Third-person max camera distance, default 440
    camLookAtHeightRatio?: number; // Look-at height ratio (0=feet 1=head), default 0.8
    staticCollider?: THREE.Object3D | THREE.Object3D[]; // Static collider sources; omit to traverse the whole scene
    dynamicCollider?: THREE.Object3D | THREE.Object3D[]; // Dynamic colliders registered at init
    isShowMobileControls?: boolean; // Show virtual mobile UI, default true
    mobileControls?: MobileControlsOptions; // Mobile button visibility
    thirdMouseMode?: 0 | 1 | 2 | 3 | 4 | 5; // Third-person mouse mode, default 1
    enableZoom?: boolean; // Allow wheel zoom, default false
    enableOverShoulderView?: boolean; // Enable over-shoulder view, default false
    isFirstPerson?: boolean; // Start in first-person, default false
    enableSpringCamera?: boolean; // Enable spring camera, default false
    springCameraTime?: number; // Spring camera smoothing time (seconds), default 0.05
    timeScale?: number; // Time scale, <1 slow-mo >1 fast-forward, default 1
    keyMap?: KeyMap; // Custom key map
};

// ==================== Combat config ====================

// Single attack move definition
export type AttackDef = {
    clip: string; // Attack animation clip name on the model
    timeScale?: number; // Playback speed multiplier, default 1
    durationMs?: number; // Explicit clip duration (ms); takes priority over timeScale-derived speed
    damage?: number; // Damage value, passed through to onHit consumers
    cooldownMs?: number; // Minimum interval before this move can fire again (ms), default 0
    comboWindowMs?: number; // Window after the move ends to chain the next combo hit (ms), default 350
    hitFraction?: number; // Hit check at this fraction of the clip (0~1), default 0.5
    range?: number; // Melee reach (world units, scaled by scale), default 120
    arcDeg?: number; // Melee hit cone half-angle (degrees), default 60
    lockMovement?: boolean; // Lock XZ movement while attacking, default false
    element?: string; // Custom damage-type tag
    next?: string; // Default next-move key for a fast chain
};

// Melee hit result
export type MeleeHit = {
    target: THREE.Object3D; // Hit target object
    point: THREE.Vector3; // Hit point (target world position)
    distance: number; // Distance from attacker
};

// Attack event payload
export type AttackEvent = {
    key: string; // Move key
    index: number; // Combo index (from 0)
    combo: string | null; // Current combo name (null if none)
    def: AttackDef; // Move definition
};

// Combat system config
export type CombatOptions = {
    allowAerialAttacks?: boolean; // Allow attacks while airborne (jump/fall), default true
    allowFlyingAttacks?: boolean; // Allow attacks in fly mode, default false
    bufferInput?: boolean; // Buffer attack input to chain combos, default true
    targets?: THREE.Object3D[]; // Default melee/ranged hit candidates
    softLockFacing?: boolean; // Face the current target while attacking (soft lock), default true
};

// Ranged attack definition (RMB aim/fire)
export type RangedDef = {
    clip?: string; // Fire animation clip name (optional)
    timeScale?: number; // Playback speed multiplier, default 1
    damage?: number; // Damage value
    cooldownMs?: number; // Fire interval (ms), default 300
    range?: number; // Range (world units, scaled by scale), default 4000
    spread?: number; // Spread angle (radians), default 0
    element?: string; // Damage-type tag
    muzzleOffset?: [number, number, number]; // Muzzle local offset
};

// Ranged hit result
export type RangedHit = {
    target: THREE.Object3D; // Hit target
    point: THREE.Vector3; // Hit point
    distance: number; // Hit distance
    damage: number; // Damage value
};

// Knockback (MMB) config
export type KnockOptions = {
    clip?: string; // Knockback animation clip name (optional)
    radius?: number; // Effect radius (world units, scaled by scale), default 220
    force?: number; // Knockback force, default 600
    arcDeg?: number; // Effect cone half-angle (degrees), 360=full circle, default 360
    cooldownMs?: number; // Cooldown (ms), default 1200
    damage?: number; // Bonus damage, default 0
};

// Knockback event payload
export type KnockEvent = {
    target: THREE.Object3D; // Knocked-back target
    direction: THREE.Vector3; // Knockback direction (unit vector)
    force: number; // Knockback force
    damage: number; // Bonus damage
};

// Dodge/dash (double-tap direction) config
export type DodgeOptions = {
    clip?: string; // Dodge animation clip name (optional)
    speed?: number; // Dodge speed base (scaled by scale), default 1400
    durationMs?: number; // Dodge duration (ms), default 280
    cooldownMs?: number; // Cooldown (ms), default 550
    iframes?: boolean; // Grant i-frames during dodge, default true
    doubleTapMs?: number; // Double-tap detection window (ms), default 250
};

// Target lock system config
export type TargetOptions = {
    maxRange?: number; // Max lock range (scaled by scale), default 6000
    softLockRange?: number; // Soft-lock range (scaled by scale), default 3000
    maxAngleDeg?: number; // Max half-angle of lock candidates vs camera forward (degrees), default 70
    isAlive?: (target: THREE.Object3D) => boolean; // Alive check, default always true
};

// Current target info (for UI target frame / health bar)
export type TargetInfo = {
    object: THREE.Object3D; // Target object
    hard: boolean; // Tab hard lock (false = soft lock)
    distance: number; // Distance from player
};

// ==================== Vehicle config ====================

export type VehicleOptions = {
    url: string; // Vehicle model path (GLB/GLTF)
    position: THREE.Vector3; // Vehicle initial world position
    wheelsNames: string[]; // Wheel node names, order: FL, FR, RL, RR
    scale?: number; // Vehicle model scale, default 1
    animations: { openDoorAnim?: string }; // Door open/close animation name
    boardingPoint: THREE.Vector3; // Boarding point, local space
    seatOffset?: THREE.Vector3; // Seat offset after boarding, default (0,0,0)
    chassisRatio?: number; // Chassis height ratio, default 0.2
    suspensionRestLengthRatio?: number; // Suspension rest-length ratio, default 0.2
    followVehicleDirection?: boolean; // Camera follows vehicle facing while driving, default true
    speedMultiplier?: number; // Per-vehicle speed multiplier, default 1
};

export type VehicleInstance = {
    vehicleGroup: THREE.Group; // Vehicle model group
    chassisBody: RigidBody; // Chassis rigid body
    vehicleController: any; // Rapier vehicle controller
    updateWheelVisuals: () => void; // Callback to sync wheel visuals
    stepVehicle?: (dt: number) => void; // Rapier updateVehicle(dt) before world.step
    destroyPhysics?: () => void; // removeVehicleController
    vehicleMixer?: THREE.AnimationMixer; // Vehicle animation mixer
    vehicleActions?: Map<string, THREE.AnimationAction>; // Vehicle action map
    vehiclIsOpenDoor: boolean; // Whether the door is open
    vehicleBBox: THREE.Box3; // Vehicle bounding box
    pathPlanner: PathPlanner; // Boarding path planner
    scale: number; // Vehicle scale
    boardingPoint: THREE.Vector3; // Boarding point, local space
    seatOffset: THREE.Vector3; // Seat offset
    enterVehicleTime: number; // Enter-vehicle animation duration
    chassisRatio: number; // Chassis height ratio
    suspensionRestLengthRatio: number; // Suspension rest-length ratio
    size: { l: number; w: number; h: number }; // Vehicle size (length, width, height)
    speedMultiplier: number; // Per-vehicle speed multiplier
    physicsBoxMesh?: THREE.Mesh; // Physics-box debug mesh
};

export type DynamicColliderEntry = {
    source: THREE.Object3D; // Source object
    mesh: THREE.Mesh; // BVH mesh (local-space geometry)
    prevWorldMatrix: THREE.Matrix4; // Previous-frame world matrix
    deltaPos: THREE.Vector3; // This-frame position delta
    deltaRotY: number; // This-frame Y-axis rotation delta (radians)
}
