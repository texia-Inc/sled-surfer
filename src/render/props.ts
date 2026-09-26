import * as THREE from 'three';
import type { Decor, Gate, Lane, RouteSection, Segment, Slider, Track, ZoneId } from '../core/types';
import type { PhysicsParams } from '../core/params';
import { coinWorldY } from '../core/physics';
import { RAMP_BIG, RAMP_SMALL, TRACK_GEN, TRACK_WIDTH } from '../core/track';
import { ZONES } from '../core/zones';
import { ZONE_THEMES } from './zoneTheme';

const BEHIND = 1;
const AHEAD = 3;
const COIN_SPIN = 3;
const PAD_TEXTURE_SIZE = 256;
const PAD_TEXTURE_SCROLL = 1.5;
const PAD_OPACITY = 0.95;
const PAD_GLOW_SCALE = 1.25;
const PAD_GLOW_COLOR = 0xffd28a;
const PAD_GLOW_OPACITY = 0.3;
const PAD_Y_OFFSET = 0.06;
const PAD_GLOW_Y_OFFSET = 0.01;
/** Vertical marker standing at a pad's far edge so it reads from far down the track. */
const BEACON_HEIGHT = 7;
const BEACON_COLOR = 0xffc36b;
const BEACON_OPACITY = 0.18;

// --- Ramp slab / rail geometry constants (share the pad's chevron texture) ---
const RAMP_SLAB_THICKNESS = 0.5;
const RAMP_RAIL_SIZE = { w: 0.3, h: 0.6 };
const RAMP_RAIL_COLOR = 0xd97a1a;
const RAMP_RAIL_X_INSET = 0.2;
const RAMP_Y_OFFSET = 0.15;

// --- Split-wall obstacle geometry constants ---
const WALL_SIZE = { w: 2.4, h: 3, d: 2.4 };
const WALL_COLOR = 0x9aa3ad;

// --- Signpost decor geometry constants (pole + two arrow boards near a split) ---
const SIGNPOST_POLE_RADIUS = 0.1;
const SIGNPOST_POLE_HEIGHT = 3;
const SIGNPOST_BOARD = { w: 0.9, h: 0.4, d: 0.08 };
/** Extra size of the dark backing plate behind each white board, so it reads as a thin edge. */
const SIGNPOST_EDGE_INSET = 0.05;
const SIGNPOST_BOARD_COLOR = 0xffffff;
const SIGNPOST_EDGE_COLOR = 0x2a2a2a;
/** Distance of each board's centre from the pole (its inner edge touches the pole). */
const SIGNPOST_ARM_X = 0.42;
/** Vertical gap between the two stacked arrow boards. */
const SIGNPOST_ARM_GAP = 0.5;
/** Yaw applied to each board so they read as pointing away from the pole, left/right. */
const SIGNPOST_ARROW_ROTATION = 0.35;
/** Extra distance each board is pushed toward its side once rotated. */
const SIGNPOST_ARROW_OFFSET = 0.3;

// --- Breakable obstacle geometry constants ---
const HAY_RADIUS = 0.9;
const HAY_LENGTH = 1.0;
const HAY_COLOR = 0xe0b84a;
const CRATE_SIZE = 1.2;
const CRATE_COLOR = 0xa06a2c;
const CRATE_EDGE_COLOR = 0x6b4620;
/** Thin frame slats (top/bottom rims) replacing the old fully-enclosing edge box, so the
 * tan crate body stays visible between them. */
const CRATE_FRAME_SIZE = { w: 1.3, h: 0.12, d: 1.3 };
const CRATE_FRAME_Y_BOTTOM = 0.06;
const CRATE_FRAME_Y_TOP = 1.14;
const FENCE_RAIL_SIZE = { w: 3.0, h: 1.1, d: 0.15 };
const FENCE_POST_SIZE = { w: 0.15, h: 1.3, d: 0.22 };
const FENCE_POST_X = 1.35;
const FENCE_RAIL_Y = 0.6;
const FENCE_COLOR = 0x8a5a2b;

// --- New obstacle geometry constants ---
const STUMP_RADIUS = 0.5;
const STUMP_HEIGHT = 0.8;
const CAR_SIZE = { w: 1.8, h: 1.2, d: 3.6 };
const CAR_PALETTE = [0xd23c3c, 0x3c6cd2, 0xc7c9cc, 0x2f6b45];
const BUS_SIZE = { w: 2.4, h: 2.6, d: 8 };
const SIGN_POLE_RADIUS = 0.08;
const SIGN_POLE_HEIGHT = 2.4;
const SIGN_BOARD = { w: 0.9, h: 0.6, d: 0.1 };
const BARRIER_SIZE = { w: 2.4, h: 1.0, d: 0.3 };
const BARRIER_STRIPE = { w: 2.4, h: 0.22, d: 0.32 };
const STALAGMITE_RADIUS = 0.7;
const STALAGMITE_HEIGHT = 2.4;
const CRYSTAL_RADIUS = 0.8;

// --- Desert/space obstacle geometry constants (art §5) ---
const CACTUS_TRUNK_RADIUS = 0.35;
const CACTUS_TRUNK_HEIGHT = 2.4;
const CACTUS_ARM_RADIUS = 0.22;
const CACTUS_ARM_HEIGHT = 1.1;
/** Offset of each arm's centre from the trunk, in x. */
const CACTUS_ARM_X = 0.6;
const CACTUS_ARM_Y = 1.2;
/** Rotation (radians) tilting each arm up away from vertical. */
const CACTUS_ARM_TILT = 0.5;
const CACTUS_COLOR = 0x3f8f4a;
const ASTEROID_RADIUS = 1.0;
/** Fraction (+-) each dodecahedron vertex is scaled radially, for a deterministic rocky look. */
const ASTEROID_JITTER = 0.25;
const ASTEROID_COLOR = 0x6f6f78;
const ASTEROID_Y = 0.8;
const SATELLITE_BODY = { w: 1.0, h: 0.8, d: 0.8 };
const SATELLITE_PANEL = { w: 1.6, h: 0.05, d: 0.8 };
const SATELLITE_BODY_COLOR = 0xcfd3dc;
const SATELLITE_PANEL_COLOR = 0x2e6bd8;

// --- Volcano obstacle geometry constants ---
const TOTEM_RADIUS = 0.6;
const TOTEM_HEIGHT = 2.6;
const TOTEM_COLOR = 0x8a5a34;
const TOTEM_FACE_SIZE = { w: 0.9, h: 0.5, d: 0.2 };
const TOTEM_FACE_COLOR = 0x2a1c12;
const PALM_TRUNK_RADIUS = 0.2;
const PALM_TRUNK_HEIGHT = 3;
const PALM_TRUNK_COLOR = 0x8a6a3a;
const PALM_FROND_COUNT = 5;
const PALM_FROND_SIZE = { w: 1.4, h: 0.12, d: 0.4 };
const PALM_FROND_COLOR = 0x2f8f4e;
const PALM_FROND_TILT = 0.5;

// --- Temple decor geometry constants ---
const TEMPLE_SIZE = { w: 7, d: 7 };
const TEMPLE_COLOR = 0x8b8a86;
const TEMPLE_TOP_SCALE = 0.5;
const TEMPLE_TOP_HEIGHT_SCALE = 0.4;

// --- Route section geometry constants (terrain routes §4) ---
const ROUTE_WALL_BLOCK = { w: 2.5, h: 4.5, d: 2.5 };
const ROUTE_WALL_SPACING = 3;
const ROUTE_WALL_COLOR = 0x6d6a66;
const ROUTE_PILLAR_RADIUS_SCALE = 0.9;
const ROUTE_PILLAR_HEIGHT = TRACK_GEN.hazardDepth + TRACK_GEN.pillarTop;
const ROUTE_PILLAR_COLOR = 0x5a4b43;
const ROUTE_PILLAR_CAP_THICKNESS = 0.4;
const ROUTE_PILLAR_CAP_COLOR = 0x7a6b5f;
const ROUTE_SIGNPOST_LEAD = 6;
const ROUTE_SIGNPOST_POLE_HEIGHT = 3;
const ROUTE_SIGNPOST_BOARD = { w: 1.4, h: 0.5, d: 0.1 };
const ROUTE_SIGNPOST_BOARD_GAP = 0.6;
const ROUTE_LANE_BOARD_COLOR: Record<Lane['kind'], number> = {
  ridge: 0xffd23f, ground: 0xffffff, pillars: 0xff6a2b,
};

