// ==========================================
// OAuth 2.0 / Keycloak Authentication Service
// ==========================================

import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import Constants from "expo-constants";

// WebBrowserの完了ハンドリングを有効化（iOS）
WebBrowser.maybeCompleteAuthSession();

export interface TokenResult {
  accessToken: string;
  refreshToken: string;
  idToken?: string;
  expiresIn: number;
  tokenType: string;
}

interface AuthConfig {
  issuer: string;
  clientId: string;
  audience: string;
}

// app.config.tsから認証設定を取得
function getAuthConfig(): AuthConfig {
  const { auth } = Constants.expoConfig?.extra || {};

  if (!auth?.issuer || !auth?.clientId || !auth?.audience) {
    throw new Error(
      "Auth configuration is missing. Please check app.config.ts extra.auth settings."
    );
  }

  return {
    issuer: auth.issuer,
    clientId: auth.clientId,
    audience: auth.audience,
  };
}

/**
 * Keycloakでログインし、OAuthトークンを取得
 */
export async function loginWithKeycloak(): Promise<TokenResult> {
  const config = getAuthConfig();

  try {
    // Discovery documentを取得
    const discovery = await AuthSession.fetchDiscoveryAsync(config.issuer);

    // リダイレクトURIを生成
    const redirectUri = AuthSession.makeRedirectUri({
      scheme: "mcgate",
      path: "auth",
    });

    // 認証リクエストを作成
    const request = new AuthSession.AuthRequest({
      clientId: config.clientId,
      scopes: ["openid", "profile", "email"],
      redirectUri,
      extraParams: {
        audience: config.audience,
      },
    });

    // 認証フローを実行
    const result = await request.promptAsync(discovery);

    if (result.type !== "success") {
      throw new Error(
        result.type === "cancel"
          ? "ログインがキャンセルされました"
          : "認証に失敗しました"
      );
    }

    // 認証コードをトークンに交換
    const tokenResult = await AuthSession.exchangeCodeAsync(
      {
        clientId: config.clientId,
        code: result.params.code,
        redirectUri,
        extraParams: {
          code_verifier: request.codeVerifier || "",
        },
      },
      discovery
    );

    return {
      accessToken: tokenResult.accessToken,
      refreshToken: tokenResult.refreshToken || "",
      idToken: tokenResult.idToken,
      expiresIn: tokenResult.expiresIn || 3600,
      tokenType: tokenResult.tokenType || "Bearer",
    };
  } catch (error) {
    console.error("OAuth login failed:", error);
    throw error;
  }
}

/**
 * トークンをリフレッシュ
 */
export async function refreshAccessToken(
  refreshToken: string
): Promise<TokenResult> {
  const config = getAuthConfig();

  try {
    const discovery = await AuthSession.fetchDiscoveryAsync(config.issuer);

    const tokenResult = await AuthSession.refreshAsync(
      {
        clientId: config.clientId,
        refreshToken,
      },
      discovery
    );

    return {
      accessToken: tokenResult.accessToken,
      refreshToken: tokenResult.refreshToken || refreshToken,
      idToken: tokenResult.idToken,
      expiresIn: tokenResult.expiresIn || 3600,
      tokenType: tokenResult.tokenType || "Bearer",
    };
  } catch (error) {
    console.error("Token refresh failed:", error);
    throw error;
  }
}

/**
 * ログアウト（Keycloakセッションを終了）
 */
export async function logout(idToken?: string): Promise<void> {
  const config = getAuthConfig();

  try {
    if (idToken) {
      // Keycloakのログアウトエンドポイントを呼び出し
      const logoutUrl = `${config.issuer}/protocol/openid-connect/logout?id_token_hint=${idToken}`;
      await WebBrowser.openBrowserAsync(logoutUrl);
    }
  } catch (error) {
    console.error("Logout failed:", error);
    // ログアウトエラーは無視（ローカルトークンは削除される）
  }
}
