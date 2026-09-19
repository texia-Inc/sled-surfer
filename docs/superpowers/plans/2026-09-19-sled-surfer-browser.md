# Sled Surfer (ブラウザ版) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** スリングショットで発射して雪山を滑り降り、距離でコインを稼いで強化する 3D ブラウザゲームのコアループを作る。

**Architecture:** ゲームロジック（`src/core/`）は DOM や WebGL に依存しない純粋な TypeScript で、Vitest でテストする。コースは Z 方向に伸びる幅 16 m の廊下で、高さ `h(z)` を手続き生成する。描画（Three.js）と UI（DOM）は毎フレーム状態を読むだけで、ロジックを持たない。

**Tech Stack:** Vite, TypeScript (strict), Three.js, Vitest

**Spec:** `docs/superpowers/specs/2026-09-19-sled-surfer-browser-design.md`

## Global Constraints

- 依存ライブラリは Three.js のみ。CDN は使わず npm で導入する
- TypeScript は `strict: true`。`any` を使わない
- `src/core/` は `window`、`document`、`three` を import しない
- 物理定数は `src/core/params.ts` にだけ書く。他ファイルにマジックナンバーを置かない
- 座標系: ゲーム座標は `x`（横、右が正）、`y`（高さ）、`z`（進行距離、前が正）。Three.js のワールド座標へは `(x, y, -z)` で写す
- テストコマンドは `npm test`、型検査は `npm run typecheck`、ビルドは `npm run build`
- コミットメッセージは英語の Conventional Commits 形式。末尾に次を付ける:

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017cgauTJ238YQritu4gDPM5
```

## File Structure

| ファイル | 責務 |
| --- | --- |
| `src/core/types.ts` | 状態、区間、入力、プロフィールの型 |
| `src/core/params.ts` | 物理定数、発射、ゴール、経済の調整値 |
| `src/core/track.ts` | シード付き区間生成、`heightAt`、`slopeAt`、`surfaceAt` |
| `src/core/physics.ts` | `createRunState`、`stepRun`、`coinWorldY` |
| `src/core/upgrades.ts` | 強化のコストと効果 |
| `src/core/save.ts` | プロフィールの保存と読込 |
| `src/core/game.ts` | `Game` 状態機械とリザルト計算 |
| `src/input.ts` | キーボードとポインタを統合した `InputController` |
| `src/render/scene.ts` | renderer、scene、light、camera の生成 |
| `src/render/camera.ts` | 追従カメラ |
| `src/render/terrain.ts` | 区間ごとの地形メッシュ管理 |
| `src/render/props.ts` | 障害物、コイン、ランプ板の管理 |
| `src/render/player.ts` | ペンギン＋ソリの表示 |
| `src/ui/hud.ts` | 距離、速度、コイン、進捗バー、ロケットボタン |
| `src/ui/aim.ts` | 発射ゲージ |
| `src/ui/results.ts` | リザルトと強化ショップ |
| `src/style.css` | UI のスタイル |
| `src/main.ts` | 起動、ループ、結線 |
| `tests/*.test.ts` | core のテスト |

---

### Task 1: プロジェクト雛形

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `.gitignore`, `src/main.ts`, `src/style.css`, `tests/smoke.test.ts`

**Interfaces:**
- Produces: `npm run dev` / `npm test` / `npm run typecheck` / `npm run build` が動く土台

- [ ] **Step 1: npm 初期化と依存導入**

```bash
cd D:/m-develop/game/sled_surfer
npm init -y
npm install three
npm install -D vite typescript vitest @types/three
```

- [ ] **Step 2: package.json を整える**

`package.json` を次の内容で上書きする（`dependencies` と `devDependencies` のバージョンは Step 1 で入ったものをそのまま残す）:

```json
{
  "name": "sled-surfer",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  }
}
```

- [ ] **Step 3: tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vite/client"],
    "strict": true,
    "noEmit": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noUnusedLocals": true
  },
  "include": ["src", "tests", "vite.config.ts"]
}
```

- [ ] **Step 4: vite.config.ts**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
```

- [ ] **Step 5: index.html, style.css, main.ts, .gitignore**

`index.html`:

```html
<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no, viewport-fit=cover" />
    <title>Sled Surfer</title>
  </head>
  <body>
    <canvas id="game"></canvas>
    <div id="ui"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

`src/style.css`:

```css
html, body { margin: 0; height: 100%; overflow: hidden; background: #8ecdf5; font-family: system-ui, sans-serif; }
#game { display: block; width: 100vw; height: 100vh; touch-action: none; }
#ui { position: fixed; inset: 0; pointer-events: none; }
```

`src/main.ts`（仮）:

```ts
import './style.css';

console.log('sled surfer boot');
```

`.gitignore`:

```
node_modules
dist
```

- [ ] **Step 6: スモークテスト**

`tests/smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

describe('smoke', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 7: 検証**

Run: `npm test` → 1 passed
Run: `npm run build` → `dist/` が生成され、エラーなし

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite + TypeScript + Three.js project"
```

---

### Task 2: 型とパラメータとコース生成

**Files:**
- Create: `src/core/types.ts`, `src/core/params.ts`, `src/core/track.ts`
- Test: `tests/track.test.ts`

**Interfaces:**
- Produces:
  - `types.ts` の全型（下記）
  - `params.ts`: `PhysicsParams`, `DEFAULT_PHYSICS`, `LAUNCH`, `GOAL`, `ECONOMY`
  - `track.ts`: `SEGMENT_LENGTH = 200`, `TRACK_WIDTH = 16`, `RAMP_LENGTH = 12`, `RAMP_HEIGHT = 3`, `mulberry32(seed)`, `baseHeight(z)`, `baseSlope(z)`, `createTrack(seed): Track`

- [ ] **Step 1: types.ts**

```ts
export type Phase = 'aim' | 'run' | 'ended' | 'results';
export type Surface = 'snow' | 'ice';
export type ObstacleKind = 'tree' | 'rock' | 'snowman';
export type UpgradeKind = 'slingshot' | 'sled' | 'income';

export interface Obstacle { id: string; kind: ObstacleKind; x: number; z: number; r: number; }
/** lift: 地面からの追加高さ (m)。0 なら地面のすぐ上 */
export interface Coin { id: string; x: number; z: number; lift: number; }
export interface Ramp { z: number; length: number; height: number; }
export interface IceBand { z0: number; z1: number; }
export interface Bump { z: number; amp: number; width: number; }

export interface Segment {
  index: number;
  z0: number;
  z1: number;
  corridorX: number;
  bumps: Bump[];
  ice: IceBand[];
  ramps: Ramp[];
  obstacles: Obstacle[];
  coins: Coin[];
}

/** 物理が必要とするコースの問い合わせ。テストではこれを偽装する */
export interface TrackQuery {
  heightAt(z: number): number;
  slopeAt(z: number): number;
  surfaceAt(z: number): Surface;
  segmentsAround(z: number): Segment[];
}

export interface Track extends TrackQuery {
  seed: number;
  getSegment(index: number): Segment;
  segmentIndexAt(z: number): number;
}

export interface Input { steer: number; rocket: boolean; }

export interface RunState {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  grounded: boolean;
  airTime: number;
  flips: number;
  rocketLeft: number;
  rocketTime: number;
  stunTime: number;
  stoppedTime: number;
  coinsThisRun: number;
  collectedCoinIds: Set<string>;
  distance: number;
  ended: boolean;
  /** 直近の着地ボーナス倍率 (演出用)。なければ 0 */
  lastLandingBonus: number;
}

export interface Upgrades { slingshot: number; sled: number; income: number; }

export interface Profile {
  coins: number;
  bestDistance: number;
  goalDistance: number;
  upgrades: Upgrades;
}

export interface RunResult {
  distance: number;
  coinsCollected: number;
  distanceCoins: number;
  earned: number;
  newBest: boolean;
  goalReached: boolean;
}
```

- [ ] **Step 2: params.ts**

```ts
export interface PhysicsParams {
  g: number;
  muSnow: number;
  muIce: number;
  kDrag: number;
  kSteer: number;
  rocketAccel: number;
  rocketDuration: number;
  maxLateral: number;
  lateralRefSpeed: number;
  trackWidth: number;
  sledRadius: number;
  collisionSpeedMul: number;
  collisionPushSpeed: number;
  stunDuration: number;
  obstacleClearHeight: number;
  stopSpeed: number;
  stopTime: number;
  landingBonusPerFlip: number;
  maxLandingBonus: number;
  minAirTimeForBonus: number;
  flipSeconds: number;
  coinRadius: number;
  coinLift: number;
  coinVertical: number;
  /** SLED 強化で下がる。1 が未強化 */
  frictionMul: number;
  dragMul: number;
}

export const DEFAULT_PHYSICS: PhysicsParams = {
  g: 9.81,
  muSnow: 0.05,
  muIce: 0.02,
  kDrag: 0.0009,
  kSteer: 0.35,
  rocketAccel: 22,
  rocketDuration: 1.5,
  maxLateral: 12,
  lateralRefSpeed: 30,
  trackWidth: 16,
  sledRadius: 0.6,
  collisionSpeedMul: 0.6,
  collisionPushSpeed: 6,
  stunDuration: 0.5,
  obstacleClearHeight: 1.5,
  stopSpeed: 0.8,
  stopTime: 1.0,
  landingBonusPerFlip: 0.08,
  maxLandingBonus: 1.25,
  minAirTimeForBonus: 0.6,
  flipSeconds: 1.0,
  coinRadius: 1.2,
  coinLift: 0.8,
  coinVertical: 1.5,
  frictionMul: 1,
  dragMul: 1,
};

export const LAUNCH = {
  baseSpeed: 18,
  angleDeg: 25,
  minPullFactor: 0.4,
  rocketsPerRun: 1,
};

export const GOAL = { initial: 1000, growth: 1.5, roundTo: 50 };

export const ECONOMY = { distanceCoinDivisor: 10, goalBonusMul: 2 };

export const UPGRADE = {
  maxLevel: 10,
  baseCost: { slingshot: 40, sled: 50, income: 60 },
  costGrowth: 1.6,
  slingshotPerLevel: 0.08,
  sledPerLevel: 0.03,
  incomePerLevel: 0.25,
};
```

- [ ] **Step 3: 失敗するテストを書く**

`tests/track.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  createTrack, baseHeight, baseSlope, mulberry32,
  SEGMENT_LENGTH, TRACK_WIDTH, RAMP_HEIGHT,
} from '../src/core/track';

