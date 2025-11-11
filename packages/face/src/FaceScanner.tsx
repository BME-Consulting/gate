// ==========================================
// 顔認証スキャナーコンポーネント
// ==========================================

import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import type { FaceData } from "./types";

export interface FaceScannerProps {
  /**
   * 顔検出時のコールバック
   * @param data 検出された顔データ
   */
  onDetect: (data: FaceData) => void;

  /**
   * エラー時のコールバック
   */
  onError?: (error: Error) => void;

  /**
   * スキャンの有効/無効
   * false にすると検出を一時停止する
   */
  enabled?: boolean;
}

export function FaceScanner({ onDetect, onError, enabled = true }: FaceScannerProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [detected, setDetected] = useState(false);

  useEffect(() => {
    if (!permission?.granted) {
      requestPermission();
    }
  }, [permission]);

  useEffect(() => {
    // enabled が false になったら検出フラグをリセット
    if (!enabled) {
      setDetected(false);
    }
  }, [enabled]);

  const handleFaceDetected = (faces: any) => {
    console.log("Face detection event:", { facesCount: faces?.faces?.length, detected, enabled });

    if (detected || !enabled) {
      console.log("Detection ignored:", { detected, enabled });
      return;
    }

    // TODO: Phase 2 - expo-face-detector の実際の API に合わせて実装
    // 現在は expo-camera の基本機能のみを使用（顔検出機能は未実装）
    // expo-face-detector パッケージが利用可能になったら、以下の実装に切り替える:
    //
    // if (faces?.faces && faces.faces.length > 0) {
    //   const face = faces.faces[0];
    //   const faceData: FaceData = {
    //     faceId: undefined, // Phase 2 で API から取得
    //     confidence: face.rollAngle ? 0.8 : 0.5,
    //     bounds: {
    //       x: face.bounds.origin.x,
    //       y: face.bounds.origin.y,
    //       width: face.bounds.size.width,
    //       height: face.bounds.size.height,
    //     },
    //     capturedAt: new Date().toISOString(),
    //   };
    //
    //   console.log("Processing face detection...");
    //   setDetected(true);
    //   onDetect(faceData);
    // }

    // Phase 1: モック実装（開発・テスト用）
    // カメラが起動したら自動的にモックデータを返す
    if (!detected && enabled) {
      console.log("Processing mock face detection...");
      setDetected(true);

      const mockFaceData: FaceData = {
        faceId: undefined,
        confidence: 0.85,
        bounds: {
          x: 100,
          y: 150,
          width: 200,
          height: 250,
        },
        capturedAt: new Date().toISOString(),
      };

      try {
        onDetect(mockFaceData);
      } catch (error) {
        onError?.(error as Error);
      }
    }
  };

  if (!permission) {
    return (
      <View style={styles.container}>
        <Text style={styles.message}>カメラの準備中...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.message}>カメラの権限が必要です</Text>
      </View>
    );
  }

  return (
    <CameraView
      style={styles.camera}
      facing="front"
      // TODO: Phase 2 - expo-face-detector が利用可能になったら有効化
      // faceDetectorSettings={{
      //   mode: FaceDetector.FaceDetectorMode.fast,
      //   detectLandmarks: FaceDetector.FaceDetectorLandmarks.none,
      //   runClassifications: FaceDetector.FaceDetectorClassifications.none,
      //   minDetectionInterval: 500,
      //   tracking: true,
      // }}
      // onFacesDetected={detected ? undefined : handleFaceDetected}
    >
      <View style={styles.overlay}>
        <View style={styles.faceArea}>
          <Text style={styles.overlayText}>顔を枠内に合わせてください</Text>
        </View>
        <Text style={styles.hintText}>
          {detected ? "検出しました" : "顔認証中..."}
        </Text>
        {/* Phase 1: モック実装の注意書き */}
        <View style={styles.mockBadge}>
          <Text style={styles.mockBadgeText}>MOCK MODE (Phase 1)</Text>
        </View>
      </View>
    </CameraView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#000",
  },

  message: {
    color: "#fff",
    fontSize: 16,
    textAlign: "center",
  },

  camera: {
    flex: 1,
  },

  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    justifyContent: "center",
    alignItems: "center",
  },

  faceArea: {
    width: 280,
    height: 350,
    borderWidth: 3,
    borderColor: "#00E676",
    borderRadius: 140,
    backgroundColor: "transparent",
    justifyContent: "flex-end",
    alignItems: "center",
    paddingBottom: 20,
  },

  overlayText: {
    color: "#fff",
    fontSize: 14,
    textAlign: "center",
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },

  hintText: {
    color: "#fff",
    fontSize: 16,
    textAlign: "center",
    marginTop: 24,
    fontWeight: "600",
  },

  mockBadge: {
    position: "absolute",
    top: 20,
    right: 20,
    backgroundColor: "rgba(255, 152, 0, 0.9)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },

  mockBadgeText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "bold",
  },
});
