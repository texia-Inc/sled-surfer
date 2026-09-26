import * as THREE from 'three';
import type { ZoneId } from '../core/types';
import { ZONES, zoneAt, zoneIndex } from '../core/zones';

/** Metres over which colours linearly blend from the previous zone's theme after a zone start. */
const BLEND_METERS = 60;

export interface ZoneTheme {
  ground: THREE.Color;
  ice: THREE.Color;
  bank: THREE.Color;
  sky: THREE.Color;
  fog: THREE.Color;
  fogNear: number;
  fogFar: number;
  gate: THREE.Color;
}

export const ZONE_THEMES: Record<ZoneId, ZoneTheme> = {
  snowfield: {
    ground: new THREE.Color(0.97, 0.98, 1.0),
    ice: new THREE.Color(0.7, 0.88, 1.0),
    bank: new THREE.Color(0.82, 0.88, 0.95),
    sky: new THREE.Color(0x8ecdf5),
    fog: new THREE.Color(0x8ecdf5),
    fogNear: 60,
    fogFar: 320,
    gate: new THREE.Color(0x2bd8ff),
  },
  forest: {
    ground: new THREE.Color(0.92, 0.95, 0.93),
    ice: new THREE.Color(0.72, 0.9, 0.96),
    bank: new THREE.Color(0.35, 0.55, 0.38),
    sky: new THREE.Color(0x9fd3e8),
    fog: new THREE.Color(0xb7dde9),
    fogNear: 50,
    fogFar: 320,
    gate: new THREE.Color(0x3fa35a),
  },
  city: {
    ground: new THREE.Color(0.28, 0.29, 0.32),
    ice: new THREE.Color(0.7, 0.88, 1.0),
    bank: new THREE.Color(0.55, 0.56, 0.6),
    sky: new THREE.Color(0xc9d6e2),
    fog: new THREE.Color(0xd6dee6),
    fogNear: 70,
    fogFar: 320,
    gate: new THREE.Color(0xffb347),
  },
  cave: {
    ground: new THREE.Color(0.3, 0.34, 0.44),
    ice: new THREE.Color(0.55, 0.75, 0.95),
    bank: new THREE.Color(0.18, 0.2, 0.28),
    sky: new THREE.Color(0x141a2b),
    fog: new THREE.Color(0x1c2438),
    fogNear: 25,
    fogFar: 180,
    gate: new THREE.Color(0xb388ff),
  },
  volcano: {
    ground: new THREE.Color(0.32, 0.26, 0.24),
    ice: new THREE.Color(0.62, 0.80, 0.92),
    bank: new THREE.Color(0.12, 0.10, 0.11),
    sky: new THREE.Color(0x6b4a7a),
    fog: new THREE.Color(0x8a6a8f),
    fogNear: 40,
    fogFar: 260,
    gate: new THREE.Color(0xff6a2b),
  },
};

/** The theme of the zone containing distance `z`. */
export function themeAt(z: number): ZoneTheme {
  return ZONE_THEMES[zoneAt(z).id];
}

/**
 * Blends `pick`'s colour from the previous zone's theme to the current zone's theme, linearly
 * over the first BLEND_METERS of the current zone (so the transition happens right after each
 * zone start, not at the earlier zone's boundary). Writes into and returns `out`.
 */
export function blendedThemeColor(z: number, pick: (t: ZoneTheme) => THREE.Color, out: THREE.Color): THREE.Color {
  const cur = zoneAt(z);
  const idx = zoneIndex(cur.id);
  const into = z - cur.z0;
  if (idx <= 0 || into >= BLEND_METERS) {
    return out.copy(pick(ZONE_THEMES[cur.id]));
  }
  const prev = ZONES[idx - 1];
  const t = into / BLEND_METERS;
  return out.copy(pick(ZONE_THEMES[prev.id])).lerp(pick(ZONE_THEMES[cur.id]), t);
}
