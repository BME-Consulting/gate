// ==========================================
// アプリケーション状態管理
// ==========================================

import { create } from "zustand";
import type { ProjectConfig } from "@mc-gate/core";

interface User {
  id: string;
  name: string;
  token: string;
}

interface AppState {
  // 認証
  user: User | null;
  isAuthenticated: boolean;
  login: (user: User) => void;
  logout: () => void;

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

export const useAppStore = create<AppState>((set) => ({
  // 認証状態
  user: null,
  isAuthenticated: false,

  login: (user) =>
    set({
      user,
      isAuthenticated: true,
    }),

  logout: () =>
    set({
      user: null,
      isAuthenticated: false,
      currentProject: null,
    }),

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
