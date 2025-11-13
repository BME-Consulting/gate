-- ==========================================
-- 作業員マスタテーブル
-- ==========================================

CREATE TABLE IF NOT EXISTS workers (
  -- 基本情報
  person_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  company TEXT NOT NULL,

  -- CCUS情報
  ccus_id TEXT,
  ccus_registered INTEGER NOT NULL DEFAULT 0,  -- 0: 未登録, 1: 登録済み

  -- 社会保険・在留資格
  social_insurance INTEGER NOT NULL DEFAULT 0,  -- 0: 未加入, 1: 加入済み
  residency_expiry TEXT,  -- ISO8601形式 (YYYY-MM-DD) または空文字列

  -- その他情報
  age INTEGER,
  is_sole_proprietor INTEGER NOT NULL DEFAULT 0,  -- 0: 非該当, 1: 一人親方

  -- 顔認証情報
  face_embedding TEXT,  -- JSON配列形式 [512次元のfloat配列]
  face_image_url TEXT,  -- 顔写真のURL（オプション）

  -- タイムスタンプ
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_workers_name ON workers(name);
CREATE INDEX IF NOT EXISTS idx_workers_company ON workers(company);
CREATE INDEX IF NOT EXISTS idx_workers_ccus_id ON workers(ccus_id);
CREATE INDEX IF NOT EXISTS idx_workers_created_at ON workers(created_at);

-- ==========================================
-- サンプルデータ（開発用）
-- ==========================================

INSERT OR REPLACE INTO workers (
  person_id, name, company, ccus_id, ccus_registered,
  social_insurance, residency_expiry, age, is_sole_proprietor,
  face_embedding, face_image_url, created_at, updated_at
) VALUES
  (
    'P001', '山田太郎', '株式会社ABC', 'C12345', 1,
    1, '', 35, 0,
    NULL, NULL,
    datetime('now'), datetime('now')
  ),
  (
    'P002', '佐藤次郎', '株式会社DEF', '', 0,
    1, '', 42, 0,
    NULL, NULL,
    datetime('now'), datetime('now')
  ),
  (
    'P003', 'John Smith', '株式会社GHI', 'C67890', 1,
    1, '2025-12-31', 28, 0,
    NULL, NULL,
    datetime('now'), datetime('now')
  ),
  (
    'P004', '鈴木三郎', '鈴木工務店', 'C11111', 1,
    0, '', 55, 1,
    NULL, NULL,
    datetime('now'), datetime('now')
  ),
  (
    'P005', '田中四郎', '田中建設', '', 0,
    0, '', 48, 0,
    NULL, NULL,
    datetime('now'), datetime('now')
  );
