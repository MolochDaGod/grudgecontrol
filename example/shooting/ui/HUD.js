// HUD：准星 + 武器选择栏 + 弹药显示
// 不依赖任何 Three.js 对象，只操作 DOM
export class HUD {
    constructor(weaponSlots) {
        // ==================== 武器槽配置 ====================
        this._slots = weaponSlots; // [{ key, mode, label }]

        // ==================== DOM 引用 ====================
        this._crosshair = document.getElementById("crosshair");
        this._weaponHud = document.getElementById("weapon-hud");
        this._ammoHud = document.getElementById("ammo-info");
        this._hitTimer = null; // 命中红点恢复计时器
    }

    // ==================== 初始化 ====================

    // 首次构建武器槽 DOM
    build() {
        this._weaponHud.innerHTML = "";
        for (let i = this._slots.length - 1; i >= 0; i--) {
            const slot = this._slots[i];
            const el = document.createElement("div");
            el.className = "weapon-slot";
            el.dataset.mode = slot.mode;
            el.innerHTML = `<span class="slot-key">${slot.key}</span><span class="slot-name">${slot.label}</span>`;
            this._weaponHud.appendChild(el);
        }
        this._weaponHud.style.display = "none";
    }

    // ==================== 更新 ====================

    // 刷新当前高亮武器槽
    update(currentMode) {
        this._weaponHud.querySelectorAll(".weapon-slot").forEach((el) => {
            el.classList.toggle("active", el.dataset.mode === currentMode);
        });
    }

    // 更新弹药数量显示
    updateAmmo(current, max) {
        if (this._ammoHud) {
            this._ammoHud.innerHTML = `<span class="ammo-current">${current}</span><span class="ammo-separator">/</span><span class="ammo-max">${max}</span>`;
        }
    }

    // ==================== 准星 ====================

    showCrosshair() { this._crosshair.style.display = "block"; }
    hideCrosshair() { this._crosshair.style.display = "none"; }

    // 命中反馈：准星短时间内变红
    flashHit() {
        if (!this._crosshair) return;
        if (this._hitTimer) clearTimeout(this._hitTimer);
        this._crosshair.style.backgroundColor = "red";
        this._crosshair.style.color = "red";
        this._hitTimer = setTimeout(() => {
            this._crosshair.style.backgroundColor = "";
            this._crosshair.style.color = "";
        }, 100);
    }
}
