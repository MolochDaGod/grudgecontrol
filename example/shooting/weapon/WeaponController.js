import { AnimationMixer, LoopOnce, Object3D, Quaternion, Vector3 } from "three";

export const MODE = Object.freeze({ NORMAL: "normal", PRIMARY: "primary" });

const _muzzleWorldPos = new Vector3(); // Muzzle world position

export class WeaponController {
    constructor({ scene, camera, localPlayer, decalSystem, effects, hud, zombieManager }) {
        // ==================== Scene refs ====================
        this._scene = scene;
        this._camera = camera;
        this._player = localPlayer;
        this._decalSystem = decalSystem;
        this._effects = effects;
        this._hud = hud;
        this._zombieManager = zombieManager;

        // ==================== Weapon config ====================
        this._gunScale = 0.1; // Gun model scale
        this._gunPos = [1, 26.5, 2]; // Offset when parented to the right-hand bone
        this._gunBarrelDir = new Vector3(0, 0, -1); // Barrel along model local -Z
        this._gunTargetDir = new Vector3(0, 1, 0); // Hand bone +Y = finger direction
        this._gunRoll = Math.PI / 2;
        this._gunMuzzleOffset = [0, 80, -480]; // Muzzle offset [left, up, forward]

        // ==================== Weapon model ====================
        this._weaponModel = null; // Gun model root
        this._muzzlePoint = null; // Muzzle marker (for FX placement)
        this._weaponMixer = null; // Weapon animation mixer
        this._weaponReloadAction = null; // Reload clip
        this._weaponShootAction = null; // Fire clip
        this._shotSound = null; // Fire SFX
        this._shakeIntensity = 0; // Current camera-shake intensity
        this._shakeDecay = 10; // Shake decay coefficient

        // ==================== Mode & slots ====================
        this._currentMode = MODE.NORMAL;
        this._weaponSlots = [
            { key: "1", mode: MODE.PRIMARY, label: "Rifle" },
            { key: "4", mode: MODE.NORMAL, label: "Fists" },
        ];

        // ==================== Camera distance limits ====================
        this._normalMaxCam = 220; // Unarmed max distance
        this._armedMaxCam = 100; // Aiming max distance

        // ==================== Move speed ====================
        this._baseSpeed = 300;
        this._armedSpeed = 240; // Armed speed = baseSpeed * 0.8

        // ==================== Fire state machine ====================
        this._isAiming = false; // Aiming (RMB, includes FOV zoom)
        this._isSoftAiming = false; // Soft aim (click-to-fire, no FOV zoom)
        this._isFiring = false; // Full-auto in progress
        this._isTriggerDown = false; // LMB held
        this._isReloading = false; // Reloading
        this._magSize = 30; // Magazine size
        this._currentAmmo = 30; // Current ammo
        this._totalAmmo = 300; // Reserve ammo
        this._firstShotTimer = null; // Timer that always fires one shot after 180ms
        this._holdAimTimer = null; // Timer that lowers the gun 2s after cease-fire
        this._lastFireTime = 0;
        this._elapsed = 0; // Updated each frame by update(); read by setTimeout callbacks

        this._reloadTimer1 = null; // Mid-reload timer
        this._reloadTimer2 = null; // Reload-complete timer
        this._RELOAD_DURATION_MS = 2000; // Reload clip length; tune to the actual model clip
        this._FIRE_RATE_S = 0.1; // Full-auto interval (seconds)
        this._FIRE_ANIM_FADE_MS = 180; // Matches playAnimation default fade (0.18s)
        this._HOLD_AIM_DURATION = 2000; // Keep-aim duration after cease-fire (ms)

        // ==================== Ray-hit cache ====================
        this._frameHit = null; // This frame's ray hit

        // ==================== Multiplayer hook ====================
        this.onHitPlayer = null; // (playerId, damage) => void, injected by host
    }

    // ==================== Init ====================

