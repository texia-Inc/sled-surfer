import { describe, it, expect } from 'vitest';
import { zoneAt, zoneIndex, ZONE_GOALS } from '../src/core/zones';
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
    expect(ZONE_GOALS[0]).toBe(450);
    expect(nextGoal(600)).toBe(1050);
    expect(nextGoal(1300)).toBe(1850);
    expect(nextGoal(3500)).toBe(3850);
    expect(nextGoal(3000)).toBe(3850);
  });

  it('stepAfter increments stay round', () => {
    expect(nextGoal(6000)).toBe(7000);
    expect(GOAL.stepAfter).toBe(1000);
  });
});

describe('art zones', () => {
  it('desert and space goals follow the volcano goal', () => {
    expect(nextGoal(4500)).toBe(4850);
    expect(nextGoal(5500)).toBe(5850);
  });
});
