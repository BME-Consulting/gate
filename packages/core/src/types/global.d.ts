/**
 * グローバル型定義
 *
 * React Native / Expo環境で使用するグローバル変数の型定義
 */

declare global {
  /**
   * React Nativeのdevelopment mode判定
   */
  // eslint-disable-next-line no-var
  var __DEV__: boolean;

  /**
   * Node.js Timeout型（React Native環境用）
   */
  type NodeTimeout = ReturnType<typeof setTimeout>;

  /**
   * Web/React Native環境でのalert関数
   */
  function alert(message?: string): void;

  /**
   * Web/React Native環境でのconfirm関数
   */
  function confirm(message?: string): boolean;
}

// このファイルをモジュールとして扱う
export {};
