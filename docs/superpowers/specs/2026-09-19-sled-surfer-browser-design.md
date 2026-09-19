# Sled Surfer (ブラウザ版) 設計書

日付: 2026-09-19
対象: 初回リリース（コアループ＋アップグレード）

## 1. 目的

CrazyLabs の「Sled Surfers」に似た、スリングショットで発射して雪山を滑り降りる 3D ランナーをブラウザで作る。
「発射 → 滑走 → 停止 → コイン獲得 → 強化 → 再挑戦」のループが成立し、強化によって到達距離が伸びる手応えを出すことが初回のゴール。

## 2. 参考にした本家の仕様

調査で確認できた事項（確度）:

- 三人称の追従視点。コースは画面奥へ伸びる（高）
- 連続操舵。切りすぎると減速する（中）
- レベルごとにゴール距離があり、右端の縦バー＋チェッカーフラッグと % で進捗表示（高）
- 発射前にドラッグで引き、離して発射。力の % ゲージがある（高）
- ランプで自動フリップ、着地で加速とコイン（中）
- ロケットは消費型ブースター（中）。発動方法は不明
- 強化は SLINGSHOT（発射力）、SLED（速度維持）、INCOME（コイン倍率）（中）
- 表面は雪と氷があり、氷の方が速い（中）
- ローポリ、彩度の高い配色、ペンギン主人公（高）

不明点に対する本作の決定:

- 障害物への衝突は「横に弾かれ、速度 40% 減」。即死はしない
- ロケットは 1 ランに 1 回、任意のタイミングで発動（Space / タップ）
- フリップは空中で自動。着地時に速度ボーナス
- コインは直線列とアーチ状に配置

## 3. スコープ

含む:

- スリングショット発射、滑走、空中、停止判定
- 手続き生成される無限コース（雪、氷、ランプ、障害物、コイン）
- 強化 3 種（SLINGSHOT / SLED / INCOME）各 10 段階と localStorage セーブ
- ゴール距離とチェッカーフラッグの進捗バー。到達で「クリア」演出とボーナス、次のゴールは 1.5 倍
- HUD、発射ゲージ、リザルト画面兼ショップ
- PC キーボードとスマホタッチ操作
- core ロジックの Vitest テスト

含まない（次回以降）:

- テーマ別レベル、キャラクターやソリのスキン、チケット制、ジェム、広告、音
- 本格物理エンジン、複数プレイヤー

## 4. アーキテクチャ

### 4.1 方針

物理エンジンは使わず、自作の簡易物理を採用する。コースは「Z 方向へ伸びる幅 W の廊下」で、高さは手続き生成した関数 `h(z)` で表す。ソリは横位置 `x`、進行距離 `z`、高さ `y` を持ち、接地中は `y = h(z)`、空中は弾道で動く。
ゲームロジックは純関数で構成し、描画（Three.js）と UI（DOM）は状態を読むだけにする。

### 4.2 ディレクトリ構成

```
src/
  core/
    types.ts       状態と設定の型
    params.ts      物理定数と調整値（1 か所に集約）
    physics.ts     stepRun(state, input, dt, params): RunState
    track.ts       シード付き区間生成、h(z)、表面、障害物、コイン、ランプ
    upgrades.ts    段階、コスト、効果
    save.ts        localStorage への保存と読込
    game.ts        Aim / Run / Ended / Results の状態機械
  render/
    scene.ts       renderer, scene, light, カメラ
    terrain.ts     区間ごとの地形メッシュ生成と破棄
    props.ts       障害物とコインの InstancedMesh
    player.ts      ペンギン＋ソリのメッシュとアニメ（フリップ）
    camera.ts      追従カメラ
  ui/
    hud.ts         距離、速度、コイン、進捗バー
    aim.ts         発射ゲージ
    results.ts     リザルトとショップ
  input.ts         キーボードとタッチを統一した入力状態
  main.ts          ループと結線
tests/
  physics.test.ts, track.test.ts, upgrades.test.ts, save.test.ts, game.test.ts
```

### 4.3 データフロー

```
input.ts ──> game.ts(状態機械) ──> physics.ts / track.ts ──> RunState
                                                          │
                render/*  <── 状態を読んで描画 ──────────┤
                ui/*      <── 状態を読んで DOM 更新 ─────┘
```

`main.ts` が `requestAnimationFrame` で dt を計測し、固定ステップ（1/120 秒、最大 4 ステップ/フレーム）で `game.update` を呼び、そのあと描画と UI を更新する。

## 5. コアロジック

### 5.1 状態

