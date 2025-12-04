// ==========================================
// VisionCamera 最小再現テスト画面
// ==========================================

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Camera, useCameraDevice } from "react-native-vision-camera";

export default function VisionTestScreen() {
  const device = useCameraDevice("front");

  if (device == null) {
    return (
      <View style={styles.center}>
        <Text style={styles.text}>Loading camera...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={true}
        // ★ まず frameProcessor は一切使わない
        onInitialized={() => {
          console.log("[VisionTest] Camera initialized successfully");
        }}
        onError={(error) => {
          console.error("[VisionTest] Camera error:", error);
        }}
      />
      <View style={styles.overlay}>
        <Text style={styles.overlayText}>VisionCamera Test Screen</Text>
        <Text style={styles.overlayText}>Camera should be visible</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "black",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "black",
  },
  text: {
    color: "white",
    fontSize: 16,
  },
  overlay: {
    position: "absolute",
    top: 50,
    left: 0,
    right: 0,
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    padding: 16,
  },
  overlayText: {
    color: "white",
    fontSize: 14,
    marginVertical: 4,
  },
});
