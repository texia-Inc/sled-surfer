import { describe, it, expect } from 'vitest';
import { targetPose, stepPose, POS_TAU, LOOK_TAU, FOV_TAU, type Pose, type PoseInput } from '../src/core/cameraPose';

const BASE: PoseInput = {
  x: 0, y: 0, z: 0, speed: 0, slopeAhead: 0, inDrop: false, boosting: false, rocketing: false,
};

describe('targetPose', () => {
  it('at speed 0 equals the base offsets (no pull-back/pitch extras)', () => {
    const p = targetPose(BASE, 'full');
    expect(p.py).toBeCloseTo(3.5, 6); // UP
    expect(p.pz).toBeCloseTo(7, 6); // BACK
    expect(p.fov).toBe(60);
  });

  it('at speed 40 the back/up equal base + full extras', () => {
    const p = targetPose({ ...BASE, speed: 40 }, 'full');
    expect(p.py).toBeCloseTo(3.5 + 2.5, 6); // UP + UP_EXTRA
    expect(p.pz).toBeCloseTo(7 + 3.5, 6); // BACK + BACK_EXTRA
  });

  it('adds DROP_EXTRA to up only while inDrop', () => {
    const p = targetPose({ ...BASE, speed: 40, inDrop: true }, 'full');
    expect(p.py).toBeCloseTo(3.5 + 2.5 + 1.5, 6);
  });

  it('raises fov while boosting or rocketing, in full mode', () => {
    expect(targetPose({ ...BASE, boosting: true }, 'full').fov).toBe(66);
    expect(targetPose({ ...BASE, rocketing: true }, 'full').fov).toBe(66);
    expect(targetPose(BASE, 'full').fov).toBe(60);
  });

  it('tilts the look target by slopeAhead * LOOK_PITCH_SCALE in full mode', () => {
    const p = targetPose({ ...BASE, slopeAhead: -0.2 }, 'full');
    expect(p.ly).toBeCloseTo(0 + 1 + -0.2 * 3, 6);
  });

  it('mild mode ignores speed: same pose at speed 0 and speed 40', () => {
    const low = targetPose({ ...BASE, speed: 0 }, 'mild');
    const high = targetPose({ ...BASE, speed: 40, inDrop: true }, 'mild');
    expect(high.py).toBeCloseTo(low.py, 6);
    expect(high.pz).toBeCloseTo(low.pz, 6);
  });

  it('mild mode fixes fov at 60 even while boosting', () => {
    expect(targetPose({ ...BASE, boosting: true }, 'mild').fov).toBe(60);
  });

  it('mild mode ignores slope pitch', () => {
    const p = targetPose({ ...BASE, slopeAhead: -0.5 }, 'mild');
    expect(p.ly).toBeCloseTo(1, 6);
  });
});

describe('portrait framing', () => {
  it('pulls back, rises and widens the fov on a tall phone screen, in both modes', () => {
    const landscape = targetPose({ ...BASE, aspect: 16 / 9 }, 'full');
    const portrait = targetPose({ ...BASE, aspect: 0.48 }, 'full');
    expect(portrait.pz).toBeGreaterThan(landscape.pz);
    expect(portrait.py).toBeGreaterThan(landscape.py);
    expect(portrait.fov).toBeGreaterThan(landscape.fov);
    const mild = targetPose({ ...BASE, aspect: 0.48 }, 'mild');
    expect(mild.fov).toBe(portrait.fov);
    expect(targetPose(BASE, 'full')).toEqual(landscape);
  });
  it('looks at the sled x and follows it almost fully', () => {
    const pose = targetPose({ ...BASE, x: 10 }, 'full');
    expect(pose.lx).toBe(10);
    expect(pose.px).toBeGreaterThanOrEqual(8.5);
  });
});

describe('stepPose', () => {
  const prev: Pose = { px: 0, py: 0, pz: 0, lx: 0, ly: 0, lz: 0, fov: 60 };
  const target: Pose = { px: 10, py: 10, pz: 99, lx: 10, ly: 10, lz: 10, fov: 66 };

  it('moves a fraction 1 - e^(-dt/tau) toward the target for position/look/fov', () => {
    const dt = 0.3;
    const next = stepPose(prev, target, dt, 'full');
    const kPos = 1 - Math.exp(-dt / POS_TAU);
    const kLook = 1 - Math.exp(-dt / LOOK_TAU);
    const kFov = 1 - Math.exp(-dt / FOV_TAU);
    expect(next.px).toBeCloseTo(10 * kPos, 6);
    expect(next.py).toBeCloseTo(10 * kPos, 6);
    expect(next.lx).toBeCloseTo(10 * kLook, 6);
    expect(next.ly).toBeCloseTo(10 * kLook, 6);
    expect(next.lz).toBeCloseTo(10 * kLook, 6);
    expect(next.fov).toBeCloseTo(60 + (66 - 60) * kFov, 6);
  });

  it('snaps pz exactly to the target regardless of dt', () => {
    expect(stepPose(prev, target, 0.016, 'full').pz).toBe(99);
    expect(stepPose(prev, target, 5, 'mild').pz).toBe(99);
  });

  it('converges toward the target as dt grows', () => {
    const next = stepPose(prev, target, 100, 'full');
    expect(next.px).toBeCloseTo(10, 3);
    expect(next.fov).toBeCloseTo(66, 3);
  });

  it('drops py/ly faster than the upward tau when the target is below prev (POS_TAU_FALL)', () => {
    const fallingPrev: Pose = { px: 0, py: 20, pz: 0, lx: 0, ly: 20, lz: 0, fov: 60 };
    const fallingTarget: Pose = { px: 0, py: 0, pz: 0, lx: 0, ly: 0, lz: 0, fov: 60 };
    const dt = 0.1;
    const next = stepPose(fallingPrev, fallingTarget, dt, 'full');
    const dropWithFallTau = fallingPrev.py - next.py;
    const kUpwardTau = 1 - Math.exp(-dt / POS_TAU);
    const dropWithUpwardTau = (fallingPrev.py - fallingTarget.py) * kUpwardTau;
    expect(dropWithFallTau).toBeGreaterThan(dropWithUpwardTau);
    const lyDropWithFallTau = fallingPrev.ly - next.ly;
    expect(lyDropWithFallTau).toBeGreaterThan((fallingPrev.ly - fallingTarget.ly) * kUpwardTau);
  });
});
