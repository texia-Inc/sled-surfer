import * as THREE from 'three';
import type { Decor, Gate, Segment, Track, ZoneId } from '../core/types';
import type { PhysicsParams } from '../core/params';
import { coinWorldY } from '../core/physics';
import { RAMP_BIG, RAMP_SMALL, TRACK_WIDTH } from '../core/track';
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
const RAMP_RAIL_X_INSET = 0.4;
const RAMP_Y_OFFSET = 0.15;

// --- Breakable obstacle geometry constants ---
const HAY_RADIUS = 0.9;
const HAY_LENGTH = 1.0;
const HAY_COLOR = 0xe0b84a;
const CRATE_SIZE = 1.2;
const CRATE_EDGE_SIZE = 1.3;
const CRATE_COLOR = 0xa06a2c;
const CRATE_EDGE_COLOR = 0x6b4620;
const FENCE_RAIL_SIZE = { w: 3.0, h: 1.1, d: 0.15 };
const FENCE_POST_SIZE = { w: 0.15, h: 1.3, d: 0.15 };
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

// --- Decor geometry constants ---
const BUILDING_SIZE = { w: 7, d: 7 };
const BUILDING_ROOF = { w: 7.2, h: 0.6, d: 7.2 };
const STALACTITE_RADIUS = 0.6;
const STALACTITE_HEIGHT = 2.4;
const CLIFF_SIZE = { w: 6, d: 8 };
const CLIFF_Y_SINK = 2;
/** Radians of y-rotation jitter applied to cliffs, deterministic from `d.z`. */
const CLIFF_ROTATION_RANGE = 0.6;
const CLIFF_COLORS: Record<ZoneId, number> = {
  snowfield: 0xe6eef7, forest: 0x7a5a3c, city: 0x7d8189, cave: 0x1e2438,
};

// --- Gate geometry constants ---
const GATE_POST_RADIUS = 0.25;
const GATE_POST_HEIGHT = 5;
const GATE_POST_X_OFFSET = 0.5;
const GATE_BANNER_HEIGHT = 1.2;
const GATE_BANNER_DEPTH = 0.3;
const GATE_BANNER_Y = 5;
const GATE_NAME_W = 512;
const GATE_NAME_H = 96;
const GATE_NAME_PLANE_H = 1.1;
const GATE_NAME_Z_OFFSET = 0.2;

/** Deterministic pseudo-random y-rotation for a cliff, derived from its z so it stays stable
 * across rebuilds (the segment isn't re-generated, but a fresh Track uses a different z per
 * cliff anyway; this just avoids storing an extra random field on Decor). */
function cliffRotation(z: number): number {
  const s = Math.sin(z * 12.9898) * 43758.5453;
  const frac = s - Math.floor(s);
  return (frac - 0.5) * CLIFF_ROTATION_RANGE;
}

interface Bundle {
  group: THREE.Group;
  coins: Map<string, THREE.Mesh>;
  obstacles: Map<string, THREE.Object3D>;
}

export class PropManager {
  private bundles = new Map<number, Bundle>();
  private track: Track;

  private readonly treeTop = new THREE.ConeGeometry(0.9, 2.4, 7);
  private readonly treeTrunk = new THREE.CylinderGeometry(0.2, 0.25, 0.8, 6);
  private readonly rock = new THREE.DodecahedronGeometry(1.0, 0);
  private readonly ball = new THREE.SphereGeometry(0.5, 10, 8);
  private readonly coin = new THREE.CylinderGeometry(0.5, 0.5, 0.15, 16);
  private readonly rampSlabGeo = new THREE.BoxGeometry(TRACK_WIDTH, RAMP_SLAB_THICKNESS, 1);
  private readonly rampRailGeo = new THREE.BoxGeometry(RAMP_RAIL_SIZE.w, RAMP_RAIL_SIZE.h, 1);
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

  // --- Breakable obstacle geometries ---
  private readonly hayGeo = new THREE.CylinderGeometry(HAY_RADIUS, HAY_RADIUS, HAY_LENGTH, 12);
  private readonly crateGeo = new THREE.BoxGeometry(CRATE_SIZE, CRATE_SIZE, CRATE_SIZE);
  private readonly crateEdgeGeo = new THREE.BoxGeometry(CRATE_EDGE_SIZE, CRATE_EDGE_SIZE, CRATE_EDGE_SIZE);
  private readonly fenceRailGeo = new THREE.BoxGeometry(FENCE_RAIL_SIZE.w, FENCE_RAIL_SIZE.h, FENCE_RAIL_SIZE.d);
  private readonly fencePostGeo = new THREE.BoxGeometry(FENCE_POST_SIZE.w, FENCE_POST_SIZE.h, FENCE_POST_SIZE.d);

