// ==========================================
// APIクライアント（モック実装）
// ==========================================

import type { ScanEvent } from "@mc-gate/core";
import { TIMEOUT, fetchWithTimeout } from "@mc-gate/core";

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

/**
 * エラー種別
 */
export type ApiErrorKind =
  | "DNS_ERROR"        // DNS解決失敗
  | "TLS_ERROR"        // TLS/SSL接続失敗
  | "NETWORK_ERROR"    // ネットワーク到達不可
  | "TIMEOUT"          // タイムアウト
  | "UNAUTHORIZED"     // 401 認証エラー
  | "FORBIDDEN"        // 403 権限エラー
  | "NOT_FOUND"        // 404 リソースが見つからない
  | "SERVER_ERROR"     // 5xx サーバーエラー
  | "UNKNOWN";         // 不明なエラー

/**
 * APIエラークラス（運用に優しいエラー分類）
 */
export class ApiError extends Error {
  constructor(
    public kind: ApiErrorKind,
    message: string,
    public statusCode?: number,
    public details?: any
  ) {
    super(message);
    this.name = "ApiError";
  }

  /**
   * 現場向けのユーザーフレンドリーなエラーメッセージを生成
   */
  toUserMessage(): string {
    switch (this.kind) {
      case "DNS_ERROR":
        return "通信できません（DNS）\n\nサーバーのアドレスを解決できませんでした。\nネットワーク接続とURL設定を確認してください。";

      case "TLS_ERROR":
        return "通信できません（TLS/SSL）\n\n安全な接続を確立できませんでした。\nサーバーの証明書設定を確認してください。";

      case "NETWORK_ERROR":
        return "通信できません（ネットワーク）\n\nサーバーに接続できません。\n\n• 電波状態を確認してください\n• Wi-Fi/モバイルデータが有効か確認してください\n• サーバーが起動しているか確認してください";

      case "TIMEOUT":
        return "通信できません（タイムアウト）\n\nサーバーからの応答がありませんでした。\n\n• 回線が不安定な可能性があります\n• サーバーが過負荷の可能性があります\n\nしばらく待ってから再度お試しください。";

      case "UNAUTHORIZED":
        return "ログイン期限切れ\n\nログイン情報の有効期限が切れました。\n再度ログインしてください。";

      case "FORBIDDEN":
        return "権限不足\n\nこの操作を実行する権限がありません。\n\n管理者に問い合わせてください。";

      case "NOT_FOUND":
        return "サーバーエラー（404）\n\n要求されたAPIが見つかりません。\n\nアプリのバージョンが古い可能性があります。\n最新版に更新してください。";

      case "SERVER_ERROR":
        return "サーバー障害の可能性\n\nサーバー内部でエラーが発生しました。\n\n• 一時的な障害の可能性があります\n• しばらく待ってから再度お試しください\n• 継続する場合は管理者に連絡してください";

      case "UNKNOWN":
      default:
        return `予期しないエラーが発生しました\n\n${this.message}\n\n管理者に問い合わせてください。`;
    }
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
      "Network connection failed",
      0
    );
  } else if (errorType < 0.04) {
    // 2%: タイムアウト
    throw new ApiError(
      "TIMEOUT",
      "Server response timeout",
      0
    );
  } else if (errorType < 0.045) {
    // 0.5%: 認証エラー
    throw new ApiError(
      "UNAUTHORIZED",
      "Authentication failed",
      401
    );
  } else if (errorType < 0.05) {
    // 0.5%: サーバーエラー
    throw new ApiError(
      "SERVER_ERROR",
      "Internal server error",
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
 * タイムアウト付きでスキャンイベントをサーバーに送信（実装例）
 *
 * 本番環境ではこちらを使用
 */
export async function sendScanEventWithTimeout(
  request: SendScanEventRequest,
  apiUrl: string
): Promise<SendScanEventResponse> {
  try {
    const response = await fetchWithTimeout(`${apiUrl}/api/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${request.token}`,
      },
      body: JSON.stringify(request.scanEvent),
      timeoutMs: TIMEOUT.DEFAULT, // 30秒
    });

    if (!response.ok) {
      // HTTPステータスコードに応じてエラー種別を分類
      let kind: ApiErrorKind;
      if (response.status === 401) {
        kind = "UNAUTHORIZED";
      } else if (response.status === 403) {
        kind = "FORBIDDEN";
      } else if (response.status === 404) {
        kind = "NOT_FOUND";
      } else if (response.status >= 500) {
        kind = "SERVER_ERROR";
      } else {
        kind = "UNKNOWN";
      }

      throw new ApiError(
        kind,
        `HTTP ${response.status}: ${response.statusText}`,
        response.status
      );
    }

    const result = await response.json();
    return result as SendScanEventResponse;
  } catch (error) {
    // fetchWithTimeout からのエラーを ApiError に変換
    if (error instanceof Error) {
      // 既に ApiError の場合はそのまま再throw
      if (error.name === "ApiError") {
        throw error;
      }

      // fetchWithTimeout のエラー名で分類
      if (error.name === "TimeoutError") {
        throw new ApiError("TIMEOUT", error.message);
      } else if (error.name === "DNSError") {
        throw new ApiError("DNS_ERROR", error.message);
      } else if (error.name === "TLSError") {
        throw new ApiError("TLS_ERROR", error.message);
      } else if (error.name === "NetworkError") {
        throw new ApiError("NETWORK_ERROR", error.message);
      }
    }

    // その他のエラー
    throw new ApiError(
      "UNKNOWN",
      error instanceof Error ? error.message : "Unknown error occurred"
    );
  }
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
