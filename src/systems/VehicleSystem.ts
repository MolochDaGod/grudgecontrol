import * as THREE from "three";
import type { World } from "@dimforge/rapier3d-compat";
import type { playerController } from "../playerController";
import { loadVehicleModel as loadVehicleModelUtil } from "../utils/vehicleLoader";
import type { VehicleInstance, VehicleOptions } from "../types";

export class VehicleSystem {
    private ctrl: playerController; // main controller

    list: VehicleInstance[] = []; // vehicle instances
    active: VehicleInstance | null = null; // currently boarded vehicle
    maxCount = 6; // max vehicle count
    RAPIER: any = null; // physics module
    world: World | null = null; // physics world
    params = {
        debug: { showPhysicsBox: false }, // debug draw
        chassis: { linearDamping: 0.5, angularDamping: 0.5 }, // chassis damping
        model: { rotation: -Math.PI / 2 }, // model yaw
        power: { accelerateForce: 50, brakeForce: 200, maxSpeed: 10000 }, // power
        steering: { maxSteerAngle: Math.PI / 4, steerSpeed: 0.5, steerReturnSpeed: 1 }, // steering
        followVehicleDirection: true, // camera follows travel direction
    };

    steerQuat = new THREE.Quaternion(); // steer quaternion
    rotQuat = new THREE.Quaternion(); // rotation quaternion

    // ==================== Unstick hop ====================
    stuckTimer = 0; // time spent stuck
    stuckSpeedThreshold = 0.5; // horizontal speed treated as "almost stopped"
    stuckTimeThreshold = 1; // seconds of stall before unstick
    stuckHopRatio = 0.5; // hop height = vehicle height * this

