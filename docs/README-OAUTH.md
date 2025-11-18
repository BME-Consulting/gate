# OAuth 2.0 / Keycloak ログイン実装 - ドキュメント索引

このディレクトリには、mc-gateモバイルアプリにOAuth 2.0 / Keycloak認証を実装するための包括的なドキュメントが含まれています。

---

## 📚 ドキュメント一覧

### 1. 完全実装計画書（65KB）

**ファイル**: `oauth-keycloak-implementation-plan.md`

**対象読者**: 実装担当者、アーキテクト

**内容**:
- OAuth 2.0フロー設計（Authorization Code Flow with PKCE）
- トークン管理設計（保存、リフレッシュ、検証）
- 実装ファイル構成（新規作成 + 修正）
- Keycloak設定手順
- セキュリティ実装
- 実装ステップ（6フェーズ）
- テスト計画
- 移行計画
- エラーハンドリング
- UX設計

**特徴**:
- 実装可能な詳細コード例を多数掲載
- expo-auth-sessionの具体的な実装コード
- 完全なエラーハンドリング戦略
- セキュリティベストプラクティス

**読了時間**: 30分

---

### 2. エグゼクティブサマリー（13KB）

**ファイル**: `oauth-implementation-summary.md`

**対象読者**: プロジェクトマネージャー、意思決定者、実装担当者

**内容**:
- 概要と現在の問題点
- 実装アプローチ
- 実装ステップ（簡易版）
- 主要コード例
- セキュリティ対策
- Keycloak設定要件
- テスト計画
- 移行戦略
- 実装完了チェックリスト

**特徴**:
- 高レベルの概要
- 主要コードのハイライト
- 所要時間の見積もり
- リスク評価

**読了時間**: 10分

---

### 3. クイックリファレンス（12KB）

**ファイル**: `oauth-quick-reference.md`

**対象読者**: 実装担当者（実装中/トラブルシューティング時）

**内容**:
- 実装手順（簡易版）
- Keycloak設定値一覧
- 環境変数設定
- テストコマンド
- トラブルシューティング
- チェックリスト
- 関連ファイルパス
- 高速実装ガイド

**特徴**:
- コマンドのコピペ用
- 設定値の一覧表
- よくある問題と解決策
- 経験者向け高速実装ガイド

**読了時間**: 5分

---

## 🚀 最初に読むべきドキュメント

### シナリオ別推奨順序

#### 1. プロジェクトの概要を把握したい

```
1. README-OAUTH.md（このファイル）
2. oauth-implementation-summary.md
```

#### 2. 実装を開始する

```
1. oauth-implementation-summary.md（全体像把握）
2. oauth-keycloak-implementation-plan.md（詳細実装）
3. oauth-quick-reference.md（実装中の参照用）
```

#### 3. トラブルシューティング

```
1. oauth-quick-reference.md（トラブルシューティングセクション）
2. oauth-keycloak-implementation-plan.md（エラーハンドリングセクション）
```

#### 4. 経験者が最速で実装したい

```
1. oauth-quick-reference.md（高速実装ガイド）
2. oauth-keycloak-implementation-plan.md（コードコピー用）
```

---

## 📊 実装概要

### 目的

mc-gateモバイルアプリにOAuth 2.0 / Keycloak認証を実装し、開発用モックトークンを削除して本番環境で使用可能にする。

### 現在の問題

```typescript
// apps/mobile/src/app/index.tsx:33
login({
  id: "user-1",
  name: username,
  token: "development-api-key-12345", // ❌ ハードコードされたモックトークン
});
```

### 解決策

**Authorization Code Flow with PKCE** を使用したOAuth 2.0認証

```
Mobile App → Keycloak Login → Authorization Code → Token Exchange → SecureStore
```

### 実装時間

**合計**: 約5時間

| フェーズ | 所要時間 |
|---------|---------|
| パッケージ追加 | 5分 |
| サービス実装 | 2時間 |
| 既存コード修正 | 1時間 |
| Keycloak設定 | 30分 |
| 動作確認 | 1時間 |
| 本番環境設定 | 30分 |

**経験者向け高速実装**: 約1時間（コピペ + 設定のみ）

---

## 🔑 主要技術スタック

### 使用パッケージ

- `expo-auth-session` - OAuth認証フロー
- `expo-secure-store` - トークン暗号化保存
- `expo-crypto` - PKCE生成
- `jwt-decode` - JWT検証（追加が必要）

### セキュリティ機能

✅ **PKCE（Proof Key for Code Exchange）**: 中間者攻撃防止
✅ **Secure Storage**: トークン暗号化保存（Android Keystore / iOS Keychain）
✅ **リフレッシュトークンローテーション**: トークン盗難対策
✅ **トークンの短命化**: アクセストークン5分、リフレッシュトークン30分
✅ **HTTPS強制**: 本番環境でHTTP通信を拒否

---

