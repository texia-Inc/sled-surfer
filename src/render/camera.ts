import * as THREE from 'three';

export interface CameraTarget {
  x: number;
  y: number;
  z: number;
  rocketing: boolean;
}

const BACK = 7;
const UP = 3.5;
const LOOK_AHEAD = 6;
const X_FOLLOW = 0.4;
const FOV_NORMAL = 60;
const FOV_ROCKET = 70;

const desired = new THREE.Vector3();
const look = new THREE.Vector3();

export function snapCamera(camera: THREE.PerspectiveCamera, t: CameraTarget): void {
  camera.position.set(t.x * X_FOLLOW, t.y + UP, -t.z + BACK);
  look.set(t.x * X_FOLLOW, t.y + 1, -t.z - LOOK_AHEAD);
  camera.lookAt(look);
}

export function updateCamera(camera: THREE.PerspectiveCamera, t: CameraTarget, dt: number): void {
  desired.set(t.x * X_FOLLOW, t.y + UP, -t.z + BACK);
  const k = 1 - Math.pow(0.002, dt);
  camera.position.x += (desired.x - camera.position.x) * k;
  camera.position.y += (desired.y - camera.position.y) * k;
  camera.position.z = desired.z;
  look.set(t.x * X_FOLLOW, t.y + 1, -t.z - LOOK_AHEAD);
  camera.lookAt(look);
  const fov = t.rocketing ? FOV_ROCKET : FOV_NORMAL;
  camera.fov += (fov - camera.fov) * Math.min(1, dt * 5);
  camera.updateProjectionMatrix();
}
