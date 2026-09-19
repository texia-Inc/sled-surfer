import { describe, it, expect } from 'vitest';
import { createRunState, stepRun, coinWorldY, launchSpeed } from '../src/core/physics';
import { DEFAULT_PHYSICS, LAUNCH } from '../src/core/params';
import type { RunState, Segment, Surface, TrackQuery } from '../src/core/types';

const DT = 1 / 120;

function emptySegment(index: number): Segment {
  return { index, z0: index * 200, z1: index * 200 + 200, corridorX: 0, bumps: [], ice: [], ramps: [], obstacles: [], coins: [] };
}

/** 高さ関数から TrackQuery を作る。傾きは physics と同じ後退差分 */
function fakeTrack(height: (z: number) => number, surface: Surface = 'snow', seg: Segment = emptySegment(0)): TrackQuery {
  return {
    heightAt: height,
    slopeAt: (z) => Math.max(-1.5, Math.min(1.5, (height(z) - height(z - 0.1)) / 0.1)),
    surfaceAt: () => surface,
    segmentsAround: () => [seg],
  };
}

const flat = fakeTrack(() => 0);

function grounded(over: Partial<RunState>): RunState {
  const s = createRunState({ v0: 0, angleDeg: 0, rockets: 1, groundY: 0 });
  s.grounded = true;
  return Object.assign(s, over);
}

function run(s: RunState, track: TrackQuery, seconds: number, steer = 0, rocket = false): RunState {
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) stepRun(s, { steer, rocket: rocket && i === 0 }, DT, track, DEFAULT_PHYSICS);
  return s;
}

describe('launchSpeed', () => {
  it('scales with pull and slingshot multiplier', () => {
    expect(launchSpeed(1, 1)).toBeCloseTo(LAUNCH.baseSpeed);
    expect(launchSpeed(0, 1)).toBeCloseTo(LAUNCH.baseSpeed * LAUNCH.minPullFactor);
    expect(launchSpeed(1, 1.5)).toBeCloseTo(LAUNCH.baseSpeed * 1.5);
  });
});

describe('createRunState', () => {
  it('starts airborne with velocity split by angle', () => {
    const s = createRunState({ v0: 10, angleDeg: 30, rockets: 1, groundY: 2 });
    expect(s.grounded).toBe(false);
    expect(s.vz).toBeCloseTo(10 * Math.cos(Math.PI / 6));
    expect(s.vy).toBeCloseTo(10 * Math.sin(Math.PI / 6));
    expect(s.y).toBeGreaterThan(2);
    expect(s.rocketLeft).toBe(1);
    expect(s.ended).toBe(false);
  });
});

describe('grounded motion', () => {
  it('accelerates on a downhill slope', () => {
    const s = run(grounded({ vz: 5 }), fakeTrack((z) => -0.3 * z), 1);
    expect(s.vz).toBeGreaterThan(5);
    expect(s.z).toBeGreaterThan(5);
  });

  it('decelerates less on ice than on snow', () => {
    const snow = run(grounded({ vz: 10 }), flat, 1);
    const ice = run(grounded({ vz: 10 }), fakeTrack(() => 0, 'ice'), 1);
    expect(ice.vz).toBeGreaterThan(snow.vz);
    expect(snow.vz).toBeLessThan(10);
  });

  it('steering slows the sled and moves it sideways within the track', () => {
    const straight = run(grounded({ vz: 15 }), flat, 1, 0);
    const turning = run(grounded({ vz: 15 }), flat, 1, 1);
    expect(turning.vz).toBeLessThan(straight.vz);
    expect(turning.x).toBeGreaterThan(0);
    expect(turning.x).toBeLessThanOrEqual(DEFAULT_PHYSICS.trackWidth / 2 - DEFAULT_PHYSICS.sledRadius);
  });

  it('never slides backwards uphill', () => {
    const s = run(grounded({ vz: 1 }), fakeTrack((z) => 0.5 * z), 2);
    expect(s.vz).toBe(0);
  });

  it('ends the run after being slow for stopTime', () => {
    const s = run(grounded({ vz: 0.5 }), flat, 1.2);
    expect(s.ended).toBe(true);
    expect(s.distance).toBeCloseTo(s.z);
  });

  it('keeps running while fast', () => {
    const s = run(grounded({ vz: 20 }), flat, 1.2);
    expect(s.ended).toBe(false);
  });
});

