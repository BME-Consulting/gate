// ==========================================
// 履歴一覧画面
// ==========================================

import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Platform,
} from "react-native";
import { tokens } from "@mc-gate/ui-kit";
import { formatDate } from "@mc-gate/utils";
import type { ScanEvent } from "@mc-gate/core";
import { useAppStore } from "../../store/appStore";
import { useQueue } from "../../hooks/useQueue";
import { useFocusEffect } from "expo-router";
import { ErrorGuideModal } from "../../components/ErrorGuideModal";

type FilterStatus = "all" | "pending" | "sent" | "failed";

export default function HistoryScreen() {
  const { currentProject } = useAppStore();
  const { isReady, getHistory } = useQueue();

  const [history, setHistory] = useState<ScanEvent[]>([]);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedError, setSelectedError] = useState<{
    code: string;
    message: string;
    statusCode?: number;
  } | null>(null);
  const [errorModalVisible, setErrorModalVisible] = useState(false);

  // 履歴データをロード（依存関係を明示的に管理）
  const loadHistory = useCallback(async () => {
    if (!currentProject || !isReady) return;

    try {
      setLoading(true);
      const options =
        filterStatus === "all"
          ? { limit: 100 }
          : { status: filterStatus as "pending" | "sent" | "failed", limit: 100 };

      const events = await getHistory(currentProject.projectId, options);
      setHistory(events);
    } catch (error) {
      console.error("Failed to load history:", error);
    } finally {
      setLoading(false);
    }
  }, [currentProject, isReady, filterStatus, getHistory]);

  // 画面フォーカス時にデータを更新
  useFocusEffect(
    useCallback(() => {
      loadHistory();
    }, [loadHistory])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadHistory();
    setRefreshing(false);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "sent":
        return tokens.color.success;
      case "pending":
        return tokens.color.warn;
      case "failed":
        return tokens.color.danger;
      default:
        return tokens.color.text.secondary;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "sent":
        return "送信済";
      case "pending":
        return "送信待";
      case "failed":
        return "失敗";
      default:
        return "不明";
    }
  };

  const parseErrorCode = (errorMessage: string): string => {
    // エラーメッセージからエラーコードを抽出
    if (errorMessage.includes("ネットワーク")) return "NETWORK_ERROR";
    if (errorMessage.includes("タイムアウト")) return "TIMEOUT";
    if (errorMessage.includes("認証")) return "UNAUTHORIZED";
    if (errorMessage.includes("権限")) return "FORBIDDEN";
    if (errorMessage.includes("見つかりません")) return "NOT_FOUND";
    if (errorMessage.includes("サーバー")) return "SERVER_ERROR";
    if (errorMessage.includes("同期")) return "SYNC_ERROR";
    return "UNKNOWN";
  };

  const handleErrorClick = (item: ScanEvent) => {
    if (item.transport.status === "failed" && item.transport.lastError) {
      setSelectedError({
        code: parseErrorCode(item.transport.lastError),
        message: item.transport.lastError,
      });
      setErrorModalVisible(true);
    }
  };

  // renderItemをuseCallbackでメモ化してパフォーマンス向上
  const renderItem = useCallback(({ item }: { item: ScanEvent }) => (
    <TouchableOpacity
      style={styles.historyCard}
      onPress={() => handleErrorClick(item)}
      disabled={item.transport.status !== "failed"}
    >
      <View style={styles.cardHeader}>
        <View style={styles.headerLeft}>
          <Text style={styles.personId}>{item.personId}</Text>
          <View
            style={[
              styles.modeBadge,
              {
                backgroundColor:
                  item.decidedMode === "IN"
                    ? tokens.color.success + "20"
                    : tokens.color.primary + "20",
              },
            ]}
          >
            <Text
              style={[
                styles.modeText,
                {
                  color:
                    item.decidedMode === "IN"
                      ? tokens.color.success
                      : tokens.color.primary,
                },
              ]}
            >
              {item.decidedMode === "IN" ? "入場" : "退場"}
            </Text>
          </View>
        </View>
        <View
          style={[
            styles.statusBadge,
            { backgroundColor: getStatusColor(item.transport.status) + "20" },
          ]}
        >
          <Text
            style={[
              styles.statusText,
              { color: getStatusColor(item.transport.status) },
            ]}
          >
            {getStatusText(item.transport.status)}
          </Text>
        </View>
      </View>

      <View style={styles.cardBody}>
        <View style={styles.infoRow}>
          <Text style={styles.label}>日時:</Text>
          <Text style={styles.value}>
            {formatDate(item.occurredAt, "datetime")}
          </Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.label}>読取方式:</Text>
          <Text style={styles.value}>{item.method === "QR" ? "QR" : "CCUS"}</Text>
        </View>
        {item.transport.status === "failed" && item.transport.lastError && (
          <View style={styles.errorRow}>
            <Text style={styles.errorLabel}>エラー:</Text>
            <Text style={styles.errorText}>{item.transport.lastError}</Text>
          </View>
        )}
        {item.transport.attempts > 1 && (
          <View style={styles.infoRow}>
            <Text style={styles.label}>再試行:</Text>
            <Text style={styles.value}>{item.transport.attempts}回</Text>
          </View>
        )}
      </View>
      {item.transport.status === "failed" && (
        <View style={styles.errorHint}>
          <Text style={styles.errorHintText}>タップして対処方法を確認</Text>
        </View>
      )}
    </TouchableOpacity>
  ), [handleErrorClick]);

  // FlatListのパフォーマンス最適化用の定数
  const ITEM_HEIGHT = 180; // 推定アイテム高さ（px）
  const getItemLayout = useCallback(
    (_data: ArrayLike<ScanEvent> | null | undefined, index: number) => ({
      length: ITEM_HEIGHT,
      offset: ITEM_HEIGHT * index,
      index,
    }),
    []
  );

  if (!isReady && Platform.OS !== "web") {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <Text style={styles.loadingText}>初期化中...</Text>
      </View>
    );
  }

  return (
    <>
      <ErrorGuideModal
        visible={errorModalVisible}
        error={selectedError}
        onClose={() => setErrorModalVisible(false)}
        onRetry={async () => {
          setErrorModalVisible(false);
          await handleRefresh();
        }}
      />
      <View style={styles.container}>
      {/* フィルタボタン */}
      <View style={styles.filterContainer}>
        {(["all", "sent", "pending", "failed"] as FilterStatus[]).map((status) => (
          <TouchableOpacity
            key={status}
            style={[
              styles.filterButton,
              filterStatus === status && styles.filterButtonActive,
            ]}
            onPress={() => setFilterStatus(status)}
          >
            <Text
              style={[
                styles.filterButtonText,
                filterStatus === status && styles.filterButtonTextActive,
              ]}
            >
              {status === "all"
                ? "すべて"
                : status === "sent"
                ? "送信済"
                : status === "pending"
                ? "送信待"
                : "失敗"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 履歴リスト - パフォーマンス最適化済み */}
      <FlatList
        data={history}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              {loading ? "読み込み中..." : "履歴がありません"}
            </Text>
          </View>
        }
        // パフォーマンス最適化
        getItemLayout={getItemLayout}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews={true}
        updateCellsBatchingPeriod={50}
      />
    </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.color.background.paper,
  },

  centerContent: {
    justifyContent: "center",
    alignItems: "center",
  },

  loadingText: {
    fontSize: tokens.font.size.base,
    color: tokens.color.text.secondary,
  },

  filterContainer: {
    flexDirection: "row",
    padding: tokens.spacing.md,
    gap: tokens.spacing.sm,
    backgroundColor: tokens.color.background.default,
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.border.default,
  },

  filterButton: {
    flex: 1,
    paddingVertical: tokens.spacing.sm,
    paddingHorizontal: tokens.spacing.md,
    borderRadius: tokens.radius.sm,
    borderWidth: 1,
    borderColor: tokens.color.border.default,
    alignItems: "center",
  },

  filterButtonActive: {
    backgroundColor: tokens.color.primary,
    borderColor: tokens.color.primary,
  },

  filterButtonText: {
    fontSize: tokens.font.size.sm,
    color: tokens.color.text.secondary,
    fontWeight: tokens.font.weight.medium,
  },

  filterButtonTextActive: {
    color: "#FFFFFF",
  },

  listContent: {
    padding: tokens.spacing.lg,
    gap: tokens.spacing.md,
  },

  historyCard: {
    backgroundColor: tokens.color.background.default,
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.lg,
    ...tokens.shadow.sm,
  },

  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: tokens.spacing.md,
  },

  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacing.sm,
    flex: 1,
  },

  personId: {
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.semibold,
    color: tokens.color.text.primary,
  },

  modeBadge: {
    paddingHorizontal: tokens.spacing.sm,
    paddingVertical: tokens.spacing.xs,
    borderRadius: tokens.radius.sm,
  },

  modeText: {
    fontSize: tokens.font.size.xs,
    fontWeight: tokens.font.weight.semibold,
  },

  statusBadge: {
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.xs,
    borderRadius: tokens.radius.sm,
  },

  statusText: {
    fontSize: tokens.font.size.sm,
    fontWeight: tokens.font.weight.semibold,
  },

  cardBody: {
    gap: tokens.spacing.sm,
  },

  infoRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  label: {
    fontSize: tokens.font.size.sm,
    color: tokens.color.text.secondary,
    width: 80,
  },

  value: {
    fontSize: tokens.font.size.sm,
    color: tokens.color.text.primary,
    flex: 1,
  },

  errorRow: {
    marginTop: tokens.spacing.xs,
    padding: tokens.spacing.sm,
    backgroundColor: tokens.color.danger + "10",
    borderRadius: tokens.radius.sm,
  },

  errorLabel: {
    fontSize: tokens.font.size.xs,
    color: tokens.color.danger,
    fontWeight: tokens.font.weight.semibold,
    marginBottom: tokens.spacing.xs,
  },

  errorText: {
    fontSize: tokens.font.size.xs,
    color: tokens.color.danger,
  },

  emptyContainer: {
    padding: tokens.spacing.xxl,
    alignItems: "center",
  },

  emptyText: {
    fontSize: tokens.font.size.base,
    color: tokens.color.text.secondary,
  },

  errorHint: {
    marginTop: tokens.spacing.sm,
    padding: tokens.spacing.sm,
    backgroundColor: tokens.color.primary + "10",
    borderRadius: tokens.radius.sm,
    alignItems: "center",
  },

  errorHintText: {
    fontSize: tokens.font.size.xs,
    color: tokens.color.primary,
    fontWeight: tokens.font.weight.medium,
  },
});
