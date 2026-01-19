[中文](README.md)

# three-player-controller

A lightweight third-person / first-person player controller — ready to use out of the box. Built on three.js and three-mesh-bvh, it provides capsule-based character collision, BVH collision detection, character animations, first/third-person switching, and camera obstacle avoidance.

## Installation

```bash
npm install three-player-controller
```

## Demo

- GLB scene: [https://hh-hang.github.io/three-player-controller/index.html](https://hh-hang.github.io/three-player-controller/index.html)
- 3DTiles scene: [https://hh-hang.github.io/three-player-controller/3dtilesScene.html](https://hh-hang.github.io/three-player-controller/3dtilesScene.html)

## Controls

![controls demo](https://github.com/hh-hang/three-player-controller/blob/master/example/public/gif/1.gif)

## Flight

![flight demo](https://github.com/hh-hang/three-player-controller/blob/master/example/public/gif/3.gif)

## 3DTiles Roaming

![3DTiles roaming demo](https://github.com/hh-hang/three-player-controller/blob/master/example/public/gif/4.gif)

## Usage

```js
import * as THREE from "three";
import { playerController } from "three-player-controller";

const player = playerController();

// Initialize the player controller
player.init({
  scene, // three.js Scene
  camera, // three.js PerspectiveCamera
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

// Call this in the render loop
player.update();
```

## API

### Exported function

```ts
export function playerController(): {
  init: (opts: PlayerControllerOptions, callback?: () => void) => void;
  changeView: () => void;
  reset: (pos?: THREE.Vector3) => void;
  update: (dt?: number) => void;
  destroy: () => void;
};
```

### Methods

- `init(opts, callback?)` — Initialize the controller. `callback` is called after resources finish loading.
- `changeView()` — Toggle between first-person and third-person views.
- `reset(pos?)` — Reset the player to the specified position.
- `update(dt?)` — Call every frame (optionally supply delta time).
- `destroy()` — Destroy the controller and release resources.

---

## Events

### Global event toggles

```ts
export function onAllEvent(): void; // enable all input events
export function offAllEvent(): void; // disable all input events
```

### Description

- `onAllEvent()` ensures the controller exists and enables input listeners.
- `offAllEvent()` disables input listeners (useful for UI overlays or pausing gameplay).

Default input handling includes WASD movement, run, jump, and mouse look.

---

## Configuration and Options

### Type definition

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
};
```

### Key fields and defaults

| Field                                                        |                      Type | Default / Notes                                                                                                                                                                                                                    |
| ------------------------------------------------------------ | ------------------------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scene`                                                      |             `THREE.Scene` | Required — three.js scene                                                                                                                                                                                                          |
| `camera`                                                     | `THREE.PerspectiveCamera` | Required — three.js camera                                                                                                                                                                                                         |
| `controls`                                                   |           `OrbitControls` | Required — external camera controller                                                                                                                                                                                              |
| `playerModel.url`                                            |                  `string` | Required — path to the GLB/GLTF model                                                                                                                                                                                              |
| `playerModel.scale`                                          |                  `number` | Required — model scale                                                                                                                                                                                                             |
| `playerModel.idleAnim` / `walkAnim` / `runAnim` / `jumpAnim` |                  `string` | Required — animation names must match the model's animation clips                                                                                                                                                                  |
| `playerModel.speed`                                          |                  `number` | Default `400` — base movement speed                                                                                                                                                                                                |
| `playerModel.gravity`                                        |                  `number` | Default `-2400` — gravity acceleration                                                                                                                                                                                             |
| `playerModel.jumpHeight`                                     |                  `number` | Default `800` — jump height                                                                                                                                                                                                        |
| `initPos`                                                    |           `THREE.Vector3` | Default `(0, 0, 0)` — initial player position                                                                                                                                                                                      |
| `mouseSensity`                                               |                  `number` | Default `5` — mouse sensitivity                                                                                                                                                                                                    |
| `minCamDistance` / `maxCamDistance`                          |                  `number` | Default `100` / `440` — third-person camera distance limits                                                                                                                                                                        |
| `colliderMeshUrl`                                            |                  `string` | Default `""` — optional custom collider mesh URL                                                                                                                                                                                   |
| `isShowMobileControls`                                       |                 `boolean` | Default `true` — show mobile controls when running on mobile                                                                                                                                                                       |
| `thirdMouseMode`                                             |               `[0,1,2,3]` | Default `1` — modes for mouse behavior in third-person view (0: hide mouse control, 1: hide mouse cursor and control only camera, 2: show mouse and drag controls orientation+camera, 3: show mouse and drag controls camera only) |

---

## Credits

- [three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh)
- [three.js](https://github.com/mrdoob/three.js)
