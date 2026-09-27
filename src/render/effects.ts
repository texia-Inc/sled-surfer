import * as THREE from 'three';

export interface EffectsInput {
  x: number; y: number; z: number;
  speed: number;
  grounded: boolean;
  boosting: boolean;
  boostHits: number;
  landingCount: number;
  hitCount: number;
  /** Cumulative count of broken obstacles this run; a burst fires when it increases. */
  breakCount: number;
  /** Cumulative count of route-hazard wipeouts this run; a dark-red burst fires when it
   * increases (terrain routes §2/§4). */
  wipeoutCount: number;
  dt: number;
}

const DEAD_Y = -1000;
const GRAVITY = 9.81;

const SPRAY_CAPACITY = 300;
const SPRAY_MIN_SPEED = 8;
const SPRAY_MAX_PER_FRAME = 12;
const SPRAY_SPAWN_RATE = 0.4;
const SPRAY_LIFE = 0.5;
const SPRAY_SIZE = 0.25;

const BURST_CAPACITY = 60;
const BURST_COUNT = 40;
const BURST_LIFE = 0.6;
const BURST_SIZE = 0.25;

const LANDING_COUNT = 25;
const LANDING_LIFE = 0.6;

/** Shatter burst on a breakable obstacle: warm brown/yellow, wider spread than the boost burst. */
const BREAK_BURST_CAPACITY = 60;
const BREAK_BURST_COUNT = 30;
const BREAK_BURST_LIFE = 0.7;
const BREAK_BURST_SPEED = 3;
const BREAK_BURST_COLOR = 0xd9a05b;

/** Wipeout burst (terrain routes §4): dark-red particles, same spread pattern as the boost
 * burst, fired when RunState.wipeoutCount increases. */
const WIPEOUT_BURST_CAPACITY = 40;
const WIPEOUT_BURST_COUNT = 40;
const WIPEOUT_BURST_LIFE = 0.6;
const WIPEOUT_BURST_COLOR = 0x8a1414;

const LINE_COUNT = 24;
const LINE_RADIUS_MIN = 3.5;
const LINE_RADIUS_MAX = 5;
const LINE_AHEAD = 9;
const LINE_LENGTH = 6;
const LINE_SCROLL_SPEED = 40;
const LINE_RAMP_START = 18;
const LINE_RAMP_RANGE = 20;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Fixed-capacity, ring-buffer particle pool backed by one THREE.Points object. */
class ParticlePool {
  readonly points: THREE.Points;
  private readonly positions: Float32Array;
  private readonly velocities: Float32Array;
  private readonly life: Float32Array;
  private cursor = 0;

  constructor(private readonly capacity: number, color: number, size: number) {
    this.positions = new Float32Array(capacity * 3);
    this.velocities = new Float32Array(capacity * 3);
    this.life = new Float32Array(capacity);
    for (let i = 0; i < capacity; i++) this.positions[i * 3 + 1] = DEAD_Y;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    const mat = new THREE.PointsMaterial({
      size, color, transparent: true, opacity: 0.9, depthWrite: false,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
  }

  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number): void {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    this.positions[i * 3] = x;
    this.positions[i * 3 + 1] = y;
    this.positions[i * 3 + 2] = z;
    this.velocities[i * 3] = vx;
    this.velocities[i * 3 + 1] = vy;
    this.velocities[i * 3 + 2] = vz;
    this.life[i] = life;
  }

  step(dt: number): void {
    for (let i = 0; i < this.capacity; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.positions[i * 3 + 1] = DEAD_Y;
        continue;
      }
      this.velocities[i * 3 + 1] -= GRAVITY * dt;
      this.positions[i * 3] += this.velocities[i * 3] * dt;
      this.positions[i * 3 + 1] += this.velocities[i * 3 + 1] * dt;
      this.positions[i * 3 + 2] += this.velocities[i * 3 + 2] * dt;
    }
    (this.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose(): void {
    this.points.parent?.remove(this.points);
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}

/** 24 elongated planes parented to the camera, radiating a sense of speed. */
class SpeedLines {
  readonly group = new THREE.Group();
  private readonly meshes: THREE.Mesh[] = [];
  private readonly geo = new THREE.PlaneGeometry(0.05, LINE_LENGTH);

  constructor(camera: THREE.Camera) {
    for (let k = 0; k < LINE_COUNT; k++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 });
      // Parented to the camera and screen-fixed (radiating from centre); the world bend must not
      // touch these (curved-track design doc §2).
      mat.userData.noBend = true;
      const mesh = new THREE.Mesh(this.geo, mat);
      const angle = (k / LINE_COUNT) * Math.PI * 2;
      const radius = LINE_RADIUS_MIN + Math.random() * (LINE_RADIUS_MAX - LINE_RADIUS_MIN);
      mesh.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius, -LINE_AHEAD);
      mesh.rotation.x = Math.PI / 2;
      this.group.add(mesh);
      this.meshes.push(mesh);
    }
    camera.add(this.group);
  }

