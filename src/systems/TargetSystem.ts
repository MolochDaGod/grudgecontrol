import * as THREE from "three";
import type { playerController } from "../playerController";
import type { TargetOptions, TargetInfo } from "../types";

/**
 * TargetSystem — WoW-style targeting for the Grudge controller.
 *
 *  - Hard target: Tab cycles through registered targets ordered by how close
 *    they are to the camera's forward direction (screen-centre first).
 *  - Soft lock: when there is no hard target, the nearest valid target in
 *    front of the player is auto-selected so attacks can face/track it.
 *  - getActive() returns the hard target if set, else the soft-locked one.
 *  - getScreenPosition() projects a target to NDC→pixels for UI frames/health
 *    bars; onTargetChange fires whenever the active target changes.
 *
 * The system is generic: it never mutates the targets themselves. Consumers
 * register their enemy Object3Ds and (optionally) supply an `isAlive` predicate
 * so dead/removed targets are pruned automatically.
 */
export class TargetSystem {
    private ctrl: playerController;

    targets: THREE.Object3D[] = [];      // registered candidate targets
    hard: THREE.Object3D | null = null;  // Tab-selected hard target
    soft: THREE.Object3D | null = null;  // auto soft-locked target

    // Config (world units are scaled by the model scale at query time)
    maxRange = 6000;
    softLockRange = 3000;
    maxAngleDeg = 70;
    isAlive: (t: THREE.Object3D) => boolean = () => true;

    onTargetChange?: (active: THREE.Object3D | null, info: TargetInfo | null) => void;

    private _prevActive: THREE.Object3D | null = null;
    private _camDir = new THREE.Vector3();
    private _toTarget = new THREE.Vector3();
    private _playerPos = new THREE.Vector3();
    private _tmp = new THREE.Vector3();

    constructor(ctrl: playerController) {
        this.ctrl = ctrl;
    }

    configure(opts: TargetOptions = {}) {
        if (opts.maxRange != null) this.maxRange = opts.maxRange;
        if (opts.softLockRange != null) this.softLockRange = opts.softLockRange;
        if (opts.maxAngleDeg != null) this.maxAngleDeg = opts.maxAngleDeg;
        if (opts.isAlive) this.isAlive = opts.isAlive;
    }

    // ── Registration ─────────────────────────────────────────────────────────

    register(target: THREE.Object3D | THREE.Object3D[]) {
        const list = Array.isArray(target) ? target : [target];
        for (const t of list) if (!this.targets.includes(t)) this.targets.push(t);
    }

    unregister(target: THREE.Object3D) {
        const i = this.targets.indexOf(target);
        if (i !== -1) this.targets.splice(i, 1);
        if (this.hard === target) this.hard = null;
        if (this.soft === target) this.soft = null;
    }

    clearTargets() {
        this.targets = [];
        this.hard = null;
        this.soft = null;
    }

    setTargets(targets: THREE.Object3D[]) {
        this.targets = [...targets];
        if (this.hard && !this.targets.includes(this.hard)) this.hard = null;
        if (this.soft && !this.targets.includes(this.soft)) this.soft = null;
    }

    // ── Queries ──────────────────────────────────────────────────────────────

    /** The effective target: hard target if present, otherwise the soft lock. */
    getActive(): THREE.Object3D | null {
        return this.hard ?? this.soft;
    }

    getActiveInfo(): TargetInfo | null {
        const obj = this.getActive();
        if (!obj) return null;
        const pos = this.ctrl.getPosition();
        const dist = pos ? this._worldPos(obj, this._tmp).distanceTo(pos) : 0;
        return { object: obj, hard: this.hard === obj, distance: dist };
    }

    /** True while a hard (Tab) target is held. */
    hasHardTarget(): boolean {
        return !!this.hard;
    }

    /** Project a target to screen pixels for UI; null if behind the camera. */
    getScreenPosition(
        target: THREE.Object3D | null = this.getActive(),
        domWidth = window.innerWidth,
        domHeight = window.innerHeight,
    ): { x: number; y: number; visible: boolean } | null {
        if (!target) return null;
        const v = this._worldPos(target, this._tmp).project(this.ctrl.camera);
        const visible = v.z < 1;
        return {
            x: (v.x * 0.5 + 0.5) * domWidth,
            y: (-v.y * 0.5 + 0.5) * domHeight,
            visible,
        };
    }

