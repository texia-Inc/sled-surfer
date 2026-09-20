/** Pure camera-comfort math (terrain design §2): where the camera wants to be, and how it
 * eases toward that target each frame. No `three` dependency so it's directly unit-testable;
 * `render/camera.ts` wraps this with the actual THREE.PerspectiveCamera. */

export type CameraMode = 'full' | 'mild';

export interface PoseInput {
  x: number;
  y: number;
  z: number;
  speed: number;
  /** Track slope a short distance ahead (negative on descents); tilts the look target's pitch. */
  slopeAhead: number;
  /** True while the sled is inside/approaching a drop span. */
  inDrop: boolean;
  boosting: boolean;
  rocketing: boolean;
}

export interface Pose {
  px: number; py: number; pz: number;
  lx: number; ly: number; lz: number;
  fov: number;
}

const BACK = 7;
const UP = 3.5;
const BACK_EXTRA = 3.5;
const UP_EXTRA = 2.5;
const DROP_EXTRA = 1.5;
const LOOK_AHEAD_Z = 6;
const LOOK_PITCH_SCALE = 3;
const FOV_NORMAL = 60;
const FOV_BOOST = 66;
const X_FOLLOW = 0.4;

/** Speed (m/s) at which the dynamic pull-back/pitch starts (k=0) and finishes (k=1). Not named
 * in the brief's constant list, but required so `targetPose` matches its own test contract
 * (base offsets at speed 0, base + full extras at speed 40) - see report deviations. */
const SPEED_EXTRA_MIN = 15;
const SPEED_EXTRA_RANGE = 25;

/** Time constants (seconds) for `stepPose`'s exponential approach toward the target. */
const POS_TAU = 0.6;
/** Faster tau used for `py`/`ly` when the target has dropped below the previous pose, so the
 * camera keeps up with the sled during a steep descent instead of easing behind and losing it
 * out the bottom of the frame. */
const POS_TAU_FALL = 0.15;
const LOOK_TAU = 1.0;
const FOV_TAU = 0.5;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Where the camera wants to be this frame (world coords, z already negated). */
export function targetPose(i: PoseInput, mode: CameraMode): Pose {
  const mild = mode === 'mild';
  const k = mild ? 0 : clamp01((i.speed - SPEED_EXTRA_MIN) / SPEED_EXTRA_RANGE);
  const backExtra = mild ? 0 : BACK_EXTRA;
  const upExtra = mild ? 0 : UP_EXTRA;
  const dropExtra = mild ? 0 : DROP_EXTRA;
  const pitchScale = mild ? 0 : LOOK_PITCH_SCALE;

  const back = BACK + backExtra * k;
  const up = UP + upExtra * k + (i.inDrop ? dropExtra : 0);
  const fov = !mild && (i.boosting || i.rocketing) ? FOV_BOOST : FOV_NORMAL;

  return {
    px: i.x * X_FOLLOW,
    py: i.y + up,
    pz: -i.z + back,
    lx: i.x * X_FOLLOW,
    ly: i.y + 1 + i.slopeAhead * pitchScale,
    lz: -i.z - LOOK_AHEAD_Z,
    fov,
  };
}

function approach(cur: number, target: number, dt: number, tau: number): number {
  const k = 1 - Math.exp(-dt / tau);
  return cur + (target - cur) * k;
}

/** Exponential approach of `prev` toward `target`; `pz` (forward distance) snaps exactly since
 * it must always match the sled's actual z to avoid clipping through terrain/geometry. `mode`
 * is accepted for signature symmetry with `targetPose` (the brief's contract) though the easing
 * itself doesn't currently vary by mode - only the target the pose approaches does. */
export function stepPose(prev: Pose, target: Pose, dt: number, mode: CameraMode): Pose {
  void mode;
  const pyTau = target.py < prev.py ? POS_TAU_FALL : POS_TAU;
  const lyTau = target.ly < prev.ly ? POS_TAU_FALL : LOOK_TAU;
  return {
    px: approach(prev.px, target.px, dt, POS_TAU),
    py: approach(prev.py, target.py, dt, pyTau),
    pz: target.pz,
    lx: approach(prev.lx, target.lx, dt, LOOK_TAU),
    ly: approach(prev.ly, target.ly, dt, lyTau),
    lz: approach(prev.lz, target.lz, dt, LOOK_TAU),
    fov: approach(prev.fov, target.fov, dt, FOV_TAU),
  };
}
