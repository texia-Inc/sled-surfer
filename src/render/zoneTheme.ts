import * as THREE from 'three';
import type { ZoneDef } from '../core/zones';
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

/** Procedural sky dome parameters for a zone (render §3). Directions are unit vectors. */
export interface SkyTheme {
  zenith: THREE.Color;
  horizon: THREE.Color;
  ground: THREE.Color;
  sunDir: THREE.Vector3;
  sunColor: THREE.Color;
  /** Angular radius of the sun disc, in radians. 0 means no visible sun (sunColor is black). */
  sunSize: number;
  cloudAmount: number;
  /** Star field brightness, 0..1. */
  stars: number;
  /** Planet visibility, 0..1 (space zone only; 0 elsewhere). */
  planet: number;
  planetDir: THREE.Vector3;
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
  desert: {
    ground: new THREE.Color(0.93, 0.78, 0.45),
    ice: new THREE.Color(0.88, 0.82, 0.62),
    bank: new THREE.Color(0.82, 0.58, 0.28),
    sky: new THREE.Color(0xffb347),
    fog: new THREE.Color(0xf2b46a),
    fogNear: 80,
    fogFar: 340,
    gate: new THREE.Color(0xffc857),
  },
  space: {
    ground: new THREE.Color(0.82, 0.90, 1.0),
    ice: new THREE.Color(0.75, 0.88, 1.0),
    /** Pure black = void: the terrain shader discards these fragments so the sky dome shows
     * through beside the track (see terrain.ts VOID_THRESHOLD). */
    bank: new THREE.Color(0, 0, 0),
    sky: new THREE.Color(0x05060f),
    fog: new THREE.Color(0x0a0d1f),
    fogNear: 140,
    fogFar: 380,
    gate: new THREE.Color(0x9ad8ff),
  },
};

/** Procedural sky dome theme per zone (render §3). `sunDir`/`planetDir` are unit vectors. */
export const SKY_THEMES: Record<ZoneId, SkyTheme> = {
  snowfield: {
    zenith: new THREE.Color(0x3f8fd8),
    horizon: new THREE.Color(0xbfe3f7),
    ground: new THREE.Color(0x8fb9d6),
    sunDir: new THREE.Vector3(0.35, 0.82, -0.45).normalize(),
    sunColor: new THREE.Color(0xfff6e0),
    sunSize: 0.045,
    cloudAmount: 0.5,
    stars: 0,
    planet: 0,
    planetDir: new THREE.Vector3(0, -1, 0),
  },
  forest: {
    zenith: new THREE.Color(0x4a97d6),
    horizon: new THREE.Color(0xc7e8f5),
    ground: new THREE.Color(0x8fb8a0),
    sunDir: new THREE.Vector3(0.3, 0.8, -0.5).normalize(),
    sunColor: new THREE.Color(0xfff2d0),
    sunSize: 0.045,
    cloudAmount: 0.6,
    stars: 0,
    planet: 0,
    planetDir: new THREE.Vector3(0, -1, 0),
  },
  city: {
    zenith: new THREE.Color(0x9fb4c4),
    horizon: new THREE.Color(0xd8e2ea),
    ground: new THREE.Color(0x8a8f94),
    sunDir: new THREE.Vector3(0.2, 0.7, -0.68).normalize(),
    sunColor: new THREE.Color(0xffffff),
    sunSize: 0.05,
    cloudAmount: 0.45,
    stars: 0,
    planet: 0,
    planetDir: new THREE.Vector3(0, -1, 0),
  },
  cave: {
    zenith: new THREE.Color(0x05070f),
    horizon: new THREE.Color(0x1a2238),
    ground: new THREE.Color(0x0d101c),
    sunDir: new THREE.Vector3(0, 1, 0),
    sunColor: new THREE.Color(0x000000),
    sunSize: 0,
    cloudAmount: 0,
    stars: 0.6,
    planet: 0,
    planetDir: new THREE.Vector3(0, -1, 0),
  },
  volcano: {
    zenith: new THREE.Color(0x4a3560),
    horizon: new THREE.Color(0xff8a4a),
    ground: new THREE.Color(0x2a1a22),
    sunDir: new THREE.Vector3(0.25, 0.1, -0.96).normalize(),
    sunColor: new THREE.Color(0xffae5c),
    sunSize: 0.06,
    cloudAmount: 0.4,
    stars: 0,
    planet: 0,
    planetDir: new THREE.Vector3(0, -1, 0),
  },
  desert: {
    zenith: new THREE.Color(0x3a5a9a),
    horizon: new THREE.Color(0xffb347),
    ground: new THREE.Color(0x6a4a24),
    sunDir: new THREE.Vector3(0.3, 0.12, -0.94).normalize(),
    sunColor: new THREE.Color(0xffa64d),
    sunSize: 0.07,
    cloudAmount: 0.35,
    stars: 0,
    planet: 0,
    planetDir: new THREE.Vector3(0, -1, 0),
  },
  space: {
    zenith: new THREE.Color(0x05060f),
    horizon: new THREE.Color(0x05060f),
    ground: new THREE.Color(0x05060f),
    sunDir: new THREE.Vector3(0, 1, 0),
    sunColor: new THREE.Color(0x000000),
    sunSize: 0,
    cloudAmount: 0,
    stars: 1,
    planet: 1,
    planetDir: new THREE.Vector3(0, -0.45, -0.89).normalize(),
  },
};

