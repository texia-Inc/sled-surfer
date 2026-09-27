import { describe, it, expect } from 'vitest';
import {
  createTrack, baseHeight, baseSlope, mulberry32, isOnPad,
  SEGMENT_LENGTH, TRACK_WIDTH, RAMP_SMALL, RAMP_BIG, TRACK_GEN, MAX_SLOPE, CORRIDOR_HALF,
  TRACK_BEND, bendPhases, bendMulAt,
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
    // A route section (or a slider, art §2) excludes ordinary obstacles from its span, so an
    // affected segment may fall short.
    if (t.getSegment(10).route || t.getSegment(10).slider) expect(nonWall(t.getSegment(10))).toBeLessThanOrEqual(expected10);
    else expect(nonWall(t.getSegment(10))).toBe(expected10);
    if (t.getSegment(40).route || t.getSegment(40).slider) expect(nonWall(t.getSegment(40))).toBeLessThanOrEqual(TRACK_GEN.obstacleMax);
    else expect(nonWall(t.getSegment(40))).toBe(TRACK_GEN.obstacleMax);
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
    // A split's own right-lane ramp (id `${index}-rs0`, terrain §4) and the stairs ramps (also
    // `-rs`, canyon design §3) are a distinct feature, not part of the "1-2 guaranteed ramps"
    // contract, so they're excluded from the count/template check (ids overall - including them -
    // must still all be unique). Same for a canyon's own entry ramp (`-cr`, canyon design §2).
    const t = createTrack(11);
    for (let i = 0; i <= 20; i++) {
      const s = t.getSegment(i);
      const baseRamps = s.ramps.filter((r) => !r.id.includes('-rs') && !r.id.includes('-pr') && !r.id.endsWith('-re') && !r.id.includes('-cr'));
      // A routed segment may have no free ramp at all (the route span excludes them) - it has
      // the route entry/pillar ramps instead. A stairs segment (canyon design §3) can likewise
      // have none: stairsCount (3) is subtracted from the free-ramp target, which floors at 0.
      const hasStairs = s.ramps.some((r) => r.id === `${s.index}-rs0`);
      expect(baseRamps.length).toBeGreaterThanOrEqual(s.route || hasStairs ? 0 : 1);
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
        const baseRamps = s.ramps.filter((r) => !r.id.includes('-rs') && !r.id.includes('-pr') && !r.id.endsWith('-re') && !r.id.includes('-cr'));
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
        // corridorX is drawn from the segment's own (un-narrowed) width, before a slider (art §2)
        // can narrow widthAt at that same z - skip the comparison when a slider covers mid.
        if (seg.slider && mid >= seg.slider.z0 && mid <= seg.slider.z1) continue;
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
          const matchesRoute = r.width === TRACK_GEN.pillarRampWidth || r.width === TRACK_GEN.routeEntryRampWidth
            || r.width === TRACK_GEN.canyonRampWidth || r.width === TRACK_GEN.stairsRampWidth;
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

  it('widthAt stays within [widthMin, widthMax] (or narrows to sliderWidth inside a slider) and is continuous across segment boundaries', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const t = createTrack(seed);
      for (let z = 0; z < 15 * SEGMENT_LENGTH; z += 17) {
        const w = t.widthAt(z);
        const seg = t.getSegment(t.segmentIndexAt(z));
        // A slider (art §2) narrows the track below widthMin, down to sliderWidth, inside its span.
        const inSlider = seg.slider !== null && z >= seg.slider.z0 && z <= seg.slider.z1;
        const lowerBound = inSlider ? TRACK_GEN.sliderWidth : TRACK_GEN.widthMin;
        expect(w).toBeGreaterThanOrEqual(lowerBound - 1e-9);
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
    // A canyon (canyon design §2) is also a RouteSection (route.canyon), but with its own,
    // much shorter length rule (canyonGapMin..+canyonGapRange) instead of routeLenMin - checked
    // separately below.
    for (let seed = 1; seed <= 4; seed++) {
      const t = createTrack(seed);
      for (let i = 0; i < 40; i++) {
        const seg = t.getSegment(i);
        if (!seg.route) continue;
        expect(seg.z0).toBeGreaterThanOrEqual(TRACK_GEN.routeMinZ);
        expect(seg.route.z0).toBeGreaterThanOrEqual(seg.z0 + TRACK_GEN.routeMargin - 1e-9);
        expect(seg.route.z1).toBeLessThanOrEqual(seg.z1 - TRACK_GEN.routeMargin + 1e-9);
        if (seg.route.canyon) {
          const gapLen = seg.route.z1 - seg.route.z0;
          expect(gapLen).toBeGreaterThanOrEqual(TRACK_GEN.canyonGapMin - 1e-9);
          expect(gapLen).toBeLessThanOrEqual(TRACK_GEN.canyonGapMin + TRACK_GEN.canyonGapRange + 1e-9);
        } else {
          expect(seg.route.z1 - seg.route.z0).toBeGreaterThanOrEqual(TRACK_GEN.routeLenMin - 1e-9);
        }
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
    const pillarLane = route.lanes.find((l) => l.kind === 'pillars')!;
    const entry = seg.ramps.find((r) => r.id.endsWith('-re'))!;
    expect(entry.z).toBeCloseTo(route.z0 - TRACK_GEN.routeEntryRampLead, 6);
    expect(entry.width).toBe(TRACK_GEN.routeEntryRampWidth);
    expect(entry.height).toBe(RAMP_SMALL.height);
    expect(Math.abs(entry.x - (pillarLane.xMin + pillarLane.xMax) / 2)).toBeLessThanOrEqual(4);
    // The ridge is entered by driving up an incline: half height halfway up the ramp.
    const ridge = route.lanes.find((l) => l.kind === 'ridge')!;
    const ground0 = route.lanes.find((l) => l.kind === 'ground')!;
    const rc = (ridge.xMin + ridge.xMax) / 2, gc = (ground0.xMin + ground0.xMax) / 2;
    const half = route.z0 + TRACK_GEN.routeRidgeRamp / 2;
    expect(t.heightAt(half, rc) - t.heightAt(half, gc)).toBeCloseTo(TRACK_GEN.ridgeHeight / 2, 1);
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
    // pillar, radius 6, but off the 5 m-wide ramp).
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
        // Nothing that launches the sled sits in the approach: no drop ends, and no big free ramp starts,
        // within routeApproachClear before the section.
        for (const d of seg.drops) expect(d.z + d.length < seg.route.z0 - TRACK_GEN.routeApproachClear || d.z > seg.route.z1).toBe(true);
        for (const r of seg.ramps) {
          // A canyon's own entry ramp (`-cr`, canyon design §2) is the route's own big ramp,
          // like `-pr`/`-re` are for a multi-lane route - not a stray free ramp.
          if (r.id.includes('-pr') || r.id.endsWith('-re') || r.id.includes('-cr')) continue;
          if (r.height === RAMP_BIG.height) expect(r.z < seg.route.z0 - TRACK_GEN.routeApproachClear || r.z > seg.route.z1).toBe(true);
        }
        for (const p of seg.pipes) expect(p.z1 < lo || p.z0 > hi).toBe(true);
        for (const b of seg.bumps) expect(b.z + b.width < seg.route.z0 - TRACK_GEN.routeEntryRampLead || b.z - b.width > seg.route.z1).toBe(true);
      }
    }
  });
});

