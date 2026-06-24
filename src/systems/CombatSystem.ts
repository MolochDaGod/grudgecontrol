import * as THREE from "three";
import type { playerController } from "../playerController";
import type {
    AttackDef, AttackEvent, MeleeHit,
    RangedDef, RangedHit, KnockOptions, KnockEvent,
    CombatOptions,
} from "../types";

/**
 * CombatSystem — melee / ranged / knock for the Grudge controller.
 *
 * Control scheme (pointer-lock combat mode):
 *   LMB  → melee light attack / combo chain (registerAttack + registerCombo)
 *   RMB  → ranged aim + fire (hitscan toward the active target or screen centre)
 *   MMB  → knock: radial knockback pulse around the player
 *
 * Targeting integrates with TargetSystem: soft-lock auto-faces the active
 * target before a swing so attacks land where the player is looking, and ranged
 * shots home toward the locked target if there is one.
 *
 * The system is engine-agnostic about "enemies": it never mutates targets. It
 * emits events (onAttackHit / onRangedHit / onKnock) carrying the hit object,
 * point, direction and damage so the host game applies HP / knockback / FX.
 *
 * Animations are optional — if a clip is registered it plays as a one-shot via
 * AnimationSystem; otherwise the timed swing logic still runs so hits register.
 */
export class CombatSystem {
    private ctrl: playerController;

    // ── Config ────────────────────────────────────────────────────────────────
    allowAerialAttacks = true;   // melee allowed while airborne (jump/fall)
    allowFlyingAttacks = false;  // attacks allowed in fly mode
    bufferInput = true;          // buffer the next combo input during a swing
    softLockFacing = true;       // auto-face the active target before swings

    // ── Melee state ─────────────────────────────────────────────────────────
    attacks = new Map<string, AttackDef>();
    combos = new Map<string, string[]>();
    primaryCombo: string | null = null;  // combo used by attackPrimary() (LMB)
    heavyKey: string | null = null;      // attack used by attackHeavy()

    isAttacking = false;
    currentKey: string | null = null;
    currentDef: AttackDef | null = null;
    comboName: string | null = null;
    comboIndex = 0;

    private _swingTime = 0;       // elapsed seconds in the current swing
    private _swingDur = 0;        // total swing seconds
    private _hitDone = false;     // hit frame already resolved this swing
    private _comboOpen = false;   // combo continuation window open
    private _comboTimer = 0;      // seconds since the window opened
    private _comboWindow = 0;     // seconds the window stays open
    private _buffered: string | null = null; // buffered next attack key
    private _cooldowns = new Map<string, number>(); // key → ready timestamp(ms)

    // ── Ranged state ────────────────────────────────────────────────────────
    ranged: Required<Omit<RangedDef, "clip" | "element" | "muzzleOffset">> & RangedDef = {
        clip: undefined, element: undefined, muzzleOffset: undefined,
        timeScale: 1, damage: 12, cooldownMs: 300, range: 4000, spread: 0,
    };
    isAiming = false;
    aimZoom = 0.55;              // camera distance multiplier while aiming
    private _rangedReadyAt = 0;  // next-fire timestamp(ms)
    private _aimBaseDist: number | null = null;

    // ── Knock state ─────────────────────────────────────────────────────────
    knockOpts: Required<Omit<KnockOptions, "clip">> & KnockOptions = {
        clip: undefined,
        radius: 220, force: 600, arcDeg: 360, cooldownMs: 1200, damage: 0,
    };
    private _knockReadyAt = 0;

    // ── Targets (shared default list; TargetSystem holds the live set) ───────
    targets: THREE.Object3D[] = [];

    // ── Events ────────────────────────────────────────────────────────────────
    onAttackStart?: (ev: AttackEvent) => void;
    onAttackHit?: (hits: MeleeHit[], ev: AttackEvent) => void;
    onAttackEnd?: (ev: AttackEvent) => void;
    onComboReset?: () => void;
    onFire?: (origin: THREE.Vector3, direction: THREE.Vector3) => void;
    onRangedHit?: (hit: RangedHit) => void;
    onKnock?: (ev: KnockEvent) => void;
    onAimChange?: (aiming: boolean) => void;

