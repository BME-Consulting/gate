// ==========================================
// 統合認証画面（顔認証 + QRコード）
// react-native-vision-camera を使用した顔検出
// ==========================================

import React, { useState, useRef, useMemo, useEffect, useCallback } from "react";
import { View, Text, StyleSheet, Alert, TouchableOpacity, ActivityIndicator } from "react-native";
import { CameraView, useCameraPermissions, BarcodeScanningResult } from "expo-camera";
import { Camera, useCameraDevice, useCameraPermission } from "react-native-vision-camera";
import { useFocusEffect } from "@react-navigation/native";
import Constants from "expo-constants";
import { tokens } from "@mc-gate/ui-kit";
import { Ionicons } from "@expo/vector-icons";
import { useWorkers } from "../../hooks/useWorkers";
import { useQueue } from "../../hooks/useQueue";
import { useAppStore } from "../../store/appStore";
import { router } from "expo-router";
import { parseQRCode } from "@mc-gate/qr";
import { useFaceDetection } from "../../hooks/useFaceDetection";
import type { Face } from "react-native-vision-camera-face-detector";
import {
  RuleEngine,
  generateUUID,
  makeIdempotencyKey,
  messagesJa,
  type WorkerInfo,
  type ScanEvent,
  type RuleResult,
  type DecidedMode,
  TIMEOUT,
  fetchWithTimeout,
} from "@mc-gate/core";

// Face API のレスポンス型定義（Face APIはsnake_caseを返す）
interface FaceRecognitionResponse {
  person_id: string | null;
  confidence: number;
  distance: number;  // 必須フィールド（成功時・失敗時ともに返される）
  error?: string;
}

// 検出器タイプ
type DetectorType = "face" | "qr";

