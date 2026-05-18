import * as THREE from "three";
import type { playerController } from "../playerController";

export class AnimationSystem {
    private ctrl: playerController; // 主控制器引用

    mixer?: THREE.AnimationMixer; // 动画混合器
    mixerCb?: (ev: any) => void; // 完成事件回调
    actions?: Map<string, THREE.AnimationAction>; // 动作映射表
    state!: THREE.AnimationAction; // 当前播放状态
    sets = new Map<string, Map<string, THREE.AnimationAction>>(); // 动作集合组
    currentLocomotionSet: string | null = null; // 当前激活的动作集合名
    recheckTimer: any = null; // 延迟重检定时器
    clips: THREE.AnimationClip[] = []; // 原始动画片段
    hasThreePartJump = false; // 是否使用三段跳跃动画

    constructor(ctrl: playerController) {
        this.ctrl = ctrl;
    }

    // 按名切换动画
    playByName(name: string, fade = 0.18) {
        if (!this.actions || (this.ctrl.input.ctrlKey && !this.ctrl.isFlying)) return;
        const next = this.actions.get(name);
        if (!next || this.state === next) return;

        const prev = this.state;
        next.reset();
        next.setEffectiveWeight(1);

        // 上下车动画特殊处理
        if (name === "enterCar" || name === "exitCar") {
            const duration = next.getClip().duration;
            const enterTime = this.ctrl.vehicle.active?.enterVehicleTime ?? 1.5;
            next.setEffectiveTimeScale(duration / enterTime);
            next.setLoop(THREE.LoopOnce, 1);
            next.clampWhenFinished = true;
        }

        next.play();
        if (prev && prev !== next) { prev.fadeOut(fade); next.fadeIn(fade); }
        else next.fadeIn(fade);

        this.state = next;
        this.ctrl.onAnimationChange?.(name, next);
    }

