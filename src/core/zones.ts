import type { ObstacleKind, Surface, ZoneId } from './types';

export interface ZoneDef {
  id: ZoneId;
  nameJa: string;
  z0: number;
  surface: Surface;                 // default surface for the zone
  obstacleKinds: ObstacleKind[];
  iceChance: number;
  boostChance: number;
  bumpScale: number;
  obstacleDensityMul: number;       // multiplies the obstacle count
}

export const ZONES: readonly ZoneDef[] = [
  {
    id: 'snowfield', nameJa: '雪山', z0: 0, surface: 'snow',
    obstacleKinds: ['tree', 'rock', 'snowman'],
    iceChance: 0.5, boostChance: 0.8, bumpScale: 1.0, obstacleDensityMul: 1.0,
  },
  {
    id: 'forest', nameJa: '森', z0: 600, surface: 'snow',
    obstacleKinds: ['tree', 'tree', 'stump', 'rock'],
    iceChance: 0.3, boostChance: 0.7, bumpScale: 1.0, obstacleDensityMul: 1.3,
  },
  {
    id: 'city', nameJa: '市街地', z0: 1200, surface: 'road',
    obstacleKinds: ['car', 'car', 'bus', 'sign', 'barrier'],
    iceChance: 0, boostChance: 0.6, bumpScale: 0.5, obstacleDensityMul: 1.0,
  },
  {
    id: 'cave', nameJa: '洞窟', z0: 2000, surface: 'snow',
    obstacleKinds: ['stalagmite', 'stalagmite', 'crystal', 'rock'],
    iceChance: 0.7, boostChance: 0.8, bumpScale: 1.2, obstacleDensityMul: 1.1,
  },
];

/** Last zone with z0 <= z (z < 0 returns snowfield). */
export function zoneAt(z: number): ZoneDef {
  let found = ZONES[0];
  for (const zone of ZONES) {
    if (zone.z0 <= z) found = zone;
    else break;
  }
  return found;
}

export function zoneIndex(id: ZoneId): number {
  return ZONES.findIndex((z) => z.id === id);
}

/** Distance milestones for goalDistance; after the last one, +GOAL.stepAfter each. */
export const ZONE_GOALS = [600, 1200, 2000, 3000];