  // --- Decor geometries (shared unit shapes, scaled per-instance) ---
  private readonly buildingGeo = new THREE.BoxGeometry(BUILDING_SIZE.w, 1, BUILDING_SIZE.d);
  private readonly buildingRoofGeo = new THREE.BoxGeometry(BUILDING_ROOF.w, BUILDING_ROOF.h, BUILDING_ROOF.d);
  private readonly stalactiteGeo = new THREE.ConeGeometry(STALACTITE_RADIUS, STALACTITE_HEIGHT, 7);
  private readonly cliffGeo = new THREE.BoxGeometry(CLIFF_SIZE.w, 1, CLIFF_SIZE.d);

  // --- Gate geometries ---
  private readonly gatePostGeo = new THREE.CylinderGeometry(GATE_POST_RADIUS, GATE_POST_RADIUS, GATE_POST_HEIGHT, 8);
  private readonly gateBannerGeo = new THREE.BoxGeometry(TRACK_WIDTH + 1, GATE_BANNER_HEIGHT, GATE_BANNER_DEPTH);
  private readonly gateNameGeo = new THREE.PlaneGeometry(TRACK_WIDTH, GATE_NAME_PLANE_H);

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

  // --- Gate materials (one per zone, keyed by the zone the gate leads into) ---
  private readonly matGatePost = new THREE.MeshLambertMaterial({ color: 0xdedede, flatShading: true });
  private readonly matGateBanner = new Map<ZoneId, THREE.MeshLambertMaterial>(
    ZONES.map((z) => [z.id, new THREE.MeshLambertMaterial({ color: ZONE_THEMES[z.id].gate, flatShading: true })]),
  );
  private readonly gateNameMaterials = new Map<ZoneId, THREE.MeshBasicMaterial>();

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

  setTrack(track: Track): void {
    this.dispose();
    this.track = track;
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
    for (const b of this.bundles.values()) this.scene.remove(b.group);
    this.bundles.clear();
  }

  private build(seg: Segment): Bundle {
    const group = new THREE.Group();
    const coins = new Map<string, THREE.Mesh>();
    const obstacles = new Map<string, THREE.Object3D>();

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
        const edge = new THREE.Mesh(this.crateEdgeGeo, this.matCrateEdge);
        edge.position.y = CRATE_EDGE_SIZE / 2;
        const crate = new THREE.Mesh(this.crateGeo, this.matCrate);
        crate.position.y = CRATE_SIZE / 2;
        holder.add(edge, crate);
      } else if (o.kind === 'fence') {
        const rail = new THREE.Mesh(this.fenceRailGeo, this.matFence);
        rail.position.y = FENCE_RAIL_Y;
        holder.add(rail);
        for (const px of [-FENCE_POST_X, 0, FENCE_POST_X]) {
          const post = new THREE.Mesh(this.fencePostGeo, this.matFence);
          post.position.set(px, FENCE_POST_SIZE.h / 2, 0);
          holder.add(post);
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
      const y = this.track.heightAt(midZ) + RAMP_Y_OFFSET;
      const tilt = Math.atan2(r.height, r.length);

      const slab = new THREE.Mesh(this.rampSlabGeo, slabMat);
      slab.scale.z = len;
      slab.position.set(0, y, -midZ);
      slab.rotation.x = tilt;
      group.add(slab);

      for (const side of [1, -1]) {
        const rail = new THREE.Mesh(this.rampRailGeo, this.matRampRail);
        rail.scale.z = len;
        rail.position.set(side * (TRACK_WIDTH / 2 - RAMP_RAIL_X_INSET), y, -midZ);
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

    for (const d of seg.decor) this.buildDecor(group, d, seg.zone);
    if (seg.gate) this.buildGate(group, seg.gate);

    return { group, coins, obstacles };
  }

  private buildDecor(group: THREE.Group, d: Decor, zone: ZoneId): void {
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
      const cliff = new THREE.Mesh(this.cliffGeo, this.matCliff.get(zone)!);
      cliff.scale.y = d.scale;
      cliff.position.set(d.x, ground + d.scale / 2 - CLIFF_Y_SINK, -d.z);
      cliff.rotation.y = cliffRotation(d.z);
      group.add(cliff);
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

  private buildGate(group: THREE.Group, gate: Gate): void {
    const ground = this.track.heightAt(gate.z);
    const postX = TRACK_WIDTH / 2 + GATE_POST_X_OFFSET;
    for (const side of [1, -1]) {
      const post = new THREE.Mesh(this.gatePostGeo, this.matGatePost);
      post.position.set(side * postX, ground + GATE_POST_HEIGHT / 2, -gate.z);
      group.add(post);
    }
    const bannerMat = this.matGateBanner.get(gate.zone)!;
    const banner = new THREE.Mesh(this.gateBannerGeo, bannerMat);
    banner.position.set(0, ground + GATE_BANNER_Y, -gate.z);
    group.add(banner);

    const name = new THREE.Mesh(this.gateNameGeo, this.getGateNameMaterial(gate.zone));
    name.position.set(0, ground + GATE_BANNER_Y, -gate.z + GATE_NAME_Z_OFFSET);
    group.add(name);
  }
}
