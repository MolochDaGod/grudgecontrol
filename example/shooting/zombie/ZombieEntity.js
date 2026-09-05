import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

export class ZombieEntity {
    constructor(scene, id) {
        // ==================== Scene refs ====================
        this._scene = scene;
        this.id = id; // Unique id

        // ==================== Scene objects ====================
        this._collider = null; // Static collider
        this._model = null; // Model root
        this._capsule = null; // Collision capsule
        this._capsuleInfo = null; // Capsule desc (radius + segment)
        this._mixer = null; // Animation mixer

        // ==================== Animation actions ====================
        this._walkAction = null; // Walk
        this._runAction = null; // Run
        this._idleAction = null; // Idle
        this._punchAction = null; // Attack
        this._deathAction = null; // Death
        this._currentAction = null; // Currently playing action
        this._punchLoopCb = null; // Attack-loop callback (for removeEventListener)

        // ==================== Life state ====================
        this.hp = 100; // Health
        this.isDead = false; // Dead?
        this._deathTime = 0; // Time since death (for timed cleanup)
        this._isRunning = Math.random() > 0.5; // Randomly a runner
        this._state = "idle"; // Current behavior state
        this._isPunching = false; // Currently attacking?
        this._inAttackRange = false; // In attack range?

        // ==================== Physics ====================
        this._gravity = -2.4; // Gravity (recomputed from scale on load)
        this._speed = 0.12; // Move speed (recomputed from scale on load)
        this._modelScale = 0.001; // Model scale
        this._capsuleHeight = 180; // Capsule height (model space, recomputed on load)
        this._capsuleRadius = 45; // Capsule radius (model space, recomputed on load)
        this._velocity = new THREE.Vector3(); // Current velocity (mainly gravity accumulation)
        this._onGround = false; // Grounded?

        // ==================== Reused vectors ====================
        this._tempBox = new THREE.Box3();
        this._tempMat = new THREE.Matrix4();
        this._tempSeg = new THREE.Line3();
        this._tempV1 = new THREE.Vector3();
        this._tempV2 = new THREE.Vector3();
        this._moveDir = new THREE.Vector3(); // Horizontal move dir (unit)
        this._lookTarget = new THREE.Vector3(); // Look-at target (reused)
        this._raycaster = new THREE.Raycaster(
            new THREE.Vector3(),
            new THREE.Vector3(0, -1, 0),
        );
        this._raycaster.firstHitOnly = true; // Nearest ground hit only
    }

