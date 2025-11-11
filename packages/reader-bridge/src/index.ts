// ==========================================
// MCD3 通門管理 BLEリーダーブリッジ
// ==========================================

import { MockCardReader } from "./mock";
import { BLECardReader } from "./ble-reader";

export { MockCardReader } from "./mock";
export { BLECardReader } from "./ble-reader";
export type { CardData, ReaderDeviceInfo } from "./mock";

/**
 * カードリーダーのファクトリー関数
 *
 * @param useMock モックを使用する場合はtrue、実際のBLEリーダーを使用する場合はfalse
 * @returns カードリーダーのインスタンス
 *
 * @example
 * ```typescript
 * // 開発環境ではモックを使用
 * const reader = createCardReader(__DEV__);
 *
 * // 本番環境では実際のBLEリーダーを使用
 * const reader = createCardReader(false);
 * ```
 */
export function createCardReader(useMock: boolean = true) {
  return useMock ? new MockCardReader() : new BLECardReader();
}
