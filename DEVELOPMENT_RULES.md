# Development Rules: 再利用可能なベストプラクティス

**作成日**: 2026-01-08
**目的**: 今回の開発で学んだ失敗・成功パターンをルール化し、次の機能開発に活かす
**更新ポリシー**: 新しい知見が得られるたびに追記する（削除しない）

---

## 🎯 このドキュメントの使い方

### いつ読むべきか
- 新しい機能を実装する前
- バグが発生したとき
- コードレビュー時
- リファクタリング前

### 各ルールの構造
1. **ルール**: 何をすべきか/すべきでないか
2. **理由**: なぜそのルールが必要か
3. **失敗例**: 実際に発生した問題
4. **成功例**: 正しい実装方法
5. **検出方法**: どうやって違反を見つけるか

---

## 📋 ルール一覧（Category別）

### Category 1: React Native UI/UX

#### Rule 1.1: 表示専用Overlayは必ず `pointerEvents="none"`

**ルール**:
```typescript
// ❌ NG: オーバーレイがタッチイベントをブロックする
<View style={styles.overlay}>
  <Text>ガイドメッセージ</Text>
</View>

// ✅ OK: タッチイベントが下のボタンに届く
<View style={styles.overlay} pointerEvents="none">
  <Text>ガイドメッセージ</Text>
</View>
```

**理由**:
- React Nativeでは子要素がデフォルトで `pointerEvents="auto"`
- 表示専用の要素（テキスト、カード）が下のインタラクティブ要素（ボタン）を覆うと、タッチイベントがブロックされる
- ユーザーには「ボタンが見えるのに押せない」という混乱を引き起こす

**失敗例** (実際に発生):
```typescript
// apps/mobile/src/app/(tabs)/face-registration.tsx (修正前)
<Camera>
  <View style={styles.overlay}>
    <View style={styles.guideMessageCard}>  {/* ← これがボタンをブロック */}
      <Text>顔をフレーム内に入れてください</Text>
    </View>
    <View style={styles.buttons}>
      <Button title="登録" onPress={handleRegister} />  {/* ← 押せない！ */}
    </View>
  </View>
</Camera>
```

**成功例**:
```typescript
// apps/mobile/src/app/(tabs)/face-registration.tsx (修正後)
<View style={styles.cameraContainer}>
  <Camera />
  <View style={styles.overlay} pointerEvents="none">
    <View style={styles.guideMessageCard} pointerEvents="none">
      <Text>顔をフレーム内に入れてください</Text>
    </View>
  </View>
  <View style={styles.buttons}>
    <Button title="登録" onPress={handleRegister} />  {/* ← 押せる！ */}
  </View>
</View>
```

**検出方法**:
```bash
# 表示専用のView要素で pointerEvents が設定されていない箇所を検索
grep -n "style={styles\.\(overlay\|card\|message\)}" apps/mobile/src/**/*.tsx | \
  grep -v "pointerEvents"
```

**適用対象**:
- ガイドメッセージカード
- 結果表示カード
- 半透明の背景オーバーレイ
- ステータスバー・ナビゲーションバー（表示のみ）

**関連コミット**: `4494a51`

---

#### Rule 1.2: `react-native-vision-camera` の `Camera` コンポーネントは自己完結型

**ルール**:
```typescript
// ❌ NG: Camera が子要素を持つ
<Camera device={device} frameProcessor={frameProcessor}>
  <View style={styles.overlay}>...</View>
</Camera>

// ✅ OK: Camera は自己完結型、オーバーレイは兄弟要素
<View style={styles.container}>
  <Camera device={device} frameProcessor={frameProcessor} />
  <View style={styles.overlay}>...</View>
</View>
```

**理由**:
- `react-native-vision-camera` v4以降では、`Camera` コンポーネントに子要素を持たせると Frame Processor の実行コンテキストが破壊される
- 顔検出などの Frame Processor コールバックが呼ばれなくなる
- React Native 0.81 + New Architecture では特に厳格

**失敗例** (実際に発生):
```typescript
// face-registration.tsx (修正前)
<Camera ref={cameraRef} device={device} frameProcessor={frameProcessor}>
  <View style={styles.overlay}>  {/* ← Frame Processor が動かない */}
    <View style={styles.guideFrame} />
  </View>
</Camera>
```

**成功例**:
```typescript
// face-registration.tsx (修正後) & auth.tsx (リファレンス実装)
<View style={styles.cameraContainer}>
  {/* Camera は自己完結型 */}
  <Camera
    ref={cameraRef}
    style={StyleSheet.absoluteFill}
    device={device}
    isActive={true}
    frameProcessor={frameProcessor}
  />

  {/* オーバーレイは兄弟要素として配置 */}
  <View style={[StyleSheet.absoluteFillObject, styles.overlay]}>
    <View style={styles.guideFrame} />
  </View>
</View>
```

