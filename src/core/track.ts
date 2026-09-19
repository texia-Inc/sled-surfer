import type {
  BoostPad, Bump, Coin, IceBand, Obstacle, ObstacleKind, Ramp, Segment, Surface, Track,
} from './types';
import { DEFAULT_PHYSICS } from './params';

export const SEGMENT_LENGTH = 200;
export const TRACK_WIDTH = DEFAULT_PHYSICS.trackWidth;
export const RAMP_LENGTH = 12;
export const RAMP_HEIGHT = 3;

export const TRACK_GEN = {
  bumpCountMin: 2, bumpCountRange: 2, bumpWidthMin: 15, bumpWidthRange: 15, bumpAmpMin: 1.5, bumpAmpRange: 2.5,
  bumpAmpStartScale: 0.35, bumpAmpFullDistance: 1200,
  iceChance: 0.35, iceLengthMin: 30, iceLengthRange: 50,
  rampChance: 0.5, rampStartMargin: 30, rampEndMargin: 40,
  corridorRange: 8,
  coinLines: 2, coinsPerLineMin: 5, coinsPerLineRange: 4, coinXRange: 6, coinSpacing: 1.5, coinLineStartMargin: 5, coinLineEndMargin: 20,
  archCoins: 7, archStartOffset: 4, archSpacing: 2.5, archLiftBase: 2, archLiftAmp: 4,
  obstacleBase: 3, obstaclePerMeters: 400, obstacleMax: 14, obstacleAttemptsPerSlot: 10,
  rampExclusionBefore: 3, rampExclusionAfter: 6,
  boostChance: 0.6, boostSecondChance: 0.35, boostLength: 6, boostWidth: 4,
  boostFirstZ: 60, boostMinGapFromRamp: 4,
  boostIceBandMargin: 3, boostRampPreOffsetMul: 2, boostZoneMargin: 20,
} as const;

const SLOPE_START = 0.06;
const SLOPE_END = 0.024;
const SLOPE_FLATTEN_DIST = 3000;
export const SLOPE_STEP = 0.1;
export const MAX_SLOPE = 1.5;
export const CORRIDOR_HALF = 2.5;
const OBSTACLE_MARGIN_X = 1;
const FIRST_OBSTACLE_Z = 40;

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

function rampHeight(r: Ramp, z: number): number {
  if (z < r.z || z >= r.z + r.length) return 0;
  return (r.height * (z - r.z)) / r.length;
}

function localHeight(seg: Segment, z: number): number {
  let h = 0;
  for (const b of seg.bumps) h += bumpHeight(b, z);
  for (const r of seg.ramps) h += rampHeight(r, z);
  return h;
}

const OBSTACLE_RADIUS: Record<ObstacleKind, number> = { tree: 0.8, rock: 1.0, snowman: 0.7 };
const OBSTACLE_KINDS: ObstacleKind[] = ['tree', 'rock', 'snowman'];

