import { describe, it, expect } from 'vitest';
import { Game } from '../src/core/game';
import { defaultProfile } from '../src/core/save';
import type { Profile } from '../src/core/types';

const DT = 1 / 120;
const MAX_SECONDS = 600;
const MAX_STEPS = Math.ceil(MAX_SECONDS / DT);
const INPUT = { steer: 0, rocket: false };

/** Runs one seed to `results` (capped at MAX_SECONDS, i.e. the game's own "ends within 600s"
 * requirement: every run must reach `results` - by finishing at the goal line or by stopping -
 * before this cap). */
function simulateRun(profile: Profile, seed: number): { dist: number; finished: boolean } {
  const game = new Game(profile, seed);
  game.launch(1);
  for (let i = 0; i < MAX_STEPS && game.phase !== 'results'; i++) game.update(DT, INPUT);
  expect(game.phase).toBe('results');
  return { dist: game.lastResult!.distance, finished: game.lastResult!.finished };
}

/** Runs seeds 1..6 and returns how many finished (reached goalDistance) vs. stopped short. */
function finishCount(profile: Profile): number {
  let finished = 0;
  for (let seed = 1; seed <= 6; seed++) {
    if (simulateRun(profile, seed).finished) finished += 1;
  }
  return finished;
}

describe('balance regression', () => {
  // The real game ends a run at the goal line (100% on the progress bar), not by speed decay -
  // a run that never slows down (e.g. one that keeps chaining ramp/pad boosts) is a win, not a
  // bug. So instead of an average-distance band (distance is now capped by goalDistance), these
  // assert the game's actual termination contract: every seed reaches `results` within 600s
  // (finish or stop - enforced per-seed inside simulateRun), and most seeds actually finish
  // (reach the goal) rather than stopping short, for both a fresh and an upgraded profile.

  it('a fresh profile (goal 600, the default) finishes at least half of 6 seeds within 600s', () => {
    const finished = finishCount(defaultProfile());
    expect(finished).toBeGreaterThanOrEqual(3);
  });

  it('an upgraded profile (slingshot10/sled10, goal 2000) finishes at least half of 6 seeds within 600s', () => {
    const upgraded: Profile = {
      ...defaultProfile(), goalDistance: 2000, upgrades: { slingshot: 10, sled: 10, income: 0 },
    };
    const finished = finishCount(upgraded);
    expect(finished).toBeGreaterThanOrEqual(3);
  });
});