**検出方法**:
```bash
# Camera コンポーネントが自己完結型タグでない箇所を検索
grep -A 3 "<Camera" apps/mobile/src/**/*.tsx | grep -v "/>"
```

**適用対象**:
- すべての `react-native-vision-camera` 使用箇所
- Frame Processor を使う画面

**参照実装**: `apps/mobile/src/app/(tabs)/auth.tsx:591-625`

---

### Category 2: TypeScript型安全性

#### Rule 2.1: API Key は必ず `string | undefined` として扱う

**ルール**:
```typescript
// ❌ NG: 空文字列やオブジェクトを許容
const apiKey = config.apiKey || {};
const apiKey = config.apiKey || null;

// ✅ OK: string型ガード + fallback
const apiKey = (typeof config.apiKey === "string" && config.apiKey)
  ? config.apiKey
  : "development-fallback-key";
```

**理由**:
- API Key が空文字列 `""` の場合、falsy判定で `|| {}` や `|| null` が評価される
- オブジェクトや `null` がAPI呼び出しに渡されると、実行時エラーやサーバーエラーが発生
- TypeScriptの型チェックでは検出できない（`string | undefined` → `string | object` の暗黙変換）

**失敗例** (実際に発生):
```typescript
// settings.tsx (修正前)
const apiGsApiKey = Constants.expoConfig?.extra?.apiGsApiKey || {};
// → apiGsApiKey が空文字列の場合、{} がセットされる
// → Worker Sync API呼び出しで "[object Object]" エラー
```

**成功例**:
```typescript
// settings.tsx (修正後)
const apiGsApiKey = Constants.expoConfig?.extra?.apiGsApiKey;
const effectiveApiKey = (typeof apiGsApiKey === "string" && apiGsApiKey)
  ? apiGsApiKey
  : "development-api-key-12345";

// または明示的なガード
if (!apiGsApiKey || typeof apiGsApiKey !== "string") {
  Alert.alert("設定エラー", "API Keyが正しく設定されていません");
  return;
}
```

**検出方法**:
```bash
# || {} や || null を使っているAPI Key関連の箇所を検索
grep -n "apiKey.*||.*{}" apps/mobile/src/**/*.tsx
grep -n "apiKey.*||.*null" apps/mobile/src/**/*.tsx
```

**適用対象**:
- すべての API Key 読み込み
- 環境変数から取得する設定値
- `Constants.expoConfig?.extra` 配下のすべての値

**関連SSOT**: `SSOT_WORKER_SYNC_FACE_AUTH_E2E.md` - Test Phase 1

---

#### Rule 2.2: SQLite `runAsync()` のパラメータは必ず型チェック

**ルール**:
```typescript
// ❌ NG: パラメータに undefined が混入する可能性
await db.runAsync(`INSERT INTO events VALUES (?, ?)`, [event.id, event.data]);

// ✅ OK: パラメータを事前検証
const params = [event.id, event.data].filter(p => p !== undefined && p !== null);
await db.runAsync(`INSERT INTO events VALUES (?, ?)`, params);

// または ✅ OK: execAsync でSQL文字列を直接実行
const sql = `INSERT INTO events VALUES ('${event.id}', '${event.data}')`;
await db.execAsync(sql);
```

**理由**:
- expo-sqlite の新アーキテクチャ（React Native 0.81）では、`runAsync()` のパラメータ配列がKotlin型に変換される
- `undefined` や `null` が混入すると、Kotlin型変換エラー `[runAsync] Cannot convert '[object Object]' to a Kotlin type` が発生
- `execAsync()` はパラメータ配列を使わないため、型変換エラーを回避できる

**失敗例** (実際に発生):
```typescript
// seedData.ts (修正前)
await db.runAsync(
  `INSERT INTO scan_events (...) VALUES (?, ?, ?, ...)`,
  [
    event.id,
    event.projectId,  // ← undefined が混入する可能性
    event.personId,
    // ...
  ]
);
// → Kotlin型変換エラー発生
```

**成功例**:
```typescript
// seedData.ts (修正後) - execAsync 方式
function escapeSQLString(str: string | null | undefined): string {
  if (str === null || str === undefined) return "NULL";
  return `'${String(str).replace(/'/g, "''")}'`;
}

const sql = `INSERT INTO scan_events (...)
  VALUES (
    ${escapeSQLString(event.id)},
    ${escapeSQLString(event.projectId)},
    ${escapeSQLString(event.personId)},
    ...
  );`;
