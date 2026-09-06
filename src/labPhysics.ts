/**
 * Lab physics + control contract.
 *
 * Walk/fly body: three-mesh-bvh capsule (not Rapier CCT). Large merged
 * scene meshes stay on BVH — one authority per body.
 * Vehicles: Rapier World + DynamicRayCastVehicleController, lazy-loaded.
 * Do not put Rapier CCT on the walking capsule.
 */

export const LAB_PHYSICS = {
    /** Rapier / vehicle integrator */
    fixedDt: 1 / 60,
    maxFrameDt: 0.05,
    maxSubsteps: 5,
    /** SI gravity for the Rapier vehicle world only */
    gravityY: -9.81,
    /** Walk/fly capsule is BVH; vehicles are Rapier */
    walkAuthority: "bvh-capsule" as const,
    vehicleAuthority: "rapier-dynamic-raycast-vehicle" as const,
    rapierPackage: "@dimforge/rapier3d-compat" as const,
    rapierVersion: "^0.19.3" as const,
    /**
     * Rapier interaction groups: high 16 = membership, low 16 = filter.
     * Static trimesh = bit 0. Chassis cuboid = bit 1, collides with static only.
     * Wheel rays use filter 0x0001 so they ignore the chassis.
     */
    groups: {
        static: (0b0001 << 16) | 0xffff,
        chassis: (0b0010 << 16) | 0b0001,
        wheelRayFilter: 0x0001,
    },
    /** +1 = A / left stick left turns the nose left under a chase camera */
    vehicleSteerSign: 1,
    gamepadDeadzone: 0.18,
} as const;

export type LabPhysicsContract = typeof LAB_PHYSICS;

/** Fixed-step accumulator for the Rapier vehicle world. */
export function consumeFixedSteps(
    accumulator: number,
    frameDt: number,
    onStep: (dt: number) => void,
    opts: { fixedDt?: number; maxSubsteps?: number; maxFrameDt?: number } = {},
): number {
    const fixedDt = opts.fixedDt ?? LAB_PHYSICS.fixedDt;
    const maxSubsteps = opts.maxSubsteps ?? LAB_PHYSICS.maxSubsteps;
    const maxFrameDt = opts.maxFrameDt ?? LAB_PHYSICS.maxFrameDt;
    let acc = accumulator + Math.min(frameDt, maxFrameDt);
    let steps = 0;
    while (acc >= fixedDt && steps < maxSubsteps) {
        onStep(fixedDt);
        acc -= fixedDt;
        steps++;
    }
    if (steps === maxSubsteps) acc = 0;
    return acc;
}

export type InputSnapshot = {
    axisX: number;
    axisY: number;
    jump: boolean;
    sprint: boolean;
    mode: 0 | 1;
    yaw: number;
    speed: number;
};

export function applyDeadzone(v: number, zone = LAB_PHYSICS.gamepadDeadzone): number {
    const a = Math.abs(v);
    if (a < zone) return 0;
    return Math.sign(v) * ((a - zone) / (1 - zone));
}
