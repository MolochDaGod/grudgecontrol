import type { World } from "@dimforge/rapier3d-compat";
import * as THREE from "three";

export type WheelInfo = {
    axleCs: THREE.Vector3;
    suspensionRestLength: number;
    position: THREE.Vector3;
    radius: number;
};

export function createVehicleController(world: World, chassisBody: any, wheels: (THREE.Object3D | null)[], wheelsInfo: WheelInfo[]) {
    if (!world || !chassisBody) return { vehicle: null, updateWheelVisuals: () => {} };

    const vehicle = world.createVehicleController(chassisBody);
    const suspensionDirection = new THREE.Vector3(0, -1, 0);
    wheelsInfo.forEach((wheel, index) => {
        vehicle.addWheel(wheel.position, suspensionDirection, wheel.axleCs, wheel.suspensionRestLength, wheel.radius);
        // 轮子相对车身的连接点
        vehicle.setWheelChassisConnectionPointCs(index, wheel.position);
        // 悬挂方向
        vehicle.setWheelDirectionCs(index, suspensionDirection);
        // 轮轴方向
        vehicle.setWheelAxleCs(index, wheel.axleCs);
        // 悬挂静止长度
        vehicle.setWheelSuspensionRestLength(index, wheel.suspensionRestLength);
        // 轮胎半径
        vehicle.setWheelRadius(index, wheel.radius);
        // 悬挂最大行程
        vehicle.setWheelMaxSuspensionTravel(index, wheel.suspensionRestLength * 1);
        // 悬挂刚度
        vehicle.setWheelSuspensionStiffness(index, 250);
        // 悬挂压缩阻尼
        vehicle.setWheelSuspensionCompression(index, 6);
        // 悬挂回弹阻尼
        vehicle.setWheelSuspensionRelaxation(index, 6);
        // 悬挂最大作用力
        vehicle.setWheelMaxSuspensionForce(index, 10000);
        // 制动
        vehicle.setWheelBrake(index, 0);
        // 转向角
        vehicle.setWheelSteering(index, 0);
        // 发动机驱动力
        vehicle.setWheelEngineForce(index, 0);
        // 纵向抓地参数
        vehicle.setWheelFrictionSlip(index, 20);
        // 侧向摩擦刚度倍率
        vehicle.setWheelSideFrictionStiffness(index, 2);
    });

    const up = new THREE.Vector3(0, 1, 0);
    const _wheelSteeringQuat = new THREE.Quaternion();
    const _wheelRotationQuat = new THREE.Quaternion();

    function updateWheelVisuals() {
        for (const [index, wheelObj] of wheels.entries()) {
            if (!wheelObj) continue;
            try {
                const wheelAxleCs = vehicle.wheelAxleCs(index) ?? new THREE.Vector3(1, 0, 0);
                const connection = vehicle.wheelChassisConnectionPointCs(index)?.y ?? 0;
                const suspension = vehicle.wheelSuspensionLength(index) ?? 0;
                const steering = vehicle.wheelSteering(index) ?? 0;
                const rotationRad = vehicle.wheelRotation(index) ?? 0;

                wheelObj.position.y = connection - suspension;

                _wheelSteeringQuat.setFromAxisAngle(up, steering);
                _wheelRotationQuat.setFromAxisAngle(wheelAxleCs, rotationRad);

                wheelObj.quaternion.copy(_wheelSteeringQuat).multiply(_wheelRotationQuat);
            } catch (e) {}
        }
    }

    function destroy() {
        try {
            world.removeVehicleController(vehicle);
        } catch {}
    }

    return {
        vehicle: vehicle,
        updateWheelVisuals,
        destroy,
    };
}
