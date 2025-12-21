// ==========================================
// Project Storage - Offline Cache with SecureStore
// ==========================================

import * as SecureStore from "expo-secure-store";
import type { ProjectConfig } from "@mc-gate/core";

const PROJECTS_CACHE_KEY = "mc_gate_projects_cache";
const CURRENT_PROJECT_KEY = "mc_gate_current_project";

/**
 * プロジェクト一覧をSecureStoreに保存（オフラインキャッシュ）
 */
export async function saveProjectsCache(projects: ProjectConfig[]): Promise<void> {
  try {
    const json = JSON.stringify(projects);
    await SecureStore.setItemAsync(PROJECTS_CACHE_KEY, json);
    console.log("[ProjectStorage] Saved projects cache:", projects.length);
  } catch (error) {
    console.error("[ProjectStorage] Failed to save projects cache:", error);
    throw error;
  }
}

/**
 * SecureStoreからプロジェクト一覧を取得
 */
export async function getProjectsCache(): Promise<ProjectConfig[] | null> {
  try {
    const json = await SecureStore.getItemAsync(PROJECTS_CACHE_KEY);
    if (!json) {
      return null;
    }

    const projects = JSON.parse(json) as ProjectConfig[];
    console.log("[ProjectStorage] Loaded projects cache:", projects.length);
    return projects;
  } catch (error) {
    console.error("[ProjectStorage] Failed to load projects cache:", error);
    return null;
  }
}

/**
 * 現在のプロジェクトをSecureStoreに保存
 */
export async function saveCurrentProject(project: ProjectConfig): Promise<void> {
  try {
    const json = JSON.stringify(project);
    await SecureStore.setItemAsync(CURRENT_PROJECT_KEY, json);
    console.log("[ProjectStorage] Saved current project:", project.projectId);
  } catch (error) {
    console.error("[ProjectStorage] Failed to save current project:", error);
    throw error;
  }
}

/**
 * SecureStoreから現在のプロジェクトを取得
 */
export async function getCurrentProject(): Promise<ProjectConfig | null> {
  try {
    const json = await SecureStore.getItemAsync(CURRENT_PROJECT_KEY);
    if (!json) {
      return null;
    }

    const project = JSON.parse(json) as ProjectConfig;
    console.log("[ProjectStorage] Loaded current project:", project.projectId);
    return project;
  } catch (error) {
    console.error("[ProjectStorage] Failed to load current project:", error);
    return null;
  }
}

/**
 * プロジェクトキャッシュを削除（ログアウト時）
 */
export async function clearProjectsCache(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(PROJECTS_CACHE_KEY);
    await SecureStore.deleteItemAsync(CURRENT_PROJECT_KEY);
    console.log("[ProjectStorage] Cleared projects cache");
  } catch (error) {
    console.error("[ProjectStorage] Failed to clear projects cache:", error);
    throw error;
  }
}
