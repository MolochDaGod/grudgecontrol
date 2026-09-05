import { MathUtils, Quaternion, Vector3, AnimationMixer, AnimationClip, LoopOnce, LoopRepeat } from "three";
import { playerController } from "../../../src/playerController";
import { SpineIK } from "./spineIK.js";

const spineBoneNames = ["mixamorigSpine", "mixamorigSpine1", "mixamorigSpine2"];

// Locomotion states used to decide isMoving
const locomotionStates = new Set([
    "idle",
    "walking",
    "walking_backward",
    "left_walking",
    "right_walking",
    "running",
    "jumping",
    "flyidle",
    "flying",
]);

// Locomotion states that allow combat (after upper-body split, run can still fire/reload)
const combatAllowedLocomotion = new Set([
    "idle", "walking", "walking_backward", "left_walking", "right_walking", "running",
]);

const minPitchAngle = -Math.PI * (60 / 180); // Min pitch (look down)
const maxPitchAngle = Math.PI * (40 / 180);  // Max pitch (look up)

export class LocalPlayer {
    constructor({ scene, camera, controls }) {
        // ==================== Scene refs ====================
        this._scene = scene;
        this._camera = camera;
        this._controls = controls;

        // ==================== Core objects ====================
        this._player = null; // playerController instance
        this.spineIK = null; // Spine IK instance

        // ==================== Motion state ====================
        this.pitchTarget1P = 0; // First-person pitch accumulator
        this.isMoving = false; // Whether this frame is a moving state (updated by onAnimationChange)
        this._locomotionState = "idle"; // Current locomotion clip state name

        // ==================== Config ====================
        this._mouseSensitivity = 5;
        this._firstPersonPitchOffset = 0; // First-person camera pitch offset

        // ==================== External inject ====================
        this._isGunEngagedFn = null; // Injected by WeaponController — whether a gun is held

        // ==================== Upper-body animation layer ====================
        this._upperMixer = null;          // Upper-body AnimationMixer (root = model root)
        this._upperBodyBoneNames = null;  // Names of bones at/above the spine, used to filter partial clips
        this._upperBodyBones = null;      // Spine-and-above bone refs (cached to avoid getObjectByName each frame)
        this._upperBoneSnapshots = null;  // Snapshot of main-mixer bone values
        this._upperActions = new Map();   // key → AnimationAction
        this._upperState = null;          // Current upper-body action

        // ==================== Walk-aim correction ====================
        this._idleHipsQ = null; // Idle hips local quaternion; used while walking to cancel hips walk offset
    }

    // ==================== Init ====================

