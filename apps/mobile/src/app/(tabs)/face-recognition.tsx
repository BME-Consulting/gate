// ==========================================
// 顔認証画面
// ==========================================

import React, { useState, useRef, useMemo } from "react";
import { View, Text, StyleSheet, Alert, TouchableOpacity, ActivityIndicator } from "react-native";
import { CameraView, CameraType, useCameraPermissions } from "expo-camera";
import Constants from "expo-constants";
import { Button, tokens } from "@mc-gate/ui-kit";
import { Ionicons } from "@expo/vector-icons";
import { useWorkers } from "../../hooks/useWorkers";
import { useQueue } from "../../hooks/useQueue";
import { useAppStore } from "../../store/appStore";
import { router } from "expo-router";
import {
  RuleEngine,
  generateUUID,
  makeIdempotencyKey,
  type WorkerInfo,
  type ScanEvent,
  TIMEOUT,
  fetchWithTimeout,
} from "@mc-gate/core";

// Face API のレスポンス型定義
interface FaceRecognitionResponse {
  personId: string | null;
  confidence: number;
  distance?: number;
  workerInfo?: {
    name: string;
    company: string;
    ccusId?: string;
  };
  error?: string;
}

export default function FaceRecognitionScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recognitionResult, setRecognitionResult] = useState<FaceRecognitionResponse | null>(null);
  const cameraRef = useRef<CameraView>(null);
  const { getWorkerById } = useWorkers();
  const { currentProject } = useAppStore();
  const { isReady: queueReady, addToQueue } = useQueue();

  // ルールエンジンの初期化
  const ruleEngine = useMemo(() => {
    if (!currentProject) return null;
    return new RuleEngine(currentProject.checkConfig);
  }, [currentProject?.checkConfig]);

  // カメラ権限のチェック
  if (!permission) {
    return (
      <View style={styles.container}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={tokens.color.primary} />
          <Text style={styles.message}>カメラの準備中...</Text>
        </View>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <View style={styles.centerContent}>
          <Ionicons name="camera-outline" size={64} color={tokens.color.text.secondary} />
          <Text style={styles.message}>
            顔認証を使用するにはカメラへのアクセスが必要です
          </Text>
          <Button title="カメラを許可" onPress={requestPermission} />
        </View>
      </View>
    );
  }

  // 入場イベントを記録する関数
  const recordEntryEvent = async (worker: WorkerInfo) => {
    if (!currentProject || !queueReady || !ruleEngine) {
      console.warn("Cannot record entry event: project or queue not ready");
      return;
    }

    try {
      // ルールを適用
      const ruleResult = ruleEngine.evaluate(worker);

      // blockの場合は登録しない
      if (ruleResult.action === "block") {
        return;
      }

      // 入退モードを決定（プロジェクト設定のgateModeをそのまま使用）
      const decidedMode = currentProject.gateMode;

      // スキャンイベントを作成
      const occurredAt = new Date().toISOString();
      const scanEvent: ScanEvent = {
        id: generateUUID(),
        projectId: currentProject.projectId,
        personId: worker.personId,
        method: "FACE",
        gateMode: currentProject.gateMode,
        decidedMode,
        occurredAt,
        ruleResult,
        transport: {
          status: "pending",
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

      if (__DEV__) {
        console.log("[FaceRecognition] Entry event recorded:", {
          eventId: scanEvent.id,
          personId: worker.personId,
          decidedMode,
        });
      }
    } catch (error) {
      console.error("[FaceRecognition] Failed to record entry event:", error);
      Alert.alert(
        "警告",
        "入場イベントの記録に失敗しました。\n認証は成功していますが、履歴に記録されていない可能性があります。",
        [{ text: "OK" }]
      );
    }
  };

  // 写真を撮影してBase64エンコード
  const handleTakePicture = async () => {
    if (!cameraRef.current || !isCameraReady || isProcessing) {
      return;
    }

    try {
      setIsProcessing(true);
      setRecognitionResult(null);

      // 写真を撮影
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: true,
      });

      if (!photo || !photo.base64) {
        throw new Error("写真の撮影に失敗しました");
      }

      // Base64データをdata URI形式に変換
      const imageData = `data:image/jpeg;base64,${photo.base64}`;

      // 環境変数からFace API URLとAPIキーを取得
      const apiFaceApi = Constants.expoConfig?.extra?.apiFaceApi || "http://localhost:8100";
      const apiFaceApiKey = Constants.expoConfig?.extra?.apiFaceApiKey || "development-api-key-12345";

      // デバッグログ: 接続先URL
      console.log("==================== FACE RECOGNITION DEBUG ====================");
      console.log(`[DEBUG] Face API URL: ${apiFaceApi}`);
      console.log(`[DEBUG] API Key: ${apiFaceApiKey.substring(0, 10)}...`);
      console.log(`[DEBUG] Full endpoint: ${apiFaceApi}/api/face/recognize`);
      console.log(`[DEBUG] Image data length: ${imageData.length} bytes`);
      console.log(`[DEBUG] Timeout: ${TIMEOUT.FACE_RECOGNITION}ms`);
      console.log("===============================================================");

      // Face APIに送信（タイムアウト付き）
      console.log("[DEBUG] Sending request to Face API...");
      const response = await fetchWithTimeout(`${apiFaceApi}/api/face/recognize`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": apiFaceApiKey,
        },
        body: JSON.stringify({
          imageData,
          threshold: 0.6,
        }),
        timeoutMs: TIMEOUT.FACE_RECOGNITION, // 30秒
      });

      console.log(`[DEBUG] Response received! Status: ${response.status}`);
      console.log(`[DEBUG] Response headers:`, Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        console.error(`[DEBUG] HTTP error! status: ${response.status}`);
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result: FaceRecognitionResponse = await response.json();
      console.log("[DEBUG] Response body:", JSON.stringify(result, null, 2));

      // 認識結果を保存
      setRecognitionResult(result);

      // 認識成功時はローカルDBから詳細情報を取得
      if (result.personId) {
        const workerDetails = await getWorkerById(result.personId);
        if (workerDetails) {
          // ローカルDBの情報でworkerInfoを上書き
          result.workerInfo = {
            name: workerDetails.name,
            company: workerDetails.company,
            ccusId: workerDetails.ccusId,
          };
          setRecognitionResult({ ...result });

          // WorkerInfo型に変換して入場イベントを記録
          const workerInfo: WorkerInfo = {
            personId: workerDetails.personId,
            name: workerDetails.name,
            company: workerDetails.company,
            ccusId: workerDetails.ccusId,
            ccusRegistered: workerDetails.ccusRegistered,
            socialInsurance: workerDetails.socialInsurance,
            residencyStatus: workerDetails.residencyExpiry ? {
              expiryDate: workerDetails.residencyExpiry,
              workPermit: true,
            } : undefined,
            age: workerDetails.age,
            isSoleProprietor: workerDetails.isSoleProprietor,
          };

          // 入場イベントを記録
          await recordEntryEvent(workerInfo);
        }
      }

      // 結果を表示
      showResultAlert(result);
      console.log("[DEBUG] Face recognition completed successfully");
    } catch (error) {
      console.error("==================== FACE RECOGNITION ERROR ====================");
      console.error("[ERROR] Error type:", error?.constructor?.name);
      console.error("[ERROR] Error message:", error instanceof Error ? error.message : String(error));
      console.error("[ERROR] Error name:", error instanceof Error ? error.name : "unknown");
      console.error("[ERROR] Error stack:", error instanceof Error ? error.stack : "no stack");
      console.error("===============================================================");

      let errorMessage = "顔認証に失敗しました";

      if (error instanceof Error) {
        if (error.name === 'AbortError' || error.message.includes('タイムアウト')) {
          errorMessage = "サーバーへの接続がタイムアウトしました。\n\nネットワーク接続を確認して、もう一度お試しください。";
        } else if (error.message.includes('Failed to fetch') || error.message.includes('Network')) {
          errorMessage = "サーバーに接続できません。\n\nネットワーク接続とサーバーの状態を確認してください。";
        } else {
          errorMessage = error.message;
        }
      }

      Alert.alert("エラー", errorMessage, [{ text: "OK" }]);
    } finally {
      setIsProcessing(false);
    }
  };

  // 認識結果をアラートで表示
  const showResultAlert = (result: FaceRecognitionResponse) => {
    if (result.error) {
      // エラーメッセージを表示
      Alert.alert("認識失敗", result.error, [{ text: "OK" }]);
      return;
    }

    if (!result.personId || !result.workerInfo) {
      // 顔が検出されたが、マッチしなかった場合
      Alert.alert(
        "認識失敗",
        `顔が検出されましたが、登録された作業員とマッチしませんでした。\n\n信頼度: ${(result.confidence * 100).toFixed(1)}%\n距離: ${result.distance?.toFixed(3) || "N/A"}`,
        [{ text: "OK" }]
      );
      return;
    }

    // 認識成功
    Alert.alert(
      "認識成功",
      `作業員情報:\n\n` +
        `氏名: ${result.workerInfo.name}\n` +
        `会社: ${result.workerInfo.company}\n` +
        `CCUS ID: ${result.workerInfo.ccusId || "未登録"}\n\n` +
        `信頼度: ${(result.confidence * 100).toFixed(1)}%\n` +
        `距離: ${result.distance?.toFixed(3) || "N/A"}`,
      [{ text: "OK" }]
    );
  };

  // 戻るボタン
  const handleGoBack = () => {
    router.back();
  };

  return (
    <View style={styles.container}>
      {/* カメラプレビュー */}
      <View style={styles.cameraContainer}>
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing="front"
          onCameraReady={() => setIsCameraReady(true)}
        >
          {/* カメラオーバーレイ */}
          <View style={styles.overlay}>
            {/* 上部バー */}
            <View style={styles.topBar}>
              <TouchableOpacity style={styles.backButton} onPress={handleGoBack}>
                <Ionicons name="arrow-back" size={28} color="#fff" />
              </TouchableOpacity>
              <Text style={styles.title}>顔認証</Text>
              <View style={styles.backButton} />
            </View>

            {/* ガイドフレーム */}
            <View style={styles.guideContainer}>
              <View style={styles.guideFrame}>
                <View style={[styles.guideCorner, styles.guideCornerTopLeft]} />
                <View style={[styles.guideCorner, styles.guideCornerTopRight]} />
                <View style={[styles.guideCorner, styles.guideCornerBottomLeft]} />
                <View style={[styles.guideCorner, styles.guideCornerBottomRight]} />
              </View>
              <Text style={styles.guideText}>
                顔をフレーム内に合わせてください
              </Text>
            </View>

            {/* 結果表示エリア */}
            {recognitionResult && (
              <View style={styles.resultCard}>
                {recognitionResult.personId && recognitionResult.workerInfo ? (
                  <View>
                    <View style={styles.resultHeader}>
                      <Ionicons name="checkmark-circle" size={24} color={tokens.color.success} />
                      <Text style={styles.resultTitle}>認識成功</Text>
                    </View>
                    <Text style={styles.resultText}>
                      {recognitionResult.workerInfo.name}
                    </Text>
                    <Text style={styles.resultSubText}>
                      {recognitionResult.workerInfo.company}
                    </Text>
                    <Text style={styles.resultSubText}>
                      信頼度: {(recognitionResult.confidence * 100).toFixed(1)}%
                    </Text>
                  </View>
                ) : (
                  <View>
                    <View style={styles.resultHeader}>
                      <Ionicons name="close-circle" size={24} color={tokens.color.danger} />
                      <Text style={[styles.resultTitle, styles.resultTitleError]}>
                        認識失敗
                      </Text>
                    </View>
                    <Text style={styles.resultText}>
                      {recognitionResult.error || "作業員が見つかりませんでした"}
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* ボトムバー */}
            <View style={styles.bottomBar}>
              {isProcessing ? (
                <View style={styles.processingContainer}>
                  <ActivityIndicator size="large" color="#fff" />
                  <Text style={styles.processingText}>認識中...</Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={[
                    styles.captureButton,
                    !isCameraReady && styles.captureButtonDisabled,
                  ]}
                  onPress={handleTakePicture}
                  disabled={!isCameraReady || isProcessing}
                >
                  <View style={styles.captureButtonInner} />
                </TouchableOpacity>
              )}
            </View>
          </View>
        </CameraView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },

  centerContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: tokens.spacing.xl,
    gap: tokens.spacing.lg,
  },

  message: {
    fontSize: tokens.font.size.base,
    color: tokens.color.text.secondary,
    textAlign: "center",
    lineHeight: 24,
  },

  cameraContainer: {
    flex: 1,
  },

  camera: {
    flex: 1,
  },

  overlay: {
    flex: 1,
    backgroundColor: "transparent",
  },

  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 50,
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },

  backButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },

  title: {
    fontSize: 18,
    fontWeight: "600",
    color: "#fff",
  },

  guideContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },

  guideFrame: {
    width: 280,
    height: 350,
    position: "relative",
  },

  guideCorner: {
    position: "absolute",
    width: 40,
    height: 40,
    borderColor: "#fff",
  },

  guideCornerTopLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 3,
    borderLeftWidth: 3,
  },

  guideCornerTopRight: {
    top: 0,
    right: 0,
    borderTopWidth: 3,
    borderRightWidth: 3,
  },

  guideCornerBottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
  },

  guideCornerBottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3,
    borderRightWidth: 3,
  },

  guideText: {
    marginTop: 24,
    fontSize: 16,
    color: "#fff",
    textAlign: "center",
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },

  resultCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    borderRadius: 12,
    ...tokens.shadow.lg,
  },

  resultHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },

  resultTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: tokens.color.success,
  },

  resultTitleError: {
    color: tokens.color.danger,
  },

  resultText: {
    fontSize: 16,
    fontWeight: "600",
    color: tokens.color.text.primary,
    marginBottom: 4,
  },

  resultSubText: {
    fontSize: 14,
    color: tokens.color.text.secondary,
    marginTop: 2,
  },

  bottomBar: {
    paddingBottom: 40,
    paddingTop: 20,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    alignItems: "center",
  },

  processingContainer: {
    alignItems: "center",
    gap: 12,
  },

  processingText: {
    fontSize: 16,
    color: "#fff",
    fontWeight: "500",
  },

  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 4,
    borderColor: "rgba(255, 255, 255, 0.5)",
  },

  captureButtonDisabled: {
    opacity: 0.5,
  },

  captureButtonInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#fff",
    borderWidth: 2,
    borderColor: "#000",
  },
});
