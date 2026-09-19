import type { Coin, Input, RunState, TrackQuery } from './types';
import { DEFAULT_PHYSICS, LAUNCH, type PhysicsParams } from './params';

export function launchSpeed(pull: number, slingshotMul: number): number {
  const p = Math.max(0, Math.min(1, pull));
  return LAUNCH.baseSpeed * (LAUNCH.minPullFactor + (1 - LAUNCH.minPullFactor) * p) * slingshotMul;
}

export function createRunState(opts: { v0: number; angleDeg: number; rockets: number; groundY: number }, p: PhysicsParams = DEFAULT_PHYSICS): RunState {
  const a = (opts.angleDeg * Math.PI) / 180;
  return {
    x: 0,
    y: opts.groundY + p.spawnGroundOffset,
    z: 0,
    vx: 0,
    vy: opts.v0 * Math.sin(a),
    vz: opts.v0 * Math.cos(a),
    grounded: false,
    airTime: 0,
    flips: 0,
    rocketLeft: opts.rockets,
    rocketTime: 0,
    stunTime: 0,
    stoppedTime: 0,
    coinsThisRun: 0,
    collectedCoinIds: new Set<string>(),
    distance: 0,
    ended: false,
    lastLandingBonus: 0,
  };
}

export function coinWorldY(track: TrackQuery, coin: Coin, p: PhysicsParams): number {
  return track.heightAt(coin.z) + p.coinLift + coin.lift;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function stepRun(s: RunState, input: Input, dt: number, track: TrackQuery, p: PhysicsParams): RunState {
  if (s.ended) return s;

  const steer = s.stunTime > 0 ? 0 : clamp(input.steer, -1, 1);

  if (input.rocket && s.rocketLeft > 0 && s.rocketTime <= 0) {
    s.rocketLeft -= 1;
    s.rocketTime = p.rocketDuration;
  }
  const rocketA = s.rocketTime > 0 ? p.rocketAccel : 0;
  s.rocketTime = Math.max(0, s.rocketTime - dt);
  const wasStunned = s.stunTime > 0;
  s.stunTime = Math.max(0, s.stunTime - dt);

  const drag = -p.kDrag * p.dragMul * s.vz * Math.abs(s.vz);

  if (s.grounded) {
    const slope0 = track.slopeAt(s.z);
    const mu = (track.surfaceAt(s.z) === 'ice' ? p.muIce : p.muSnow) * p.frictionMul;
    const aSlope = (-p.g * slope0) / Math.sqrt(1 + slope0 * slope0);
    const aFric = s.vz > 0 ? -p.g * mu : 0;
    const aSteer = -p.kSteer * steer * steer * s.vz;
    s.vz += (aSlope + aFric + drag + aSteer + rocketA) * dt;
    if (s.vz < 0) s.vz = 0;
    if (!wasStunned) {
      s.vx = (steer * p.maxLateral * Math.min(s.vz, p.lateralRefSpeed)) / p.lateralRefSpeed;
    }

    const vy0 = s.vz * slope0;
    s.z += s.vz * dt;
    const slope1 = track.slopeAt(s.z);
    const vy1 = s.vz * slope1;
    const ground = track.heightAt(s.z);
    const requiredAccel = (vy1 - vy0) / dt;
    if (requiredAccel < -p.g && s.vz > 0) {
      s.grounded = false;
      s.vy = vy0;
      s.y = Math.max(ground, s.y + vy0 * dt);
      s.airTime = 0;
      s.flips = 0;
    } else {
      s.y = ground;
      s.vy = vy1;
    }
  } else {
    s.vy -= p.g * dt;
    s.vz += (drag + rocketA) * dt;
    if (s.vz < 0) s.vz = 0;
    s.z += s.vz * dt;
    s.y += s.vy * dt;
    s.airTime += dt;
    s.flips = Math.floor(s.airTime / p.flipSeconds);
    const ground = track.heightAt(s.z);
    if (s.y <= ground) {
      s.y = ground;
      s.vy = 0;
      s.grounded = true;
      if (s.airTime >= p.minAirTimeForBonus && s.flips >= 1) {
        const bonus = Math.min(1 + p.landingBonusPerFlip * s.flips, p.maxLandingBonus);
        s.vz *= bonus;
        s.lastLandingBonus = bonus;
      }
      s.airTime = 0;
    }
  }

  s.x += s.vx * dt;
  const half = p.trackWidth / 2 - p.sledRadius;
  if (s.x > half) {
    s.x = half;
    s.vx = -Math.abs(s.vx) * p.wallBounceDamping;
  } else if (s.x < -half) {
    s.x = -half;
    s.vx = Math.abs(s.vx) * p.wallBounceDamping;
  }

  const groundHere = track.heightAt(s.z);
  const segments = track.segmentsAround(s.z);

  if (s.stunTime <= 0 && s.y - groundHere < p.obstacleClearHeight) {
    for (const seg of segments) {
      for (const o of seg.obstacles) {
        const dx = s.x - o.x;
        const dz = s.z - o.z;
        const minDist = o.r + p.sledRadius;
        if (dx * dx + dz * dz < minDist * minDist) {
          const side = dx >= 0 ? 1 : -1;
          s.vz *= p.collisionSpeedMul;
          s.vx = side * p.collisionPushSpeed;
          s.x = o.x + side * minDist;
          s.stunTime = p.stunDuration;
          break;
        }
      }
      if (s.stunTime > 0) break;
    }
  }

  for (const seg of segments) {
    for (const c of seg.coins) {
      if (s.collectedCoinIds.has(c.id)) continue;
      const dx = s.x - c.x;
      const dz = s.z - c.z;
      if (dx * dx + dz * dz >= p.coinRadius * p.coinRadius) continue;
      if (Math.abs(s.y - coinWorldY(track, c, p)) >= p.coinVertical) continue;
      s.collectedCoinIds.add(c.id);
      s.coinsThisRun += 1;
    }
  }

  if (s.grounded && s.vz < p.stopSpeed) {
    s.stoppedTime += dt;
    if (s.stoppedTime >= p.stopTime) s.ended = true;
  } else {
    s.stoppedTime = 0;
  }

  s.distance = s.z;
  return s;
}
