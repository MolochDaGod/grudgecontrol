# Grudge Control

[![Live demo](https://img.shields.io/badge/live-grudgecontrol.vercel.app-e8a020)](https://grudgecontrol.vercel.app)
[![GitHub](https://img.shields.io/badge/github-MolochDaGod%2Fgrudgecontrol-181717?logo=github)](https://github.com/MolochDaGod/grudgecontrol)

Grudge Studio's Three.js character-controller **lab**. Capsule collision (three-mesh-bvh), walk / run / jump / fly, first- and third-person camera with obstacle avoidance, optional Rapier vehicles, and showcase scenes (grudge6 races, glTF, 3D Tiles, 3DGS, combat, FPS, Firebase multiplayer).

This repository is a **lab**, not the production Open / Warlords / GRUDOX play controller. Harvest patterns from it (pose sync, camera distances, vehicle enter/exit, one mixer). Do **not** replace fleet `Controller.ts` or `loadRaceKit` with this `playerController`.

Live: **https://grudgecontrol.vercel.app**

Forked from [hh-hang/three-player-controller](https://github.com/hh-hang/three-player-controller) (MIT). Docs, UI, scripts, and comments in this repo are English-only.

---

## Live demos

| Scene | URL |
| --- | --- |
| Hub | https://grudgecontrol.vercel.app/ |
| Grudge6 races (CDN kits) | https://grudgecontrol.vercel.app/grudge6.html |
| Combat showcase | https://grudgecontrol.vercel.app/combat/combat.html |
| glTF (walk / fly / vehicle) | https://grudgecontrol.vercel.app/glTF.html |
| 3D Tiles | https://grudgecontrol.vercel.app/3dtilesScene.html |
| 3D Gaussian splats | https://grudgecontrol.vercel.app/3dgs.html |
| Multiplayer glTF (Firebase lab) | https://grudgecontrol.vercel.app/multiplayer-gltf.html |
| Multiplayer 3DGS (Firebase lab) | https://grudgecontrol.vercel.app/multiplayer-3dgs.html |
| FPS | https://grudgecontrol.vercel.app/shooting/shooting.html |
| Office building | https://grudgecontrol.vercel.app/OfficeBuilding.html |
| ShinChan | https://grudgecontrol.vercel.app/ShinChan.html |

GitHub Pages (same Vite example build, `/grudgecontrol/` base): https://molochdagod.github.io/grudgecontrol/

---

## Lab vs fleet

| This lab | Fleet production |
| --- | --- |
| `playerController` + one `AnimationMixer` | Open / Warlords: `Controller.ts` + `loadRaceKit` |
| Mixamo `person*.glb` at `scale: 0.001` in several demos | Toon RTS `{race}.glb`, SI 1.8 m human |
| Firebase RTDB rooms (`#room`) | Railway rooms + GRUDOX Worker WebSocket |
| Rapier only for vehicles | `@dimforge/rapier3d-compat` world + `@workspace/grudge-physics` |
| OrbitControls handed to the lab camera | Combat TPS must not let OrbitControls write the camera |

Adopt: client sends pose (x, y, z, yaw, clip); spawn pads in metres; `minCamDistance` / `maxCamDistance`; GLTFLoader + DRACO + KTX2 on one loader.

---

## Install

```bash
npm install
```

Peer dependencies for the library:

```bash
npm install three three-mesh-bvh
# optional — vehicles
npm install @dimforge/rapier3d-compat
```

Package name on disk: `grudge-control` (`package.json`). Import from source in this repo:

```ts
import { playerController } from "./src/playerController";
```

---

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite example server. Open `http://localhost:5173/grudgecontrol/` |
| `npm run build` | tsup library build → `dist/` (CJS + ESM + types) |
| `npm run build:example` | Vite static example build. Local / GitHub Pages → `docs/` with base `/grudgecontrol/`. Vercel (`VERCEL=1`) → `dist/` with base `/` |
| `npm run clean` | Remove `dist/` |

`prepare` runs `npm run build` on `npm ci` so the library exists before the example bundle.

---

## Deploy

Two existing hosts — no new stack.

**Vercel** (`grudgecontrol.vercel.app`)

- `vercel.json`: `buildCommand` = `npm run build:example`, `outputDirectory` = `dist`
- `vite.config.ts` uses `base: "/"` and `outDir: dist` when `VERCEL=1`
- GitHub repo `MolochDaGod/grudgecontrol` is linked to Vercel project `grudgecontrol`

**GitHub Pages** (`.github/workflows/deploy.yml`)

- On push to `master`: `npm ci` → `npm run build:example` → upload `docs/` → `actions/deploy-pages`
- Without `VERCEL=1`, Vite writes `docs/` with base `/grudgecontrol/`

Fleet rewrites in `vercel.json` (`/ai`, `/api`, `/assets`, `/Models`) proxy Grudge Studio hosts. They do not make this lab the production game.

---

## Run locally

```bash
git clone https://github.com/MolochDaGod/grudgecontrol.git
cd grudgecontrol
npm install
npm run dev
```

Open `http://localhost:5173/grudgecontrol/`.

---

## Usage

```ts
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { playerController } from "./src/playerController";

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);

const player = new playerController();

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
        jumpAnim: "jump", // or ["start", "loop", "land"] for a three-phase jump
    },
    initPos: new THREE.Vector3(0, 0, 0),
});

await player.loadVehicleModel({
    url: "./glb/bugatti.glb",
    position: new THREE.Vector3(0, 0, 0),
    wheelsNames: ["Wheel_LF", "Wheel_RF", "Wheel_LR", "Wheel_RR"],
    boardingPoint: new THREE.Vector3(0.5, 0, 1.8),
});

function animate() {
    requestAnimationFrame(animate);
    player.update();
    renderer.render(scene, camera);
}
animate();
```

`player.update()` already drives the camera controller you passed in. Do not call `controls.update()` again in the render loop.

Lab Mixamo assets often use `scale: 0.001`. Grudge6 CDN kits in `example/grudge6.js` use production SI scale — do not copy `0.001` into Open / Warlords play.

### `init()` options

```ts
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

        leftWalkAnim: "leftWalk",
        rightWalkAnim: "rightWalk",
        backwardAnim: "walkBack",
        flyAnim: "fly",
        flyIdleAnim: "flyIdle",
        flyHoverForwardAnim: "flyFwd",
        flyHoverBackAnim: "flyBack",
        flyHoverLeftAnim: "flyLeft",
        flyHoverRightAnim: "flyRight",
        flyHoverUpAnim: "flyUp",
        flyHoverDownAnim: "flyDown",
        enterCarAnim: "enterCar",
        exitCarAnim: "exitCar",

        gravity: -2400,
        jumpHeight: 600,
        speed: 300,
        flySpeed: 2100,
        acceleration: 30,
        deceleration: 30,

        rotateY: 0,
        headBoneName: "Head",
        firstPersonCameraOffset: [0, 40, 30],
        capsuleRadiusRatio: 1,
    },

    initPos: new THREE.Vector3(0, 0, 0),
    staticCollider: mesh,
    dynamicCollider: platform,

    minCamDistance: 100,
    maxCamDistance: 440,
    camLookAtHeightRatio: 0.8,
    thirdMouseMode: 1,
    enableZoom: false,
    enableOverShoulderView: false,
    isFirstPerson: false,
    enableSpringCamera: false,
    springCameraTime: 0.05,

    mouseSensitivity: 5,
    timeScale: 1,
    keyMap: {
        forward: ["KeyW", "ArrowUp"],
        backward: ["KeyS", "ArrowDown"],
        left: ["KeyA", "ArrowLeft"],
        right: ["KeyD", "ArrowRight"],
        sprint: ["ShiftLeft", "ShiftRight"],
        jump: ["Space"],
        toggleView: ["KeyV"],
        toggleFly: ["KeyF"],
        toggleVehicle: ["KeyE"],
    },
    isShowMobileControls: true,
    mobileControls: {
        joystick: true,
        jump: true,
        fly: true,
        view: true,
        vehicle: true,
    },
});
```

### `loadVehicleModel()`

```ts
await player.loadVehicleModel({
    url: "./glb/bugatti.glb",
    position: new THREE.Vector3(0, 0, 0),
    wheelsNames: ["Wheel_LF", "Wheel_RF", "Wheel_LR", "Wheel_RR"],
    boardingPoint: new THREE.Vector3(0.5, 0, 1.8),
    scale: 0.1,
    animations: { openDoorAnim: "openDoorLF" },
    seatOffset: new THREE.Vector3(0, 0.6, 0),
    chassisRatio: 0.15,
    suspensionRestLengthRatio: 0.2,
    followVehicleDirection: true,
    speedMultiplier: 1,
});
```

---

## API

### Lifecycle

| Method | Description |
| --- | --- |
| `init(opts, callback?)` | Initialize the controller. `callback` runs after loading completes. |
| `update(dt?)` | Update movement, collision, and animation each frame. Drives the camera controller you passed in. |
| `destroy()` | Dispose the controller and remove listeners. |
| `reset(pos?)` | Reset the character to `pos` or the initial position. |
| `switchPlayerModel(model)` | Swap the current player model while preserving position and facing. |
| `loadVehicleModel(opts)` | Load a vehicle. Call more than once for multiple vehicles. |
| `changeView()` | Toggle first-person / third-person. |
| `setFirstPersonCamera(vertAngle?)` | Switch directly to first-person with an optional initial vertical angle. |
| `buildStaticCollider(sources?)` | Build the static collider. If omitted, traverses the whole scene. |
| `addDynamicCollider(source)` | Register a dynamic collider (for example a moving platform). |
| `removeDynamicCollider(source)` | Unregister a previously added dynamic collider. |
| `clearDynamicColliders()` | Remove all dynamic colliders. |

### State getters

| Method | Return |
| --- | --- |
| `getPosition()` | Current player position. |
| `getVelocity()` | Current player velocity as `THREE.Vector3`. |
| `getIsFirstPerson()` | Whether first-person mode is active. |
| `getIsFlying()` | Whether flight mode is active. |
| `getIsOnGround()` | Whether the player is grounded. |
| `getControllerMode()` | `0` player, `1` vehicle. |
| `getPlayerModel()` | Loaded player model. |
| `getPlayerCapsule()` | Player capsule mesh. |
| `getActiveVehicle()` | Current vehicle instance, if any. |
| `getAllVehicles()` | All loaded vehicle instances. |
| `getCollider()` | Merged collider mesh used for BVH checks. |
| `getCurrentPlayerAnimationName()` | Current animation clip name, or `null`. |
| `getCenterScreenRaycastHit()` | Center-screen raycast result (aim / interact). |
| `getActiveDynamicCollider()` | Dynamic collider the player is standing on, or `null`. |
| `getCurrentLocomotionSet()` | Name of the active locomotion set. |

### Input and runtime controls

| Method | Description |
| --- | --- |
| `setInput(input)` | Feed custom input (gamepad or your own map). |
| `setKeyMap(map?)` | Rebind keys at runtime; omit the argument to restore defaults. |
| `setMouseSensitivity(v)` | Set mouse sensitivity. |
| `setPlayerScale(v)` | Rescale the player and update collider-related values. |
| `setPlayerSpeed(v)` | Set move speed. |
| `setPlayerFlySpeed(v)` | Set fly speed. |
| `setJumpHeight(v)` | Set jump height. |
| `setGravity(v)` | Set gravity. |
| `setMinCamDistance(v)` | Minimum third-person camera distance. |
| `setMaxCamDistance(v)` | Maximum third-person camera distance. |
| `setCamLookAtHeightRatio(v)` | Third-person look-at height ratio (0 = bottom, 1 = top). |
| `setThirdMouseMode(v)` | Third-person mouse mode `0`–`5`. |
| `setEnableZoom(v)` | Enable or disable camera zoom. |
| `setOverShoulderView(v)` | Over-shoulder view offset. |
| `setDebug(v)` | Collider debug display. |
| `setEnableToward(v)` | Mouse-driven facing / look updates. |

Keyboard and mouse listeners start after `init()`. Temporarily disable them with:

```ts
player.offAllEvent();
player.onAllEvent();
```

### Default keyboard controls

| Action | Default key | Function |
| --- | --- | --- |
| `forward` | `W` / `ArrowUp` | Move forward |
| `backward` | `S` / `ArrowDown` | Move backward |
| `left` | `A` / `ArrowLeft` | Move left |
| `right` | `D` / `ArrowRight` | Move right |
| `sprint` | `Shift` | Sprint |
| `jump` | `Space` | Jump |
| `toggleView` | `V` | Toggle view |
| `toggleFly` | `F` | Toggle flight |
| `toggleVehicle` | `E` | Enter / exit vehicle |
| — | Mouse move | Look / rotate camera |

Combat showcase also uses pointer-lock: LMB melee, RMB aim/fire, MMB knockback, Tab cycle target, double-tap dodge.

### Custom key mapping

Key names use [`KeyboardEvent.code`](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/code) (`"KeyE"`, `"ArrowUp"`, `"Space"` — not `"e"`).

- **Omitted** → default key(s)
- **String / string array** → replace with the given key(s)
- **`null`** → disable the action

```ts
await player.init({
    // ...
    keyMap: {
        forward: "KeyE",
        jump: null,
        left: ["KeyA", "KeyJ"],
    },
});

player.setKeyMap({ forward: "KeyI", backward: "KeyK" });
player.setKeyMap();
```

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

### Animation

| Method | Description |
| --- | --- |
| `playPlayerAnimationByName(name, fade?)` | Play a clip by name. |
| `registerAnimation(key, clipName, opts?)` | Register a custom clip. |
| `playAnimation(key, opts?)` | Play a registered custom animation. |
| `registerLocomotionSet(setName, map)` | Replace built-in locomotion clips. |
| `switchLocomotionSet(setName, fade?)` | Switch to a registered locomotion set. |

```ts
player.registerAnimation(key, clipName, {
    loop?: boolean,
    timeScale?: number,
    duration?: number,
    clampWhenFinished?: boolean,
    onFinished?: () => void,
});

player.playAnimation(key, {
    fade?: number,
    force?: boolean,
    returnToPrev?: boolean,
});

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

Supported locomotion keys: `idle` | `walking` | `walking_backward` | `running` | `jumping` | `flyidle` | `flying`.

### Events

```ts
player.onAnimationChange = (name, action) => {};
player.onBeforeViewChange = (isFirstPerson) => {};
player.onViewChange = (isFirstPerson) => {};
player.onGroundChange = (onGround) => {};
player.onVehicleEnter = (vehicle) => {};
player.onVehicleExit = (vehicle) => {};
player.onTowardChange = (dx, dy, speed) => {};
```

---

## Field reference

### `PlayerControllerOptions`

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `scene` | `THREE.Scene` | Yes | — | three.js scene. |
| `camera` | `THREE.PerspectiveCamera` | Yes | — | three.js camera. |
| `controls` | `any` | Yes | — | External camera controller, typically `OrbitControls`. |
| `playerModelConfig` | `PlayerModelOptions` | Yes | — | Player model and movement config. |
| `initPos` | `THREE.Vector3` | No | `(0, 0, 0)` | Spawn position. |
| `mouseSensitivity` | `number` | No | `5` | Mouse sensitivity. |
| `minCamDistance` | `number` | No | `100` | Minimum third-person distance. |
| `maxCamDistance` | `number` | No | `440` | Maximum third-person distance. |
| `staticCollider` | `THREE.Object3D \| THREE.Object3D[]` | No | — | Static collider source(s); otherwise the whole scene. |
| `dynamicCollider` | `THREE.Object3D \| THREE.Object3D[]` | No | — | Dynamic colliders registered at init. |
| `isShowMobileControls` | `boolean` | No | `true` | Virtual controls on mobile. |
| `mobileControls` | `MobileControlsOptions` | No | all shown | Mobile button visibility. |
| `thirdMouseMode` | `0 \| 1 \| 2 \| 3 \| 4 \| 5` | No | `1` | 0 hide cursor, facing + camera; 1 hide cursor, camera only; 2 show cursor, drag facing + camera; 3 show cursor, drag camera only; 4 show cursor, drag camera, character yaw follows camera; 5 hide cursor, camera, character yaw follows camera. |
| `enableZoom` | `boolean` | No | `false` | Wheel zoom. |
| `enableOverShoulderView` | `boolean` | No | `false` | Over-shoulder offset. |
| `isFirstPerson` | `boolean` | No | `false` | Start in first-person. |
| `enableSpringCamera` | `boolean` | No | `false` | Spring-damper follow. |
| `springCameraTime` | `number` | No | `0.05` | Spring time in seconds; lower is tighter. |
| `camLookAtHeightRatio` | `number` | No | `0.8` | Look-at height (0 = capsule bottom, 1 = top). |
| `timeScale` | `number` | No | `1` | Time scale; `< 1` slow motion, `> 1` fast forward. |
| `keyMap` | `KeyMap` | No | defaults | Custom key bindings. |

### `PlayerModelOptions`

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `url` | `string` | Yes | — | Player model path (GLB/GLTF). |
| `scale` | `number` | Yes | — | Player model scale. |
| `idleAnim` | `string` | Yes | — | Idle clip. |
| `walkAnim` | `string` | Yes | — | Walk clip. |
| `runAnim` | `string` | Yes | — | Run clip. |
| `jumpAnim` | `string \| [string, string, string]` | Yes | — | Jump clip, or `[start, loop, land]`. |
| `leftWalkAnim` | `string` | No | `walkAnim` | Left strafe. |
| `rightWalkAnim` | `string` | No | `walkAnim` | Right strafe. |
| `backwardAnim` | `string` | No | `walkAnim` | Backward walk. |
| `flyAnim` | `string` | No | `idleAnim` | Flying. |
| `flyIdleAnim` | `string` | No | `idleAnim` | Fly idle. |
| `enterCarAnim` | `string` | No | — | Enter-vehicle clip (needed for vehicles). |
| `exitCarAnim` | `string` | No | — | Exit-vehicle clip (needed for vehicles). |
| `gravity` | `number` | No | `-2400` | Gravity base (scaled by `scale`). |
| `jumpHeight` | `number` | No | `600` | Jump height base (scaled by `scale`). |
| `speed` | `number` | No | `300` | Move speed base (scaled by `scale`). |
| `flySpeed` | `number` | No | `2100` | Fly speed base (scaled by `scale`). |
| `rotateY` | `number` | No | `0` | Initial facing in radians. |
| `headBoneName` | `string` | No | — | Head bone for first-person attach. |
| `firstPersonCameraOffset` | `[number, number, number]` | No | built-in | Local first-person offset. |
| `capsuleRadiusRatio` | `number` | No | `1` | Capsule radius multiplier. |
| `acceleration` | `number` | No | `30` | XZ acceleration response. |
| `deceleration` | `number` | No | `30` | XZ deceleration response. |

### `VehicleOptions`

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `url` | `string` | Yes | — | Vehicle model path. |
| `position` | `THREE.Vector3` | Yes | — | World position. |
| `wheelsNames` | `string[]` | Yes | — | Wheel node names: front-left, front-right, rear-left, rear-right. |
| `boardingPoint` | `THREE.Vector3` | Yes | — | Boarding point in local space. |
| `scale` | `number` | No | `1` | Vehicle scale. |
| `animations.openDoorAnim` | `string` | No | — | Door clip. |
| `seatOffset` | `THREE.Vector3` | No | `(0, 0, 0)` | Seat offset after enter. |
| `chassisRatio` | `number` | No | `0.2` | Chassis height ratio. |
| `suspensionRestLengthRatio` | `number` | No | `0.2` | Suspension rest length ratio. |
| `followVehicleDirection` | `boolean` | No | `true` | Camera follows vehicle yaw while driving. |
| `speedMultiplier` | `number` | No | `1` | Per-vehicle speed multiplier. |

---

## Layout

```
src/                 library (playerController + systems)
example/             Vite demos (hub, grudge6, combat, glTF, tiles, 3DGS, FPS, MP)
.github/workflows/   GitHub Pages deploy
vercel.json          Vercel static deploy + fleet rewrites
vite.config.ts       example bundler (Vercel vs Pages outDir / base)
```

---

## Issues

https://github.com/MolochDaGod/grudgecontrol/issues

---

## Credits

- [hh-hang/three-player-controller](https://github.com/hh-hang/three-player-controller) — original controller (MIT)
- [three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh)
- [three.js](https://github.com/mrdoob/three.js)
- Grudge Studio — grudge6 CDN kits, combat/target systems, Vercel + Pages hosting
