// ==========================================
// MCD3 通門管理 コアパッケージ
// ==========================================

// 型定義
export * from "./types/index";

// ルールエンジン
export { RuleEngine } from "./rules/engine";

// 冪等キー生成
export { makeIdempotencyKey, generateUUID } from "./queue/idempotency";

// オフラインキュー
export { OfflineQueue } from "./queue/sqlite";
export type { SQLiteDatabase } from "./queue/sqlite";

// 再送ワーカー
export { SyncWorker } from "./queue/worker";
export type { SyncWorkerConfig } from "./queue/worker";

// メッセージ
import messagesJa from "./messages/ja.json";
export { messagesJa };

// 定数
export * from "./constants/database";
