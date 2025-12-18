// ==========================================
// タブレイアウト
// ==========================================

import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { tokens } from "@mc-gate/ui-kit";
import Constants from "expo-constants";

export default function TabsLayout() {
  // 環境判定: production ではデバッグタブを非表示
  const appEnv = Constants.expoConfig?.extra?.appEnv || "development";
  const isProduction = appEnv === "production";

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

      {/* デバッグタブ: production では非表示 */}
      {!isProduction && (
        <>
          <Tabs.Screen
            name="debug"
            options={{
              title: "デバッグ",
              tabBarIcon: ({ color, size }) => (
                <Ionicons name="bug" size={size} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="vision-test"
            options={{
              title: "カメラテスト",
              tabBarIcon: ({ color, size }) => (
                <Ionicons name="camera" size={size} color={color} />
              ),
              unmountOnBlur: true, // カメラ画面は離れたら破棄してJSスレッド負荷を軽減
            }}
          />
        </>
      )}
    </Tabs>
  );
}