    // Init playerController, bone IK, and event callbacks
    async init(config) {
        const { mouseSensitivity = 5, ...rest } = config;
        this._mouseSensitivity = mouseSensitivity;
        this._firstPersonPitchOffset = config.playerModelConfig?.firstPersonPitchOffset
            ?? this._firstPersonPitchOffset;

        this._player = new playerController();
        await this._player.init({
            scene: this._scene,
            camera: this._camera,
            controls: this._controls,
            mouseSensitivity,
            ...rest,
        });

        // Bind spine & head bones
        const model = this._player.getPlayerModel();
        const spineBones = spineBoneNames
            .map((n) => model?.getObjectByName(n))
            .filter(Boolean);
        const headBoneName = config.playerModelConfig?.headBoneName;
        const headBone = model?.getObjectByName(headBoneName) ?? null;
        this.spineIK = new SpineIK(spineBones, headBone);

        // Upper-body mixer: root = model root (same as main mixer — most reliable path resolution)
        // Partial clips (tracks for spine-and-above bones only) limit the write range.
        // After the main mixer updates, the upper mixer overwrites spine-and-above bones;
        // the lower body keeps locomotion values.
        if (spineBones.length > 0) {
            this._upperBodyBoneNames = new Set();
            this._upperBodyBones = [];
            spineBones[0].traverse(b => {
                this._upperBodyBoneNames.add(b.name);
                this._upperBodyBones.push(b);
            });
            // Preallocate snapshot array to avoid per-frame GC
            this._upperBoneSnapshots = this._upperBodyBones.map(() => new Quaternion());
            this._upperMixer = new AnimationMixer(model);
        }

        // Listen for animation switches and update isMoving
        this._player.onAnimationChange = (name) => {
            if (locomotionStates.has(name)) this._locomotionState = name;
            this.isMoving =
                name === "walking" ||
                name === "left_walking" ||
                name === "right_walking" ||
                name === "walking_backward" ||
                name === "running";
        };

        // Take over first-person mouse look
        this._player.onTowardChange = (dx, dy, speed) => {
            if (!this._player.getIsFirstPerson()) return;

            // Yaw
            this._player.getPlayerCapsule().rotateY(
                -dx * speed * this._mouseSensitivity
            );

            // Pitch accumulator
            this.pitchTarget1P = MathUtils.clamp(
                this.pitchTarget1P + (-dy * speed * this._mouseSensitivity),
                minPitchAngle,
                maxPitchAngle
            );

            // Drive the camera directly when unarmed
            if (!this._isGunEngagedFn?.()) {
                this._camera.rotation.x = MathUtils.clamp(
                    this._camera.rotation.x + (-dy * speed * this._mouseSensitivity),
                    minPitchAngle,
                    maxPitchAngle
                );
            }
        };

        // View toggle
        this._player.onViewChange = (isFirstPerson) => {
            if (isFirstPerson) {
                if (headBoneName) {
                    console.log(headBoneName);
                    this._camera.position.z = 8;
                    this._camera.position.x = 15;
                } else {
                    this._camera.position.z = 0;
                    this._camera.position.x = 0;
                }
                this._camera.rotation.x = this._firstPersonPitchOffset;
                this._player.setEnableToward(false);
                // Sync controller pitch
                const targetPolar = this._controls.getPolarAngle() - Math.PI / 2 + Math.PI * (7.5 / 180);
                this.pitchTarget1P = targetPolar;
                // Yaw offset
                this._player.getPlayerCapsule().rotateY(-Math.PI * (17 / 180));
            } else {
                this._player.setEnableToward(true);
                // Refresh animation once while aiming so bones snap back
                if (this._player.getCurrentPlayerAnimationName().includes("rifle_idle_aim")) {
                    this._player.playAnimation("idle");
                }
                // Sync first-person pitch
                const targetPolar = Math.PI / 2 + this.pitchTarget1P - Math.PI * (7.5 / 180);
                this._controls.minPolarAngle = targetPolar;
                this._controls.maxPolarAngle = targetPolar;
                this._controls.update();
                this._controls.minPolarAngle = minPitchAngle + Math.PI / 2;
                this._controls.maxPolarAngle = maxPitchAngle + Math.PI / 2;
                // Yaw offset
                const delta = Math.PI * (17 / 180);
                const offset = this._camera.position.clone().sub(this._controls.target);
                offset.applyAxisAngle(new Vector3(0, 1, 0), delta);
                this._camera.position.copy(this._controls.target).add(offset);
                this._controls.update();
            }
        };

        // Clamp third-person pitch
        this._controls.minPolarAngle = minPitchAngle + Math.PI / 2;
        this._controls.maxPolarAngle = maxPitchAngle + Math.PI / 2;
    }

    // ==================== External inject ====================

    // Injected by WeaponController so 1P pitch drive knows whether a gun is held
    setGunEngagedGetter(fn) {
        this._isGunEngagedFn = fn;
    }

    // ==================== Main loop ====================

    // Drive animation and physics each frame
    // dt must come from the main loop; the upper mixer updates after the main mixer so it can overwrite bones
    update(dt) {
        this._player?.update(dt);

        if (this._upperMixer && dt != null) {
            const ua = this._upperState;
            if (!ua) return;

            // Three.js PropertyMixer.apply() has a change-detection optimization: setValue()
            // is only called when accu0 ≠ accu1. For clips with identical consecutive frames,
            // the two accu buffers stay equal, so setValue() is skipped and the main mixer's
            // locomotion pose leaks through. Fix: fill both accu buffers with NaN before
            // each update so the comparison always fails and setValue() runs every frame,
            // ensuring the upper-body override takes effect.
            if (ua._propertyBindings) {
                for (const pm of ua._propertyBindings) {
                    if (pm?.buffer) {
                        const s = pm.valueSize;
                        pm.buffer.fill(NaN, s, s * 3); // dirty accu0 + accu1
                    }
                }
            }
            this._upperMixer.update(dt);
        }
    }

    // ==================== Upper-body animation layer ====================

    // Read the hips quaternion from frame t=0 of the named clip
    initIdleHipsQ(clipName) {
        const clip = this._player?.animation?.clips?.find(c => c.name === clipName);
        if (!clip) { console.warn(`initIdleHipsQ: clip not found "${clipName}"`); return; }
        const track = clip.tracks.find(t => t.name === 'mixamorigHips.quaternion');
        if (!track || track.values.length < 4) return;
        this._idleHipsQ = new Quaternion(track.values[0], track.values[1], track.values[2], track.values[3]);
    }

