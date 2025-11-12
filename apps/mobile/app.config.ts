import { ExpoConfig, ConfigContext } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "mc-gate",
  slug: "mc-gate",
  owner: "bme_llc",
  version: "1.0.2",
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
    versionCode: 3,
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
    apiBaseGs: process.env.API_BASE_GS || "http://localhost:7070",
    apiBaseCcus: process.env.API_BASE_CCUS || "http://localhost:7071",
    auth: {
      issuer:
        process.env.AUTH_ISSUER ||
        "http://localhost:8080/auth/realms/mcd3",
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
