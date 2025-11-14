// ==========================================
// 認証定数
// ==========================================

/**
 * 開発環境用のデフォルトAPIキー
 * 本番環境では環境変数API_KEYを必ず設定すること
 */
export const DEV_API_KEY = "development-api-key-12345";

/**
 * APIキーヘッダー名
 */
export const API_KEY_HEADER = "x-api-key";

/**
 * Authorization ヘッダーのプレフィックス
 * 使用例: "Authorization: ApiKey {key}"
 */
export const API_KEY_PREFIX = "ApiKey";
