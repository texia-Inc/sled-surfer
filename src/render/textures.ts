import * as THREE from 'three';
import type { ZoneId } from '../core/types';

/** Per-zone ground detail texture (art §4): a small tileable canvas that multiplies the
 * per-vertex ground colour, so it stays white-ish (values close to 1) rather than recolouring
 * anything. Memoised per zone id since the canvas is deterministic and reused by every segment
 * mesh in that zone. */
const SIZE = 256;
const cache = new Map<ZoneId, THREE.CanvasTexture>();

/** Deterministic 0..1 hash of an integer lattice point, wrapped modulo `cells` first so that
 * hashing point `x` and point `x + cells` gives the same value (the lattice tiles). */
function latticeHash(x: number, y: number, cells: number): number {
  const xi = ((x % cells) + cells) % cells;
  const yi = ((y % cells) + cells) % cells;
  const s = Math.sin(xi * 127.1 + yi * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

/** Per-pixel (non-tileable) hash, used for fine grain/sparkle where incoherent noise has no
 * visible seam to worry about. */
function pixelHash(x: number, y: number): number {
  const s = Math.sin(x * 12.989 + y * 78.233) * 43758.5453123;
  return s - Math.floor(s);
}

/** Tileable value noise: samples a `cells` x `cells` lattice (wrapped via latticeHash) at
 * pixel (px, py) of a SIZE x SIZE canvas, with smoothstep interpolation. Because px/py are
 * first normalised by SIZE, the pattern is exactly periodic over the canvas for any integer
 * `cells`, so it tiles seamlessly under RepeatWrapping. */
function noise(px: number, py: number, cells: number): number {
  const x = (px / SIZE) * cells;
  const y = (py / SIZE) * cells;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const xf = x - x0;
  const yf = y - y0;
  const h00 = latticeHash(x0, y0, cells);
  const h10 = latticeHash(x0 + 1, y0, cells);
  const h01 = latticeHash(x0, y0 + 1, cells);
  const h11 = latticeHash(x0 + 1, y0 + 1, cells);
  const sx = xf * xf * (3 - 2 * xf);
  const sy = yf * yf * (3 - 2 * yf);
  const a = h00 + (h10 - h00) * sx;
  const b = h01 + (h11 - h01) * sx;
  return a + (b - a) * sy;
}

const SPECKLE_CELLS = 20;
const SPARKLE_THRESHOLD = 0.988;
const GRIT_CELLS = 10;
const CRACK_CYCLES = 9;
const CRACK_WIDTH = 0.05;
const CRACK_PRESENCE = 0.65;
const RIPPLE_CYCLES = 11; // ~SIZE/11 = ~23px period, "about 24px" (art §4)
const RIPPLE_WARP_CELLS = 5;
const RIPPLE_WARP_AMOUNT = 0.18;
const STREAK_CYCLES = 14;
const STREAK_WARP_CELLS = 5;
const STREAK_WARP_AMOUNT = 0.25;
const STREAK_WIDTH = 0.12;
const SPACE_BASE: [number, number, number] = [0.85, 0.88, 0.97];

function clampByte(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v * 255)));
}

/** Returns a 0..1 greyscale/tinted colour for one pixel of the given zone's detail texture. */
function pixelColor(zone: ZoneId, px: number, py: number): [number, number, number] {
  switch (zone) {
    case 'snowfield':
    case 'forest':
    case 'cave': {
      const n = noise(px, py, SPECKLE_CELLS);
      let v = 0.9 + n * 0.1;
      if (pixelHash(px, py) > SPARKLE_THRESHOLD) v = 1.0;
      return [v, v, v];
    }
    case 'city': {
      const v = 0.85 + pixelHash(px, py) * 0.15;
      return [v, v, v];
    }
    case 'volcano': {
      const n = noise(px, py, GRIT_CELLS);
      let v = 0.7 + n * 0.25;
      const diag = ((px * 0.6 + py) / SIZE) * CRACK_CYCLES;
      const cell = Math.floor(diag);
      const s = Math.sin(diag * Math.PI * 2);
      if (Math.abs(s) < CRACK_WIDTH && latticeHash(cell, 0, CRACK_CYCLES) > CRACK_PRESENCE) {
        v *= 0.55;
      }
      return [v, v, v];
    }
    case 'desert': {
      const warp = noise(px, py, RIPPLE_WARP_CELLS) * RIPPLE_WARP_AMOUNT;
      const phase = (py / SIZE) * RIPPLE_CYCLES + warp;
      const stripe = 0.5 + 0.5 * Math.sin(phase * Math.PI * 2);
      let v = 0.85 + stripe * 0.15;
      v += (pixelHash(px, py) - 0.5) * 0.06;
      return [v, v, v];
    }
    case 'space': {
      const warp = noise(px, py, STREAK_WARP_CELLS) * STREAK_WARP_AMOUNT;
      const phase = ((px + py) / SIZE) * STREAK_CYCLES + warp;
      const s = Math.sin(phase * Math.PI * 2);
      const t = Math.max(0, (s - (1 - STREAK_WIDTH * 2)) / (STREAK_WIDTH * 2));
      const [br, bg, bb] = SPACE_BASE;
      return [br + t * (1 - br), bg + t * (1 - bg), bb + t * (1 - bb)];
    }
  }
}

/** Builds (or returns the cached) tileable 256x256 detail texture for `zone` (art §4). */
export function zoneDetailTexture(zone: ZoneId): THREE.CanvasTexture {
  const cached = cache.get(zone);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d canvas context unavailable');
  const img = ctx.createImageData(SIZE, SIZE);
  const data = img.data;
  for (let py = 0; py < SIZE; py++) {
    for (let px = 0; px < SIZE; px++) {
      const i = (py * SIZE + px) * 4;
      const [r, g, b] = pixelColor(zone, px, py);
      data[i] = clampByte(r);
      data[i + 1] = clampByte(g);
      data[i + 2] = clampByte(b);
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  cache.set(zone, texture);
  return texture;
}
