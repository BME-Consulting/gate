# OAuth 2.0 / Keycloak ログイン実装計画 - エグゼクティブサマリー

## 概要

mc-gateモバイルアプリに**OAuth 2.0 / Keycloak認証**を実装し、開発用モックトークンを削除して本番環境で使用可能にするための実装計画。

**完全な実装計画書**: `/volume2/Project/MCD3/TUMON/mc-gate/docs/oauth-keycloak-implementation-plan.md`

---

## 現在の問題点

### 1. セキュリティリスク

```typescript
// apps/mobile/src/app/index.tsx:33
login({
  id: "user-1",
  name: username,
  token: "development-api-key-12345", // ❌ ハードコードされた固定トークン
});
```

- ハードコードされたモックトークン使用中
- 本番環境では使用不可
- セキュリティリスク

### 2. 既存の良い点

✅ **app.config.ts**にKeycloak設定あり:
```typescript
auth: {
  issuer: "http://192.168.1.4:8080/auth/realms/mcd3",
  clientId: "mc-gate-mobile",
  audience: "mc-gate",
}
```

✅ **必要なパッケージ既にインストール済み**:
- `expo-auth-session: ~7.0.0`
- `expo-secure-store: ~14.0.0`
- `expo-crypto: ~14.0.1`

✅ **Bearer認証ヘッダー実装済み**:
```typescript
Authorization: `Bearer ${request.token}`
```

---

## 実装アプローチ

### Authorization Code Flow with PKCE

**選定理由**:
- モバイルアプリに最適（Client Secretが不要）
- PKCE（Proof Key for Code Exchange）で中間者攻撃を防止
- OAuth 2.0 Best Current Practice推奨

### フロー図

```
Mobile App → Keycloak Login → Code → Token → SecureStore
```

---

## 実装ステップ（6フェーズ）

### フェーズ1: パッケージ追加（5分）

```bash
cd /volume2/Project/MCD3/TUMON/mc-gate/apps/mobile
pnpm add jwt-decode
pnpm add -D @types/jwt-decode
```

### フェーズ2: サービス実装（2時間）

新規作成ファイル:
1. `src/services/auth.ts` - OAuth認証フロー
2. `src/services/tokenStorage.ts` - トークン保存/取得
3. `src/services/tokenRefresh.ts` - 自動リフレッシュ
4. `src/utils/tokenValidator.ts` - JWT検証
5. `src/hooks/useAuth.ts` - React Hooks

### フェーズ3: 既存コード修正（1時間）

修正ファイル:
1. `src/app/index.tsx` - モックトークン削除、OAuth実装
2. `src/store/appStore.ts` - User型拡張
3. `packages/api-client/src/client.ts` - トークンリフレッシュ

### フェーズ4: Keycloak設定（30分）

1. Realm `mcd3` 作成
2. Client `mc-gate-mobile` 作成
3. PKCE有効化
4. Redirect URIs設定: `mcgate://auth`, `exp://*`
5. テストユーザー作成
6. ロール設定

### フェーズ5: 動作確認（1時間）

1. 開発環境でOAuth認証テスト
2. トークンリフレッシュ確認
3. ログアウトテスト
4. エラーケース確認

### フェーズ6: 本番環境設定（30分）

1. HTTPS URLに切り替え
2. 環境変数設定（eas.json）
3. 本番ビルド作成

**合計所要時間**: 約5時間

---

## 主要コード例

### 1. OAuth認証（expo-auth-session）

```typescript
// apps/mobile/src/services/auth.ts

import * as AuthSession from "expo-auth-session";

export async function loginWithKeycloak() {
  // 1. Discovery endpoint取得
  const discovery = await AuthSession.fetchDiscoveryAsync(issuer);

  // 2. Authorization Request
  const authRequest = new AuthSession.AuthRequest({
    clientId,
    scopes: ["openid", "profile", "email"],
    redirectUri: AuthSession.makeRedirectUri({ scheme: "mcgate", path: "auth" }),
    responseType: AuthSession.ResponseType.Code,
    usePKCE: true, // ✅ PKCE有効化
  });

  // 3. ログインプロンプト表示
  const authResult = await authRequest.promptAsync(discovery);

  // 4. Code → Token交換
  const tokenResult = await AuthSession.exchangeCodeAsync(
    {
      clientId,
      code: authResult.params.code,
      redirectUri,
      extraParams: { code_verifier: authRequest.codeVerifier },
    },
    discovery
  );

  return tokenResult; // { accessToken, refreshToken, idToken, expiresIn }
}
```

### 2. トークン保存（expo-secure-store）

