# Auth Login API 仕様書

## 概要

認証サーバー（Keycloak）を使用したログインAPIの仕様を定義します。

本仕様では、将来的なマルチプロジェクト対応のため、ログインレスポンスに `projects` フィールドと `defaultProjectId` を追加します。

---

## エンドポイント

### POST /auth/login

ユーザー認証を行い、アクセストークンとリフレッシュトークン、プロジェクト情報を返します。

---

## リクエスト

### Headers

| ヘッダー名 | 値 | 必須 | 説明 |
|-----------|-----|------|------|
| Content-Type | application/json | ✅ | JSON形式 |

### Body (JSON)

```json
{
  "username": "string",
  "password": "string"
}
```

| フィールド名 | 型 | 必須 | 説明 |
|-------------|-----|------|------|
| username | string | ✅ | ユーザーID |
| password | string | ✅ | パスワード |

### リクエスト例

```bash
curl -X POST https://api.example.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "user@example.com",
    "password": "password123"
  }'
```

---

## レスポンス

### 成功レスポンス (200 OK)

#### 現在の実装（モック）

```json
{
  "user": {
    "id": "user-1",
    "name": "山田太郎",
    "email": "user@example.com"
  },
  "tokens": {
    "accessToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": 3600
  }
}
```

#### 将来の実装（マルチプロジェクト対応）

```json
{
  "user": {
    "id": "user-1",
    "name": "山田太郎",
    "email": "user@example.com"
  },
  "tokens": {
    "accessToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": 3600
  },
  "projects": [
    {
      "projectId": "PRJ001",
      "name": "東京建設現場A",
      "role": "admin"
    },
    {
      "projectId": "PRJ002",
      "name": "大阪建設現場B",
      "role": "operator"
    }
  ],
  "defaultProjectId": "PRJ001"
}
```

### レスポンスフィールド説明

#### user オブジェクト

| フィールド名 | 型 | 説明 |
|-------------|-----|------|
| id | string | ユーザーの一意なID |
| name | string | ユーザーの表示名 |
| email | string | メールアドレス |

#### tokens オブジェクト

| フィールド名 | 型 | 説明 |
|-------------|-----|------|
| accessToken | string | JWT形式のアクセストークン |
| refreshToken | string | JWT形式のリフレッシュトークン |
| expiresIn | number | アクセストークンの有効期限（秒） |

#### projects 配列 （将来実装）

| フィールド名 | 型 | 説明 |
|-------------|-----|------|
| projectId | string | プロジェクトの一意なID |
| name | string | プロジェクト名 |
| role | string | ユーザーのロール（admin, operator, viewer） |

#### defaultProjectId （将来実装）

| フィールド名 | 型 | 説明 |
|-------------|-----|------|
| defaultProjectId | string | デフォルトで選択されるプロジェクトID |

---

## エラーレスポンス

### 401 Unauthorized - 認証失敗

```json
{
  "error": "invalid_credentials",
  "message": "ユーザー名またはパスワードが正しくありません"
}
```

### 500 Internal Server Error - サーバーエラー

```json
{
  "error": "internal_server_error",
  "message": "サーバーエラーが発生しました"
}
```

---

## 実装ステップ

### フェーズ1: 現在（モック実装）

- ✅ 基本的な認証機能
- ✅ JWT トークンの発行
- ✅ ユーザー情報の返却
- ❌ プロジェクト情報は未実装

### フェーズ2: マルチプロジェクト対応（将来実装）

**バックエンドチーム実装内容**:

1. **データベーススキーマ拡張**
   ```sql
   -- users テーブル（既存）
   CREATE TABLE users (
     id VARCHAR(255) PRIMARY KEY,
     name VARCHAR(255) NOT NULL,
     email VARCHAR(255) UNIQUE NOT NULL,
     password_hash VARCHAR(255) NOT NULL
   );

   -- projects テーブル（新規）
   CREATE TABLE projects (
     id VARCHAR(255) PRIMARY KEY,
     name VARCHAR(255) NOT NULL,
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
   );

   -- user_projects テーブル（新規）
   CREATE TABLE user_projects (
     user_id VARCHAR(255) REFERENCES users(id),
     project_id VARCHAR(255) REFERENCES projects(id),
     role VARCHAR(50) NOT NULL,  -- 'admin', 'operator', 'viewer'
     is_default BOOLEAN DEFAULT FALSE,
     PRIMARY KEY (user_id, project_id)
   );
   ```

