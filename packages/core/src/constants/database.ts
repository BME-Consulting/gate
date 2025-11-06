// ==========================================
// データベース定数
// ==========================================

/**
 * SQLiteデータベース名
 */
export const DB_NAME = "mc-gate.db";

/**
 * デフォルトのプロジェクトID（モック開発用）
 */
export const DEFAULT_PROJECT_ID = "PRJ001";

/**
 * ダミーデータ生成のデフォルト件数
 */
export const DEFAULT_SEED_COUNT = 50;

/**
 * 履歴取得のデフォルト上限
 */
export const DEFAULT_HISTORY_LIMIT = 100;

/**
 * 同期ワーカーの実行間隔（ミリ秒）
 * 30秒ごとに同期
 */
export const SYNC_INTERVAL_MS = 30000;

/**
 * 送信リトライの最大回数
 */
export const MAX_RETRIES = 5;
