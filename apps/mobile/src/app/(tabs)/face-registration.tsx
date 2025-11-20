// ==========================================
// 顔登録画面
// ==========================================

import React, { useState, useRef, useEffect } from "react";
import { View, Text, StyleSheet, Alert, TouchableOpacity, ActivityIndicator, Modal, FlatList, Pressable } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import Constants from "expo-constants";
import { Button, tokens } from "@mc-gate/ui-kit";
import { Ionicons } from "@expo/vector-icons";
import { useWorkers } from "../../hooks/useWorkers";
import { router } from "expo-router";
import { TIMEOUT, fetchWithTimeout } from "@mc-gate/core";

// Face API レスポンス型定義（Face APIはsnake_caseを返す）
interface FaceRegistrationResponse {
  success: boolean;
  person_id?: string;
  embedding_dimensions?: number;
  face_count?: number;
  error?: string;
}

export default function FaceRegistrationScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedPersonId, setSelectedPersonId] = useState<string>("");
  const [registrationResult, setRegistrationResult] = useState<FaceRegistrationResponse | null>(null);
  const [isWorkerModalVisible, setIsWorkerModalVisible] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const { workers, getAllWorkers, isReady } = useWorkers();

  // 作業員一覧を取得
  useEffect(() => {
    if (isReady) {
      getAllWorkers().catch(error => {
        console.error("Failed to load workers:", error);
      });
    }
  }, [isReady, getAllWorkers]);

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
            顔登録を使用するにはカメラへのアクセスが必要です
          </Text>
          <Button title="カメラを許可" onPress={requestPermission} />
        </View>
      </View>
    );
  }

  // 写真を撮影してFace APIに送信
  const handleTakePicture = async () => {
    if (!cameraRef.current || !isCameraReady || isProcessing) {
      return;
    }

    // 作業員が選択されているか確認
    if (!selectedPersonId) {
      Alert.alert("エラー", "作業員を選択してください", [{ text: "OK" }]);
      return;
    }

    try {
      setIsProcessing(true);
      setRegistrationResult(null);

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
      console.log("==================== FACE REGISTRATION DEBUG ====================");
      console.log(`[DEBUG] Face API URL: ${apiFaceApi}`);
      console.log(`[DEBUG] API Key: ${apiFaceApiKey.substring(0, 10)}...`);
      console.log(`[DEBUG] Full endpoint: ${apiFaceApi}/api/face/register`);
      console.log(`[DEBUG] Selected Person ID: ${selectedPersonId}`);
      console.log(`[DEBUG] Image data length: ${imageData.length} bytes`);
      console.log(`[DEBUG] Timeout: ${TIMEOUT.FACE_RECOGNITION}ms`);
      console.log("===============================================================");

      // Face APIに送信（タイムアウト付き）
      console.log("[DEBUG] Sending request to Face API...");
      const response = await fetchWithTimeout(`${apiFaceApi}/api/face/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiFaceApiKey,
        },
        body: JSON.stringify({
          person_id: selectedPersonId,
          image_data: imageData,
        }),
        timeoutMs: TIMEOUT.FACE_RECOGNITION, // 30秒
      });

      console.log(`[DEBUG] Response received! Status: ${response.status}`);
      console.log(`[DEBUG] Response headers:`, Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        console.error(`[DEBUG] HTTP error! status: ${response.status}`);

        if (response.status === 404) {
          throw new Error(
            "Face API サーバーのエンドポイントが見つかりません。\n\n" +
            `URL: ${apiFaceApi}/api/face/register\n\n` +
            "サーバーが正しく起動しているか確認してください。"
          );
        }

        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = (await response.json()) as FaceRegistrationResponse;
      console.log("[DEBUG] Response body:", JSON.stringify(result, null, 2));

      // 登録結果を保存
      setRegistrationResult(result);

      // 結果を表示
      showResultAlert(result);
      console.log("[DEBUG] Face registration completed successfully");
    } catch (error) {
      console.error("==================== FACE REGISTRATION ERROR ====================");
      console.error("[ERROR] Error type:", error?.constructor?.name);
      console.error("[ERROR] Error message:", error instanceof Error ? error.message : String(error));
      console.error("[ERROR] Error name:", error instanceof Error ? error.name : "unknown");
      console.error("[ERROR] Error stack:", error instanceof Error ? error.stack : "no stack");
      console.error("===============================================================");

      let errorMessage = "顔登録に失敗しました";

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

  // 登録結果をアラートで表示
  const showResultAlert = (result: FaceRegistrationResponse) => {
    if (result.error) {
      // エラーメッセージを表示
      Alert.alert("登録失敗", result.error, [{ text: "OK" }]);
      return;
    }

    if (result.success && result.person_id) {
      // 登録成功
      const selectedWorker = workers.find(w => w.personId === result.person_id);
      const workerName = selectedWorker?.name || result.person_id;

      Alert.alert(
        "登録完了",
        `作業員: ${workerName}\n` +
          `Person ID: ${result.person_id}\n` +
          `エンコーディング次元数: ${result.embedding_dimensions || "N/A"}`,
        [
          {
            text: "OK",
            onPress: () => {
              // 登録成功後、選択をクリア
              setSelectedPersonId("");
              setRegistrationResult(null);
            }
          }
        ]
      );
      return;
    }

    // その他のエラー
    Alert.alert(
      "登録失敗",
      "顔の登録に失敗しました。もう一度お試しください。",
      [{ text: "OK" }]
    );
  };

  // 戻るボタン
  const handleGoBack = () => {
    router.back();
  };

  // 作業員選択ハンドラー
  const handleSelectWorker = (personId: string) => {
    setSelectedPersonId(personId);
    setIsWorkerModalVisible(false);
    setRegistrationResult(null);
  };

  // 選択された作業員情報を取得
  const selectedWorker = workers.find(w => w.personId === selectedPersonId);

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
              <Text style={styles.title}>顔登録</Text>
              <View style={styles.backButton} />
            </View>

            {/* ワーカー選択UI */}
            <View style={styles.workerSelectContainer}>
              <TouchableOpacity
                style={styles.workerSelectButton}
                onPress={() => setIsWorkerModalVisible(true)}
              >
                <View style={styles.workerSelectContent}>
                  <View>
                    <Text style={styles.workerSelectLabel}>作業員を選択</Text>
                    {selectedWorker ? (
                      <>
                        <Text style={styles.workerSelectText}>
                          {selectedWorker.name}
                        </Text>
                        <Text style={styles.workerSelectSubText}>
                          {selectedWorker.company} • {selectedWorker.personId}
                        </Text>
                      </>
                    ) : (
                      <Text style={styles.workerSelectPlaceholder}>
                        タップして選択してください
                      </Text>
                    )}
                  </View>
                  <Ionicons
                    name="chevron-down"
                    size={24}
                    color={tokens.color.text.secondary}
                  />
                </View>
              </TouchableOpacity>
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
            {registrationResult && (
              <View style={styles.resultCard}>
                {registrationResult.success ? (
                  <View>
                    <View style={styles.resultHeader}>
                      <Ionicons name="checkmark-circle" size={24} color={tokens.color.success} />
                      <Text style={styles.resultTitle}>登録完了</Text>
                    </View>
                    <Text style={styles.resultText}>
                      {workers.find(w => w.personId === registrationResult.person_id)?.name || registrationResult.person_id}
                    </Text>
                    <Text style={styles.resultSubText}>
                      Person ID: {registrationResult.person_id}
                    </Text>
                    <Text style={styles.resultSubText}>
                      エンコーディング次元数: {registrationResult.embedding_dimensions || "N/A"}
                    </Text>
                  </View>
                ) : (
                  <View>
                    <View style={styles.resultHeader}>
                      <Ionicons name="close-circle" size={24} color={tokens.color.danger} />
                      <Text style={[styles.resultTitle, styles.resultTitleError]}>
                        登録失敗
                      </Text>
                    </View>
                    <Text style={styles.resultText}>
                      {registrationResult.error || "顔の登録に失敗しました"}
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
                  <Text style={styles.processingText}>登録中...</Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={[
                    styles.captureButton,
                    (!isCameraReady || !selectedPersonId) && styles.captureButtonDisabled,
                  ]}
                  onPress={handleTakePicture}
                  disabled={!isCameraReady || isProcessing || !selectedPersonId}
                >
                  <View style={styles.captureButtonInner} />
                </TouchableOpacity>
              )}
            </View>
          </View>
        </CameraView>
      </View>

      {/* 作業員選択モーダル */}
      <Modal
        visible={isWorkerModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setIsWorkerModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>作業員を選択</Text>
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={() => setIsWorkerModalVisible(false)}
              >
                <Ionicons name="close" size={28} color={tokens.color.text.primary} />
              </TouchableOpacity>
            </View>

            {workers.length === 0 ? (
              <View style={styles.modalEmptyState}>
                <Ionicons
                  name="people-outline"
                  size={64}
                  color={tokens.color.text.secondary}
                />
                <Text style={styles.modalEmptyText}>
                  作業員データがありません
                </Text>
                <Text style={styles.modalEmptySubText}>
                  設定画面からデータを同期してください
                </Text>
              </View>
            ) : (
              <FlatList
                data={workers}
                keyExtractor={(item) => item.personId}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[
                      styles.workerItem,
                      item.personId === selectedPersonId && styles.workerItemSelected,
                    ]}
                    onPress={() => handleSelectWorker(item.personId)}
                  >
                    <View style={styles.workerItemContent}>
                      <Text style={styles.workerItemName}>{item.name}</Text>
                      <Text style={styles.workerItemDetails}>
                        {item.company} • {item.personId}
                      </Text>
                    </View>
                    {item.personId === selectedPersonId && (
                      <Ionicons
                        name="checkmark-circle"
                        size={24}
                        color={tokens.color.primary}
                      />
                    )}
                  </TouchableOpacity>
                )}
                ItemSeparatorComponent={() => <View style={styles.workerItemSeparator} />}
              />
            )}
          </View>
        </View>
      </Modal>
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

  workerSelectContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
  },

  workerSelectButton: {
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    borderRadius: 12,
    padding: 16,
  },

  workerSelectContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  workerSelectLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: tokens.color.text.primary,
    marginBottom: 4,
  },

  workerSelectText: {
    fontSize: 16,
    fontWeight: "600",
    color: tokens.color.text.primary,
    marginTop: 4,
  },

  workerSelectSubText: {
    fontSize: 14,
    color: tokens.color.text.secondary,
    marginTop: 2,
  },

  workerSelectPlaceholder: {
    fontSize: 16,
    color: tokens.color.text.secondary,
    marginTop: 4,
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

  // モーダルスタイル
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },

  modalContent: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "80%",
    paddingBottom: 20,
  },

  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.border.default,
  },

  modalTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: tokens.color.text.primary,
  },

  modalCloseButton: {
    padding: 4,
  },

  modalEmptyState: {
    padding: 40,
    alignItems: "center",
    justifyContent: "center",
  },

  modalEmptyText: {
    fontSize: 18,
    fontWeight: "600",
    color: tokens.color.text.primary,
    marginTop: 16,
    textAlign: "center",
  },

  modalEmptySubText: {
    fontSize: 14,
    color: tokens.color.text.secondary,
    marginTop: 8,
    textAlign: "center",
  },

  workerItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#fff",
  },

  workerItemSelected: {
    backgroundColor: tokens.color.background.default,
  },

  workerItemContent: {
    flex: 1,
  },

  workerItemName: {
    fontSize: 16,
    fontWeight: "600",
    color: tokens.color.text.primary,
    marginBottom: 4,
  },

  workerItemDetails: {
    fontSize: 14,
    color: tokens.color.text.secondary,
  },

  workerItemSeparator: {
    height: 1,
    backgroundColor: tokens.color.border.default,
    marginLeft: 16,
  },
});
