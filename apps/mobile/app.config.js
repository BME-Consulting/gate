module.exports = ({ config }) => {
  // Environment detection
  const isProduction = process.env.ENV === "production";

  // API URLs - IMPORTANT: Use hardcoded values for EAS Update compatibility
  // .env files are not included in EAS builds (gitignored)
  const apiBaseGs = "http://192.168.1.4:7070";
  const apiBaseCcus = "http://192.168.1.4:7071";
  const apiFaceApi = "http://192.168.1.4:8100";
  const apiGsApiKey = "development-api-key-12345";
  const apiFaceApiKey = "development-api-key-12345";
  const authIssuer = "http://192.168.1.4:8080/auth/realms/mcd3";

  // HTTPS enforcement for production
  if (isProduction) {
    const urls = [
      { name: "API_BASE_GS", value: apiBaseGs },
      { name: "API_BASE_CCUS", value: apiBaseCcus },
      { name: "API_FACE_API", value: apiFaceApi },
      { name: "AUTH_ISSUER", value: authIssuer },
    ];

    const httpUrls = urls.filter(url => url.value.startsWith("http://"));

    if (httpUrls.length > 0) {
      const errorMessage = `
========================================
❌ PRODUCTION BUILD ERROR
========================================

The following environment variables must use HTTPS in production:

${httpUrls.map(url => `  - ${url.name}: ${url.value}`).join("\n")}

Please update your environment variables:
  export ${httpUrls.map(url => url.name).join("\n  export ")}

HTTP is only allowed in development mode (ENV !== "production")
========================================
`;
      throw new Error(errorMessage);
    }
  }

  return {
    ...config,
    name: "mc-gate",
    slug: "mc-gate",
    owner: "bme_llc",
    version: "1.0.15",
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
      versionCode: 16,
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
      // 開発中はモック認証を使用（本番環境では false に変更）
      useMockAuth: true,

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
