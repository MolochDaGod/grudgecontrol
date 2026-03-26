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

## Optional Dependencies

For **vehicle control**, install Rapier:

```bash
npm install @dimforge/rapier3d-compat
```

For **mobile controls**, install nipplejs:

```bash
npm install nipplejs
```

# Run the Example Locally

```bash
# Clone the repository
git clone https://github.com/hh-hang/three-player-controller.git

# Install dependencies
npm install

# Start the dev server
npm run dev
```

Open `http://localhost:5173/three-player-controller/` in your browser.

# Usage

```js
import * as THREE from "three";
import { playerController } from "three-player-controller";

const player = playerController();

// Initialize the player controller
await player.init({
    scene,    // three.js Scene
    camera,   // three.js PerspectiveCamera
    controls, // OrbitControls
    playerModel: {
        url: "./glb/person.glb", // model path
        scale: 0.001,            // model scale
        idleAnim: "idle",        // idle animation name
        walkAnim: "walk",        // walk animation name
        runAnim: "run",          // run animation name
        jumpAnim: "jump",        // jump animation name
    },
    initPos: new THREE.Vector3(0, 0, 0), // initial position
});

// Load a vehicle
await player.loadVehicleModel({
    url: "./glb/bugatti.glb",
    scale: 0.1,
    position: new THREE.Vector3(22, 3.69, 14.5),
    wheelsNames: [
        "Wheel_LF", // front-left
        "Wheel_RF", // front-right
        "Wheel_LR", // rear-left
        "Wheel_RR", // rear-right
    ],
    animations: {
        openDoorAnim: "openDoorLF",
    },
    boardingPoint: new THREE.Vector3(0.5, 0, 1.8),
    seatOffset: new THREE.Vector3(0, 0.6, 0),
    chassisRatio: 0.15,
    suspensionRestLengthRatio: 0.2,
});

// Call every frame inside the render loop
player.update();
```

# API

## 1. Initialization

### Exported Function

```ts
export function playerController(): {
    init: (opts: PlayerControllerOptions, callback?: () => void) => void;
    loadVehicleModel: (params: VehicleOptions) => void;
    switchPlayerModel: (model: PlayerControllerOptions["playerModel"]) => void;
    changeView: () => void;
    reset: (pos?: THREE.Vector3) => void;
    update: (dt?: number) => void;
    destroy: () => void;
    setInput: (input: PlayerInput) => void;
    getPosition: () => THREE.Vector3;
    getCenterScreenRaycastHit: () => THREE.Intersection | undefined;
    getPerson: () => THREE.Object3D | null;
    getActiveVehicle: () => VehicleInstance | null;
    getAllVehicles: () => VehicleInstance[];
    setMouseSensitivity: (mouseSensitivity: number) => void;
    setGravity: (gravity: number) => void;
    setJumpHeight: (jumpHeight: number) => void;
    setPlayerSpeed: (playerSpeed: number) => void;
    setPlayerFlySpeed: (flySpeed: number) => void;
    setMinCamDistance: (minCamDistance: number) => void;
    setMaxCamDistance: (maxCamDistance: number) => void;
    setThirdMouseMode: (thirdMouseMode: 0 | 1 | 2 | 3) => void;
    setEnableZoom: (enableZoom: boolean) => void;
    setOverShoulderView: (enable: boolean) => void;
    setPlayerScale: (scale: number) => void;
    setDebug: (debug: boolean) => void;
    getCurrentPersonAnimationName: () => string | null;
    registerAnimation: (key: string, clipName: string, opts?: {
        loop?: boolean;
        timeScale?: number;
        duration?: number;
        clampWhenFinished?: boolean;
        onFinished?: () => void;
    }) => void;
    playAnimation: (key: string, opts?: {
        fade?: number;
        force?: boolean;
    }) => void;
};
```

### Method Reference

