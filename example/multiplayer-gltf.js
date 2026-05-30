import * as THREE from "three";
import { MapControls } from "three/examples/jsm/Addons.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";

import { LocalPlayer } from "./shooting/player/LocalPlayer.js";
import { WeaponController } from "./shooting/weapon/WeaponController.js";
import { HUD } from "./shooting/ui/HUD.js";
import { ShootingEffects } from "./shooting/weapon/effects.js";
import { DecalSystem } from "./shooting/weapon/DecalSystem.js";

import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, onValue, onDisconnect, remove, get, onChildAdded } from "firebase/database";

const BASE = import.meta.env.BASE_URL;

// ================================================================
// Firebase 配置
// ================================================================
const FIREBASE_CONFIG = {
    apiKey: "AIzaSyAHRbY8kGEkRT-dWYvdKgxBKPfAhKRP72E",
    authDomain: "player-controller.firebaseapp.com",
    databaseURL: "https://player-controller-default-rtdb.firebaseio.com",
    projectId: "player-controller",
    storageBucket: "player-controller.firebasestorage.app",
    messagingSenderId: "499506286184",
    appId: "1:499506286184:web:08b8a9b77f2f9c1a11b5dd",
};

// ==================== 房间 & 身份 ====================
const MAX_PLAYERS = 10;
if (!location.hash) location.replace(location.href + "#room1");
const roomId = "gltf-" + (location.hash.slice(1) || "room1");
const playerId = Math.random().toString(36).slice(2, 9);

const firebaseApp = initializeApp(FIREBASE_CONFIG);
const db = getDatabase(firebaseApp);
const myRef = ref(db, `rooms/${roomId}/players/${playerId}`);
onDisconnect(myRef).remove();
window.addEventListener("beforeunload", () => remove(myRef));

// ==================== 场景配置 ====================
const SCENE_URL = BASE + "glb/burnout_revenge_-_central_route_crash_junction.glb";
// 出生点列表，玩家按入房顺序依次分配
const SPAWN_POINTS = [
    new THREE.Vector3(21.500, 3.755, 15.000),
    new THREE.Vector3(21.229, 5.257, 19.803),
    new THREE.Vector3(1.564, 5.257, 19.928),
    new THREE.Vector3(-1.312, 3.760, 14.723),
    new THREE.Vector3(-17.597, 11.163, 8.699),
    new THREE.Vector3(-24.421, 11.163, 0.332),
    new THREE.Vector3(-23.108, 5.257, 19.826),
    new THREE.Vector3(-23.273, 3.947, 15.322),
    new THREE.Vector3(-14.501, 2.757, 11.004),
    new THREE.Vector3(-7.957, 2.772, 9.655),
    new THREE.Vector3(2.330, 3.757, 21.281),
];
const PLAYER_MODEL_URL1 = BASE + "./glb/person1.glb";
const PLAYER_MODEL_URL2 = BASE + "./glb/person2.glb";
const PLAYER_MODEL_URL15 = BASE + "./glb/person15.glb";
const FIRST_PERSON_PITCH_OFFSET_BY_MODEL = {
    [PLAYER_MODEL_URL1]: Math.PI * (10 / 180),
    [PLAYER_MODEL_URL2]: Math.PI * (10 / 180),
    [PLAYER_MODEL_URL15]: Math.PI * (16 / 180),
};

const PLAYER_MODEL = {
    url: PLAYER_MODEL_URL2,
    scale: 0.001,
    idleAnim: "idle1",
    walkAnim: "walk",
    runAnim: "run",
    jumpAnim: "jump",
    flyAnim: "flying",
    flyIdleAnim: "flyidle",
    headBoneName: "mixamorigHead",
    rotateY: -Math.PI / 2,
    minCamDistance: 10,
    maxCamDistance: 220,
    firstPersonPitchOffset: FIRST_PERSON_PITCH_OFFSET_BY_MODEL[PLAYER_MODEL_URL2],
};

// 持枪时远程玩家的动画映射（clipName → rifleClipName）
const RIFLE_ANIM_MAP = { idle1: "rifle_idle", walk: "rifle_walk", run: "rifle_run", jump: "rifle_jump" };

// 多部位骨骼碰撞盒定义（HITBOX_DEBUG=true 时显示绿色线框）
const HITBOX_DEBUG = false;
const HITBOX_DEFS = [
    { bone: "mixamorigHead", w: 20, h: 22, d: 20, oy: 10, part: "head", dmg: 2.0 },
    { bone: "mixamorigSpine2", w: 38, h: 60, d: 24, oy: -15, part: "torso", dmg: 1.0 },
    { bone: "mixamorigLeftArm", w: 12, h: 65, d: 12, oy: 38, part: "arm", dmg: 0.75 },
    { bone: "mixamorigRightArm", w: 12, h: 65, d: 12, oy: 38, part: "arm", dmg: 0.75 },
    { bone: "mixamorigLeftUpLeg", w: 14, h: 68, d: 14, oy: 46, part: "leg", dmg: 0.75 },
    { bone: "mixamorigRightUpLeg", w: 14, h: 68, d: 14, oy: 46, part: "leg", dmg: 0.75 },
];
// upperAnim key → full clip name（用于远程玩家全身播放）
const UPPER_CLIP_MAP = { upper_aim: "rifle_idle_aim3", upper_shoot: "rifle_shoot3", upper_reload: "reload" };

