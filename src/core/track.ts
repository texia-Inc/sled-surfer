import type {
  BoostPad, Bump, Coin, Decor, Drop, Gate, IceBand, Lane, LaneKind, Obstacle, ObstacleKind, Pillar, Ramp, RouteSection, Segment, Slider, Surface,
  Track,
} from './types';
import { DEFAULT_PHYSICS } from './params';
import { zoneAt, zoneIndex, ZONES } from './zones';

export const SEGMENT_LENGTH = 200;
export const TRACK_WIDTH = DEFAULT_PHYSICS.trackWidth;
/** Small ramp template: gentle jump, used more often than RAMP_BIG. */
export const RAMP_SMALL = { length: 12, height: 3 } as const;
/** Big ramp template: also placed immediately before every Drop (its end coincides with the
 * drop's start), used less often than RAMP_SMALL otherwise. */
export const RAMP_BIG = { length: 18, height: 6 } as const;

export const TRACK_GEN = {
  bumpCountMin: 2, bumpCountRange: 2, bumpWidthMin: 15, bumpWidthRange: 15, bumpAmpMin: 1.95, bumpAmpRange: 3.25,
  bumpAmpStartScale: 0.35, bumpAmpFullDistance: 1200,
  iceChance: 0.5, iceLengthMin: 40, iceLengthRange: 60,
  /** 1-2 ramps guaranteed per segment: rampMin + floor(rng()*rampRange). */
  rampMin: 1, rampRange: 2, rampStartMargin: 30, rampEndMargin: 40,
  /** Minimum z-distance kept between any two ramps in the same segment. */
  rampMinGap: 40,
  /** Chance a freely-placed ramp (not the one anchored to a Drop) uses RAMP_BIG over RAMP_SMALL. */
  rampBigChance: 0.4,
  rampPlacementAttempts: 20,
  /** Ramp plank width (m): normal ramps vs. the big ramp anchored before a Drop. */
  rampWidth: 6, rampBigWidth: 12,
  /** Guide coins placed before each ramp, at the ramp's x, to show players where to aim. */
  rampGuideCoins: 3, rampGuideCoinLead: 20, rampGuideCoinSpacing: 3,
  /** No drops before this z (segments 0/1 stay drop-free). */
  dropMinZ: 400,
  dropChance: 0.6,
  dropDepthMin: 15, dropDepthRange: 10, dropLength: 20,
  dropStartMargin: 40, dropEndMargin: 60,
  coinLines: 2, coinsPerLineMin: 5, coinsPerLineRange: 4, coinXMargin: 2, coinSpacing: 1.5, coinLineStartMargin: 5, coinLineEndMargin: 20,
  archCoins: 7, archStartOffset: 4, archSpacing: 2.5, archLiftBase: 2, archLiftAmp: 4,
  obstacleBase: 3, obstaclePerMeters: 400, obstacleMax: 14, obstacleAttemptsPerSlot: 10,
  rampExclusionBefore: 3, rampExclusionAfter: 6,
  boostChance: 0.8, boostSecondChance: 0.5, boostLength: 6, boostWidth: 5,
  boostFirstZ: 60, boostMinGapFromRamp: 4,
  boostIceBandMargin: 3, boostRampPreOffsetMul: 2, boostZoneMargin: 20,
  decorBankMin: 16, decorBankMax: 22, pineMin: 12, pineRange: 8,
  buildingMin: 4, buildingRange: 2, buildingHeightMin: 8, buildingHeightRange: 17,
  stalactiteMin: 6, stalactiteRange: 4, stalactiteYMin: 7, stalactiteYRange: 2,
  decorScaleMin: 0.7, decorScaleRange: 0.9,
  /** Distant cliff decor, both banks, every zone: 3-4 per side, |x| in
   * [cliffXMin, cliffXMin+cliffXRange], height (scale) in [cliffHeightMin, cliffHeightMin+cliffHeightRange]. */
  cliffPerSideMin: 3, cliffPerSideRange: 2,
  cliffXMin: 30, cliffXRange: 10,
  cliffHeightMin: 15, cliffHeightRange: 15,
  /** Volcano zone decor: palms on both banks (like forest pines) and a couple of temple blocks
   * per side, further out than the palms. */
  palmMin: 8, palmRange: 6,
  templePerSide: 2, templeXOffset: 4, templeHeightMin: 6, templeHeightRange: 6,
  /** Track width (m) varies per segment: widthEnd is uniform in [widthMin, widthMax]; a
   * segment's widthStart is the previous segment's widthEnd (segment 0 starts at TRACK_WIDTH). */
  widthMin: 20, widthMax: 36,
  /** Two-lane split sections: a centre wall (kind 'wall', x=0, every splitWallSpacing) divides
   * the track into a left lane (coins) and a right lane (a small ramp + ice). */
  splitChance: 0, splitMinZ: 300, splitLenMin: 60, splitLenRange: 60,
  splitGapHalf: 3, splitWallSpacing: 6,
  /** Margin (m) kept between a split span and its segment's own z0/z1 when choosing where to
   * place it. */
  splitMargin: 30,
  /** Left-lane split coin lines: how far past the span's own z0 the first line starts, and how
   * many coins each of the two lines has. */
  splitCoinLead: 10, splitCoinsPerLine: 8,
  /** Half-pipes: heightAt curves up parabolically toward the walls (see pipeHeight), blended in
   * and out over pipeBlend metres at each end so entry/exit isn't a hard step. */
  pipeChance: 0.3, pipeMinZ: 200, pipeLenMin: 40, pipeLenRange: 40,
  pipeWallHeight: 6, pipeBlend: 10,
  /** Margin (m) kept between a pipe span and its segment's own z0/z1 when choosing where to
   * place it. */
  pipeMargin: 20,
  /** Multi-height route sections (routes §1): lanes at different heights (ridge +ridgeHeight,
   * ground 0, pillars over a hazard floor at -hazardDepth with pillar tops at +pillarTop).
   * The entry is a routeEntryStep-metre step (a wall from the front); the exit blends back to 0
   * over routeExitBlend metres. A big entry ramp sits routeEntryRampLead before the section at
   * the ridge lane's centre. */
  routeChance: 0.4, routeMinZ: 400, routeLenMin: 100, routeLenRange: 60, routeMargin: 20,
  ridgeHeight: 4, hazardDepth: 6, pillarTop: 2, pillarRadius: 6, pillarSpacing: 28, pillarFirstOffset: 22,
  /** Ridge lanes rise over an incline of routeRidgeRamp metres (drive up if you are already in the
   * lane); other lanes step over routeEntryStep. A small launch ramp sits routeEntryRampLead before
   * the section in the pillars lane so the first pillar is reached by a jump. */
  routeEntryStep: 1, routeRidgeRamp: 12, routeExitBlend: 12, routeEntryRampLead: 14, routeEntryRampWidth: 5,
  /** Pillar ramps end at the pillar's far edge: z = pillar.z + pillarRadius - RAMP_SMALL.length. */
  pillarRampWidth: 5, pillarRampOffset: 6 - 12, ridgeCoinMul: 3, ridgeCoinSpacing: 1.5, pillarCoins: 3, pillarCoinSpacing: 1.5,
  narrowLayoutWidth: 24,
  /** No drop may end, and no big free ramp may start, within this many metres before a route
   * section: a launch from either sails clean over the whole section. */
  routeApproachClear: 150,
  /** Narrow elevated slider sections (art §2): widthAt narrows from the track's normal width to
   * sliderWidth (and heightAt rises by sliderHeight) over sliderBlend metres at each end. No
   * slider when the segment already has a route section. Own salted rng stream, decided right
   * after the route block so every later feature can avoid its span the way they avoid a route. */
  sliderChance: 0.15, sliderChanceArt: 0.6, sliderMinZ: 800,
  sliderLenMin: 80, sliderLenRange: 60, sliderMargin: 20,
  sliderWidth: 6, sliderHeight: 3, sliderBlend: 20, sliderEdgeFall: 3,
  sliderCoinSpacing: 3, sliderPadOffset: 25,
  /** Desert dune/pyramid decor (art §1): dunes on both banks (duneCountMin..+duneCountRange per
   * side), a pyramid per side with pyramidChance probability. Space has no decor at all. */
  duneCountMin: 2, duneCountRange: 2, duneXMin: 50, duneXRange: 90, duneScaleMin: 10, duneScaleRange: 20,
  pyramidChance: 0.4, pyramidXMin: 60, pyramidXRange: 30, pyramidScaleMin: 20, pyramidScaleRange: 15,
  /** Canyon jump (canyon design §2): a RouteSection (canyon: true) with a single full-width
   * `pillars` lane and no pillars, spanning a gap [canyonGapMin, canyonGapMin+canyonGapRange)
   * metres long. Appears from canyonMinZ on, in a segment with no route/slider yet, at
   * canyonChance. A RAMP_BIG entry ramp (canyonRampWidth wide, x=0) ends 1 m before the gap; an
   * arc of coins (canyonCoinSpacing apart, peaking at canyonCoinLift) spans the whole gap. */
  canyonMinZ: 1000, canyonChance: 0.25, canyonGapMin: 22, canyonGapRange: 8,
  canyonRampWidth: 10, canyonCoinSpacing: 3, canyonCoinLift: 5,
  /** Consecutive jump ramps ("stairs", canyon design §3): stairsCount RAMP_SMALL ramps,
   * stairsSpacing metres apart, stairsRampWidth wide, x=0, in a segment with no route (which
   * covers canyon too) and no slider. Reduces the free-ramp loop's own target count by
   * stairsCount so a stairs segment doesn't also get 1-2 extra free ramps piled on top. */
  stairsMinZ: 400, stairsChance: 0.2, stairsCount: 3, stairsSpacing: 28, stairsRampWidth: 8,
} as const;

