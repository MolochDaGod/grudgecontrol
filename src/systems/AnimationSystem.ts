import * as THREE from "three";
import type { playerController } from "../playerController";

export class AnimationSystem {
    private ctrl: playerController; // main controller

    mixer?: THREE.AnimationMixer; // animation mixer
    mixerCb?: (ev: any) => void; // finished-event callback
    actions?: Map<string, THREE.AnimationAction>; // action map
    state!: THREE.AnimationAction; // currently playing action
    sets = new Map<string, Map<string, THREE.AnimationAction>>(); // locomotion action sets
    currentLocomotionSet: string | null = null; // name of the active locomotion set
    recheckTimer: any = null; // delayed recheck timer
    clips: THREE.AnimationClip[] = []; // source animation clips
    hasThreePartJump = false; // whether three-part jump clips are used
    isOverrideAnimationPlaying = false; // lock so overlay clips are not interrupted by locomotion
    private overrideInputSnapshot: Record<string, any> | null = null; // input snapshot while an overlay clip plays (interrupt detect)

    constructor(ctrl: playerController) {
        this.ctrl = ctrl;
    }

    // Play an action by name
    playByName(name: string, fade = 0.18) {
        if (!this.actions) return;
        const next = this.actions.get(name);
        // Ignore if missing or already playing
        if (!next || this.state === next) return;

        const prev = this.state;
        next.reset();
        next.setEffectiveWeight(1);

        // Enter/exit vehicle: scale clip speed from configured board time
        if (name === "enterCar" || name === "exitCar") {
            const duration = next.getClip().duration;
            const enterTime = this.ctrl.vehicle.active?.enterVehicleTime ?? 1.5;
            next.setEffectiveTimeScale(duration / enterTime);
            next.setLoop(THREE.LoopOnce, 1);
            next.clampWhenFinished = true;
        }

        next.play();
        // Crossfade
        if (prev && prev !== next) { prev.fadeOut(fade); next.fadeIn(fade); }
        else next.fadeIn(fade);

        this.state = next;
        this.ctrl.onAnimationChange?.(name, next);
    }

