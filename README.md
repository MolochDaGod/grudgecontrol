[English](README_En.md)

# three-player-controller

轻量的第三人称 / 第一人称玩家控制器，开箱即用，基于 three.js 和 three-mesh-bvh 实现人物胶囊体碰撞、BVH 碰撞检测、人物动画、第一/三人称切换与相机避障。

# 安装

```bash
npm install three-player-controller
```

# 示例

[glb 场景](https://hh-hang.github.io/three-player-controller/index.html)
[3dtiles 场景](https://hh-hang.github.io/three-player-controller/3dtilesScene.html)

### 控制

![控制演示](https://github.com/hh-hang/three-player-controller/blob/master/example/public/gif/1.gif)

### 飞行

![飞行](https://github.com/hh-hang/three-player-controller/blob/master/example/public/gif/3.gif)

### 3DTiles 漫游

![3DTiles 漫游](https://github.com/hh-hang/three-player-controller/blob/master/example/public/gif/4.gif)

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
  changeView: () => void;
  reset: (pos?: THREE.Vector3) => void;
  update: (dt?: number) => void;
  destroy: () => void;
};
```

### 方法说明

- `init(opts, callback?)`  
  初始化控制器。`callback` 在资源加载完成后调用。
- `changeView()`  
  在第一/第三人称间切换。
- `reset(pos?)`  
  复位玩家到指定位置。
- `update(dt?)`  
  每帧调用。
- `destroy()`  
  销毁控制器。

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

### 类型定义

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

### 关键字段说明

| 字段                                                         |                      类型 | 默认 / 说明                                                                                                                                            |
| ------------------------------------------------------------ | ------------------------: | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `scene`                                                      |             `THREE.Scene` | three.js 场景（必填）                                                                                                                                  |
| `camera`                                                     | `THREE.PerspectiveCamera` | three.js 相机（必填）                                                                                                                                  |
| `controls`                                                   |           `OrbitControls` | 外部相机控制器（必填）                                                                                                                                 |
| `playerModel.url`                                            |                  `string` | 人物模型路径（GLB/GLTF，必填）                                                                                                                         |
| `playerModel.scale`                                          |                  `number` | 人物模型缩放（必填）                                                                                                                                   |
| `playerModel.idleAnim` / `walkAnim` / `runAnim` / `jumpAnim` |                  `string` | 人物动画名，需与人物模型中动画名称一致（必填）                                                                                                         |
| `playerModel.speed`                                          |                  `number` | 基准速度，默认`400`                                                                                                                                    |
| `playerModel.gravity`                                        |                  `number` | 重力加速度，默认`-2400`                                                                                                                                |
| `playerModel.jumpHeight`                                     |                  `number` | 跳跃高度，默认`800`                                                                                                                                    |
| `initPos`                                                    |           `THREE.Vector3` | 初始位置，默认`(0,0,0)`                                                                                                                                |
| `mouseSensity`                                               |                  `number` | 鼠标灵敏度，默认`5`                                                                                                                                    |
| `minCamDistance` / `maxCamDistance`                          |                  `number` | 第三人称相机距离限制，默认分别为`100`、`440`                                                                                                           |
| `colliderMeshUrl`                                            |                  `string` | 自制碰撞体模型路径，默认`""`                                                                                                                           |
| `isShowMobileControls`                                       |                 `boolean` | 移动端运行时，是否自动显示移动端控制器，默认`true`                                                                                                     |
| `thirdMouseMode`                                             |            `[0, 1, 2, 3]` | 第三人称视角下的不同鼠标控制模式 ，默认`1`(0: 隐藏鼠标控制朝向及视角，1: 隐藏鼠标仅控制视角，2: 显示鼠标拖拽控制朝向及视角, 3: 显示鼠标拖拽仅控制视角) |

---

# 感谢

[three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh)

[three](https://github.com/mrdoob/three.js)
