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
- `npm run typecheck` で型チェック
- `npm run build` で `dist/` に出力

ゲームループ: 発射→滑走→停止→コイン→強化→再挑戦、ゴール到達で次のゴールが 1.5 倍。

設計: `docs/superpowers/specs/2026-09-19-sled-surfer-browser-design.md`
