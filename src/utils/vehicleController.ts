import type { World } from "@dimforge/rapier3d-compat";
import * as THREE from "three";

export type WheelInfo = {
    axleCs: THREE.Vector3;
    suspensionRestLength: number;
    position: THREE.Vector3;
    radius: number;
};

// Create a Rapier vehicle controller
export function createVehicleController(
    world: World,
    chassisBody: any,
    wheels: (THREE.Object3D | null)[],
    wheelsInfo: WheelInfo[],
) {
    if (!world || !chassisBody) return { vehicle: null, updateWheelVisuals: () => {} };

    const vehicle = world.createVehicleController(chassisBody);
    const suspensionDirection = new THREE.Vector3(0, -1, 0);

    // Register per-wheel physics
    wheelsInfo.forEach((wheel, index) => {
        vehicle.addWheel(wheel.position, suspensionDirection, wheel.axleCs, wheel.suspensionRestLength, wheel.radius);
        vehicle.setWheelChassisConnectionPointCs(index, wheel.position); // connection point
        vehicle.setWheelDirectionCs(index, suspensionDirection); // suspension direction
        vehicle.setWheelAxleCs(index, wheel.axleCs); // axle
        vehicle.setWheelSuspensionRestLength(index, wheel.suspensionRestLength); // rest length
        vehicle.setWheelRadius(index, wheel.radius); // tire radius
        vehicle.setWheelMaxSuspensionTravel(index, wheel.suspensionRestLength); // max travel
        vehicle.setWheelSuspensionStiffness(index, 250); // stiffness
        vehicle.setWheelSuspensionCompression(index, 6); // compression damping
        vehicle.setWheelSuspensionRelaxation(index, 6); // rebound damping
        vehicle.setWheelMaxSuspensionForce(index, 10000); // max force
        vehicle.setWheelBrake(index, 0); // brake
        vehicle.setWheelSteering(index, 0); // steer angle
        vehicle.setWheelEngineForce(index, 0); // engine force
        vehicle.setWheelFrictionSlip(index, 20); // longitudinal grip
        vehicle.setWheelSideFrictionStiffness(index, 2); // lateral friction
    });

    const up = new THREE.Vector3(0, 1, 0);
    const wheelSteeringQuat = new THREE.Quaternion();
    const wheelRotationQuat = new THREE.Quaternion();

    // Sync wheel visual rotation
    function updateWheelVisuals() {
        for (const [index, wheelObj] of wheels.entries()) {
            if (!wheelObj) continue;
            try {
                const wheelAxleCs = vehicle.wheelAxleCs(index) ?? new THREE.Vector3(1, 0, 0);
                const connection = vehicle.wheelChassisConnectionPointCs(index)?.y ?? 0;
                const suspension = vehicle.wheelSuspensionLength(index) ?? 0;
                const steering = vehicle.wheelSteering(index) ?? 0;
                const rotationRad = vehicle.wheelRotation(index) ?? 0;

                // Suspension compression offset
                wheelObj.position.y = connection - suspension;
                // Steer * spin
                wheelSteeringQuat.setFromAxisAngle(up, steering);
                wheelRotationQuat.setFromAxisAngle(wheelAxleCs, rotationRad);
                wheelObj.quaternion.copy(wheelSteeringQuat).multiply(wheelRotationQuat);
            } catch (e) {}
        }
    }

    // Destroy vehicle controller
    function destroy() {
        try { world.removeVehicleController(vehicle); } catch { }
    }

    return { vehicle, updateWheelVisuals, destroy };
}
