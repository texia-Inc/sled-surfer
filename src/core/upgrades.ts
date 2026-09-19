import type { Profile, UpgradeKind } from './types';
import { UPGRADE } from './params';

export const UPGRADE_LABELS: Record<UpgradeKind, { name: string; effect: string }> = {
  slingshot: { name: 'SLINGSHOT', effect: '発射速度 +8%' },
  sled: { name: 'SLED', effect: '摩擦と空気抵抗 -3%' },
  income: { name: 'INCOME', effect: 'コイン倍率 +0.25' },
};

export function upgradeCost(kind: UpgradeKind, level: number): number {
  return Math.floor(UPGRADE.baseCost[kind] * Math.pow(UPGRADE.costGrowth, level));
}

export function slingshotMul(level: number): number {
  return 1 + UPGRADE.slingshotPerLevel * level;
}

export function sledMul(level: number): number {
  return 1 - UPGRADE.sledPerLevel * level;
}

export function incomeMul(level: number): number {
  return 1 + UPGRADE.incomePerLevel * level;
}

export function canBuy(profile: Profile, kind: UpgradeKind): boolean {
  const level = profile.upgrades[kind];
  if (level >= UPGRADE.maxLevel) return false;
  return profile.coins >= upgradeCost(kind, level);
}

export function buy(profile: Profile, kind: UpgradeKind): Profile {
  if (!canBuy(profile, kind)) return profile;
  const level = profile.upgrades[kind];
  return {
    ...profile,
    coins: profile.coins - upgradeCost(kind, level),
    upgrades: { ...profile.upgrades, [kind]: level + 1 },
  };
}