    // ── Scratch ───────────────────────────────────────────────────────────────
    private _origin = new THREE.Vector3();
    private _dir = new THREE.Vector3();
    private _fwd = new THREE.Vector3();
    private _toT = new THREE.Vector3();
    private _tmp = new THREE.Vector3();
    private _box = new THREE.Box3();
    private _sphere = new THREE.Sphere();

    constructor(ctrl: playerController) {
        this.ctrl = ctrl;
    }

    configure(opts: CombatOptions = {}) {
        if (opts.allowAerialAttacks != null) this.allowAerialAttacks = opts.allowAerialAttacks;
        if (opts.allowFlyingAttacks != null) this.allowFlyingAttacks = opts.allowFlyingAttacks;
        if (opts.bufferInput != null) this.bufferInput = opts.bufferInput;
        if (opts.softLockFacing != null) this.softLockFacing = opts.softLockFacing;
        if (opts.targets) this.targets = opts.targets;
    }

    /** Candidate targets — prefer the TargetSystem's live list when present. */
    private get _targets(): THREE.Object3D[] {
        const t = this.ctrl.target?.targets;
        return t && t.length ? t : this.targets;
    }

    // ── Gating ───────────────────────────────────────────────────────────

    /** Whether a melee swing may start in the current controller state. */
    private _canMelee(): boolean {
        if (this.ctrl.controllerMode === 1) return false;            // in a vehicle
        if (this.ctrl.isFlying && !this.allowFlyingAttacks) return false;
        if (!this.ctrl.playerIsOnGround && !this.allowAerialAttacks) return false;
        return true;
    }

    // ── Melee registration ────────────────────────────────────────────────

    registerAttack(key: string, def: AttackDef) {
        this.attacks.set(key, def);
        // Register a one-shot clip if the model provides it.
        if (def.clip) {
            this.ctrl.animation.register(key, def.clip, {
                loop: false,
                clampWhenFinished: true,
                timeScale: def.timeScale,
                duration: def.durationMs ? def.durationMs / 1000 : undefined,
            });
        }
    }

    registerCombo(name: string, keys: string[], opts?: { primary?: boolean }) {
        this.combos.set(name, keys);
        if (opts?.primary || this.primaryCombo == null) this.primaryCombo = name;
    }

    setHeavyAttack(key: string) { this.heavyKey = key; }

    configureRanged(def: RangedDef) {
        Object.assign(this.ranged, def);
        if (def.clip) this.ctrl.animation.register("ranged", def.clip, { loop: false, clampWhenFinished: true, timeScale: def.timeScale });
    }
    configureKnock(opts: KnockOptions) {
        Object.assign(this.knockOpts, opts);
        if (opts.clip) this.ctrl.animation.register("knock", opts.clip, { loop: false, clampWhenFinished: true });
    }

    // ── Public attack entry points (bound to LMB / keys) ──────────────────────

    /** LMB — start or continue the primary melee combo. */
    attackPrimary(): boolean {
        if (this.primaryCombo) return this._comboInput(this.primaryCombo);
        const first = this.attacks.keys().next().value as string | undefined;
        return first ? this.attack(first) : false;
    }

    /** Heavy attack (e.g. a bound key) — single configured heavy swing. */
    attackHeavy(): boolean {
        return this.heavyKey ? this.attack(this.heavyKey) : false;
    }

    /** Fire a specific attack key directly. */
    attack(key: string): boolean {
        const def = this.attacks.get(key);
        if (!def) { console.warn(`CombatSystem: attack "${key}" not registered`); return false; }
        if (!this._canMelee()) return false;
        if (this.isAttacking) {
            if (this.bufferInput) this._buffered = key;
            return false;
        }
        if (performance.now() < (this._cooldowns.get(key) ?? 0)) return false;
        this._start(key, null, 0);
        return true;
    }

