# 現行モバイルUI仕様書（実装SSOT抽出版）

**作成日**: 2025-12-18
**対象**: mc-gate/apps/mobile
**目的**: セキュリティレビューとProduction露出リスクの特定

---

## 1. 画面一覧（Routes/Stack/Tabs）

### タブ構成

**ファイル**: `src/app/(tabs)/_layout.tsx`

| タブ名 | パス | アイコン | 目的 | 備考 |
|--------|------|----------|------|------|
| ホーム | `/home` | home | ダッシュボード・統計表示 | - |
| 認証 | `/auth` | scan | QRコード認証 | unmountOnBlur: true |
| 顔登録 | `/face-registration` | person-add | 顔写真登録・管理 | unmountOnBlur: true |
| 履歴 | `/history` | list | スキャンイベント履歴 | - |
| 設定 | `/settings` | settings | アプリ設定・ユーザー情報 | - |
| **デバッグ** | `/debug` | bug | **開発用ツール** | **❌ 環境分岐なし** |
| カメラテスト | `/vision-test` | camera | カメラ動作確認 | unmountOnBlur: true |

**🚨 重大な問題**:
- **デバッグタブ（Line 71-79）**: 環境分岐なし、productionでも表示される
- **カメラテストタブ（Line 80-89）**: 同様に環境分岐なし

### スタック遷移

```
RootLayout (_layout.tsx)
├── LoginScreen (index.tsx)
└── TabsLayout ((tabs)/_layout.tsx)
    ├── Home
    ├── Auth
    ├── FaceRegistration
    ├── History
    ├── Settings
    ├── Debug        ← 🚨 本番で露出
    └── VisionTest   ← 🚨 本番で露出
```

### Deep Links

- **スキーム**: `mcgate://`
- **設定**: `app.config.js` Line 108
- **動作**: ログイン画面で QR コードスキャン中はリンクイベントを無視（`_layout.tsx` Line 50-62）

---

## 2. 各画面仕様（最低限）

### 2.1 ログイン画面 (`index.tsx`)

**目的**: ユーザー認証

**操作**:
- ユーザーID・パスワード入力
- ログインボタン押下

**環境判定**:
```typescript
// Line 22-34, 87-98
const appEnv = Constants.expoConfig?.extra?.appEnv || "development";
const useMockAuth = Constants.expoConfig?.extra?.useMockAuth ?? true;
const shouldUseMock = appEnv !== "production" && useMockAuth;
```

**自動ログイン** (Line 26-76):
- **条件**: `__DEV__ || appEnv === "development" || appEnv === "preview"`
- **production**: 自動ログイン無効 ✅

**API呼び出し**:
- Mock認証: なし（ローカル生成トークン）
- OAuth認証: `loginWithOAuth()` → Keycloak

**機微情報**:
- ✅ トークンは SecureStore に保存（Mock時はスキップ）
- ✅ production では強制的に OAuth

---

### 2.2 ホーム画面 (`home.tsx`)

**目的**: ダッシュボード・統計表示

**API呼び出し**:
- 今日の入退場統計
- 現在場内人数

---

### 2.3 認証画面 (`auth.tsx`)

**目的**: QRコード読み取りと顔認証

**API呼び出し**:
- Face API: `/detect` （顔検出）
- GS API: `/api/events` （スキャンイベント送信）

**認証ヘッダ**:
```typescript
headers: {
  "x-api-key": apiGsApiKey,  // 環境変数から取得
  "Authorization": `Bearer ${token}`,
}
```

---

### 2.4 顔登録画面 (`face-registration.tsx`)

**目的**: 顔写真登録・管理

**API呼び出し**:
- Face API: `/register` （顔登録）
- Face API: `/faces` （登録済み顔一覧）

---

### 2.5 履歴画面 (`history.tsx`)

**目的**: スキャンイベント履歴表示

**データソース**: ローカルSQLite（`mc-gate.db`）

---

### 2.6 設定画面 (`settings.tsx`)

**目的**: アプリ設定・ユーザー情報・作業員同期

