# OAuth 2.0 / Keycloak 実装 - クイックリファレンス

## 📁 ドキュメント構成

1. **完全実装計画書** (65KB)
   - `/volume2/Project/MCD3/TUMON/mc-gate/docs/oauth-keycloak-implementation-plan.md`
   - 詳細な実装手順、コード例、設計思想

2. **エグゼクティブサマリー** (13KB)
   - `/volume2/Project/MCD3/TUMON/mc-gate/docs/oauth-implementation-summary.md`
   - 概要、主要コード、チェックリスト

3. **クイックリファレンス** (このファイル)
   - `/volume2/Project/MCD3/TUMON/mc-gate/docs/oauth-quick-reference.md`
   - コマンド、設定値、トラブルシューティング

---

## 🚀 実装手順（簡易版）

### ステップ1: パッケージ追加（5分）

```bash
cd /volume2/Project/MCD3/TUMON/mc-gate/apps/mobile
pnpm add jwt-decode
pnpm add -D @types/jwt-decode
```

### ステップ2: ファイル作成（2時間）

```bash
# サービスディレクトリ作成
mkdir -p src/services

# 新規ファイル作成
touch src/services/auth.ts
touch src/services/tokenStorage.ts
touch src/services/tokenRefresh.ts
touch src/utils/tokenValidator.ts
touch src/hooks/useAuth.ts
```

**実装内容**: 完全実装計画書の「3.1 新規作成ファイル」セクション参照

### ステップ3: 既存ファイル修正（1時間）

修正対象:
- `src/app/index.tsx` - モックトークン削除
- `src/store/appStore.ts` - User型拡張
- `packages/api-client/src/client.ts` - トークンリフレッシュ

### ステップ4: Keycloak設定（30分）

```bash
# Keycloak管理コンソール
http://192.168.1.4:8080/auth/admin

# 1. Realm作成: mcd3
# 2. Client作成: mc-gate-mobile
# 3. テストユーザー作成: testuser / password123
```

### ステップ5: 動作確認（1時間）

```bash
cd /volume2/Project/MCD3/TUMON/mc-gate/apps/mobile
pnpm start
```

### ステップ6: 本番ビルド（30分）

```bash
export ENV=production
npx eas-cli build --platform android --profile production --non-interactive
```

---

## 🔑 Keycloak設定値

### Realm設定

| 項目 | 値 |
|-----|---|
| Realm名 | `mcd3` |
| 表示名 | `MCD3 通門管理` |

### Client設定

| 項目 | 値 |
|-----|---|
| Client ID | `mc-gate-mobile` |
| Client Protocol | `openid-connect` |
| Access Type | `public` |
| Standard Flow Enabled | ON |
| Direct Access Grants Enabled | OFF |
| Valid Redirect URIs | `mcgate://auth`, `exp://*`, `http://localhost:8081/*` |
| Web Origins | `*` |
| PKCE Code Challenge Method | `S256` |

### トークン設定

| 項目 | 値 |
|-----|---|
| Access Token Lifespan | `5 minutes` |
| SSO Session Idle | `30 minutes` |
| SSO Session Max | `10 hours` |
| Refresh Token Max Reuse | `0` (ローテーション) |

### テストユーザー

| 項目 | 値 |
|-----|---|
| Username | `testuser` |
| Email | `testuser@example.com` |
| Password | `password123` |
| Email Verified | ON |
| Role | `gate-operator` |

---

## 📝 環境変数設定

### 開発環境 (eas.json)

```json
{
  "build": {
    "development": {
      "env": {
        "ENV": "development",
        "MOCK_AUTH": "true",
        "AUTH_ISSUER": "http://192.168.1.4:8080/auth/realms/mcd3",
        "AUTH_AUDIENCE": "mc-gate",
        "AUTH_CLIENT_ID": "mc-gate-mobile"
      }
    }
  }
}
```

### 本番環境 (eas.json)

```json
{
  "build": {
    "production": {
      "env": {
        "ENV": "production",
        "MOCK_AUTH": "false",
        "AUTH_ISSUER": "https://auth.production.example.com/auth/realms/mcd3",
        "AUTH_AUDIENCE": "mc-gate",
        "AUTH_CLIENT_ID": "mc-gate-mobile"
      }
    }
  }
}
```

---

## 🧪 テストコマンド

### 開発環境でテスト

```bash
# モック認証使用
export MOCK_AUTH=true
pnpm start

# OAuth認証使用
export MOCK_AUTH=false
pnpm start
```