// --- Decor geometry constants ---
const BUILDING_SIZE = { w: 7, d: 7 };
const BUILDING_ROOF = { w: 7.2, h: 0.6, d: 7.2 };
const STALACTITE_RADIUS = 0.6;
const STALACTITE_HEIGHT = 2.4;
const CLIFF_Y_SINK = 2;
/** Deterministic 10-18m cliff width, derived from `d.z`. */
const CLIFF_WIDTH_MIN = 10;
const CLIFF_WIDTH_RANGE = 8;
/** 6-sided cone (art §5): a low radial-segment count so the peak reads as faceted rock. */
const CLIFF_CONE_SEGMENTS = 6;
/** Max per-vertex x/z jitter on the cliff cone, as a fraction of its radius. */
const CLIFF_JITTER_FRACTION = 0.15;
const CLIFF_CAP_RADIUS_SCALE = 0.45;
const CLIFF_CAP_HEIGHT_SCALE = 0.3;
const CLIFF_CAP_COLOR = 0xf4f8ff;
const CLIFF_COLORS: Record<ZoneId, number> = {
  snowfield: 0xe6eef7, forest: 0x7a5a3c, city: 0x7d8189, cave: 0x1e2438, volcano: 0x14100f, desert: 0xc98a3e, space: 0x2a3350,
};

// --- Desert decor geometry constants (art §5; dune/pyramid) ---
/** Deterministic 60-120m dune width, derived from `d.z` (same style as cliffWidth). */
const DUNE_WIDTH_MIN = 60;
const DUNE_WIDTH_RANGE = 60;
const DUNE_DEPTH = 40;
const DUNE_COLOR = 0xc98a3e;
const PYRAMID_RADIUS_SCALE = 0.75;
const PYRAMID_COLOR = 0xd9a35a;

// --- Portal gate geometry constants (art §5; replaces the old posts/banner gate) ---
const GATE_RING_COUNT = 16;
const GATE_RING_RADIUS = 7;
const GATE_RING_BOX = { w: 2.2, h: 2.2, d: 1.2 };
const GATE_RING_COLOR = 0xbfe6ff;
/** Height of the ring's centre above ground. */
/** Ring centre height: radius minus one metre, so the lowest block is buried and the sled passes
 * through the ring's opening instead of its bottom block. */
const GATE_RING_CENTER_Y = 6;
const GATE_DISC_RADIUS = 6.2;
const GATE_DISC_SEGMENTS = 32;
const GATE_DISC_OPACITY = 0.35;
/** Clearance between the ring's top and the zone-name label above it. */
const GATE_NAME_CLEARANCE = 2;

// --- Slider rail geometry constants (art §5) ---
const SLIDER_RAIL_SAMPLE = 4;
const SLIDER_RAIL_Y_OFFSET = 0.5;
const SLIDER_RAIL_RADIUS = 0.35;
const SLIDER_RAIL_RADIAL_SEGMENTS = 6;
const SLIDER_RAIL_COLOR = 0x1b1b22;

// --- Space tube pipe geometry constants (art §5) ---
const SPACE_PIPE_RADIAL_SEGMENTS = 24;
const SPACE_PIPE_COLOR = 0xbfe6ff;
const SPACE_PIPE_OPACITY = 0.25;

// --- Gate name-label geometry constants (the ring itself is defined above, art §5) ---
const GATE_NAME_W = 512;
const GATE_NAME_H = 96;
const GATE_NAME_PLANE_H = 1.1;
const GATE_NAME_Z_OFFSET = 0.2;

// --- Finish gate (goal line) constants ---
const GOAL_POST_RADIUS = 0.3;
const GOAL_POST_HEIGHT = 6;
const GOAL_POST_X_OFFSET = 0.5;
const GOAL_POST_COLOR = 0xffd23f;
const GOAL_BANNER_W_EXTRA = 1;
const GOAL_BANNER_H = 1.2;
const GOAL_BANNER_Y = 6;
const GOAL_BANNER_TEX_W = 512;
const GOAL_BANNER_TEX_H = 64;
const GOAL_BANNER_CHECKER_COLS = 8;
const GOAL_ROPE_SIZE = { h: 0.15, d: 0.15 };
const GOAL_ROPE_Y = 1.0;
const GOAL_ROPE_COLOR = 0x3a2a1a;

/** Deterministic pseudo-random y-rotation for a cliff (radians, |rot| <= 0.25), derived from its
 * z so it stays stable across rebuilds (this just avoids storing an extra random field on
 * Decor). */
function cliffRotation(z: number): number {
  return ((z * 13) % 50 - 25) / 100;
}

/** Deterministic 10-18m width for a cliff, derived from its z (see cliffRotation). */
function cliffWidth(z: number): number {
  return CLIFF_WIDTH_MIN + ((z * 7) % CLIFF_WIDTH_RANGE);
}

/** Dunes never reach closer than this to the centreline, whatever their width (the track's
 * widest half-width plus a margin), so a wide dune placed at |x| 50 cannot spill onto the track. */
const DUNE_TRACK_CLEARANCE = 24;
/** Deterministic 60-120m width for a dune, derived from its z (same style as cliffWidth), then
 * capped so the inner edge stays DUNE_TRACK_CLEARANCE from the centreline. */
function duneWidth(z: number, x: number): number {
  const raw = DUNE_WIDTH_MIN + ((z * 7) % DUNE_WIDTH_RANGE);
  return Math.min(raw, 2 * (Math.abs(x) - DUNE_TRACK_CLEARANCE));
}

/** Deterministic pseudo-random value in [0,1) from two numeric seeds (classic sine hash; only
 * good enough for small cosmetic vertex jitter, never for anything needing real randomness). */
