/**
 * UX計測イベント送信サービス
 * UX-2: 品質判定結果とエラー理由を計測
 */

import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Updates from "expo-updates";

type UxEventType = "FACE_REGISTER" | "FACE_VERIFY";
type UxResult = "success" | "fail";
type UxFailReason =
  | "quality_dark"
  | "quality_blurred"
  | "no_face"
  | "network"
  | "server"
  | "camera"
  | "not_registered";
type UxApiRoute = "tunnel_url" | "lan_url";

interface UxMetricEventPayload {
  // 誰が/どの現場か
  projectId?: string;
  tenantId?: string;

  // イベント本体
  eventType: UxEventType;
  result: UxResult;
  failReason?: UxFailReason;

  // UX-2の数値
  brightnessScore?: number;
  sharpnessScore?: number;

  // 実行環境
  deviceModel?: string;
  os?: string;
  osVersion?: string;
  appVersion?: string;
  buildId?: string;
  runtimeVersion?: string;

  // 通信経路の切り分け
  apiRoute: UxApiRoute;
  faceApiBaseUrl?: string;
  gsApiBaseUrl?: string;

  // デバッグ最小
  durationMs?: number;
  httpStatus?: number;
  errorMessage?: string;

  // 1リクエスト単位の相関ID
  sessionId?: string;
  requestId?: string;
}

/**
 * UX計測イベントを送信
 */
export async function sendUxMetricEvent(
  event: Omit<
    UxMetricEventPayload,
    | "deviceModel"
    | "os"
    | "osVersion"
    | "appVersion"
    | "buildId"
    | "runtimeVersion"
    | "gsApiBaseUrl"
  >
): Promise<void> {
  try {
    const gsApiBaseUrl = Constants.expoConfig?.extra?.apiBaseGs;

    // UX計測は必須機能ではないため、設定がない場合は静かに失敗
    if (!gsApiBaseUrl) {
      console.warn("[UxMetrics] GS API設定が見つかりません。計測をスキップします。");
      return;
    }

    // デバイス情報を自動補完
    const payload: UxMetricEventPayload = {
      ...event,
      deviceModel: Device.modelName ?? undefined,
      os: Device.osName ?? undefined,
      osVersion: Device.osVersion ?? undefined,
      appVersion: Constants.expoConfig?.version ?? undefined,
      buildId: Updates.updateId ?? undefined,
      runtimeVersion: Updates.runtimeVersion ?? undefined,
      gsApiBaseUrl,
    };

    console.log(`[UxMetrics] Sending event: ${payload.eventType}/${payload.result}`);

    const apiGsApiKey = Constants.expoConfig?.extra?.apiGsApiKey;

    // UX計測は必須機能ではないため、API Keyがない場合は静かに失敗
    if (!apiGsApiKey) {
      console.warn("[UxMetrics] GS API Key設定が見つかりません。計測をスキップします。");
      return;
    }

    const response = await fetch(`${gsApiBaseUrl}/api/ux-metrics`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiGsApiKey,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error(
        `[UxMetrics] Failed to send event: ${response.status} ${response.statusText}`,
        errorData
      );
      return;
    }

    const result = await response.json();
    console.log(`[UxMetrics] Event sent successfully: ${result.id}`);
  } catch (error) {
    // 計測送信エラーは握りつぶす（本来の処理に影響しないように）
    console.error("[UxMetrics] Error sending event:", error);
  }
}

/**
 * 顔登録成功時のイベント送信
 */
export function sendFaceRegisterSuccess(params: {
  projectId?: string;
  brightnessScore: number;
  sharpnessScore: number;
  apiRoute: UxApiRoute;
  faceApiBaseUrl: string;
  durationMs: number;
  sessionId?: string;
}) {
  return sendUxMetricEvent({
    eventType: "FACE_REGISTER",
    result: "success",
    ...params,
  });
}

/**
 * 顔登録失敗時のイベント送信
 */
export function sendFaceRegisterFail(params: {
  projectId?: string;
  failReason: UxFailReason;
  brightnessScore?: number;
  sharpnessScore?: number;
  apiRoute: UxApiRoute;
  faceApiBaseUrl: string;
  durationMs?: number;
  httpStatus?: number;
  errorMessage?: string;
  sessionId?: string;
}) {
  return sendUxMetricEvent({
    eventType: "FACE_REGISTER",
    result: "fail",
    ...params,
  });
}

/**
 * 顔認証成功時のイベント送信
 */
export function sendFaceVerifySuccess(params: {
  projectId?: string;
  brightnessScore: number;
  sharpnessScore: number;
  apiRoute: UxApiRoute;
  faceApiBaseUrl: string;
  durationMs: number;
  sessionId?: string;
}) {
  return sendUxMetricEvent({
    eventType: "FACE_VERIFY",
    result: "success",
    ...params,
  });
}

/**
 * 顔認証失敗時のイベント送信
 */
export function sendFaceVerifyFail(params: {
  projectId?: string;
  failReason: UxFailReason;
  brightnessScore?: number;
  sharpnessScore?: number;
  apiRoute: UxApiRoute;
  faceApiBaseUrl: string;
  durationMs?: number;
  httpStatus?: number;
  errorMessage?: string;
  sessionId?: string;
}) {
  return sendUxMetricEvent({
    eventType: "FACE_VERIFY",
    result: "fail",
    ...params,
  });
}
