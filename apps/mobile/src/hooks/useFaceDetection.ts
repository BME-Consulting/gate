// ==========================================
// 顔検出フック（スタブ実装 - frameProcessor無効化版）
// ==========================================
//
// 【重要】このファイルは frameProcessor を完全に無効化したスタブ実装です
//
// 理由:
// - react-native-vision-camera v4.7.3 の frameProcessor は
//   React Native 0.81 + New Architecture + worklets-core の
//   組み合わせで WorkletsError が発生
// - Expo Updates の自動ロールバックにより、ビルドとUpdateが
//   不整合を起こして安定動作が困難
//
// 現在の方針:
// - 顔検出はすべてサーバー側（Face API）に寄せる
// - クライアント側はカメラプレビュー + 写真撮影のみ
// - リアルタイム顔検出は将来的に Dev Client 環境で再実装
//
// ==========================================

interface FaceDetectionOptions {
  enabled: boolean;
  onFacesDetected: (faces: any[]) => void;
  minFaceSize?: number;
  cooldownMs?: number;
}

/**
 * スタブ実装: frameProcessor を返さない
 *
 * auth.tsx / face-registration.tsx から呼ばれても
 * 何も起きないため、クラッシュしない
 *
 * @returns undefined - VisionCamera の frameProcessor prop に
 *          undefined が渡される = frame processing が実行されない
 */
export function useFaceDetection(_options: FaceDetectionOptions) {
  // frameProcessor を返さない = VisionCamera の frameProcessor prop に
  // undefined が渡される = frame processing が実行されない
  return undefined;
}
