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
import * as Sentry from "@sentry/react-native";

// Face API レスポンス型定義（Face APIはsnake_caseを返す）
interface FaceRegistrationResponse {
  success: boolean;
  person_id?: string;
  embedding_dimensions?: number;
  face_count?: number;
  error?: string;
}

// Face API Verify レスポンス型定義
interface FaceVerifyResponse {
  success: boolean;
  mode: "verify";
  person_id: string;
  distance: number;
  threshold: number;
  matched: boolean;
  embedding_dimensions: number;
  model_version: string;
  timestamp: string;
  error_code?: string;
  error_message?: string;
}

export default function FaceRegistrationScreen() {
  const { hasPermission, requestPermission } = useCameraPermission();
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedPersonId, setSelectedPersonId] = useState<string>("");
  const [registrationResult, setRegistrationResult] = useState<FaceRegistrationResponse | null>(null);
  const [verifyResult, setVerifyResult] = useState<FaceVerifyResponse | null>(null);
  const [isWorkerModalVisible, setIsWorkerModalVisible] = useState(false);
  const [isFocused, setIsFocused] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const [mode, setMode] = useState<"register" | "verify">("register");

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

  // 🎯 シンプルなステータスメッセージ（サーバー側Face API専用）
  const detectionStatus = useMemo(() => {
    if (isProcessing) {
      return mode === "register" ? "登録中..." : "本人確認中...";
    }

    if (!selectedPersonId) {
      const action = mode === "register" ? "登録" : "本人確認";
      return `作業員を選択して、顔をフレーム内に合わせてから${action}ボタンをタップしてください`;
    }

    const action = mode === "register" ? "撮影" : "本人確認";
    return `顔をフレーム内に合わせて、${action}ボタンをタップしてください`;
  }, [isProcessing, selectedPersonId, mode]);

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

  // 写真を撮影してFace APIに送信（サーバー側で顔検出）
  const handleTakePicture = async () => {
    if (!cameraRef.current || !isCameraReady || isProcessing || processingLock.current) {
      return;
    }

    // 作業員が選択されているか確認
    if (!selectedPersonId) {
      Alert.alert("エラー", "作業員を選択してください", [{ text: "OK" }]);
      return;
    }

    try {
      processingLock.current = true;
      setIsProcessing(true);
      setRegistrationResult(null);

      // 写真を撮影（vision-camera）
      // P0: 画像品質最適化 - 1.5MB以下に抑える
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

      // P0: 画像サイズチェック（1.5MB推奨、3MB上限）
      const imageSizeKB = Math.round(imageData.length / 1024);
      const imageSizeMB = (imageSizeKB / 1024).toFixed(2);
      console.log(`[FaceReg] Image size: ${imageSizeKB} KB (${imageSizeMB} MB)`);

      if (imageData.length > 3 * 1024 * 1024) {
        // 3MB超過は送信拒否
        throw new Error(
          `画像サイズが大きすぎます (${imageSizeMB} MB)\n\n` +
          `最大サイズ: 3 MB\n` +
          `もう一度撮影してください。`
        );
      }

      if (imageData.length > 1.5 * 1024 * 1024) {
        // 1.5MB超過は警告のみ
        console.warn(`[FaceReg] Image size exceeds recommended limit: ${imageSizeMB} MB (recommended: 1.5 MB)`);
      }

      // 環境変数からFace API URLとAPIキーを取得
      const apiFaceApi = Constants.expoConfig?.extra?.apiFaceApi || "http://192.168.1.4:8101";
      const apiFaceApiKey = Constants.expoConfig?.extra?.apiFaceApiKey || "development-api-key-12345";

      console.log("[FaceReg] Sending to Face API:", apiFaceApi);

      // Face APIに送信（タイムアウト付き）
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
        timeoutMs: TIMEOUT.FACE_RECOGNITION,
      });

      if (!response.ok) {
        let errorDetail = "";
        try {
          const errorData = await response.json();
          errorDetail = errorData.error || errorData.message || JSON.stringify(errorData);
        } catch {
          // JSON パースに失敗した場合は無視
        }

        if (response.status === 404) {
          throw new Error(errorDetail || "指定された作業員が見つかりません。");
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

        throw new Error(
          `サーバーエラーが発生しました (${response.status})\n\n` +
          (errorDetail ? `詳細: ${errorDetail}` : "")
        );
      }

      const result = (await response.json()) as FaceRegistrationResponse;
      console.log("[FaceReg] Registration result:", result);

      // 登録結果を保存
      setRegistrationResult(result);

      // 結果を表示
      showResultAlert(result);
    } catch (error) {
      console.error("[FaceReg] Registration error:", error);

      // P0: 改善されたエラーメッセージ
      let errorMessage = "顔登録に失敗しました";

      if (error instanceof Error) {
        if (error.name === 'AbortError' || error.message.includes('タイムアウト')) {
          // タイムアウトエラー（30秒）
          errorMessage =
            "サーバーへの接続がタイムアウトしました（30秒）\n\n" +
            "しばらく待ってから、もう一度お試しください。";
        } else if (error.message.includes('Failed to fetch') || error.message.includes('Network')) {
          // ネットワークエラー
          errorMessage =
            "Face API サーバーに接続できません\n\n" +
            "ネットワーク接続とサーバーの状態を確認してください。";
        } else {
          errorMessage = error.message;
        }
      }

      Alert.alert("エラー", errorMessage, [{ text: "OK" }]);
    } finally {
      processingLock.current = false;
      setIsProcessing(false);
    }
  };

  // 登録結果をアラートで表示
  const showResultAlert = (result: FaceRegistrationResponse) => {
    if (result.error) {
      Alert.alert("登録失敗", result.error, [{ text: "OK" }]);
      return;
    }

    if (result.success && result.person_id) {
      const selectedWorker = workers?.find(w => w.personId === result.person_id);
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
              setSelectedPersonId("");
              setRegistrationResult(null);
            }
          }
        ]
      );
      return;
    }

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
    setVerifyResult(null);
  };

  // 本人確認ハンドラー
  const handleVerify = async () => {
    if (!cameraRef.current || !isCameraReady || isProcessing || processingLock.current) {
      return;
    }

    // 作業員が選択されているか確認
    if (!selectedPersonId) {
      Alert.alert("エラー", "作業員を選択してください", [{ text: "OK" }]);
      return;
    }

    try {
      processingLock.current = true;
      setIsProcessing(true);
      setVerifyResult(null);

      // 写真を撮影（vision-camera）
      const photo = await cameraRef.current.takePhoto({
        flash: 'off',
        enableShutterSound: false,
      });

      if (!photo || !photo.path) {
        throw new Error("写真の撮影に失敗しました");
      }

      // Base64に変換
      const RNFS = require('react-native-fs');
      const base64Image = await RNFS.readFile(photo.path, 'base64');
      const imageData = `data:image/jpeg;base64,${base64Image}`;

      // 環境変数からFace API URLとAPIキーを取得
      const apiFaceApi = Constants.expoConfig?.extra?.apiFaceApi || "http://192.168.1.4:8101";
      const apiFaceApiKey = Constants.expoConfig?.extra?.apiFaceApiKey || "development-api-key-12345";

      console.log("[FaceVerify] Sending to Face API:", apiFaceApi);

      // Face API Verify エンドポイントに送信
      const response = await fetchWithTimeout(`${apiFaceApi}/api/face/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiFaceApiKey,
        },
        body: JSON.stringify({
          person_id: selectedPersonId,
          image_data: imageData,
        }),
        timeoutMs: TIMEOUT.FACE_RECOGNITION,
      });

      if (!response.ok) {
        let errorDetail = "";
        try {
          const errorData = await response.json();
          errorDetail = errorData.error_message || errorData.error || JSON.stringify(errorData);
        } catch {
          // JSON パースに失敗した場合は無視
        }

        if (response.status === 404) {
          throw new Error(errorDetail || "顔エンベディングが登録されていません。先に顔登録を行ってください。");
        }

        if (response.status === 400) {
          throw new Error(errorDetail || "顔が検出できませんでした。もう一度お試しください。");
        }

        throw new Error(
          `サーバーエラーが発生しました (${response.status})\n\n` +
          (errorDetail ? `詳細: ${errorDetail}` : "")
        );
      }

      const result = (await response.json()) as FaceVerifyResponse;
      console.log("[FaceVerify] Verification result:", result);

      // 本人確認結果を保存
      setVerifyResult(result);
    } catch (error) {
      console.error("[FaceVerify] Verification error:", error);

      let errorMessage = "本人確認に失敗しました";

      if (error instanceof Error) {
        if (error.name === 'AbortError' || error.message.includes('タイムアウト')) {
          errorMessage =
            "サーバーへの接続がタイムアウトしました（30秒）\n\n" +
            "しばらく待ってから、もう一度お試しください。";
        } else if (error.message.includes('Failed to fetch') || error.message.includes('Network')) {
          errorMessage =
            "Face API サーバーに接続できません\n\n" +
            "ネットワーク接続とサーバーの状態を確認してください。";
        } else {
          errorMessage = error.message;
        }
      }

      Alert.alert("エラー", errorMessage, [{ text: "OK" }]);
    } finally {
      processingLock.current = false;
      setIsProcessing(false);
    }
  };

  // 選択された作業員情報を取得
  const selectedWorker = workers?.find(w => w.personId === selectedPersonId);

  // 🔥 Camera を安定領域に配置（isFocusedのみで制御、cameraDevice削除）
  return (
    <View style={styles.container}>
      {isFocused && cameraDevice && (
        <View style={styles.cameraContainer}>
          {/* Camera - frameProcessor削除（サーバー側Face API専用） */}
          <Camera
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            device={cameraDevice}
            isActive={isFocused}
            photo={true}
            onInitialized={() => {
              console.log("[FaceReg] Camera initialized");
              setIsCameraReady(true);
            }}
            onError={(error) => {
              console.error("[FaceReg] Camera error:", error);
            }}
          />

          {/* オーバーレイ（Camera の外側に配置） */}
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

              {/* ガイドフレーム（固定色・サーバー側判定） */}
              <View style={styles.guideContainer}>
                <View style={styles.guideFrame}>
                  <View style={[styles.guideCorner, styles.guideCornerTopLeft]} />
                  <View style={[styles.guideCorner, styles.guideCornerTopRight]} />
                  <View style={[styles.guideCorner, styles.guideCornerBottomLeft]} />
                  <View style={[styles.guideCorner, styles.guideCornerBottomRight]} />
                </View>
                <Text style={styles.guideText}>
                  {detectionStatus}
                </Text>

                {/* シンプルなガイドメッセージ */}
                {!isProcessing && !registrationResult && !verifyResult && (
                  <View style={styles.guideMessageCard}>
                    <Text style={styles.guideMessageSimple}>
                      正面を向いて、顔全体をフレーム内に入れてください
                    </Text>
                  </View>
                )}
              </View>

              {/* 結果表示エリア（シンプル版） */}
              {registrationResult && (
                <View style={styles.resultCard}>
                  {registrationResult.success ? (
                    <View>
                      <View style={styles.resultHeader}>
                        <Ionicons name="checkmark-circle" size={24} color={tokens.color.success} />
                        <Text style={styles.resultTitle}>登録完了</Text>
                      </View>
                      <Text style={styles.resultText}>
                        {workers?.find(w => w.personId === registrationResult.person_id)?.name || registrationResult.person_id}
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

              {/* 本人確認結果表示エリア（シンプル版） */}
              {verifyResult && (
                <View
                  style={[
                    styles.resultCard,
                    verifyResult.matched ? styles.resultCardMatched : styles.resultCardNotMatched,
                  ]}
                >
                  <View>
                    <View style={styles.resultHeader}>
                      <Ionicons
                        name={verifyResult.matched ? "checkmark-circle" : "close-circle"}
                        size={24}
                        color={verifyResult.matched ? tokens.color.success : tokens.color.danger}
                      />
                      <Text
                        style={[
                          styles.resultTitle,
                          verifyResult.matched ? {} : styles.resultTitleError,
                        ]}
                      >
                        {verifyResult.matched ? "本人確認 OK" : "本人確認 NG"}
                      </Text>
                    </View>
                    <Text style={styles.resultText}>
                      {workers?.find(w => w.personId === verifyResult.person_id)?.name || verifyResult.person_id}
                    </Text>
                  </View>
                </View>
              )}

              {/* ボトムバー */}
              <View style={styles.bottomBar}>
                {isProcessing ? (
                  <View style={styles.processingContainer}>
                    <ActivityIndicator size="large" color="#fff" />
                    <Text style={styles.processingText}>
                      {mode === "register" ? "登録中..." : "本人確認中..."}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.buttonRow}>
                    {/* 登録ボタン */}
                    <TouchableOpacity
                      style={[
                        styles.actionButton,
                        mode === "register" && styles.actionButtonActive,
                        (!isCameraReady || !selectedPersonId) && styles.actionButtonDisabled,
                      ]}
                      onPress={() => {
                        setMode("register");
                        setVerifyResult(null);
                        handleTakePicture();
                      }}
                      disabled={!isCameraReady || isProcessing || !selectedPersonId}
                    >
                      <Ionicons name="camera" size={24} color="#fff" />
                      <Text style={styles.actionButtonText}>登録</Text>
                    </TouchableOpacity>

                    {/* 本人確認ボタン */}
                    <TouchableOpacity
                      style={[
                        styles.actionButton,
                        styles.actionButtonVerify,
                        mode === "verify" && styles.actionButtonActive,
                        (!isCameraReady || !selectedPersonId) && styles.actionButtonDisabled,
                      ]}
                      onPress={() => {
                        setMode("verify");
                        setRegistrationResult(null);
                        handleVerify();
                      }}
                      disabled={!isCameraReady || isProcessing || !selectedPersonId}
                    >
                      <Ionicons name="shield-checkmark" size={24} color="#fff" />
                      <Text style={styles.actionButtonText}>本人確認</Text>
                    </TouchableOpacity>
                  </View>
                )}
            </View>
          </View>
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

            {(workers?.length ?? 0) === 0 ? (
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
                data={workers ?? []}
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

  // シンプルなガイドメッセージ
  guideMessageCard: {
    marginTop: 16,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    borderRadius: 12,
    padding: 12,
    maxWidth: 320,
  },

  guideMessageSimple: {
    fontSize: 14,
    color: "#fff",
    textAlign: "center",
    lineHeight: 20,
  },

  // 本人確認機能追加スタイル
  buttonRow: {
    flexDirection: "row",
    gap: 16,
    paddingHorizontal: 16,
  },

  actionButton: {
    flex: 1,
    backgroundColor: tokens.color.primary,
    paddingVertical: 16,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 2,
    borderColor: "transparent",
  },

  actionButtonVerify: {
    backgroundColor: tokens.color.success,
  },

  actionButtonActive: {
    borderColor: "#fff",
  },

  actionButtonDisabled: {
    opacity: 0.5,
  },

  actionButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },

  resultCardMatched: {
    borderWidth: 2,
    borderColor: tokens.color.success,
  },

  resultCardNotMatched: {
    borderWidth: 2,
    borderColor: tokens.color.danger,
  },
});
