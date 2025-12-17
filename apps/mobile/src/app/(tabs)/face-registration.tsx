// ==========================================
// 顔登録画面（顔検出バリデーション付き）
// ==========================================

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { View, Text, StyleSheet, Alert, TouchableOpacity, ActivityIndicator, Modal, FlatList, AppState } from "react-native";
import { Camera, useCameraDevice, useCameraPermission } from "react-native-vision-camera";
import { useFocusEffect } from "@react-navigation/native";
import Constants from "expo-constants";
import { Button, tokens } from "@mc-gate/ui-kit";
import { Ionicons } from "@expo/vector-icons";
import { useWorkers } from "../../hooks/useWorkers";
import { router } from "expo-router";
import { TIMEOUT, fetchWithTimeout } from "@mc-gate/core";
import * as Sentry from "@sentry/react-native";
import { ErrorGuidanceCard } from "../../components/ErrorGuidanceCard";
import { ErrorType } from "../../constants/errorMessages";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { analyzeBrightness, analyzeSharpness } from "../../utils/imageQuality";
import { sendFaceRegisterSuccess, sendFaceRegisterFail, sendFaceVerifySuccess, sendFaceVerifyFail } from "../../services/uxMetrics";

// Face API レスポンス型定義（Face APIはsnake_caseを返す）
interface FaceRegistrationResponse {
  success: boolean;
  person_id?: string;
  embedding_dimensions?: number;
  face_count?: number;
  error?: string;
}

// Face API Recognize レスポンス型定義
interface FaceRecognizeResponse {
  person_id: string | null;
  confidence: number;
  distance: number;
  error?: string;
}

