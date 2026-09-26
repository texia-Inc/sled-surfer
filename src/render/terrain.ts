import * as THREE from 'three';
import type { Track } from '../core/types';
import { SEGMENT_LENGTH, TRACK_WIDTH } from '../core/track';
import { zoneAt } from '../core/zones';
import { blendedThemeColor } from './zoneTheme';

const SIDE_MARGIN = 28;
const WIDTH_SEGMENTS = 56;
const LENGTH_SEGMENTS = 200;
const BEHIND = 1;
const AHEAD = 3;

/** City lane-marking colour and the |x| bands they occupy, computed per-vertex from the track's
 * actual width at that z (`w = widthAt(gz)`) so the stripes stay proportional on x-aware/variable
 * width track instead of using absolute offsets tuned for a single TRACK_WIDTH: two dashed lines
 * at w/6 and w/3 from centerline, plus a solid pair of edge lines near the track boundary. */
const STRIPE_WHITE = new THREE.Color(0.95, 0.95, 0.95);
const STRIPE_HALF_WIDTH = 0.2;
const DASH_PERIOD = 4;
const EDGE_INSET_MIN = 0.2;
const EDGE_INSET_MAX = 0.6;

/** Distant coarse "valley" plane (terrain §3): one 1000m chunk = 5 detailed segments, low
 * resolution, flat-shaded, drawn only where the detailed TerrainManager meshes above don't
 * already cover the ground (i.e. starting where the detailed BEHIND/AHEAD window ends). */
const FAR_CHUNK_LENGTH = 1000;
const FAR_WIDTH = 200;
const FAR_WIDTH_SEGMENTS = 8;
const FAR_LENGTH_SEGMENTS = 40;
const FAR_CHUNK_COUNT = 2;
const FAR_DARKEN = 0.85;
/** Metres the far chunk is lowered below the detailed terrain's height, so the two slightly
 * overlap at the boundary instead of leaving a visible seam/gap. */
const FAR_DROP = 0.4;

/** Route-section hazard floor colours (terrain routes §4): bright lava glow in the volcano zone,
 * dark chasm elsewhere. Ridge lanes use the ground colour darkened by RIDGE_DARKEN. */
const LAVA_COLOR = new THREE.Color(1.0, 0.45, 0.10);
const CHASM_COLOR = new THREE.Color(0.10, 0.11, 0.16);
const RIDGE_DARKEN = 0.9;

export class TerrainManager {
  private meshes = new Map<number, THREE.Mesh>();
  private farMeshes = new Map<number, THREE.Mesh>();
  private readonly material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  private readonly farMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  private readonly colorTmp = new THREE.Color();
  private track: Track;

  constructor(private readonly scene: THREE.Scene, track: Track) {
    this.track = track;
  }

  setTrack(track: Track): void {
    this.dispose();
    this.track = track;
  }

  update(z: number): void {
    const current = this.track.segmentIndexAt(Math.max(0, z));
    const wanted = new Set<number>();
    for (let i = current - BEHIND; i <= current + AHEAD; i++) if (i >= -BEHIND) wanted.add(i);
    for (const [index, mesh] of this.meshes) {
      if (!wanted.has(index)) {
        this.scene.remove(mesh);
        mesh.geometry.dispose();
        this.meshes.delete(index);
      }
    }
    for (const index of wanted) {
      if (!this.meshes.has(index)) {
        const mesh = this.build(index);
        this.scene.add(mesh);
        this.meshes.set(index, mesh);
      }
    }
    this.updateFar(current);
  }

