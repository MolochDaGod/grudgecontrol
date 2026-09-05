import { Euler, Quaternion, Vector3 } from "three";

// Reused temps (avoid per-frame GC)
const _aimQ = new Quaternion();
const _yawQ = new Quaternion();
const _localPitchQ = new Quaternion();
const _parentWorldQ = new Quaternion();
const _cameraWorldQ = new Quaternion();
const _aimAxis = new Vector3(1, 0, 0);
const _yawAxis = new Vector3(0, 1, 0);

const _headWorldQ = new Quaternion();
const _headParentWorldQ = new Quaternion();
const _headEuler = new Euler();

// Spine-bone IK
export class SpineIK {
    constructor(spineBones, headBone) {
        // ==================== Bone refs ====================
        this.spineBones = spineBones; // Spine bones, bottom to top
        this.headBone = headBone; // Head bone

        // Clean animation pose saved before each IK apply; restore it next frame first
        this.baseQuats = spineBones.map(() => new Quaternion());
    }

    // ==================== Bone save / restore ====================

    // Restore spine bones to the clean animation pose saved last frame
    // Call before player.update() (animation drive) so leftover IK does not pollute blending
    restoreBones() {
        for (let i = 0; i < this.spineBones.length; i++) {
            this.spineBones[i].quaternion.copy(this.baseQuats[i]);
        }
    }

    // Clear head-bone roll so the first-person camera does not tilt with the clip
    clearHeadRoll() {
        const head = this.headBone;
        if (!head) return;
        head.updateWorldMatrix(true, false);
        head.getWorldQuaternion(_headWorldQ);
        _headEuler.setFromQuaternion(_headWorldQ, "YXZ");
        _headEuler.z = 0;
        _headWorldQ.setFromEuler(_headEuler);
        head.parent.getWorldQuaternion(_headParentWorldQ);
        head.quaternion.copy(_headParentWorldQ).invert().multiply(_headWorldQ);
        head.updateWorldMatrix(false, false);
    }

    // ==================== IK apply ====================

    // First-person spine pitch IK
    // Split pitchTarget across each spine bone so the gun arm follows mouse aim up/down
    applyAim1P(camera, pitchTarget) {
        if (!this.spineBones.length) return;
        this.clearHeadRoll();

        camera.getWorldQuaternion(_cameraWorldQ);
        _aimAxis.set(1, 0, 0).applyQuaternion(_cameraWorldQ);
        _aimQ.setFromAxisAngle(_aimAxis, pitchTarget / this.spineBones.length);

        this.spineBones[0].parent.updateWorldMatrix(true, false);
        for (let i = 0; i < this.spineBones.length; i++) {
            this.baseQuats[i].copy(this.spineBones[i].quaternion); // Save clean pose
            // Convert into parent local space, then compose
            this.spineBones[i].parent.getWorldQuaternion(_parentWorldQ);
            _localPitchQ.copy(_parentWorldQ).invert().multiply(_aimQ).multiply(_parentWorldQ);
            this.spineBones[i].quaternion.premultiply(_localPitchQ);
            this.spineBones[i].updateWorldMatrix(false, false);
        }
        // Propagate to the head bone so the camera attach point follows
        this.spineBones[this.spineBones.length - 1].updateWorldMatrix(false, true);
    }

    // Third-person spine pitch + yaw IK, with a visual offset on camera.rotation.x
    applyAim3P(camera, isGunEngaged) {
        if (!this.spineBones.length) return;

        // Normalized pitch (-1 ~ +1) for quadratic compensation
        const normalizedPitch = camera.rotation.x / (Math.PI * (50 / 180));
        const pitchSq = Math.pow(Math.abs(normalizedPitch), 2.0);

        const pitchTarget = isGunEngaged ? camera.rotation.x : 0;
        // Camera compensation: extra raise when looking down, extra dip when looking up
        camera.rotation.x += normalizedPitch > 0 ? pitchSq * 0.35 : -pitchSq * 0.1;

        // Body yaw compensation: rotate toward screen center
        const yawTarget = isGunEngaged ? -Math.PI * ((10 * (1 + pitchSq * 0.35)) / 180) : 0;

        _aimAxis.set(1, 0, 0).applyQuaternion(camera.quaternion);
        _aimQ.setFromAxisAngle(_aimAxis, pitchTarget / this.spineBones.length);
        _yawQ.setFromAxisAngle(_yawAxis, yawTarget);
        _aimQ.premultiply(_yawQ);

        this.spineBones[0].parent.updateWorldMatrix(true, false);
        for (let i = 0; i < this.spineBones.length; i++) {
            this.baseQuats[i].copy(this.spineBones[i].quaternion);
            this.spineBones[i].parent.getWorldQuaternion(_parentWorldQ);
            _localPitchQ.copy(_parentWorldQ).invert().multiply(_aimQ).multiply(_parentWorldQ);
            this.spineBones[i].quaternion.premultiply(_localPitchQ);
            this.spineBones[i].updateWorldMatrix(false, false);
        }
    }
}
