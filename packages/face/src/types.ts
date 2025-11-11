// ==========================================
// MCD3 通門管理 顔認証データ型定義
// ==========================================

/**
 * 顔認証データ
 *
 * カメラから検出された顔データを表す。
 * Phase 1: モック実装（固定値を返す）
 * Phase 2: 実際の顔照合API連携
 */
export interface FaceData {
  /**
   * 顔ID（顔照合API連携時に使用）
   * Phase 1: undefined
   * Phase 2: APIから返されたユニークID
   */
  faceId?: string;

  /**
   * 検出信頼度（0.0 - 1.0）
   * 顔検出の確実性を示すスコア
   */
  confidence: number;

  /**
   * 顔の矩形領域
   * カメラ画像内での顔の位置とサイズ
   */
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };

  /**
   * キャプチャ日時（ISO8601形式）
   */
  capturedAt: string;
}
