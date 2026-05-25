import type { playerController } from "../playerController";

export class InputSystem {
    private ctrl: playerController; // 主控制器引用

    fwd = false; // 前进键
    bkd = false; // 后退键
    lft = false; // 左移键
    rgt = false; // 右移键
    space = false; // 跳跃键
    ctrlKey = false; // Ctrl键
    shift = false; // 加速键

    private boundKeydown = async (e: KeyboardEvent) => this.onKeydown(e); // 键盘按下绑定
    private boundKeyup = (e: KeyboardEvent) => this.onKeyup(e); // 键盘抬起绑定
    private boundMouseMove = (e: MouseEvent) => this.onMouseMove(e); // 鼠标移动绑定
    private boundMouseClick = () => this.ctrl.cam.setPointerLock(); // 鼠标点击绑定
    private boundBlur = () => this.resetKeys(); // 页面失焦时重置按键状态

    constructor(ctrl: playerController) {
        this.ctrl = ctrl;
    }

    // 程序化输入接口
    setInput(input: Partial<{
        moveX: 1 | 0 | -1; moveY: 1 | 0 | -1;
        lookDeltaX: number; lookDeltaY: number;
        jump: boolean; shift: boolean;
        toggleView: boolean; toggleFly: boolean; toggleVehicle: boolean;
    }>) {
        const c = this.ctrl;

        // 移动方向
        if (typeof input.moveX === "number") { this.lft = input.moveX === -1; this.rgt = input.moveX === 1; c.animation.setAnimationByPressed(); }
        if (typeof input.moveY === "number") { this.fwd = input.moveY === 1; this.bkd = input.moveY === -1; c.animation.setAnimationByPressed(); }

        // 视角朝向
        if (typeof input.lookDeltaX === "number" && typeof input.lookDeltaY === "number") {
            c.cam.setToward(input.lookDeltaX, input.lookDeltaY, 0.002);
        }

        // 跳跃
        if (typeof input.jump === "boolean") {
            if (input.jump) {
                c.vehicle.cancelBoarding();
                this.space = true;
                if (c.controllerMode === 1) return;
                if (c.isFlying) { c.animation.setAnimationByPressed(); return; }
                if (!c.playerIsOnGround) return;
                c.animation.startJump();
                c.playerVelocity.y = c.jumpHeight;
                c.setOnGround(false);
            } else {
                this.space = false;
                if (c.isFlying) c.animation.setAnimationByPressed();
            }
        }

        if (typeof input.shift === "boolean") { this.shift = input.shift; c.animation.setAnimationByPressed(); }
        if (input.toggleView) c.cam.changeView();

        // 飞行切换
        if (input.toggleFly && c.playerFlyEnabled && c.controllerMode === 0) {
            c.isFlying = !c.isFlying;
            if (c.isFlying) c.playerVelocity.set(0, 0, 0);
            c.animation.setAnimationByPressed();
            if (!c.isFlying && !c.playerIsOnGround) c.animation.startJump(true);
        }

        // 载具切换
        if (input.toggleVehicle) {
            if (c.controllerMode === 0) c.vehicle.enter(); else c.vehicle.exit();
        }
    }

    // 绑定输入事件
    bindEvents() {
        this.ctrl.isupdate = true;
        this.ctrl.cam.setPointerLock();
        window.addEventListener("keydown", this.boundKeydown);
        window.addEventListener("keyup", this.boundKeyup);
        window.addEventListener("mousemove", this.boundMouseMove);
        window.addEventListener("click", this.boundMouseClick);
        window.addEventListener("blur", this.boundBlur);
    }

    // 解绑输入事件
    unbindEvents() {
        this.ctrl.isupdate = false;
        document.exitPointerLock();
        window.removeEventListener("keydown", this.boundKeydown);
        window.removeEventListener("keyup", this.boundKeyup);
        window.removeEventListener("mousemove", this.boundMouseMove);
        window.removeEventListener("click", this.boundMouseClick);
        window.removeEventListener("blur", this.boundBlur);
    }

