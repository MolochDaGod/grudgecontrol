import {
    AdditiveBlending,
    Audio,
    AudioLoader,
    BufferAttribute,
    BufferGeometry,
    Mesh,
    MeshBasicMaterial,
    NormalBlending,
    PlaneGeometry,
    Points,
    PointsMaterial,
    Quaternion,
    TextureLoader,
    Vector3,
} from "three";

// Reused temps (avoid per-frame GC)
const _rollQ = new Quaternion();
const _rollAxis = new Vector3(0, 0, 1);
const _camWorldQ = new Quaternion();

const flashDuration = 0.06;  // Muzzle-flash duration (seconds)
const smokeCount = 14;       // Particles per hit
const smokeLifetime = 0.7;   // Smoke lifetime (seconds)
const smokePoolSize = 8;     // Smoke pool size

// ==================== Muzzle flash ====================

class MuzzleFlash {
    constructor(scene, texture, scale = 0.01) {
        this._mesh = new Mesh(
            new PlaneGeometry(1, 1),
            new MeshBasicMaterial({
                map: texture,
                transparent: true,
                blending: AdditiveBlending,
                depthWrite: false,
                opacity: 0,
            })
        );
        this._mesh.visible = false;
        this._timer = 0;
        this._scale = scale;
        this._cam = null;
        scene.add(this._mesh);
    }

    // Trigger flash at the muzzle
    trigger(worldPos, camera) {
        this._mesh.position.copy(worldPos);
        this._mesh.scale.setScalar(this._scale);
        camera.getWorldQuaternion(_camWorldQ);
        this._mesh.quaternion.copy(_camWorldQ);
        _rollQ.setFromAxisAngle(_rollAxis, Math.random() * Math.PI * 2); // Random roll so flashes don't look identical
        this._mesh.quaternion.multiply(_rollQ);
        this._mesh.material.opacity = 1;
        this._mesh.visible = true;
        this._timer = flashDuration;
        this._cam = camera;
    }

    update(dt) {
        if (!this._mesh.visible) return;
        this._timer -= dt;
        if (this._timer <= 0) {
            this._mesh.visible = false;
            return;
        }
        // Billboard: align to camera each frame
        if (this._cam) { this._cam.getWorldQuaternion(_camWorldQ); this._mesh.quaternion.copy(_camWorldQ); }
        this._mesh.material.opacity = this._timer / flashDuration; // Linear fade-out
    }
}

// ==================== Hit smoke ====================

class SmokeEffect {
    constructor(scene, texture, size = 0.06) {
        this._active = false;
        this._timer = 0;
        this._pos = new Float32Array(smokeCount * 3); // Particle position buffer
        this._vels = Array.from({ length: smokeCount }, () => new Vector3()); // Particle velocities

        const geo = new BufferGeometry();
        geo.setAttribute("position", new BufferAttribute(this._pos, 3));

        this._points = new Points(geo, new PointsMaterial({
            map: texture,
            size: size,
            sizeAttenuation: true,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            blending: NormalBlending,
        }));
        this._points.visible = false;
        scene.add(this._points);
    }

    // Trigger smoke at the hit point, scatter along the normal
    trigger(worldPos, worldNormal) {
        this._active = true;
        this._timer = smokeLifetime;
        this._points.visible = true;

        for (let i = 0; i < smokeCount; i++) {
            const i3 = i * 3;
            this._pos[i3] = worldPos.x + (Math.random() - 0.5) * 0.02;
            this._pos[i3 + 1] = worldPos.y + (Math.random() - 0.5) * 0.02;
            this._pos[i3 + 2] = worldPos.z + (Math.random() - 0.5) * 0.02;
            this._vels[i]
                .set(
                    (Math.random() - 0.5) * 0.5,
                    0.15 + Math.random() * 0.25,
                    (Math.random() - 0.5) * 0.5
                )
                .addScaledVector(worldNormal, 0.3 + Math.random() * 0.4);
        }
        this._points.geometry.attributes.position.needsUpdate = true;
    }