// ==================== 场景变量 ====================
let localPlayer = null;
let weapon = null;
let audioListener = null;  // THREE.AudioListener，供远程玩家空间音频使用
let gunShotBuffer = null;  // 枪声 AudioBuffer，远程玩家复用
let localShotSeq = 0;      // 本地开火计数器，写入 Firebase，供远程玩家触发声音
let decalSystem = null;
const scene = new THREE.Scene();
let camera, renderer, controls;
const clock = new THREE.Clock();
const gltfLoader = new GLTFLoader();

// 角色库（与 HTML data-idx 对应）
const CHARACTER_LIST = [
    { url: PLAYER_MODEL_URL1, name: "Josh" },
    { url: PLAYER_MODEL_URL2, name: "Tommy" },
    { url: PLAYER_MODEL_URL15, name: "Swat" },
];
let selectedModelUrl = PLAYER_MODEL_URL15; // 默认 Swat（index 2）

// 本地血量 & 名字 & 死亡状态 & 击杀死亡统计
let myHp = 100;
let isDead = false;
let myName = "";
let localKills = 0;
let localDeaths = 0;
let spawnIndex = 0; // 当前出生点索引，在 init() 和复活时递增
let isChatting = false;
let lastChatTime = 0;
const CHAT_COOLDOWN = 1000; // 发送冷却（ms）
const _lastHitterOf = new Map(); // targetId → attackerId，用于击杀归属
let lastAttackerOnMe = null;     // 最后一次攻击本玩家的 playerId

const _nameAdj = ["Iron", "Ghost", "Shadow", "Storm", "Silent", "Rapid", "Neon", "Steel", "Dark", "Void"];
const _nameNoun = ["Wolf", "Fox", "Eagle", "Hawk", "Viper", "Tiger", "Bear", "Crow", "Lynx", "Cobra"];
// 生成随机英文战斗名（形容词 + 名词）
function randomName() {
    return _nameAdj[Math.floor(Math.random() * _nameAdj.length)]
        + _nameNoun[Math.floor(Math.random() * _nameNoun.length)];
}

// 显示名字输入弹窗，从 localStorage 预填上次的名字和角色，但始终显示让用户确认
function waitForName() {
    const savedName = localStorage.getItem("mp_name");
    const savedCharIdx = parseInt(localStorage.getItem("mp_char_idx") ?? "2");
    selectedModelUrl = CHARACTER_LIST[savedCharIdx]?.url ?? PLAYER_MODEL_URL15;

    // 用 BASE 设置角色头像路径（%BASE_URL% 在 inline CSS 里不被 Vite 替换）
    const charImgs = [
        BASE + "img/multiplayer/char_josh.png",
        BASE + "img/multiplayer/char_tommy.png",
        BASE + "img/multiplayer/char_swat.png",
    ];
    document.querySelectorAll(".char-avatar").forEach((el, i) => {
        if (charImgs[i]) el.style.backgroundImage = `url(${charImgs[i]})`;
    });

    return new Promise(resolve => {
        const input = document.getElementById("name-input");
        const btn = document.getElementById("name-confirm");
        const overlay = document.getElementById("name-overlay");
        const cards = document.querySelectorAll(".char-card");

        input.value = savedName || randomName();
        input.select();

        // 恢复上次选中的角色
        cards.forEach(c => c.classList.remove("selected"));
        (cards[savedCharIdx] ?? cards[2]).classList.add("selected");

        // 角色切换
        cards.forEach(card => card.addEventListener("click", () => {
            cards.forEach(c => c.classList.remove("selected"));
            card.classList.add("selected");
            selectedModelUrl = CHARACTER_LIST[parseInt(card.dataset.idx)]?.url ?? PLAYER_MODEL_URL15;
        }));

        const confirm = () => {
            myName = (input.value.trim() || randomName()).slice(0, 16);
            const selCard = document.querySelector(".char-card.selected");
            const charIdx = selCard ? parseInt(selCard.dataset.idx) : 2;
            localStorage.setItem("mp_name", myName);
            localStorage.setItem("mp_char_idx", charIdx);
            overlay.style.display = "none";
            resolve();
        };
        btn.addEventListener("click", confirm);
        input.addEventListener("keydown", e => { if (e.key === "Enter") confirm(); });
    });
}

// 打开聊天输入框，暂停游戏输入
function openChat() {
    if (isChatting || isDead || !localPlayer) return;
    isChatting = true;
    localPlayer.offAllEvent();      // 先解绑，再释放锁，减少漏事件窗口
    document.exitPointerLock?.();
    const wrap = document.getElementById("chat-input-wrap");
    const input = document.getElementById("chat-input");
    wrap.style.display = "flex";
    input.value = "";
    setTimeout(() => input.focus(), 20);
}

// 关闭聊天输入框，恢复游戏输入
function closeChat(send) {
    if (!isChatting) return;
    const input = document.getElementById("chat-input");
    if (send) {
        const text = input.value.trim().slice(0, 80);
        if (text && Date.now() - lastChatTime > CHAT_COOLDOWN) {
            lastChatTime = Date.now();
            set(ref(db, `rooms/${roomId}/chat/${Date.now()}_${playerId}`), {
                name: myName, text, t: Date.now(),
            });
        }
    }
    document.getElementById("chat-input-wrap").style.display = "none";
    input.value = "";
    isChatting = false;
    localPlayer?.onAllEvent();
}

