import * as THREE from 'three';
import type { Track } from '../core/types';
import { SEGMENT_LENGTH, TRACK_WIDTH } from '../core/track';

const SIDE_MARGIN = 8;
const WIDTH_SEGMENTS = 12;
const LENGTH_SEGMENTS = 200;
const BEHIND = 1;
const AHEAD = 3;

const SNOW = new THREE.Color(0.97, 0.98, 1.0);
const ICE = new THREE.Color(0.7, 0.88, 1.0);
const BANK = new THREE.Color(0.82, 0.88, 0.95);

export class TerrainManager {
  private meshes = new Map<number, THREE.Mesh>();
  private readonly material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
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
  }

  dispose(): void {
    for (const mesh of this.meshes.values()) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
    }
    this.meshes.clear();
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
      pos.setY(i, this.track.heightAt(gz));
      const onTrack = Math.abs(lx) <= TRACK_WIDTH / 2;
      const c = !onTrack ? BANK : this.track.surfaceAt(gz) === 'ice' ? ICE : SNOW;
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
}
