// HUD: crosshair + weapon slots + ammo display
// No Three.js objects — DOM only
export class HUD {
    constructor(weaponSlots) {
        this._slots = weaponSlots; // [{ key, mode, label }]

        this._crosshair = document.getElementById("crosshair");
        this._weaponHud = document.getElementById("weapon-hud");
        this._ammoHud = document.getElementById("ammo-hud");
        this._ammoCurrent = document.getElementById("ammo-current-val");
        this._ammoTotal = document.getElementById("ammo-total-val");
        this._hitTimer = null;
    }

    // ==================== Init ====================

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
    }

    // ==================== Weapon slots ====================

    update(currentMode) {
        this._weaponHud.querySelectorAll(".weapon-slot").forEach((el) => {
            el.classList.toggle("active", el.dataset.mode === currentMode);
        });
    }

    // ==================== Ammo ====================

    updateAmmo(current, max) {
        if (this._ammoCurrent) this._ammoCurrent.textContent = current;
        if (this._ammoTotal) this._ammoTotal.textContent = max;
    }

    showAmmo() {
        if (this._ammoHud) this._ammoHud.style.display = "flex";
    }

    hideAmmo() {
        if (this._ammoHud) this._ammoHud.style.display = "none";
    }

    // ==================== Crosshair ====================

    showCrosshair() { this._crosshair.style.display = "block"; }
    hideCrosshair() { this._crosshair.style.display = "none"; }

    flashHit() {
        if (!this._crosshair) return;
        if (this._hitTimer) clearTimeout(this._hitTimer);
        this._crosshair.style.backgroundColor = "red";
        this._hitTimer = setTimeout(() => {
            this._crosshair.style.backgroundColor = "";
        }, 100);
    }
}
