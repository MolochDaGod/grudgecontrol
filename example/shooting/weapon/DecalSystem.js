import {
    Matrix3,
    Mesh,
    MeshBasicMaterial,
    Object3D,
    PlaneGeometry,
    TextureLoader,
} from "three";

const _normalMatrix = new Matrix3(); // Normal matrix
const _decalHelper = new Object3D(); // Helper used to orient bullet holes

// Bullet-hole decal system (object pool)
export class DecalSystem {
    constructor(scene, maxDecals = 60, decalSize = 0.02) {
        // ==================== Scene refs ====================
        this._scene = scene;

        // ==================== Pool config ====================
        this._maxDecals = maxDecals; // Max holes; oldest is removed when exceeded
        this._pool = []; // Bullet-hole meshes currently in the scene
        this._mats = []; // Hole materials (picked at random)
        this._geo = new PlaneGeometry(decalSize, decalSize); // Hole plane geometry
        this.onSpawn = null; // (hitPoint, hitNormal) => void, multiplayer broadcast hook
    }

    // ==================== Init ====================

    // Load hole textures in bulk and build matching materials
    async loadMaterials(files, baseUrl) {
        const loader = new TextureLoader();
        await Promise.all(
            files.map(async (f) => {
                const tex = await loader.loadAsync(baseUrl + f);
                this._mats.push(
                    new MeshBasicMaterial({
                        map: tex,
                        transparent: true,
                        depthTest: true,
                        depthWrite: false,
                        polygonOffset: true,
                        polygonOffsetFactor: -4, // Avoid Z-fighting with walls
                    })
                );
            })
        );
    }

    // ==================== Spawn / clear ====================

    // Spawn a hole at the ray hit and trigger hit-smoke FX
    spawn(hit, effects) {
        if (!hit?.face || !hit?.object) return;
        if (!this._mats.length) return;

        // World-space normal
        _normalMatrix.getNormalMatrix(hit.object.matrixWorld);
        const hitNormal = hit.face.normal.clone().applyMatrix3(_normalMatrix).normalize();
        const hitPoint = hit.point.clone();

        // Hole orientation (face the normal + random roll)
        _decalHelper.position.copy(hitPoint);
        _decalHelper.lookAt(hitPoint.clone().add(hitNormal));
        _decalHelper.rotation.z = Math.random() * Math.PI * 2;

        // Create the hole mesh, nudged along the normal to avoid Z-fighting
        const mat = this._mats[Math.floor(Math.random() * this._mats.length)];
        const decal = new Mesh(this._geo, mat);
        decal.position.copy(hitPoint).addScaledVector(hitNormal, 0.001);
        decal.rotation.copy(_decalHelper.rotation);
        decal.renderOrder = 1;
        this._scene.add(decal);

        // Drop the oldest hole when over the cap
        this._pool.push(decal);
        if (this._pool.length > this._maxDecals) {
            this._scene.remove(this._pool.shift());
        }

        // Hit-smoke FX
        effects?.triggerHitSmoke(hitPoint, hitNormal);

        // Broadcast to other clients (multiplayer hook)
        this.onSpawn?.(hitPoint, hitNormal);
    }

    // Spawn a hole from world point + normal (remote decals; no smoke)
    spawnAtPoint(hitPoint, hitNormal) {
        if (!this._mats.length) return;

        _decalHelper.position.copy(hitPoint);
        _decalHelper.lookAt(hitPoint.clone().add(hitNormal));
        _decalHelper.rotation.z = Math.random() * Math.PI * 2;

        const mat = this._mats[Math.floor(Math.random() * this._mats.length)];
        const decal = new Mesh(this._geo, mat);
        decal.position.copy(hitPoint).addScaledVector(hitNormal, 0.001);
        decal.rotation.copy(_decalHelper.rotation);
        decal.renderOrder = 1;
        this._scene.add(decal);

        this._pool.push(decal);
        if (this._pool.length > this._maxDecals) {
            this._scene.remove(this._pool.shift());
        }
    }

    // Clear all holes
    clear() {
        for (const d of this._pool) this._scene.remove(d);
        this._pool.length = 0;
    }
}
