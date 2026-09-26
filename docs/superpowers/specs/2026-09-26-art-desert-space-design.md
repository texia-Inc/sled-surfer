# アートパス＋砂漠・宇宙ゾーン 設計書

日付: 2026-09-26。本家の Instagram 映像（夕焼けの砂丘、細い高架スライダー、宇宙のガラス管、氷のポータル）との見た目の差を埋める。routes 設計書（2026-09-21）への追加。

## 1. ゾーン

- `ZONES` に追加: `desert`（砂漠, z0 4000, surface `'sand'`, obstacleKinds `['cactus','rock','crate']`, iceChance 0.15, boostChance 0.8, bumpScale 0.8, obstacleDensityMul 0.9）、`space`（宇宙, z0 5000, surface `'ice'`, obstacleKinds `['asteroid','satellite','crate']`, iceChance 0, boostChance 0.9, bumpScale 0.6, obstacleDensityMul 0.8）。
- `ZoneDef.pipeChanceMul`（既定 1、space 2.5、desert 0.5）と `ZoneDef.cliffs: boolean`（desert/space は false）。`ZONE_GOALS` に 5000, 6000 を追加。
- `Surface` に `'sand'` を追加。摩擦は雪と同じ（physics の既定分岐）。
- 障害物: `cactus`（hard, r 0.6）、`asteroid`（hard, r 1.0）、`satellite`（breakable, r 0.9）。
- 装飾: `dune`（砂漠、両岸 |x| 50〜140、高さ 10〜30、1 セグメントに片側 2〜3）、`pyramid`（砂漠、片側 40% で 1 つ、|x| 60〜90、高さ 20〜35）。宇宙は装飾なし（崖も出さない）。

## 2. スライダー区間（core）

- `Slider = { z0, z1, width: 6, yOffset: 3 }`、`Segment.slider: Slider | null`、`Track.sliderAt(z)`（`TrackQuery` では optional）。
- 出現: z ≥ 800、砂漠・宇宙は確率 0.6、他は 0.15。長さ 80〜140 m、セグメント両端 20 m 以上内側。ルート区間・パイプ・落差・ランプと重ならない（ルート区間の直後に生成し、他の特徴はスライダー範囲を避ける。専用 rng ストリーム）。
- `widthAt(z)`: 区間内は通常幅から `width` へ 20 m の smoothstep で絞り、出口 20 m で戻す。
- `heightAt(z, x)`: |x| ≤ width/2 + 1 のとき `yOffset` を同じ 20 m ブレンドで加算。それより外は 3 m かけて 0 へ落とす（高架に見せる）。
- スライダー上にはコインを 3 m 間隔で中央に並べ、入口 25 m 地点に幅いっぱいのブーストパッド。障害物・バンプ・氷帯は置かない。
- 物理の変更なし（既存の x クランプが `widthAt` を使うので落ちない）。

## 3. 空（render/sky.ts）

- カメラ追従の半径 360 の球（BackSide、ShaderMaterial、fog 無効、depthWrite 無効）。`scene.background` は使わない。
- ユニフォーム: zenith / horizon / ground 色、sunDir、sunColor、sunSize、cloudAmount、stars、planet、time。
- フラグメント: 高さで 3 色グラデーション。太陽は円盤＋グロー。雲は fbm ノイズを水平線付近にマスク（cloudAmount）。星は方向ハッシュを閾値で点にし time で瞬く（stars）。惑星（宇宙）は `planetDir`（下前方）から半径 0.75 rad の円盤: 海の青＋fbm の大陸＋渦巻く雲＋縁の大気グロー（planet）。
- `SkyTheme` を `zoneTheme.ts` に追加（ゾーンごと）。main.ts で routes と同じ 60 m ブレンド（色は lerp、スカラーも lerp）で毎フレーム更新。
  - snowfield: zenith 0x3f8fd8, horizon 0xbfe3f7, sun 高め白、雲 0.5。forest: 似た配色、雲 0.6。city: 白灰。cave: zenith 0x05070f, horizon 0x1a2238, 星 0.6, 雲 0。volcano: 紫〜橙の夕焼け、雲 0.4。desert: zenith 0x3a5a9a, horizon 0xffb347、太陽は低く大きく橙、雲 0.35。space: 全て黒〜紺、星 1.0、planet 1.0、太陽なし。

## 4. 地面（render/terrain.ts, render/textures.ts）

- ゾーンごとの 256² タイルテクスチャ（CanvasTexture, RepeatWrapping, プロシージャル）: 雪は淡い斑点、道路は粒、砂は風紋（sin 縞＋ノイズ）、火山は暗い砂利、宇宙は氷の筋。UV は (worldX/8, worldZ/8)。マテリアルはゾーン別 Lambert（map × vertexColors）。遠景メッシュは無地のまま。
- テーマ色: desert ground (0.93,0.78,0.45)、ice (0.88,0.82,0.62)、bank (0.82,0.58,0.28)、fog 0xf2b46a near 80 far 340、gate 0xffc857。space ground (0.82,0.90,1.0)、ice (0.75,0.88,1.0)、bank (0.02,0.03,0.08)、fog 0x0a0d1f near 140 far 380、gate 0x9ad8ff。

## 5. 小物（render/props.ts）

- 崖: 箱の積み重ねをやめ、6 角錐（半径 width/2、高さ scale、頂点を z 由来の疑似乱数で揺らす）＋上 30% に白い雪冠の小さい錐。火山は雪冠なし。
- 砂丘: 潰した球（幅 60〜120、高さ scale、奥行 40）、砂の濃い色。ピラミッド: 4 角錐を 45° 回転、砂岩色。
- サボテン: 円柱 3 本（幹＋腕 2）。小惑星: 12 面体の頂点を揺らす、灰色。人工衛星: 箱＋青いパネル 2 枚。
- ポータル門: 半径 7 の輪に氷色の箱 16 個、内側に次ゾーンの gate 色の半透明円盤（opacity 0.35）、上にゾーン名。全ゾーンの門を置き換える。
- スライダーの縁: 両端 x=±width/2 に地面＋0.5 m の高さで黒い管（TubeGeometry、半径 0.35）。宇宙のパイプ: 半透明の氷色シリンダー（半径 width/2、中心 y = 床＋半径、opacity 0.25、depthWrite 無効）。

## 6. プレイヤー（render/player.ts）

- ソリを赤い浮き輪（Torus 半径 0.9、管 0.32）にし、中にペンギン: 体（黒、球 0.42 を縦 1.15 倍）、腹（白）、頭（球 0.3）、目（白 2 点）、くちばし（橙の錐）、ヒレ 2 枚（黒い薄い箱、斜め）、足 2 つ（橙の薄い箱、前）。
- 宙返りは滞空 0.5 s 後から（`rotation.x = max(0, airTime − 0.5) × FLIP_RATE`）。発射直後は回らない。

## 7. テスト

- zones: `zoneAt(4000).id === 'desert'`, `zoneAt(5000).id === 'space'`, `nextGoal(4500) === 5000`。
- track: スライダーの出現範囲と長さ、`widthAt` が区間中央で 6、`heightAt` が区間中央で通常＋3 かつ |x| = 8 で通常、ルート・パイプ・落差と重ならない、スライダー上に障害物なし、決定論テストが通る。
- render はスクリーンショットで確認（headless Chrome）。