describe('mulberry32', () => {
  it('is deterministic and in [0,1)', () => {
    const a = mulberry32(42), b = mulberry32(42);
    for (let i = 0; i < 100; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('base profile', () => {
  it('descends and flattens with distance', () => {
    expect(baseHeight(0)).toBe(0);
    expect(baseHeight(100)).toBeLessThan(0);
    expect(baseSlope(0)).toBeLessThan(baseSlope(2000));
    expect(baseSlope(5000)).toBe(baseSlope(4000));
  });
  it('slope matches numeric derivative of height', () => {
    for (const z of [10, 1500, 2999, 3500]) {
      const num = (baseHeight(z + 0.05) - baseHeight(z - 0.05)) / 0.1;
      expect(Math.abs(num - baseSlope(z))).toBeLessThan(1e-3);
    }
  });
});

describe('createTrack', () => {
  it('is deterministic for the same seed and differs across seeds', () => {
    const a = createTrack(7), b = createTrack(7), c = createTrack(8);
    expect(JSON.stringify(a.getSegment(3))).toBe(JSON.stringify(b.getSegment(3)));
    expect(JSON.stringify(a.getSegment(3))).not.toBe(JSON.stringify(c.getSegment(3)));
  });

  it('height is continuous across segment boundaries', () => {
    const t = createTrack(1);
    for (let i = 1; i <= 10; i++) {
      const z = i * SEGMENT_LENGTH;
      expect(Math.abs(t.heightAt(z - 0.01) - t.heightAt(z + 0.01))).toBeLessThan(0.05);
    }
  });

  it('keeps a corridor free of obstacles and keeps obstacles inside the track', () => {
    const t = createTrack(3);
    for (let i = 0; i < 20; i++) {
      const s = t.getSegment(i);
      for (const o of s.obstacles) {
        expect(Math.abs(o.x - s.corridorX)).toBeGreaterThanOrEqual(2.5);
        expect(Math.abs(o.x)).toBeLessThanOrEqual(TRACK_WIDTH / 2 - 1);
        expect(o.z).toBeGreaterThanOrEqual(s.z0);
        expect(o.z).toBeLessThan(s.z1);
      }
    }
  });

  it('increases obstacle count with distance', () => {
    const t = createTrack(5);
    expect(t.getSegment(0).obstacles.length).toBe(3);
    expect(t.getSegment(10).obstacles.length).toBe(8);
    expect(t.getSegment(40).obstacles.length).toBe(14);
  });

  it('does not put obstacles on ramps', () => {
    const t = createTrack(9);
    for (let i = 0; i < 40; i++) {
      const s = t.getSegment(i);
      for (const r of s.ramps) for (const o of s.obstacles) {
        const onRamp = o.z >= r.z - 3 && o.z <= r.z + r.length + 6;
        expect(onRamp).toBe(false);
      }
    }
  });

  it('ramp ends with a cliff of RAMP_HEIGHT', () => {
    const t = createTrack(11);
    let found = false;
    for (let i = 0; i < 40 && !found; i++) {
      const s = t.getSegment(i);
      for (const r of s.ramps) {
        const end = r.z + r.length;
        const drop = t.heightAt(end - 0.01) - t.heightAt(end + 0.01);
        expect(Math.abs(drop - RAMP_HEIGHT)).toBeLessThan(0.1);
        found = true;
      }
    }
    expect(found).toBe(true);
  });

  it('reports ice inside ice bands and snow elsewhere', () => {
    const t = createTrack(13);
    let found = false;
    for (let i = 0; i < 40 && !found; i++) {
      const s = t.getSegment(i);
      for (const b of s.ice) {
        expect(t.surfaceAt((b.z0 + b.z1) / 2)).toBe('ice');
        found = true;
      }
    }
    expect(found).toBe(true);
    expect(t.surfaceAt(-5)).toBe('snow');
  });

  it('slopeAt is clamped and negative on the base descent', () => {
    const t = createTrack(2);
    const s = t.slopeAt(1);
    expect(s).toBeLessThan(0);
    expect(s).toBeGreaterThanOrEqual(-1.5);
  });

  it('segmentsAround returns segments covering z +/- 10', () => {
    const t = createTrack(2);
    const idx = t.segmentsAround(195).map((s) => s.index);
    expect(idx).toEqual([0, 1]);
    expect(t.segmentsAround(100).map((s) => s.index)).toEqual([0]);
  });

  it('places coins with ids unique within the segment', () => {
    const t = createTrack(4);
    const s = t.getSegment(2);
    const ids = new Set(s.coins.map((c) => c.id));
    expect(ids.size).toBe(s.coins.length);
    expect(s.coins.length).toBeGreaterThanOrEqual(10);
  });
});
```

- [ ] **Step 4: テストが失敗することを確認**

Run: `npm test`
Expected: FAIL（`../src/core/track` が見つからない）

- [ ] **Step 5: track.ts を実装**

```ts
import type {
  Bump, Coin, IceBand, Obstacle, ObstacleKind, Ramp, Segment, Surface, Track,
} from './types';

export const SEGMENT_LENGTH = 200;
export const TRACK_WIDTH = 16;
export const RAMP_LENGTH = 12;
export const RAMP_HEIGHT = 3;

const SLOPE_START = 0.06;
const SLOPE_END = 0.024;
const SLOPE_FLATTEN_DIST = 3000;
const SLOPE_STEP = 0.1;
const MAX_SLOPE = 1.5;
const CORRIDOR_HALF = 2.5;
const OBSTACLE_MARGIN_X = 1;
const FIRST_OBSTACLE_Z = 40;

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(seed: number, index: number): number {
  return (Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) + Math.imul(index + 1, 0xc2b2ae35)) >>> 0;
}

export function baseSlope(z: number): number {
  if (z < 0) return -SLOPE_START;
  if (z >= SLOPE_FLATTEN_DIST) return -SLOPE_END;
  return -(SLOPE_START - ((SLOPE_START - SLOPE_END) * z) / SLOPE_FLATTEN_DIST);
}

export function baseHeight(z: number): number {
  if (z < 0) return -SLOPE_START * z;
  if (z < SLOPE_FLATTEN_DIST) {
    return -(SLOPE_START * z - ((SLOPE_START - SLOPE_END) * z * z) / (2 * SLOPE_FLATTEN_DIST));
  }
  return baseHeight(SLOPE_FLATTEN_DIST - 1e-9) - SLOPE_END * (z - SLOPE_FLATTEN_DIST);
}

function bumpHeight(b: Bump, z: number): number {
  const d = Math.abs(z - b.z);
  if (d >= b.width) return 0;
  return b.amp * 0.5 * (1 + Math.cos((Math.PI * d) / b.width));
}

function rampHeight(r: Ramp, z: number): number {
  if (z < r.z || z >= r.z + r.length) return 0;
  return (r.height * (z - r.z)) / r.length;
}

function localHeight(seg: Segment, z: number): number {
  let h = 0;
  for (const b of seg.bumps) h += bumpHeight(b, z);
  for (const r of seg.ramps) h += rampHeight(r, z);
  return h;
}

const OBSTACLE_RADIUS: Record<ObstacleKind, number> = { tree: 0.8, rock: 1.0, snowman: 0.7 };
const OBSTACLE_KINDS: ObstacleKind[] = ['tree', 'rock', 'snowman'];

function generateSegment(seed: number, index: number): Segment {
  const rng = mulberry32(hashSeed(seed, index));
  const z0 = index * SEGMENT_LENGTH;
  const z1 = z0 + SEGMENT_LENGTH;

  const bumps: Bump[] = [];
  const bumpCount = 2 + Math.floor(rng() * 2);
  for (let i = 0; i < bumpCount; i++) {
    const width = 15 + rng() * 15;
    const amp = 1.5 + rng() * 2.5;
    const z = z0 + width + rng() * (SEGMENT_LENGTH - 2 * width);
    bumps.push({ z, amp, width });
  }

  const ice: IceBand[] = [];
  if (rng() < 0.35) {
    const len = 30 + rng() * 50;
    const start = z0 + rng() * (SEGMENT_LENGTH - len);
    ice.push({ z0: start, z1: start + len });
  }

  const ramps: Ramp[] = [];
  if (rng() < 0.5) {
    const rz = z0 + 30 + rng() * (SEGMENT_LENGTH - 30 - 40);
    ramps.push({ z: rz, length: RAMP_LENGTH, height: RAMP_HEIGHT });
  }

  const corridorX = (rng() - 0.5) * 8;
  const obstacles: Obstacle[] = [];
  const count = Math.min(14, 3 + Math.floor(z0 / 400));
  const zMin = Math.max(z0 + 10, FIRST_OBSTACLE_Z);
  const zMax = z1 - 5;
  const halfX = TRACK_WIDTH / 2 - OBSTACLE_MARGIN_X;
  for (let attempt = 0; attempt < count * 10 && obstacles.length < count; attempt++) {
    const x = (rng() * 2 - 1) * halfX;
    const z = zMin + rng() * (zMax - zMin);
    const kind = OBSTACLE_KINDS[Math.floor(rng() * OBSTACLE_KINDS.length)];
    if (Math.abs(x - corridorX) < CORRIDOR_HALF) continue;
    if (ramps.some((r) => z >= r.z - 3 && z <= r.z + r.length + 6)) continue;
    obstacles.push({ id: `${index}-o${obstacles.length}`, kind, x, z, r: OBSTACLE_RADIUS[kind] });
  }

  const coins: Coin[] = [];
  for (let line = 0; line < 2; line++) {
    const n = 5 + Math.floor(rng() * 4);
    const x = (rng() * 2 - 1) * 6;
    const startZ = z0 + 5 + rng() * (SEGMENT_LENGTH - 20);
    for (let k = 0; k < n; k++) {
      coins.push({ id: `${index}-l${line}-${k}`, x, z: startZ + k * 1.5, lift: 0 });
    }
  }
  for (const r of ramps) {
    for (let k = 0; k < 7; k++) {
      coins.push({
        id: `${index}-a${k}`,
        x: 0,
        z: r.z + r.length + 4 + k * 2.5,
        lift: 2 + 4 * Math.sin((Math.PI * k) / 6),
      });
    }
  }

  return { index, z0, z1, corridorX, bumps, ice, ramps, obstacles, coins };
}

export function createTrack(seed: number): Track {
  const cache = new Map<number, Segment>();

  const getSegment = (index: number): Segment => {
    let s = cache.get(index);
    if (!s) {
      s = generateSegment(seed, index);
      cache.set(index, s);
    }
    return s;
  };

  const segmentIndexAt = (z: number): number => Math.max(0, Math.floor(z / SEGMENT_LENGTH));

  const heightAt = (z: number): number => {
    if (z < 0) return baseHeight(z);
    return baseHeight(z) + localHeight(getSegment(segmentIndexAt(z)), z);
  };

  const slopeAt = (z: number): number => {
    const s = (heightAt(z) - heightAt(z - SLOPE_STEP)) / SLOPE_STEP;
    return Math.max(-MAX_SLOPE, Math.min(MAX_SLOPE, s));
  };

  const surfaceAt = (z: number): Surface => {
    if (z < 0) return 'snow';
    const seg = getSegment(segmentIndexAt(z));
    return seg.ice.some((b) => z >= b.z0 && z < b.z1) ? 'ice' : 'snow';
  };

  const segmentsAround = (z: number): Segment[] => {
    const a = segmentIndexAt(z - 10);
    const b = segmentIndexAt(z + 10);
    const out: Segment[] = [];
    for (let i = a; i <= b; i++) out.push(getSegment(i));
    return out;
  };

  return { seed, getSegment, segmentIndexAt, heightAt, slopeAt, surfaceAt, segmentsAround };
}
```

- [ ] **Step 6: テストが通ることを確認**

Run: `npm test`
Expected: すべて PASS。`increases obstacle count with distance` が落ちる場合は `attempt < count * 10` の試行回数不足なので `count * 20` に増やす（テストの期待値は変えない）

- [ ] **Step 7: 型検査と Commit**

Run: `npm run typecheck` → エラーなし

```bash
git add src/core/types.ts src/core/params.ts src/core/track.ts tests/track.test.ts
git commit -m "feat(core): add types, params, and procedural track generation"
```

---

### Task 3: 物理 (`stepRun`)

**Files:**
- Create: `src/core/physics.ts`
- Test: `tests/physics.test.ts`

**Interfaces:**
- Consumes: `types.ts` の `RunState`, `Input`, `TrackQuery`, `Segment`, `Coin`; `params.ts` の `PhysicsParams`, `DEFAULT_PHYSICS`, `LAUNCH`
- Produces:
  - `createRunState(opts: { v0: number; angleDeg: number; rockets: number; groundY: number }): RunState`
  - `stepRun(s: RunState, input: Input, dt: number, track: TrackQuery, p: PhysicsParams): RunState`（`s` を破壊的に更新して同じ参照を返す）
  - `coinWorldY(track: TrackQuery, coin: Coin, p: PhysicsParams): number`
  - `launchSpeed(pull: number, slingshotMul: number): number`

- [ ] **Step 1: 失敗するテストを書く**

`tests/physics.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createRunState, stepRun, coinWorldY, launchSpeed } from '../src/core/physics';
import { DEFAULT_PHYSICS, LAUNCH } from '../src/core/params';
import type { RunState, Segment, Surface, TrackQuery } from '../src/core/types';

const DT = 1 / 120;

function emptySegment(index: number): Segment {
  return { index, z0: index * 200, z1: index * 200 + 200, corridorX: 0, bumps: [], ice: [], ramps: [], obstacles: [], coins: [] };
}

/** 高さ関数から TrackQuery を作る。傾きは physics と同じ後退差分 */
function fakeTrack(height: (z: number) => number, surface: Surface = 'snow', seg: Segment = emptySegment(0)): TrackQuery {
  return {
    heightAt: height,
    slopeAt: (z) => Math.max(-1.5, Math.min(1.5, (height(z) - height(z - 0.1)) / 0.1)),
    surfaceAt: () => surface,
    segmentsAround: () => [seg],
  };
}

const flat = fakeTrack(() => 0);

function grounded(over: Partial<RunState>): RunState {
  const s = createRunState({ v0: 0, angleDeg: 0, rockets: 1, groundY: 0 });
  s.grounded = true;
  return Object.assign(s, over);
}

function run(s: RunState, track: TrackQuery, seconds: number, steer = 0, rocket = false): RunState {
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) stepRun(s, { steer, rocket: rocket && i === 0 }, DT, track, DEFAULT_PHYSICS);
  return s;
}

describe('launchSpeed', () => {
  it('scales with pull and slingshot multiplier', () => {
    expect(launchSpeed(1, 1)).toBeCloseTo(LAUNCH.baseSpeed);
    expect(launchSpeed(0, 1)).toBeCloseTo(LAUNCH.baseSpeed * LAUNCH.minPullFactor);
    expect(launchSpeed(1, 1.5)).toBeCloseTo(LAUNCH.baseSpeed * 1.5);
  });
});

describe('createRunState', () => {
  it('starts airborne with velocity split by angle', () => {
    const s = createRunState({ v0: 10, angleDeg: 30, rockets: 1, groundY: 2 });
    expect(s.grounded).toBe(false);
    expect(s.vz).toBeCloseTo(10 * Math.cos(Math.PI / 6));
    expect(s.vy).toBeCloseTo(10 * Math.sin(Math.PI / 6));
    expect(s.y).toBeGreaterThan(2);
    expect(s.rocketLeft).toBe(1);
    expect(s.ended).toBe(false);
  });
});

describe('grounded motion', () => {
  it('accelerates on a downhill slope', () => {
    const s = run(grounded({ vz: 5 }), fakeTrack((z) => -0.3 * z), 1);
    expect(s.vz).toBeGreaterThan(5);
    expect(s.z).toBeGreaterThan(5);
  });

  it('decelerates less on ice than on snow', () => {
    const snow = run(grounded({ vz: 10 }), flat, 1);
    const ice = run(grounded({ vz: 10 }), fakeTrack(() => 0, 'ice'), 1);
    expect(ice.vz).toBeGreaterThan(snow.vz);
    expect(snow.vz).toBeLessThan(10);
  });

  it('steering slows the sled and moves it sideways within the track', () => {
    const straight = run(grounded({ vz: 15 }), flat, 1, 0);
    const turning = run(grounded({ vz: 15 }), flat, 1, 1);
    expect(turning.vz).toBeLessThan(straight.vz);
    expect(turning.x).toBeGreaterThan(0);
    expect(turning.x).toBeLessThanOrEqual(DEFAULT_PHYSICS.trackWidth / 2 - DEFAULT_PHYSICS.sledRadius);
  });

  it('never slides backwards uphill', () => {
    const s = run(grounded({ vz: 1 }), fakeTrack((z) => 0.5 * z), 2);
    expect(s.vz).toBe(0);
  });

  it('ends the run after being slow for stopTime', () => {
    const s = run(grounded({ vz: 0.5 }), flat, 1.2);
    expect(s.ended).toBe(true);
    expect(s.distance).toBeCloseTo(s.z);
  });

  it('keeps running while fast', () => {
    const s = run(grounded({ vz: 20 }), flat, 1.2);
    expect(s.ended).toBe(false);
  });
});

describe('air', () => {
  it('takes off at a cliff and lands on the lower ground', () => {
    const cliff = fakeTrack((z) => (z < 20 ? 0 : -3));
    const s = grounded({ z: 15, vz: 10 });
    let tookOff = false;
    for (let i = 0; i < 240; i++) {
      stepRun(s, { steer: 0, rocket: false }, DT, cliff, DEFAULT_PHYSICS);
      if (!s.grounded) tookOff = true;
    }
    expect(tookOff).toBe(true);
    expect(s.grounded).toBe(true);
    expect(s.y).toBeCloseTo(-3, 1);
  });

  it('grants a landing bonus after a long flight', () => {
    const s = grounded({ vz: 10 });
    s.grounded = false;
    s.y = 8;
    s.vy = 0;
    run(s, flat, 2);
    expect(s.grounded).toBe(true);
    expect(s.vz).toBeGreaterThan(10.4);
    expect(s.lastLandingBonus).toBeGreaterThan(1);
  });

  it('gives no bonus for a short hop', () => {
    const s = grounded({ vz: 10 });
    s.grounded = false;
    s.y = 0.3;
    s.vy = 0;
    run(s, flat, 1);
    expect(s.grounded).toBe(true);
    expect(s.vz).toBeLessThan(10);
    expect(s.lastLandingBonus).toBe(0);
  });
});

describe('obstacles and coins', () => {
  it('collision slows the sled, pushes it sideways, and stuns once', () => {
    const seg = emptySegment(0);
    seg.obstacles.push({ id: 'o', kind: 'rock', x: 0.3, z: 10, r: 1 });
    const track = fakeTrack(() => 0, 'snow', seg);
    const s = grounded({ vz: 10, z: 8 });
    let hit: RunState | null = null;
    for (let i = 0; i < 60 && !hit; i++) {
      stepRun(s, { steer: 0, rocket: false }, DT, track, DEFAULT_PHYSICS);
      if (s.stunTime > 0) hit = { ...s, collectedCoinIds: new Set(s.collectedCoinIds) };
    }
    expect(hit).not.toBeNull();
    expect(hit!.vz).toBeLessThan(6.1);
    expect(hit!.vx).toBeCloseTo(-DEFAULT_PHYSICS.collisionPushSpeed);
    run(s, track, 0.2);
    expect(s.x).toBeLessThan(-0.5);
  });

  it('ignores obstacles when flying high above them', () => {
    const seg = emptySegment(0);
    seg.obstacles.push({ id: 'o', kind: 'rock', x: 0, z: 10, r: 1 });
    const track = fakeTrack(() => 0, 'snow', seg);
    const s = grounded({ vz: 10, z: 8 });
    s.grounded = false;
    s.y = 5;
    s.vy = 0;
    run(s, track, 0.5);
    expect(s.stunTime).toBe(0);
  });

  it('collects each coin once', () => {
    const seg = emptySegment(0);
    seg.coins.push({ id: 'c1', x: 0, z: 5, lift: 0 });
    const track = fakeTrack(() => 0, 'snow', seg);
    const s = run(grounded({ vz: 10, z: 3 }), track, 0.5);
    expect(s.coinsThisRun).toBe(1);
    expect(s.collectedCoinIds.has('c1')).toBe(true);
    expect(coinWorldY(track, seg.coins[0], DEFAULT_PHYSICS)).toBeCloseTo(DEFAULT_PHYSICS.coinLift);
  });
});

describe('rocket', () => {
  it('fires once and adds speed on flat ground', () => {
    const s = grounded({ vz: 10 });
    stepRun(s, { steer: 0, rocket: true }, DT, flat, DEFAULT_PHYSICS);
    expect(s.rocketLeft).toBe(0);
    expect(s.rocketTime).toBeGreaterThan(0);
    run(s, flat, 1, 0, true);
    expect(s.vz).toBeGreaterThan(10);
    expect(s.rocketLeft).toBe(0);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm test -- tests/physics.test.ts`
Expected: FAIL（モジュールが見つからない）

- [ ] **Step 3: physics.ts を実装**

```ts
import type { Coin, Input, RunState, TrackQuery } from './types';
import { LAUNCH, type PhysicsParams } from './params';

export function launchSpeed(pull: number, slingshotMul: number): number {
  const p = Math.max(0, Math.min(1, pull));
  return LAUNCH.baseSpeed * (LAUNCH.minPullFactor + (1 - LAUNCH.minPullFactor) * p) * slingshotMul;
}

export function createRunState(opts: { v0: number; angleDeg: number; rockets: number; groundY: number }): RunState {
  const a = (opts.angleDeg * Math.PI) / 180;
  return {
    x: 0,
    y: opts.groundY + 0.05,
    z: 0,
    vx: 0,
    vy: opts.v0 * Math.sin(a),
    vz: opts.v0 * Math.cos(a),
    grounded: false,
    airTime: 0,
    flips: 0,
    rocketLeft: opts.rockets,
    rocketTime: 0,
    stunTime: 0,
    stoppedTime: 0,
    coinsThisRun: 0,
    collectedCoinIds: new Set<string>(),
    distance: 0,
    ended: false,
    lastLandingBonus: 0,
  };
}

export function coinWorldY(track: TrackQuery, coin: Coin, p: PhysicsParams): number {
  return track.heightAt(coin.z) + p.coinLift + coin.lift;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function stepRun(s: RunState, input: Input, dt: number, track: TrackQuery, p: PhysicsParams): RunState {
  if (s.ended) return s;

  const steer = s.stunTime > 0 ? 0 : clamp(input.steer, -1, 1);

  if (input.rocket && s.rocketLeft > 0 && s.rocketTime <= 0) {
    s.rocketLeft -= 1;
    s.rocketTime = p.rocketDuration;
  }
  const rocketA = s.rocketTime > 0 ? p.rocketAccel : 0;
  s.rocketTime = Math.max(0, s.rocketTime - dt);
  const wasStunned = s.stunTime > 0;
  s.stunTime = Math.max(0, s.stunTime - dt);

  const drag = -p.kDrag * p.dragMul * s.vz * Math.abs(s.vz);

  if (s.grounded) {
    const slope0 = track.slopeAt(s.z);
    const mu = (track.surfaceAt(s.z) === 'ice' ? p.muIce : p.muSnow) * p.frictionMul;
    const aSlope = (-p.g * slope0) / Math.sqrt(1 + slope0 * slope0);
    const aFric = s.vz > 0 ? -p.g * mu : 0;
    const aSteer = -p.kSteer * Math.abs(steer) * s.vz;
    s.vz += (aSlope + aFric + drag + aSteer + rocketA) * dt;
    if (s.vz < 0) s.vz = 0;
    if (!wasStunned) {
      s.vx = (steer * p.maxLateral * Math.min(s.vz, p.lateralRefSpeed)) / p.lateralRefSpeed;
    }

    const vy0 = s.vz * slope0;
    s.z += s.vz * dt;
    const slope1 = track.slopeAt(s.z);
    const vy1 = s.vz * slope1;
    const ground = track.heightAt(s.z);
    const requiredAccel = (vy1 - vy0) / dt;
    if (requiredAccel < -p.g && s.vz > 0) {
      s.grounded = false;
      s.vy = vy0;
      s.y = Math.max(ground, s.y + vy0 * dt);
      s.airTime = 0;
      s.flips = 0;
    } else {
      s.y = ground;
      s.vy = vy1;
    }
  } else {
    s.vy -= p.g * dt;
    s.vz += (drag + rocketA) * dt;
    if (s.vz < 0) s.vz = 0;
    s.z += s.vz * dt;
    s.y += s.vy * dt;
    s.airTime += dt;
    s.flips = Math.floor(s.airTime / p.flipSeconds);
    const ground = track.heightAt(s.z);
    if (s.y <= ground) {
      s.y = ground;
      s.vy = 0;
      s.grounded = true;
      if (s.airTime >= p.minAirTimeForBonus && s.flips >= 1) {
        const bonus = Math.min(1 + p.landingBonusPerFlip * s.flips, p.maxLandingBonus);
        s.vz *= bonus;
        s.lastLandingBonus = bonus;
      }
      s.airTime = 0;
    }
  }

  s.x += s.vx * dt;
  const half = p.trackWidth / 2 - p.sledRadius;
  if (s.x > half) {
    s.x = half;
    s.vx = -Math.abs(s.vx) * 0.5;
  } else if (s.x < -half) {
    s.x = -half;
    s.vx = Math.abs(s.vx) * 0.5;
  }

  const groundHere = track.heightAt(s.z);
  const segments = track.segmentsAround(s.z);

  if (s.stunTime <= 0 && s.y - groundHere < p.obstacleClearHeight) {
    for (const seg of segments) {
      for (const o of seg.obstacles) {
        const dx = s.x - o.x;
        const dz = s.z - o.z;
        const minDist = o.r + p.sledRadius;
        if (dx * dx + dz * dz < minDist * minDist) {
          const side = dx >= 0 ? 1 : -1;
          s.vz *= p.collisionSpeedMul;
          s.vx = side * p.collisionPushSpeed;
          s.x = o.x + side * minDist;
          s.stunTime = p.stunDuration;
          break;
        }
      }
      if (s.stunTime > 0) break;
    }
  }

  for (const seg of segments) {
    for (const c of seg.coins) {
      if (s.collectedCoinIds.has(c.id)) continue;
      const dx = s.x - c.x;
      const dz = s.z - c.z;
      if (dx * dx + dz * dz >= p.coinRadius * p.coinRadius) continue;
      if (Math.abs(s.y - coinWorldY(track, c, p)) >= p.coinVertical) continue;
      s.collectedCoinIds.add(c.id);
      s.coinsThisRun += 1;
    }
  }

  if (s.grounded && s.vz < p.stopSpeed) {
    s.stoppedTime += dt;
    if (s.stoppedTime >= p.stopTime) s.ended = true;
  } else {
    s.stoppedTime = 0;
  }

  s.distance = s.z;
  return s;
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm test -- tests/physics.test.ts`
Expected: すべて PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/physics.ts tests/physics.test.ts
git commit -m "feat(core): add sled physics step with takeoff, landing bonus, collisions, coins"
```

---

### Task 4: 強化とセーブ

**Files:**
- Create: `src/core/upgrades.ts`, `src/core/save.ts`
- Test: `tests/upgrades.test.ts`, `tests/save.test.ts`

**Interfaces:**
- Consumes: `types.ts` の `Profile`, `Upgrades`, `UpgradeKind`; `params.ts` の `UPGRADE`, `GOAL`
- Produces:
  - `upgrades.ts`: `upgradeCost(kind, level): number`, `canBuy(profile, kind): boolean`, `buy(profile, kind): Profile`（新しいオブジェクトを返す）, `slingshotMul(level)`, `sledMul(level)`, `incomeMul(level)`, `UPGRADE_LABELS: Record<UpgradeKind, { name: string; effect: string }>`
  - `save.ts`: `SAVE_KEY`, `StorageLike`, `defaultProfile(): Profile`, `loadProfile(storage: StorageLike | null): Profile`, `saveProfile(storage: StorageLike | null, profile: Profile): void`

- [ ] **Step 1: 失敗するテストを書く**

`tests/upgrades.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { upgradeCost, canBuy, buy, slingshotMul, sledMul, incomeMul } from '../src/core/upgrades';
import { defaultProfile } from '../src/core/save';
import { UPGRADE } from '../src/core/params';

describe('upgrade costs', () => {
  it('grow geometrically per level', () => {
    expect(upgradeCost('slingshot', 0)).toBe(40);
    expect(upgradeCost('slingshot', 1)).toBe(64);
    expect(upgradeCost('sled', 0)).toBe(50);
    expect(upgradeCost('income', 0)).toBe(60);
    expect(upgradeCost('income', 2)).toBeGreaterThan(upgradeCost('income', 1));
  });
});

describe('upgrade effects', () => {
  it('match the spec multipliers', () => {
    expect(slingshotMul(0)).toBe(1);
    expect(slingshotMul(5)).toBeCloseTo(1.4);
    expect(sledMul(0)).toBe(1);
    expect(sledMul(10)).toBeCloseTo(0.7);
    expect(incomeMul(4)).toBeCloseTo(2);
  });
});

describe('buy', () => {
  it('requires enough coins and respects max level', () => {
    const poor = defaultProfile();
    expect(canBuy(poor, 'slingshot')).toBe(false);
    expect(buy(poor, 'slingshot')).toBe(poor);

    const rich = { ...defaultProfile(), coins: 100 };
    expect(canBuy(rich, 'slingshot')).toBe(true);
    const after = buy(rich, 'slingshot');
    expect(after).not.toBe(rich);
    expect(after.coins).toBe(60);
    expect(after.upgrades.slingshot).toBe(1);
    expect(rich.upgrades.slingshot).toBe(0);

    const maxed = { ...defaultProfile(), coins: 1e9, upgrades: { slingshot: UPGRADE.maxLevel, sled: 0, income: 0 } };
    expect(canBuy(maxed, 'slingshot')).toBe(false);
  });
});
```

`tests/save.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { loadProfile, saveProfile, defaultProfile, SAVE_KEY, type StorageLike } from '../src/core/save';

function memoryStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => { data.set(k, v); },
  };
}

describe('save', () => {
  it('round-trips a profile', () => {
    const st = memoryStorage();
    const p = { ...defaultProfile(), coins: 123, bestDistance: 456, upgrades: { slingshot: 2, sled: 1, income: 3 } };
    saveProfile(st, p);
    expect(st.data.has(SAVE_KEY)).toBe(true);
    expect(loadProfile(st)).toEqual(p);
  });

  it('returns defaults for missing, corrupt, or partial data', () => {
    const st = memoryStorage();
    expect(loadProfile(st)).toEqual(defaultProfile());
    st.setItem(SAVE_KEY, '{not json');
    expect(loadProfile(st)).toEqual(defaultProfile());
    st.setItem(SAVE_KEY, JSON.stringify({ coins: 5 }));
    const p = loadProfile(st);
    expect(p.coins).toBe(5);
    expect(p.goalDistance).toBe(defaultProfile().goalDistance);
    expect(p.upgrades).toEqual({ slingshot: 0, sled: 0, income: 0 });
  });

  it('tolerates a null storage', () => {
    expect(loadProfile(null)).toEqual(defaultProfile());
    expect(() => saveProfile(null, defaultProfile())).not.toThrow();
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm test`
Expected: 新しい 2 ファイルが FAIL

- [ ] **Step 3: upgrades.ts を実装**

```ts
import type { Profile, UpgradeKind } from './types';
import { UPGRADE } from './params';

export const UPGRADE_LABELS: Record<UpgradeKind, { name: string; effect: string }> = {
  slingshot: { name: 'SLINGSHOT', effect: '発射速度 +8%' },
  sled: { name: 'SLED', effect: '摩擦と空気抵抗 -3%' },
  income: { name: 'INCOME', effect: 'コイン倍率 +0.25' },
};

export function upgradeCost(kind: UpgradeKind, level: number): number {
  return Math.floor(UPGRADE.baseCost[kind] * Math.pow(UPGRADE.costGrowth, level));
}

export function slingshotMul(level: number): number {
  return 1 + UPGRADE.slingshotPerLevel * level;
}

export function sledMul(level: number): number {
  return 1 - UPGRADE.sledPerLevel * level;
}

export function incomeMul(level: number): number {
  return 1 + UPGRADE.incomePerLevel * level;
}

export function canBuy(profile: Profile, kind: UpgradeKind): boolean {
  const level = profile.upgrades[kind];
  if (level >= UPGRADE.maxLevel) return false;
  return profile.coins >= upgradeCost(kind, level);
}

export function buy(profile: Profile, kind: UpgradeKind): Profile {
  if (!canBuy(profile, kind)) return profile;
  const level = profile.upgrades[kind];
  return {
    ...profile,
    coins: profile.coins - upgradeCost(kind, level),
    upgrades: { ...profile.upgrades, [kind]: level + 1 },
  };
}
```

- [ ] **Step 4: save.ts を実装**

```ts
import type { Profile } from './types';
import { GOAL } from './params';

export const SAVE_KEY = 'sled-surfer:profile:v1';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function defaultProfile(): Profile {
  return {
    coins: 0,
    bestDistance: 0,
    goalDistance: GOAL.initial,
    upgrades: { slingshot: 0, sled: 0, income: 0 },
  };
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

export function loadProfile(storage: StorageLike | null): Profile {
  const d = defaultProfile();
  if (!storage) return d;
  let raw: string | null = null;
  try {
    raw = storage.getItem(SAVE_KEY);
  } catch {
    return d;
  }
  if (!raw) return d;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return d;
  }
  if (typeof parsed !== 'object' || parsed === null) return d;
  const o = parsed as Record<string, unknown>;
  const up = (typeof o.upgrades === 'object' && o.upgrades !== null ? o.upgrades : {}) as Record<string, unknown>;
  return {
    coins: num(o.coins, d.coins),
    bestDistance: num(o.bestDistance, d.bestDistance),
    goalDistance: num(o.goalDistance, d.goalDistance),
    upgrades: {
      slingshot: num(up.slingshot, 0),
      sled: num(up.sled, 0),
      income: num(up.income, 0),
    },
  };
}

export function saveProfile(storage: StorageLike | null, profile: Profile): void {
  if (!storage) return;
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(profile));
  } catch {
    // 保存できない環境では黙って続行する
  }
}
```

- [ ] **Step 5: テストが通ることを確認**

Run: `npm test`
Expected: すべて PASS

- [ ] **Step 6: Commit**

```bash
git add src/core/upgrades.ts src/core/save.ts tests/upgrades.test.ts tests/save.test.ts
git commit -m "feat(core): add upgrades and profile persistence"
```

---

### Task 5: ゲーム状態機械 (`Game`)

**Files:**
- Create: `src/core/game.ts`
- Test: `tests/game.test.ts`

**Interfaces:**
- Consumes: `physics.ts` の `createRunState`, `stepRun`, `launchSpeed`; `track.ts` の `createTrack`; `upgrades.ts` の `buy`, `slingshotMul`, `sledMul`, `incomeMul`; `params.ts` の `DEFAULT_PHYSICS`, `LAUNCH`, `GOAL`, `ECONOMY`
- Produces:
  - `computeResult(profile: Profile, run: RunState): RunResult`
  - `applyResult(profile: Profile, result: RunResult): Profile`
  - `class Game` — フィールド `phase: Phase`, `profile: Profile`, `track: Track`, `run: RunState | null`, `lastResult: RunResult | null`, `pull: number`; メソッド `launch(pull: number): void`, `update(dt: number, input: Input): void`, `buy(kind: UpgradeKind): boolean`, `restart(): void`, `physicsParams(): PhysicsParams`; コンストラクタ `new Game(profile, baseSeed, opts?: { onProfileChange?: (p: Profile) => void; endedDelay?: number })`

- [ ] **Step 1: 失敗するテストを書く**

`tests/game.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { Game, computeResult, applyResult } from '../src/core/game';
import { defaultProfile } from '../src/core/save';
import { createRunState } from '../src/core/physics';
import { GOAL, ECONOMY } from '../src/core/params';
import type { Profile } from '../src/core/types';

const NO_INPUT = { steer: 0, rocket: false };

function runUntil(game: Game, pred: () => boolean, maxSeconds = 600): void {
  const dt = 1 / 120;
  for (let t = 0; t < maxSeconds && !pred(); t += dt) game.update(dt, NO_INPUT);
}

describe('computeResult', () => {
  it('sums coins and distance with income multiplier and goal bonus', () => {
    const p: Profile = { ...defaultProfile(), goalDistance: 100, upgrades: { slingshot: 0, sled: 0, income: 4 } };
    const run = createRunState({ v0: 0, angleDeg: 0, rockets: 0, groundY: 0 });
    run.coinsThisRun = 10;
    run.distance = 250;
    const r = computeResult(p, run);
    expect(r.coinsCollected).toBe(10);
    expect(r.distanceCoins).toBe(25);
    expect(r.goalReached).toBe(true);
    expect(r.earned).toBe(Math.floor((10 + 25) * 2 * ECONOMY.goalBonusMul));
    expect(r.newBest).toBe(true);
  });

  it('applyResult adds coins, updates best, and grows the goal', () => {
    const p: Profile = { ...defaultProfile(), coins: 5, bestDistance: 300, goalDistance: 1000 };
    const run = createRunState({ v0: 0, angleDeg: 0, rockets: 0, groundY: 0 });
    run.distance = 1200;
    const r = computeResult(p, run);
    const after = applyResult(p, r);
    expect(after.coins).toBe(5 + r.earned);
    expect(after.bestDistance).toBe(1200);
    expect(after.goalDistance).toBe(1500);
    expect(p.goalDistance).toBe(1000);
  });

  it('rounds the grown goal up to GOAL.roundTo', () => {
    const p: Profile = { ...defaultProfile(), goalDistance: 1010 };
    const run = createRunState({ v0: 0, angleDeg: 0, rockets: 0, groundY: 0 });
    run.distance = 2000;
    const after = applyResult(p, computeResult(p, run));
    expect(after.goalDistance).toBe(Math.ceil((1010 * GOAL.growth) / GOAL.roundTo) * GOAL.roundTo);
  });
});

describe('Game', () => {
  it('walks aim -> run -> ended -> results -> aim and saves once per run', () => {
    const saves: Profile[] = [];
    const game = new Game(defaultProfile(), 1, { onProfileChange: (p) => saves.push(p), endedDelay: 0.2 });
    expect(game.phase).toBe('aim');
    game.launch(1);
    expect(game.phase).toBe('run');
    expect(game.run).not.toBeNull();
    runUntil(game, () => game.phase !== 'run');
    expect(game.phase).toBe('ended');
    runUntil(game, () => game.phase === 'results', 2);
    expect(game.phase).toBe('results');
    expect(game.lastResult).not.toBeNull();
    expect(game.lastResult!.distance).toBeGreaterThan(20);
    expect(saves.length).toBe(1);
    expect(game.profile.coins).toBe(saves[0].coins);
    expect(game.profile.coins).toBeGreaterThan(0);
    const seed = game.track.seed;
    game.restart();
    expect(game.phase).toBe('aim');
    expect(game.run).toBeNull();
    expect(game.track.seed).not.toBe(seed);
  });

  it('ignores launch outside aim and update outside run', () => {
    const game = new Game(defaultProfile(), 1);
    game.update(0.1, NO_INPUT);
    expect(game.phase).toBe('aim');
    game.launch(0.5);
    game.launch(1);
    expect(game.phase).toBe('run');
  });

  it('buy updates profile and saves', () => {
    const saves: Profile[] = [];
    const game = new Game({ ...defaultProfile(), coins: 100 }, 1, { onProfileChange: (p) => saves.push(p) });
    expect(game.buy('sled')).toBe(true);
    expect(game.profile.upgrades.sled).toBe(1);
    expect(game.profile.coins).toBe(50);
    expect(saves.length).toBe(1);
    expect(game.buy('income')).toBe(false);
    expect(saves.length).toBe(1);
  });

  it('applies sled upgrade to physics params', () => {
    const game = new Game({ ...defaultProfile(), upgrades: { slingshot: 0, sled: 10, income: 0 } }, 1);
    expect(game.physicsParams().frictionMul).toBeCloseTo(0.7);
    expect(game.physicsParams().dragMul).toBeCloseTo(0.7);
  });

  it('launches faster with slingshot upgrades', () => {
    const weak = new Game(defaultProfile(), 1);
    const strong = new Game({ ...defaultProfile(), upgrades: { slingshot: 10, sled: 0, income: 0 } }, 1);
    weak.launch(1);
    strong.launch(1);
    expect(strong.run!.vz).toBeGreaterThan(weak.run!.vz);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm test -- tests/game.test.ts`
Expected: FAIL

- [ ] **Step 3: game.ts を実装**

```ts
import type { Input, Phase, Profile, RunResult, RunState, Track, UpgradeKind } from './types';
import { DEFAULT_PHYSICS, ECONOMY, GOAL, LAUNCH, type PhysicsParams } from './params';
import { createRunState, launchSpeed, stepRun } from './physics';
import { createTrack } from './track';
import { buy as buyUpgrade, incomeMul, sledMul, slingshotMul } from './upgrades';

export function computeResult(profile: Profile, run: RunState): RunResult {
  const distance = run.distance;
  const distanceCoins = Math.floor(distance / ECONOMY.distanceCoinDivisor);
  const goalReached = distance >= profile.goalDistance;
  const mul = incomeMul(profile.upgrades.income) * (goalReached ? ECONOMY.goalBonusMul : 1);
  return {
    distance,
    coinsCollected: run.coinsThisRun,
    distanceCoins,
    earned: Math.floor((run.coinsThisRun + distanceCoins) * mul),
    newBest: distance > profile.bestDistance,
    goalReached,
  };
}

export function applyResult(profile: Profile, result: RunResult): Profile {
  let goal = profile.goalDistance;
  if (result.goalReached) {
    goal = Math.ceil((goal * GOAL.growth) / GOAL.roundTo) * GOAL.roundTo;
  }
  return {
    ...profile,
    coins: profile.coins + result.earned,
    bestDistance: Math.max(profile.bestDistance, result.distance),
    goalDistance: goal,
  };
}

export interface GameOptions {
  onProfileChange?: (p: Profile) => void;
  /** ended から results へ移るまでの秒数 */
  endedDelay?: number;
}

export class Game {
  phase: Phase = 'aim';
  profile: Profile;
  track: Track;
  run: RunState | null = null;
  lastResult: RunResult | null = null;
  pull = 0;
  private runCount = 0;
  private endedTimer = 0;
  private readonly baseSeed: number;
  private readonly onProfileChange: (p: Profile) => void;
  private readonly endedDelay: number;

  constructor(profile: Profile, baseSeed: number, opts: GameOptions = {}) {
    this.profile = profile;
    this.baseSeed = baseSeed;
    this.track = createTrack(baseSeed);
    this.onProfileChange = opts.onProfileChange ?? (() => {});
    this.endedDelay = opts.endedDelay ?? 1.0;
  }

  physicsParams(): PhysicsParams {
    const m = sledMul(this.profile.upgrades.sled);
    return { ...DEFAULT_PHYSICS, frictionMul: m, dragMul: m };
  }

  launch(pull: number): void {
    if (this.phase !== 'aim') return;
    const v0 = launchSpeed(pull, slingshotMul(this.profile.upgrades.slingshot));
    this.run = createRunState({
      v0,
      angleDeg: LAUNCH.angleDeg,
      rockets: LAUNCH.rocketsPerRun,
      groundY: this.track.heightAt(0),
    });
    this.pull = 0;
    this.phase = 'run';
  }

  update(dt: number, input: Input): void {
    if (this.phase === 'run' && this.run) {
      stepRun(this.run, input, dt, this.track, this.physicsParams());
      if (this.run.ended) {
        this.phase = 'ended';
        this.endedTimer = 0;
      }
      return;
    }
    if (this.phase === 'ended' && this.run) {
      this.endedTimer += dt;
      if (this.endedTimer >= this.endedDelay) {
        const result = computeResult(this.profile, this.run);
        this.lastResult = result;
        this.profile = applyResult(this.profile, result);
        this.onProfileChange(this.profile);
        this.phase = 'results';
      }
    }
  }

  buy(kind: UpgradeKind): boolean {
    const next = buyUpgrade(this.profile, kind);
    if (next === this.profile) return false;
    this.profile = next;
    this.onProfileChange(this.profile);
    return true;
  }

  restart(): void {
    if (this.phase !== 'results') return;
    this.runCount += 1;
    this.track = createTrack(this.baseSeed + this.runCount * 7919);
    this.run = null;
    this.lastResult = null;
    this.phase = 'aim';
  }
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm test`
Expected: すべて PASS。`walks aim -> run ...` で 600 秒たっても `run` から抜けない場合は減速が弱すぎるので、`DEFAULT_PHYSICS.muSnow` を 0.05 → 0.055 に上げてから再実行する（それでも落ちるなら報告して止まる）

- [ ] **Step 5: Commit**

```bash
git add src/core/game.ts tests/game.test.ts
git commit -m "feat(core): add game state machine with results and upgrades"
```

---

### Task 6: 入力 (`InputController`)

**Files:**
- Create: `src/input.ts`

**Interfaces:**
- Consumes: `types.ts` の `Phase`
- Produces:
  - `interface InputSnapshot { steer: number; rocket: boolean; pull: number; pulling: boolean; released: boolean }`
  - `class InputController` — `constructor(target: HTMLElement)`, `phase: Phase`, `update(dt: number): void`, `read(): InputSnapshot`（`rocket` と `released` は読むと消費される）, `pressRocket(): void`, `dispose(): void`

DOM 依存のため単体テストはしない。型検査とブラウザでの動作確認で担保する。

- [ ] **Step 1: input.ts を実装**

```ts
import type { Phase } from './core/types';

export interface InputSnapshot {
  steer: number;
  rocket: boolean;
  pull: number;
  pulling: boolean;
  released: boolean;
}

const PULL_DISTANCE_RATIO = 0.25;
const KEY_GAUGE_PERIOD = 1.2;

export class InputController {
  phase: Phase = 'aim';

  private keySteer = 0;
  private leftDown = false;
  private rightDown = false;
  private pointerSteer = 0;
  private pointerDown = false;
  private pulling = false;
  private pullStartY = 0;
  private pull = 0;
  private spaceHeld = false;
  private gaugeTime = 0;
  private rocketQueued = false;
  private releasedQueued = false;
  private readonly target: HTMLElement;
  private readonly onKeyDown = (e: KeyboardEvent) => this.keyDown(e);
  private readonly onKeyUp = (e: KeyboardEvent) => this.keyUp(e);
  private readonly onPointerDown = (e: PointerEvent) => this.pointerDownHandler(e);
  private readonly onPointerMove = (e: PointerEvent) => this.pointerMoveHandler(e);
  private readonly onPointerUp = () => this.pointerUpHandler();

  constructor(target: HTMLElement) {
    this.target = target;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    target.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.target.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
  }

  pressRocket(): void {
    if (this.phase === 'run') this.rocketQueued = true;
  }

  update(dt: number): void {
    if (this.spaceHeld && this.phase === 'aim') {
      this.gaugeTime += dt;
      this.pull = 0.5 - 0.5 * Math.cos((2 * Math.PI * this.gaugeTime) / KEY_GAUGE_PERIOD);
      this.pulling = true;
    }
    if (this.phase !== 'aim' && !this.spaceHeld) {
      this.pulling = false;
    }
  }

  read(): InputSnapshot {
    const steer = this.keySteer !== 0 ? this.keySteer : this.pointerSteer;
    const snap: InputSnapshot = {
      steer,
      rocket: this.rocketQueued,
      pull: this.pull,
      pulling: this.pulling,
      released: this.releasedQueued,
    };
    this.rocketQueued = false;
    this.releasedQueued = false;
    return snap;
  }

  private updateKeySteer(): void {
    this.keySteer = (this.rightDown ? 1 : 0) - (this.leftDown ? 1 : 0);
  }

  private keyDown(e: KeyboardEvent): void {
    if (e.repeat) return;
    switch (e.code) {
      case 'ArrowLeft':
      case 'KeyA':
        this.leftDown = true;
        this.updateKeySteer();
        break;
      case 'ArrowRight':
      case 'KeyD':
        this.rightDown = true;
        this.updateKeySteer();
        break;
      case 'Space':
        e.preventDefault();
        if (this.phase === 'aim' && !this.pulling) {
          this.spaceHeld = true;
          this.gaugeTime = 0;
          this.pull = 0;
          this.pulling = true;
        } else if (this.phase === 'run') {
          this.rocketQueued = true;
        }
        break;
    }
  }

  private keyUp(e: KeyboardEvent): void {
    switch (e.code) {
      case 'ArrowLeft':
      case 'KeyA':
        this.leftDown = false;
        this.updateKeySteer();
        break;
      case 'ArrowRight':
      case 'KeyD':
        this.rightDown = false;
        this.updateKeySteer();
        break;
      case 'Space':
        if (this.spaceHeld) {
          this.spaceHeld = false;
          if (this.phase === 'aim') this.releasedQueued = true;
          this.pulling = false;
        }
        break;
    }
  }

  private pointerDownHandler(e: PointerEvent): void {
    this.pointerDown = true;
    if (this.phase === 'aim' && !this.spaceHeld) {
      this.pulling = true;
      this.pullStartY = e.clientY;
      this.pull = 0;
    } else if (this.phase === 'run') {
      this.pointerSteer = this.steerFromX(e.clientX);
    }
  }

  private pointerMoveHandler(e: PointerEvent): void {
    if (!this.pointerDown) return;
    if (this.phase === 'aim' && this.pulling && !this.spaceHeld) {
      const dy = e.clientY - this.pullStartY;
      this.pull = Math.max(0, Math.min(1, dy / (window.innerHeight * PULL_DISTANCE_RATIO)));
    } else if (this.phase === 'run') {
      this.pointerSteer = this.steerFromX(e.clientX);
    }
  }

  private pointerUpHandler(): void {
    if (!this.pointerDown) return;
    this.pointerDown = false;
    this.pointerSteer = 0;
    if (this.phase === 'aim' && this.pulling && !this.spaceHeld) {
      this.pulling = false;
      this.releasedQueued = true;
    }
  }

  private steerFromX(clientX: number): number {
    const half = window.innerWidth / 2;
    return Math.max(-1, Math.min(1, (clientX - half) / half));
  }
}
```

- [ ] **Step 2: 型検査**

Run: `npm run typecheck`
Expected: エラーなし

- [ ] **Step 3: Commit**

```bash
git add src/input.ts
git commit -m "feat: add keyboard and pointer input controller"
```

---

### Task 7: 描画基盤（scene、camera、terrain）

**Files:**
- Create: `src/render/scene.ts`, `src/render/camera.ts`, `src/render/terrain.ts`

**Interfaces:**
- Consumes: `track.ts` の `SEGMENT_LENGTH`, `TRACK_WIDTH`; `types.ts` の `Track`
- Produces:
  - `scene.ts`: `interface SceneBundle { renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera }`, `createScene(canvas: HTMLCanvasElement): SceneBundle`
  - `camera.ts`: `interface CameraTarget { x: number; y: number; z: number; rocketing: boolean }`, `updateCamera(camera: THREE.PerspectiveCamera, target: CameraTarget, dt: number): void`, `snapCamera(camera, target): void`
  - `terrain.ts`: `class TerrainManager` — `constructor(scene: THREE.Scene, track: Track)`, `setTrack(track: Track): void`, `update(z: number): void`, `dispose(): void`

DOM/WebGL 依存のため単体テストはしない。型検査と `npm run dev` での目視で確認する。

- [ ] **Step 1: scene.ts**

```ts
import * as THREE from 'three';

export interface SceneBundle {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
}

const SKY = 0x8ecdf5;

export function createScene(canvas: HTMLCanvasElement): SceneBundle {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, 60, 220);

  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 400);

  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(20, 40, 10);
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xdff3ff, 0x8a9bb0, 1.2));

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });

  return { renderer, scene, camera };
}
```

- [ ] **Step 2: camera.ts**

```ts
import * as THREE from 'three';

export interface CameraTarget {
  x: number;
  y: number;
  z: number;
  rocketing: boolean;
}

const BACK = 7;
const UP = 3.5;
const LOOK_AHEAD = 6;
const X_FOLLOW = 0.4;
const FOV_NORMAL = 60;
const FOV_ROCKET = 70;

const desired = new THREE.Vector3();
const look = new THREE.Vector3();

export function snapCamera(camera: THREE.PerspectiveCamera, t: CameraTarget): void {
  camera.position.set(t.x * X_FOLLOW, t.y + UP, -t.z + BACK);
  look.set(t.x * X_FOLLOW, t.y + 1, -t.z - LOOK_AHEAD);
  camera.lookAt(look);
}

export function updateCamera(camera: THREE.PerspectiveCamera, t: CameraTarget, dt: number): void {
  desired.set(t.x * X_FOLLOW, t.y + UP, -t.z + BACK);
  const k = 1 - Math.pow(0.002, dt);
  camera.position.x += (desired.x - camera.position.x) * k;
  camera.position.y += (desired.y - camera.position.y) * k;
  camera.position.z = desired.z;
  look.set(t.x * X_FOLLOW, t.y + 1, -t.z - LOOK_AHEAD);
  camera.lookAt(look);
  const fov = t.rocketing ? FOV_ROCKET : FOV_NORMAL;
  camera.fov += (fov - camera.fov) * Math.min(1, dt * 5);
  camera.updateProjectionMatrix();
}
```

- [ ] **Step 3: terrain.ts**

```ts
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
    for (let i = current - BEHIND; i <= current + AHEAD; i++) if (i >= 0) wanted.add(i);
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
    const seg = this.track.getSegment(index);
    const geo = new THREE.PlaneGeometry(TRACK_WIDTH + SIDE_MARGIN * 2, SEGMENT_LENGTH, WIDTH_SEGMENTS, LENGTH_SEGMENTS);
    geo.rotateX(-Math.PI / 2);
    const centerWorldZ = -(seg.z0 + SEGMENT_LENGTH / 2);
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
```

- [ ] **Step 4: 型検査**

Run: `npm run typecheck`
Expected: エラーなし

- [ ] **Step 5: Commit**

```bash
git add src/render/scene.ts src/render/camera.ts src/render/terrain.ts
git commit -m "feat(render): add scene setup, chase camera, and terrain chunks"
```

---

### Task 8: 障害物・コイン・プレイヤーの描画

**Files:**
- Create: `src/render/props.ts`, `src/render/player.ts`

**Interfaces:**
- Consumes: `types.ts` の `Track`, `RunState`, `Segment`; `physics.ts` の `coinWorldY`; `params.ts` の `PhysicsParams`; `track.ts` の `TRACK_WIDTH`
- Produces:
  - `props.ts`: `class PropManager` — `constructor(scene, track, params)`, `setTrack(track)`, `update(z: number, collected: ReadonlySet<string>, dt: number)`, `dispose()`
  - `player.ts`: `interface PlayerPose { x: number; y: number; z: number; pitchSlope: number; airTime: number; grounded: boolean; steer: number; pullBack: number; rocketing: boolean }`, `class PlayerView` — `constructor(scene)`, `update(pose: PlayerPose)`, `dispose()`

- [ ] **Step 1: props.ts**

```ts
import * as THREE from 'three';
import type { Segment, Track } from '../core/types';
import type { PhysicsParams } from '../core/params';
import { coinWorldY } from '../core/physics';
import { TRACK_WIDTH } from '../core/track';

const BEHIND = 1;
const AHEAD = 3;
const COIN_SPIN = 3;

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

  private readonly matTree = new THREE.MeshLambertMaterial({ color: 0x2f8f4e, flatShading: true });
  private readonly matTrunk = new THREE.MeshLambertMaterial({ color: 0x7a4b2a, flatShading: true });
  private readonly matRock = new THREE.MeshLambertMaterial({ color: 0x8b8f99, flatShading: true });
  private readonly matSnow = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
  private readonly matCoin = new THREE.MeshLambertMaterial({ color: 0xffc928, emissive: 0x553300 });
  private readonly matPlank = new THREE.MeshLambertMaterial({ color: 0xb8743a, flatShading: true });

  constructor(private readonly scene: THREE.Scene, track: Track, private readonly params: PhysicsParams) {
    this.track = track;
    this.coin.rotateX(Math.PI / 2);
  }

  setTrack(track: Track): void {
    this.dispose();
    this.track = track;
  }

  update(z: number, collected: ReadonlySet<string>, dt: number): void {
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

    return { group, coins };
  }
}
```

- [ ] **Step 2: player.ts**

```ts
import * as THREE from 'three';

export interface PlayerPose {
  x: number;
  y: number;
  z: number;
  /** 接地中の地面の傾き (dh/dz) */
  pitchSlope: number;
  airTime: number;
  grounded: boolean;
  steer: number;
  /** 発射前の引き量 0..1。走行中は 0 */
  pullBack: number;
  rocketing: boolean;
}

const PULL_BACK_DISTANCE = 3;
const FLIP_RATE = Math.PI * 2;
const BANK = 0.35;

export class PlayerView {
  readonly group = new THREE.Group();
  private readonly flame: THREE.Mesh;

  constructor(private readonly scene: THREE.Scene) {
    const sled = new THREE.Mesh(
      new THREE.BoxGeometry(1.3, 0.2, 2.0),
      new THREE.MeshLambertMaterial({ color: 0xe0452b, flatShading: true }),
    );
    sled.position.y = 0.1;

    const body = new THREE.Mesh(
      new THREE.SphereGeometry(0.45, 12, 10),
      new THREE.MeshLambertMaterial({ color: 0x1b1f2a, flatShading: true }),
    );
    body.position.set(0, 0.65, 0.1);

    const belly = new THREE.Mesh(
      new THREE.SphereGeometry(0.36, 12, 10),
      new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }),
    );
    belly.position.set(0, 0.6, -0.15);

    const beak = new THREE.Mesh(
      new THREE.ConeGeometry(0.1, 0.3, 8),
      new THREE.MeshLambertMaterial({ color: 0xffa726, flatShading: true }),
    );
    beak.position.set(0, 0.82, -0.5);
    beak.rotation.x = -Math.PI / 2;

    this.flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.25, 1.2, 8),
      new THREE.MeshBasicMaterial({ color: 0xff8a2b }),
    );
    this.flame.position.set(0, 0.2, 1.6);
    this.flame.rotation.x = Math.PI / 2;
    this.flame.visible = false;

    this.group.add(sled, body, belly, beak, this.flame);
    scene.add(this.group);
  }

  update(p: PlayerPose): void {
    this.group.position.set(p.x, p.y, -p.z + p.pullBack * PULL_BACK_DISTANCE);
    if (p.grounded) {
      this.group.rotation.x = Math.atan(p.pitchSlope);
    } else {
      this.group.rotation.x = p.airTime * FLIP_RATE;
    }
    this.group.rotation.z = -p.steer * BANK;
    this.flame.visible = p.rocketing;
  }

  dispose(): void {
    this.scene.remove(this.group);
  }
}
```

- [ ] **Step 3: 型検査**

Run: `npm run typecheck`
Expected: エラーなし

- [ ] **Step 4: Commit**

```bash
git add src/render/props.ts src/render/player.ts
git commit -m "feat(render): add obstacle, coin, ramp, and player views"
```

---

### Task 9: UI（HUD、発射ゲージ、リザルト）

**Files:**
- Create: `src/ui/hud.ts`, `src/ui/aim.ts`, `src/ui/results.ts`
- Modify: `src/style.css`

**Interfaces:**
- Consumes: `types.ts` の `RunState`, `Profile`, `RunResult`, `UpgradeKind`, `Phase`; `upgrades.ts` の `upgradeCost`, `canBuy`, `UPGRADE_LABELS`; `params.ts` の `UPGRADE`
- Produces:
  - `hud.ts`: `class Hud` — `constructor(parent: HTMLElement, onRocket: () => void)`, `update(run: RunState | null, profile: Profile, phase: Phase): void`
  - `aim.ts`: `class AimGauge` — `constructor(parent)`, `show(pull: number): void`, `hide(): void`
  - `results.ts`: `class ResultsPanel` — `constructor(parent, handlers: { onBuy: (kind: UpgradeKind) => void; onRetry: () => void })`, `show(result: RunResult, profile: Profile): void`, `refresh(profile: Profile): void`, `hide(): void`, `visible: boolean`

- [ ] **Step 1: style.css に追記**

`src/style.css` の末尾に追加:

```css
#ui * { box-sizing: border-box; }
.hud { position: absolute; inset: 0; color: #fff; text-shadow: 0 2px 4px rgba(0,0,0,.45); font-weight: 700; }
.hud .stat { position: absolute; top: 16px; font-size: 22px; }
.hud .stat.left { left: 16px; }
.hud .stat.right { right: 40px; text-align: right; }
.hud .stat small { display: block; font-size: 12px; opacity: .85; font-weight: 500; }
.hud .progress { position: absolute; right: 12px; top: 90px; bottom: 120px; width: 14px; background: rgba(255,255,255,.35); border-radius: 7px; }
.hud .progress .fill { position: absolute; left: 0; right: 0; bottom: 0; background: #ffd23f; border-radius: 7px; }
.hud .progress .flag { position: absolute; top: -26px; left: -6px; font-size: 20px; }
.hud .progress .pct { position: absolute; left: -48px; width: 44px; text-align: right; font-size: 13px; transform: translateY(50%); }
.hud .rocket { position: absolute; right: 16px; bottom: 24px; width: 72px; height: 72px; border-radius: 50%; border: 3px solid #fff; background: #ff6b3d; color: #fff; font-size: 28px; pointer-events: auto; cursor: pointer; }
.hud .rocket:disabled { opacity: .35; }
.hud .toast { position: absolute; left: 50%; top: 30%; transform: translateX(-50%); font-size: 28px; color: #ffd23f; opacity: 0; transition: opacity .2s; }
.hud .toast.on { opacity: 1; }
.aim { position: absolute; top: 24px; left: 50%; transform: translateX(-50%); text-align: center; color: #fff; text-shadow: 0 2px 4px rgba(0,0,0,.45); }
.aim svg { width: 120px; height: 120px; }
.aim .pct { font-size: 26px; font-weight: 700; margin-top: -78px; }
.aim .hint { margin-top: 56px; font-size: 14px; }
.panel { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(10,30,60,.55); pointer-events: auto; }
.panel .card { width: min(92vw, 420px); background: #fff; border-radius: 16px; padding: 20px; color: #123; }
.panel h2 { margin: 0 0 8px; font-size: 22px; }
.panel .row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 15px; }
.panel .row.total { font-weight: 700; font-size: 18px; border-top: 1px solid #dde; margin-top: 6px; padding-top: 8px; }
.panel .badge { color: #e0452b; font-weight: 700; }
.panel .shop { margin-top: 12px; display: grid; gap: 8px; }
.panel .shop button { display: flex; justify-content: space-between; align-items: center; width: 100%; padding: 10px 12px; border: 0; border-radius: 10px; background: #eef3ff; font-size: 14px; cursor: pointer; }
.panel .shop button:disabled { opacity: .45; cursor: default; }
.panel .shop button b { font-size: 15px; }
.panel .shop button small { display: block; font-weight: 400; color: #567; }
.panel .retry { margin-top: 14px; width: 100%; padding: 14px; border: 0; border-radius: 12px; background: #2f8f4e; color: #fff; font-size: 18px; font-weight: 700; cursor: pointer; }
.hidden { display: none !important; }
.fatal { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 18px; background: #1b1f2a; }
```

- [ ] **Step 2: hud.ts**

```ts
import type { Phase, Profile, RunState } from '../core/types';

const TOAST_SECONDS = 1.2;

export class Hud {
  private readonly root: HTMLElement;
  private readonly dist: HTMLElement;
  private readonly speed: HTMLElement;
  private readonly coins: HTMLElement;
  private readonly fill: HTMLElement;
  private readonly pct: HTMLElement;
  private readonly rocket: HTMLButtonElement;
  private readonly toast: HTMLElement;
  private toastUntil = 0;
  private lastBonus = 0;

  constructor(parent: HTMLElement, onRocket: () => void) {
    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.root.innerHTML = `
      <div class="stat left"><span class="dist">0 m</span><small class="speed">0 km/h</small></div>
      <div class="stat right"><span class="coins">0</span><small>COINS</small></div>
      <div class="progress"><div class="fill"></div><div class="flag">🏁</div><div class="pct">0%</div></div>
      <button class="rocket" type="button">🚀</button>
      <div class="toast"></div>
    `;
    parent.appendChild(this.root);
    this.dist = this.root.querySelector<HTMLElement>('.dist')!;
    this.speed = this.root.querySelector<HTMLElement>('.speed')!;
    this.coins = this.root.querySelector<HTMLElement>('.coins')!;
    this.fill = this.root.querySelector<HTMLElement>('.fill')!;
    this.pct = this.root.querySelector<HTMLElement>('.pct')!;
    this.rocket = this.root.querySelector<HTMLButtonElement>('.rocket')!;
    this.toast = this.root.querySelector<HTMLElement>('.toast')!;
    this.rocket.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      onRocket();
    });
  }

  update(run: RunState | null, profile: Profile, phase: Phase): void {
    const distance = run ? run.distance : 0;
    const speed = run ? Math.sqrt(run.vx * run.vx + run.vy * run.vy + run.vz * run.vz) * 3.6 : 0;
    this.dist.textContent = `${Math.floor(distance)} m`;
    this.speed.textContent = `${Math.floor(speed)} km/h`;
    this.coins.textContent = `${profile.coins}${run ? ` +${run.coinsThisRun}` : ''}`;
    const ratio = Math.min(1, distance / profile.goalDistance);
    this.fill.style.height = `${ratio * 100}%`;
    this.pct.style.bottom = `${ratio * 100}%`;
    this.pct.textContent = `${Math.floor(ratio * 100)}%`;
    this.rocket.disabled = !(phase === 'run' && run !== null && run.rocketLeft > 0);

    if (run && run.lastLandingBonus > 0 && run.lastLandingBonus !== this.lastBonus) {
      this.lastBonus = run.lastLandingBonus;
      this.toast.textContent = `NICE LANDING x${run.lastLandingBonus.toFixed(2)}`;
      this.toastUntil = performance.now() + TOAST_SECONDS * 1000;
    }
    if (!run) this.lastBonus = 0;
    this.toast.classList.toggle('on', performance.now() < this.toastUntil);
  }
}
```

- [ ] **Step 3: aim.ts**

```ts
const RADIUS = 48;
const CIRC = 2 * Math.PI * RADIUS;

export class AimGauge {
  private readonly root: HTMLElement;
  private readonly arc: SVGCircleElement;
  private readonly pct: HTMLElement;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'aim hidden';
    this.root.innerHTML = `
      <svg viewBox="0 0 120 120">
        <circle cx="60" cy="60" r="${RADIUS}" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="10"/>
        <circle class="arc" cx="60" cy="60" r="${RADIUS}" fill="none" stroke="#27e1c1" stroke-width="10"
          stroke-linecap="round" transform="rotate(-90 60 60)" stroke-dasharray="${CIRC}" stroke-dashoffset="${CIRC}"/>
      </svg>
      <div class="pct">0%</div>
      <div class="hint">ドラッグして引く ／ Space 長押しで離す</div>
    `;
    parent.appendChild(this.root);
    this.arc = this.root.querySelector<SVGCircleElement>('.arc')!;
    this.pct = this.root.querySelector<HTMLElement>('.pct')!;
  }

  show(pull: number): void {
    this.root.classList.remove('hidden');
    const p = Math.max(0, Math.min(1, pull));
    this.arc.setAttribute('stroke-dashoffset', String(CIRC * (1 - p)));
    this.pct.textContent = `${Math.round(p * 100)}%`;
  }

  hide(): void {
    this.root.classList.add('hidden');
  }
}
```

- [ ] **Step 4: results.ts**

```ts
import type { Profile, RunResult, UpgradeKind } from '../core/types';
import { UPGRADE } from '../core/params';
import { UPGRADE_LABELS, canBuy, upgradeCost } from '../core/upgrades';

const KINDS: UpgradeKind[] = ['slingshot', 'sled', 'income'];

export class ResultsPanel {
  visible = false;
  private readonly root: HTMLElement;
  private readonly summary: HTMLElement;
  private readonly buttons = new Map<UpgradeKind, HTMLButtonElement>();
  private readonly coinsLine: HTMLElement;

  constructor(parent: HTMLElement, handlers: { onBuy: (kind: UpgradeKind) => void; onRetry: () => void }) {
    this.root = document.createElement('div');
    this.root.className = 'panel hidden';
    this.root.innerHTML = `
      <div class="card">
        <h2>RESULT</h2>
        <div class="summary"></div>
        <div class="row total"><span>所持コイン</span><span class="wallet">0</span></div>
        <div class="shop"></div>
        <button class="retry" type="button">もう一度</button>
      </div>
    `;
    parent.appendChild(this.root);
    this.summary = this.root.querySelector<HTMLElement>('.summary')!;
    this.coinsLine = this.root.querySelector<HTMLElement>('.wallet')!;
    const shop = this.root.querySelector('.shop')!;
    for (const kind of KINDS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.addEventListener('click', () => handlers.onBuy(kind));
      shop.appendChild(b);
      this.buttons.set(kind, b);
    }
    this.root.querySelector('.retry')!.addEventListener('click', () => handlers.onRetry());
  }

  show(result: RunResult, profile: Profile): void {
    this.summary.innerHTML = `
      <div class="row"><span>距離</span><span>${Math.floor(result.distance)} m ${result.newBest ? '<span class="badge">NEW BEST</span>' : ''}</span></div>
      <div class="row"><span>拾ったコイン</span><span>${result.coinsCollected}</span></div>
      <div class="row"><span>距離ボーナス</span><span>${result.distanceCoins}</span></div>
      ${result.goalReached ? '<div class="row"><span class="badge">GOAL CLEAR x2</span><span>次のゴール ' + profile.goalDistance + ' m</span></div>' : ''}
      <div class="row total"><span>獲得</span><span>+${result.earned}</span></div>
    `;
    this.refresh(profile);
    this.root.classList.remove('hidden');
    this.visible = true;
  }

  refresh(profile: Profile): void {
    this.coinsLine.textContent = String(profile.coins);
    for (const kind of KINDS) {
      const b = this.buttons.get(kind)!;
      const level = profile.upgrades[kind];
      const maxed = level >= UPGRADE.maxLevel;
      const label = UPGRADE_LABELS[kind];
      b.innerHTML = `<span><b>${label.name} Lv.${level}</b><small>${label.effect}</small></span><span>${maxed ? 'MAX' : `${upgradeCost(kind, level)} 🪙`}</span>`;
      b.disabled = !canBuy(profile, kind);
    }
  }

  hide(): void {
    this.root.classList.add('hidden');
    this.visible = false;
  }
}
```

- [ ] **Step 5: 型検査**

Run: `npm run typecheck`
Expected: エラーなし

- [ ] **Step 6: Commit**

```bash
git add src/ui/hud.ts src/ui/aim.ts src/ui/results.ts src/style.css
git commit -m "feat(ui): add HUD, aim gauge, and results panel with shop"
```

---

### Task 10: 起動と結線 (`main.ts`)

**Files:**
- Modify: `src/main.ts`（Task 1 の仮実装を置き換える）

**Interfaces:**
- Consumes: Task 5〜9 の全公開 API

- [ ] **Step 1: main.ts を実装**

```ts
import './style.css';
import { Game } from './core/game';
import { loadProfile, saveProfile, type StorageLike } from './core/save';
import type { Phase } from './core/types';
import { InputController } from './input';
import { createScene } from './render/scene';
import { snapCamera, updateCamera } from './render/camera';
import { TerrainManager } from './render/terrain';
import { PropManager } from './render/props';
import { PlayerView } from './render/player';
import { Hud } from './ui/hud';
import { AimGauge } from './ui/aim';
import { ResultsPanel } from './ui/results';

const FIXED_DT = 1 / 120;
const MAX_STEPS = 4;
const EMPTY_COINS: ReadonlySet<string> = new Set<string>();

function getStorage(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function hasWebGL(canvas: HTMLCanvasElement): boolean {
  try {
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

function boot(): void {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const ui = document.getElementById('ui') as HTMLElement;

  if (!hasWebGL(canvas)) {
    const msg = document.createElement('div');
    msg.className = 'fatal';
    msg.textContent = 'このブラウザでは動作しません（WebGL が必要です）';
    ui.appendChild(msg);
    return;
  }

  const storage = getStorage();
  const game = new Game(loadProfile(storage), Date.now() % 100000, {
    onProfileChange: (p) => saveProfile(storage, p),
  });

  const { renderer, scene, camera } = createScene(canvas);
  const terrain = new TerrainManager(scene, game.track);
  const props = new PropManager(scene, game.track, game.physicsParams());
  const player = new PlayerView(scene);
  const input = new InputController(canvas);
  const hud = new Hud(ui, () => input.pressRocket());
  const aim = new AimGauge(ui);
  const results = new ResultsPanel(ui, {
    onBuy: (kind) => {
      if (game.buy(kind)) results.refresh(game.profile);
    },
    onRetry: () => {
      results.hide();
      game.restart();
      terrain.setTrack(game.track);
      props.setTrack(game.track);
      snapCamera(camera, { x: 0, y: game.track.heightAt(0), z: 0, rocketing: false });
    },
  });

  snapCamera(camera, { x: 0, y: game.track.heightAt(0), z: 0, rocketing: false });

  let last = performance.now();
  let acc = 0;
  let lastPhase: Phase = game.phase;
  let steerShown = 0;
  let pullShown = 0;

  function frame(now: number): void {
    const frameDt = Math.min(0.1, (now - last) / 1000);
    last = now;
    acc += frameDt;

    input.phase = game.phase;
    input.update(frameDt);
    const snap = input.read();

    if (game.phase === 'aim') {
      pullShown = snap.pulling ? snap.pull : 0;
      aim.show(snap.pulling ? snap.pull : 0);
      if (snap.released) game.launch(snap.pull);
    } else {
      aim.hide();
      pullShown = 0;
    }

    let steps = 0;
    while (acc >= FIXED_DT && steps < MAX_STEPS) {
      game.update(FIXED_DT, { steer: snap.steer, rocket: snap.rocket && steps === 0 });
      acc -= FIXED_DT;
      steps += 1;
    }
    if (steps === MAX_STEPS) acc = 0;

    if (game.phase === 'results' && lastPhase !== 'results' && game.lastResult) {
      results.show(game.lastResult, game.profile);
    }
    lastPhase = game.phase;

    const run = game.run;
    const x = run ? run.x : 0;
    const z = run ? run.z : 0;
    const y = run ? run.y : game.track.heightAt(0);
    const rocketing = !!run && run.rocketTime > 0;
    steerShown += (snap.steer - steerShown) * Math.min(1, frameDt * 10);

    terrain.update(z);
    props.update(z, run ? run.collectedCoinIds : EMPTY_COINS, frameDt);
    player.update({
      x, y, z,
      pitchSlope: game.track.slopeAt(z),
      airTime: run ? run.airTime : 0,
      grounded: run ? run.grounded : true,
      steer: steerShown,
      pullBack: pullShown,
      rocketing,
    });
    updateCamera(camera, { x, y, z, rocketing }, frameDt);
    hud.update(run, game.profile, game.phase);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

boot();
```

- [ ] **Step 2: 型検査とビルド**

Run: `npm run typecheck` → エラーなし
Run: `npm run build` → `dist/` 生成、エラーなし（Three.js のチャンクサイズ警告は無視してよい）

- [ ] **Step 3: 起動確認**

Run: `npm run dev`（バックグラウンドで起動し、`Local: http://localhost:5173/` が出ることを確認）
`curl -s http://localhost:5173/ | grep -c "src/main.ts"` → `1`

- [ ] **Step 4: Commit**

```bash
git add src/main.ts
git commit -m "feat: wire game loop, rendering, input, and UI"
```

---

### Task 11: 最終検証とプレイテスト依頼

**Files:**
- Create: `README.md`

- [ ] **Step 1: 全テストとビルドを通す**

Run: `npm test` → 全 PASS
Run: `npm run build` → 成功

- [ ] **Step 2: README.md**

```markdown
# Sled Surfer (browser)

スリングショットで発射して雪山を滑り降りる 3D ランナー。

## 操作

- 発射: 画面を下へドラッグして離す ／ Space 長押しで離す
- 操舵: ← → または A D ／ 画面の左右をタッチ
- ロケット: Space ／ 右下のボタン（1 ランに 1 回）

## 開発

- `npm install`
- `npm run dev` で http://localhost:5173/
- `npm test` でロジックのテスト
- `npm run build` で `dist/` に出力

設計: `docs/superpowers/specs/2026-09-19-sled-surfer-browser-design.md`
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add README with controls and dev commands"
```

- [ ] **Step 4: プレイテストの報告**

以下をユーザーに依頼する（実装者は自動で確認できない）:

1. `npm run dev` を開き、ドラッグで発射できる
2. 滑走中に左右で曲がり、障害物に当たると減速して弾かれる
3. ランプで飛び、着地で「NICE LANDING」が出る
4. 停止後にリザルトが出て、コインが増え、強化を買うと次の発射が伸びる
5. リロードしても所持コインと強化が残る
6. スマホ（または DevTools のタッチエミュレーション）でドラッグ発射とタッチ操舵ができる

気になった手触り（速すぎる、すぐ止まる、障害物が多い等）は `src/core/params.ts` と `src/core/track.ts` の定数で調整する。