export default function FaceRegistrationScreen() {
  const { hasPermission, requestPermission } = useCameraPermission();
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedPersonId, setSelectedPersonId] = useState<string>("");
  const [registrationResult, setRegistrationResult] = useState<FaceRegistrationResponse | null>(null);
  const [recognizeResult, setRecognizeResult] = useState<FaceRecognizeResponse | null>(null);
  const [isWorkerModalVisible, setIsWorkerModalVisible] = useState(false);
  const [isFocused, setIsFocused] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const [mode, setMode] = useState<"register" | "verify">("register");
  const [errorType, setErrorType] = useState<ErrorType | null>(null);

  const cameraRef = useRef<Camera>(null);
  const processingLock = useRef(false);
  const lastProcessTime = useRef(0);
  const { workers, getAllWorkers, isReady } = useWorkers();

  // AppState を使って isActive を安定化
  const [appState, setAppState] = useState(AppState.currentState);

  useEffect(() => {
    const sub = AppState.addEventListener("change", setAppState);
    return () => sub.remove();
  }, []);

  // vision-camera device
  const cameraDevice = useCameraDevice('front') || undefined;

  // isCameraActive: タブフォーカス AND アプリがアクティブ
  const isCameraActive = isFocused && appState === "active";

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
      const photo = await cameraRef.current.takePhoto({
        flash: 'off',
        enableShutterSound: false,
      });

      if (!photo || !photo.path) {
        throw new Error("写真の撮影に失敗しました");
      }

      // 【UX-2】品質判定用の32px縮小画像を生成
      const tinyImage = await manipulateAsync(
        photo.path,
        [{ resize: { width: 32 } }],
        { base64: true, compress: 0.7, format: SaveFormat.JPEG }
      );

      if (!tinyImage.base64) {
        throw new Error("品質判定用画像の生成に失敗しました");
      }

      const tinyBase64 = `data:image/jpeg;base64,${tinyImage.base64}`;

      // 【UX-2】明るさ判定
      const brightness = analyzeBrightness(tinyBase64);
      if (__DEV__) {
        console.log(`[FaceReg] 💡 Brightness: ${brightness.label} (score: ${brightness.score.toFixed(2)})`);
      }

      const startTime = Date.now();
      const apiFaceApi = Constants.expoConfig?.extra?.apiFaceApi || "http://192.168.1.4:8100";

      if (brightness.label === 'DARK') {
        console.warn('[FaceReg] ⚠️ Image too dark, rejecting before API call');
        setErrorType('quality_dark');

        // 【UX計測】品質エラーを記録（UIをブロックしない）
        void sendFaceRegisterFail({
          projectId: "PRJ001",
          failReason: "quality_dark",
          brightnessScore: brightness.score,
          apiRoute: apiFaceApi.includes("tunnel") ? "tunnel_url" : "lan_url",
          faceApiBaseUrl: apiFaceApi,
        }).catch(() => {}); // エラーは握りつぶす

        return; // Face API送信しない
      }

      // 【UX-2】シャープネス判定
      const sharpness = analyzeSharpness(tinyBase64);
      if (__DEV__) {
        console.log(`[FaceReg] 📷 Sharpness: ${sharpness.label} (score: ${sharpness.score.toFixed(2)})`);
      }

      if (sharpness.label === 'BLURRED') {
        console.warn('[FaceReg] ⚠️ Image blurred, rejecting before API call');
        setErrorType('quality_blurred');

        // 【UX計測】品質エラーを記録（UIをブロックしない）
        void sendFaceRegisterFail({
          projectId: "PRJ001",
          failReason: "quality_blurred",
          brightnessScore: brightness.score,
          sharpnessScore: sharpness.score,
          apiRoute: apiFaceApi.includes("tunnel") ? "tunnel_url" : "lan_url",
          faceApiBaseUrl: apiFaceApi,
        }).catch(() => {}); // エラーは握りつぶす

        return; // Face API送信しない
      }

      // ✅ 品質OK → Face API送信用の画像を準備
      const RNFS = require('react-native-fs');
      const base64Image = await RNFS.readFile(photo.path, 'base64');
      const imageData = `data:image/jpeg;base64,${base64Image}`;

      // P0: 画像サイズチェック（1.5MB推奨、3MB上限）
      const imageSizeKB = Math.round(imageData.length / 1024);
      const imageSizeMB = (imageSizeKB / 1024).toFixed(2);

      if (__DEV__) {
        console.log(`[FaceReg] 📸 Photo captured:`, {
          path: photo.path,
          width: photo.width,
          height: photo.height,
          base64Size: `${imageSizeKB} KB (${imageSizeMB} MB)`,
        });
      }

      if (imageData.length > 3 * 1024 * 1024) {
        // 3MB超過は送信拒否
        throw new Error(
          `画像サイズが大きすぎます (${imageSizeMB} MB)\n\n` +
          `最大サイズ: 3 MB\n` +
          `解像度: ${photo.width}x${photo.height}\n` +
          `もう一度撮影してください。`
        );
      }

      if (imageData.length > 1.5 * 1024 * 1024) {
        // 1.5MB超過は警告のみ
        console.warn(`[FaceReg] ⚠️ Image size exceeds recommended limit: ${imageSizeMB} MB (recommended: 1.5 MB)`);
      }

      // APIキーを取得（apiFaceApiは既に上で宣言済み）
      const apiFaceApiKey = Constants.expoConfig?.extra?.apiFaceApiKey || "development-api-key-12345";

      if (__DEV__) {
        console.log(`[FaceReg] 🚀 Sending to Face API:`, {
          url: `${apiFaceApi}/api/face/register`,
          person_id: selectedPersonId,
          imageDataPrefix: imageData.substring(0, 50),
        });
      }

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
      console.log("[FaceReg] ✅ Registration result:", result);

      // 顔検出できなかった場合の詳細ログ
      if (result.face_count === 0) {
        console.warn("[FaceReg] ⚠️ No face detected in the image", {
          person_id: selectedPersonId,
          image_size: `${imageSizeMB} MB`,
          resolution: `${photo.width}x${photo.height}`,
        });
      }

      // 登録結果を保存
      setRegistrationResult(result);

      // 結果を表示
      showResultAlert(result);
    } catch (error) {
      console.error("[FaceReg] Registration error:", error);

      // UX-1: エラー分類
      if (error instanceof Error) {
        if (error.message.includes('Camera is closed')) {
          setErrorType('camera_error');
        } else if (error.name === 'AbortError' || error.message.includes('タイムアウト')) {
          setErrorType('server_error');
        } else if (error.message.includes('Failed to fetch') || error.message.includes('Network')) {
          setErrorType('network_error');
        } else if (error.message.includes('顔が検出できませんでした')) {
          setErrorType('no_face');
        } else {
          setErrorType('server_error');
        }
      } else {
        setErrorType('server_error');
      }
    } finally {
      processingLock.current = false;
      setIsProcessing(false);
    }
  };

  // 登録結果をアラートで表示
  const showResultAlert = (result: FaceRegistrationResponse) => {
    if (result.error) {
      // UX-1: サーバーエラーとして表示
      setErrorType('server_error');
      return;
    }

    // face_count === 0 の場合は顔検出失敗
    if (result.face_count === 0) {
      setErrorType('no_face');
      return;
    }

    // 成功時はresultCardで表示されるため、Alert不要
    // （registrationResult stateで管理）
    if (!result.success) {
      setErrorType('server_error');
    }
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
    setRecognizeResult(null);
  };

  // 本人確認ハンドラー
  const handleVerify = async () => {
    // preflightログ（これが命綱）
    console.log("[FaceReg] preflight", {
      hasRef: !!cameraRef.current,
      hasDevice: !!cameraDevice,
      isFocused,
      appState,
      isCameraActive,
      isCameraReady,
      isProcessing,
      lock: processingLock.current,
      selectedPersonId,
    });

    if (isProcessing || processingLock.current) return;
    if (!selectedPersonId) {
      Alert.alert("エラー", "作業員を選択してください", [{ text: "OK" }]);
      return;
    }

    // ガード強化（ここが今回の主因）
    if (!cameraDevice) return;
    if (!isFocused) return;
    if (!isCameraActive) return;
    if (!cameraRef.current) return;
    if (!isCameraReady) return;

    try {
      processingLock.current = true;
      setIsProcessing(true);
      setRecognizeResult(null);

      // 写真を撮影（vision-camera）
      const photo = await cameraRef.current.takePhoto({
        flash: 'off',
        enableShutterSound: false,
      });

      if (!photo || !photo.path) {
        throw new Error("写真の撮影に失敗しました");
      }

      // 【UX-2】品質判定用の32px縮小画像を生成
      const tinyImage = await manipulateAsync(
        photo.path,
        [{ resize: { width: 32 } }],
        { base64: true, compress: 0.7, format: SaveFormat.JPEG }
      );

      if (!tinyImage.base64) {
        throw new Error("品質判定用画像の生成に失敗しました");
      }

      const tinyBase64 = `data:image/jpeg;base64,${tinyImage.base64}`;

      // 【UX-2】明るさ判定
      const brightness = analyzeBrightness(tinyBase64);
      if (__DEV__) {
        console.log(`[FaceVerify] 💡 Brightness: ${brightness.label} (score: ${brightness.score.toFixed(2)})`);
      }

      if (brightness.label === 'DARK') {
        console.warn('[FaceVerify] ⚠️ Image too dark, rejecting before API call');
        setErrorType('quality_dark');
        return; // Face API送信しない
      }

      // 【UX-2】シャープネス判定
      const sharpness = analyzeSharpness(tinyBase64);
      if (__DEV__) {
        console.log(`[FaceVerify] 📷 Sharpness: ${sharpness.label} (score: ${sharpness.score.toFixed(2)})`);
      }

      if (sharpness.label === 'BLURRED') {
        console.warn('[FaceVerify] ⚠️ Image blurred, rejecting before API call');
        setErrorType('quality_blurred');
        return; // Face API送信しない
      }

      // ✅ 品質OK → Face API送信用の画像を準備
      const RNFS = require('react-native-fs');
      const base64Image = await RNFS.readFile(photo.path, 'base64');
      const imageData = `data:image/jpeg;base64,${base64Image}`;

      // 環境変数からFace API URLとAPIキーを取得
      const apiFaceApi = Constants.expoConfig?.extra?.apiFaceApi || "http://192.168.1.4:8100";
      const apiFaceApiKey = Constants.expoConfig?.extra?.apiFaceApiKey || "development-api-key-12345";

      // 画像サイズをログ出力
      const imageSizeKB = Math.round(imageData.length / 1024);
      const imageSizeMB = (imageSizeKB / 1024).toFixed(2);

      if (__DEV__) {
        console.log(`[FaceVerify] 🚀 Sending to Face API:`, {
          url: `${apiFaceApi}/api/face/recognize`,
          person_id: selectedPersonId,
          imageSize: `${imageSizeMB} MB`,
          resolution: `${photo.width}x${photo.height}`,
        });
      }

      // Face API Recognize エンドポイントに送信
      const response = await fetchWithTimeout(`${apiFaceApi}/api/face/recognize`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiFaceApiKey,
        },
        body: JSON.stringify({
          image_data: imageData,
          threshold: 0.6,
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


      const result = (await response.json()) as FaceRecognizeResponse;
      
      // 本人確認：登録済み顔と選択した作業員が一致するか判定
      const matched = result.person_id === selectedPersonId;
      
      console.log(`[FaceVerify] ${matched ? '✅' : '❌'} Recognition result:`, {
        matched,
        recognized_person_id: result.person_id,
        expected_person_id: selectedPersonId,
        distance: result.distance,
        confidence: result.confidence,
      });
      
      // 本人確認結果を保存（matchedフィールドを追加）
      setRecognizeResult({
        ...result,
        matched
      } as any);
    } catch (error) {
      console.error("[FaceVerify] Verification error:", error);

      // UX-1: エラー分類
      if (error instanceof Error) {
        if (error.message.includes('Camera is closed')) {
          setErrorType('camera_error');
        } else if (error.name === 'AbortError' || error.message.includes('タイムアウト')) {
          setErrorType('server_error');
        } else if (error.message.includes('Failed to fetch') || error.message.includes('Network')) {
          setErrorType('network_error');
        } else if (error.message.includes('顔が検出できませんでした')) {
          setErrorType('no_face');
        } else if (error.message.includes('登録されていません')) {
          setErrorType('not_registered');
        } else {
          setErrorType('server_error');
        }
      } else {
        setErrorType('server_error');
      }
    } finally {
      processingLock.current = false;
      setIsProcessing(false);
    }
  };

  // 選択された作業員情報を取得
  const selectedWorker = workers?.find(w => w.personId === selectedPersonId);

  // 🔥 Camera を常に配置（条件レンダリングで消さない）
  return (
    <View style={styles.container}>
      <View style={styles.cameraContainer}>
        {cameraDevice ? (
          <Camera
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            device={cameraDevice}
            isActive={isCameraActive}
            photo={true}
            onInitialized={() => {
              console.log("[FaceReg] Camera initialized");
              setIsCameraReady(true);
            }}
            onError={(error) => {
              console.error("[FaceReg] Camera error:", error);
            }}
          />
        ) : (
          <View style={styles.cameraFallback}>
            <Text style={styles.cameraFallbackText}>カメラデバイスを取得中...</Text>
          </View>
        )}

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
                {!isProcessing && !registrationResult && !recognizeResult && (
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
              {recognizeResult && (
                <View
                  style={[
                    styles.resultCard,
                    recognizeResult.matched ? styles.resultCardMatched : styles.resultCardNotMatched,
                  ]}
                >
                  <View>
                    <View style={styles.resultHeader}>
                      <Ionicons
                        name={recognizeResult.matched ? "checkmark-circle" : "close-circle"}
                        size={24}
                        color={recognizeResult.matched ? tokens.color.success : tokens.color.danger}
                      />
                      <Text
                        style={[
                          styles.resultTitle,
                          recognizeResult.matched ? {} : styles.resultTitleError,
                        ]}
                      >
                        {recognizeResult.matched ? "本人確認 OK" : "本人確認 NG"}
                      </Text>
                    </View>
                    <Text style={styles.resultText}>
                      {workers?.find(w => w.personId === recognizeResult.person_id)?.name || recognizeResult.person_id}
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
                        setRecognizeResult(null);
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

      {/* UX-1: エラーガイダンスカード */}
      {errorType && (
        <ErrorGuidanceCard
          type={errorType}
          onRetry={() => {
            setErrorType(null);
            if (mode === 'register') {
              handleTakePicture();
            } else {
              handleVerify();
            }
          }}
          onDismiss={() => setErrorType(null)}
        />
      )}
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

  // カメラフォールバック
  cameraFallback: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000",
    justifyContent: "center",
    alignItems: "center",
  },

  cameraFallbackText: {
    fontSize: 16,
    color: "#fff",
  },
});
