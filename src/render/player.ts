import * as THREE from 'three';

export interface PlayerPose {
  x: number;
  y: number;
  z: number;
  /** 接地中の地面の傾き (dh/dz) */
  pitchSlope: number;
  /** Curved-track world bend's centerline slope (dCenter/dz) at the sled's z (design doc §4):
   * yaws the sled to face the curve's tangent instead of always facing straight down +z. */
  centerSlope: number;
  airTime: number;
  grounded: boolean;
  steer: number;
  /** 発射前の引き量 0..1。走行中は 0 */
  pullBack: number;
  rocketing: boolean;
}

const PULL_BACK_DISTANCE = 3;
const FLIP_RATE = Math.PI * 2;
/** Seconds of air time before the flip starts, so the initial slingshot launch hop doesn't spin
 * the player (art §6). */
const FLIP_DELAY = 0.5;
const BANK = 0.35;

export class PlayerView {
  readonly group = new THREE.Group();
  private readonly flame: THREE.Mesh;

  constructor(private readonly scene: THREE.Scene) {
    // Red inner tube (art §6), lying flat under the penguin.
    const tube = new THREE.Mesh(
      new THREE.TorusGeometry(0.9, 0.32, 10, 20),
      new THREE.MeshLambertMaterial({ color: 0xe0452b, flatShading: true }),
    );
    tube.rotation.x = Math.PI / 2;
    tube.position.y = 0.32;

    const body = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 12, 10),
      new THREE.MeshLambertMaterial({ color: 0x1b1f2a, flatShading: true }),
    );
    body.scale.set(1, 1.15, 1);
    body.position.set(0, 0.75, 0);

    const belly = new THREE.Mesh(
      new THREE.SphereGeometry(0.34, 12, 10),
      new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }),
    );
    belly.position.set(0, 0.7, -0.18);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 12, 10),
      new THREE.MeshLambertMaterial({ color: 0x1b1f2a, flatShading: true }),
    );
    head.position.set(0, 1.25, 0);

    const eyeMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), eyeMaterial);
    eyeL.position.set(0.11, 1.32, -0.24);
    const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), eyeMaterial);
    eyeR.position.set(-0.11, 1.32, -0.24);

    const beak = new THREE.Mesh(
      new THREE.ConeGeometry(0.08, 0.28, 8),
      new THREE.MeshLambertMaterial({ color: 0xffa726, flatShading: true }),
    );
    beak.position.set(0, 1.24, -0.36);
    beak.rotation.x = -Math.PI / 2;

    const flipperMaterial = new THREE.MeshLambertMaterial({ color: 0x1b1f2a, flatShading: true });
    const flipperL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.25), flipperMaterial);
    flipperL.position.set(0.45, 0.8, 0);
    flipperL.rotation.z = 0.6;
    const flipperR = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.25), flipperMaterial);
    flipperR.position.set(-0.45, 0.8, 0);
    flipperR.rotation.z = -0.6;

    const footMaterial = new THREE.MeshLambertMaterial({ color: 0xffa726, flatShading: true });
    const footL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, 0.32), footMaterial);
    footL.position.set(0.15, 0.36, -0.5);
    const footR = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, 0.32), footMaterial);
    footR.position.set(-0.15, 0.36, -0.5);

    this.flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.25, 1.2, 8),
      new THREE.MeshBasicMaterial({ color: 0xff8a2b }),
    );
    this.flame.position.set(0, 0.2, 1.6);
    this.flame.rotation.x = Math.PI / 2;
    this.flame.visible = false;

    this.group.add(tube, body, belly, head, eyeL, eyeR, beak, flipperL, flipperR, footL, footR, this.flame);
    scene.add(this.group);
  }

  update(p: PlayerPose): void {
    this.group.position.set(p.x, p.y, -p.z + p.pullBack * PULL_BACK_DISTANCE);
    if (p.grounded) {
      this.group.rotation.x = Math.atan(p.pitchSlope);
    } else {
      this.group.rotation.x = Math.max(0, p.airTime - FLIP_DELAY) * FLIP_RATE;
    }
    this.group.rotation.z = -p.steer * BANK;
    this.group.rotation.y = -Math.atan(p.centerSlope);
    this.flame.visible = p.rocketing;
  }

  dispose(): void {
    this.scene.remove(this.group);
  }
}
