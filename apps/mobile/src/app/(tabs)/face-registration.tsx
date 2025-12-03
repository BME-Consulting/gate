// ==========================================
// 顔登録画面（顔検出バリデーション付き）
// ==========================================

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { View, Text, StyleSheet, Alert, TouchableOpacity, ActivityIndicator, Modal, FlatList } from "react-native";
import { Camera, useCameraDevice, useCameraPermission } from "react-native-vision-camera";
import { useFocusEffect } from "@react-navigation/native";
import Constants from "expo-constants";
import { Button, tokens } from "@mc-gate/ui-kit";
import { Ionicons } from "@expo/vector-icons";
import { useWorkers } from "../../hooks/useWorkers";
import { router } from "expo-router";
import { TIMEOUT, fetchWithTimeout } from "@mc-gate/core";
import { useFaceDetection } from "../../hooks/useFaceDetection";
import type { Face } from "react-native-vision-camera-face-detector";

// Face API レスポンス型定義（Face APIはsnake_caseを返す）
interface FaceRegistrationResponse {
  success: boolean;
  person_id?: string;
  embedding_dimensions?: number;
  face_count?: number;
  error?: string;
}

export default function FaceRegistrationScreen() {
  console.log("[FaceReg] 🔍 DEBUG: Component render start");

  const { hasPermission, requestPermission } = useCameraPermission();
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedPersonId, setSelectedPersonId] = useState<string>("");
  const [registrationResult, setRegistrationResult] = useState<FaceRegistrationResponse | null>(null);
  const [isWorkerModalVisible, setIsWorkerModalVisible] = useState(false);
  const [detectionStatus, setDetectionStatus] = useState<string>("作業員を選択して顔をフレーム内に合わせてください");
  const [lastFaceDetection, setLastFaceDetection] = useState<{
    timestamp: number;
    confidence: number;
    size: number;
  } | null>(null);
  const [isFocused, setIsFocused] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);

  const cameraRef = useRef<Camera>(null);
  const processingLock = useRef(false);
  const lastProcessTime = useRef(0);
  const { workers, getAllWorkers, isReady } = useWorkers();

  // vision-camera device
  const cameraDevice = useCameraDevice('front') || undefined;

  // デバイス取得失敗時のエラーハンドリング
  useEffect(() => {
    if (cameraDevice === null || cameraDevice === undefined) {
      console.error("[FaceReg] Vision camera device not found");
      setInitError("カメラデバイスが見つかりません。新しいビルドが必要です。");
    } else {
      console.log("[FaceReg] Vision camera device found:", cameraDevice);
      setInitError(null);
    }
  }, [cameraDevice]);

  // 作業員一覧を取得
  useEffect(() => {
    if (isReady) {
      getAllWorkers().catch(error => {
        console.error("Failed to load workers:", error);
      });
    }
  }, [isReady, getAllWorkers]);

  // タブフォーカス時にカメラリソースをリセット
  useFocusEffect(
    useCallback(() => {
      console.log("[FaceReg] Tab focused - mounting camera");
      setIsFocused(true);
      setIsProcessing(false);
      setDetectionStatus("作業員を選択して顔をフレーム内に合わせてください");
      setLastFaceDetection(null);
      processingLock.current = false;
      lastProcessTime.current = 0;

      return () => {
        console.log("[FaceReg] Tab unfocused - unmounting camera");
        setIsFocused(false);
        processingLock.current = false;
        lastProcessTime.current = 0;
        setIsCameraReady(false);
      };
    }, [])
  );

  // 顔検出コールバック
  const handleFacesDetected = useCallback(async (faces: Face[]) => {
    // Guard against invalid input
    if (!faces || !Array.isArray(faces)) {
      console.warn('[FaceReg] Invalid faces parameter:', faces);
      return;
    }

    console.log(`[FaceReg] handleFacesDetected called - faces count: ${faces.length}`);

    // 処理中または最近処理した場合はスキップ
    const now = Date.now();
    if (processingLock.current || now - lastProcessTime.current < 1000) {
      console.log(`[FaceReg] Skipping face detection - processing: ${processingLock.current}, cooldown: ${now - lastProcessTime.current}ms`);
      return;
    }

    // 顔が検出されていない場合
    if (faces.length === 0) {
      setLastFaceDetection(null);
      if (selectedPersonId) {
        setDetectionStatus("顔をフレーム内に合わせてください");
      } else {
        setDetectionStatus("作業員を選択して顔をフレーム内に合わせてください");
      }
      return;
    }

    console.log(`[FaceReg] Face detected`);

    // 最大の顔を取得
    const largestFace = faces.reduce((prev, current) =>
      current.bounds.width * current.bounds.height >
      prev.bounds.width * prev.bounds.height
        ? current
        : prev
    );

    const faceSize = largestFace.bounds.width * largestFace.bounds.height;

    // 顔の品質チェック
    const isFaceQualityGood = faceSize > 20000; // 顔のサイズが十分大きい

    // 顔検出情報を保存
    setLastFaceDetection({
      timestamp: now,
      confidence: 0.8, // vision-camera face detector の固定値
      size: faceSize,
    });

    if (isFaceQualityGood) {
      console.log(`[FaceReg] Face quality good - size: ${faceSize}`);
      if (selectedPersonId) {
        setDetectionStatus("✅ 顔を検出しました。写真を撮影してください");
      } else {
        setDetectionStatus("✅ 顔を検出しました。作業員を選択してください");
      }
    } else {
      console.log(`[FaceReg] Face quality poor - size: ${faceSize}`);
      setDetectionStatus("顔をまっすぐカメラに向けてください");
    }
  }, [selectedPersonId]);

  // 🔍 DEBUG: useFaceDetection を一旦無効化してテスト
  console.log("[FaceReg] 🔍 DEBUG: About to call useFaceDetection (commented out for debug)");

  // const frameProcessor = useFaceDetection({
  //   enabled: !isProcessing,
  //   onFacesDetected: handleFacesDetected,
  //   minFaceSize: 20000,
  //   cooldownMs: 500,
  // });

  // ★ デバッグ用: frameProcessor を undefined に設定
  const frameProcessor = undefined;

  console.log("[FaceReg] 🔍 DEBUG: frameProcessor is now undefined (camera disabled)");

  // カメラ権限のチェック
  if (!hasPermission) {
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

  // エラー表示
  if (initError) {
    return (
      <View style={styles.container}>
        <View style={styles.centerContent}>
          <Ionicons name="alert-circle-outline" size={64} color={tokens.color.danger} />
          <Text style={styles.message}>{initError}</Text>
          <TouchableOpacity
            style={[styles.permissionButton, { marginTop: 24 }]}
            onPress={() => router.back()}
          >
            <Text style={styles.permissionButtonText}>戻る</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // 写真を撮影してFace APIに送信
  const handleTakePicture = async () => {
    if (!cameraRef.current || !isCameraReady || isProcessing || processingLock.current) {
      return;
    }

    // 作業員が選択されているか確認
    if (!selectedPersonId) {
      Alert.alert("エラー", "作業員を選択してください", [{ text: "OK" }]);
      return;
    }

    // 顔が検出されているか確認
    if (!lastFaceDetection) {
      Alert.alert("エラー", "顔が検出されていません。\n顔をフレーム内に合わせてください", [{ text: "OK" }]);
      return;
    }

    // 顔検出が古い場合は拒否
    const now = Date.now();
    if (now - lastFaceDetection.timestamp > 2000) {
      Alert.alert("エラー", "顔の検出が古くなっています。\nもう一度顔をフレーム内に合わせてください", [{ text: "OK" }]);
      setLastFaceDetection(null);
      return;
    }

    // 顔のサイズが十分大きいか確認
    if (lastFaceDetection.size < 20000) {
      Alert.alert("エラー", "顔が小さすぎます。\nカメラに近づいてください", [{ text: "OK" }]);
      return;
    }

    try {
      processingLock.current = true;
      setIsProcessing(true);
      setRegistrationResult(null);
      setDetectionStatus("登録中...");

      // 写真を撮影（vision-camera）
      const photo = await cameraRef.current.takePhoto({
        flash: 'off',
        enableShutterSound: false,
      });

      if (!photo || !photo.path) {
        throw new Error("写真の撮影に失敗しました");
      }

      // Base64に変換（react-native-fs を使用）
      const RNFS = require('react-native-fs');
      const base64Image = await RNFS.readFile(photo.path, 'base64');
      const imageData = `data:image/jpeg;base64,${base64Image}`;

      // 環境変数からFace API URLとAPIキーを取得
      const apiFaceApi = Constants.expoConfig?.extra?.apiFaceApi || "http://192.168.1.4:8101";
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
          personId: selectedPersonId,   // Face API expects camelCase
          imageData: imageData,          // Face API expects camelCase
        }),
        timeoutMs: TIMEOUT.FACE_RECOGNITION, // 30秒
      });

      console.log(`[DEBUG] Response received! Status: ${response.status}`);

      if (!response.ok) {
        console.error(`[DEBUG] HTTP error! status: ${response.status}`);

        // サーバーからのエラーメッセージを取得
        let errorDetail = "";
        try {
          const errorData = await response.json();
          errorDetail = errorData.error || errorData.message || JSON.stringify(errorData);
        } catch {
          // JSON パースに失敗した場合は無視
        }

        if (response.status === 404) {
          // 404の場合、サーバーからのエラーメッセージを表示
          // (エンドポイントが存在しない場合とworkerが見つからない場合を区別)
          throw new Error(
            errorDetail || "指定された作業員が見つかりません。"
          );
        }

        if (response.status === 403) {
          throw new Error(
            "Face API サーバーへのアクセスが拒否されました。\n\n" +
            (errorDetail ? `エラー: ${errorDetail}\n\n` : "") +
            "APIキーが正しく設定されているか確認してください。"
          );
        }

        if (response.status === 400) {
          throw new Error(
            "リクエストが不正です。\n\n" +
            (errorDetail ? `エラー: ${errorDetail}` : "サーバーがリクエストを処理できませんでした。")
          );
        }

        // その他のHTTPエラー
        throw new Error(
          `サーバーエラーが発生しました (${response.status})\n\n` +
          (errorDetail ? `詳細: ${errorDetail}` : "")
        );
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
      processingLock.current = false;
      setIsProcessing(false);
      setDetectionStatus("作業員を選択して顔をフレーム内に合わせてください");
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
              setLastFaceDetection(null);
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
    setLastFaceDetection(null);
    setDetectionStatus("顔をフレーム内に合わせてください");
  };

  // 選択された作業員情報を取得
  const selectedWorker = workers.find(w => w.personId === selectedPersonId);

  // 顔が検出されているかチェック (useMemo で最適化)
  const isFaceDetected = useMemo(() => {
    if (!lastFaceDetection) return false;
    return (Date.now() - lastFaceDetection.timestamp < 2000) &&
           lastFaceDetection.size >= 20000;
  }, [lastFaceDetection]);

  console.log("[FaceReg] 🔍 DEBUG: About to render - isFocused:", isFocused, "cameraDevice:", !!cameraDevice);

  return (
    <View style={styles.container}>
      {/* 🔍 DEBUG: Camera を一旦無効化してテスト */}
      {false && isFocused && cameraDevice ? (
        <View style={styles.cameraContainer}>
          {/* Camera は自己完結型タグに変更（オーバーレイは外側に配置） */}
          <Camera
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            device={cameraDevice}
            isActive={isFocused && !isProcessing}
            photo={true}
            frameProcessor={frameProcessor}
            onInitialized={() => {
              console.log("[FaceReg] Vision Camera initialized");
              setIsCameraReady(true);
            }}
            onError={(error) => {
              console.error("[FaceReg] Vision Camera error:", error);
            }}
          />

          {/* オーバーレイを Camera の外側に配置（auth.tsx と同じ構造） */}
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
                <View style={[
                  styles.guideFrame,
                  isFaceDetected && styles.guideFrameDetected
                ]}>
                  <View style={[
                    styles.guideCorner,
                    styles.guideCornerTopLeft,
                    isFaceDetected && styles.guideCornerDetected
                  ]} />
                  <View style={[
                    styles.guideCorner,
                    styles.guideCornerTopRight,
                    isFaceDetected && styles.guideCornerDetected
                  ]} />
                  <View style={[
                    styles.guideCorner,
                    styles.guideCornerBottomLeft,
                    isFaceDetected && styles.guideCornerDetected
                  ]} />
                  <View style={[
                    styles.guideCorner,
                    styles.guideCornerBottomRight,
                    isFaceDetected && styles.guideCornerDetected
                  ]} />
                </View>
                <Text style={[
                  styles.guideText,
                  isFaceDetected && styles.guideTextDetected
                ]}>
                  {detectionStatus}
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
                      (!isCameraReady || !selectedPersonId || !isFaceDetected) && styles.captureButtonDisabled,
                      isFaceDetected && styles.captureButtonActive,
                    ]}
                    onPress={handleTakePicture}
                    disabled={!isCameraReady || isProcessing || !selectedPersonId || !isFaceDetected}
                  >
                    <View style={[
                      styles.captureButtonInner,
                      isFaceDetected && styles.captureButtonInnerActive,
                    ]} />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
      ) : (
        // 🔍 DEBUG: Camera が無効化されている場合のメッセージ
        <View style={[StyleSheet.absoluteFill, { justifyContent: 'center', alignItems: 'center', backgroundColor: '#1a1a1a' }]}>
          <Ionicons name="camera-off-outline" size={80} color="#ffffff" />
          <Text style={{ color: "#ffffff", fontSize: 24, fontWeight: "600", marginTop: 24, textAlign: 'center', paddingHorizontal: 32 }}>
            🔍 デバッグモード
          </Text>
          <Text style={{ color: "#cccccc", fontSize: 16, marginTop: 16, textAlign: 'center', paddingHorizontal: 32, lineHeight: 24 }}>
            Camera と useFaceDetection を無効化しています
          </Text>
          <Text style={{ color: "#999999", fontSize: 14, marginTop: 12, textAlign: 'center', paddingHorizontal: 32, lineHeight: 20 }}>
            この画面が表示されれば、{'\n'}
            JSロジック自体は正常に動作しています。
          </Text>
          <TouchableOpacity
            style={{
              marginTop: 32,
              backgroundColor: tokens.color.primary,
              paddingHorizontal: 32,
              paddingVertical: 16,
              borderRadius: 12,
            }}
            onPress={handleGoBack}
          >
            <Text style={{ color: "#fff", fontSize: 16, fontWeight: "600" }}>戻る</Text>
          </TouchableOpacity>
        </View>
      )}

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

  permissionButton: {
    marginTop: tokens.spacing.lg,
    backgroundColor: tokens.color.primary,
    paddingHorizontal: tokens.spacing.xl,
    paddingVertical: tokens.spacing.md,
    borderRadius: tokens.radius.md,
  },

  permissionButtonText: {
    fontSize: tokens.font.size.base,
    fontWeight: tokens.font.weight.semibold,
    color: "#fff",
  },

  cameraContainer: {
    flex: 1,
  },

  overlay: {
    ...StyleSheet.absoluteFillObject,
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

  guideFrameDetected: {
    // Animation could be added here
  },

  guideCorner: {
    position: "absolute",
    width: 40,
    height: 40,
    borderColor: "#fff",
  },

  guideCornerDetected: {
    borderColor: tokens.color.success,
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

  guideTextDetected: {
    backgroundColor: tokens.color.success,
    color: "#fff",
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

  captureButtonActive: {
    borderColor: tokens.color.success,
  },

  captureButtonInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#fff",
    borderWidth: 2,
    borderColor: "#000",
  },

  captureButtonInnerActive: {
    backgroundColor: tokens.color.success,
    borderColor: tokens.color.success,
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
