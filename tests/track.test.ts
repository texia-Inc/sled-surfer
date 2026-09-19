import { describe, it, expect } from 'vitest';
import {
  createTrack, baseHeight, baseSlope, mulberry32, isOnPad,
  SEGMENT_LENGTH, TRACK_WIDTH, RAMP_HEIGHT, TRACK_GEN, MAX_SLOPE, CORRIDOR_HALF,
} from '../src/core/track';
import { zoneAt, ZONES } from '../src/core/zones';

describe('mulberry32', () => {
  it('is deterministic and in [0,1)', () => {
    const a = mulberry32(42), b = mulberry32(42);
    for (let i = 0; i < 100; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('base profile', () => {
  it('descends and flattens with distance', () => {
    expect(baseHeight(0)).toBe(0);
    expect(baseHeight(100)).toBeLessThan(0);
    expect(baseSlope(0)).toBeLessThan(baseSlope(2000));
    expect(baseSlope(5000)).toBe(baseSlope(4000));
  });
  it('slope matches numeric derivative of height', () => {
    for (const z of [10, 1500, 2999, 3500]) {
      const num = (baseHeight(z + 0.05) - baseHeight(z - 0.05)) / 0.1;
      expect(Math.abs(num - baseSlope(z))).toBeLessThan(1e-3);
    }
  });
});

describe('createTrack', () => {
  it('is deterministic for the same seed and differs across seeds', () => {
    const a = createTrack(7), b = createTrack(7), c = createTrack(8);
    expect(JSON.stringify(a.getSegment(3))).toBe(JSON.stringify(b.getSegment(3)));
    expect(JSON.stringify(a.getSegment(3))).not.toBe(JSON.stringify(c.getSegment(3)));
  });

  it('height is continuous across segment boundaries', () => {
    const t = createTrack(1);
    for (let i = 1; i <= 10; i++) {
      const z = i * SEGMENT_LENGTH;
      expect(Math.abs(t.heightAt(z - 0.01) - t.heightAt(z + 0.01))).toBeLessThan(0.05);
    }
  });

  it('keeps a corridor free of obstacles and keeps obstacles inside the track', () => {
    const t = createTrack(3);
    for (let i = 0; i < 20; i++) {
      const s = t.getSegment(i);
      for (const o of s.obstacles) {
        expect(Math.abs(o.x - s.corridorX)).toBeGreaterThanOrEqual(CORRIDOR_HALF);
        expect(Math.abs(o.x)).toBeLessThanOrEqual(TRACK_WIDTH / 2 - 1);
        expect(o.z).toBeGreaterThanOrEqual(s.z0);
        expect(o.z).toBeLessThan(s.z1);
      }
    }
  });

  it('increases obstacle count with distance', () => {
    const t = createTrack(5);
    expect(t.getSegment(0).obstacles.length).toBe(TRACK_GEN.obstacleBase);
    const z10 = 10 * SEGMENT_LENGTH;
    const expected10 = Math.round(
      (TRACK_GEN.obstacleBase + Math.floor(z10 / TRACK_GEN.obstaclePerMeters)) * zoneAt(z10).obstacleDensityMul,
    );
    expect(t.getSegment(10).obstacles.length).toBe(expected10);
    expect(t.getSegment(40).obstacles.length).toBe(TRACK_GEN.obstacleMax);
  });

  it('does not put obstacles on ramps', () => {
    const t = createTrack(9);
    for (let i = 0; i < 40; i++) {
      const s = t.getSegment(i);
      for (const r of s.ramps) for (const o of s.obstacles) {
        const onRamp = o.z >= r.z - TRACK_GEN.rampExclusionBefore && o.z <= r.z + r.length + TRACK_GEN.rampExclusionAfter;
        expect(onRamp).toBe(false);
      }
    }
  });

  it('ramp ends with a cliff of RAMP_HEIGHT', () => {
    const t = createTrack(11);
    let found = false;
    for (let i = 0; i < 40 && !found; i++) {
      const s = t.getSegment(i);
      for (const r of s.ramps) {
        const end = r.z + r.length;
        const drop = t.heightAt(end - 0.01) - t.heightAt(end + 0.01);
        expect(Math.abs(drop - RAMP_HEIGHT)).toBeLessThan(0.1);
        found = true;
      }
    }
    expect(found).toBe(true);
  });

  it('reports ice inside ice bands and snow elsewhere', () => {
    const t = createTrack(13);
    let found = false;
    for (let i = 0; i < 40 && !found; i++) {
      const s = t.getSegment(i);
      for (const b of s.ice) {
        expect(t.surfaceAt((b.z0 + b.z1) / 2)).toBe('ice');
        found = true;
      }
    }
    expect(found).toBe(true);
    expect(t.surfaceAt(-5)).toBe('snow');
  });

  it('slopeAt is clamped and negative on the base descent', () => {
    const t = createTrack(2);
    const s = t.slopeAt(1);
    expect(s).toBeLessThan(0);
    expect(s).toBeGreaterThanOrEqual(-MAX_SLOPE);
  });

  it('segmentsAround returns segments covering z +/- 10', () => {
    const t = createTrack(2);
    const idx = t.segmentsAround(195).map((s) => s.index);
    expect(idx).toEqual([0, 1]);
    expect(t.segmentsAround(100).map((s) => s.index)).toEqual([0]);
  });

  it('places coins with ids unique within the segment', () => {
    const t = createTrack(4);
    const s = t.getSegment(2);
    const ids = new Set(s.coins.map((c) => c.id));
    expect(ids.size).toBe(s.coins.length);
    expect(s.coins.length).toBeGreaterThanOrEqual(10);
  });

  it('places boost pads inside the track width and never before boostFirstZ', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const t = createTrack(seed);
      for (let i = 0; i < 20; i++) {
        const s = t.getSegment(i);
        for (const b of s.boosts) {
          expect(b.z).toBeGreaterThanOrEqual(TRACK_GEN.boostFirstZ);
          expect(b.x - b.width / 2).toBeGreaterThanOrEqual(-TRACK_WIDTH / 2);
          expect(b.x + b.width / 2).toBeLessThanOrEqual(TRACK_WIDTH / 2);
        }
      }
    }
  });

  it('never overlaps a boost pad with a ramp span expanded by the gap', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const t = createTrack(seed);
      for (let i = 0; i < 20; i++) {
        const s = t.getSegment(i);
        for (const b of s.boosts) {
          for (const r of s.ramps) {
            const rampStart = r.z - TRACK_GEN.boostMinGapFromRamp;
            const rampEnd = r.z + r.length + TRACK_GEN.boostMinGapFromRamp;
            const overlaps = b.z < rampEnd && b.z + b.length > rampStart;
            expect(overlaps).toBe(false);
          }
        }
      }
    }
  });

  it('never overlaps an obstacle circle with a boost pad rectangle', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const t = createTrack(seed);
      for (let i = 0; i < 20; i++) {
        const s = t.getSegment(i);
        for (const b of s.boosts) {
          for (const o of s.obstacles) {
            const overlapsX = Math.abs(o.x - b.x) < b.width / 2 + o.r;
            const overlapsZ = o.z >= b.z - o.r && o.z <= b.z + b.length + o.r;
            expect(overlapsX && overlapsZ).toBe(false);
          }
        }
      }
    }
  });

  it('produces both a 2-pad segment and a 0-pad segment across seeds', () => {
    let sawTwo = false;
    let sawZero = false;
    for (let seed = 1; seed <= 5; seed++) {
      const t = createTrack(seed);
      for (let i = 0; i < 20; i++) {
        const count = t.getSegment(i).boosts.length;
        if (count === 2) sawTwo = true;
        if (count === 0) sawZero = true;
      }
    }
    expect(sawTwo).toBe(true);
    expect(sawZero).toBe(true);
  });

  it('scales bump amplitude down near the start and back up with distance', () => {
    const t = createTrack(3);
    const seg0 = t.getSegment(0);
    const maxRawAmp = TRACK_GEN.bumpAmpMin + TRACK_GEN.bumpAmpRange;
    for (const b of seg0.bumps) {
      expect(b.amp).toBeLessThanOrEqual(maxRawAmp * TRACK_GEN.bumpAmpStartScale + 1e-9);
    }
    let sawFullScale = false;
    for (let i = 6; i < 20 && !sawFullScale; i++) {
      for (const b of t.getSegment(i).bumps) {
        if (b.amp > TRACK_GEN.bumpAmpMin) sawFullScale = true;
      }
    }
    expect(sawFullScale).toBe(true);
  });

  it('isOnPad is true inside the pad and false just outside on each axis', () => {
    const pad = { id: 'p', x: 0, z: 10, length: 6, width: 4 };
    expect(isOnPad(0, 10, pad)).toBe(true);
    expect(isOnPad(1.9, 12, pad)).toBe(true);
    expect(isOnPad(2.1, 12, pad)).toBe(false);
    expect(isOnPad(-2.1, 12, pad)).toBe(false);
    expect(isOnPad(0, 9.9, pad)).toBe(false);
    expect(isOnPad(0, 16, pad)).toBe(false);
  });
});