function generateSegment(seed: number, index: number): Segment {
  const rng = mulberry32(hashSeed(seed, index));
  const z0 = index * SEGMENT_LENGTH;
  const z1 = z0 + SEGMENT_LENGTH;

  const bumps: Bump[] = [];
  const bumpCount = TRACK_GEN.bumpCountMin + Math.floor(rng() * TRACK_GEN.bumpCountRange);
  // Early bumps are gentler so a fresh launch doesn't stall climbing them; scale ramps up to
  // full size by bumpAmpFullDistance. This only scales the drawn value, not the rng draw itself,
  // so the draw order/count is unchanged.
  const ampScale = Math.min(1, TRACK_GEN.bumpAmpStartScale + z0 / TRACK_GEN.bumpAmpFullDistance);
  for (let i = 0; i < bumpCount; i++) {
    const width = TRACK_GEN.bumpWidthMin + rng() * TRACK_GEN.bumpWidthRange;
    const amp = (TRACK_GEN.bumpAmpMin + rng() * TRACK_GEN.bumpAmpRange) * ampScale;
    const z = z0 + width + rng() * (SEGMENT_LENGTH - 2 * width);
    bumps.push({ z, amp, width });
  }

  const ice: IceBand[] = [];
  if (rng() < TRACK_GEN.iceChance) {
    const len = TRACK_GEN.iceLengthMin + rng() * TRACK_GEN.iceLengthRange;
    const start = z0 + rng() * (SEGMENT_LENGTH - len);
    ice.push({ z0: start, z1: start + len });
  }

  const ramps: Ramp[] = [];
  if (rng() < TRACK_GEN.rampChance) {
    const rz = z0 + TRACK_GEN.rampStartMargin + rng() * (SEGMENT_LENGTH - TRACK_GEN.rampStartMargin - TRACK_GEN.rampEndMargin);
    ramps.push({ z: rz, length: RAMP_LENGTH, height: RAMP_HEIGHT });
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
  const padXMin = -TRACK_WIDTH / 2 + boostWidth / 2 + 1;
  const padXMax = TRACK_WIDTH / 2 - boostWidth / 2 - 1;
  const overlapsRamp = (z: number): boolean => ramps.some(
    (r) => z < r.z + r.length + TRACK_GEN.boostMinGapFromRamp && z + boostLength > r.z - TRACK_GEN.boostMinGapFromRamp,
  );
  const tryAddPad = (z: number, k: number): void => {
    if (z < TRACK_GEN.boostFirstZ) return;
    if (overlapsRamp(z)) return;
    if (boosts.some((b) => z < b.z + b.length && z + boostLength > b.z)) return;
    const x = padXMin + padRng() * (padXMax - padXMin);
    boosts.push({ id: `${index}-b${k}`, x, z, length: boostLength, width: boostWidth });
  };
  const iceMargin = TRACK_GEN.boostIceBandMargin;
  const zoneMargin = TRACK_GEN.boostZoneMargin;
  if (padRng() < TRACK_GEN.boostChance) {
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

  const corridorX = (rng() - 0.5) * TRACK_GEN.corridorRange;
  const obstacles: Obstacle[] = [];
  const count = Math.min(TRACK_GEN.obstacleMax, TRACK_GEN.obstacleBase + Math.floor(z0 / TRACK_GEN.obstaclePerMeters));
  const zMin = Math.max(z0 + 10, FIRST_OBSTACLE_Z);
  const zMax = z1 - 5;
  const halfX = TRACK_WIDTH / 2 - OBSTACLE_MARGIN_X;
  const obstacleAttempts = count * TRACK_GEN.obstacleAttemptsPerSlot;
  for (let attempt = 0; attempt < obstacleAttempts && obstacles.length < count; attempt++) {
    const x = (rng() * 2 - 1) * halfX;
    const z = zMin + rng() * (zMax - zMin);
    const kind = OBSTACLE_KINDS[Math.floor(rng() * OBSTACLE_KINDS.length)];
    if (Math.abs(x - corridorX) < CORRIDOR_HALF) continue;
    if (ramps.some((r) => z >= r.z - TRACK_GEN.rampExclusionBefore && z <= r.z + r.length + TRACK_GEN.rampExclusionAfter)) continue;
    const r = OBSTACLE_RADIUS[kind];
    if (boosts.some((b) => Math.abs(x - b.x) < b.width / 2 + r && z >= b.z - r && z <= b.z + b.length + r)) continue;
    obstacles.push({ id: `${index}-o${obstacles.length}`, kind, x, z, r });
  }

  const coins: Coin[] = [];
  for (let line = 0; line < TRACK_GEN.coinLines; line++) {
    const n = TRACK_GEN.coinsPerLineMin + Math.floor(rng() * TRACK_GEN.coinsPerLineRange);
    const x = (rng() * 2 - 1) * TRACK_GEN.coinXRange;
    const startZ = z0 + TRACK_GEN.coinLineStartMargin + rng() * (SEGMENT_LENGTH - TRACK_GEN.coinLineStartMargin - TRACK_GEN.coinLineEndMargin);
    for (let k = 0; k < n; k++) {
      coins.push({ id: `${index}-l${line}-${k}`, x, z: startZ + k * TRACK_GEN.coinSpacing, lift: 0 });
    }
  }
  for (const r of ramps) {
    for (let k = 0; k < TRACK_GEN.archCoins; k++) {
      coins.push({
        id: `${index}-a${k}`,
        x: 0,
        z: r.z + r.length + TRACK_GEN.archStartOffset + k * TRACK_GEN.archSpacing,
        lift: TRACK_GEN.archLiftBase + TRACK_GEN.archLiftAmp * Math.sin((Math.PI * k) / 6),
      });
    }
  }

  return { index, z0, z1, corridorX, bumps, ice, ramps, obstacles, coins, boosts };
}

export function isOnPad(x: number, z: number, pad: BoostPad): boolean {
  return Math.abs(x - pad.x) < pad.width / 2 && z >= pad.z && z < pad.z + pad.length;
}

export function createTrack(seed: number): Track {
  const cache = new Map<number, Segment>();

  const getSegment = (index: number): Segment => {
    let s = cache.get(index);
    if (!s) {
      s = generateSegment(seed, index);
      cache.set(index, s);
    }
    return s;
  };

  const segmentIndexAt = (z: number): number => Math.max(0, Math.floor(z / SEGMENT_LENGTH));

  const heightAt = (z: number): number => {
    if (z < 0) return baseHeight(z);
    return baseHeight(z) + localHeight(getSegment(segmentIndexAt(z)), z);
  };

  const slopeAt = (z: number): number => {
    const s = (heightAt(z) - heightAt(z - SLOPE_STEP)) / SLOPE_STEP;
    return Math.max(-MAX_SLOPE, Math.min(MAX_SLOPE, s));
  };

  const surfaceAt = (z: number): Surface => {
    if (z < 0) return 'snow';
    const seg = getSegment(segmentIndexAt(z));
    return seg.ice.some((b) => z >= b.z0 && z < b.z1) ? 'ice' : 'snow';
  };

  const segmentsAround = (z: number): Segment[] => {
    const a = segmentIndexAt(z - 10);
    const b = segmentIndexAt(z + 10);
    const out: Segment[] = [];
    for (let i = a; i <= b; i++) out.push(getSegment(i));
    return out;
  };

  return { seed, getSegment, segmentIndexAt, heightAt, slopeAt, surfaceAt, segmentsAround };
}