// 在屏幕上显示一条聊天消息（最多保留 5 条，8 秒后消失）
function addChatMessage(name, text) {
    const box = document.getElementById("chat-messages");
    if (!box) return;
    while (box.children.length >= 5) box.removeChild(box.firstChild);
    const el = document.createElement("div");
    el.className = "chat-msg";
    el.innerHTML = `<span class="chat-name">${name}</span>: ${text}`;
    box.appendChild(el);
    setTimeout(() => el.parentNode && el.parentNode.removeChild(el), 8000);
}

// 触发本地玩家死亡：停止输入、播死亡动画、推送死亡状态到 Firebase
function triggerDeath() {
    if (isDead) return;
    isDead = true;
    localDeaths++;
    updateKillBar();
    const killerName = remotePlayers.get(lastAttackerOnMe)?.name ?? "?";
    addKillFeedEntry(killerName, myName);
    document.exitPointerLock?.();
    localPlayer.offAllEvent();
    if (weapon._isReloading) weapon._cancelReload();
    weapon.switchMode("normal");
    localPlayer.playAnimation("death", { force: true, fade: 0.2 });
    sendState();
}

// 本地玩家复活：重置血量、恢复输入、传送到下一个出生点、推送复活状态到 Firebase
function triggerRespawn() {
    isDead = false;
    myHp = 100;
    updateMyHPUI();
    document.getElementById("death-overlay").style.display = "none";

    // 按顺序选下一个出生点并传送
    spawnIndex = (spawnIndex + 1) % SPAWN_POINTS.length;
    const respawnPos = SPAWN_POINTS[spawnIndex];
    const capsule = localPlayer._player?.getPlayerCapsule();
    if (capsule) capsule.position.copy(respawnPos);

    weapon?.resetAmmo();
    localPlayer.onAllEvent();
    localPlayer.playPlayerAnimationByName(PLAYER_MODEL.idleAnim, 0.3);
    sendState();
}

// ==================== 远程玩家 ====================
const remotePlayers = new Map();

class RemotePlayer {
    constructor(id, charIdx = 2) {
        this.id = id;
        this.charIdx = charIdx;
        this.model = null;
        this.gunModel = null;
        this.mixer = null;
        this.actions = new Map();
        this.currentClip = null;
        this.targetPos = new THREE.Vector3();
        this.targetQuat = new THREE.Quaternion();
        this.loaded = false;
        this._isDead = false;
        this.kills = 0;
        this.deaths = 0;
        this.name = "";
        this.nameLabelEl = null;
        this._headBone = null;
        this._gunSound = null;
        this._lastShotSeq = null;
    }

    // 异步加载模型、动画、碰撞盒、枪械；完成后 loaded = true
    async load() {
        // 根据角色索引加载对应模型
        const modelUrl = CHARACTER_LIST[this.charIdx]?.url ?? PLAYER_MODEL_URL15;
        const gltf = await gltfLoader.loadAsync(modelUrl);
        this.model = gltf.scene;
        this.model.scale.setScalar(PLAYER_MODEL.scale);
        this.model.visible = false;
        scene.add(this.model);

        // 注册所有动画（标准 + 枪械）
        this.mixer = new THREE.AnimationMixer(this.model);
        for (const clip of gltf.animations) {
            const action = this.mixer.clipAction(clip);
            if (clip.name === "death") {
                action.setLoop(THREE.LoopOnce, 1);
                action.clampWhenFinished = true;
                action.setEffectiveTimeScale(2);
            } else {
                action.setLoop(THREE.LoopRepeat, Infinity);
            }
            action.setEffectiveWeight(0);
            action.play();
            this.actions.set(clip.name, action);
        }

        // 根据 HITBOX_DEFS 为每根骨骼挂载不可见碰撞盒
        this._hitboxes = [];
        const hitboxMat = HITBOX_DEBUG
            ? new THREE.MeshBasicMaterial({ color: 0x00ff88, wireframe: true })
            : new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
        for (const def of HITBOX_DEFS) {
            const bone = this.model.getObjectByName(def.bone);
            if (!bone) continue;
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(def.w, def.h, def.d), hitboxMat);
            mesh.userData.playerId = this.id;
            mesh.userData.hitPart = def.part;
            mesh.userData.dmgMult = def.dmg;
            mesh.layers.set(0);
            mesh.layers.enable(2); // layer 2：可被武器射线检测
            mesh.visible = HITBOX_DEBUG;
            mesh.position.set(0, def.oy, 0);
            bone.add(mesh);
            this._hitboxes.push(mesh);
        }

        // 加载枪模型挂到右手
        await this._loadGun();

        // 挂载空间化枪声（距离衰减，远近有别）
        if (audioListener && gunShotBuffer && this.gunModel) {
            this._gunSound = new THREE.PositionalAudio(audioListener);
            this._gunSound.setBuffer(gunShotBuffer);
            this._gunSound.setRefDistance(10);
            this._gunSound.setVolume(1.0);
            this.gunModel.add(this._gunSound);
        }

        // 初始 idle 动画
        this._switchAnim(PLAYER_MODEL.idleAnim);
        this.loaded = true;