describe('slider sections', () => {
  function findSlider(): { seg: Segment; t: Track } {
    for (let seed = 1; seed <= 12; seed++) {
      const t = createTrack(seed);
      for (let i = 4; i < 60; i++) {
        const seg = t.getSegment(i);
        if (seg.slider) return { seg, t };
      }
    }
    throw new Error('no slider section found');
  }

  it('only appears from sliderMinZ on and stays inside its segment with margins and length range', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const t = createTrack(seed);
      for (let i = 0; i < 60; i++) {
        const seg = t.getSegment(i);
        if (!seg.slider) continue;
        expect(seg.z0).toBeGreaterThanOrEqual(TRACK_GEN.sliderMinZ);
        expect(seg.slider.z0).toBeGreaterThanOrEqual(seg.z0 + TRACK_GEN.sliderMargin - 1e-9);
        expect(seg.slider.z1).toBeLessThanOrEqual(seg.z1 - TRACK_GEN.sliderMargin + 1e-9);
        const length = seg.slider.z1 - seg.slider.z0;
        expect(length).toBeGreaterThanOrEqual(TRACK_GEN.sliderLenMin - 1e-9);
        expect(length).toBeLessThanOrEqual(TRACK_GEN.sliderLenMin + TRACK_GEN.sliderLenRange + 1e-9);
      }
    }
  });

  it('widthAt narrows to sliderWidth at the span\'s midpoint', () => {
    const { seg, t } = findSlider();
    const mid = (seg.slider!.z0 + seg.slider!.z1) / 2;
    expect(t.widthAt(mid)).toBe(TRACK_GEN.sliderWidth);
  });

  it('heightAt at the midpoint is sliderHeight higher on the deck (x=0) than off it (x=8, outside the edge fall)', () => {
    const { seg, t } = findSlider();
    const mid = (seg.slider!.z0 + seg.slider!.z1) / 2;
    expect(t.heightAt(mid, 0)).toBeCloseTo(t.heightAt(mid, 8) + TRACK_GEN.sliderHeight, 6);
  });

  it('sliderAt reports the slider inside its span and null outside', () => {
    const { seg, t } = findSlider();
    const mid = (seg.slider!.z0 + seg.slider!.z1) / 2;
    expect(t.sliderAt(mid)).toBe(seg.slider);
    expect(t.sliderAt(seg.slider!.z0 - 1)).toBeNull();
    expect(t.sliderAt(seg.slider!.z1 + 1)).toBeNull();
  });

  it('has no obstacle inside the span, and has centre coins plus an entry boost pad inside it', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const t = createTrack(seed);
      for (let i = 4; i < 60; i++) {
        const seg = t.getSegment(i);
        if (!seg.slider) continue;
        for (const o of seg.obstacles) {
          expect(o.z >= seg.slider.z0 && o.z <= seg.slider.z1).toBe(false);
        }
        const hasCoinInSpan = seg.coins.some((c) => c.z >= seg.slider!.z0 && c.z <= seg.slider!.z1);
        expect(hasCoinInSpan).toBe(true);
        const pad = seg.boosts.find((b) => b.id === `${seg.index}-sp`);
        expect(pad).toBeDefined();
        expect(pad!.z).toBeGreaterThanOrEqual(seg.slider.z0);
        expect(pad!.z).toBeLessThanOrEqual(seg.slider.z1);
      }
    }
  });

  it('never coincides with a route section, a pipe or a drop in the same segment', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const t = createTrack(seed);
      for (let i = 0; i < 60; i++) {
        const seg = t.getSegment(i);
        if (!seg.slider) continue;
        expect(seg.route).toBeNull();
        for (const p of seg.pipes) {
          expect(p.z1 < seg.slider.z0 || p.z0 > seg.slider.z1).toBe(true);
        }
        for (const d of seg.drops) {
          expect(d.z + d.length < seg.slider.z0 || d.z > seg.slider.z1).toBe(true);
        }
      }
    }
  });

  it('keeps the whole suite green: determinism still holds with sliders in the mix', () => {
    const a = createTrack(21), b = createTrack(21);
    for (let i = 0; i < 30; i++) {
      expect(JSON.stringify(a.getSegment(i))).toBe(JSON.stringify(b.getSegment(i)));
    }
  });
});

