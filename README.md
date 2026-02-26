[English](README_En.md)

# three-player-controller

[![NPM Package][npm]][npm-url]

轻量的第三人称 / 第一人称玩家控制器，开箱即用，基于 three.js 和 three-mesh-bvh 实现人物胶囊体碰撞、BVH 碰撞检测、人物动画、第一/三人称切换与相机避障。

# 安装

```bash
npm install three-player-controller
```

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

# 使用

```js
import * as THREE from "three";
import { playerController } from "three-player-controller";

const player = playerController();

// 初始化玩家控制器
player.init({
    scene, // three.js 场景
    camera, // three.js 相机
    controls, // three.js 控制器
    playerModel: {
        url: "./glb/person.glb", // 模型路径
        scale: 0.001, // 模型缩放
        idleAnim: "Idle_2", // 默认 Idle 动画名字
        walkAnim: "Walking_11", // 默认 Walk 动画名字
        runAnim: "Running_9", // 默认 Run 动画名字
        jumpAnim: "Jump_3", // 默认 Jump 动画名字
    },
    initPos: pos, // 初始位置
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

### 方法说明

- `init(opts, callback?)`  
  初始化控制器。`callback` 在资源加载完成后调用。
- `loadVehicleModel(params?)`  
  初始化车辆。
- `changeView()`  
  在第一/第三人称间切换。
- `reset(pos?)`  
  复位玩家到指定位置。
- `update(dt?)`  
  每帧调用。
- `destroy()`  
  销毁控制器。
- `getposition()`  
  获取人物当前位置。
- `getPerson()`  
  获取人物模型。
- `getActiveVehicle()`  
  获取当前车辆实例。
- `getAllVehicles()`  
  获取所有车辆实例。。

---

## 二、事件

### 全局事件开关

```ts
export function onAllEvent(): void; // 打开所有输入事件
export function offAllEvent(): void; // 关闭所有输入事件
```

### 说明

- `onAllEvent()`：确保控制器存在并打开输入监听。
- `offAllEvent()`：关闭输入监听（用于显示 UI 或暂停时禁止玩家输入）。

    默认处理包括：WASD 移动、奔跑、跳跃、鼠标视角等。

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

### 关键字段说明

| 字段                                                         |                      类型 | 默认 / 说明                                                                                                                                            |
| ------------------------------------------------------------ | ------------------------: | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `scene`                                                      |             `THREE.Scene` | three.js 场景（必填）                                                                                                                                  |
| `camera`                                                     | `THREE.PerspectiveCamera` | three.js 相机（必填）                                                                                                                                  |
| `controls`                                                   |           `OrbitControls` | 外部相机控制器（必填）                                                                                                                                 |
| `playerModel.url`                                            |                  `string` | 人物模型路径（GLB/GLTF，必填）                                                                                                                         |
| `playerModel.scale`                                          |                  `number` | 人物模型缩放（必填）                                                                                                                                   |
| `playerModel.idleAnim` / `walkAnim` / `runAnim` / `jumpAnim` |                  `string` | 人物动画名，需与人物模型中动画名称一致（必填）                                                                                                         |
| `playerModel.enterCarAnim` / `exitCarAnim`                   |                  `string` | 上车/下车动画名（可选）                                                                                                                                |
| `playerModel.rotateY`                                        |                  `number` | 模型绕 Y 轴的额外旋转偏移（可选）                                                                                                                      |
| `playerModel.headObjName`                                    |                  `string` | 头部对象名称（用于相机绑定或查找头部节点）（可选）                                                                                                     |
| `playerModel.speed`                                          |                  `number` | 基准速度，默认`400`                                                                                                                                    |
| `playerModel.gravity`                                        |                  `number` | 重力加速度，默认`-2400`                                                                                                                                |
| `playerModel.jumpHeight`                                     |                  `number` | 跳跃高度，默认`800`                                                                                                                                    |
| `initPos`                                                    |           `THREE.Vector3` | 初始位置，默认`(0,0,0)`                                                                                                                                |
| `mouseSensity`                                               |                  `number` | 鼠标灵敏度，默认`5`                                                                                                                                    |
| `minCamDistance` / `maxCamDistance`                          |                  `number` | 第三人称相机距离限制，默认分别为`100`、`440`                                                                                                           |
| `colliderMeshUrl`                                            |                  `string` | 自制碰撞体模型路径，默认`""`                                                                                                                           |
| `isShowMobileControls`                                       |                 `boolean` | 移动端运行时，是否自动显示移动端控制器，默认`true`                                                                                                     |
| `thirdMouseMode`                                             |            `[0, 1, 2, 3]` | 第三人称视角下的不同鼠标控制模式 ，默认`1`(0: 隐藏鼠标控制朝向及视角，1: 隐藏鼠标仅控制视角，2: 显示鼠标拖拽控制朝向及视角, 3: 显示鼠标拖拽仅控制视角) |
| `enableZoom`                                                 |                 `boolean` | 第三人称模式下是否允许缩放，默认`false`                                                                                                                |

---

### 车辆类型定义

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

### 关键字段说明

| 字段                        |            类型 | 必填 |            默认            | 说明                                                                                      |
| --------------------------- | --------------: | :--: | :------------------------: | ----------------------------------------------------------------------------------------- |
| `url`                       |        `string` |  是  |             —              | 车辆模型路径（GLB/GLTF）。CORS。                                                          |
| `position`                  | `THREE.Vector3` |  是  |             —              | 车辆在场景中的初始位置（世界坐标）。示例：`new THREE.Vector3(10,0,5)`。                   |
| `wheelsNames`               |      `string[]` |  是  |             —              | 车辆模型中车轮节点的名称数组。顺序为前左、前右、后左、后右。                              |
| `scale`                     |        `number` |  否  |            `1`             | 模型缩放系数。                                                                            |
| `animations.openDoorAnim`   |        `string` |  否  |             —              | 打开车门的动画片段名称。                                                                  |
| `boardingPoint`             | `THREE.Vector3` |  是  |             —              | 上车点 **局部坐标**（相对于车辆模型的本地坐标）。例：`new THREE.Vector3(0.8,1.0,0)`。     |
| `seatOffset`                | `THREE.Vector3` |  否  | `new THREE.Vector3(0,0,0)` | 从 `boardingPoint` 到玩家座位的位置偏移（局部坐标）。可用于微调人物进入车辆后的具体位置。 |
| `chassisRatio`              |        `number` |  否  |           `0.2`            | 观察车辆原始模型预估底盘高度相较于轮胎直径的比例系数填入（实际作用为调整车辆模型位置）。  |
| `suspensionRestLengthRatio` |        `number` |  否  |           `0.2`            | 底盘高度相较于轮胎直径的比例系数，与`chassisRatio`不同， 直接影响实际碰撞的底盘高度       |

---

# 感谢

[three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh)

[three](https://github.com/mrdoob/three.js)

[npm]: https://img.shields.io/npm/v/three-player-controller
[npm-url]: https://www.npmjs.com/package/three-player-controller
