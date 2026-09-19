import type { Profile } from './types';
import { GOAL } from './params';

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
    coins: num(o.coins, d.coins),
    bestDistance: num(o.bestDistance, d.bestDistance),
    goalDistance: num(o.goalDistance, d.goalDistance),
    upgrades: {
      slingshot: num(up.slingshot, 0),
      sled: num(up.sled, 0),
      income: num(up.income, 0),
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
