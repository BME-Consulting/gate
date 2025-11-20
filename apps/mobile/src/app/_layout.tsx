// ==========================================
// ルートレイアウト
// ==========================================

import { useEffect, useMemo } from "react";
import { Stack, useRouter, usePathname } from "expo-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as Linking from "expo-linking";

export default function RootLayout() {
  const router = useRouter();
  const pathname = usePathname();

  // QueryClient を useMemo で安全に初期化（New Architecture 対応）
  const queryClient = useMemo(() => new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        staleTime: 5 * 60 * 1000, // 5分
      },
    },
  }), []);

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