describe('zone-aware generation', () => {
  const cityZone = ZONES.find((z) => z.id === 'city')!;

  it('a city segment has road surface, no ice, and only city obstacle kinds', () => {
    const t = createTrack(3);
    const seg = t.getSegment(6);
    expect(seg.z0).toBe(1200);
    expect(t.surfaceAt(seg.z0 + SEGMENT_LENGTH / 2)).toBe('road');
    expect(seg.ice.length).toBe(0);
    expect(seg.obstacles.length).toBeGreaterThan(0);
    for (const o of seg.obstacles) {
      expect(cityZone.obstacleKinds).toContain(o.kind);
    }
  });

  it('a forest segment places pine decor at least decorBankMin from the centerline', () => {
    const t = createTrack(3);
    const seg = t.getSegment(3);
    expect(seg.z0).toBe(600);
    expect(seg.decor.length).toBeGreaterThan(0);
    for (const d of seg.decor) {
      expect(d.kind).toBe('pine');
      expect(Math.abs(d.x)).toBeGreaterThanOrEqual(TRACK_GEN.decorBankMin);
    }
  });

  it('a cave segment places only stalactite decor above stalactiteYMin', () => {
    const t = createTrack(3);
    const seg = t.getSegment(10);
    expect(seg.z0).toBe(2000);
    expect(seg.decor.length).toBeGreaterThan(0);
    for (const d of seg.decor) {
      expect(d.kind).toBe('stalactite');
      expect(d.y).toBeGreaterThanOrEqual(TRACK_GEN.stalactiteYMin);
    }
  });

  it('gates exist exactly at the forest/city/cave boundary segments', () => {
    const t = createTrack(3);
    for (let i = 0; i <= 12; i++) {
      const seg = t.getSegment(i);
      if (i === 3 || i === 6 || i === 10) {
        expect(seg.gate).not.toBeNull();
        expect(seg.gate!.z).toBe(seg.z0);
        expect(seg.gate!.zone).toBe(zoneAt(seg.z0).id);
      } else {
        expect(seg.gate).toBeNull();
      }
    }
  });
});