    // ── Tab cycling (hard target) ─────────────────────────────────────────────

    /**
     * Cycle the hard target. dir = +1 next, -1 previous. Candidates are sorted
     * by angular distance from the camera's forward direction (centre-most
     * first), so Tab feels like the classic select-what-you're-looking-at.
     */
    cycle(dir: 1 | -1 = 1) {
        const cands = this._sortedCandidates(this.maxRange);
        if (!cands.length) { this.setHard(null); return; }

        let idx = this.hard ? cands.indexOf(this.hard) : -1;
        idx = (idx + dir + cands.length) % cands.length;
        // If current hard target isn't in the candidate list, start at the front.
        if (this.hard && cands.indexOf(this.hard) === -1) idx = dir === 1 ? 0 : cands.length - 1;
        this.setHard(cands[idx]);
    }

    /** Hard-target whatever is closest to screen centre (e.g. on RMB aim). */
    targetNearestToAim() {
        const cands = this._sortedCandidates(this.maxRange);
        this.setHard(cands[0] ?? null);
    }

    setHard(target: THREE.Object3D | null) {
        this.hard = target;
        this._emitIfChanged();
    }

    clearHard() {
        this.hard = null;
        this._emitIfChanged();
    }

    toggleHardNearest() {
        if (this.hard) this.clearHard();
        else this.targetNearestToAim();
    }

    // ── Per-frame update ──────────────────────────────────────────────────────

    update(_delta: number) {
        // Prune dead/removed hard target.
        if (this.hard && (!this.targets.includes(this.hard) || !this.isAlive(this.hard) || !this._inRange(this.hard, this.maxRange))) {
            this.hard = null;
        }
        // Recompute soft lock only when there's no hard target.
        this.soft = this.hard ? null : this._nearestInFront(this.softLockRange);
        this._emitIfChanged();
    }

    // ── Internals ─────────────────────────────────────────────────────────────

    private _emitIfChanged() {
        const active = this.getActive();
        if (active !== this._prevActive) {
            this._prevActive = active;
            this.onTargetChange?.(active, this.getActiveInfo());
        }
    }

    private _worldPos(obj: THREE.Object3D, out: THREE.Vector3): THREE.Vector3 {
        return obj.getWorldPosition(out);
    }

    private _playerPosition(): THREE.Vector3 | null {
        const p = this.ctrl.getPosition();
        if (!p) return null;
        return this._playerPos.copy(p);
    }

    private _inRange(obj: THREE.Object3D, range: number): boolean {
        const p = this._playerPosition();
        if (!p) return false;
        const scaled = range * this.ctrl.playerModelConfig.scale;
        return this._worldPos(obj, this._tmp).distanceTo(p) <= scaled;
    }

    /** Candidates within range + max angle of camera forward, sorted centre-first. */
    private _sortedCandidates(range: number): THREE.Object3D[] {
        const p = this._playerPosition();
        if (!p) return [];
        this.ctrl.camera.getWorldDirection(this._camDir).setY(0).normalize();
        const scaledRange = range * this.ctrl.playerModelConfig.scale;
        const maxAngle = THREE.MathUtils.degToRad(this.maxAngleDeg);

        const scored: { obj: THREE.Object3D; angle: number }[] = [];
        for (const t of this.targets) {
            if (!this.isAlive(t)) continue;
            this._toTarget.copy(this._worldPos(t, this._tmp)).sub(p);
            const dist = this._toTarget.length();
            if (dist > scaledRange || dist < 1e-3) continue;
            this._toTarget.setY(0).normalize();
            const angle = this._toTarget.angleTo(this._camDir);
            if (angle > maxAngle) continue;
            scored.push({ obj: t, angle });
        }
        scored.sort((a, b) => a.angle - b.angle);
        return scored.map(s => s.obj);
    }

    private _nearestInFront(range: number): THREE.Object3D | null {
        const cands = this._sortedCandidates(range);
        if (!cands.length) return null;
        // Among the in-front candidates, pick the physically nearest.
        const p = this._playerPosition()!;
        let best: THREE.Object3D | null = null;
        let bestDist = Infinity;
        for (const t of cands) {
            const d = this._worldPos(t, this._tmp).distanceTo(p);
            if (d < bestDist) { bestDist = d; best = t; }
        }
        return best;
    }

    dispose() {
        this.clearTargets();
        this.onTargetChange = undefined;
    }
}