```ts
type Phase = 'aim' | 'run' | 'ended' | 'results';

interface RunState {
  x: number; y: number; z: number;      // 横, 高さ, 進行距離 (m)
  vx: number; vy: number; vz: number;   // 速度 (m/s)
  grounded: boolean;
  airTime: number;                      // 連続滞空秒
  flips: number;                        // 今回の空中で完了したフリップ数
  rocketLeft: number;                   // 残りロケット回数
  rocketTime: number;                   // ロケット残り噴射秒
  stunTime: number;                     // 衝突後の無敵と操舵無効秒
  stoppedTime: number;                  // 低速が続いた秒
  coinsThisRun: number;
  collectedCoinIds: Set<string>;
  distance: number;                     // = z
}

interface Input {
  steer: number;        // -1..1
  rocket: boolean;      // 押した瞬間だけ true
}

interface Profile {
  coins: number;
  bestDistance: number;
  goalDistance: number;
  upgrades: { slingshot: number; sled: number; income: number };
}
```

### 5.2 発射

- 引き量 `pull` は 0..1。マウス/タッチのドラッグ距離（画面高さの 25% で 1.0）または キー長押しで 0→1→0 を往復するゲージ
- 初速 `v0 = slingshotBase * (0.4 + 0.6 * pull) * slingshotMul(level)`
- 発射角は固定 25 度（上向き）。`vz = v0 cos, vy = v0 sin`

### 5.3 接地中の速度更新

```
slope = dh/dz (z で数値微分)
a_slope = -g * slope / sqrt(1 + slope^2)     // 下りで正
a_fric  = -g * mu(surface) * sign(vz)        // 雪 0.10（初期勾配 0.06 より大きく、新品のソリは必ず減速する）, 氷 0.02
a_drag  = -k_drag * vz^2                     // k_drag = 0.0006
a_steer = -k_steer * steer^2 * vz            // k_steer = 0.25（軽い修正はほぼ無料、フルロックで効く）
a_rocket = (rocketTime > 0 && vz < rocketSpeedCap) ? rocketAccel : 0  // 22 m/s^2, 1.5 秒, 上限 35 m/s 未満でのみ加速
a_boost  = (boostTime > 0 && vz < boostSpeedCap) ? boostAccel * chainMul : 0  // ブーストパッド後の推力, 上限 40 m/s 未満でのみ加速
vz += (a_slope + a_fric + a_drag + a_steer + a_rocket + a_boost) * dt
vx = steer * 12 * min(vz, 30) / 30              // 最大 12 m/s
x  = clamp(x + vx * dt, -W/2, W/2)             // 端で vx を反転し 0.5 倍
```

SLED 強化は `mu` を段階ごとに 3% 減、`k_drag` を 3% 減する。速度キック（ロケット・ブースト・着地ボーナス）はいずれも速度上限つきで、無制限に加速が積み重ならないようにする（ロケット 35 m/s、ブースト 40 m/s、着地ボーナス 32 m/s）。

### 5.4 離陸と空中

- 接地中に、地形に沿うのに必要な下向き加速度が重力を超えたら離陸（ランプ端の段差と、速い速度で越える起伏の頂点の両方を扱える）
- 空中は `vy -= g dt`、`vz` は空気抵抗のみ
- `y <= h(z)` で着地。`airTime >= 0.6` かつフリップ完了なら、ボーナス後速度を `min(vz * min(1 + 0.08 * flips, 1.25), landingBonusSpeedCap)`（上限 32 m/s）とし、これが現在の `vz` より大きい場合だけ適用する（減速はしない）。滞空 1 秒ごとにフリップ 1 回として数える
- 着地時に `vy` の下向き成分は捨てる。急角度の着地ペナルティは設けない（本家の寛容さに合わせる）

### 5.5 衝突

- 障害物は `(x, z, r)` の円。ソリ半径 0.6
- 重なったら `vz *= 0.6`、`vx = 障害物から離れる向きに 6 m/s`、`stunTime = 0.5`
- `stunTime > 0` の間は再衝突しない

### 5.6 停止判定

接地中に `vz < 0.8 m/s` が 1.0 秒続いたら `ended`。ロケットが残っていても自動では使わない。

### 5.7 コース生成

- 区間長 200 m。`seed` と区間番号から乱数を作り決定的に生成
- 各区間の要素:
  - 高さ: 基本勾配は 0 m で -0.06、3000 m で -0.024 まで直線的に緩くなる（強化なしでは必ず止まる）。これに振幅 1.5〜4 m の緩い起伏を 2〜3 個重ねる
  - 氷帯: 確率 0.35 で長さ 30〜80 m
  - ランプ: 確率 0.5 で 1 個。長さ 12 m、高さ 3 m の上向き斜面で終端が段差
  - 障害物: 区間ごとに `3 + floor(距離 / 400)` 個（上限 14）。木、岩、雪だるま。中央付近は 1 本の通路を必ず残す
  - コイン: 直線列（5〜8 枚、1.5 m 間隔）2 本と、ランプ後方にアーチ 1 本
