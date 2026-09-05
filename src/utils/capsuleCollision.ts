import * as THREE from "three";

// Scratch objects for capsule collision
export interface CollisionTemps {
    invMat: THREE.Matrix4;    // inverse of collider world matrix
    localSeg: THREE.Line3;    // capsule segment in collider local space
    localBox: THREE.Box3;     // AABB of the capsule segment in collider local space
    closestSeg: THREE.Vector3; // closest point on the capsule segment
    closestTri: THREE.Vector3; // closest point on the triangle
}

// Allocate one set of scratch objects
export function createCollisionTemps(): CollisionTemps {
    return {
        invMat: new THREE.Matrix4(),
        localSeg: new THREE.Line3(),
        localBox: new THREE.Box3(),
        closestSeg: new THREE.Vector3(),
        closestTri: new THREE.Vector3(),
    };
}

/**
 * BVH capsule-vs-mesh collision. Mutates capsule.position.
 * @param capsule       Object3D that owns the capsule (position is written)
 * @param capsuleInfo   capsule in local space: segment + radius
 * @param collider      target collision mesh
 * @param temps         preallocated scratch
 * @param skipTri       optional: return true to skip this triangle
 */
export function applyCapsuleCollision(
    capsule: THREE.Object3D,
    capsuleInfo: { segment: THREE.Line3; radius: number },
    collider: THREE.Mesh,
    temps: CollisionTemps,
    skipTri?: (tri: any, dir: THREE.Vector3) => boolean,
): void {
    // Transform capsule segment into collider local space
    temps.invMat.copy(collider.matrixWorld).invert();
    temps.localSeg.start.copy(capsuleInfo.segment.start).applyMatrix4(capsule.matrixWorld).applyMatrix4(temps.invMat);
    temps.localSeg.end.copy(capsuleInfo.segment.end).applyMatrix4(capsule.matrixWorld).applyMatrix4(temps.invMat);

    // Local AABB
    temps.localBox.makeEmpty();
    temps.localBox.expandByPoint(temps.localSeg.start).expandByPoint(temps.localSeg.end);
    temps.localBox.expandByScalar(capsuleInfo.radius);

    // Collision query
    (collider.geometry as any)?.boundsTree?.shapecast({
        intersectsBounds: (box: THREE.Box3) => box.intersectsBox(temps.localBox),
        intersectsTriangle: (tri: any) => {
            // Broad filter
            const distance = tri.closestPointToSegment(temps.localSeg, temps.closestSeg, temps.closestTri);
            if (distance >= capsuleInfo.radius) return;

            // Narrow filter
            const dir = temps.closestTri.clone().sub(temps.closestSeg).normalize();
            if (skipTri?.(tri, dir)) return;

            // Push the capsule segment out
            temps.localSeg.start.addScaledVector(dir, capsuleInfo.radius - distance);
            temps.localSeg.end.addScaledVector(dir, capsuleInfo.radius - distance);
        },
    });

    // Apply correction
    const newPos = temps.closestSeg.copy(temps.localSeg.start).applyMatrix4(collider.matrixWorld);
    const delta = temps.closestTri.subVectors(newPos, capsule.position);
    const offset = Math.max(0, delta.length() - 1e-5);
    capsule.position.add(delta.normalize().multiplyScalar(offset));
}