**🚨 表示される機微情報**:

| 項目 | 表示内容 | Line | リスク |
|------|----------|------|--------|
| Face API URL | `Constants.expoConfig?.extra?.apiFaceApi` | 674-678 | 🔴 内部URL露出 |
| GS API URL | `Constants.expoConfig?.extra?.apiBaseGs` | 682-686 | 🔴 内部URL露出 |
| Auth Issuer | `Constants.expoConfig?.extra?.authIssuer` | 688-693 | 🔴 内部URL露出 |
| Auth Audience | `Constants.expoConfig?.extra?.auth?.audience` | 696-700 | 🟡 識別子露出 |
| Auth Client ID | `Constants.expoConfig?.extra?.auth?.clientId` | 703-707 | 🟡 識別子露出 |
| Update ID | `Updates.updateId?.slice(0, 8)` | 712-716 | 🟢 一部のみ |
| 配信チャンネル | `Updates.channel` | 728-730 | 🟢 問題なし |

**API呼び出し**:
- 作業員同期（Line 340-411）:
  ```typescript
  const workersApiUrl = `${apiBaseGs}/api/workers`;
  headers: { "x-api-key": apiGsApiKey }
  ```

**🚨 デバッグログ** (Line 370-374):
```typescript
console.log(`[DEBUG] GS API URL: ${apiBaseGs}`);
console.log(`[DEBUG] Workers API URL: ${workersApiUrl}`);
console.log(`[DEBUG] API Key: ${apiGsApiKey.substring(0, 20)}...`);  // ← API keyの一部露出
```

---

### 2.7 デバッグ画面 (`debug.tsx`) 🚨

**目的**: 開発用ダミーデータ生成・管理

**🚨 露出条件**: **なし（常に表示）**

**実行できる操作**:
1. **統計情報を更新** (Line 168-175):
   - SQLiteから pending/sent/failed 件数取得
   - 画面表示のみ（API呼び出しなし）

2. **ダミーデータを生成（50件）** (Line 177-184):
   - `seedDummyData(50)` 実行
   - 20種類の技能者ID（P001～P020）
   - 過去24時間以内のタイムスタンプ

3. **全データを削除** (Line 186-193):
   - `clearDummyData()` 実行
   - すべてのスキャンイベント削除

**表示データ**:
- 合計/送信済/送信待/失敗 件数
- ✅ API key や token は表示されない

**Web環境制限** (Line 107-123):
- Web環境では機能無効化
- ネイティブ（iOS/Android）でのみ動作

---

### 2.8 カメラテスト画面 (`vision-test.tsx`) 🚨

**目的**: カメラ動作確認

**🚨 露出条件**: **なし（常に表示）**

---

## 3. 設定画面仕様（重要）

### 表示項目詳細

**ソース**: `settings.tsx` Line 665-771

**環境判定**:
```typescript
const appEnv = Constants.expoConfig?.extra?.appEnv || "development";
```

**表示値のソース**:
| 項目 | ソース |
|------|--------|
| Face API URL | `Constants.expoConfig?.extra?.apiFaceApi` |
| GS API URL | `Constants.expoConfig?.extra?.apiBaseGs` |
| Auth Issuer | `Constants.expoConfig?.extra?.authIssuer` |
| Auth Audience | `Constants.expoConfig?.extra?.auth?.audience` |
| Auth Client ID | `Constants.expoConfig?.extra?.auth?.clientId` |

**値の決定フロー**:
1. eas.json の build profile `env` で環境変数設定
2. app.config.js で `Constants.expoConfig?.extra` に格納
3. settings.tsx で `Constants.expoConfig?.extra.*` から取得

### SSOT観点の危険箇所

**❌ LAN IP混入の可能性**:
- `app.config.js` Line 10-17: development環境でのみフォールバック許可
- ✅ preview/production では環境変数未設定時にビルドエラー（Line 28-51）

**❌ HTTP許容の可能性**:
- ✅ preview/production では HTTPS強制（Line 54-69）
- ✅ development のみ HTTP許可（Line 206, 212）

