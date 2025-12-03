// ==========================================
// WorkerRepository - 作業員マスタCRUD
// ==========================================

import type { Worker } from "../types/index.js";

// SQLiteDBインターフェース（expo-sqliteに依存）
export interface SQLiteDatabase {
  execAsync(query: string): Promise<any>;
  runAsync(query: string, args?: any[]): Promise<any>;
  getAllAsync<T>(query: string, args?: any[]): Promise<T[]>;
}

/**
 * SQLエスケープ関数
 * Kotlin型変換エラー回避のため、execAsync方式で使用
 */
function escapeSQLString(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "number") return String(val);
  if (typeof val === "boolean") return val ? "1" : "0";
  return `'${String(val).replace(/'/g, "''")}'`;
}

/**
 * 作業員マスタリポジトリ
 */
export class WorkerRepository {
  private db: SQLiteDatabase;

  constructor(db: SQLiteDatabase) {
    this.db = db;
  }

  /**
   * テーブルを初期化（存在しなければ作成）
   */
  async initialize(): Promise<void> {
    const schema = `
      CREATE TABLE IF NOT EXISTS workers (
        -- 基本情報
        person_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        company TEXT NOT NULL,

        -- CCUS情報
        ccus_id TEXT,
        ccus_registered INTEGER NOT NULL DEFAULT 0,

        -- 社会保険・在留資格
        social_insurance INTEGER NOT NULL DEFAULT 0,
        residency_expiry TEXT,

        -- その他情報
        age INTEGER,
        is_sole_proprietor INTEGER NOT NULL DEFAULT 0,

        -- 顔認証情報
        face_embedding TEXT,
        face_image_url TEXT,

        -- タイムスタンプ
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_workers_name ON workers(name);
      CREATE INDEX IF NOT EXISTS idx_workers_company ON workers(company);
      CREATE INDEX IF NOT EXISTS idx_workers_ccus_id ON workers(ccus_id);
      CREATE INDEX IF NOT EXISTS idx_workers_created_at ON workers(created_at);
    `;

    try {
      await this.db.execAsync(schema);
    } catch (error: any) {
      console.error("[WorkerRepository.initialize] Failed to create table:", {
        errorMessage: error?.message,
      });
      throw error;
    }
  }

  /**
   * 作業員を追加
   */
  async add(worker: Worker): Promise<void> {
    const now = new Date().toISOString();

    // faceEmbeddingはJSON文字列として保存
    const faceEmbeddingStr =
      worker.faceEmbedding && worker.faceEmbedding.length > 0
        ? JSON.stringify(worker.faceEmbedding)
        : null;

    const sql = `INSERT INTO workers (
      person_id, name, company, ccus_id, ccus_registered, social_insurance,
      residency_expiry, age, is_sole_proprietor, face_embedding, face_image_url,
      created_at, updated_at
    ) VALUES (
      ${escapeSQLString(worker.personId)},
      ${escapeSQLString(worker.name)},
      ${escapeSQLString(worker.company)},
      ${escapeSQLString(worker.ccusId)},
      ${worker.ccusRegistered ? 1 : 0},
      ${worker.socialInsurance ? 1 : 0},
      ${escapeSQLString(worker.residencyExpiry)},
      ${worker.age !== undefined ? worker.age : "NULL"},
      ${worker.isSoleProprietor ? 1 : 0},
      ${faceEmbeddingStr ? escapeSQLString(faceEmbeddingStr) : "NULL"},
      ${escapeSQLString(worker.faceImageUrl)},
      ${escapeSQLString(now)},
      ${escapeSQLString(now)}
    );`;

    try {
      await this.db.execAsync(sql);
    } catch (error: any) {
      console.error("[WorkerRepository.add] Failed to insert worker:", {
        errorMessage: error?.message,
        personId: worker.personId,
        name: worker.name,
        sql: sql.substring(0, 200) + "...",
      });
      throw error;
    }
  }

