// ==========================================
// ルートレイアウト
// ==========================================

console.log("[BOOT:FILE] app/_layout.tsx loaded");

import { useEffect, useMemo, useState, useRef } from "react";
import { View, ActivityIndicator, Text } from "react-native";
import { Stack, useRouter, usePathname } from "expo-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as Linking from "expo-linking";
import * as Sentry from "@sentry/react-native";
import Constants from "expo-constants";
import { useAppStore } from "../store/appStore";
import { InitialErrorScreen } from "../components/system/InitialErrorScreen";
import { tokens } from "@mc-gate/ui-kit";
import { performIntegrityCheck, showIntegrityAlert } from "../utils/integrityCheck";
import { useWorkers } from "../hooks/useWorkers";

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
  console.log("[BOOT:RENDER] RootLayout render");

  const router = useRouter();
  const pathname = usePathname();

  // OAuth ガード: セッション復元
  const restoreSession = useAppStore((s) => s.restoreSession);
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const initStatus = useAppStore((s) => s.initStatus);
  const initError = useAppStore((s) => s.initError);
  const [booting, setBooting] = useState(true);
  const [integrityValid, setIntegrityValid] = useState<boolean | null>(null);

  // P2-6-2: Workers フックを取得（整合性チェック用）
  const workersHook = useWorkers();

  // 🔒 初期化ガード: useEffect の無限ループを防止
  const didInitRef = useRef(false);

  // 🔒 ナビゲーションガード: リダイレクトを一回だけにする
  const didNavRef = useRef(false);

  // QueryClient を useMemo で安全に初期化（New Architecture 対応）
  const queryClient = useMemo(() => new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        staleTime: 5 * 60 * 1000, // 5分
      },
    },
  }), []);

  // G-3-4: 初期化エラー分類ロジック
  const { startInitialization } = useAppStore((s) => ({
    startInitialization: s.startInitialization,
  }));

  // OAuth ガード: アプリ起動時に1回だけセッション復元
  useEffect(() => {
    console.error("[BOOT:1/3] RootLayout useEffect called. didInitRef.current =", didInitRef.current);
    // 🔒 ガード: 既に実行済みなら skip（無限ループ防止）
    if (didInitRef.current) return;
    didInitRef.current = true;

    (async () => {
      try {
        console.error("[BOOT:2/3] Starting initialization (didInitRef set to true)");
        console.log("[_layout.tsx] Starting initialization...");

        // G-3-4: エラー分類ロジックを使用して初期化（restoreSession + error classification）
        await startInitialization();

        // P2-6-2: 必須関数存在チェック（起動時）
        console.log("[P2-6-2] Performing integrity check...");

        // Workers フックが準備できるまで待機
        let retryCount = 0;
        while (!workersHook.isReady && retryCount < 10) {
          await new Promise(resolve => setTimeout(resolve, 100));
          retryCount++;
        }

        // 必須シンボルの定義
        const requiredSymbols = {
          "syncFromServer": () => typeof workersHook.syncFromServer === "function",
          "getAllWorkers": () => typeof workersHook.getAllWorkers === "function",
          "getWorkerById": () => typeof workersHook.getWorkerById === "function",
        };

        const integrityResult = performIntegrityCheck(requiredSymbols);
        setIntegrityValid(integrityResult.isValid);

        if (!integrityResult.isValid) {
          console.error("[P2-6-2] Integrity check FAILED:", integrityResult);

          // 整合性エラーをユーザーに通知
          showIntegrityAlert(integrityResult, () => {
            // 再起動処理（React Native には組み込みの再起動メソッドがないため、手動）
            console.log("[P2-6-2] User requested restart");
          });

          // これ以上進まない（bootingをtrueのままにして画面遷移をブロック）
          return;
        }

        console.log("[P2-6-2] Integrity check PASSED");
      } catch (error) {
        console.error("[_layout.tsx] Initialization error:", error);
      } finally {
        // 整合性チェックが失敗した場合、またはG-3-4エラーが発生した場合はbootingを解除しない
        if (integrityValid !== false && initStatus !== "error") {
          setBooting(false);
        }
      }
    })();
  }, []);

  // OAuth ガード: 認証済みなら /(tabs)/home へリダイレクト（一回だけ）
  useEffect(() => {
    // 初期化完了まで待機
    if (booting || didNavRef.current) return;

    // ナビゲーションは一回だけ
    if (isAuthenticated) {
      didNavRef.current = true;
      console.log("[BOOT:NAV] Authenticated - redirecting to home");
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

  // G-3-4: 初期化エラー画面を優先表示（booting完了後）
  if (!booting && initStatus === "error" && initError) {
    return (
      <QueryClientProvider client={queryClient}>
        <InitialErrorScreen />
      </QueryClientProvider>
    );
  }

  // OAuth ガード: 起動中はローディング表示（チラつき防止）
  if (booting) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: tokens.color.background.default }}>
        <ActivityIndicator size="large" color={tokens.color.primary} />
        {integrityValid === false && (
          <View style={{ marginTop: 20, paddingHorizontal: 40 }}>
            <Text style={{ color: tokens.color.warn, textAlign: "center", fontSize: 16 }}>
              ⚠️ アプリの整合性チェックに失敗しました
            </Text>
            <Text style={{ color: tokens.color.text.secondary, textAlign: "center", marginTop: 10, fontSize: 14 }}>
              アプリを再インストールしてください
            </Text>
          </View>
        )}
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
