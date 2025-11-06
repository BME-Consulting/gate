// ==========================================
// エラーガイドモーダル
// ==========================================

import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
} from "react-native";
import { Button, tokens } from "@mc-gate/ui-kit";

interface ErrorGuideModalProps {
  visible: boolean;
  error: ApiError | null;
  onClose: () => void;
  onRetry?: () => void;
}

interface ApiError {
  code: string;
  message: string;
  statusCode?: number;
}

interface ErrorGuide {
  title: string;
  description: string;
  steps: string[];
  retryable: boolean;
}

const ERROR_GUIDES: Record<string, ErrorGuide> = {
  NETWORK_ERROR: {
    title: "ネットワークエラー",
    description: "サーバーとの通信に失敗しました。",
    steps: [
      "インターネット接続を確認してください",
      "Wi-Fiまたはモバイルデータ通信が有効になっているか確認してください",
      "機内モードがオフになっているか確認してください",
      "しばらく待ってから再試行してください",
    ],
    retryable: true,
  },
  TIMEOUT: {
    title: "タイムアウトエラー",
    description: "サーバーからの応答がありませんでした。",
    steps: [
      "ネットワークの接続状況を確認してください",
      "サーバーが混雑している可能性があります",
      "しばらく待ってから再試行してください",
      "問題が続く場合は管理者に連絡してください",
    ],
    retryable: true,
  },
  UNAUTHORIZED: {
    title: "認証エラー",
    description: "ログインセッションが無効です。",
    steps: [
      "ログアウトして再度ログインしてください",
      "IDとパスワードが正しいか確認してください",
      "アカウントがロックされていないか管理者に確認してください",
    ],
    retryable: false,
  },
  FORBIDDEN: {
    title: "アクセス権限エラー",
    description: "この操作を実行する権限がありません。",
    steps: [
      "管理者にアクセス権限を確認してください",
      "現場の設定が正しいか確認してください",
      "アカウントの役割を管理者に確認してください",
    ],
    retryable: false,
  },
  NOT_FOUND: {
    title: "リソース未検出",
    description: "要求されたデータが見つかりませんでした。",
    steps: [
      "現場設定が正しいか確認してください",
      "データが削除されていないか管理者に確認してください",
      "アプリを再起動してデータを同期してください",
    ],
    retryable: true,
  },
  SERVER_ERROR: {
    title: "サーバーエラー",
    description: "サーバー側でエラーが発生しました。",
    steps: [
      "しばらく待ってから再試行してください",
      "問題が続く場合は管理者に連絡してください",
      "エラーコードとメッセージを控えておいてください",
    ],
    retryable: true,
  },
  VALIDATION_ERROR: {
    title: "データ検証エラー",
    description: "入力されたデータが不正です。",
    steps: [
      "入力内容を確認してください",
      "必須項目がすべて入力されているか確認してください",
      "データ形式が正しいか確認してください",
    ],
    retryable: false,
  },
  SYNC_ERROR: {
    title: "同期エラー",
    description: "データの同期に失敗しました。",
    steps: [
      "ネットワーク接続を確認してください",
      "ストレージの空き容量を確認してください",
      "アプリを再起動してください",
      "問題が続く場合はデータを手動で送信してください",
    ],
    retryable: true,
  },
  UNKNOWN: {
    title: "不明なエラー",
    description: "予期しないエラーが発生しました。",
    steps: [
      "アプリを再起動してください",
      "最新バージョンに更新してください",
      "問題が続く場合は管理者に連絡してください",
      "エラーメッセージを控えておいてください",
    ],
    retryable: true,
  },
};

export function ErrorGuideModal({
  visible,
  error,
  onClose,
  onRetry,
}: ErrorGuideModalProps) {
  if (!error) return null;

  const guide = ERROR_GUIDES[error.code] || ERROR_GUIDES.UNKNOWN;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <ScrollView>
            <View style={styles.header}>
              <Text style={styles.icon}>⚠️</Text>
              <Text style={styles.title}>{guide.title}</Text>
            </View>

            <View style={styles.content}>
              <Text style={styles.description}>{guide.description}</Text>

              {error.message && (
                <View style={styles.errorBox}>
                  <Text style={styles.errorLabel}>エラーメッセージ:</Text>
                  <Text style={styles.errorMessage}>{error.message}</Text>
                  {error.statusCode && (
                    <Text style={styles.errorCode}>
                      ステータスコード: {error.statusCode}
                    </Text>
                  )}
                </View>
              )}

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>対処方法</Text>
                {guide.steps.map((step, index) => (
                  <View key={index} style={styles.step}>
                    <Text style={styles.stepNumber}>{index + 1}.</Text>
                    <Text style={styles.stepText}>{step}</Text>
                  </View>
                ))}
              </View>
            </View>
          </ScrollView>

          <View style={styles.actions}>
            <Button
              title="閉じる"
              variant="secondary"
              onPress={onClose}
              style={styles.button}
            />
            {guide.retryable && onRetry && (
              <Button
                title="再試行"
                variant="primary"
                onPress={onRetry}
                style={styles.button}
              />
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },

  container: {
    width: "90%",
    maxWidth: 500,
    maxHeight: "80%",
    backgroundColor: tokens.color.background.default,
    borderRadius: tokens.radius.lg,
    ...tokens.shadow.lg,
  },

  header: {
    alignItems: "center",
    padding: tokens.spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.border.default,
  },

  icon: {
    fontSize: 48,
    marginBottom: tokens.spacing.md,
  },

  title: {
    fontSize: tokens.font.size.h2,
    fontWeight: tokens.font.weight.bold,
    color: tokens.color.text.primary,
    textAlign: "center",
  },

  content: {
    padding: tokens.spacing.xl,
  },

  description: {
    fontSize: tokens.font.size.base,
    color: tokens.color.text.secondary,
    marginBottom: tokens.spacing.lg,
    lineHeight: 24,
  },

  errorBox: {
    backgroundColor: tokens.color.danger + "10",
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.md,
    marginBottom: tokens.spacing.lg,
    borderWidth: 1,
    borderColor: tokens.color.danger + "30",
  },

  errorLabel: {
    fontSize: tokens.font.size.sm,
    fontWeight: tokens.font.weight.semibold,
    color: tokens.color.danger,
    marginBottom: tokens.spacing.xs,
  },

  errorMessage: {
    fontSize: tokens.font.size.sm,
    color: tokens.color.text.primary,
    marginBottom: tokens.spacing.xs,
  },

  errorCode: {
    fontSize: tokens.font.size.xs,
    color: tokens.color.text.secondary,
  },

  section: {
    marginBottom: tokens.spacing.lg,
  },

  sectionTitle: {
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.semibold,
    color: tokens.color.text.primary,
    marginBottom: tokens.spacing.md,
  },

  step: {
    flexDirection: "row",
    marginBottom: tokens.spacing.md,
  },

  stepNumber: {
    fontSize: tokens.font.size.base,
    fontWeight: tokens.font.weight.semibold,
    color: tokens.color.primary,
    marginRight: tokens.spacing.sm,
    minWidth: 24,
  },

  stepText: {
    flex: 1,
    fontSize: tokens.font.size.base,
    color: tokens.color.text.primary,
    lineHeight: 24,
  },

  actions: {
    flexDirection: "row",
    gap: tokens.spacing.md,
    padding: tokens.spacing.xl,
    borderTopWidth: 1,
    borderTopColor: tokens.color.border.default,
  },

  button: {
    flex: 1,
  },
});
