module.exports = ({ config }) => {
  // Environment detection
  // APP_ENVを統一的に使用（ENVとの二重管理を避ける）
  const appEnv = process.env.APP_ENV || process.env.ENV || "development";
  const isProduction = appEnv === "production";

  // API URLs - IMPORTANT: Use environment variables for production
  // For development, fallback to hardcoded values
  const apiBaseGs = process.env.API_BASE_GS || "http://192.168.1.4:7070";
  const apiBaseCcus = process.env.API_BASE_CCUS || "http://192.168.1.4:7071";
  const apiFaceApi = process.env.API_FACE_API || "http://192.168.1.4:8101";
  const authIssuer = process.env.AUTH_ISSUER || "http://192.168.1.4:8081/realms/mcd3";

  // API Keys - MUST be set via environment variables in production
  const apiGsApiKey = process.env.API_GS_API_KEY || (isProduction ? null : "development-api-key-12345");
  const apiFaceApiKey = process.env.API_FACE_API_KEY || (isProduction ? null : "development-api-key-12345");

  // Validation for production environment
  if (isProduction) {
    // 1. HTTPS enforcement
    const urls = [
      { name: "API_BASE_GS", value: apiBaseGs },
      { name: "API_BASE_CCUS", value: apiBaseCcus },
      { name: "API_FACE_API", value: apiFaceApi },
      { name: "AUTH_ISSUER", value: authIssuer },
    ];

    const httpUrls = urls.filter(url => url.value && url.value.startsWith("http://"));

    if (httpUrls.length > 0) {
      throw new Error(`
========================================
❌ PRODUCTION BUILD ERROR - HTTP URLs
========================================

The following URLs must use HTTPS in production:

${httpUrls.map(url => `  - ${url.name}: ${url.value}`).join("\n")}

Please update your environment variables.
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
  console.log("  apiBaseGs:", apiBaseGs);
  console.log("  apiBaseCcus:", apiBaseCcus);
  console.log("  apiFaceApi:", apiFaceApi);
  console.log("  authIssuer:", authIssuer);

  return {
    ...config,
    name: "mc-gate",
    slug: "mc-gate",
    owner: "bme_llc",
    version: "1.0.27",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "light",
    newArchEnabled: true,
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
      versionCode: 28,
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
    runtimeVersion: {
      policy: "sdkVersion",
    },
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
      appEnv,  // アプリ内で環境判定に使用

      // アプリケーション定数（本番運用向け）
      defaultProjectId: process.env.DEFAULT_PROJECT_ID || "PRJ001",
      dbName: "mc-gate.db",
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
      [
        "expo-build-properties",
        {
          ios: {
            newArchEnabled: true,
            infoPlist: {
              NSAppTransportSecurity: {
                NSAllowsArbitraryLoads: !isProduction,  // 開発中のみHTTP許可
              }
            }
          },
          android: {
            newArchEnabled: true,
            usesCleartextTraffic: !isProduction,  // 開発中のみHTTP許可
            minSdkVersion: 26,  // react-native-vision-camera-face-detector requires API 26+
          },
        },
      ],
    ],
  };
};
