# Pull Request

## 📋 変更内容

<!-- 何を変更したか、なぜ変更したかを簡潔に記述 -->

## 🔍 SSOT準拠チェック（必須）

**本PRは以下のSSOTドキュメントに準拠していますか？**

- [ ] [SSOT_WORKER_SYNC_FACE_AUTH_E2E.md](../SSOT_WORKER_SYNC_FACE_AUTH_E2E.md) - E2Eテスト結果の真実
- [ ] [PREVIEW_TO_PRODUCTION_DIFF.md](../PREVIEW_TO_PRODUCTION_DIFF.md) - 環境差分の設計図
- [ ] [DEVELOPMENT_RULES.md](../DEVELOPMENT_RULES.md) - 開発ルール（8項目）

**SSOTとの整合性**:
- [ ] このPRはSSOTに記録された仕様と矛盾しない
- [ ] SSOTに影響する変更の場合、SSOTを更新した（追記のみ、削除禁止）
- [ ] 新しいE2Eテストを実施した場合、結果をSSOTに記録した

## 🛡️ セキュリティチェック

- [ ] APIキー・シークレットのハードコードなし
- [ ] 開発用fallbackに環境判定あり（`__DEV__` or `APP_ENV`）
- [ ] 本番環境で `useMockAuth` が強制的に `false`
- [ ] 403でログアウトしていない（401のみ）

## 🎨 UI/UXチェック（該当する場合）

- [ ] 表示専用Overlay に `pointerEvents="none"` 設定
- [ ] `Camera` コンポーネントは自己完結型タグ
- [ ] オーバーレイは `StyleSheet.absoluteFillObject` で配置

## 🔧 TypeScript型安全性チェック

- [ ] API Keyに `|| {}` や `|| null` を使っていない
- [ ] SQLite `runAsync()` のパラメータに `undefined` が混入しない
- [ ] 環境変数の読み込みで型ガードあり

## 🧪 テスト

- [ ] 手動テスト完了（実機/シミュレーター）
- [ ] 既存機能に影響なし
- [ ] 新機能の場合、E2Eテスト実施済み

## 📝 本番移行への影響（該当する場合）

**このPRは本番環境に影響しますか？**
- [ ] はい → [PREVIEW_TO_PRODUCTION_DIFF.md](../PREVIEW_TO_PRODUCTION_DIFF.md) の該当項目を確認済み
- [ ] いいえ → preview環境のみの変更

**影響する項目**（該当する場合のみ記入）:
- [ ] API Endpoints 変更
- [ ] API Keys 変更
- [ ] Security Settings 変更
- [ ] ネイティブコード変更（新しいビルドが必要）

## 🔗 関連Issue/PR

<!-- 関連するIssueやPRがあれば記載 -->

## 📸 スクリーンショット/動画（UI変更の場合）

<!-- Before/Afterのスクリーンショットを添付 -->

---

## ⚠️ レビュアーへの注意事項

**Production移行はこの3文書に従ってください**:
1. `SSOT_WORKER_SYNC_FACE_AUTH_E2E.md` - 唯一の真実
2. `PREVIEW_TO_PRODUCTION_DIFF.md` - 環境差分の完全な設計図
3. `DEVELOPMENT_RULES.md` - 再利用可能なベストプラクティス

**これらのドキュメントと矛盾する実装は、本番で必ず失敗します。**
