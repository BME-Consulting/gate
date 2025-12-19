// ==========================================
// プロジェクト設定マッピング
// ==========================================

import type { ProjectConfig } from "@mc-gate/core";

/**
 * プロジェクトIDと名称のマッピング（モック実装）
 *
 * TODO: 将来的にはバックエンドAPIから取得
 * GET /api/projects/{projectId} で名前、checkConfig等を取得
 */
export const PROJECT_NAMES: Record<string, string> = {
  PRJ001: "東京建設現場A",
  PRJ002: "大阪建設現場B",
  PRJ003: "名古屋建設現場C",
};

/**
 * プロジェクトIDから ProjectConfig を生成
 *
 * @param projectId - プロジェクトID（例: "PRJ001"）
 * @returns ProjectConfig オブジェクト
 *
 * @example
 * const project = createProjectConfig("PRJ001");
 * // => { projectId: "PRJ001", name: "東京建設現場A", ... }
 */
export function createProjectConfig(projectId: string): ProjectConfig {
  return {
    projectId,
    name: PROJECT_NAMES[projectId] || `プロジェクト ${projectId}`,
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
  };
}