    private _comboInput(name: string): boolean {
        const chain = this.combos.get(name);
        if (!chain || !chain.length) return false;
        if (!this._canMelee()) return false;

        if (this.isAttacking) {
            if (this.bufferInput) this._buffered = name; // buffer "advance combo"
            return false;
        }
        // Continue the chain if the window is open, else start fresh.
        let index = 0;
        if (this._comboOpen && this.comboName === name) {
            index = Math.min(this.comboIndex + 1, chain.length - 1);
        }
        const key = chain[index];
        if (performance.now() < (this._cooldowns.get(key) ?? 0)) return false;
        this._start(key, name, index);
        return true;
    }

    // ── Swing lifecycle ───────────────────────────────────────────────────────

    private _start(key: string, comboName: string | null, index: number) {
        const def = this.attacks.get(key)!;
        this.isAttacking = true;
        this.currentKey = key;
        this.currentDef = def;
        this.comboName = comboName;
        this.comboIndex = index;
        this._swingTime = 0;
        this._swingDur = def.durationMs ? def.durationMs / 1000
            : (def.clip ? this._clipDuration(key) : 0.45);
        this._hitDone = false;
        this._comboOpen = false;

        if (this.softLockFacing) this.faceActiveTarget();
        if (def.clip) this.ctrl.animation.playByName(key, 0.08);

        this.onAttackStart?.({ key, index, combo: comboName, def });
    }

    private _endSwing() {
        const key = this.currentKey!;
        const def = this.currentDef!;
        const index = this.comboIndex;
        const comboName = this.comboName;

        this.isAttacking = false;
        this._cooldowns.set(key, performance.now() + (def.cooldownMs ?? 0));
        this.onAttackEnd?.({ key, index, combo: comboName, def });

        // Open the combo continuation window.
        this._comboOpen = true;
        this._comboTimer = 0;
        this._comboWindow = (def.comboWindowMs ?? 350) / 1000;

        this.currentKey = null;
        this.currentDef = null;

        // Consume a buffered input to chain immediately.
        if (this._buffered) {
            const buffered = this._buffered;
            this._buffered = null;
            if (this.combos.has(buffered)) this._comboInput(buffered);
            else this.attack(buffered);
            return;
        }
        // Otherwise hand control back to locomotion.
        this.ctrl.animation.setAnimationByPressed();
    }

    private _resetCombo() {
        if (!this._comboOpen) return;
        this._comboOpen = false;
        this.comboName = null;
        this.comboIndex = 0;
        this.onComboReset?.();
    }

    // ── Ranged (RMB) ──────────────────────────────────────────────────────────

    setAiming(on: boolean) {
        if (this.isAiming === on) return;
        this.isAiming = on;
        if (on) {
            this._aimBaseDist = this.ctrl.cam.maxDist;
        } else if (this._aimBaseDist != null) {
            this.ctrl.cam.maxDist = this._aimBaseDist;
            this._aimBaseDist = null;
        }
        this.onAimChange?.(on);
    }

    /** RMB — fire a ranged hitscan shot toward the active target or aim point. */
    fire(): boolean {
        if (this.ctrl.controllerMode === 1) return false;
        if (this.ctrl.isFlying && !this.allowFlyingAttacks) return false;
        const now = performance.now();
        if (now < this._rangedReadyAt) return false;
        this._rangedReadyAt = now + (this.ranged.cooldownMs ?? 300);

        const scale = this.ctrl.playerModelConfig.scale;
        this._muzzle(this._origin);
        this._aimDirection(this._origin, this._dir);

        // Optional spread.
        if (this.ranged.spread) {
            const s = this.ranged.spread;
            this._dir.x += (Math.random() - 0.5) * s;
            this._dir.y += (Math.random() - 0.5) * s;
            this._dir.z += (Math.random() - 0.5) * s;
            this._dir.normalize();
        }

        if (this.softLockFacing) this.faceActiveTarget();
        if (this.ranged.clip) this.ctrl.animation.play("ranged", { fade: 0.06, force: true });
        this.onFire?.(this._origin.clone(), this._dir.clone());

        // Hitscan vs registered targets.
        const hit = this._hitscan(this._origin, this._dir, (this.ranged.range ?? 4000) * scale);
        if (hit) {
            this.onRangedHit?.({ ...hit, damage: this.ranged.damage ?? 12 });
        }
        return true;
    }