---

## 4. デバッグタブ仕様（最重要）

### 表示条件

**ソース**: `src/app/(tabs)/_layout.tsx` Line 71-79

```typescript
<Tabs.Screen
  name="debug"
  options={{
    title: "デバッグ",
    tabBarIcon: ({ color, size }) => (
      <Ionicons name="bug" size={size} color={color} />
    ),
  }}
/>
```

**🚨 判定ロジック**: **なし（無条件表示）**

- ❌ `APP_ENV` による分岐なし
- ❌ `__DEV__` による分岐なし
- ❌ `useMockAuth` による分岐なし
- **結論**: **production でも表示される**

### 実行できる操作一覧

**ファイル**: `src/app/(tabs)/debug.tsx`

1. **統計情報を更新** (Line 101-105):
   - ローカルSQLite読み取りのみ
   - API呼び出しなし

2. **ダミーデータを生成** (Line 23-58):
   - `seedDummyData(50)` → SQLite INSERT
   - API呼び出しなし
   - 50件のスキャンイベント生成

3. **全データを削除** (Line 60-87):
   - `clearDummyData()` → SQLite DELETE
   - すべてのスキャンイベント削除

### 表示しているデータ

- 統計情報（合計/送信済/送信待/失敗）
- ✅ API keyや tokenは表示されない
- ✅ 内部URLは表示されない
- ✅ 機密情報の露出なし

### productionで表示される可能性

**判定**: **100%表示される**

**根拠**: `_layout.tsx` Line 71-79 に環境分岐なし

---

## 5. セキュリティレビュー所見

### 本番で絶対に見せてはいけないもの

| 項目 | 現状 | リスク | 所在 |
|------|------|--------|------|
| **Debugタブ** | 🔴 **常に表示** | **P0** | `_layout.tsx` Line 71-79 |
| **Vision Testタブ** | 🔴 **常に表示** | **P1** | `_layout.tsx` Line 80-89 |
| **内部API URL** | 🔴 **設定画面に表示** | **P1** | `settings.tsx` Line 674-693 |
| API Key（完全な値） | 🟢 表示されない | - | - |
| Token（完全な値） | 🟢 表示されない | - | - |

### 鍵・トークン・内部URLの露出可能性

#### ✅ 露出しないもの（良好）

1. **API Key**:
   - 画面表示なし
   - ログ出力は最初の20文字のみ（`settings.tsx` Line 373）

2. **Token**:
   - 画面表示なし
   - SecureStoreに保存（`index.tsx` Line 108）

#### 🔴 露出するもの（危険）

1. **内部API URL** (`settings.tsx` Line 674-693):
   - Face API URL: `https://face-gate-prod.bme-service.monster`
   - GS API URL: `https://api-gate-prod.bme-service.monster`
   - Auth Issuer: `https://auth-gate.bme-service.monster/realms/mcd3`
   - **スクショ共有された場合**: 内部構成が露出

2. **Auth識別子** (`settings.tsx` Line 696-707):
   - Auth Audience: `mc-gate`
   - Auth Client ID: `mc-gate-mobile`
   - **リスク**: 低（公開情報に近い）

### スクショ共有された場合の事故点

**シナリオ**: ユーザーが設定画面をスクショして外部共有

**露出する情報**:
1. ✅ バージョン: `1.0.31` （問題なし）
2. 🔴 Face API URL: `https://face-gate-prod.bme-service.monster`
3. 🔴 GS API URL: `https://api-gate-prod.bme-service.monster`
4. 🔴 Auth Issuer: `https://auth-gate.bme-service.monster/realms/mcd3`
5. 🟡 Auth Audience: `mc-gate`
6. 🟡 Auth Client ID: `mc-gate-mobile`
7. 🟢 Update ID: `150a488b`（一部のみ、問題なし）
8. 🟢 配信チャンネル: `production`（問題なし）

**影響**:
- 攻撃者が内部API構成を把握
- Auth RealmやClient IDが判明
- **ただし**: API Keyやtokenがないため、直接攻撃は困難

---

