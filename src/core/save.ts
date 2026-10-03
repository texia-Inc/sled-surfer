import type { Profile } from './types';
import { GOAL, UPGRADE } from './params';
import { GOAL_LEAD, ZONES } from './zones';

export const SAVE_KEY = 'sled-surfer:profile:v1';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function defaultProfile(): Profile {
  return {
    coins: 0,
    bestDistance: 0,
    goalDistance: GOAL.initial,
    upgrades: { slingshot: 0, sled: 0, income: 0 },
  };
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function clampInt(v: unknown, fallback: number, lo: number, hi: number): number {
  const n = num(v, fallback);
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

/** Profiles saved before 2026-10-03 had goal lines ON the zone portals (600, 1200, ...); move
 * such a goal GOAL_LEAD metres back so it sits at the finish banner instead. */
function migrateGoal(goal: number): number {
  return ZONES.some((z) => z.z0 > 0 && z.z0 === goal) ? goal - GOAL_LEAD : goal;
}

export function loadProfile(storage: StorageLike | null): Profile {
  const d = defaultProfile();
  if (!storage) return d;
  let raw: string | null = null;
  try {
    raw = storage.getItem(SAVE_KEY);
  } catch {
    return d;
  }
  if (!raw) return d;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return d;
  }
  if (typeof parsed !== 'object' || parsed === null) return d;
  const o = parsed as Record<string, unknown>;
  const up = (typeof o.upgrades === 'object' && o.upgrades !== null ? o.upgrades : {}) as Record<string, unknown>;
  return {
    coins: clampInt(o.coins, d.coins, 0, Infinity),
    bestDistance: num(o.bestDistance, d.bestDistance),
    goalDistance: migrateGoal(Math.max(GOAL.roundTo, num(o.goalDistance, d.goalDistance))),
    upgrades: {
      slingshot: clampInt(up.slingshot, 0, 0, UPGRADE.maxLevel),
      sled: clampInt(up.sled, 0, 0, UPGRADE.maxLevel),
      income: clampInt(up.income, 0, 0, UPGRADE.maxLevel),
    },
  };
}

export function saveProfile(storage: StorageLike | null, profile: Profile): void {
  if (!storage) return;
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(profile));
  } catch {
    // 保存できない環境では黙って続行する
  }
}
