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
export * from "./constants/auth";
export * from "./constants/database";
export * from "./constants/timeout";

// ユーティリティ
export { validateApiUrl, validateAllApiUrls } from "./utils/urlValidator";
export type { UrlValidationResult } from "./utils/urlValidator";

// リポジトリ
export { WorkerRepository } from "./repository/worker-repository";
export type { SQLiteDatabase as WorkerRepositorySQLiteDatabase } from "./repository/worker-repository";

// 顔認証 (ローカルマッチャー)
export { LocalFaceMatcher } from "./face/local-matcher";
export {
  calculateEuclideanDistance,
  distanceToConfidence,
  isSamePerson,
} from "./face/local-matcher";
export type { FaceMatchResult } from "./face/local-matcher";
