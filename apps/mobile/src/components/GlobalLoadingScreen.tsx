import React from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";

interface GlobalLoadingScreenProps {
  message?: string;
}

export function GlobalLoadingScreen({
  message = "初期データを読み込んでいます..."
}: GlobalLoadingScreenProps) {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#007AFF" />
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#ffffff",
  },
  message: {
    marginTop: 16,
    fontSize: 16,
    color: "#666666",
  },
});