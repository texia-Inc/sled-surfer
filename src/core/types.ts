export type Phase = 'aim' | 'run' | 'ended' | 'results';
export type Surface = 'snow' | 'ice' | 'road' | 'sand';
export type ObstacleKind =
  | 'tree' | 'rock' | 'snowman'
  | 'stump' | 'car' | 'bus' | 'sign' | 'barrier' | 'stalagmite' | 'crystal'
  | 'hay' | 'crate' | 'fence' | 'wall' | 'totem' | 'palm'
  | 'cactus' | 'asteroid' | 'satellite';
export type UpgradeKind = 'slingshot' | 'sled' | 'income';

export type ZoneId = 'snowfield' | 'forest' | 'city' | 'cave' | 'volcano' | 'desert' | 'space';
export type DecorKind = 'pine' | 'building' | 'stalactite' | 'cliff' | 'signpost' | 'palm' | 'temple' | 'dune' | 'pyramid';

export type LaneKind = 'ridge' | 'ground' | 'pillars';
/** A lane within a multi-height RouteSection: heightAt adds `yOffset` (blended in/out at the
 * section's entry/exit) for x inside [xMin, xMax]. */
export interface Lane { xMin: number; xMax: number; yOffset: number; kind: LaneKind; }
/** A pillar in a `pillars` lane: circular (radius r), rising `yOffset` metres above the lane's
 * own (hazard) floor when (x, z) is within `radius` of (x, z). */
export interface Pillar { id: string; x: number; z: number; radius: number; yOffset: number; }
/** A multi-height route section (terrain routes §1): lanes partition the track width; pillars sit
 * in the `pillars` lane's hazard floor. `hazard` is the fluff at the pillar lane's floor ('lava'
 * in the volcano zone, 'chasm' elsewhere). `canyon` marks a canyon-jump section (canyon design
 * §2): a single full-width `pillars` lane with no pillars, spanning a gap to jump across. */
export interface RouteSection {
  z0: number; z1: number; lanes: Lane[]; pillars: Pillar[]; hazard: 'lava' | 'chasm';
  canyon?: true;
}

/** A narrow elevated slide (art §2): widthAt narrows to `width` and heightAt rises by `yOffset`
 * inside [z0, z1], both blended over SLIDER_BLEND metres at each end. */
export interface Slider { z0: number; z1: number; width: number; yOffset: number; }

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
  /** Half-pipe spans: heightAt curves up parabolically toward the walls inside each one
   * (terrain §5); surfaceAt reports 'ice' there. */
  pipes: { z0: number; z1: number; wallHeight: number }[];
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
  /** Multi-height route section spanning part of this segment, or null when it has none
   * (terrain routes §1). */
  route: RouteSection | null;
  /** Narrow elevated slider section inside this segment, or null (art §2). */
  slider: Slider | null;
}

/** 物理が必要とするコースの問い合わせ。テストではこれを偽装する */
export interface TrackQuery {
  heightAt(z: number, x?: number): number;
  slopeAt(z: number, x?: number): number;
  surfaceAt(z: number): Surface;
  segmentsAround(z: number): Segment[];
  widthAt(z: number): number;
  /** The half-pipe span containing `z`, or null when `z` isn't inside one. */
  pipeAt(z: number): { z0: number; z1: number; wallHeight: number } | null;
  /** The lane containing (z, x) inside a route section, or null outside any route section.
   * Optional so pre-existing fakes (without a route feature to test) need no change. */
  /** The route section containing z, or null. Optional for the same reason as laneAt. */
  routeAt?(z: number): RouteSection | null;
  laneAt?(z: number, x: number): Lane | null;
  /** Whether (z, x) sits within a pillar's radius inside a route section's `pillars` lane.
   * Optional for the same reason as laneAt. */
  onPillar?(z: number, x: number): boolean;
  /** The slider section containing `z`, or null outside one (art §2). Optional for the same
   * reason as routeAt. */
  sliderAt?(z: number): Slider | null;
}

export interface Track extends TrackQuery {
  seed: number;
  getSegment(index: number): Segment;
  segmentIndexAt(z: number): number;
  /** The route section containing `z`, or null when `z` isn't inside one. */
  routeAt(z: number): RouteSection | null;
  laneAt(z: number, x: number): Lane | null;
  onPillar(z: number, x: number): boolean;
  /** The slider section containing `z`, or null when `z` isn't inside one (art §2). */
  sliderAt(z: number): Slider | null;
  /** Lateral centerline offset (m) at game z (curved-track world bend design, §1): 0 for z < 0,
   * fading in over TRACK_BEND.fadeIn. Render applies this per-vertex (render/bend.ts); the
   * camera applies it in JS (render/camera.ts). */
  centerAt(z: number): number;
  /** Numeric derivative of centerAt (dCenter/dz), used to yaw the player to face the curve's
   * tangent (render/player.ts). */
  centerSlopeAt(z: number): number;
  /** The two deterministic phases (radians) centerAt/centerSlopeAt use, salted from the track's
   * seed; passed to render/bend.ts's setBendPhases whenever the track (re)starts. */
  bendPhases: [number, number];
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
  /** Number of times this run has wiped out on a route section's hazard floor (terrain routes §2). */
  wipeoutCount: number;
  /** Number of zone portals warped through this run (a white flash + boost on change). */
  warpCount: number;
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
