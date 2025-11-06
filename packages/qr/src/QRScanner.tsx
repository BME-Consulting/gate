// ==========================================
// QRスキャナーコンポーネント
// ==========================================

import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, Platform } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";

export interface QRScannerProps {
  onScan: (data: string) => void;
  onError?: (error: Error) => void;
  enabled?: boolean;
}

export function QRScanner({ onScan, onError, enabled = true }: QRScannerProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  useEffect(() => {
    if (!permission?.granted) {
      requestPermission();
    }
  }, [permission]);

  useEffect(() => {
    // enabledがfalseになったらスキャンフラグをリセット
    if (!enabled) {
      setScanned(false);
    }
  }, [enabled]);

  const handleBarCodeScanned = ({ type, data }: { type: string; data: string }) => {
    console.log("Barcode detected:", { type, data, scanned, enabled });

    if (scanned || !enabled) {
      console.log("Scan ignored:", { scanned, enabled });
      return;
    }

    console.log("Processing scan...");
    setScanned(true);

    // QRコードデータを処理（URLスキームとして扱わない）
    try {
      // dataをそのまま渡す（Expo Routerのナビゲーションを防ぐ）
      onScan(data);
    } catch (error) {
      onError?.(error as Error);
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
      facing="back"
      barcodeScannerSettings={{
        barcodeTypes: ["qr"],
      }}
      onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
    >
      <View style={styles.overlay}>
        <View style={styles.scanArea} />
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
    backgroundColor: "transparent",
    justifyContent: "center",
    alignItems: "center",
  },

  scanArea: {
    width: 250,
    height: 250,
    borderWidth: 2,
    borderColor: "#fff",
    borderRadius: 12,
    backgroundColor: "transparent",
  },
});