| Method | Description |
|--------|-------------|
| `init(opts, callback?)` | Initialize the controller. `callback` is invoked after all assets finish loading. |
| `loadVehicleModel(params)` | Load and initialize a vehicle. Can be called multiple times for multiple vehicles. |
| `switchPlayerModel(model)` | Hot-swap the character model at runtime, preserving current position and orientation. |
| `changeView()` | Toggle between first-person and third-person view. |
| `reset(pos?)` | Reset the player to the given position (defaults to `initPos`). |
| `update(dt?)` | Call every frame to drive physics and animation. |
| `destroy()` | Destroy the controller and release all resources. |
| `setInput(input)` | Feed external input state — useful for custom key mappings or gamepad support. |
| `getPosition()` | Get the character's current world position. |
| `getCenterScreenRaycastHit()` | Get the intersection of the center-screen ray with the collision mesh, useful for aim or interaction. |
| `getPerson()` | Get the character model object. |
| `getActiveVehicle()` | Get the currently driven vehicle instance. |
| `getAllVehicles()` | Get the array of all loaded vehicle instances. |
| `setMouseSensitivity(v)` | Set mouse sensitivity. |
| `setGravity(v)` | Set gravity (base value; multiplied by scale internally). |
| `setJumpHeight(v)` | Set jump height (base value; multiplied by scale internally). |
| `setPlayerSpeed(v)` | Set movement speed (base value; multiplied by scale internally). |
| `setPlayerFlySpeed(v)` | Set flight speed (base value; multiplied by scale internally). |
| `setMinCamDistance(v)` | Set the minimum third-person camera distance. |
| `setMaxCamDistance(v)` | Set the maximum third-person camera distance. |
| `setThirdMouseMode(v)` | Set the third-person mouse mode (0–3, see below). |
| `setEnableZoom(v)` | Enable or disable scroll-wheel zoom in third-person. |
| `setOverShoulderView(v)` | Enable or disable over-the-shoulder view offset. |
| `setPlayerScale(scale)` | Dynamically rescale the character, updating the collider and all physics parameters. |
| `setDebug(v)` | Show or hide the collision mesh debug visualization. |
| `getCurrentPersonAnimationName()` | Get the name of the currently playing animation clip. |
| `registerAnimation(key, clipName, opts?)` | Register a custom animation clip for later playback via `playAnimation`. |
| `playAnimation(key, opts?)` | Play a previously registered custom animation. |

---

## 2. Events

### Global Event Toggle

```ts
export function onAllEvent(): void;  // Enable all input listeners
export function offAllEvent(): void; // Disable all input listeners
```

- `onAllEvent()`: Ensures the controller exists and activates input listeners.
- `offAllEvent()`: Disables input listening — useful when showing UI or pausing.

Built-in input covers: WASD movement, sprint, jump, mouse look, and more.

### External Input via setInput

Use `setInput` to override input handling for custom key mappings or gamepad support:

```ts
player.setInput({
    moveX: 1 | 0 | -1,       // Horizontal: 1 = right, -1 = left, 0 = stop
    moveY: 1 | 0 | -1,       // Vertical:   1 = forward, -1 = backward, 0 = stop
    lookDeltaX: number,       // Horizontal look delta
    lookDeltaY: number,       // Vertical look delta
    jump: boolean,            // Jump
    shift: boolean,           // Sprint
    toggleView: boolean,      // Toggle first/third-person
    toggleFly: boolean,       // Toggle flight mode
    toggleVehicle: boolean,   // Enter / exit vehicle
});
```

---

## 3. Configuration

### PlayerControllerOptions Type

```ts
type PlayerControllerOptions = {
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    playerModel: {
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
    initPos?: THREE.Vector3;
    mouseSensitivity?: number;
    minCamDistance?: number;
    maxCamDistance?: number;
    colliderMeshUrl?: string;
    isShowMobileControls?: boolean;
    thirdMouseMode?: 0 | 1 | 2 | 3;
    enableZoom?: boolean;
    enableOverShoulderView?: boolean;
};
```

### Field Reference

| Field | Type | Required | Default | Description |
|-------|------|:--------:|:-------:|-------------|
| `scene` | `THREE.Scene` | ✓ | — | The three.js scene |
| `camera` | `THREE.PerspectiveCamera` | ✓ | — | The three.js camera |
| `controls` | `OrbitControls` | ✓ | — | External OrbitControls instance |
| `playerModel.url` | `string` | ✓ | — | Path to the character GLB/GLTF model |
| `playerModel.scale` | `number` | ✓ | — | Model scale factor |
| `playerModel.idleAnim` | `string` | ✓ | — | Idle animation name (must match the clip name in the model) |
| `playerModel.walkAnim` | `string` | ✓ | — | Walk animation name |
| `playerModel.runAnim` | `string` | ✓ | — | Run animation name |
| `playerModel.jumpAnim` | `string` | ✓ | — | Jump animation name |
| `playerModel.leftWalkAnim` | `string` | — | `walkAnim` | Left-strafe animation; falls back to `walkAnim` |
| `playerModel.rightWalkAnim` | `string` | — | `walkAnim` | Right-strafe animation; falls back to `walkAnim` |
| `playerModel.backwardAnim` | `string` | — | `walkAnim` | Backward animation; falls back to `walkAnim` |
| `playerModel.flyAnim` | `string` | — | `idleAnim` | Flying animation; falls back to `idleAnim` |
| `playerModel.flyIdleAnim` | `string` | — | `idleAnim` | Fly-idle animation; falls back to `idleAnim` |
| `playerModel.enterCarAnim` | `string` | — | — | Enter-vehicle animation (required when using vehicle support) |
| `playerModel.exitCarAnim` | `string` | — | — | Exit-vehicle animation (required when using vehicle support) |
| `playerModel.rotateY` | `number` | — | `0` | Extra Y-axis rotation offset applied to the model |
| `playerModel.headObjName` | `string` | — | — | Head bone node name, used to attach the first-person camera |
| `playerModel.speed` | `number` | — | `300` | Base movement speed |
| `playerModel.gravity` | `number` | — | `-2400` | Base gravity acceleration |
| `playerModel.jumpHeight` | `number` | — | `600` | Base jump height |
| `playerModel.flySpeed` | `number` | — | `2100` | Base flight speed |
| `playerModel.flyEnabled` | `boolean` | — | `true` | Whether flight mode is available |
| `playerModel.capsuleRadiusRatio` | `number` | — | `1.0` | Capsule collider radius multiplier — higher values widen the collision area |
| `initPos` | `THREE.Vector3` | — | `(0,0,0)` | Initial spawn position |
| `mouseSensitivity` | `number` | — | `5` | Mouse sensitivity |
| `minCamDistance` | `number` | — | `100` | Minimum third-person camera distance |
| `maxCamDistance` | `number` | — | `440` | Maximum third-person camera distance |
| `colliderMeshUrl` | `string` | — | — | Custom collision mesh URL; defaults to all meshes in the scene |
| `isShowMobileControls` | `boolean` | — | `true` | Show virtual joystick on mobile devices |
| `thirdMouseMode` | `0\|1\|2\|3` | — | `1` | Third-person mouse mode (see table below) |
| `enableZoom` | `boolean` | — | `false` | Allow scroll-wheel zoom in third-person |
| `enableOverShoulderView` | `boolean` | — | `false` | Enable over-the-shoulder camera offset |

