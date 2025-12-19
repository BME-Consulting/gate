module.exports = ({ config }) => {
  // Environment detection
  // APP_ENVを統一的に使用（ENVとの二重管理を避ける）
  // フォールバック: EAS_BUILD_PROFILE または Updates.channel から推測
  const buildProfile = process.env.EAS_BUILD_PROFILE || "";
  const appEnv = process.env.APP_ENV ||
    process.env.ENV ||
    (buildProfile === "production" ? "production" :
     buildProfile === "preview" ? "preview" :
     buildProfile === "production-apk" ? "production" :
     "development");
  const isProduction = appEnv === "production";

  // API URLs - IMPORTANT: Use environment variables for production/preview
  // development環境のみLAN IPをフォールバック許可、それ以外はnull（ビルドエラーで検出）
  // ⚠️ Face APIポート: 8101（Cloudflare Dashboard設定に統一）
  const apiBaseGs = process.env.API_BASE_GS ||
    (appEnv === "development" ? "http://192.168.1.4:7070" : null);
  const apiBaseCcus = process.env.API_BASE_CCUS ||
    (appEnv === "development" ? "http://192.168.1.4:7071" : null);
  const apiFaceApi = process.env.API_FACE_API ||
    (appEnv === "development" ? "http://192.168.1.4:8101" : null);  // ✅ Cloudflare Dashboard（8101）に統一
  const authIssuer = process.env.AUTH_ISSUER ||
    (appEnv === "development" ? "http://192.168.1.4:8081/realms/mcd3" : null);

  // API Keys - MUST be set via environment variables
  // ハードコード削除: 全環境で環境変数から取得
  const apiGsApiKey = process.env.API_GS_API_KEY || null;
  const apiFaceApiKey = process.env.API_FACE_API_KEY || null;

  // Sentry DSN - Error tracking and monitoring
  const sentryDsn = process.env.SENTRY_DSN || "";

  // Validation for non-development environments (preview/production)
  if (appEnv !== "development") {
    // 1. URL必須チェック（未設定はビルドエラー）
    const urls = [
      { name: "API_BASE_GS", value: apiBaseGs },
      { name: "API_BASE_CCUS", value: apiBaseCcus },
      { name: "API_FACE_API", value: apiFaceApi },
      { name: "AUTH_ISSUER", value: authIssuer },
    ];

    const missingUrls = urls.filter(url => !url.value);
    if (missingUrls.length > 0) {
      throw new Error(`
========================================
❌ BUILD ERROR - Missing API URLs (${appEnv})
========================================

The following URLs are required:

${missingUrls.map(url => `  - ${url.name}`).join("\n")}

Set these in eas.json under "${appEnv}" profile.
========================================
`);
    }

    // 2. HTTPS enforcement
    const httpUrls = urls.filter(url => url.value && url.value.startsWith("http://"));

    if (httpUrls.length > 0) {
      throw new Error(`
========================================
❌ BUILD ERROR - HTTP URLs (${appEnv})
========================================

The following URLs must use HTTPS:

${httpUrls.map(url => `  - ${url.name}: ${url.value}`).join("\n")}

LAN IP addresses are only allowed in development.
========================================
`);
    }

    // 2. API Keys validation
    if (!apiGsApiKey || !apiFaceApiKey) {
      throw new Error(`
========================================
❌ PRODUCTION BUILD ERROR - API Keys
========================================

API Keys must be set via environment variables in production:

${!apiGsApiKey ? "  - API_GS_API_KEY is missing\n" : ""}${!apiFaceApiKey ? "  - API_FACE_API_KEY is missing\n" : ""}
Please set these environment variables before building.
========================================
`);
    }
  }

  // Expo から渡される config.extra をベースにする（なければ {}）
  const baseExtra = (config && config.extra) || {};

  // デバッグ出力（ビルドログで確認用）
  console.log("🔍 app.config.js Debug (before merge):");
  console.log("  incoming config.extra:", JSON.stringify(baseExtra, null, 2));
  console.log("  APP_ENV (process.env):", process.env.APP_ENV);
  console.log("  EAS_BUILD_PROFILE (process.env):", process.env.EAS_BUILD_PROFILE);
  console.log("  appEnv (computed):", appEnv);
  console.log("  isProduction:", isProduction);
  console.log("  apiBaseGs:", apiBaseGs);
  console.log("  apiBaseCcus:", apiBaseCcus);
  console.log("  apiFaceApi:", apiFaceApi);
  console.log("  authIssuer:", authIssuer);

  return {
    ...config,
    name: "mc-gate",
    slug: "mc-gate",
    owner: "bme_llc",
    version: "1.0.31",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "light",
    newArchEnabled: true,  // VisionCamera 4.7.3 Frame Processors requires New Architecture
    scheme: "mcgate",
    splash: {
      image: "./assets/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: "#ffffff",
    },
    ios: {
      bundleIdentifier: "com.bmeconsulting.mcgate",
      supportsTablet: true,
      infoPlist: {
        NSCameraUsageDescription: "QRコードの読み取りにカメラを使用します。",
        NSBluetoothAlwaysUsageDescription:
          "CCUSカードリーダーとの通信にBluetoothを使用します。",
      },
    },
    android: {
      package: "com.bmeconsulting.mcgate",
      versionCode: 32,
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#ffffff",
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
      permissions: ["CAMERA", "BLUETOOTH_CONNECT", "BLUETOOTH_SCAN"],
    },
    web: {
      favicon: "./assets/favicon.png",
    },
    updates: {
      url: "https://u.expo.dev/0f0feec5-4f4b-4252-ad34-c1594238b4b8",
    },
    runtimeVersion: "exposdk:54.0.0",
    extra: {
      // まず既存 extra を先に展開（後から上書きするため）
      ...baseExtra,

      // その上で「絶対こうであってほしい値」で上書き
      eas: {
        ...(baseExtra.eas || {}),
        projectId: "0f0feec5-4f4b-4252-ad34-c1594238b4b8",
      },

      // フラットキー（後方互換＆expo config 用）
      apiBaseGs,
      apiBaseCcus,
      apiFaceApi,
      apiGsApiKey,
      apiFaceApiKey,
      authIssuer,  // フラットキーとしても保存

      // ネストされた auth（実際にアプリが参照する想定）
      auth: {
        ...(baseExtra.auth || {}),
        issuer: authIssuer,
        audience: process.env.AUTH_AUDIENCE || baseExtra.auth?.audience || "mc-gate",
        clientId: process.env.AUTH_CLIENT_ID || baseExtra.auth?.clientId || "mc-gate-mobile",
      },
      // モック認証の使用（APP_ENVで強制制御）
      // 本番環境（APP_ENV=production）では絶対にfalse
      // 環境変数USE_MOCK_AUTHで開発/プレビュー環境でもOAuth認証をテスト可能
      useMockAuth: appEnv === "production"
        ? false
        : (process.env.USE_MOCK_AUTH === "false" ? false : true),

      // モック作業員データの使用（明示的にONにした場合のみ）
      // 本番環境では絶対にfalse、それ以外も基本false（実DBを使う）
      useMockWorkers: appEnv === "production"
        ? false
        : (process.env.USE_MOCK_WORKERS === "true" ? true : false),

      appEnv,  // アプリ内で環境判定に使用

      // アプリケーション定数（本番運用向け）
      defaultProjectId: process.env.DEFAULT_PROJECT_ID || "PRJ001",
      dbName: "mc-gate.db",

      // Sentry configuration
      sentryDsn,
    },
    plugins: [
      "expo-updates",
      [
        "react-native-vision-camera",
        {
          cameraPermissionText: "顔認証とQRコード読み取りにカメラを使用します。",
          enableFrameProcessors: true,
          enableCodeScanner: false  // expo-cameraをQRスキャンに使用
        }
      ],
      // Note: react-native-worklets-core は自動リンクされるため、pluginsには不要
      [
        "expo-build-properties",
        {
          ios: {
            newArchEnabled: true,  // VisionCamera 4.7.3 Frame Processors requires New Architecture
            infoPlist: {
              NSAppTransportSecurity: {
                NSAllowsArbitraryLoads: !isProduction,  // 開発中のみHTTP許可
              }
            }
          },
          android: {
            newArchEnabled: true,  // VisionCamera 4.7.3 Frame Processors requires New Architecture
            usesCleartextTraffic: !isProduction,  // 開発中のみHTTP許可
            minSdkVersion: 26,  // react-native-vision-camera-face-detector requires API 26+
          },
        },
      ],
    ],
  };
};