## 6. 推奨修正（優先度付き）

### P0: productionでDebugタブ完全非表示

**対象**: `src/app/(tabs)/_layout.tsx`

**実装案**:

```typescript
// Line 1に追加
import Constants from "expo-constants";

export default function TabsLayout() {
  // 環境判定
  const appEnv = Constants.expoConfig?.extra?.appEnv || "development";
  const isProduction = appEnv === "production";

  return (
    <Tabs {...}>
      {/* 既存タブ */}
      <Tabs.Screen name="home" {...} />
      <Tabs.Screen name="auth" {...} />
      {/* ... */}

      {/* デバッグタブ: production では非表示 */}
      {!isProduction && (
        <>
          <Tabs.Screen name="debug" {...} />
          <Tabs.Screen name="vision-test" {...} />
        </>
      )}
    </Tabs>
  );
}
```

**効果**:
- ✅ production ビルドでタブが物理的に存在しない
- ✅ ルーティング自体が登録されない（deep link でもアクセス不可）
- ✅ 誤タップや情報露出のリスク完全ゼロ

**必要な作業**:
1. `_layout.tsx` 修正
2. git コミット
3. production ビルド作成
4. EAS Update 配信

---

### P1: 設定画面の内部URL表示を条件分岐

**対象**: `src/app/(tabs)/settings.tsx`

**実装案A（完全非表示）**:

```typescript
// Line 664以降を修正
{/* アプリ情報 & EAS Update */}
<View style={styles.section}>
  <Text style={styles.sectionTitle}>アプリ情報</Text>
  <View style={styles.card}>
    <View style={styles.row}>
      <Text style={styles.label}>バージョン</Text>
      <Text style={styles.value}>{updateInfo.currentVersion}</Text>
    </View>

    {/* 内部URL: production では非表示 */}
    {appEnv !== "production" && (
      <>
        <View style={styles.row}>
          <Text style={styles.label}>Face API URL</Text>
          <Text style={[styles.value, styles.monospace]} numberOfLines={2}>
            {Constants.expoConfig?.extra?.apiFaceApi || "未設定"}
          </Text>
        </View>
        {/* 以下同様 */}
      </>
    )}

    {/* Update情報は継続表示 */}
    {Updates.isEnabled ? (...) : (...)}
  </View>
</View>
```

**実装案B（hidden gesture）**:

```typescript
// バージョン表示を7回タップで隠しメニュー表示
const [tapCount, setTapCount] = useState(0);
const [showDebugInfo, setShowDebugInfo] = useState(false);

const handleVersionTap = () => {
  const newCount = tapCount + 1;
  setTapCount(newCount);

  if (newCount >= 7) {
    setShowDebugInfo(true);
    Alert.alert("デバッグ情報", "内部URL表示を有効化しました");
    setTapCount(0);
  }
};

// ...

<TouchableOpacity onPress={handleVersionTap}>
  <View style={styles.row}>
    <Text style={styles.label}>バージョン</Text>
    <Text style={styles.value}>{updateInfo.currentVersion}</Text>
  </View>
</TouchableOpacity>

{/* 内部URL: hidden gestureで有効化 */}
{(appEnv !== "production" || showDebugInfo) && (...)}
```

**推奨**: **実装案A（完全非表示）**
- production では内部URL一切表示しない
- 必要な場合はlogcatやSentryで確認

---

### P1: hidden debug（必要なら）＋管理者ガード

**対象**: デバッグ機能への緊急アクセス

**実装案**:

```typescript
// src/app/(tabs)/_layout.tsx

// 隠しデバッグモードの状態管理
import { useAppStore } from "../store/appStore";

export default function TabsLayout() {
  const { isDebugModeEnabled } = useAppStore();
  const appEnv = Constants.expoConfig?.extra?.appEnv || "development";
  const isProduction = appEnv === "production";

  // デバッグタブ表示条件
  const showDebugTabs = !isProduction || isDebugModeEnabled;

  return (
    <Tabs {...}>
      {/* 既存タブ */}
      {showDebugTabs && (
        <>
          <Tabs.Screen name="debug" {...} />
          <Tabs.Screen name="vision-test" {...} />
        </>
      )}
    </Tabs>
  );
}
```