**thirdMouseMode values:**

| Value | Behavior |
|-------|----------|
| `0` | Pointer locked — mouse controls both character orientation and camera |
| `1` | Pointer locked — mouse controls camera only (default) |
| `2` | Pointer visible — drag to control both orientation and camera |
| `3` | Pointer visible — drag to control camera only |

---

### VehicleOptions Type

```ts
type VehicleOptions = {
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
    followVehicleDirection?: boolean;
    speedMultiplier?: number;
};
```

### Field Reference

| Field | Type | Required | Default | Description |
|-------|------|:--------:|:-------:|-------------|
| `url` | `string` | ✓ | — | Path to the vehicle GLB/GLTF model |
| `position` | `THREE.Vector3` | ✓ | — | Initial world position of the vehicle |
| `wheelsNames` | `string[]` | ✓ | — | Wheel node names in order: front-left, front-right, rear-left, rear-right |
| `scale` | `number` | — | `1` | Model scale factor |
| `animations.openDoorAnim` | `string` | — | — | Door-open animation clip name |
| `boardingPoint` | `THREE.Vector3` | ✓ | — | Boarding point in the vehicle's local coordinate space |
| `seatOffset` | `THREE.Vector3` | — | `(0,0,0)` | Fine-tune the seated character position after boarding |
| `chassisRatio` | `number` | — | `0.2` | Chassis height as a ratio of tire diameter (affects model placement) |
| `suspensionRestLengthRatio` | `number` | — | `0.2` | Suspension rest length as a ratio of tire diameter (affects physics chassis height) |
| `followVehicleDirection` | `boolean` | — | `true` | Whether the camera auto-aligns behind the vehicle while driving |
| `speedMultiplier` | `number` | — | `1` | Speed multiplier for tuning individual vehicle performance |

---

## 4. Custom Animations

Beyond the built-in animation set, you can register and play any animation clip from the loaded model.

### registerAnimation

```ts
player.registerAnimation(key, clipName, opts?)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `key` | `string` | Identifier used to reference this animation later |
| `clipName` | `string` | Original animation clip name inside the GLB model |
| `opts.loop` | `boolean` | Whether to loop; default `true` |
| `opts.timeScale` | `number` | Playback speed multiplier; default `1` |
| `opts.duration` | `number` | Target playback duration in seconds — `timeScale` is computed automatically. Mutually exclusive with `timeScale`. |
| `opts.clampWhenFinished` | `boolean` | Freeze on the last frame when a one-shot animation ends; default `false` |
| `opts.onFinished` | `() => void` | Callback fired when the animation finishes (only meaningful for one-shot animations) |

### playAnimation

```ts
player.playAnimation(key, opts?)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `key` | `string` | Identifier of a previously registered animation |
| `opts.fade` | `number` | Crossfade duration in seconds; default `0.18` |
| `opts.force` | `boolean` | Force restart from the beginning even if the animation is already playing |

**Example:**

```ts
// Register a one-shot animation with a completion callback
player.registerAnimation("attack", "Attack_Clip", {
    loop: false,
    duration: 1.2,
    clampWhenFinished: true,
    onFinished: () => console.log("Attack finished"),
});

// Play it
player.playAnimation("attack", { force: true });
```

# Credits

[three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh)

[three](https://github.com/mrdoob/three.js)

[npm]: https://img.shields.io/npm/v/three-player-controller
[npm-url]: https://www.npmjs.com/package/three-player-controller
