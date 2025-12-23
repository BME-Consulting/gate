// ==========================================
// 初期化エラースクリーン（G-3-4）
// ==========================================
// 起動フェーズで何が起きても脱出できる専用画面
// ネットワーク / AUTH / INTEGRITY エラーに対応

import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useAppStore } from "../../store/appStore";
import Constants from "expo-constants";
import { tokens } from "@mc-gate/ui-kit";

export const InitialErrorScreen: React.FC = () => {
  const { initError, retryInitialization, resetApplication } = useAppStore();

  const extra = Constants.expoConfig?.extra ?? {};
  const commitHash = extra.commitHash ?? "unknown";
  const channel = extra.channel ?? "unknown";
  const runtimeVersion = Constants.runtimeVersion ?? "unknown";

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
        <Text style={styles.diagnosticsText}>Commit: {commitHash}</Text>
        <Text style={styles.diagnosticsText}>Channel: {channel}</Text>
        <Text style={styles.diagnosticsText}>Runtime: {runtimeVersion}</Text>
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
