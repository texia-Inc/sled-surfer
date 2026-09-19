import { describe, it, expect } from 'vitest';
import { upgradeCost, canBuy, buy, slingshotMul, sledMul, incomeMul } from '../src/core/upgrades';
import { defaultProfile } from '../src/core/save';
import { UPGRADE } from '../src/core/params';

describe('upgrade costs', () => {
  it('grow geometrically per level', () => {
    expect(upgradeCost('slingshot', 0)).toBe(40);
    expect(upgradeCost('slingshot', 1)).toBe(64);
    expect(upgradeCost('sled', 0)).toBe(50);
    expect(upgradeCost('income', 0)).toBe(60);
    expect(upgradeCost('income', 2)).toBeGreaterThan(upgradeCost('income', 1));
  });
});

describe('upgrade effects', () => {
  it('match the spec multipliers', () => {
    expect(slingshotMul(0)).toBe(1);
    expect(slingshotMul(5)).toBeCloseTo(1.4);
    expect(sledMul(0)).toBe(1);
    expect(sledMul(10)).toBeCloseTo(0.7);
    expect(incomeMul(4)).toBeCloseTo(2);
  });
});

describe('buy', () => {
  it('requires enough coins and respects max level', () => {
    const poor = defaultProfile();
    expect(canBuy(poor, 'slingshot')).toBe(false);
    expect(buy(poor, 'slingshot')).toBe(poor);

    const rich = { ...defaultProfile(), coins: 100 };
    expect(canBuy(rich, 'slingshot')).toBe(true);
    const after = buy(rich, 'slingshot');
    expect(after).not.toBe(rich);
    expect(after.coins).toBe(60);
    expect(after.upgrades.slingshot).toBe(1);
    expect(rich.upgrades.slingshot).toBe(0);

    const maxed = { ...defaultProfile(), coins: 1e9, upgrades: { slingshot: UPGRADE.maxLevel, sled: 0, income: 0 } };
    expect(canBuy(maxed, 'slingshot')).toBe(false);
  });
});
