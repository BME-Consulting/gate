module.exports = ({ config }) => {
  // Environment detection
  const isProduction = process.env.ENV === "production";

  // API URLs - IMPORTANT: Use environment variables for production
  // For development, fallback to hardcoded values
  const apiBaseGs = process.env.API_BASE_GS || "http://192.168.1.4:7070";
  const apiBaseCcus = process.env.API_BASE_CCUS || "http://192.168.1.4:7071";
  const apiFaceApi = process.env.API_FACE_API || "http://192.168.1.4:8100";
  const authIssuer = process.env.AUTH_ISSUER || "http://192.168.1.4:8080/auth/realms/mcd3";

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

  return {
    ...config,
    name: "mc-gate",
    slug: "mc-gate",
    owner: "bme_llc",
    version: "1.0.19",
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
      versionCode: 20,
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
      eas: {
        projectId: "0f0feec5-4f4b-4252-ad34-c1594238b4b8",
      },
      apiBaseGs,
      apiBaseCcus,
      apiFaceApi,
      apiGsApiKey,
      apiFaceApiKey,
      auth: {
        issuer: authIssuer,
        audience: process.env.AUTH_AUDIENCE || "mc-gate",
        clientId: process.env.AUTH_CLIENT_ID || "mc-gate-mobile",
      },
      // モック認証の使用（環境変数で制御、本番では必ず false）
      useMockAuth: process.env.USE_MOCK_AUTH === "true" || !isProduction,

      // アプリケーション定数（本番運用向け）
      defaultProjectId: process.env.DEFAULT_PROJECT_ID || "PRJ001",
      dbName: "mc-gate.db",
    },
    plugins: [
      "expo-updates",
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
          },
        },
      ],
    ],
  };
};
