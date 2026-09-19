export interface PhysicsParams {
  g: number;
  muSnow: number;
  muIce: number;
  kDrag: number;
  kSteer: number;
  rocketAccel: number;
  rocketDuration: number;
  maxLateral: number;
  lateralRefSpeed: number;
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
}

export const DEFAULT_PHYSICS: PhysicsParams = {
  g: 9.81,
  /** track.ts の初期基本勾配 (0.06) と同じ値。新品のソリは雪上で収支ゼロになり、
   * 氷・ランプ・ロケット・SLED 強化だけが加速手段になる */
  muSnow: 0.06,
  muIce: 0.02,
  kDrag: 0.0016,
  kSteer: 0.25,
  rocketAccel: 22,
  rocketDuration: 1.5,
  maxLateral: 12,
  lateralRefSpeed: 30,
  trackWidth: 16,
  sledRadius: 0.6,
  spawnGroundOffset: 0.05,
  wallBounceDamping: 0.5,
  collisionSpeedMul: 0.6,
  collisionPushSpeed: 6,
  stunDuration: 0.5,
  obstacleClearHeight: 1.5,
  stopSpeed: 0.8,
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
  boostAccel: 30,          // m/s² while boostTime > 0
  boostDuration: 0.8,      // seconds of thrust per pad
  boostMinSpeed: 22,       // vz is raised to at least this on hit
  boostGraceDuration: 1.2, // seconds: steer penalty off, friction = ice
  boostChainWindow: 3.0,   // seconds to hit the next pad to keep the chain
  boostChainStep: 0.1,     // chain multiplier = 1 + step * (chain - 1), capped
  boostChainMax: 3,        // chain count cap (multiplier max = 1 + 0.1*2 = 1.2)
};

export const LAUNCH = {
  baseSpeed: 18,
  angleDeg: 25,
  minPullFactor: 0.4,
  rocketsPerRun: 1,
};

export const GOAL = { initial: 1000, growth: 1.5, roundTo: 50 };

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
