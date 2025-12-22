# Mobile ↔ API Authentication Boundary

**Last Updated**: 2025-12-22
**Scope**: モバイルアプリの認証境界とAPI呼び出しセキュリティポリシー

---

## 原則: 認証済み状態でのみAPIを呼ぶ

Production環境では、**未認証状態でAPIが呼ばれることは構造的に不可能**である必要があります。

---

## 1. API呼び出し条件

### 必須要件

すべてのAPI呼び出しは以下の条件を満たす必要があります:

| 項目 | 要件 | 違反時の動作 |
|------|------|-------------|
| **Access Token** | 有効なJWTトークン必須 | API呼び出しを中止、エラー表示 |
| **Authorization Header** | `Bearer <token>` 形式で設定 | HTTP 401 Unauthorized |
| **Token有効性** | 期限内かつ署名が正しい | HTTP 401 Unauthorized |

### API呼び出し箇所と実装

| ファイル | 関数 | Authorization Header設定 | Token検証 |
|---------|------|--------------------------|-----------|
| `appStore.ts` | `fetchProjects()` | ✅ `fetchUserProjects(user.token)` | ✅ user null チェック |
| `projectApi.ts` | `fetchUserProjects()` | ✅ `Authorization: Bearer ${token}` | ✅ token パラメータ必須 |
| `useWorkers.ts` | `fetchWorkersFromServer()` | ✅ `Authorization: Bearer ${bearerToken}` | ✅ bearerToken パラメータ必須 |
| `settings.tsx` | `handleWorkerSync()` | ✅ `user.token` を渡す | ✅ user null チェック |

---

## 2. Token失効時の遷移図

```
[ユーザー操作]
     |
     v
[API呼び出し]
     |
     v
[Token検証]
     |
     +-- Token有効 --> [API実行] --> [正常レスポンス]
     |
     +-- Token無効 (401/403)
           |
           v
      [エラー検出]
           |
           v
      [logout()実行]
           |
           +-- SecureStore.clearTokens()
           |
           +-- clearProjectsCache()
           |
           +-- ユーザー状態リセット
           |
           v
      [index.tsx へ遷移]
           |
           v
      [ログイン画面表示]
```

---

## 3. 未認証でAPIを叩けない理由

### 構造的保護

#### レイヤー1: コード設計

- `fetchProjects()`: userがnullなら早期リターン (appStore.ts:222-224)
  ```typescript
  if (!user) {
    console.warn("[AppStore] Cannot fetch projects: user not authenticated");
    return;
  }
  ```

- `fetchUserProjects()`: tokenパラメータ必須 (projectApi.ts:26)
  ```typescript
  export async function fetchUserProjects(token: string)
  ```

- `handleWorkerSync()`: userがnullならエラーAlert (settings.tsx:361-364)
  ```typescript
  if (!user?.token) {
    Alert.alert("エラー", "認証情報が見つかりません。再度ログインしてください。");
    return;
  }
  ```

#### レイヤー2: 実行時エラーハンドリング

- 401/403レスポンス検出時に自動logout

  **appStore.ts** (Lines 246-252):
  ```typescript
  if (error instanceof ApiError &&
      (error.kind === "UNAUTHORIZED" || error.kind === "FORBIDDEN")) {
    console.warn("[AppStore] Authentication failed - forcing logout");
    await get().logout();
    return;
  }
  ```

  **settings.tsx** (Lines 410-419):
  ```typescript
  if (error?.status === 401 || error?.status === 403) {
    console.warn("[Settings] Authentication failed during worker sync - forcing logout");
    Alert.alert(
      "認証エラー",
      "認証情報が無効です。再度ログインしてください。",
      [{ text: "OK", onPress: () => logout() }]
    );
    return;
  }
  ```

#### レイヤー3: CIチェック

- `.github/workflows/ci.yml` でAuthorization Header無しfetchを検出 (今後追加)

---

## 4. logout()の責務

`appStore.ts:109-126` に一元化されています。

