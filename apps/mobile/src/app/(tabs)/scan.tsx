// ==========================================
// 読取画面
// ==========================================

import React, { useState, useMemo } from "react";
import { View, Text, StyleSheet, Alert } from "react-native";
import { Button, Dialog, Banner, tokens } from "@mc-gate/ui-kit";
import { QRScanner, parseQRCode } from "@mc-gate/qr";
import {
  RuleEngine,
  messagesJa,
  generateUUID,
  makeIdempotencyKey,
  type WorkerInfo,
  type RuleResult,
  type DecidedMode,
} from "@mc-gate/core";
import { useAppStore } from "../../store/appStore";
import { useQueue } from "../../hooks/useQueue";
import { useNetworkStatus } from "../../hooks/useNetworkStatus";

export default function ScanScreen() {
  const { currentProject } = useAppStore();
  const { isReady, addToQueue } = useQueue();
  const { isOffline } = useNetworkStatus();

  const [scanning, setScanning] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [resultData, setResultData] = useState<{
    worker: WorkerInfo;
    result: RuleResult;
    decidedMode: DecidedMode;
  } | null>(null);

  // ルールエンジンの初期化
  const ruleEngine = useMemo(() => {
    if (!currentProject) return null;
    return new RuleEngine(currentProject.checkConfig);
  }, [currentProject?.checkConfig]);

  const handleStartScan = () => {
    setScanning(true);
  };

  const handleQRScan = (data: string) => {
    // スキャン直後に状態を更新してカメラを停止
    setScanning(false);

    try {
      console.log("QR Scanned:", data);

      // QRデータをパース
      const workerInfo = parseQRCode(data);

      // ルールを適用
      if (!ruleEngine) {
        throw new Error("ルールエンジンが初期化されていません");
      }
      const ruleResult = ruleEngine.evaluate(workerInfo);

      // 入退モードを決定（TODO: AUTO時はロジック実装）
      const decidedMode: DecidedMode =
        currentProject?.gateMode === "IN" || currentProject?.gateMode === "OUT"
          ? (currentProject.gateMode as DecidedMode)
          : "IN"; // AUTOの場合は暫定的にIN

      // 結果を保存して表示
      setResultData({ worker: workerInfo, result: ruleResult, decidedMode });
      setShowResult(true);
    } catch (error) {
      console.error("QR Scan Error:", error);
      Alert.alert(
        "エラー",
        error instanceof Error ? error.message : "QRコードの読み取りに失敗しました"
      );
    }
  };

  const handleConfirm = async () => {
    if (!resultData || !currentProject || !isReady) {
      setShowResult(false);
      setScanning(true); // 再スキャン可能にする
      return;
    }

    const { worker, result, decidedMode } = resultData;

    // blockの場合は登録せずに終了
    if (result.action === "block") {
      setShowResult(false);
      setResultData(null);
      setScanning(true); // 再スキャン可能にする
      return;
    }

    try {
      // スキャンイベントを作成
      const occurredAt = new Date().toISOString();
      const scanEvent = {
        id: generateUUID(),
        projectId: currentProject.projectId,
        personId: worker.personId,
        method: "QR" as const,
        gateMode: currentProject.gateMode || "AUTO",
        decidedMode,
        occurredAt,
        ruleResult: result,
        transport: {
          status: "pending" as const,
          attempts: 0,
          idempotencyKey: makeIdempotencyKey({
            projectId: currentProject.projectId,
            personId: worker.personId,
            decidedMode,
            occurredAt,
          }),
        },
      };

      // キューに追加
      await addToQueue(scanEvent);

      setShowResult(false);
      setResultData(null);

      // 成功メッセージ表示後、自動的に再スキャン開始
      Alert.alert(
        "登録完了",
        `${worker.name}さんの${decidedMode === "IN" ? "入場" : "退場"}を登録しました。`,
        [
          {
            text: "OK",
            onPress: () => {
              // ダイアログを閉じた後、自動的に再スキャン開始
              setTimeout(() => setScanning(true), 300);
            },
          },
        ]
      );
    } catch (error) {
      Alert.alert(
        "エラー",
        error instanceof Error ? error.message : "登録に失敗しました",
        [
          {
            text: "OK",
            onPress: () => {
              // エラーダイアログを閉じた後、再スキャン可能にする
              setTimeout(() => setScanning(true), 300);
            },
          },
        ]
      );
    }
  };

  const handleCancel = () => {
    setShowResult(false);
    setResultData(null);
    // キャンセル後も自動的に再スキャン開始
    setTimeout(() => setScanning(true), 300);
  };

  if (!currentProject) {
    return (
      <View style={styles.container}>
        <View style={styles.centerContent}>
          <Text style={styles.message}>
            現場が選択されていません。{"\n"}
            設定画面から現場を選択してください。
          </Text>
        </View>
      </View>
    );
  }

  if (!isReady) {
    return (
      <View style={styles.container}>
        <View style={styles.centerContent}>
          <Text style={styles.message}>初期化中...</Text>
        </View>
      </View>
    );
  }

  // ダイアログ用のメッセージとバリアントを生成
  const dialogContent = resultData
    ? {
        title:
          resultData.result.action === "block"
            ? "入場不可"
            : resultData.result.action === "warn"
              ? "確認が必要です"
              : "入場可能",
        message: `${resultData.worker.name}さん（${resultData.worker.company}）\n\n${resultData.result.messages
          .map((msgId) => messagesJa[msgId as keyof typeof messagesJa] || msgId)
          .join("\n")}`,
        variant:
          resultData.result.action === "block"
            ? ("danger" as const)
            : resultData.result.action === "warn"
              ? ("warn" as const)
              : ("success" as const),
      }
    : null;

  return (
    <View style={styles.container}>
      {isOffline && (
        <Banner
          message="オフライン：読み取りデータは端末に保存されます"
          variant="warn"
        />
      )}

      <View style={styles.content}>
        {/* 現場情報 */}
        <View style={styles.projectCard}>
          <Text style={styles.projectLabel}>現在の現場</Text>
          <Text style={styles.projectName}>{currentProject.name}</Text>
        </View>

        {/* スキャンエリア */}
        <View style={styles.scanArea}>
          <QRScanner
            onScan={handleQRScan}
            onError={(error) => {
              setScanning(false);
              Alert.alert("エラー", error.message);
            }}
            enabled={scanning}
          />
          {!scanning && (
            <View style={styles.scanOverlay}>
              <Text style={styles.placeholderText}>
                QRコードをカメラで読み取ります
              </Text>
            </View>
          )}
        </View>

        {/* アクションボタン */}
        <View style={styles.actions}>
          {scanning ? (
            <Button
              title="キャンセル"
              variant="secondary"
              onPress={() => setScanning(false)}
              fullWidth
              size="lg"
            />
          ) : (
            <Button
              title="QRコード読取"
              onPress={handleStartScan}
              fullWidth
              size="lg"
            />
          )}
        </View>
      </View>

      {/* 結果ダイアログ */}
      {dialogContent && (
        <Dialog
          visible={showResult}
          title={dialogContent.title}
          message={dialogContent.message}
          variant={dialogContent.variant}
          onClose={resultData?.result.action === "block" ? handleCancel : undefined}
          actions={
            resultData?.result.action !== "block"
              ? [
                  {
                    label: "キャンセル",
                    onPress: handleCancel,
                    variant: "secondary",
                  },
                  {
                    label: "登録",
                    onPress: handleConfirm,
                    variant: "primary",
                  },
                ]
              : undefined
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.color.background.paper,
  },

  content: {
    flex: 1,
    padding: tokens.spacing.lg,
    gap: tokens.spacing.xl,
  },

  centerContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: tokens.spacing.xl,
  },

  message: {
    fontSize: tokens.font.size.base,
    color: tokens.color.text.secondary,
    textAlign: "center",
    lineHeight: 24,
  },

  projectCard: {
    backgroundColor: tokens.color.background.default,
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.lg,
    ...tokens.shadow.sm,
  },

  projectLabel: {
    fontSize: tokens.font.size.sm,
    color: tokens.color.text.secondary,
    marginBottom: tokens.spacing.xs,
  },

  projectName: {
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.semibold,
    color: tokens.color.text.primary,
  },

  scanArea: {
    flex: 1,
    backgroundColor: tokens.color.background.default,
    borderRadius: tokens.radius.lg,
    overflow: "hidden",
    ...tokens.shadow.md,
  },

  scanPlaceholder: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: tokens.spacing.xl,
  },

  scanOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: tokens.color.background.default,
    padding: tokens.spacing.xl,
  },

  placeholderText: {
    fontSize: tokens.font.size.base,
    color: tokens.color.text.secondary,
    textAlign: "center",
  },

  scanningIndicator: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: tokens.color.primary + "20",
  },

  scanningText: {
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.semibold,
    color: tokens.color.primary,
  },

  actions: {
    paddingBottom: tokens.spacing.lg,
  },
});