await db.execAsync(sql);
```

**検出方法**:
```bash
# runAsync でパラメータ配列を使っている箇所を検索
grep -n "runAsync.*\[" apps/mobile/src/**/*.ts
```

**適用対象**:
- すべての SQLite INSERT/UPDATE 操作
- ダミーデータ生成
- バッチ処理

**関連SSOT**: CLAUDE.md - expo-sqlite runAsync Kotlin型変換エラーの解決

---

### Category 3: 認証・セキュリティ

#### Rule 3.1: 403 Forbidden でログアウトしてはいけない

**ルール**:
```typescript
// ❌ NG: 403でもログアウトしてしまう
if (error.response?.status === 401 || error.response?.status === 403) {
  logout();
}

// ✅ OK: 401のみログアウト、403はエラー表示のみ
if (error.response?.status === 401) {
  console.error("[Auth] Session expired, logging out");
  logout();
}
if (error.response?.status === 403) {
  console.warn("[Auth] Access forbidden (insufficient permissions)");
  Alert.alert("権限不足", "この操作を実行する権限がありません。");
}
```

**理由**:
- **401 Unauthorized**: セッション切れ・トークン無効 → ログアウトが正しい
- **403 Forbidden**: 認証は通ったが権限不足 → ログアウトは不要、エラー表示のみ
- 403でログアウトすると、権限不足のたびに再ログインが必要になる（UX悪化）

**失敗例**:
```typescript
// index.tsx (将来的に修正予定)
if (error.response?.status === 401 || error.response?.status === 403) {
  console.error("[Auth] Session expired, logging out");
  logout();
}
// → 403（権限不足）でもログアウトしてしまう
```

**成功例**:
```typescript
// 推奨実装
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // セッション切れ → ログアウト
      console.error("[Auth] Session expired (401), logging out");
      logout();
    } else if (error.response?.status === 403) {
      // 権限不足 → エラー表示のみ
      console.warn("[Auth] Access forbidden (403)");
      Alert.alert(
        "権限不足",
        "この操作を実行する権限がありません。管理者に連絡してください。"
      );
    }
    return Promise.reject(error);
  }
);
```

**検出方法**:
```bash
# 403 でログアウトしている箇所を検索
grep -n "403.*logout" apps/mobile/src/**/*.tsx
```

**適用対象**:
- すべてのHTTPインターセプター
- API呼び出しのエラーハンドリング

**参考**: `PREVIEW_TO_PRODUCTION_DIFF.md` - Security Settings

---

#### Rule 3.2: 本番環境では `useMockAuth` を強制的に `false` にする

**ルール**:
```typescript
// ❌ NG: 環境変数だけで制御（意図しない有効化のリスク）
useMockAuth: process.env.USE_MOCK_AUTH === "true",

// ✅ OK: 本番環境では強制的に false
useMockAuth: process.env.USE_MOCK_AUTH === "true" && (process.env.APP_ENV !== "production"),
```

**理由**:
- モック認証が本番環境で有効になると、誰でもログインできてしまう（重大なセキュリティリスク）
- 環境変数の設定ミスで意図せず有効化される可能性がある
- 本番では OAuth 認証のみを許可すべき

**成功例**:
```typescript
// app.config.ts (すでに安全)
extra: {
  useMockAuth: process.env.USE_MOCK_AUTH === "true" && (process.env.APP_ENV !== "production"),
}
```

**検出方法**:
```bash
# useMockAuth の設定を確認
grep -n "useMockAuth" apps/mobile/app.config.ts
```

**適用対象**:
- `app.config.ts` の `useMockAuth` 設定
- 認証関連のすべての環境変数

**参考**: CLAUDE.md - Claude Code 開発ルール

---

### Category 4: React Hooks

#### Rule 4.1: useEffect 依存配列に関数を入れる前に3秒考える

**ルール**:
```typescript
// ❌ NG: 関数をそのまま依存配列に入れる → 無限ループ
useEffect(() => {
  syncFromServer();
}, [syncFromServer]);  // syncFromServer は毎回新しい関数

// ✅ OK: useCallback でメモ化してから依存配列に入れる
const syncFromServer = useCallback(async () => {
  // ...
}, [dependency1, dependency2]);

useEffect(() => {
  syncFromServer();
}, [syncFromServer]);  // メモ化された関数なので安定
```

**理由**:
- 関数は毎回のレンダリングで新しいインスタンスが作成される
- 依存配列に入れると、useEffect が毎回実行される（無限ループ）
- `useCallback` でメモ化すれば、依存配列が変わらない限り同じ関数インスタンスが使われる

**失敗例** (潜在的リスク):
```typescript
// settings.tsx (要注意箇所)
const syncFromServer = async () => {
  // Worker Sync処理
};

useEffect(() => {
  syncFromServer();  // ← 初回のみ実行したいが...
}, [syncFromServer]);  // ← 毎回実行される！
```

**成功例**:
```typescript
// 推奨実装
const syncFromServer = useCallback(async () => {
  // Worker Sync処理
}, [apiClient, projectId]);  // 依存する値のみ