    // 重置所有按键状态
    private resetKeys() {
        const c = this.ctrl;
        this.fwd = false;
        this.bkd = false;
        this.lft = false;
        this.rgt = false;
        this.space = false;
        this.ctrlKey = false;
        this.shift = false;
        c.controls.mouseButtons = { LEFT: 0, MIDDLE: 1, RIGHT: 2 };
        c.animation.setAnimationByPressed();
    }

    // 键盘按下处理
    private onKeydown(e: KeyboardEvent) {
        const c = this.ctrl;
        if (e.ctrlKey && ["KeyW", "KeyA", "KeyS", "KeyD"].includes(e.code)) e.preventDefault();
        switch (e.code) {
            case "KeyW": case "ArrowUp": this.fwd = true; c.animation.setAnimationByPressed(); break;
            case "KeyS": case "ArrowDown": this.bkd = true; c.animation.setAnimationByPressed(); break;
            case "KeyD": case "ArrowRight": this.rgt = true; c.animation.setAnimationByPressed(); break;
            case "KeyA": case "ArrowLeft": this.lft = true; c.animation.setAnimationByPressed(); break;
            case "KeyV": c.cam.changeView(); break;
            case "KeyF":
                if (c.controllerMode === 0 && c.playerFlyEnabled) {
                    c.isFlying = !c.isFlying;
                    if (c.isFlying) c.playerVelocity.set(0, 0, 0);
                    c.animation.setAnimationByPressed();
                    if (!c.isFlying && !c.playerIsOnGround) c.animation.startJump(true);
                }
                break;
            case "KeyE":
                if (c.isFlying) return;
                if (c.controllerMode === 0) c.vehicle.enter(); else c.vehicle.exit();
                break;
            case "ShiftLeft": case "ShiftRight":
                this.shift = true;
                c.animation.setAnimationByPressed();
                c.controls.mouseButtons = { LEFT: 2, MIDDLE: 1, RIGHT: 0 };
                break;
            case "Space":
                c.vehicle.cancelBoarding();
                this.space = true;
                if (c.controllerMode === 1) return;
                if (c.isFlying) { c.animation.setAnimationByPressed(); return; }
                if (!c.playerIsOnGround) return;
                if (c.animation.isJumping()) return;
                c.animation.startJump();
                c.playerVelocity.y = c.jumpHeight;
                c.setOnGround(false);
                break;
            case "ControlLeft":
                this.ctrlKey = true;
                if (c.isFlying) c.animation.setAnimationByPressed();
                break;
        }
    }

    // 键盘抬起处理
    private onKeyup(e: KeyboardEvent) {
        const c = this.ctrl;
        switch (e.code) {
            case "KeyW": case "ArrowUp": this.fwd = false; c.animation.setAnimationByPressed(); break;
            case "KeyS": case "ArrowDown": this.bkd = false; c.animation.setAnimationByPressed(); break;
            case "KeyD": case "ArrowRight": this.rgt = false; c.animation.setAnimationByPressed(); break;
            case "KeyA": case "ArrowLeft": this.lft = false; c.animation.setAnimationByPressed(); break;
            case "ShiftLeft": case "ShiftRight":
                this.shift = false;
                c.animation.setAnimationByPressed();
                c.controls.mouseButtons = { LEFT: 0, MIDDLE: 1, RIGHT: 2 };
                break;
            case "Space":
                this.space = false;
                if (c.isFlying) c.animation.setAnimationByPressed();
                break;
            case "ControlLeft":
                this.ctrlKey = false;
                if (c.isFlying) c.animation.setAnimationByPressed();
                break;
        }
    }

    // 鼠标移动处理
    private onMouseMove(e: MouseEvent) {
        if (document.pointerLockElement === document.body) {
            this.ctrl.cam.setToward(e.movementX, e.movementY, 0.0001);
        }
    }
}