    // Register a clip on the upper-body mixer
    registerUpperAnimation(key, clipName, opts = {}) {
        if (!this._upperMixer || !this._upperBodyBoneNames) return;
        const clips = this._player?.animation?.clips;
        if (!clips) return;
        const clip = clips.find(c => c.name === clipName);
        if (!clip) { console.warn(`registerUpperAnimation: clip not found "${clipName}"`); return; }

        // Keep only tracks for bones at/above the spine; drop the rest (hips, legs, etc.)
        const upperTracks = clip.tracks.filter(t => {
            const boneName = t.name.split('.')[0];
            return this._upperBodyBoneNames.has(boneName);
        });
        const partialClip = new AnimationClip(clip.name + '_upper_' + key, clip.duration, upperTracks);

        const action = this._upperMixer.clipAction(partialClip);
        action.setLoop(opts.loop === false ? LoopOnce : LoopRepeat, Infinity);
        action.clampWhenFinished = opts.clampWhenFinished ?? false;
        const ts = opts.duration ? clip.duration / opts.duration : (opts.timeScale ?? 1);
        action.setEffectiveTimeScale(ts);
        action.enabled = true;
        action.setEffectiveWeight(0);
        this._upperActions.set(key, action);

        if (opts.onFinished) {
            this._upperMixer.addEventListener("finished", (ev) => {
                if (ev.action === action) opts.onFinished();
            });
        }
    }

    // Play an upper-body clip (overwrites spine-and-above bones only)
    playUpperBody(key, opts = {}) {
        if (!this._upperMixer) return;
        const next = this._upperActions.get(key);
        if (!next) { console.warn(`playUpperBody: "${key}" is not registered`); return; }

        const fade = opts.fade ?? 0.18;
        const prev = this._upperState;

        if (!opts.force && prev === next) return;

        // Weight 1 immediately so the override covers the main mixer from frame 0
        if (prev && prev !== next) prev.fadeOut(fade);

        next.reset();
        next.setEffectiveWeight(1);
        next.play();

        this._upperState = next;
    }

    // While walking/running, correct spine[0] quaternion to cancel hips walk-rotation offset
    // so spine0 world facing matches idle (idle hips × spine_local)
    applyHipsCorrection() {
        if (!this._idleHipsQ || !this.spineIK?.spineBones?.length) return;
        const hipsBone = this._player?.getPlayerModel()?.getObjectByName("mixamorigHips");
        if (!hipsBone) return;

        // correction = hips_walk_local⁻¹ × hips_idle_local
        const correction = new Quaternion().copy(hipsBone.quaternion).invert().multiply(this._idleHipsQ);
        const spine0 = this.spineIK.spineBones[0];
        spine0.quaternion.premultiply(correction);
        spine0.updateWorldMatrix(false, false);
    }

    // Stop upper-body animation so full-body (lower-body) animation takes over completely
    stopUpperBody(fade = 0.18) {
        if (!this._upperState) return;
        this._upperState.fadeOut(fade);
        this._upperState = null;
    }

    // ==================== Helpers ====================

    isCombatLocomotionAllowed() { return combatAllowedLocomotion.has(this._locomotionState); }

    // ==================== playerController proxy ====================

    getIsFirstPerson() { return this._player?.getIsFirstPerson() ?? false; }
    getIsFlying() { return this._player?.getIsFlying() ?? false; }
    getPosition() { return this._player?.getPosition?.() ?? null; }
    getFirstPersonPitchOffset() { return this._firstPersonPitchOffset; }
    getPlayerModel() { return this._player?.getPlayerModel(); }
    getCollider() { return this._player?.getCollider?.() ?? null; }
    getCenterScreenRaycastHit() { return this._player?.getCenterScreenRaycastHit() ?? null; }
    playAnimation(name, opts) { return this._player?.playAnimation(name, opts); }
    registerAnimation(key, clipName, opts) { return this._player?.registerAnimation(key, clipName, opts); }
    registerLocomotionSet(...a) { return this._player?.registerLocomotionSet(...a); }
    switchLocomotionSet(name) { return this._player?.switchLocomotionSet(name); }
    setMaxCamDistance(d) { return this._player?.setMaxCamDistance(d); }
    setPlayerSpeed(s) { return this._player?.setPlayerSpeed(s); }
    setEnableToward(v) { return this._player?.setEnableToward(v); }
    setThirdMouseMode(mode) { return this._player?.setThirdMouseMode(mode); }
    onAllEvent() { return this._player?.onAllEvent(); }
    offAllEvent() { return this._player?.offAllEvent(); }
    onViewChange(isFirstPerson) { return this._player?.onViewChange(isFirstPerson); }
}