  update(speed: number, boosting: boolean, dt: number): void {
    const ramp = clamp01((speed - LINE_RAMP_START) / LINE_RAMP_RANGE);
    const opacity = boosting ? 1 : ramp;
    const wrapAt = -LINE_AHEAD + LINE_LENGTH;
    for (const mesh of this.meshes) {
      (mesh.material as THREE.MeshBasicMaterial).opacity = opacity;
      mesh.position.z += dt * LINE_SCROLL_SPEED;
      if (mesh.position.z > wrapAt) mesh.position.z -= LINE_LENGTH;
    }
  }

  dispose(): void {
    this.group.parent?.remove(this.group);
    this.geo.dispose();
    for (const mesh of this.meshes) (mesh.material as THREE.Material).dispose();
  }
}

export class Effects {
  private readonly spray = new ParticlePool(SPRAY_CAPACITY, 0xffffff, SPRAY_SIZE);
  private readonly burst = new ParticlePool(BURST_CAPACITY, 0x8ff4ff, BURST_SIZE);
  private readonly breakBurst = new ParticlePool(BREAK_BURST_CAPACITY, BREAK_BURST_COLOR, BURST_SIZE);
  private readonly wipeoutBurst = new ParticlePool(WIPEOUT_BURST_CAPACITY, WIPEOUT_BURST_COLOR, BURST_SIZE);
  private readonly lines: SpeedLines;
  private spraySpawnAccum = 0;
  private lastBoostHits = 0;
  private lastLandingCount = 0;
  private lastBreakCount = 0;
  private lastWipeoutCount = 0;

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    scene.add(this.spray.points);
    scene.add(this.burst.points);
    scene.add(this.breakBurst.points);
    scene.add(this.wipeoutBurst.points);
    this.lines = new SpeedLines(camera);
  }

  /** The speed-lines group (parented to the camera), so main.ts can hide it during a
   * PortalView render pass (real-portal design §2) without exposing the SpeedLines class. */
  get speedLinesGroup(): THREE.Group {
    return this.lines.group;
  }

  update(i: EffectsInput): void {
    // i.hitCount is reserved for a future collision puff; not wired yet.

    if (i.grounded && i.speed > SPRAY_MIN_SPEED) {
      this.spraySpawnAccum += Math.min(SPRAY_MAX_PER_FRAME, i.speed * SPRAY_SPAWN_RATE * i.dt * 60);
      while (this.spraySpawnAccum >= 1) {
        this.spraySpawnAccum -= 1;
        this.spray.spawn(
          i.x + (Math.random() - 0.5),
          i.y + 0.1,
          -i.z + 0.8,
          (Math.random() - 0.5) * 3,
          1 + Math.random() * 2,
          0.5,
          SPRAY_LIFE,
        );
      }
    }

    if (i.boostHits !== this.lastBoostHits) {
      if (i.boostHits > this.lastBoostHits) {
        for (let k = 0; k < BURST_COUNT; k++) {
          const angle = Math.random() * Math.PI * 2;
          const r = 2 + Math.random() * 2;
          this.burst.spawn(
            i.x, i.y + 0.2, -i.z,
            Math.cos(angle) * r, 1 + Math.random() * 2, Math.sin(angle) * r,
            BURST_LIFE,
          );
        }
      }
      this.lastBoostHits = i.boostHits;
    }

    if (i.landingCount !== this.lastLandingCount) {
      if (i.landingCount > this.lastLandingCount) {
        for (let k = 0; k < LANDING_COUNT; k++) {
          const angle = Math.random() * Math.PI * 2;
          const r = 1.5 + Math.random() * 2.5;
          this.spray.spawn(
            i.x, i.y + 0.1, -i.z,
            Math.cos(angle) * r, 0.5 + Math.random() * 1.5, Math.sin(angle) * r,
            LANDING_LIFE,
          );
        }
      }
      this.lastLandingCount = i.landingCount;
    }

    if (i.breakCount !== this.lastBreakCount) {
      if (i.breakCount > this.lastBreakCount) {
        for (let k = 0; k < BREAK_BURST_COUNT; k++) {
          this.breakBurst.spawn(
            i.x, i.y + 0.2, -i.z,
            (Math.random() - 0.5) * 2 * BREAK_BURST_SPEED,
            1 + Math.random() * 2,
            (Math.random() - 0.5) * 2 * BREAK_BURST_SPEED,
            BREAK_BURST_LIFE,
          );
        }
      }
      this.lastBreakCount = i.breakCount;
    }

    if (i.wipeoutCount !== this.lastWipeoutCount) {
      if (i.wipeoutCount > this.lastWipeoutCount) {
        for (let k = 0; k < WIPEOUT_BURST_COUNT; k++) {
          const angle = Math.random() * Math.PI * 2;
          const r = 2 + Math.random() * 2;
          this.wipeoutBurst.spawn(
            i.x, i.y + 0.2, -i.z,
            Math.cos(angle) * r, 1 + Math.random() * 2, Math.sin(angle) * r,
            WIPEOUT_BURST_LIFE,
          );
        }
      }
      this.lastWipeoutCount = i.wipeoutCount;
    }

    this.spray.step(i.dt);
    this.burst.step(i.dt);
    this.breakBurst.step(i.dt);
    this.wipeoutBurst.step(i.dt);
    this.lines.update(i.speed, i.boosting, i.dt);
  }

  dispose(): void {
    this.spray.dispose();
    this.burst.dispose();
    this.breakBurst.dispose();
    this.wipeoutBurst.dispose();
    this.lines.dispose();
  }
}