- 先読み 3 区間、後方 1 区間を保持し、それ以外は破棄
- `h(z)` は区間をまたいで連続（区間端の高さを引き継ぐ）

### 5.8 強化

| 種類 | 効果 | コスト |
| --- | --- | --- |
| SLINGSHOT | 初速 +8% / 段階 | `40 * 1.6^level` |
| SLED | 摩擦と空気抵抗 -3% / 段階 | `50 * 1.6^level` |
| INCOME | 獲得コイン倍率 1 + 0.25 * level | `60 * 1.6^level` |

各 10 段階。リザルトで `coins >= cost` のときのみ購入可。

### 5.9 リザルトのコイン計算

```
earned = floor((coinsThisRun + distance / 10) * incomeMul(level) * (goalReached ? 2 : 1))
```

`goalReached` は今回のランで `distance >= goalDistance` に達したこと。達したら `goalDistance *= 1.5`（切り上げて 50 m 単位）。

## 6. 描画

- Three.js、`WebGLRenderer`、`PerspectiveCamera(fov 60)`
- 地形は区間ごとに `PlaneGeometry(W, 200, 8, 100)` を `h(z)` で変形。`MeshLambertMaterial` にフラットシェーディング。氷帯は頂点色で青白く塗り分け
- 障害物とコインは区間ごとの `Group` にまとめ、ジオメトリとマテリアルは共有する。区間の破棄で `Group` ごと外す
- ペンギンは球＋円柱、ソリは箱。空中では x 軸まわりに 1 回転/秒で回す
- 追従カメラ: プレイヤー後方 7 m、上方 3.5 m。`x` に 0.4 倍で追従し、`lerp` で滑らかにする。ロケット中は fov を 70 に
- 背景は空色の `scene.background` と `Fog`。遠景の山は不要

## 7. UI

- HUD（`ui/hud.ts`）: 左上に距離 m と速度 km/h、右上にコイン枚数、右端に縦の進捗バーとチェッカーフラッグと %
- 発射ゲージ（`ui/aim.ts`）: 中央上に弧状ゲージと %。ドラッグ中はソリを後方へ引く演出
- リザルト（`ui/results.ts`）: 距離、ベスト更新表示、獲得コイン内訳、強化 3 ボタン（現在段階、次コスト、効果）、「もう一度」ボタン
- 全画面のリサイズ対応。スマホは縦持ちも横持ちも可

## 8. 入力

- キーボード: `←/→` または `A/D` で `steer`、`Space` でロケット。発射は `Space` 長押しで往復ゲージ、離して発射
- マウス/タッチ: 発射は画面をドラッグして下へ引き、離す。走行中は画面左右のタッチ位置で `steer`（中央からのオフセット、-1..1）。ロケットは画面右下のボタン
- `input.ts` は両方を統合し、毎フレーム `Input` を返す

## 9. セーブ

- `localStorage` キー `sled-surfer:profile:v1` に `Profile` を JSON で保存
- 読込時に欠けたフィールドは初期値で補う。壊れていれば初期値に戻す

## 10. エラー処理

- WebGL が使えない場合は「このブラウザでは動作しません」を表示して停止
- 固定ステップの積み残しは 4 ステップで打ち切り（タブ復帰時の暴走防止）
- `localStorage` が使えない場合はメモリ上だけで動作（保存されない旨は表示しない）

## 11. テスト

Vitest。DOM と WebGL に依存しない `core/` を対象にする。

- physics: 下り斜面で `vz` が増える。氷は雪より減速が小さい。操舵で減速。ランプ端で離陸し、着地でボーナス。障害物で減速し弾かれる。低速 1 秒で停止判定
- track: 同じ seed で同じ結果。`h(z)` が区間境界で連続。障害物が中央通路を塞がない
- upgrades: コストが段階で増える。効果が期待の倍率。上限で購入不可
- save: 往復で同じ値。壊れた JSON で初期値に戻る
- game: aim → run → ended → results → aim の遷移。ゴール到達で `goalDistance` が伸びる

描画と UI は `npm run dev` で起動しブラウザで目視確認する。

## 12. 技術スタック

- Vite、TypeScript（strict）、Three.js、Vitest
- 依存は Three.js のみ。CDN は使わず npm で導入
- `npm run dev`、`npm run build`、`npm test`
