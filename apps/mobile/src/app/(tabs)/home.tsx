// ==========================================
// ホーム画面
// ==========================================

import React, { useState, useEffect, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Platform, Alert } from "react-native";
import { tokens, Banner, Button } from "@mc-gate/ui-kit";
import { formatDate } from "@mc-gate/utils";
import { useAppStore } from "../../store/appStore";
import { useQueue } from "../../hooks/useQueue";
import { useNetworkStatus } from "../../hooks/useNetworkStatus";
import { useFocusEffect } from "expo-router";

type StatsDisplayMode = "inout" | "total";

// Web互換のアラート関数
const showAlert = (title: string, message: string, onConfirm?: () => void) => {
  if (Platform.OS === "web") {
    const confirmed = window.confirm(`${title}\n\n${message}`);
    if (confirmed && onConfirm) onConfirm();
  } else {
    Alert.alert(title, message, [
      { text: "キャンセル", style: "cancel" },
      { text: "OK", onPress: onConfirm },
    ]);
  }
};

export default function HomeScreen() {
  const { user, currentProject } = useAppStore();
  const { isReady, getTodayStats, getLatestEvent, getQueueCounts } = useQueue();
  const { isOffline } = useNetworkStatus();

  const [statsMode, setStatsMode] = useState<StatsDisplayMode>("inout");
  const [stats, setStats] = useState({
    currentInSite: 0,
    todayIn: 0,
    todayOut: 0,
  });
  const [statsResetDate, setStatsResetDate] = useState<Date>(new Date());
  const [queueCounts, setQueueCounts] = useState({
    pending: 0,
    sent: 0,
    failed: 0,
  });
  const [latestScan, setLatestScan] = useState<{
    name: string;
    time: string;
    type: string;
  } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // 統計データをロード（依存関係を明示的に管理）
  const loadStats = useCallback(async () => {
    if (!currentProject || !isReady) return;

    try {
      // 統計を取得
      const todayStats = await getTodayStats(currentProject.projectId);
      setStats(todayStats);

      // キュー件数を取得
      const counts = await getQueueCounts();
      setQueueCounts(counts);

      // 最新イベントを取得
      const latest = await getLatestEvent(currentProject.projectId);
      if (latest) {
        // personIdからnameを取得する必要があるが、現状はpersonIdをそのまま表示
        // TODO: 技能者情報を別途管理して名前を取得
        setLatestScan({
          name: latest.personId,
          time: formatDate(latest.occurredAt, "time"),
          type: latest.decidedMode === "IN" ? "入場" : "退場",
        });
      } else {
        setLatestScan(null);
      }
    } catch (error) {
      console.error("Failed to load stats:", error);
    }
  }, [currentProject, isReady, getTodayStats, getQueueCounts, getLatestEvent]);

  // 画面フォーカス時にデータを更新
  useFocusEffect(
    useCallback(() => {
      loadStats();
    }, [loadStats])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadStats();
    setRefreshing(false);
  };

  const handleResetStats = () => {
    showAlert(
      "統計リセット確認",
      "受付人数カウントをリセットしますか？\n※データは削除されず、表示のみリセットされます",
      () => {
        setStatsResetDate(new Date());
        setStats({ currentInSite: 0, todayIn: 0, todayOut: 0 });
      }
    );
  };

  const handleToggleStatsMode = () => {
    setStatsMode((prev) => (prev === "inout" ? "total" : "inout"));
  };

  if (!isReady && Platform.OS !== "web") {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <Text style={styles.loadingText}>初期化中...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {isOffline && (
        <Banner
          message="オフラインモード：データは端末に保存され、オンライン復帰時に送信されます"
          variant="warn"
        />
      )}

      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        <View style={styles.content}>
        {/* ユーザー情報 */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>ユーザー情報</Text>
          <Text style={styles.cardText}>氏名: {user?.name}</Text>
          <Text style={styles.cardText}>
            現場: {currentProject?.name || "未選択"}
          </Text>
        </View>

        {/* 在場者数 */}
        <View style={[styles.card, styles.statCard]}>
          <Text style={styles.statLabel}>現在の在場者数</Text>
          <Text style={styles.statValue}>{stats.currentInSite}人</Text>
        </View>

        {/* 統計表示切替ボタン */}
        <View style={styles.statsHeader}>
          <TouchableOpacity
            style={styles.toggleButton}
            onPress={handleToggleStatsMode}
          >
            <Text style={styles.toggleButtonText}>
              {statsMode === "inout" ? "📊 延べ表示に切替" : "📊 入退場表示に切替"}
            </Text>
          </TouchableOpacity>
          <Button
            title="リセット"
            variant="secondary"
            size="sm"
            onPress={handleResetStats}
            style={styles.resetButton}
          />
        </View>

        {/* 今日の入退場 / 延べ表示 */}
        {statsMode === "inout" ? (
          <View style={styles.row}>
            <View style={[styles.card, styles.halfCard]}>
              <Text style={styles.statLabel}>今日の入場</Text>
              <Text style={styles.statValueSmall}>{stats.todayIn}人</Text>
            </View>
            <View style={[styles.card, styles.halfCard]}>
              <Text style={styles.statLabel}>今日の退場</Text>
              <Text style={styles.statValueSmall}>{stats.todayOut}人</Text>
            </View>
          </View>
        ) : (
          <View style={[styles.card, styles.statCard]}>
            <Text style={styles.statLabel}>延べ人数（入場+退場）</Text>
            <Text style={styles.statValue}>{stats.todayIn + stats.todayOut}人</Text>
          </View>
        )}

        {/* 最新通門 */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>最新通門</Text>
          {latestScan ? (
            <>
              <Text style={styles.cardText}>
                {latestScan.name} ({latestScan.type})
              </Text>
              <Text style={styles.cardTextSecondary}>
                {latestScan.time}
              </Text>
            </>
          ) : (
            <Text style={styles.cardTextSecondary}>
              まだ通門データがありません
            </Text>
          )}
        </View>

        {/* キュー状態 */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>送信状態</Text>
          <View style={styles.queueRow}>
            <View style={styles.queueItem}>
              <Text style={styles.queueLabel}>送信待ち</Text>
              <Text style={[styles.queueValue, queueCounts.pending > 0 && styles.queueValuePending]}>
                {queueCounts.pending}
              </Text>
            </View>
            <View style={styles.queueItem}>
              <Text style={styles.queueLabel}>送信済み</Text>
              <Text style={[styles.queueValue, styles.queueValueSent]}>
                {queueCounts.sent}
              </Text>
            </View>
            <View style={styles.queueItem}>
              <Text style={styles.queueLabel}>失敗</Text>
              <Text style={[styles.queueValue, queueCounts.failed > 0 && styles.queueValueFailed]}>
                {queueCounts.failed}
              </Text>
            </View>
          </View>
        </View>
      </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.color.background.paper,
  },

  scrollView: {
    flex: 1,
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
    color: tokens.color.text.primary,
    marginBottom: tokens.spacing.xs,
  },

  cardTextSecondary: {
    fontSize: tokens.font.size.sm,
    color: tokens.color.text.secondary,
  },

  statCard: {
    alignItems: "center",
  },

  statLabel: {
    fontSize: tokens.font.size.sm,
    color: tokens.color.text.secondary,
    marginBottom: tokens.spacing.xs,
  },

  statValue: {
    fontSize: 48,
    fontWeight: tokens.font.weight.bold,
    color: tokens.color.primary,
  },

  statValueSmall: {
    fontSize: 32,
    fontWeight: tokens.font.weight.bold,
    color: tokens.color.primary,
  },

  row: {
    flexDirection: "row",
    gap: tokens.spacing.lg,
  },

  halfCard: {
    flex: 1,
    alignItems: "center",
  },

  centerContent: {
    justifyContent: "center",
    alignItems: "center",
  },

  loadingText: {
    fontSize: tokens.font.size.base,
    color: tokens.color.text.secondary,
  },

  queueRow: {
    flexDirection: "row",
    gap: tokens.spacing.md,
  },

  queueItem: {
    flex: 1,
    alignItems: "center",
  },

  queueLabel: {
    fontSize: tokens.font.size.xs,
    color: tokens.color.text.secondary,
    marginBottom: tokens.spacing.xs,
  },

  queueValue: {
    fontSize: tokens.font.size.h3,
    fontWeight: tokens.font.weight.bold,
    color: tokens.color.text.secondary,
  },

  queueValuePending: {
    color: tokens.color.warn,
  },

  queueValueSent: {
    color: tokens.color.success,
  },

  queueValueFailed: {
    color: tokens.color.danger,
  },

  statsHeader: {
    flexDirection: "row",
    gap: tokens.spacing.sm,
    alignItems: "center",
  },

  toggleButton: {
    flex: 1,
    backgroundColor: tokens.color.background.default,
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.md,
    alignItems: "center",
    borderWidth: 1,
    borderColor: tokens.color.border.default,
    ...tokens.shadow.sm,
  },

  toggleButtonText: {
    fontSize: tokens.font.size.sm,
    fontWeight: tokens.font.weight.medium,
    color: tokens.color.text.primary,
  },

  resetButton: {
    minWidth: 90,
  },
});
