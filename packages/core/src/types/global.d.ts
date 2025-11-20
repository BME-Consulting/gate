/**
 * グローバル型定義
 *
 * React Native / Expo環境で使用するグローバル変数とWeb APIの型定義
 */

// グローバル関数
declare function alert(message?: string): void;

// Windowオブジェクト（Web環境のみ）
declare interface Window {
  confirm(message?: string): boolean;
  alert(message?: string): void;
}

// Node.js Timeoutの型定義を明示
declare type NodeTimeout = ReturnType<typeof setTimeout>;