```typescript
// apps/mobile/src/services/tokenStorage.ts

import * as SecureStore from "expo-secure-store";

export async function saveTokens(tokens: {
  accessToken: string;
  refreshToken: string;
  idToken: string;
  expiresIn: number;
  userId: string;
  userName: string;
}) {
  const expiresAt = Date.now() + tokens.expiresIn * 1000;

  await Promise.all([
    SecureStore.setItemAsync("auth_access_token", tokens.accessToken),
    SecureStore.setItemAsync("auth_refresh_token", tokens.refreshToken),
    SecureStore.setItemAsync("auth_id_token", tokens.idToken),
    SecureStore.setItemAsync("auth_expires_at", String(expiresAt)),
    SecureStore.setItemAsync("auth_user_id", tokens.userId),
    SecureStore.setItemAsync("auth_user_name", tokens.userName),
  ]);
}

export async function loadTokens() {
  const [accessToken, refreshToken, idToken, expiresAt, userId, userName] =
    await Promise.all([
      SecureStore.getItemAsync("auth_access_token"),
      SecureStore.getItemAsync("auth_refresh_token"),
      SecureStore.getItemAsync("auth_id_token"),
      SecureStore.getItemAsync("auth_expires_at"),
      SecureStore.getItemAsync("auth_user_id"),
      SecureStore.getItemAsync("auth_user_name"),
    ]);

  if (!accessToken || !refreshToken) return null;

  return {
    accessToken,
    refreshToken,
    idToken: idToken || "",
    expiresAt: Number(expiresAt),
    userId: userId!,
    userName: userName || "User",
  };
}
```

### 3. トークンリフレッシュ

```typescript
// apps/mobile/src/services/tokenRefresh.ts

import * as AuthSession from "expo-auth-session";

export async function refreshAccessToken(): Promise<string | null> {
  const tokens = await loadTokens();
  if (!tokens?.refreshToken) return null;

  const discovery = await AuthSession.fetchDiscoveryAsync(issuer);

  const tokenResult = await AuthSession.refreshAsync(
    {
      clientId,
      refreshToken: tokens.refreshToken,
    },
    discovery
  );

  if (tokenResult.accessToken) {
    await updateAccessToken(tokenResult.accessToken, tokenResult.expiresIn || 3600);
    return tokenResult.accessToken;
  }

  return null;
}

export async function getValidAccessToken(): Promise<string | null> {
  const tokens = await loadTokens();
  if (!tokens) return null;

  // 期限切れ間近（5分以内）なら自動リフレッシュ
  if (isTokenExpiringSoon(tokens.expiresAt)) {
    return await refreshAccessToken();
  }

  return tokens.accessToken;
}
```

### 4. ログイン画面修正

```typescript
// apps/mobile/src/app/index.tsx

import { useAuth } from "../hooks/useAuth";

export default function LoginScreen() {
  const { login: handleOAuthLogin } = useAuth();
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);

    try {
      const result = await handleOAuthLogin();

      if (result.success) {
        router.replace("/(tabs)/home");
      } else {
        Alert.alert("ログイン失敗", result.error);
      }
    } catch (error) {
      Alert.alert("エラー", error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>MCD3 通門管理</Text>
      <Button
        title="Keycloakでログイン"
        onPress={handleLogin}
        loading={loading}
        fullWidth
      />
    </View>
  );
}
```

---

## セキュリティ対策

### 1. HTTPS強制（実装済み）

```typescript
// app.config.ts (lines 16-44)
if (isProduction && apiBaseGs.startsWith("http://")) {
  throw new Error("Production requires HTTPS");
}
```

### 2. トークン盗難対策

✅ **Secure Storage**: expo-secure-storeで暗号化保存
✅ **リフレッシュトークンローテーション**: Keycloak設定
✅ **トークンの短命化**: アクセストークン5分、リフレッシュトークン30分

### 3. PKCE（Proof Key for Code Exchange）

```typescript
usePKCE: true, // Code Verifier/Challengeで中間者攻撃を防止
```

---

## Keycloak設定要件

### Realm設定

- **Realm名**: `mcd3`
- **Client ID**: `mc-gate-mobile`
- **Client Type**: `public`（モバイルアプリ）
- **PKCE**: 有効（S256）
- **Redirect URIs**:
  - `mcgate://auth`（本番）
  - `exp://*`（開発）

### ロール設定

- `gate-operator` - ゲート操作者
- `project-admin` - プロジェクト管理者
- `project-viewer` - 閲覧者

---

## テスト計画

### 単体テスト

- [ ] トークン検証ロジック（jwt-decode）
- [ ] トークンストレージ（SecureStore）
- [ ] トークンリフレッシュ

### 統合テスト

