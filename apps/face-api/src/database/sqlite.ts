// SQLite接続
// TODO: 後で実装

import Database from 'better-sqlite3';

let db: Database.Database | null = null;

export function initDatabase(): Database.Database {
  if (db) return db;

  // TODO: データベース初期化
  // db = new Database('face-api.db');

  throw new Error('Database not initialized');
}

export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

export function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}