    // Register a named custom animation
    register(key: string, clipName: string, opts?: {
        loop?: boolean;
        timeScale?: number;
        duration?: number;
        clampWhenFinished?: boolean;
        onFinished?: () => void;
    }) {
        if (!this.mixer || !this.actions) return;
        const clip = this.clips.find(c => c.name === clipName);
        if (!clip) { console.warn(`Clip "${clipName}" not found`); return; }

        const action = this.mixer.clipAction(clip);
        // duration wins over timeScale; if duration is set, derive timeScale from it
        const timeScale = opts?.duration ? clip.duration / opts.duration : (opts?.timeScale ?? 1);
        action.setLoop(opts?.loop === false ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
        action.clampWhenFinished = opts?.clampWhenFinished ?? false;
        action.setEffectiveTimeScale(timeScale);
        action.enabled = true;
        action.setEffectiveWeight(0);
        this.actions.set(key, action);

        // Listen for finished if onFinished is provided
        if (opts?.onFinished) {
            this.mixer.addEventListener("finished", (ev: any) => {
                if (ev.action === action) opts.onFinished!();
            });
        }
    }

    // Register a locomotion action set
    registerLocomotionSet(setName: string, map: Partial<Record<"idle" | "walking" | "walking_backward" | "running" | "jumping" | "flyidle" | "flying", string>>) {
        if (!this.mixer) return;
        const set = new Map<string, THREE.AnimationAction>();
        for (const [key, clipName] of Object.entries(map) as [string, string][]) {
            const clip = this.clips.find(c => c.name === clipName);
            if (!clip) { console.warn(`registerLocomotionSet: clip "${clipName}" not found`); continue; }
            const action = this.mixer.clipAction(clip);
            // Jump clips play once
            if (key === "jumping") {
                action.setLoop(THREE.LoopOnce, 1);
                action.clampWhenFinished = true;
                action.setEffectiveTimeScale(1.2);
            } else {
                action.setLoop(THREE.LoopRepeat, Infinity);
                action.setEffectiveTimeScale(1);
            }
            action.enabled = true;
            action.setEffectiveWeight(0);
            set.set(key, action);
        }
        this.sets.set(setName, set);
    }

    // Switch the active locomotion set
    switchLocomotionSet(setName: string, fade = 0.18) {
        if (!this.actions) return;
        const set = this.sets.get(setName);
        if (!set) { console.warn(`switchLocomotionSet: set "${setName}" not found`); return; }
        this.currentLocomotionSet = setName;
        for (const [key, newAction] of set.entries()) {
            const oldAction = this.actions.get(key);
            if (oldAction === newAction) continue;
            // Fade out the old action
            if (oldAction) oldAction.fadeOut(fade);
            // Replace the slot in the current action map
            this.actions.set(key, newAction);
            // If the playing action was replaced, switch immediately
            if (this.state === oldAction) {
                newAction.reset();
                newAction.setEffectiveWeight(1);
                newAction.fadeIn(fade);
                newAction.play();
                this.state = newAction;
                this.ctrl.onAnimationChange?.(key, newAction);
            }
        }
    }

    // Play a registered animation
    play(key: string, opts?: { fade?: number; force?: boolean; returnToPrev?: boolean }) {
        if (!this.actions) return;
        const action = this.actions.get(key);
        if (!action) { console.warn(`playAnimation: "${key}" is not registered`); return; }

        // One-shot clips take the overlay lock
        if (action.loop === THREE.LoopOnce) {
            // Set overlay lock
            this.isOverrideAnimationPlaying = true;

            // Snapshot full input state
            this.overrideInputSnapshot = { ...this.ctrl.input };

            // Unlock when the clip finishes
            const onFinish = (e: any) => {
                if (e.action === action) {
                    // Unlock only if the lock is still held
                    if (this.isOverrideAnimationPlaying && this.overrideInputSnapshot) {
                        this.isOverrideAnimationPlaying = false;
                        this.overrideInputSnapshot = null;
                    }
                    this.mixer!.removeEventListener('finished', onFinish);
                }
            };
            this.mixer!.addEventListener('finished', onFinish);
        }

        if (opts?.force) action.reset();

        // Remember previous action if we need to return
        const prevState = opts?.returnToPrev ? this.state : null;
        // Play the target action
        this.playByName(key, opts?.fade ?? 0.18);

        // If returnToPrev, restore the previous action when this clip finishes
        if (opts?.returnToPrev && prevState && this.mixer) {
            // Store the current action
            const action = this.actions.get(key)!;
            const fade = opts?.fade ?? 0.18;
            // One-shot finished handler
            const handler = (ev: any) => {
                if (ev.action === action && this.state === action) {
                    this.mixer!.removeEventListener("finished", handler);
                    const cur = this.state;
                    // Stop current
                    cur.stop();
                    // Reset previous
                    prevState.reset();
                    // Weight 1 and play previous
                    prevState.setEffectiveWeight(1);
                    prevState.play();
                    // Update state
                    this.state = prevState;
                    this.ctrl.onAnimationChange?.(prevState.getClip().name, prevState);
                }
            };
            // Listen for finished
            this.mixer.addEventListener("finished", handler);
        }
    }

    // Start jump animation (single entry)
    startJump(inAir = false) {
        // Three-part jump vs single jumping clip
        if (this.hasThreePartJump) {
            this.playByName(inAir ? "jumpLoop" : "jumpStart");
        } else {
            this.playByName("jumping");
        }
    }

    // Play jumpLoop once airborne (three-part jump only)
    onBecomeAirborne() {
        if (!this.hasThreePartJump) return;
        const s = this.state;
        const a = this.actions;
        // Do not interrupt an in-progress jump clip
        if (s === a?.get("jumpStart") || s === a?.get("jumpLoop") || s === a?.get("jumpEnd")) return;
        this.playByName("jumpLoop");
    }

    // Play jumpEnd on land (three-part jump only)
    onLand() {
        if (!this.hasThreePartJump) return;
        const s = this.state;
        const a = this.actions;
        // Land only from jump start or loop
        if (s === a?.get("jumpStart") || s === a?.get("jumpLoop")) {
            this.playByName("jumpEnd");
        }
    }

    // True while any jump clip is playing (blocks a second takeoff)
    isJumping(): boolean {
        const s = this.state;
        const a = this.actions;
        if (!a) return false;
        return s === a.get("jumping") || s === a.get("jumpStart") ||
            s === a.get("jumpLoop") || s === a.get("jumpEnd");
    }

    // Current clip name
    getCurrentName(): string | null {
        return this.state?.getClip()?.name ?? null;
    }

    // Step all mixers
    updateMixers(delta: number) {
        this.mixer?.update(delta);
        for (const v of this.ctrl.vehicle.list) v.vehicleMixer?.update(delta);
    }

    // Drive locomotion clips from pressed keys
    setAnimationByPressed() {
        // Combat / dodge own the mixer while active
        if (this.ctrl.combat?.isAttacking || this.ctrl.isDodging) return;
        // Overlay interrupt: compare input to snapshot
        if (this.isOverrideAnimationPlaying) {
            const currentInput = this.ctrl.input as Record<string, any>;
            const snapshot = this.overrideInputSnapshot;
            let inputChanged = false;

            if (snapshot) {
                // Compare every snapshot key to current input
                for (const key in snapshot) {
                    if (snapshot[key] !== currentInput[key]) {
                        inputChanged = true;
                        break; // mismatch — interrupt
                    }
                }
            }

            // Input changed: drop the overlay lock and continue into locomotion
            if (inputChanged) {
                this.isOverrideAnimationPlaying = false;
                this.overrideInputSnapshot = null;
            } else {
                // Input unchanged: keep overlay, skip locomotion
                return;
            }
        }

        // Restore camera distance
        this.ctrl.cam.maxDist = this.ctrl.cam.originMaxDist;

        const v = this.ctrl.vehicle;
        // During board/exit: only interrupt if a move key is held
        if (v.isMovingToBoarding || v.isBoardingAnim || v.isExitAnim) {
            const { fwd, bkd, lft, rgt } = this.ctrl.input;
            if (!fwd && !bkd && !lft && !rgt) return;
        }

        // Cancel board/exit
        v.cancelBoarding();
        if (v.isExitAnim) { v.isExitAnim = false; v.exitDoorClosed = false; }
        if (v.isBoardingAnim) { v.isBoardingAnim = false; v.doorClosed = false; }
        if (v.doorTimer) { clearTimeout(v.doorTimer); v.doorTimer = null; }

        const { fwd, bkd, lft, rgt, shift, space } = this.ctrl.input;

        // Flight clips
        if (this.ctrl.isFlying) {
            if (fwd) {
                if (shift) {
                    this.playByName("flying");
                    // Sprint-fly: pull camera back
                    if (!this.ctrl.cam.enableSpringCamera) this.ctrl.cam.maxDist = this.ctrl.cam.originMaxDist * 2;
                } else {
                    this.playByName("flyHoverForward");
                }
                return;
            }
            if (bkd) { this.playByName("flyHoverBack"); return; }
            if (lft) { this.playByName("flyHoverLeft"); return; }
            if (rgt) { this.playByName("flyHoverRight"); return; }
            if (space) { this.playByName("flyHoverUp"); return; }
            // No input: hover idle
            this.playByName("flyidle");
            return;
        }

        // Ground clips
        if (this.ctrl.playerIsOnGround) {
            // Wait out three-part jump land
            if (this.hasThreePartJump && this.state === this.actions?.get("jumpEnd")) return;
            // No WASD: idle
            if (!fwd && !bkd && !lft && !rgt) { this.playByName("idle"); return; }
            // Forward walk/run
            if (fwd) { this.playByName(shift ? "running" : "walking"); return; }
            // Third person: strafe/back also use walk/run (model yaws)
            if (!this.ctrl.isFirstPerson && (lft || rgt || bkd)) {
                this.playByName(shift ? "running" : "walking"); return;
            }
            // First person: strafe and back clips
            if (lft) { this.playByName("left_walking"); return; }
            if (rgt) { this.playByName("right_walking"); return; }
            if (bkd) { this.playByName("walking_backward"); return; }
        }
    }
}