- [ ] ログインフロー（成功）
- [ ] ログインフロー（キャンセル）
- [ ] トークン期限切れ時の自動リフレッシュ
- [ ] ログアウト

### 動作確認

- [ ] 開発環境でOAuth認証成功
- [ ] トークンが正しく保存される
- [ ] トークンリフレッシュが動作
- [ ] ログアウトでトークンが削除される

---

## 移行戦略

### 段階的移行（3フェーズ）

#### フェーズ1: 開発環境（モックと併用）

```typescript
const USE_MOCK_AUTH = __DEV__ && process.env.MOCK_AUTH === "true";
```

```bash
export MOCK_AUTH=true  # モック使用
export MOCK_AUTH=false # OAuth使用
```

#### フェーズ2: プレビュー環境（OAuth必須）

```bash
npx eas-cli build --platform android --profile preview
```

#### フェーズ3: 本番環境（OAuth必須）

```bash
export ENV=production
npx eas-cli build --platform android --profile production
```

---

## エラーハンドリング

### 主要エラーパターン

| エラーコード | メッセージ | 対応 |
|------------|-----------|------|
| `dismissed` | ログインがキャンセルされました | ログイン画面に戻る |
| `network_error` | ネットワーク接続に失敗しました | 再試行を促す |
| `server_down` | 認証サーバーに接続できません | しばらく待ってから再試行 |
| `invalid_grant` | ユーザー名またはパスワードが正しくありません | 再入力を促す |
| `UNAUTHORIZED` | セッションが期限切れです | 再ログインを促す |

---

## 実装完了チェックリスト

### パッケージ
- [ ] `jwt-decode` インストール済み

### ファイル作成
- [ ] `src/services/auth.ts`
- [ ] `src/services/tokenStorage.ts`
- [ ] `src/services/tokenRefresh.ts`
- [ ] `src/utils/tokenValidator.ts`
- [ ] `src/hooks/useAuth.ts`

### ファイル修正
- [ ] `src/app/index.tsx` - モックトークン削除
- [ ] `src/store/appStore.ts` - User型拡張
- [ ] `packages/api-client/src/client.ts` - トークンリフレッシュ

### Keycloak設定
- [ ] Realm `mcd3` 作成
- [ ] Client `mc-gate-mobile` 作成
- [ ] PKCE有効化
- [ ] Redirect URIs設定
- [ ] テストユーザー作成
- [ ] ロール設定

### テスト
- [ ] 単体テスト実装
- [ ] 統合テスト完了
- [ ] 開発環境でOAuth認証成功
- [ ] トークンリフレッシュ動作確認
- [ ] ログアウト動作確認

### セキュリティ
- [ ] HTTPS強制確認
- [ ] トークンがSecureStoreに保存
- [ ] モックトークン完全削除
- [ ] 本番環境設定確認

---

## 次のアクション

### 今すぐ開始できる作業

1. **パッケージ追加**（5分）
   ```bash
   cd /volume2/Project/MCD3/TUMON/mc-gate/apps/mobile
   pnpm add jwt-decode
   ```

2. **サービスファイル作成**（2時間）
   - auth.ts
   - tokenStorage.ts
   - tokenRefresh.ts
   - tokenValidator.ts
   - useAuth.ts

3. **Keycloak設定**（30分）
   - Realm作成
   - Client作成
   - テストユーザー作成

### 依存関係

- **Keycloak設定**は並行作業可能
- **サービス実装**完了後に既存コード修正
- **既存コード修正**完了後に動作確認

---

## リソース

### ドキュメント
- **完全な実装計画書**: `/volume2/Project/MCD3/TUMON/mc-gate/docs/oauth-keycloak-implementation-plan.md`
- **CLAUDE.md**: `/volume2/Project/MCD3/TUMON/mc-gate/CLAUDE.md` - セキュリティ要件

### 参考リンク
- [Expo Auth Session](https://docs.expo.dev/versions/latest/sdk/auth-session/)
- [Keycloak Documentation](https://www.keycloak.org/documentation)
- [OAuth 2.0 RFC 6749](https://tools.ietf.org/html/rfc6749)
- [PKCE RFC 7636](https://tools.ietf.org/html/rfc7636)

---

## まとめ

**実装時間**: 約5時間
**セキュリティレベル**: ⭐⭐⭐⭐⭐ (OAuth 2.0 + PKCE + Secure Storage)
**複雑度**: 中（expo-auth-sessionで簡略化）
**リスク**: 低（段階的移行で対応）

**推奨開始日**: 即日可能

---

**作成日**: 2025-11-18
**最終更新**: 2025-11-18
**作成者**: Claude Code
