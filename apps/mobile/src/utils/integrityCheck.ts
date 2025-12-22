// ==========================================
// P2-6: Runtime Integrity Check System
// EAS Update の不整合を構造的に検知・遮断
// ==========================================

import Constants from "expo-constants";
import * as Updates from "expo-updates";
import { Alert } from "react-native";

/**
 * P2-6-2: 必須シンボルの存在チェック
 * アプリ起動時に必須関数が存在することを確認
 */
export interface IntegrityCheckResult {
  isValid: boolean;
  missingSymbols: string[];
  commitHash: string;
  updateId: string | null;
  isEmbeddedLaunch: boolean;
  channel: string | null;
}

/**
 * 必須シンボルをチェック（起動時実行）
 * @param requiredChecks チェック対象の関数群
 * @returns 整合性チェック結果
 */
export function performIntegrityCheck(
  requiredChecks: Record<string, () => boolean>
): IntegrityCheckResult {
  const commitHash = Constants.expoConfig?.extra?.commitHash || "unknown";
  const updateId = Updates.updateId || null;
  const isEmbeddedLaunch = Updates.isEmbeddedLaunch ?? false;
  const channel = Updates.channel || null;

  const missingSymbols: string[] = [];

  // 各必須シンボルの存在をチェック
  for (const [symbolName, checkFn] of Object.entries(requiredChecks)) {
    try {
      if (!checkFn()) {
        missingSymbols.push(symbolName);
      }
    } catch (error) {
      console.error(`[IntegrityCheck] Error checking ${symbolName}:`, error);
      missingSymbols.push(symbolName);
    }
  }

  const isValid = missingSymbols.length === 0;

  // デバッグログ出力
  console.log("==================== INTEGRITY CHECK ====================");
  console.log(`[P2-6] Commit Hash: ${commitHash}`);
  console.log(`[P2-6] Update ID: ${updateId || "なし（埋め込みビルド）"}`);
  console.log(`[P2-6] Launch Mode: ${isEmbeddedLaunch ? "埋め込み" : "OTA Update"}`);
  console.log(`[P2-6] Channel: ${channel || "不明"}`);
  console.log(`[P2-6] Integrity: ${isValid ? "✅ PASS" : "❌ FAIL"}`);
  if (missingSymbols.length > 0) {
    console.log(`[P2-6] Missing Symbols: ${missingSymbols.join(", ")}`);
  }
  console.log("=========================================================");

  return {
    isValid,
    missingSymbols,
    commitHash,
    updateId,
    isEmbeddedLaunch,
    channel,
  };
}

/**
 * 整合性エラーをユーザーに通知
 * @param result 整合性チェック結果
 * @param onRetry 再起動/再インストール処理
 */
export function showIntegrityAlert(
  result: IntegrityCheckResult,
  onRetry?: () => void
): void {
  const { missingSymbols, commitHash, updateId, isEmbeddedLaunch, channel } = result;

  const diagnosticInfo = `
診断情報:
━━━━━━━━━━━━━━━━━━━━
Commit: ${commitHash}
Update ID: ${updateId || "なし"}
起動モード: ${isEmbeddedLaunch ? "埋め込み" : "OTA"}
Channel: ${channel || "不明"}
欠落機能: ${missingSymbols.join(", ")}
━━━━━━━━━━━━━━━━━━━━

対処方法:
1. アプリを完全終了して再起動
2. それでも改善しない場合は再インストール
3. 管理者に問い合わせ（上記の診断情報を共有）`;

  Alert.alert(
    "⚠️ アプリ更新エラー",
    "アプリの更新が正しく反映されていません。\n必要な機能が利用できない状態です。",
    [
      {
        text: "診断情報を見る",
        onPress: () => {
          Alert.alert("診断情報", diagnosticInfo, [
            { text: "閉じる", style: "cancel" },
            onRetry ? { text: "再起動", onPress: onRetry } : null,
          ].filter(Boolean));
        },
      },
      {
        text: "アプリを終了",
        onPress: () => {
          // React Native doesn't have a built-in exit method
          // User must manually close the app
          Alert.alert(
            "手動でアプリを終了してください",
            "ホームボタンを押してアプリ一覧から終了させ、再度起動してください。"
          );
        },
        style: "destructive",
      },
    ],
    { cancelable: false }
  );
}

/**
 * P2-6-3用: Evidence Pack用の整合性情報を生成
 */
export function generateIntegrityEvidence(result: IntegrityCheckResult): string {
  const timestamp = new Date().toISOString();
  const status = result.isValid ? "PASS ✅" : "FAIL ❌";

  return `
## Mobile JS Integrity Evidence

**Timestamp**: ${timestamp}
**Status**: ${status}

### Runtime Information
- **Runtime Version**: ${Constants.expoConfig?.runtimeVersion || "unknown"}
- **Update ID**: ${result.updateId || "N/A (Embedded)"}
- **Commit Hash (Runtime)**: ${result.commitHash}
- **Launch Mode**: ${result.isEmbeddedLaunch ? "Embedded" : "OTA Update"}
- **Channel**: ${result.channel || "N/A"}

### Integrity Check Result
- **Required Symbols Check**: ${result.isValid ? "All Present" : "Missing"}
${result.missingSymbols.length > 0 ? `- **Missing Symbols**: ${result.missingSymbols.join(", ")}` : ""}

### Expected Values
- **Expected Commit Hash**: ${process.env.EXPECTED_COMMIT || "Not specified"}
- **Integrity Status**: ${status}

${!result.isValid ? "⚠️ WARNING: Integrity check failed. The app may not function correctly." : ""}
`;
}