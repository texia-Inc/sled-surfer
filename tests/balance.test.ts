import { describe, it, expect } from 'vitest';
import { Game } from '../src/core/game';
import { defaultProfile } from '../src/core/save';
import type { Profile } from '../src/core/types';

const DT = 1 / 120;
const MAX_SECONDS = 600;
const MAX_STEPS = Math.ceil(MAX_SECONDS / DT);
const INPUT = { steer: 0, rocket: false };

/** Runs seeds 1..6 to `results` (capped at MAX_SECONDS) and returns the average distance.
 * Asserts every run actually ended within the cap. */
function averageDistance(profile: Profile): number {
  const distances: number[] = [];
  for (let seed = 1; seed <= 6; seed++) {
    const game = new Game(profile, seed);
    game.launch(1);
    for (let i = 0; i < MAX_STEPS && game.phase !== 'results'; i++) {
      game.update(DT, INPUT);
    }
    expect(game.phase).toBe('results');
    distances.push(game.lastResult!.distance);
  }
  return distances.reduce((a, b) => a + b, 0) / distances.length;
}

describe('balance regression', () => {
  it('fresh profile ends every run and averages a plausible distance', () => {
    const freshAvg = averageDistance(defaultProfile());
    expect(freshAvg).toBeGreaterThan(300);
    expect(freshAvg).toBeLessThan(800);
  });

  it('upgraded profile travels farther on average than a fresh one and still ends', () => {
    const freshAvg = averageDistance(defaultProfile());
    const upgraded: Profile = { ...defaultProfile(), upgrades: { slingshot: 10, sled: 10, income: 0 } };
    const upgradedAvg = averageDistance(upgraded);
    expect(upgradedAvg).toBeGreaterThan(freshAvg);
  });
});