export default function AuthScreen() {
  // expo-camera permissions (for QR scanning)
  const [expoCameraPermission, requestExpoCameraPermission] = useCameraPermissions();

  // vision-camera permissions (for face detection)
  const { hasPermission: hasVisionCameraPermission, requestPermission: requestVisionCameraPermission } = useCameraPermission();

  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeDetector, setActiveDetector] = useState<DetectorType>("face");
  const [detectionStatus, setDetectionStatus] = useState<string>("顔またはQRコードを検出中...");
  const [lastFaceDetection, setLastFaceDetection] = useState<{
    timestamp: number;
    confidence: number;
    size: number;
  } | null>(null);
  const [isFocused, setIsFocused] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);

  const expoCameraRef = useRef<CameraView>(null);
  const visionCameraRef = useRef<Camera>(null);
  const processingLock = useRef(false);
  const lastProcessTime = useRef(0);

  const { getWorkerById, addWorker } = useWorkers();
  const { currentProject } = useAppStore();
  const { isReady: queueReady, addToQueue } = useQueue();

  // vision-camera device
  const visionCameraDevice = useCameraDevice('front') || undefined;

  // デバイス取得失敗時のエラーハンドリング
  useEffect(() => {
    if (visionCameraDevice === null || visionCameraDevice === undefined) {
      console.error("[Auth] Vision camera device not found");
      setInitError("カメラデバイスが見つかりません。新しいビルドが必要です。");
    } else {
      console.log("[Auth] Vision camera device found:", visionCameraDevice);
      setInitError(null);
    }
  }, [visionCameraDevice]);

  // ルールエンジンの初期化
  const ruleEngine = useMemo(() => {
    if (!currentProject) return null;
    return new RuleEngine(currentProject.checkConfig);
  }, [currentProject?.checkConfig]);

  // タイムスライシング検出方式（1000msごとに切り替え）
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveDetector((prev) => (prev === "face" ? "qr" : "face"));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // タブフォーカス時にカメラリソースをリセット
  useFocusEffect(
    useCallback(() => {
      console.log("[Auth] Tab focused - mounting camera");
      setIsFocused(true);

      // カメラ状態をリセット
      setIsProcessing(false);
      setDetectionStatus("顔またはQRコードを検出中...");
      setLastFaceDetection(null);

      // 処理ロックを解除
      processingLock.current = false;
      lastProcessTime.current = 0;

      return () => {
        console.log("[Auth] Tab unfocused - unmounting camera");
        setIsFocused(false);
        // タブが非アクティブになったときのクリーンアップ
        processingLock.current = false;
        setIsCameraReady(false);
      };
    }, [])
  );

  // 顔検出コールバック
  const handleFacesDetected = useCallback(async (faces: Face[]) => {
    // activeDetector が 'face' でない場合は早期リターン
    if (activeDetector !== 'face') {
      return;
    }

    console.log(`[Auth] handleFacesDetected called - faces count: ${faces.length}`);

    // 処理中または最近処理した場合はスキップ
    const now = Date.now();
    if (processingLock.current || now - lastProcessTime.current < 2000) {
      console.log(`[Auth] Skipping face detection - processing: ${processingLock.current}, cooldown: ${now - lastProcessTime.current}ms`);
      return;
    }

    // 顔が検出されていない場合
    if (faces.length === 0) {
      setLastFaceDetection(null);
      setDetectionStatus("顔またはQRコードを検出中...");
      return;
    }

    console.log(`[Auth] Face detected - processing...`);

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
      console.log(`[Auth] Face quality good - size: ${faceSize}`);
      setDetectionStatus("顔を検出しました。認証中...");
      await processFaceRecognition();
    } else {
      console.log(`[Auth] Face quality poor - size: ${faceSize}`);
      setDetectionStatus("顔をまっすぐカメラに向けてください");
    }
  }, [activeDetector]);

  // useFaceDetection hook を使用
  const frameProcessor = useFaceDetection({
    enabled: activeDetector === 'face' && !isProcessing,
    onFacesDetected: handleFacesDetected,
    minFaceSize: 20000,
    cooldownMs: 2000,
  });

  // カメラ権限のチェック
  if (!expoCameraPermission || !hasVisionCameraPermission) {
    return (
      <View style={styles.container}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={tokens.color.primary} />
          <Text style={styles.message}>カメラの準備中...</Text>
        </View>
      </View>
    );
  }

  if (!expoCameraPermission.granted || !hasVisionCameraPermission) {
    return (
      <View style={styles.container}>
        <View style={styles.centerContent}>
          <Ionicons name="camera-outline" size={64} color={tokens.color.text.secondary} />
          <Text style={styles.message}>
            認証機能を使用するにはカメラへのアクセスが必要です
          </Text>
          <TouchableOpacity
            style={styles.permissionButton}
            onPress={async () => {
              await requestExpoCameraPermission();
              await requestVisionCameraPermission();
            }}
          >
            <Text style={styles.permissionButtonText}>カメラを許可</Text>
          </TouchableOpacity>
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
          <Text style={[styles.message, { fontSize: 14, marginTop: 16 }]}>
            {"\n"}react-native-vision-cameraを使用するには、新しいビルドのAPKをインストールする必要があります。
            {"\n\n"}Build ID: 57ef7e37-05a0-425b-8501-b5061bae998c
            {"\n\n"}上記のビルドからAPKをダウンロードしてインストールしてください。
          </Text>
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

  // 入場イベントを記録する関数
  const recordEntryEvent = async (worker: WorkerInfo, method: "FACE" | "QR") => {
    if (!currentProject || !queueReady || !ruleEngine) {
      console.warn("Cannot record entry event: project or queue not ready");
      return;
    }

    try {
      // 🔍 デバッグ: 現在の checkConfig を出力
      console.log("[Auth] Active checkConfig:", JSON.stringify(currentProject.checkConfig, null, 2));

      // ルールを適用
      const ruleResult = ruleEngine.evaluate(worker);

      // blockの場合は登録しない
      if (ruleResult.action === "block") {
        showResultAlert(worker, ruleResult, method);
        return;
      }

      // 入退モードを決定（プロジェクト設定のgateModeをそのまま使用）
      const decidedMode: DecidedMode = currentProject.gateMode;

      // スキャンイベントを作成
      const occurredAt = new Date().toISOString();
      const scanEvent: ScanEvent = {
        id: generateUUID(),
        projectId: currentProject.projectId,
        personId: worker.personId,
        method,
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

      // 結果を表示
      showResultAlert(worker, ruleResult, method);

      if (__DEV__) {
        console.log("[Auth] Entry event recorded:", {
          eventId: scanEvent.id,
          personId: worker.personId,
          method,
          decidedMode,
        });
      }
    } catch (error) {
      console.error("[Auth] Failed to record entry event:", error);
      Alert.alert(
        "警告",
        "入場イベントの記録に失敗しました。\n認証は成功していますが、履歴に記録されていない可能性があります。",
        [{ text: "OK" }]
      );
    }
  };

  // QRコード検出ハンドラー
  const handleBarcodeScanned = async ({ data }: BarcodeScanningResult) => {
    console.log(`[Auth] handleBarcodeScanned called - data: ${data.substring(0, 50)}...`);

    // 処理中または最近処理した場合はスキップ
    const now = Date.now();
    if (processingLock.current || now - lastProcessTime.current < 2000) {
      console.log(`[Auth] Skipping QR detection - processing: ${processingLock.current}, cooldown: ${now - lastProcessTime.current}ms`);
      return;
    }

    // 顔が検出されている場合はQRコードを無視（顔優先）
    if (lastFaceDetection && now - lastFaceDetection.timestamp < 1000) {
      console.log(`[Auth] Skipping QR - face detected recently (${now - lastFaceDetection.timestamp}ms ago)`);
      return;
    }

    console.log(`[Auth] Processing QR code...`);
    setDetectionStatus("QRコードを検出しました。認証中...");
    await processQRCode(data);
  };

  // 顔認証処理
  const processFaceRecognition = async () => {
    if (!visionCameraRef.current || !isCameraReady || processingLock.current) {
      return;
    }

    try {
      processingLock.current = true;
      lastProcessTime.current = Date.now();
      setIsProcessing(true);

      // 写真を撮影（vision-camera）
      const photo = await visionCameraRef.current.takePhoto({
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

      console.log("[Auth] Sending face recognition request to:", apiFaceApi);

      // Face APIに送信（タイムアウト付き）
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
        if (response.status === 404) {
          throw new Error(
            "Face API サーバーのエンドポイントが見つかりません。\n\n" +
            `URL: ${apiFaceApi}/api/face/recognize\n\n` +
            "サーバーが正しく起動しているか確認してください。"
          );
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = (await response.json()) as FaceRecognitionResponse;

      // 認識成功時はローカルDBから詳細情報を取得
      if (result.person_id) {
        const workerDetails = await getWorkerById(result.person_id);
        if (workerDetails) {
          // WorkerInfo型に変換
          const workerInfo: WorkerInfo = {
            personId: workerDetails.personId,
            name: workerDetails.name,
            company: workerDetails.company,
            ccusId: workerDetails.ccusId,
            ccusRegistered: workerDetails.ccusRegistered,
            socialInsurance: workerDetails.socialInsurance,
            residencyStatus: workerDetails.residencyExpiry
              ? {
                  expiryDate: workerDetails.residencyExpiry,
                  workPermit: true,
                }
              : undefined,
            age: workerDetails.age,
            isSoleProprietor: workerDetails.isSoleProprietor,
          };

          // 入場イベントを記録
          await recordEntryEvent(workerInfo, "FACE");
        } else {
          Alert.alert("エラー", "作業員情報が見つかりません", [{ text: "OK" }]);
        }
      } else {
        // 顔が検出されたが、マッチしなかった場合
        Alert.alert(
          "認識失敗",
          `顔が検出されましたが、登録された作業員とマッチしませんでした。\n\n信頼度: ${(result.confidence * 100).toFixed(1)}%`,
          [{ text: "OK" }]
        );
      }
    } catch (error) {
      console.error("[Auth] Face recognition error:", error);

      let errorMessage = "顔認証に失敗しました";

      if (error instanceof Error) {
        if (error.name === "AbortError" || error.message.includes("タイムアウト")) {
          errorMessage =
            "Face APIサーバーへの接続がタイムアウトしました。\n\nネットワーク接続を確認してください。";
        } else if (error.message.includes("Failed to fetch") || error.message.includes("Network")) {
          errorMessage =
            "Face APIサーバーに接続できません。\n\nネットワーク接続とサーバーの起動状態を確認してください。";
        } else {
          errorMessage = error.message;
        }
      }

      Alert.alert("エラー", errorMessage, [{ text: "OK" }]);
    } finally {
      processingLock.current = false;
      setIsProcessing(false);
      setDetectionStatus("顔またはQRコードを検出中...");
    }
  };

  // QRコード認証処理
  const processQRCode = async (data: string) => {
    try {
      processingLock.current = true;
      lastProcessTime.current = Date.now();
      setIsProcessing(true);

      console.log("[Auth] QR Scanned:", data);

      let workerInfo: WorkerInfo;

      // QRコードフォーマットを判定
      const parts = data.split("|");

      if (parts.length >= 9 && parts[0] === "M1") {
        // M1フォーマット: QRコードからデータをパースし、ローカルDBに保存
        console.log("[Auth] M1 format detected");
        workerInfo = parseQRCode(data);

        // ローカルDBに作業員情報を保存（存在チェック）
        try {
          const existingWorker = await getWorkerById(workerInfo.personId);
          if (!existingWorker) {
            // 存在しない場合は追加
            await addWorker({
              personId: workerInfo.personId,
              name: workerInfo.name,
              company: workerInfo.company,
              ccusId: workerInfo.ccusId,
              ccusRegistered: workerInfo.ccusRegistered,
              socialInsurance: workerInfo.socialInsurance,
              residencyExpiry: workerInfo.residencyStatus?.expiryDate,
              age: workerInfo.age,
              isSoleProprietor: workerInfo.isSoleProprietor,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
            console.log("[Auth] Worker added to local DB:", workerInfo.personId);
          }
        } catch (dbError) {
          console.warn("[Auth] Failed to save worker to DB:", dbError);
        }
      } else if (parts.length === 1 && parts[0].trim().length > 0) {
        // シンプルフォーマット: personIdのみ -> ローカルDBから取得
        const personId = parts[0].trim();
        console.log("[Auth] Simple format detected, personId:", personId);

        const worker = await getWorkerById(personId);
        if (worker) {
          workerInfo = {
            personId: worker.personId,
            name: worker.name,
            company: worker.company,
            ccusId: worker.ccusId,
            ccusRegistered: worker.ccusRegistered,
            socialInsurance: worker.socialInsurance,
            residencyStatus: worker.residencyExpiry
              ? {
                  expiryDate: worker.residencyExpiry,
                  workPermit: true,
                }
              : undefined,
            age: worker.age,
            isSoleProprietor: worker.isSoleProprietor,
          };
          console.log("[Auth] Worker found in local DB:", workerInfo);
        } else {
          throw new Error(
            `作業員情報が見つかりません (ID: ${personId})\n\nM1フォーマットのQRコードをスキャンするか、サーバーから作業員マスタを同期してください。`
          );
        }
      } else {
        // その他のフォーマット: parseQRCodeに任せる
        workerInfo = parseQRCode(data);
      }

      // 入場イベントを記録
      await recordEntryEvent(workerInfo, "QR");
    } catch (error) {
      console.error("[Auth] QR scan error:", error);
      Alert.alert(
        "エラー",
        error instanceof Error ? error.message : "QRコードの読み取りに失敗しました",
        [{ text: "OK" }]
      );
    } finally {
      processingLock.current = false;
      setIsProcessing(false);
      setDetectionStatus("顔またはQRコードを検出中...");
    }
  };

  // 認識結果をアラートで表示
  const showResultAlert = (worker: WorkerInfo, ruleResult: RuleResult, method: "FACE" | "QR") => {
    const methodText = method === "FACE" ? "顔認証" : "QRコード認証";

    if (ruleResult.action === "block") {
      // 入場不可
      Alert.alert(
        "入場不可",
        `${worker.name}さん（${worker.company}）\n` +
          `認証方法: ${methodText}\n\n` +
          `${ruleResult.messages
            .map((msgId) => messagesJa[msgId as keyof typeof messagesJa] || msgId)
            .join("\n")}`,
        [{ text: "OK" }]
      );
      return;
    }

    // 認識成功
    const modeText = currentProject?.gateMode === "IN" ? "入場" : "退場";
    Alert.alert(
      `${modeText}登録完了`,
      `${worker.name}さん（${worker.company}）\n` +
        `認証方法: ${methodText}\n` +
        `CCUS ID: ${worker.ccusId || "未登録"}\n\n` +
        (ruleResult.action === "warn"
          ? `⚠️ 注意:\n${ruleResult.messages
              .map((msgId) => messagesJa[msgId as keyof typeof messagesJa] || msgId)
              .join("\n")}`
          : "✅ 問題なく登録されました"),
      [{ text: "OK" }]
    );
  };

  // 戻るボタン
  const handleGoBack = () => {
    router.back();
  };

  return (
    <View style={styles.container}>
      {/* Dual Camera Approach: vision-camera for face, expo-camera for QR */}
      {isFocused ? (
        <View style={styles.cameraContainer}>
          {/* Vision Camera - Face Detection */}
          {activeDetector === 'face' && visionCameraDevice && (
            <Camera
              ref={visionCameraRef}
              style={StyleSheet.absoluteFill}
              device={visionCameraDevice}
              isActive={isFocused && activeDetector === 'face'}
              photo={true}
              frameProcessor={frameProcessor}
              onInitialized={() => {
                console.log("[Auth] Vision Camera initialized");
                setIsCameraReady(true);
              }}
              onError={(error) => {
                console.error("[Auth] Vision Camera error:", error);
              }}
            />
          )}

          {/* Expo Camera - QR Scanning */}
          {activeDetector === 'qr' && (
            <CameraView
              ref={expoCameraRef}
              style={StyleSheet.absoluteFill}
              facing="front"
              mirror={true}
              onCameraReady={() => {
                console.log("[Auth] Expo Camera ready");
                setIsCameraReady(true);
              }}
              onBarcodeScanned={handleBarcodeScanned}
              barcodeScannerSettings={{
                barcodeTypes: ["qr"],
              }}
            />
          )}

          {/* カメラオーバーレイ */}
          <View style={styles.overlay}>
            {/* 上部バー */}
            <View style={styles.topBar}>
              <TouchableOpacity style={styles.backButton} onPress={handleGoBack}>
                <Ionicons name="arrow-back" size={28} color="#fff" />
              </TouchableOpacity>
              <Text style={styles.title}>統合認証</Text>
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
              <Text style={styles.guideText}>{detectionStatus}</Text>

              {/* 検出インジケーター */}
              <View style={styles.detectorIndicator}>
                <View
                  style={[
                    styles.detectorBadge,
                    activeDetector === "face" && styles.detectorBadgeActive,
                  ]}
                >
                  <Ionicons
                    name="person"
                    size={16}
                    color={activeDetector === "face" ? "#fff" : "#888"}
                  />
                  <Text
                    style={[
                      styles.detectorBadgeText,
                      activeDetector === "face" && styles.detectorBadgeTextActive,
                    ]}
                  >
                    顔検出
                  </Text>
                </View>
                <View
                  style={[
                    styles.detectorBadge,
                    activeDetector === "qr" && styles.detectorBadgeActive,
                  ]}
                >
                  <Ionicons
                    name="qr-code"
                    size={16}
                    color={activeDetector === "qr" ? "#fff" : "#888"}
                  />
                  <Text
                    style={[
                      styles.detectorBadgeText,
                      activeDetector === "qr" && styles.detectorBadgeTextActive,
                    ]}
                  >
                    QR検出
                  </Text>
                </View>
              </View>
            </View>

            {/* ボトムバー */}
            <View style={styles.bottomBar}>
              {isProcessing ? (
                <View style={styles.processingContainer}>
                  <ActivityIndicator size="large" color="#fff" />
                  <Text style={styles.processingText}>認証中...</Text>
                </View>
              ) : (
                <View style={styles.infoContainer}>
                  <Ionicons name="information-circle" size={20} color="#fff" />
                  <Text style={styles.infoText}>
                    顔またはQRコードをカメラに向けてください
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>
      ) : null}
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
    marginTop: tokens.spacing.md,
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

  detectorIndicator: {
    flexDirection: "row",
    gap: 12,
    marginTop: 16,
  },

  detectorBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.3)",
  },

  detectorBadgeActive: {
    backgroundColor: tokens.color.primary,
    borderColor: tokens.color.primary,
  },

  detectorBadgeText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#888",
  },

  detectorBadgeTextActive: {
    color: "#fff",
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

  infoContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  infoText: {
    fontSize: 14,
    color: "#fff",
    fontWeight: "400",
  },
});