const SLOPE_START = 0.12;
const SLOPE_END = 0.05;
const SLOPE_FLATTEN_DIST = 3000;
export const SLOPE_STEP = 0.1;
export const MAX_SLOPE = 1.5;
export const CORRIDOR_HALF = 2.5;

/** Curved-track world bend (design doc §1): the centerline drifts left/right as two summed sine
 * waves, faded in from z=0 over `fadeIn` metres so the launch pad stays straight. Named constants
 * are also embedded (as GLSL literals) in render/bend.ts's vertex-shader bend, which must match. */
export const TRACK_BEND = { amp1: 10, wave1: 260, amp2: 4, wave2: 95, fadeIn: 150, zoneBlend: 100 } as const;
/** Half-step (m) for centerSlopeAt's central numeric difference. */
const CENTER_SLOPE_STEP = 0.5;
const OBSTACLE_MARGIN_X = 1;
const FIRST_OBSTACLE_Z = 40;
/** City buildings sit decorBankMin + this many metres from the centerline. */
const BUILDING_X_OFFSET = 3;
/** Fraction of the even z-spacing step that an evenly-stepped decor row (buildings, cliffs) may
 * jitter its position by. */
const EVEN_SPACING_JITTER_FRAC = 0.3;

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(seed: number, index: number): number {
  return (Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) + Math.imul(index + 1, 0xc2b2ae35)) >>> 0;
}

/** Segment `index`'s widthEnd, drawn from its own salted rng stream (independent of the shared
 * `rng` and of any other segment) so it can be looked up for segment `index` (as its own end)
 * and for segment `index + 1` (as that segment's widthStart) without generating full segments. */
function widthEndFor(seed: number, index: number): number {
  const widthRng = mulberry32(hashSeed(seed, index) ^ 0x51ed270b);
  return TRACK_GEN.widthMin + widthRng() * (TRACK_GEN.widthMax - TRACK_GEN.widthMin);
}

