import type { playerController } from "../playerController";
import type { KeyAction, KeyMap } from "../types";
import { LAB_PHYSICS, applyDeadzone, type InputSnapshot } from "../labPhysics";

// Default keymap (action -> KeyboardEvent.code list)
const defaultKeyMap: Record<KeyAction, string[]> = {
    forward: ["KeyW", "ArrowUp"],
    backward: ["KeyS", "ArrowDown"],
    left: ["KeyA", "ArrowLeft"],
    right: ["KeyD", "ArrowRight"],
    sprint: ["ShiftLeft", "ShiftRight"],
    jump: ["Space"],
    toggleView: ["KeyV"],
    toggleFly: ["KeyF"],
    toggleVehicle: ["KeyE"],
    // Combat — mouse is the primary path (pointer-lock); these are keyboard fallbacks.
    attack: ["KeyJ"],
    attackHeavy: ["KeyK"],
    aim: ["KeyL"],
    knock: ["KeyG"],
    targetNext: ["Tab"],
    targetPrev: [],
};

export class InputSystem {
    private ctrl: playerController; // main controller

    fwd = false; // forward
    bkd = false; // backward
    lft = false; // strafe left (on foot) / steer left (vehicle)
    rgt = false; // strafe right / steer right
    space = false; // jump
    shift = false; // sprint
    /** Analog X: −1 left … +1 right. Keys and gamepad write this. */
    axisX = 0;
    /** Analog Y: −1 back … +1 forward. */
    axisY = 0;
    private padX = 0;
    private padY = 0;
    private analogOverride = false;

    combatMouse = true; // under pointer lock, LMB/RMB/MMB drive combat
    private lastTapTime: Partial<Record<KeyAction, number>> = {}; // last press time per move key (double-tap)

    private boundKeydown = async (e: KeyboardEvent) => this.onKeydown(e); // keydown
    private boundKeyup = (e: KeyboardEvent) => this.onKeyup(e); // keyup
    private boundMouseMove = (e: MouseEvent) => this.onMouseMove(e); // mousemove
    private boundMouseClick = (e: MouseEvent) => {
        if (e.target === this.ctrl.controls.domElement) this.ctrl.cam.setPointerLock(); // click -> pointer lock
    };
    private boundMouseDown = (e: MouseEvent) => this.onMouseDown(e); // mousedown (combat)
    private boundMouseUp = (e: MouseEvent) => this.onMouseUp(e); // mouseup (combat)
    private boundContextMenu = (e: MouseEvent) => { if (this.combatMouse && document.pointerLockElement) e.preventDefault(); }; // block context menu in combat
    private boundBlur = () => this.resetKeys(); // reset keys on window blur
    private boundVisibility = () => { if (document.hidden) this.resetKeys(); };

    private codeToAction = new Map<string, KeyAction>(); // code -> action lookup

    constructor(ctrl: playerController) {
        this.ctrl = ctrl;
        this.buildKeyMap();
    }

    // Build code->action table: omitted actions use defaults; string/array overrides; null disables
    buildKeyMap(userMap?: KeyMap) {
        this.codeToAction.clear();  // clear previous
        for (const action of Object.keys(defaultKeyMap) as KeyAction[]) {
            let codes: string[];
            if (userMap && action in userMap) {
                const v = userMap[action];
                if (v == null) continue; // null: disable this action
                codes = Array.isArray(v) ? v : [v]; // override defaults
            } else {
                codes = defaultKeyMap[action];  // omitted: use default
            }
            for (const code of codes) this.codeToAction.set(code, action);
        }
    }

    // Programmatic input API
    setInput(input: Partial<{
        moveX: number; moveY: number;
        lookDeltaX: number; lookDeltaY: number;
        jump: boolean; shift: boolean;
        toggleView: boolean; toggleFly: boolean; toggleVehicle: boolean;
        attack: boolean; aim: boolean; knock: boolean; targetNext: boolean;
    }>) {
        const c = this.ctrl;

        if (typeof input.moveX === "number") {
            this.analogOverride = true;
            this.axisX = Math.max(-1, Math.min(1, input.moveX));
            this.lft = this.axisX < -0.15;
            this.rgt = this.axisX > 0.15;
            c.animation.setAnimationByPressed();
        }
        if (typeof input.moveY === "number") {
            this.analogOverride = true;
            this.axisY = Math.max(-1, Math.min(1, input.moveY));
            this.fwd = this.axisY > 0.15;
            this.bkd = this.axisY < -0.15;
            c.animation.setAnimationByPressed();
        }

        // Look
        if (typeof input.lookDeltaX === "number" && typeof input.lookDeltaY === "number") {
            c.cam.setToward(input.lookDeltaX, input.lookDeltaY, 0.002);
        }

        // Held state
        if (typeof input.jump === "boolean") this.applyAction("jump", input.jump);
        if (typeof input.shift === "boolean") this.applyAction("sprint", input.shift);

        // Edge-triggered toggles
        if (input.toggleView) this.applyAction("toggleView", true);
        if (input.toggleFly) this.applyAction("toggleFly", true);
        if (input.toggleVehicle) this.applyAction("toggleVehicle", true);

        // Combat
        if (input.attack) this.applyAction("attack", true);
        if (typeof input.aim === "boolean") this.applyAction("aim", input.aim);
        if (input.knock) this.applyAction("knock", true);
        if (input.targetNext) this.applyAction("targetNext", true);
    }