  /**
   * 作業員を更新
   */
  async update(worker: Worker): Promise<void> {
    const now = new Date().toISOString();

    // faceEmbeddingはJSON文字列として保存
    const faceEmbeddingStr =
      worker.faceEmbedding && worker.faceEmbedding.length > 0
        ? JSON.stringify(worker.faceEmbedding)
        : null;

    const sql = `UPDATE workers SET
      name = ${escapeSQLString(worker.name)},
      company = ${escapeSQLString(worker.company)},
      ccus_id = ${escapeSQLString(worker.ccusId)},
      ccus_registered = ${worker.ccusRegistered ? 1 : 0},
      social_insurance = ${worker.socialInsurance ? 1 : 0},
      residency_expiry = ${escapeSQLString(worker.residencyExpiry)},
      age = ${worker.age !== undefined ? worker.age : "NULL"},
      is_sole_proprietor = ${worker.isSoleProprietor ? 1 : 0},
      face_embedding = ${faceEmbeddingStr ? escapeSQLString(faceEmbeddingStr) : "NULL"},
      face_image_url = ${escapeSQLString(worker.faceImageUrl)},
      updated_at = ${escapeSQLString(now)}
    WHERE person_id = ${escapeSQLString(worker.personId)};`;

    try {
      await this.db.execAsync(sql);
    } catch (error: any) {
      console.error("[WorkerRepository.update] Failed to update worker:", {
        errorMessage: error?.message,
        personId: worker.personId,
        name: worker.name,
        sql: sql.substring(0, 200) + "...",
      });
      throw error;
    }
  }

  /**
   * 作業員を削除
   */
  async delete(personId: string): Promise<void> {
    const sql = `DELETE FROM workers WHERE person_id = ${escapeSQLString(personId)};`;

    try {
      await this.db.execAsync(sql);
    } catch (error: any) {
      console.error("[WorkerRepository.delete] Failed to delete worker:", {
        errorMessage: error?.message,
        personId,
      });
      throw error;
    }
  }

  /**
   * IDで作業員を検索
   */
  async findById(personId: string): Promise<Worker | null> {
    const rows = await this.db.getAllAsync<any>(
      `SELECT * FROM workers WHERE person_id = ? LIMIT 1`,
      [personId]
    );

    if (rows.length === 0) return null;
    return this.rowToWorker(rows[0]);
  }

  /**
   * 全作業員を取得
   */
  async findAll(): Promise<Worker[]> {
    try {
      // getAllAsync()でSELECTクエリを実行
      const rows = await this.db.getAllAsync<any>(
        `SELECT * FROM workers ORDER BY name ASC`
      );

      if (typeof __DEV__ !== "undefined" && __DEV__) {
        console.log(`[WorkerRepository.findAll] Loaded ${rows.length} workers`);
      }

      return rows.map(this.rowToWorker);
    } catch (error: any) {
      console.error("[WorkerRepository.findAll] Failed to fetch workers:", {
        errorMessage: error?.message,
      });
      throw error;
    }
  }

  /**
   * サーバーから同期（全件削除 + 挿入）- トランザクション対応
   */
  async syncFromServer(workers: Worker[]): Promise<void> {
    try {
      // トランザクション開始
      await this.db.execAsync("BEGIN TRANSACTION;");

      // 既存データを全削除
      await this.db.execAsync(`DELETE FROM workers;`);

      // バッチ挿入（トランザクション内）
      await this.upsertBatchInternal(workers);

      // コミット
      await this.db.execAsync("COMMIT;");

      if (typeof __DEV__ !== "undefined" && __DEV__) {
        console.log(`[WorkerRepository] Sync completed: ${workers.length} workers`);
      }
    } catch (error: any) {
      // ロールバック
      try {
        await this.db.execAsync("ROLLBACK;");
      } catch (rollbackError) {
        console.error("[WorkerRepository] Failed to rollback transaction:", rollbackError);
      }

      console.error("[WorkerRepository.syncFromServer] Failed to sync:", {
        errorMessage: error?.message,
        workerCount: workers.length,
      });
      throw error;
    }
  }

