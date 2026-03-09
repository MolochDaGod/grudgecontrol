import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import breakIconModule from "../../assets/imgs/break.png";
import flyIconModule from "../../assets/imgs/fly.png";
import jumpIconModule from "../../assets/imgs/jump.png";
import vehicleIconModule from "../../assets/imgs/vehicle.png";
import viewIconModule from "../../assets/imgs/view.png";

type SetInputFn = (input: Partial<{
    moveX: 1 | 0 | -1;
    moveY: 1 | 0 | -1;
    lookDeltaX: number;
    lookDeltaY: number;
    jump: boolean;
    shift: boolean;
    toggleView: boolean;
    toggleFly: boolean;
    toggleVehicle: boolean;
}>) => void;

export class MobileControls {
    setInput: SetInputFn;
    controls: OrbitControls;

    // 摇杆状态
    nippleModule: any = null;
    joystickManager: any = null;
    prevJoyState = { dirX: 0, dirY: 0, shift: false };

    // DOM 元素
    joystickZoneEl: HTMLDivElement | null = null;
    lookAreaEl: HTMLDivElement | null = null;
    jumpBtnEl: HTMLButtonElement | null = null;
    flyBtnEl: HTMLButtonElement | null = null;
    viewBtnEl: HTMLButtonElement | null = null;
    vehicleBtnEl: HTMLButtonElement | null = null;

    // 触摸状态
    lookPointerId: number | null = null;
    isLookDown = false;
    lastTouchX = 0;
    lastTouchY = 0;

    constructor(setInput: SetInputFn, controls: OrbitControls) {
        this.setInput = setInput;
        this.controls = controls;
    }

    // 初始化移动端控制
    async init() {
        this.controls.maxPolarAngle = Math.PI * (300 / 360);
        this.controls.touches = { ONE: null as any, TWO: null as any };

        // 加载摇杆库
        this.nippleModule = await import("nipplejs");
        const nipple = this.nippleModule?.default;
        const JOY_SIZE = 120;
        const container = document.body;

        // 创建摇杆区域
        this.joystickZoneEl = document.createElement("div");
        this.joystickZoneEl.id = "joy-zone";
        Object.assign(this.joystickZoneEl.style, {
            position: "absolute",
            left: "16px",
            bottom: "16px",
            width: `${JOY_SIZE + 40}px`,
            height: `${JOY_SIZE + 40}px`,
            touchAction: "none",
            zIndex: "999",
            pointerEvents: "auto",
            WebkitUserSelect: "none",
            userSelect: "none",
        });
        container.appendChild(this.joystickZoneEl);
        this.blockTouch(this.joystickZoneEl);

        // 初始化摇杆
        this.joystickManager = nipple.create({
            zone: this.joystickZoneEl,
            mode: "static",
            position: { left: `${(JOY_SIZE + 40) / 2}px`, bottom: `${(JOY_SIZE + 40) / 2}px` },
            color: "#ffffff",
            size: JOY_SIZE,
            multitouch: true,
            maxNumberOfNipples: 1,
        });

        // 摇杆移动
        this.joystickManager.on("move", (_evt: any, data: any) => {
            if (!data) return;
            const rawX = data.vector?.x ?? 0;
            const rawY = data.vector?.y ?? 0;
            const distance = data.distance ?? 0;
            // 死区过滤
            const deadzone = 0.5;
            const dirX = rawX > deadzone ? 1 : rawX < -deadzone ? -1 : 0;
            const dirY = rawY > deadzone ? 1 : rawY < -deadzone ? -1 : 0;
            // 推到边缘触发冲刺
            const isSprinting = distance >= JOY_SIZE / 2;
            const prev = this.prevJoyState;
            if (dirX === prev.dirX && dirY === prev.dirY && isSprinting === prev.shift) return;
            this.prevJoyState = { dirX, dirY, shift: isSprinting };
            this.setInput({ moveX: dirX as any, moveY: dirY as any, shift: isSprinting });
        });

        // 摇杆抬起
        this.joystickManager.on("end", () => {
            const prev = this.prevJoyState;
            if (prev.dirX !== 0 || prev.dirY !== 0 || prev.shift) {
                this.prevJoyState = { dirX: 0, dirY: 0, shift: false };
                this.setInput({ moveX: 0, moveY: 0, shift: false });
            }
        });

        // 创建视角区域
        this.lookAreaEl = document.createElement("div");
        Object.assign(this.lookAreaEl.style, {
            position: "absolute",
            right: "0",
            bottom: "0",
            width: "50%",
            height: "100%",
            zIndex: "998",
            touchAction: "none",
            WebkitUserSelect: "none",
            userSelect: "none",
        });
        container.appendChild(this.lookAreaEl);
        this.blockTouch(this.lookAreaEl);

        // 绑定视角触摸事件
        this.lookAreaEl.addEventListener("pointerdown", this.onPointerDown, { passive: false });
        this.lookAreaEl.addEventListener("pointermove", this.onPointerMove, { passive: false });
        this.lookAreaEl.addEventListener("pointerup", this.onPointerUp, { passive: false });
        this.lookAreaEl.addEventListener("pointercancel", this.onPointerUp, { passive: false });

        // 创建操作按钮
        this.jumpBtnEl = this.createBtn(container, 14, 14, jumpIconModule);
        this.flyBtnEl = this.createBtn(container, 14, 14 + 80, flyIconModule);
        this.viewBtnEl = this.createBtn(container, 14, 14 + 200, viewIconModule);
        this.vehicleBtnEl = this.createBtn(container, 14 + 100, 14 + 120, vehicleIconModule);
        this.vehicleBtnEl.style.display = "none";

        // 绑定按钮事件
        this.jumpBtnEl.addEventListener("touchstart", (e) => { e.preventDefault(); this.setInput({ jump: true }); }, { passive: false });
        this.jumpBtnEl.addEventListener("touchend", (e) => { e.preventDefault(); this.setInput({ jump: false }); }, { passive: false });
        this.jumpBtnEl.addEventListener("touchcancel", (e) => { e.preventDefault(); this.setInput({ jump: false }); }, { passive: false });
        this.flyBtnEl.addEventListener("touchstart", (e) => { e.preventDefault(); this.setInput({ toggleFly: true }); }, { passive: false });
        this.viewBtnEl.addEventListener("touchstart", (e) => { e.preventDefault(); this.setInput({ toggleView: true }); }, { passive: false });
        this.vehicleBtnEl.addEventListener("touchstart", (e) => { e.preventDefault(); this.setInput({ toggleVehicle: true }); }, { passive: false });
    }