  dispose(): void {
    for (const mesh of this.meshes.values()) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
    }
    this.meshes.clear();
    for (const mesh of this.farMeshes.values()) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
    }
    this.farMeshes.clear();
  }

  private build(index: number): THREE.Mesh {
    const z0 = index * SEGMENT_LENGTH;
    const geo = new THREE.PlaneGeometry(TRACK_WIDTH + SIDE_MARGIN * 2, SEGMENT_LENGTH, WIDTH_SEGMENTS, LENGTH_SEGMENTS);
    geo.rotateX(-Math.PI / 2);
    const centerWorldZ = -(z0 + SEGMENT_LENGTH / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const lx = pos.getX(i);
      const lz = pos.getZ(i);
      const gz = -(centerWorldZ + lz);
      pos.setY(i, this.track.heightAt(gz, lx));
      const onTrack = Math.abs(lx) <= this.track.widthAt(gz) / 2;
      let c: THREE.Color;
      if (!onTrack) {
        c = blendedThemeColor(gz, (t) => t.bank, this.colorTmp);
      } else if (this.track.surfaceAt(gz) === 'ice') {
        c = blendedThemeColor(gz, (t) => t.ice, this.colorTmp);
      } else {
        c = blendedThemeColor(gz, (t) => t.ground, this.colorTmp);
      }
      if (onTrack) {
        const route = this.track.routeAt(gz);
        if (route) {
          const lane = this.track.laneAt(gz, lx);
          if (lane?.kind === 'pillars' && !this.track.onPillar(gz, lx)) {
            c = route.hazard === 'lava' ? LAVA_COLOR : CHASM_COLOR;
          } else if (lane?.kind === 'ridge') {
            c.multiplyScalar(RIDGE_DARKEN);
          }
        }
      }
      if (onTrack && zoneAt(gz).id === 'city') {
        const ax = Math.abs(lx);
        const w = this.track.widthAt(gz);
        const inDashBand =
          (ax >= w / 6 - STRIPE_HALF_WIDTH && ax <= w / 6 + STRIPE_HALF_WIDTH) ||
          (ax >= w / 3 - STRIPE_HALF_WIDTH && ax <= w / 3 + STRIPE_HALF_WIDTH);
        const dashed = inDashBand && Math.floor(gz / DASH_PERIOD) % 2 === 0;
        const edge = ax >= w / 2 - EDGE_INSET_MAX && ax <= w / 2 - EDGE_INSET_MIN;
        if (dashed || edge) c = STRIPE_WHITE;
      }
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    pos.needsUpdate = true;
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, this.material);
    mesh.position.z = centerWorldZ;
    return mesh;
  }

  /** Manages the far valley chunks: two 1000m-long coarse planes starting right where the
   * detailed segment window (current - BEHIND .. current + AHEAD) ends, so they never overlap
   * the detailed meshes above. Keyed by their own start z (not a fixed global grid), like the
   * detailed segments are keyed by index. */
  private updateFar(current: number): void {
    const detailedMaxZ = (current + AHEAD + 1) * SEGMENT_LENGTH;
    const wanted = new Set<number>();
    for (let k = 0; k < FAR_CHUNK_COUNT; k++) wanted.add(detailedMaxZ + k * FAR_CHUNK_LENGTH);
    for (const [z0, mesh] of this.farMeshes) {
      if (!wanted.has(z0)) {
        this.scene.remove(mesh);
        mesh.geometry.dispose();
        this.farMeshes.delete(z0);
      }
    }
    for (const z0 of wanted) {
      if (!this.farMeshes.has(z0)) {
        const mesh = this.buildFar(z0);
        this.scene.add(mesh);
        this.farMeshes.set(z0, mesh);
      }
    }
  }

  private buildFar(z0: number): THREE.Mesh {
    const geo = new THREE.PlaneGeometry(FAR_WIDTH, FAR_CHUNK_LENGTH, FAR_WIDTH_SEGMENTS, FAR_LENGTH_SEGMENTS);
    geo.rotateX(-Math.PI / 2);
    const centerWorldZ = -(z0 + FAR_CHUNK_LENGTH / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const lx = pos.getX(i);
      const lz = pos.getZ(i);
      const gz = -(centerWorldZ + lz);
      pos.setY(i, this.track.heightAt(gz, 0) - FAR_DROP);
      const onTrack = Math.abs(lx) <= this.track.widthAt(gz) / 2;
      const c = onTrack
        ? blendedThemeColor(gz, (t) => t.ground, this.colorTmp)
        : blendedThemeColor(gz, (t) => t.bank, this.colorTmp).multiplyScalar(FAR_DARKEN);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    pos.needsUpdate = true;
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, this.farMaterial);
    mesh.position.z = centerWorldZ;
    return mesh;
  }
}
