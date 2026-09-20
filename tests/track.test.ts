import { describe, it, expect } from 'vitest';
import {
  createTrack, baseHeight, baseSlope, mulberry32, isOnPad,
  SEGMENT_LENGTH, TRACK_WIDTH, RAMP_SMALL, RAMP_BIG, TRACK_GEN, MAX_SLOPE, CORRIDOR_HALF,
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

  it('every ramp ends with a cliff matching its own height (small or big)', () => {
    const t = createTrack(11);
    let found = false;
    for (let i = 0; i < 40; i++) {
      const s = t.getSegment(i);
      for (const r of s.ramps) {
        const end = r.z + r.length;
        const drop = t.heightAt(end - 0.01) - t.heightAt(end + 0.01);
        expect(Math.abs(drop - r.height)).toBeLessThan(0.1);
        found = true;
      }
    }
    expect(found).toBe(true);
  });

  it('every segment 0..20 has 1-2 ramps, each a small or big template, ids unique per segment', () => {
    const t = createTrack(11);
    for (let i = 0; i <= 20; i++) {
      const s = t.getSegment(i);
      expect(s.ramps.length).toBeGreaterThanOrEqual(1);
      expect(s.ramps.length).toBeLessThanOrEqual(2);
      const ids = new Set(s.ramps.map((r) => r.id));
      expect(ids.size).toBe(s.ramps.length);
      for (const r of s.ramps) {
        const matchesSmall = r.length === RAMP_SMALL.length && r.height === RAMP_SMALL.height;
        const matchesBig = r.length === RAMP_BIG.length && r.height === RAMP_BIG.height;
        expect(matchesSmall || matchesBig).toBe(true);
      }
    }
  });

  it('ramps within a segment are kept at least rampMinGap metres apart', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const t = createTrack(seed);
      for (let i = 0; i <= 20; i++) {
        const s = t.getSegment(i);
        if (s.ramps.length < 2) continue;
        const zs = s.ramps.map((r) => r.z).sort((a, b) => a - b);
        for (let k = 1; k < zs.length; k++) {
          expect(zs[k] - zs[k - 1]).toBeGreaterThanOrEqual(TRACK_GEN.rampMinGap);
        }
      }
    }
  });

  it('drops only occur in segments starting at or after dropMinZ', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const t = createTrack(seed);
      for (let i = 0; i <= 20; i++) {
        const s = t.getSegment(i);
        if (s.drops.length > 0) {
          expect(s.z0).toBeGreaterThanOrEqual(TRACK_GEN.dropMinZ);
        }
      }
    }
  });

  it('each drop has a big ramp whose end coincides with the drop start, and is placed inside the segment', () => {
    let found = false;
    for (let seed = 1; seed <= 12; seed++) {
      const t = createTrack(seed);
      for (let i = 0; i <= 20; i++) {
        const s = t.getSegment(i);
        for (const d of s.drops) {
          expect(d.z).toBeGreaterThanOrEqual(s.z0 + 40);
          expect(d.z).toBeLessThanOrEqual(s.z1 - 60);
          const companion = s.ramps.find((r) => Math.abs(r.z + r.length - d.z) < 1e-9);
          expect(companion).toBeDefined();
          expect(companion!.length).toBe(RAMP_BIG.length);
          expect(companion!.height).toBe(RAMP_BIG.height);
          found = true;
        }
      }
    }
    expect(found).toBe(true);
  });

  it('heightAt descends by the drop depth (plus the base grade) across a drop not touched by a bump', () => {
    // Measured from the drop's own start (z=drop.z, where the preceding big ramp's local height
    // contribution has just ended, i.e. localHeight=0 there, since ramps end exactly at drop.z)
    // to its end (z=drop.z+length, also localHeight=0 there absent a bump), so only baseHeight
    // and dropOffset are in play. Drops whose start/end happen to fall under an (independently
    // placed) bump are skipped - see report-core.md for why the brief's literal
    // heightAt(drop.z-1)-based formula doesn't hold in general (that point sits on the ramp's
    // own rising slope, which this test deliberately avoids by measuring from drop.z itself).
    const bumpFree = (seg: ReturnType<ReturnType<typeof createTrack>['getSegment']>, z: number): boolean => (
      seg.bumps.every((b) => Math.abs(z - b.z) >= b.width)
    );
    let found = false;
    for (let seed = 1; seed <= 20; seed++) {
      const t = createTrack(seed);
      for (let i = 0; i <= 20; i++) {
        const s = t.getSegment(i);
        for (const d of s.drops) {
          if (!bumpFree(s, d.z) || !bumpFree(s, d.z + d.length)) continue;
          const before = t.heightAt(d.z);
          const after = t.heightAt(d.z + d.length);
          const expected = before + baseSlope(d.z) * d.length - d.depth;
          expect(Math.abs(after - expected)).toBeLessThan(0.3);
          found = true;
        }
      }
    }
    expect(found).toBe(true);
  });

  it('dropOffset at each segment boundary equals the exact sum of every earlier drop\'s depth', () => {
    // Segment boundaries have zero local height (bumps/ramps/drops all keep a margin from z0),
    // so heightAt(i*SEGMENT_LENGTH) isolates baseHeight - dropOffset exactly (no approximation),
    // directly exercising the cumulative cache described in brief-core.md §3/spec §2: generating
    // segment i must only need segments 0..i-1's drop totals.
    let sawADrop = false;
    for (let seed = 1; seed <= 20; seed++) {
      const t = createTrack(seed);
      let cumDepth = 0;
      for (let i = 0; i <= 15; i++) {
        const boundary = i * SEGMENT_LENGTH;
        expect(t.heightAt(boundary)).toBeCloseTo(baseHeight(boundary) - cumDepth, 6);
        const seg = t.getSegment(i);
        if (seg.drops.length > 0) sawADrop = true;
        for (const d of seg.drops) cumDepth += d.depth;
      }
    }
    expect(sawADrop).toBe(true);
  });

  it('obstacles avoid drop spans (like ramps)', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const t = createTrack(seed);
      for (let i = 0; i <= 20; i++) {
        const s = t.getSegment(i);
        for (const d of s.drops) {
          const lo = d.z - RAMP_BIG.length - TRACK_GEN.rampExclusionBefore;
          const hi = d.z + d.length + TRACK_GEN.rampExclusionAfter;
          for (const o of s.obstacles) {
            const inSpan = o.z >= lo && o.z <= hi;
            expect(inSpan).toBe(false);
          }
        }
      }
    }
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

  it('keeps ground coins within TRACK_WIDTH/2 - coinXMargin of the centerline', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const t = createTrack(seed);
      for (let i = 0; i < 10; i++) {
        for (const c of t.getSegment(i).coins) {
          if (c.lift > 0) continue; // arch coins are anchored to a ramp, not this bound
          expect(Math.abs(c.x)).toBeLessThanOrEqual(TRACK_WIDTH / 2 - TRACK_GEN.coinXMargin + 1e-9);
        }
      }
    }
  });

  it('draws corridorX uniformly across the full track width (not a narrow band)', () => {
    let sawNearLeftEdge = false;
    let sawNearRightEdge = false;
    for (let seed = 1; seed <= 20; seed++) {
      const t = createTrack(seed);
      for (let i = 0; i < 5; i++) {
        const cx = t.getSegment(i).corridorX;
        expect(Math.abs(cx)).toBeLessThanOrEqual(TRACK_WIDTH / 2 + 1e-9);
        if (cx < -TRACK_WIDTH / 2 + 3) sawNearLeftEdge = true;
        if (cx > TRACK_WIDTH / 2 - 3) sawNearRightEdge = true;
      }
    }
    expect(sawNearLeftEdge).toBe(true);
    expect(sawNearRightEdge).toBe(true);
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

  it('a forest segment places pine decor at least decorBankMin from the centerline (plus cliffs, every zone)', () => {
    const t = createTrack(3);
    const seg = t.getSegment(3);
    expect(seg.z0).toBe(600);
    expect(seg.decor.length).toBeGreaterThan(0);
    const pines = seg.decor.filter((d) => d.kind === 'pine');
    expect(pines.length).toBeGreaterThan(0);
    for (const d of pines) {
      expect(Math.abs(d.x)).toBeGreaterThanOrEqual(TRACK_GEN.decorBankMin);
    }
    for (const d of seg.decor) {
      expect(d.kind === 'pine' || d.kind === 'cliff').toBe(true);
    }
  });

  it('a cave segment places stalactite decor above stalactiteYMin (plus cliffs, every zone)', () => {
    const t = createTrack(3);
    const seg = t.getSegment(10);
    expect(seg.z0).toBe(2000);
    expect(seg.decor.length).toBeGreaterThan(0);
    const stalactites = seg.decor.filter((d) => d.kind === 'stalactite');
    expect(stalactites.length).toBeGreaterThan(0);
    for (const d of stalactites) {
      expect(d.y).toBeGreaterThanOrEqual(TRACK_GEN.stalactiteYMin);
    }
    for (const d of seg.decor) {
      expect(d.kind === 'stalactite' || d.kind === 'cliff').toBe(true);
    }
  });

  it('cliff decor appears on both banks of every zone, far out and tall', () => {
    let sawPositive = false;
    let sawNegative = false;
    for (let seed = 1; seed <= 6; seed++) {
      const t = createTrack(seed);
      for (let i = 0; i <= 12; i++) {
        const seg = t.getSegment(i);
        const cliffs = seg.decor.filter((d) => d.kind === 'cliff');
        expect(cliffs.length).toBeGreaterThan(0);
        for (const c of cliffs) {
          expect(Math.abs(c.x)).toBeGreaterThanOrEqual(22);
          expect(c.scale).toBeGreaterThanOrEqual(12);
          if (c.x > 0) sawPositive = true;
          if (c.x < 0) sawNegative = true;
        }
      }
    }
    expect(sawPositive).toBe(true);
    expect(sawNegative).toBe(true);
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
