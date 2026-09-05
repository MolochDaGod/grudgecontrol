import * as THREE from "three";
import { MapControls } from "three/examples/jsm/Addons.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";
import { SplatMesh, SparkRenderer } from "@sparkjsdev/spark";

import { LocalPlayer } from "./shooting/player/LocalPlayer.js";
import { WeaponController } from "./shooting/weapon/WeaponController.js";
import { HUD } from "./shooting/ui/HUD.js";
import { ShootingEffects } from "./shooting/weapon/effects.js";
import { DecalSystem } from "./shooting/weapon/DecalSystem.js";

import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, onValue, onDisconnect, remove, get, onChildAdded } from "firebase/database";

const BASE = import.meta.env.BASE_URL;

// ================================================================
// Firebase config
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

// ==================== Room & identity ====================
const MAX_PLAYERS = 10;
if (!location.hash) location.replace(location.href + "#room1");
const roomId = "3dgs-" + (location.hash.slice(1) || "room1");
const playerId = Math.random().toString(36).slice(2, 9);

const firebaseApp = initializeApp(FIREBASE_CONFIG);
const db = getDatabase(firebaseApp);
const myRef = ref(db, `rooms/${roomId}/players/${playerId}`);
onDisconnect(myRef).remove();
window.addEventListener("beforeunload", () => remove(myRef));

// ==================== Scene config ====================
const SPLAT_URL = BASE + "3DGS/outdoor4.sog";
const COLLIDER_URL = BASE + "glb/outdoor4.collision.glb";
// Spawn points, assigned in join order
const SPAWN_POINTS = [
    new THREE.Vector3(0.895, 0.1, 0.822),
    new THREE.Vector3(-0.101, 0.1, 1.354),
    new THREE.Vector3(-0.396, 0.1, 0.347),
    new THREE.Vector3(-0.960, 0.1, -0.120),
    new THREE.Vector3(-0.761, 0.1, -1.229),
    new THREE.Vector3(-0.135, 0.1, -1.949),
    new THREE.Vector3(1.547, 0.1, -1.449),
    new THREE.Vector3(2.440, 0.1, -0.862),
    new THREE.Vector3(1.649, 0.1, -0.369),
    new THREE.Vector3(0.987, 0.1, 0.422),
];
// Character roster (matches HTML data-idx); each entry is a full model config
const CHARACTER_LIST = [
    {
        name: "Josh",
        url: BASE + "./glb/person1.glb",
        scale: 0.001,
        idleAnim: "idle1",
        walkAnim: "walk",
        runAnim: "run",
        jumpAnim: "jump",
        flyAnim: "flying",
        flyIdleAnim: "flyidle",
        headBoneName: "mixamorigHead",
        rotateY: -Math.PI / 2,
        minCamDistance: 10, maxCamDistance: 220,
        firstPersonPitchOffset: Math.PI * (10 / 180),
    },
    {
        name: "Tommy",
        url: BASE + "./glb/person2.glb",
        scale: 0.001,
        idleAnim: "idle1",
        walkAnim: "walk",
        runAnim: "run",
        jumpAnim: "jump",
        flyAnim: "flying",
        flyIdleAnim: "flyidle",
        headBoneName: "mixamorigHead",
        rotateY: -Math.PI / 2,
        minCamDistance: 10, maxCamDistance: 220,
        firstPersonPitchOffset: Math.PI * (10 / 180),
    },
    {
        name: "Swat",
        url: BASE + "./glb/person15.glb",
        scale: 0.001,
        idleAnim: "idle1",
        walkAnim: "walk",
        runAnim: "run",
        jumpAnim: "jump",
        flyAnim: "flying",
        flyIdleAnim: "flyidle",
        headBoneName: "mixamorigHead",
        rotateY: -Math.PI / 2,
        minCamDistance: 10, maxCamDistance: 220,
        firstPersonPitchOffset: Math.PI * (16 / 180),
    },
    {
        name: "Manny",
        url: BASE + "./glb/UEPerson.glb",
        scale: 0.001,
        idleAnim: "idle",
        walkAnim: "walk",
        runAnim: "run",
        jumpAnim: ["jumpStart", "jumpLoop", "jumpEnd"],
        flyAnim: "fly",
        flyIdleAnim: "flyIdle",
        flyHoverForwardAnim: "flyHoverForward",
        flyHoverBackAnim: "flyHoverBack",
        flyHoverLeftAnim: "flyHoverLeft",
        flyHoverRightAnim: "flyHoverRight",
        flyHoverUpAnim: "flyHoverUp",
        flyHoverDownAnim: "flyHoverDown",
        headBoneName: null,
        firstPersonCameraOffset: [0, 25, 30],
        minCamDistance: 10, maxCamDistance: 220,
        firstPersonPitchOffset: 0,
        noGun: true,
    },
    {
        name: "Mob",
        url: BASE + "./glb/person3.glb",
        scale: 0.003,
        idleAnim: "idle",
        walkAnim: "walk",
        runAnim: "run",
        jumpAnim: "jump",
        flyAnim: "flying",
        flyIdleAnim: "flyidle",
        headBoneName: "mixamorigHead",
        minCamDistance: 10, maxCamDistance: 220,
        firstPersonPitchOffset: Math.PI * (10 / 180),
        rotateY: Math.PI,
        noGun: true,
    },
    {
        name: "AntMan",
        url: BASE + "./glb/person5.glb",
        scale: 0.001,
        idleAnim: "Idle_4",
        walkAnim: "Walking_3",
        runAnim: "Run_2",
        jumpAnim: "Jump_1",
        flyAnim: "flying",
        flyIdleAnim: "flyIdle",
        headBoneName: "mixamorigHead",
        minCamDistance: 10, maxCamDistance: 220,
        firstPersonPitchOffset: Math.PI * (10 / 180),
        rotateY: Math.PI,
        noGun: true,
    }
];
let selectedModelUrl = CHARACTER_LIST[2].url; // default Swat (index 2)