    // 销毁移动端控制
    destroy() {
        try {
            this.joystickManager?.destroy?.();
            this.joystickManager = null;

            if (this.lookAreaEl) {
                this.lookAreaEl.removeEventListener("pointerdown", this.onPointerDown);
                this.lookAreaEl.removeEventListener("pointermove", this.onPointerMove);
                this.lookAreaEl.removeEventListener("pointerup", this.onPointerUp);
                this.lookAreaEl.removeEventListener("pointercancel", this.onPointerUp);
            }

            // 移除所有 DOM 元素
            [this.joystickZoneEl, this.lookAreaEl, this.jumpBtnEl, this.flyBtnEl, this.viewBtnEl, this.vehicleBtnEl]
                .forEach(el => el?.parentElement?.removeChild(el));

            this.joystickZoneEl = this.lookAreaEl = this.jumpBtnEl =
                this.flyBtnEl = this.viewBtnEl = this.vehicleBtnEl = null;
        } catch (e) {
            console.warn("销毁移动端控制时出错：", e);
        }
    }

    // 同步车辆按钮显隐
    syncVehicleBtn(show: boolean) {
        if (this.vehicleBtnEl) this.vehicleBtnEl.style.display = show ? "block" : "none";
    }

    // 同步控制模式按钮
    syncControllerModeBtn(mode: 0 | 1) {
        if (!this.flyBtnEl || !this.jumpBtnEl) return;
        if (mode === 0) {
            // 人物模式：恢复飞行键和跳跃键
            this.flyBtnEl.style.display = "block";
            this.jumpBtnEl.style.backgroundImage = `linear-gradient(rgba(0,0,0,0.5),rgba(0,0,0,0.5)),url("${jumpIconModule}")`;
        } else {
            // 车辆模式：隐藏飞行键，跳跃键变刹车
            this.flyBtnEl.style.display = "none";
            this.jumpBtnEl.style.backgroundImage = `url(${breakIconModule})`;
        }
    }

    // 触摸按下
    private onPointerDown = (e: PointerEvent) => {
        if (e.pointerType !== "touch") return;
        this.isLookDown = true;
        this.lookPointerId = e.pointerId;
        this.lastTouchX = e.clientX;
        this.lastTouchY = e.clientY;
        this.lookAreaEl?.setPointerCapture?.(e.pointerId);
        e.preventDefault();
    };

    // 触摸移动
    private onPointerMove = (e: PointerEvent) => {
        if (!this.isLookDown || e.pointerId !== this.lookPointerId) return;
        const dx = e.clientX - this.lastTouchX;
        const dy = e.clientY - this.lastTouchY;
        this.lastTouchX = e.clientX;
        this.lastTouchY = e.clientY;
        this.setInput({ lookDeltaX: dx, lookDeltaY: dy });
        e.preventDefault();
    };

    // 触摸抬起
    private onPointerUp = (e: PointerEvent) => {
        if (e.pointerId !== this.lookPointerId) return;
        this.isLookDown = false;
        this.lookPointerId = null;
        this.lookAreaEl?.releasePointerCapture?.(e.pointerId);
    };

    // 阻止默认触摸
    private blockTouch(el: HTMLElement) {
        ["touchstart", "touchmove", "touchend", "touchcancel"].forEach(name => {
            el.addEventListener(name, e => e.preventDefault(), { passive: false });
        });
    }

    // 创建圆形按钮
    private createBtn(container: HTMLElement, rightPx: number, bottomPx: number, bgUrl: string): HTMLButtonElement {
        const btn = document.createElement("button");
        Object.assign(btn.style, {
            position: "absolute",
            right: `${rightPx}px`,
            bottom: `${bottomPx}px`,
            width: "56px",
            height: "56px",
            zIndex: "1000",
            borderRadius: "50%",
            border: "2px solid black",
            padding: "20px",
            opacity: "0.95",
            touchAction: "none",
            fontSize: "14px",
            userSelect: "none",
            overflow: "hidden",
            boxSizing: "border-box",
            backgroundColor: "transparent",
            backgroundRepeat: "no-repeat, no-repeat",
            backgroundPosition: "center center, center center",
            backgroundSize: "100% 100%, 80% 80%",
            backgroundImage: `linear-gradient(rgba(0,0,0,0.5),rgba(0,0,0,0.5)),url("${bgUrl}")`,
        });
        container.appendChild(btn);
        // 阻止按钮默认触摸行为
        ["touchstart", "touchend", "touchcancel"].forEach(name => {
            btn.addEventListener(name, e => e.preventDefault(), { passive: false });
        });
        return btn;
    }
}