// ==========================================
// Token Manager - Secure Token Storage & Refresh
// ==========================================

import * as SecureStore from "expo-secure-store";
import { jwtDecode } from "jwt-decode";

const ACCESS_TOKEN_KEY = "mc_gate_access_token";
const REFRESH_TOKEN_KEY = "mc_gate_refresh_token";
const ID_TOKEN_KEY = "mc_gate_id_token";

interface JWTPayload {
  exp: number;
  sub: string;
  preferred_username?: string;
  email?: string;
  name?: string;
  [key: string]: unknown;
}

/**
 * トークンを安全に保存
 */
export async function saveTokens(
  accessToken: string,
  refreshToken: string,
  idToken?: string
): Promise<void> {
  try {
    await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken);
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken);

    if (idToken) {
      await SecureStore.setItemAsync(ID_TOKEN_KEY, idToken);
    }
  } catch (error) {
    console.error("Failed to save tokens:", error);
    throw error;
  }
}

/**
 * 保存されたトークンを取得
 */
export async function getTokens(): Promise<{
  accessToken: string;
  refreshToken: string;
  idToken?: string;
} | null> {
  try {
    const accessToken = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
    const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
    const idToken = await SecureStore.getItemAsync(ID_TOKEN_KEY);

    if (!accessToken || !refreshToken) {
      return null;
    }

    return {
      accessToken,
      refreshToken,
      idToken: idToken || undefined,
    };
  } catch (error) {
    console.error("Failed to get tokens:", error);
    return null;
  }
}

/**
 * トークンを削除
 */
export async function clearTokens(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
    await SecureStore.deleteItemAsync(ID_TOKEN_KEY);
  } catch (error) {
    console.error("Failed to clear tokens:", error);
    throw error;
  }
}

/**
 * トークンの有効期限をチェック
 */
export function isTokenExpired(token: string): boolean {
  try {
    const decoded = jwtDecode<JWTPayload>(token);

    // expは秒単位、Date.now()はミリ秒単位
    const expirationTime = decoded.exp * 1000;
    const currentTime = Date.now();

    // 1分のバッファを持たせる
    const bufferTime = 60 * 1000;

    return currentTime >= expirationTime - bufferTime;
  } catch (error) {
    console.error("Failed to decode token:", error);
    return true; // デコードに失敗したら期限切れとみなす
  }
}

/**
 * トークンから必要に応じてリフレッシュ
 */
export async function refreshTokenIfNeeded(
  accessToken: string,
  refreshToken: string
): Promise<string> {
  if (!isTokenExpired(accessToken)) {
    return accessToken; // まだ有効なのでそのまま返す
  }

  // トークンリフレッシュが必要
  const { refreshAccessToken } = await import("./auth");

  try {
    const result = await refreshAccessToken(refreshToken);

    // 新しいトークンを保存
    await saveTokens(result.accessToken, result.refreshToken, result.idToken);

    return result.accessToken;
  } catch (error) {
    console.error("Token refresh failed:", error);
    throw error;
  }
}

/**
 * トークンからユーザー情報を抽出
 */
export function decodeUserFromToken(token: string): {
  id: string;
  name: string;
  email?: string;
} {
  try {
    const decoded = jwtDecode<JWTPayload>(token);

    return {
      id: decoded.sub,
      name: decoded.preferred_username || decoded.email || decoded.name || "Unknown User",
      email: decoded.email,
    };
  } catch (error) {
    console.error("Failed to decode user from token:", error);
    throw new Error("Invalid token");
  }
}
