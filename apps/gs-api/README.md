# GS API Server

MCD3通門管理システム Gate Service API

## 概要

作業員マスタ管理とスキャンイベント受信を行うRESTful APIサーバーです。

## 技術スタック

- **Node.js** + **TypeScript**
- **Express**: Webフレームワーク
- **SQLite**: データベース (better-sqlite3)
- **CORS**: クロスオリジン対応

## セットアップ

### 1. 依存関係インストール

```bash
npm install
# または
pnpm install
```

### 2. 環境変数設定

`.env.example` をコピーして `.env` を作成:

```bash
cp .env.example .env
```

### 3. サーバー起動

```bash
# 開発環境（ホットリロード）
npm run dev

# ビルド
npm run build

# 本番起動
npm start
```

## API エンドポイント

### ヘルスチェック

```
GET /health
```

レスポンス:
```json
{
  "status": "ok",
  "timestamp": "2025-11-14T10:00:00Z",
  "version": "1.0.0"
}
```

### 作業員マスタ取得

```
GET /api/workers
Headers: X-API-Key: {api_key}
```

クエリパラメータ:
- `updatedAfter`: ISO8601形式の日時（増分同期用）
- `limit`: 取得件数上限（デフォルト: 1000）
- `offset`: オフセット（デフォルト: 0）

レスポンス:
```json
{
  "workers": [...],
  "total": 100,
  "updatedAt": "2025-11-14T10:00:00Z"
}
```

### スキャンイベント受信

```
POST /api/events
Headers: X-API-Key: {api_key}
Content-Type: application/json
```

リクエストボディ:
```json
{
  "id": "uuid",
  "projectId": "PRJ001",
  "personId": "W001",
  "method": "QR",
  "gateMode": "IN",
  "decidedMode": "IN",
  "occurredAt": "2025-11-14T09:30:00Z",
  "ruleResult": {
    "action": "allow",
    "messages": ["MSG001"],
    "sendToCcus": true,
    "includeInGs": true
  },
  "transport": {
    "status": "pending",
    "attempts": 0,
    "idempotencyKey": "PRJ001-W001-1731574200000"
  }
}
```

レスポンス（201 Created）:
```json
{
  "success": true,
  "id": "uuid",
  "message": "Event received successfully"
}
```

### イベント履歴取得

```
GET /api/projects/:projectId/events
Headers: X-API-Key: {api_key}
```

クエリパラメータ:
- `dateFrom`: 開始日時（ISO8601）
- `dateTo`: 終了日時（ISO8601）
- `decidedMode`: フィルタ（IN or OUT）
- `limit`: 取得件数（デフォルト: 100）
- `offset`: オフセット（デフォルト: 0）

### 統計情報取得

```
GET /api/projects/:projectId/stats
Headers: X-API-Key: {api_key}
```

クエリパラメータ:
- `date`: 基準日（デフォルト: 今日）

レスポンス:
```json
{
  "todayIn": 25,
  "todayOut": 18,
  "currentInSite": 7
}
```

## 認証

### API Key認証

以下のいずれかの方法でAPIキーを送信:

1. `X-API-Key` ヘッダー:
```bash
curl -H "X-API-Key: development-api-key-12345" http://localhost:7070/api/workers
```

2. `Authorization: Bearer` ヘッダー:
```bash
curl -H "Authorization: Bearer development-api-key-12345" http://localhost:7070/api/workers
```

### デフォルトAPIキー

開発環境: `development-api-key-12345`

本番環境: 環境変数 `API_KEY` で設定

## データベース

### スキーマ

- **projects**: プロジェクトマスタ
- **workers**: 作業員マスタ
- **scan_events**: スキャンイベント履歴

### 初期データ

サーバー起動時に自動的に以下が作成されます:

- デフォルトプロジェクト（PRJ001）
- ダミー作業員5名（W001〜W005）

## 開発

### 型チェック

```bash
npm run type-check
```

### ビルド

```bash
npm run build
```

出力先: `dist/`

## トラブルシューティング

### ポート7070が使用中

別のプロセスを確認:
```bash
lsof -i :7070
```

停止:
```bash
kill <PID>
```

### データベースをリセット

```bash
rm gs.db
npm run dev
```

## ライセンス

UNLICENSED
