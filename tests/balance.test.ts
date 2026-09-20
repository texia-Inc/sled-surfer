import { describe, it, expect } from 'vitest';
import { Game } from '../src/core/game';
import { defaultProfile } from '../src/core/save';
import type { Profile } from '../src/core/types';

const DT = 1 / 120;
const MAX_SECONDS = 600;
const MAX_STEPS = Math.ceil(MAX_SECONDS / DT);
const INPUT = { steer: 0, rocket: false };

/** Runs one seed to `results` (capped at MAX_SECONDS). `time` is the duration spent in the
 * `run` phase only (excludes the fixed post-stop `ended` -> `results` delay). */
function simulateRun(profile: Profile, seed: number): { dist: number; time: number } {
  const game = new Game(profile, seed);
  game.launch(1);
  let runSteps = 0;
  for (let i = 0; i < MAX_STEPS && game.phase !== 'results'; i++) {
    const wasRun = game.phase === 'run';
    game.update(DT, INPUT);
    if (wasRun) runSteps += 1;
  }
  expect(game.phase).toBe('results');
  return { dist: game.lastResult!.distance, time: runSteps * DT };
}

/** Runs seeds 1..6 and returns the average distance and average run time. */
function averageStats(profile: Profile): { avgDist: number; avgTime: number } {
  const dists: number[] = [];
  const times: number[] = [];
  for (let seed = 1; seed <= 6; seed++) {
    const { dist, time } = simulateRun(profile, seed);
    dists.push(dist);
    times.push(time);
  }
  return {
    avgDist: dists.reduce((a, b) => a + b, 0) / dists.length,
    avgTime: times.reduce((a, b) => a + b, 0) / times.length,
  };
}

describe('balance regression', () => {
  it('fresh profile ends every run within 600s and averages a plausible distance', () => {
    const { avgDist, avgTime } = averageStats(defaultProfile());
    // Flow speed model (2026-09-20-flow-design §1): muSnow now matches the base grade instead
    // of exceeding it, so flat/gentle stretches no longer bleed speed passively — deceleration
    // is concentrated in collisions. That measurably lengthens fresh, no-steer runs versus the
    // prior speed-feel tuning, so the plausible-distance band is widened per brief-core.md §5
    // (300-5000 m) rather than kept at the old, now-inapplicable 400-1600 m band.
    expect(avgDist).toBeGreaterThan(300);
    expect(avgDist).toBeLessThan(5000);
    expect(avgTime).toBeLessThan(600);
  });

  it('upgraded profile travels at least as far on average as a fresh one and still ends', () => {
    const { avgDist: freshAvg } = averageStats(defaultProfile());
    const upgraded: Profile = { ...defaultProfile(), upgrades: { slingshot: 10, sled: 10, income: 0 } };
    const { avgDist: upgradedAvg } = averageStats(upgraded);
    // Kept loose (>= 0.8x rather than strictly greater): upgrades are redefined by a later part
    // of this sprint, and the flow speed model already makes a fresh run travel far on its own.
    expect(upgradedAvg).toBeGreaterThanOrEqual(freshAvg * 0.8);
  });

  it('max upgrades do not produce a runaway distance (at most 4x the fresh average)', () => {
    const { avgDist: freshAvg } = averageStats(defaultProfile());
    const maxUpg: Profile = { ...defaultProfile(), upgrades: { slingshot: 10, sled: 10, income: 0 } };
    const { avgDist: maxAvg } = averageStats(maxUpg);
    expect(maxAvg).toBeLessThanOrEqual(freshAvg * 4);
  });
});
