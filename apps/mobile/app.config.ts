import { ExpoConfig, ConfigContext } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => {
  // Environment detection
  const isProduction = process.env.ENV === "production";

  // API URLs
  const apiBaseGs = process.env.API_BASE_GS || "http://localhost:7070";
  const apiBaseCcus = process.env.API_BASE_CCUS || "http://localhost:7071";
  const apiFaceApi = process.env.API_FACE_API || "http://localhost:8100";
  const apiFaceApiKey = process.env.API_FACE_API_KEY || "development-api-key-12345";
  const authIssuer = process.env.AUTH_ISSUER || "http://localhost:8080/auth/realms/mcd3";

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

  return ({
  ...config,
  name: "mc-gate",
  slug: "mc-gate",
  owner: "bme_llc",
  version: "1.0.9",
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
    versionCode: 10,
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
    apiFaceApiKey,
    auth: {
      issuer: authIssuer,
      audience: process.env.AUTH_AUDIENCE || "mc-gate",
      clientId: process.env.AUTH_CLIENT_ID || "mc-gate-mobile",
    },
  },
  plugins: [
    "expo-updates",
    [
      "expo-build-properties",
      {
        ios: { newArchEnabled: true },
        android: { newArchEnabled: true },
      },
    ],
  ],
  });
};
