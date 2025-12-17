/**
 * API URL バリデーション
 *
 * P0要件:
 * - preview/production環境でLAN IPを検出した場合、即座にクラッシュ
 * - これは「バグ検知用の安全装置」であり、絶対に妥協しない
 */

export interface UrlValidationResult {
  isValid: boolean;
  url: string;
  error?: string;
}

/**
 * LAN IPアドレスのパターン（RFC 1918）
 */
const LAN_IP_PATTERNS = [
  /^http:\/\/192\.168\.\d+\.\d+/,     // 192.168.x.x
  /^http:\/\/10\.\d+\.\d+\.\d+/,      // 10.x.x.x
  /^http:\/\/172\.(1[6-9]|2\d|3[01])\.\d+\.\d+/, // 172.16.x.x - 172.31.x.x
  /^http:\/\/127\.\d+\.\d+\.\d+/,     // 127.x.x.x (localhost)
  /^http:\/\/localhost/,               // localhost
];

/**
 * API URLがLAN IPアドレスを含むかチェック
 */
function isLanIpUrl(url: string): boolean {
  return LAN_IP_PATTERNS.some(pattern => pattern.test(url));
}

/**
 * 環境に応じたURL検証
 *
 * @param url - 検証対象URL
 * @param appEnv - アプリ環境 (development/preview/production)
 * @param apiName - API名（エラーメッセージ用）
 * @returns 検証結果
 *
 * @throws {Error} preview/production環境でLAN IPが検出された場合
 */
export function validateApiUrl(
  url: string | null | undefined,
  appEnv: string,
  apiName: string
): UrlValidationResult {
  // URL未設定
  if (!url) {
    return {
      isValid: false,
      url: "",
      error: `${apiName} URLが設定されていません。アプリの再ビルドが必要です。`,
    };
  }

  // 🔴 P0: preview/production環境でLAN IP検出 → 即クラッシュ
  if (appEnv !== "development" && isLanIpUrl(url)) {
    const error = `
========================================
🚨 SECURITY VIOLATION - LAN IP DETECTED
========================================

環境: ${appEnv}
API: ${apiName}
検出URL: ${url}

preview/production環境でLAN IPアドレスが検出されました。
これはCloudflare Tunnelをバイパスする重大なセキュリティ違反です。

正しいURL:
- Face API: https://face-gate.bme-service.monster
- GS API: https://api-gate.bme-service.monster
- Auth: https://auth-gate.bme-service.monster

アプリを再ビルドしてください。
========================================
`;
    throw new Error(error);
  }

  // 🔴 P0: preview/production環境でHTTP検出 → 即クラッシュ
  if (appEnv !== "development" && url.startsWith("http://")) {
    const error = `
========================================
🚨 SECURITY VIOLATION - HTTP DETECTED
========================================

環境: ${appEnv}
API: ${apiName}
検出URL: ${url}

preview/production環境でHTTP (非暗号化) URLが検出されました。
HTTPS必須です。

アプリを再ビルドしてください。
========================================
`;
    throw new Error(error);
  }

  return {
    isValid: true,
    url,
  };
}

/**
 * 複数のAPI URLをまとめて検証
 */
export function validateAllApiUrls(
  urls: { name: string; url: string | null | undefined }[],
  appEnv: string
): void {
  for (const { name, url } of urls) {
    validateApiUrl(url, appEnv, name);
  }
}
