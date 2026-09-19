export type Phase = 'aim' | 'run' | 'ended' | 'results';
export type Surface = 'snow' | 'ice';
export type ObstacleKind = 'tree' | 'rock' | 'snowman';
export type UpgradeKind = 'slingshot' | 'sled' | 'income';

export interface Obstacle { id: string; kind: ObstacleKind; x: number; z: number; r: number; }
/** lift: 地面からの追加高さ (m)。0 なら地面のすぐ上 */
export interface Coin { id: string; x: number; z: number; lift: number; }
export interface Ramp { z: number; length: number; height: number; }
export interface IceBand { z0: number; z1: number; }
export interface Bump { z: number; amp: number; width: number; }

export interface Segment {
  index: number;
  z0: number;
  z1: number;
  corridorX: number;
  bumps: Bump[];
  ice: IceBand[];
  ramps: Ramp[];
  obstacles: Obstacle[];
  coins: Coin[];
}

/** 物理が必要とするコースの問い合わせ。テストではこれを偽装する */
export interface TrackQuery {
  heightAt(z: number): number;
  slopeAt(z: number): number;
  surfaceAt(z: number): Surface;
  segmentsAround(z: number): Segment[];
}

export interface Track extends TrackQuery {
  seed: number;
  getSegment(index: number): Segment;
  segmentIndexAt(z: number): number;
}

export interface Input { steer: number; rocket: boolean; }

export interface RunState {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  grounded: boolean;
  airTime: number;
  flips: number;
  rocketLeft: number;
  rocketTime: number;
  stunTime: number;
  stoppedTime: number;
  coinsThisRun: number;
  collectedCoinIds: Set<string>;
  distance: number;
  ended: boolean;
  /** 直近の着地ボーナス倍率 (演出用)。なければ 0 */
  lastLandingBonus: number;
}

export interface Upgrades { slingshot: number; sled: number; income: number; }

export interface Profile {
  coins: number;
  bestDistance: number;
  goalDistance: number;
  upgrades: Upgrades;
}

export interface RunResult {
  distance: number;
  coinsCollected: number;
  distanceCoins: number;
  earned: number;
  newBest: boolean;
  goalReached: boolean;
}