    // Load model, bind clips, build capsule, add to scene
    async load(gltfLoader, {
        modelUrl,
        collider,
        position,
        scale = 0.001,
        walkAnim,
        runAnim,
        idleAnim,
        punchAnim,
        deathAnim,
        rotateY = Math.PI,
        speed = 120,
    }) {
        this._collider = collider;
        this._modelScale = scale;
        this._gravity = -2400 * scale;
        // ±15% speed jitter so zombies differ in stride and cadence
        this._speed = speed * scale * (0.85 + Math.random() * 0.3);

        const gltf = await gltfLoader.loadAsync(modelUrl);
        this._model = gltf.scene;

        this._mixer = new THREE.AnimationMixer(this._model);
        const clips = gltf.animations ?? [];

        // Find a clip by exact name or fuzzy match
        const findClip = (hint) => {
            if (!hint) return null;
            return (
                clips.find((clip) => clip.name === hint) ??
                clips.find((clip) => clip.name.toLowerCase().includes(hint.toLowerCase())) ??
                null
            );
        };

        const walkClip = findClip(walkAnim) ?? findClip("walk") ?? clips[0] ?? null;
        const runClip = findClip(runAnim) ?? findClip("run") ?? clips[0] ?? null;
        const idleClip = findClip(idleAnim) ?? findClip("idle") ?? clips[0] ?? null;
        const punchClip = findClip(punchAnim) ?? findClip("punch") ?? null;
        const deathClip = findClip(deathAnim) ?? findClip("dying") ?? findClip("death") ?? findClip("die") ?? null;

        // Looping actions start at weight 0 (activated by _playAnim as needed)
        const makeAction = (clip) => {
            if (!clip) return null;
            const action = this._mixer.clipAction(clip);
            action.setLoop(THREE.LoopRepeat, Infinity);
            action.setEffectiveWeight(0);
            action.enabled = true;
            return action;
        };

        this._walkAction = makeAction(walkClip);
        if (this._walkAction) {
            // Random playback speed (±10%) and random start offset (0-100%)
            this._walkAction.setEffectiveTimeScale(1.5 * (0.9 + Math.random() * 0.2));
            this._walkAction.time = Math.random() * walkClip.duration;
        }

        this._runAction = makeAction(runClip);
        if (this._runAction) {
            this._runAction.setEffectiveTimeScale(1.2 * (0.9 + Math.random() * 0.2));
            this._runAction.time = Math.random() * runClip.duration;
        }

        this._idleAction = idleClip !== walkClip ? makeAction(idleClip) : this._walkAction;
        if (this._idleAction) {
            // Scramble start time even on idle
            this._idleAction.time = Math.random() * (idleClip?.duration ?? 1);
        }

        if (punchClip) {
            this._punchAction = this._mixer.clipAction(punchClip);
            this._punchAction.setLoop(THREE.LoopRepeat, Infinity);
            this._punchAction.setEffectiveTimeScale(1.5);
            this._punchAction.setEffectiveWeight(0);
            this._punchAction.enabled = true;

            // At the end of each attack loop, switch back to move if already out of range
            this._punchLoopCb = (event) => {
                if (event.action !== this._punchAction || !this._isPunching) return;
                if (!this._inAttackRange) {
                    this._isPunching = false;
                    this._playAnim(this._walkAction ?? this._idleAction);
                }
            };
            this._mixer.addEventListener("loop", this._punchLoopCb);
        }

        this._deathAction = makeAction(deathClip);
        if (this._deathAction) {
            this._deathAction.setLoop(THREE.LoopOnce, 1);
            this._deathAction.clampWhenFinished = true; // Hold last frame
        }

        // Drive one frame so bones settle, then measure the bounding box
        this._mixer.update(0);
        this._model.updateMatrixWorld(true);

        const bbox = new THREE.Box3().setFromObject(this._model);
        const size = new THREE.Vector3();
        bbox.getSize(size);

        // Normalize the model to reference height 180, then multiply by scale for world size
        const refHeight = 180;
        const modelScaleFactor = refHeight / size.y;
        this._capsuleHeight = size.y * modelScaleFactor;
        this._capsuleRadius = Math.min(size.x, size.z) * modelScaleFactor;

        const radius = this._capsuleRadius * scale;
        const height = this._capsuleHeight * scale;

        // Capsule: transparent mesh used only for collision, not rendered
        this._capsule = new THREE.Mesh(
            new RoundedBoxGeometry(radius * 2, height, radius * 2, 1, 0.75),
            new THREE.MeshStandardMaterial({
                transparent: true,
                opacity: 0,
                depthWrite: false,
            }),
        );
        this._capsule.geometry.translate(0, -height * 0.25, 0);
        this._capsuleInfo = {
            radius,
            segment: new THREE.Line3(
                new THREE.Vector3(),
                new THREE.Vector3(0, -height * 0.5, 0),
            ),
        };
        this._capsule.name = "zombie_capsule";
        this._capsule.userData.zombieId = this.id;
        this._capsule.layers.enable(2);           // Layer 2: detectable by weapon rays
        this._scene.add(this._capsule);
        this._capsule.position.copy(position);

        this._model.scale.setScalar(modelScaleFactor * scale);
        this._model.position.set(0, -height * 0.75, 0);
        this._model.rotation.y = rotateY;
        this._model.traverse((child) => {
            child.userData.zombieId = this.id;
            child.castShadow = true;
            child.receiveShadow = true;
        });
        this._capsule.add(this._model);

        this._playAnim(this._idleAction ?? this._walkAction);
    }

