# 曲がる中心線（ワールドベンド）設計書

日付: 2026-09-27。コースは今まで中心線が真っすぐだった。本家の砂漠スライダーのように左右へうねらせる。

## 方針: コアは直線のまま、描画時に世界を曲げる

- `src/core/` は今まで通り「トラック局所座標」（x は中心線からの横ずれ）で動く。物理・生成・テストは変更なし。
- 曲げ量 `centerAt(z)` はコアが決める（純関数、シード依存）。描画ではすべてのメッシュを頂点シェーダーで `worldX += centerAt(gameZ)` だけずらす（Subway Surfers 式のワールドベンド）。長い管やレールも頂点ごとに曲がるので、個々の配置コードは触らない。
- カメラだけは JS 側で曲げた座標に置く（カメラは頂点ではないため）。

## 1. コア（src/core/track.ts, types.ts）

- `TRACK_BEND = { amp1: 10, wave1: 260, amp2: 4, wave2: 95, fadeIn: 150 }`（名前付き定数）。
- `bendPhases(seed): [p1, p2]`: `mulberry32(hashSeed(seed, -1))` から 2 つの位相 (0..2π)。
- `centerAt(z) = fade(z) * (amp1 * sin(2π z / wave1 + p1) + amp2 * sin(2π z / wave2 + p2))`、`fade(z) = smoothstep(z / fadeIn)`（発射地点付近は直線）。z < 0 は 0。
- `centerSlopeAt(z)`: 数値微分（±0.5 m）。
- `Track` に `centerAt`, `centerSlopeAt`, `bendPhases: [number, number]` を追加（`TrackQuery` には不要）。
- テスト: `centerAt(0) === 0`、|centerAt| ≤ amp1 + amp2、シードで決定論的、1 m 刻みの差が 1 m 未満（滑らか）、z=1000 で fade=1。

## 2. 描画: src/render/bend.ts（新規）

- `export const bendUniforms = { uBendPhase: { value: new THREE.Vector2(0, 0) } }`。`setBendPhases(p1, p2)` で値を更新（ラン開始ごとに `track.bendPhases` を渡す）。
- `installWorldBend()`: `THREE.Material.prototype.onBeforeCompile` を差し替え、`this.userData.noBend` が真でなければ `applyWorldBend(shader)` を呼ぶ。個別に `onBeforeCompile` を持つマテリアル（terrain.ts の `withVoidDiscard`）は自分で `applyWorldBend(shader)` を呼ぶ。
- `applyWorldBend(shader)`: `shader.uniforms.uBendPhase = bendUniforms.uBendPhase`、頂点シェーダー先頭に `uniform vec2 uBendPhase;` と GLSL の `worldBendX(float gameZ)`（TRACK_BEND の定数をリテラルで埋め込み、fade は smoothstep）を追加し、`#include <project_vertex>` を次に置換:
  ```glsl
  vec4 bentWorld = modelMatrix * vec4( transformed, 1.0 );
  bentWorld.x += worldBendX( -bentWorld.z );
  vec4 mvPosition = viewMatrix * bentWorld;
  gl_Position = projectionMatrix * mvPosition;
  ```
  （three の fog/points はこの後 `mvPosition` を使うので変数名を合わせる。）
- 空ドーム（ShaderMaterial）はこのチャンクを含まないので影響なし。カメラの子であるスピードライン（effects.ts の SpeedLines）は `material.userData.noBend = true`。

## 3. カメラ（src/render/camera.ts, src/main.ts）

- `CameraTarget.centerAt: (z: number) => number` を追加。`applyPose` でカメラ位置 x に `centerAt(-pz)`、注視点 x に `centerAt(-lz)` を足す（pose は局所座標のまま。地面クランプも局所のまま）。
- main.ts: `game.track.centerAt` を渡す。ラン開始・リスタートで `setBendPhases(...track.bendPhases)`。

## 4. プレイヤーの向き（src/render/player.ts）

- `PlayerPose.centerSlope` を追加し、`group.rotation.y = -Math.atan(centerSlope)`（進行方向を曲線の接線に合わせる）。main.ts で `track.centerSlopeAt(z)` を渡す。

## 5. 確認

- `npx tsc --noEmit -p .`、`npx vitest run --pool=forks`。
- ヘッドレス Chrome で z ≈ 300、1000、スライダー区間、宇宙の管の場面を撮り、道が左右にうねっていること、レール・管・岩壁・地面がずれずに一体で曲がっていること、カメラが道を追っていること、スピードラインが画面に固定されたままであることを見る。
