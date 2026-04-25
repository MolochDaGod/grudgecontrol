[中文](README.md) | English

# three-player-controller

[![NPM Package][npm]][npm-url]

A lightweight, out-of-the-box third-person / first-person player controller built on three.js and three-mesh-bvh. Features capsule-based character collision, BVH collision detection, character animation, first/third-person view switching, and camera obstacle avoidance — optimized for high performance in large scenes.

# Demo

- [Demo](https://hh-hang.github.io/three-player-controller/index.html)

### Standard Control

![Standard Control Demo](https://github.com/hh-hang/three-player-controller/blob/master/example/public/gif/1.gif)

### Flight Control

![Flight Control Demo](https://github.com/hh-hang/three-player-controller/blob/master/example/public/gif/4.gif)

### Vehicle Control

![Vehicle Control Demo](https://github.com/hh-hang/three-player-controller/blob/master/example/public/gif/6.gif)

### Mobile Control

![Mobile Control Demo](https://github.com/hh-hang/three-player-controller/blob/master/example/public/gif/5.gif)

# Installation

```bash
npm install three-player-controller three three-mesh-bvh
```

## Optional Dependency

Vehicle support requires Rapier:

```bash
npm install @dimforge/rapier3d-compat
```

# Run Locally

```bash
git clone https://github.com/hh-hang/three-player-controller.git
npm install
npm run dev
```

Open `http://localhost:5173/three-player-controller/`.

# Usage

```ts
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { playerController } from "three-player-controller";

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 5000);
const controls = new OrbitControls(camera, renderer.domElement);

const player = playerController();

await player.init({
    scene,
    camera,
    controls,
    playerModelConfig: {
        url: "./glb/person.glb",
        scale: 0.001,
        idleAnim: "idle",
        walkAnim: "walk",
        runAnim: "run",
        jumpAnim: "jump",
        headBoneName: "Head",
        firstPersonCameraOffset: [0, 10, 20],
    },
    initPos: new THREE.Vector3(0, 0, 0),
    colliderMeshUrl: "./glb/world-collider.glb",
    isFirstPerson: false,
    enableOverShoulderView: false,
});

await player.loadVehicleModel({
    url: "./glb/bugatti.glb",
    position: new THREE.Vector3(22, 3.69, 14.5),
    wheelsNames: ["Wheel_LF", "Wheel_RF", "Wheel_LR", "Wheel_RR"],
    scale: 0.1,
    animations: {
        openDoorAnim: "openDoorLF",
    },
    boardingPoint: new THREE.Vector3(0.5, 0, 1.8),
    seatOffset: new THREE.Vector3(0, 0.6, 0),
    chassisRatio: 0.15,
    suspensionRestLengthRatio: 0.2,
});

function animate() {
    requestAnimationFrame(animate);
    player.update();
    renderer.render(scene, camera);
}

animate();
```

# API

## Lifecycle

| Method | Description |
| --- | --- |
| `init(opts, callback?)` | Initialize the controller. `callback` runs after loading completes. |
| `update(dt?)` | Update movement, collision, and animation once per frame. |
| `destroy()` | Dispose the controller and remove listeners. |
| `reset(pos?)` | Reset the character to `pos` or the initial position. |
| `switchPlayerModel(model)` | Swap the current player model while preserving position and facing. |
| `loadVehicleModel(opts)` | Load a vehicle. Can be called multiple times. |
| `changeView()` | Toggle first-person / third-person. |

## State Getters

| Method | Return |
| --- | --- |
| `getPosition()` | Current player position. |
| `getVelocity()` | Current player velocity as `THREE.Vector3`. |
| `getIsFirstPerson()` | Whether first-person mode is active. |
| `getIsFlying()` | Whether flight mode is active. |
| `getIsOnGround()` | Whether the player is grounded. |
| `getControllerMode()` | `0` for player mode, `1` for vehicle mode. |
| `getPlayerModel()` | The loaded player model object. |
| `getPlayerCapsule()` | The player capsule mesh. |
| `getActiveVehicle()` | The current vehicle instance, if any. |
| `getAllVehicles()` | All loaded vehicle instances. |
| `getCollider()` | The merged collider mesh used for BVH checks. |
| `getCurrentPlayerAnimationName()` | The current animation clip name, or `null`. |
| `getCenterScreenRaycastHit()` | Center-screen raycast result, useful for aiming or interaction. |

## Input And Runtime Controls

| Method | Description |
| --- | --- |
| `setInput(input)` | Feed custom input state, useful for gamepads or your own key mapping. |
| `setMouseSensitivity(v)` | Set mouse sensitivity. |
| `setPlayerScale(v)` | Rescale the player and update collider-related values. |
| `setPlayerSpeed(v)` | Set move speed. |
| `setPlayerFlySpeed(v)` | Set fly speed. |
| `setJumpHeight(v)` | Set jump height. |
| `setGravity(v)` | Set gravity. |
| `setMinCamDistance(v)` | Set minimum third-person camera distance. |
| `setMaxCamDistance(v)` | Set maximum third-person camera distance. |
| `setThirdMouseMode(v)` | Set third-person mouse mode: `0 | 1 | 2 | 3`. |
| `setEnableZoom(v)` | Enable or disable camera zoom. |
| `setOverShoulderView(v)` | Enable or disable over-shoulder view offset. |
| `setDebug(v)` | Show or hide collider debug display. |
| `setEnableToward(v)` | Enable or disable mouse-driven facing / look updates. |

## Animation

| Method | Description |
| --- | --- |
| `registerAnimation(key, clipName, opts?)` | Register a custom animation clip. |
| `playAnimation(key, opts?)` | Play a registered custom animation. |
| `registerLocomotionSet(setName, map)` | Register a locomotion set to replace built-in movement animations. |
| `switchLocomotionSet(setName, fade?)` | Switch to a registered locomotion set. |

### `registerAnimation`

```ts
player.registerAnimation(key, clipName, {
    loop?: boolean,
    timeScale?: number,
    duration?: number,
    clampWhenFinished?: boolean,
    onFinished?: () => void,
});
```

- `duration` is supported in the current implementation and overrides `timeScale`.

### `playAnimation`

```ts
player.playAnimation(key, {
    fade?: number,
    force?: boolean,
});
```

### `registerLocomotionSet`

```ts
player.registerLocomotionSet("combat", {
    idle: "CombatIdle",
    walking: "CombatWalk",
    walking_backward: "CombatBack",
    running: "CombatRun",
    jumping: "CombatJump",
    flyidle: "CombatFlyIdle",
    flying: "CombatFly",
});
```

## Events

```ts
player.onAnimationChange((name, action) => {});
player.onBeforeViewChange((isFirstPerson) => {});
player.onViewChange((isFirstPerson) => {});
player.onGroundChange((onGround) => {});
player.onVehicleEnter((vehicle) => {});
player.onVehicleExit((vehicle) => {});
player.onTowardChange((dx, dy, speed) => {});
```

| Event | Description |
| --- | --- |
| `onAnimationChange` | Fired when the active player animation changes. |
| `onBeforeViewChange` | Fired before first/third-person view toggles. |
| `onViewChange` | Fired after view toggle completes. |
| `onGroundChange` | Fired when grounded state changes. |
| `onVehicleEnter` | Fired after entering a vehicle. |
| `onVehicleExit` | Fired after exiting a vehicle. |
| `onTowardChange` | Fired when look/facing input updates. |

### Global Input Listener Helpers

```ts
import { onAllEvent, offAllEvent } from "three-player-controller";
```

- `onAllEvent()`: enable keyboard / mouse listeners.
- `offAllEvent()`: disable keyboard / mouse listeners.

### Default Keyboard Controls

| Key | Action |
| --- | --- |
| `W` / `ArrowUp` | Move forward |
| `S` / `ArrowDown` | Move backward |
| `A` / `ArrowLeft` | Move left |
| `D` / `ArrowRight` | Move right |
| `Shift` | Sprint |
| `Space` | Jump |
| `V` | Toggle view |
| `F` | Toggle flight mode |
| `E` | Enter / exit vehicle |
| Mouse move | Look / rotate camera |

### `setInput`

```ts
player.setInput({
    moveX: 1 | 0 | -1,
    moveY: 1 | 0 | -1,
    lookDeltaX: number,
    lookDeltaY: number,
    jump: boolean,
    shift: boolean,
    toggleView: boolean,
    toggleFly: boolean,
    toggleVehicle: boolean,
});
```

## Types

### `PlayerControllerOptions`

```ts
type PlayerControllerOptions = {
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: any;
    playerModelConfig: PlayerModelOptions;
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
    isFirstPerson?: boolean;
};
```

### `PlayerModelOptions`

```ts
type PlayerModelOptions = {
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
    headBoneName?: string;
    firstPersonCameraOffset?: [number, number, number];
    flyEnabled?: boolean;
    capsuleRadiusRatio?: number;
};
```

### `MobileControlsOptions`

```ts
type MobileControlsOptions = {
    joystick?: boolean;
    jump?: boolean;
    fly?: boolean;
    view?: boolean;
    vehicle?: boolean;
};
```

### `VehicleOptions`

```ts
type VehicleOptions = {
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
```

## Field Reference

### `PlayerControllerOptions`

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `scene` | `THREE.Scene` | Yes | — | three.js scene instance. |
| `camera` | `THREE.PerspectiveCamera` | Yes | — | three.js camera instance. |
| `controls` | `any` | Yes | — | External camera controller, typically `OrbitControls`. |
| `playerModelConfig` | `PlayerModelOptions` | Yes | — | Player model and movement-related config. |
| `initPos` | `THREE.Vector3` | No | `(0, 0, 0)` | Initial spawn position. |
| `mouseSensitivity` | `number` | No | `5` | Mouse sensitivity. |
| `minCamDistance` | `number` | No | `100` | Minimum third-person camera distance. |
| `maxCamDistance` | `number` | No | `440` | Maximum third-person camera distance. |
| `colliderMeshUrl` | `string` | No | — | Custom collider GLB/GLTF path. If omitted, collider data is collected from scene meshes. |
| `isShowMobileControls` | `boolean` | No | `true` | Whether to show virtual controls on mobile. |
| `mobileControls` | `MobileControlsOptions` | No | all enabled | Mobile UI visibility config. |
| `thirdMouseMode` | `0 \| 1 \| 2 \| 3` | No | `1` | Third-person mouse mode. |
| `enableZoom` | `boolean` | No | `false` | Whether wheel zoom is enabled. |
| `enableOverShoulderView` | `boolean` | No | `false` | Whether over-shoulder view is enabled. |
| `isFirstPerson` | `boolean` | No | `false` | Whether to start directly in first-person mode. |

### `PlayerModelOptions`

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `url` | `string` | Yes | — | Player model path (GLB/GLTF). |
| `scale` | `number` | Yes | — | Player model scale. |
| `idleAnim` | `string` | Yes | — | Idle clip name. Must match the clip in the model. |
| `walkAnim` | `string` | Yes | — | Walk clip name. Must match the clip in the model. |
| `runAnim` | `string` | Yes | — | Run clip name. Must match the clip in the model. |
| `jumpAnim` | `string` | Yes | — | Jump clip name. Must match the clip in the model. |
| `leftWalkAnim` | `string` | No | `walkAnim` | Left strafe clip. Falls back to `walkAnim`. |
| `rightWalkAnim` | `string` | No | `walkAnim` | Right strafe clip. Falls back to `walkAnim`. |
| `backwardAnim` | `string` | No | `walkAnim` | Backward walk clip. Falls back to `walkAnim`. |
| `flyAnim` | `string` | No | `idleAnim` | Flying clip. Falls back to `idleAnim`. |
| `flyIdleAnim` | `string` | No | `idleAnim` | Fly-idle clip. Falls back to `idleAnim`. |
| `enterCarAnim` | `string` | No | — | Enter-vehicle clip; recommended when using vehicle support. |
| `exitCarAnim` | `string` | No | — | Exit-vehicle clip; recommended when using vehicle support. |
| `gravity` | `number` | No | `-2400` | Gravity base value, scaled by player `scale`. |
| `jumpHeight` | `number` | No | `600` | Jump base value, scaled by player `scale`. |
| `speed` | `number` | No | `300` | Move speed base value, scaled by player `scale`. |
| `flySpeed` | `number` | No | `2100` | Fly speed base value, scaled by player `scale`. |
| `rotateY` | `number` | No | `0` | Extra Y-axis model rotation offset. |
| `headBoneName` | `string` | No | — | Head bone or node name used for first-person camera attachment. |
| `firstPersonCameraOffset` | `[number, number, number]` | No | built-in fallback | Local first-person camera offset. If `headBoneName` exists it is relative to that bone, otherwise to the capsule. |
| `flyEnabled` | `boolean` | No | `true` | Whether flight mode is enabled. |
| `capsuleRadiusRatio` | `number` | No | `1` | Capsule radius multiplier for collision tuning. |

### `MobileControlsOptions`

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `joystick` | `boolean` | No | `true` | Show joystick. |
| `jump` | `boolean` | No | `true` | Show jump button. |
| `fly` | `boolean` | No | `true` | Show fly toggle button. |
| `view` | `boolean` | No | `true` | Show view toggle button. |
| `vehicle` | `boolean` | No | `true` | Show vehicle enter/exit button. |

### `VehicleOptions`

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `url` | `string` | Yes | — | Vehicle model path (GLB/GLTF). |
| `position` | `THREE.Vector3` | Yes | — | Initial world position. |
| `wheelsNames` | `string[]` | Yes | — | Wheel node names in order: front-left, front-right, rear-left, rear-right. |
| `scale` | `number` | No | `1` | Vehicle model scale. |
| `animations.openDoorAnim` | `string` | No | — | Door animation clip name. |
| `boardingPoint` | `THREE.Vector3` | Yes | — | Boarding point in local space. |
| `seatOffset` | `THREE.Vector3` | No | `(0, 0, 0)` | Seat offset applied after entering the vehicle. |
| `chassisRatio` | `number` | No | `0.2` | Chassis height ratio. |
| `suspensionRestLengthRatio` | `number` | No | `0.2` | Suspension rest length ratio. |
| `followVehicleDirection` | `boolean` | No | `true` | Whether the camera follows the vehicle direction while driving. |
| `speedMultiplier` | `number` | No | `1` | Per-vehicle speed multiplier. |

# Notes

- `init` expects `playerModelConfig`, not the old `playerModel`.
- `headBoneName` replaces the old `headObjName`.
- `firstPersonCameraOffset` is supported by the current implementation.
- Vehicle support should be paired with `enterCarAnim` and `exitCarAnim`.

# Credits

[three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh)

[three](https://github.com/mrdoob/three.js)

[npm]: https://img.shields.io/npm/v/three-player-controller
[npm-url]: https://www.npmjs.com/package/three-player-controller
