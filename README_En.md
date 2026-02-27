[中文](README.md)

# three-player-controller

[![NPM Package][npm]][npm-url]

A lightweight third-person / first-person player controller, ready to use out of the box. Implemented with **three.js** and **three-mesh-bvh**. Features capsule-based character collision, BVH collision detection, character animations, first/third-person switching, and camera obstacle avoidance.

## Demos

- GLB scene: https://hh-hang.github.io/three-player-controller/index.html
- 3D Tiles scene: https://hh-hang.github.io/three-player-controller/3dtilesScene.html
- 3D Tiles customized: https://hh-hang.github.io/three-player-controller/3dtilesCustomize.html

### Normal control demo

![Normal control demo](https://github.com/hh-hang/three-player-controller/blob/master/example/public/gif/1.gif)

### Flying control demo

![Flying control demo](https://github.com/hh-hang/three-player-controller/blob/master/example/public/gif/4.gif)

### Vehicle control demo

![Vehicle control demo](https://github.com/hh-hang/three-player-controller/blob/master/example/public/gif/6.gif)

### Mobile control demo

![Mobile control demo](https://github.com/hh-hang/three-player-controller/blob/master/example/public/gif/5.gif)

## Installation

```bash
npm install three-player-controller
```

## Run Examples Locally

```bash
# Clone the repository
git clone https://github.com/hh-hang/three-player-controller.git

# Install dependencies
npm install

# Start the development server
npm run dev
```

Then open your browser and visit `http://localhost:5173/three-player-controller/` to view the examples.

## Usage

```js
import * as THREE from "three";
import { playerController } from "three-player-controller";

const player = playerController();

// Initialize the player controller
player.init({
    scene, // three.js Scene
    camera, // three.js Camera
    controls, // OrbitControls (or other external camera controller)
    playerModel: {
        url: "./glb/person.glb", // model URL (GLB/GLTF)
        scale: 0.001, // model scale
        idleAnim: "Idle_2", // default idle animation name
        walkAnim: "Walking_11", // default walk animation name
        runAnim: "Running_9", // default run animation name
        jumpAnim: "Jump_3", // default jump animation name
    },
    initPos: pos, // initial position (THREE.Vector3)
});

// Call every frame
player.update();
```

## API

### Exported function

```ts
export function playerController(): {
    init: (opts: PlayerControllerOptions, callback?: () => void) => void;
    loadVehicleModel: (params: vehicleOptions) => void;
    changeView: () => void;
    reset: (pos?: THREE.Vector3) => void;
    update: (dt?: number) => void;
    destroy: () => void;
    getposition: () => THREE.Vector3;
    getPerson: () => THREE.Object3D | null;
    getActiveVehicle: () => VehicleInstance | null;
    getAllVehicles: () => VehicleInstance[];
};
```

### Methods

- `init(opts, callback?)` — Initialize the controller. `callback` is called after resources finish loading.
- `loadVehicleModel(params?)` — Initialize a vehicle model.
- `changeView()` — Toggle between first-person and third-person view.
- `reset(pos?)` — Reset the player to the specified position.
- `update(dt?)` — Call every frame to update the controller.
- `destroy()` — Destroy the controller and clean up resources.
- `getposition()` — Get the player world position.
- `getPerson()` — Get the player model object.
- `getActiveVehicle()` — Get the currently active vehicle instance.
- `getAllVehicles()` — Get all vehicle instances.

---

## Events

### Global event toggle

```ts
export function onAllEvent(): void; // enable all input events
export function offAllEvent(): void; // disable all input events
```

### Description

- `onAllEvent()` — Ensure the controller exists and enable input listeners.
- `offAllEvent()` — Disable input listeners (useful when showing UI or pausing to block player input).

Default handled inputs include: WASD movement, run, jump, mouse look, etc.

---

## Configuration and Types

### PlayerControllerOptions

```ts
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
    };
    initPos?: THREE.Vector3;
    mouseSensity?: number;
    minCamDistance?: number;
    maxCamDistance?: number;
    colliderMeshUrl?: string;
    isShowMobileControls?: boolean;
    thirdMouseMode?: number;
    enableZoom?: boolean;
};
```

### Key fields

| Field                                                        |                      Type | Default / Notes                                                                                                                                                     |
| ------------------------------------------------------------ | ------------------------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scene`                                                      |             `THREE.Scene` | Required                                                                                                                                                            |
| `camera`                                                     | `THREE.PerspectiveCamera` | Required                                                                                                                                                            |
| `controls`                                                   |           `OrbitControls` | Required (external camera controller)                                                                                                                               |
| `playerModel.url`                                            |                  `string` | Model URL (GLB/GLTF), required                                                                                                                                      |
| `playerModel.scale`                                          |                  `number` | Required                                                                                                                                                            |
| `playerModel.idleAnim` / `walkAnim` / `runAnim` / `jumpAnim` |                  `string` | Animation names in the model, required                                                                                                                              |
| `playerModel.enterCarAnim` / `exitCarAnim`                   |                  `string` | Optional (enter/exit vehicle animations)                                                                                                                            |
| `playerModel.rotateY`                                        |                  `number` | Optional, extra Y-axis rotation offset                                                                                                                              |
| `playerModel.headObjName`                                    |                  `string` | Optional, head object name for camera binding                                                                                                                       |
| `playerModel.speed`                                          |                  `number` | Base speed, default `400`                                                                                                                                           |
| `playerModel.gravity`                                        |                  `number` | Gravity acceleration, default `-2400`                                                                                                                               |
| `playerModel.jumpHeight`                                     |                  `number` | Jump height, default `800`                                                                                                                                          |
| `initPos`                                                    |           `THREE.Vector3` | Initial position, default `(0,0,0)`                                                                                                                                 |
| `mouseSensity`                                               |                  `number` | Mouse sensitivity, default `5`                                                                                                                                      |
| `minCamDistance` / `maxCamDistance`                          |                  `number` | Third-person camera distance limits, default `100` / `440`                                                                                                          |
| `colliderMeshUrl`                                            |                  `string` | Custom collider mesh URL, default `""`                                                                                                                              |
| `isShowMobileControls`                                       |                 `boolean` | Show mobile controls by default on mobile, default `true`                                                                                                           |
| `thirdMouseMode`                                             |            `[0, 1, 2, 3]` | Third-person mouse modes, default `1` (0: hide mouse control, 1: hide mouse but control view, 2: show mouse for drag control, 3: show mouse drag only control view) |
| `enableZoom`                                                 |                 `boolean` | Allow zoom in third-person, default `false`                                                                                                                         |

---

### Vehicle options

```ts
type vehicleOptions = {
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
```

### Vehicle fields

| Field                       |            Type | Required |                    Default | Description                                                                                             |
| --------------------------- | --------------: | :------: | -------------------------: | ------------------------------------------------------------------------------------------------------- |
| `url`                       |        `string` |   yes    |                          — | Vehicle model URL (GLB/GLTF). CORS applies.                                                             |
| `position`                  | `THREE.Vector3` |   yes    |                          — | Initial vehicle world position (e.g. `new THREE.Vector3(10,0,5)`).                                      |
| `wheelsNames`               |      `string[]` |   yes    |                          — | Wheel node names in model: front-left, front-right, rear-left, rear-right.                              |
| `scale`                     |        `number` |    no    |                        `1` | Model scale factor.                                                                                     |
| `animations.openDoorAnim`   |        `string` |    no    |                          — | Open door animation clip name.                                                                          |
| `boardingPoint`             | `THREE.Vector3` |   yes    |                          — | Boarding point **local coordinate** relative to the vehicle model, e.g. `new THREE.Vector3(0.8,1.0,0)`. |
| `seatOffset`                | `THREE.Vector3` |    no    | `new THREE.Vector3(0,0,0)` | Offset from `boardingPoint` to the player's seat position (local coordinates).                          |
| `chassisRatio`              |        `number` |    no    |                      `0.2` | Estimated chassis height ratio relative to wheel diameter (used to adjust model placement).             |
| `suspensionRestLengthRatio` |        `number` |    no    |                      `0.2` | Ratio affecting actual chassis collision height (different from `chassisRatio`).                        |

---

## Acknowledgements

- [three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh)
- [three](https://github.com/mrdoob/three.js)

[npm]: https://img.shields.io/npm/v/three-player-controller
[npm-url]: https://www.npmjs.com/package/three-player-controller