describe('air', () => {
  it('takes off at a cliff and lands on the lower ground', () => {
    const cliff = fakeTrack((z) => (z < 20 ? 0 : -3));
    const s = grounded({ z: 15, vz: 10 });
    let tookOff = false;
    for (let i = 0; i < 240; i++) {
      stepRun(s, { steer: 0, rocket: false }, DT, cliff, DEFAULT_PHYSICS);
      if (!s.grounded) tookOff = true;
    }
    expect(tookOff).toBe(true);
    expect(s.grounded).toBe(true);
    expect(s.y).toBeCloseTo(-3, 1);
  });

  it('grants a landing bonus after a long flight', () => {
    const s = grounded({ vz: 10 });
    s.grounded = false;
    s.y = 8;
    s.vy = 0;
    run(s, flat, 2);
    expect(s.grounded).toBe(true);
    expect(s.vz).toBeGreaterThan(10.4);
    expect(s.lastLandingBonus).toBeGreaterThan(1);
  });

  it('gives no bonus for a short hop', () => {
    const s = grounded({ vz: 10 });
    s.grounded = false;
    s.y = 0.3;
    s.vy = 0;
    run(s, flat, 1);
    expect(s.grounded).toBe(true);
    expect(s.vz).toBeLessThan(10);
    expect(s.lastLandingBonus).toBe(0);
  });
});

describe('obstacles and coins', () => {
  it('collision slows the sled, pushes it sideways, and stuns once', () => {
    const seg = emptySegment(0);
    seg.obstacles.push({ id: 'o', kind: 'rock', x: 0.3, z: 10, r: 1 });
    const track = fakeTrack(() => 0, 'snow', seg);
    const s = grounded({ vz: 10, z: 8 });
    let hit: RunState | null = null;
    for (let i = 0; i < 60 && !hit; i++) {
      stepRun(s, { steer: 0, rocket: false }, DT, track, DEFAULT_PHYSICS);
      if (s.stunTime > 0) hit = { ...s, collectedCoinIds: new Set(s.collectedCoinIds) };
    }
    expect(hit).not.toBeNull();
    expect(hit!.vz).toBeLessThan(6.1);
    expect(hit!.vx).toBeCloseTo(-DEFAULT_PHYSICS.collisionPushSpeed);
    run(s, track, 0.2);
    expect(s.x).toBeLessThan(-0.5);
  });

  it('ignores obstacles when flying high above them', () => {
    const seg = emptySegment(0);
    seg.obstacles.push({ id: 'o', kind: 'rock', x: 0, z: 10, r: 1 });
    const track = fakeTrack(() => 0, 'snow', seg);
    const s = grounded({ vz: 10, z: 8 });
    s.grounded = false;
    s.y = 5;
    s.vy = 0;
    run(s, track, 0.5);
    expect(s.stunTime).toBe(0);
  });

  it('collects each coin once', () => {
    const seg = emptySegment(0);
    seg.coins.push({ id: 'c1', x: 0, z: 5, lift: 0 });
    const track = fakeTrack(() => 0, 'snow', seg);
    const s = run(grounded({ vz: 10, z: 3 }), track, 0.5);
    expect(s.coinsThisRun).toBe(1);
    expect(s.collectedCoinIds.has('c1')).toBe(true);
    expect(coinWorldY(track, seg.coins[0], DEFAULT_PHYSICS)).toBeCloseTo(DEFAULT_PHYSICS.coinLift);
  });
});

describe('rocket', () => {
  it('fires once and adds speed on flat ground', () => {
    const s = grounded({ vz: 10 });
    stepRun(s, { steer: 0, rocket: true }, DT, flat, DEFAULT_PHYSICS);
    expect(s.rocketLeft).toBe(0);
    expect(s.rocketTime).toBeGreaterThan(0);
    run(s, flat, 1, 0, true);
    expect(s.vz).toBeGreaterThan(10);
    expect(s.rocketLeft).toBe(0);
  });
});
