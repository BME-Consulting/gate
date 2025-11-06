// ==========================================
// ルートレイアウト
// ==========================================

import { useEffect } from "react";
import { Stack, useRouter, usePathname } from "expo-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as Linking from "expo-linking";

const queryClient = new QueryClient();

export default function RootLayout() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // QRコードスキャン中のリンクイベントを無効化
    const subscription = Linking.addEventListener("url", (event) => {
      // Scan画面にいる場合は、リンクイベントを無視
      if (pathname?.includes("scan")) {
        console.log("Link event ignored during scan:", event.url);
        return;
      }
      // その他の画面では通常のリンク処理
    });

    return () => {
      subscription.remove();
    };
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