2. **ログインAPIの拡張**
   ```typescript
   // 擬似コード
   async function login(username: string, password: string) {
     // 1. ユーザー認証
     const user = await authenticateUser(username, password);

     // 2. トークン発行
     const tokens = await generateTokens(user);

     // 3. プロジェクト情報取得（新規）
     const projects = await getUserProjects(user.id);
     const defaultProject = projects.find(p => p.isDefault) || projects[0];

     return {
       user,
       tokens,
       projects: projects.map(p => ({
         projectId: p.id,
         name: p.name,
         role: p.role
       })),
       defaultProjectId: defaultProject.id
     };
   }
   ```

3. **認可チェックの追加**
   - プロジェクトごとのアクセス権限チェック
   - ロールベースのアクセス制御（RBAC）
   - プロジェクト切り替え機能

**モバイルアプリ実装内容**:

1. **ログインレスポンス処理の拡張**
   ```typescript
   // apps/mobile/src/app/index.tsx
   const loginResponse = await loginWithOAuth();

   // プロジェクト情報を取得
   const { projects, defaultProjectId } = loginResponse;

   // デフォルトプロジェクトを設定
   const defaultProject = projects.find(p => p.projectId === defaultProjectId);
   setCurrentProject(defaultProject);

   // プロジェクト選択画面を表示（複数プロジェクトがある場合）
   if (projects.length > 1) {
     router.push("/select-project");
   } else {
     router.replace("/(tabs)/home");
   }
   ```

2. **プロジェクト選択画面の追加**
   - ユーザーがアクセス可能なプロジェクト一覧を表示
   - プロジェクトを選択すると、そのプロジェクトのデータを表示

3. **プロジェクト切り替え機能**
   - 設定画面からプロジェクトを切り替え可能
   - プロジェクト切り替え時はローカルデータベースを切り替え

---

## セキュリティ要件

### トークン管理

- ✅ アクセストークンは expo-secure-store に保存
- ✅ リフレッシュトークンも expo-secure-store に保存
- ✅ トークンの有効期限を確認し、期限切れの場合はリフレッシュ

### 通信セキュリティ

- ✅ 本番環境では HTTPS 通信を強制
- ✅ 開発環境では HTTP を許可（app.config.js で制御）

### 認証フロー

```
1. ユーザーがログイン画面でユーザー名とパスワードを入力
   ↓
2. モバイルアプリが POST /auth/login を呼び出し
   ↓
3. Keycloak サーバーが認証を実行
   ↓
4. 成功した場合、JWT トークンとプロジェクト情報を返却
   ↓
5. モバイルアプリがトークンを SecureStore に保存
   ↓
6. デフォルトプロジェクトを設定し、ホーム画面に遷移
```

---

## バックエンドチームへの調整事項

### 必須実装項目

1. **ログインAPIにprojects配列を追加**
   - 各プロジェクトのID、名前、ロールを返す

2. **defaultProjectIdを返す**
   - ユーザーのデフォルトプロジェクトを返す
   - デフォルトが設定されていない場合は最初のプロジェクトを返す

3. **プロジェクトアクセス権限の管理**
   - ユーザーがアクセス可能なプロジェクトのみを返す
   - ロール（admin, operator, viewer）を正しく設定

### 推奨実装項目

1. **プロジェクト切り替えAPI**
   ```
   POST /auth/switch-project
   {
     "projectId": "PRJ002"
   }
   ```
   - ユーザーのデフォルトプロジェクトを更新
   - 新しいプロジェクトのアクセストークンを返す

2. **プロジェクト一覧取得API**
   ```
   GET /projects
   ```
   - ユーザーがアクセス可能なプロジェクト一覧を返す

---

## まとめ

### 現在の状態

- ✅ 基本的な認証機能は実装済み
- ✅ JWT トークンの発行と管理は実装済み
- ❌ プロジェクト情報の返却は未実装

### 将来の拡張

- マルチプロジェクト対応
- プロジェクト切り替え機能
- ロールベースのアクセス制御

### バックエンドチームとの調整

- ログインAPIに `projects` フィールドを追加
- ログインAPIに `defaultProjectId` フィールドを追加
- プロジェクトアクセス権限の管理機能を実装

---

**最終更新**: 2025-11-25
**作成者**: Claude Code
**ステータス**: 設計完了、実装待ち
**関連ドキュメント**:
- CLAUDE.md
- docs/gs-api-architecture.md
- docs/oauth-implementation-summary.md