        this._headBone = this.model.getObjectByName(PLAYER_MODEL.headBoneName) ?? null;
        this._buildNameLabel();
    }

    // 加载 AK47 模型并挂载到右手骨骼
    async _loadGun() {
        const gltf = await gltfLoader.loadAsync(BASE + "glb/ak47.glb");
        this.gunModel = gltf.scene;
        this.gunModel.scale.setScalar(0.1);
        this.gunModel.position.set(1, 26.5, 2);

        // 对齐枪管方向（与 WeaponController 一致）
        const alignQ = new THREE.Quaternion().setFromUnitVectors(
            new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0)
        );
        const rollQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
        this.gunModel.quaternion.copy(rollQ.multiply(alignQ));
        this.gunModel.visible = false;

        const rightHand = this.model.getObjectByName("mixamorigRightHand");
        if (rightHand) rightHand.add(this.gunModel);
    }

    // 收到 Firebase 状态包时同步位置、朝向、动画、名字（每 50ms 触发一次）
    applyState(state) {
        if (!this.model) return; // load() 尚未完成，跳过

        if (this._isDead) {
            if (!state.dead) {
                // 敌人已复活：重置死亡状态，切回 idle，继续正常同步
                this._isDead = false;
                this._switchAnim(PLAYER_MODEL.idleAnim);
            } else {
                return; // 仍处于死亡状态，忽略
            }
        }

        // 收到死亡状态：定位到死亡坐标，播死亡动画，不再接受后续更新
        if (state.dead && !this._isDead) {
            this._isDead = true;
            this.targetPos.set(state.x, state.y, state.z);
            this.targetQuat.set(state.qx, state.qy, state.qz, state.qw);
            this._switchAnim("death");
            // 最后一击是本地玩家则记录击杀
            if (_lastHitterOf.get(this.id) === playerId) {
                localKills++;
                _lastHitterOf.delete(this.id);
                updateKillBar();
            }
            // 显示击杀动态（killedBy 可能是本地玩家或其他远程玩家）
            const kbId = state.killedBy;
            const killerName = kbId === playerId
                ? myName
                : (remotePlayers.get(kbId)?.name ?? "?");
            addKillFeedEntry(killerName, this.name || this.id);
            return;
        }

        if (state.kills !== undefined) { this.kills = state.kills; updateKillBar(); }
        if (state.deaths !== undefined) this.deaths = state.deaths;

        this.targetPos.set(state.x, state.y, state.z);
        this.targetQuat.set(state.qx, state.qy, state.qz, state.qw);

        // 远程枪声：首次收到时记录基准值，后续检测到计数器增加则播放空间音效
        if (state.shotSeq !== undefined) {
            if (this._lastShotSeq === null) {
                this._lastShotSeq = state.shotSeq;
            } else if (state.shotSeq > this._lastShotSeq && this._gunSound) {
                if (this._gunSound.isPlaying) this._gunSound.stop();
                this._gunSound.play();
                this._lastShotSeq = state.shotSeq;
            }
        }

        // 枪模型显隐
        if (this.gunModel) this.gunModel.visible = (state.weapon === "primary");

        // 动画解析：upperAnim 优先，否则按 weapon 模式选 clip
        const resolvedClip = state.upperAnim
            ? (UPPER_CLIP_MAP[state.upperAnim] ?? state.anim)
            : (state.weapon === "primary" ? (RIFLE_ANIM_MAP[state.anim] ?? state.anim) : state.anim);

        if (resolvedClip && resolvedClip !== this.currentClip) this._switchAnim(resolvedClip);

        if (!this.model.visible) {
            // 首次显示直接吸附，避免从原点插值进场
            this.model.position.copy(this.targetPos);
            this.model.quaternion.copy(this.targetQuat);
            this.model.visible = true;
        }

        if (state.name && state.name !== this.name) {
            this.name = state.name;
            if (this.nameLabelEl) this.nameLabelEl.textContent = state.name;
        }
    }

    // 淡切到指定动画 clip（0.2s 过渡）
    _switchAnim(clipName) {
        const next = this.actions.get(clipName);
        if (!next) return;
        const prev = this.currentClip ? this.actions.get(this.currentClip) : null;
        if (prev && prev !== next) prev.fadeOut(0.2);
        next.reset().setEffectiveWeight(1).fadeIn(0.2);
        this.currentClip = clipName;
    }

    // 创建头顶悬浮名字 DOM 标签
    _buildNameLabel() {
        const el = document.createElement("div");
        Object.assign(el.style, {
            position: "fixed", display: "none", pointerEvents: "none",
            transform: "translate(-50%, -100%)", zIndex: "9996",
            color: "#fff", fontFamily: "system-ui, sans-serif",
            fontSize: "12px", fontWeight: "bold", whiteSpace: "nowrap",
            textShadow: "0 1px 4px rgba(0,0,0,0.95), 0 0 8px rgba(0,0,0,0.7)",
            letterSpacing: "0.04em",
        });
        el.textContent = this.name || "";
        document.body.appendChild(el);
        this.nameLabelEl = el;
    }

    // 每帧：平滑插值位置/旋转，驱动动画 mixer
    tick(delta) {
        if (!this.loaded || !this.model) return;
        this.model.position.lerp(this.targetPos, 0.15);
        this.model.quaternion.slerp(this.targetQuat, 0.15);
        this.mixer?.update(delta);
    }

    // 每帧：将名字标签投影到屏幕（头骨骼上方世界坐标偏移，透视自动缩放）
    updateNameLabel(camera, renderer) {
        if (!this.nameLabelEl || !this.model?.visible) {
            if (this.nameLabelEl) this.nameLabelEl.style.display = "none";
            return;
        }
        const worldPos = new THREE.Vector3();
        if (this._headBone) {
            this._headBone.updateWorldMatrix(true, false);
            this._headBone.getWorldPosition(worldPos);
            // 在世界坐标空间加偏移，透视会自动压缩远处的偏移量，避免固定像素偏移导致越远越高
            worldPos.y += PLAYER_MODEL.scale * 60;
        } else {
            this.model.getWorldPosition(worldPos);
            worldPos.y += PLAYER_MODEL.scale * 230;
        }
        const s = worldPos.clone().project(camera);
        if (s.z > 1) { this.nameLabelEl.style.display = "none"; return; }
        const x = (s.x * 0.5 + 0.5) * renderer.domElement.clientWidth;
        const y = (-s.y * 0.5 + 0.5) * renderer.domElement.clientHeight;
        this.nameLabelEl.style.display = "block";
        this.nameLabelEl.style.left = `${x}px`;
        this.nameLabelEl.style.top = `${y}px`;
    }

    // 释放几何体/材质/DOM，将模型移出场景（玩家离线时调用）
    dispose() {
        if (this.model) {
            this.model.traverse(child => {
                if (child.isMesh) { child.geometry?.dispose();[child.material].flat().forEach(m => m?.dispose()); }
            });
            scene.remove(this.model);
        }
        this._hitboxes = null;
        this.mixer?.stopAllAction();
        this.model = null;
        if (this._gunSound) {
            if (this._gunSound.isPlaying) this._gunSound.stop();
            this._gunSound = null;
        }
        this.nameLabelEl?.remove();
        this.nameLabelEl = null;
    }
}

