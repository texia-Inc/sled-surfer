# 谷越えジャンプ・連続ジャンプ台・ゾーン別カーブ強度 設計書

日付: 2026-09-27。curved-track 設計書（同日）と routes 設計書（2026-09-21）への追加。

## 1. ゾーン別カーブ強度

- `ZoneDef.bendMul`: snowfield 0.6, forest 1.0, city 0.5, cave 1.0, volcano 1.0, desert 1.4, space 1.6。
- `bendMulAt(z)`（core/track.ts、export）: 各ゾーン開始 z0 から `TRACK_BEND.zoneBlend`（100 m）かけて前ゾーンの倍率から smoothstep で移る。最初のゾーンは自分の倍率のまま。
- `centerAt(z)` はこれまでの値に `bendMulAt(z)` を掛ける。`centerSlopeAt` は数値微分のまま。
- GLSL（render/bend.ts）: `ZONES` から z0 と bendMul の配列を文字列生成して `worldBendX` に埋め込み（定数配列＋展開ループ、ユニフォーム不要）、JS と同じ計算をする。
- テスト: `bendMulAt(4500) === 1.4`、`bendMulAt(50) === 0.6`、ゾーン境界をまたいで 1 m 刻みの差が小さい（連続）。

## 2. 谷越えジャンプ（canyon）

- 既存の `RouteSection` を再利用: `RouteSection.canyon?: true`、lanes は 1 本 `{ xMin: -w/2, xMax: w/2, yOffset: -hazardDepth, kind: 'pillars' }`（w = widthAt(z0)）、pillars は空。hazard は volcano で lava、他は chasm。
- 出現: `canyonMinZ` 1000 以降、ルート区間もスライダーもない区間に確率 `canyonChance` 0.25（専用 rng `mulberry32(hashSeed(seed, index) ^ 0x3c9e0d41)`）。ルート生成の直後・スライダー生成の前に決める（`route` に入れるので、以降の特徴はルートと同じ回避規則で自動的に避ける）。谷の長さ `canyonGapMin` 22 ＋ rng × `canyonGapRange` 8。位置は `[z0 + 40, z1 - 40 - gap]`。
- ランプ: 通常のルート入口ランプ（小、`-re`）は置かず、代わりに `${index}-cr` として RAMP_BIG（長さ 18、高さ 6）を幅 `canyonRampWidth` 10、x 0、z = gap の z0 − RAMP_BIG.length − 1 に置く（ランプ終端が谷の縁）。既存の「ルートの前 150 m は落差・大ランプを置かない」規則はそのまま適用。
- コイン: 谷の上に弧状の列（`${index}-cc${k}`、x 0、z0 から z1 まで 3 m 間隔、lift は sin の弧で最大 `canyonCoinLift` 5）。既存の高台コイン・柱コインは canyon では生成しない。
- 高さ: `routeHeight` はそのまま（入口は 1 m で −6 へ落ちる崖、出口 12 m で 0 へ戻る）。
- ワイプアウト（physics.ts）: 谷に落ちたとき、solid なレーンが無ければ `s.z = route.z1 + 2`、x はそのまま、`y = heightAt`、`vx = 0`、`vz = wipeoutSpeed`、スタン、`wipeoutCount++`（向こう岸に這い上がる。手前に戻すと再挑戦の速度が足りず無限に落ちる）。
- テスト: 出現条件、レーン 1 本で幅いっぱい、ランプの位置と幅、コイン列、谷でのワイプアウトが z1 + 2 に出る（既存の fake route track を流用）。

## 3. 連続ジャンプ台（stairs）

- `stairsChance` 0.2、`stairsMinZ` 400、ルートもスライダーも canyon も無い区間に、専用 rng `^ 0x6a09e667`。RAMP_SMALL を `stairsCount` 3 個、`stairsSpacing` 28 m 間隔、幅 `stairsRampWidth` 8、x 0、id `${index}-rs${k}`。先頭は `[z0 + 30, z1 - 30 - 2×spacing - length]` に置く。落差・パイプと重なるなら置かない（既存の free ramp と同じ判定）。通常のランプ配列に入れるので、既存のアーチコイン・障害物回避がそのまま効く。free ramp の目標数からは `stairsCount` を引く。
- テスト: 3 本が等間隔で同じ x・幅、ルート/スライダー/canyon と共存しない。

## 4. 確認

- `npx tsc --noEmit -p .`、`npx vitest run --pool=forks`。
- ヘッドレス Chrome で canyon（手前と谷の上）、stairs、砂漠のカーブを撮る。
