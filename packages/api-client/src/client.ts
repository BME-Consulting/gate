// ==========================================
// APIクライアント（モック実装）
// ==========================================

import type { ScanEvent } from "@mc-gate/core";

export interface SendScanEventRequest {
  scanEvent: ScanEvent;
  token: string;
}

export interface SendScanEventResponse {
  success: boolean;
  serverReceipt: boolean;
  message?: string;
  timestamp: string;
}

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode?: number,
    public details?: any
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * スキャンイベントをサーバーに送信（モック）
 *
 * 本番環境では OpenAPI から生成されたクライアントと置き換え
 */
export async function sendScanEvent(
  request: SendScanEventRequest
): Promise<SendScanEventResponse> {
  // モック: ネットワーク遅延をシミュレート
  await new Promise((resolve) => setTimeout(resolve, 500));

  // モック: エラーパターンをシミュレート
  const errorType = Math.random();

  if (errorType < 0.02) {
    // 2%: ネットワークエラー
    throw new ApiError(
      "NETWORK_ERROR",
      "ネットワーク接続に失敗しました",
      0
    );
  } else if (errorType < 0.04) {
    // 2%: タイムアウト
    throw new ApiError(
      "TIMEOUT",
      "サーバーからの応答がタイムアウトしました",
      0
    );
  } else if (errorType < 0.045) {
    // 0.5%: 認証エラー
    throw new ApiError(
      "UNAUTHORIZED",
      "認証に失敗しました。再度ログインしてください。",
      401
    );
  } else if (errorType < 0.05) {
    // 0.5%: サーバーエラー
    throw new ApiError(
      "SERVER_ERROR",
      "サーバー内部エラーが発生しました",
      500
    );
  }

  return {
    success: true,
    serverReceipt: true,
    message: "送信が完了しました",
    timestamp: new Date().toISOString(),
  };
}

/**
 * ネットワーク接続状態を確認
 */
export async function checkConnection(): Promise<boolean> {
  try {
    // モック: 常にオンライン
    return true;
  } catch {
    return false;
  }
}