```typescript
// src/app/(tabs)/settings.tsx

// 設定画面でバージョンを7回タップ → PINコード入力
const handleEnableDebugMode = () => {
  Alert.prompt(
    "管理者モード",
    "デバッグ機能を有効化するにはPINコードを入力してください",
    [
      { text: "キャンセル", style: "cancel" },
      {
        text: "確認",
        onPress: (pin) => {
          if (pin === "1234") {  // 🚨 実際はSecureStoreに保存したPINと照合
            useAppStore.getState().setDebugModeEnabled(true);
            Alert.alert("有効化", "デバッグ機能を有効化しました。アプリを再起動してください。");
          } else {
            Alert.alert("エラー", "PINコードが正しくありません");
          }
        },
      },
    ],
    "secure-text"
  );
};
```

**効果**:
- ✅ production では通常時デバッグタブ非表示
- ✅ 緊急時のみ管理者がPIN入力で有効化
- ✅ 再起動後に反映（タブ追加）

**デメリット**:
- 実装コストが高い
- PINコード管理が必要

**推奨**: **P1の必要性は低い**
- production では完全非表示（P0）で十分
- 緊急時は logcat/Sentry/再ビルドで対応

---

### P2: 文言/ログのredaction/テレメトリ

**対象**: `settings.tsx` Line 370-374

**現状**:
```typescript
console.log(`[DEBUG] GS API URL: ${apiBaseGs}`);
console.log(`[DEBUG] Workers API URL: ${workersApiUrl}`);
console.log(`[DEBUG] API Key: ${apiGsApiKey.substring(0, 20)}...`);  // ← API keyの一部露出
```

**修正案**:

```typescript
// API keyは完全にマスク
console.log(`[DEBUG] GS API URL: ${apiBaseGs}`);
console.log(`[DEBUG] Workers API URL: ${workersApiUrl}`);
console.log(`[DEBUG] API Key: ${apiGsApiKey ? "[REDACTED]" : "NOT SET"}`);
```

**または**: production では console.log 自体を削除

```typescript
if (appEnv !== "production") {
  console.log(`[DEBUG] GS API URL: ${apiBaseGs}`);
  console.log(`[DEBUG] Workers API URL: ${workersApiUrl}`);
  console.log(`[DEBUG] API Key: ${apiGsApiKey.substring(0, 20)}...`);
}
```

---

## 7. 最小改修パッチ（即座実施可能）

### パッチ内容

**ファイル**: `src/app/(tabs)/_layout.tsx`

