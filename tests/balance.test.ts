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
  it('fresh profile ends every run and averages a plausible distance and time', () => {
    const { avgDist, avgTime } = averageStats(defaultProfile());
    expect(avgDist).toBeGreaterThan(300);
    expect(avgDist).toBeLessThan(900);
    expect(avgTime).toBeLessThan(60);
  });

  it('upgraded profile travels farther on average than a fresh one and still ends', () => {
    const { avgDist: freshAvg } = averageStats(defaultProfile());
    const upgraded: Profile = { ...defaultProfile(), upgrades: { slingshot: 10, sled: 10, income: 0 } };
    const { avgDist: upgradedAvg } = averageStats(upgraded);
    expect(upgradedAvg).toBeGreaterThan(freshAvg);
  });

  it('max upgrades do not produce a runaway distance (at most 4x the fresh average)', () => {
    const { avgDist: freshAvg } = averageStats(defaultProfile());
    const maxUpg: Profile = { ...defaultProfile(), upgrades: { slingshot: 10, sled: 10, income: 0 } };
    const { avgDist: maxAvg } = averageStats(maxUpg);
    expect(maxAvg).toBeLessThanOrEqual(freshAvg * 4);
  });
});
