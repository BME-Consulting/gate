# OAuth 2.0 / Keycloak ログイン実装計画書

## 目次

1. [概要](#概要)
2. [現在の状況分析](#現在の状況分析)
3. [OAuth 2.0フロー設計](#oauth-20フロー設計)
4. [トークン管理設計](#トークン管理設計)
5. [実装ファイル構成](#実装ファイル構成)
6. [Keycloak設定](#keycloak設定)
7. [セキュリティ実装](#セキュリティ実装)
8. [実装ステップ](#実装ステップ)
9. [テスト計画](#テスト計画)
10. [移行計画](#移行計画)
11. [エラーハンドリング](#エラーハンドリング)
12. [UX設計](#ux設計)

---

## 概要

### 目的
mc-gateモバイルアプリにOAuth 2.0 / Keycloakログインを実装し、開発用モックトークンを削除して本番環境で使用可能にする。

### スコープ
- Authorization Code Flow with PKCE実装
- expo-auth-sessionを使用したOAuth認証
- トークンのセキュアストレージ保存
- 自動トークンリフレッシュ
- Keycloak連携設定

---

## 現在の状況分析

### 既存コードの問題点

#### 1. モックトークン使用（`/volume2/Project/MCD3/TUMON/mc-gate/apps/mobile/src/app/index.tsx:33`）

```typescript
// SECURITY: Remove mock token before production - implement OAuth flow
login({
  id: "user-1",
  name: username,
  token: "development-api-key-12345", // Development API key (matches server auth)
});
```

**問題**:
- ハードコードされた固定トークン
- 本番環境では使用不可
- セキュリティリスク

#### 2. 既存の設定（`/volume2/Project/MCD3/TUMON/mc-gate/apps/mobile/app.config.ts`）

**良い点**:
- Keycloak設定が既に存在（lines 99-103）
- HTTPS強制ロジックあり（lines 16-44）
- 環境別設定の基盤あり

```typescript
auth: {
  issuer: authIssuer,  // "http://192.168.1.4:8080/auth/realms/mcd3"
  audience: process.env.AUTH_AUDIENCE || "mc-gate",
  clientId: process.env.AUTH_CLIENT_ID || "mc-gate-mobile",
}
```

**改善が必要**:
- 開発用HTTPアドレスが設定されている
- 本番用HTTPS URLへの切り替えが必要

#### 3. 認証ストア（`/volume2/Project/MCD3/TUMON/mc-gate/apps/mobile/src/store/appStore.ts`）

**良い点**:
- Zustandでシンプルな状態管理
- Userインターフェース定義済み（lines 8-12）

```typescript
interface User {
  id: string;
  name: string;
  token: string;
}
```

**改善が必要**:
- リフレッシュトークン保存フィールドがない
- トークン有効期限フィールドがない
- IDトークン保存フィールドがない

#### 4. APIクライアント（`/volume2/Project/MCD3/TUMON/mc-gate/packages/api-client/src/client.ts`）

**良い点**:
- Bearer認証ヘッダー実装済み（line 97）

```typescript
Authorization: `Bearer ${request.token}`,
```

**改善が必要**:
- トークンリフレッシュロジックがない
- 401エラー時の再認証フローがない

#### 5. 依存パッケージ

**既にインストール済み**:
- `expo-auth-session: ~7.0.0` - OAuth認証に使用
- `expo-secure-store: ~14.0.0` - トークン保存に使用
- `expo-crypto: ~14.0.1` - PKCE生成に使用

**追加が必要**:
- `jwt-decode` - トークン検証用

---

## OAuth 2.0フロー設計

### 1.1 Authorization Code Flow with PKCE

**選定理由**:
- モバイルアプリに最適（Client Secretが不要）
- PKCE（Proof Key for Code Exchange）で中間者攻撃を防止
- OAuth 2.0 Best Current Practice推奨

**フロー図**:

```
┌──────────┐                                  ┌──────────┐
│  Mobile  │                                  │ Keycloak │
│   App    │                                  │  Server  │
└────┬─────┘                                  └────┬─────┘
     │                                             │
     │ 1. Generate code_verifier & code_challenge │
     │    (PKCE)                                   │
     │                                             │
     │ 2. Authorization Request                    │
     │────────────────────────────────────────────>│
     │    - client_id                              │
     │    - redirect_uri                           │
     │    - scope                                  │
     │    - state                                  │
     │    - code_challenge                         │
     │                                             │
     │                                      3. User Login
     │                                      & Consent
     │                                             │
     │ 4. Authorization Code (redirect)            │
     │<────────────────────────────────────────────│
     │    - code                                   │
     │    - state                                  │
     │                                             │
     │ 5. Token Request                            │
     │────────────────────────────────────────────>│
     │    - code                                   │
     │    - code_verifier                          │
     │    - redirect_uri                           │
     │                                             │
     │ 6. Token Response                           │
     │<────────────────────────────────────────────│
     │    - access_token                           │
     │    - refresh_token                          │
     │    - id_token                               │
     │    - expires_in                             │
     │                                             │
     │ 7. Store tokens in SecureStore              │
     │                                             │
     │ 8. API Request with Bearer token            │
     │────────────────────────────────────────────>│
     │                                             │
```

### 1.2 expo-auth-session 実装方針

#### 基本実装コード

```typescript
// apps/mobile/src/services/auth.ts

import * as AuthSession from "expo-auth-session";
import * as Crypto from "expo-crypto";
import Constants from "expo-constants";

const config = Constants.expoConfig?.extra?.auth;

if (!config?.issuer || !config?.clientId) {
  throw new Error("Auth configuration is missing in app.config.ts");
}

const issuer = config.issuer;
const clientId = config.clientId;
const scopes = ["openid", "profile", "email"];

/**
 * Keycloak OAuth認証フロー
 */
export async function loginWithKeycloak(): Promise<{
  accessToken: string;
  refreshToken: string;
  idToken: string;
  expiresIn: number;
  userId: string;
  userName: string;
}> {
  // 1. Discovery endpoint から設定を取得
  const discovery = await AuthSession.fetchDiscoveryAsync(issuer);

  // 2. Redirect URIを生成
  const redirectUri = AuthSession.makeRedirectUri({
    scheme: "mcgate",
    path: "auth",
  });

  console.log("Redirect URI:", redirectUri);

  // 3. Authorization Request
  const authRequest = new AuthSession.AuthRequest({
    clientId,
    scopes,
    redirectUri,
    responseType: AuthSession.ResponseType.Code,
    usePKCE: true, // PKCE有効化
    extraParams: {
      // Keycloak固有のパラメータ（必要に応じて）
      kc_idp_hint: "keycloak", // IDPヒント（オプション）
    },
  });

  // 4. Discovery endpoint を使用してリクエストを実行
  const authResult = await authRequest.promptAsync(discovery, {
    useProxy: false, // 本番環境ではfalse
    showInRecents: false,
  });

  if (authResult.type !== "success") {
    throw new Error(`OAuth認証失敗: ${authResult.type}`);
  }

  // 5. Authorization Code を取得
  const { code } = authResult.params;

  if (!code) {
    throw new Error("Authorization code が取得できませんでした");
  }

  // 6. Token Exchange（Code → Token）
  const tokenResult = await AuthSession.exchangeCodeAsync(
    {
      clientId,
      code,
      redirectUri,
      extraParams: {
        code_verifier: authRequest.codeVerifier || "",
      },
    },
    discovery
  );

  // 7. トークンを検証
  if (!tokenResult.accessToken) {
    throw new Error("Access token が取得できませんでした");
  }

  // 8. ID Tokenからユーザー情報を抽出
  const idTokenDecoded = parseIdToken(tokenResult.idToken || "");

  return {
    accessToken: tokenResult.accessToken,
    refreshToken: tokenResult.refreshToken || "",
    idToken: tokenResult.idToken || "",
    expiresIn: tokenResult.expiresIn || 3600,
    userId: idTokenDecoded.sub,
    userName: idTokenDecoded.preferred_username || idTokenDecoded.name || "User",
  };
}

/**
 * ID Tokenをデコード（検証はしない、表示用のみ）
 */
function parseIdToken(idToken: string): any {
  try {
    const base64Payload = idToken.split(".")[1];
    const payload = base64Payload.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = atob(payload);
    return JSON.parse(decoded);
  } catch (error) {
    console.error("ID Token parsing error:", error);
    return {};
  }
}
```

#### Discovery Endpointの例

Keycloak Discovery Endpoint:
```
http://192.168.1.4:8080/auth/realms/mcd3/.well-known/openid-configuration
```

レスポンス例:
```json
{
  "issuer": "http://192.168.1.4:8080/auth/realms/mcd3",
  "authorization_endpoint": "http://192.168.1.4:8080/auth/realms/mcd3/protocol/openid-connect/auth",
  "token_endpoint": "http://192.168.1.4:8080/auth/realms/mcd3/protocol/openid-connect/token",
  "userinfo_endpoint": "http://192.168.1.4:8080/auth/realms/mcd3/protocol/openid-connect/userinfo",
  "end_session_endpoint": "http://192.168.1.4:8080/auth/realms/mcd3/protocol/openid-connect/logout",
  "jwks_uri": "http://192.168.1.4:8080/auth/realms/mcd3/protocol/openid-connect/certs"
}
```

### 1.3 Redirect URI設定

#### app.config.tsでのScheme設定

```typescript
// /volume2/Project/MCD3/TUMON/mc-gate/apps/mobile/app.config.ts

export default ({ config }: ConfigContext): ExpoConfig => ({
  // ...
  scheme: "mcgate", // 既に設定済み
  // ...
});
```

#### Redirect URI形式

**開発環境**:
```
exp://192.168.1.4:8081/--/auth
```

**本番環境**:
```
mcgate://auth
```

**Keycloak設定**:
両方のパターンを登録する必要がある:
- `exp://*`（開発用）
- `mcgate://auth`（本番用）

---

## トークン管理設計

### 2.1 トークン保存

#### expo-secure-store 実装

```typescript
// apps/mobile/src/services/tokenStorage.ts

import * as SecureStore from "expo-secure-store";

const KEYS = {
  ACCESS_TOKEN: "auth_access_token",
  REFRESH_TOKEN: "auth_refresh_token",
  ID_TOKEN: "auth_id_token",
  EXPIRES_AT: "auth_expires_at",
  USER_ID: "auth_user_id",
  USER_NAME: "auth_user_name",
} as const;

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  idToken: string;
  expiresAt: number; // Unix timestamp (ms)
  userId: string;
  userName: string;
}

/**
 * トークンをSecureStoreに保存
 */
export async function saveTokens(tokens: {
  accessToken: string;
  refreshToken: string;
  idToken: string;
  expiresIn: number;
  userId: string;
  userName: string;
}): Promise<void> {
  const expiresAt = Date.now() + tokens.expiresIn * 1000;

  await Promise.all([
    SecureStore.setItemAsync(KEYS.ACCESS_TOKEN, tokens.accessToken),
    SecureStore.setItemAsync(KEYS.REFRESH_TOKEN, tokens.refreshToken),
    SecureStore.setItemAsync(KEYS.ID_TOKEN, tokens.idToken),
    SecureStore.setItemAsync(KEYS.EXPIRES_AT, String(expiresAt)),
    SecureStore.setItemAsync(KEYS.USER_ID, tokens.userId),
    SecureStore.setItemAsync(KEYS.USER_NAME, tokens.userName),
  ]);
}

/**
 * トークンをSecureStoreから取得
 */
export async function loadTokens(): Promise<StoredTokens | null> {
  try {
    const [accessToken, refreshToken, idToken, expiresAt, userId, userName] =
      await Promise.all([
        SecureStore.getItemAsync(KEYS.ACCESS_TOKEN),
        SecureStore.getItemAsync(KEYS.REFRESH_TOKEN),
        SecureStore.getItemAsync(KEYS.ID_TOKEN),
        SecureStore.getItemAsync(KEYS.EXPIRES_AT),
        SecureStore.getItemAsync(KEYS.USER_ID),
        SecureStore.getItemAsync(KEYS.USER_NAME),
      ]);

    if (!accessToken || !refreshToken || !userId) {
      return null;
    }

    return {
      accessToken,
      refreshToken,
      idToken: idToken || "",
      expiresAt: Number(expiresAt) || 0,
      userId,
      userName: userName || "User",
    };
  } catch (error) {
    console.error("Failed to load tokens:", error);
    return null;
  }
}

/**
 * トークンを削除（ログアウト時）
 */
export async function clearTokens(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(KEYS.ACCESS_TOKEN),
    SecureStore.deleteItemAsync(KEYS.REFRESH_TOKEN),
    SecureStore.deleteItemAsync(KEYS.ID_TOKEN),
    SecureStore.deleteItemAsync(KEYS.EXPIRES_AT),
    SecureStore.deleteItemAsync(KEYS.USER_ID),
    SecureStore.deleteItemAsync(KEYS.USER_NAME),
  ]);
}

/**
 * アクセストークンのみ更新
 */
export async function updateAccessToken(
  accessToken: string,
  expiresIn: number
): Promise<void> {
  const expiresAt = Date.now() + expiresIn * 1000;

  await Promise.all([
    SecureStore.setItemAsync(KEYS.ACCESS_TOKEN, accessToken),
    SecureStore.setItemAsync(KEYS.EXPIRES_AT, String(expiresAt)),
  ]);
}
```

### 2.2 トークンリフレッシュロジック

#### 自動リフレッシュ実装

```typescript
// apps/mobile/src/services/tokenRefresh.ts

import * as AuthSession from "expo-auth-session";
import Constants from "expo-constants";
import { loadTokens, updateAccessToken, clearTokens } from "./tokenStorage";

const config = Constants.expoConfig?.extra?.auth;
const issuer = config?.issuer;
const clientId = config?.clientId;

/**
 * トークンの有効期限チェック（5分前にリフレッシュ）
 */
export function isTokenExpiringSoon(expiresAt: number): boolean {
  const bufferTime = 5 * 60 * 1000; // 5分
  return Date.now() + bufferTime >= expiresAt;
}

/**
 * トークンが期限切れかチェック
 */
export function isTokenExpired(expiresAt: number): boolean {
  return Date.now() >= expiresAt;
}

/**
 * リフレッシュトークンでアクセストークンを更新
 */
export async function refreshAccessToken(): Promise<string | null> {
  try {
    // 1. 保存されたトークンを取得
    const tokens = await loadTokens();

    if (!tokens || !tokens.refreshToken) {
      console.warn("No refresh token available");
      return null;
    }

    // 2. Discovery endpoint 取得
    const discovery = await AuthSession.fetchDiscoveryAsync(issuer!);

    // 3. Refresh Token Request
    const tokenResult = await AuthSession.refreshAsync(
      {
        clientId: clientId!,
        refreshToken: tokens.refreshToken,
      },
      discovery
    );

    if (!tokenResult.accessToken) {
      throw new Error("Failed to refresh access token");
    }

    // 4. 新しいアクセストークンを保存
    await updateAccessToken(
      tokenResult.accessToken,
      tokenResult.expiresIn || 3600
    );

    console.log("Access token refreshed successfully");
    return tokenResult.accessToken;
  } catch (error) {
    console.error("Token refresh error:", error);

    // リフレッシュ失敗時はトークンを削除（再ログイン必要）
    await clearTokens();
    return null;
  }
}

/**
 * 有効なアクセストークンを取得（必要なら自動リフレッシュ）
 */
export async function getValidAccessToken(): Promise<string | null> {
  const tokens = await loadTokens();

  if (!tokens) {
    return null;
  }

  // 期限切れの場合
  if (isTokenExpired(tokens.expiresAt)) {
    console.log("Token expired, refreshing...");
    return await refreshAccessToken();
  }

  // 期限切れ間近の場合（5分以内）
  if (isTokenExpiringSoon(tokens.expiresAt)) {
    console.log("Token expiring soon, refreshing...");
    const newToken = await refreshAccessToken();
    return newToken || tokens.accessToken; // リフレッシュ失敗時は古いトークンを返す
  }

  // まだ有効
  return tokens.accessToken;
}
```

### 2.3 トークン検証

#### jwt-decodeを使用した検証

```typescript
// apps/mobile/src/utils/tokenValidator.ts

import jwtDecode from "jwt-decode";

export interface DecodedToken {
  exp: number; // Expiration time (Unix timestamp in seconds)
  iat: number; // Issued at
  sub: string; // Subject (user ID)
  preferred_username?: string;
  name?: string;
  email?: string;
  roles?: string[];
}

/**
 * トークンをデコード
 */
export function decodeToken(token: string): DecodedToken | null {
  try {
    return jwtDecode<DecodedToken>(token);
  } catch (error) {
    console.error("Token decode error:", error);
    return null;
  }
}

/**
 * トークンの有効期限チェック
 */
export function isTokenExpired(token: string): boolean {
  const decoded = decodeToken(token);

  if (!decoded) {
    return true;
  }

  // exp は秒単位、Date.now() はミリ秒単位
  return decoded.exp * 1000 < Date.now();
}

/**
 * トークンの署名検証（オプション、オフライン検証は難しい）
 */
export function validateTokenClaims(token: string): {
  valid: boolean;
  error?: string;
} {
  const decoded = decodeToken(token);

  if (!decoded) {
    return { valid: false, error: "Token decode failed" };
  }

  // 有効期限チェック
  if (isTokenExpired(token)) {
    return { valid: false, error: "Token expired" };
  }

  // issuerチェック（オプション）
  // if (decoded.iss !== expectedIssuer) {
  //   return { valid: false, error: "Invalid issuer" };
  // }

  return { valid: true };
}
```

---

## 実装ファイル構成

### 3.1 新規作成ファイル

#### 1. 認証サービス

**ファイル**: `/volume2/Project/MCD3/TUMON/mc-gate/apps/mobile/src/services/auth.ts`

**責務**:
- OAuth認証フロー実行
- Keycloakとの連携
- ログアウト処理

**エクスポート関数**:
```typescript
export async function loginWithKeycloak(): Promise<AuthTokens>
export async function logoutFromKeycloak(): Promise<void>
```

#### 2. トークンストレージ

**ファイル**: `/volume2/Project/MCD3/TUMON/mc-gate/apps/mobile/src/services/tokenStorage.ts`

**責務**:
- トークンの保存/取得/削除
- SecureStore操作

**エクスポート関数**:
```typescript
export async function saveTokens(tokens: StoredTokens): Promise<void>
export async function loadTokens(): Promise<StoredTokens | null>
export async function clearTokens(): Promise<void>
export async function updateAccessToken(token: string, expiresIn: number): Promise<void>
```

#### 3. トークンリフレッシュ

**ファイル**: `/volume2/Project/MCD3/TUMON/mc-gate/apps/mobile/src/services/tokenRefresh.ts`

**責務**:
- トークンリフレッシュロジック
- 有効期限チェック
- 自動リフレッシュ

**エクスポート関数**:
```typescript
export async function refreshAccessToken(): Promise<string | null>
export async function getValidAccessToken(): Promise<string | null>
export function isTokenExpired(expiresAt: number): boolean
export function isTokenExpiringSoon(expiresAt: number): boolean
```

#### 4. トークン検証

**ファイル**: `/volume2/Project/MCD3/TUMON/mc-gate/apps/mobile/src/utils/tokenValidator.ts`

**責務**:
- JWT検証
- トークンデコード
- クレーム検証

**エクスポート関数**:
```typescript
export function decodeToken(token: string): DecodedToken | null
export function isTokenExpired(token: string): boolean
export function validateTokenClaims(token: string): ValidationResult
```

#### 5. 認証フック

**ファイル**: `/volume2/Project/MCD3/TUMON/mc-gate/apps/mobile/src/hooks/useAuth.ts`

**責務**:
- React Hooksでの認証状態管理
- ログイン/ログアウト操作
- トークン自動リフレッシュ

**実装例**:

```typescript
// apps/mobile/src/hooks/useAuth.ts

import { useState, useEffect } from "react";
import { useAppStore } from "../store/appStore";
import { loginWithKeycloak, logoutFromKeycloak } from "../services/auth";
import { loadTokens, clearTokens } from "../services/tokenStorage";
import { getValidAccessToken } from "../services/tokenRefresh";

export function useAuth() {
  const { user, login, logout, isAuthenticated } = useAppStore();
  const [isLoading, setIsLoading] = useState(true);

  // アプリ起動時: 保存されたトークンを復元
  useEffect(() => {
    (async () => {
      try {
        const tokens = await loadTokens();

        if (tokens) {
          // トークンが有効かチェック
          const validToken = await getValidAccessToken();

          if (validToken) {
            login({
              id: tokens.userId,
              name: tokens.userName,
              token: validToken,
            });
          } else {
            // トークンが無効な場合は削除
            await clearTokens();
          }
        }
      } catch (error) {
        console.error("Failed to restore session:", error);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  // ログイン処理
  const handleLogin = async () => {
    try {
      setIsLoading(true);

      const result = await loginWithKeycloak();

      login({
        id: result.userId,
        name: result.userName,
        token: result.accessToken,
      });

      return { success: true };
    } catch (error: any) {
      console.error("Login error:", error);
      return { success: false, error: error.message };
    } finally {
      setIsLoading(false);
    }
  };

  // ログアウト処理
  const handleLogout = async () => {
    try {
      setIsLoading(true);

      await logoutFromKeycloak();
      await clearTokens();
      logout();

      return { success: true };
    } catch (error: any) {
      console.error("Logout error:", error);
      return { success: false, error: error.message };
    } finally {
      setIsLoading(false);
    }
  };

  // トークン取得（自動リフレッシュ付き）
  const getToken = async (): Promise<string | null> => {
    return await getValidAccessToken();
  };

  return {
    user,
    isAuthenticated,
    isLoading,
    login: handleLogin,
    logout: handleLogout,
    getToken,
  };
}
```

### 3.2 修正ファイル

#### 1. ログイン画面

**ファイル**: `/volume2/Project/MCD3/TUMON/mc-gate/apps/mobile/src/app/index.tsx`

**変更内容**:

```typescript
// Before (lines 20-57)
const handleLogin = async () => {
  if (!username || !password) return;

  setLoading(true);

  // TODO: 実際のログイン処理（モック）
  // SECURITY: Remove mock token before production - implement OAuth flow
  setTimeout(() => {
    const { setCurrentProject } = useAppStore.getState();

    login({
      id: "user-1",
      name: username,
      token: "development-api-key-12345", // Development API key (matches server auth)
    });

    // モックプロジェクト設定
    // ...
  }, 1000);
};

// After
const { login: handleOAuthLogin } = useAuth();

const handleLogin = async () => {
  setLoading(true);

  try {
    const result = await handleOAuthLogin();

    if (result.success) {
      const { setCurrentProject } = useAppStore.getState();

      // プロジェクト設定
      setCurrentProject({
        projectId: DEFAULT_PROJECT_ID,
        name: "東京建設現場A",
        gateMode: "IN",
        checkConfig: {
          ccusIdCheck: false,
          socialInsuranceCheck: false,
          residencyCheck: false,
          ageCheck: false,
          healthCheck: false,
          soleProprietorCheck: false,
        },
        serverLock: false,
      });

      router.replace("/(tabs)/home");
    } else {
      Alert.alert("ログイン失敗", result.error || "認証に失敗しました");
    }
  } catch (error: any) {
    Alert.alert("エラー", error.message || "ログインに失敗しました");
  } finally {
    setLoading(false);
  }
};
```

**UI変更**:

```typescript
// ユーザー名/パスワード入力を削除し、Keycloakログインボタンに置き換え

export default function LoginScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const { login: handleOAuthLogin } = useAuth();

  const handleLogin = async () => {
    // 上記コード
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>MCD3 通門管理</Text>
        <Text style={styles.subtitle}>Keycloakでログイン</Text>

        <View style={styles.form}>
          <Button
            title="Keycloakでログイン"
            onPress={handleLogin}
            loading={loading}
            fullWidth
            size="lg"
            style={styles.button}
          />

          {__DEV__ && (
            <Text style={styles.devNote}>
              開発環境: Keycloak (http://192.168.1.4:8080)
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}
```

#### 2. アプリストア

**ファイル**: `/volume2/Project/MCD3/TUMON/mc-gate/apps/mobile/src/store/appStore.ts`

**変更内容**:

```typescript
// Before
interface User {
  id: string;
  name: string;
  token: string;
}

// After
interface User {
  id: string;
  name: string;
  token: string;
  email?: string; // 追加
  roles?: string[]; // 追加（ロールベースアクセス制御用）
}

// リフレッシュトークンは SecureStore に保存するため、ここには含めない
```

#### 3. APIクライアント

**ファイル**: `/volume2/Project/MCD3/TUMON/mc-gate/packages/api-client/src/client.ts`

**変更内容**:

```typescript
// Before (lines 89-113)
export async function sendScanEventWithTimeout(
  request: SendScanEventRequest,
  apiUrl: string
): Promise<SendScanEventResponse> {
  const response = await fetchWithTimeout(`${apiUrl}/api/events`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${request.token}`,
    },
    body: JSON.stringify(request.scanEvent),
    timeoutMs: TIMEOUT.DEFAULT, // 30秒
  });

  if (!response.ok) {
    throw new ApiError(
      "HTTP_ERROR",
      `HTTP error! status: ${response.status}`,
      response.status
    );
  }

  const result = await response.json();
  return result as SendScanEventResponse;
}

// After
import { getValidAccessToken } from "@mc-gate/mobile/src/services/tokenRefresh"; // パス調整が必要

export async function sendScanEventWithTimeout(
  request: SendScanEventRequest,
  apiUrl: string
): Promise<SendScanEventResponse> {
  // トークンを自動リフレッシュ
  const validToken = await getValidAccessToken();

  if (!validToken) {
    throw new ApiError(
      "UNAUTHORIZED",
      "認証トークンが無効です。再度ログインしてください。",
      401
    );
  }

  const response = await fetchWithTimeout(`${apiUrl}/api/events`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${validToken}`, // 常に有効なトークンを使用
    },
    body: JSON.stringify(request.scanEvent),
    timeoutMs: TIMEOUT.DEFAULT,
  });

  // 401エラー時の処理
  if (response.status === 401) {
    // トークンが無効になった場合は再ログインを促す
    throw new ApiError(
      "UNAUTHORIZED",
      "認証トークンが無効です。再度ログインしてください。",
      401
    );
  }

  if (!response.ok) {
    throw new ApiError(
      "HTTP_ERROR",
      `HTTP error! status: ${response.status}`,
      response.status
    );
  }

  const result = await response.json();
  return result as SendScanEventResponse;
}
```

---

## Keycloak設定

### 4.1 Keycloak Realm設定

#### ステップ1: Realmの作成

1. Keycloak管理コンソールにログイン
   ```
   http://192.168.1.4:8080/auth/admin
   ```

2. 左上の「Add realm」をクリック

3. Realm名を入力: `mcd3`

4. 「Create」をクリック

#### ステップ2: Clientの作成

1. 左メニューから「Clients」をクリック

2. 「Create」をクリック

3. 設定:
   - **Client ID**: `mc-gate-mobile`
   - **Client Protocol**: `openid-connect`
   - **Root URL**: `mcgate://`

4. 「Save」をクリック

#### ステップ3: Client設定

**Access Type**:
- `public` を選択（モバイルアプリはClient Secretを安全に保存できないため）

**Standard Flow Enabled**:
- ✅ ON（Authorization Code Flowを有効化）

**Direct Access Grants Enabled**:
- ❌ OFF（パスワードフローは非推奨）

**Valid Redirect URIs**:
```
mcgate://auth
exp://*
http://localhost:8081/*
```

**Web Origins**:
```
*
```
（本番環境では具体的なオリジンを指定）

**PKCE設定**:

Advanced Settings → Proof Key for Code Exchange Code Challenge Method:
- `S256` を選択（SHA-256を使用）

#### ステップ4: ユーザーの作成

1. 左メニューから「Users」をクリック

2. 「Add user」をクリック

3. 設定:
   - **Username**: `testuser`
   - **Email**: `testuser@example.com`
   - **First Name**: `Test`
   - **Last Name**: `User`
   - **Email Verified**: ON

4. 「Save」をクリック

5. 「Credentials」タブに移動

6. パスワードを設定:
   - **Password**: `password123`
   - **Temporary**: OFF

7. 「Set Password」をクリック

### 4.2 ロールマッピング

#### ステップ1: Roleの作成

1. 左メニューから「Roles」をクリック

2. 「Add Role」をクリック

3. 設定:
   - **Role Name**: `project-admin`
   - **Description**: プロジェクト管理者

4. 「Save」をクリック

5. 同様に以下のロールを作成:
   - `project-viewer`（閲覧者）
   - `gate-operator`（ゲート操作者）

#### ステップ2: ユーザーへのロール割り当て

1. 「Users」→ ユーザーを選択

2. 「Role Mappings」タブに移動

3. 「Available Roles」から `gate-operator` を選択

4. 「Add selected」をクリック

#### ステップ3: Clientスコープ設定（ロールをトークンに含める）

1. 「Client Scopes」→ 「roles」を選択

2. 「Mappers」タブに移動

3. 「Create」をクリック

4. 設定:
   - **Name**: `realm roles`
   - **Mapper Type**: `User Realm Role`
   - **Token Claim Name**: `roles`
   - **Claim JSON Type**: `String`
   - **Add to ID token**: ON
   - **Add to access token**: ON
   - **Add to userinfo**: ON

5. 「Save」をクリック

---

## セキュリティ実装

### 5.1 HTTPS強制

#### app.config.tsでの実装（既に実装済み）

```typescript
// /volume2/Project/MCD3/TUMON/mc-gate/apps/mobile/app.config.ts (lines 16-44)

// HTTPS enforcement for production
if (isProduction) {
  const urls = [
    { name: "API_BASE_GS", value: apiBaseGs },
    { name: "API_BASE_CCUS", value: apiBaseCcus },
    { name: "API_FACE_API", value: apiFaceApi },
    { name: "AUTH_ISSUER", value: authIssuer },
  ];

  const httpUrls = urls.filter(url => url.value.startsWith("http://"));

  if (httpUrls.length > 0) {
    const errorMessage = `
========================================
❌ PRODUCTION BUILD ERROR
========================================

The following environment variables must use HTTPS in production:

${httpUrls.map(url => `  - ${url.name}: ${url.value}`).join("\n")}

Please update your environment variables:
  export ${httpUrls.map(url => url.name).join("\n  export ")}

HTTP is only allowed in development mode (ENV !== "production")
========================================
`;
    throw new Error(errorMessage);
  }
}
```

**追加検証**:

```typescript
// apps/mobile/src/services/auth.ts

const config = Constants.expoConfig?.extra?.auth;

if (!config?.issuer || !config?.clientId) {
  throw new Error("Auth configuration is missing in app.config.ts");
}

// 本番環境ではHTTPSを強制
if (process.env.ENV === "production" && !config.issuer.startsWith("https://")) {
  throw new Error("Production requires HTTPS for auth issuer");
}
```

### 5.2 トークン盗難対策

#### 1. Secure Storage使用（実装済み）

expo-secure-storeを使用してトークンを暗号化保存。

**Android**: Keystore
**iOS**: Keychain

#### 2. リフレッシュトークンローテーション

Keycloak設定:

1. 「Realm Settings」→ 「Tokens」タブ

2. 設定:
   - **SSO Session Idle**: `30 minutes`（セッションアイドルタイムアウト）
   - **SSO Session Max**: `10 hours`（セッション最大時間）
   - **Access Token Lifespan**: `5 minutes`（アクセストークン有効期限）
   - **Refresh Token Max Reuse**: `0`（リフレッシュトークンの再利用禁止）

これにより、リフレッシュトークンは一度使用されると無効化され、新しいリフレッシュトークンが発行される（ローテーション）。

#### 3. デバイスバインディング（推奨、高度な実装）

**概念**:
トークンを特定のデバイスに紐づけて、盗まれても他のデバイスで使用できないようにする。

**実装方法**:
1. デバイス固有IDを取得（expo-device）
2. トークンリクエスト時にデバイスIDを送信
3. サーバー側でトークンとデバイスIDを紐づけて検証

**サーバー側実装が必要**のため、本実装計画では省略。

#### 4. トークンの短命化

- **アクセストークン**: 5分
- **リフレッシュトークン**: 30分アイドル後に失効

### 5.3 入力値検証

#### Redirect URI検証

```typescript
// apps/mobile/src/services/auth.ts

const redirectUri = AuthSession.makeRedirectUri({
  scheme: "mcgate",
  path: "auth",
});

// Redirect URIが正しいスキームかチェック
if (!redirectUri.startsWith("mcgate://") && !redirectUri.startsWith("exp://")) {
  throw new Error(`Invalid redirect URI: ${redirectUri}`);
}
```

#### State検証（CSRF対策）

expo-auth-sessionは自動的にstateパラメータを生成・検証します。

---

## 実装ステップ

### フェーズ1: パッケージ追加

```bash
cd /volume2/Project/MCD3/TUMON/mc-gate/apps/mobile

# jwt-decode を追加（他は既にインストール済み）
pnpm add jwt-decode

# 型定義も追加
pnpm add -D @types/jwt-decode
```

### フェーズ2: サービス実装

#### ステップ1: トークンストレージ

```bash
# ファイル作成
mkdir -p src/services
touch src/services/tokenStorage.ts
```

上記「2.1 トークン保存」のコードを実装。

#### ステップ2: トークン検証

```bash
touch src/utils/tokenValidator.ts
```

上記「2.3 トークン検証」のコードを実装。

#### ステップ3: トークンリフレッシュ

```bash
touch src/services/tokenRefresh.ts
```

上記「2.2 トークンリフレッシュロジック」のコードを実装。

#### ステップ4: 認証サービス

```bash
touch src/services/auth.ts
```

上記「1.2 expo-auth-session 実装方針」のコードを実装。

**ログアウト実装も追加**:

```typescript
// apps/mobile/src/services/auth.ts

/**
 * Keycloakからログアウト
 */
export async function logoutFromKeycloak(): Promise<void> {
  const discovery = await AuthSession.fetchDiscoveryAsync(issuer);

  // End Session Endpoint を呼び出し
  if (discovery.endSessionEndpoint) {
    const tokens = await loadTokens();

    if (tokens?.idToken) {
      const logoutUrl = `${discovery.endSessionEndpoint}?id_token_hint=${tokens.idToken}&post_logout_redirect_uri=${encodeURIComponent("mcgate://auth")}`;

      // ブラウザでログアウトページを開く
      await AuthSession.openAuthSessionAsync(logoutUrl, "mcgate://auth");
    }
  }

  // ローカルのトークンを削除
  await clearTokens();
}
```

#### ステップ5: 認証フック

```bash
touch src/hooks/useAuth.ts
```

上記「3.1 新規作成ファイル - 5. 認証フック」のコードを実装。

### フェーズ3: 既存コード修正

#### ステップ1: ログイン画面修正

```bash
# /volume2/Project/MCD3/TUMON/mc-gate/apps/mobile/src/app/index.tsx
```

上記「3.2 修正ファイル - 1. ログイン画面」のコードに置き換え。

#### ステップ2: APIクライアント修正

```bash
# /volume2/Project/MCD3/TUMON/mc-gate/packages/api-client/src/client.ts
```

上記「3.2 修正ファイル - 3. APIクライアント」のコードに修正。

**注意**: パッケージ間の依存関係を考慮し、`getValidAccessToken`をインポートする方法を調整する必要があります。

**推奨**: `packages/api-client`は汎用的なクライアントなので、トークン取得ロジックを外部から注入する形にする。

```typescript
// packages/api-client/src/client.ts

export async function sendScanEventWithTimeout(
  request: SendScanEventRequest,
  apiUrl: string,
  getToken?: () => Promise<string | null> // トークン取得関数を注入
): Promise<SendScanEventResponse> {
  let token = request.token;

  // トークン取得関数が提供されている場合は使用
  if (getToken) {
    const validToken = await getToken();
    if (!validToken) {
      throw new ApiError(
        "UNAUTHORIZED",
        "認証トークンが無効です。再度ログインしてください。",
        401
      );
    }
    token = validToken;
  }

  const response = await fetchWithTimeout(`${apiUrl}/api/events`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(request.scanEvent),
    timeoutMs: TIMEOUT.DEFAULT,
  });

  // ... 以下同じ
}
```

呼び出し側（モバイルアプリ）で:

```typescript
import { sendScanEventWithTimeout } from "@mc-gate/api-client";
import { getValidAccessToken } from "../services/tokenRefresh";

await sendScanEventWithTimeout(
  { scanEvent, token: "" },
  apiUrl,
  getValidAccessToken // トークン取得関数を渡す
);
```

### フェーズ4: Keycloak設定

上記「4.1 Keycloak Realm設定」と「4.2 ロールマッピング」の手順を実施。

### フェーズ5: 動作確認

#### ステップ1: 開発環境でテスト

```bash
cd /volume2/Project/MCD3/TUMON/mc-gate/apps/mobile

# アプリ起動
pnpm start
```

1. Expoアプリでスキャン
2. ログイン画面で「Keycloakでログイン」をタップ
3. ブラウザが開き、Keycloakログイン画面が表示される
4. テストユーザーでログイン（testuser / password123）
5. アプリにリダイレクト
6. ホーム画面が表示される

#### ステップ2: トークンリフレッシュ確認

1. アプリを5分以上放置
2. 何かアクションを実行（スキャン等）
3. トークンが自動リフレッシュされることを確認

コンソールログ:
```
Token expiring soon, refreshing...
Access token refreshed successfully
```

#### ステップ3: ログアウト確認

1. 設定画面からログアウト
2. Keycloakのログアウトページが表示される
3. ログイン画面に戻る
4. トークンが削除されていることを確認

### フェーズ6: 本番環境設定

#### ステップ1: 環境変数設定

**eas.json**:

```json
{
  "build": {
    "production": {
      "env": {
        "ENV": "production",
        "AUTH_ISSUER": "https://auth.production.example.com/auth/realms/mcd3",
        "AUTH_AUDIENCE": "mc-gate",
        "AUTH_CLIENT_ID": "mc-gate-mobile"
      }
    }
  }
}
```

#### ステップ2: app.config.ts修正

```typescript
const authIssuer = process.env.AUTH_ISSUER || "http://192.168.1.4:8080/auth/realms/mcd3";
```

#### ステップ3: Keycloak本番設定

1. 本番KeycloakサーバーにRealmを作成
2. HTTPSで公開
3. Redirect URIを本番用に更新:
   ```
   mcgate://auth
   https://mc-gate.example.com/auth/callback
   ```

#### ステップ4: ビルド

```bash
export ENV=production
npx eas-cli build --platform android --profile production --non-interactive
```

---

## テスト計画

### 7.1 単体テスト

#### 1. トークン検証ロジック

```typescript
// apps/mobile/src/utils/__tests__/tokenValidator.test.ts

import { decodeToken, isTokenExpired, validateTokenClaims } from "../tokenValidator";

describe("tokenValidator", () => {
  const validToken =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjk5OTk5OTk5OTl9.4Adcj0vt_FwUe8RhxKZ9y7Rz-5UQ8w0Zx9fJ8w0Zx9I";

  const expiredToken =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjE1MTYyMzkwMjJ9.4Adcj0vt_FwUe8RhxKZ9y7Rz-5UQ8w0Zx9fJ8w0Zx9I";

  test("should decode valid token", () => {
    const decoded = decodeToken(validToken);
    expect(decoded).toBeDefined();
    expect(decoded?.sub).toBe("1234567890");
    expect(decoded?.name).toBe("John Doe");
  });

  test("should return null for invalid token", () => {
    const decoded = decodeToken("invalid-token");
    expect(decoded).toBeNull();
  });

  test("should detect expired token", () => {
    expect(isTokenExpired(expiredToken)).toBe(true);
  });

  test("should detect valid token", () => {
    expect(isTokenExpired(validToken)).toBe(false);
  });

  test("should validate token claims", () => {
    const result = validateTokenClaims(validToken);
    expect(result.valid).toBe(true);
  });

  test("should reject expired token", () => {
    const result = validateTokenClaims(expiredToken);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Token expired");
  });
});
```

#### 2. トークンストレージ

```typescript
// apps/mobile/src/services/__tests__/tokenStorage.test.ts

import * as SecureStore from "expo-secure-store";
import { saveTokens, loadTokens, clearTokens } from "../tokenStorage";

jest.mock("expo-secure-store");

describe("tokenStorage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("should save tokens", async () => {
    const tokens = {
      accessToken: "access123",
      refreshToken: "refresh123",
      idToken: "id123",
      expiresIn: 3600,
      userId: "user1",
      userName: "Test User",
    };

    await saveTokens(tokens);

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      "auth_access_token",
      "access123"
    );
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      "auth_refresh_token",
      "refresh123"
    );
  });

  test("should load tokens", async () => {
    (SecureStore.getItemAsync as jest.Mock).mockImplementation((key) => {
      const data: Record<string, string> = {
        auth_access_token: "access123",
        auth_refresh_token: "refresh123",
        auth_id_token: "id123",
        auth_expires_at: String(Date.now() + 3600000),
        auth_user_id: "user1",
        auth_user_name: "Test User",
      };
      return Promise.resolve(data[key]);
    });

    const tokens = await loadTokens();

    expect(tokens).toBeDefined();
    expect(tokens?.accessToken).toBe("access123");
    expect(tokens?.userId).toBe("user1");
  });

  test("should clear tokens", async () => {
    await clearTokens();

    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith("auth_access_token");
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith("auth_refresh_token");
  });
});
```

### 7.2 統合テスト

#### 1. ログインフロー（成功）

**テストケース**:
1. ログイン画面を表示
2. 「Keycloakでログイン」ボタンをタップ
3. ブラウザが開き、Keycloakログイン画面が表示される
4. 有効な認証情報を入力（testuser / password123）
5. アプリにリダイレクト
6. トークンがSecureStoreに保存される
7. ホーム画面が表示される

**期待結果**:
- ✅ ブラウザが正しく開く
- ✅ Keycloakログインが成功
- ✅ アプリにリダイレクト
- ✅ トークンが保存される
- ✅ ホーム画面に遷移

#### 2. ログインフロー（キャンセル）

**テストケース**:
1. ログイン画面を表示
2. 「Keycloakでログイン」ボタンをタップ
3. ブラウザが開く
4. Keycloakログイン画面で「キャンセル」をクリック

**期待結果**:
- ✅ ログイン画面に戻る
- ✅ トークンは保存されない
- ✅ エラーメッセージが表示される（「ログインがキャンセルされました」）

#### 3. ログインフロー（認証エラー）

**テストケース**:
1. ログイン画面を表示
2. 「Keycloakでログイン」ボタンをタップ
3. 無効な認証情報を入力（testuser / wrongpassword）

**期待結果**:
- ✅ Keycloakがエラーメッセージを表示
- ✅ ログイン画面に戻る
- ✅ トークンは保存されない

#### 4. トークン期限切れ時の自動リフレッシュ

**テストケース**:
1. ログインして5分待機
2. API呼び出しを実行（スキャンイベント送信）

**期待結果**:
- ✅ トークンが自動的にリフレッシュされる
- ✅ API呼び出しが成功
- ✅ 新しいアクセストークンが保存される

**デバッグログ**:
```
Token expiring soon, refreshing...
Access token refreshed successfully
Sending scan event with token: eyJhbGc...
```

#### 5. リフレッシュトークン期限切れ

**テストケース**:
1. ログインして30分以上放置（リフレッシュトークン期限切れ）
2. API呼び出しを実行

**期待結果**:
- ✅ リフレッシュ失敗
- ✅ トークンが削除される
- ✅ ログイン画面にリダイレクト
- ✅ 「セッションが期限切れです。再度ログインしてください」エラーメッセージ

---

## 移行計画

### 8.1 段階的移行

#### フェーズ1: 開発環境（モックトークンと併用）

**目的**: OAuth実装を安定させる

**設定**:

```typescript
// apps/mobile/src/app/index.tsx

const USE_MOCK_AUTH = __DEV__ && process.env.MOCK_AUTH === "true";

const handleLogin = async () => {
  setLoading(true);

  if (USE_MOCK_AUTH) {
    // モックログイン（開発用）
    setTimeout(() => {
      login({
        id: "mock-user-1",
        name: "Mock User",
        token: "development-api-key-12345",
      });
      router.replace("/(tabs)/home");
      setLoading(false);
    }, 1000);
  } else {
    // OAuth認証（本番用）
    const result = await handleOAuthLogin();
    // ... 上記コード
  }
};
```

**実行**:

```bash
# モック認証を有効化
export MOCK_AUTH=true
pnpm start

# OAuth認証を有効化
export MOCK_AUTH=false
pnpm start
```

#### フェーズ2: プレビュー環境（OAuth必須）

**目的**: 本番環境に近い環境でテスト

**設定**:

```typescript
// app.config.ts

const isPreview = process.env.PROFILE === "preview";

if (isPreview) {
  // プレビュー環境ではHTTPS必須（開発サーバーを除く）
  if (!authIssuer.startsWith("https://") && !authIssuer.includes("192.168")) {
    throw new Error("Preview environment requires HTTPS for auth");
  }
}
```

**ビルド**:

```bash
export PROFILE=preview
npx eas-cli build --platform android --profile preview --non-interactive
```

#### フェーズ3: 本番環境（OAuth必須）

**目的**: 本番リリース

**設定**:

```typescript
// app.config.ts

if (isProduction) {
  // 本番環境では必ずHTTPS
  if (!authIssuer.startsWith("https://")) {
    throw new Error("Production requires HTTPS for auth");
  }

  // モック認証フラグは無視
  // USE_MOCK_AUTH は常にfalse
}
```

**ビルド**:

```bash
export ENV=production
npx eas-cli build --platform android --profile production --non-interactive
```

### 8.2 フラグ制御

#### 環境変数による制御

**.env.development**:
```bash
ENV=development
MOCK_AUTH=true
AUTH_ISSUER=http://192.168.1.4:8080/auth/realms/mcd3
```

**.env.preview**:
```bash
ENV=preview
MOCK_AUTH=false
AUTH_ISSUER=https://auth.preview.example.com/auth/realms/mcd3
```

**.env.production**:
```bash
ENV=production
MOCK_AUTH=false
AUTH_ISSUER=https://auth.production.example.com/auth/realms/mcd3
```

**注意**: Expo/EASでは`.env`ファイルは自動的にサポートされていないため、`eas.json`で明示的に設定する必要があります。

```json
{
  "build": {
    "development": {
      "env": {
        "ENV": "development",
        "MOCK_AUTH": "true"
      }
    },
    "preview": {
      "env": {
        "ENV": "preview",
        "MOCK_AUTH": "false"
      }
    },
    "production": {
      "env": {
        "ENV": "production",
        "MOCK_AUTH": "false"
      }
    }
  }
}
```

---

## エラーハンドリング

### 9.1 ログイン失敗

#### エラーパターン

1. **ユーザーがキャンセル**
   - エラーコード: `dismissed`
   - メッセージ: ログインがキャンセルされました

2. **ネットワークエラー**
   - エラーコード: `network_error`
   - メッセージ: ネットワーク接続に失敗しました。接続を確認してください。

3. **認証サーバーエラー**
   - エラーコード: `server_error`
   - メッセージ: 認証サーバーでエラーが発生しました。しばらくしてから再試行してください。

4. **無効な認証情報**
   - エラーコード: `invalid_grant`
   - メッセージ: ユーザー名またはパスワードが正しくありません。

#### 実装例

```typescript
// apps/mobile/src/services/auth.ts

export async function loginWithKeycloak(): Promise<AuthTokens> {
  try {
    const authRequest = new AuthSession.AuthRequest(/* ... */);
    const authResult = await authRequest.promptAsync(discovery);

    if (authResult.type === "dismiss") {
      throw new AuthError("dismissed", "ログインがキャンセルされました");
    }

    if (authResult.type === "cancel") {
      throw new AuthError("cancel", "ログインがキャンセルされました");
    }

    if (authResult.type === "error") {
      const errorCode = authResult.params?.error || "unknown";
      const errorDesc = authResult.params?.error_description || "不明なエラー";

      throw new AuthError(errorCode, errorDesc);
    }

    if (authResult.type !== "success") {
      throw new AuthError("unknown", `認証に失敗しました: ${authResult.type}`);
    }

    // ... トークン取得
  } catch (error) {
    if (error instanceof AuthError) {
      throw error;
    }

    // ネットワークエラー
    if (error instanceof TypeError && error.message.includes("Network request failed")) {
      throw new AuthError("network_error", "ネットワーク接続に失敗しました");
    }

    // その他のエラー
    throw new AuthError("unknown", error instanceof Error ? error.message : "不明なエラー");
  }
}

export class AuthError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "AuthError";
  }
}
```

### 9.2 トークン期限切れ

#### 検出と対応

```typescript
// packages/api-client/src/client.ts

export async function sendScanEventWithTimeout(
  request: SendScanEventRequest,
  apiUrl: string,
  getToken?: () => Promise<string | null>
): Promise<SendScanEventResponse> {
  // トークン取得（自動リフレッシュ付き）
  const token = getToken ? await getToken() : request.token;

  if (!token) {
    throw new ApiError(
      "UNAUTHORIZED",
      "認証トークンが無効です。再度ログインしてください。",
      401
    );
  }

  const response = await fetchWithTimeout(/* ... */);

  // 401エラー時
  if (response.status === 401) {
    // トークンリフレッシュを試みる
    if (getToken) {
      const newToken = await getToken();

      if (newToken) {
        // 再試行
        const retryResponse = await fetchWithTimeout(/* newTokenで再実行 */);
        if (retryResponse.ok) {
          return await retryResponse.json();
        }
      }
    }

    // リフレッシュ失敗時は再ログインを促す
    throw new ApiError(
      "UNAUTHORIZED",
      "セッションが期限切れです。再度ログインしてください。",
      401
    );
  }

  // ... 以下同じ
}
```

#### UI側でのハンドリング

```typescript
// apps/mobile/src/hooks/useQueue.ts

try {
  await sendScanEvent(request, apiUrl, getValidAccessToken);
} catch (error) {
  if (error instanceof ApiError && error.code === "UNAUTHORIZED") {
    // 再ログインを促す
    Alert.alert(
      "セッション期限切れ",
      "セッションが期限切れです。再度ログインしてください。",
      [
        {
          text: "ログイン画面へ",
          onPress: () => {
            logout();
            router.replace("/");
          },
        },
      ]
    );
  }
}
```

### 9.3 ネットワークエラー

#### リトライロジック

```typescript
// packages/api-client/src/client.ts

export async function sendScanEventWithRetry(
  request: SendScanEventRequest,
  apiUrl: string,
  getToken?: () => Promise<string | null>,
  maxRetries: number = 3
): Promise<SendScanEventResponse> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await sendScanEventWithTimeout(request, apiUrl, getToken);
    } catch (error) {
      lastError = error as Error;

      // 認証エラーはリトライしない
      if (error instanceof ApiError && error.statusCode === 401) {
        throw error;
      }

      // ネットワークエラーのみリトライ
      if (
        error instanceof ApiError &&
        (error.code === "NETWORK_ERROR" || error.code === "TIMEOUT")
      ) {
        console.log(`Retry attempt ${attempt}/${maxRetries}`);
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt)); // 指数バックオフ
        continue;
      }

      // その他のエラーはリトライしない
      throw error;
    }
  }

  throw lastError || new Error("Max retries exceeded");
}
```

### 9.4 Keycloakサーバーダウン

#### フォールバック

```typescript
// apps/mobile/src/services/auth.ts

export async function loginWithKeycloak(): Promise<AuthTokens> {
  try {
    // Discovery endpoint 取得
    const discovery = await AuthSession.fetchDiscoveryAsync(issuer);

    // ... 認証フロー
  } catch (error) {
    // Discovery endpoint取得失敗 = サーバーダウン
    if (error instanceof TypeError && error.message.includes("Network request failed")) {
      throw new AuthError(
        "server_down",
        "認証サーバーに接続できません。インターネット接続を確認するか、しばらくしてから再試行してください。"
      );
    }

    throw error;
  }
}
```

#### UI側でのハンドリング

```typescript
// apps/mobile/src/app/index.tsx

const handleLogin = async () => {
  setLoading(true);

  try {
    const result = await handleOAuthLogin();
    // ... 成功時の処理
  } catch (error) {
    if (error instanceof AuthError) {
      if (error.code === "server_down") {
        Alert.alert(
          "サーバー接続エラー",
          error.message,
          [
            { text: "再試行", onPress: handleLogin },
            { text: "キャンセル" },
          ]
        );
      } else {
        Alert.alert("ログイン失敗", error.message);
      }
    } else {
      Alert.alert("エラー", "ログインに失敗しました");
    }
  } finally {
    setLoading(false);
  }
};
```

---

## UX設計

### 10.1 ログイン画面デザイン

#### モックアップ

```
┌──────────────────────────────────┐
│                                  │
│       MCD3 通門管理               │
│                                  │
│   Keycloakでログイン              │
│                                  │
│  ┌────────────────────────────┐  │
│  │  Keycloakでログイン         │  │
│  └────────────────────────────┘  │
│                                  │
│  開発環境: Keycloak              │
│  (http://192.168.1.4:8080)      │
│                                  │
└──────────────────────────────────┘
```

#### 実装コード

```typescript
// apps/mobile/src/app/index.tsx

export default function LoginScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const { login: handleOAuthLogin } = useAuth();

  const handleLogin = async () => {
    setLoading(true);

    try {
      const result = await handleOAuthLogin();

      if (result.success) {
        router.replace("/(tabs)/home");
      } else {
        Alert.alert("ログイン失敗", result.error || "認証に失敗しました");
      }
    } catch (error: any) {
      Alert.alert("エラー", error.message || "ログインに失敗しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>MCD3 通門管理</Text>
        <Text style={styles.subtitle}>Keycloakでログイン</Text>

        <View style={styles.form}>
          <Button
            title="Keycloakでログイン"
            onPress={handleLogin}
            loading={loading}
            fullWidth
            size="lg"
            style={styles.button}
          />

          {__DEV__ && (
            <Text style={styles.devNote}>
              開発環境: Keycloak{"\n"}
              (http://192.168.1.4:8080)
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.color.background.default,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    padding: tokens.spacing.xl,
  },
  title: {
    fontSize: tokens.font.size.h1,
    fontWeight: tokens.font.weight.bold,
    color: tokens.color.primary,
    textAlign: "center",
    marginBottom: tokens.spacing.sm,
  },
  subtitle: {
    fontSize: tokens.font.size.lg,
    color: tokens.color.text.secondary,
    textAlign: "center",
    marginBottom: tokens.spacing.xxl,
  },
  form: {
    gap: tokens.spacing.lg,
  },
  button: {
    marginTop: tokens.spacing.md,
  },
  devNote: {
    fontSize: tokens.font.size.sm,
    color: tokens.color.text.tertiary,
    textAlign: "center",
    marginTop: tokens.spacing.lg,
  },
});
```

### 10.2 ローディング状態

#### OAuth認証中のローディング

```typescript
<Button
  title={loading ? "ログイン中..." : "Keycloakでログイン"}
  onPress={handleLogin}
  loading={loading}
  disabled={loading}
  fullWidth
  size="lg"
/>
```

#### ブラウザ遷移中のインジケーター

expo-auth-sessionはブラウザ遷移を自動的に処理するため、独自のローディング表示は不要。

**ブラウザが開いている間**: システムのローディングインジケーターが表示される。

### 10.3 エラーメッセージ

#### エラーコード別メッセージ

```typescript
function getErrorMessage(error: AuthError): string {
  switch (error.code) {
    case "dismissed":
    case "cancel":
      return "ログインがキャンセルされました";

    case "network_error":
      return "ネットワーク接続に失敗しました。接続を確認してください。";

    case "server_down":
      return "認証サーバーに接続できません。しばらくしてから再試行してください。";

    case "invalid_grant":
      return "ユーザー名またはパスワードが正しくありません。";

    case "server_error":
      return "認証サーバーでエラーが発生しました。しばらくしてから再試行してください。";

    case "UNAUTHORIZED":
      return "セッションが期限切れです。再度ログインしてください。";

    default:
      return error.message || "ログインに失敗しました";
  }
}

// 使用例
Alert.alert("ログイン失敗", getErrorMessage(error));
```

### 10.4 ログアウトボタン

#### 設定画面にログアウトボタンを追加

```typescript
// apps/mobile/src/app/(tabs)/settings.tsx

import { useAuth } from "../../hooks/useAuth";

export default function SettingsScreen() {
  const { logout, user } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    Alert.alert(
      "ログアウト",
      "ログアウトしますか？",
      [
        { text: "キャンセル", style: "cancel" },
        {
          text: "ログアウト",
          style: "destructive",
          onPress: async () => {
            setLoggingOut(true);
            const result = await logout();
            setLoggingOut(false);

            if (result.success) {
              router.replace("/");
            } else {
              Alert.alert("エラー", "ログアウトに失敗しました");
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      {/* ... 他の設定項目 ... */}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>アカウント</Text>

        <View style={styles.userInfo}>
          <Text style={styles.label}>ユーザー名</Text>
          <Text style={styles.value}>{user?.name || "未ログイン"}</Text>
        </View>

        <View style={styles.userInfo}>
          <Text style={styles.label}>ユーザーID</Text>
          <Text style={styles.value}>{user?.id || "未ログイン"}</Text>
        </View>

        <Button
          title="ログアウト"
          onPress={handleLogout}
          loading={loggingOut}
          variant="danger"
          fullWidth
          style={styles.logoutButton}
        />
      </View>
    </View>
  );
}
```

---

## 実装完了チェックリスト

### パッケージ
- [ ] `jwt-decode` パッケージをインストール済み
- [ ] `expo-auth-session` が最新バージョン
- [ ] `expo-secure-store` が最新バージョン

### ファイル作成
- [ ] `apps/mobile/src/services/auth.ts` 作成済み
- [ ] `apps/mobile/src/services/tokenStorage.ts` 作成済み
- [ ] `apps/mobile/src/services/tokenRefresh.ts` 作成済み
- [ ] `apps/mobile/src/utils/tokenValidator.ts` 作成済み
- [ ] `apps/mobile/src/hooks/useAuth.ts` 作成済み

### ファイル修正
- [ ] `apps/mobile/src/app/index.tsx` 修正済み（モックトークン削除）
- [ ] `apps/mobile/src/store/appStore.ts` 修正済み（User型拡張）
- [ ] `packages/api-client/src/client.ts` 修正済み（トークンリフレッシュ）

### Keycloak設定
- [ ] Realm `mcd3` 作成済み
- [ ] Client `mc-gate-mobile` 作成済み
- [ ] Client設定完了（Public Client、PKCE有効化）
- [ ] Redirect URIs設定済み（`mcgate://auth`, `exp://*`）
- [ ] テストユーザー作成済み
- [ ] ロール作成済み（`gate-operator`, `project-admin`, `project-viewer`）

### テスト
- [ ] 単体テスト実装済み（`tokenValidator`, `tokenStorage`）
- [ ] 統合テスト完了（ログインフロー、トークンリフレッシュ）
- [ ] 開発環境でOAuth認証成功
- [ ] トークンリフレッシュ動作確認
- [ ] ログアウト動作確認

### セキュリティ
- [ ] HTTPS強制ロジック確認済み
- [ ] トークンがSecureStoreに保存されている
- [ ] モックトークン完全削除済み
- [ ] 本番環境設定確認済み

### ドキュメント
- [ ] 実装計画書完成
- [ ] Keycloak設定手順書作成
- [ ] エラーハンドリングガイド作成

---

## まとめ

本実装計画書は、mc-gateモバイルアプリにOAuth 2.0 / Keycloakログインを実装するための詳細なガイドです。

**主要ポイント**:
1. **Authorization Code Flow with PKCE**を使用（モバイルアプリに最適）
2. **expo-auth-session**で簡単にOAuth認証を実装
3. **expo-secure-store**でトークンを安全に保存
4. **自動トークンリフレッシュ**で再ログインを不要に
5. **段階的移行**でリスクを最小化

**次のステップ**:
1. フェーズ1: パッケージ追加（`jwt-decode`）
2. フェーズ2: サービス実装（auth.ts, tokenStorage.ts, tokenRefresh.ts）
3. フェーズ3: 既存コード修正（index.tsx, client.ts）
4. フェーズ4: Keycloak設定
5. フェーズ5: 動作確認
6. フェーズ6: 本番環境設定

**作成日**: 2025-11-18
**バージョン**: 1.0.0
**最終更新**: 2025-11-18