    // ==================== Main loop ====================

    update(delta, playerPos) {
        if (!this._capsule || !this._collider) return;

        delta = Math.min(delta, 1 / 40); // Cap dt so large frame gaps don't tunnel

        if (this.isDead) {
            this._deathTime += delta;
            this._mixer?.update(delta);
            return;
        }

        // Gravity accumulation
        if (!this._onGround) {
            this._velocity.y += delta * this._gravity;
        }
        this._capsule.position.addScaledVector(this._velocity, delta);

        // Horizontal distance to player — in attack range?
        const pos = this._capsule.position;
        const dx = playerPos.x - pos.x;
        const dz = playerPos.z - pos.z;
        const horizDist = Math.sqrt(dx * dx + dz * dz);
        const stopRadius = this._capsuleInfo.radius * 2;
        this._inAttackRange = horizDist <= stopRadius;

        // Face the player (lookAt inverted so the model front faces the player)
        this._lookTarget.set(
            2 * pos.x - playerPos.x,
            pos.y,
            2 * pos.z - playerPos.z,
        );
        this._capsule.lookAt(this._lookTarget);

        if (this._inAttackRange) {
            this._moveDir.set(0, 0, 0);
            if (!this._isPunching) {
                this._isPunching = true;
                this._state = "attack";
                this._playAnim(this._punchAction ?? this._idleAction ?? this._walkAction);
            }
        } else {
            // Out of range: clear the attack flag immediately so move logic can run
            this._isPunching = false;

            if (horizDist > 1e-5) {
                this._moveDir.set(dx / horizDist, 0, dz / horizDist);
                this._state = this._isRunning ? "run" : "walk";
                const moveAnim = this._isRunning ? (this._runAction ?? this._walkAction) : this._walkAction;
                this._playAnim(moveAnim ?? this._idleAction);
            } else {
                this._moveDir.set(0, 0, 0);
                this._state = "idle";
                this._playAnim(this._idleAction ?? this._walkAction);
            }
        }

        const currentSpeed = this._isRunning ? this._speed * 1.5 : this._speed;
        this._applyEnvironmentCollision(delta, currentSpeed);
        this._applyGrounding(delta);
        this._mixer?.update(delta);
    }

    // ==================== Damage / death ====================

    takeDamage(damage) {
        if (this.isDead) return false;
        this.hp -= damage;
        if (this.hp <= 0) {
            this.die();
            return true; // This hit caused death
        }
        return false;
    }

    die() {
        if (this.isDead) return;
        this.isDead = true;
        this._state = "die";
        this._isPunching = false;
        this._deathTime = 0;
        this._velocity.set(0, 0, 0);

        if (this._deathAction) {
            this._playAnim(this._deathAction, 0.1);
        }

        // Disable the layer so raycasts and auto-aim ignore corpses
        this._capsule.layers.disable(2);
        this._model.traverse((child) => {
            if (child.isMesh) {
                child.layers.disable(2);
            }
        });
    }

    // ==================== Getter ====================

    getPosition() { return this._capsule?.position ?? null; }
    getCapsule() { return this._capsule; }
    getCapsuleInfo() { return this._capsuleInfo; }
    getDeathTime() { return this._deathTime; }

    // ==================== Private ====================

    // Switch clip with fade in/out
    _playAnim(action, fade = 0.2) {
        if (!action || this._currentAction === action) return;
        const prev = this._currentAction;
        action.reset().setEffectiveWeight(1).play();
        if (prev) {
            prev.fadeOut(fade);
            action.fadeIn(fade);
        } else {
            action.fadeIn(fade);
        }
        this._currentAction = action;
    }

