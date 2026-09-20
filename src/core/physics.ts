import type { Coin, Input, RunState, TrackQuery } from './types';
import { isOnPad, OBSTACLE_BREAKABLE } from './track';
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
    finished: false,
    lastLandingBonus: 0,
    landingCount: 0,
    boostTime: 0,
    boostGrace: 0,
    boostChain: 0,
    boostChainTime: 0,
    boostCount: 0,
    triggeredPadIds: new Set<string>(),
    brokenObstacleIds: new Set<string>(),
    breakCount: 0,
  };
}

/** Chain speed multiplier used both to scale boostMinSpeed on a new hit and the HUD readout. 1 when no chain is active. */
export function boostChainMul(s: RunState, p: PhysicsParams): number {
  return s.boostChain > 0 ? 1 + p.boostChainStep * (s.boostChain - 1) : 1;
}

export function coinWorldY(track: TrackQuery, coin: Coin, p: PhysicsParams): number {
  return track.heightAt(coin.z) + p.coinLift + coin.lift;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Shared boost-hit logic (chain, thrust duration, steering grace, min-speed kick, hit count)
 * and bookkeeping (triggeredPadIds so a given id never re-fires). Used by both flat pads and
 * ramps, which trigger it identically. */
function applyBoost(s: RunState, p: PhysicsParams, id: string): void {
  s.triggeredPadIds.add(id);
  s.boostChain = Math.min(p.boostChainMax, s.boostChain + 1);
  s.boostChainTime = p.boostChainWindow;
  s.boostTime = p.boostDuration;
  s.boostGrace = p.boostGraceDuration;
  s.vz = Math.max(s.vz, p.boostMinSpeed * boostChainMul(s, p));
  s.boostCount += 1;
}

export function stepRun(s: RunState, input: Input, dt: number, track: TrackQuery, p: PhysicsParams): RunState {
  if (s.ended) return s;

  const steer = s.stunTime > 0 ? 0 : clamp(input.steer, -1, 1);

  if (input.rocket && s.rocketLeft > 0 && s.rocketTime <= 0) {
    s.rocketLeft -= 1;
    s.rocketTime = p.rocketDuration;
  }
  const rocketA = s.rocketTime > 0 && s.vz < p.rocketSpeedCap ? p.rocketAccel : 0;
  s.rocketTime = Math.max(0, s.rocketTime - dt);
  const wasStunned = s.stunTime > 0;
  s.stunTime = Math.max(0, s.stunTime - dt);

  s.boostTime = Math.max(0, s.boostTime - dt);
  s.boostGrace = Math.max(0, s.boostGrace - dt);
  s.boostChainTime = Math.max(0, s.boostChainTime - dt);
  if (s.boostChainTime === 0) s.boostChain = 0;
  const boostA = s.boostTime > 0 && s.vz < p.boostSpeedCap ? p.boostAccel * boostChainMul(s, p) : 0;

  const drag = -p.kDrag * p.dragMul * s.vz * Math.abs(s.vz);

  if (s.grounded) {
    const slope0 = track.slopeAt(s.z, s.x);
    const surface = track.surfaceAt(s.z);
    const onIce = s.boostGrace > 0 || surface === 'ice';
    const muBase = onIce ? p.muIce : surface === 'road' ? p.muRoad : p.muSnow;
    const mu = muBase * p.frictionMul;
    const aSlope = (-p.g * slope0) / Math.sqrt(1 + slope0 * slope0);
    const aFric = s.vz > 0 ? -p.g * mu : 0;
    const aSteer = s.boostGrace > 0 ? 0 : -p.kSteer * steer * steer * s.vz;
    s.vz += (aSlope + aFric + drag + aSteer + rocketA + boostA) * dt;
    if (s.vz < 0) s.vz = 0;

    // Half-pipe lateral physics (terrain §5): inside a pipe, steering no longer sets vx directly
    // - it adds a lateral accel on top of the pipe's own centring pull (-g * dh/dx, the numeric
    // cross-section slope at the sled's current x). Outside any pipe, behaviour is unchanged.
    const pipe = track.pipeAt(s.z);
    const slopeX = pipe ? (track.heightAt(s.z, s.x + 0.1) - track.heightAt(s.z, s.x - 0.1)) / 0.2 : 0;
    if (!wasStunned) {
      if (pipe) {
        s.vx += (-p.g * slopeX + steer * p.steerAccelPipe) * dt;
      } else {
        s.vx = (steer * p.maxLateral * Math.min(s.vz, p.lateralRefSpeed)) / p.lateralRefSpeed;
      }
    }

    const vy0 = s.vz * slope0;
    s.z += s.vz * dt;
    const slope1 = track.slopeAt(s.z, s.x);
    const vy1 = s.vz * slope1;
    const ground = track.heightAt(s.z, s.x);
    const requiredAccel = (vy1 - vy0) / dt;
    const projected = s.y + vy0 * dt - 0.5 * p.g * dt * dt;
    // Pipe-rim takeoff: near the wall, with enough upward lateral speed (vx * dh/dx), the sled
    // launches off the rim into the air (small jump), keeping vx as usual while airborne.
    const pipeRimTakeoff = pipe !== null
      && Math.abs(s.x) > p.pipeRimFraction * (track.widthAt(s.z) / 2)
      && s.vx * slopeX > p.pipeTakeoffVy;
    if (s.vz > 0 && (requiredAccel < -p.g || ground < projected)) {
      s.grounded = false;
      s.vy = vy0;
      s.y = Math.max(ground, s.y + vy0 * dt);
      s.airTime = 0;
      s.flips = 0;
    } else if (pipeRimTakeoff) {
      s.grounded = false;
      s.vy = s.vx * slopeX;
      s.y = ground;
      s.airTime = 0;
      s.flips = 0;
    } else {
      s.y = ground;
      s.vy = vy1;
    }
  } else {
    s.vy -= p.g * dt;
    s.vz += (drag + rocketA + boostA) * dt;
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
        const boosted = Math.min(s.vz * bonus, p.landingBonusSpeedCap);
        if (boosted > s.vz) { s.vz = boosted; }
        s.lastLandingBonus = bonus;
        s.landingCount += 1;
      }
      s.airTime = 0;
    }
  }

  s.x += s.vx * dt;
  const half = track.widthAt(s.z) / 2 - p.sledRadius;
  if (s.x > half) {
    s.x = half;
    s.vx = -Math.abs(s.vx) * p.wallBounceDamping;
  } else if (s.x < -half) {
    s.x = -half;
    s.vx = Math.abs(s.vx) * p.wallBounceDamping;
  }

  const groundHere = track.heightAt(s.z);
  const segments = track.segmentsAround(s.z);

  // Pads only trigger while rolling on the ground (unlike obstacles, which also catch a low
  // hop); a run can be on at most one pad per step, so stop at the first fresh hit.
  if (s.grounded && s.y - groundHere < p.obstacleClearHeight) {
    padLoop: for (const seg of segments) {
      for (const pad of seg.boosts) {
        if (s.triggeredPadIds.has(pad.id) || !isOnPad(s.x, s.z, pad)) continue;
        applyBoost(s, p, pad.id);
        break padLoop;
      }
    }
  }

  // Ramps are boost points too (any x - they span the full track width): riding onto one while
  // grounded triggers the same boost as a pad, once per ramp id. (The original game ends a run
  // at the goal line, not by speed decay - see Game.update - so ramps sustaining a fast run is
  // the intended feel, not a runaway.)
  if (s.grounded) {
    rampLoop: for (const seg of segments) {
      for (const r of seg.ramps) {
        if (s.triggeredPadIds.has(r.id) || s.z < r.z || s.z >= r.z + r.length) continue;
        if (Math.abs(s.x - r.x) > r.width / 2) continue;
        applyBoost(s, p, r.id);
        break rampLoop;
      }
    }
  }

  if (s.stunTime <= 0 && s.y - groundHere < p.obstacleClearHeight) {
    segLoop: for (const seg of segments) {
      for (const o of seg.obstacles) {
        if (s.brokenObstacleIds.has(o.id)) continue;
        const dx = s.x - o.x;
        const dz = s.z - o.z;
        const minDist = o.r + p.sledRadius;
        if (dx * dx + dz * dz < minDist * minDist) {
          if (OBSTACLE_BREAKABLE[o.kind]) {
            // Breakable: it shatters and vanishes (brokenObstacleIds), a light speed penalty,
            // a small coin reward, no stun and no lateral push. At most one break per step
            // (the sled could theoretically overlap two at once); we don't guard against that.
            s.brokenObstacleIds.add(o.id);
            s.vz *= p.breakSpeedMul;
            s.coinsThisRun += p.breakCoinReward;
            s.breakCount += 1;
            continue;
          }
          const side = dx >= 0 ? 1 : -1;
          s.vz *= p.collisionSpeedMul;
          s.vx = side * p.collisionPushSpeed;
          s.x = o.x + side * minDist;
          s.stunTime = p.stunDuration;
          break segLoop;
        }
      }
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
