import * as THREE from 'three';

export interface PlayerPose {
  x: number;
  y: number;
  z: number;
  /** 接地中の地面の傾き (dh/dz) */
  pitchSlope: number;
  airTime: number;
  grounded: boolean;
  steer: number;
  /** 発射前の引き量 0..1。走行中は 0 */
  pullBack: number;
  rocketing: boolean;
}

const PULL_BACK_DISTANCE = 3;
const FLIP_RATE = Math.PI * 2;
const BANK = 0.35;

export class PlayerView {
  readonly group = new THREE.Group();
  private readonly flame: THREE.Mesh;

  constructor(private readonly scene: THREE.Scene) {
    const sled = new THREE.Mesh(
      new THREE.BoxGeometry(1.3, 0.2, 2.0),
      new THREE.MeshLambertMaterial({ color: 0xe0452b, flatShading: true }),
    );
    sled.position.y = 0.1;

    const body = new THREE.Mesh(
      new THREE.SphereGeometry(0.45, 12, 10),
      new THREE.MeshLambertMaterial({ color: 0x1b1f2a, flatShading: true }),
    );
    body.position.set(0, 0.65, 0.1);

    const belly = new THREE.Mesh(
      new THREE.SphereGeometry(0.36, 12, 10),
      new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }),
    );
    belly.position.set(0, 0.6, -0.15);

    const beak = new THREE.Mesh(
      new THREE.ConeGeometry(0.1, 0.3, 8),
      new THREE.MeshLambertMaterial({ color: 0xffa726, flatShading: true }),
    );
    beak.position.set(0, 0.82, -0.5);
    beak.rotation.x = -Math.PI / 2;

    this.flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.25, 1.2, 8),
      new THREE.MeshBasicMaterial({ color: 0xff8a2b }),
    );
    this.flame.position.set(0, 0.2, 1.6);
    this.flame.rotation.x = Math.PI / 2;
    this.flame.visible = false;

    this.group.add(sled, body, belly, beak, this.flame);
    scene.add(this.group);
  }

  update(p: PlayerPose): void {
    this.group.position.set(p.x, p.y, -p.z + p.pullBack * PULL_BACK_DISTANCE);
    if (p.grounded) {
      this.group.rotation.x = Math.atan(p.pitchSlope);
    } else {
      this.group.rotation.x = p.airTime * FLIP_RATE;
    }
    this.group.rotation.z = -p.steer * BANK;
    this.flame.visible = p.rocketing;
  }

  dispose(): void {
    this.scene.remove(this.group);
  }
}
