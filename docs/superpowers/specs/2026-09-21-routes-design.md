# マルチルート区間と火山ゾーン 設計書

日付: 2026-09-21。terrain 設計書への追加。本家の Instagram 映像（岩壁の高台ルート、雪の低ルート、溶岩上の柱渡り）に基づく。

## 1. ルート区間

- `Segment.route: RouteSection | null`。`RouteSection = { z0, z1, lanes: Lane[], pillars: Pillar[], hazard: 'lava' | 'chasm' }`。
- `Lane = { xMin, xMax, yOffset, kind: 'ridge' | 'ground' | 'pillars' }`。レーンは区間の幅（`widthAt`）を等分し、隣接。`ridge` は `yOffset = +4`、`ground` は 0、`pillars` は床が `-6`（溶岩／谷底）で `Pillar`（半径 5 m、頂上 `+2`）が 28 m 間隔で並ぶ。
- レイアウトは 3 種: A `[ridge, ground, pillars]`、B `[ground, pillars, ridge]`、C `[ridge, ground]`（幅 24 m 未満なら C）。
- 出現: `z0 >= 400` の区間に確率 0.4、長さ 100〜160 m、落差・ハーフパイプ・ランプと重ならない。従来の「中央の壁の分岐」は出現確率 0 にして置き換える。
- 高さ: `heightAt(z, x)` は区間内でレーンの `yOffset`（柱の上ならさらに柱の高さ）を加える。入口は 1 m で立ち上がる段差（正面からは壁）、出口は 12 m かけて 0 に戻る斜面。
- 入口の 22 m 手前、`ridge` レーンの中心 x に大ランプ（幅 8 m）を置く。高台に入るにはこれに乗る。柱レーンの各柱頂上には小ランプ（幅 5 m）。
- コイン: 高台レーンに 3 倍の列、柱の頂上に 3 枚。

## 2. 物理ルール

- **横の壁**: 横移動先の地面が今の高さより `stepUpLimit`（1.2 m）以上高ければ、その横移動を取り消して `vx = 0`。
- **正面の壁**: 前進先の地面が今の高さより 1.2 m 以上高ければ、前進を取り消し `vz *= 0.3`、スタン 0.5 s。
- **落下**: 高いレーンから低いレーンへは空中に出る（既存の離陸判定）。
- **ワイプアウト**: 接地位置のレーンが `pillars` で柱の上でない（= 溶岩／谷底）とき: `wipeoutCount += 1`、スタン 1.0 s、`vz = 10`、x を最も近い非 `pillars` レーンの中心に移し、y をその地面にする。ランは終わらない。

## 3. 火山ゾーン

- `ZONES` に `{ id: 'volcano', nameJa: '火山の遺跡', z0: 3000, surface: 'snow', obstacleKinds: ['totem', 'rock', 'crate', 'palm'], iceChance 0.2, boostChance 0.8, bumpScale 1.0, obstacleDensityMul 1.0 }`。`ZONE_GOALS` に 4000 を追加。
- 障害物 `totem`（hard, r 0.8）、`palm`（hard, r 0.7）。装飾 `palm`（両脇）と `temple`（両脇の石段ブロック）。
- ルート区間の `hazard` は volcano で `'lava'`、他は `'chasm'`。
- 配色: 地面は暗い灰褐色、氷は薄青、土手は黒い溶岩石、空は薄紫、霧は紫がかった灰色。溶岩床は発光する橙。

## 4. 描画

- 高台の側面には岩ブロックの壁（箱を 3 m 間隔で並べる）、柱は円柱（床から頂上まで）、溶岩床は橙の発光色（頂点色）、谷底は暗色。
- 区間入口の手前に矢印看板（既存 signpost を流用し、レーン数ぶんの矢印）。
- ワイプアウト時: 赤いフラッシュ（HUD オーバーレイ 0.3 s）と破片。

## 5. テスト

- 生成: 出現条件、レーンが幅を等分、柱の間隔、入口大ランプの位置と幅、他の特徴と重ならない。
- 高さ: 各レーンで `heightAt` が `yOffset` を反映、柱の上は +2、出口で 0 に戻る。
- 物理: 横の壁、正面の壁、落下、ワイプアウト（位置と速度とスタン）。
- ゾーン: `zoneAt(3000) = volcano`、`nextGoal(3500) = 4000`。