// ==================== Firebase 状态同步 ====================
const _sendPos = new THREE.Vector3();
const _sendQuat = new THREE.Quaternion();
let lastSendTime = 0;
const SEND_INTERVAL = 50;
let currentUpperKey = null; // 跟踪上半身动画 key

// 将本地玩家当前状态推送到 Firebase（位置、朝向、动画、血量、死亡标志）
function sendState() {
    if (!localPlayer) return;
    const model = localPlayer.getPlayerModel();
    const capsule = localPlayer._player?.getPlayerCapsule();
    if (!model || !capsule) return;

    model.getWorldPosition(_sendPos);
    capsule.getWorldQuaternion(_sendQuat);

    set(myRef, {
        x: +_sendPos.x.toFixed(3), y: +_sendPos.y.toFixed(3), z: +_sendPos.z.toFixed(3),
        qx: +_sendQuat.x.toFixed(4), qy: +_sendQuat.y.toFixed(4),
        qz: +_sendQuat.z.toFixed(4), qw: +_sendQuat.w.toFixed(4),
        anim: localPlayer._player?.getCurrentPlayerAnimationName() ?? PLAYER_MODEL.idleAnim,
        weapon: weapon?.getMode() ?? "normal",
        upperAnim: currentUpperKey ?? null,
        hp: myHp,
        dead: isDead,
        killedBy: isDead ? (lastAttackerOnMe ?? null) : null,
        charIdx: CHARACTER_LIST.findIndex(c => c.url === selectedModelUrl),
        kills: localKills,
        deaths: localDeaths,
        name: myName,
        shotSeq: localShotSeq,
        t: Date.now(),
    });
}

// 向指定玩家的命中队列写入伤害记录，由对方客户端消费
function onHitPlayer(targetId, damage) {
    _lastHitterOf.set(targetId, playerId);
    set(ref(db, `rooms/${roomId}/hits/${targetId}/${Date.now()}`), { damage, by: playerId });
}

const PLAYER_STALE_MS = 60000; // 超过阈值没有心跳视为已离线

