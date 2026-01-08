// ==========================================
// アプリケーション状態管理
// ==========================================

import { create } from "zustand";
import { Alert } from "react-native";
import type { ProjectConfig } from "@mc-gate/core";
import { ApiError } from "@mc-gate/core";
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

// G-3-4: エラー分類
type InitErrorCode = "NETWORK" | "AUTH" | "INTEGRITY" | "UNKNOWN";

interface InitError {
  code: InitErrorCode;
  message: string;
}

// セッション期限切れAlertの多重表示防止フラグ
let sessionExpiredAlertShown = false;

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

  // 初期データプリフェッチ
  prefetchInitialData: () => Promise<void>; // Pattern 4: 初回ログイン時の一括データ取得

  // パスコードロック
  passcode: string | null;
  isPasscodeEnabled: boolean;
  setPasscode: (passcode: string | null) => void;

  // UI状態
  isLoading: boolean;
  isInitializing: boolean; // Pattern 4: グローバルローディング用
  setLoading: (loading: boolean) => void;

  // G-3-4: 初期化エラーハンドリング
  initStatus: "idle" | "running" | "error";
  initError?: InitError;
  startInitialization: () => Promise<void>;
  retryInitialization: () => void;
  resetApplication: () => void;
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
        isInitializing: true, // Pattern 4: グローバルローディング開始
      });

      // ログイン後に初期データを一括取得（モックの場合はスキップ）
      if (!isMock) {
        await get().prefetchInitialData();
      }

      set({ isInitializing: false }); // Pattern 4: グローバルローディング終了
    } catch (error) {
      console.error("Login failed:", error);
      set({ isInitializing: false }); // エラー時もローディング終了
      throw error;
    }
  },

  // OAuthログイン
  loginWithOAuth: async () => {
    try {
      console.log("[AUTH:SSOT] loginWithOAuth started");
      const tokenResult = await loginWithKeycloak();
      console.log("[AUTH:SSOT] Keycloak login succeeded");

      // トークンからユーザー情報を抽出
      console.log("[AUTH:SSOT] Extracting user from token...");
      const userInfo = decodeUserFromToken(tokenResult.accessToken);
      console.log("[AUTH:SSOT] User extracted:", { id: userInfo.id, name: userInfo.name });

      const user: User = {
        id: userInfo.id,
        name: userInfo.name,
        email: userInfo.email,
        token: tokenResult.accessToken,
        refreshToken: tokenResult.refreshToken,
        idToken: tokenResult.idToken,
      };

      console.log("[AUTH:SSOT] Calling login()...");
      await get().login(user);
      console.log("[AUTH:SSOT] loginWithOAuth completed successfully");
    } catch (error) {
      console.error("[AUTH:SSOT] OAuth login failed:", {
        errorMessage: error instanceof Error ? error.message : String(error),
        errorCode: (error as any)?.code,
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        fullError: error,
      });
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
    console.log("[AUTH:SSOT] restoreSession started");

    const tokens = await getTokens();
    console.log("[AUTH:SSOT] SecureStore tokens:", {
      hasAccessToken: !!tokens?.accessToken,
      hasRefreshToken: !!tokens?.refreshToken,
      hasIdToken: !!tokens?.idToken,
    });

    if (!tokens) {
      console.warn("[AUTH:SSOT] No tokens in SecureStore - login required");
      return false;
    }

    try {
      // トークンをリフレッシュ（必要に応じて）
      console.log("[AUTH:SSOT] Calling refreshTokenIfNeeded...");
      const newAccessToken = await refreshTokenIfNeeded(
        tokens.accessToken,
        tokens.refreshToken
      );
      console.log("[AUTH:SSOT] Token refresh success");

      // ユーザー情報を復元
      console.log("[AUTH:SSOT] Decoding user from token...");
      const userInfo = decodeUserFromToken(newAccessToken);
      console.log("[AUTH:SSOT] User decoded:", { id: userInfo.id, name: userInfo.name });

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
      console.log("[AUTH:SSOT] Loading projects from cache...");
      await get().loadProjectsFromCache();

      // 現在のプロジェクトを復元
      const cachedProject = await getCurrentProject();
      if (cachedProject) {
        set({ currentProject: cachedProject });
        console.log("[AUTH:SSOT] Restored current project from cache");
      } else if (get().availableProjects.length > 0) {
        // キャッシュがない場合は最初のプロジェクトを自動選択
        const firstProject = get().availableProjects[0];
        set({ currentProject: firstProject });
        await saveCurrentProject(firstProject);
        console.log("[AUTH:SSOT] Set first available project as current");
      }

      console.log("[AUTH:SSOT] restoreSession completed successfully");
      return true;
    } catch (error) {
      console.error("[AUTH:SSOT] Session restore failed:", {
        errorMessage: error instanceof Error ? error.message : String(error),
        errorCode: (error as any)?.code,
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        fullError: error,
      });
      await clearTokens();
      console.log("[AUTH:SSOT] Tokens cleared due to restore failure");
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

      // 401エラーの場合は認証が無効 → 強制ログアウト
      if (error instanceof ApiError && error.kind === "UNAUTHORIZED") {
        console.warn("[AppStore] 401 Unauthorized - forcing logout");

        // セッション期限切れをユーザーに説明してからlogout
        if (!sessionExpiredAlertShown) {
          sessionExpiredAlertShown = true;
          Alert.alert(
            "セッション期限切れ",
            "ログインの有効期限が切れました。再度ログインしてください。",
            [
              {
                text: "OK",
                onPress: async () => {
                  await get().logout();
                }
              }
            ]
          );
        } else {
          // 既にAlert表示済みの場合はそのままlogout
          await get().logout();
        }

        return; // エラーを再throw せずに終了
      }

      // 403エラーの場合は権限不足 → ログアウトしない
      if (error instanceof ApiError && error.kind === "FORBIDDEN") {
        console.warn("[AppStore] 403 Forbidden - access denied (no logout)");
        Alert.alert(
          "権限不足",
          "この操作を実行する権限がありません。",
          [{ text: "閉じる" }]
        );
        return; // エラーを再throw せずに終了
      }

      // その他のAPI呼び出し失敗時はキャッシュから復元を試みる
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

  // 初期データプリフェッチ（Pattern 4）
  prefetchInitialData: async () => {
    const { user } = get();
    if (!user) {
      console.warn("[AppStore] Cannot prefetch: user not authenticated");
      return;
    }

    try {
      console.log("[AppStore] Starting initial data prefetch...");

      // 既存関数を順に await するだけ（新ロジック禁止）
      await get().fetchProjects();
      // Note: fetchWorkers関数は存在しないため、fetchProjectsのみを実行
      // 将来的にfetchWorkersが実装されたら追加する

      console.log("[AppStore] Initial data prefetch completed");
    } catch (error) {
      console.error("[AppStore] Failed to prefetch initial data:", error);
      // エラーは無視（バックグラウンド処理のため再throwしない）
    }
  },

  // UI
  isLoading: false,
  isInitializing: false, // Pattern 4: デフォルト値
  setLoading: (loading) => set({ isLoading: loading }),

  // G-3-4: 初期化エラーハンドリング
  initStatus: "idle",
  initError: undefined,

  // エラー分類関数
  startInitialization: async () => {
    console.error("[BOOT:3/3] startInitialization called");
    // ✅ 冪等性ガード：既に実行中または error状態なら即座に return
    const { initStatus: currentStatus } = get();
    if (currentStatus === "running") {
      console.warn("[G-3-4] startInitialization already running, skipping");
      return;
    }
    if (currentStatus === "error") {
      console.warn("[G-3-4] startInitialization in error state, skipping");
      return;
    }

    set({ initStatus: "running", initError: undefined });

    try {
      // 既存の初期化処理（restoreSession + integrity）
      const restoreOk = await get().restoreSession();

      if (!restoreOk) {
        // ✅ これは「正常」：未ログイン（初回 or ログアウト後）
        console.info("[AUTH:SSOT] No session restored (no tokens). Move to login-required state.");

        // エラーではなく、未ログイン状態に遷移
        set({
          initStatus: "idle",
          initError: undefined,
          isAuthenticated: false,
        });
        return;
      }

      set({ initStatus: "idle", initError: undefined });
    } catch (error) {
      // ❌ ここが「本当のAUTHエラー」：refresh失敗/デコード失敗/ネットワーク等
      const { code, message } = classifyInitError(error);
      console.error(`[G-3-4] Init Error: ${code}`, error);

      set({
        initStatus: "error",
        initError: { code, message },
      });
    }
  },

  retryInitialization: () => {
    get().startInitialization();
  },

  resetApplication: () => {
    // logout をコール（既に存在する安全な実装を再利用）
    get().logout();

    // 初期化状態をリセット
    set({
      initStatus: "idle",
      initError: undefined,
    });
  },
}));

