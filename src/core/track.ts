import type {
  Bump, Coin, IceBand, Obstacle, ObstacleKind, Ramp, Segment, Surface, Track,
} from './types';

export const SEGMENT_LENGTH = 200;
export const TRACK_WIDTH = 16;
export const RAMP_LENGTH = 12;
export const RAMP_HEIGHT = 3;

const SLOPE_START = 0.06;
const SLOPE_END = 0.024;
const SLOPE_FLATTEN_DIST = 3000;
const SLOPE_STEP = 0.1;
const MAX_SLOPE = 1.5;
const CORRIDOR_HALF = 2.5;
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
  const bumpCount = 2 + Math.floor(rng() * 2);
  for (let i = 0; i < bumpCount; i++) {
    const width = 15 + rng() * 15;
    const amp = 1.5 + rng() * 2.5;
    const z = z0 + width + rng() * (SEGMENT_LENGTH - 2 * width);
    bumps.push({ z, amp, width });
  }

  const ice: IceBand[] = [];
  if (rng() < 0.35) {
    const len = 30 + rng() * 50;
    const start = z0 + rng() * (SEGMENT_LENGTH - len);
    ice.push({ z0: start, z1: start + len });
  }

  const ramps: Ramp[] = [];
  if (rng() < 0.5) {
    const rz = z0 + 30 + rng() * (SEGMENT_LENGTH - 30 - 40);
    ramps.push({ z: rz, length: RAMP_LENGTH, height: RAMP_HEIGHT });
  }

  const corridorX = (rng() - 0.5) * 8;
  const obstacles: Obstacle[] = [];
  const count = Math.min(14, 3 + Math.floor(z0 / 400));
  const zMin = Math.max(z0 + 10, FIRST_OBSTACLE_Z);
  const zMax = z1 - 5;
  const halfX = TRACK_WIDTH / 2 - OBSTACLE_MARGIN_X;
  for (let attempt = 0; attempt < count * 10 && obstacles.length < count; attempt++) {
    const x = (rng() * 2 - 1) * halfX;
    const z = zMin + rng() * (zMax - zMin);
    const kind = OBSTACLE_KINDS[Math.floor(rng() * OBSTACLE_KINDS.length)];
    if (Math.abs(x - corridorX) < CORRIDOR_HALF) continue;
    if (ramps.some((r) => z >= r.z - 3 && z <= r.z + r.length + 6)) continue;
    obstacles.push({ id: `${index}-o${obstacles.length}`, kind, x, z, r: OBSTACLE_RADIUS[kind] });
  }

  const coins: Coin[] = [];
  for (let line = 0; line < 2; line++) {
    const n = 5 + Math.floor(rng() * 4);
    const x = (rng() * 2 - 1) * 6;
    const startZ = z0 + 5 + rng() * (SEGMENT_LENGTH - 20);
    for (let k = 0; k < n; k++) {
      coins.push({ id: `${index}-l${line}-${k}`, x, z: startZ + k * 1.5, lift: 0 });
    }
  }
  for (const r of ramps) {
    for (let k = 0; k < 7; k++) {
      coins.push({
        id: `${index}-a${k}`,
        x: 0,
        z: r.z + r.length + 4 + k * 2.5,
        lift: 2 + 4 * Math.sin((Math.PI * k) / 6),
      });
    }
  }

  return { index, z0, z1, corridorX, bumps, ice, ramps, obstacles, coins };
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
