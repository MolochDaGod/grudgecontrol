中文 | [English](README_En.md)

# three-player-controller

[![NPM Package][npm]][npm-url]

轻量的第三人称 / 第一人称玩家控制器，开箱即用，基于 three.js 和 three-mesh-bvh 实现人物胶囊体碰撞、BVH 碰撞检测、人物动画、第一/三人称切换与相机避障，利用 three-mesh-bvh 优化碰撞检测性能，大场景下高性能运行。

# 示例

- [glb 场景](https://hh-hang.github.io/three-player-controller/index.html)

- [3dtiles 场景](https://hh-hang.github.io/three-player-controller/3dtilesScene.html)

- [3dtiles 自定义](https://hh-hang.github.io/three-player-controller/3dtilesCustomize.html)

### 普通控制

![普通控制演示](https://github.com/hh-hang/three-player-controller/blob/master/example/public/gif/1.gif)

### 飞行控制

![飞行控制演示](https://github.com/hh-hang/three-player-controller/blob/master/example/public/gif/4.gif)

### 车辆控制

![车辆控制演示](https://github.com/hh-hang/three-player-controller/blob/master/example/public/gif/6.gif)

### 移动端控制演示

![移动端控制演示](https://github.com/hh-hang/three-player-controller/blob/master/example/public/gif/5.gif)

# 安装

```bash
npm install three-player-controller three three-mesh-bvh
```

## 可选依赖

如果需要使用**车辆控制**，请安装 Rapier：

```bash
npm install @dimforge/rapier3d-compat
```

如果需要使用**移动端控制**，请安装 nipplejs：

```bash
npm install nipplejs
```

# 本地运行示例

```bash
# 克隆仓库
git clone https://github.com/hh-hang/three-player-controller.git

# 安装依赖
npm install

# 运行开发服务器
npm run dev
```

在浏览器访问 `http://localhost:5173/three-player-controller/` 查看示例。

# 使用

```js
import * as THREE from "three";
import { playerController } from "three-player-controller";

const player = playerController();

// 初始化玩家控制器
await player.init({
    scene, // three.js 场景
    camera, // three.js 相机
    controls, // three.js 控制器
    playerModel: {
        url: "./glb/person.glb", // 模型路径
        scale: 0.001,            // 模型缩放
        idleAnim: "idle",        // Idle 动画名
        walkAnim: "walk",        // Walk 动画名
        runAnim: "run",          // Run 动画名
        jumpAnim: "jump",        // Jump 动画名
    },
    initPos: new THREE.Vector3(0, 0, 0),
});

// 加入车辆控制
await player.loadVehicleModel({
    url: "./glb/bugatti.glb",
    scale: 0.1,
    position: new Vector3(22, 3.69, 14.5),
    wheelsNames: [
        "Wheel_LF", // 前左
        "Wheel_RF", // 前右
        "Wheel_LR", // 后左
        "Wheel_RR", // 后右
    ],
    animations: {
        openDoorAnim: "openDoorLF",
    },
    boardingPoint: new Vector3(0.5, 0, 1.8),
    seatOffset: new Vector3(0, 0.6, 0),
    chassisRatio: 0.15,
    suspensionRestLengthRatio: 0.2,
});

// 渲染循环调用
player.update();
```

# API

## 一、初始化

### 导出函数

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
    setPlayerFlySpeed: (playerFlySpeed: number) => void;
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

### 方法说明

| 方法 | 说明 |
|------|------|
| `init(opts, callback?)` | 初始化控制器，`callback` 在资源加载完成后调用 |
| `loadVehicleModel(params)` | 加载并初始化一辆车辆，可多次调用加载多辆 |
| `switchPlayerModel(model)` | 运行时切换人物模型，保留当前位置与朝向 |
| `changeView()` | 在第一/第三人称间切换 |
| `reset(pos?)` | 复位玩家到指定位置（默认初始位置） |
| `update(dt?)` | 每帧调用，驱动物理与动画 |
| `destroy()` | 销毁控制器，释放所有资源 |
| `setInput(input)` | 外部传入输入状态，适用于自定义按键或手柄接入 |
| `getPosition()` | 获取人物当前世界坐标 |
| `getCenterScreenRaycastHit()` | 获取屏幕中心射线与碰撞体的交点，可用于瞄准/交互检测 |
| `getPerson()` | 获取人物模型对象 |
| `getActiveVehicle()` | 获取当前正在驾驶的车辆实例 |
| `getAllVehicles()` | 获取所有已加载的车辆实例数组 |
| `setMouseSensitivity(v)` | 设置鼠标灵敏度 |
| `setGravity(v)` | 设置重力（传入基准值，内部自动乘以 scale） |
| `setJumpHeight(v)` | 设置跳跃高度（传入基准值，内部自动乘以 scale） |
| `setPlayerSpeed(v)` | 设置移动速度（传入基准值，内部自动乘以 scale） |
| `setPlayerFlySpeed(v)` | 设置飞行速度（传入基准值，内部自动乘以 scale） |
| `setMinCamDistance(v)` | 设置第三人称最小相机距离 |
| `setMaxCamDistance(v)` | 设置第三人称最大相机距离 |
| `setThirdMouseMode(v)` | 设置第三人称鼠标模式（0~3） |
| `setEnableZoom(v)` | 设置第三人称是否允许滚轮缩放 |
| `setOverShoulderView(v)` | 开启/关闭过肩视角偏移 |
| `setPlayerScale(scale)` | 动态设置人物缩放，同步更新碰撞体与所有相关物理参数 |
| `setDebug(v)` | 开启/关闭碰撞体调试显示 |
| `getCurrentPersonAnimationName()` | 获取当前正在播放的动画名称 |
| `registerAnimation(key, clipName, opts?)` | 注册一个自定义动画，之后可通过 `playAnimation` 播放 |
| `playAnimation(key, opts?)` | 播放已注册的自定义动画 |

---

## 二、事件

### 全局事件开关

```ts
export function onAllEvent(): void;  // 打开所有输入事件
export function offAllEvent(): void; // 关闭所有输入事件
```

- `onAllEvent()`：确保控制器存在并打开输入监听。
- `offAllEvent()`：关闭输入监听，用于显示 UI 或暂停时禁止玩家输入。

默认处理包括：WASD 移动、奔跑、跳跃、鼠标视角等。

### setInput 外部输入

可通过 `setInput` 接管输入，适用于自定义按键映射或手柄：

```ts
player.setInput({
    moveX: 1 | 0 | -1,      // 横向移动：1 右，-1 左，0 停
    moveY: 1 | 0 | -1,      // 纵向移动：1 前，-1 后，0 停
    lookDeltaX: number,      // 视角横向偏移量
    lookDeltaY: number,      // 视角纵向偏移量
    jump: boolean,           // 跳跃
    shift: boolean,          // 奔跑
    toggleView: boolean,     // 切换第一/第三人称
    toggleFly: boolean,      // 切换飞行模式
    toggleVehicle: boolean,  // 上车/下车
});
```

---

## 三、配置与参数说明

### 人物类型定义

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
        playerFlySpeed?: number;
        rotateY?: number;
        headObjName?: string;
        flyEnabled?: boolean;
        capsuleRadiusRatio?: number;
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

### 关键字段说明

| 字段 | 类型 | 必填 | 默认 | 说明 |
|------|-----:|:----:|:----:|------|
| `scene` | `THREE.Scene` | 是 | — | three.js 场景 |
| `camera` | `THREE.PerspectiveCamera` | 是 | — | three.js 相机 |
| `controls` | `OrbitControls` | 是 | — | 外部相机控制器 |
| `playerModel.url` | `string` | 是 | — | 人物模型路径（GLB/GLTF） |
| `playerModel.scale` | `number` | 是 | — | 人物模型缩放 |
| `playerModel.idleAnim` | `string` | 是 | — | Idle 动画名，需与模型内动画名一致 |
| `playerModel.walkAnim` | `string` | 是 | — | Walk 动画名，需与模型内动画名一致 |
| `playerModel.runAnim` | `string` | 是 | — | Run 动画名，需与模型内动画名一致 |
| `playerModel.jumpAnim` | `string` | 是 | — | Jump 动画名，需与模型内动画名一致 |
| `playerModel.leftWalkAnim` | `string` | 否 | `walkAnim` | 左走动画名，不填则复用 `walkAnim` |
| `playerModel.rightWalkAnim` | `string` | 否 | `walkAnim` | 右走动画名，不填则复用 `walkAnim` |
| `playerModel.backwardAnim` | `string` | 否 | `walkAnim` | 后退动画名，不填则复用 `walkAnim` |
| `playerModel.flyAnim` | `string` | 否 | `idleAnim` | 飞行动画名，不填则复用 `idleAnim` |
| `playerModel.flyIdleAnim` | `string` | 否 | `idleAnim` | 飞行待机动画名，不填则复用 `idleAnim` |
| `playerModel.enterCarAnim` | `string` | 否 | — | 上车动画名（使用车辆功能时必填） |
| `playerModel.exitCarAnim` | `string` | 否 | — | 下车动画名（使用车辆功能时必填） |
| `playerModel.rotateY` | `number` | 否 | `0` | 模型绕 Y 轴的额外旋转偏移 |
| `playerModel.headObjName` | `string` | 否 | — | 头部节点名称，用于第一人称相机绑定 |
| `playerModel.speed` | `number` | 否 | `300` | 移动速度基准值 |
| `playerModel.gravity` | `number` | 否 | `-2400` | 重力加速度基准值 |
| `playerModel.jumpHeight` | `number` | 否 | `600` | 跳跃高度基准值 |
| `playerModel.playerFlySpeed` | `number` | 否 | `2100` | 飞行速度基准值 |
| `playerModel.flyEnabled` | `boolean` | 否 | `true` | 是否允许飞行模式 |
| `initPos` | `THREE.Vector3` | 否 | `(0,0,0)` | 初始位置 |
| `mouseSensity` | `number` | 否 | `5` | 鼠标灵敏度 |
| `minCamDistance` | `number` | 否 | `100` | 第三人称最小相机距离 |
| `maxCamDistance` | `number` | 否 | `440` | 第三人称最大相机距离 |
| `colliderMeshUrl` | `string` | 否 | — | 自定义碰撞体模型路径，默认使用场景中所有网格 |
| `isShowMobileControls` | `boolean` | 否 | `true` | 移动端是否自动显示虚拟摇杆 |
| `thirdMouseMode` | `0\|1\|2\|3` | 否 | `1` | 第三人称鼠标模式（见下表） |
| `enableZoom` | `boolean` | 否 | `false` | 第三人称是否允许滚轮缩放 |
| `enableOverShoulderView` | `boolean` | 否 | `false` | 是否开启过肩视角偏移 |

**thirdMouseMode 说明：**

| 值 | 行为 |
|----|------|
| `0` | 隐藏鼠标，同时控制朝向和视角 |
| `1` | 隐藏鼠标，仅控制视角（默认） |
| `2` | 显示鼠标，拖拽控制朝向和视角 |
| `3` | 显示鼠标，拖拽仅控制视角 |

---

### 车辆类型定义

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

### 关键字段说明

| 字段 | 类型 | 必填 | 默认 | 说明 |
|------|-----:|:----:|:----:|------|
| `url` | `string` | 是 | — | 车辆模型路径（GLB/GLTF） |
| `position` | `THREE.Vector3` | 是 | — | 车辆初始世界坐标 |
| `wheelsNames` | `string[]` | 是 | — | 车轮节点名称数组，顺序为前左、前右、后左、后右 |
| `scale` | `number` | 否 | `1` | 模型缩放系数 |
| `animations.openDoorAnim` | `string` | 否 | — | 车门打开动画片段名称 |
| `boardingPoint` | `THREE.Vector3` | 是 | — | 上车点局部坐标（相对车辆模型坐标系） |
| `seatOffset` | `THREE.Vector3` | 否 | `(0,0,0)` | 座位偏移，用于微调人物坐入后的位置 |
| `chassisRatio` | `number` | 否 | `0.2` | 底盘高度相对于轮胎直径的比例（影响模型位置） |
| `suspensionRestLengthRatio` | `number` | 否 | `0.2` | 悬架弹簧静止长度相对于轮胎直径的比例（影响碰撞底盘高度） |
| `followVehicleDirection` | `boolean` | 否 | `true` | 行驶时相机是否跟随车辆速度方向自动转向车辆正后方 |
| `speedMultiplier` | `number` | 否 | `1` | 车辆速度倍率，用于调节不同车辆的速度差异 |

---

---

## 四、自定义动画

除内置动画外，可在加载模型后注册并播放自定义动画片段。

### registerAnimation

```ts
player.registerAnimation(key, clipName, opts?)
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `key` | `string` | 动画标识符，之后通过此 key 播放 |
| `clipName` | `string` | GLB 模型内动画片段的原始名称 |
| `opts.loop` | `boolean` | 是否循环，默认 `true` |
| `opts.timeScale` | `number` | 播放速度倍率，默认 `1` |
| `opts.duration` | `number` | 指定播放时长（秒），会自动计算 timeScale，与 `timeScale` 二选一 |
| `opts.clampWhenFinished` | `boolean` | 单次播放结束后是否停在最后一帧，默认 `false` |
| `opts.onFinished` | `() => void` | 动画播放完毕回调（仅单次播放时有效） |

### playAnimation

```ts
player.playAnimation(key, opts?)
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `key` | `string` | 已注册的动画标识符 |
| `opts.fade` | `number` | 过渡时间（秒），默认 `0.18` |
| `opts.force` | `boolean` | 是否强制从头重播（即使当前已在播放该动画） |

**示例：**

```ts
// 注册一个单次播放、播完回调的动画
player.registerAnimation("attack", "Attack_Clip", {
    loop: false,
    duration: 1.2,
    clampWhenFinished: true,
    onFinished: () => console.log("攻击结束"),
});

// 播放
player.playAnimation("attack", { force: true });
```

# 感谢

[three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh)

[three](https://github.com/mrdoob/three.js)

[npm]: https://img.shields.io/npm/v/three-player-controller
[npm-url]: https://www.npmjs.com/package/three-player-controller