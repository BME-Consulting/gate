import Database from 'better-sqlite3';
import * as path from 'path';

const dbPath = process.env.DB_PATH || path.join(__dirname, '../../gs.db');
export const db = new Database(dbPath);

// WALモード有効化（パフォーマンス向上）
db.pragma('journal_mode = WAL');

// データベース初期化
export function initializeDatabase(): void {
  console.log('📊 Initializing database...');

  // プロジェクトテーブル
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      gate_mode TEXT NOT NULL CHECK (gate_mode IN ('IN', 'OUT')),
      scan_method_lock TEXT CHECK (scan_method_lock IN ('QR', 'CARD', 'FACE')),
      gate_mode_lock TEXT CHECK (gate_mode_lock IN ('IN', 'OUT')),
      check_config TEXT NOT NULL,
      server_lock INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_projects_name ON projects(name);
  `);

  // 作業員マスタテーブル
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
    CREATE INDEX IF NOT EXISTS idx_workers_ccus_id ON workers(ccus_id);
    CREATE INDEX IF NOT EXISTS idx_workers_updated_at ON workers(updated_at);
  `);

  // スキャンイベントテーブル
  db.exec(`
    CREATE TABLE IF NOT EXISTS scan_events (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      person_id TEXT NOT NULL,
      method TEXT NOT NULL CHECK (method IN ('QR', 'CARD', 'FACE')),
      gate_mode TEXT NOT NULL CHECK (gate_mode IN ('IN', 'OUT')),
      decided_mode TEXT NOT NULL CHECK (decided_mode IN ('IN', 'OUT')),
      occurred_at TEXT NOT NULL,
      rule_result TEXT NOT NULL,
      transport_status TEXT NOT NULL DEFAULT 'pending' CHECK (transport_status IN ('pending', 'sent', 'failed')),
      transport_attempts INTEGER NOT NULL DEFAULT 0,
      transport_last_error TEXT,
      transport_idempotency_key TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,

      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (person_id) REFERENCES workers(person_id) ON DELETE RESTRICT
    );

    CREATE INDEX IF NOT EXISTS idx_scan_events_project_occurred ON scan_events(project_id, occurred_at DESC);
    CREATE INDEX IF NOT EXISTS idx_scan_events_person ON scan_events(person_id);
    CREATE INDEX IF NOT EXISTS idx_scan_events_transport_status ON scan_events(transport_status);
    CREATE INDEX IF NOT EXISTS idx_scan_events_idempotency_key ON scan_events(transport_idempotency_key);
    CREATE INDEX IF NOT EXISTS idx_scan_events_decided_mode ON scan_events(decided_mode);
    CREATE INDEX IF NOT EXISTS idx_scan_events_occurred_at ON scan_events(occurred_at);
  `);

  console.log('✅ Database initialized successfully');
  console.log(`📁 Database path: ${dbPath}`);
}

// デフォルトプロジェクトを作成
export function seedDefaultProject(): void {
  const existing = db.prepare('SELECT id FROM projects WHERE id = ?').get('PRJ001');

  if (!existing) {
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO projects (id, name, gate_mode, check_config, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      'PRJ001',
      'デフォルトプロジェクト',
      'IN',
      JSON.stringify({
        checkCcusRegistration: false,
        checkSocialInsurance: false,
        checkResidencyExpiry: false,
        checkAge: false,
        checkFaceRecognition: false
      }),
      now,
      now
    );
    console.log('✅ Default project (PRJ001) created');
  }
}

// ダミー作業員データを作成
export function seedDummyWorkers(): void {
  const count = db.prepare('SELECT COUNT(*) as count FROM workers').get() as { count: number };

  if (count.count === 0) {
    const now = new Date().toISOString();
    const dummyWorkers = [
      { personId: 'W001', name: '山田太郎', company: '株式会社サンプル建設', ccusId: 'CCUS001', ccusRegistered: 1, socialInsurance: 1, age: 35 },
      { personId: 'W002', name: '佐藤花子', company: '株式会社テスト工務店', ccusId: 'CCUS002', ccusRegistered: 1, socialInsurance: 1, age: 28 },
      { personId: 'W003', name: '鈴木一郎', company: '鈴木建設', ccusId: null, ccusRegistered: 0, socialInsurance: 1, age: 42 },
      { personId: 'W004', name: '田中次郎', company: '田中工業', ccusId: 'CCUS004', ccusRegistered: 1, socialInsurance: 0, age: 31 },
      { personId: 'W005', name: '高橋三郎', company: '高橋建築', ccusId: null, ccusRegistered: 0, socialInsurance: 0, age: 25 },
    ];

    const stmt = db.prepare(`
      INSERT INTO workers (
        person_id, name, company, ccus_id, ccus_registered,
        social_insurance, age, is_sole_proprietor,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const worker of dummyWorkers) {
      stmt.run(
        worker.personId,
        worker.name,
        worker.company,
        worker.ccusId,
        worker.ccusRegistered,
        worker.socialInsurance,
        worker.age,
        0, // is_sole_proprietor
        now,
        now
      );
    }

    console.log(`✅ Seeded ${dummyWorkers.length} dummy workers`);
  }
}