// G-3-4: エラー分類ユーティリティ関数
function classifyInitError(error: unknown): {
  code: InitErrorCode;
  message: string;
} {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    const code = (error as any).code as string | undefined;

    // NETWORK系（AUTH より前にチェック - 優先度UP）
    if (
      message.includes("timeout") ||
      message.includes("econnrefused") ||
      message.includes("enotfound") ||
      message.includes("no such host") ||
      code === "ETIMEDOUT" ||
      code === "ECONNREFUSED" ||
      code === "ENOTFOUND"
    ) {
      console.log("[AUTH:SSOT] Error classified as NETWORK");
      return {
        code: "NETWORK",
        message:
          "ネットワークに接続できません。\n\nWi-Fiまたはデータ通信を確認して、再試行してください。",
      };
    }

    // AUTH系
    if (
      message.includes("session restoration failed") ||
      message.includes("401") ||
      message.includes("403") ||
      message.includes("unauthorized") ||
      message.includes("forbidden")
    ) {
      console.log("[AUTH:SSOT] Error classified as AUTH", {
        matchedPatterns: {
          "session restoration failed": message.includes("session restoration failed"),
          "401": message.includes("401"),
          "403": message.includes("403"),
          unauthorized: message.includes("unauthorized"),
          forbidden: message.includes("forbidden"),
        },
      });
      return {
        code: "AUTH",
        message:
          "認証に失敗しました。\n\nもう一度ログインしてください。",
      };
    }

    // INTEGRITY系（P2-6）
    if (message.includes("integrity") || message.includes("missing")) {
      console.log("[AUTH:SSOT] Error classified as INTEGRITY");
      return {
        code: "INTEGRITY",
        message:
          "アプリの整合性チェックに失敗しました。\n\n初期化ボタンからリセットしてください。",
      };
    }

    // UNKNOWN（その他）
    console.log("[AUTH:SSOT] Error classified as UNKNOWN:", { message, code });
    return {
      code: "UNKNOWN",
      message: `予期しないエラー: ${error.message}`,
    };
  }

  console.log("[AUTH:SSOT] Error is not an Error instance:", error);
  return {
    code: "UNKNOWN",
    message: "初期化中に予期しないエラーが発生しました。",
  };
}
