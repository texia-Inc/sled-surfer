import { describe, it, expect } from 'vitest';
import {
  createTrack, baseHeight, baseSlope, mulberry32, isOnPad,
  SEGMENT_LENGTH, TRACK_WIDTH, RAMP_SMALL, RAMP_BIG, TRACK_GEN, MAX_SLOPE, CORRIDOR_HALF,
} from '../src/core/track';
import { zoneAt, ZONES } from '../src/core/zones';
import type { Segment, Track } from '../src/core/types';

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
        expect(Math.abs(o.x)).toBeLessThanOrEqual(t.widthAt(o.z) / 2 - 1 + 1e-9);
        expect(o.z).toBeGreaterThanOrEqual(s.z0);
        expect(o.z).toBeLessThan(s.z1);
      }
    }
  });

  it('increases obstacle count with distance', () => {
    // Split centre walls (terrain §4) are additive to this distance-scaled budget, not part of
    // it - a segment with a split legitimately has more obstacles than the formula predicts, so
    // they're excluded here.
    const t = createTrack(5);
    const nonWall = (s: ReturnType<ReturnType<typeof createTrack>['getSegment']>): number => (
      s.obstacles.filter((o) => o.kind !== 'wall').length
    );
    expect(nonWall(t.getSegment(0))).toBe(TRACK_GEN.obstacleBase);
    const z10 = 10 * SEGMENT_LENGTH;
    const expected10 = Math.round(
      (TRACK_GEN.obstacleBase + Math.floor(z10 / TRACK_GEN.obstaclePerMeters)) * zoneAt(z10).obstacleDensityMul,
    );
    // A route section excludes ordinary obstacles from its span, so a routed segment may fall short.
    if (t.getSegment(10).route) expect(nonWall(t.getSegment(10))).toBeLessThanOrEqual(expected10);
    else expect(nonWall(t.getSegment(10))).toBe(expected10);
    expect(nonWall(t.getSegment(40))).toBe(TRACK_GEN.obstacleMax);
  });

  it('does not put non-wall obstacles on ramps', () => {
    // Split wall obstacles (kind 'wall', x=0) deliberately run the length of the split span,
    // which includes the split's own right-lane ramp's z-range - they're on a different lane
    // (x=0 vs the ramp's x=+W/4) so they don't actually sit on the ramp; only x=0-width ramps
    // (drop ramps) would ever conflict with them, and drop/split spans are mutually exclusive.
    const t = createTrack(9);
    for (let i = 0; i < 40; i++) {
      const s = t.getSegment(i);
      for (const r of s.ramps) for (const o of s.obstacles.filter((ob) => ob.kind !== 'wall')) {
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
        // Pillar ramps end at the pillar edge, where the lip also drops to the hazard floor.
        if (r.id.includes('-pr')) continue;
        const end = r.z + r.length;
        // Ramp height is per-lane (terrain §1): query at the ramp's own x, not the default x=0.
        const drop = t.heightAt(end - 0.01, r.x) - t.heightAt(end + 0.01, r.x);
        expect(Math.abs(drop - r.height)).toBeLessThan(0.1);
        found = true;
      }
    }
    expect(found).toBe(true);
  });

  it('every segment 0..20 has 1-2 base ramps, each a small or big template, ids unique per segment', () => {
    // A split's own right-lane ramp (id `${index}-rs0`, terrain §4) is a distinct feature, not
    // part of the "1-2 guaranteed ramps" contract, so it's excluded from the count/template check
    // (ids overall - including it - must still all be unique).
    const t = createTrack(11);
    for (let i = 0; i <= 20; i++) {
      const s = t.getSegment(i);
      const baseRamps = s.ramps.filter((r) => !r.id.includes('-rs') && !r.id.includes('-pr') && !r.id.endsWith('-re'));
      // A routed segment may have no free ramp at all (the route span excludes them) - it has
      // the route entry/pillar ramps instead.
      expect(baseRamps.length).toBeGreaterThanOrEqual(s.route ? 0 : 1);
      expect(baseRamps.length).toBeLessThanOrEqual(2);
      const ids = new Set(s.ramps.map((r) => r.id));
      expect(ids.size).toBe(s.ramps.length);
      for (const r of baseRamps) {
        const matchesSmall = r.length === RAMP_SMALL.length && r.height === RAMP_SMALL.height;
        const matchesBig = r.length === RAMP_BIG.length && r.height === RAMP_BIG.height;
        expect(matchesSmall || matchesBig).toBe(true);
      }
    }
  });

  it('base ramps within a segment are kept at least rampMinGap metres apart', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const t = createTrack(seed);
      for (let i = 0; i <= 20; i++) {
        const s = t.getSegment(i);
        const baseRamps = s.ramps.filter((r) => !r.id.includes('-rs') && !r.id.includes('-pr') && !r.id.endsWith('-re'));
        if (baseRamps.length < 2) continue;
        const zs = baseRamps.map((r) => r.z).sort((a, b) => a - b);
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

  it('keeps ground coin lines within widthAt(startZ)/2 - coinXMargin of the centerline', () => {
    // x is drawn once per line from widthAt(startZ) (the first coin's z), not re-evaluated per
    // coin, so the bound is checked at that same startZ (matching generateSegment's own logic) -
    // not at each individual coin's z, which can drift a few metres along the line.
    for (let seed = 1; seed <= 8; seed++) {
      const t = createTrack(seed);
      for (let i = 0; i < 10; i++) {
        const lines = new Map<string, { x: number; startZ: number }>();
        for (const c of t.getSegment(i).coins) {
          // Only plain coin-line coins respect coinXMargin; arch coins (lift>0) and guide coins
          // (id `-g...`) are anchored to a ramp's own x/width instead.
          const m = /^\d+-l(\d+)-\d+$/.exec(c.id);
          if (c.lift > 0 || !m) continue;
          const existing = lines.get(m[1]);
          if (!existing || c.z < existing.startZ) lines.set(m[1], { x: c.x, startZ: c.z });
        }
        for (const { x, startZ } of lines.values()) {
          expect(Math.abs(x)).toBeLessThanOrEqual(t.widthAt(startZ) / 2 - TRACK_GEN.coinXMargin + 1e-9);
        }
      }
    }
  });

  it('draws corridorX uniformly across the segment\'s own width (widthAt at its midpoint, not the nominal TRACK_WIDTH)', () => {
    let sawNearLeftEdge = false;
    let sawNearRightEdge = false;
    for (let seed = 1; seed <= 20; seed++) {
      const t = createTrack(seed);
      for (let i = 0; i < 5; i++) {
        const seg = t.getSegment(i);
        const mid = seg.z0 + SEGMENT_LENGTH / 2;
        const halfW = t.widthAt(mid) / 2;
        const cx = seg.corridorX;
        expect(Math.abs(cx)).toBeLessThanOrEqual(halfW + 1e-9);
        if (cx < -halfW + 3) sawNearLeftEdge = true;
        if (cx > halfW - 3) sawNearRightEdge = true;
      }
    }
    expect(sawNearLeftEdge).toBe(true);
    expect(sawNearRightEdge).toBe(true);
  });

  it('places boost pads inside the track width (at their own z) and never before boostFirstZ', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const t = createTrack(seed);
      for (let i = 0; i < 20; i++) {
        const s = t.getSegment(i);
        for (const b of s.boosts) {
          expect(b.z).toBeGreaterThanOrEqual(TRACK_GEN.boostFirstZ);
          const w = t.widthAt(b.z);
          expect(b.x - b.width / 2).toBeGreaterThanOrEqual(-w / 2 - 1e-9);
          expect(b.x + b.width / 2).toBeLessThanOrEqual(w / 2 + 1e-9);
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

  it('ramps have an x/width within the track and heightAt is only positive on the ramp lane', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const t = createTrack(seed);
      for (let i = 0; i <= 20; i++) {
        const s = t.getSegment(i);
        for (const r of s.ramps) {
          const w = t.widthAt(r.z);
          expect(r.x - r.width / 2).toBeGreaterThanOrEqual(-w / 2 - 1e-9);
          expect(r.x + r.width / 2).toBeLessThanOrEqual(w / 2 + 1e-9);
          const matchesSmall = r.width === TRACK_GEN.rampWidth;
          const matchesBig = r.width === TRACK_GEN.rampBigWidth;
          const matchesRoute = r.width === TRACK_GEN.pillarRampWidth || r.width === TRACK_GEN.routeEntryRampWidth;
          expect(matchesSmall || matchesBig || matchesRoute).toBe(true);
          // Route ramps sit on lanes whose neighbours can be higher (ridge); the lane comparison is
          // covered by the route-section tests instead.
          if (r.id.includes('-pr') || r.id.endsWith('-re')) continue;
          const mid = r.z + r.length / 2;
          expect(t.heightAt(mid, r.x)).toBeGreaterThan(t.heightAt(mid, r.x + r.width));
        }
      }
    }
  });

  it('drop ramps are centred at x=0 with the big width', () => {
    let found = false;
    for (let seed = 1; seed <= 12; seed++) {
      const t = createTrack(seed);
      for (let i = 0; i <= 20; i++) {
        const s = t.getSegment(i);
        for (const d of s.drops) {
          const companion = s.ramps.find((r) => Math.abs(r.z + r.length - d.z) < 1e-9);
          expect(companion).toBeDefined();
          expect(companion!.x).toBe(0);
          expect(companion!.width).toBe(TRACK_GEN.rampBigWidth);
          found = true;
        }
      }
    }
    expect(found).toBe(true);
  });

  it('places rampGuideCoins guide coins at the ramp\'s own x before each ramp', () => {
    let found = false;
    for (let seed = 1; seed <= 5; seed++) {
      const t = createTrack(seed);
      for (let i = 0; i <= 10; i++) {
        const s = t.getSegment(i);
        for (const r of s.ramps) {
          if (r.id.includes('-pr')) continue; // pillar ramps carry pillar coins instead of guides
          const guides = s.coins.filter((c) => c.x === r.x && c.z < r.z && c.z >= r.z - TRACK_GEN.rampGuideCoinLead - TRACK_GEN.rampGuideCoins * TRACK_GEN.rampGuideCoinSpacing);
          expect(guides.length).toBeGreaterThanOrEqual(TRACK_GEN.rampGuideCoins);
          found = true;
        }
      }
    }
    expect(found).toBe(true);
  });

  it('widthAt stays within [widthMin, widthMax] and is continuous across segment boundaries', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const t = createTrack(seed);
      for (let z = 0; z < 15 * SEGMENT_LENGTH; z += 17) {
        const w = t.widthAt(z);
        expect(w).toBeGreaterThanOrEqual(TRACK_GEN.widthMin - 1e-9);
        expect(w).toBeLessThanOrEqual(TRACK_GEN.widthMax + 1e-9);
      }
      for (let i = 1; i <= 14; i++) {
        const z = i * SEGMENT_LENGTH;
        expect(Math.abs(t.widthAt(z - 0.01) - t.widthAt(z + 0.01))).toBeLessThan(0.01);
      }
    }
  });

  it('segment 0 starts at TRACK_WIDTH and each segment\'s widthStart matches the previous widthEnd', () => {
    const t = createTrack(6);
    expect(t.getSegment(0).widthStart).toBe(TRACK_WIDTH);
    for (let i = 1; i <= 10; i++) {
      expect(t.getSegment(i).widthStart).toBe(t.getSegment(i - 1).widthEnd);
    }
  });

  it('splits only start at or after splitMinZ', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const t = createTrack(seed);
      for (let i = 0; i <= 20; i++) {
        const s = t.getSegment(i);
        if (s.split) expect(s.split.z0).toBeGreaterThanOrEqual(TRACK_GEN.splitMinZ);
      }
    }
  });

  // Superseded by multi-height route sections (routes design, 2026-09-21): splitChance is 0.
  it.skip('split walls sit only at x=0, spaced within the split span', () => {
    let found = false;
    for (let seed = 1; seed <= 20; seed++) {
      const t = createTrack(seed);
      for (let i = 0; i <= 20; i++) {
        const s = t.getSegment(i);
        if (!s.split) continue;
        const walls = s.obstacles.filter((o) => o.kind === 'wall');
        expect(walls.length).toBeGreaterThan(0);
        for (const w of walls) {
          expect(w.x).toBe(0);
          expect(w.z).toBeGreaterThanOrEqual(s.split.z0 - 1e-9);
          expect(w.z).toBeLessThanOrEqual(s.split.z1 + 1e-9);
        }
        found = true;
      }
    }
    expect(found).toBe(true);
  });

  // Superseded by multi-height route sections (routes design, 2026-09-21): splitChance is 0.
  it.skip('both lanes have an obstacle-free x at every wall z inside a split', () => {
    let found = false;
    for (let seed = 1; seed <= 20; seed++) {
      const t = createTrack(seed);
      for (let i = 0; i <= 20; i++) {
        const s = t.getSegment(i);
        if (!s.split) continue;
        const w = t.widthAt(s.split.z0);
        const lo = s.split.gapHalf + 2;
        const hi = w / 2 - 1;
        const nonWallObstacles = s.obstacles.filter((o) => o.kind !== 'wall');
        const clearSomewhereInLane = (sign: 1 | -1, wallZ: number): boolean => {
          for (let step = 0; step <= 20; step++) {
            const x = sign * (lo + ((hi - lo) * step) / 20);
            const blocked = nonWallObstacles.some(
              (o) => Math.abs(o.x - x) < o.r + 0.3 && Math.abs(o.z - wallZ) <= 3,
            );
            if (!blocked) return true;
          }
          return false;
        };
        for (const wall of s.obstacles.filter((o) => o.kind === 'wall')) {
          expect(clearSomewhereInLane(-1, wall.z)).toBe(true);
          expect(clearSomewhereInLane(1, wall.z)).toBe(true);
        }
        found = true;
      }
    }
    expect(found).toBe(true);
  });

  // Superseded by multi-height route sections (routes design, 2026-09-21): splitChance is 0.
  it.skip('split puts the ramp and ice on the right (x>0) and coin lines on the left (x<0)', () => {
    let found = false;
    for (let seed = 1; seed <= 20; seed++) {
      const t = createTrack(seed);
      for (let i = 0; i <= 20; i++) {
        const s = t.getSegment(i);
        if (!s.split) continue;
        const splitRamp = s.ramps.find((r) => r.id.includes('-rs'));
        expect(splitRamp).toBeDefined();
        expect(splitRamp!.x).toBeGreaterThan(0);
        expect(s.ice.some((band) => band.z0 === s.split!.z0 && band.z1 === s.split!.z1)).toBe(true);
        const splitCoins = s.coins.filter((c) => c.id.includes('-sc'));
        expect(splitCoins.length).toBeGreaterThan(0);
        for (const c of splitCoins) expect(c.x).toBeLessThan(0);
        found = true;
      }
    }
    expect(found).toBe(true);
  });

  it('half-pipes only start at or after pipeMinZ and reject overlap with drops/ramps/splits', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const t = createTrack(seed);
      for (let i = 0; i <= 20; i++) {
        const s = t.getSegment(i);
        for (const p of s.pipes) {
          expect(p.z0).toBeGreaterThanOrEqual(TRACK_GEN.pipeMinZ);
          for (const d of s.drops) {
            expect(p.z0 < d.z + d.length + TRACK_GEN.rampExclusionAfter
              && p.z1 > d.z - RAMP_BIG.length - TRACK_GEN.rampExclusionBefore).toBe(false);
          }
          for (const r of s.ramps) {
            expect(p.z0 < r.z + r.length + TRACK_GEN.rampExclusionAfter
              && p.z1 > r.z - TRACK_GEN.rampExclusionBefore).toBe(false);
          }
          if (s.split) expect(p.z0 < s.split.z1 && p.z1 > s.split.z0).toBe(false);
        }
      }
    }
  });

  it('heightAt rises off-centre inside a half-pipe, matching wallHeight*(x/(W/2))^2', () => {
    let found = false;
    for (let seed = 1; seed <= 30 && !found; seed++) {
      const t = createTrack(seed);
      for (let i = 0; i <= 20 && !found; i++) {
        const s = t.getSegment(i);
        for (const p of s.pipes) {
          const mid = (p.z0 + p.z1) / 2;
          if (mid - p.z0 < TRACK_GEN.pipeBlend || p.z1 - mid < TRACK_GEN.pipeBlend) continue;
          const w = t.widthAt(mid);
          const rim = 0.8 * (w / 2);
          const center = t.heightAt(mid, 0);
          const off = t.heightAt(mid, rim);
          expect(off).toBeGreaterThan(center);
          expect(off - center).toBeCloseTo(p.wallHeight * 0.64, 1);
          found = true;
        }
      }
    }
    expect(found).toBe(true);
  });

  it('surfaceAt reports ice inside a half-pipe span', () => {
    let found = false;
    for (let seed = 1; seed <= 30 && !found; seed++) {
      const t = createTrack(seed);
      for (let i = 0; i <= 20 && !found; i++) {
        const s = t.getSegment(i);
        for (const p of s.pipes) {
          expect(t.surfaceAt((p.z0 + p.z1) / 2)).toBe('ice');
          found = true;
        }
      }
    }
    expect(found).toBe(true);
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
      expect(d.kind === 'pine' || d.kind === 'cliff' || d.kind === 'signpost').toBe(true);
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
      expect(d.kind === 'stalactite' || d.kind === 'cliff' || d.kind === 'signpost').toBe(true);
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
          expect(Math.abs(c.x)).toBeGreaterThanOrEqual(30);
          expect(c.scale).toBeGreaterThanOrEqual(15);
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

describe('route sections', () => {
  function findRoute(): { seg: Segment; t: Track } {
    for (let seed = 1; seed <= 6; seed++) {
      const t = createTrack(seed);
      for (let i = 2; i < 40; i++) {
        const seg = t.getSegment(i);
        if (seg.route && seg.route.lanes.length === 3) return { seg, t };
      }
    }
    throw new Error('no 3-lane route section found');
  }

  it('only appears from routeMinZ on and stays inside its segment with margins', () => {
    for (let seed = 1; seed <= 4; seed++) {
      const t = createTrack(seed);
      for (let i = 0; i < 40; i++) {
        const seg = t.getSegment(i);
        if (!seg.route) continue;
        expect(seg.z0).toBeGreaterThanOrEqual(TRACK_GEN.routeMinZ);
        expect(seg.route.z0).toBeGreaterThanOrEqual(seg.z0 + TRACK_GEN.routeMargin - 1e-9);
        expect(seg.route.z1).toBeLessThanOrEqual(seg.z1 - TRACK_GEN.routeMargin + 1e-9);
        expect(seg.route.z1 - seg.route.z0).toBeGreaterThanOrEqual(TRACK_GEN.routeLenMin - 1e-9);
      }
    }
  });

  it('lanes partition the track width contiguously and pillars are evenly spaced with ramps on top', () => {
    const { seg, t } = findRoute();
    const route = seg.route!;
    const w = t.widthAt((route.z0 + route.z1) / 2);
    expect(route.lanes[0].xMin).toBeCloseTo(-w / 2, 6);
    expect(route.lanes[route.lanes.length - 1].xMax).toBeCloseTo(w / 2, 6);
    for (let k = 1; k < route.lanes.length; k++) expect(route.lanes[k].xMin).toBeCloseTo(route.lanes[k - 1].xMax, 6);
    expect(route.pillars.length).toBeGreaterThanOrEqual(2);
    for (let k = 1; k < route.pillars.length; k++) {
      expect(route.pillars[k].z - route.pillars[k - 1].z).toBeCloseTo(TRACK_GEN.pillarSpacing, 6);
      expect(route.pillars[k].id).not.toBe(route.pillars[k - 1].id);
    }
    for (const p of route.pillars) {
      const ramp = seg.ramps.find((r) => r.id.includes('-pr') && Math.abs(r.z - (p.z + TRACK_GEN.pillarRampOffset)) < 1e-6);
      expect(ramp).toBeDefined();
      expect(Math.abs(ramp!.x - p.x)).toBeLessThanOrEqual(3);
      expect(ramp!.width).toBe(TRACK_GEN.pillarRampWidth);
    }
    const ridge = route.lanes.find((l) => l.kind === 'ridge')!;
    const entry = seg.ramps.find((r) => r.id.endsWith('-re'))!;
    expect(entry.z).toBeCloseTo(route.z0 - TRACK_GEN.routeEntryRampLead, 6);
    expect(entry.width).toBe(TRACK_GEN.routeEntryRampWidth);
    expect(Math.abs(entry.x - (ridge.xMin + ridge.xMax) / 2)).toBeLessThanOrEqual(4);
  });

  it('heightAt reflects each lane: ridge +4, hazard floor -6, pillar top +2, and 0 again at z1', () => {
    const { seg, t } = findRoute();
    const route = seg.route!;
    const zMid = (route.z0 + route.z1) / 2;
    const centre = (l: { xMin: number; xMax: number }) => (l.xMin + l.xMax) / 2;
    const ground = route.lanes.find((l) => l.kind === 'ground')!;
    const ridge = route.lanes.find((l) => l.kind === 'ridge')!;
    const pillars = route.lanes.find((l) => l.kind === 'pillars')!;
    const g = t.heightAt(zMid, centre(ground));
    expect(t.heightAt(zMid, centre(ridge)) - g).toBeCloseTo(TRACK_GEN.ridgeHeight, 3);
    const p0 = route.pillars[0];
    const between = p0.z + TRACK_GEN.pillarSpacing / 2;
    const gBetween = t.heightAt(between, centre(ground));
    expect(t.heightAt(between, centre(pillars)) - gBetween).toBeCloseTo(-TRACK_GEN.hazardDepth, 3);
    expect(t.onPillar(p0.z, p0.x)).toBe(true);
    expect(t.onPillar(between, p0.x)).toBe(false);
    // Pillar top relative to the ground lane, sampled beside the pillar ramp (x + 3 is on the
    // pillar, radius 5, but off the 5 m-wide ramp).
    expect(t.heightAt(p0.z, p0.x + 3) - t.heightAt(p0.z, centre(ground))).toBeCloseTo(TRACK_GEN.pillarTop, 3);
    // The ramp lip coincides with the pillar edge: no cliff between ramp end and hazard floor.
    const pr = seg.ramps.find((r) => r.id === `${seg.index}-pr0`)!;
    expect(pr.z + pr.length).toBeCloseTo(p0.z + TRACK_GEN.pillarRadius, 6);
    expect(t.heightAt(route.z1, centre(ridge)) - t.heightAt(route.z1, centre(ground))).toBeCloseTo(0, 3);
    expect(t.laneAt(zMid, centre(ridge))?.kind).toBe('ridge');
    expect(t.routeAt(zMid)).toBe(route);
    expect(t.routeAt(route.z0 - 1)).toBeNull();
  });

  it('keeps ordinary obstacles, pads and coin lines out of the section and its entry ramp', () => {
    for (let seed = 1; seed <= 4; seed++) {
      const t = createTrack(seed);
      for (let i = 0; i < 40; i++) {
        const seg = t.getSegment(i);
        if (!seg.route) continue;
        const lo = seg.route.z0 - TRACK_GEN.routeEntryRampLead - TRACK_GEN.rampExclusionBefore;
        const hi = seg.route.z1 + TRACK_GEN.rampExclusionAfter;
        for (const o of seg.obstacles) expect(o.z < lo || o.z > hi).toBe(true);
        for (const b of seg.boosts) expect(b.z + b.length < lo || b.z > hi).toBe(true);
        for (const c of seg.coins) {
          if (/-l\d+-/.test(c.id)) expect(c.z < lo || c.z > hi).toBe(true);
        }
        for (const d of seg.drops) expect(d.z + d.length < lo || d.z - RAMP_BIG.length > hi).toBe(true);
        for (const p of seg.pipes) expect(p.z1 < lo || p.z0 > hi).toBe(true);
      }
    }
  });
});