### Keycloak接続確認

```bash
# Discovery endpoint確認
curl http://192.168.1.4:8080/auth/realms/mcd3/.well-known/openid-configuration

# 期待される出力:
# {
#   "issuer": "http://192.168.1.4:8080/auth/realms/mcd3",
#   "authorization_endpoint": "http://192.168.1.4:8080/auth/realms/mcd3/protocol/openid-connect/auth",
#   "token_endpoint": "http://192.168.1.4:8080/auth/realms/mcd3/protocol/openid-connect/token",
#   ...
# }
```

### トークン取得テスト（curl）

```bash
# Authorization Codeフローのテスト（手動）

# 1. ブラウザでアクセス
open "http://192.168.1.4:8080/auth/realms/mcd3/protocol/openid-connect/auth?client_id=mc-gate-mobile&redirect_uri=mcgate://auth&response_type=code&scope=openid%20profile%20email"

# 2. ログイン後、リダイレクトURLからcodeを取得
# mcgate://auth?code=abc123...

# 3. Code → Token交換
curl -X POST http://192.168.1.4:8080/auth/realms/mcd3/protocol/openid-connect/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code" \
  -d "client_id=mc-gate-mobile" \
  -d "code=abc123..." \
  -d "redirect_uri=mcgate://auth"
```

---

## 🐛 トラブルシューティング

### 問題1: ログイン画面でエラー「認証サーバーに接続できません」

**原因**: Keycloakサーバーが起動していない、またはネットワークエラー

**解決策**:
```bash
# Keycloakサーバー起動確認
curl http://192.168.1.4:8080/auth

# Discovery endpoint確認
curl http://192.168.1.4:8080/auth/realms/mcd3/.well-known/openid-configuration
```

### 問題2: リダイレクト後に「Invalid redirect_uri」エラー

**原因**: Keycloak ClientのValid Redirect URIsが正しく設定されていない

**解決策**:
1. Keycloak管理コンソールでClientを開く
2. Valid Redirect URIsに以下を追加:
   - `mcgate://auth`
   - `exp://*`
   - `http://localhost:8081/*`

### 問題3: トークンリフレッシュが失敗する

**原因**: リフレッシュトークンが期限切れ、または無効

**解決策**:
```typescript
// ログを確認
console.log("Refresh token:", tokens.refreshToken);
console.log("Expires at:", new Date(tokens.expiresAt));

// リフレッシュトークン期限切れの場合は再ログイン
if (refreshError.code === "invalid_grant") {
  await clearTokens();
  router.replace("/");
}
```

### 問題4: アプリ起動時に「Token decode failed」エラー

**原因**: 保存されたトークンが不正、またはjwt-decodeがインストールされていない

**解決策**:
```bash
# jwt-decodeインストール確認
pnpm list jwt-decode

# インストールされていない場合
pnpm add jwt-decode

# トークンをクリア
# アプリの設定画面から「ログアウト」を実行
```

### 問題5: PKCE検証エラー「code_verifier is required」

**原因**: expo-auth-sessionのバージョンが古い、またはPKCE設定が不正

**解決策**:
```bash
# expo-auth-sessionを最新に更新
pnpm add expo-auth-session@latest

# AuthRequestでPKCEを有効化
const authRequest = new AuthSession.AuthRequest({
  clientId,
  scopes,
  redirectUri,
  responseType: AuthSession.ResponseType.Code,
  usePKCE: true, // ✅ 必須
});
```

---

## 📊 チェックリスト

### 事前確認

- [ ] Keycloakサーバーが起動している
- [ ] Discovery endpointにアクセスできる
- [ ] app.config.tsにauth設定がある
- [ ] expo-auth-session, expo-secure-store がインストール済み

### 実装完了確認

- [ ] jwt-decode パッケージ追加済み
- [ ] auth.ts, tokenStorage.ts, tokenRefresh.ts 作成済み
- [ ] index.tsx でモックトークン削除済み
- [ ] Keycloak Realm, Client設定完了
- [ ] テストユーザー作成済み

### 動作確認

- [ ] ログインボタンをタップするとKeycloakログイン画面が開く
- [ ] テストユーザーでログイン成功
- [ ] アプリにリダイレクト後、ホーム画面が表示される
- [ ] トークンがSecureStoreに保存されている
- [ ] 5分後、トークンが自動リフレッシュされる
- [ ] ログアウトでトークンが削除される

