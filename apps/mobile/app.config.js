module.exports = ({ config }) => {
  // ========================================
  // SSOT Safe String Helper (2025-01-08)
  // ========================================
  // EAS Update may pass {} objects instead of strings
  // This function ensures we only accept valid string values
  function safeString(value, defaultValue = "") {
    // Reject null, undefined, empty string
    if (value === undefined || value === null || value === "") {
      return defaultValue;
    }
    // Reject objects (including {})
    if (typeof value === 'object') {
      console.warn(`[app.config] Rejected object value:`, value);
      return defaultValue;
    }
    // Convert to string
    return String(value);
  }

  // ========================================
  // SSOT Environment Detection (2025-12-25)
  // ========================================
  // EAS Update（OTA配信）では EAS_BUILD_PROFILE が存在しない問題に対処
  // Branch/Channel優先で環境を確定し、preview/prodでのLAN URL fallbackを根絶

  const buildProfile = safeString(process.env.EAS_BUILD_PROFILE);              // build時
  const updateBranch = safeString(process.env.EAS_UPDATE_BRANCH);              // update時
  const updateChannel = safeString(process.env.EAS_UPDATE_CHANNEL);            // あるなら
  const branchLike = updateBranch || updateChannel || buildProfile || "";

  // 明示指定（ただし preview/prod では branchLike を優先）
  const explicitEnv = safeString(process.env.EXPO_PUBLIC_APP_ENV) ||
                      safeString(process.env.APP_ENV) ||
                      safeString(process.env.ENV) ||
                      "";

  // branch/channel/profile から確定（最優先）
  function envFromBranch(branch) {
    const b = String(branch).toLowerCase();
    if (b === "production" || b === "prod" || b === "main") return "production";
    if (b === "preview" || b === "staging") return "preview";
    if (b === "production-apk") return "production";
    return null;
  }

  const inferred = envFromBranch(branchLike);

  // ✅ 最終 appEnv
  // - preview/prod が推定できるならそれを採用（explicitを無視）
  // - それ以外は explicit → development
  const appEnv = inferred || (explicitEnv ? String(explicitEnv).toLowerCase() : "development");
  const isProduction = appEnv === "production";

  // ========================================
  // SSOT URL Selection with LAN Ban (2025-12-25)
  // ========================================
  // Cloudflare Tunnel domains (SSOT)
  const API_GATE = "https://api-gate.bme-service.monster";
  const FACE_GATE = "https://face-gate.bme-service.monster";
  const AUTH_GATE = "https://auth-gate.bme-service.monster";

  // URL決定関数（appEnv優先、LAN禁止ガード付き）
  function pickBaseUrls(appEnv) {
    if (appEnv === "production" || appEnv === "preview") {
      return {
        apiBaseGs: API_GATE,
        apiBaseCcus: API_GATE,
        apiFaceApi: FACE_GATE,
        authIssuer: `${AUTH_GATE}/realms/mcd3`,
      };
    }
    // developmentだけLAN許可
    return {
      apiBaseGs: "http://192.168.1.4:7070",
      apiBaseCcus: "http://192.168.1.4:7071",
      apiFaceApi: "http://192.168.1.4:8101",
      authIssuer: "http://192.168.1.4:8081/realms/mcd3",
    };
  }

  const urls = pickBaseUrls(appEnv);

  // 🔒 SSOT: preview/prod でLANが出たら絶対に強制上書き
  const isLan = (u) => /^http:\/\/192\.168\./.test(u) || /^http:\/\/10\./.test(u) || /^http:\/\/172\.(1[6-9]|2[0-9]|3[01])\./.test(u);
  if ((appEnv === "preview" || appEnv === "production") &&
      (isLan(urls.apiBaseGs) || isLan(urls.apiFaceApi) || isLan(urls.authIssuer))) {
    console.error(`🚨 [SSOT] LAN URL detected in ${appEnv} environment! Force overriding to Cloudflare domains.`);
    urls.apiBaseGs = API_GATE;
    urls.apiBaseCcus = API_GATE;
    urls.apiFaceApi = FACE_GATE;
    urls.authIssuer = `${AUTH_GATE}/realms/mcd3`;
  }

  // 最終的なURL（環境変数での上書きも許可、ただしLANガードは通す）
  let apiBaseGs = safeString(process.env.API_BASE_GS) || urls.apiBaseGs;
  let apiBaseCcus = safeString(process.env.API_BASE_CCUS) || urls.apiBaseCcus;
  let apiFaceApi = safeString(process.env.API_FACE_API) || urls.apiFaceApi;
  let authIssuer = safeString(process.env.AUTH_ISSUER) || urls.authIssuer;

  // 最終LAN禁止ガード（環境変数経由でもLANを弾く）
  if ((appEnv === "preview" || appEnv === "production") &&
      (isLan(apiBaseGs) || isLan(apiFaceApi) || isLan(authIssuer))) {
    console.error(`🚨 [SSOT] LAN URL in env vars for ${appEnv}! Forcing Cloudflare domains.`);
    apiBaseGs = API_GATE;
    apiBaseCcus = API_GATE;
    apiFaceApi = FACE_GATE;
    authIssuer = `${AUTH_GATE}/realms/mcd3`;
  }

  // API Keys - MUST be set via environment variables
  // ハードコード削除: 全環境で環境変数から取得
  // IMPORTANT: Filter out empty objects (EAS Update may pass {} instead of undefined)
  // ✅ 空文字fallbackに変更（null は {} に変換されるため）
  // ✅ development環境では preview API key をデフォルトとして使用
  const apiGsApiKey = safeString(
    process.env.API_GS_API_KEY,
    appEnv === "development" ? "preview-3048a965-fa7c" : ""
  );
  const apiFaceApiKey = safeString(
    process.env.API_FACE_API_KEY,
    appEnv === "development" ? "preview-3048a965-fa7c" : ""  // development環境のみデフォルトキーを使用
  );

  // Sentry DSN - Error tracking and monitoring
  const sentryDsn = safeString(process.env.SENTRY_DSN);

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

  // SSOT Diagnostic Logging
  console.log("========================================");
  console.log("🔍 SSOT app.config.js Diagnostic (2025-12-25)");
  console.log("========================================");
  console.log("  Environment Detection:");
  console.log("    buildProfile:", buildProfile || "(none)");
  console.log("    updateBranch:", updateBranch || "(none)");
  console.log("    updateChannel:", updateChannel || "(none)");
  console.log("    branchLike:", branchLike || "(none)");
  console.log("    explicitEnv (APP_ENV/ENV):", explicitEnv || "(none)");
  console.log("    inferred (from branch):", inferred || "(none)");
  console.log("    ➡️ FINAL appEnv:", appEnv);
  console.log("  ");
  console.log("  API URLs (SSOT):");
  console.log("    apiBaseGs:", apiBaseGs);
  console.log("    apiBaseCcus:", apiBaseCcus);
  console.log("    apiFaceApi:", apiFaceApi);
  console.log("    authIssuer:", authIssuer);
  console.log("========================================");

  return {
    ...config,
    name: "mc-gate",
    slug: "mc-gate",
    owner: "bme_llc",
    version: "1.0.32",
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
      versionCode: 33,
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
      // ✅ || {} を削除（{} fallback が事故を引き起こすため）
      eas: {
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
      // ✅ || {} を削除、空文字fallbackに変更
      auth: {
        issuer: authIssuer,
        audience: safeString(process.env.AUTH_AUDIENCE, "mc-gate"),
        clientId: safeString(process.env.AUTH_CLIENT_ID, "mc-gate-mobile"),
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

      // SSOT環境判定診断情報（2025-12-25）
      // ✅ || null を削除（null は {} に変換されるため、空文字のままにする）
      ssotEnvDiagnostic: {
        buildProfile: buildProfile,
        updateBranch: updateBranch,
        updateChannel: updateChannel,
        branchLike: branchLike,
        explicitEnv: explicitEnv,
        inferred: inferred || "",
        finalAppEnv: appEnv,
      },

      // Git commit hash for runtime verification (P2-6 integrity check)
      // EAS Updateの不整合を検知するため、ビルド時のコミットハッシュを埋め込む
      commitHash: (() => {
        try {
          return process.env.GIT_COMMIT || require('child_process').execSync('git rev-parse --short HEAD').toString().trim();
        } catch (error) {
          console.warn('[app.config] Failed to get git commit hash:', error.message);
          return 'unknown';
        }
      })(),

      // アプリケーション定数（本番運用向け）
      defaultProjectId: safeString(process.env.DEFAULT_PROJECT_ID) || "PRJ001",
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
