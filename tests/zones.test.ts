import { describe, it, expect } from 'vitest';
import { zoneAt, zoneIndex, ZONE_GOALS, ZONES } from '../src/core/zones';
import { nextGoal } from '../src/core/game';
import { GOAL } from '../src/core/params';

describe('zoneAt', () => {
  it('returns the zone whose z0 is the largest not exceeding z', () => {
    expect(zoneAt(-5).id).toBe('snowfield');
    expect(zoneAt(0).id).toBe('snowfield');
    expect(zoneAt(599).id).toBe('snowfield');
    expect(zoneAt(600).id).toBe('forest');
    expect(zoneAt(1199).id).toBe('forest');
    expect(zoneAt(1200).id).toBe('city');
    expect(zoneAt(1999).id).toBe('city');
    expect(zoneAt(2000).id).toBe('cave');
    expect(zoneAt(2999).id).toBe('cave');
    expect(zoneAt(3000).id).toBe('volcano');
    expect(zoneAt(3999).id).toBe('volcano');
    expect(zoneAt(4000).id).toBe('desert');
    expect(zoneAt(4999).id).toBe('desert');
    expect(zoneAt(5000).id).toBe('space');
    expect(zoneAt(9000).id).toBe('space');
  });
});

describe('zoneIndex', () => {
  it('returns the index of a zone within ZONES', () => {
    expect(zoneIndex('snowfield')).toBe(0);
    expect(zoneIndex('forest')).toBe(1);
    expect(zoneIndex('city')).toBe(2);
    expect(zoneIndex('cave')).toBe(3);
    expect(zoneIndex('volcano')).toBe(4);
    expect(zoneIndex('desert')).toBe(5);
    expect(zoneIndex('space')).toBe(6);
  });
});

describe('nextGoal', () => {
  it('steps through zone milestones then by GOAL.stepAfter', () => {
    expect(nextGoal(0)).toBe(ZONE_GOALS[0]);
    expect(nextGoal(600)).toBe(1200);
    expect(nextGoal(1300)).toBe(2000);
    expect(nextGoal(3500)).toBe(4000);
    expect(nextGoal(3000)).toBe(4000);
  });

  it('stepAfter increments stay round', () => {
    expect(nextGoal(4500)).toBe(5000);
    expect(GOAL.stepAfter).toBe(1000);
  });
});

describe('art zones', () => {
  it('desert and space goals follow the volcano goal', () => {
    expect(nextGoal(4500)).toBe(5000);
    expect(nextGoal(5500)).toBe(6000);
  });
});

describe('per-zone bend strength (canyon design §1)', () => {
  it('matches the design doc\'s bendMul per zone', () => {
    const expected: Record<string, number> = {
      snowfield: 0.6, forest: 1.0, city: 0.5, cave: 1.0, volcano: 1.0, desert: 1.4, space: 1.6,
    };
    for (const zone of ZONES) expect(zone.bendMul).toBe(expected[zone.id]);
  });
});
