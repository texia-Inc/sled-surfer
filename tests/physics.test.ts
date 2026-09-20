import { describe, it, expect } from 'vitest';
import {
  createRunState, stepRun, coinWorldY, launchSpeed, boostChainMul,
} from '../src/core/physics';
import { DEFAULT_PHYSICS, LAUNCH } from '../src/core/params';
import { createTrack, SLOPE_STEP, MAX_SLOPE } from '../src/core/track';
import type { RunState, Segment, Surface, TrackQuery } from '../src/core/types';

const DT = 1 / 120;

function emptySegment(index: number): Segment {
  return {
    index, z0: index * 200, z1: index * 200 + 200, corridorX: 0, bumps: [], ice: [], ramps: [],
    obstacles: [], coins: [], boosts: [], drops: [], zone: 'snowfield', gate: null, decor: [],
  };
}

/** 高さ関数から TrackQuery を作る。傾きは physics と同じ後退差分 */
function fakeTrack(height: (z: number) => number, surface: Surface = 'snow', seg: Segment = emptySegment(0)): TrackQuery {
  return {
    heightAt: height,
    slopeAt: (z) => Math.max(-MAX_SLOPE, Math.min(MAX_SLOPE, (height(z) - height(z - SLOPE_STEP)) / SLOPE_STEP)),
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

  it('decelerates less on road than on snow', () => {
    const snow = run(grounded({ vz: 10 }), flat, 1);
    const road = run(grounded({ vz: 10 }), fakeTrack(() => 0, 'road'), 1);
    expect(road.vz).toBeGreaterThan(snow.vz);
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
    for (let i = 0; i < 240 && !s.grounded; i++) {
      stepRun(s, { steer: 0, rocket: false }, DT, flat, DEFAULT_PHYSICS);
    }
    expect(s.grounded).toBe(true);
    expect(s.vz).toBeGreaterThan(10.4);
    expect(s.lastLandingBonus).toBeGreaterThan(1);
  });

  it('caps the landing bonus at landingBonusSpeedCap', () => {
    const s = grounded({ vz: 31 });
    s.grounded = false;
    s.y = 8;
    s.vy = 0;
    for (let i = 0; i < 240 && !s.grounded; i++) {
      stepRun(s, { steer: 0, rocket: false }, DT, flat, DEFAULT_PHYSICS);
    }
    expect(s.grounded).toBe(true);
    expect(s.vz).toBeLessThanOrEqual(DEFAULT_PHYSICS.landingBonusSpeedCap);
    expect(s.vz).toBeGreaterThan(31);
  });

  it('never reduces speed when the bonus multiplier would exceed the cap', () => {
    const s = grounded({ vz: 40 });
    s.grounded = false;
    s.y = 8;
    s.vy = 0;
    for (let i = 0; i < 240 && !s.grounded; i++) {
      stepRun(s, { steer: 0, rocket: false }, DT, flat, DEFAULT_PHYSICS);
    }
    expect(s.grounded).toBe(true);
    expect(s.vz).toBeLessThanOrEqual(40);
    expect(s.vz).toBeGreaterThan(38);
    expect(s.landingCount).toBe(1);
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

  it('launches off a real ramp cliff at speed instead of teleporting down (vz * dt > SLOPE_STEP)', () => {
    const track = createTrack(11);
    let rampZ = -1;
    let rampLength = 0;
    outer: for (let i = 0; i < 40; i++) {
      const seg = track.getSegment(i);
      for (const r of seg.ramps) {
        rampZ = r.z;
        rampLength = r.length;
        break outer;
      }
    }
    expect(rampZ).toBeGreaterThanOrEqual(0);

    const startZ = rampZ - 5;
    const s = grounded({ z: startZ, vz: 25, y: track.heightAt(startZ) });
    let leftGround = false;
    const cap = Math.round(3 / DT);
    for (let i = 0; i < cap && s.z <= rampZ + rampLength + 2; i++) {
      stepRun(s, { steer: 0, rocket: false }, DT, track, DEFAULT_PHYSICS);
      if (!s.grounded) leftGround = true;
    }
    expect(leftGround).toBe(true);
  });
});

describe('speed model (flow §1: no passive deceleration on the base grade)', () => {
  it('loses less than 5% speed over 5s on a slope matching the base grade (muSnow)', () => {
    // The real track's initial base grade is slope -0.12 (see track.ts SLOPE_START, terrain §3);
    // muSnow is tuned to match it so aSlope + aFriction ~= 0 there, leaving only the (small) drag
    // term.
    const gradeTrack = fakeTrack((z) => -0.12 * z);
    const s = run(grounded({ vz: 20 }), gradeTrack, 5);
    expect(s.vz).toBeGreaterThanOrEqual(20 * 0.95);
  });
});

describe('breakable obstacles (flow §3)', () => {
  it('breaking one: vz *= breakSpeedMul, marks broken, no stun, coins +2, breakCount 1', () => {
    const seg = emptySegment(0);
    seg.obstacles.push({ id: 'o', kind: 'snowman', x: 0, z: 10, r: 0.7 });
    const track = fakeTrack(() => 0, 'snow', seg);
    const s = grounded({ vz: 10, z: 8 });
    let vzBefore = s.vz;
    let hit: RunState | null = null;
    for (let i = 0; i < 60 && !hit; i++) {
      vzBefore = s.vz;
      stepRun(s, { steer: 0, rocket: false }, DT, track, DEFAULT_PHYSICS);
      if (s.breakCount > 0) {
        hit = {
          ...s,
          collectedCoinIds: new Set(s.collectedCoinIds),
          brokenObstacleIds: new Set(s.brokenObstacleIds),
        };
      }
    }
    expect(hit).not.toBeNull();
    expect(hit!.vz).toBeCloseTo(vzBefore * DEFAULT_PHYSICS.breakSpeedMul, 1);
    expect(hit!.stunTime).toBe(0);
    expect(hit!.coinsThisRun).toBe(DEFAULT_PHYSICS.breakCoinReward);
    expect(hit!.breakCount).toBe(1);
    expect(hit!.brokenObstacleIds.has('o')).toBe(true);

    // Keep rolling through where the (now broken) obstacle was: no second break.
    run(s, track, 1);
    expect(s.breakCount).toBe(1);
    expect(s.coinsThisRun).toBe(DEFAULT_PHYSICS.breakCoinReward);
  });

  it('a hard obstacle (e.g. rock) still stuns and pushes instead of breaking', () => {
    const seg = emptySegment(0);
    seg.obstacles.push({ id: 'o', kind: 'rock', x: 0, z: 10, r: 1 });
    const track = fakeTrack(() => 0, 'snow', seg);
    const s = grounded({ vz: 10, z: 8 });
    run(s, track, 0.5);
    expect(s.stunTime).toBeGreaterThan(0);
    expect(s.breakCount).toBe(0);
    expect(s.brokenObstacleIds.size).toBe(0);
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

describe('boost pads', () => {
  it('hitting a pad raises vz to at least boostMinSpeed and sets boostTime/boostGrace', () => {
    const seg = emptySegment(0);
    seg.boosts.push({ id: 'p1', x: 0, z: 10, length: 6, width: 4 });
    const track = fakeTrack(() => 0, 'snow', seg);
    const s = grounded({ vz: 10, z: 8 });
    let count = 0;
    for (let i = 0; i < 60 && count === 0; i++) {
      stepRun(s, { steer: 0, rocket: false }, DT, track, DEFAULT_PHYSICS);
      count = s.boostCount;
    }
    expect(count).toBe(1);
    expect(s.vz).toBeGreaterThanOrEqual(DEFAULT_PHYSICS.boostMinSpeed);
    expect(s.boostTime).toBeGreaterThan(0);
    expect(s.boostGrace).toBeGreaterThan(0);
  });

  it('does not trigger the same pad twice', () => {
    const seg = emptySegment(0);
    seg.boosts.push({ id: 'p1', x: 0, z: 10, length: 6, width: 4 });
    const track = fakeTrack(() => 0, 'snow', seg);
    const s = run(grounded({ vz: 10, z: 8 }), track, 5);
    expect(s.boostCount).toBe(1);
    expect(s.triggeredPadIds.has('p1')).toBe(true);
  });

  it('while boostGrace > 0, full steer does not slow the sled compared with no steer', () => {
    const withoutSteer = run(grounded({ vz: 15, boostGrace: 999 }), flat, 0.5, 0);
    const withSteer = run(grounded({ vz: 15, boostGrace: 999 }), flat, 0.5, 1);
    expect(Math.abs(withSteer.vz - withoutSteer.vz)).toBeLessThan(1e-6);
  });

  it('a second pad within the chain window raises boostChain to 2 with a bigger min-speed kick, right at the hit', () => {
    // Asserted at the step where the hit lands, not after a fixed 1 s window: with the
    // held-speed tuning (lower muSnow/kDrag), both a single-pad and a chained run reach
    // boostSpeedCap well inside 1 s, so a later-window comparison no longer shows the
    // chain effect. It IS observable right at the hit, where boostMinSpeed is scaled by
    // boostChainMul (see stepRun's pad-hit branch in src/core/physics.ts).
    const seg = emptySegment(0);
    seg.boosts.push({ id: 'p1', x: 0, z: 10, length: 6, width: 4 });
    seg.boosts.push({ id: 'p2', x: 0, z: 25, length: 6, width: 4 });
    const track = fakeTrack(() => 0, 'snow', seg);
    const s = grounded({ vz: 10, z: 8 });
    let count = 0;
    for (let i = 0; i < 300 && count < 2; i++) {
      stepRun(s, { steer: 0, rocket: false }, DT, track, DEFAULT_PHYSICS);
      count = s.boostCount;
    }
    expect(count).toBe(2);
    expect(s.boostChain).toBe(2);
    const mul = boostChainMul(s, DEFAULT_PHYSICS);
    expect(mul).toBeGreaterThan(1);
    expect(s.vz).toBeGreaterThanOrEqual(DEFAULT_PHYSICS.boostMinSpeed * mul);
  });

  it('a pad hit after the chain window resets the chain to 1', () => {
    const seg = emptySegment(0);
    seg.boosts.push({ id: 'p1', x: 0, z: 10, length: 6, width: 4 });
    seg.boosts.push({ id: 'p2', x: 0, z: 25, length: 6, width: 4 });
    const track = fakeTrack(() => 0, 'snow', seg);
    const s = grounded({ vz: 10, z: 8 });
    let count = 0;
    for (let i = 0; i < 60 && count === 0; i++) {
      stepRun(s, { steer: 0, rocket: false }, DT, track, DEFAULT_PHYSICS);
      count = s.boostCount;
    }
    expect(s.boostChain).toBe(1);
    s.boostChainTime = 0; // simulate the chain window having fully elapsed before p2
    count = s.boostCount;
    for (let i = 0; i < 180 && s.boostCount === count; i++) {
      stepRun(s, { steer: 0, rocket: false }, DT, track, DEFAULT_PHYSICS);
    }
    expect(s.boostCount).toBe(count + 1);
    expect(s.boostChain).toBe(1);
  });

  it('does not trigger a pad while airborne above it', () => {
    const seg = emptySegment(0);
    seg.boosts.push({ id: 'p1', x: 0, z: 10, length: 6, width: 4 });
    const track = fakeTrack(() => 0, 'snow', seg);
    const s = grounded({ vz: 10, z: 8 });
    s.grounded = false;
    s.y = 3;
    s.vy = 0;
    run(s, track, 0.5);
    expect(s.boostCount).toBe(0);
    expect(s.triggeredPadIds.has('p1')).toBe(false);
  });

  it('boost thrust adds no speed once vz is at or above boostSpeedCap', () => {
    const seg = emptySegment(0);
    seg.boosts.push({ id: 'p1', x: 0, z: 10, length: 6, width: 4 });
    const track = fakeTrack(() => 0, 'snow', seg);
    const s = grounded({ vz: 45, z: 10 });
    run(s, track, 0.3);
    expect(s.vz).toBeLessThanOrEqual(45 + 1e-9);
  });
});

describe('ramps boost like pads (flow addendum)', () => {
  it('riding onto a ramp grounded gives boostCount 1, vz >= boostMinSpeed, and does not re-trigger', () => {
    const seg = emptySegment(0);
    seg.ramps.push({ id: 'r1', z: 10, length: 6, height: 3, x: 0, width: 6 });
    const track = fakeTrack(() => 0, 'snow', seg);
    const s = grounded({ vz: 10, z: 8 });
    let count = 0;
    for (let i = 0; i < 60 && count === 0; i++) {
      stepRun(s, { steer: 0, rocket: false }, DT, track, DEFAULT_PHYSICS);
      count = s.boostCount;
    }
    expect(count).toBe(1);
    expect(s.vz).toBeGreaterThanOrEqual(DEFAULT_PHYSICS.boostMinSpeed);
    expect(s.triggeredPadIds.has('r1')).toBe(true);
    // Keep rolling through the same ramp span: no second trigger.
    run(s, track, 1);
    expect(s.boostCount).toBe(1);
  });

  it('a second ramp within the chain window raises boostChain to 2', () => {
    const seg = emptySegment(0);
    seg.ramps.push({ id: 'r1', z: 10, length: 6, height: 3, x: 0, width: 6 });
    seg.ramps.push({ id: 'r2', z: 25, length: 6, height: 3, x: 0, width: 6 });
    const track = fakeTrack(() => 0, 'snow', seg);
    const s = grounded({ vz: 10, z: 8 });
    let count = 0;
    for (let i = 0; i < 300 && count < 2; i++) {
      stepRun(s, { steer: 0, rocket: false }, DT, track, DEFAULT_PHYSICS);
      count = s.boostCount;
    }
    expect(count).toBe(2);
    expect(s.boostChain).toBe(2);
  });
});

describe('aimed ramps (terrain §1)', () => {
  it('boosts when riding the ramp lane but not when riding past it off to the side', () => {
    const onLineSeg = emptySegment(0);
    onLineSeg.ramps.push({ id: 'r1', z: 10, length: 6, height: 3, x: 5, width: 6 });
    const onLineTrack = fakeTrack(() => 0, 'snow', onLineSeg);
    const onLine = grounded({ vz: 10, z: 8, x: 5 });
    run(onLine, onLineTrack, 0.5);
    expect(onLine.boostCount).toBe(1);

    const offLineSeg = emptySegment(0);
    offLineSeg.ramps.push({ id: 'r2', z: 10, length: 6, height: 3, x: 5, width: 6 });
    const offLineTrack = fakeTrack(() => 0, 'snow', offLineSeg);
    const offLine = grounded({ vz: 10, z: 8, x: -5 });
    run(offLine, offLineTrack, 0.5);
    expect(offLine.boostCount).toBe(0);
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

  it('adds no speed once vz is at or above rocketSpeedCap', () => {
    const s = run(grounded({ vz: 50 }), flat, 0.5, 0, true);
    expect(s.vz).toBeLessThanOrEqual(50);
  });
});