    // ── Knock (MMB) ───────────────────────────────────────────────────────────

    /** MMB — radial knockback pulse around the player. */
    knock(): boolean {
        if (this.ctrl.controllerMode === 1) return false;
        const now = performance.now();
        if (now < this._knockReadyAt) return false;
        this._knockReadyAt = now + (this.knockOpts.cooldownMs ?? 1200);

        const p = this.ctrl.getPosition();
        if (!p) return false;
        const scale = this.ctrl.playerModelConfig.scale;
        const radius = (this.knockOpts.radius ?? 220) * scale;
        const halfArc = THREE.MathUtils.degToRad(this.knockOpts.arcDeg ?? 360) / 2;
        this._playerForward(this._fwd);

        if (this.knockOpts.clip) this.ctrl.animation.play("knock", { fade: 0.06, force: true });

        let any = false;
        for (const t of this._targets) {
            this._toT.copy(t.getWorldPosition(this._tmp)).sub(p);
            const dist = this._toT.length();
            if (dist > radius || dist < 1e-3) continue;
            this._toT.normalize();
            if (halfArc < Math.PI) {
                const ang = this._toT.angleTo(this._fwd);
                if (ang > halfArc) continue;
            }
            this.onKnock?.({
                target: t,
                direction: this._toT.clone(),
                force: this.knockOpts.force ?? 600,
                damage: this.knockOpts.damage ?? 0,
            });
            any = true;
        }
        return any;
    }

    // ── Facing / geometry helpers ─────────────────────────────────────────────

    /** Rotate the player capsule to face the active target (soft lock). */
    faceActiveTarget() {
        const target = this.ctrl.target?.getActive();
        const cap = this.ctrl.playerCapsule;
        if (!target || !cap) return;
        const p = cap.position;
        this._toT.copy(target.getWorldPosition(this._tmp)).sub(p).setY(0);
        if (this._toT.lengthSq() < 1e-6) return;
        this._toT.normalize();
        // Match the controller's facing convention (model faces +moveDir => look
        // toward the negated direction with capsule up).
        const look = this._tmp.copy(p).addScaledVector(this._toT, -1);
        this.ctrl.targetMat.lookAt(p, look, cap.up);
        cap.quaternion.setFromRotationMatrix(this.ctrl.targetMat);
    }

    private _muzzle(out: THREE.Vector3) {
        const cap = this.ctrl.playerCapsule;
        const info = cap.capsuleInfo;
        const h = info ? (-info.segment.end.y + info.radius) : 90 * this.ctrl.playerModelConfig.scale;
        out.copy(cap.position);
        out.y += h * 0.65; // chest/shoulder height
        const off = this.ranged.muzzleOffset;
        if (off) {
            this._tmp.set(off[0], off[1], off[2]).applyQuaternion(cap.quaternion);
            out.add(this._tmp);
        }
    }

    /** Direction from origin toward the active target, else the camera aim ray. */
    private _aimDirection(origin: THREE.Vector3, out: THREE.Vector3) {
        const target = this.ctrl.target?.getActive();
        if (target) {
            this._box.setFromObject(target).getBoundingSphere(this._sphere);
            out.copy(this._sphere.center).sub(origin).normalize();
            return;
        }
        // No target → shoot along the camera's forward direction.
        this.ctrl.camera.getWorldDirection(out).normalize();
    }

    private _playerForward(out: THREE.Vector3) {
        // Capsule forward in the controller's convention is -(-Z) flattened.
        this.ctrl.playerCapsule.getWorldDirection(out).setY(0);
        if (out.lengthSq() < 1e-6) out.set(0, 0, 1);
        out.normalize();
    }

