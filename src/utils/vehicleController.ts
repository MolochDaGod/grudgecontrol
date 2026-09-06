import type { World, RigidBody, Collider } from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import { LAB_PHYSICS } from "../labPhysics";

export type WheelInfo = {
    axleCs: THREE.Vector3;
    suspensionRestLength: number;
    position: THREE.Vector3;
    radius: number;
};

const _up = new THREE.Vector3(0, 1, 0);
const _steerQuat = new THREE.Quaternion();
const _rotQuat = new THREE.Quaternion();
const _suspensionDir = new THREE.Vector3(0, -1, 0);
const _axleFallback = new THREE.Vector3(1, 0, 0);

/** Rapier DynamicRayCastVehicleController + wheel visual sync. */
export function createVehicleController(
    world: World,
    chassisBody: RigidBody,
    wheels: (THREE.Object3D | null)[],
    wheelsInfo: WheelInfo[],
) {
    if (!world || !chassisBody) return { vehicle: null, updateWheelVisuals: () => {}, destroy: () => {}, stepVehicle: () => {} };

    const vehicle = world.createVehicleController(chassisBody);

    wheelsInfo.forEach((wheel, index) => {
        vehicle.addWheel(wheel.position, _suspensionDir, wheel.axleCs, wheel.suspensionRestLength, wheel.radius);
        vehicle.setWheelChassisConnectionPointCs(index, wheel.position);
        vehicle.setWheelDirectionCs(index, _suspensionDir);
        vehicle.setWheelAxleCs(index, wheel.axleCs);
        vehicle.setWheelSuspensionRestLength(index, wheel.suspensionRestLength);
        vehicle.setWheelRadius(index, wheel.radius);
        vehicle.setWheelMaxSuspensionTravel(index, wheel.suspensionRestLength);
        vehicle.setWheelSuspensionStiffness(index, 250);
        vehicle.setWheelSuspensionCompression(index, 6);
        vehicle.setWheelSuspensionRelaxation(index, 6);
        vehicle.setWheelMaxSuspensionForce(index, 10000);
        vehicle.setWheelBrake(index, 0);
        vehicle.setWheelSteering(index, 0);
        vehicle.setWheelEngineForce(index, 0);
        vehicle.setWheelFrictionSlip(index, 20);
        vehicle.setWheelSideFrictionStiffness(index, 2);
    });

    function wheelRayPredicate(collider: Collider) {
        const parent = collider.parent();
        return !parent || parent.handle !== chassisBody.handle;
    }

    function stepVehicle(dt: number) {
        vehicle.updateVehicle(dt, undefined, LAB_PHYSICS.groups.wheelRayFilter, wheelRayPredicate);
    }

    function updateWheelVisuals() {
        for (const [index, wheelObj] of wheels.entries()) {
            if (!wheelObj) continue;
            const wheelAxleCs = vehicle.wheelAxleCs(index) ?? _axleFallback;
            const connection = vehicle.wheelChassisConnectionPointCs(index)?.y ?? 0;
            const suspension = vehicle.wheelSuspensionLength(index) ?? 0;
            const steering = vehicle.wheelSteering(index) ?? 0;
            const rotationRad = vehicle.wheelRotation(index) ?? 0;
            wheelObj.position.y = connection - suspension;
            _steerQuat.setFromAxisAngle(_up, steering);
            _rotQuat.setFromAxisAngle(wheelAxleCs as THREE.Vector3, rotationRad);
            wheelObj.quaternion.copy(_steerQuat).multiply(_rotQuat);
        }
    }

    function destroy() {
        try { world.removeVehicleController(vehicle); } catch { /* already freed */ }
    }

    return { vehicle, updateWheelVisuals, destroy, stepVehicle };
}