### セキュリティ確認

- [ ] モックトークンが完全に削除されている
- [ ] 本番環境ではHTTPSが強制されている
- [ ] トークンがSecureStoreに保存されている
- [ ] リフレッシュトークンローテーションが有効

---

## 🔗 関連ファイルパス

### 実装対象ファイル

```
/volume2/Project/MCD3/TUMON/mc-gate/
├── apps/mobile/
│   ├── src/
│   │   ├── app/index.tsx                    # ログイン画面（修正）
│   │   ├── store/appStore.ts                # 認証ストア（修正）
│   │   ├── services/
│   │   │   ├── auth.ts                      # OAuth認証（新規）
│   │   │   ├── tokenStorage.ts             # トークン保存（新規）
│   │   │   └── tokenRefresh.ts             # トークンリフレッシュ（新規）
│   │   ├── utils/
│   │   │   └── tokenValidator.ts           # JWT検証（新規）
│   │   └── hooks/
│   │       └── useAuth.ts                   # 認証フック（新規）
│   ├── app.config.ts                        # Keycloak設定（確認）
│   └── package.json                         # 依存関係（確認）
├── packages/api-client/src/client.ts        # APIクライアント（修正）
└── docs/
    ├── oauth-keycloak-implementation-plan.md  # 完全実装計画書
    ├── oauth-implementation-summary.md        # エグゼクティブサマリー
    └── oauth-quick-reference.md               # クイックリファレンス
```

### 既存設定ファイル

- Keycloak設定: `/volume2/Project/MCD3/TUMON/mc-gate/apps/mobile/app.config.ts:99-103`
- モックトークン: `/volume2/Project/MCD3/TUMON/mc-gate/apps/mobile/src/app/index.tsx:33`
- Bearer認証: `/volume2/Project/MCD3/TUMON/mc-gate/packages/api-client/src/client.ts:97`

---

## 📚 参考リンク

### 公式ドキュメント

- [Expo Auth Session](https://docs.expo.dev/versions/latest/sdk/auth-session/)
- [Expo Secure Store](https://docs.expo.dev/versions/latest/sdk/securestore/)
- [Keycloak Documentation](https://www.keycloak.org/documentation)
- [OAuth 2.0 RFC 6749](https://tools.ietf.org/html/rfc6749)
- [PKCE RFC 7636](https://tools.ietf.org/html/rfc7636)

### チュートリアル

- [Expo Auth Session with Keycloak](https://docs.expo.dev/guides/authentication/#keycloak)
- [OAuth 2.0 for Mobile Apps](https://oauth.net/2/native-apps/)

---

## ⚡ 高速実装ガイド（経験者向け）

### 1. パッケージ追加

```bash
cd /volume2/Project/MCD3/TUMON/mc-gate/apps/mobile && pnpm add jwt-decode
```

### 2. ファイルコピー（完全実装計画書から）

以下のセクションのコードをコピー:
- 1.2 expo-auth-session 実装方針 → `src/services/auth.ts`
- 2.1 トークン保存 → `src/services/tokenStorage.ts`
- 2.2 トークンリフレッシュロジック → `src/services/tokenRefresh.ts`
- 2.3 トークン検証 → `src/utils/tokenValidator.ts`
- 3.1 新規作成ファイル - 5. 認証フック → `src/hooks/useAuth.ts`

### 3. 既存ファイル修正

- `src/app/index.tsx` - 3.2修正ファイル - 1のコードに置き換え
- `packages/api-client/src/client.ts` - 3.2修正ファイル - 3の変更を適用

### 4. Keycloak設定（5分）

Realm作成 → Client作成 → テストユーザー作成

### 5. テスト

```bash
pnpm start
```

**合計時間**: 1時間（コピペ + 設定のみ）

---

## 🎯 次のステップ

1. **完全実装計画書を読む**
   - `/volume2/Project/MCD3/TUMON/mc-gate/docs/oauth-keycloak-implementation-plan.md`
   - 詳細な設計思想、エラーハンドリング、テスト計画

2. **パッケージ追加**
   ```bash
   pnpm add jwt-decode
   ```

3. **実装開始**
   - auth.ts から順に実装

4. **動作確認**
   - 開発環境でテスト

5. **本番デプロイ**
   - eas.json設定 → ビルド → 配信

---

**作成日**: 2025-11-18
**最終更新**: 2025-11-18
**作成者**: Claude Code
