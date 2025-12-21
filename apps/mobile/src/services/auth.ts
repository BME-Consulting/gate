// ==========================================
// OAuth 2.0 / Keycloak Authentication Service
// ==========================================

import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import Constants from "expo-constants";
import { ApiError } from "@mc-gate/api-client";

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

  // 開発環境のみフォールバック許可
  const appEnv = Constants.expoConfig?.extra?.appEnv || "development";
  const isDevelopment = appEnv === "development";

  if (!auth?.issuer || !auth?.clientId || !auth?.audience) {
    if (isDevelopment) {
      // 開発環境のみフォールバック値を使用
      const fallbackConfig: AuthConfig = {
        issuer: "http://192.168.1.4:8081/realms/mcd3",
        clientId: "mc-gate-mobile",
        audience: "mc-gate",
      };
      console.warn(
        "[auth.ts] Auth configuration is missing. Using development fallback values."
      );
      return fallbackConfig;
    }

    // 本番/プレビュー環境ではエラー
    throw new Error("認証設定が見つかりません。アプリの再ビルドが必要です。");
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

    // エラーを分類して ApiError として再throw
    if (error instanceof Error) {
      const errorMessage = error.message.toLowerCase();

      // ネットワークエラー
      if (errorMessage.includes("network") || errorMessage.includes("failed to fetch")) {
        throw new ApiError("NETWORK_ERROR", `OAuth server unreachable: ${error.message}`);
      }

      // DNS エラー
      if (errorMessage.includes("dns") || errorMessage.includes("enotfound")) {
        throw new ApiError("DNS_ERROR", `Failed to resolve OAuth issuer: ${error.message}`);
      }

      // TLS/SSL エラー
      if (errorMessage.includes("tls") || errorMessage.includes("ssl") || errorMessage.includes("certificate")) {
        throw new ApiError("TLS_ERROR", `TLS/SSL error during OAuth: ${error.message}`);
      }

      // タイムアウト
      if (errorMessage.includes("timeout") || errorMessage.includes("aborted")) {
        throw new ApiError("TIMEOUT", `OAuth request timeout: ${error.message}`);
      }

      // 認証キャンセル（ユーザー操作）
      if (errorMessage.includes("cancel")) {
        throw error; // キャンセルは ApiError にしない（通常のフロー）
      }
    }

    // その他のエラー
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

    // リフレッシュトークンが無効/期限切れの場合は UNAUTHORIZED
    if (error instanceof Error) {
      const errorMessage = error.message.toLowerCase();

      // 認証エラー（リフレッシュトークン失効）
      if (errorMessage.includes("invalid") || errorMessage.includes("expired") || errorMessage.includes("unauthorized")) {
        throw new ApiError("UNAUTHORIZED", `Refresh token expired or invalid: ${error.message}`);
      }

      // ネットワークエラー
      if (errorMessage.includes("network") || errorMessage.includes("failed to fetch")) {
        throw new ApiError("NETWORK_ERROR", `OAuth server unreachable during refresh: ${error.message}`);
      }

      // タイムアウト
      if (errorMessage.includes("timeout") || errorMessage.includes("aborted")) {
        throw new ApiError("TIMEOUT", `Token refresh timeout: ${error.message}`);
      }
    }

    // その他のエラー（通常は UNAUTHORIZED として扱う）
    throw new ApiError("UNAUTHORIZED", error instanceof Error ? error.message : "Token refresh failed");
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