// 初始化 Firebase 监听：玩家状态同步 + 心跳超时清理 + 命中事件接收
function initFirebaseSync() {
    // 清理上次未正常退出的残留玩家
    get(ref(db, `rooms/${roomId}/players`)).then(snap => {
        if (!snap.exists()) return;
        const now = Date.now();
        for (const [id, state] of Object.entries(snap.val())) {
            if (id !== playerId && now - (state.t ?? 0) > PLAYER_STALE_MS) {
                remove(ref(db, `rooms/${roomId}/players/${id}`));
            }
        }
    });

    // 玩家状态监听
    const roomRef = ref(db, `rooms/${roomId}/players`);
    onValue(roomRef, snapshot => {
        const data = snapshot.val() ?? {};
        for (const [id, state] of Object.entries(data)) {
            if (id === playerId) continue;
            // 心跳超时：从 Firebase 删除，触发本地 dispose
            if (Date.now() - (state.t ?? 0) > PLAYER_STALE_MS) {
                remove(ref(db, `rooms/${roomId}/players/${id}`));
                continue;
            }
            if (!remotePlayers.has(id)) {
                const rp = new RemotePlayer(id, state.charIdx ?? 2);
                remotePlayers.set(id, rp);
                rp.load().then(() => {
                    rp.applyState(state);
                    addRoomNotify(state.name || id, "joined");
                });
                updateCountUI();
            } else {
                remotePlayers.get(id).applyState(state);
            }
        }
        for (const id of remotePlayers.keys()) {
            if (!data[id]) {
                const name = remotePlayers.get(id).name || id;
                remotePlayers.get(id).dispose();
                remotePlayers.delete(id);
                updateCountUI();
                addRoomNotify(name, "left");
            }
        }
    });

    // 监听聊天消息（只接收加入后的新消息）
    const joinTime = Date.now();
    const chatRef = ref(db, `rooms/${roomId}/chat`);
    onChildAdded(chatRef, snap => {
        const { name, text, t } = snap.val();
        if (t < joinTime - 3000) return; // 过滤早于加入时间 3 秒的历史消息
        addChatMessage(name, text);
        if (Date.now() - t > 30000) remove(snap.ref); // 清理超过 30 秒的旧消息
    });

    // 监听其他玩家产生的弹痕（自己的跳过，入场前 3 秒的忽略，读完即删）
    const decalsRef = ref(db, `rooms/${roomId}/decals`);
    onChildAdded(decalsRef, snap => {
        const d = snap.val();
        if (!d || snap.key?.endsWith(`_${playerId}`)) { remove(snap.ref); return; }
        if (d.t < joinTime - 3000) { remove(snap.ref); return; }
        decalSystem?.spawnAtPoint(new THREE.Vector3(d.x, d.y, d.z), new THREE.Vector3(d.nx, d.ny, d.nz));
        remove(snap.ref);
    });

    // 监听命中本玩家的事件
    const myHitsRef = ref(db, `rooms/${roomId}/hits/${playerId}`);
    onChildAdded(myHitsRef, snap => {
        const { damage, by } = snap.val();
        if (by) lastAttackerOnMe = by;
        if (!isDead) {
            myHp = Math.max(0, myHp - damage);
            updateMyHPUI();
            if (myHp <= 0) triggerDeath();
        }
        remove(snap.ref); // 读完即删
    });
}

// ==================== UI ====================
// 显示进出房间通知（与击杀动态共用容器，5 秒后消失）
function addRoomNotify(name, action) {
    const feed = document.getElementById("kill-feed");
    if (!feed) return;
    while (feed.children.length >= 3) feed.removeChild(feed.firstChild);
    const el = document.createElement("div");
    el.className = "kf-entry";
    el.style.fontSize = "12px";
    el.innerHTML = `<span style="color:#f4c542">${name}</span> <span style="color:#fff">${action}</span>`;
    feed.appendChild(el);
    setTimeout(() => el.parentNode && el.parentNode.removeChild(el), 5000);
}

// 添加一条击杀动态（最多保留 3 条，10 秒后自动消失）
function addKillFeedEntry(killerName, victimName) {
    const feed = document.getElementById("kill-feed");
    if (!feed) return;
    while (feed.children.length >= 3) feed.removeChild(feed.firstChild);
    const entry = document.createElement("div");
    entry.className = "kf-entry";
    const gunSvg = `<svg width="42" height="18" viewBox="0 0 28 12" fill="none" xmlns="http://www.w3.org/2000/svg" style="opacity:0.7;vertical-align:middle"><path d="M1 5 L1 8 L7 8 L8 6.5 L7 5 Z" fill="#f4c542"/><rect x="7" y="4" width="14" height="4" rx="1" fill="#f4c542"/><path d="M12 8 L11 11 L14 11 L15 8 Z" fill="#f4c542"/><rect x="21" y="5" width="7" height="2" rx="0.5" fill="#f4c542"/></svg>`;
    entry.innerHTML = `<span class="kf-killer">${killerName}</span>${gunSvg}<span class="kf-victim">${victimName}</span>`;
    feed.appendChild(entry);
    setTimeout(() => entry.parentNode && entry.parentNode.removeChild(entry), 10000);
}

// 初始化 UI（mp-panel 已移除，保留空函数兼容调用点）
function initUI() { }

// 更新在线人数显示
function updateCountUI() {
    const el = document.getElementById("mp-count");
    if (el) el.textContent = String(1 + remotePlayers.size);
}

// 更新本地玩家头像血量填充和数字显示
function updateMyHPUI() {
    const fill = document.getElementById("avatar-hp-fill");
    const num = document.getElementById("my-hp-num");
    if (fill) {
        fill.style.height = `${myHp}%`;
        fill.style.background = myHp > 50
            ? "rgba(34,204,68,0.55)"
            : myHp > 25
                ? "rgba(255,170,0,0.65)"
                : "rgba(255,50,50,0.7)";
    }
    if (num) num.textContent = String(myHp);
}

// 显示房间已满提示，阻止进入游戏
function showRoomFull() {
    const overlay = document.getElementById("room-full-overlay");
    if (overlay) {
        overlay.style.display = "flex";
    } else {
        alert(`房间已满（最多 ${MAX_PLAYERS} 人），请换个房间`);
    }
    window.hideLoader?.();
}

