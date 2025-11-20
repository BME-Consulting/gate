// ==========================================
// デバッグ画面（開発用）
// ==========================================

import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Platform, Alert } from "react-native";
import { Button, tokens } from "@mc-gate/ui-kit";
import { useQueue } from "../../hooks/useQueue";
import { useAppStore } from "../../store/appStore";

// Web互換のアラート関数
const showAlert = (title: string, message: string) => {
  if (Platform.OS === "web") {
    // Web環境でのみ alert を使用
    if (typeof globalThis !== "undefined" && "alert" in globalThis) {
      globalThis.alert(`${title}\n\n${message}`);
    } else {
      console.warn(`${title}: ${message}`);
    }
  } else {
    Alert.alert(title, message);
  }
};

export default function DebugScreen() {
  const { currentProject } = useAppStore();
  const { isReady, getQueueCounts, getHistory } = useQueue();
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<{
    pending: number;
    sent: number;
    failed: number;
    total: number;
  } | null>(null);

  const handleGenerateDummyData = async () => {
    if (Platform.OS === "web") {
      showAlert(
        "Web環境では使用不可",
        "ダミーデータ生成はネイティブ環境（iOS/Android）でのみ利用可能です。"
      );
      return;
    }

    if (!currentProject) {
      showAlert(
        "現場が未選択",
        "設定画面から現場を選択してください。"
      );
      return;
    }

    setLoading(true);
    try {
      const { seedDummyData } = require("../../utils/seedData");
      const result = await seedDummyData(50);

      if (result.success) {
        showAlert("成功", `${result.count}件のダミーデータを生成しました！`);
        await loadStats();
      }
    } catch (error) {
      console.error("Error generating dummy data:", error);
      showAlert(
        "エラー",
        error instanceof Error ? error.message : "ダミーデータの生成に失敗しました"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleClearAllData = async () => {
    if (Platform.OS === "web") {
      showAlert(
        "Web環境では使用不可",
        "データ削除はネイティブ環境（iOS/Android）でのみ利用可能です。"
      );
      return;
    }

    setLoading(true);
    try {
      const { clearDummyData } = require("../../utils/seedData");
      const result = await clearDummyData();

      if (result.success) {
        showAlert("成功", "全てのスキャンイベントを削除しました！");
        await loadStats();
      }
    } catch (error) {
      console.error("Error clearing data:", error);
      showAlert(
        "エラー",
        error instanceof Error ? error.message : "データの削除に失敗しました"
      );
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    if (!currentProject || !isReady) return;

    try {
      const counts = await getQueueCounts();
      const total = counts.pending + counts.sent + counts.failed;
      setStats({ ...counts, total });
    } catch (error) {
      console.error("Error loading stats:", error);
    }
  };

  const handleLoadStats = async () => {
    setLoading(true);
    await loadStats();
    setLoading(false);
  };

  if (Platform.OS === "web") {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <View style={styles.warningCard}>
            <Text style={styles.warningTitle}>⚠️ Web環境では使用不可</Text>
            <Text style={styles.warningText}>
              デバッグ機能はネイティブ環境（iOS/Android）でのみ利用可能です。
              {"\n\n"}
              ダミーデータの生成・削除にはSQLiteデータベースへの直接アクセスが必要なため、
              実機またはシミュレータでアプリを起動してください。
            </Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🐛 開発用デバッグツール</Text>
          <Text style={styles.cardText}>
            テスト用のダミーデータを生成・管理できます
          </Text>
        </View>

        {/* 統計情報 */}
        {stats && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>📊 現在のデータ統計</Text>
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>合計</Text>
                <Text style={styles.statValue}>{stats.total}</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>送信済</Text>
                <Text style={[styles.statValue, { color: tokens.color.success }]}>
                  {stats.sent}
                </Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>送信待</Text>
                <Text style={[styles.statValue, { color: tokens.color.warn }]}>
                  {stats.pending}
                </Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>失敗</Text>
                <Text style={[styles.statValue, { color: tokens.color.danger }]}>
                  {stats.failed}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* アクション */}
        <View style={styles.section}>
          <Button
            title="📊 統計情報を更新"
            variant="secondary"
            onPress={handleLoadStats}
            loading={loading}
            disabled={loading}
            fullWidth
          />

          <Button
            title="🎲 ダミーデータを生成（50件）"
            variant="primary"
            onPress={handleGenerateDummyData}
            loading={loading}
            disabled={loading}
            fullWidth
          />

          <Button
            title="🗑️ 全データを削除"
            variant="danger"
            onPress={handleClearAllData}
            loading={loading}
            disabled={loading}
            fullWidth
          />
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>ℹ️ ダミーデータについて</Text>
          <Text style={styles.infoText}>
            • 20種類の技能者ID（P001～P020）{"\n"}
            • QRコード/CCUSカードの混在{"\n"}
            • 入場/退場のランダム分布{"\n"}
            • 送信状態: 70% 送信済, 20% 送信待, 10% 失敗{"\n"}
            • ルール判定: 70% 許可, 25% 警告, 5% ブロック{"\n"}
            • 過去24時間以内のタイムスタンプ
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.color.background.paper,
  },

  content: {
    padding: tokens.spacing.lg,
    gap: tokens.spacing.lg,
  },

  card: {
    backgroundColor: tokens.color.background.default,
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.lg,
    ...tokens.shadow.sm,
  },

  cardTitle: {
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.semibold,
    color: tokens.color.text.primary,
    marginBottom: tokens.spacing.sm,
  },

  cardText: {
    fontSize: tokens.font.size.base,
    color: tokens.color.text.secondary,
  },

  statsRow: {
    flexDirection: "row",
    gap: tokens.spacing.md,
    marginTop: tokens.spacing.sm,
  },

  statItem: {
    flex: 1,
    alignItems: "center",
  },

  statLabel: {
    fontSize: tokens.font.size.xs,
    color: tokens.color.text.secondary,
    marginBottom: tokens.spacing.xs,
  },

  statValue: {
    fontSize: tokens.font.size.h3,
    fontWeight: tokens.font.weight.bold,
    color: tokens.color.text.primary,
  },

  section: {
    gap: tokens.spacing.md,
  },

  infoCard: {
    backgroundColor: tokens.color.primary + "10",
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.lg,
    borderWidth: 1,
    borderColor: tokens.color.primary + "30",
  },

  infoTitle: {
    fontSize: tokens.font.size.base,
    fontWeight: tokens.font.weight.semibold,
    color: tokens.color.primary,
    marginBottom: tokens.spacing.sm,
  },

  infoText: {
    fontSize: tokens.font.size.sm,
    color: tokens.color.text.primary,
    lineHeight: 20,
  },

  warningCard: {
    backgroundColor: tokens.color.warn + "10",
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.xl,
    borderWidth: 2,
    borderColor: tokens.color.warn,
    alignItems: "center",
  },

  warningTitle: {
    fontSize: tokens.font.size.h3,
    fontWeight: tokens.font.weight.bold,
    color: tokens.color.warn,
    marginBottom: tokens.spacing.md,
    textAlign: "center",
  },

  warningText: {
    fontSize: tokens.font.size.base,
    color: tokens.color.text.primary,
    textAlign: "center",
    lineHeight: 24,
  },
});