    // ==================== Boarding state ====================
    isMovingToBoarding = false; // walking to board point
    waypoints: THREE.Vector3[] = []; // path waypoints
    waypointIdx = 0; // current waypoint
    targetDir: THREE.Vector3 | null = null; // facing target
    moveSpeed = 300; // auto-move speed
    rotSpeed = 10; // auto-rotate speed
    boardingPoint: THREE.Vector3 | null = null; // board position
    isBoardingAnim = false; // enter-car clip playing
    doorClosed = false; // enter door closed
    isExitAnim = false; // exit-car clip playing
    exitDoorClosed = false; // exit door closed
    doorTimer: any = null; // door open/close timer
    flip180 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI); // 180 deg yaw

    constructor(ctrl: playerController) {
        this.ctrl = ctrl;
    }

    // Init Rapier
    async initRapier() {
        if (this.RAPIER) return;
        this.RAPIER = await import("@dimforge/rapier3d-compat");
        await this.RAPIER.init();

        this.world = new this.RAPIER.World(new this.RAPIER.Vector3(0, -9.81, 0)) as World;
        (this.world as any).maxCcdSubsteps = 2;

        // Build trimesh colliders
        const addTrimesh = (RAPIER: any, world: any, geom: THREE.BufferGeometry) => {
            let g = geom.index ? geom.clone().toNonIndexed() : geom.clone();
            const pos = g.attributes.position;
            const count = pos.count;
            const verts = new Float32Array(count * 3);
            const tmp = new THREE.Vector3();
            for (let i = 0; i < count; i++) {
                tmp.fromBufferAttribute(pos, i);
                verts[i * 3] = tmp.x; verts[i * 3 + 1] = tmp.y; verts[i * 3 + 2] = tmp.z;
            }
            const indices = count > 65535 ? new Uint32Array(count) : new Uint16Array(count);
            for (let i = 0; i < count; i++) indices[i] = i;

            const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
            world.createCollider(
                RAPIER.ColliderDesc.trimesh(verts, indices).setRestitution(0).setFriction(0.8),
                body,
            );
        };

        for (const g of this.ctrl.collected) addTrimesh(this.RAPIER, this.world, g);

        // Ground rigid body
        const groundBody = this.world.createRigidBody(this.RAPIER.RigidBodyDesc.fixed());
        groundBody.userData = { outOfBounds: true };

    }

    // Load a vehicle model
    async load(opts: VehicleOptions) {
        try {
            if (!this.ctrl.playerModelConfig.enterCarAnim) {
                return console.warn("enterCarAnim is not configured; skipping vehicle logic");
            }
            await this.initRapier();
            if (!this.world) return;

            const instance = await loadVehicleModelUtil(opts, {
                loader: this.ctrl.loader,
                scene: this.ctrl.scene,
                world: this.world,
                RAPIER: this.RAPIER,
                vehicleParams: this.params,
                vehicleLength: this.maxCount,
                playerScale: this.ctrl.playerModelConfig.scale,
            });

            this.list.push(instance);
            this.ctrl.addDynamicCollider(instance.vehicleGroup);
            this.setTransition();
        } catch (e) {
            console.error("Failed to load vehicle model:", e);
        }
    }

    // Open or close the door clip
    openDoor(isOpen = true) {
        const v = this.active;
        if (!v?.vehicleActions) return;
        const next = v.vehicleActions.get("openDoor");
        if (!next) return;

        const duration = next.getClip().duration;
        next.reset();
        next.setEffectiveWeight(1);

        // Forward = open, reverse = close
        if (isOpen) {
            next.setEffectiveTimeScale(duration * 2);
            next.time = 0;
            v.vehiclIsOpenDoor = true;
        } else {
            next.setEffectiveTimeScale(-duration * 2);
            next.time = duration;
            v.vehiclIsOpenDoor = false;
        }

        next.setLoop(THREE.LoopOnce, 1);
        next.clampWhenFinished = true;
        next.play();
    }

    // Start boarding
    enter() {
        if (!this.list.length || this.isMovingToBoarding) return;

        // Nearest boardable vehicle
        let nearest: VehicleInstance | null = null;
        let nearestDist = Infinity;
        let nearBoardingPoint: THREE.Vector3 | null = null;

        for (const v of this.list) {
            const boardingLocal = v.boardingPoint.clone().multiplyScalar(v.scale);
            const boardingWorld = v.vehicleGroup.localToWorld(boardingLocal);
            const dist = this.ctrl.playerCapsule.position.distanceTo(boardingWorld);
            if (dist < 800 * this.ctrl.playerModelConfig.scale && dist < nearestDist) {
                nearestDist = dist;
                nearest = v;
                nearBoardingPoint = boardingWorld;
            }
        }

        if (!nearest || !nearBoardingPoint) return;
        this.active = nearest;
        const v = nearest;

        // Cannot board while the vehicle is moving
        const vel = v.chassisBody.linvel();
        if (Math.sqrt(vel.x ** 2 + vel.z ** 2) > 0.1) return;

        // Plan path and start walking
        this.boardingPoint = nearBoardingPoint;
        this.waypoints = v.pathPlanner.findPath(this.ctrl.playerCapsule.position.clone(), nearBoardingPoint);
        this.waypointIdx = 0;
        this.targetDir = new THREE.Vector3(0, 0, 1).applyQuaternion(v.vehicleGroup.quaternion).normalize();
        this.isMovingToBoarding = true;
        this.ctrl.animation.playByName("walking");
    }

    // Walk along waypoints to the board point
    updateMoveTo(delta: number) {
        const c = this.ctrl;
        if (!this.isMovingToBoarding || !this.targetDir || !this.waypoints.length) return;

        // Waypoints done: align
        if (this.waypointIdx >= this.waypoints.length) {
            this.finalizeBoarding(delta);
            return;
        }

        const waypoint = this.waypoints[this.waypointIdx];
        const currentPos = c.playerCapsule.position.clone();
        const isLast = this.waypointIdx === this.waypoints.length - 1;
        const threshold = isLast ? 0 : 10 * c.playerModelConfig.scale;
        const horizDist = new THREE.Vector2(waypoint.x - currentPos.x, waypoint.z - currentPos.z).length();

        // Move and yaw toward the waypoint
        if (horizDist > threshold) {
            const moveDir = new THREE.Vector3(waypoint.x - currentPos.x, 0, waypoint.z - currentPos.z).normalize();
            c.playerCapsule.position.add(moveDir.clone().multiplyScalar(Math.min(this.moveSpeed * c.playerModelConfig.scale * delta, horizDist)));
            c.targetMat.lookAt(c.playerCapsule.position, c.playerCapsule.position.clone().add(moveDir), c.playerCapsule.up);
            c.targetQuat.setFromRotationMatrix(c.targetMat).multiply(this.flip180);
            c.playerCapsule.quaternion.slerp(c.targetQuat, Math.min(1, this.rotSpeed * delta));
        } else {
            this.waypointIdx++;
        }
    }

    // Finish facing alignment, then play enter-car
    finalizeBoarding(delta: number) {
        const c = this.ctrl;
        const v = this.active;
        if (!this.targetDir || !v || !this.isMovingToBoarding) return;

        // Rotate to match vehicle facing
        const currentDir = new THREE.Vector3(0, 0, -1).applyQuaternion(c.playerCapsule.quaternion).normalize();
        if (currentDir.angleTo(this.targetDir) > 0.01) {
            const lookTarget = c.playerCapsule.position.clone().add(this.targetDir);
            c.targetMat.lookAt(c.playerCapsule.position, lookTarget, c.playerCapsule.up);
            c.targetQuat.setFromRotationMatrix(c.targetMat);
            c.playerCapsule.quaternion.slerp(c.targetQuat, Math.min(1, this.rotSpeed * delta));
        } else {
            // Aligned: play enter-car
            this.waypoints = [];
            this.waypointIdx = 0;
            this.targetDir = null;
            v.pathPlanner?.clearVisualization();

            c.animation.playByName("enterCar");
            this.isBoardingAnim = true;
            this.doorClosed = false;
            if (!v.vehiclIsOpenDoor) this.openDoor();
            c.playerCapsule.rotation.copy(v.vehicleGroup.rotation);
            c.playerCapsule.quaternion.multiply(this.flip180);
        }
    }

    // Enter-car clip finished
    onEnterAnimFinished() {
        const c = this.ctrl;
        const v = this.active;
        if (!v || !this.isMovingToBoarding) return;
        c.playerCapsule.updateMatrixWorld(true);
        const offsetY = this.boardingPoint!.y - c.playerCapsule.position.y;

        // Attach to vehicle and apply seat offset
        c.controllerMode = 1;
        c.mobileControls?.syncControllerModeBtn(1);
        c.cam.setOverShoulder(false);
        v.vehicleGroup.attach(c.playerCapsule);
        c.playerCapsule.position.add(v.seatOffset.clone().multiplyScalar(v.scale).add(new THREE.Vector3(0, offsetY, 0)));
        this.isMovingToBoarding = false;
        c.syncDebugVisibility();
        c.onVehicleEnter?.(v);
    }

    // Start exit
    exit() {
        const c = this.ctrl;
        const v = this.active;
        if (!v) return;

        this.isMovingToBoarding = false;
        this.waypoints = [];
        this.waypointIdx = 0;
        this.targetDir = null;

        // Exit clip only when stopped
        const vel = v.chassisBody.linvel();
        if (Math.sqrt(vel.x ** 2 + vel.z ** 2) < 0.1) {
            c.animation.playByName("exitCar");
            this.isExitAnim = true;
            this.exitDoorClosed = false;
        } else {
            c.animation.playByName("idle");
        }

        this.openDoor(true);
        c.controllerMode = 0;
        c.mobileControls?.syncControllerModeBtn(0);
        c.cam.setOverShoulder(c.enableOverShoulderView);
        c.scene.attach(c.playerCapsule);
        if (c.isFirstPerson) c.cam.setFirstPerson();
        c.syncDebugVisibility();
        this.setTransition();
    }

    // Cancel boarding walk
    cancelBoarding() {
        this.isMovingToBoarding = false;
        this.waypoints = [];
        this.waypointIdx = 0;
        this.targetDir = null;
    }

    // Drive update
    updateVehicle(delta: number) {
        const c = this.ctrl;
        const v = this.active;
        if (!v || !this.world) return;
        const { vehicleController, chassisBody, vehicleGroup } = v;

        // Slope compensation
        const rotation = chassisBody.rotation();
        const quat = new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w);
        const forward = new THREE.Vector3(1, 0, 0).applyQuaternion(quat);
        const slopeAngle = Math.asin(forward.y);
        const factor = (slopeAngle < -0.05 && c.input.fwd) ? -Math.sin(slopeAngle) * 10 : 1;

        // Engine force
        const accelerateForce = this.params.power.accelerateForce * v.speedMultiplier;
        const engineForce = (Number(c.input.fwd) - Number(c.input.bkd)) * accelerateForce * factor;
        for (let i = 0; i < 4; i++) vehicleController.setWheelEngineForce(i, engineForce);

        // Brake
        const wheelBrake = Number(c.input.space) * this.params.power.brakeForce * delta;
        for (let i = 0; i < 4; i++) vehicleController.setWheelBrake(i, wheelBrake);

        // Steering
        const currentSteering = vehicleController.wheelSteering(0) || 0;
        const steerDir = Number(c.input.lft) - Number(c.input.rgt);
        const steerSpeed = steerDir === 0 ? this.params.steering.steerReturnSpeed : this.params.steering.steerSpeed;
        const steering = THREE.MathUtils.lerp(currentSteering, this.params.steering.maxSteerAngle * steerDir, 1 - Math.pow(1 - steerSpeed, delta));
        vehicleController.setWheelSteering(0, steering);
        vehicleController.setWheelSteering(1, steering);

        // Drift friction
        const driftFriction = ((c.input.rgt || c.input.lft) && c.input.shift) ? 0.5 : 2;
        vehicleController.setWheelSideFrictionStiffness(2, driftFriction);
        vehicleController.setWheelSideFrictionStiffness(3, driftFriction);

        // Unstick: throttle held but almost stopped for too long — hop up + forward along travel
        const linv = chassisBody.linvel();
        if ((c.input.fwd || c.input.bkd) && Math.hypot(linv.x, linv.z) < this.stuckSpeedThreshold) {
            this.stuckTimer += delta;
        } else {
            this.stuckTimer = 0;
        }
        if (this.stuckTimer > this.stuckTimeThreshold) {
            const g = 9.81;
            const vUp = Math.sqrt(2 * g * v.size.h * this.stuckHopRatio); // takeoff speed to reach ~height*ratio
            const mass = chassisBody.mass();
            const dir = c.input.bkd ? -1 : 1;
            // Chassis horizontal forward (local +X, same as slope compensation)
            const fl = Math.hypot(forward.x, forward.z);
            const fx = fl > 0.001 ? forward.x / fl : 0;
            const fz = fl > 0.001 ? forward.z / fl : 0;
            chassisBody.applyImpulse(
                new this.RAPIER.Vector3(fx * dir * mass * vUp * 0.6, mass * vUp, fz * dir * mass * vUp * 0.6),
                true,
            );
            this.stuckTimer = 0;
        }

        this.updateInertia(delta);

        // Camera follow
        if (!c.isFirstPerson) {
            const lookTarget = c.cam.springTarget(vehicleGroup.position, delta).clone();
            c.camera.position.sub(c.controls.target);
            c.controls.target.copy(lookTarget);
            c.camera.position.add(lookTarget);
            c.controls.update();

            const baseDist = v.size.l * 0.8;
            const desiredDist = baseDist;

            c.cam.updateWithRaycast(c.controls.target, desiredDist);

            // Follow velocity: yaw camera to sit behind travel direction, keep height
            if ((c.input.fwd || c.input.bkd) && this.params.followVehicleDirection) {
                const vel = chassisBody.linvel();
                if (Math.hypot(vel.x, vel.z) > 0.3) {
                    // Target azimuth: camera behind velocity
                    const targetAngle = Math.atan2(-vel.x, -vel.z);
                    // Current camera azimuth and horizontal radius about look-at
                    const offX = c.camera.position.x - c.controls.target.x;
                    const offZ = c.camera.position.z - c.controls.target.z;
                    const radius = Math.hypot(offX, offZ);
                    const curAngle = Math.atan2(offX, offZ);
                    // Shortest-arc lerp
                    const diff = Math.atan2(Math.sin(targetAngle - curAngle), Math.cos(targetAngle - curAngle));
                    const newAngle = curAngle + diff * c.cam.vehicleTurnLerp;
                    // Rewrite XZ; keep horizontal radius and Y
                    c.camera.position.x = c.controls.target.x + Math.sin(newAngle) * radius;
                    c.camera.position.z = c.controls.target.z + Math.cos(newAngle) * radius;
                    c.controls.update();
                }
            }
        }

        // Auto-reset if flipped
        const vehicleUp = c.upVector.clone().applyQuaternion(vehicleGroup.quaternion);
        if (vehicleUp.angleTo(c.upVector) > Math.PI / 2) {
            const size = new THREE.Vector3();
            v.vehicleBBox?.getSize(size);
            const t = chassisBody.translation();
            chassisBody.setTranslation(new this.RAPIER.Vector3(t.x, t.y + size.y, t.z), true);
            chassisBody.setRotation(new this.RAPIER.Quaternion(0, 0, 0, 1), true);
            chassisBody.setLinvel(new this.RAPIER.Vector3(0, 0, 0), true);
            chassisBody.setAngvel(new this.RAPIER.Vector3(0, 0, 0), true);
        }
    }

    // Step physics world
    updateInertia(delta: number) {
        if (!this.world) return;
        this.world.timestep = delta;
        this.world.step();

        for (const v of this.list) {
            const { vehicleController, chassisBody, vehicleGroup, updateWheelVisuals } = v;
            vehicleController.updateVehicle(delta);
            if (chassisBody.isSleeping()) continue;

            // Clamp max speed
            const vel = chassisBody.linvel();
            const speed = new THREE.Vector3(vel.x, vel.y, vel.z).length();
            const max = this.params.power.maxSpeed * v.speedMultiplier;
            if (speed > max) {
                const s = max / speed;
                chassisBody.setLinvel(new this.RAPIER.Vector3(vel.x * s, vel.y * s, vel.z * s), true);
            }

            // Sync visual pose
            const t = chassisBody.translation();
            const r = chassisBody.rotation();
            vehicleGroup.position.set(t.x, t.y, t.z);
            vehicleGroup.quaternion.set(r.x, r.y, r.z, r.w);
            updateWheelVisuals?.();
        }
    }

    // After a delay, zero velocities once the vehicle has settled
    setTransition() {
        if (this.ctrl.isChangeControllerTransitionTimer) {
            clearTimeout(this.ctrl.isChangeControllerTransitionTimer);
            this.ctrl.isChangeControllerTransitionTimer = null;
        }
        this.ctrl.isChangeControllerTransitionTimer = setTimeout(() => {
            this.ctrl.isChangeControllerTransitionTimer = null;
            this.list.forEach(v => this.clearVelocity(v));
        }, 3000);
    }

    // Zero vehicle velocity
    private clearVelocity(v: VehicleInstance) {
        if (!v || !this.world || !this.RAPIER) return;
        const { chassisBody, vehicleController } = v;
        const ZERO = new this.RAPIER.Vector3(0, 0, 0);
        chassisBody.setLinvel(ZERO, true);
        chassisBody.setAngvel(ZERO, true);
        for (let i = 0; i < 4; i++) { vehicleController.setWheelEngineForce(i, 0); vehicleController.setWheelBrake(i, 1e6); }
        vehicleController.updateVehicle(1 / 60);
        this.world.timestep = 1 / 60;
        this.world.step();
        chassisBody.setLinvel(ZERO, true);
        chassisBody.setAngvel(ZERO, true);
        for (let i = 0; i < 4; i++) vehicleController.setWheelBrake(i, 0);
    }
}
