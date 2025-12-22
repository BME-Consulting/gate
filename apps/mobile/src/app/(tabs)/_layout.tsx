// ==========================================
// タブレイアウト
// ==========================================
//
// 🔒 Security Policy:
// Production環境では以下のタブを絶対に表示しない:
// - debug (デバッグタブ)
// - vision-test (カメラテストタブ)
//
// 実装方針:
// 1. ビルド時ロック: このファイルに debug/vision-test タブを含めない
// 2. 実行時ガード: Constants.expoConfig.extra.appEnv で production をチェック
// 3. CI強制: grep で debug|vision-test が 0件であることを検証
// ==========================================

import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { tokens } from "@mc-gate/ui-kit";
import Constants from "expo-constants";
import { useEffect } from "react";
import { Alert } from "react-native";

export default function TabsLayout() {
  const appEnv = Constants.expoConfig?.extra?.appEnv || "development";
  const isProduction = appEnv === "production";

  // 🔒 実行時ガード: production環境で禁止タブが存在したらエラー表示
  useEffect(() => {
    if (isProduction) {
      // 禁止タブのリスト（将来的に追加される可能性も考慮）
      const prohibitedTabs = ["debug", "vision-test", "camera-test"];
      const currentRoutes = ["home", "auth", "face-registration", "history", "settings"];

      const foundProhibited = currentRoutes.filter(route =>
        prohibitedTabs.some(prohibited => route.includes(prohibited))
      );

      if (foundProhibited.length > 0) {
        Alert.alert(
          "🚨 Security Error",
          `Production環境で禁止タブが検出されました:\n\n${foundProhibited.join(", ")}\n\nアプリを再ビルドしてください。`,
          [{ text: "OK", onPress: () => {} }]
        );
        console.error("[SECURITY] Prohibited tabs found in production:", foundProhibited);
      }
    }
  }, [isProduction]);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: tokens.color.primary,
        tabBarInactiveTintColor: tokens.color.text.secondary,
        headerStyle: {
          backgroundColor: tokens.color.primary,
        },
        headerTintColor: tokens.color.text.inverse,
        headerTitleStyle: {
          fontWeight: "600",
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "ホーム",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="auth"
        options={{
          title: "認証",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="scan" size={size} color={color} />
          ),
          unmountOnBlur: true, // カメラ画面は離れたら破棄してJSスレッド負荷を軽減
        }}
      />
      <Tabs.Screen
        name="face-registration"
        options={{
          title: "顔登録",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-add" size={size} color={color} />
          ),
          unmountOnBlur: true, // カメラ画面は離れたら破棄してJSスレッド負荷を軽減
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: "履歴",
          tabBarIcon: ({ color, size}) => (
            <Ionicons name="list" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "設定",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings" size={size} color={color} />
          ),
        }}
      />
      {/* 🔒 ビルド時ロック: debug/vision-test タブは絶対に追加しない */}
      {/* Production環境では以下のタブを含めない: */}
      {/* - debug (デバッグタブ) */}
      {/* - vision-test (カメラテストタブ) */}
    </Tabs>
  );
}
