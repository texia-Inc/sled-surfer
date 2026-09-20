import * as THREE from 'three';
import { targetPose, stepPose, type CameraMode, type Pose, type PoseInput } from '../core/cameraPose';

export type { CameraMode };

export interface CameraTarget {
  x: number;
  y: number;
  z: number;
  rocketing: boolean;
  boosting: boolean;
  /** 0..1 shake intensity requested this frame; only ever raised for collisions (stun). */
  shake: number;
  /** Sled speed (m/s); drives the dynamic pull-back/pitch below. */
  speed: number;
  /** Track slope a short distance ahead (negative on descents); tilts the look target. */
  slopeAhead: number;
  /** True while the sled is inside/approaching a drop span. */
  inDrop: boolean;
  /** "full" (default) camera comfort behaviour vs. "mild" (no dynamic extras/pitch, fixed fov). */
  mode: CameraMode;
}

const SHAKE_DURATION = 0.18;
const SHAKE_AMPLITUDE = 0.35;

/** The eased pose from the previous frame (null until the first snap/update). Module-level like
 * the shake energy below, mirroring this file's pre-existing style (a single active camera). */
let pose: Pose | null = null;
let shakeEnergy = 0;

function toPoseInput(t: CameraTarget): PoseInput {
  return {
    x: t.x, y: t.y, z: t.z, speed: t.speed, slopeAhead: t.slopeAhead, inDrop: t.inDrop,
    boosting: t.boosting, rocketing: t.rocketing,
  };
}

function applyPose(camera: THREE.PerspectiveCamera, x: number, y: number, p: Pose): void {
  camera.position.set(x, y, p.pz);
  camera.lookAt(p.lx, p.ly, p.lz);
  camera.fov = p.fov;
  camera.updateProjectionMatrix();
}

/** Immediately places the camera at its target pose (no easing), e.g. on restart. */
export function snapCamera(camera: THREE.PerspectiveCamera, t: CameraTarget): void {
  shakeEnergy = 0;
  pose = targetPose(toPoseInput(t), t.mode);
  applyPose(camera, pose.px, pose.py, pose);
}

export function updateCamera(camera: THREE.PerspectiveCamera, t: CameraTarget, dt: number): void {
  const target = targetPose(toPoseInput(t), t.mode);
  pose = pose ? stepPose(pose, target, dt, t.mode) : target;

  if (t.shake > 0) shakeEnergy = Math.max(shakeEnergy, t.shake);
  shakeEnergy = Math.max(0, shakeEnergy - dt / SHAKE_DURATION);
  let x = pose.px;
  let y = pose.py;
  if (shakeEnergy > 0) {
    x += (Math.random() - 0.5) * shakeEnergy * SHAKE_AMPLITUDE;
    y += (Math.random() - 0.5) * shakeEnergy * SHAKE_AMPLITUDE;
  }
  applyPose(camera, x, y, pose);
}