    // Load the weapon model and parent it to the right-hand bone
    async load(gltfLoader, baseUrl) {
        const gltf = await gltfLoader.loadAsync(baseUrl + "./glb/ak47.glb");
        this._weaponModel = gltf.scene;

        const person = this._player.getPlayerModel();
        const rightHand = person?.getObjectByName("mixamorigRightHand");
        if (!rightHand) {
            console.warn("[WeaponController] Right-hand bone mixamorigRightHand not found");
            return;
        }

        this._weaponModel.scale.setScalar(this._gunScale);
        this._weaponModel.position.set(...this._gunPos);

        this._magazineBone = null;
        this._weaponModel.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                child.frustumCulled = false;
            }
        });

        // Spare-mag bone: start scaled to ~0 so it stays hidden
        this._magazineBone = this._weaponModel.getObjectByName("Bone002_01");
        if (this._magazineBone) this._magazineBone.scale.setScalar(0.0001);

        // Align barrel direction and apply roll
        const alignQ = new Quaternion().setFromUnitVectors(this._gunBarrelDir, this._gunTargetDir);
        const rollQ = new Quaternion().setFromAxisAngle(this._gunTargetDir, this._gunRoll);
        this._weaponModel.quaternion.copy(rollQ.multiply(alignQ));

        this._weaponModel.visible = false;
        rightHand.add(this._weaponModel);

        // Muzzle marker (for FX placement)
        this._muzzlePoint = new Object3D();
        this._muzzlePoint.position.set(...this._gunMuzzleOffset);
        this._weaponModel.add(this._muzzlePoint);

        // Weapon animation
        this._weaponMixer = new AnimationMixer(this._weaponModel);
        const reloadClip = gltf.animations.find(a => a.name === "Armature.003|reload");
        if (reloadClip) {
            this._weaponReloadAction = this._weaponMixer.clipAction(reloadClip);
            this._weaponReloadAction.setLoop(LoopOnce);
            // Do not clamp on the last frame.
            // After the clip ends, mixer weights let bones fall back to bind pose
            // (the mag seated in the gun).
            this._weaponReloadAction.clampWhenFinished = false;
            this._weaponReloadAction.timeScale = 1.3;
        }

    }

    // Register all shooting-related locomotion sets
    setupAnimations() {
        this._player.registerLocomotionSet("primary", {
            idle: "rifle_idle",
            walking: "rifle_walk",
            running: "rifle_run",
            jumping: "rifle_jump",
        });
        this._player.registerLocomotionSet("primary_aim", {
            idle: "rifle_idle_aim3",
            walking: "rifle_walk",
            running: "rifle_run",
            jumping: "rifle_jump",
        });

        // Upper-body clips: overwrite spine-and-above only; lower body keeps locomotion
        this._player.registerUpperAnimation("upper_shoot", "rifle_shoot3", { loop: true, timeScale: 0.5 });
        this._player.registerUpperAnimation("upper_reload", "reload", { loop: false, timeScale: 1.5 });
        this._player.registerUpperAnimation("upper_aim", "rifle_idle_aim3", { loop: true, timeScale: 0.5 });

        this._player.initIdleHipsQ("rifle_idle_aim3");
    }

    // Bind mouse/keyboard
    bindInput() {
        document.addEventListener("mousedown", (e) => {
            if (!this._canRunCombatLogic()) return;
            if (e.button === 2 && !this._player.getIsFirstPerson()) {
                this.enterAim();
            }
            if (e.button === 0) {
                if (!this._firstShotTimer && !this._isFiring) this._triggerShootAnim();
                this._startFiring();
            }
        });

        document.addEventListener("mouseup", (e) => {
            if (e.button === 2 && !this._player.getIsFirstPerson()) this.exitAim();
            if (e.button === 0) this._stopFiring();
        });

        document.addEventListener("keydown", (e) => {
            const k = e.key.toLowerCase();
            if (k === "1") this.switchMode(MODE.PRIMARY);
            if (k === "4") this.switchMode(MODE.NORMAL);
            if (k === "q") this.switchMode(this._currentMode === MODE.PRIMARY ? MODE.NORMAL : MODE.PRIMARY);
            if (k === "r") this.reload();
        });

        document.addEventListener("wheel", (e) => {
            if (this._isReloading) return;
            const idx = this._weaponSlots.findIndex((s) => s.mode === this._currentMode);
            const next = (idx + (e.deltaY > 0 ? 1 : -1) + this._weaponSlots.length) % this._weaponSlots.length;
            this.switchMode(this._weaponSlots[next].mode);
        }, { passive: true });
    }

    // ==================== Main loop ====================

    // Called each frame from shooting.js
    update(elapsed, dt) {
        this._elapsed = elapsed;
        const canRunCombatLogic = this._canRunCombatLogic();

        // Cancel reload while flying
        if (this._currentMode === MODE.PRIMARY && this._isReloading && this._player.getIsFlying()) {
            this._cancelReload();
        }
        // Force-stop weapon logic in non-combat states (fly/jump, etc.); reload handles itself
        if (this._currentMode === MODE.PRIMARY && !canRunCombatLogic && !this._isReloading) {
            this._forceStopCombatLogic();
        }

        // First person: auto-aim while standing still, exit while moving
        if (this._currentMode === MODE.PRIMARY && this._player.getIsFirstPerson()) {
            if (canRunCombatLogic && !this._isAiming) this.enterAim();
            else if (!canRunCombatLogic && this._isAiming) this.exitAim();
        }

        // Particle FX
        this._effects?.update(dt);

        // Weapon animation mixer
        if (this._weaponMixer) this._weaponMixer.update(dt);

        // Hide the spare-mag bone every frame when not reloading (overwrite after mixer update)
        if (this._magazineBone && !this._isReloading) this._magazineBone.scale.setScalar(0.0001);

        // Camera shake (exponential decay)
        if (this._shakeIntensity > 0.0001) {
            this._camera.rotation.x += (Math.random() - 0.5) * this._shakeIntensity;
            this._camera.rotation.y += (Math.random() - 0.5) * this._shakeIntensity * 0.4;
            this._shakeIntensity *= Math.exp(-this._shakeDecay * dt);
        } else {
            this._shakeIntensity = 0;
        }

        // Ray-hit cache
        this._frameHit = this._player.getCenterScreenRaycastHit();

        // Full-auto cadence
        if (canRunCombatLogic && this._isFiring && elapsed - this._lastFireTime >= this._FIRE_RATE_S) {
            if (this._currentAmmo <= 0) {
                this._stopFiring();
                // Auto-reload only when reserve ammo remains
                if (this._totalAmmo > 0) this.reload();
            } else {
                this._lastFireTime = elapsed;
                this._fireOnce();
            }
        }
    }

    // ==================== Queries ====================

    // Any weapon-active state (waiting first shot / full-auto / hold-aim cooldown / aiming)
    // SpineIK and the main loop use this to decide whether to drive IK
    isGunEngaged() {
        return (
            this._isAiming ||
            this._isSoftAiming ||
            this._isFiring ||
            this._isReloading ||
            this._firstShotTimer !== null ||
            this._holdAimTimer !== null
        );
    }

    getMode() { return this._currentMode; }

    resetAmmo() {
        this._currentAmmo = this._magSize;
        this._totalAmmo = 300;
        this._hud.updateAmmo?.(this._currentAmmo, this._totalAmmo);
    }

    _canRunCombatLogic() {
        if (this._currentMode !== MODE.PRIMARY) return false;
        if (this._isReloading) return false;
        if (this._player.getIsFlying()) return false;
        if (typeof this._player.isCombatLocomotionAllowed === "function") {
            return this._player.isCombatLocomotionAllowed();
        }
        return true;
    }

    _forceStopCombatLogic() {
        this._isTriggerDown = false;
        if (this._firstShotTimer) {
            clearTimeout(this._firstShotTimer);
            this._firstShotTimer = null;
        }
        this._isFiring = false;
        if (this._weaponShootAction) this._weaponShootAction.stop();
        this._player.stopUpperBody(0.18);
        this._cancelHoldAimTimer();
        if (this._isAiming) this.exitAim();
        else {
            this._isSoftAiming = false;
            this._hud.hideCrosshair();
        }
    }

    // ==================== Mode switch & aim ====================

    switchMode(newMode) {
        if (this._currentMode === newMode || this._isReloading) return;

        // Leave old mode
        if (this._currentMode === MODE.PRIMARY) {
            this.exitAim();
            this._isSoftAiming = false;
            this._isTriggerDown = false;
            this._isFiring = false;
            if (this._weaponShootAction) this._weaponShootAction.stop();
            this._player.stopUpperBody(0.18);
            if (this._firstShotTimer) { clearTimeout(this._firstShotTimer); this._firstShotTimer = null; }
            this._cancelHoldAimTimer();
            this._hud.hideCrosshair();
            this._hud.hideAmmo?.();
            this._player.switchLocomotionSet("default");
            this._player.setMaxCamDistance(this._normalMaxCam);
            this._player.setPlayerSpeed(this._baseSpeed);
        }

        this._currentMode = newMode;

        // Enter new mode
        if (this._currentMode === MODE.PRIMARY) {
            this._player.switchLocomotionSet("primary");
            this._player.setPlayerSpeed(this._armedSpeed);
            this._hud.updateAmmo?.(this._currentAmmo, this._totalAmmo);
            this._hud.showAmmo?.();
        }

        if (this._weaponModel) this._weaponModel.visible = (this._currentMode === MODE.PRIMARY);
    }

    // Enter aim; soft=true skips FOV zoom
    enterAim(soft = false) {
        if (soft) {
            if (this._isSoftAiming) return;
            this._isSoftAiming = true;
        } else {
            if (!this._canRunCombatLogic() || this._isAiming) return;
            this._isAiming = true;
            this._isSoftAiming = false;
            this._player.setMaxCamDistance(this._armedMaxCam);
        }
        this._player.switchLocomotionSet("primary_aim");
        this._hud.showCrosshair();
        this._player.playUpperBody("upper_aim", { fade: 0.18 });
        if (this._player.getIsFirstPerson()) {
            this._camera.rotation.x = this._player.getFirstPersonPitchOffset();
        }
    }

    // Exit aim; soft=true skips FOV restore
    exitAim(soft = false) {
        if (soft) {
            if (!this._isSoftAiming) return;
            this._isSoftAiming = false;
        } else {
            if (!this._isAiming) return;
            this._isAiming = false;
            this._player.setMaxCamDistance(this._normalMaxCam);
            this._cancelHoldAimTimer();
        }
        this._player.switchLocomotionSet(
            this._currentMode === MODE.PRIMARY ? "primary" : "default"
        );
        this._player.stopUpperBody(0.18);
        this._hud.hideCrosshair();
        if (this._player.getIsFirstPerson()) {
            this._camera.rotation.x = this._player.pitchTarget1P;
        }
    }

    // Reload
    reload() {
        if (this._currentMode !== MODE.PRIMARY || this._isReloading || this._totalAmmo <= 0 || this._currentAmmo === this._magSize) return;
        if (this._player.getIsFlying()) return;

        this._isReloading = true;

        // 1. Interrupt all attack state
        this._isTriggerDown = false;
        this._isFiring = false;
        if (this._weaponShootAction) this._weaponShootAction.stop();
        if (this._firstShotTimer) { clearTimeout(this._firstShotTimer); this._firstShotTimer = null; }
        this._cancelHoldAimTimer();
        this.exitAim(); // Force-exit aim while reloading

        // 2. Play reload on upper body only; lower body keeps locomotion
        this._player.playUpperBody("upper_reload", { force: true, fade: 0.18 });

        // Reload SFX
        this._effects?.triggerReloadSound();

        // Show spare-mag bone
        if (this._magazineBone) this._magazineBone.scale.setScalar(1);

        // Play the weapon's own reload clip
        if (this._weaponReloadAction) {
            this._weaponReloadAction.reset();
            this._weaponReloadAction.play();
        }

        // Halfway through: stop the clip and hide the spare mag (avoid a visible snap-back to mid-air)
        this._reloadTimer1 = setTimeout(() => {
            this._reloadTimer1 = null;
            if (this._isReloading && this._weaponReloadAction) {
                this._weaponReloadAction.stop();
            }
            if (this._magazineBone) this._magazineBone.scale.setScalar(0.0001);
        }, this._RELOAD_DURATION_MS / 2);

        // 3. Lock state until the clip finishes
        this._reloadTimer2 = setTimeout(() => {
            this._reloadTimer2 = null;
            // _isReloading is false again — firing is allowed
            this._isReloading = false;

            // Stop the upper-body reload so full-body locomotion takes over the upper body again
            this._player.stopUpperBody(0.18);

            // Ensure the clip is fully stopped (in case the halfway stop missed)
            if (this._weaponReloadAction) this._weaponReloadAction.stop();

            // Transfer reserve into the mag
            const need = this._magSize - this._currentAmmo;
            const transfer = Math.min(need, this._totalAmmo);
            this._currentAmmo += transfer;
            this._totalAmmo -= transfer;
            this._hud.updateAmmo?.(this._currentAmmo, this._totalAmmo);

            // After reload, return to armed pose
            if (this._currentMode === MODE.PRIMARY) {
                this._player.switchLocomotionSet("primary_aim");
                if (this._isAiming || this._isSoftAiming || !this._player.isMoving) {
                    this._player.playUpperBody("upper_aim", { fade: 0.18 });
                    this._scheduleHoldAim();
                } else {
                    this._player.stopUpperBody(0.18);
                }
            }
        }, this._RELOAD_DURATION_MS);
    }

    // ==================== Fire state machine ====================

    _startFiring() {
        if (!this._canRunCombatLogic()) return;
        if (this._firstShotTimer || this._isFiring) return;

        // Empty mag + LMB → reload
        if (this._currentAmmo <= 0) {
            if (this._totalAmmo > 0) this.reload();
            return;
        }

        // Soft-aim if not already aiming
        if (!this._isAiming && !this._isSoftAiming) {
            this.enterAim(true);
        }

        this._cancelHoldAimTimer();
        this._isTriggerDown = true;

        // First shot always fires after 180ms, even if LMB is already released
        this._firstShotTimer = setTimeout(() => {
            this._firstShotTimer = null;
            if (!this._canRunCombatLogic()) {
                this._forceStopCombatLogic();
                return;
            }
            this._fireOnce();
            this._lastFireTime = this._elapsed;

            if (this._isTriggerDown) {
                this._isFiring = true; // Held → full-auto
            } else {
                // Click-release: handle follow-up after the first shot
                if (this._weaponShootAction) this._weaponShootAction.stop();
                if (this._isAiming || this._isSoftAiming || !this._player.isMoving) {
                    this._scheduleHoldAim();
                } else {
                    this._player.stopUpperBody(0.18);
                }
            }
        }, this._FIRE_ANIM_FADE_MS);
    }

    _stopFiring() {
        this._isTriggerDown = false;
        if (this._weaponShootAction) this._weaponShootAction.stop();

        if (!this._isFiring) {
            // Releasing LMB during reload or hold-aim buffer does not interrupt upper-body anim
            if (this._isReloading || this._holdAimTimer) return;

            // Single shot (LMB released before the 180ms timer): restore or stop upper body
            if (this._isAiming || this._isSoftAiming) {
                this._player.playUpperBody("upper_aim", { fade: 0.18 });
            } else {
                this._player.stopUpperBody(0.18);
            }
            return;
        }

        this._isFiring = false;
        if (this._isAiming || this._isSoftAiming || !this._player.isMoving) {
            this._player.playUpperBody("upper_aim", { fade: 0.18 });
            this._scheduleHoldAim();
        } else {
            this._player.stopUpperBody(0.18);
        }
    }

    _fireOnce() {
        if (!this._canRunCombatLogic()) return;

        // Play SFX
        if (this._shotSound && this._shotSound.buffer) {
            if (this._shotSound.isPlaying) this._shotSound.stop();
            this._shotSound.play();
        }

        // Third-person camera shake
        if (!this._player.getIsFirstPerson()) {
            this._shakeIntensity = 0.01; // Radians; 0.02 ≈ 1.1 degrees
        }

        this._currentAmmo--;
        this._hud.updateAmmo?.(this._currentAmmo, this._totalAmmo);

        // Muzzle flash + SFX: always fire first, regardless of what was hit
        if (this._effects && this._muzzlePoint) {
            this._muzzlePoint.updateWorldMatrix(true, false);
            this._muzzlePoint.getWorldPosition(_muzzleWorldPos);
            this._effects.triggerMuzzleFlash(_muzzleWorldPos, this._camera);
        }

        // Multiplayer: remote-player hit (dmgMult by body part: head×2, torso×1, limbs×0.75)
        const hitPlayerId = this._frameHit?.object?.userData?.playerId;
        if (hitPlayerId && this.onHitPlayer) {
            const dmgMult = this._frameHit.object.userData.dmgMult ?? 1.0;
            this.onHitPlayer(hitPlayerId, Math.round(30 * dmgMult));
            this._hud.flashHit();
            return;
        }

        const zombieId = this._frameHit?.object?.userData?.zombieId;
        if (zombieId && this._zombieManager) {
            this._zombieManager.onHit(zombieId, 30);
            this._hud.flashHit();
        } else {
            this._decalSystem.spawn(this._frameHit, this._effects);
        }
    }

    _triggerShootAnim() {
        if (!this._canRunCombatLogic()) return;
        // Upper body plays fire; lower body keeps current locomotion
        this._player.playUpperBody("upper_shoot", { force: true, fade: 0.18 });
        if (this._weaponShootAction) this._weaponShootAction.play();
    }

    // 2s after cease-fire, auto-exit the aim pose
    _scheduleHoldAim() {
        this._cancelHoldAimTimer();
        this._holdAimTimer = setTimeout(() => {
            this._holdAimTimer = null;
            if (!this._isAiming) {
                this.exitAim(true);
            }
        }, this._HOLD_AIM_DURATION);
    }

    _cancelReload() {
        if (!this._isReloading) return;
        this._isReloading = false;
        if (this._reloadTimer1) { clearTimeout(this._reloadTimer1); this._reloadTimer1 = null; }
        if (this._reloadTimer2) { clearTimeout(this._reloadTimer2); this._reloadTimer2 = null; }
        if (this._weaponReloadAction) this._weaponReloadAction.stop();
        if (this._magazineBone) this._magazineBone.scale.setScalar(0.0001);
        this._effects?.stopReloadSound();
        this._player.stopUpperBody(0.18);
        this._hud.hideCrosshair();
    }

    _cancelHoldAimTimer() {
        if (this._holdAimTimer) { clearTimeout(this._holdAimTimer); this._holdAimTimer = null; }
    }
}
