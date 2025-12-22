// ==========================================
// ログイン画面
// ==========================================

import React, { useState } from "react";
import { View, Text, StyleSheet, TextInput, Alert, Platform } from "react-native";
import { useRouter } from "expo-router";
import Constants from "expo-constants";
import { Button, tokens } from "@mc-gate/ui-kit";
import { useAppStore } from "../store/appStore";
import { ApiError } from "@mc-gate/api-client";
import { GlobalLoadingScreen } from "../components/GlobalLoadingScreen";

export default function LoginScreen() {
  const router = useRouter();
  const { login, isInitializing } = useAppStore();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // Pattern 4: 初期化完了後にホーム画面へ遷移
  React.useEffect(() => {
    if (!isInitializing && useAppStore.getState().isAuthenticated) {
      // 認証済みで初期化が完了したらホーム画面へ
      router.replace("/(tabs)/home");
    }
  }, [isInitializing, router]);

  // 環境変数のデバッグログ（開発時のみ）
  React.useEffect(() => {
    const appEnv = Constants.expoConfig?.extra?.appEnv || "development";
    const useMockAuth = Constants.expoConfig?.extra?.useMockAuth;
    const authIssuer = Constants.expoConfig?.extra?.auth?.issuer;

    // 開発モードまたはpreview環境で自動ログインを有効化
    const shouldAutoLogin = __DEV__ || appEnv === "development" || appEnv === "preview";

    if (shouldAutoLogin) {
      console.log("🔧 App Configuration:");
      console.log("  __DEV__:", __DEV__);
      console.log("  appEnv:", appEnv);
      console.log("  useMockAuth:", useMockAuth);
      console.log("  AUTH_ISSUER:", authIssuer);

      // 🚨 開発中の自動ログイン（adbテスト用）
      const autoLogin = async () => {
        try {
          console.log("🔧 Auto-login starting for", appEnv, "environment");
          const { setCurrentProject, loadProjectsFromCache } = useAppStore.getState();

          await login({
            id: "dev-user-1",
            name: "admin",
            token: "dev-token-" + Date.now(),
            refreshToken: "dev-refresh-" + Date.now(),
          }, true);

          // キャッシュからプロジェクトを復元（なければモック作成）
          await loadProjectsFromCache();

          const { availableProjects, currentProject } = useAppStore.getState();

          if (!currentProject && availableProjects.length === 0) {
            const mockProject = {
              projectId: "PRJ001",
              name: "東京建設現場A（モック）",
              gateMode: "IN" as const,
              checkConfig: {
                ccusIdCheck: false,
                socialInsuranceCheck: false,
                residencyCheck: false,
                ageCheck: false,
                healthCheck: false,
                soleProprietorCheck: false,
              },
              serverLock: false,
            };
            await setCurrentProject(mockProject);
          }

          console.log("✅ Auto-login successful");
          // Pattern 4: ホーム画面への遷移は useEffect で自動処理される
        } catch (error) {
          console.error("❌ Auto-login failed:", error);
        }
      };

      // より早く実行（100ms）
      setTimeout(autoLogin, 100);
    } else {
      console.log("⚠️ Auto-login disabled for production environment");
    }
  }, []);

  // app.config.jsから設定を取得（UIの分岐にも使用）
  const useMockAuth = Constants.expoConfig?.extra?.useMockAuth ?? true;
  const appEnv = Constants.expoConfig?.extra?.appEnv || "development";
  const shouldUseMock = appEnv !== "production" && useMockAuth;

  // モックログイン（開発/プレビュー環境）
  const handleMockLogin = async () => {
    if (!username || !password) return;

    setLoading(true);

    try {
      const { login, setCurrentProject, loadProjectsFromCache } = useAppStore.getState();

      console.log("✅ Using mock authentication");
      await login({
        id: "dev-user-1",
        name: username,
        token: "dev-token-" + Date.now(),
        refreshToken: "dev-refresh-" + Date.now(),
      }, true);  // isMock = true を渡してSecureStore保存をスキップ

      // モック環境: キャッシュからプロジェクトを復元（なければデフォルト設定）
      await loadProjectsFromCache();

      const { availableProjects, currentProject } = useAppStore.getState();

      // プロジェクトが未設定の場合はモックプロジェクトを作成
      if (!currentProject && availableProjects.length === 0) {
        const mockProject = {
          projectId: "PRJ001",
          name: "東京建設現場A（モック）",
          gateMode: "IN" as const,
          checkConfig: {
            ccusIdCheck: false,
            socialInsuranceCheck: false,
            residencyCheck: false,
            ageCheck: false,
            healthCheck: false,
            soleProprietorCheck: false,
          },
          serverLock: false,
        };
        await setCurrentProject(mockProject);
      }

      // Pattern 4: ホーム画面への遷移は useEffect で自動処理される
    } catch (error) {
      console.error("❌ Mock login error:", error);
      Alert.alert("ログインエラー", error instanceof Error ? error.message : "ログインに失敗しました");
    } finally {
      setLoading(false);
    }
  };

  // OAuthログイン（本番環境）
  const handleOAuthLogin = async () => {
    setLoading(true);

    try {
      const { loginWithOAuth } = useAppStore.getState();

      console.log("✅ Using OAuth authentication (Keycloak)");
      await loginWithOAuth();

      // プロジェクト一覧は loginWithOAuth() 内で自動取得される
      // currentProject も自動的に最初のプロジェクトが設定される
      // Pattern 4: ホーム画面への遷移は useEffect で自動処理される
    } catch (error) {
      console.error("❌ OAuth login error:", error);

      // ApiError の場合は toUserMessage() を使用（運用に優しい分類済みメッセージ）
      if (error instanceof ApiError) {
        Alert.alert("ログインエラー", error.toUserMessage());
      } else if (error instanceof Error) {
        // その他のエラー（OAuth固有のエラーなど）
        let message = error.message;

        // JSON Parse error の場合はネットワークエラーとして扱う
        if (message.includes("JSON Parse error") || message.includes("Unexpected character")) {
          message = "通信できません（サーバー応答不正）\n\nKeycloakサーバーが正しく起動していることを確認してください。";
        } else if (message.includes("キャンセル")) {
          message = "ログインがキャンセルされました";
        }

        Alert.alert("ログインエラー", message);
      } else {
        Alert.alert("ログインエラー", "予期しないエラーが発生しました");
      }
    } finally {
      setLoading(false);
    }
  };

  // Pattern 4: グローバルローディング中は GlobalLoadingScreen を表示
  if (isInitializing) {
    return <GlobalLoadingScreen message="初期データを読み込んでいます..." />;
  }

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>MCD3 通門管理</Text>
        <Text style={styles.subtitle}>ログイン</Text>

        {shouldUseMock ? (
          // モック認証UI（開発/プレビュー環境）
          <View style={styles.form}>
            <Text style={styles.envLabel}>開発環境（モック認証）</Text>
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
              title="ログイン（モック）"
              onPress={handleMockLogin}
              loading={loading}
              disabled={!username || !password}
              fullWidth
              size="lg"
              style={styles.button}
            />
          </View>
        ) : (
          // OAuth認証UI（本番環境）
          <View style={styles.form}>
            <Text style={styles.oauthInfo}>
              社内SSO（Keycloak）でログインします。{"\n"}
              ログインボタンをタップすると、ブラウザが開きます。
            </Text>

            <Button
              title="Keycloakでログイン"
              onPress={handleOAuthLogin}
              loading={loading}
              fullWidth
              size="lg"
              style={styles.button}
            />
          </View>
        )}
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

  envLabel: {
    fontSize: tokens.font.size.sm,
    color: tokens.color.text.secondary,
    textAlign: "center",
    marginBottom: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.xs,
    backgroundColor: tokens.color.background.paper,
    borderRadius: tokens.radius.sm,
  },

  oauthInfo: {
    fontSize: tokens.font.size.base,
    color: tokens.color.text.secondary,
    textAlign: "center",
    lineHeight: 24,
    marginBottom: tokens.spacing.xl,
    paddingHorizontal: tokens.spacing.md,
  },
});
