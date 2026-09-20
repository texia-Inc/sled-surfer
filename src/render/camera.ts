import * as THREE from 'three';

export interface CameraTarget {
  x: number;
  y: number;
  z: number;
  rocketing: boolean;
  boosting: boolean;
  /** 0..1 shake intensity requested this frame */
  shake: number;
  /** Sled speed (m/s); drives the dynamic pull-back/pitch below. */
  speed: number;
  /** Track slope a short distance ahead (negative on descents); tilts the look target. */
  slopeAhead: number;
  /** True while the sled is inside/approaching a drop span. */
  inDrop: boolean;
}

const BACK = 7;
const BACK_EXTRA = 7;
const UP = 3.5;
const UP_EXTRA = 5.5;
const UP_BOOST = 2.6;
const DROP_EXTRA = 3;
/** Speed (m/s) at which the dynamic pull-back starts (k=0) and finishes (k=1). */
const SPEED_PULLBACK_MIN = 15;
const SPEED_PULLBACK_RANGE = 25;
/** Below this k, a boosting sled keeps the old, lower UP_BOOST framing instead of the
 * speed-based pull-back (a slow-speed boost - e.g. just off a pad - still reads as "low and fast"). */
const BOOST_LOW_K = 0.3;
const LOOK_AHEAD = 6;
const X_FOLLOW = 0.4;
const FOV_NORMAL = 60;
const FOV_ROCKET = 70;
const FOV_BOOST = 74;
const SHAKE_DURATION = 0.18;
const SHAKE_AMPLITUDE = 0.35;

const desired = new THREE.Vector3();
const look = new THREE.Vector3();
let shakeEnergy = 0;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** 0..1: how far into the dynamic pull-back range `speed` sits. */
function pullBackK(speed: number): number {
  return clamp01((speed - SPEED_PULLBACK_MIN) / SPEED_PULLBACK_RANGE);
}

function cameraUp(t: CameraTarget, k: number): number {
  if (t.boosting && k < BOOST_LOW_K) return UP_BOOST;
  return UP + UP_EXTRA * k + (t.inDrop ? DROP_EXTRA : 0);
}

function lookTargetY(t: CameraTarget): number {
  return t.y + 1 + t.slopeAhead * LOOK_AHEAD;
}

export function snapCamera(camera: THREE.PerspectiveCamera, t: CameraTarget): void {
  shakeEnergy = 0;
  const k = 0;
  camera.position.set(t.x * X_FOLLOW, t.y + cameraUp(t, k), -t.z + BACK + BACK_EXTRA * k);
  look.set(t.x * X_FOLLOW, lookTargetY(t), -t.z - LOOK_AHEAD);
  camera.lookAt(look);
}

export function updateCamera(camera: THREE.PerspectiveCamera, t: CameraTarget, dt: number): void {
  const k = pullBackK(t.speed);
  const up = cameraUp(t, k);
  const back = BACK + BACK_EXTRA * k;
  desired.set(t.x * X_FOLLOW, t.y + up, -t.z + back);
  const kSmooth = 1 - Math.pow(0.002, dt);
  camera.position.x += (desired.x - camera.position.x) * kSmooth;
  camera.position.y += (desired.y - camera.position.y) * kSmooth;
  camera.position.z = desired.z;

  if (t.shake > 0) shakeEnergy = Math.max(shakeEnergy, t.shake);
  shakeEnergy = Math.max(0, shakeEnergy - dt / SHAKE_DURATION);
  if (shakeEnergy > 0) {
    camera.position.x += (Math.random() - 0.5) * shakeEnergy * SHAKE_AMPLITUDE;
    camera.position.y += (Math.random() - 0.5) * shakeEnergy * SHAKE_AMPLITUDE;
  }

  look.set(t.x * X_FOLLOW, lookTargetY(t), -t.z - LOOK_AHEAD);
  camera.lookAt(look);
  const fov = t.boosting ? FOV_BOOST : t.rocketing ? FOV_ROCKET : FOV_NORMAL;
  camera.fov += (fov - camera.fov) * Math.min(1, dt * 5);
  camera.updateProjectionMatrix();
}
