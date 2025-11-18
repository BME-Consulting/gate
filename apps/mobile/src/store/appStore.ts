// ==========================================
// アプリケーション状態管理
// ==========================================

import { create } from "zustand";
import type { ProjectConfig } from "@mc-gate/core";
import type { User } from "../types/auth";
import {
  loginWithKeycloak,
  logout as oauthLogout,
} from "../services/auth";
import {
  saveTokens,
  getTokens,
  clearTokens,
  refreshTokenIfNeeded,
  decodeUserFromToken,
} from "../services/tokenManager";

interface AppState {
  // 認証
  user: User | null;
  isAuthenticated: boolean;
  login: (user: User) => Promise<void>;
  loginWithOAuth: () => Promise<void>;
  logout: () => Promise<void>;
  ensureValidToken: () => Promise<boolean>;
  restoreSession: () => Promise<boolean>;

  // プロジェクト
  currentProject: ProjectConfig | null;
  setCurrentProject: (project: ProjectConfig) => void;

  // パスコードロック
  passcode: string | null;
  isPasscodeEnabled: boolean;
  setPasscode: (passcode: string | null) => void;

  // UI状態
  isLoading: boolean;
  setLoading: (loading: boolean) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  // 認証状態
  user: null,
  isAuthenticated: false,

  // 通常のログイン（トークンを受け取る）
  login: async (user: User) => {
    try {
      // トークンを保存
      await saveTokens(user.token, user.refreshToken || "", user.idToken);

      set({
        user,
        isAuthenticated: true,
      });
    } catch (error) {
      console.error("Login failed:", error);
      throw error;
    }
  },

  // OAuthログイン
  loginWithOAuth: async () => {
    try {
      const tokenResult = await loginWithKeycloak();

      // トークンからユーザー情報を抽出
      const userInfo = decodeUserFromToken(tokenResult.accessToken);

      const user: User = {
        id: userInfo.id,
        name: userInfo.name,
        email: userInfo.email,
        token: tokenResult.accessToken,
        refreshToken: tokenResult.refreshToken,
        idToken: tokenResult.idToken,
      };

      await get().login(user);
    } catch (error) {
      console.error("OAuth login failed:", error);
      throw error;
    }
  },

  // ログアウト
  logout: async () => {
    try {
      const { user } = get();
      await oauthLogout(user?.idToken);
      await clearTokens();

      set({
        user: null,
        isAuthenticated: false,
        currentProject: null,
      });
    } catch (error) {
      console.error("Logout failed:", error);
      throw error;
    }
  },

  // トークンリフレッシュ
  ensureValidToken: async () => {
    const tokens = await getTokens();
    if (!tokens) return false;

    try {
      const newAccessToken = await refreshTokenIfNeeded(
        tokens.accessToken,
        tokens.refreshToken
      );

      if (newAccessToken !== tokens.accessToken) {
        // トークンが更新された場合、ユーザー情報を更新
        const { user } = get();
        if (user) {
          set({
            user: { ...user, token: newAccessToken },
          });
        }
      }

      return true;
    } catch (error) {
      console.error("Token refresh failed:", error);
      // リフレッシュ失敗時はログアウト
      await get().logout();
      return false;
    }
  },

  // セッション復元（アプリ起動時）
  restoreSession: async () => {
    const tokens = await getTokens();
    if (!tokens) return false;

    try {
      // トークンをリフレッシュ（必要に応じて）
      const newAccessToken = await refreshTokenIfNeeded(
        tokens.accessToken,
        tokens.refreshToken
      );

      // ユーザー情報を復元
      const userInfo = decodeUserFromToken(newAccessToken);

      const user: User = {
        id: userInfo.id,
        name: userInfo.name,
        email: userInfo.email,
        token: newAccessToken,
        refreshToken: tokens.refreshToken,
        idToken: tokens.idToken,
      };

      set({
        user,
        isAuthenticated: true,
      });

      return true;
    } catch (error) {
      console.error("Session restore failed:", error);
      await clearTokens();
      return false;
    }
  },

  // プロジェクト
  currentProject: null,
  setCurrentProject: (project) => set({ currentProject: project }),

  // パスコードロック
  passcode: null,
  isPasscodeEnabled: false,
  setPasscode: (passcode) =>
    set({
      passcode,
      isPasscodeEnabled: passcode !== null,
    }),

  // UI
  isLoading: false,
  setLoading: (loading) => set({ isLoading: loading }),
}));
