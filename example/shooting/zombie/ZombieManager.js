import { Vector3 } from "three";
import { ZombieEntity } from "./ZombieEntity.js";

export class ZombieManager {
    constructor(scene, options = {}) {
        // ==================== Scene refs ====================
        this._scene = scene;

        // ==================== Zombie config ====================
        this._loader = options.loader ?? null; // GLTF loader
        this._collider = options.collider ?? null; // Static collider
        this._modelUrl = options.modelUrl ?? ""; // Model path
        this._scale = options.scale ?? 0.01; // Model scale
        this._rotateY = options.rotateY ?? Math.PI; // Initial model yaw
        this._speed = options.speed ?? 120; // Move-speed baseline
        this._walkAnim = options.walkAnim ?? "walking"; // Walk clip name
        this._runAnim = options.runAnim ?? "running"; // Run clip name
        this._idleAnim = options.idleAnim ?? "Idle"; // Idle clip name
        this._punchAnim = options.punchAnim ?? "punching"; // Attack clip name
        this._deathAnim = options.deathAnim ?? "dying"; // Death clip name
        // ==================== Runtime ====================
        this._zombies = new Map(); // id → ZombieEntity
        this._wave = 0; // Current wave
        this._nextId = 0; // Auto-increment id
    }

    // ==================== Waves / spawn ====================

    // Spawn zombies in bulk from a wave config
    async startWave(waveConfig = {}) {
        if (!this._loader || !this._collider || !this._modelUrl) {
            console.warn("[ZombieManager] Missing loader, collider or modelUrl");
            return;
        }

        this._wave += 1;

        const origin = waveConfig.origin?.clone?.() ?? waveConfig.origin ?? new Vector3();
        const count = waveConfig.count ?? 5;
        const radius = waveConfig.radius ?? 10; // Default radius 10
        const spawnHeight = waveConfig.spawnHeight ?? 0.5; // Maps to y

        let spawnPoints = waveConfig.spawnPoints;

        // If no preset points, scatter random points in a disk of the given radius/height
        if (!spawnPoints) {
            spawnPoints = [];
            for (let i = 0; i < count; i++) {
                const angle = Math.random() * Math.PI * 2;
                const r = Math.sqrt(Math.random()) * radius; // Sqrt so points are uniform in the disk
                const x = Math.cos(angle) * r;
                const z = Math.sin(angle) * r;
                spawnPoints.push(new Vector3(origin.x + x, origin.y + spawnHeight, origin.z + z));
            }
        }

        await Promise.all(spawnPoints.map((point) => this.spawnZombie(point)));
    }

    // Spawn one zombie at a position; returns its id
    async spawnZombie(position) {
        const id = `zombie_${this._nextId++}`;
        const entity = new ZombieEntity(this._scene, id);
        await entity.load(this._loader, {
            modelUrl: this._modelUrl,
            collider: this._collider,
            position: position.clone?.() ?? new Vector3(position.x, position.y, position.z),
            scale: this._scale,
            walkAnim: this._walkAnim,
            runAnim: this._runAnim,
            idleAnim: this._idleAnim,
            punchAnim: this._punchAnim,
            deathAnim: this._deathAnim,
            rotateY: this._rotateY,
            speed: this._speed,
        });
        this._zombies.set(id, entity);
        return id;
    }

    // ==================== Hits ====================

    // Weapon hit callback — forward damage to the matching entity
    onHit(id, damage) {
        const entity = this._zombies.get(id);
        if (!entity || entity.isDead) return;
        entity.takeDamage(damage);
    }

    // ==================== Main loop ====================

    update(dt, playerPos) {
        if (!playerPos) return;

        for (const [id, entity] of this._zombies.entries()) {
            entity.update(dt, playerPos);

            // Remove the zombie entirely once it has been dead for 10s
            if (entity.isDead && entity.getDeathTime() >= 10) {
                entity.destroy();
                this._zombies.delete(id);
            }
        }

        this._resolveZombieOverlaps();
    }

    // Separate overlapping zombie capsules (pairwise push, horizontal only)
    _resolveZombieOverlaps() {
        const entities = Array.from(this._zombies.values()).filter(e => !e.isDead);
        for (let i = 0; i < entities.length; i++) {
            const a = entities[i];
            const aCapsule = a.getCapsule();
            const aInfo = a.getCapsuleInfo();
            if (!aCapsule || !aInfo) continue;

            for (let j = i + 1; j < entities.length; j++) {
                const b = entities[j];
                const bCapsule = b.getCapsule();
                const bInfo = b.getCapsuleInfo();
                if (!bCapsule || !bInfo) continue;

                const dx = bCapsule.position.x - aCapsule.position.x;
                const dz = bCapsule.position.z - aCapsule.position.z;
                const distSq = dx * dx + dz * dz;
                const minDist = aInfo.radius + bInfo.radius;

                if (distSq >= minDist * minDist || distSq <= 1e-10) continue;

                const dist = Math.sqrt(distSq);
                const half = (minDist - dist) * 0.5; // Push each half the overlap
                const nx = dx / dist;
                const nz = dz / dist;
                aCapsule.position.x -= nx * half;
                aCapsule.position.z -= nz * half;
                bCapsule.position.x += nx * half;
                bCapsule.position.z += nz * half;
            }
        }
    }

    // ==================== Destroy ====================

    destroy() {
        for (const entity of this._zombies.values()) {
            entity.destroy();
        }
        this._zombies.clear();
    }
}