    // Bind input listeners
    bindEvents() {
        this.ctrl.isupdate = true;
        this.ctrl.cam.setPointerLock();
        window.addEventListener("keydown", this.boundKeydown);
        window.addEventListener("keyup", this.boundKeyup);
        window.addEventListener("mousemove", this.boundMouseMove);
        window.addEventListener("click", this.boundMouseClick);
        window.addEventListener("mousedown", this.boundMouseDown);
        window.addEventListener("mouseup", this.boundMouseUp);
        window.addEventListener("contextmenu", this.boundContextMenu);
        window.addEventListener("blur", this.boundBlur);
        document.addEventListener("visibilitychange", this.boundVisibility);
    }

    // Unbind input listeners
    unbindEvents() {
        this.ctrl.isupdate = false;
        document.exitPointerLock();
        window.removeEventListener("keydown", this.boundKeydown);
        window.removeEventListener("keyup", this.boundKeyup);
        window.removeEventListener("mousemove", this.boundMouseMove);
        window.removeEventListener("click", this.boundMouseClick);
        window.removeEventListener("mousedown", this.boundMouseDown);
        window.removeEventListener("mouseup", this.boundMouseUp);
        window.removeEventListener("contextmenu", this.boundContextMenu);
        window.removeEventListener("blur", this.boundBlur);
        document.removeEventListener("visibilitychange", this.boundVisibility);
    }

    // Reset all key flags
    private resetKeys() {
        const c = this.ctrl;
        this.fwd = false;
        this.bkd = false;
        this.lft = false;
        this.rgt = false;
        this.space = false;
        this.shift = false;
        this.axisX = 0;
        this.axisY = 0;
        this.padX = 0;
        this.padY = 0;
        c.controls.mouseButtons = { LEFT: 0, MIDDLE: 1, RIGHT: 2 };
        c.animation.setAnimationByPressed();
    }

    // Dispatch one action
    private applyAction(action: KeyAction, pressed: boolean) {
        const c = this.ctrl;
        switch (action) {
            // Forward
            case "forward": this.fwd = pressed; this.syncAxesFromKeys(); c.animation.setAnimationByPressed(); break;
            case "backward": this.bkd = pressed; this.syncAxesFromKeys(); c.animation.setAnimationByPressed(); break;
            case "left": this.lft = pressed; this.syncAxesFromKeys(); c.animation.setAnimationByPressed(); break;
            case "right": this.rgt = pressed; this.syncAxesFromKeys(); c.animation.setAnimationByPressed(); break;
            // Sprint
            case "sprint":
                this.shift = pressed;
                c.animation.setAnimationByPressed();
                if (!document.pointerLockElement) {
                    c.controls.mouseButtons = pressed
                        ? { LEFT: 2, MIDDLE: 1, RIGHT: 0 }
                        : { LEFT: 0, MIDDLE: 1, RIGHT: 2 };
                }
                break;
            // Jump
            case "jump":
                if (pressed) {
                    c.vehicle.cancelBoarding(); // cancel vehicle boarding/exit
                    this.space = true;
                    if (c.controllerMode === 1) return; // no jump in vehicle
                    if (c.isFlying) { c.animation.setAnimationByPressed(); return; } // fly: animation only
                    c.requestJump(); // ground jump + double jump (incl. back-jump fire)
                } else {
                    this.space = false;
                    if (c.isFlying) c.animation.setAnimationByPressed();
                }
                break;
            // Toggle first / third person
            case "toggleView":
                if (pressed) c.cam.changeView();
                break;
            // Toggle fly
            case "toggleFly":
                if (pressed && c.controllerMode === 0) {
                    c.isFlying = !c.isFlying;
                    if (c.isFlying) c.playerVelocity.set(0, 0, 0);
                    c.animation.setAnimationByPressed();
                    if (!c.isFlying && !c.playerIsOnGround) c.animation.startJump(true); 
                }
                break;
            // Enter / exit vehicle
            case "toggleVehicle":
                if (pressed) {
                    if (c.isFlying) return;
                    if (c.controllerMode === 0) c.vehicle.enter(); else c.vehicle.exit();
                }
                break;
            // Melee (LMB / key)
            case "attack": if (pressed) c.combat.attackPrimary(); break;
            // Heavy attack
            case "attackHeavy": if (pressed) c.combat.attackHeavy(); break;
            // Aim/fire (RMB / key): press aims and fires, release cancels aim
            case "aim":
                c.combat.setAiming(pressed);
                if (pressed) c.combat.fire();
                break;
            // Knockback (MMB / key)
            case "knock": if (pressed) c.combat.knock(); break;
            // Cycle target
            case "targetNext": if (pressed) c.target.cycle(1); break;
            case "targetPrev": if (pressed) c.target.cycle(-1); break;
        }
    }

