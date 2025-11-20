/**
 * グローバル型定義
 *
 * React Native / Expo環境で使用するグローバル変数の型定義
 */

declare global {
  /**
   * React Nativeのdevelopment mode判定
   */
  var __DEV__: boolean;

  /**
   * Node.js Timeout型（React Native環境用）
   */
  type NodeTimeout = ReturnType<typeof setTimeout>;
}

// このファイルをモジュールとして扱う
export {};
