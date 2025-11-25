import Database from 'better-sqlite3';
import * as path from 'path';

const dbPath = path.join(__dirname, '../../workers.db');
const db = new Database(dbPath);

// テーブル初期化
db.exec(`
  CREATE TABLE IF NOT EXISTS workers (
    person_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    company TEXT NOT NULL,
    ccus_id TEXT,
    ccus_registered INTEGER NOT NULL DEFAULT 0,
    social_insurance INTEGER NOT NULL DEFAULT 0,
    residency_expiry TEXT,
    age INTEGER,
    is_sole_proprietor INTEGER NOT NULL DEFAULT 0,
    face_embedding TEXT,
    face_image_url TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_workers_name ON workers(name);
  CREATE INDEX IF NOT EXISTS idx_workers_company ON workers(company);
`);

export interface Worker {
  personId: string;
  name: string;
  company: string;
  ccusId?: string;
  ccusRegistered: boolean;
  socialInsurance: boolean;
  residencyExpiry?: string;
  age?: number;
  isSoleProprietor: boolean;
  faceEmbedding?: number[];
  faceImageUrl?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * 全作業員を取得（face_embeddingsテーブルとLEFT JOIN）
 */
export function getAllWorkers(): Worker[] {
  const stmt = db.prepare(`
    SELECT
      w.*,
      fe.embedding,
      fe.embedding_dimensions
    FROM workers w
    LEFT JOIN face_embeddings fe ON w.person_id = fe.person_id
    ORDER BY w.created_at DESC
  `);
  const rows = stmt.all();

  return rows.map(rowToWorker);
}

/**
 * IDで作業員を検索（face_embeddingsテーブルとLEFT JOIN）
 */
export function getWorkerById(personId: string): Worker | null {
  const stmt = db.prepare(`
    SELECT
      w.*,
      fe.embedding,
      fe.embedding_dimensions
    FROM workers w
    LEFT JOIN face_embeddings fe ON w.person_id = fe.person_id
    WHERE w.person_id = ?
    LIMIT 1
  `);
  const row = stmt.get(personId);

  if (!row) return null;
  return rowToWorker(row);
}

/**
 * 作業員を追加
 */
export function addWorker(worker: Worker): void {
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO workers (
      person_id, name, company, ccus_id, ccus_registered,
      social_insurance, residency_expiry, age, is_sole_proprietor,
      face_embedding, face_image_url, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    worker.personId,
    worker.name,
    worker.company,
    worker.ccusId || null,
    worker.ccusRegistered ? 1 : 0,
    worker.socialInsurance ? 1 : 0,
    worker.residencyExpiry || null,
    worker.age || null,
    worker.isSoleProprietor ? 1 : 0,
    worker.faceEmbedding ? JSON.stringify(worker.faceEmbedding) : null,
    worker.faceImageUrl || null,
    now,
    now
  );
}

/**
 * 顔エンコーディングを更新（face_embeddingsテーブルに保存）
 */
export function updateFaceEmbedding(personId: string, embedding: number[]): void {
  const now = new Date().toISOString();

  // BLOBとして保存（Float32Array → Buffer）
  const embeddingBuffer = Buffer.from(new Float32Array(embedding).buffer);
  const embeddingDimensions = embedding.length;

  // UPSERT: 存在すれば更新、存在しなければ挿入
  const stmt = db.prepare(`
    INSERT INTO face_embeddings (person_id, embedding, embedding_dimensions, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(person_id) DO UPDATE SET
      embedding = excluded.embedding,
      embedding_dimensions = excluded.embedding_dimensions,
      updated_at = excluded.updated_at
  `);

  stmt.run(personId, embeddingBuffer, embeddingDimensions, now, now);
}

/**
 * 顔エンコーディングで作業員を検索（face_embeddingsテーブルから取得）
 */
export function findWorkersByFaceEmbedding(): Worker[] {
  const stmt = db.prepare(`
    SELECT
      w.*,
      fe.embedding,
      fe.embedding_dimensions
    FROM workers w
    INNER JOIN face_embeddings fe ON w.person_id = fe.person_id
  `);
  const rows = stmt.all();

  return rows.map(rowToWorker);
}

/**
 * 行をWorkerオブジェクトに変換（face_embeddingsテーブルからのBLOBデータを処理）
 */
function rowToWorker(row: any): Worker {
  let faceEmbedding: number[] | undefined = undefined;

  // face_embeddingsテーブルからのBLOBデータを処理
  if (row.embedding) {
    try {
      // BufferをFloat32Arrayに変換
      const buffer = Buffer.isBuffer(row.embedding) ? row.embedding : Buffer.from(row.embedding);
      const float32Array = new Float32Array(
        buffer.buffer,
        buffer.byteOffset,
        buffer.byteLength / Float32Array.BYTES_PER_ELEMENT
      );
      faceEmbedding = Array.from(float32Array);
    } catch (error) {
      console.error(`Failed to parse face embedding for ${row.person_id}:`, error);
    }
  }

  return {
    personId: row.person_id,
    name: row.name,
    company: row.company,
    ccusId: row.ccus_id || undefined,
    ccusRegistered: row.ccus_registered === 1,
    socialInsurance: row.social_insurance === 1,
    residencyExpiry: row.residency_expiry || undefined,
    age: row.age !== null ? row.age : undefined,
    isSoleProprietor: row.is_sole_proprietor === 1,
    faceEmbedding,
    faceImageUrl: row.face_image_url || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