    // Keydown
    private onKeydown(e: KeyboardEvent) {
        if (e.repeat) return; // ignore key-repeat (blocks false double-jump / double-tap)
        const action = this.codeToAction.get(e.code);
        if (!action) return;
        if (action === "targetNext" || action === "targetPrev") e.preventDefault(); // Tab must not move focus
        // Double-tap WASD -> dodge/sprint
        if (action === "forward" || action === "backward" || action === "left" || action === "right") {
            const now = performance.now();
            const last = this.lastTapTime[action] ?? 0;
            if (now - last <= this.ctrl.dodgeDoubleTapMs) { this.triggerDodge(action); this.lastTapTime[action] = 0; }
            else this.lastTapTime[action] = now;
        }
        this.applyAction(action, true);
    }

    // Double-tap WASD dodge
    private triggerDodge(action: KeyAction) {
        const map: Record<string, [number, number]> = {
            forward: [0, -1], backward: [0, 1], left: [-1, 0], right: [1, 0],
        };
        const m = map[action];
        if (!m) return;
        const dir = this.ctrl.getCameraRelativeDir(m[0], m[1]);
        this.ctrl.startDodge(dir);
    }

    // Mousedown (combat while pointer-locked)
    private onMouseDown(e: MouseEvent) {
        const c = this.ctrl;
        if (!this.combatMouse || !document.pointerLockElement) return;
        if (e.button === 0) c.combat.attackPrimary();                              // LMB melee
        else if (e.button === 2) { c.combat.setAiming(true); c.combat.fire(); }    // RMB aim/fire
        else if (e.button === 1) { e.preventDefault(); c.combat.knock(); }         // MMB knockback
    }

    // Mouseup
    private onMouseUp(e: MouseEvent) {
        if (!this.combatMouse) return;
        if (e.button === 2) this.ctrl.combat.setAiming(false); // release RMB cancels aim
    }

    // Keyup
    private onKeyup(e: KeyboardEvent) {
        const action = this.codeToAction.get(e.code);
        if (action) this.applyAction(action, false);
    }

    // Mousemove
    private onMouseMove(e: MouseEvent) {
        if (document.pointerLockElement === document.body) {
            this.ctrl.cam.setToward(e.movementX, e.movementY, 0.0001);
        }
    }

    private syncAxesFromKeys() {
        this.analogOverride = false;
        let x = Number(this.rgt) - Number(this.lft);
        let y = Number(this.fwd) - Number(this.bkd);
        const len = Math.hypot(x, y);
        if (len > 1) { x /= len; y /= len; }
        if (x === 0 && y === 0) {
            x = this.padX;
            y = this.padY;
        }
        this.axisX = x;
        this.axisY = y;
    }

    /** Standard gamepad: left stick move/steer, right stick look, A jump, RT fire. */
    pollGamepad() {
        const pads = typeof navigator !== "undefined" ? navigator.getGamepads?.() : null;
        if (!pads) return;
        const pad = Array.from(pads).find(p => p && p.connected && p.mapping === "standard") ?? Array.from(pads).find(p => p?.connected);
        if (!pad) {
            if (this.padX || this.padY) { this.padX = 0; this.padY = 0; if (!this.analogOverride) this.syncAxesFromKeys(); }
            return;
        }
        this.padX = applyDeadzone(pad.axes[0] ?? 0);
        this.padY = applyDeadzone(-(pad.axes[1] ?? 0));
        if (!this.analogOverride) this.syncAxesFromKeys();

        const lookX = applyDeadzone(pad.axes[2] ?? 0);
        const lookY = applyDeadzone(pad.axes[3] ?? 0);
        if (lookX || lookY) this.ctrl.cam.setToward(lookX * 18, lookY * 18, 0.0001);

        const jumpBtn = pad.buttons[0];
        if (jumpBtn) {
            const down = jumpBtn.pressed || jumpBtn.value > 0.5;
            if (down !== this.space) this.applyAction("jump", down);
        }
        const sprintBtn = pad.buttons[10] || pad.buttons[6];
        if (sprintBtn) {
            const down = sprintBtn.pressed || sprintBtn.value > 0.5;
            if (down !== this.shift) this.applyAction("sprint", down);
        }
    }

    getSnapshot(): InputSnapshot {
        const c = this.ctrl;
        const vel = c.playerVelocity;
        const yaw = c.playerCapsule ? c.playerCapsule.rotation.y : 0;
        return {
            axisX: this.axisX,
            axisY: this.axisY,
            jump: this.space,
            sprint: this.shift,
            mode: c.controllerMode,
            yaw,
            speed: vel ? Math.hypot(vel.x, vel.z) : 0,
        };
    }
}