describe('curved track world bend (centerAt/centerSlopeAt/bendPhases)', () => {
  const MAX_AMP = TRACK_BEND.amp1 + TRACK_BEND.amp2;

  it('is 0 at z=0 (and for every z < 0, the launch pad stays straight)', () => {
    const t = createTrack(5);
    expect(t.centerAt(0)).toBe(0);
    for (const z of [-1, -50, -500]) expect(t.centerAt(z)).toBe(0);
  });

  it('never exceeds the sum of the two amplitudes times the strongest zone\'s bendMul', () => {
    // Per-zone bend strength (canyon design §1) can scale the raw sine sum up (space's bendMul
    // 1.6) or down (city's 0.5), so the bound is the two amplitudes times the largest bendMul
    // across every zone, not the raw amplitude sum on its own.
    const t = createTrack(9);
    const maxMul = Math.max(...ZONES.map((z) => z.bendMul));
    for (let z = 0; z <= 6000; z += 17) {
      expect(Math.abs(t.centerAt(z))).toBeLessThanOrEqual(MAX_AMP * maxMul + 1e-9);
    }
  });

  it('is deterministic for the same seed and differs across seeds', () => {
    const a = createTrack(11), b = createTrack(11), c = createTrack(12);
    expect(a.bendPhases).toEqual(b.bendPhases);
    expect(a.bendPhases).not.toEqual(c.bendPhases);
    for (const z of [10, 300, 1500, 4000]) {
      expect(a.centerAt(z)).toBe(b.centerAt(z));
      expect(a.centerAt(z)).not.toBe(c.centerAt(z));
    }
  });

  it('is smooth: a 1m step changes centerAt by less than 1m', () => {
    const t = createTrack(3);
    for (let z = 0; z < 3000; z += 5) {
      expect(Math.abs(t.centerAt(z + 1) - t.centerAt(z))).toBeLessThan(1);
    }
  });

  it('fully fades in by z = fadeIn, so z=1000 matches the un-faded sine sum', () => {
    const t = createTrack(4);
    const [p1, p2] = bendPhases(4);
    const z = 1000;
    const raw = TRACK_BEND.amp1 * Math.sin((2 * Math.PI * z) / TRACK_BEND.wave1 + p1)
      + TRACK_BEND.amp2 * Math.sin((2 * Math.PI * z) / TRACK_BEND.wave2 + p2);
    expect(t.centerAt(z)).toBeCloseTo(raw, 6);
  });

  it('centerSlopeAt matches the numeric derivative of centerAt', () => {
    const t = createTrack(6);
    for (const z of [10, 200, 1500, 3500]) {
      const num = (t.centerAt(z + 0.05) - t.centerAt(z - 0.05)) / 0.1;
      expect(Math.abs(num - t.centerSlopeAt(z))).toBeLessThan(1e-2);
    }
  });
});