    private _clipDuration(key: string): number {
        const a = this.ctrl.animation.actions?.get(key);
        const d = a?.getClip?.()?.duration ?? 0;
        const ts = a?.getEffectiveTimeScale?.() || 1;
        return d > 0 ? d / Math.abs(ts) : 0.45;
    }

    // ── Hit queries ───────────────────────────────────────────────────────────

    /** Cone overlap in front of the player for melee swings. */
    private _meleeQuery(def: AttackDef): MeleeHit[] {
        const p = this.ctrl.getPosition();
        if (!p) return [];
        const scale = this.ctrl.playerModelConfig.scale;
        const range = (def.range ?? 120) * scale;
        const halfArc = THREE.MathUtils.degToRad(def.arcDeg ?? 60);
        this._playerForward(this._fwd);

        const hits: MeleeHit[] = [];
        for (const t of this._targets) {
            this._toT.copy(t.getWorldPosition(this._tmp)).sub(p);
            const dist = this._toT.length();
            if (dist > range || dist < 1e-3) continue;
            this._toT.setY(0).normalize();
            if (this._toT.angleTo(this._fwd) > halfArc) continue;
            hits.push({ target: t, point: t.getWorldPosition(new THREE.Vector3()), distance: dist });
        }
        return hits;
    }

    /** Ray vs target bounding spheres; returns the nearest hit within range. */
    private _hitscan(origin: THREE.Vector3, dir: THREE.Vector3, range: number): Omit<RangedHit, "damage"> | null {
        let best: Omit<RangedHit, "damage"> | null = null;
        let bestT = Infinity;
        for (const t of this._targets) {
            this._box.setFromObject(t).getBoundingSphere(this._sphere);
            const r = this._sphere.radius;
            this._toT.copy(this._sphere.center).sub(origin);
            const tca = this._toT.dot(dir);
            if (tca < 0) continue;
            const d2 = this._toT.lengthSq() - tca * tca;
            if (d2 > r * r) continue;
            const thc = Math.sqrt(r * r - d2);
            const t0 = tca - thc;
            if (t0 < 0 || t0 > range || t0 >= bestT) continue;
            bestT = t0;
            best = {
                target: t,
                point: origin.clone().addScaledVector(dir, t0),
                distance: t0,
            };
        }
        return best;
    }

    // ── Per-frame update ──────────────────────────────────────────────────────

    update(delta: number) {
        // Aim camera zoom lerp.
        if (this.isAiming && this._aimBaseDist != null) {
            const want = this._aimBaseDist * this.aimZoom;
            this.ctrl.cam.maxDist += (want - this.ctrl.cam.maxDist) * Math.min(1, delta * 10);
        }

        if (this.isAttacking) {
            const def = this.currentDef!;
            this._swingTime += delta;

            // Movement lock during the swing.
            if (def.lockMovement) { this.ctrl.playerVelocity.x = 0; this.ctrl.playerVelocity.z = 0; }

            // Hit frame.
            const frac = this._swingDur > 0 ? this._swingTime / this._swingDur : 1;
            if (!this._hitDone && frac >= (def.hitFraction ?? 0.5)) {
                this._hitDone = true;
                const hits = this._meleeQuery(def);
                if (hits.length) {
                    this.onAttackHit?.(hits, { key: this.currentKey!, index: this.comboIndex, combo: this.comboName, def });
                }
            }
            // End of swing.
            if (this._swingTime >= this._swingDur) this._endSwing();
            return;
        }

        // Combo continuation window countdown.
        if (this._comboOpen) {
            this._comboTimer += delta;
            if (this._comboTimer >= this._comboWindow) this._resetCombo();
        }
    }

    dispose() {
        this.setAiming(false);
        this.attacks.clear();
        this.combos.clear();
        this._cooldowns.clear();
        this._buffered = null;
        this.isAttacking = false;
    }
}