    // Stepped move + BVH environment collision (vertical faces only; horizontals go to _applyGrounding)
    _applyEnvironmentCollision(delta, speed) {
        const ci = this._capsuleInfo;
        const totalDist = speed * delta;
        const maxStep = ci.radius * 0.8;                          // Max move per step — avoid high-speed tunneling
        const steps = Math.ceil(totalDist / maxStep) || 1;
        const stepDist = totalDist / steps;

        for (let i = 0; i < steps; i++) {
            this._capsule.position.addScaledVector(this._moveDir, stepDist);
            this._capsule.updateMatrixWorld();

            this._tempBox.makeEmpty();
            this._tempMat.copy(this._collider.matrixWorld).invert();
            this._tempSeg.copy(ci.segment);
            this._tempSeg.start
                .applyMatrix4(this._capsule.matrixWorld)
                .applyMatrix4(this._tempMat);
            this._tempSeg.end
                .applyMatrix4(this._capsule.matrixWorld)
                .applyMatrix4(this._tempMat);
            this._tempBox.expandByPoint(this._tempSeg.start).expandByPoint(this._tempSeg.end);
            this._tempBox.expandByScalar(ci.radius);

            this._collider.geometry?.boundsTree?.shapecast({
                intersectsBounds: (box) => box.intersectsBox(this._tempBox),
                intersectsTriangle: (tri) => {
                    const dist = tri.closestPointToSegment(
                        this._tempSeg,
                        this._tempV1,
                        this._tempV2,
                    );
                    if (dist >= ci.radius) return;
                    const normal = tri.getNormal(new THREE.Vector3());
                    if (Math.abs(normal.y) > 0.5) return; // Horizontal faces handled by _applyGrounding
                    const dir = this._tempV2.sub(this._tempV1).normalize();
                    const depth = ci.radius - dist;
                    this._tempSeg.start.addScaledVector(dir, depth);
                    this._tempSeg.end.addScaledVector(dir, depth);
                },
            });

            const newPos = this._tempV1
                .copy(this._tempSeg.start)
                .applyMatrix4(this._collider.matrixWorld);
            const deltaVec = this._tempV2.subVectors(newPos, this._capsule.position);
            const offset = Math.max(0, deltaVec.length() - 1e-5);
            if (offset > 0) {
                this._capsule.position.add(deltaVec.normalize().multiplyScalar(offset));
            }
        }
    }

    // Ray down to find ground and snap the capsule to ground height
    _applyGrounding(delta) {
        this._raycaster.ray.origin.copy(this._capsule.position);
        const hits = this._raycaster.intersectObject(this._collider, false);

        if (!hits.length) {
            this._onGround = false;
            return;
        }

        const groundY = hits[0].point.y;
        const scale = this._modelScale;
        const snapHeight = this._capsuleHeight * scale * 0.75; // Capsule hover height
        const maxHeight = this._capsuleHeight * scale * 0.9;   // Farther than this = airborne
        const dist = this._capsule.position.y - groundY;

        if (dist >= maxHeight) {
            this._onGround = false;
            return;
        }

        this._velocity.set(0, 0, 0);
        this._onGround = true;

        if (dist >= snapHeight) {
            // Smooth snap (avoids jitter on slopes)
            this._capsule.position.y = THREE.MathUtils.lerp(
                this._capsule.position.y,
                groundY + snapHeight,
                Math.min(1, 15 * delta),
            );
        } else {
            this._capsule.position.y = groundY + snapHeight;
        }
    }

    // ==================== Destroy ====================

    destroy() {
        if (this._mixer) {
            if (this._punchLoopCb) {
                this._mixer.removeEventListener("loop", this._punchLoopCb);
                this._punchLoopCb = null;
            }
            this._mixer.stopAllAction();
            this._mixer.uncacheRoot(this._model);
            this._mixer = null;
        }
        if (this._capsule) {
            this._scene.remove(this._capsule);
            this._capsule.geometry?.dispose();
            this._capsule.material?.dispose?.();
            this._capsule = null;
        }
        this._model = null;
        this._collider = null;
    }
}
