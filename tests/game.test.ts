import { describe, it, expect } from 'vitest';
import { Game, computeResult, applyResult } from '../src/core/game';
import { defaultProfile } from '../src/core/save';
import { createRunState } from '../src/core/physics';
import { GOAL, ECONOMY } from '../src/core/params';
import type { Profile } from '../src/core/types';

const NO_INPUT = { steer: 0, rocket: false };

function runUntil(game: Game, pred: () => boolean, maxSeconds = 600): void {
  const dt = 1 / 120;
  for (let t = 0; t < maxSeconds && !pred(); t += dt) game.update(dt, NO_INPUT);
}

describe('computeResult', () => {
  it('sums coins and distance with income multiplier and goal bonus', () => {
    const p: Profile = { ...defaultProfile(), goalDistance: 100, upgrades: { slingshot: 0, sled: 0, income: 4 } };
    const run = createRunState({ v0: 0, angleDeg: 0, rockets: 0, groundY: 0 });
    run.coinsThisRun = 10;
    run.distance = 250;
    const r = computeResult(p, run);
    expect(r.coinsCollected).toBe(10);
    expect(r.distanceCoins).toBe(25);
    expect(r.goalReached).toBe(true);
    expect(r.earned).toBe(Math.floor((10 + 25) * 2 * ECONOMY.goalBonusMul));
    expect(r.newBest).toBe(true);
  });

  it('applyResult adds coins, updates best, and grows the goal', () => {
    const p: Profile = { ...defaultProfile(), coins: 5, bestDistance: 300, goalDistance: 1000 };
    const run = createRunState({ v0: 0, angleDeg: 0, rockets: 0, groundY: 0 });
    run.distance = 1200;
    const r = computeResult(p, run);
    const after = applyResult(p, r);
    expect(after.coins).toBe(5 + r.earned);
    expect(after.bestDistance).toBe(1200);
    expect(after.goalDistance).toBe(1500);
    expect(p.goalDistance).toBe(1000);
  });

  it('rounds the grown goal up to GOAL.roundTo', () => {
    const p: Profile = { ...defaultProfile(), goalDistance: 1010 };
    const run = createRunState({ v0: 0, angleDeg: 0, rockets: 0, groundY: 0 });
    run.distance = 2000;
    const after = applyResult(p, computeResult(p, run));
    expect(after.goalDistance).toBe(Math.ceil((1010 * GOAL.growth) / GOAL.roundTo) * GOAL.roundTo);
  });
});

describe('Game', () => {
  it('walks aim -> run -> ended -> results -> aim and saves once per run', () => {
    const saves: Profile[] = [];
    const game = new Game(defaultProfile(), 1, { onProfileChange: (p) => saves.push(p), endedDelay: 0.2 });
    expect(game.phase).toBe('aim');
    game.launch(1);
    expect(game.phase).toBe('run');
    expect(game.run).not.toBeNull();
    runUntil(game, () => game.phase !== 'run');
    expect(game.phase).toBe('ended');
    runUntil(game, () => game.phase === 'results', 2);
    expect(game.phase).toBe('results');
    expect(game.lastResult).not.toBeNull();
    expect(game.lastResult!.distance).toBeGreaterThan(20);
    expect(saves.length).toBe(1);
    expect(game.profile.coins).toBe(saves[0].coins);
    expect(game.profile.coins).toBeGreaterThan(0);
    const seed = game.track.seed;
    game.restart();
    expect(game.phase).toBe('aim');
    expect(game.run).toBeNull();
    expect(game.track.seed).not.toBe(seed);
  });

  it('ignores launch outside aim and update outside run', () => {
    const game = new Game(defaultProfile(), 1);
    game.update(0.1, NO_INPUT);
    expect(game.phase).toBe('aim');
    game.launch(0.5);
    game.launch(1);
    expect(game.phase).toBe('run');
  });

  it('buy updates profile and saves', () => {
    const saves: Profile[] = [];
    const game = new Game({ ...defaultProfile(), coins: 100 }, 1, { onProfileChange: (p) => saves.push(p) });
    expect(game.buy('sled')).toBe(true);
    expect(game.profile.upgrades.sled).toBe(1);
    expect(game.profile.coins).toBe(50);
    expect(saves.length).toBe(1);
    expect(game.buy('income')).toBe(false);
    expect(saves.length).toBe(1);
  });

  it('applies sled upgrade to physics params', () => {
    const game = new Game({ ...defaultProfile(), upgrades: { slingshot: 0, sled: 10, income: 0 } }, 1);
    expect(game.physicsParams().frictionMul).toBeCloseTo(0.7);
    expect(game.physicsParams().dragMul).toBeCloseTo(0.7);
  });

  it('launches faster with slingshot upgrades', () => {
    const weak = new Game(defaultProfile(), 1);
    const strong = new Game({ ...defaultProfile(), upgrades: { slingshot: 10, sled: 0, income: 0 } }, 1);
    weak.launch(1);
    strong.launch(1);
    expect(strong.run!.vz).toBeGreaterThan(weak.run!.vz);
  });
});
