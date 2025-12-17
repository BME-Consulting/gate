/**
 * エラーメッセージテンプレート
 * UX-1: 失敗時ガイダンスの構造化
 * UX-2: 撮影品質エラー（暗い/ブレ）
 */

export type ErrorType =
  | "no_face"
  | "server_error"
  | "not_registered"
  | "camera_error"
  | "network_error"
  | "quality_dark"
  | "quality_blurred";

interface ErrorMessage {
  icon: string;
  iconColor: string;
  title: string;
  guidance: string[];
  primaryButton: string;
  secondaryButton: string;
}

export const ERROR_MESSAGES: Record<ErrorType, ErrorMessage> = {
  no_face: {
    icon: "alert-circle",
    iconColor: "#F59E0B", // warning yellow
    title: "顔が検出できませんでした",
    guidance: [
      "正面を向いてください",
      "顔全体がフレーム内に入っているか確認してください",
      "明るい場所で撮影してください",
      "眼鏡やマスクを外してみてください",
    ],
    primaryButton: "もう一度撮影",
    secondaryButton: "閉じる",
  },

  server_error: {
    icon: "cloud-offline",
    iconColor: "#EF4444", // danger red
    title: "サーバーに接続できません",
    guidance: [
      "ネットワーク接続を確認してください",
      "しばらく待ってから再度お試しください",
    ],
    primaryButton: "再試行",
    secondaryButton: "閉じる",
  },

  not_registered: {
    icon: "person-remove",
    iconColor: "#EF4444",
    title: "登録されていない顔です",
    guidance: [
      "先に顔登録を行ってください",
      "別の作業員が選択されていないか確認してください",
    ],
    primaryButton: "顔を登録する",
    secondaryButton: "閉じる",
  },

  camera_error: {
    icon: "camera-off",
    iconColor: "#EF4444",
    title: "カメラの準備中です",
    guidance: [
      "少し待ってから再度お試しください",
      "画面を切り替えてから戻ってみてください",
    ],
    primaryButton: "もう一度試す",
    secondaryButton: "閉じる",
  },

  network_error: {
    icon: "wifi-off",
    iconColor: "#EF4444",
    title: "ネットワークエラー",
    guidance: [
      "Wi-Fiまたはモバイルデータ接続を確認してください",
      "電波の良い場所に移動してください",
    ],
    primaryButton: "再試行",
    secondaryButton: "閉じる",
  },

  quality_dark: {
    icon: "sunny-outline",
    iconColor: "#F59E0B", // warning yellow
    title: "撮影環境が暗すぎます",
    guidance: [
      "明るい場所に移動してください",
      "逆光を避けてください",
      "照明を点けてください",
      "窓際など自然光のある場所で撮影してください",
    ],
    primaryButton: "もう一度撮影",
    secondaryButton: "閉じる",
  },

  quality_blurred: {
    icon: "camera-outline",
    iconColor: "#F59E0B", // warning yellow
    title: "画像がブレています",
    guidance: [
      "端末をしっかり固定してください",
      "撮影時に顔を動かさないでください",
      "カメラに近づきすぎないでください",
      "手ブレ補正のため数秒間静止してください",
    ],
    primaryButton: "もう一度撮影",
    secondaryButton: "閉じる",
  },
};
