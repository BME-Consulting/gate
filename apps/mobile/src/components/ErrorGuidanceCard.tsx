/**
 * エラーガイダンスカード
 * UX-1: 失敗時ガイダンスの構造化
 *
 * Alert の代わりに使用する専用UI
 * - アイコン + タイトル + 箇条書きガイダンス + ボタン
 * - サーバーに依存しないクライアント側の固定テンプレート
 */

import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { tokens } from "@mc-gate/ui-kit";
import { ERROR_MESSAGES, ErrorType } from "../constants/errorMessages";

interface Props {
  type: ErrorType;
  onRetry: () => void;
  onDismiss: () => void;
}

export function ErrorGuidanceCard({ type, onRetry, onDismiss }: Props) {
  const config = ERROR_MESSAGES[type];

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        {/* アイコン */}
        <Ionicons
          name={config.icon as any}
          size={48}
          color={config.iconColor}
        />

        {/* タイトル */}
        <Text style={styles.title}>{config.title}</Text>

        {/* ガイダンス（箇条書き） */}
        <View style={styles.guidanceContainer}>
          {config.guidance.map((item, index) => (
            <View key={index} style={styles.guidanceItem}>
              <Text style={styles.bullet}>•</Text>
              <Text style={styles.guidanceText}>{item}</Text>
            </View>
          ))}
        </View>

        {/* ボタン */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity style={styles.primaryButton} onPress={onRetry}>
            <Text style={styles.primaryButtonText}>
              {config.primaryButton}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={onDismiss}
          >
            <Text style={styles.secondaryButtonText}>
              {config.secondaryButton}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    paddingHorizontal: 16,
    paddingBottom: 40,
  },

  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    gap: 16,
  },

  title: {
    fontSize: 18,
    fontWeight: "600",
    color: tokens.color.text.primary,
    textAlign: "center",
  },

  guidanceContainer: {
    width: "100%",
    gap: 8,
  },

  guidanceItem: {
    flexDirection: "row",
    gap: 8,
  },

  bullet: {
    fontSize: 16,
    color: tokens.color.text.secondary,
  },

  guidanceText: {
    flex: 1,
    fontSize: 14,
    color: tokens.color.text.secondary,
    lineHeight: 20,
  },

  buttonContainer: {
    width: "100%",
    gap: 12,
  },

  primaryButton: {
    backgroundColor: tokens.color.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },

  primaryButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },

  secondaryButton: {
    paddingVertical: 12,
    alignItems: "center",
  },

  secondaryButtonText: {
    fontSize: 14,
    color: tokens.color.text.secondary,
  },
});
