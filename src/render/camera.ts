import * as THREE from 'three';

export interface CameraTarget {
  x: number;
  y: number;
  z: number;
  rocketing: boolean;
  boosting: boolean;
  /** 0..1 shake intensity requested this frame */
  shake: number;
}

const BACK = 7;
const UP = 3.5;
const UP_BOOST = 2.6;
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

export function snapCamera(camera: THREE.PerspectiveCamera, t: CameraTarget): void {
  shakeEnergy = 0;
  camera.position.set(t.x * X_FOLLOW, t.y + UP, -t.z + BACK);
  look.set(t.x * X_FOLLOW, t.y + 1, -t.z - LOOK_AHEAD);
  camera.lookAt(look);
}

export function updateCamera(camera: THREE.PerspectiveCamera, t: CameraTarget, dt: number): void {
  const up = t.boosting ? UP_BOOST : UP;
  desired.set(t.x * X_FOLLOW, t.y + up, -t.z + BACK);
  const k = 1 - Math.pow(0.002, dt);
  camera.position.x += (desired.x - camera.position.x) * k;
  camera.position.y += (desired.y - camera.position.y) * k;
  camera.position.z = desired.z;

  if (t.shake > 0) shakeEnergy = Math.max(shakeEnergy, t.shake);
  shakeEnergy = Math.max(0, shakeEnergy - dt / SHAKE_DURATION);
  if (shakeEnergy > 0) {
    camera.position.x += (Math.random() - 0.5) * shakeEnergy * SHAKE_AMPLITUDE;
    camera.position.y += (Math.random() - 0.5) * shakeEnergy * SHAKE_AMPLITUDE;
  }

  look.set(t.x * X_FOLLOW, t.y + 1, -t.z - LOOK_AHEAD);
  camera.lookAt(look);
  const fov = t.boosting ? FOV_BOOST : t.rocketing ? FOV_ROCKET : FOV_NORMAL;
  camera.fov += (fov - camera.fov) * Math.min(1, dt * 5);
  camera.updateProjectionMatrix();
}