## 📝 実装チェックリスト

### 事前準備

- [ ] Keycloakサーバーが起動している（http://192.168.1.4:8080）
- [ ] app.config.tsにauth設定がある
- [ ] expo-auth-session, expo-secure-store がインストール済み

### 実装作業

- [ ] `jwt-decode` パッケージ追加
- [ ] サービスファイル作成（auth.ts, tokenStorage.ts, tokenRefresh.ts）
- [ ] ユーティリティファイル作成（tokenValidator.ts）
- [ ] フック作成（useAuth.ts）
- [ ] ログイン画面修正（モックトークン削除）
- [ ] APIクライアント修正（トークンリフレッシュ）

### Keycloak設定

- [ ] Realm `mcd3` 作成
- [ ] Client `mc-gate-mobile` 作成
- [ ] PKCE有効化（S256）
- [ ] Redirect URIs設定（`mcgate://auth`, `exp://*`）
- [ ] テストユーザー作成（testuser / password123）
- [ ] ロール設定（gate-operator）

### 動作確認

- [ ] 開発環境でOAuth認証成功
- [ ] トークンがSecureStoreに保存される
- [ ] トークンリフレッシュが動作
- [ ] ログアウトでトークンが削除される
- [ ] エラーハンドリングが適切

### 本番準備

- [ ] HTTPS URLに切り替え
- [ ] 環境変数設定（eas.json）
- [ ] モックトークン完全削除
- [ ] セキュリティチェック完了

---

## 🎯 次のアクション

### 今すぐ開始できる作業

#### 1. ドキュメントを読む（10分）

```bash
cd /volume2/Project/MCD3/TUMON/mc-gate/docs
cat oauth-implementation-summary.md
```

#### 2. パッケージを追加（5分）

```bash
cd /volume2/Project/MCD3/TUMON/mc-gate/apps/mobile
pnpm add jwt-decode
pnpm add -D @types/jwt-decode
```

#### 3. Keycloak設定を開始（30分）

```
ブラウザで http://192.168.1.4:8080/auth/admin を開く
Realm `mcd3` を作成
Client `mc-gate-mobile` を作成
```

#### 4. 実装を開始（2時間）

完全実装計画書の「3.1 新規作成ファイル」セクションを参照してコードを実装

---

## 📞 サポート

### 実装中に問題が発生した場合

1. **クイックリファレンス**の「トラブルシューティング」セクションを確認
2. **完全実装計画書**の「エラーハンドリング」セクションを確認
3. CLAUDE.mdに記載されているセキュリティ要件を確認

### よくある質問

#### Q1: 既存のモックトークンを残したまま実装できますか？

**A**: はい、段階的移行が可能です。`USE_MOCK_AUTH`フラグで切り替えられます。

```typescript
const USE_MOCK_AUTH = __DEV__ && process.env.MOCK_AUTH === "true";
```

詳細は「8.1 段階的移行」セクション参照。

#### Q2: Keycloakの代わりに他のOAuthプロバイダー（Auth0, Okta等）は使えますか？

**A**: はい、expo-auth-sessionはOIDC準拠のプロバイダーをサポートしています。issuer URLを変更するだけです。

#### Q3: トークンリフレッシュはいつ実行されますか？

**A**: アクセストークンの期限が5分以内になると自動的に実行されます。`getValidAccessToken()`が内部で判定します。

#### Q4: オフラインでもアプリは動作しますか？

**A**: トークンが有効な間は動作します。期限切れの場合は再ログインが必要です。オフライン対応は別途実装が必要です。

---

## 🔗 関連ドキュメント

### プロジェクト内

- `/volume2/Project/MCD3/TUMON/mc-gate/CLAUDE.md` - セキュリティ要件
- `/volume2/Project/MCD3/TUMON/mc-gate/apps/mobile/app.config.ts` - Keycloak設定
- `/volume2/Project/MCD3/TUMON/mc-gate/apps/mobile/src/app/index.tsx` - ログイン画面

### 外部リンク

- [Expo Auth Session Documentation](https://docs.expo.dev/versions/latest/sdk/auth-session/)
- [Keycloak Documentation](https://www.keycloak.org/documentation)
- [OAuth 2.0 RFC 6749](https://tools.ietf.org/html/rfc6749)
- [PKCE RFC 7636](https://tools.ietf.org/html/rfc7636)
- [OAuth 2.0 for Native Apps (Best Current Practice)](https://tools.ietf.org/html/rfc8252)

---

## 📄 ライセンス

このドキュメントは mc-gate プロジェクトの一部です。

---

## 📅 更新履歴

| 日付 | バージョン | 変更内容 |
|------|----------|---------|
| 2025-11-18 | 1.0.0 | 初版作成 |

---

**作成日**: 2025-11-18
**最終更新**: 2025-11-18
**作成者**: Claude Code
**メンテナー**: mc-gate開発チーム
