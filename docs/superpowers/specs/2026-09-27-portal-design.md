# 本物のポータル（ワープ）設計書

日付: 2026-09-27。art 設計書 §5 のリング型の門を、本家と同じ「別の世界への入口」にする。ワープに見える条件は 3 つ: (1) リングの向こうに行き先の世界が見えない、(2) リングの内側にだけ行き先の景色が映る、(3) くぐった瞬間に景色が丸ごと入れ替わる。(3) は portal warp（フラッシュ＋一気の切り替え＋ブースト）で済み。ここで (1)(2) と短いワープ移動を足す。

## 1. 霧の壁（render, src/main.ts）

- 次の門までの距離 `d = gate.z − sled.z` が `PORTAL_FOG_RANGE`（120 m）以内で正のとき、通常のフォグ目標の代わりに `fog.near = d + PORTAL_FOG_NEAR_PAD`（2）、`fog.far = d + PORTAL_FOG_DEPTH`（14）を目標にする（既存の FOG_LERP_RATE 補間はそのまま。ただし門に近づく間は補間率を `PORTAL_FOG_LERP_RATE` 6 に上げ、追従を速くする）。リングまでは鮮明、その先は今いるゾーンの霧色に沈む。空ドームは霧の影響を受けないので、今の空のまま。
- 門を越えたら通常の目標に戻る（既存の補間で開く）。
- 次の門の z は `track.segmentsAround(z)` の `gate` から取る（既存の Gate 型）。

## 2. リングの内側に行き先を映す（src/render/portal.ts 新規、props.ts、main.ts）

- `PortalView` クラス: `WebGLRenderTarget`（`PORTAL_RT_SIZE` 512 × 512、`depthBuffer: true`）、`PerspectiveCamera`（メインカメラと同じ fov/aspect/near/far）、`ScreenTexturePortalMaterial`（ShaderMaterial: 頂点は通常の投影＋ワールドベンド（render/bend.ts の `applyWorldBend` を使うか同じ置換を行う）、フラグメントは `texture2D(tPortal, gl_FragCoord.xy / uResolution)`、fog なし）。
- `render(renderer, scene, mainCamera, sled z, centerAt, sky, fog, timeSec)`: 次の門が前方 `PORTAL_VIEW_RANGE`（150 m）以内にあるときだけ実行。
  1. ポータルカメラ = メインカメラのコピー（quaternion 同じ）。位置はメインカメラを `PORTAL_VIEW_OFFSET`（40 m）だけ前（world −z）へ平行移動し、x にワールドベンド差 `centerAt(gameZ + 40) − centerAt(gameZ)` を足す（gameZ は −camera.z）。
  2. 空を行き先で描く: `sky.update(gate.z + PORTAL_SKY_LOOKAHEAD (60), portalCamera.position, t)`。霧を行き先ゾーンの通常値（`themeAt(gate.z + 1)` の fog 色 / near / far）に一時設定。
  3. プレイヤーのグループ、スピードライン、ポータル円盤自身を `visible = false` にして RT へ描画。
  4. すべて元に戻す（空はメインの `sky.update(z, ...)` を後で呼び直す、霧は保存値に戻す、visible を戻す）。
  - `uResolution` は RT サイズではなく画面の描画バッファサイズ（`renderer.getDrawingBufferSize`）。RT とメイン描画は同じ縦横比なので、RT を画面サイズ比で描く: RT サイズは幅 512、高さ 512 × (h / w)（リサイズ時に更新）。
- props.ts: 門の円盤のマテリアルを `PortalView.material`（共有、1 枚）に差し替える。`disc.name = 'portal-disc'`、`disc.userData.gateZ = gate.z`。ゾーン色の半透明円盤は廃止（ゾーン色はリングの発光縁として残してよい: リングの箱の色をゾーンの gate 色に薄く混ぜる程度、任意）。
- main.ts: フレームループで `renderer.render(scene, camera)` の直前に `portal.render(...)` を呼ぶ。ポータルが範囲外のときは円盤を `visible = false`（内側は空洞に見える）。

## 3. ワープ移動（core）

- `DEFAULT_PHYSICS.warpHop` 24: 門を越えた判定のとき `s.z += warpHop`、`s.y = max(s.y, heightAt(s.z, s.x))`。既存の warpWindow 判定・ブースト・warpCount はそのまま。
- テスト: 既存の「crossing a gate line boosts once」の z 範囲を `600 + warpWindow + warpHop` まで許容し、越えた直後の `s.z ≥ 600 + warpHop − 1` を確認。

## 4. 確認

- `npx tsc --noEmit -p .`、`npx vitest run --pool=forks`。
- ヘッドレス Chrome: 門の 100 m 手前（リングの向こうが霧で隠れ、リングの内側に次ゾーンの景色が見える）、30 m 手前、通過直後（新ゾーン、霧が開いていく）。コンソールにエラーなし。RT 描画の負荷は、門が 150 m 以内のときだけ発生することを確認（`portal.render` の早期 return）。
