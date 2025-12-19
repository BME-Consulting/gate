// ==========================================
// ルートレイアウト
// ==========================================

import { useEffect, useMemo, useState } from "react";
import { View, ActivityIndicator } from "react-native";
import { Stack, useRouter, usePathname } from "expo-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as Linking from "expo-linking";
import * as Sentry from "@sentry/react-native";
import Constants from "expo-constants";
import { useAppStore } from "../store/appStore";
import { tokens } from "@mc-gate/ui-kit";

// Sentry 初期化
const sentryDsn = Constants.expoConfig?.extra?.sentryDsn;
const appEnv = Constants.expoConfig?.extra?.appEnv || "development";

// 🔍 デバッグ: Sentry DSN の確認
console.log("[Sentry] Debug info:");
console.log("  sentryDsn:", sentryDsn ? `${sentryDsn.substring(0, 50)}...` : "NOT SET");
console.log("  appEnv:", appEnv);
console.log("  Constants.expoConfig.extra keys:", Object.keys(Constants.expoConfig?.extra || {}));

if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    debug: true, // 🔍 デバッグログを常に有効化
    tracesSampleRate: 1.0, // パフォーマンストレーシング
    environment: appEnv,
  });
  console.log(`[Sentry] ✅ Initialized successfully for environment: ${appEnv}`);
} else {
  console.warn("[Sentry] ❌ SENTRY_DSN not configured. Error tracking disabled.");
}

export default function RootLayout() {
  const router = useRouter();
  const pathname = usePathname();

  // OAuth ガード: セッション復元
  const restoreSession = useAppStore((s) => s.restoreSession);
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const [booting, setBooting] = useState(true);

  // QueryClient を useMemo で安全に初期化（New Architecture 対応）
  const queryClient = useMemo(() => new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        staleTime: 5 * 60 * 1000, // 5分
      },
    },
  }), []);

  // OAuth ガード: アプリ起動時に1回だけセッション復元
  useEffect(() => {
    (async () => {
      try {
        console.log("[_layout.tsx] Restoring session...");
        await restoreSession();
      } catch (error) {
        console.error("[_layout.tsx] Session restore error:", error);
      } finally {
        setBooting(false);
      }
    })();
  }, []);

  // OAuth ガード: 認証済みなら /(tabs)/home へリダイレクト
  useEffect(() => {
    if (!booting && isAuthenticated) {
      console.log("[_layout.tsx] Authenticated - redirecting to home");
      router.replace("/(tabs)/home");
    }
  }, [booting, isAuthenticated]);

  useEffect(() => {
    try {
      // QRコードスキャン中のリンクイベントを無効化
      const subscription = Linking.addEventListener("url", (event) => {
        try {
          // Scan画面にいる場合は、リンクイベントを無視
          if (pathname?.includes("scan")) {
            console.log("Link event ignored during scan:", event.url);
            return;
          }
          // その他の画面では通常のリンク処理
        } catch (error) {
          console.error("[_layout.tsx] Link event handler error:", error);
        }
      });

      return () => {
        try {
          subscription.remove();
        } catch (error) {
          console.error("[_layout.tsx] Cleanup error:", error);
        }
      };
    } catch (error) {
      console.error("[_layout.tsx] useEffect error:", error);
    }
  }, [pathname]);

  // OAuth ガード: 起動中はローディング表示（チラつき防止）
  if (booting) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: tokens.color.background.default }}>
        <ActivityIndicator size="large" color={tokens.color.primary} />
      </View>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <Stack
        screenOptions={{
          headerStyle: {
            backgroundColor: "#106A5A",
          },
          headerTintColor: "#fff",
          headerTitleStyle: {
            fontWeight: "600",
          },
        }}
      >
        <Stack.Screen
          name="index"
          options={{
            title: "ログイン",
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="(tabs)"
          options={{
            headerShown: false,
          }}
        />
      </Stack>
    </QueryClientProvider>
  );
}