const PLAYER_MODEL = { ...CHARACTER_LIST[2] };

// Rifle anim map for remote players (clipName → rifleClipName)
const RIFLE_ANIM_MAP = { idle1: "rifle_idle", walk: "rifle_walk", run: "rifle_run", jump: "rifle_jump" };

// Per-bone hitbox defs (green wireframe when HITBOX_DEBUG=true)
const HITBOX_DEBUG = false;
const HITBOX_DEFS = [
    { bone: "mixamorigHead", w: 20, h: 22, d: 20, oy: 10, part: "head", dmg: 2.0 },
    { bone: "mixamorigSpine2", w: 38, h: 60, d: 24, oy: -15, part: "torso", dmg: 1.0 },
    { bone: "mixamorigLeftArm", w: 12, h: 65, d: 12, oy: 38, part: "arm", dmg: 0.75 },
    { bone: "mixamorigRightArm", w: 12, h: 65, d: 12, oy: 38, part: "arm", dmg: 0.75 },
    { bone: "mixamorigLeftUpLeg", w: 14, h: 68, d: 14, oy: 46, part: "leg", dmg: 0.75 },
    { bone: "mixamorigRightUpLeg", w: 14, h: 68, d: 14, oy: 46, part: "leg", dmg: 0.75 },
];
// upperAnim key → full clip name (full-body playback on remotes)
const UPPER_CLIP_MAP = { upper_aim: "rifle_idle_aim3", upper_shoot: "rifle_shoot3", upper_reload: "reload" };

// ==================== Scene vars ====================
let localPlayer = null;
let weapon = null;
let audioListener = null;
let gunShotBuffer = null;
let localShotSeq = 0;
let decalSystem = null;
const scene = new THREE.Scene();
let camera, renderer, controls;
const clock = new THREE.Clock();
const gltfLoader = new GLTFLoader();

// Local HP, name, death state, and K/D
let myHp = 100;
let isDead = false;
let myName = "";
let localKills = 0;
let localDeaths = 0;
let spawnIndex = 0; // current spawn index, incremented in init() and on respawn
let isChatting = false;
let lastChatTime = 0;
const CHAT_COOLDOWN = 1000; // send cooldown (ms)

// AntMan shrink-skill state
let antManIsSmall = false;
let antManIsScaling = false;
let antManScaleFrame = null;
const _lastHitterOf = new Map(); // targetId → attackerId, for kill credit
let lastAttackerOnMe = null;     // playerId of the last attacker on this player

const _nameAdj = ["Iron", "Ghost", "Shadow", "Storm", "Silent", "Rapid", "Neon", "Steel", "Dark", "Void"];
const _nameNoun = ["Wolf", "Fox", "Eagle", "Hawk", "Viper", "Tiger", "Bear", "Crow", "Lynx", "Cobra"];
// Random English combat name (adjective + noun)
function randomName() {
    return _nameAdj[Math.floor(Math.random() * _nameAdj.length)]
        + _nameNoun[Math.floor(Math.random() * _nameNoun.length)];
}

