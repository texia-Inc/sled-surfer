import { describe, it, expect } from 'vitest';
import { loadProfile, saveProfile, defaultProfile, SAVE_KEY, type StorageLike } from '../src/core/save';

function memoryStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => { data.set(k, v); },
  };
}

describe('save', () => {
  it('round-trips a profile', () => {
    const st = memoryStorage();
    const p = { ...defaultProfile(), coins: 123, bestDistance: 456, upgrades: { slingshot: 2, sled: 1, income: 3 } };
    saveProfile(st, p);
    expect(st.data.has(SAVE_KEY)).toBe(true);
    expect(loadProfile(st)).toEqual(p);
  });

  it('returns defaults for missing, corrupt, or partial data', () => {
    const st = memoryStorage();
    expect(loadProfile(st)).toEqual(defaultProfile());
    st.setItem(SAVE_KEY, '{not json');
    expect(loadProfile(st)).toEqual(defaultProfile());
    st.setItem(SAVE_KEY, JSON.stringify({ coins: 5 }));
    const p = loadProfile(st);
    expect(p.coins).toBe(5);
    expect(p.goalDistance).toBe(defaultProfile().goalDistance);
    expect(p.upgrades).toEqual({ slingshot: 0, sled: 0, income: 0 });
  });

  it('tolerates a null storage', () => {
    expect(loadProfile(null)).toEqual(defaultProfile());
    expect(() => saveProfile(null, defaultProfile())).not.toThrow();
  });
});
