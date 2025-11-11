// ==========================================
// 読取画面
// ==========================================

import React, { useState, useMemo } from "react";
import { View, Text, StyleSheet, Alert, TouchableOpacity } from "react-native";
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
  type ScanMethod,
} from "@mc-gate/core";
import { MockCardReader, type CardData } from "@mc-gate/reader-bridge";
import { useAppStore } from "../../store/appStore";
import { useQueue } from "../../hooks/useQueue";
import { useNetworkStatus } from "../../hooks/useNetworkStatus";

export default function ScanScreen() {
  const { currentProject } = useAppStore();
  const { isReady, addToQueue } = useQueue();
  const { isOffline } = useNetworkStatus();

  const [selectedMethod, setSelectedMethod] = useState<ScanMethod>("QR");
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

  const handleScan = (data: unknown) => {
    // スキャン直後に状態を更新してカメラを停止
    setScanning(false);

    try {
      let workerInfo: WorkerInfo;

      // 選択された方式に応じてデータをパース
      switch (selectedMethod) {
        case "QR":
          console.log("QR Scanned:", data);
          workerInfo = parseQRCode(data as string);
          break;

        case "CARD":
          console.log("Card Scanned:", data);
          const cardData = data as CardData;
          // TODO: CCUSカードAPIから技能者情報を取得
          // 現在はモックデータとして扱う
          workerInfo = {
            personId: cardData.personId || cardData.ccusId,
            name: "カード読取者",
            company: "不明",
            ccusId: cardData.ccusId,
            ccusRegistered: true,
            socialInsurance: true,
            isSoleProprietor: false,
          };
          break;

        default:
          throw new Error(`未対応の読取方式: ${selectedMethod}`);
      }

      // ルールを適用
      if (!ruleEngine) {
        throw new Error("ルールエンジンが初期化されていません");
      }
      const ruleResult = ruleEngine.evaluate(workerInfo);

      // 入退モードを決定（プロジェクト設定のgateModeをそのまま使用）
      const decidedMode: DecidedMode = currentProject?.gateMode || "IN";

      // 結果を保存して表示
      setResultData({ worker: workerInfo, result: ruleResult, decidedMode });
      setShowResult(true);
    } catch (error) {
      console.error("Scan Error:", error);
      Alert.alert(
        "エラー",
        error instanceof Error ? error.message : "読み取りに失敗しました"
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
        method: selectedMethod,
        gateMode: currentProject.gateMode,
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

        {/* 読取方式切替 */}
        <View style={styles.methodSwitcher}>
          <TouchableOpacity
            style={[
              styles.methodButton,
              selectedMethod === "QR" && styles.methodButtonActive,
            ]}
            onPress={() => {
              setSelectedMethod("QR");
              setScanning(false);
            }}
            disabled={scanning}
          >
            <Text
              style={[
                styles.methodButtonText,
                selectedMethod === "QR" && styles.methodButtonTextActive,
              ]}
            >
              QRコード
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.methodButton,
              selectedMethod === "CARD" && styles.methodButtonActive,
            ]}
            onPress={() => {
              setSelectedMethod("CARD");
              setScanning(false);
            }}
            disabled={scanning}
          >
            <Text
              style={[
                styles.methodButtonText,
                selectedMethod === "CARD" && styles.methodButtonTextActive,
              ]}
            >
              カード
            </Text>
          </TouchableOpacity>
        </View>

        {/* スキャンエリア */}
        <View style={styles.scanArea}>
          {selectedMethod === "QR" && (
            <>
              <QRScanner
                onScan={handleScan}
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
            </>
          )}

          {selectedMethod === "CARD" && (
            <View style={styles.scanOverlay}>
              <Text style={styles.placeholderText}>
                カード読取準備中
              </Text>
              <Text style={styles.placeholderSubtext}>
                この機能は近日公開予定です
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
              title={
                selectedMethod === "QR"
                  ? "QRコード読取"
                  : selectedMethod === "CARD"
                    ? "カード読取"
                    : "読取開始"
              }
              onPress={handleStartScan}
              fullWidth
              size="lg"
              disabled={selectedMethod === "CARD"}
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

  methodSwitcher: {
    flexDirection: "row",
    gap: tokens.spacing.sm,
    padding: tokens.spacing.xs,
    backgroundColor: tokens.color.background.default,
    borderRadius: tokens.radius.md,
    ...tokens.shadow.sm,
  },

  methodButton: {
    flex: 1,
    paddingVertical: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.lg,
    borderRadius: tokens.radius.sm,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },

  methodButtonActive: {
    backgroundColor: tokens.color.primary,
  },

  methodButtonText: {
    fontSize: tokens.font.size.base,
    fontWeight: tokens.font.weight.medium,
    color: tokens.color.text.secondary,
  },

  methodButtonTextActive: {
    color: tokens.color.background.paper,
    fontWeight: tokens.font.weight.semibold,
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

  placeholderSubtext: {
    fontSize: tokens.font.size.sm,
    color: tokens.color.text.disabled,
    textAlign: "center",
    marginTop: tokens.spacing.sm,
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
