/**
 * grudge-control — public API.
 *
 * The character controller plus its subsystems (animation, camera, input,
 * vehicle, combat, target), all shared types, and the reusable utilities.
 */

// ── Core controller ──────────────────────────────────────────────────────────
export * from "./playerController";

// ── Types ────────────────────────────────────────────────────────────────────
export type {
    // Player / controller
    PlayerModelOptions,
    PlayerControllerOptions,
    MobileControlsOptions,
    KeyAction,
    KeyMap,
    DynamicColliderEntry,
    // Combat / target / movement
    AttackDef,
    AttackEvent,
    MeleeHit,
    CombatOptions,
    RangedDef,
    RangedHit,
    KnockOptions,
    KnockEvent,
    DodgeOptions,
    TargetOptions,
    TargetInfo,
    // Vehicle
    VehicleOptions,
    VehicleInstance,
} from "./types";

// ── Systems ──────────────────────────────────────────────────────────────────
export { AnimationSystem } from "./systems/AnimationSystem";
export { CameraSystem } from "./systems/CameraSystem";
export { InputSystem } from "./systems/InputSystem";
export { VehicleSystem } from "./systems/VehicleSystem";
export { CombatSystem } from "./systems/CombatSystem";
export { TargetSystem } from "./systems/TargetSystem";

// ── Utils ────────────────────────────────────────────────────────────────────
export { MobileControls } from "./utils/mobileControls";
export { PathPlanner } from "./utils/pathPlanner";
export type { ObstacleChecker, PathPlannerConfig } from "./utils/pathPlanner";
export { createVehicleController } from "./utils/vehicleController";
export type { WheelInfo } from "./utils/vehicleController";
export { loadVehicleModel } from "./utils/vehicleLoader";
export type { VehicleLoaderContext } from "./utils/vehicleLoader";
export { isFbxUrl, loadModelAsset, loadExternalAnimationClips } from "./utils/grudgeAssetLoader";
export { applyCapsuleCollision, createCollisionTemps } from "./utils/capsuleCollision";
export type { CollisionTemps } from "./utils/capsuleCollision";