function smoothstep(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

/** The two deterministic phases (radians, 0..2pi) `centerAt`/`centerSlopeAt` use, salted from the
 * track's seed with index -1 (distinct from every segment index, which is always >= 0). */
export function bendPhases(seed: number): [number, number] {
  const rng = mulberry32(hashSeed(seed, -1));
  return [rng() * 2 * Math.PI, rng() * 2 * Math.PI];
}

/** Per-zone bend-strength multiplier (canyon design §1): each zone's `bendMul` is blended in from
 * the previous zone's over TRACK_BEND.zoneBlend metres past the zone's own z0 (smoothstep), so
 * the curve amplitude eases into a new zone's character instead of snapping. The first zone (no
 * previous zone) keeps its own multiplier throughout. Must match the GLSL bendMulAt in
 * render/bend.ts exactly (embedded there as a literal table generated from ZONES). */
export function bendMulAt(z: number): number {
  const zone = zoneAt(z);
  const idx = zoneIndex(zone.id);
  if (idx <= 0) return zone.bendMul;
  const prev = ZONES[idx - 1];
  const t = (z - zone.z0) / TRACK_BEND.zoneBlend;
  return prev.bendMul + (zone.bendMul - prev.bendMul) * smoothstep(t);
}

/** Lateral centerline offset at `z` (design doc §1): a fade-in (smoothstep over
 * TRACK_BEND.fadeIn) times the sum of two sine waves at their own wavelength/phase, scaled by the
 * current zone's bend multiplier (canyon design §1). 0 before the launch pad (z < 0). */
function centerAtPhases(z: number, phases: readonly [number, number]): number {
  if (z <= 0) return 0;
  const fade = smoothstep(z / TRACK_BEND.fadeIn);
  const [p1, p2] = phases;
  return bendMulAt(z) * fade * (
    TRACK_BEND.amp1 * Math.sin((2 * Math.PI * z) / TRACK_BEND.wave1 + p1)
    + TRACK_BEND.amp2 * Math.sin((2 * Math.PI * z) / TRACK_BEND.wave2 + p2)
  );
}

/** Track width at `z`, smoothstep-interpolated between a segment's widthStart/widthEnd. Shared
 * by generateSegment (which needs it live, before the segment object exists) and createTrack's
 * public widthAt (which reads it back off the cached Segment). */
function widthAtInSegment(z0: number, z1: number, widthStart: number, widthEnd: number, z: number): number {
  return widthStart + (widthEnd - widthStart) * smoothstep((z - z0) / (z1 - z0));
}

export function baseSlope(z: number): number {
  if (z < 0) return -SLOPE_START;
  if (z >= SLOPE_FLATTEN_DIST) return -SLOPE_END;
  return -(SLOPE_START - ((SLOPE_START - SLOPE_END) * z) / SLOPE_FLATTEN_DIST);
}

export function baseHeight(z: number): number {
  if (z < 0) return -SLOPE_START * z;
  if (z < SLOPE_FLATTEN_DIST) {
    const h = -(SLOPE_START * z - ((SLOPE_START - SLOPE_END) * z * z) / (2 * SLOPE_FLATTEN_DIST));
    return h === 0 ? 0 : h;
  }
  return baseHeight(SLOPE_FLATTEN_DIST - 1e-9) - SLOPE_END * (z - SLOPE_FLATTEN_DIST);
}

function bumpHeight(b: Bump, z: number): number {
  const d = Math.abs(z - b.z);
  if (d >= b.width) return 0;
  return b.amp * 0.5 * (1 + Math.cos((Math.PI * d) / b.width));
}

/** Ramp height contribution: only on the ramp's own lane (|x - r.x| <= r.width/2); off to the
 * side it's flat ground, same as before or after the ramp's z span. */
function rampHeight(r: Ramp, z: number, x: number): number {
  if (z < r.z || z >= r.z + r.length) return 0;
  if (Math.abs(x - r.x) > r.width / 2) return 0;
  return (r.height * (z - r.z)) / r.length;
}

/** Half-pipe height contribution: a parabolic cross-section (0 at x=0, wallHeight at the rim,
 * halfWidth = widthAt(z)/2), blended 0 -> 1 over pipeBlend metres at both ends of the span so
 * entry/exit is a ramp, not a step. */
function pipeHeight(p: Segment['pipes'][number], z: number, x: number, halfWidth: number): number {
  if (z < p.z0 || z > p.z1 || halfWidth <= 0) return 0;
  const blend = Math.min(1, (z - p.z0) / TRACK_GEN.pipeBlend, (p.z1 - z) / TRACK_GEN.pipeBlend);
  return p.wallHeight * (x / halfWidth) ** 2 * blend;
}

/** Lane containing x (clamped to the nearest lane outside the partition). */
function laneFor(route: RouteSection, x: number): Lane {
  // Half-open intervals so a boundary x (e.g. x = 0 in a two-lane layout) belongs to one lane only.
  for (const lane of route.lanes) if (x >= lane.xMin && x < lane.xMax) return lane;
  const first = route.lanes[0];
  return x < first.xMin ? first : route.lanes[route.lanes.length - 1];
}

function pillarAt(route: RouteSection, z: number, x: number): Pillar | null {
  for (const p of route.pillars) {
    const dx = x - p.x;
    const dz = z - p.z;
    if (dx * dx + dz * dz <= p.radius * p.radius) return p;
  }
  return null;
}

/** Route-section height contribution: the lane's yOffset (pillars lane: the hazard floor, or the
 * pillar top when over a pillar), stepping up over routeEntryStep at z0 and blending back to 0
 * over routeExitBlend before z1. */
function routeHeight(route: RouteSection, z: number, x: number): number {
  if (z < route.z0 || z > route.z1 || route.lanes.length === 0) return 0;
  const lane = laneFor(route, x);
  let off = lane.yOffset;
  if (lane.kind === 'pillars') {
    const pillar = pillarAt(route, z, x);
    off = pillar ? pillar.yOffset : lane.yOffset;
  }
  const entryLen = lane.kind === 'ridge' ? TRACK_GEN.routeRidgeRamp : TRACK_GEN.routeEntryStep;
  const entry = Math.min(1, Math.max(0, (z - route.z0) / entryLen));
  const exit = 1 - Math.min(1, Math.max(0, (z - (route.z1 - TRACK_GEN.routeExitBlend)) / TRACK_GEN.routeExitBlend));
  return off * entry * exit;
}

/** Entry/exit smoothstep blend for a slider span: 0 at z0/z1, 1 for the plateau between
 * z0+sliderBlend and z1-sliderBlend, mirroring widthAt's own narrowing so the elevated deck and
 * the narrowed track line up. */
function sliderBlend(slider: Slider, z: number): number {
  const entry = smoothstep((z - slider.z0) / TRACK_GEN.sliderBlend);
  const exit = smoothstep((slider.z1 - z) / TRACK_GEN.sliderBlend);
  return entry * exit;
}

/** Slider height contribution (art §2): `sliderHeight` raised for |x| <= width/2 + 1 (blended
 * in/out via sliderBlend), falling linearly to 0 over the next sliderEdgeFall metres, 0 beyond
 * that - so the deck reads as a narrow ledge rather than a floating slab. */
function sliderHeightContribution(slider: Slider, z: number, x: number): number {
  if (z < slider.z0 || z > slider.z1) return 0;
  const half = slider.width / 2;
  const ax = Math.abs(x);
  const edgeOuter = half + 1 + TRACK_GEN.sliderEdgeFall;
  if (ax >= edgeOuter) return 0;
  const edge = ax <= half + 1 ? 1 : 1 - (ax - (half + 1)) / TRACK_GEN.sliderEdgeFall;
  return slider.yOffset * sliderBlend(slider, z) * edge;
}

function localHeight(seg: Segment, z: number, x: number): number {
  let h = 0;
  if (seg.route) h += routeHeight(seg.route, z, x);
  if (seg.slider) h += sliderHeightContribution(seg.slider, z, x);
  for (const b of seg.bumps) h += bumpHeight(b, z);
  for (const r of seg.ramps) h += rampHeight(r, z, x);
  if (seg.pipes.length > 0) {
    const halfWidth = widthAtInSegment(seg.z0, seg.z1, seg.widthStart, seg.widthEnd, z) / 2;
    for (const p of seg.pipes) h += pipeHeight(p, z, x, halfWidth);
  }
  return h;
}

const OBSTACLE_RADIUS: Record<ObstacleKind, number> = {
  tree: 0.8, rock: 1.0, snowman: 0.7,
  stump: 0.7, car: 1.3, bus: 2.2, sign: 0.5, barrier: 1.2, stalagmite: 0.8, crystal: 0.9,
  hay: 0.9, crate: 0.7, fence: 1.5, wall: 1.6, totem: 0.8, palm: 0.7,
  cactus: 0.6, asteroid: 1.0, satellite: 0.9,
};

/** Whether hitting this obstacle kind breaks it (see physics.ts collision handling) rather than
 * causing a hard stun-and-bounce collision. */
export const OBSTACLE_BREAKABLE: Record<ObstacleKind, boolean> = {
  tree: false, rock: false, snowman: true,
  stump: true, car: false, bus: false, sign: true, barrier: true, stalagmite: false, crystal: false,
  hay: true, crate: true, fence: true, wall: false, totem: false, palm: false,
  cactus: false, asteroid: false, satellite: true,
};

function generateSegment(seed: number, index: number): Segment {
  const rng = mulberry32(hashSeed(seed, index));
  const z0 = index * SEGMENT_LENGTH;
  const z1 = z0 + SEGMENT_LENGTH;
  const zone = zoneAt(z0);

  // Width varies per segment (terrain §4): widthEnd comes from its own salted rng stream (so it
  // never touches the shared `rng` order), computed up front so every x-range drawn below can
  // call widthAt(z) live. widthStart is simply the previous segment's widthEnd, looked up the
  // same way (no need to generate segment index-1 itself).
  const widthStart = index === 0 ? TRACK_WIDTH : widthEndFor(seed, index - 1);
  const widthEnd = widthEndFor(seed, index);
  const widthAt = (z: number): number => widthAtInSegment(z0, z1, widthStart, widthEnd, z);

  const bumps: Bump[] = [];
  const bumpCount = TRACK_GEN.bumpCountMin + Math.floor(rng() * TRACK_GEN.bumpCountRange);
  // Early bumps are gentler so a fresh launch doesn't stall climbing them; scale ramps up to
  // full size by bumpAmpFullDistance. This only scales the drawn value, not the rng draw itself,
  // so the draw order/count is unchanged.
  const ampScale = Math.min(1, TRACK_GEN.bumpAmpStartScale + z0 / TRACK_GEN.bumpAmpFullDistance);
  for (let i = 0; i < bumpCount; i++) {
    const width = TRACK_GEN.bumpWidthMin + rng() * TRACK_GEN.bumpWidthRange;
    const amp = (TRACK_GEN.bumpAmpMin + rng() * TRACK_GEN.bumpAmpRange) * ampScale * zone.bumpScale;
    const z = z0 + width + rng() * (SEGMENT_LENGTH - 2 * width);
    bumps.push({ z, amp, width });
  }

  const ice: IceBand[] = [];
  if (rng() < zone.iceChance) {
    const len = TRACK_GEN.iceLengthMin + rng() * TRACK_GEN.iceLengthRange;
    const start = z0 + rng() * (SEGMENT_LENGTH - len);
    ice.push({ z0: start, z1: start + len });
  }

  // Multi-height route sections (routes §1). Own salted rng stream, decided BEFORE ramps, drops
  // and pipes so those features avoid the route span (a section plus its entry ramp fills most
  // of a segment, so rejecting the route on overlap instead would almost never place one).
  // Pillar ramps and the entry ramp are collected in routeRamps and pushed to `ramps` once that
  // array exists (they boost like any ramp) with distinct id prefixes (-pr / -re) so the tests'
  // ramp-count/gap rules can tell them apart from the segment's own 1-2 ramps.
  const routeRng = mulberry32(hashSeed(seed, index) ^ 0x7f4a7c15);
  let route: RouteSection | null = null;
  const routeRamps: Ramp[] = [];
  if (z0 >= TRACK_GEN.routeMinZ && routeRng() < TRACK_GEN.routeChance) {
    const length = TRACK_GEN.routeLenMin + routeRng() * TRACK_GEN.routeLenRange;
    const lo = z0 + TRACK_GEN.routeMargin;
    const hi = z1 - TRACK_GEN.routeMargin - length;
    const layoutDraw = routeRng();
    if (hi > lo) {
      const rz0 = lo + routeRng() * (hi - lo);
      const rz1 = rz0 + length;
      {
        const w = widthAt((rz0 + rz1) / 2);
        const kinds: LaneKind[] = w < TRACK_GEN.narrowLayoutWidth
          ? ['ridge', 'ground']
          : layoutDraw < 0.5 ? ['ridge', 'ground', 'pillars'] : ['ground', 'pillars', 'ridge'];
        const laneW = w / kinds.length;
        const lanes: Lane[] = kinds.map((kind, k) => ({
          xMin: -w / 2 + k * laneW,
          xMax: -w / 2 + (k + 1) * laneW,
          yOffset: kind === 'ridge' ? TRACK_GEN.ridgeHeight : kind === 'pillars' ? -TRACK_GEN.hazardDepth : 0,
          kind,
        }));
        const pillars: Pillar[] = [];
        const pillarLane = lanes.find((l) => l.kind === 'pillars');
        if (pillarLane) {
          const laneCentre = (pillarLane.xMin + pillarLane.xMax) / 2;
          let k = 0;
          for (let pz = rz0 + TRACK_GEN.pillarFirstOffset; pz + TRACK_GEN.pillarRadius <= rz1 - TRACK_GEN.routeExitBlend; pz += TRACK_GEN.pillarSpacing) {
            const px = laneCentre;
            const rampHalf = TRACK_GEN.pillarRampWidth / 2 + 1;
            const rx = Math.max(-widthAt(pz) / 2 + rampHalf, Math.min(widthAt(pz) / 2 - rampHalf, px));
            pillars.push({ id: `${index}-p${k}`, x: px, z: pz, radius: TRACK_GEN.pillarRadius, yOffset: TRACK_GEN.pillarTop });
            routeRamps.push({
              id: `${index}-pr${k}`, z: pz + TRACK_GEN.pillarRampOffset, length: RAMP_SMALL.length, height: RAMP_SMALL.height,
              x: rx, width: TRACK_GEN.pillarRampWidth,
            });
            k++;
          }
        }
        if (pillarLane) {
          const ez = rz0 - TRACK_GEN.routeEntryRampLead;
          // Keep the plank inside the (possibly narrower) track at its own z.
          const entryHalf = TRACK_GEN.routeEntryRampWidth / 2 + 1;
          const ex = Math.max(-widthAt(ez) / 2 + entryHalf, Math.min(widthAt(ez) / 2 - entryHalf, (pillarLane.xMin + pillarLane.xMax) / 2));
          routeRamps.push({
            id: `${index}-re`, z: ez, length: RAMP_SMALL.length, height: RAMP_SMALL.height,
            x: ex, width: TRACK_GEN.routeEntryRampWidth,
          });
        }
        route = { z0: rz0, z1: rz1, lanes, pillars, hazard: zone.id === 'volcano' ? 'lava' : 'chasm' };
      }
    }
  }

  // Canyon jump (canyon design §2): only when no multi-lane route landed above, own salted rng
  // stream so it never perturbs any other draw. Reuses RouteSection (canyon: true) so every
  // later feature (drops, free ramps, pipes, pads, obstacles, coin lines) avoids it via the same
  // inRouteSpan/inRouteApproach rules defined just below, automatically.
  const canyonRng = mulberry32(hashSeed(seed, index) ^ 0x3c9e0d41);
  if (route === null && z0 >= TRACK_GEN.canyonMinZ && canyonRng() < TRACK_GEN.canyonChance) {
    const gap = TRACK_GEN.canyonGapMin + canyonRng() * TRACK_GEN.canyonGapRange;
    const lo = z0 + 40;
    const hi = z1 - 40 - gap;
    if (hi > lo) {
      const cz0 = lo + canyonRng() * (hi - lo);
      const cz1 = cz0 + gap;
      const w = widthAt(cz0);
      const lane: Lane = { xMin: -w / 2, xMax: w / 2, yOffset: -TRACK_GEN.hazardDepth, kind: 'pillars' };
      route = { z0: cz0, z1: cz1, lanes: [lane], pillars: [], hazard: zone.id === 'volcano' ? 'lava' : 'chasm', canyon: true };
      // No normal route entry ramp (-re): a big ramp instead, ending 1 m before the gap's edge.
      routeRamps.push({
        id: `${index}-cr`, z: cz0 - RAMP_BIG.length - 1, length: RAMP_BIG.length, height: RAMP_BIG.height,
        x: 0, width: TRACK_GEN.canyonRampWidth,
      });
    }
  }

  const inRouteSpan = (z: number): boolean => route !== null
    && z >= route.z0 - TRACK_GEN.routeEntryRampLead - TRACK_GEN.rampExclusionBefore
    && z <= route.z1 + TRACK_GEN.rampExclusionAfter;
  const inRouteApproach = (z: number): boolean => route !== null
    && z >= route.z0 - TRACK_GEN.routeApproachClear && z <= route.z1;
  // Bumps overlapping a route section are removed (their rng draws already happened, so nothing
  // shifts): at speed a crest launches the sled clean over the lanes, which defeats the choice.
  if (route !== null) {
    const keep = bumps.filter((b) => b.z + b.width < route.z0 - TRACK_GEN.routeEntryRampLead || b.z - b.width > route.z1);
    bumps.length = 0;
    bumps.push(...keep);
  }

  // Narrow elevated slider sections (art §2). Own salted rng stream, decided right after the
  // route block: no slider when this segment already has a route section. Every later feature
  // (drops, free ramps, pipes, pads, obstacles, coin lines) rejects overlap via inSliderSpan the
  // same way they already reject overlap with a route via inRouteSpan; bumps and ice bands were
  // already drawn from the shared `rng` above (before this span is known), so any that overlap
  // are trimmed here instead, the same way bumps are trimmed for a route just above.
  const sliderRng = mulberry32(hashSeed(seed, index) ^ 0x51ad3e77);
  let slider: Slider | null = null;
  if (route === null && z0 >= TRACK_GEN.sliderMinZ) {
    const sliderChance = zone.id === 'desert' || zone.id === 'space' ? TRACK_GEN.sliderChanceArt : TRACK_GEN.sliderChance;
    if (sliderRng() < sliderChance) {
      const length = TRACK_GEN.sliderLenMin + sliderRng() * TRACK_GEN.sliderLenRange;
      const lo = z0 + TRACK_GEN.sliderMargin;
      const hi = z1 - TRACK_GEN.sliderMargin - length;
      if (hi > lo) {
        const sz0 = lo + sliderRng() * (hi - lo);
        slider = { z0: sz0, z1: sz0 + length, width: TRACK_GEN.sliderWidth, yOffset: TRACK_GEN.sliderHeight };
      }
    }
  }
  const inSliderSpan = (z: number): boolean => slider !== null
    && z >= slider.z0 - TRACK_GEN.rampExclusionBefore && z <= slider.z1 + TRACK_GEN.rampExclusionAfter;
  if (slider !== null) {
    const keepBumps = bumps.filter((b) => b.z + b.width < slider!.z0 - TRACK_GEN.rampExclusionBefore || b.z - b.width > slider!.z1 + TRACK_GEN.rampExclusionAfter);
    bumps.length = 0;
    bumps.push(...keepBumps);
    const keepIce = ice.filter((b) => b.z1 < slider!.z0 - TRACK_GEN.rampExclusionBefore || b.z0 > slider!.z1 + TRACK_GEN.rampExclusionAfter);
    ice.length = 0;
    ice.push(...keepIce);
  }

  // Ramps and drops. A drop's companion big ramp (added first, if a drop is rolled) counts
  // toward the segment's 1-2 ramps; any further ramps are drawn small/big at rampBigChance and
  // kept at least rampMinGap apart from every ramp already placed (including the drop's).
  // Ramp x/width is drawn from its own salted rng stream so the shared `rng` sequence (big/rz
  // draws below, and everything drawn from `rng` after the ramp loop) is unaffected by adding
  // this feature - only the accepted ramps consume a draw, keeping generation deterministic and
  // pre-existing draws byte-for-byte unchanged.
  const rampXRng = mulberry32(hashSeed(seed, index) ^ 0x1b873593);
  const rampX = (width: number, z: number): number => {
    const w = widthAt(z);
    const lo = -w / 2 + width / 2 + 1;
    const hi = w / 2 - width / 2 - 1;
    return lo + rampXRng() * (hi - lo);
  };

  const ramps: Ramp[] = [...routeRamps];
  const drops: Drop[] = [];
  let rampCounter = 0;
  if (z0 >= TRACK_GEN.dropMinZ && rng() < TRACK_GEN.dropChance) {
    const dz = z0 + TRACK_GEN.dropStartMargin
      + rng() * (SEGMENT_LENGTH - TRACK_GEN.dropStartMargin - TRACK_GEN.dropEndMargin);
    const depth = TRACK_GEN.dropDepthMin + rng() * TRACK_GEN.dropDepthRange;
    const dropClearOfRoute = !inRouteSpan(dz - RAMP_BIG.length) && !inRouteSpan(dz + TRACK_GEN.dropLength)
      && !inRouteApproach(dz + TRACK_GEN.dropLength)
      && !inSliderSpan(dz - RAMP_BIG.length) && !inSliderSpan(dz + TRACK_GEN.dropLength);
    if (dropClearOfRoute) drops.push({ z: dz, depth, length: TRACK_GEN.dropLength });
    // Big drop ramps are centred (x=0) so the drop line-up is fair regardless of who's aiming.
    if (dropClearOfRoute) ramps.push({
      id: `${index}-r${rampCounter++}`, z: dz - RAMP_BIG.length, length: RAMP_BIG.length, height: RAMP_BIG.height,
      x: 0, width: TRACK_GEN.rampBigWidth,
    });
  }

  // Consecutive jump ramps ("stairs", canyon design §3). Own salted rng stream; only when this
  // segment has no route (which covers canyon too, since canyon sets `route`) and no slider.
  // Checked against the drop decided just above (same span-overlap style as the free-ramp loop
  // below); a half-pipe decided later avoids every existing ramp via its own overlap check, so
  // mutual exclusion with a pipe holds from that side. Pushed straight into `ramps` so the
  // existing arch-coin/guide-coin generation and obstacle avoidance (both keyed off `ramps`)
  // already cover it, same as any other ramp.
  const stairsRng = mulberry32(hashSeed(seed, index) ^ 0x6a09e667);
  let stairsPlaced = 0;
  if (route === null && slider === null && z0 >= TRACK_GEN.stairsMinZ && stairsRng() < TRACK_GEN.stairsChance) {
    const span = 2 * TRACK_GEN.stairsSpacing + RAMP_SMALL.length;
    const lo = z0 + 30;
    const hi = z1 - 30 - span;
    if (hi > lo) {
      const firstZ = lo + stairsRng() * (hi - lo);
      const overlapsDrop = drops.some(
        (d) => firstZ < d.z + d.length + TRACK_GEN.rampExclusionAfter
          && firstZ + span > d.z - RAMP_BIG.length - TRACK_GEN.rampExclusionBefore,
      );
      if (!overlapsDrop) {
        for (let k = 0; k < TRACK_GEN.stairsCount; k++) {
          ramps.push({
            id: `${index}-rs${k}`, z: firstZ + k * TRACK_GEN.stairsSpacing, length: RAMP_SMALL.length, height: RAMP_SMALL.height,
            x: 0, width: TRACK_GEN.stairsRampWidth,
          });
        }
        stairsPlaced = TRACK_GEN.stairsCount;
      }
    }
  }

  const rampCount = Math.max(0, TRACK_GEN.rampMin + Math.floor(rng() * TRACK_GEN.rampRange) - stairsPlaced);
  const rampSpanLo = z0 + TRACK_GEN.rampStartMargin;
  const rampSpanHi = z1 - TRACK_GEN.rampEndMargin;
  const routeRampCount = routeRamps.length;
  for (let attempt = 0; ramps.length - routeRampCount < rampCount && attempt < TRACK_GEN.rampPlacementAttempts; attempt++) {
    const big = rng() < TRACK_GEN.rampBigChance;
    const template = big ? RAMP_BIG : RAMP_SMALL;
    const rz = rampSpanLo + rng() * (rampSpanHi - rampSpanLo);
    if (ramps.some((r) => Math.abs(rz - r.z) < TRACK_GEN.rampMinGap)) continue;
    if (inRouteSpan(rz) || inRouteSpan(rz + template.length)) continue;
    if (inSliderSpan(rz) || inSliderSpan(rz + template.length)) continue;
    if (big && inRouteApproach(rz)) continue;
    const width = big ? TRACK_GEN.rampBigWidth : TRACK_GEN.rampWidth;
    ramps.push({
      id: `${index}-r${rampCounter++}`, z: rz, length: template.length, height: template.height,
      x: rampX(width, rz), width,
    });
  }

  // Two-lane split sections (terrain §4 second half). Drawn from its own salted rng stream (so
  // the shared `rng` order is unaffected) once ramps/drops are finalised, since the span must
  // reject any overlap with either. Left lane (x<0) gets coin lines; right lane (x>0) gets a
  // small ramp and an ice band; a centre wall (x=0) divides them the whole span.
  const splitRng = mulberry32(hashSeed(seed, index) ^ 0x2545f491);
  let split: Segment['split'] = null;
  if (z0 >= TRACK_GEN.splitMinZ && splitRng() < TRACK_GEN.splitChance) {
    const length = TRACK_GEN.splitLenMin + splitRng() * TRACK_GEN.splitLenRange;
    const lo = z0 + TRACK_GEN.splitMargin;
    const hi = z1 - TRACK_GEN.splitMargin - length;
    if (hi > lo) {
      const sz0 = lo + splitRng() * (hi - lo);
      const sz1 = sz0 + length;
      const overlapsRamp = ramps.some(
        (r) => sz0 < r.z + r.length + TRACK_GEN.rampExclusionAfter && sz1 > r.z - TRACK_GEN.rampExclusionBefore,
      );
      const overlapsDrop = drops.some(
        (d) => sz0 < d.z + d.length + TRACK_GEN.rampExclusionAfter
          && sz1 > d.z - RAMP_BIG.length - TRACK_GEN.rampExclusionBefore,
      );
      if (!overlapsRamp && !overlapsDrop) split = { z0: sz0, z1: sz1, gapHalf: TRACK_GEN.splitGapHalf };
    }
  }
  const splitWalls: Obstacle[] = [];
  if (split) {
    const splitW = widthAt(split.z0);
    // Centre wall, every splitWallSpacing from z0 to z1.
    let wallCount = 0;
    for (let wz = split.z0; wz <= split.z1; wz += TRACK_GEN.splitWallSpacing) {
      splitWalls.push({ id: `${index}-w${wallCount++}`, kind: 'wall', x: 0, z: wz, r: OBSTACLE_RADIUS.wall });
    }
    // Right lane: a small ramp (its own guide/arch coins are added below with every other ramp)
    // plus an ice band spanning the whole split.
    const rightX = splitW / 4;
    const rampZ = split.z0 + (split.z1 - split.z0) / 2 - RAMP_SMALL.length / 2;
    ramps.push({
      id: `${index}-rs0`, z: rampZ, length: RAMP_SMALL.length, height: RAMP_SMALL.height,
      x: rightX, width: TRACK_GEN.rampWidth,
    });
    ice.push({ z0: split.z0, z1: split.z1 });
  }

  // Half-pipes (terrain §5). Own salted rng stream, placed after ramps/drops/split are finalised
  // so overlap with any of them can be rejected outright (single attempt, like splits - no split
  // exists there either).
  const pipeRng = mulberry32(hashSeed(seed, index) ^ 0x38b34ae5);
  const pipes: Segment['pipes'] = [];
  if (z0 >= TRACK_GEN.pipeMinZ && pipeRng() < TRACK_GEN.pipeChance * zone.pipeChanceMul) {
    const length = TRACK_GEN.pipeLenMin + pipeRng() * TRACK_GEN.pipeLenRange;
    const lo = z0 + TRACK_GEN.pipeMargin;
    const hi = z1 - TRACK_GEN.pipeMargin - length;
    if (hi > lo) {
      const pz0 = lo + pipeRng() * (hi - lo);
      const pz1 = pz0 + length;
      const overlapsRamp = ramps.some(
        (r) => pz0 < r.z + r.length + TRACK_GEN.rampExclusionAfter && pz1 > r.z - TRACK_GEN.rampExclusionBefore,
      );
      const overlapsDrop = drops.some(
        (d) => pz0 < d.z + d.length + TRACK_GEN.rampExclusionAfter
          && pz1 > d.z - RAMP_BIG.length - TRACK_GEN.rampExclusionBefore,
      );
      const overlapsSplit = split !== null && pz0 < split.z1 && pz1 > split.z0;
      const overlapsRoute = inRouteSpan(pz0) || inRouteSpan(pz1) || (route !== null && pz0 < route.z0 && pz1 > route.z1);
      const overlapsSlider = inSliderSpan(pz0) || inSliderSpan(pz1) || (slider !== null && pz0 < slider.z0 && pz1 > slider.z1);
      if (!overlapsRamp && !overlapsDrop && !overlapsSplit && !overlapsRoute && !overlapsSlider) {
        pipes.push({ z0: pz0, z1: pz1, wallHeight: TRACK_GEN.pipeWallHeight });
      }
    }
  }

  // Boost pads are drawn from their OWN rng stream (hashSeed salted, not the shared `rng`
  // used above/below), never from `rng` itself. That is deliberate: the brief requires every
  // pre-existing feature (bumps/ice/ramps/corridorX/obstacles/coins) to draw byte-for-byte the
  // same values for a given seed as before this feature existed. Simply appending pad draws to
  // the shared `rng` sequence — wherever they'd go — would shift every draw that follows them,
  // so pads get an independent generator instead. That also lets us resolve pad positions here,
  // before the obstacle loop below, so obstacles can avoid overlapping a pad without perturbing
  // `rng` (obstacle x/z/kind draws are unaffected; only whether a candidate is accepted changes,
  // and only for candidates that actually land on a pad).
  const padRng = mulberry32(hashSeed(seed, index) ^ 0x6d2b79f5);
  const boosts: BoostPad[] = [];
  const boostLength = TRACK_GEN.boostLength;
  const boostWidth = TRACK_GEN.boostWidth;
  const overlapsRamp = (z: number): boolean => ramps.some(
    (r) => z < r.z + r.length + TRACK_GEN.boostMinGapFromRamp && z + boostLength > r.z - TRACK_GEN.boostMinGapFromRamp,
  );
  const overlapsDrop = (z: number): boolean => drops.some(
    (d) => z < d.z + d.length + TRACK_GEN.rampExclusionAfter
      && z + boostLength > d.z - RAMP_BIG.length - TRACK_GEN.rampExclusionBefore,
  );
  const tryAddPad = (z: number, k: number): void => {
    if (z < TRACK_GEN.boostFirstZ) return;
    if (overlapsRamp(z)) return;
    if (overlapsDrop(z)) return;
    if (inRouteSpan(z) || inRouteSpan(z + boostLength)) return;
    if (inSliderSpan(z) || inSliderSpan(z + boostLength)) return;
    if (boosts.some((b) => z < b.z + b.length && z + boostLength > b.z)) return;
    const w = widthAt(z);
    const xMin = -w / 2 + boostWidth / 2 + 1;
    const xMax = w / 2 - boostWidth / 2 - 1;
    const x = xMin + padRng() * (xMax - xMin);
    boosts.push({ id: `${index}-b${k}`, x, z, length: boostLength, width: boostWidth });
  };
  const iceMargin = TRACK_GEN.boostIceBandMargin;
  const zoneMargin = TRACK_GEN.boostZoneMargin;
  if (padRng() < zone.boostChance) {
    const band = ice[0];
    let z: number;
    if (band && band.z1 - boostLength - iceMargin >= band.z0 + iceMargin) {
      z = band.z0 + iceMargin + padRng() * (band.z1 - boostLength - iceMargin - (band.z0 + iceMargin));
    } else if (ramps.length > 0) {
      z = ramps[0].z - TRACK_GEN.boostRampPreOffsetMul * boostLength;
    } else {
      z = z0 + zoneMargin + padRng() * (z1 - zoneMargin - (z0 + zoneMargin));
    }
    tryAddPad(z, 0);
    if (boosts.length > 0 && padRng() < TRACK_GEN.boostSecondChance) {
      const z2 = z0 + zoneMargin + padRng() * (z1 - zoneMargin - (z0 + zoneMargin));
      tryAddPad(z2, 1);
    }
  }

  // Uniform across the full width at the segment's midpoint (not a narrow band): (rng()-0.5) in
  // [-0.5,0.5] * widthAt(mid). Still exactly one rng() call, same position in the draw order as
  // before width existed - only the multiplier changed (was the nominal TRACK_WIDTH).
  // When this segment has a split, the drawn value is remapped (not redrawn - the shared rng
  // draw itself is unchanged) into whichever lane its sign already pointed at, so the corridor
  // rule still guarantees one clear lane through the split instead of straddling the centre wall.
  const rawCorridorX = (rng() - 0.5) * widthAt(z0 + SEGMENT_LENGTH / 2);
  const corridorX = ((): number => {
    if (!split) return rawCorridorX;
    const w = widthAt(split.z0);
    const laneMargin = split.gapHalf + 2;
    const laneOuter = w / 2 - 1;
    return rawCorridorX >= 0
      ? Math.min(Math.max(rawCorridorX, laneMargin), laneOuter)
      : Math.max(Math.min(rawCorridorX, -laneMargin), -laneOuter);
  })();
  const obstacles: Obstacle[] = [];
  const count = Math.min(
    TRACK_GEN.obstacleMax,
    Math.round((TRACK_GEN.obstacleBase + Math.floor(z0 / TRACK_GEN.obstaclePerMeters)) * zone.obstacleDensityMul),
  );
  const zMin = Math.max(z0 + 10, FIRST_OBSTACLE_Z);
  const zMax = z1 - 5;
  const obstacleAttempts = count * TRACK_GEN.obstacleAttemptsPerSlot;
  for (let attempt = 0; attempt < obstacleAttempts && obstacles.length < count; attempt++) {
    const z = zMin + rng() * (zMax - zMin);
    const halfX = widthAt(z) / 2 - OBSTACLE_MARGIN_X;
    const x = (rng() * 2 - 1) * halfX;
    const kind = zone.obstacleKinds[Math.floor(rng() * zone.obstacleKinds.length)];
    if (Math.abs(x - corridorX) < CORRIDOR_HALF) continue;
    if (split && z >= split.z0 && z <= split.z1 && Math.abs(x) < split.gapHalf + 2) continue;
    if (ramps.some((r) => z >= r.z - TRACK_GEN.rampExclusionBefore && z <= r.z + r.length + TRACK_GEN.rampExclusionAfter)) continue;
    if (drops.some((d) => z >= d.z - RAMP_BIG.length - TRACK_GEN.rampExclusionBefore && z <= d.z + d.length + TRACK_GEN.rampExclusionAfter)) continue;
    if (inRouteSpan(z)) continue;
    if (inSliderSpan(z)) continue;
    const r = OBSTACLE_RADIUS[kind];
    if (boosts.some((b) => Math.abs(x - b.x) < b.width / 2 + r && z >= b.z - r && z <= b.z + b.length + r)) continue;
    obstacles.push({ id: `${index}-o${obstacles.length}`, kind, x, z, r });
  }
  // Split walls are appended after the density-based random obstacles so they don't count toward
  // (and don't get crowded out by) the distance-scaled obstacle budget above.
  obstacles.push(...splitWalls);

  // Ground coin lines skip any coin that would land inside a drop's span (it would float over
  // the void instead of sitting on the ground); the drop's own arch coins (below) cover that
  // stretch instead, lifted for a mid-air jump collect.
  const inDropSpan = (z: number): boolean => drops.some(
    (d) => z >= d.z - RAMP_BIG.length - TRACK_GEN.rampExclusionBefore && z <= d.z + d.length + TRACK_GEN.rampExclusionAfter,
  );
  const coins: Coin[] = [];
  for (let line = 0; line < TRACK_GEN.coinLines; line++) {
    const n = TRACK_GEN.coinsPerLineMin + Math.floor(rng() * TRACK_GEN.coinsPerLineRange);
    const startZ = z0 + TRACK_GEN.coinLineStartMargin + rng() * (SEGMENT_LENGTH - TRACK_GEN.coinLineStartMargin - TRACK_GEN.coinLineEndMargin);
    const x = (rng() * 2 - 1) * (widthAt(startZ) / 2 - TRACK_GEN.coinXMargin);
    for (let k = 0; k < n; k++) {
      const z = startZ + k * TRACK_GEN.coinSpacing;
      if (inDropSpan(z) || inRouteSpan(z) || inSliderSpan(z)) continue;
      coins.push({ id: `${index}-l${line}-${k}`, x, z, lift: 0 });
    }
  }
  ramps.forEach((r, rampIdx) => {
    if (r.id.includes('-pr')) return;
    for (let k = 0; k < TRACK_GEN.archCoins; k++) {
      coins.push({
        id: `${index}-a${rampIdx}-${k}`,
        x: 0,
        z: r.z + r.length + TRACK_GEN.archStartOffset + k * TRACK_GEN.archSpacing,
        lift: TRACK_GEN.archLiftBase + TRACK_GEN.archLiftAmp * Math.sin((Math.PI * k) / 6),
      });
    }
  });
  // Guide coins: a short line before each ramp, at the ramp's own x, showing players where to
  // aim so they land on the plank instead of skidding past it.
  let guideCount = 0;
  for (const r of ramps) {
    if (r.id.includes('-pr')) continue;
    for (let k = 0; k < TRACK_GEN.rampGuideCoins; k++) {
      coins.push({
        id: `${index}-g${guideCount++}`,
        x: r.x,
        z: r.z - TRACK_GEN.rampGuideCoinLead - k * TRACK_GEN.rampGuideCoinSpacing,
        lift: 0,
      });
    }
  }
  // Split left lane: two splitCoinsPerLine-coin lines at x=-W/4, spread across the span so the
  // whole lane reads as the "coin" side against the ramp+ice "right" side.
  if (split) {
    const leftX = -widthAt(split.z0) / 4;
    const spanLen = split.z1 - split.z0;
    const lineStarts = [split.z0 + TRACK_GEN.splitCoinLead, split.z0 + spanLen / 2];
    let splitCoinCount = 0;
    for (const lineStart of lineStarts) {
      for (let k = 0; k < TRACK_GEN.splitCoinsPerLine; k++) {
        coins.push({ id: `${index}-sc${splitCoinCount++}`, x: leftX, z: lineStart + k * TRACK_GEN.coinSpacing, lift: 0 });
      }
    }
  }

  // Route rewards: a dense coin line along the ridge lane (ridgeCoinMul x a normal line) and
  // pillarCoins on every pillar top. Deterministic (no rng), so nothing after this shifts.
  if (route) {
    const ridge = route.lanes.find((l) => l.kind === 'ridge');
    if (ridge) {
      const rx = (ridge.xMin + ridge.xMax) / 2;
      const n = TRACK_GEN.ridgeCoinMul * TRACK_GEN.coinsPerLineMin;
      const start = route.z0 + TRACK_GEN.routeEntryStep + 2;
      for (let k = 0; k < n; k++) {
        const z = start + k * TRACK_GEN.ridgeCoinSpacing;
        if (z > route.z1 - TRACK_GEN.routeExitBlend) break;
        coins.push({ id: `${index}-rc${k}`, x: rx, z, lift: 0 });
      }
    }
    route.pillars.forEach((p, pi) => {
      for (let k = 0; k < TRACK_GEN.pillarCoins; k++) {
        coins.push({ id: `${index}-pc${pi}-${k}`, x: p.x, z: p.z - (k - 1) * TRACK_GEN.pillarCoinSpacing - TRACK_GEN.pillarRadius / 2, lift: 0 });
      }
    });
    // Canyon coins (canyon design §2): an arc across the whole gap, x=0, canyonCoinSpacing apart,
    // lift following a sine arc peaking at canyonCoinLift at the midpoint. No ridge/pillar coins
    // apply here (route.canyon has no ridge lane and no pillars, so the blocks above are no-ops).
    if (route.canyon) {
      let k = 0;
      for (let cz = route.z0; cz <= route.z1; cz += TRACK_GEN.canyonCoinSpacing) {
        const t = (cz - route.z0) / (route.z1 - route.z0);
        coins.push({ id: `${index}-cc${k++}`, x: 0, z: cz, lift: TRACK_GEN.canyonCoinLift * Math.sin(Math.PI * t) });
      }
    }
  }

  // Slider rewards (art §2): a centre coin line every sliderCoinSpacing between the blends, and
  // one full-width boost pad near the entry. Deterministic (no rng), so nothing after this shifts.
  if (slider) {
    let sliderCoinCount = 0;
    for (let z = slider.z0 + TRACK_GEN.sliderBlend; z <= slider.z1 - TRACK_GEN.sliderBlend; z += TRACK_GEN.sliderCoinSpacing) {
      coins.push({ id: `${index}-sc${sliderCoinCount++}`, x: 0, z, lift: 0 });
    }
    boosts.push({
      id: `${index}-sp`, x: 0, z: slider.z0 + TRACK_GEN.sliderPadOffset,
      length: TRACK_GEN.boostLength, width: TRACK_GEN.sliderWidth,
    });
  }

  const gate: Gate | null = zone.z0 === z0 && zone.z0 > 0 ? { z: z0, zone: zone.id } : null;

  // Decor is purely visual (no collision) and is drawn last from the shared `rng`, after every
  // pre-existing draw above, so it never perturbs the values covered by the determinism test.
  const decor: Decor[] = [];
  let dCount = 0;
  if (zone.id === 'forest') {
    const pineCount = TRACK_GEN.pineMin + Math.floor(rng() * TRACK_GEN.pineRange);
    for (let k = 0; k < pineCount; k++) {
      const side = k % 2 === 0 ? 1 : -1;
      const bank = TRACK_GEN.decorBankMin + rng() * (TRACK_GEN.decorBankMax - TRACK_GEN.decorBankMin);
      const z = z0 + rng() * SEGMENT_LENGTH;
      const scale = TRACK_GEN.decorScaleMin + rng() * TRACK_GEN.decorScaleRange;
      decor.push({ id: `${index}-d${dCount++}`, kind: 'pine', x: side * bank, z, y: 0, scale });
    }
  } else if (zone.id === 'city') {
    const bankX = TRACK_GEN.decorBankMin + BUILDING_X_OFFSET;
    for (const side of [1, -1]) {
      const count = TRACK_GEN.buildingMin + Math.floor(rng() * TRACK_GEN.buildingRange);
      const step = SEGMENT_LENGTH / count;
      for (let k = 0; k < count; k++) {
        const jitter = (rng() * 2 - 1) * step * EVEN_SPACING_JITTER_FRAC;
        const z = z0 + step * (k + 0.5) + jitter;
        const height = TRACK_GEN.buildingHeightMin + rng() * TRACK_GEN.buildingHeightRange;
        decor.push({ id: `${index}-d${dCount++}`, kind: 'building', x: side * bankX, z, y: 0, scale: height });
      }
    }
  } else if (zone.id === 'cave') {
    const stalactiteCount = TRACK_GEN.stalactiteMin + Math.floor(rng() * TRACK_GEN.stalactiteRange);
    for (let k = 0; k < stalactiteCount; k++) {
      const x = (rng() * 2 - 1) * (TRACK_WIDTH / 2);
      const z = z0 + rng() * SEGMENT_LENGTH;
      const y = TRACK_GEN.stalactiteYMin + rng() * TRACK_GEN.stalactiteYRange;
      const scale = TRACK_GEN.decorScaleMin + rng() * TRACK_GEN.decorScaleRange;
      decor.push({ id: `${index}-d${dCount++}`, kind: 'stalactite', x, z, y, scale });
    }
  } else if (zone.id === 'volcano') {
    const palmCount = TRACK_GEN.palmMin + Math.floor(rng() * TRACK_GEN.palmRange);
    for (let k = 0; k < palmCount; k++) {
      const side = k % 2 === 0 ? 1 : -1;
      const bank = TRACK_GEN.decorBankMin + rng() * (TRACK_GEN.decorBankMax - TRACK_GEN.decorBankMin);
      const z = z0 + rng() * SEGMENT_LENGTH;
      const scale = TRACK_GEN.decorScaleMin + rng() * TRACK_GEN.decorScaleRange;
      decor.push({ id: `${index}-d${dCount++}`, kind: 'palm', x: side * bank, z, y: 0, scale });
    }
    const templeX = TRACK_GEN.decorBankMin + TRACK_GEN.templeXOffset;
    for (const side of [1, -1]) {
      const count = TRACK_GEN.templePerSide;
      const step = SEGMENT_LENGTH / count;
      for (let k = 0; k < count; k++) {
        const jitter = (rng() * 2 - 1) * step * EVEN_SPACING_JITTER_FRAC;
        const z = z0 + step * (k + 0.5) + jitter;
        const height = TRACK_GEN.templeHeightMin + rng() * TRACK_GEN.templeHeightRange;
        decor.push({ id: `${index}-d${dCount++}`, kind: 'temple', x: side * templeX, z, y: 0, scale: height });
      }
    }
  } else if (zone.id === 'desert') {
    // Desert decor (art §1): dunes on both banks (duneCountMin..+duneCountRange per side) plus a
    // pyramid per side with pyramidChance probability, further out. Space has no decor at all.
    for (const side of [1, -1]) {
      const duneCount = TRACK_GEN.duneCountMin + Math.floor(rng() * TRACK_GEN.duneCountRange);
      for (let k = 0; k < duneCount; k++) {
        const x = side * (TRACK_GEN.duneXMin + rng() * TRACK_GEN.duneXRange);
        const z = z0 + rng() * SEGMENT_LENGTH;
        const scale = TRACK_GEN.duneScaleMin + rng() * TRACK_GEN.duneScaleRange;
        decor.push({ id: `${index}-d${dCount++}`, kind: 'dune', x, z, y: 0, scale });
      }
      if (rng() < TRACK_GEN.pyramidChance) {
        const x = side * (TRACK_GEN.pyramidXMin + rng() * TRACK_GEN.pyramidXRange);
        const z = z0 + rng() * SEGMENT_LENGTH;
        const scale = TRACK_GEN.pyramidScaleMin + rng() * TRACK_GEN.pyramidScaleRange;
        decor.push({ id: `${index}-d${dCount++}`, kind: 'pyramid', x, z, y: 0, scale });
      }
    }
  }

  // Distant cliff decor: both banks, drawn last (after every zone-specific decor above) so it
  // never perturbs their draws. Only in zones that want it (art §1) - desert/space have none.
  if (zone.cliffs) {
    const cliffPerSide = TRACK_GEN.cliffPerSideMin + Math.floor(rng() * TRACK_GEN.cliffPerSideRange);
    for (const side of [1, -1]) {
      const step = SEGMENT_LENGTH / cliffPerSide;
      for (let k = 0; k < cliffPerSide; k++) {
        const jitter = (rng() * 2 - 1) * step * EVEN_SPACING_JITTER_FRAC;
        const z = z0 + step * (k + 0.5) + jitter;
        const x = side * (TRACK_GEN.cliffXMin + rng() * TRACK_GEN.cliffXRange);
        const scale = TRACK_GEN.cliffHeightMin + rng() * TRACK_GEN.cliffHeightRange;
        decor.push({ id: `${index}-d${dCount++}`, kind: 'cliff', x, z, y: 0, scale });
      }
    }
  }

  // Signpost ahead of the split, warning the player it's coming.
  if (split) {
    decor.push({ id: `${index}-d${dCount++}`, kind: 'signpost', x: 0, z: split.z0 - 25, y: 0, scale: 1 });
  }

  return {
    index, z0, z1, widthStart, widthEnd, split, pipes, corridorX, bumps, ice, ramps, obstacles, coins, boosts, drops,
    zone: zone.id, gate, decor, route, slider,
  };
}

export function isOnPad(x: number, z: number, pad: BoostPad): boolean {
  return Math.abs(x - pad.x) < pad.width / 2 && z >= pad.z && z < pad.z + pad.length;
}

function dropOffsetAt(d: Drop, z: number): number {
  const t = Math.max(0, Math.min(1, (z - d.z) / d.length));
  return d.depth * 0.5 * (1 - Math.cos(Math.PI * t));
}

export function createTrack(seed: number): Track {
  const phases = bendPhases(seed);
  const centerAt = (z: number): number => centerAtPhases(z, phases);
  const centerSlopeAt = (z: number): number => (
    (centerAt(z + CENTER_SLOPE_STEP) - centerAt(z - CENTER_SLOPE_STEP)) / (2 * CENTER_SLOPE_STEP)
  );

  const cache = new Map<number, Segment>();
  // Cumulative drop depth at each segment's z0, i.e. the sum of every earlier segment's drop
  // depths (all already fully descended by the time a later segment starts - see dropOffset
  // below). Computed and cached lazily, strictly forward from segment 0, so generating/measuring
  // segment i only ever depends on segments 0..i-1 (never a later one).
  const cumDropBeforeCache = new Map<number, number>();
  const cumDropBefore = (index: number): number => {
    if (index <= 0) return 0;
    const cached = cumDropBeforeCache.get(index);
    if (cached !== undefined) return cached;
    const prevTotal = cumDropBefore(index - 1);
    const prevSeg = getSegment(index - 1);
    let total = prevTotal;
    for (const d of prevSeg.drops) total += d.depth;
    cumDropBeforeCache.set(index, total);
    return total;
  };

  const getSegment = (index: number): Segment => {
    let s = cache.get(index);
    if (!s) {
      s = generateSegment(seed, index);
      cache.set(index, s);
    }
    return s;
  };

  const segmentIndexAt = (z: number): number => Math.max(0, Math.floor(z / SEGMENT_LENGTH));

  /** Cumulative depth of every drop with d.z < z, from segments 0..segmentIndexAt(z): earlier
   * segments' drops (always fully resolved by the time z reaches a later segment, since a
   * drop's span never crosses its own segment's end) contribute their full depth via
   * cumDropBefore; the current segment's own drops are cos-interpolated. */
  const dropOffset = (z: number): number => {
    if (z < 0) return 0;
    const idx = segmentIndexAt(z);
    let offset = cumDropBefore(idx);
    for (const d of getSegment(idx).drops) {
      if (d.z < z) offset += dropOffsetAt(d, z);
    }
    return offset;
  };

  const heightAt = (z: number, x = 0): number => {
    if (z < 0) return baseHeight(z);
    return baseHeight(z) - dropOffset(z) + localHeight(getSegment(segmentIndexAt(z)), z, x);
  };

  const slopeAt = (z: number, x = 0): number => {
    const s = (heightAt(z, x) - heightAt(z - SLOPE_STEP, x)) / SLOPE_STEP;
    return Math.max(-MAX_SLOPE, Math.min(MAX_SLOPE, s));
  };

  const pipeAt = (z: number): Segment['pipes'][number] | null => {
    if (z < 0) return null;
    const seg = getSegment(segmentIndexAt(z));
    return seg.pipes.find((p) => z >= p.z0 && z <= p.z1) ?? null;
  };

  const surfaceAt = (z: number): Surface => {
    if (z < 0) return 'snow';
    const seg = getSegment(segmentIndexAt(z));
    if (seg.pipes.some((p) => z >= p.z0 && z <= p.z1)) return 'ice';
    return seg.ice.some((b) => z >= b.z0 && z < b.z1) ? 'ice' : zoneAt(z).surface;
  };

  const widthAt = (z: number): number => {
    if (z < 0) return TRACK_WIDTH;
    const seg = getSegment(segmentIndexAt(z));
    const base = widthAtInSegment(seg.z0, seg.z1, seg.widthStart, seg.widthEnd, z);
    if (!seg.slider || z < seg.slider.z0 || z > seg.slider.z1) return base;
    return base + (seg.slider.width - base) * sliderBlend(seg.slider, z);
  };

  const segmentsAround = (z: number): Segment[] => {
    const a = segmentIndexAt(z - 10);
    const b = segmentIndexAt(z + 10);
    const out: Segment[] = [];
    for (let i = a; i <= b; i++) out.push(getSegment(i));
    return out;
  };

  /** The route section containing `z`, or null outside one (terrain routes §1). A route section
   * never crosses a segment boundary (routeMargin keeps it inside its segment). */
  const routeAt = (z: number): RouteSection | null => {
    if (z < 0) return null;
    const route = getSegment(segmentIndexAt(z)).route;
    return route && z >= route.z0 && z <= route.z1 ? route : null;
  };

  /** The lane containing (z, x), clamped to the nearest lane when x falls (by floating-point
   * slop) just outside every lane's span, since lanes partition the section's full width. */
  const laneAt = (z: number, x: number): Lane | null => {
    const route = routeAt(z);
    if (!route || route.lanes.length === 0) return null;
    for (const lane of route.lanes) {
      if (x >= lane.xMin && x < lane.xMax) return lane;
    }
    const first = route.lanes[0];
    const last = route.lanes[route.lanes.length - 1];
    return x < first.xMin ? first : last;
  };

  const onPillar = (z: number, x: number): boolean => {
    const route = routeAt(z);
    if (!route) return false;
    return route.pillars.some((p) => {
      const dx = x - p.x;
      const dz = z - p.z;
      return dx * dx + dz * dz <= p.radius * p.radius;
    });
  };

  /** The slider section containing `z`, or null outside one (art §2). A slider never crosses a
   * segment boundary (sliderMargin keeps it inside its segment). */
  const sliderAt = (z: number): Slider | null => {
    if (z < 0) return null;
    const slider = getSegment(segmentIndexAt(z)).slider;
    return slider && z >= slider.z0 && z <= slider.z1 ? slider : null;
  };

  return {
    seed, getSegment, segmentIndexAt, heightAt, slopeAt, surfaceAt, segmentsAround, widthAt, pipeAt,
    routeAt, laneAt, onPillar, sliderAt, centerAt, centerSlopeAt, bendPhases: phases,
  };
}