    // 注册自定义动画
    register(key: string, clipName: string, opts?: {
        loop?: boolean;
        timeScale?: number;
        duration?: number;
        clampWhenFinished?: boolean;
        onFinished?: () => void;
    }) {
        if (!this.mixer || !this.actions) return;
        const clip = this.clips.find(c => c.name === clipName);
        if (!clip) { console.warn(`找不到 "${clipName}" 动画`); return; }

        const action = this.mixer.clipAction(clip);
        // duration 优先于 timeScale
        const timeScale = opts?.duration ? clip.duration / opts.duration : (opts?.timeScale ?? 1);
        action.setLoop(opts?.loop === false ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
        action.clampWhenFinished = opts?.clampWhenFinished ?? false;
        action.setEffectiveTimeScale(timeScale);
        action.enabled = true;
        action.setEffectiveWeight(0);
        this.actions.set(key, action);

        if (opts?.onFinished) {
            this.mixer.addEventListener("finished", (ev: any) => {
                if (ev.action === action) opts.onFinished!();
            });
        }
    }

    // 注册移动动作组
    registerLocomotionSet(setName: string, map: Partial<Record<"idle" | "walking" | "walking_backward" | "running" | "jumping" | "flyidle" | "flying", string>>) {
        if (!this.mixer) return;
        const set = new Map<string, THREE.AnimationAction>();
        for (const [key, clipName] of Object.entries(map) as [string, string][]) {
            const clip = this.clips.find(c => c.name === clipName);
            if (!clip) { console.warn(`registerLocomotionSet: 找不到 "${clipName}"`); continue; }
            const action = this.mixer.clipAction(clip);
            // 跳跃动画只播一次
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

    // 切换移动动作组
    switchLocomotionSet(setName: string, fade = 0.18) {
        if (!this.actions) return;
        const set = this.sets.get(setName);
        if (!set) { console.warn(`switchLocomotionSet: 未找到集合 "${setName}"`); return; }
        this.currentLocomotionSet = setName;
        for (const [key, newAction] of set.entries()) {
            const oldAction = this.actions.get(key);
            if (oldAction === newAction) continue;
            if (oldAction) oldAction.fadeOut(fade);
            this.actions.set(key, newAction);
            // 当前正在播放则同步切换
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

    // 播放已注册动画
    play(key: string, opts?: { fade?: number; force?: boolean }) {
        if (!this.actions) return;
        if (!this.actions.has(key)) { console.warn(`playAnimation: "${key}" 未注册`); return; }
        if (opts?.force) this.actions.get(key)!.reset();
        this.playByName(key, opts?.fade ?? 0.18);
    }

    // 触发跳跃动画（统一入口）
    startJump(inAir = false) {
        if (this.hasThreePartJump) {
            this.playByName(inAir ? "jumpLoop" : "jumpStart");
        } else {
            this.playByName("jumping");
        }
    }

    // 离地时触发 jumpLoop（三段模式专用）
    onBecomeAirborne() {
        if (!this.hasThreePartJump) return;
        const s = this.state;
        const a = this.actions;
        if (s === a?.get("jumpStart") || s === a?.get("jumpLoop") || s === a?.get("jumpEnd")) return;
        this.playByName("jumpLoop");
    }

    // 落地时触发 jumpEnd（三段模式专用）
    onLand() {
        if (!this.hasThreePartJump) return;
        const s = this.state;
        const a = this.actions;
        if (s === a?.get("jumpStart") || s === a?.get("jumpLoop")) {
            this.playByName("jumpEnd");
        }
    }

    // 是否处于任意跳跃动画中（防重复起跳）
    isJumping(): boolean {
        const s = this.state;
        const a = this.actions;
        if (!a) return false;
        return s === a.get("jumping") || s === a.get("jumpStart") ||
            s === a.get("jumpLoop") || s === a.get("jumpEnd");
    }

    // 获取当前动画名
    getCurrentName(): string | null {
        return this.state?.getClip()?.name ?? null;
    }

    // 更新所有混合器
    updateMixers(delta: number) {
        this.mixer?.update(delta);
        for (const v of this.ctrl.vehicle.list) v.vehicleMixer?.update(delta);
    }

    // 按键状态触发动画
    setAnimationByPressed() {
        this.ctrl.cam.maxDist = this.ctrl.cam.originMaxDist;
        this.ctrl.vehicle.cancelBoarding();

        const v = this.ctrl.vehicle;
        if (v.isExitAnim) { v.isExitAnim = false; v.exitDoorClosed = false; }
        if (v.isBoardingAnim) { v.isBoardingAnim = false; v.doorClosed = false; }
        if (v.doorTimer) { clearTimeout(v.doorTimer); v.doorTimer = null; }

        const { fwd, bkd, lft, rgt, shift, space, ctrlKey } = this.ctrl.input;

        // 飞行状态
        if (this.ctrl.isFlying) {
            if (fwd) {
                if (shift) {
                    this.playByName("flying");
                    this.ctrl.cam.maxDist = this.ctrl.cam.originMaxDist * 2;
                } else {
                    this.playByName("flyHoverForward");
                }
                return;
            }
            if (bkd) { this.playByName("flyHoverBack"); return; }
            if (lft) { this.playByName("flyHoverLeft"); return; }
            if (rgt) { this.playByName("flyHoverRight"); return; }
            if (space) { this.playByName("flyHoverUp"); return; }
            if (ctrlKey) { this.playByName("flyHoverDown"); return; }
            this.playByName("flyidle");
            return;
        }

        // 地面状态
        if (this.ctrl.playerIsOnGround) {
            if (this.hasThreePartJump && this.state === this.actions?.get("jumpEnd")) return;
            if (!fwd && !bkd && !lft && !rgt) { this.playByName("idle"); return; }
            if (fwd) { this.playByName(shift ? "running" : "walking"); return; }
            if (!this.ctrl.isFirstPerson && (lft || rgt || bkd)) {
                this.playByName(shift ? "running" : "walking"); return;
            }
            if (lft) { this.playByName("left_walking"); return; }
            if (rgt) { this.playByName("right_walking"); return; }
            if (bkd) { this.playByName("walking_backward"); return; }
        }

        // 空中延迟重检
        if (this.recheckTimer !== null) clearTimeout(this.recheckTimer);
        this.recheckTimer = setTimeout(() => { this.setAnimationByPressed(); this.recheckTimer = null; }, 200);
    }
}