// Show the name modal; prefill last name/character from localStorage, always wait for confirm
function waitForName() {
    const savedName = localStorage.getItem("mp_name");
    const savedCharIdx = parseInt(localStorage.getItem("mp_char_idx") ?? "2");
    selectedModelUrl = CHARACTER_LIST[savedCharIdx]?.url ?? CHARACTER_LIST[2].url;

    // Set character avatar paths from BASE
    const charImgs = [
        BASE + "img/multiplayer/char_josh.png",
        BASE + "img/multiplayer/char_tommy.png",
        BASE + "img/multiplayer/char_swat.png",
        BASE + "img/multiplayer/char_manny.png",
        BASE + "img/multiplayer/char_mob.png",
        BASE + "img/multiplayer/char_antMan.png",
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

        // Restore last selected character
        cards.forEach(c => c.classList.remove("selected"));
        (cards[savedCharIdx] ?? cards[2]).classList.add("selected");

        // Character switch
        cards.forEach(card => card.addEventListener("click", () => {
            cards.forEach(c => c.classList.remove("selected"));
            card.classList.add("selected");
            selectedModelUrl = CHARACTER_LIST[parseInt(card.dataset.idx)]?.url ?? CHARACTER_LIST[2].url;
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

// Open chat input and pause game input
function openChat() {
    if (isChatting || isDead || !localPlayer) return;
    isChatting = true;
    localPlayer.offAllEvent();      // unbind first, then release pointer lock, to shrink the missed-event window
    document.exitPointerLock?.();
    const wrap = document.getElementById("chat-input-wrap");
    const input = document.getElementById("chat-input");
    wrap.style.display = "flex";
    input.value = "";
    const prefix = document.getElementById("chat-prefix");
    if (prefix) prefix.textContent = myName + ":";
    setTimeout(() => input.focus(), 20);
}

// Close chat input and restore game input
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

// Show a chat message on screen (keep at most 5; fade after 8s)
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

// Trigger local death: stop input, play death anim, push dead state to Firebase
function triggerDeath() {
    if (isDead) return;
    if (PLAYER_MODEL.noGun) return; // noGun characters have no death anim and ignore death
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

// Local respawn: reset HP, restore input, teleport to next spawn, push alive state to Firebase
function triggerRespawn() {
    isDead = false;
    myHp = 100;
    updateMyHPUI();
    document.getElementById("death-overlay").style.display = "none";

    // Advance to the next spawn point and teleport
    spawnIndex = (spawnIndex + 1) % SPAWN_POINTS.length;
    const respawnPos = SPAWN_POINTS[spawnIndex];
    const capsule = localPlayer._player?.getPlayerCapsule();
    if (capsule) capsule.position.copy(respawnPos);

    weapon?.resetAmmo();
    localPlayer.onAllEvent();
    localPlayer.playPlayerAnimationByName(PLAYER_MODEL.idleAnim, 0.3);
    sendState();
}

// ==================== Remote players ====================
const remotePlayers = new Map();

class RemotePlayer {
    constructor(id, charIdx = 2) {
        this.id = id; // remote player ID
        this.charIdx = charIdx; // character index
        this._charCfg = CHARACTER_LIST[charIdx] ?? CHARACTER_LIST[2]; // character config
        this.model = null; // model
        this.gunModel = null; // gun model
        this.mixer = null; // animation mixer
        this.actions = new Map(); // animation action map
        this.currentClip = null; // currently playing clip
        this.targetPos = new THREE.Vector3(); // target position
        this.targetQuat = new THREE.Quaternion(); // target rotation
        this.loaded = false; // whether load finished
        this._isDead = false; // whether dead
        this.kills = 0; // kill count
        this.deaths = 0; // death count
        this.name = ""; // display name
        this.nameLabelEl = null; // name label element
        this._headBone = null; // head bone
        this._gunSound = null; // gun audio
        this._lastShotSeq = null; // last shot sequence
    }

    // Async load model, anims, hitboxes, gun; set loaded = true when done
    async load() {
        // Load the model for this character index
        const modelUrl = CHARACTER_LIST[this.charIdx]?.url ?? CHARACTER_LIST[2].url;
        const gltf = await gltfLoader.loadAsync(modelUrl);
        this.model = gltf.scene;
        // Do not set scale here; keep natural size until the bounding box is measured
        this.model.visible = false;
        scene.add(this.model);

        // Register all clips (standard + rifle)
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

        // noGun characters skip hitboxes (not in gun hit tests)
        this._hitboxes = [];
        if (!this._charCfg.noGun) {
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
                mesh.layers.enable(2); // layer 2: visible to weapon rays
                mesh.visible = HITBOX_DEBUG;
                mesh.position.set(0, def.oy, 0);
                bone.add(mesh);
                this._hitboxes.push(mesh);
            }

            // Load the gun model onto the right hand
            await this._loadGun();

            // Attach spatial gunshot audio (distance attenuation)
            if (audioListener && gunShotBuffer && this.gunModel) {
                this._gunSound = new THREE.PositionalAudio(audioListener);
                this._gunSound.setBuffer(gunShotBuffer);
                this._gunSound.setRefDistance(10);
                this._gunSound.setVolume(1.0);
                this.gunModel.add(this._gunSound);
            }
        }

        // Play the idle clip and update bone matrices
        this._switchAnim(this._charCfg.idleAnim);
        this.mixer.update(0);
        this.model.updateMatrixWorld(true);

        // Normalize model height to 180 units, then multiply by config scale
        const _bboxSize = new THREE.Vector3();
        new THREE.Box3().setFromObject(this.model).getSize(_bboxSize);
        const _modelScale = _bboxSize.y > 0 ? (180 / _bboxSize.y) : 1;
        this._baseScale = _modelScale * this._charCfg.scale;
        this.model.scale.setScalar(this._baseScale);

        this.model.traverse(child => {
            if (child.isMesh) {
                child.material.metalness = 0.0;
                child.material.roughness = 1.0;
            }
        });

        this.loaded = true;

        this._headBone = this.model.getObjectByName(this._charCfg.headBoneName) ?? null;
        this._buildNameLabel();
        this._buildChatBubble();
    }

    // Load the AK47 and attach it to the right-hand bone
    async _loadGun() {
        const gltf = await gltfLoader.loadAsync(BASE + "glb/ak47.glb");
        this.gunModel = gltf.scene;
        this.gunModel.scale.setScalar(0.1);
        this.gunModel.position.set(1, 26.5, 2);

        // Align barrel direction (same as WeaponController)
        const alignQ = new THREE.Quaternion().setFromUnitVectors(
            new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0)
        );
        const rollQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
        this.gunModel.quaternion.copy(rollQ.multiply(alignQ));
        this.gunModel.visible = false;

        const rightHand = this.model.getObjectByName("mixamorigRightHand");
        if (rightHand) rightHand.add(this.gunModel);
    }

    // Apply a Firebase state packet: pos, rot, anim, name (about every 50ms)
    applyState(state) {
        if (!this.model) return; // load() not finished yet, skip

        if (this._isDead) {
            if (!state.dead) {
                // Remote respawned: clear dead, switch to idle, resume sync
                this._isDead = false;
                this._switchAnim(this._charCfg.idleAnim);
            } else {
                return; // still dead, ignore
            }
        }

        // Death state: snap to death pose, play death anim, ignore further updates
        if (state.dead && !this._isDead) {
            this._isDead = true;
            this.targetPos.set(state.x, state.y, state.z);
            this.targetQuat.set(state.qx, state.qy, state.qz, state.qw);
            this._switchAnim("death");
            // Credit a local kill if we landed the last hit
            if (_lastHitterOf.get(this.id) === playerId) {
                localKills++;
                _lastHitterOf.delete(this.id);
                updateKillBar();
            }
            // Show kill feed (killedBy may be local or another remote)
            const kbId = state.killedBy;
            const killerName = kbId === playerId
                ? myName
                : (remotePlayers.get(kbId)?.name ?? "?");
            addKillFeedEntry(killerName, this.name || this.id);
            return;
        }

        if (state.kills !== undefined) { this.kills = state.kills; updateKillBar(); }
        if (state.deaths !== undefined) this.deaths = state.deaths;

        // AntMan scale sync
        if (state.scale !== undefined && this._baseScale !== undefined) {
            const ratio = state.scale / this._charCfg.scale;
            this.model.scale.setScalar(this._baseScale * ratio);
        }

        this.targetPos.set(state.x, state.y, state.z);
        this.targetQuat.set(state.qx, state.qy, state.qz, state.qw);

        // Remote gunshot: record baseline on first packet, play spatial audio when the counter increases
        if (state.shotSeq !== undefined) {
            if (this._lastShotSeq === null) {
                this._lastShotSeq = state.shotSeq;
            } else if (state.shotSeq > this._lastShotSeq && this._gunSound) {
                if (this._gunSound.isPlaying) this._gunSound.stop();
                this._gunSound.play();
                this._lastShotSeq = state.shotSeq;
            }
        }

        // Gun model visibility
        if (this.gunModel) this.gunModel.visible = (state.weapon === "primary");

        // Resolve clip: upperAnim wins, else pick by weapon mode
        const resolvedClip = state.upperAnim
            ? (UPPER_CLIP_MAP[state.upperAnim] ?? state.anim)
            : (state.weapon === "primary" ? (RIFLE_ANIM_MAP[state.anim] ?? state.anim) : state.anim);

        if (resolvedClip && resolvedClip !== this.currentClip) this._switchAnim(resolvedClip);

        if (!this.model.visible) {
            // Snap on first show so the model does not lerp in from the origin
            this.model.position.copy(this.targetPos);
            this.model.quaternion.copy(this.targetQuat);
            this.model.visible = true;
        }

        if (state.name && state.name !== this.name) {
            this.name = state.name;
            if (this.nameLabelEl) this.nameLabelEl.textContent = state.name;
        }
    }

    // Crossfade to the given clip (0.2s)
    _switchAnim(clipName) {
        const next = this.actions.get(clipName);
        if (!next) return;
        const prev = this.currentClip ? this.actions.get(this.currentClip) : null;
        if (prev && prev !== next) prev.fadeOut(0.2);
        next.reset().setEffectiveWeight(1).fadeIn(0.2);
        this.currentClip = clipName;
    }

    // Create the floating name DOM label
    _buildNameLabel() {
        const el = document.createElement("div");
        el.className = "player-name-label";
        el.textContent = this.name || "";
        document.body.appendChild(el);
        this.nameLabelEl = el;
    }

    _buildChatBubble() {
        const el = document.createElement("div");
        el.className = "player-chat-bubble";
        el.appendChild(document.getElementById("chat-bubble-tpl").content.cloneNode(true));
        document.body.appendChild(el);
        this.chatBubbleEl = el;
        this._chatTimer = null;
        this._chatActive = false;
    }

    showChatBubble(text) {
        if (!this.chatBubbleEl) return;
        this.chatBubbleEl.querySelector(".player-chat-text").textContent =
            text.length > 10 ? text.slice(0, 10) + "…" : text;
        this._chatActive = true;
        clearTimeout(this._chatTimer);
        this._chatTimer = setTimeout(() => {
            this._chatActive = false;
            if (this.chatBubbleEl) this.chatBubbleEl.style.display = "none";
        }, 5000);
    }

    // Per frame: lerp pos/rot, tick the mixer
    tick(delta) {
        if (!this.loaded || !this.model) return;
        this.model.position.lerp(this.targetPos, 0.3);
        this.model.quaternion.slerp(this.targetQuat, 0.3);
        this.mixer?.update(delta);
    }

    // Per frame: project the name label to screen (world offset above the head bone; perspective scales it)
    updateNameLabel(camera, renderer) {
        if (!this.nameLabelEl || !this.model?.visible) {
            if (this.nameLabelEl) this.nameLabelEl.style.display = "none";
            if (this.chatBubbleEl) this.chatBubbleEl.style.display = "none";
            return;
        }
        const worldPos = new THREE.Vector3();
        if (this._headBone) {
            this._headBone.updateWorldMatrix(true, false);
            this._headBone.getWorldPosition(worldPos);
            // Add offset in world space
            worldPos.y += this._charCfg.scale * 30;
        } else {
            this.model.getWorldPosition(worldPos);
            worldPos.y += this._charCfg.scale * 230;
        }
        const s = worldPos.clone().project(camera);
        if (s.z > 1) {
            this.nameLabelEl.style.display = "none";
            if (this.chatBubbleEl) this.chatBubbleEl.style.display = "none";
            return;
        }
        const x = (s.x * 0.5 + 0.5) * renderer.domElement.clientWidth;
        const y = (-s.y * 0.5 + 0.5) * renderer.domElement.clientHeight;
        this.nameLabelEl.style.display = "block";
        this.nameLabelEl.style.left = `${x}px`;
        this.nameLabelEl.style.top = `${y}px`;
        if (this.chatBubbleEl) {
            this.chatBubbleEl.style.display = this._chatActive ? "block" : "none";
            this.chatBubbleEl.style.left = `${x}px`;
            this.chatBubbleEl.style.top = `${y - 20}px`;
        }
    }

    // Dispose geometry/materials/DOM and remove the model (called when the player leaves)
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
        clearTimeout(this._chatTimer);
        this.chatBubbleEl?.remove();
        this.chatBubbleEl = null;
    }
}

// ==================== Firebase state sync ====================
const _sendPos = new THREE.Vector3();
const _sendQuat = new THREE.Quaternion();
let lastSendTime = 0;
const SEND_INTERVAL = 17;
let currentUpperKey = null; // track upper-body anim key

// Push local player state to Firebase (pos, rot, anim, HP, dead)
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
        scale: localPlayer._player?.playerModelConfig.scale,
        kills: localKills,
        deaths: localDeaths,
        name: myName,
        shotSeq: localShotSeq,
        t: Date.now(),
    });
}