describe('bendMulAt (canyon design §1)', () => {
  it('returns the desert zone\'s own bendMul well past the zone-blend distance', () => {
    expect(bendMulAt(4500)).toBe(1.4);
  });

  it('returns the first zone\'s (snowfield) own bendMul, unblended', () => {
    expect(bendMulAt(50)).toBe(0.6);
  });

  it('is continuous across every zone boundary (1m-step difference stays small)', () => {
    for (const zone of ZONES) {
      if (zone.z0 === 0) continue;
      for (let z = zone.z0 - 5; z < zone.z0 + 150; z += 1) {
        expect(Math.abs(bendMulAt(z + 1) - bendMulAt(z))).toBeLessThan(0.05);
      }
    }
  });
});

describe('canyon sections (canyon design §2)', () => {
  function findCanyon(): { seg: Segment; t: Track } {
    for (let seed = 1; seed <= 40; seed++) {
      const t = createTrack(seed);
      for (let i = 5; i < 60; i++) {
        const seg = t.getSegment(i);
        if (seg.route && seg.route.canyon) return { seg, t };
      }
    }
    throw new Error('no canyon section found');
  }

  it('only appears from canyonMinZ on, as a single full-width hazard lane with no pillars', () => {
    let found = false;
    for (let seed = 1; seed <= 40; seed++) {
      const t = createTrack(seed);
      for (let i = 0; i < 60; i++) {
        const seg = t.getSegment(i);
        if (!seg.route || !seg.route.canyon) continue;
        found = true;
        expect(seg.z0).toBeGreaterThanOrEqual(TRACK_GEN.canyonMinZ);
        expect(seg.route.lanes.length).toBe(1);
        const lane = seg.route.lanes[0];
        expect(lane.kind).toBe('pillars');
        expect(lane.yOffset).toBe(-TRACK_GEN.hazardDepth);
        const w = t.widthAt(seg.route.z0);
        expect(lane.xMin).toBeCloseTo(-w / 2, 6);
        expect(lane.xMax).toBeCloseTo(w / 2, 6);
        expect(seg.route.pillars.length).toBe(0);
      }
    }
    expect(found).toBe(true);
  });

  it('has a RAMP_BIG entry ramp ending 1m before the gap, canyonRampWidth wide, at x=0', () => {
    const { seg } = findCanyon();
    const route = seg.route!;
    const ramp = seg.ramps.find((r) => r.id === `${seg.index}-cr`);
    expect(ramp).toBeDefined();
    expect(ramp!.length).toBe(RAMP_BIG.length);
    expect(ramp!.height).toBe(RAMP_BIG.height);
    expect(ramp!.width).toBe(TRACK_GEN.canyonRampWidth);
    expect(ramp!.x).toBe(0);
    expect(ramp!.z + ramp!.length).toBeCloseTo(route.z0 - 1, 6);
  });

  it('places an arc of coins across the whole gap, x=0, canyonCoinSpacing apart, peaking near canyonCoinLift', () => {
    const { seg } = findCanyon();
    const route = seg.route!;
    const coins = seg.coins.filter((c) => c.id.includes('-cc'));
    expect(coins.length).toBeGreaterThan(0);
    for (const c of coins) {
      expect(c.x).toBe(0);
      expect(c.z).toBeGreaterThanOrEqual(route.z0 - 1e-9);
      expect(c.z).toBeLessThanOrEqual(route.z1 + 1e-9);
      expect(c.lift).toBeGreaterThanOrEqual(-1e-9);
      expect(c.lift).toBeLessThanOrEqual(TRACK_GEN.canyonCoinLift + 1e-9);
    }
    expect(Math.max(...coins.map((c) => c.lift))).toBeGreaterThan(TRACK_GEN.canyonCoinLift * 0.8);
  });
});

describe('stairs sections (canyon design §3)', () => {
  it('places stairsCount equally spaced ramps at the same x/width, never alongside a route or slider', () => {
    let found = false;
    for (let seed = 1; seed <= 40; seed++) {
      const t = createTrack(seed);
      for (let i = 0; i < 60; i++) {
        const seg = t.getSegment(i);
        const stairs = Array.from({ length: TRACK_GEN.stairsCount }, (_, k) => seg.ramps.find((r) => r.id === `${seg.index}-rs${k}`));
        if (stairs.some((r) => !r)) continue;
        found = true;
        for (const r of stairs) {
          expect(r!.x).toBe(0);
          expect(r!.width).toBe(TRACK_GEN.stairsRampWidth);
          expect(r!.length).toBe(RAMP_SMALL.length);
          expect(r!.height).toBe(RAMP_SMALL.height);
        }
        for (let k = 1; k < stairs.length; k++) {
          expect(stairs[k]!.z - stairs[k - 1]!.z).toBeCloseTo(TRACK_GEN.stairsSpacing, 6);
        }
        expect(seg.route).toBeNull();
        expect(seg.slider).toBeNull();
      }
    }
    expect(found).toBe(true);
  });
});
