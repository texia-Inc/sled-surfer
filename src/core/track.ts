import type {
  BoostPad, Bump, Coin, Decor, Drop, Gate, IceBand, Obstacle, ObstacleKind, Ramp, Segment, Surface, Track,
} from './types';
import { DEFAULT_PHYSICS } from './params';
import { zoneAt } from './zones';

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
  /** Track width (m) varies per segment: widthEnd is uniform in [widthMin, widthMax]; a
   * segment's widthStart is the previous segment's widthEnd (segment 0 starts at TRACK_WIDTH). */
  widthMin: 20, widthMax: 36,
  /** Two-lane split sections: a centre wall (kind 'wall', x=0, every splitWallSpacing) divides
   * the track into a left lane (coins) and a right lane (a small ramp + ice). */
  splitChance: 0.3, splitMinZ: 300, splitLenMin: 60, splitLenRange: 60,
  splitGapHalf: 3, splitWallSpacing: 6,
  /** Half-pipes: heightAt curves up parabolically toward the walls (see pipeHeight), blended in
   * and out over pipeBlend metres at each end so entry/exit isn't a hard step. */
  pipeChance: 0.3, pipeMinZ: 200, pipeLenMin: 40, pipeLenRange: 40,
  pipeWallHeight: 6, pipeBlend: 10,
} as const;

const SLOPE_START = 0.12;
const SLOPE_END = 0.05;
const SLOPE_FLATTEN_DIST = 3000;
export const SLOPE_STEP = 0.1;
export const MAX_SLOPE = 1.5;
export const CORRIDOR_HALF = 2.5;
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

function localHeight(seg: Segment, z: number, x: number): number {
  let h = 0;
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
  hay: 0.9, crate: 0.7, fence: 1.5, wall: 1.6,
};

/** Whether hitting this obstacle kind breaks it (see physics.ts collision handling) rather than
 * causing a hard stun-and-bounce collision. */
export const OBSTACLE_BREAKABLE: Record<ObstacleKind, boolean> = {
  tree: false, rock: false, snowman: true,
  stump: true, car: false, bus: false, sign: true, barrier: true, stalagmite: false, crystal: false,
  hay: true, crate: true, fence: true, wall: false,
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

  const ramps: Ramp[] = [];
  const drops: Drop[] = [];
  let rampCounter = 0;
  if (z0 >= TRACK_GEN.dropMinZ && rng() < TRACK_GEN.dropChance) {
    const dz = z0 + TRACK_GEN.dropStartMargin
      + rng() * (SEGMENT_LENGTH - TRACK_GEN.dropStartMargin - TRACK_GEN.dropEndMargin);
    const depth = TRACK_GEN.dropDepthMin + rng() * TRACK_GEN.dropDepthRange;
    drops.push({ z: dz, depth, length: TRACK_GEN.dropLength });
    // Big drop ramps are centred (x=0) so the drop line-up is fair regardless of who's aiming.
    ramps.push({
      id: `${index}-r${rampCounter++}`, z: dz - RAMP_BIG.length, length: RAMP_BIG.length, height: RAMP_BIG.height,
      x: 0, width: TRACK_GEN.rampBigWidth,
    });
  }
  const rampCount = TRACK_GEN.rampMin + Math.floor(rng() * TRACK_GEN.rampRange);
  const rampSpanLo = z0 + TRACK_GEN.rampStartMargin;
  const rampSpanHi = z1 - TRACK_GEN.rampEndMargin;
  for (let attempt = 0; ramps.length < rampCount && attempt < TRACK_GEN.rampPlacementAttempts; attempt++) {
    const big = rng() < TRACK_GEN.rampBigChance;
    const template = big ? RAMP_BIG : RAMP_SMALL;
    const rz = rampSpanLo + rng() * (rampSpanHi - rampSpanLo);
    if (ramps.some((r) => Math.abs(rz - r.z) < TRACK_GEN.rampMinGap)) continue;
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
    const lo = z0 + 30;
    const hi = z1 - 30 - length;
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
  if (z0 >= TRACK_GEN.pipeMinZ && pipeRng() < TRACK_GEN.pipeChance) {
    const length = TRACK_GEN.pipeLenMin + pipeRng() * TRACK_GEN.pipeLenRange;
    const lo = z0 + 20;
    const hi = z1 - 20 - length;
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
      if (!overlapsRamp && !overlapsDrop && !overlapsSplit) {
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

  // Uniform across the full width (not a narrow band): (rng()-0.5) in [-0.5,0.5] * TRACK_WIDTH.
  // When this segment has a split, the drawn value is remapped (not redrawn - the shared rng
  // draw itself is unchanged) into whichever lane its sign already pointed at, so the corridor
  // rule still guarantees one clear lane through the split instead of straddling the centre wall.
  const rawCorridorX = (rng() - 0.5) * TRACK_WIDTH;
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
      if (inDropSpan(z)) continue;
      coins.push({ id: `${index}-l${line}-${k}`, x, z, lift: 0 });
    }
  }
  ramps.forEach((r, rampIdx) => {
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
    for (let k = 0; k < TRACK_GEN.rampGuideCoins; k++) {
      coins.push({
        id: `${index}-g${guideCount++}`,
        x: r.x,
        z: r.z - TRACK_GEN.rampGuideCoinLead - k * TRACK_GEN.rampGuideCoinSpacing,
        lift: 0,
      });
    }
  }
  // Split left lane: two 8-coin lines at x=-W/4, spread across the span so the whole lane reads
  // as the "coin" side against the ramp+ice "right" side.
  if (split) {
    const leftX = -widthAt(split.z0) / 4;
    const spanLen = split.z1 - split.z0;
    const lineStarts = [split.z0 + 10, split.z0 + spanLen / 2];
    let splitCoinCount = 0;
    for (const lineStart of lineStarts) {
      for (let k = 0; k < 8; k++) {
        coins.push({ id: `${index}-sc${splitCoinCount++}`, x: leftX, z: lineStart + k * TRACK_GEN.coinSpacing, lift: 0 });
      }
    }
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
  }

  // Distant cliff decor: every zone, both banks, drawn last (after every zone-specific decor
  // above) so it never perturbs their draws.
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

  // Signpost ahead of the split, warning the player it's coming.
  if (split) {
    decor.push({ id: `${index}-d${dCount++}`, kind: 'signpost', x: 0, z: split.z0 - 25, y: 0, scale: 1 });
  }

  return {
    index, z0, z1, widthStart, widthEnd, split, pipes, corridorX, bumps, ice, ramps, obstacles, coins, boosts, drops,
    zone: zone.id, gate, decor,
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
    return widthAtInSegment(seg.z0, seg.z1, seg.widthStart, seg.widthEnd, z);
  };

  const segmentsAround = (z: number): Segment[] => {
    const a = segmentIndexAt(z - 10);
    const b = segmentIndexAt(z + 10);
    const out: Segment[] = [];
    for (let i = a; i <= b; i++) out.push(getSegment(i));
    return out;
  };

  return { seed, getSegment, segmentIndexAt, heightAt, slopeAt, surfaceAt, segmentsAround, widthAt, pipeAt };
}
