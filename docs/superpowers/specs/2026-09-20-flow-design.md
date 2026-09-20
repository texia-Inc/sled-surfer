# 速度モデル転換・ジャンプ・破壊・カメラ・フィールド幅 設計書

日付: 2026-09-20。base 設計書とゾーン設計書への追加。本家の観察（Instagram 動画）に基づく。

## 1. 速度モデル（A）

- 平地・緩斜面では減速しない。`muSnow = 0.06`（初期勾配と同値）、`muGrass = 0.065`（将来の草用に定義のみ）、`muIce = 0.02`、`muRoad = 0.035`、`kDrag = 0.0005`。
- 減速要因は衝突に集中する。障害物は `hard`（木・岩・車・バス・鍾乳石・結晶）と `breakable`（雪だるま・切り株・看板・バリケード・干し草・木箱・柵）に分かれる。
  - hard: 現状どおり `vz *= 0.6`、横に弾く、スタン 0.5 s。
  - breakable: 障害物は壊れて消える（`brokenObstacleIds`）、`vz *= 0.85`、スタンなし、コイン +2（`coinsThisRun`）、`breakCount` を増やす（演出用）。
- ロケット・ブースト・着地ボーナスの上限は維持。
- 走行終了は現状の停止判定（`vz < 2.5 m/s` が 1 s）。勾配は 3000 m で 0.024 まで緩むので最終的に止まる。

## 2. ジャンプ（B）

- ランプ: 区間ごとに 1〜2 本を必ず配置。高さは 3 m（small）と 6 m（big）。`Ramp.height` を使う。長さは 12 m / 18 m。
- 落差セクション `Drop { z, depth, length }`: 区間に確率 0.35 で 1 つ。`z` から `length`（20 m）かけて `depth`（10〜15 m）下がる滑らかな段（cos 補間）。落差の手前 `z - 14` に big ランプを置く（ランプの終端が落差の開始と一致）。区間 0〜1（400 m 未満）には置かない。
- 高さ関数 `h(z)` に drop の寄与を加える。drop は区間内に収める（`z` は `[z0 + 40, z1 - 60]`）。drop は次の区間以降にも影響するので、`baseHeight` とは別に「累積落差」`dropOffset(z)` を導入し、`heightAt = baseHeight + Σ_{drops with z_d < z} depth_d * s(z)`（s は cos 補間、完了後 1）。累積は区間キャッシュから前方向に計算する（区間 i の開始時点の累積 = 区間 0..i-1 の drop の depth 合計）。
- 滞空中の回転は現状（1 回転/s）。

## 3. 破壊（C）

- `ObstacleKind` に `hay`, `crate`, `fence` を追加（半径 0.9 / 0.7 / 1.5）。`OBSTACLE_BREAKABLE: Record<ObstacleKind, boolean>`。
- ゾーンの `obstacleKinds` を更新: 雪山 tree/rock/snowman/crate、森 tree/stump/rock/fence/hay、市街地 car/bus/sign/barrier/crate、洞窟 stalagmite/crystal/rock/crate。
- 破壊時: 描画は破片パーティクル（障害物色）と消滅、HUD にコイン加算表示。

## 4. カメラ（D）

- 前方 8 m の傾き `slopeAhead = slopeAt(z + 8)` に応じてピッチ: 目標点の高さを `y + 1 + slopeAhead * 8` にして見下ろす。
- 速度で引く: `back = 7 + 7 * clamp((speed - 15) / 25, 0, 1)`, `up = 3.5 + 5.5 * 同係数`。落差中（`drop` の区間内）は `up` に +3。
- 補間は現状の lerp。

## 5. フィールド幅（E）

- `trackWidth = 28`。障害物 x 範囲・コイン x 範囲・パッド x 範囲は幅に比例（定数を `TRACK_WIDTH/2 - margin` で計算）。廊下（corridor）の半幅は 3 のまま。
- 装飾の土手は `|x| ∈ [16, 22]`。ゾーンごとの「遠くの崖」を追加: `decor` に `cliff` kind、両脇 `|x| ∈ [22, 30]`、高さ 12〜25 m、区間あたり片側 3〜4 個、雪山=白、森=茶、市街地=灰、洞窟=濃紺。
- 地形メッシュ幅は `trackWidth + 2*16`。

## 6. テスト

- physics: 平地で 5 秒走っても速度低下が 5% 未満、breakable 衝突で 15% 減・消滅・コイン +2・再衝突なし、hard は従来どおり。
- track: 各区間にランプ 1〜2 本、drop が 400 m 以降のみ、drop 直前に big ランプ、`heightAt` が drop 完了後に depth 分低い、累積が区間をまたいで正しい、幅 28 で障害物が範囲内、cliff が `|x| ≥ 22`。
- balance: 各ランが 600 s 以内に終わる、フレッシュ平均 300〜5000 m（本家型の速度モデルでは距離は障害物次第）。