```diff
 // ==========================================
 // タブレイアウト
 // ==========================================

 import { Tabs } from "expo-router";
 import { Ionicons } from "@expo/vector-icons";
 import { tokens } from "@mc-gate/ui-kit";
+import Constants from "expo-constants";

 export default function TabsLayout() {
+  // 環境判定: production ではデバッグタブを非表示
+  const appEnv = Constants.expoConfig?.extra?.appEnv || "development";
+  const isProduction = appEnv === "production";
+
   return (
     <Tabs
       screenOptions={{
         tabBarActiveTintColor: tokens.color.primary,
         tabBarInactiveTintColor: tokens.color.text.secondary,
         headerStyle: {
           backgroundColor: tokens.color.primary,
         },
         headerTintColor: tokens.color.text.inverse,
         headerTitleStyle: {
           fontWeight: "600",
         },
       }}
     >
       <Tabs.Screen
         name="home"
         options={{
           title: "ホーム",
           tabBarIcon: ({ color, size }) => (
             <Ionicons name="home" size={size} color={color} />
           ),
         }}
       />
       <Tabs.Screen
         name="auth"
         options={{
           title: "認証",
           tabBarIcon: ({ color, size }) => (
             <Ionicons name="scan" size={size} color={color} />
           ),
           unmountOnBlur: true,
         }}
       />
       <Tabs.Screen
         name="face-registration"
         options={{
           title: "顔登録",
           tabBarIcon: ({ color, size }) => (
             <Ionicons name="person-add" size={size} color={color} />
           ),
           unmountOnBlur: true,
         }}
       />
       <Tabs.Screen
         name="history"
         options={{
           title: "履歴",
           tabBarIcon: ({ color, size}) => (
             <Ionicons name="list" size={size} color={color} />
           ),
         }}
       />
       <Tabs.Screen
         name="settings"
         options={{
           title: "設定",
           tabBarIcon: ({ color, size }) => (
             <Ionicons name="settings" size={size} color={color} />
           ),
         }}
       />
-      <Tabs.Screen
-        name="debug"
-        options={{
-          title: "デバッグ",
-          tabBarIcon: ({ color, size }) => (
-            <Ionicons name="bug" size={size} color={color} />
-          ),
-        }}
-      />
-      <Tabs.Screen
-        name="vision-test"
-        options={{
-          title: "カメラテスト",
-          tabBarIcon: ({ color, size }) => (
-            <Ionicons name="camera" size={size} color={color} />
-          ),
-          unmountOnBlur: true,
-        }}
-      />
+      {/* デバッグタブ: production では非表示 */}
+      {!isProduction && (
+        <>
+          <Tabs.Screen
+            name="debug"
+            options={{
+              title: "デバッグ",
+              tabBarIcon: ({ color, size }) => (
+                <Ionicons name="bug" size={size} color={color} />
+              ),
+            }}
+          />
+          <Tabs.Screen
+            name="vision-test"
+            options={{
+              title: "カメラテスト",
+              tabBarIcon: ({ color, size }) => (
+                <Ionicons name="camera" size={size} color={color} />
+              ),
+              unmountOnBlur: true,
+            }}
+          />
+        </>
+      )}
     </Tabs>
   );
 }
```

### 適用手順

```bash
# 1. 修正
vim src/app/(tabs)/_layout.tsx

# 2. コミット
git add src/app/(tabs)/_layout.tsx
git commit -m "Security: Hide debug tabs in production

- Add appEnv detection in TabsLayout
- Conditionally render debug/vision-test tabs
- Production builds now hide debug functionality

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"

# 3. Production ビルド作成
npx eas-cli build --platform android --profile production --non-interactive

# 4. EAS Update 配信
npx eas-cli update --branch production --message "Security: Hide debug tabs"
```

---

## 8. 検証方法

### 修正前（現状）

```bash
# production ビルドでタブ数確認
# 期待: 7個（home, auth, face-registration, history, settings, debug, vision-test）
```

### 修正後

```bash
# production ビルド
npx eas-cli build --platform android --profile production --non-interactive

# タブ数確認
# 期待: 5個（home, auth, face-registration, history, settings のみ）
# debug と vision-test は非表示
```

### preview 環境での動作確認

```bash
# preview ビルド
npx eas-cli build --platform android --profile preview --non-interactive

# タブ数確認
# 期待: 7個（debug と vision-test も表示される）
```

---

## 9. まとめ

### 現状の評価

| 項目 | 評価 | 理由 |
|------|------|------|
| **セキュリティ** | 🟡 **中リスク** | デバッグタブが production で露出 |
| **SSOT準拠** | 🟢 **良好** | API URLs は環境変数で制御 |
| **情報露出** | 🟡 **中リスク** | 設定画面で内部URL表示 |
| **API Key管理** | 🟢 **良好** | 画面表示なし、SecureStore保存 |

### 必須対応（P0）

**✅ 即座に実施すべき修正**:
1. デバッグタブの production 非表示（`_layout.tsx`）

### 推奨対応（P1）

**⚠️ 時間があれば実施**:
1. 設定画面の内部URL表示を条件分岐（`settings.tsx`）

### オプション対応（P2）

**💡 運用で回避可能**:
1. ログのredaction（`settings.tsx`）

---

**最終更新**: 2025-12-18
**作成者**: Claude (automated extraction)
**次のステップ**: P0修正 → production ビルド → EAS Update
