/**
 * タイムアウト設定
 */
export const TIMEOUT = {
  /** 通常のAPIリクエスト */
  DEFAULT: 30000, // 30秒

  /** 画像アップロード */
  UPLOAD: 60000, // 60秒

  /** 大量データ取得 */
  BULK_FETCH: 90000, // 90秒

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
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeoutMs?: number } = {}
): Promise<Response> {
  const { timeoutMs = TIMEOUT.DEFAULT, ...fetchOptions } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`リクエストがタイムアウトしました（${timeoutMs / 1000}秒）`);
    }
    throw error;
  }
}
