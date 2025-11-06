// ==========================================
// 冪等キー生成
// ==========================================

import type { PersonId, ProjectId, DecidedMode } from "../types/index.js";

/**
 * 冪等キーを生成
 * hash(projectId:personId:decidedMode:timestampFloor)
 */
export function makeIdempotencyKey(params: {
  projectId: ProjectId;
  personId: PersonId;
  decidedMode: DecidedMode;
  occurredAt: string; // ISO8601
}): string {
  // 分粒度に丸める (例: 2025-10-28T15:45:30.123Z → 2025-10-28T15:45)
  const timestampFloor = params.occurredAt.slice(0, 16);

  // シンプルなハッシュ生成（本番環境では crypto.subtle.digest 等を使用）
  const raw = `${params.projectId}:${params.personId}:${params.decidedMode}:${timestampFloor}`;
  return simpleHash(raw);
}

/**
 * シンプルなハッシュ関数（開発用）
 * 本番環境では SHA-256 等を使用すること
 */
function simpleHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * UUID v4 生成（RFC4122準拠の簡易版）
 */
export function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
