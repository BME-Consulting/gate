// ==========================================
// 顔認証データパーサー（Phase 1: モック実装）
// ==========================================

import type { WorkerInfo } from "@mc-gate/core";
import type { FaceData } from "./types";

/**
 * 顔認証データをパースして技能者情報を取得
 *
 * Phase 1: モック実装
 * - 固定の技能者情報を返す
 * - 実際のAPI連携は Phase 2 で実装
 *
 * Phase 2: 実装予定
 * - 顔照合APIに faceData を送信
 * - APIから返された技能者情報を返す
 * - エラーハンドリング（顔が見つからない、APIエラーなど）
 *
 * @param data 検出された顔データ
 * @returns WorkerInfo 技能者情報（モック）
 */
export async function parseFaceData(data: FaceData): Promise<WorkerInfo> {
  // TODO: Phase 2 - 実際の顔照合API連携を実装
  //
  // 実装例:
  //
  // try {
  //   // 顔照合APIに画像データを送信
  //   const response = await fetch("https://api.example.com/face-recognition", {
  //     method: "POST",
  //     headers: {
  //       "Content-Type": "application/json",
  //       "Authorization": `Bearer ${token}`,
  //     },
  //     body: JSON.stringify({
  //       faceData: data,
  //       projectId: projectId,
  //     }),
  //   });
  //
  //   if (!response.ok) {
  //     throw new Error(`顔照合APIエラー: ${response.status}`);
  //   }
  //
  //   const result = await response.json();
  //
  //   if (!result.matched) {
  //     throw new Error("登録された顔が見つかりませんでした");
  //   }
  //
  //   // APIレスポンスを WorkerInfo に変換
  //   return {
  //     personId: result.personId,
  //     name: result.name,
  //     company: result.company,
  //     ccusId: result.ccusId,
  //     ccusRegistered: !!result.ccusId,
  //     socialInsurance: result.socialInsurance,
  //     residencyStatus: result.residencyStatus,
  //     age: result.age,
  //     healthFlags: result.healthFlags,
  //     isSoleProprietor: result.isSoleProprietor,
  //   };
  // } catch (error) {
  //   throw new Error(
  //     `顔認証に失敗しました: ${error instanceof Error ? error.message : "不明なエラー"}`
  //   );
  // }

  // Phase 1: モック実装
  console.log("[MOCK] parseFaceData called with:", data);
  console.log("[MOCK] Returning mock worker info for face recognition");

  // 簡易的な遅延を追加（API呼び出しをシミュレート）
  await new Promise((resolve) => setTimeout(resolve, 500));

  // 信頼度が低い場合はエラーとして扱う
  if (data.confidence < 0.6) {
    throw new Error("顔の検出信頼度が低すぎます。もう一度お試しください。");
  }

  // モックの技能者情報を返す
  return {
    personId: "FACE-" + Date.now().toString().slice(-6),
    name: "顔認証ユーザー",
    company: "テスト会社",
    ccusId: undefined,
    ccusRegistered: false,
    socialInsurance: true,
    residencyStatus: undefined,
    age: undefined,
    healthFlags: undefined,
    isSoleProprietor: false,
  };
}

/**
 * 顔照合APIの利用可能性チェック
 *
 * Phase 1: 常に false を返す（モック実装）
 * Phase 2: 実際のAPI接続をチェック
 *
 * @returns true: API利用可能, false: API利用不可
 */
export async function isFaceRecognitionAvailable(): Promise<boolean> {
  // TODO: Phase 2 - 実際のAPI接続チェックを実装
  //
  // try {
  //   const response = await fetch("https://api.example.com/face-recognition/health", {
  //     method: "GET",
  //     headers: {
  //       "Authorization": `Bearer ${token}`,
  //     },
  //   });
  //   return response.ok;
  // } catch (error) {
  //   console.error("Face recognition API health check failed:", error);
  //   return false;
  // }

  // Phase 1: モック実装（常に利用可能として扱う）
  console.log("[MOCK] Face recognition is available (mock mode)");
  return true;
}
