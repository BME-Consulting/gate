/**
 * タイムアウト設定
 */
export const TIMEOUT = {
  /** 通常のAPIリクエスト */
  DEFAULT: 30000, // 30秒

  /** 画像アップロード */
  UPLOAD: 60000, // 60秒

  /** 大量データ取得 */
  BULK_FETCH: 10000, // 10秒（UX改善: 90秒→10秒に短縮）

  /** ロングポーリング */
  LONG_POLLING: 120000, // 120秒

  /** Face API 顔認証 */
  FACE_RECOGNITION: 30000, // 30秒

  /** データベース操作 */
  DATABASE: 10000, // 10秒
} as const;

export type TimeoutType = keyof typeof TIMEOUT;

/**
 * タイムアウト付きfetch関数
 *
 * エラー分類のために、エラー種別を name プロパティで識別可能にする
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeoutMs?: number } = {}
): Promise<Response> {
  const { timeoutMs = TIMEOUT.DEFAULT, ...fetchOptions } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // AbortSignal型の互換性問題を回避 - controller.signalの型がglobal.AbortSignalと完全には互換性がないが実行時には問題ない
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal as any,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error) {
      // タイムアウトエラー
      if (error.name === 'AbortError') {
        const timeoutError = new Error(`Request timeout after ${timeoutMs / 1000}s`);
        timeoutError.name = 'TimeoutError';
        throw timeoutError;
      }

      // ネットワークエラーの詳細分類
      const errorMessage = error.message.toLowerCase();

      // DNS解決失敗
      if (errorMessage.includes('dns') || errorMessage.includes('enotfound') || errorMessage.includes('getaddrinfo')) {
        const dnsError = new Error(`DNS resolution failed: ${error.message}`);
        dnsError.name = 'DNSError';
        throw dnsError;
      }

      // TLS/SSL エラー
      if (errorMessage.includes('tls') || errorMessage.includes('ssl') || errorMessage.includes('certificate')) {
        const tlsError = new Error(`TLS/SSL error: ${error.message}`);
        tlsError.name = 'TLSError';
        throw tlsError;
      }

      // ネットワーク到達不可
      if (errorMessage.includes('network') || errorMessage.includes('failed to fetch') || errorMessage.includes('econnrefused')) {
        const networkError = new Error(`Network connection failed: ${error.message}`);
        networkError.name = 'NetworkError';
        throw networkError;
      }
    }

    // その他のエラーはそのまま再throw
    throw error;
  }
}