### 処理内容

1. **Keycloakからのログアウト**
   - ユーザーのidTokenを使用してKeycloak logout endpointを呼び出し

2. **トークンの完全削除**
   - `clearTokens()`: SecureStoreからaccess/refresh/idTokenを削除

3. **プロジェクトキャッシュの削除**
   - `clearProjectsCache()`: SecureStoreからprojects cacheを削除

4. **アプリケーション状態のリセット**
   ```typescript
   set({
     user: null,
     isAuthenticated: false,
     currentProject: null,
     availableProjects: [],
   });
   ```

### 呼び出し箇所

- `appStore.ts:153`: Token refresh失敗時
- `appStore.ts:250`: API 401/403エラー時
- `settings.tsx:290`: ユーザーの明示的ログアウト操作
- `settings.tsx:416`: Workers API 401/403エラー時

---

## 5. 401/403ハンドリングフロー

### パターンA: appStore経由のAPI呼び出し (fetchProjects)

```
fetchProjects()
  |
  v
fetchUserProjects(user.token)
  |
  v
HTTP 401/403
  |
  v
ApiError UNAUTHORIZED/FORBIDDEN
  |
  v
appStore catch block
  |
  v
logout() 自動実行
  |
  v
index.tsx へ遷移
```

### パターンB: 設定画面経由のAPI呼び出し (Workers同期)

```
handleWorkerSync()
  |
  v
syncFromServer(apiUrl, apiKey, user.token)
  |
  v
fetchWorkersFromServer(...)
  |
  v
HTTP 401/403
  |
  v
Error with status=401/403
  |
  v
settings.tsx catch block
  |
  v
logout() 自動実行 + Alert表示
  |
  v
index.tsx へ遷移
```

---

## 6. 将来の拡張

### API呼び出し箇所を追加する際の必須チェックリスト

新しいAPI呼び出しを追加する場合は、以下を必ず実施してください:

- [ ] Authorization Header を `Bearer ${token}` 形式で設定
- [ ] token パラメータを必須にする (TypeScript型で強制)
- [ ] token が null/undefined の場合は早期リターン
- [ ] 401/403エラーを catch して `logout()` を呼ぶ
- [ ] CIチェック (.github/workflows/ci.yml) がパスすることを確認

### CI チェックの追加 (将来実装)

```yaml
- name: Security Check - Authorization Header
  run: |
    # fetch() calls without Authorization header
    FOUND=$(grep -rn "fetch(" apps/mobile/src --include="*.ts" --include="*.tsx" \
      | grep -v "Authorization" \
      | grep -v "test" \
      | grep -v "mock" || true)

    if [ -n "$FOUND" ]; then
      echo "❌ fetch() without Authorization header found:"
      echo "$FOUND"
      exit 1
    fi

    echo "✅ All fetch() calls include Authorization header"
```

---

## 7. セキュリティ境界の検証

### 手動検証コマンド

```bash
# Authorization Header設定箇所を確認
grep -rn "Authorization.*Bearer" apps/mobile/src --include="*.ts" --include="*.tsx"

# token null チェック箇所を確認
grep -rn "if (!user" apps/mobile/src --include="*.ts" --include="*.tsx"

# logout() 呼び出し箇所を確認
grep -rn "logout()" apps/mobile/src --include="*.ts" --include="*.tsx"
```

### 期待される結果

- Authorization Header設定: 3箇所以上
- token null チェック: 2箇所以上
- logout() 呼び出し: 4箇所以上

---

## 8. 関連ドキュメント

- **認証フロー全体**: `apps/mobile/README.md` (未作成)
- **Keycloak設定**: `apps/gs-api/.env.production.example`
- **Token Manager**: `apps/mobile/src/services/tokenManager.ts`
- **API Error Handling**: `packages/core/src/utils/apiClient.ts`

---

**このドキュメントはセキュリティ境界の仕様書です。変更する場合はセキュリティレビューが必須です。**
