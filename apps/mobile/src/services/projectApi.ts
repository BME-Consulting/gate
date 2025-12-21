// ==========================================
// Project API Service
// ==========================================

import Constants from "expo-constants";
import type { ProjectConfig } from "@mc-gate/core";
import { ApiError, fetchWithTimeout, TIMEOUT } from "@mc-gate/core";

/**
 * GET /api/me/projects のレスポンス型
 */
export interface ProjectsResponse {
  projects: ProjectConfig[];
}

/**
 * ユーザーがアクセス可能なプロジェクト一覧を取得
 *
 * @param token - JWTアクセストークン
 * @returns プロジェクト設定の配列
 *
 * @throws {ApiError} API呼び出しエラー
 */
export async function fetchUserProjects(token: string): Promise<ProjectConfig[]> {
  const apiBaseGs = Constants.expoConfig?.extra?.apiBaseGs || "http://192.168.1.4:7070";
  const endpoint = `${apiBaseGs}/api/me/projects`;

  try {
    const response = await fetchWithTimeout(endpoint, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      timeoutMs: TIMEOUT.DEFAULT, // 30秒
    });

    if (!response.ok) {
      // HTTPステータスコードに応じてエラー種別を分類
      let kind: ApiError["kind"];
      if (response.status === 401) {
        kind = "UNAUTHORIZED";
      } else if (response.status === 403) {
        kind = "FORBIDDEN";
      } else if (response.status === 404) {
        kind = "NOT_FOUND";
      } else if (response.status >= 500) {
        kind = "SERVER_ERROR";
      } else {
        kind = "UNKNOWN";
      }

      throw new ApiError(
        kind,
        `HTTP ${response.status}: ${response.statusText}`,
        response.status
      );
    }

    const data: ProjectsResponse = await response.json();
    console.log("[ProjectAPI] Fetched projects:", data.projects.length);

    return data.projects;
  } catch (error) {
    // fetchWithTimeout からのエラーを ApiError に変換
    if (error instanceof Error) {
      // 既に ApiError の場合はそのまま再throw
      if (error.name === "ApiError") {
        throw error;
      }

      // fetchWithTimeout のエラー名で分類
      if (error.name === "TimeoutError") {
        throw new ApiError("TIMEOUT", error.message);
      } else if (error.name === "DNSError") {
        throw new ApiError("DNS_ERROR", error.message);
      } else if (error.name === "TLSError") {
        throw new ApiError("TLS_ERROR", error.message);
      } else if (error.name === "NetworkError") {
        throw new ApiError("NETWORK_ERROR", error.message);
      }
    }

    // その他のエラー
    throw new ApiError(
      "UNKNOWN",
      error instanceof Error ? error.message : "Failed to fetch user projects"
    );
  }
}