/** The theme of the zone containing distance `z`. */
export function themeAt(z: number): ZoneTheme {
  return ZONE_THEMES[zoneAt(z).id];
}

/**
 * The zone-blend state at `z`: the current zone, the previous zone to blend from (`null` if `z`
 * is in the first zone or past the BLEND_METERS window), and the blend fraction `t` (only
 * meaningful when `prev` is non-null). Shared by `blendedThemeColor` and `blendedSkyTheme` so
 * both blend over the same window after each zone start.
 */
function zoneBlendFraction(z: number): { cur: ZoneDef; prev: ZoneDef | null; t: number } {
  const cur = zoneAt(z);
  const idx = zoneIndex(cur.id);
  const into = z - cur.z0;
  if (idx <= 0 || into >= BLEND_METERS) {
    return { cur, prev: null, t: 1 };
  }
  return { cur, prev: ZONES[idx - 1], t: into / BLEND_METERS };
}

/**
 * Blends `pick`'s colour from the previous zone's theme to the current zone's theme, linearly
 * over the first BLEND_METERS of the current zone (so the transition happens right after each
 * zone start, not at the earlier zone's boundary). Writes into and returns `out`.
 */
export function blendedThemeColor(z: number, pick: (t: ZoneTheme) => THREE.Color, out: THREE.Color): THREE.Color {
  const { cur, prev, t } = zoneBlendFraction(z);
  if (!prev) {
    return out.copy(pick(ZONE_THEMES[cur.id]));
  }
  return out.copy(pick(ZONE_THEMES[prev.id])).lerp(pick(ZONE_THEMES[cur.id]), t);
}

/**
 * Blends every field of `SkyTheme` from the previous zone to the current zone at `z`, over the
 * same BLEND_METERS window as `blendedThemeColor` (colours and direction vectors lerp, scalars
 * lerp linearly). Writes into and returns `out`.
 */
export function blendedSkyTheme(z: number, out: SkyTheme): SkyTheme {
  const { cur, prev, t } = zoneBlendFraction(z);
  const curT = SKY_THEMES[cur.id];
  if (!prev) {
    out.zenith.copy(curT.zenith);
    out.horizon.copy(curT.horizon);
    out.ground.copy(curT.ground);
    out.sunDir.copy(curT.sunDir);
    out.sunColor.copy(curT.sunColor);
    out.sunSize = curT.sunSize;
    out.cloudAmount = curT.cloudAmount;
    out.stars = curT.stars;
    out.planet = curT.planet;
    out.planetDir.copy(curT.planetDir);
    return out;
  }
  const prevT = SKY_THEMES[prev.id];
  out.zenith.copy(prevT.zenith).lerp(curT.zenith, t);
  out.horizon.copy(prevT.horizon).lerp(curT.horizon, t);
  out.ground.copy(prevT.ground).lerp(curT.ground, t);
  out.sunDir.copy(prevT.sunDir).lerp(curT.sunDir, t);
  out.sunColor.copy(prevT.sunColor).lerp(curT.sunColor, t);
  out.sunSize = prevT.sunSize + (curT.sunSize - prevT.sunSize) * t;
  out.cloudAmount = prevT.cloudAmount + (curT.cloudAmount - prevT.cloudAmount) * t;
  out.stars = prevT.stars + (curT.stars - prevT.stars) * t;
  out.planet = prevT.planet + (curT.planet - prevT.planet) * t;
  out.planetDir.copy(prevT.planetDir).lerp(curT.planetDir, t);
  return out;
}
