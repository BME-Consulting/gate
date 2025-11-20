// ==========================================
// ログイン画面
// ==========================================

import React, { useState } from "react";
import { View, Text, StyleSheet, TextInput } from "react-native";
import { useRouter } from "expo-router";
import Constants from "expo-constants";
import { Button, tokens } from "@mc-gate/ui-kit";
import { useAppStore } from "../store/appStore";

export default function LoginScreen() {
  const router = useRouter();
  const { login } = useAppStore();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // 環境変数のデバッグログ（開発時のみ）
  React.useEffect(() => {
    if (__DEV__) {
      const useMockAuth = Constants.expoConfig?.extra?.useMockAuth;
      const authIssuer = Constants.expoConfig?.extra?.auth?.issuer;

      console.log("🔧 App Configuration:");
      console.log("  useMockAuth:", useMockAuth);
      console.log("  AUTH_ISSUER:", authIssuer);
      console.log("  Full extra:", JSON.stringify(Constants.expoConfig?.extra, null, 2));
    }
  }, []);

  const handleLogin = async () => {
    if (!username || !password) return;

    setLoading(true);

    try {
      const { setCurrentProject, loginWithOAuth } = useAppStore.getState();

      // app.config.tsから設定を取得
      const useMockAuth = Constants.expoConfig?.extra?.useMockAuth ?? false;

      console.log("🔐 Authentication mode:", useMockAuth ? "MOCK" : "OAuth");

      if (useMockAuth) {
        // モック実装（開発中のみ）
        console.log("✅ Using mock authentication");
        await login({
          id: "dev-user-1",
          name: username,
          token: "dev-token-" + Date.now(),
          refreshToken: "dev-refresh-" + Date.now(),
        }, true);  // isMock = true を渡してSecureStore保存をスキップ
      } else {
        // 本番: OAuth認証
        console.log("✅ Using OAuth authentication");
        await loginWithOAuth();
      }

      // モックプロジェクト設定
      // NOTE: テスト用途のため、すべてのチェックをオフにしています
      // 本番環境では設定画面で個別にオン/オフを切り替えられるようにする予定
      const configProjectId = Constants.expoConfig?.extra?.defaultProjectId;
      const defaultProjectId = (typeof configProjectId === "string" && configProjectId) ? configProjectId : "PRJ001";
      setCurrentProject({
        projectId: defaultProjectId,
        name: "東京建設現場A",
        gateMode: "IN",
        checkConfig: {
          ccusIdCheck: false, // テスト用: オフ
          socialInsuranceCheck: false, // テスト用: オフ
          residencyCheck: false, // テスト用: オフ
          ageCheck: false, // テスト用: オフ
          healthCheck: false, // テスト用: オフ
          soleProprietorCheck: false, // テスト用: オフ
        },
        serverLock: false,
      });

      router.replace("/(tabs)/home");
    } catch (error) {
      console.error("❌ Login error:", error);

      let message = "ログインに失敗しました";

      if (error instanceof Error) {
        message = error.message;

        // JSON Parse errorの場合、より詳細な情報を提供
        if (message.includes("JSON Parse error") || message.includes("Unexpected character")) {
          message = "サーバーへの接続に失敗しました。\n\nKeycloakサーバーが起動していることを確認してください。\n\n開発中の場合は、app.config.tsで\nuseMockAuth: true\nを設定してモック認証を使用できます。";
        }
      }

      alert(message);
    } finally {
      setLoading(false);
    }
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
