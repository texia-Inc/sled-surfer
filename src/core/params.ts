export interface PhysicsParams {
  g: number;
  muSnow: number;
  muIce: number;
  muRoad: number;
  /** Grass friction coefficient. Defined for the flow model's off-piste terrain; no surface
   * reports 'grass' yet, so this is unused by surfaceAt/friction lookup for now. */
  muGrass: number;
  kDrag: number;
  kSteer: number;
  rocketAccel: number;
  rocketDuration: number;
  maxLateral: number;
  lateralRefSpeed: number;
  /** Nominal track width (m): segment 0's widthStart, and the default a fake TrackQuery's
   * widthAt returns in tests unless it overrides one. The wall clamp itself now reads the real,
   * per-z width from track.widthAt(z) (terrain §4), not this field. */
  trackWidth: number;
  sledRadius: number;
  spawnGroundOffset: number;
  wallBounceDamping: number;
  collisionSpeedMul: number;
  collisionPushSpeed: number;
  stunDuration: number;
  obstacleClearHeight: number;
  stopSpeed: number;
  stopTime: number;
  landingBonusPerFlip: number;
  maxLandingBonus: number;
  minAirTimeForBonus: number;
  flipSeconds: number;
  coinRadius: number;
  coinLift: number;
  coinVertical: number;
  /** SLED 強化で下がる。1 が未強化 */
  frictionMul: number;
  dragMul: number;
  boostAccel: number;
  boostDuration: number;
  boostMinSpeed: number;
  boostGraceDuration: number;
  boostChainWindow: number;
  boostChainStep: number;
  boostChainMax: number;
  rocketSpeedCap: number;
  boostSpeedCap: number;
  landingBonusSpeedCap: number;
  /** vz multiplier on hitting a breakable obstacle (no stun, no lateral push). */
  breakSpeedMul: number;
  /** Coins awarded (added to coinsThisRun) for breaking a breakable obstacle. */
  breakCoinReward: number;
  /** Lateral steering accel (m/s²) while inside a half-pipe (terrain §5) - added on top of the
   * pipe's own centring pull, replacing the normal steer-sets-vx assignment there. */
  steerAccelPipe: number;
  /** Minimum upward speed (vx * dh/dx, m/s) at the pipe rim needed to take off. */
  pipeTakeoffVy: number;
  /** Fraction of the half-width beyond which the sled is considered at the pipe's rim. */
  pipeRimFraction: number;
  /** Max height (m) the ground at the new position may exceed the sled's current y before a
   * lateral or forward move is blocked as a wall (terrain routes §2). */
  stepUpLimit: number;
  /** How far ahead (m) the front-wall check samples the ground (routes §2). */
  wallLookahead: number;
  /** Lateral probe distance (m) used to pick which way to slide off a front wall. */
  wallSlideProbe: number;
  /** Lateral acceleration (m/s²) from steering while airborne, so landings can be aimed. */
  /** Time constant (s) for airborne lateral speed to reach the same steer target as on the
   * ground (the original allows near-full steering mid-jump); smaller = snappier. */
  airSteerTau: number;
  /** vz multiplier applied when a forward step is blocked by a front wall. */
  frontWallSpeedMul: number;
  /** Stun duration (s) applied when a forward step is blocked by a front wall. */
  frontWallStun: number;
  /** Stun duration (s) applied on a route-section wipeout (hazard floor, off a pillar). */
  wipeoutStun: number;
  /** vz is capped to this on a route-section wipeout. */
  wipeoutSpeed: number;
  /** A portal counts as crossed only within this many metres past its z (so a run that starts
   * or is placed beyond an old portal never retro-triggers it). */
  warpWindow: number;
  /** Metres the sled is teleported forward the instant it crosses a gate (real-portal design §3):
   * on top of the existing boost, this is the "hop" that sells the warp as an instant jump into
   * the next zone rather than just a speed kick. */
  warpHop: number;
}

export const DEFAULT_PHYSICS: PhysicsParams = {
  g: 9.81,
  /** Flow speed model (2026-09-20-flow-design §1): flat/gentle slopes no longer bleed speed —
   * muSnow matches the initial base grade so deceleration is concentrated in collisions rather
   * than ambient friction. Terrain sprint §3 steepened the base grade to 0.12 (see track.ts
   * SLOPE_START), so muSnow moves to match — keep the two in sync. muGrass is defined for future
   * off-piste terrain (unused by surfaceAt yet). */
  muSnow: 0.12,
  muIce: 0.02,
  muRoad: 0.035,
  muGrass: 0.125,
  kDrag: 0.0005,
  kSteer: 0.25,
  rocketAccel: 15,
  rocketDuration: 1.0,
  maxLateral: 12,
  lateralRefSpeed: 30,
  trackWidth: 28,
  sledRadius: 0.6,
  spawnGroundOffset: 0.05,
  wallBounceDamping: 0.5,
  collisionSpeedMul: 0.6,
  collisionPushSpeed: 6,
  stunDuration: 0.5,
  obstacleClearHeight: 1.5,
  stopSpeed: 2.5,
  stopTime: 1.0,
  landingBonusPerFlip: 0.08,
  maxLandingBonus: 1.25,
  minAirTimeForBonus: 0.6,
  flipSeconds: 1.0,
  coinRadius: 1.2,
  coinLift: 0.8,
  coinVertical: 1.5,
  frictionMul: 1,
  dragMul: 1,
  boostAccel: 35,          // m/s² while boostTime > 0 and vz < boostSpeedCap
  boostDuration: 0.8,      // seconds of thrust per pad
  boostMinSpeed: 24,       // vz is raised to at least this on hit
  boostGraceDuration: 1.2, // seconds: steer penalty off, friction = ice
  boostChainWindow: 3.0,   // seconds to hit the next pad to keep the chain
  boostChainStep: 0.1,     // chain multiplier = 1 + step * (chain - 1), capped
  boostChainMax: 3,        // chain count cap (multiplier max = 1 + 0.1*2 = 1.2)
  rocketSpeedCap: 30,        // rocket thrust applies only while vz is below this
  boostSpeedCap: 40,         // boost thrust applies only while vz is below this
  landingBonusSpeedCap: 32,  // landing bonus never raises vz above this
  breakSpeedMul: 0.85,
  breakCoinReward: 2,
  steerAccelPipe: 18,
  pipeTakeoffVy: 4,
  pipeRimFraction: 0.85,
  stepUpLimit: 1.2,
  wallLookahead: 1.0,
  wallSlideProbe: 3,
  airSteerTau: 0.25,
  frontWallSpeedMul: 0.3,
  frontWallStun: 0.5,
  wipeoutStun: 1.0,
  wipeoutSpeed: 10,
  warpWindow: 20,
  warpHop: 24,
};

export const LAUNCH = {
  baseSpeed: 22,
  angleDeg: 25,
  minPullFactor: 0.4,
  rocketsPerRun: 1,
};

/** initial must equal ZONE_GOALS[0] (the first zone's goal line, GOAL_LEAD before its portal). */
export const GOAL = { initial: 450, stepAfter: 1000, roundTo: 50 };

export const ECONOMY = { distanceCoinDivisor: 10, goalBonusMul: 2 };

export const RUN = { seedStride: 7919, endedDelaySeconds: 1.0 };

export const UPGRADE = {
  maxLevel: 10,
  baseCost: { slingshot: 40, sled: 50, income: 60 },
  costGrowth: 1.6,
  slingshotPerLevel: 0.08,
  sledPerLevel: 0.03,
  incomePerLevel: 0.25,
};
