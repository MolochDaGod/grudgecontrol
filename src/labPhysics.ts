/**
 * Lab physics + control contract.
 *
 * Same stack as Open / Island3D / Casting play:
 * walk = Rapier kinematic CCT on one World; vehicles = DynamicRayCastVehicle
 * on that same World. three-mesh-bvh is pick / camera / moving-platform only
 * — not a second walk engine.
 */

export const LAB_PHYSICS = {
    /** Rapier integrator (CCT + vehicles) */
    fixedDt: 1 / 60,
    maxFrameDt: 0.05,
    maxSubsteps: 5,
    /** World gravity for dynamic vehicles. Walk gravity is in CCT desired Y. */
    gravityY: -9.81,
    /** Fleet play walk: Rapier KinematicCharacterController */
    walkAuthority: "rapier-cct" as const,
    vehicleAuthority: "rapier-dynamic-raycast-vehicle" as const,
    pickAuthority: "three-mesh-bvh" as const,
    rapierPackage: "@dimforge/rapier3d-compat" as const,
    rapierVersion: "^0.19.3" as const,
    /**
     * Rapier interaction groups: high 16 = membership, low 16 = filter.
     * Static trimesh = bit 0. Chassis = bit 1. Walk CCT = bit 2.
     * Wheel rays hit static only.
     */
    groups: {
        static: (0b0001 << 16) | 0xffff,
        chassis: (0b0010 << 16) | 0b0101,
        walk: (0b0100 << 16) | 0b0011,
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