useEffect(() => {
  syncFromServer();
}, [syncFromServer]);  // 安定した関数参照

// または依存配列を空にする（初回のみ実行）
useEffect(() => {
  syncFromServer();
}, []);  // syncFromServer を依存配列に入れない
```

**検出方法**:
```bash
# useEffect の依存配列に関数名が含まれている箇所を検索
grep -A 3 "useEffect" apps/mobile/src/**/*.tsx | grep -E "\[.*[a-z]+\w*\]"
```

**適用対象**:
- すべての useEffect フック
- 非同期処理を含む関数

---

### Category 5: API設計

#### Rule 5.1: 開発用fallbackは必ず型安全に実装する

**ルール**:
```typescript
// ❌ NG: 型安全でないfallback
const apiKey = config.apiKey || "fallback-key";
const apiUrl = config.apiUrl || "http://localhost:7070";

// ✅ OK: 型ガード + 環境判定
const isDevelopment = __DEV__ || process.env.APP_ENV === "development";
const apiKey = (typeof config.apiKey === "string" && config.apiKey)
  ? config.apiKey
  : (isDevelopment ? "development-fallback-key" : null);

if (!apiKey) {
  throw new Error("API Key is required in production");
}
```

**理由**:
- 開発用fallbackが本番環境で使われると、誤った動作やセキュリティリスクが発生
- 型ガードがないと、空文字列 `""` の場合にfallbackが使われる
- 環境判定がないと、本番でもfallbackが有効になる

**成功例**:
```typescript
// settings.tsx (修正後)
const isDevelopment = __DEV__ || process.env.APP_ENV === "development";
const apiGsApiKey = Constants.expoConfig?.extra?.apiGsApiKey;
const effectiveApiKey = (typeof apiGsApiKey === "string" && apiGsApiKey)
  ? apiGsApiKey
  : (isDevelopment ? "development-api-key-12345" : null);

if (!effectiveApiKey) {
  Alert.alert("設定エラー", "API Keyが設定されていません。");
  return;
}
```

**検出方法**:
```bash
# fallback値を使っている箇所で環境判定がない箇所を検索
grep -n "||.*\".*\"" apps/mobile/src/**/*.tsx | grep -v "__DEV__" | grep -v "APP_ENV"
```

**適用対象**:
- すべてのAPI Key
- すべてのAPI URL
- すべての環境依存設定

**参考**: `PREVIEW_TO_PRODUCTION_DIFF.md` - API Keys 変更

---

## 🔍 コードレビューチェックリスト

新しいプルリクエストをレビューする際、以下をチェック：

### UI/UX
- [ ] 表示専用のView要素に `pointerEvents="none"` が設定されているか
- [ ] `Camera` コンポーネントが自己完結型タグになっているか
- [ ] オーバーレイが `StyleSheet.absoluteFillObject` で配置されているか

### 型安全性
- [ ] API Key に `|| {}` や `|| null` が使われていないか
- [ ] SQLite `runAsync()` のパラメータに `undefined` が混入しないか
- [ ] 環境変数の読み込みで型ガードがあるか

### 認証・セキュリティ
- [ ] 403 でログアウトしていないか（401のみ）
- [ ] 本番環境で `useMockAuth` が強制的に `false` になっているか
- [ ] 開発用fallbackに環境判定があるか

### React Hooks
- [ ] useEffect 依存配列に関数が直接入っていないか
- [ ] `useCallback` でメモ化されているか
- [ ] 無限ループのリスクがないか

### API設計
- [ ] 開発用fallbackが型安全に実装されているか
- [ ] 本番環境でfallbackが使われないように保護されているか

---

## 📚 参考ドキュメント

- `SSOT_WORKER_SYNC_FACE_AUTH_E2E.md`: テスト結果の真実
- `PREVIEW_TO_PRODUCTION_DIFF.md`: 環境差分の真実
- `CLAUDE.md`: EAS Build & Update ガイドライン
- `docs/SECURITY_POLICY_UI.md`: UI Security Policy

---

## 🔄 更新履歴

### 2026-01-08: 初版作成
- Rule 1.1: pointerEvents="none"
- Rule 1.2: Camera 自己完結型
- Rule 2.1: API Key 型安全性
- Rule 2.2: SQLite runAsync パラメータ検証
- Rule 3.1: 403 ログアウト禁止
- Rule 3.2: useMockAuth 本番強制false
- Rule 4.1: useEffect 依存配列
- Rule 5.1: 開発用fallback型安全性

---

**Document Version**: 1.0
**Last Updated**: 2026-01-08
**Status**: 🟢 Active（継続更新）
**Next Review**: 次の機能開発開始時