  /**
   * バッチ更新/挿入（トランザクション対応）
   */
  async upsertBatch(workers: Worker[]): Promise<void> {
    if (workers.length === 0) return;

    try {
      // トランザクション開始
      await this.db.execAsync("BEGIN TRANSACTION;");

      // バッチ挿入
      await this.upsertBatchInternal(workers);

      // コミット
      await this.db.execAsync("COMMIT;");

      if (typeof __DEV__ !== "undefined" && __DEV__) {
        console.log(`[WorkerRepository] Batch upsert completed: ${workers.length} workers`);
      }
    } catch (error: any) {
      // ロールバック
      try {
        await this.db.execAsync("ROLLBACK;");
      } catch (rollbackError) {
        console.error("[WorkerRepository] Failed to rollback transaction:", rollbackError);
      }

      console.error("[WorkerRepository] Batch upsert failed, rolled back:", {
        operation: "upsertBatch",
        workerCount: workers.length,
        error: error instanceof Error ? error.message : String(error),
      });

      throw new Error(
        `Database transaction failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * バッチ更新/挿入の内部処理（10件ずつ処理）
   * トランザクション内で呼び出される前提
   */
  private async upsertBatchInternal(workers: Worker[]): Promise<void> {
    const batchSize = 10;

    for (let i = 0; i < workers.length; i += batchSize) {
      const batch = workers.slice(i, i + batchSize);
      const insertStatements: string[] = [];

      for (const worker of batch) {
        const now = new Date().toISOString();

        // faceEmbeddingはJSON文字列として保存
        const faceEmbeddingStr =
          worker.faceEmbedding && worker.faceEmbedding.length > 0
            ? JSON.stringify(worker.faceEmbedding)
            : null;

        const sql = `INSERT OR REPLACE INTO workers (
          person_id, name, company, ccus_id, ccus_registered, social_insurance,
          residency_expiry, age, is_sole_proprietor, face_embedding, face_image_url,
          created_at, updated_at
        ) VALUES (
          ${escapeSQLString(worker.personId)},
          ${escapeSQLString(worker.name)},
          ${escapeSQLString(worker.company)},
          ${escapeSQLString(worker.ccusId)},
          ${worker.ccusRegistered ? 1 : 0},
          ${worker.socialInsurance ? 1 : 0},
          ${escapeSQLString(worker.residencyExpiry)},
          ${worker.age !== undefined ? worker.age : "NULL"},
          ${worker.isSoleProprietor ? 1 : 0},
          ${faceEmbeddingStr ? escapeSQLString(faceEmbeddingStr) : "NULL"},
          ${escapeSQLString(worker.faceImageUrl)},
          ${escapeSQLString(worker.createdAt || now)},
          ${escapeSQLString(now)}
        );`;

        insertStatements.push(sql);
      }

      // バッチ実行
      const batchSQL = insertStatements.join("\n");
      try {
        await this.db.execAsync(batchSQL);
      } catch (error: any) {
        console.error("[WorkerRepository.upsertBatchInternal] Failed to insert batch:", {
          errorMessage: error?.message,
          batchIndex: i / batchSize,
          batchSize: batch.length,
          sql: batchSQL.substring(0, 300) + "...",
        });
        throw error;
      }
    }
  }

  /**
   * 行をWorkerに変換
   */
  private rowToWorker(row: any): Worker {
    // face_embeddingをJSON文字列から配列に変換
    let faceEmbedding: number[] | undefined = undefined;
    if (row.face_embedding) {
      try {
        const parsed = JSON.parse(row.face_embedding);
        if (Array.isArray(parsed)) {
          faceEmbedding = parsed;
        }
      } catch (error) {
        console.warn(
          "[WorkerRepository.rowToWorker] Failed to parse face_embedding:",
          error
        );
      }
    }

    return {
      personId: row.person_id,
      name: row.name,
      company: row.company,
      ccusId: row.ccus_id ?? undefined,
      ccusRegistered: Boolean(row.ccus_registered),
      socialInsurance: Boolean(row.social_insurance),
      residencyExpiry: row.residency_expiry ?? undefined,
      age: row.age ?? undefined,
      isSoleProprietor: Boolean(row.is_sole_proprietor),
      faceEmbedding,
      faceImageUrl: row.face_image_url ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
