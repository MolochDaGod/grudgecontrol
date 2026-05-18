中文 | [English](README_En.md)

# three-player-controller

[![NPM Package][npm]][npm-url]

轻量的第三人称 / 第一人称玩家控制器，开箱即用，基于 three.js 和 three-mesh-bvh 实现人物胶囊体碰撞、BVH 碰撞检测、人物动画、第一/三人称切换与相机避障，利用 three-mesh-bvh 优化碰撞检测性能，大场景下高性能运行。

# 示例

[![在线示例](https://github.com/hh-hang/three-player-controller/blob/master/example/public/img/readme/preview.gif)](https://hh-hang.github.io/three-player-controller/index.html)

### 普通控制

![普通控制演示](https://github.com/hh-hang/three-player-controller/blob/master/example/public/img/readme/standard.gif)

### 飞行控制

![飞行控制演示](https://github.com/hh-hang/three-player-controller/blob/master/example/public/img/readme/flight.gif)

### 车辆控制

![车辆控制演示](https://github.com/hh-hang/three-player-controller/blob/master/example/public/img/readme/vehicle.gif)

### 移动端控制

![移动端控制演示](https://github.com/hh-hang/three-player-controller/blob/master/example/public/img/readme/mobile.gif)

# 安装

```bash
npm install three-player-controller three three-mesh-bvh
```

## 可选依赖

如果需要车辆功能，请额外安装 Rapier：

```bash
npm install @dimforge/rapier3d-compat
```

# 本地运行

```bash
git clone https://github.com/hh-hang/three-player-controller.git
npm install
npm run dev
```

浏览器访问 `http://localhost:5173/three-player-controller/`。

# 使用

```ts
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { playerController } from "three-player-controller";

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 5000);
const controls = new OrbitControls(camera, renderer.domElement);

const player = new playerController();

// 人物控制初始化
await player.init({
    scene, // three.js 场景实例
    camera, // three.js 相机实例
    controls, // 外部相机控制器
    playerModelConfig: {
        url: "./glb/person.glb", // 人物模型路径
        scale: 0.001, // 人物模型缩放
        idleAnim: "idle", // 静止动画名，需与模型内动画名一致
        walkAnim: "walk", // 走路动画名，需与模型内动画名一致
        runAnim: "run", // 奔跑动画名，需与模型内动画名一致
        jumpAnim: "jump", // 跳跃动画名，需与模型内动画名一致
    },
    initPos: new THREE.Vector3(0, 0, 0), // 人物初始坐标
});

// 车辆控制初始化（可选）
await player.loadVehicleModel({
    url: "./glb/bugatti.glb", // 车辆模型路径
    position: new THREE.Vector3(22, 3.69, 14.5), // 车辆初始坐标
    wheelsNames: ["Wheel_LF", "Wheel_RF", "Wheel_LR", "Wheel_RR"], // 车轮节点名数组，顺序为左前、右前、左后、右后
    scale: 0.1, // 车辆模型缩放
    animations: {
        openDoorAnim: "openDoorLF", // 车门开关动画名
    },
    boardingPoint: new THREE.Vector3(0.5, 0, 1.8), // 上车点，局部坐标
    seatOffset: new THREE.Vector3(0, 0.6, 0), // 角色上车后座位偏移
    chassisRatio: 0.15, // 底盘高度比例
    suspensionRestLengthRatio: 0.2, // 悬挂静止长度比例
});

function animate() {
    requestAnimationFrame(animate);
    player.update();
    renderer.render(scene, camera);
}

animate();
```

# API

## 生命周期

| 方法 | 说明 |
| --- | --- |
| `init(opts, callback?)` | 初始化控制器，资源加载完成后执行 `callback`。 |
| `update(dt?)` | 每帧更新移动、碰撞和动画。 |
| `destroy()` | 销毁控制器并移除事件监听。 |
| `reset(pos?)` | 将角色重置到指定位置或初始位置。 |
| `switchPlayerModel(model)` | 运行时切换角色模型，并保留当前位置和朝向。 |
| `loadVehicleModel(opts)` | 加载车辆，可重复调用加载多辆车。 |
| `changeView()` | 切换第一 / 第三人称视角。 |
| `setFirstPersonCamera(vertAngle?)` | 直接进入第一人称，可指定初始垂直角度。 |
| `buildStaticCollider(sources?)` | 构建静态碰撞体；不传则遍历整个场景。 |
| `addDynamicCollider(source)` | 注册动态碰撞体（如可移动平台）。 |
| `removeDynamicCollider(source)` | 移除已注册的动态碰撞体。 |
| `clearDynamicColliders()` | 移除所有动态碰撞体。 |

## 状态获取

| 方法 | 返回内容 |
| --- | --- |
| `getPosition()` | 当前角色位置。 |
| `getVelocity()` | 当前角色速度，类型为 `THREE.Vector3`。 |
| `getIsFirstPerson()` | 当前是否为第一人称。 |
| `getIsFlying()` | 当前是否处于飞行模式。 |
| `getIsOnGround()` | 当前是否在地面上。 |
| `getControllerMode()` | 控制模式，`0` 为人物，`1` 为车辆。 |
| `getPlayerModel()` | 当前加载的人物模型对象。 |
| `getPlayerCapsule()` | 角色胶囊体网格。 |
| `getActiveVehicle()` | 当前正在使用的车辆实例。 |
| `getAllVehicles()` | 所有已加载车辆实例。 |
| `getCollider()` | 用于 BVH 检测的合并碰撞网格。 |
| `getCurrentPlayerAnimationName()` | 当前播放的动画片段名，没有则返回 `null`。 |
| `getCenterScreenRaycastHit()` | 屏幕中心射线检测结果，适合做瞄准或交互。 |

## 输入与运行时控制

| 方法 | 说明 |
| --- | --- |
| `setInput(input)` | 注入外部输入状态，适合手柄或自定义按键系统。 |
| `setMouseSensitivity(v)` | 设置鼠标灵敏度。 |
| `setPlayerScale(v)` | 动态修改角色缩放，并同步碰撞相关参数。 |
| `setPlayerSpeed(v)` | 设置移动速度。 |
| `setPlayerFlySpeed(v)` | 设置飞行速度。 |
| `setJumpHeight(v)` | 设置跳跃高度。 |
| `setGravity(v)` | 设置重力。 |
| `setMinCamDistance(v)` | 设置第三人称最小镜头距离。 |
| `setMaxCamDistance(v)` | 设置第三人称最大镜头距离。 |
| `setCamLookAtHeightRatio(v)` | 设置第三人称相机看向点高度比例（0=底部，1=顶部）。 |
| `setThirdMouseMode(v)` | 设置第三人称鼠标模式：[0 | 1 | 2 | 3]。 |
| `setEnableZoom(v)` | 设置是否允许镜头缩放。 |
| `setOverShoulderView(v)` | 开关过肩视角偏移。 |
| `setDebug(v)` | 开关碰撞体调试显示。 |
| `setEnableToward(v)` | 开关鼠标驱动的朝向 / 视角更新。 |

## 动画

| 方法 | 说明 |
| --- | --- |
| `playPlayerAnimationByName(name, fade?)` | 按动画片段名直接播放角色动画。 |
| `registerAnimation(key, clipName, opts?)` | 注册自定义动画片段。 |
| `playAnimation(key, opts?)` | 播放已注册的自定义动画。 |
| `registerLocomotionSet(setName, map)` | 注册一套移动动画集合，用于替换内置移动动画。 |
| `switchLocomotionSet(setName, fade?)` | 切换到指定的移动动画集合。 |

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

- 当前实现支持 `duration`，并且会优先于 `timeScale` 生效。

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

## 事件

```ts
player.onAnimationChange = (name, action) => {};
player.onBeforeViewChange = (isFirstPerson) => {};
player.onViewChange = (isFirstPerson) => {};
player.onGroundChange = (onGround) => {};
player.onVehicleEnter = (vehicle) => {};
player.onVehicleExit = (vehicle) => {};
player.onTowardChange = (dx, dy, speed) => {};
```

| 事件 | 说明 |
| --- | --- |
| `onAnimationChange` | 角色当前动画切换时触发。 |
| `onBeforeViewChange` | 第一 / 第三人称切换前触发。 |
| `onViewChange` | 第一 / 第三人称切换后触发。 |
| `onGroundChange` | 落地状态变化时触发。 |
| `onVehicleEnter` | 上车完成后触发。 |
| `onVehicleExit` | 下车完成后触发。 |
| `onTowardChange` | 朝向 / 视角输入更新时触发。 |

### 全局输入监听辅助函数

```ts
import { onAllEvent, offAllEvent } from "three-player-controller";
```

- `onAllEvent()`：开启键盘和鼠标输入监听。
- `offAllEvent()`：关闭键盘和鼠标输入监听。

### 默认键位

| 按键 | 功能 |
| --- | --- |
| `W` / `ArrowUp` | 前进 |
| `S` / `ArrowDown` | 后退 |
| `A` / `ArrowLeft` | 左移 |
| `D` / `ArrowRight` | 右移 |
| `Shift` | 冲刺 |
| `Space` | 跳跃 |
| `V` | 切换视角 |
| `F` | 切换飞行模式 |
| `E` | 上车 / 下车 |
| 鼠标移动 | 控制视角 |

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

## 类型定义

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
    staticCollider?: THREE.Object3D | THREE.Object3D[];
    dynamicCollider?: THREE.Object3D | THREE.Object3D[];
    isShowMobileControls?: boolean;
    mobileControls?: MobileControlsOptions;
    thirdMouseMode?: 0 | 1 | 2 | 3;
    enableZoom?: boolean;
    enableOverShoulderView?: boolean;
    isFirstPerson?: boolean;
    camLookAtHeightRatio?: number;
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

## 字段说明

### `PlayerControllerOptions`

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `scene` | `THREE.Scene` | 是 | — | three.js 场景实例。 |
| `camera` | `THREE.PerspectiveCamera` | 是 | — | three.js 相机实例。 |
| `controls` | `any` | 是 | — | 外部相机控制器，实际通常传入 `OrbitControls`。 |
| `playerModelConfig` | `PlayerModelOptions` | 是 | — | 角色模型与角色参数配置。 |
| `initPos` | `THREE.Vector3` | 否 | `(0, 0, 0)` | 初始出生点。 |
| `mouseSensitivity` | `number` | 否 | `5` | 鼠标灵敏度。 |
| `minCamDistance` | `number` | 否 | `100` | 第三人称最小镜头距离。 |
| `maxCamDistance` | `number` | 否 | `440` | 第三人称最大镜头距离。 |
| `staticCollider` | `THREE.Object3D \| THREE.Object3D[]` | 否 | — | 指定用于生成静态碰撞体的对象；不传则遍历整个场景。 |
| `dynamicCollider` | `THREE.Object3D \| THREE.Object3D[]` | 否 | — | 初始化时注册的动态碰撞体（如可移动平台）。 |
| `isShowMobileControls` | `boolean` | 否 | `true` | 是否在移动端显示虚拟控制 UI。 |
| `mobileControls` | `MobileControlsOptions` | 否 | 全部显示 | 移动端按钮显隐配置。 |
| `thirdMouseMode` | `0 \| 1 \| 2 \| 3` | 否 | `1` | 第三人称视角下的不同鼠标控制模式，默认1(0:隐藏鼠标控制朝向及视角，1:隐藏鼠标仅控制视角，2:显示鼠标拖拽控制朝向及视角，3:显示鼠标拖拽仅控制视角) |
| `enableZoom` | `boolean` | 否 | `false` | 是否允许滚轮缩放。 |
| `enableOverShoulderView` | `boolean` | 否 | `false` | 是否启用过肩视角。 |
| `isFirstPerson` | `boolean` | 否 | `false` | 初始化时是否直接进入第一人称。 |
| `camLookAtHeightRatio` | `number` | 否 | `0.8` | 第三人称相机看向点高度比例（0=胶囊底部，1=顶部）。 |

### `PlayerModelOptions`

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `url` | `string` | 是 | — | 人物模型路径（GLB/GLTF）。 |
| `scale` | `number` | 是 | — | 人物模型缩放。 |
| `idleAnim` | `string` | 是 | — | Idle 动画名，需与模型内动画名一致。 |
| `walkAnim` | `string` | 是 | — | Walk 动画名，需与模型内动画名一致。 |
| `runAnim` | `string` | 是 | — | Run 动画名，需与模型内动画名一致。 |
| `jumpAnim` | `string` | 是 | — | Jump 动画名，需与模型内动画名一致。 |
| `leftWalkAnim` | `string` | 否 | `walkAnim` | 左移动画名，不填则复用 `walkAnim`。 |
| `rightWalkAnim` | `string` | 否 | `walkAnim` | 右移动画名，不填则复用 `walkAnim`。 |
| `backwardAnim` | `string` | 否 | `walkAnim` | 后退动画名，不填则复用 `walkAnim`。 |
| `flyAnim` | `string` | 否 | `idleAnim` | 飞行动画名，不填则复用 `idleAnim`。 |
| `flyIdleAnim` | `string` | 否 | `idleAnim` | 飞行待机动画名，不填则复用 `idleAnim`。 |
| `enterCarAnim` | `string` | 否 | — | 上车动画名；使用车辆功能时建议配置。 |
| `exitCarAnim` | `string` | 否 | — | 下车动画名；使用车辆功能时建议配置。 |
| `gravity` | `number` | 否 | `-2400` | 重力基准值，会按角色 `scale` 缩放。 |
| `jumpHeight` | `number` | 否 | `600` | 跳跃高度基准值，会按角色 `scale` 缩放。 |
| `speed` | `number` | 否 | `300` | 角色移动速度基准值，会按角色 `scale` 缩放。 |
| `flySpeed` | `number` | 否 | `2100` | 飞行速度基准值，会按角色 `scale` 缩放。 |
| `rotateY` | `number` | 否 | `0` | 模型绕 Y 轴的额外旋转偏移。 |
| `headBoneName` | `string` | 否 | — | 头部骨骼或节点名称，用于第一人称相机挂载。 |
| `firstPersonCameraOffset` | `[number, number, number]` | 否 | 有内置默认值 | 第一人称相机局部偏移。若找到 `headBoneName`，偏移相对头骨骼；否则相对胶囊体。 |
| `flyEnabled` | `boolean` | 否 | `true` | 是否允许飞行模式。 |
| `capsuleRadiusRatio` | `number` | 否 | `1` | 胶囊体半径倍率，用于微调碰撞宽度。 |

### `MobileControlsOptions`

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `joystick` | `boolean` | 否 | `true` | 是否显示摇杆。 |
| `jump` | `boolean` | 否 | `true` | 是否显示跳跃按钮。 |
| `fly` | `boolean` | 否 | `true` | 是否显示飞行按钮。 |
| `view` | `boolean` | 否 | `true` | 是否显示视角切换按钮。 |
| `vehicle` | `boolean` | 否 | `true` | 是否显示上下车按钮。 |

### `VehicleOptions`

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `url` | `string` | 是 | — | 车辆模型路径（GLB/GLTF）。 |
| `position` | `THREE.Vector3` | 是 | — | 车辆初始世界坐标。 |
| `wheelsNames` | `string[]` | 是 | — | 车轮节点名数组，顺序为左前、右前、左后、右后。 |
| `scale` | `number` | 否 | `1` | 车辆模型缩放。 |
| `animations.openDoorAnim` | `string` | 否 | — | 车门开关动画名。 |
| `boardingPoint` | `THREE.Vector3` | 是 | — | 上车点，局部坐标。 |
| `seatOffset` | `THREE.Vector3` | 否 | `(0, 0, 0)` | 角色上车后座位偏移。 |
| `chassisRatio` | `number` | 否 | `0.2` | 底盘高度比例。 |
| `suspensionRestLengthRatio` | `number` | 否 | `0.2` | 悬挂静止长度比例。 |
| `followVehicleDirection` | `boolean` | 否 | `true` | 驾驶时镜头是否跟随车辆朝向。 |
| `speedMultiplier` | `number` | 否 | `1` | 单车速度倍率。 |

# 反馈

如果你有任何问题或者好的想法欢迎提交[issue](https://github.com/hh-hang/three-player-controller/issues)

# 致谢

[three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh)

[three](https://github.com/mrdoob/three.js)



[npm]: https://img.shields.io/npm/v/three-player-controller
[npm-url]: https://www.npmjs.com/package/three-player-controller