    update(dt) {
        if (!this._active) return;
        this._timer -= dt;
        if (this._timer <= 0) {
            this._active = false;
            this._points.visible = false;
            return;
        }
        this._points.material.opacity = (this._timer / smokeLifetime) * 0.7;
        for (let i = 0; i < smokeCount; i++) {
            const i3 = i * 3;
            this._pos[i3] += this._vels[i].x * dt;
            this._pos[i3 + 1] += this._vels[i].y * dt;
            this._pos[i3 + 2] += this._vels[i].z * dt;
            this._vels[i].multiplyScalar(0.92); // Drag
        }
        this._points.geometry.attributes.position.needsUpdate = true;
    }
}

// ==================== Public API ====================

export class ShootingEffects {
    constructor(scene, { listener = null, flashScale = 0.01, smokeSize = 0.06 } = {}) {
        // ==================== Scene refs ====================
        this._scene = scene;
        this._listener = listener; // THREE.AudioListener

        // ==================== Effect config ====================
        this._flashScale = flashScale; // Muzzle-flash scale
        this._smokeSize = smokeSize;   // Smoke particle size

        // ==================== Effect objects ====================
        this._flash = null;      // MuzzleFlash instance
        this._smokePool = [];    // SmokeEffect pool
        this._smokeIdx = 0;      // Round-robin index
        this._fireSound = null;   // Fire SFX
        this._reloadSound = null; // Reload SFX
    }

    // Load textures and audio, create effect instances
    async load(flashTexPath, smokeTexPath, fireSoundPath = null, reloadSoundPath = null) {
        const loader = new TextureLoader();
        const audioLoader = new AudioLoader();

        const [flashTex, smokeTex, fireBuffer, reloadBuffer] = await Promise.all([
            loader.loadAsync(flashTexPath),
            loader.loadAsync(smokeTexPath),
            fireSoundPath   ? audioLoader.loadAsync(fireSoundPath).catch(() => null)   : Promise.resolve(null),
            reloadSoundPath ? audioLoader.loadAsync(reloadSoundPath).catch(() => null) : Promise.resolve(null),
        ]);

        this._flash = new MuzzleFlash(this._scene, flashTex, this._flashScale);

        if (fireBuffer && this._listener) {
            this._fireSound = new Audio(this._listener);
            this._fireSound.setBuffer(fireBuffer);
            this._fireSound.setVolume(0.4);
        }

        if (reloadBuffer && this._listener) {
            this._reloadSound = new Audio(this._listener);
            this._reloadSound.setBuffer(reloadBuffer);
            this._reloadSound.setVolume(0.6);
        }

        // Pre-create smoke pool
        for (let i = 0; i < smokePoolSize; i++) {
            this._smokePool.push(new SmokeEffect(this._scene, smokeTex, this._smokeSize));
        }
    }

    // ==================== Trigger API ====================

    // Muzzle flash + fire SFX
    triggerMuzzleFlash(worldPos, camera) {
        this._flash?.trigger(worldPos, camera);
        if (this._fireSound) {
            if (this._fireSound.isPlaying) this._fireSound.stop();
            this._fireSound.play();
        }
    }

    // Reload SFX
    triggerReloadSound() {
        if (!this._reloadSound) return;
        if (this._reloadSound.isPlaying) this._reloadSound.stop();
        this._reloadSound.play();
    }

    stopReloadSound() {
        if (this._reloadSound?.isPlaying) this._reloadSound.stop();
    }

    // Hit smoke (round-robin pool)
    triggerHitSmoke(worldPos, worldNormal) {
        const e = this._smokePool[this._smokeIdx % this._smokePool.length];
        this._smokeIdx++;
        e.trigger(worldPos, worldNormal);
    }

    // Update all effects each frame
    update(dt) {
        this._flash?.update(dt);
        for (const e of this._smokePool) e.update(dt);
    }
}