// Write a damage record to the target's hit queue for the other client to consume
function onHitPlayer(targetId, damage) {
    _lastHitterOf.set(targetId, playerId);
    set(ref(db, `rooms/${roomId}/hits/${targetId}/${Date.now()}`), { damage, by: playerId });
}

const PLAYER_STALE_MS = 60000; // no heartbeat past this threshold counts as offline

// Init Firebase listeners: player sync, stale cleanup, incoming hits
function initFirebaseSync() {
    // Remove leftover players that did not disconnect cleanly
    get(ref(db, `rooms/${roomId}/players`)).then(snap => {
        if (!snap.exists()) return;
        const now = Date.now();
        for (const [id, state] of Object.entries(snap.val())) {
            if (id !== playerId && now - (state.t ?? 0) > PLAYER_STALE_MS) {
                remove(ref(db, `rooms/${roomId}/players/${id}`));
            }
        }
    });

    // Player state listener
    const roomRef = ref(db, `rooms/${roomId}/players`);
    onValue(roomRef, snapshot => {
        const data = snapshot.val() ?? {};
        for (const [id, state] of Object.entries(data)) {
            if (id === playerId) continue;
            // Heartbeat timeout: delete from Firebase, which triggers local dispose
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
                })
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

    // Listen for chat (only messages after we joined)
    const joinTime = Date.now();
    const chatRef = ref(db, `rooms/${roomId}/chat`);
    onChildAdded(chatRef, snap => {
        const { name, text, t } = snap.val();
        if (t < joinTime - 3000) return; // drop history older than 3s before join
        addChatMessage(name, text);
        const senderId = snap.key.replace(/^\d+_/, '');
        remotePlayers.get(senderId)?.showChatBubble(text);
        if (Date.now() - t > 30000) remove(snap.ref); // delete messages older than 30s
    });

    // Listen for other players' decals (skip own, ignore >3s before join, delete after read)
    const decalsRef = ref(db, `rooms/${roomId}/decals`);
    onChildAdded(decalsRef, snap => {
        const d = snap.val();
        if (!d || snap.key?.endsWith(`_${playerId}`)) { remove(snap.ref); return; }
        if (d.t < joinTime - 3000) { remove(snap.ref); return; }
        decalSystem?.spawnAtPoint(new THREE.Vector3(d.x, d.y, d.z), new THREE.Vector3(d.nx, d.ny, d.nz));
        remove(snap.ref);
    });

    // Listen for hits on this player
    const myHitsRef = ref(db, `rooms/${roomId}/hits/${playerId}`);
    onChildAdded(myHitsRef, snap => {
        const { damage, by } = snap.val();
        if (by) lastAttackerOnMe = by;
        // noGun characters are immune to gun damage
        if (!isDead && !PLAYER_MODEL.noGun) {
            myHp = Math.max(0, myHp - damage);
            updateMyHPUI();
            if (myHp <= 0) triggerDeath();
        }
        remove(snap.ref); // delete after read
    });
}

// ==================== UI ====================
// Join/leave notice (shares the kill-feed container, fades after 5s)
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

// Add a kill-feed row (keep at most 3; auto-remove after 10s)
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

// Init UI (mp-panel removed; empty stub kept for call sites)
function initUI() { }

// Update online-count display
function updateCountUI() {
    const el = document.getElementById("mp-count");
    if (el) el.textContent = String(1 + remotePlayers.size);
}

// Update local avatar HP fill and number
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

// Show the room-full overlay and block joining
function showRoomFull() {
    const overlay = document.getElementById("room-full-overlay");
    if (overlay) {
        overlay.style.display = "flex";
    } else {
        alert(`Room is full (max ${MAX_PLAYERS} players). Try another room.`);
    }
    window.hideLoader?.();
}

// ==================== Soft repulsion ====================
const _repDir = new THREE.Vector3();
// Soft repulsion: keep the local player from overlapping remotes
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

// ==================== AntMan shrink skill ====================
function antManAnimateToScale(targetScale, duration = 1) {
    if (antManScaleFrame !== null) { cancelAnimationFrame(antManScaleFrame); antManScaleFrame = null; }
    antManIsScaling = true;
    const fromScale = localPlayer?._player?.playerModelConfig.scale ?? targetScale;
    const startTime = performance.now();
    const tick = (now) => {
        const t = Math.min((now - startTime) / (duration * 1000), 1);
        localPlayer?._player?.setPlayerScale(fromScale + (targetScale - fromScale) * t);
        if (t < 1) { antManScaleFrame = requestAnimationFrame(tick); }
        else { antManScaleFrame = null; antManIsScaling = false; }
    };
    antManScaleFrame = requestAnimationFrame(tick);
}

// ==================== Render loop ====================
// Refresh the top kill bar: local kills on the left, room-best on the right
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

// Refresh the scoreboard (kills desc, then deaths asc)
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

// Main render loop (driven by renderer.setAnimationLoop)
let prevGunEngaged = false;
function animate() {
    const delta = Math.min(clock.getDelta(), 0.05);
    const elapsed = clock.getElapsedTime();

    if (localPlayer && (weapon || PLAYER_MODEL.noGun)) {
        if (!isDead) {
            const spineIK = localPlayer.spineIK;
            const gunEngaged = weapon?.isGunEngaged() ?? false;

            if (gunEngaged !== prevGunEngaged) {
                localPlayer.setThirdMouseMode(gunEngaged ? 5 : 1);
                prevGunEngaged = gunEngaged;
            }

            if (gunEngaged) spineIK?.restoreBones();
            localPlayer.update(delta);

            // Skip SpineIK while chatting so a leaked mousemove after unlocking the pointer cannot snap the upper body
            if (gunEngaged && !isChatting) {
                localPlayer.applyHipsCorrection();
                localPlayer.getIsFirstPerson()
                    ? spineIK?.applyAim1P(camera, localPlayer.pitchTarget1P)
                    : spineIK?.applyAim3P(camera, true);
            }

            weapon?.update(elapsed, delta);
            applyRepulsion();

            const now = performance.now();
            if (now - lastSendTime > SEND_INTERVAL) { lastSendTime = now; sendState(); }
        } else {
            // While dead, only tick the mixer; do not run the state machine
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

// ==================== Init ====================
// Init scene, local player, weapons, and Firebase sync
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

    // Environment lighting
    new HDRLoader().load(
        "./img/2.hdr",
        (texture) => {
            texture.mapping = THREE.EquirectangularReflectionMapping;
            scene.environment = texture;
        },
        undefined,
        (err) => {
            console.warn("Environment HDR load failed:", err);
        }
    );
    // Background
    new HDRLoader().load(
        "./img/3.hdr",
        (texture) => {
            texture.mapping = THREE.EquirectangularReflectionMapping;
            scene.background = texture;
        },
        undefined,
        (err) => {
            console.warn("Background HDR load failed:", err);
        }
    );

    // GLTF loader (for colliders)
    const draco = new DRACOLoader();
    draco.setDecoderPath("https://unpkg.com/three@0.180.0/examples/jsm/libs/draco/");
    gltfLoader.setDRACOLoader(draco);
    const ktx2 = new KTX2Loader();
    ktx2.setTranscoderPath("https://unpkg.com/three@0.180.0/examples/jsm/libs/basis/");
    ktx2.detectSupport(renderer);
    gltfLoader.setKTX2Loader(ktx2);

    // 3DGS scene
    const spark = new SparkRenderer({ renderer });
    scene.add(spark);
    const splatMesh = new SplatMesh({
        url: SPLAT_URL,
        onProgress: (e) => window.setLoaderProgress?.(e.loaded, e.total),
        onLoad: (mesh) => { mesh.rotateZ(Math.PI); },
    });
    scene.add(splatMesh);

    // White ground plane
    const groundMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(100, 100)
    );
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.position.y = -0.05;

    // Invisible colliders
    const colliderGltf = await gltfLoader.loadAsync(COLLIDER_URL);
    const sceneModel = colliderGltf.scene;
    sceneModel.visible = false;
    scene.add(sceneModel);

    // Check room occupancy and assign a spawn from the current count
    const snap = await get(ref(db, `rooms/${roomId}/players`));
    const existingCount = snap.exists() ? Object.keys(snap.val()).length : 0;
    if (existingCount >= MAX_PLAYERS) { showRoomFull(); return; }
    spawnIndex = existingCount % SPAWN_POINTS.length;
    const spawnPos = SPAWN_POINTS[spawnIndex];
    camera.position.copy(spawnPos);
    controls.target.copy(spawnPos);

    // Local player (LocalPlayer wrapper)
    localPlayer = new LocalPlayer({ scene, camera, controls });
    await localPlayer.init({
        playerModelConfig: PLAYER_MODEL,
        initPos: spawnPos,
        minCamDistance: 10,
        maxCamDistance: 220,
        enableOverShoulderView: true,
        staticCollider: [sceneModel, groundMesh],
    });

    // Set local player materials
    localPlayer.getPlayerModel()?.traverse((child) => {
        if (child.isMesh) {
            child.material.metalness = 0.0;
            child.material.roughness = 1.0;
        }
    });

    localPlayer.onViewChange = (isFirstPerson) => {
        if (!localPlayer._player.playerModelHead) {
            if (isFirstPerson) {
                // Hide the character model
                localPlayer._player.getPlayerModel().visible = false;
            } else {
                // Show the character model
                localPlayer._player.getPlayerModel().visible = true;
            }
        }
    };

    // Print bone names to debug SpineIK mismatches (safe to remove later)
    const boneNames = [];
    localPlayer.getPlayerModel()?.traverse(b => { if (b.isBone) boneNames.push(b.name); });

    // Track upper-body anim key (monkey-patch; do not edit LocalPlayer)
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

    // Audio
    audioListener = new THREE.AudioListener();
    camera.add(audioListener);

    // VFX
    const effects = new ShootingEffects(scene, { listener: audioListener, flashScale: 0.015, smokeSize: 0.08 });
    await effects.load(
        BASE + "img/muzzle_flash.png",
        BASE + "img/smoke.png",
        BASE + "audio/gun_shot.mp3",
        BASE + "audio/reload.mp3",
    );
    gunShotBuffer = effects._fireSound?.buffer ?? null;

    // Bullet holes
    decalSystem = new DecalSystem(scene, 60, 0.025);
    await decalSystem.loadMaterials(["img/bullet_hole2.png"], BASE);
    decalSystem.onSpawn = (p, n) => {
        set(ref(db, `rooms/${roomId}/decals/${Date.now()}_${playerId}`), {
            x: +p.x.toFixed(4), y: +p.y.toFixed(4), z: +p.z.toFixed(4),
            nx: +n.x.toFixed(4), ny: +n.y.toFixed(4), nz: +n.z.toFixed(4),
            t: Date.now(),
        });
    };

    // Weapon controller (noGun characters skip the weapon system)
    if (!PLAYER_MODEL.noGun) {
        weapon = new WeaponController({ scene, camera, localPlayer, decalSystem, effects, hud, zombieManager: null });
        await weapon.load(gltfLoader, BASE);
        weapon.setupAnimations();
        weapon.bindInput();

        const _origFireOnce = weapon._fireOnce.bind(weapon);
        weapon._fireOnce = function () { localShotSeq++; _origFireOnce(); };
    }

    // Register death clip: LoopOnce + clamp last frame; show death overlay when finished (skip for noGun)
    if (!PLAYER_MODEL.noGun) {
        localPlayer.registerAnimation("death", "death", {
            loop: false,
            clampWhenFinished: true,
            timeScale: 2,
            onFinished: () => { document.getElementById("death-overlay").style.display = "flex"; },
        });
    }

    // Death overlay button
    document.getElementById("btn-respawn").addEventListener("click", triggerRespawn);

    // Inject the multiplayer hit callback (skip if noGun / no weapon)
    if (weapon) {
        weapon.onHitPlayer = onHitPlayer;
        localPlayer.setGunEngagedGetter(() => weapon.isGunEngaged());
        hud.update(weapon.getMode());
    }

    document.addEventListener("contextmenu", e => e.preventDefault());

    // // Click to log ray/collider hit points
    // const _clickRaycaster = new THREE.Raycaster();
    // const _clickMouse = new THREE.Vector2();
    // renderer.domElement.addEventListener("click", e => {
    //     if (document.pointerLockElement) return; // skip while pointer-locked (in gameplay)
    //     const rect = renderer.domElement.getBoundingClientRect();
    //     _clickMouse.set(
    //         ((e.clientX - rect.left) / rect.width) * 2 - 1,
    //         -((e.clientY - rect.top) / rect.height) * 2 + 1,
    //     );
    //     _clickRaycaster.setFromCamera(_clickMouse, camera);
    //     const hits = _clickRaycaster.intersectObject(sceneModel, true);
    //     if (hits.length > 0) {
    //         const { x, y, z } = hits[0].point;
    //         console.log(`[ray hit] x=${x.toFixed(4)}, y=${y.toFixed(4)}, z=${z.toFixed(4)}`);
    //     }
    // });

    // Enter opens/sends chat; Esc cancels
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

    // Tab shows/hides the scoreboard (ignored while chatting)
    const scoreboardEl = document.getElementById("scoreboard");
    document.addEventListener("keydown", e => {
        if (isChatting) return;
        if (e.key === "Tab") { e.preventDefault(); updateScoreboard(); scoreboardEl.style.display = "flex"; }
    });
    document.addEventListener("keyup", e => {
        if (e.key === "Tab") scoreboardEl.style.display = "none";
    });

    // Z: AntMan shrink skill (AntMan only)
    document.addEventListener("keydown", e => {
        if (e.code !== "KeyZ" || PLAYER_MODEL.name !== "AntMan") return;
        if (antManIsScaling || isDead || isChatting) return;
        antManIsSmall = !antManIsSmall;
        const normalScale = CHARACTER_LIST[5].scale;
        antManAnimateToScale(antManIsSmall ? normalScale / 9 : normalScale, 1);
    });

    // Firebase sync
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

    // Wait until the Gaussian splat mesh is loaded, then hide the loader
    await splatMesh.initialized.catch(() => { });
    window.hideLoader?.();
}

waitForName().then(() => {
    const entry = CHARACTER_LIST.find(c => c.url === selectedModelUrl) ?? CHARACTER_LIST[2];
    Object.assign(PLAYER_MODEL, entry);
    return init();
});
