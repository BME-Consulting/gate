// ==========================================
// 初期化エラースクリーン（G-3-4）
// ==========================================
// 起動フェーズで何が起きても脱出できる専用画面
// ネットワーク / AUTH / INTEGRITY エラーに対応

import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useAppStore } from "../../store/appStore";
import Constants from "expo-constants";
import * as Updates from "expo-updates";
import { tokens } from "@mc-gate/ui-kit";

// SSOT: EAS Updates から診断情報を取得
function getDiagnostics() {
  const extra = (Constants.expoConfig?.extra as any) ?? {};

  // Channel: ✅ SSOT は Updates.channel
  const channel =
    ((Updates as any).channel as string | undefined) ||
    process.env.EAS_BUILD_PROFILE ||
    extra?.channel ||
    "unknown";

  // Runtime: ✅ SSOT は Updates.runtimeVersion
  const runtimeVersion =
    ((Updates as any).runtimeVersion as string | undefined) ||
    (Constants.expoConfig?.runtimeVersion as string | undefined) ||
    ((Constants as any).expoRuntimeVersion as string | undefined) ||
    extra?.runtimeVersion ||
    "unknown";

  // Update ID: デバッグ用（EAS Update の追跡）
  const updateId =
    ((Updates as any).updateId as string | undefined) || "unknown";

  // Embedded Launch: デバッグ用（EAS Updateが適用されてるか判別）
  const isEmbeddedLaunch = (Updates as any).isEmbeddedLaunch ?? "unknown";

  // Commit Hash: ビルド時埋め込み
  const commitHash = extra?.commitHash ?? "unknown";

  return { channel, runtimeVersion, updateId, isEmbeddedLaunch, commitHash };
}

export const InitialErrorScreen: React.FC = () => {
  const { initError, retryInitialization, resetApplication } = useAppStore();
  const diag = getDiagnostics();

  return (
    <View style={styles.container}>
      {/* タイトル */}
      <Text style={styles.title}>初期化に失敗しました</Text>

      {/* エラーメッセージ */}
      <Text style={styles.message}>
        {initError?.message ??
          "アプリの起動処理中に問題が発生しました。"}
      </Text>

      {/* アクションボタン */}
      <View style={styles.actions}>
        <Pressable
          style={styles.primaryButton}
          onPress={retryInitialization}
        >
          <Text style={styles.primaryButtonText}>🔄 再試行</Text>
        </Pressable>

        <Pressable
          style={styles.secondaryButton}
          onPress={resetApplication}
        >
          <Text style={styles.secondaryButtonText}>♻️ 初期化</Text>
        </Pressable>
      </View>

      {/* 診断情報（P2-6と一貫） */}
      <View style={styles.diagnostics}>
        <Text style={styles.diagnosticsTitle}>診断情報</Text>
        <Text style={styles.diagnosticsText}>Commit: {diag.commitHash}</Text>
        <Text style={styles.diagnosticsText}>Channel: {diag.channel}</Text>
        <Text style={styles.diagnosticsText}>Runtime: {diag.runtimeVersion}</Text>
        <Text style={styles.diagnosticsText}>UpdateId: {diag.updateId}</Text>
        <Text style={styles.diagnosticsText}>Embedded: {String(diag.isEmbeddedLaunch)}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    justifyContent: "center",
    backgroundColor: tokens.color.background.default,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 12,
    textAlign: "center",
    color: tokens.color.text.primary,
  },
  message: {
    fontSize: 14,
    color: tokens.color.text.secondary,
    textAlign: "center",
    marginBottom: 32,
    lineHeight: 20,
  },
  actions: {
    gap: 12,
    marginBottom: 32,
  },
  primaryButton: {
    backgroundColor: tokens.color.primary,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: tokens.color.border.default,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: tokens.color.text.primary,
    fontWeight: "500",
    fontSize: 14,
  },
  diagnostics: {
    marginTop: 24,
    padding: 12,
    backgroundColor: tokens.color.background.paper,
    borderRadius: 8,
  },
  diagnosticsTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: tokens.color.text.secondary,
    marginBottom: 8,
  },
  diagnosticsText: {
    fontSize: 11,
    color: tokens.color.text.secondary,
    fontFamily: "monospace",
    marginBottom: 4,
  },
});