// ==================== 软排斥 ====================
const _repDir = new THREE.Vector3();
// 软排斥：防止本地玩家与远程玩家模型重叠
function applyRepulsion() {
    const capsule = localPlayer?._player?.getPlayerCapsule();
    if (!capsule) return;
    const R = PLAYER_MODEL.scale * 30 * 4;
    const S = R * 8 / 60;
    for (const rp of remotePlayers.values()) {
        if (!rp.loaded || !rp.model) continue;
        _repDir.subVectors(capsule.position, rp.targetPos).setY(0);
        const d = _repDir.length();
        if (d > 0.0001 && d < R) capsule.position.addScaledVector(_repDir.normalize(), (1 - d / R) * S);
    }
}

// ==================== 渲染循环 ====================
// 刷新顶部击杀栏：左侧本人击杀，右侧房间第一击杀
function updateKillBar() {
    const myEl = document.getElementById("kb-my-kills");
    const topEl = document.getElementById("kb-top-kills");
    if (!myEl || !topEl) return;
    const topKills = Math.max(
        localKills,
        ...Array.from(remotePlayers.values()).map(rp => rp.kills)
    );
    myEl.textContent = localKills;
    topEl.textContent = topKills;
}

// 刷新计分板内容并排序（按击杀降序，相同则死亡升序）
function updateScoreboard() {
    const rows = [
        { name: myName, kills: localKills, deaths: localDeaths, isLocal: true },
        ...Array.from(remotePlayers.values())
            .map(rp => ({ name: rp.name || rp.id, kills: rp.kills, deaths: rp.deaths, isLocal: false })),
    ];
    rows.sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);

    const tbody = document.getElementById("sb-body");
    if (!tbody) return;
    tbody.innerHTML = "";
    rows.forEach((p, i) => {
        const tr = document.createElement("tr");
        if (p.isLocal) tr.className = "sb-local";
        tr.innerHTML = `<td>${i + 1}</td><td>${p.name}</td><td>${p.kills}</td><td>${p.deaths}</td>`;
        tbody.appendChild(tr);
    });
}

// 主渲染循环（由 renderer.setAnimationLoop 驱动）
let prevGunEngaged = false;
function animate() {
    const delta = Math.min(clock.getDelta(), 0.05);
    const elapsed = clock.getElapsedTime();

    if (localPlayer && weapon) {
        if (!isDead) {
            const spineIK = localPlayer.spineIK;
            const gunEngaged = weapon.isGunEngaged();

            if (gunEngaged !== prevGunEngaged) {
                localPlayer.setThirdMouseMode(gunEngaged ? 5 : 1);
                prevGunEngaged = gunEngaged;
            }

            if (gunEngaged) spineIK?.restoreBones();
            localPlayer.update(delta);

            // 聊天期间跳过 SpineIK，防止释放指针锁时漏进的 mousemove 导致上半身突转
            if (gunEngaged && !isChatting) {
                localPlayer.applyHipsCorrection();
                localPlayer.getIsFirstPerson()
                    ? spineIK?.applyAim1P(camera, localPlayer.pitchTarget1P)
                    : spineIK?.applyAim3P(camera, true);
            }

            weapon.update(elapsed, delta);
            applyRepulsion();


            const now = performance.now();
            if (now - lastSendTime > SEND_INTERVAL) { lastSendTime = now; sendState(); }
        } else {
            // 死亡时只推进 mixer，不运行状态机
            localPlayer._player?.animation?.mixer?.update(delta);
            if (localPlayer._upperMixer) localPlayer._upperMixer.update(delta);
        }
    } else {
        controls?.update();
    }

    for (const rp of remotePlayers.values()) {
        rp.tick(delta);
        rp.updateNameLabel(camera, renderer);
    }

    // if (localPlayer) {
    //     const p = localPlayer.getPosition();
    //     if (p) console.log(`x:${p.x.toFixed(3)} y:${p.y.toFixed(3)} z:${p.z.toFixed(3)}`);
    // }

    renderer.render(scene, camera);
}

