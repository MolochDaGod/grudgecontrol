import * as THREE from "three";
import type { playerController } from "../playerController";

export class CameraSystem {
    private ctrl: playerController; // main controller

    collisionLerp = 0.18; // collision lerp speed
    epsilon = 35; // keep-out offset from walls
    minDist = 100; // min camera distance
    maxDist = 440; // max camera distance
    originMaxDist = 440; // initial max distance
    sensitivity = 5; // mouse sensitivity
    mouseMode: 0 | 1 | 2 | 3 | 4 | 5 = 1; // mouse control mode
    zoomEnabled = false; // whether zoom is allowed
    lookAtHeightRatio = 0.8; // third-person look-at height (0=feet, 1=head)

    private lookAtPoint = new THREE.Vector3(); // preallocated look-at

    enableSpringCamera = false;
    springCameraTime = 0.05;
    vehicleTurnLerp = 0.01;
    private _springVelocity = new THREE.Vector3();
    private _springResult = new THREE.Vector3();

    raycaster = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3()); // camera collision ray
    centerRay = new THREE.Raycaster(); // screen-center ray
    centerMouse = new THREE.Vector2(); // screen-center coords
    playerToCam = new THREE.Vector3(); // player-to-camera vector
    private _rayDir = new THREE.Vector3();
    private _camSafe = new THREE.Vector3();

    constructor(ctrl: playerController) {
        this.ctrl = ctrl;
        (this.raycaster as any).firstHitOnly = true;
        (this.centerRay as any).firstHitOnly = true;
    }

    // Spring-damp controls.target toward dest; returns this frame's target
    springTarget(dest: THREE.Vector3, delta: number): THREE.Vector3 {
        if (!this.enableSpringCamera) return dest;
        const cur = this.ctrl.controls.target;
        const v = this._springVelocity;
        const out = this._springResult;
        const smoothTime = Math.max(0.0001, this.springCameraTime);
        const omega = 2 / smoothTime;
        const x = omega * delta;
        const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
        const axes = ['x', 'y', 'z'] as const;
        for (const a of axes) {
            const change = cur[a] - dest[a];
            const temp = (v[a] + omega * change) * delta;
            v[a] = (v[a] - omega * temp) * exp;
            let o = dest[a] + (change + temp) * exp;
            if ((dest[a] - cur[a] > 0) === (o > dest[a])) {
                o = dest[a];
                v[a] = 0;
            }
            out[a] = o;
        }
        return out;
    }

    // Third-person look-at point
    getLookAtPoint(): THREE.Vector3 {
        const capsuleInfo = this.ctrl.playerCapsule.capsuleInfo;
        const r = capsuleInfo.radius;
        const totalH = -capsuleInfo.segment.end.y + 2 * r;
        const y = this.ctrl.playerCapsule.position.y + r - totalH * (1 - this.lookAtHeightRatio);
        return this.lookAtPoint.copy(this.ctrl.playerCapsule.position).setY(y);
    }

    // Over-the-shoulder view offset
    setOverShoulder(enable: boolean) {
        if (!enable || this.ctrl.controllerMode === 1) { this.ctrl.camera.clearViewOffset(); return; }
        const w = window.innerWidth;
        const h = window.innerHeight;
        this.ctrl.camera.setViewOffset(w, h, w * 0.2, 0, w, h);
    }

    // Toggle first / third person
    changeView() {
        this.ctrl.onBeforeViewChange?.(this.ctrl.isFirstPerson);
        this.ctrl.isFirstPerson = !this.ctrl.isFirstPerson;
        if (this.ctrl.isFirstPerson) {
            // First person: align capsule yaw first
            const playerFwd = new THREE.Vector3(0, 0, 1).applyQuaternion(this.ctrl.playerCapsule.quaternion);
            const flatDir = new THREE.Vector3(playerFwd.x, 0, playerFwd.z).normalize();
            if (flatDir.lengthSq() > 0.001) {
                const yAngle = Math.atan2(flatDir.x, flatDir.z);
                this.ctrl.playerCapsule.rotation.set(0, yAngle, 0);
            }
            this.setFirstPerson();
            this.setOverShoulder(false);
        } else {
            // Third person: place camera behind the player
            this.ctrl.controls.enabled = true;
            this.ctrl.scene.attach(this.ctrl.camera);
            const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.ctrl.playerCapsule.quaternion);
            const angle = Math.atan2(dir.z, dir.x);
            const s = this.ctrl.playerModelConfig.scale;
            const rawOffset = new THREE.Vector3(Math.cos(angle) * 400 * s, 200 * s, Math.sin(angle) * 400 * s);
            this.ctrl.controls.target.copy(this.getLookAtPoint());
            this.ctrl.camera.position.copy(this.ctrl.controls.target).add(rawOffset.normalize().multiplyScalar(this.maxDist));
            this.ctrl.controls.enableZoom = this.zoomEnabled;
            this.setOverShoulder(this.ctrl.enableOverShoulderView);
        }
        this.setPointerLock();
        this.ctrl.onViewChange?.(this.ctrl.isFirstPerson);
    }

    // Enter first person
    setFirstPerson(vertAngle = 0) {
        this.ctrl.controls.enabled = false;
        const s = this.ctrl.playerModelConfig.scale;
        const sharedOffset = this.ctrl.playerModelConfig.firstPersonCameraOffset;
        // Attach to head bone if present, else capsule
        if (this.ctrl.playerModelHead) {
            const [x, y, z] = sharedOffset ?? [0, 10, 20];
            this.ctrl.playerModelHead.attach(this.ctrl.camera);
            this.ctrl.camera.position.set(x, y, z);
        } else {
            const [x, y, z] = sharedOffset ?? [0, 40, 30];
            this.ctrl.playerCapsule.attach(this.ctrl.camera);
            this.ctrl.camera.position.set(x * s, y * s, z * s);
        }
        this.ctrl.camera.rotation.set(
            THREE.MathUtils.clamp(vertAngle, -1.1, 1.4),
            Math.PI,
            0,
        );
        this.ctrl.controls.enableZoom = false;
    }

    // Pointer lock
    setPointerLock() {
        if (!document.body.requestPointerLock) return;
        if (((this.mouseMode === 0 || this.mouseMode === 1 || this.mouseMode === 5) && !this.ctrl.isFirstPerson) || this.ctrl.isFirstPerson) {
            document.body.requestPointerLock();
        } else {
            document.exitPointerLock();
        }
    }

    // Initial camera pose
    setCamPos() {
        requestAnimationFrame(() => {
            if (!this.ctrl.isFirstPerson) {
                const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.ctrl.playerCapsule.quaternion);
                const angle = Math.atan2(dir.z, dir.x);
                const s = this.ctrl.playerModelConfig.scale;
                const rawOffset = new THREE.Vector3(Math.cos(angle) * 400 * s, 200 * s, Math.sin(angle) * 400 * s);
                this.ctrl.controls.target.copy(this.getLookAtPoint());
                this.ctrl.camera.position.copy(this.ctrl.controls.target).add(rawOffset.normalize().multiplyScalar(this.maxDist));
                this.ctrl.controls.enableZoom = this.zoomEnabled;
            } else {
                this.setFirstPerson();
            }
            this.ctrl.camera.updateProjectionMatrix();
        });
    }

    // Init orbit controls
    initControls() {
        this.ctrl.controls.enableZoom = this.zoomEnabled;
        this.ctrl.controls.rotateSpeed = this.sensitivity * 0.05;
        this.ctrl.controls.maxPolarAngle = Math.PI;
        this.ctrl.controls.mouseButtons = { LEFT: 0, MIDDLE: 1, RIGHT: 2 };
        // Keep orbit radius from collapsing through the target
        this.ctrl.controls.minDistance = this.minDist;
    }

    // Reset orbit controls
    resetControls() {
        if (!this.ctrl.controls) return;
        this.ctrl.controls.enabled = true;
        this.ctrl.controls.enablePan = true;
        this.ctrl.controls.maxPolarAngle = Math.PI / 2;
        this.ctrl.controls.rotateSpeed = 1;
        this.ctrl.controls.enableZoom = true;
        this.ctrl.controls.mouseButtons = { LEFT: 0, MIDDLE: 1, RIGHT: 2 };
    }

    // Apply mouse look
    setToward(dx: number, dy: number, speed: number) {
        this.ctrl.onTowardChange?.(dx, dy, speed);
        if (!this.ctrl.enableToward || (this.ctrl.controllerMode === 0 && this.ctrl.isFirstPerson && this.ctrl.vehicle.isMovingToBoarding)) return;
        const sens = this.sensitivity;
        if (this.ctrl.controllerMode === 0) {
            // On-foot first person
            if (this.ctrl.isFirstPerson) {
                this.ctrl.playerCapsule.rotateY(-dx * speed * sens);
                this.ctrl.camera.rotation.x = THREE.MathUtils.clamp(
                    this.ctrl.camera.rotation.x + (-dy * speed * sens),
                    -Math.PI * (60 / 180), Math.PI * (80 / 180),
                );
            } else {
                // On-foot third person
                this.orbit(this.getLookAtPoint(), -dx * speed * sens, -dy * speed * sens);
            }
        } else {
            const v = this.ctrl.vehicle.active;
            if (!v) return;
            // Vehicle first person
            if (this.ctrl.isFirstPerson) {
                this.ctrl.camera.rotation.y = THREE.MathUtils.clamp(this.ctrl.camera.rotation.y + (-dx * speed * sens), Math.PI * (3 / 4), Math.PI * (5 / 4));
                this.ctrl.camera.rotation.x = THREE.MathUtils.clamp(this.ctrl.camera.rotation.x + (-dy * speed * sens), 0, Math.PI * (1 / 3));
            } else {
                // Vehicle third person
                this.orbit(v.vehicleGroup.position, -dx * speed * sens, -dy * speed * sens);
            }
        }
    }

    // Manual orbit
    private orbit(target: THREE.Vector3, deltaX: number, deltaY: number) {
        const distance = this.ctrl.camera.position.distanceTo(target);
        const cur = this.ctrl.camera.position.clone().sub(target);
        let theta = Math.atan2(cur.x, cur.z) + deltaX;
        let phi = Math.acos(THREE.MathUtils.clamp(cur.y / distance, -1, 1)) + deltaY;
        // Clamp pitch to avoid gimbal lock
        phi = Math.max(0.1, Math.min(Math.PI - 0.1, phi));
        this.ctrl.camera.position.set(
            target.x + distance * Math.sin(phi) * Math.sin(theta),
            target.y + distance * Math.cos(phi),
            target.z + distance * Math.sin(phi) * Math.cos(theta),
        );
        this.ctrl.camera.lookAt(target);
    }

    // Raycast keep-out from walls
    updateWithRaycast(origin: THREE.Vector3, maxDist: number = this.maxDist, minDist = this.minDist) {
        this.playerToCam.subVectors(this.ctrl.camera.position, origin);
        const direction = this._rayDir.copy(this.playerToCam).normalize();
        this.raycaster.set(origin, direction);
        this.raycaster.far = maxDist;

        const hits = this.raycaster.intersectObject(this.ctrl.collider!, false);
        if (hits.length > 0) {
            const safeDist = Math.max(hits[0].distance - this.epsilon, minDist);
            this.ctrl.camera.position.lerp(this._camSafe.copy(origin).addScaledVector(direction, safeDist), this.collisionLerp);
        } else {
            this.raycaster.far = maxDist;
            const maxHits = this.raycaster.intersectObject(this.ctrl.collider!, false);
            const safeDist = maxHits.length > 0 ? Math.min(maxDist, maxHits[0].distance - this.epsilon) : maxDist;
            this.ctrl.camera.position.lerp(this._camSafe.copy(origin).addScaledVector(direction, safeDist), this.collisionLerp);
        }
    }

    // Screen-center pick
    getCenterHit(): THREE.Intersection | undefined {
        this.ctrl.camera.updateMatrixWorld();
        this.centerRay.setFromCamera(this.centerMouse, this.ctrl.camera);
        this.centerRay.layers.set(1);
        this.centerRay.layers.enable(2);

        const checkTargets = this.ctrl.collider ? [this.ctrl.collider, ...this.ctrl.scene.children] : this.ctrl.scene.children;
        const hits = this.centerRay.intersectObjects(checkTargets, true);
        if (hits[0]) return hits[0];

        // No hit: virtual point 1000 units along the ray
        const fallbackPoint = this.centerRay.ray.at(1000, new THREE.Vector3());
        return {
            distance: 1000, point: fallbackPoint, object: this.ctrl.camera,
            uv: null as any, normal: null as any, face: null as any,
            faceIndex: null as any, instanceId: undefined,
        } as THREE.Intersection;
    }
}
