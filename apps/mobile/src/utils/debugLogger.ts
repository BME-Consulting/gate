// ==========================================
// デバッグログユーティリティ
// ==========================================

import { Alert } from "react-native";

/**
 * エラー情報の型定義
 */
interface ErrorInfo {
  operation: string;
  error: any;
  context?: Record<string, any>;
  params?: Array<{ name: string; value: any }>;
}

/**
 * パラメータの型チェックを実行
 */
function checkParameterTypes(params: Array<{ name: string; value: any }>): {
  allValid: boolean;
  invalidParams: Array<{ name: string; type: string; value: any }>;
} {
  const invalidParams: Array<{ name: string; type: string; value: any }> = [];

  for (const param of params) {
    const paramType = typeof param.value;
    // nullは許容される（SQLiteでNULLとして扱われる）
    if (paramType === "object" && param.value !== null) {
      invalidParams.push({
        name: param.name,
        type: paramType,
        value: param.value,
      });
    }
  }

  return {
    allValid: invalidParams.length === 0,
    invalidParams,
  };
}

/**
 * エラー情報をフォーマットしてAlertで表示
 */
export function showDebugError(errorInfo: ErrorInfo): void {
  const { operation, error, context, params } = errorInfo;

  // エラーメッセージの構築
  let message = `操作: ${operation}\n\nエラー: ${error?.message || String(error)}`;

  // コンテキスト情報の追加
  if (context) {
    message += "\n\nコンテキスト:";
    Object.entries(context).forEach(([key, value]) => {
      const valueType = typeof value;
      const displayValue =
        valueType === "object" && value !== null
          ? JSON.stringify(value).substring(0, 50)
          : String(value).substring(0, 50);
      message += `\n  ${key}: ${displayValue} (${valueType})`;
    });
  }

  // パラメータ情報の追加
  if (params) {
    const { allValid, invalidParams } = checkParameterTypes(params);

    message += "\n\nパラメータ:";
    params.forEach((param, index) => {
      const paramType = typeof param.value;
      const isInvalid = paramType === "object" && param.value !== null;
      const prefix = isInvalid ? "❌" : "✓";
      const displayValue =
        paramType === "object" && param.value !== null
          ? "[OBJECT]"
          : String(param.value).substring(0, 30);
      message += `\n  ${prefix} [${index + 1}] ${param.name}: ${displayValue} (${paramType})`;
    });

    // 不正なパラメータがある場合は詳細を追加
    if (!allValid) {
      message += "\n\n❌ 不正なパラメータ検出:";
      invalidParams.forEach((param) => {
        message += `\n  ${param.name}: ${param.type}型`;
        try {
          message += ` = ${JSON.stringify(param.value).substring(0, 50)}`;
        } catch {
          message += ` = [変換不可]`;
        }
      });
    }
  }

  // スタックトレース（ある場合）
  if (error?.stack) {
    const stackLines = String(error.stack).split("\n").slice(0, 5);
    message += `\n\nスタック:\n${stackLines.join("\n")}`;
  }

  // Alertで表示（長押しでコピー可能）
  console.error(`[DEBUG] ${operation}:`, {
    error,
    context,
    params,
  });

  Alert.alert(`❌ デバッグ情報（長押しでコピー）`, message, [{ text: "OK" }]);
}

/**
 * パラメータ検証エラーを表示
 */
export function showParameterValidationError(
  operation: string,
  params: Array<{ name: string; value: any }>
): void {
  const { invalidParams } = checkParameterTypes(params);

  if (invalidParams.length === 0) return;

  let message = `操作: ${operation}\n\n❌ 不正なパラメータが検出されました:\n`;

  invalidParams.forEach((param) => {
    message += `\n• ${param.name}`;
    message += `\n  型: ${param.type}`;
    try {
      const jsonStr = JSON.stringify(param.value);
      message += `\n  値: ${jsonStr.substring(0, 100)}`;
    } catch {
      message += `\n  値: [JSON変換不可]`;
    }
  });

  message += "\n\n💡 ヒント:\nSQLiteのrunAsync/execAsyncには、プリミティブ型（string, number, boolean, null）のみ渡せます。object型やarray型は渡せません。";

  console.error(`[VALIDATION ERROR] ${operation}:`, invalidParams);

  Alert.alert(`❌ パラメータ検証エラー（長押しでコピー）`, message, [
    { text: "OK" },
  ]);
}

/**
 * 成功時のデバッグ情報を表示（開発モードのみ）
 */
export function logDebugSuccess(
  operation: string,
  data?: Record<string, any>
): void {
  if (__DEV__) {
    console.log(`[DEBUG SUCCESS] ${operation}:`, data);
  }
}

/**
 * デバッグ情報をコンソールに出力
 */
export function logDebugInfo(
  operation: string,
  data: Record<string, any>
): void {
  if (__DEV__) {
    console.log(`[DEBUG INFO] ${operation}:`, data);
  }
}