function hash01(a: number, b: number): number {
  const v = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

/** Displaces every vertex of a geometry in x/z by up to `maxOffset` (world units), deterministic
 * from `seed` and the vertex index, then recomputes normals so a cone reads as a rough, faceted
 * peak instead of a perfect cone (cliffs, art §5). Mutates and disposes nothing; the caller owns
 * the geometry's lifetime. */
function jitterConeXZ(geo: THREE.BufferGeometry, seed: number, maxOffset: number): void {
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setX(i, pos.getX(i) + (hash01(seed, i * 2) * 2 - 1) * maxOffset);
    pos.setZ(i, pos.getZ(i) + (hash01(seed, i * 2 + 1) * 2 - 1) * maxOffset);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
}

/** Scales every vertex of a geometry radially (from the origin) by up to +-`fraction`,
 * deterministic from `seed` and the vertex index, then recomputes normals, so a dodecahedron
 * reads as an irregular chunk of rock (asteroids, art §5). */
function jitterRadial(geo: THREE.BufferGeometry, seed: number, fraction: number): void {
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const f = 1 + (hash01(seed, i) * 2 - 1) * fraction;
    pos.setX(i, pos.getX(i) * f);
    pos.setY(i, pos.getY(i) * f);
    pos.setZ(i, pos.getZ(i) * f);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
}

interface Bundle {
  group: THREE.Group;
  coins: Map<string, THREE.Mesh>;
  obstacles: Map<string, THREE.Object3D>;
  /** Per-instance (non-shared) geometries created for this segment's props (jittered cliffs and
   * asteroids, slider rail tubes), disposed alongside the group when it's recycled. */
  disposables: THREE.BufferGeometry[];
}

export class PropManager {
  private bundles = new Map<number, Bundle>();
  private track: Track;
  private goalGroup: THREE.Group | null = null;
  private goalDistanceVal: number | null = null;

  private readonly treeTop = new THREE.ConeGeometry(0.9, 2.4, 7);
  private readonly treeTrunk = new THREE.CylinderGeometry(0.2, 0.25, 0.8, 6);
  private readonly rock = new THREE.DodecahedronGeometry(1.0, 0);
  private readonly ball = new THREE.SphereGeometry(0.5, 10, 8);
  private readonly coin = new THREE.CylinderGeometry(0.5, 0.5, 0.15, 16);
  /** Unit width (1); scaled per-ramp to `ramp.width` at build time since ramps now have their
   * own width instead of always spanning TRACK_WIDTH. */
  private readonly rampSlabGeo = new THREE.BoxGeometry(1, RAMP_SLAB_THICKNESS, 1);
  private readonly rampRailGeo = new THREE.BoxGeometry(RAMP_RAIL_SIZE.w, RAMP_RAIL_SIZE.h, 1);
  private readonly wallGeo = new THREE.BoxGeometry(WALL_SIZE.w, WALL_SIZE.h, WALL_SIZE.d);
  private readonly signpostPoleGeo = new THREE.CylinderGeometry(SIGNPOST_POLE_RADIUS, SIGNPOST_POLE_RADIUS, SIGNPOST_POLE_HEIGHT, 8);
  private readonly signpostBoardGeo = new THREE.BoxGeometry(SIGNPOST_BOARD.w, SIGNPOST_BOARD.h, SIGNPOST_BOARD.d);
  private readonly signpostEdgeGeo = new THREE.BoxGeometry(
    SIGNPOST_BOARD.w + SIGNPOST_EDGE_INSET * 2, SIGNPOST_BOARD.h + SIGNPOST_EDGE_INSET * 2, SIGNPOST_BOARD.d * 0.5,
  );
  private readonly padGeo = new THREE.PlaneGeometry(1, 1);
  /** Unit plane left standing in the XY plane (unrotated) for pad beacons. */
  private readonly beaconGeo = new THREE.PlaneGeometry(1, 1);

  // --- New obstacle geometries ---
  private readonly stumpGeo = new THREE.CylinderGeometry(STUMP_RADIUS, STUMP_RADIUS, STUMP_HEIGHT, 8);
  private readonly carGeo = new THREE.BoxGeometry(CAR_SIZE.w, CAR_SIZE.h, CAR_SIZE.d);
  private readonly busGeo = new THREE.BoxGeometry(BUS_SIZE.w, BUS_SIZE.h, BUS_SIZE.d);
  private readonly signPoleGeo = new THREE.CylinderGeometry(SIGN_POLE_RADIUS, SIGN_POLE_RADIUS, SIGN_POLE_HEIGHT, 8);
  private readonly signBoardGeo = new THREE.BoxGeometry(SIGN_BOARD.w, SIGN_BOARD.h, SIGN_BOARD.d);
  private readonly barrierGeo = new THREE.BoxGeometry(BARRIER_SIZE.w, BARRIER_SIZE.h, BARRIER_SIZE.d);
  private readonly barrierStripeGeo = new THREE.BoxGeometry(BARRIER_STRIPE.w, BARRIER_STRIPE.h, BARRIER_STRIPE.d);
  private readonly stalagmiteGeo = new THREE.ConeGeometry(STALAGMITE_RADIUS, STALAGMITE_HEIGHT, 7);
  private readonly crystalGeo = new THREE.OctahedronGeometry(CRYSTAL_RADIUS, 0);

  // --- Desert/space obstacle geometries (asteroid is per-instance jittered, see buildAsteroid) ---
  private readonly cactusTrunkGeo = new THREE.CylinderGeometry(CACTUS_TRUNK_RADIUS, CACTUS_TRUNK_RADIUS, CACTUS_TRUNK_HEIGHT, 8);
  private readonly cactusArmGeo = new THREE.CylinderGeometry(CACTUS_ARM_RADIUS, CACTUS_ARM_RADIUS, CACTUS_ARM_HEIGHT, 8);
  private readonly satelliteBodyGeo = new THREE.BoxGeometry(SATELLITE_BODY.w, SATELLITE_BODY.h, SATELLITE_BODY.d);
  private readonly satellitePanelGeo = new THREE.BoxGeometry(SATELLITE_PANEL.w, SATELLITE_PANEL.h, SATELLITE_PANEL.d);

  // --- Volcano obstacle/decor geometries ---
  private readonly totemGeo = new THREE.CylinderGeometry(TOTEM_RADIUS, TOTEM_RADIUS, TOTEM_HEIGHT, 8);
  private readonly totemFaceGeo = new THREE.BoxGeometry(TOTEM_FACE_SIZE.w, TOTEM_FACE_SIZE.h, TOTEM_FACE_SIZE.d);
  private readonly palmTrunkGeo = new THREE.CylinderGeometry(PALM_TRUNK_RADIUS * 0.6, PALM_TRUNK_RADIUS, PALM_TRUNK_HEIGHT, 6);
  private readonly palmFrondGeo = new THREE.BoxGeometry(PALM_FROND_SIZE.w, PALM_FROND_SIZE.h, PALM_FROND_SIZE.d);
  private readonly templeGeo = new THREE.BoxGeometry(TEMPLE_SIZE.w, 1, TEMPLE_SIZE.d);

  // --- Route section geometries (terrain routes §4) ---
  private readonly routeWallGeo = new THREE.BoxGeometry(ROUTE_WALL_BLOCK.w, ROUTE_WALL_BLOCK.h, ROUTE_WALL_BLOCK.d);
  private readonly routePillarGeo = new THREE.CylinderGeometry(
    TRACK_GEN.pillarRadius * ROUTE_PILLAR_RADIUS_SCALE, TRACK_GEN.pillarRadius * ROUTE_PILLAR_RADIUS_SCALE,
    ROUTE_PILLAR_HEIGHT, 16,
  );
  private readonly routePillarCapGeo = new THREE.CylinderGeometry(
    TRACK_GEN.pillarRadius, TRACK_GEN.pillarRadius, ROUTE_PILLAR_CAP_THICKNESS, 20,
  );
  private readonly routeSignpostPoleGeo = new THREE.CylinderGeometry(
    SIGNPOST_POLE_RADIUS, SIGNPOST_POLE_RADIUS, ROUTE_SIGNPOST_POLE_HEIGHT, 8,
  );
  private readonly routeSignpostBoardGeo = new THREE.BoxGeometry(
    ROUTE_SIGNPOST_BOARD.w, ROUTE_SIGNPOST_BOARD.h, ROUTE_SIGNPOST_BOARD.d,
  );

  // --- Breakable obstacle geometries ---
  private readonly hayGeo = new THREE.CylinderGeometry(HAY_RADIUS, HAY_RADIUS, HAY_LENGTH, 12);
  private readonly crateGeo = new THREE.BoxGeometry(CRATE_SIZE, CRATE_SIZE, CRATE_SIZE);
  private readonly crateFrameGeo = new THREE.BoxGeometry(CRATE_FRAME_SIZE.w, CRATE_FRAME_SIZE.h, CRATE_FRAME_SIZE.d);
  private readonly fenceRailGeo = new THREE.BoxGeometry(FENCE_RAIL_SIZE.w, FENCE_RAIL_SIZE.h, FENCE_RAIL_SIZE.d);
  private readonly fencePostGeo = new THREE.BoxGeometry(FENCE_POST_SIZE.w, FENCE_POST_SIZE.h, FENCE_POST_SIZE.d);

  // --- Decor geometries (shared unit shapes, scaled per-instance) ---
  private readonly buildingGeo = new THREE.BoxGeometry(BUILDING_SIZE.w, 1, BUILDING_SIZE.d);
  private readonly buildingRoofGeo = new THREE.BoxGeometry(BUILDING_ROOF.w, BUILDING_ROOF.h, BUILDING_ROOF.d);
  private readonly stalactiteGeo = new THREE.ConeGeometry(STALACTITE_RADIUS, STALACTITE_HEIGHT, 7);
  /** Unit cone (radius 1, height 1); each cliff's snow cap is scaled per-instance since it isn't
   * jittered (unlike the cliff body, which needs a unique per-instance geometry anyway). */
  private readonly cliffCapGeo = new THREE.ConeGeometry(1, 1, CLIFF_CONE_SEGMENTS);
  /** Unit sphere for dunes (scaled per-instance to a 60-120m width, d.scale height, 40m depth). */
  private readonly duneGeo = new THREE.SphereGeometry(1, 10, 6);
  /** Unit cone (radius 1, height 1) for pyramids, scaled per-instance to scale*0.75 / scale. */
  private readonly pyramidGeo = new THREE.ConeGeometry(1, 1, 4);

  // --- Gate geometries (portal ring, art §5) ---
  private readonly gateRingBoxGeo = new THREE.BoxGeometry(GATE_RING_BOX.w, GATE_RING_BOX.h, GATE_RING_BOX.d);
  private readonly gateDiscGeo = new THREE.CircleGeometry(GATE_DISC_RADIUS, GATE_DISC_SEGMENTS);
  private readonly gateNameGeo = new THREE.PlaneGeometry(TRACK_WIDTH, GATE_NAME_PLANE_H);

  /** Unit cylinder (radius 1, height 1, open-ended) for space-zone tube pipes; scaled per-instance
   * to (radius, length, radius) since both radius and length vary per pipe (art §5). Slider rails
   * use TubeGeometry instead, built per-instance since each rail follows its own curve. */
  private readonly spacePipeGeo = new THREE.CylinderGeometry(1, 1, 1, SPACE_PIPE_RADIAL_SEGMENTS, 1, true);

  // --- Finish gate geometries ---
  private readonly goalPostGeo = new THREE.CylinderGeometry(GOAL_POST_RADIUS, GOAL_POST_RADIUS, GOAL_POST_HEIGHT, 8);
  private readonly goalBannerGeo = new THREE.PlaneGeometry(TRACK_WIDTH + GOAL_BANNER_W_EXTRA, GOAL_BANNER_H);
  private readonly goalRopeGeo = new THREE.BoxGeometry(TRACK_WIDTH + GOAL_BANNER_W_EXTRA, GOAL_ROPE_SIZE.h, GOAL_ROPE_SIZE.d);

  private readonly matTree = new THREE.MeshLambertMaterial({ color: 0x2f8f4e, flatShading: true });
  private readonly matTrunk = new THREE.MeshLambertMaterial({ color: 0x7a4b2a, flatShading: true });
  private readonly matRock = new THREE.MeshLambertMaterial({ color: 0x8b8f99, flatShading: true });
  private readonly matSnow = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
  private readonly matCoin = new THREE.MeshLambertMaterial({ color: 0xffc928, emissive: 0x553300 });
  /** Shared chevron texture (orange ground, white chevrons); ramps clone it at a different
   * repeat.y (see rampTextureSmall/Big) so all three scroll from the same PAD_TEXTURE_SCROLL. */
  private readonly padTexture = this.createPadTexture();
  private readonly rampTextureSmall = this.cloneChevronTexture(RAMP_SMALL.length / 3);
  private readonly rampTextureBig = this.cloneChevronTexture(RAMP_BIG.length / 3);
  private readonly matPad = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: PAD_OPACITY, map: this.padTexture,
  });
  private readonly matPadGlow = new THREE.MeshBasicMaterial({
    color: PAD_GLOW_COLOR, transparent: true, opacity: PAD_GLOW_OPACITY,
  });
  private readonly matBeacon = new THREE.MeshBasicMaterial({
    color: BEACON_COLOR, transparent: true, opacity: BEACON_OPACITY,
    side: THREE.DoubleSide, depthWrite: false,
  });
  private readonly matRampRail = new THREE.MeshLambertMaterial({ color: RAMP_RAIL_COLOR, flatShading: true });
  private readonly matRampSmall = new THREE.MeshLambertMaterial({ map: this.rampTextureSmall });
  private readonly matRampBig = new THREE.MeshLambertMaterial({ map: this.rampTextureBig });
  private readonly matWall = new THREE.MeshLambertMaterial({ color: WALL_COLOR, flatShading: true });
  private readonly matSignpostPole = new THREE.MeshLambertMaterial({ color: 0x8b8f99, flatShading: true });
  private readonly matSignpostBoard = new THREE.MeshLambertMaterial({ color: SIGNPOST_BOARD_COLOR, flatShading: true });
  private readonly matSignpostEdge = new THREE.MeshLambertMaterial({ color: SIGNPOST_EDGE_COLOR, flatShading: true });

  // --- New obstacle materials ---
  private readonly matStump = new THREE.MeshLambertMaterial({ color: 0x7a4b2a, flatShading: true });
  private readonly matCarPalette = CAR_PALETTE.map(
    (color) => new THREE.MeshLambertMaterial({ color, flatShading: true }),
  );
  private readonly matBus = new THREE.MeshLambertMaterial({ color: 0xf2c40f, flatShading: true });
  private readonly matSignPole = new THREE.MeshLambertMaterial({ color: 0x8b8f99, flatShading: true });
  private readonly matSignBoard = new THREE.MeshLambertMaterial({ color: 0xd23c3c, flatShading: true });
  private readonly matBarrier = new THREE.MeshLambertMaterial({ color: 0xff8c1a, flatShading: true });
  private readonly matBarrierStripe = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
  private readonly matStalagmite = new THREE.MeshLambertMaterial({ color: 0x5c6b7a, flatShading: true });
  private readonly matCrystal = new THREE.MeshBasicMaterial({ color: 0x9fe8ff });

  // --- Desert/space obstacle materials ---
  private readonly matCactus = new THREE.MeshLambertMaterial({ color: CACTUS_COLOR, flatShading: true });
  private readonly matAsteroid = new THREE.MeshLambertMaterial({ color: ASTEROID_COLOR, flatShading: true });
  private readonly matSatelliteBody = new THREE.MeshLambertMaterial({ color: SATELLITE_BODY_COLOR, flatShading: true });
  private readonly matSatellitePanel = new THREE.MeshLambertMaterial({ color: SATELLITE_PANEL_COLOR, flatShading: true });

  // --- Volcano obstacle/decor materials ---
  private readonly matTotem = new THREE.MeshLambertMaterial({ color: TOTEM_COLOR, flatShading: true });
  private readonly matTotemFace = new THREE.MeshLambertMaterial({ color: TOTEM_FACE_COLOR, flatShading: true });
  private readonly matPalmTrunk = new THREE.MeshLambertMaterial({ color: PALM_TRUNK_COLOR, flatShading: true });
  private readonly matPalmFrond = new THREE.MeshLambertMaterial({ color: PALM_FROND_COLOR, flatShading: true });
  private readonly matTemple = new THREE.MeshLambertMaterial({ color: TEMPLE_COLOR, flatShading: true });

  // --- Route section materials (terrain routes §4) ---
  private readonly matRouteWall = new THREE.MeshLambertMaterial({ color: ROUTE_WALL_COLOR, flatShading: true });
  private readonly matRoutePillar = new THREE.MeshLambertMaterial({ color: ROUTE_PILLAR_COLOR, flatShading: true });
  private readonly matRoutePillarCap = new THREE.MeshLambertMaterial({ color: ROUTE_PILLAR_CAP_COLOR, flatShading: true });
  private readonly matRouteSignpostPole = new THREE.MeshLambertMaterial({ color: 0x8b8f99, flatShading: true });
  private readonly matRouteBoard = new Map<Lane['kind'], THREE.MeshLambertMaterial>(
    (Object.keys(ROUTE_LANE_BOARD_COLOR) as Lane['kind'][]).map(
      (k) => [k, new THREE.MeshLambertMaterial({ color: ROUTE_LANE_BOARD_COLOR[k], flatShading: true })],
    ),
  );

  // --- Breakable obstacle materials ---
  private readonly matHay = new THREE.MeshLambertMaterial({ color: HAY_COLOR, flatShading: true });
  private readonly matCrate = new THREE.MeshLambertMaterial({ color: CRATE_COLOR, flatShading: true });
  private readonly matCrateEdge = new THREE.MeshLambertMaterial({ color: CRATE_EDGE_COLOR, flatShading: true });
  private readonly matFence = new THREE.MeshLambertMaterial({ color: FENCE_COLOR, flatShading: true });

  // --- Decor materials (pine reuses the tree materials; stalactite reuses stalagmite's) ---
  private readonly matBuilding = new THREE.MeshLambertMaterial({ color: 0x5c6878, flatShading: true });
  private readonly matBuildingRoof = new THREE.MeshLambertMaterial({ color: 0x3c4552, flatShading: true });
  private readonly matCliff = new Map<ZoneId, THREE.MeshLambertMaterial>(
    ZONES.map((z) => [z.id, new THREE.MeshLambertMaterial({ color: CLIFF_COLORS[z.id], flatShading: true })]),
  );
  private readonly matCliffCap = new THREE.MeshLambertMaterial({ color: CLIFF_CAP_COLOR, flatShading: true });
  private readonly matDune = new THREE.MeshLambertMaterial({ color: DUNE_COLOR, flatShading: true });
  private readonly matPyramid = new THREE.MeshLambertMaterial({ color: PYRAMID_COLOR, flatShading: true });

  // --- Gate materials (ring is one shared colour; the inside disc is per-zone, art §5) ---
  private readonly matGateRing = new THREE.MeshLambertMaterial({ color: GATE_RING_COLOR, flatShading: true });
  private readonly matGateDisc = new Map<ZoneId, THREE.MeshBasicMaterial>(
    ZONES.map((z) => [z.id, new THREE.MeshBasicMaterial({
      color: ZONE_THEMES[z.id].gate, transparent: true, opacity: GATE_DISC_OPACITY,
      depthWrite: false, side: THREE.DoubleSide,
    })]),
  );
  private readonly gateNameMaterials = new Map<ZoneId, THREE.MeshBasicMaterial>();

  // --- Slider rail / space pipe materials (art §5) ---
  private readonly matSliderRail = new THREE.MeshLambertMaterial({ color: SLIDER_RAIL_COLOR, flatShading: true });
  private readonly matSpacePipe = new THREE.MeshLambertMaterial({
    color: SPACE_PIPE_COLOR, transparent: true, opacity: SPACE_PIPE_OPACITY, depthWrite: false, side: THREE.DoubleSide,
  });

  // --- Finish gate materials ---
  private readonly matGoalPost = new THREE.MeshLambertMaterial({ color: GOAL_POST_COLOR, flatShading: true });
  private readonly matGoalBanner = new THREE.MeshBasicMaterial({
    map: this.createGoalBannerTexture(), side: THREE.DoubleSide,
  });
  private readonly matGoalRope = new THREE.MeshLambertMaterial({ color: GOAL_ROPE_COLOR, flatShading: true });

  constructor(private readonly scene: THREE.Scene, track: Track, private readonly params: PhysicsParams) {
    this.track = track;
    this.coin.rotateX(Math.PI / 2);
    this.padGeo.rotateX(-Math.PI / 2);
  }

  private createPadTexture(): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = PAD_TEXTURE_SIZE;
    c.height = PAD_TEXTURE_SIZE;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#f39a2b';
    ctx.fillRect(0, 0, PAD_TEXTURE_SIZE, PAD_TEXTURE_SIZE);
    ctx.fillStyle = '#ffffff';
    const chevronH = PAD_TEXTURE_SIZE / 4;
    for (let i = 0; i < 3; i++) {
      // Tip points toward the texture's top edge (y=0); repeated with wrapT so
      // scrolling texture.offset.y downward reads as the chevrons flowing "forward".
      const cy = PAD_TEXTURE_SIZE - i * chevronH - chevronH * 0.5;
      ctx.beginPath();
      ctx.moveTo(PAD_TEXTURE_SIZE * 0.5, cy - chevronH * 0.45);
      ctx.lineTo(PAD_TEXTURE_SIZE * 0.85, cy + chevronH * 0.35);
      ctx.lineTo(PAD_TEXTURE_SIZE * 0.65, cy + chevronH * 0.35);
      ctx.lineTo(PAD_TEXTURE_SIZE * 0.5, cy - chevronH * 0.05);
      ctx.lineTo(PAD_TEXTURE_SIZE * 0.35, cy + chevronH * 0.35);
      ctx.lineTo(PAD_TEXTURE_SIZE * 0.15, cy + chevronH * 0.35);
      ctx.closePath();
      ctx.fill();
    }
    const texture = new THREE.CanvasTexture(c);
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, 3);
    return texture;
  }

  /** Clones the pad's chevron texture (same canvas, independent offset/repeat) at a different
   * vertical tiling, for ramps whose length differs from the pad's. */
  private cloneChevronTexture(repeatY: number): THREE.CanvasTexture {
    const t = this.padTexture.clone();
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1, repeatY);
    t.needsUpdate = true;
    return t;
  }

  private createGoalBannerTexture(): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = GOAL_BANNER_TEX_W;
    c.height = GOAL_BANNER_TEX_H;
    const ctx = c.getContext('2d')!;
    const cellW = GOAL_BANNER_TEX_W / GOAL_BANNER_CHECKER_COLS;
    for (let i = 0; i < GOAL_BANNER_CHECKER_COLS; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#000000' : '#ffffff';
      ctx.fillRect(i * cellW, 0, cellW, GOAL_BANNER_TEX_H);
    }
    return new THREE.CanvasTexture(c);
  }

  setTrack(track: Track): void {
    this.dispose();
    this.track = track;
    if (this.goalGroup && this.goalDistanceVal !== null) {
      this.goalGroup.position.set(0, this.track.heightAt(this.goalDistanceVal), -this.goalDistanceVal);
    }
  }

  /** Creates (once) or repositions the single finish gate at `goalDistance`. */
  setGoal(goalDistance: number): void {
    this.goalDistanceVal = goalDistance;
    if (!this.goalGroup) {
      this.goalGroup = this.buildGoalGate();
      this.scene.add(this.goalGroup);
    }
    this.goalGroup.position.set(0, this.track.heightAt(goalDistance), -goalDistance);
  }

  update(z: number, collected: ReadonlySet<string>, dt: number, brokenIds: ReadonlySet<string>): void {
    this.padTexture.offset.y -= dt * PAD_TEXTURE_SCROLL;
    this.rampTextureSmall.offset.y -= dt * PAD_TEXTURE_SCROLL;
    this.rampTextureBig.offset.y -= dt * PAD_TEXTURE_SCROLL;
    const current = this.track.segmentIndexAt(Math.max(0, z));
    const wanted = new Set<number>();
    for (let i = current - BEHIND; i <= current + AHEAD; i++) if (i >= 0) wanted.add(i);
    for (const [index, b] of this.bundles) {
      if (!wanted.has(index)) {
        this.scene.remove(b.group);
        for (const geo of b.disposables) geo.dispose();
        this.bundles.delete(index);
      }
    }
    for (const index of wanted) {
      if (!this.bundles.has(index)) {
        const b = this.build(this.track.getSegment(index));
        this.scene.add(b.group);
        this.bundles.set(index, b);
      }
    }
    for (const b of this.bundles.values()) {
      for (const [id, mesh] of b.coins) {
        mesh.visible = !collected.has(id);
        mesh.rotation.y += COIN_SPIN * dt;
      }
      for (const [id, holder] of b.obstacles) {
        holder.visible = !brokenIds.has(id);
      }
    }
  }

  dispose(): void {
    for (const b of this.bundles.values()) {
      this.scene.remove(b.group);
      for (const geo of b.disposables) geo.dispose();
    }
    this.bundles.clear();
  }

  private build(seg: Segment): Bundle {
    const group = new THREE.Group();
    const coins = new Map<string, THREE.Mesh>();
    const obstacles = new Map<string, THREE.Object3D>();
    const disposables: THREE.BufferGeometry[] = [];

    for (const o of seg.obstacles) {
      const y = this.track.heightAt(o.z);
      const holder = new THREE.Group();
      holder.position.set(o.x, y, -o.z);
      if (o.kind === 'tree') {
        const trunk = new THREE.Mesh(this.treeTrunk, this.matTrunk);
        trunk.position.y = 0.4;
        const top = new THREE.Mesh(this.treeTop, this.matTree);
        top.position.y = 0.8 + 1.2;
        holder.add(trunk, top);
      } else if (o.kind === 'rock') {
        const rock = new THREE.Mesh(this.rock, this.matRock);
        rock.position.y = 0.6;
        rock.rotation.set(0.3, o.z, 0.2);
        holder.add(rock);
      } else if (o.kind === 'stump') {
        const stump = new THREE.Mesh(this.stumpGeo, this.matStump);
        stump.position.y = STUMP_HEIGHT / 2;
        holder.add(stump);
      } else if (o.kind === 'car') {
        const idx = Math.abs(Math.floor(o.z)) % this.matCarPalette.length;
        const car = new THREE.Mesh(this.carGeo, this.matCarPalette[idx]);
        car.position.y = CAR_SIZE.h / 2;
        holder.add(car);
      } else if (o.kind === 'bus') {
        const bus = new THREE.Mesh(this.busGeo, this.matBus);
        bus.position.y = BUS_SIZE.h / 2;
        holder.add(bus);
      } else if (o.kind === 'sign') {
        const pole = new THREE.Mesh(this.signPoleGeo, this.matSignPole);
        pole.position.y = SIGN_POLE_HEIGHT / 2;
        const board = new THREE.Mesh(this.signBoardGeo, this.matSignBoard);
        board.position.y = SIGN_POLE_HEIGHT - SIGN_BOARD.h / 2;
        holder.add(pole, board);
      } else if (o.kind === 'barrier') {
        const barrier = new THREE.Mesh(this.barrierGeo, this.matBarrier);
        barrier.position.y = BARRIER_SIZE.h / 2;
        const stripe = new THREE.Mesh(this.barrierStripeGeo, this.matBarrierStripe);
        stripe.position.y = BARRIER_SIZE.h - BARRIER_STRIPE.h / 2;
        holder.add(barrier, stripe);
      } else if (o.kind === 'stalagmite') {
        const stalagmite = new THREE.Mesh(this.stalagmiteGeo, this.matStalagmite);
        stalagmite.position.y = STALAGMITE_HEIGHT / 2;
        holder.add(stalagmite);
      } else if (o.kind === 'crystal') {
        const crystal = new THREE.Mesh(this.crystalGeo, this.matCrystal);
        crystal.position.y = CRYSTAL_RADIUS;
        holder.add(crystal);
      } else if (o.kind === 'hay') {
        const hay = new THREE.Mesh(this.hayGeo, this.matHay);
        hay.rotation.z = Math.PI / 2;
        hay.position.y = HAY_RADIUS;
        holder.add(hay);
      } else if (o.kind === 'crate') {
        const crate = new THREE.Mesh(this.crateGeo, this.matCrate);
        crate.position.y = CRATE_SIZE / 2;
        const frameBottom = new THREE.Mesh(this.crateFrameGeo, this.matCrateEdge);
        frameBottom.position.y = CRATE_FRAME_Y_BOTTOM;
        const frameTop = new THREE.Mesh(this.crateFrameGeo, this.matCrateEdge);
        frameTop.position.y = CRATE_FRAME_Y_TOP;
        holder.add(crate, frameBottom, frameTop);
      } else if (o.kind === 'wall') {
        const wall = new THREE.Mesh(this.wallGeo, this.matWall);
        wall.position.y = WALL_SIZE.h / 2;
        holder.add(wall);
      } else if (o.kind === 'fence') {
        const rail = new THREE.Mesh(this.fenceRailGeo, this.matFence);
        rail.position.y = FENCE_RAIL_Y;
        holder.add(rail);
        for (const px of [-FENCE_POST_X, 0, FENCE_POST_X]) {
          const post = new THREE.Mesh(this.fencePostGeo, this.matFence);
          post.position.set(px, FENCE_POST_SIZE.h / 2, 0);
          holder.add(post);
        }
      } else if (o.kind === 'totem') {
        holder.add(this.buildTotemMesh());
      } else if (o.kind === 'palm') {
        holder.add(this.buildPalmMesh());
      } else if (o.kind === 'cactus') {
        const trunk = new THREE.Mesh(this.cactusTrunkGeo, this.matCactus);
        trunk.position.y = CACTUS_TRUNK_HEIGHT / 2;
        holder.add(trunk);
        for (const side of [1, -1]) {
          const arm = new THREE.Mesh(this.cactusArmGeo, this.matCactus);
          arm.position.set(side * CACTUS_ARM_X, CACTUS_ARM_Y, 0);
          arm.rotation.z = -side * CACTUS_ARM_TILT;
          holder.add(arm);
        }
      } else if (o.kind === 'asteroid') {
        // Per-instance jittered geometry (disposed with the segment, unlike the other obstacle
        // geometries, which are fixed shared shapes).
        const geo = new THREE.DodecahedronGeometry(ASTEROID_RADIUS, 0);
        jitterRadial(geo, o.z, ASTEROID_JITTER);
        const asteroid = new THREE.Mesh(geo, this.matAsteroid);
        asteroid.position.y = ASTEROID_Y;
        asteroid.rotation.set(0.3, o.z, 0.2);
        holder.add(asteroid);
        disposables.push(geo);
      } else if (o.kind === 'satellite') {
        const body = new THREE.Mesh(this.satelliteBodyGeo, this.matSatelliteBody);
        body.position.y = SATELLITE_BODY.h / 2;
        holder.add(body);
        for (const side of [1, -1]) {
          const panel = new THREE.Mesh(this.satellitePanelGeo, this.matSatellitePanel);
          panel.position.set(side * (SATELLITE_BODY.w / 2 + SATELLITE_PANEL.w / 2), body.position.y, 0);
          holder.add(panel);
        }
      } else {
        const base = new THREE.Mesh(this.ball, this.matSnow);
        base.position.y = 0.5;
        base.scale.setScalar(1.2);
        const head = new THREE.Mesh(this.ball, this.matSnow);
        head.position.y = 1.4;
        head.scale.setScalar(0.8);
        holder.add(base, head);
      }
      group.add(holder);
      obstacles.set(o.id, holder);
    }

    for (const r of seg.ramps) {
      const big = r.length === RAMP_BIG.length;
      const slabMat = big ? this.matRampBig : this.matRampSmall;
      const len = Math.sqrt(r.length * r.length + r.height * r.height);
      const midZ = r.z + r.length / 2;
      const y = this.track.heightAt(midZ, r.x) + RAMP_Y_OFFSET;
      const tilt = Math.atan2(r.height, r.length);

      const slab = new THREE.Mesh(this.rampSlabGeo, slabMat);
      slab.scale.set(r.width, 1, len);
      slab.position.set(r.x, y, -midZ);
      slab.rotation.x = tilt;
      group.add(slab);

      for (const side of [1, -1]) {
        const rail = new THREE.Mesh(this.rampRailGeo, this.matRampRail);
        rail.scale.z = len;
        rail.position.set(r.x + side * (r.width / 2 - RAMP_RAIL_X_INSET), y, -midZ);
        rail.rotation.x = tilt;
        group.add(rail);
      }
    }

    for (const c of seg.coins) {
      const mesh = new THREE.Mesh(this.coin, this.matCoin);
      mesh.position.set(c.x, coinWorldY(this.track, c, this.params), -c.z);
      group.add(mesh);
      coins.set(c.id, mesh);
    }

    for (const pad of seg.boosts) {
      const midZ = pad.z + pad.length / 2;
      const y = this.track.heightAt(midZ) + PAD_Y_OFFSET;
      const tilt = Math.atan(this.track.slopeAt(midZ));

      const mesh = new THREE.Mesh(this.padGeo, this.matPad);
      mesh.scale.set(pad.width, 1, pad.length);
      mesh.position.set(pad.x, y, -midZ);
      mesh.rotation.x = tilt;
      group.add(mesh);

      const glow = new THREE.Mesh(this.padGeo, this.matPadGlow);
      glow.scale.set(pad.width * PAD_GLOW_SCALE, 1, pad.length * PAD_GLOW_SCALE);
      glow.position.set(pad.x, y + PAD_GLOW_Y_OFFSET, -midZ);
      glow.rotation.x = tilt;
      group.add(glow);

      // Beacon: stands at the pad's far edge so the pad reads from far down the track.
      // Left in the XY plane (no rotation) so it faces the approaching player; a second
      // copy rotated 90 deg about Y makes it a cross-billboard readable from any angle.
      const beaconZ = pad.z + pad.length;
      const beaconY = this.track.heightAt(beaconZ) + BEACON_HEIGHT / 2;
      const beacon = new THREE.Mesh(this.beaconGeo, this.matBeacon);
      beacon.scale.set(pad.width, BEACON_HEIGHT, 1);
      beacon.position.set(pad.x, beaconY, -beaconZ);
      group.add(beacon);

      const beaconCross = new THREE.Mesh(this.beaconGeo, this.matBeacon);
      beaconCross.scale.set(pad.width, BEACON_HEIGHT, 1);
      beaconCross.position.set(pad.x, beaconY, -beaconZ);
      beaconCross.rotation.y = Math.PI / 2;
      group.add(beaconCross);
    }

    for (const d of seg.decor) this.buildDecor(group, d, seg.zone, disposables);
    if (seg.gate) this.buildGate(group, seg.gate);
    if (seg.route) this.buildRoute(group, seg.route);
    if (seg.slider) this.buildSlider(group, seg.slider, disposables);
    if (seg.zone === 'space') this.buildSpacePipes(group, seg);

    return { group, coins, obstacles, disposables };
  }

  /** Two dark rail tubes running the length of a slider section, one at each edge (art §5). Each
   * curve is unique per instance, so the TubeGeometry is per-instance and must be disposed with
   * the segment (unlike the shared/scaled geometries used elsewhere in this file). */
  private buildSlider(group: THREE.Group, slider: Slider, disposables: THREE.BufferGeometry[]): void {
    for (const side of [1, -1]) {
      const x = side * (slider.width / 2);
      const points: THREE.Vector3[] = [];
      for (let z = slider.z0; z < slider.z1; z += SLIDER_RAIL_SAMPLE) {
        points.push(new THREE.Vector3(x, this.track.heightAt(z, x) + SLIDER_RAIL_Y_OFFSET, -z));
      }
      points.push(new THREE.Vector3(x, this.track.heightAt(slider.z1, x) + SLIDER_RAIL_Y_OFFSET, -slider.z1));
      const curve = new THREE.CatmullRomCurve3(points);
      const tubeSegments = Math.max(1, points.length - 1);
      const geo = new THREE.TubeGeometry(curve, tubeSegments, SLIDER_RAIL_RADIUS, SLIDER_RAIL_RADIAL_SEGMENTS, false);
      const mesh = new THREE.Mesh(geo, this.matSliderRail);
      group.add(mesh);
      disposables.push(geo);
    }
  }

  /** Translucent ice-coloured tube for each half-pipe span inside a space-zone segment (art §5).
   * Shared unit geometry scaled per-instance (radius, length, radius), so nothing to dispose. */
  private buildSpacePipes(group: THREE.Group, seg: Segment): void {
    for (const p of seg.pipes) {
      const mid = (p.z0 + p.z1) / 2;
      const radius = this.track.widthAt(mid) / 2;
      const length = p.z1 - p.z0;
      const mesh = new THREE.Mesh(this.spacePipeGeo, this.matSpacePipe);
      mesh.scale.set(radius, length, radius);
      mesh.rotation.x = Math.PI / 2;
      mesh.position.set(0, this.track.heightAt(mid, 0) + radius, -mid);
      group.add(mesh);
    }
  }

  /** Trunk (tapered cylinder) plus 5 flat frond boxes radiating from the top, shared by the
   * `palm` obstacle and the `palm` decor (which scales the whole group by `d.scale`). */
  private buildPalmMesh(): THREE.Group {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(this.palmTrunkGeo, this.matPalmTrunk);
    trunk.position.y = PALM_TRUNK_HEIGHT / 2;
    g.add(trunk);
    for (let k = 0; k < PALM_FROND_COUNT; k++) {
      const frond = new THREE.Mesh(this.palmFrondGeo, this.matPalmFrond);
      frond.position.set(0, PALM_TRUNK_HEIGHT, 0);
      frond.rotation.y = (k / PALM_FROND_COUNT) * Math.PI * 2;
      frond.rotation.z = PALM_FROND_TILT;
      frond.translateX(PALM_FROND_SIZE.w / 2);
      g.add(frond);
    }
    return g;
  }

  /** Cylinder body plus a dark box "face" band, used by the `totem` obstacle. */
  private buildTotemMesh(): THREE.Group {
    const g = new THREE.Group();
    const body = new THREE.Mesh(this.totemGeo, this.matTotem);
    body.position.y = TOTEM_HEIGHT / 2;
    g.add(body);
    const face = new THREE.Mesh(this.totemFaceGeo, this.matTotemFace);
    face.position.set(0, TOTEM_HEIGHT * 0.55, TOTEM_RADIUS + TOTEM_FACE_SIZE.d / 2);
    g.add(face);
    return g;
  }

  /** Ridge-wall rock blocks, pillar cylinders/caps and the entry signpost for a route section
   * (terrain routes §4). Positions are absolute world coordinates, same as every other prop, so
   * it doesn't matter which segment bundle owns the group. */
  private buildRoute(group: THREE.Group, route: RouteSection): void {
    const zEnd = route.z1 - TRACK_GEN.routeExitBlend;
    for (let li = 0; li < route.lanes.length; li++) {
      const lane = route.lanes[li];
      if (lane.kind !== 'ridge') continue;
      // The ridge's inner boundary is whichever edge borders a lower lane: xMax when the ridge
      // is the leftmost lane (layouts A/C), xMin when it's the rightmost (layout B).
      const innerX = li === 0 ? lane.xMax : lane.xMin;
      const lowSign = li === 0 ? 1 : -1;
      for (let z = route.z0; z <= zEnd; z += ROUTE_WALL_SPACING) {
        const lowY = this.track.heightAt(z, innerX + lowSign * 0.5);
        this.addRouteWallBlock(group, innerX, lowY, z);
      }
      // (The ridge is entered up an incline over routeRidgeRamp metres, so there is no step face.)
    }

    for (const pillar of route.pillars) {
      const topY = this.track.heightAt(pillar.z, pillar.x);
      const body = new THREE.Mesh(this.routePillarGeo, this.matRoutePillar);
      body.position.set(pillar.x, topY - ROUTE_PILLAR_HEIGHT / 2, -pillar.z);
      group.add(body);
      const cap = new THREE.Mesh(this.routePillarCapGeo, this.matRoutePillarCap);
      cap.position.set(pillar.x, topY + ROUTE_PILLAR_CAP_THICKNESS / 2, -pillar.z);
      group.add(cap);
    }

    this.buildRouteSignpost(group, route);
  }

  /** Deterministic per-block y-rotation (small jitter), derived from position so it stays stable
   * across rebuilds. */
  private addRouteWallBlock(group: THREE.Group, x: number, groundY: number, z: number): void {
    const block = new THREE.Mesh(this.routeWallGeo, this.matRouteWall);
    block.position.set(x, groundY + ROUTE_WALL_BLOCK.h / 2, -z);
    block.rotation.y = (((z * 13 + x * 7) % 30) - 15) / 100;
    group.add(block);
  }

  /** One arrow board per lane (colour matches the lane kind), stacked on a pole placed
   * routeEntryRampLead + ROUTE_SIGNPOST_LEAD metres before the section's entry ramp. */
  private buildRouteSignpost(group: THREE.Group, route: RouteSection): void {
    const z = route.z0 - TRACK_GEN.routeEntryRampLead - ROUTE_SIGNPOST_LEAD;
    const ground = this.track.heightAt(z);
    const holder = new THREE.Group();
    holder.position.set(0, ground, -z);
    const pole = new THREE.Mesh(this.routeSignpostPoleGeo, this.matRouteSignpostPole);
    pole.position.y = ROUTE_SIGNPOST_POLE_HEIGHT / 2;
    holder.add(pole);
    route.lanes.forEach((lane, i) => {
      const board = new THREE.Mesh(this.routeSignpostBoardGeo, this.matRouteBoard.get(lane.kind)!);
      const y = ROUTE_SIGNPOST_POLE_HEIGHT - ROUTE_SIGNPOST_BOARD.h / 2
        - i * (ROUTE_SIGNPOST_BOARD.h + ROUTE_SIGNPOST_BOARD_GAP);
      board.position.set(0, Math.max(y, ROUTE_SIGNPOST_BOARD.h / 2), 0);
      holder.add(board);
    });
    group.add(holder);
  }

  private buildDecor(group: THREE.Group, d: Decor, zone: ZoneId, disposables: THREE.BufferGeometry[]): void {
    const ground = this.track.heightAt(d.z);
    if (d.kind === 'pine') {
      const holder = new THREE.Group();
      holder.position.set(d.x, ground, -d.z);
      holder.scale.setScalar(d.scale);
      const trunk = new THREE.Mesh(this.treeTrunk, this.matTrunk);
      trunk.position.y = 0.4;
      const top = new THREE.Mesh(this.treeTop, this.matTree);
      top.position.y = 0.8 + 1.2;
      holder.add(trunk, top);
      group.add(holder);
    } else if (d.kind === 'building') {
      const body = new THREE.Mesh(this.buildingGeo, this.matBuilding);
      body.scale.y = d.scale;
      body.position.set(d.x, ground + d.scale / 2, -d.z);
      group.add(body);
      const roof = new THREE.Mesh(this.buildingRoofGeo, this.matBuildingRoof);
      roof.position.set(d.x, ground + d.scale + BUILDING_ROOF.h / 2, -d.z);
      group.add(roof);
    } else if (d.kind === 'stalactite') {
      const stalactite = new THREE.Mesh(this.stalactiteGeo, this.matStalagmite);
      stalactite.scale.setScalar(d.scale);
      stalactite.rotation.x = Math.PI;
      stalactite.position.set(d.x, ground + d.y, -d.z);
      group.add(stalactite);
    } else if (d.kind === 'cliff') {
      const width = cliffWidth(d.z);
      const radius = width / 2;
      const height = d.scale;
      const rotY = cliffRotation(d.z);
      const mat = this.matCliff.get(zone)!;

      // Per-instance geometry (jittered from d.z), disposed with the segment; unlike most props
      // here it can't be a shared/scaled unit shape because the jitter itself is per-instance.
      const bodyGeo = new THREE.ConeGeometry(radius, height, CLIFF_CONE_SEGMENTS);
      jitterConeXZ(bodyGeo, d.z, radius * CLIFF_JITTER_FRACTION);
      const body = new THREE.Mesh(bodyGeo, mat);
      body.position.set(d.x, ground + height / 2 - CLIFF_Y_SINK, -d.z);
      body.rotation.y = rotY;
      group.add(body);
      disposables.push(bodyGeo);

      if (zone !== 'volcano') {
        const capRadius = radius * CLIFF_CAP_RADIUS_SCALE;
        const capHeight = height * CLIFF_CAP_HEIGHT_SCALE;
        const cap = new THREE.Mesh(this.cliffCapGeo, this.matCliffCap);
        cap.scale.set(capRadius, capHeight, capRadius);
        cap.position.set(d.x, ground + height - CLIFF_Y_SINK - capHeight / 2, -d.z);
        cap.rotation.y = rotY;
        group.add(cap);
      }
    } else if (d.kind === 'dune') {
      const width = duneWidth(d.z, d.x);
      const dune = new THREE.Mesh(this.duneGeo, this.matDune);
      dune.scale.set(width, d.scale, DUNE_DEPTH);
      dune.position.set(d.x, ground, -d.z);
      group.add(dune);
    } else if (d.kind === 'pyramid') {
      const pyramid = new THREE.Mesh(this.pyramidGeo, this.matPyramid);
      pyramid.scale.set(d.scale * PYRAMID_RADIUS_SCALE, d.scale, d.scale * PYRAMID_RADIUS_SCALE);
      pyramid.position.set(d.x, ground + d.scale / 2, -d.z);
      pyramid.rotation.y = Math.PI / 4;
      group.add(pyramid);
    } else if (d.kind === 'palm') {
      const holder = this.buildPalmMesh();
      holder.position.set(d.x, ground, -d.z);
      holder.scale.setScalar(d.scale);
      group.add(holder);
    } else if (d.kind === 'temple') {
      const body = new THREE.Mesh(this.templeGeo, this.matTemple);
      body.scale.y = d.scale;
      body.position.set(d.x, ground + d.scale / 2, -d.z);
      group.add(body);
      const topHeight = d.scale * TEMPLE_TOP_HEIGHT_SCALE;
      const top = new THREE.Mesh(this.templeGeo, this.matTemple);
      top.scale.set(TEMPLE_TOP_SCALE, topHeight, TEMPLE_TOP_SCALE);
      top.position.set(d.x, ground + d.scale + topHeight / 2, -d.z);
      group.add(top);
    } else if (d.kind === 'signpost') {
      const holder = new THREE.Group();
      holder.position.set(d.x, ground, -d.z);
      const pole = new THREE.Mesh(this.signpostPoleGeo, this.matSignpostPole);
      pole.position.y = SIGNPOST_POLE_HEIGHT / 2;
      holder.add(pole);
      const topY = SIGNPOST_POLE_HEIGHT - SIGNPOST_BOARD.h / 2;
      const arms: readonly [side: number, y: number, rotationY: number][] = [
        [-1, topY, SIGNPOST_ARROW_ROTATION],
        [1, topY - SIGNPOST_ARM_GAP, -SIGNPOST_ARROW_ROTATION],
      ];
      for (const [side, y, rotationY] of arms) {
        const x = side * (SIGNPOST_ARM_X + SIGNPOST_ARROW_OFFSET);
        const edge = new THREE.Mesh(this.signpostEdgeGeo, this.matSignpostEdge);
        edge.position.set(x, y, -0.01);
        edge.rotation.y = rotationY;
        holder.add(edge);
        const board = new THREE.Mesh(this.signpostBoardGeo, this.matSignpostBoard);
        board.position.set(x, y, 0);
        board.rotation.y = rotationY;
        holder.add(board);
      }
      group.add(holder);
    }
  }

  private getGateNameMaterial(zone: ZoneId): THREE.MeshBasicMaterial {
    let mat = this.gateNameMaterials.get(zone);
    if (mat) return mat;
    const zoneDef = ZONES.find((z) => z.id === zone)!;
    const c = document.createElement('canvas');
    c.width = GATE_NAME_W;
    c.height = GATE_NAME_H;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = `#${ZONE_THEMES[zone].gate.getHexString()}`;
    ctx.fillRect(0, 0, GATE_NAME_W, GATE_NAME_H);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 64px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(zoneDef.nameJa, GATE_NAME_W / 2, GATE_NAME_H / 2);
    const texture = new THREE.CanvasTexture(c);
    mat = new THREE.MeshBasicMaterial({ map: texture });
    this.gateNameMaterials.set(zone, mat);
    return mat;
  }

  /** Portal ring (16 boxes on a vertical circle) with a translucent zone-coloured disc inside and
   * the zone-name label above (art §5; replaces the old posts/banner gate for every zone). */
  private buildGate(group: THREE.Group, gate: Gate): void {
    const ground = this.track.heightAt(gate.z);
    const centerY = ground + GATE_RING_CENTER_Y;
    for (let i = 0; i < GATE_RING_COUNT; i++) {
      const angle = (i / GATE_RING_COUNT) * Math.PI * 2;
      const box = new THREE.Mesh(this.gateRingBoxGeo, this.matGateRing);
      box.position.set(
        Math.cos(angle) * GATE_RING_RADIUS, centerY + Math.sin(angle) * GATE_RING_RADIUS, -gate.z,
      );
      box.rotation.z = angle - Math.PI / 2;
      group.add(box);
    }

    const disc = new THREE.Mesh(this.gateDiscGeo, this.matGateDisc.get(gate.zone)!);
    disc.position.set(0, centerY, -gate.z);
    group.add(disc);

    const name = new THREE.Mesh(this.gateNameGeo, this.getGateNameMaterial(gate.zone));
    name.position.set(0, centerY + GATE_RING_RADIUS + GATE_NAME_CLEARANCE, -gate.z + GATE_NAME_Z_OFFSET);
    group.add(name);
  }

  /** Two posts, a checkered banner facing +world z, and a low rope-like bar underneath.
   * Positioned by setGoal(), not part of any segment bundle (survives segment recycling). */
  private buildGoalGate(): THREE.Group {
    const group = new THREE.Group();
    const postX = TRACK_WIDTH / 2 + GOAL_POST_X_OFFSET;
    for (const side of [1, -1]) {
      const post = new THREE.Mesh(this.goalPostGeo, this.matGoalPost);
      post.position.set(side * postX, GOAL_POST_HEIGHT / 2, 0);
      group.add(post);
    }
    const banner = new THREE.Mesh(this.goalBannerGeo, this.matGoalBanner);
    banner.position.set(0, GOAL_BANNER_Y, 0);
    group.add(banner);

    const rope = new THREE.Mesh(this.goalRopeGeo, this.matGoalRope);
    rope.position.set(0, GOAL_ROPE_Y, 0);
    group.add(rope);
    return group;
  }
}
