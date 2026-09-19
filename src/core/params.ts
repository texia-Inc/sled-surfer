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
}

export const DEFAULT_PHYSICS: PhysicsParams = {
  g: 9.81,
  muSnow: 0.05,
  muIce: 0.02,
  kDrag: 0.0009,
  kSteer: 0.35,
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
};

export const LAUNCH = {
  baseSpeed: 18,
  angleDeg: 25,
  minPullFactor: 0.4,
  rocketsPerRun: 1,
};

export const GOAL = { initial: 1000, growth: 1.5, roundTo: 50 };

export const ECONOMY = { distanceCoinDivisor: 10, goalBonusMul: 2 };

export const UPGRADE = {
  maxLevel: 10,
  baseCost: { slingshot: 40, sled: 50, income: 60 },
  costGrowth: 1.6,
  slingshotPerLevel: 0.08,
  sledPerLevel: 0.03,
  incomePerLevel: 0.25,
};
