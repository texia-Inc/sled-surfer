import * as THREE from 'three';
import type { Segment, Track } from '../core/types';
import type { PhysicsParams } from '../core/params';
import { coinWorldY } from '../core/physics';
import { TRACK_WIDTH } from '../core/track';

const BEHIND = 1;
const AHEAD = 3;
const COIN_SPIN = 3;
const PAD_TEXTURE_SIZE = 256;
const PAD_TEXTURE_SCROLL = 1.5;
const PAD_OPACITY = 0.95;
const PAD_GLOW_SCALE = 1.25;
const PAD_Y_OFFSET = 0.06;
const PAD_GLOW_Y_OFFSET = 0.01;
/** Vertical marker standing at a pad's far edge so it reads from far down the track. */
const BEACON_HEIGHT = 7;
const BEACON_COLOR = 0x8ff4ff;
const BEACON_OPACITY = 0.22;

interface Bundle {
  group: THREE.Group;
  coins: Map<string, THREE.Mesh>;
}

export class PropManager {
  private bundles = new Map<number, Bundle>();
  private track: Track;

  private readonly treeTop = new THREE.ConeGeometry(0.9, 2.4, 7);
  private readonly treeTrunk = new THREE.CylinderGeometry(0.2, 0.25, 0.8, 6);
  private readonly rock = new THREE.DodecahedronGeometry(1.0, 0);
  private readonly ball = new THREE.SphereGeometry(0.5, 10, 8);
  private readonly coin = new THREE.CylinderGeometry(0.5, 0.5, 0.15, 16);
  private readonly plank = new THREE.BoxGeometry(TRACK_WIDTH, 0.4, 1);
  private readonly padGeo = new THREE.PlaneGeometry(1, 1);
  /** Unit plane left standing in the XY plane (unrotated) for pad beacons. */
  private readonly beaconGeo = new THREE.PlaneGeometry(1, 1);

  private readonly matTree = new THREE.MeshLambertMaterial({ color: 0x2f8f4e, flatShading: true });
  private readonly matTrunk = new THREE.MeshLambertMaterial({ color: 0x7a4b2a, flatShading: true });
  private readonly matRock = new THREE.MeshLambertMaterial({ color: 0x8b8f99, flatShading: true });
  private readonly matSnow = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
  private readonly matCoin = new THREE.MeshLambertMaterial({ color: 0xffc928, emissive: 0x553300 });
  private readonly matPlank = new THREE.MeshLambertMaterial({ color: 0xb8743a, flatShading: true });
  private readonly padTexture = this.createPadTexture();
  private readonly matPad = new THREE.MeshBasicMaterial({
    color: 0x2bd8ff, transparent: true, opacity: PAD_OPACITY, map: this.padTexture,
  });
  private readonly matPadGlow = new THREE.MeshBasicMaterial({
    color: 0x9ff3ff, transparent: true, opacity: 0.35,
  });
  private readonly matBeacon = new THREE.MeshBasicMaterial({
    color: BEACON_COLOR, transparent: true, opacity: BEACON_OPACITY,
    side: THREE.DoubleSide, depthWrite: false,
  });

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
    ctx.fillStyle = '#0b4fa0';
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

  setTrack(track: Track): void {
    this.dispose();
    this.track = track;
  }

  update(z: number, collected: ReadonlySet<string>, dt: number): void {
    this.padTexture.offset.y -= dt * PAD_TEXTURE_SCROLL;
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
    }
  }

  dispose(): void {
    for (const b of this.bundles.values()) this.scene.remove(b.group);
    this.bundles.clear();
  }

  private build(seg: Segment): Bundle {
    const group = new THREE.Group();
    const coins = new Map<string, THREE.Mesh>();

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
    }

    for (const r of seg.ramps) {
      const mesh = new THREE.Mesh(this.plank, this.matPlank);
      const len = Math.sqrt(r.length * r.length + r.height * r.height);
      mesh.scale.z = len;
      const midZ = r.z + r.length / 2;
      mesh.position.set(0, this.track.heightAt(midZ) + 0.15, -midZ);
      mesh.rotation.x = Math.atan2(r.height, r.length);
      group.add(mesh);
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

    return { group, coins };
  }
}
