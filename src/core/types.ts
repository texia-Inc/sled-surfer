export type Phase = 'aim' | 'run' | 'ended' | 'results';
export type Surface = 'snow' | 'ice' | 'road';
export type ObstacleKind =
  | 'tree' | 'rock' | 'snowman'
  | 'stump' | 'car' | 'bus' | 'sign' | 'barrier' | 'stalagmite' | 'crystal'
  | 'hay' | 'crate' | 'fence' | 'wall';
export type UpgradeKind = 'slingshot' | 'sled' | 'income';

export type ZoneId = 'snowfield' | 'forest' | 'city' | 'cave';
export type DecorKind = 'pine' | 'building' | 'stalactite' | 'cliff' | 'signpost';

/** 当たり判定なしの見た目用オブジェクト。y は地面からの高さ (stalactite の先端の基準点用)。他は 0 */
export interface Decor { id: string; kind: DecorKind; x: number; z: number; y: number; scale: number; }
/** ゾーン境界の門。物理には関与しない */
export interface Gate { z: number; zone: ZoneId; }

export interface Obstacle { id: string; kind: ObstacleKind; x: number; z: number; r: number; }
/** lift: 地面からの追加高さ (m)。0 なら地面のすぐ上 */
export interface Coin { id: string; x: number; z: number; lift: number; }
export interface Ramp { id: string; z: number; length: number; height: number; x: number; width: number; }
export interface IceBand { z0: number; z1: number; }
export interface Bump { z: number; amp: number; width: number; }
export interface BoostPad { id: string; x: number; z: number; length: number; width: number; }
/** Gradual descent over `length` metres starting at `z`, `depth` metres down (cos-interpolated). */
export interface Drop { z: number; depth: number; length: number; }

export interface Segment {
  index: number;
  z0: number;
  z1: number;
  widthStart: number;
  widthEnd: number;
  /** Two-lane split section, or null when this segment has none. gapHalf is the half-width of
   * the impassable centre gap (the wall obstacles sit at x=0, spaced along z0..z1). */
  split: { z0: number; z1: number; gapHalf: number } | null;
  corridorX: number;
  bumps: Bump[];
  ice: IceBand[];
  ramps: Ramp[];
  obstacles: Obstacle[];
  coins: Coin[];
  boosts: BoostPad[];
  drops: Drop[];
  zone: ZoneId;
  gate: Gate | null;
  decor: Decor[];
}

/** 物理が必要とするコースの問い合わせ。テストではこれを偽装する */
export interface TrackQuery {
  heightAt(z: number, x?: number): number;
  slopeAt(z: number, x?: number): number;
  surfaceAt(z: number): Surface;
  segmentsAround(z: number): Segment[];
  widthAt(z: number): number;
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
  /** True when the run ended by reaching the goal line (distance >= goalDistance), as opposed
   * to stopping (slow for stopTime). Set by Game.update, not stepRun (which has no goal). */
  finished: boolean;
  /** 直近の着地ボーナス倍率 (演出用)。なければ 0 */
  lastLandingBonus: number;
  /** ボーナス着地の累計回数 (HUD トースト表示のトリガー用) */
  landingCount: number;
  boostTime: number;      // remaining seconds of boost thrust
  boostGrace: number;     // remaining seconds during which steering costs nothing and friction is ice-level
  boostChain: number;     // number of pads hit in the current chain (0 = none)
  boostChainTime: number; // seconds left before the chain resets
  boostCount: number;     // pads hit this run (for effects/HUD; increments on every hit)
  triggeredPadIds: Set<string>;
  /** Ids of obstacles broken this run (hidden, no further collision). */
  brokenObstacleIds: Set<string>;
  /** Number of obstacles broken this run (effects trigger on change). */
  breakCount: number;
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
  /** True when the run ended by crossing the goal line rather than stopping. */
  finished: boolean;
  zoneReached: ZoneId;
}
