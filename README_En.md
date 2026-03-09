[中文](README.md)

# three-player-controller

[![NPM Package][npm]][npm-url]

A lightweight third-person / first-person player controller for three.js. Out-of-the-box capsule collision, BVH-accelerated collision detection, character animations, first/third-person camera switching, camera occlusion avoidance, and high-performance operation in large scenes powered by three-mesh-bvh.

# Demo

- [Demo](https://hh-hang.github.io/three-player-controller/index.html)

### Basic Movement

![Basic Movement](https://github.com/hh-hang/three-player-controller/blob/master/example/public/gif/1.gif)

### Fly Mode

![Fly Mode](https://github.com/hh-hang/three-player-controller/blob/master/example/public/gif/4.gif)

### Vehicle Control

![Vehicle Control](https://github.com/hh-hang/three-player-controller/blob/master/example/public/gif/6.gif)

### Mobile Controls

![Mobile Controls](https://github.com/hh-hang/three-player-controller/blob/master/example/public/gif/5.gif)

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

# Run Examples Locally

```bash
# Clone the repository
git clone https://github.com/hh-hang/three-player-controller.git

# Install dependencies
npm install

# Start dev server
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
    scene,   // three.js scene
    camera,  // three.js camera
    controls, // three.js controls
    playerModel: {
        url: "./glb/person.glb", // model path
        scale: 0.001,            // model scale
        idleAnim: "idle",        // idle animation name
        walkAnim: "walk",        // walk animation name
        runAnim: "run",          // run animation name
        jumpAnim: "jump",        // jump animation name
    },
    initPos: new THREE.Vector3(0, 0, 0),
});

// Load a vehicle
await player.loadVehicleModel({
    url: "./glb/bugatti.glb",
    scale: 0.1,
    position: new Vector3(22, 3.69, 14.5),
    wheelsNames: [
        "Wheel_LF", // front left
        "Wheel_RF", // front right
        "Wheel_LR", // rear left
        "Wheel_RR", // rear right
    ],
    animations: {
        openDoorAnim: "openDoorLF",
    },
    boardingPoint: new Vector3(0.5, 0, 1.8),
    seatOffset: new Vector3(0, 0.6, 0),
    chassisRatio: 0.15,
    suspensionRestLengthRatio: 0.2,
});

// Call every frame
player.update();
```

# API

## I. Initialization

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
    setMouseSensitivity: (mouseSensity: number) => void;
    setGravity: (gravity: number) => void;
    setJumpHeight: (jumpHeight: number) => void;
    setPlayerSpeed: (playerSpeed: number) => void;
    setflySpeed: (flySpeed: number) => void;
    setMinCamDistance: (minCamDistance: number) => void;
    setMaxCamDistance: (maxCamDistance: number) => void;
    setThirdMouseMode: (thirdMouseMode: 0 | 1 | 2 | 3) => void;
    setEnableZoom: (enableZoom: boolean) => void;
    setOverShoulderView: (enable: boolean) => void;
    setPlayerScale: (scale: number) => void;
    setDebug: (debug: boolean) => void;
};
```

### Method Reference

| Method | Description |
|--------|-------------|
| `init(opts, callback?)` | Initialize the controller. `callback` fires after all assets are loaded. |
| `loadVehicleModel(params)` | Load and initialize a vehicle. Can be called multiple times for multiple vehicles. |
| `switchPlayerModel(model)` | Swap the character model at runtime, preserving current position and rotation. |
| `changeView()` | Toggle between first-person and third-person view. |
| `reset(pos?)` | Reset player to the given position (defaults to `initPos`). |
| `update(dt?)` | Drive physics and animation — call once per frame. |
| `destroy()` | Destroy the controller and release all resources. |
| `setInput(input)` | Inject external input state, useful for custom key bindings or gamepad support. |
| `getPosition()` | Get the player's current world position. |
| `getCenterScreenRaycastHit()` | Get the intersection of the center-screen ray with the scene collider, useful for aim / interaction detection. |
| `getPerson()` | Get the character model `Object3D`. |
| `getActiveVehicle()` | Get the vehicle instance currently being driven. |
| `getAllVehicles()` | Get the array of all loaded vehicle instances. |
| `setMouseSensitivity(v)` | Set mouse sensitivity. |
| `setGravity(v)` | Set gravity (base value — multiplied by scale internally). |
| `setJumpHeight(v)` | Set jump height (base value — multiplied by scale internally). |
| `setPlayerSpeed(v)` | Set movement speed (base value — multiplied by scale internally). |
| `setflySpeed(v)` | Set fly speed (base value — multiplied by scale internally). |
| `setMinCamDistance(v)` | Set minimum third-person camera distance. |
| `setMaxCamDistance(v)` | Set maximum third-person camera distance. |
| `setThirdMouseMode(v)` | Set third-person mouse mode (0–3). |
| `setEnableZoom(v)` | Enable or disable scroll-wheel zoom in third-person. |
| `setOverShoulderView(v)` | Enable or disable over-the-shoulder camera offset. |
| `setPlayerScale(scale)` | Dynamically scale the character, syncing the collider capsule and all physics parameters. |
| `setDebug(v)` | Toggle collider debug wireframe display. |

---

## II. Events

### Global Event Toggle

```ts
export function onAllEvent(): void;  // Enable all input listeners
export function offAllEvent(): void; // Disable all input listeners
```

- `onAllEvent()`: Ensures the controller instance exists and enables input.
- `offAllEvent()`: Disables input — use when showing UI overlays or pausing.

Built-in inputs: WASD movement, sprint, jump, mouse look, etc.

### setInput — External Input

Use `setInput` to take over input, e.g. for custom key mappings or a gamepad:

```ts
player.setInput({
    moveX: 1 | 0 | -1,      // Horizontal: 1 right, -1 left, 0 stop
    moveY: 1 | 0 | -1,      // Forward/back: 1 forward, -1 backward, 0 stop
    lookDeltaX: number,      // Horizontal look delta
    lookDeltaY: number,      // Vertical look delta
    jump: boolean,           // Jump
    shift: boolean,          // Sprint
    toggleView: boolean,     // Toggle first/third person
    toggleFly: boolean,      // Toggle fly mode
    toggleVehicle: boolean,  // Enter / exit vehicle
});
```

---

## III. Configuration

### PlayerControllerOptions

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
    };
    initPos?: THREE.Vector3;
    mouseSensity?: number;
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
|-------|-----:|:--------:|:-------:|-------------|
| `scene` | `THREE.Scene` | Yes | — | three.js scene |
| `camera` | `THREE.PerspectiveCamera` | Yes | — | three.js camera |
| `controls` | `OrbitControls` | Yes | — | External camera controls |
| `playerModel.url` | `string` | Yes | — | Character model path (GLB/GLTF) |
| `playerModel.scale` | `number` | Yes | — | Model scale |
| `playerModel.idleAnim` | `string` | Yes | — | Idle animation name, must match clip name in model |
| `playerModel.walkAnim` | `string` | Yes | — | Walk animation name, must match clip name in model |
| `playerModel.runAnim` | `string` | Yes | — | Run animation name, must match clip name in model |
| `playerModel.jumpAnim` | `string` | Yes | — | Jump animation name, must match clip name in model |
| `playerModel.leftWalkAnim` | `string` | No | `walkAnim` | Strafe-left anim; falls back to `walkAnim` if omitted |
| `playerModel.rightWalkAnim` | `string` | No | `walkAnim` | Strafe-right anim; falls back to `walkAnim` if omitted |
| `playerModel.backwardAnim` | `string` | No | `walkAnim` | Backward anim; falls back to `walkAnim` if omitted |
| `playerModel.flyAnim` | `string` | No | `idleAnim` | Fly anim; falls back to `idleAnim` if omitted |
| `playerModel.flyIdleAnim` | `string` | No | `idleAnim` | Fly-idle anim; falls back to `idleAnim` if omitted |
| `playerModel.enterCarAnim` | `string` | No | — | Enter-vehicle anim (required when using vehicles) |
| `playerModel.exitCarAnim` | `string` | No | — | Exit-vehicle anim (required when using vehicles) |
| `playerModel.rotateY` | `number` | No | `0` | Extra Y-axis rotation offset for the model |
| `playerModel.headObjName` | `string` | No | — | Head node name for first-person camera attachment |
| `playerModel.speed` | `number` | No | `300` | Movement speed base value |
| `playerModel.gravity` | `number` | No | `-2400` | Gravity base value |
| `playerModel.jumpHeight` | `number` | No | `600` | Jump height base value |
| `playerModel.flySpeed` | `number` | No | `2100` | Fly speed base value |
| `playerModel.flyEnabled` | `boolean` | No | `true` | Whether fly mode is available |
| `initPos` | `THREE.Vector3` | No | `(0,0,0)` | Initial position |
| `mouseSensity` | `number` | No | `5` | Mouse sensitivity |
| `minCamDistance` | `number` | No | `100` | Minimum third-person camera distance |
| `maxCamDistance` | `number` | No | `440` | Maximum third-person camera distance |
| `colliderMeshUrl` | `string` | No | — | Custom collider mesh path; defaults to all meshes in the scene |
| `isShowMobileControls` | `boolean` | No | `true` | Auto-show virtual joystick on mobile |
| `thirdMouseMode` | `0\|1\|2\|3` | No | `1` | Mouse mode in third-person (see table below) |
| `enableZoom` | `boolean` | No | `false` | Allow scroll-wheel zoom in third-person |
| `enableOverShoulderView` | `boolean` | No | `false` | Enable over-the-shoulder camera offset |
| `capsuleRadiusRatio` | `number` | No | `1.0` | Radius scale factor of the player's capsule collider. A larger value results in a wider collision range |

**thirdMouseMode values:**

| Value | Behaviour |
|-------|-----------|
| `0` | Pointer locked — mouse controls both rotation and camera orbit |
| `1` | Pointer locked — mouse controls camera orbit only (default) |
| `2` | Pointer visible — drag to control rotation and camera orbit |
| `3` | Pointer visible — drag to control camera orbit only |

---

### VehicleOptions

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
|-------|-----:|:--------:|:-------:|-------------|
| `url` | `string` | Yes | — | Vehicle model path (GLB/GLTF) |
| `position` | `THREE.Vector3` | Yes | — | Initial world position of the vehicle |
| `wheelsNames` | `string[]` | Yes | — | Wheel node names: front-left, front-right, rear-left, rear-right |
| `scale` | `number` | No | `1` | Model scale factor |
| `animations.openDoorAnim` | `string` | No | — | Door-open animation clip name |
| `boardingPoint` | `THREE.Vector3` | Yes | — | Boarding position in vehicle local space |
| `seatOffset` | `THREE.Vector3` | No | `(0,0,0)` | Seat offset in vehicle local space for fine-tuning the seated position |
| `chassisRatio` | `number` | No | `0.2` | Chassis height relative to wheel diameter (affects model vertical position) |
| `suspensionRestLengthRatio` | `number` | No | `0.2` | Suspension rest length relative to wheel diameter (affects physics chassis height) |
| `followVehicleDirection` | `boolean` | No | `true` | Whether the camera auto-rotates behind the vehicle when driving |
| `speedMultiplier` | `number` | No | `1` | Speed multiplier for tuning speed differences between vehicles |

---

# Credits

[three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh)

[three](https://github.com/mrdoob/three.js)

[npm]: https://img.shields.io/npm/v/three-player-controller
[npm-url]: https://www.npmjs.com/package/three-player-controller
