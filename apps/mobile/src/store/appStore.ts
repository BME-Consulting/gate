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
  extractProjectsFromToken,
} from "../services/tokenManager";
import { fetchUserProjects } from "../services/projectApi";
import {
  saveProjectsCache,
  getProjectsCache,
  saveCurrentProject,
  getCurrentProject,
  clearProjectsCache,
} from "../services/projectStorage";

interface AppState {
  // 認証
  user: User | null;
  isAuthenticated: boolean;
  login: (user: User, isMock?: boolean) => Promise<void>;
  loginWithOAuth: () => Promise<void>;
  logout: () => Promise<void>;
  ensureValidToken: () => Promise<boolean>;
  restoreSession: () => Promise<boolean>;

  // プロジェクト
  currentProject: ProjectConfig | null;
  availableProjects: ProjectConfig[]; // ユーザーがアクセス可能なプロジェクト一覧（API取得 + キャッシュ）
  setCurrentProject: (project: ProjectConfig) => Promise<void>; // 現在のプロジェクトを設定してキャッシュ
  fetchProjects: () => Promise<void>; // プロジェクト一覧をAPIから取得してキャッシュ
  loadProjectsFromCache: () => Promise<void>; // キャッシュからプロジェクト一覧を復元

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
  login: async (user: User, isMock = false) => {
    try {
      // モック認証の場合はSecureStoreに保存しない
      if (!isMock) {
        await saveTokens(user.token, user.refreshToken || "", user.idToken);
      }

      set({
        user,
        isAuthenticated: true,
      });

      // ログイン後にプロジェクト一覧を取得（モックの場合はスキップ）
      if (!isMock) {
        await get().fetchProjects();
      }
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
      await clearProjectsCache(); // プロジェクトキャッシュもクリア

      set({
        user: null,
        isAuthenticated: false,
        currentProject: null,
        availableProjects: [],
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

      // プロジェクト一覧をキャッシュから復元
      await get().loadProjectsFromCache();

      // 現在のプロジェクトを復元
      const cachedProject = await getCurrentProject();
      if (cachedProject) {
        set({ currentProject: cachedProject });
      } else if (get().availableProjects.length > 0) {
        // キャッシュがない場合は最初のプロジェクトを自動選択
        const firstProject = get().availableProjects[0];
        set({ currentProject: firstProject });
        await saveCurrentProject(firstProject);
      }

      return true;
    } catch (error) {
      console.error("Session restore failed:", error);
      await clearTokens();
      return false;
    }
  },

  // プロジェクト
  currentProject: null,
  availableProjects: [],

  setCurrentProject: async (project) => {
    set({ currentProject: project });
    await saveCurrentProject(project); // SecureStoreに保存
  },

  // プロジェクト一覧をAPIから取得してキャッシュ
  fetchProjects: async () => {
    const { user } = get();
    if (!user) {
      console.warn("[AppStore] Cannot fetch projects: user not authenticated");
      return;
    }

    try {
      const projects = await fetchUserProjects(user.token);

      // APIから取得したプロジェクトをキャッシュ
      await saveProjectsCache(projects);

      set({ availableProjects: projects });

      // 現在のプロジェクトが未設定の場合は最初のプロジェクトを自動選択
      if (!get().currentProject && projects.length > 0) {
        const firstProject = projects[0];
        set({ currentProject: firstProject });
        await saveCurrentProject(firstProject);
      }

      console.log("[AppStore] Fetched and cached projects:", projects.length);
    } catch (error) {
      console.error("[AppStore] Failed to fetch projects:", error);

      // API呼び出し失敗時はキャッシュから復元を試みる
      await get().loadProjectsFromCache();
      throw error;
    }
  },

  // キャッシュからプロジェクト一覧を復元（オフライン対応）
  loadProjectsFromCache: async () => {
    try {
      const cachedProjects = await getProjectsCache();

      if (cachedProjects && cachedProjects.length > 0) {
        set({ availableProjects: cachedProjects });
        console.log("[AppStore] Loaded projects from cache:", cachedProjects.length);
      } else {
        console.warn("[AppStore] No cached projects found");
      }
    } catch (error) {
      console.error("[AppStore] Failed to load projects from cache:", error);
    }
  },

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
