// ==========================================
// SQLite オフラインキュー
// ==========================================

import type { ScanEvent } from "../types/index.js";

// SQLiteDBインターフェース（expo-sqliteに依存）
export interface SQLiteDatabase {
  execAsync(query: string): Promise<any>;
  runAsync(query: string, args?: any[]): Promise<any>;
  getAllAsync<T>(query: string, args?: any[]): Promise<T[]>;
}

/**
 * オフラインキューマネージャー
 */
export class OfflineQueue {
  private db: SQLiteDatabase;

  constructor(db: SQLiteDatabase) {
    this.db = db;
  }

  /**
   * データベース初期化
   */
  async initialize(): Promise<void> {
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS scan_events (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        person_id TEXT NOT NULL,
        method TEXT NOT NULL,
        gate_mode TEXT NOT NULL,
        decided_mode TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        rule_result TEXT NOT NULL,
        transport_status TEXT NOT NULL,
        transport_attempts INTEGER NOT NULL,
        transport_last_error TEXT,
        transport_idempotency_key TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    await this.db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_transport_status
      ON scan_events(transport_status);
    `);

    await this.db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_idempotency_key
      ON scan_events(transport_idempotency_key);
    `);
  }

  /**
   * イベントを追加
   */
  async add(event: ScanEvent): Promise<void> {
    const now = new Date().toISOString();

    const params = [
      event.id,
      event.projectId,
      event.personId,
      event.method,
      event.gateMode,
      event.decidedMode,
      event.occurredAt,
      JSON.stringify(event.ruleResult),
      event.transport.status,
      event.transport.attempts,
      event.transport.lastError ?? null,
      event.transport.idempotencyKey,
      now,
      now,
    ];

    // パラメータ検証（開発モードのみ）
    if (__DEV__) {
      params.forEach((param, index) => {
        const paramType = typeof param;
        if (paramType === "object" && param !== null) {
          console.error(`[OfflineQueue.add] Invalid parameter at index ${index}:`, {
            type: paramType,
            value: param,
          });
        }
      });
    }

    try {
      await this.db.runAsync(
        `INSERT INTO scan_events (
          id, project_id, person_id, method, gate_mode, decided_mode,
          occurred_at, rule_result, transport_status, transport_attempts,
          transport_last_error, transport_idempotency_key, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params
      );
    } catch (error: any) {
      // エラー時に詳細なデバッグ情報を出力
      console.error("[OfflineQueue.add] Failed to insert event:", {
        errorMessage: error?.message,
        eventId: event.id,
        projectId: event.projectId,
        personId: event.personId,
        paramTypes: params.map((p, i) => `[${i}] ${typeof p}`),
      });
      throw error;
    }
  }

  /**
   * pending状態のイベントを取得
   */
  async getPending(limit: number = 50): Promise<ScanEvent[]> {
    const rows = await this.db.getAllAsync<any>(
      `SELECT * FROM scan_events
       WHERE transport_status = ?
       ORDER BY created_at ASC
       LIMIT ?`,
      ["pending", limit]
    );

    return rows.map(this.rowToEvent);
  }

  /**
   * イベントの送信状態を更新
   */
  async updateStatus(
    id: string,
    status: "pending" | "sent" | "failed",
    attempts: number,
    lastError?: string
  ): Promise<void> {
    const now = new Date().toISOString();

    const params = [status, attempts, lastError ?? null, now, id];

    // パラメータ検証（開発モードのみ）
    if (__DEV__) {
      params.forEach((param, index) => {
        const paramType = typeof param;
        if (paramType === "object" && param !== null) {
          console.error(`[OfflineQueue.updateStatus] Invalid parameter at index ${index}:`, {
            type: paramType,
            value: param,
          });
        }
      });
    }

    try {
      await this.db.runAsync(
        `UPDATE scan_events
         SET transport_status = ?,
             transport_attempts = ?,
             transport_last_error = ?,
             updated_at = ?
         WHERE id = ?`,
        params
      );
    } catch (error: any) {
      console.error("[OfflineQueue.updateStatus] Failed to update event:", {
        errorMessage: error?.message,
        eventId: id,
        status,
        attempts,
        lastError,
        paramTypes: params.map((p, i) => `[${i}] ${typeof p}`),
      });
      throw error;
    }
  }

  /**
   * 全件数を取得（最適化版: 1クエリで集計）
   */
  async getCount(): Promise<{ pending: number; sent: number; failed: number }> {
    const rows = await this.db.getAllAsync<{ status: string; count: number }>(
      `SELECT transport_status as status, COUNT(*) as count
       FROM scan_events
       GROUP BY transport_status`
    );

    const result = { pending: 0, sent: 0, failed: 0 };

    rows.forEach((row) => {
      if (row.status === "pending") result.pending = row.count;
      else if (row.status === "sent") result.sent = row.count;
      else if (row.status === "failed") result.failed = row.count;
    });

    return result;
  }

  /**
   * 今日の統計を取得（最適化版: 1クエリで集計）
   */
  async getTodayStats(projectId: string): Promise<{
    todayIn: number;
    todayOut: number;
    currentInSite: number;
  }> {
    // 今日の開始時刻（00:00:00）
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString();

    // 1クエリで入場・退場を集計
    const rows = await this.db.getAllAsync<{
      decided_mode: string;
      count: number;
    }>(
      `SELECT decided_mode, COUNT(*) as count
       FROM scan_events
       WHERE project_id = ?
         AND occurred_at >= ?
         AND transport_status = 'sent'
       GROUP BY decided_mode`,
      [projectId, todayStr]
    );

    let todayIn = 0;
    let todayOut = 0;

    rows.forEach((row) => {
      if (row.decided_mode === "IN") todayIn = row.count;
      else if (row.decided_mode === "OUT") todayOut = row.count;
    });

    const currentInSite = Math.max(0, todayIn - todayOut);

    return {
      todayIn,
      todayOut,
      currentInSite,
    };
  }

  /**
   * 最新のスキャンイベントを取得
   */
  async getLatestEvent(projectId: string): Promise<ScanEvent | null> {
    const rows = await this.db.getAllAsync<any>(
      `SELECT * FROM scan_events
       WHERE project_id = ?
       AND transport_status = 'sent'
       ORDER BY occurred_at DESC
       LIMIT 1`,
      [projectId]
    );

    if (rows.length === 0) return null;
    return this.rowToEvent(rows[0]);
  }

  /**
   * 履歴を取得（フィルタ・ページネーション対応）
   */
  async getHistory(
    projectId: string,
    options?: {
      status?: "pending" | "sent" | "failed";
      limit?: number;
      offset?: number;
    }
  ): Promise<ScanEvent[]> {
    const limit = options?.limit || 100;
    const offset = options?.offset || 0;

    let query = `SELECT * FROM scan_events WHERE project_id = ?`;
    const params: any[] = [projectId];

    if (options?.status) {
      query += ` AND transport_status = ?`;
      params.push(options.status);
    }

    query += ` ORDER BY occurred_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const rows = await this.db.getAllAsync<any>(query, params);
    return rows.map(this.rowToEvent);
  }

  /**
   * 行をScanEventに変換
   */
  private rowToEvent(row: any): ScanEvent {
    return {
      id: row.id,
      projectId: row.project_id,
      personId: row.person_id,
      method: row.method,
      gateMode: row.gate_mode,
      decidedMode: row.decided_mode,
      occurredAt: row.occurred_at,
      ruleResult: JSON.parse(row.rule_result),
      transport: {
        status: row.transport_status,
        attempts: row.transport_attempts,
        lastError: row.transport_last_error ?? undefined,
        idempotencyKey: row.transport_idempotency_key,
      },
    };
  }
}
