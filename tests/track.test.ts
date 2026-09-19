import { describe, it, expect } from 'vitest';
import {
  createTrack, baseHeight, baseSlope, mulberry32,
  SEGMENT_LENGTH, TRACK_WIDTH, RAMP_HEIGHT, TRACK_GEN, MAX_SLOPE, CORRIDOR_HALF,
} from '../src/core/track';

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
    expect(t.getSegment(10).obstacles.length).toBe(
      TRACK_GEN.obstacleBase + Math.floor((10 * SEGMENT_LENGTH) / TRACK_GEN.obstaclePerMeters),
    );
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
});
