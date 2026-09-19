import type { Input, Phase, Profile, RunResult, RunState, Track, UpgradeKind } from './types';
import { DEFAULT_PHYSICS, ECONOMY, GOAL, LAUNCH, type PhysicsParams } from './params';
import { createRunState, launchSpeed, stepRun } from './physics';
import { createTrack } from './track';
import { buy as buyUpgrade, incomeMul, sledMul, slingshotMul } from './upgrades';

export function computeResult(profile: Profile, run: RunState): RunResult {
  const distance = run.distance;
  const distanceCoins = Math.floor(distance / ECONOMY.distanceCoinDivisor);
  const goalReached = distance >= profile.goalDistance;
  const mul = incomeMul(profile.upgrades.income) * (goalReached ? ECONOMY.goalBonusMul : 1);
  return {
    distance,
    coinsCollected: run.coinsThisRun,
    distanceCoins,
    earned: Math.floor((run.coinsThisRun + distanceCoins) * mul),
    newBest: distance > profile.bestDistance,
    goalReached,
  };
}

export function applyResult(profile: Profile, result: RunResult): Profile {
  let goal = profile.goalDistance;
  if (result.goalReached) {
    goal = Math.ceil((goal * GOAL.growth) / GOAL.roundTo) * GOAL.roundTo;
  }
  return {
    ...profile,
    coins: profile.coins + result.earned,
    bestDistance: Math.max(profile.bestDistance, result.distance),
    goalDistance: goal,
  };
}

export interface GameOptions {
  onProfileChange?: (p: Profile) => void;
  /** ended から results へ移るまでの秒数 */
  endedDelay?: number;
}

export class Game {
  phase: Phase = 'aim';
  profile: Profile;
  track: Track;
  run: RunState | null = null;
  lastResult: RunResult | null = null;
  pull = 0;
  private runCount = 0;
  private endedTimer = 0;
  private readonly baseSeed: number;
  private readonly onProfileChange: (p: Profile) => void;
  private readonly endedDelay: number;

  constructor(profile: Profile, baseSeed: number, opts: GameOptions = {}) {
    this.profile = profile;
    this.baseSeed = baseSeed;
    this.track = createTrack(baseSeed);
    this.onProfileChange = opts.onProfileChange ?? (() => {});
    this.endedDelay = opts.endedDelay ?? 1.0;
  }

  physicsParams(): PhysicsParams {
    const m = sledMul(this.profile.upgrades.sled);
    return { ...DEFAULT_PHYSICS, frictionMul: m, dragMul: m };
  }

  launch(pull: number): void {
    if (this.phase !== 'aim') return;
    const v0 = launchSpeed(pull, slingshotMul(this.profile.upgrades.slingshot));
    this.run = createRunState({
      v0,
      angleDeg: LAUNCH.angleDeg,
      rockets: LAUNCH.rocketsPerRun,
      groundY: this.track.heightAt(0),
    });
    this.pull = 0;
    this.phase = 'run';
  }

  update(dt: number, input: Input): void {
    if (this.phase === 'run' && this.run) {
      stepRun(this.run, input, dt, this.track, this.physicsParams());
      if (this.run.ended) {
        this.phase = 'ended';
        this.endedTimer = 0;
      }
      return;
    }
    if (this.phase === 'ended' && this.run) {
      this.endedTimer += dt;
      if (this.endedTimer >= this.endedDelay) {
        const result = computeResult(this.profile, this.run);
        this.lastResult = result;
        this.profile = applyResult(this.profile, result);
        this.onProfileChange(this.profile);
        this.phase = 'results';
      }
    }
  }

  buy(kind: UpgradeKind): boolean {
    const next = buyUpgrade(this.profile, kind);
    if (next === this.profile) return false;
    this.profile = next;
    this.onProfileChange(this.profile);
    return true;
  }

  restart(): void {
    if (this.phase !== 'results') return;
    this.runCount += 1;
    this.track = createTrack(this.baseSeed + this.runCount * 7919);
    this.run = null;
    this.lastResult = null;
    this.phase = 'aim';
  }
}
