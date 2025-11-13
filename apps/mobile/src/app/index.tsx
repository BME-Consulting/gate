// ==========================================
// ログイン画面
// ==========================================

import React, { useState } from "react";
import { View, Text, StyleSheet, TextInput } from "react-native";
import { useRouter } from "expo-router";
import { Button, tokens } from "@mc-gate/ui-kit";
import { DEFAULT_PROJECT_ID } from "@mc-gate/core";
import { useAppStore } from "../store/appStore";

export default function LoginScreen() {
  const router = useRouter();
  const { login } = useAppStore();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!username || !password) return;

    setLoading(true);

    // TODO: 実際のログイン処理（モック）
    // SECURITY: Remove mock token before production - implement OAuth flow
    setTimeout(() => {
      const { setCurrentProject } = useAppStore.getState();

      login({
        id: "user-1",
        name: username,
        token: "mock-token-12345", // TODO: Replace with real OAuth token
      });

      // モックプロジェクト設定
      // NOTE: テスト用途のため、すべてのチェックをオフにしています
      // 本番環境では設定画面で個別にオン/オフを切り替えられるようにする予定
      setCurrentProject({
        projectId: DEFAULT_PROJECT_ID,
        name: "東京建設現場A",
        gateMode: "IN",
        checkConfig: {
          ccusIdCheck: false,  // テスト用: オフ
          socialInsuranceCheck: false,  // テスト用: オフ
          residencyCheck: false,  // テスト用: オフ
          ageCheck: false,  // テスト用: オフ
          healthCheck: false,  // テスト用: オフ
          soleProprietorCheck: false,  // テスト用: オフ
        },
        serverLock: false,
      });

      setLoading(false);
      router.replace("/(tabs)/home");
    }, 1000);
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>MCD3 通門管理</Text>
        <Text style={styles.subtitle}>ログイン</Text>

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="ユーザーID"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <TextInput
            style={styles.input}
            placeholder="パスワード"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Button
            title="ログイン"
            onPress={handleLogin}
            loading={loading}
            disabled={!username || !password}
            fullWidth
            size="lg"
            style={styles.button}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.color.background.default,
  },

  content: {
    flex: 1,
    justifyContent: "center",
    padding: tokens.spacing.xl,
  },

  title: {
    fontSize: tokens.font.size.h1,
    fontWeight: tokens.font.weight.bold,
    color: tokens.color.primary,
    textAlign: "center",
    marginBottom: tokens.spacing.sm,
  },

  subtitle: {
    fontSize: tokens.font.size.lg,
    color: tokens.color.text.secondary,
    textAlign: "center",
    marginBottom: tokens.spacing.xxl,
  },

  form: {
    gap: tokens.spacing.lg,
  },

  input: {
    height: 56,
    borderWidth: 1,
    borderColor: tokens.color.border.default,
    borderRadius: tokens.radius.md,
    paddingHorizontal: tokens.spacing.lg,
    fontSize: tokens.font.size.base,
    backgroundColor: tokens.color.background.default,
  },

  button: {
    marginTop: tokens.spacing.md,
  },
});