// ==================== 初始化 ====================
// 初始化场景、本地玩家、武器系统、Firebase 同步
async function init() {
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.setAnimationLoop(animate);
    document.getElementById("container").appendChild(renderer.domElement);

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.01, 1000);

    controls = new MapControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;

    scene.add(new THREE.AmbientLight(0xffffff, 4));
    const dir = new THREE.DirectionalLight(0xffffff, 6);
    dir.position.set(10, 20, 10);
    scene.add(dir);

    // 背景
    new HDRLoader().load(
        "./img/1.hdr",
        (texture) => {
            texture.mapping = THREE.EquirectangularReflectionMapping;
            scene.background = texture;
        },
        undefined,
        (err) => {
            console.warn("HDR 加载失败：", err);
        }
    );

    // GLTF 加载器
    const draco = new DRACOLoader();
    draco.setDecoderPath("https://unpkg.com/three@0.180.0/examples/jsm/libs/draco/");
    gltfLoader.setDRACOLoader(draco);

    // 加载场景
    const gltf = await gltfLoader.loadAsync(SCENE_URL);
    const sceneModel = gltf.scene;
    sceneModel.scale.set(10, 10, 10);
    scene.add(sceneModel);

    // 房间人数检查，并按当前人数分配出生点
    const snap = await get(ref(db, `rooms/${roomId}/players`));
    const existingCount = snap.exists() ? Object.keys(snap.val()).length : 0;
    if (existingCount >= MAX_PLAYERS) { showRoomFull(); return; }
    spawnIndex = existingCount % SPAWN_POINTS.length;
    const spawnPos = SPAWN_POINTS[spawnIndex];
    camera.position.copy(spawnPos);
    controls.target.copy(spawnPos);

    // 本地玩家 (LocalPlayer 包装)
    localPlayer = new LocalPlayer({ scene, camera, controls });
    await localPlayer.init({
        playerModelConfig: PLAYER_MODEL,
        initPos: spawnPos,
        minCamDistance: 10,
        maxCamDistance: 220,
        enableOverShoulderView: true,
        staticCollider: sceneModel,
    });

    // 打印骨骼名，用于排查 SpineIK 骨骼名不匹配问题（排查完可删除）
    const boneNames = [];
    localPlayer.getPlayerModel()?.traverse(b => { if (b.isBone) boneNames.push(b.name); });

    // 追踪上半身动画 key（monkey-patch，不改 LocalPlayer 源码）
    const origPlayUpper = localPlayer.playUpperBody.bind(localPlayer);
    const origStopUpper = localPlayer.stopUpperBody.bind(localPlayer);
    localPlayer.playUpperBody = (key, opts) => { currentUpperKey = key; return origPlayUpper(key, opts); };
    localPlayer.stopUpperBody = (fade) => { currentUpperKey = null; return origStopUpper(fade); };

    // HUD
    const hud = new HUD([
        { key: "1", mode: "primary", label: "Rifle" },
        { key: "4", mode: "normal", label: "Fists" },
    ]);
    hud.build();

    // 音频
    audioListener = new THREE.AudioListener();
    camera.add(audioListener);

    // 特效
    const effects = new ShootingEffects(scene, { listener: audioListener, flashScale: 0.015, smokeSize: 0.08 });
    await effects.load(
        BASE + "img/muzzle_flash.png",
        BASE + "img/smoke.png",
        BASE + "audio/gun_shot.mp3",
        BASE + "audio/reload.mp3",
    );
    gunShotBuffer = effects._fireSound?.buffer ?? null;

    // 弹孔
    decalSystem = new DecalSystem(scene, 60, 0.025);
    await decalSystem.loadMaterials(["img/bullet_hole2.png"], BASE);
    decalSystem.onSpawn = (p, n) => {
        set(ref(db, `rooms/${roomId}/decals/${Date.now()}_${playerId}`), {
            x: +p.x.toFixed(4), y: +p.y.toFixed(4), z: +p.z.toFixed(4),
            nx: +n.x.toFixed(4), ny: +n.y.toFixed(4), nz: +n.z.toFixed(4),
            t: Date.now(),
        });
    };

    // 武器控制器
    weapon = new WeaponController({ scene, camera, localPlayer, decalSystem, effects, hud, zombieManager: null });
    await weapon.load(gltfLoader, BASE);
    weapon.setupAnimations();
    weapon.bindInput();

    // 拦截每次开火，累加计数器写入 Firebase，供远程玩家触发枪声
    const _origFireOnce = weapon._fireOnce.bind(weapon);
    weapon._fireOnce = function () { localShotSeq++; _origFireOnce(); };

    // 注册死亡动画：LoopOnce + 锁末帧，播完后显示死亡遮罩
    localPlayer.registerAnimation("death", "death", {
        loop: false,
        clampWhenFinished: true,
        timeScale: 2,
        onFinished: () => { document.getElementById("death-overlay").style.display = "flex"; },
    });

    // 死亡遮罩按钮
    document.getElementById("btn-respawn").addEventListener("click", triggerRespawn);

    // 注入多人命中回调
    weapon.onHitPlayer = onHitPlayer;

    localPlayer.setGunEngagedGetter(() => weapon.isGunEngaged());
    hud.update(weapon.getMode());

    document.addEventListener("contextmenu", e => e.preventDefault());

    // Enter 键打开/发送聊天，Esc 取消
    document.addEventListener("keydown", e => {
        if (e.key === "Enter") {
            e.preventDefault();
            isChatting ? closeChat(true) : openChat();
        }
        if (e.key === "Escape" && isChatting) {
            e.preventDefault();
            closeChat(false);
        }
    });

    // Tab 键显示/隐藏计分板（聊天时跳过）
    const scoreboardEl = document.getElementById("scoreboard");
    document.addEventListener("keydown", e => {
        if (isChatting) return;
        if (e.key === "Tab") { e.preventDefault(); updateScoreboard(); scoreboardEl.style.display = "flex"; }
    });
    document.addEventListener("keyup", e => {
        if (e.key === "Tab") scoreboardEl.style.display = "none";
    });

    // Firebase 同步
    initFirebaseSync();

    // UI
    initUI();
    updateMyHPUI();
    const nameEl = document.getElementById("local-player-name");
    if (nameEl) nameEl.textContent = myName;

    window.addEventListener("resize", () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    window.hideLoader?.();
}

waitForName().then(() => {
    // 将选中的角色应用到 PLAYER_MODEL
    PLAYER_MODEL.url = selectedModelUrl;
    PLAYER_MODEL.firstPersonPitchOffset =
        FIRST_PERSON_PITCH_OFFSET_BY_MODEL[selectedModelUrl]
        ?? PLAYER_MODEL.firstPersonPitchOffset;
    return init();
});
