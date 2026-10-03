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
  /** Multiplies TRACK_GEN.pipeChance (art §1). */
  pipeChanceMul: number;
  /** Whether distant cliff decor is generated in this zone (art §1). */
  cliffs: boolean;
}

export const ZONES: readonly ZoneDef[] = [
  {
    id: 'snowfield', nameJa: '雪山', z0: 0, surface: 'snow',
    obstacleKinds: ['tree', 'rock', 'snowman', 'crate'],
    iceChance: 0.5, boostChance: 0.8, bumpScale: 1.0, obstacleDensityMul: 1.0, pipeChanceMul: 1, cliffs: true,
  },
  {
    id: 'forest', nameJa: '森', z0: 600, surface: 'snow',
    obstacleKinds: ['tree', 'stump', 'rock', 'fence', 'hay'],
    iceChance: 0.3, boostChance: 0.7, bumpScale: 1.0, obstacleDensityMul: 1.3, pipeChanceMul: 1, cliffs: true,
  },
  {
    id: 'city', nameJa: '市街地', z0: 1200, surface: 'road',
    obstacleKinds: ['car', 'bus', 'sign', 'barrier', 'crate'],
    iceChance: 0, boostChance: 0.6, bumpScale: 0.5, obstacleDensityMul: 1.0, pipeChanceMul: 1, cliffs: true,
  },
  {
    id: 'cave', nameJa: '洞窟', z0: 2000, surface: 'snow',
    obstacleKinds: ['stalagmite', 'crystal', 'rock', 'crate'],
    iceChance: 0.7, boostChance: 0.8, bumpScale: 1.2, obstacleDensityMul: 1.1, pipeChanceMul: 1, cliffs: true,
  },
  {
    id: 'volcano', nameJa: '火山の遺跡', z0: 3000, surface: 'snow',
    obstacleKinds: ['totem', 'rock', 'crate', 'palm'],
    iceChance: 0.2, boostChance: 0.8, bumpScale: 1.0, obstacleDensityMul: 1.0, pipeChanceMul: 1, cliffs: true,
  },
  {
    id: 'desert', nameJa: '砂漠', z0: 4000, surface: 'sand',
    obstacleKinds: ['cactus', 'rock', 'crate'],
    iceChance: 0.15, boostChance: 0.8, bumpScale: 0.8, obstacleDensityMul: 0.9, pipeChanceMul: 0.5, cliffs: false,
  },
  {
    id: 'space', nameJa: '宇宙', z0: 5000, surface: 'ice',
    obstacleKinds: ['asteroid', 'satellite', 'crate'],
    iceChance: 0, boostChance: 0.9, bumpScale: 0.6, obstacleDensityMul: 0.8, pipeChanceMul: 2.5, cliffs: false,
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
/** Goal lines sit this many metres BEFORE each zone portal, so a run ends at the checkered
 * finish banner and never on the ring itself (the portal is a pass-through, not a finish). */
export const GOAL_LEAD = 150;
export const ZONE_GOALS = [...ZONES.slice(1).map((z) => z.z0 - GOAL_LEAD), 6000 - GOAL_LEAD];
