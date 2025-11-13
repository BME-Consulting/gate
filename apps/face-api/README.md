# Face API Server

顔認証バックエンドAPIサーバー

## プロジェクト構成

```
apps/face-api/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # Expressサーバー起動
│   ├── routes/
│   │   ├── face.ts           # 顔認証エンドポイント
│   │   └── workers.ts        # 作業員マスタエンドポイント
│   ├── services/
│   │   ├── face-detection.ts # face-api.js統合
│   │   └── worker-service.ts # 作業員マスタCRUD
│   └── database/
│       └── sqlite.ts         # SQLite接続
└── README.md
```

## セットアップ

### 1. 依存関係のインストール

```bash
cd /volume2/Project/MCD3/TUMON/mc-gate/apps/face-api
npm install
```

### 2. 開発サーバー起動

```bash
npm run dev
```

サーバーは `http://localhost:8100` で起動します。

### 3. ビルド（本番用）

```bash
npm run build
npm start
```

## 認証

すべてのAPIエンドポイントは認証が必要です（ヘルスチェックを除く）。

### 開発環境

デフォルトのAPIキー: `development-api-key-12345`

```bash
curl -X POST http://localhost:8100/api/face/recognize \
  -H "X-API-Key: development-api-key-12345" \
  -H "Content-Type: application/json" \
  -d '{"imageData": "data:image/jpeg;base64,...", "threshold": 0.6}'
```

### 本番環境

環境変数 `API_KEY` を設定してください。

```bash
export API_KEY="your-secure-api-key-here"
npm start
```

**認証ヘッダーの形式**:
- `X-API-Key: your-api-key` または
- `Authorization: Bearer your-api-key`

## API エンドポイント

### ヘルスチェック（認証不要）

#### GET /health
サーバーの状態を確認します。

**レスポンス**:
```json
{
  "status": "ok",
  "timestamp": "2025-11-13T12:00:00.000Z"
}
```

### 顔認証API（認証必要）

#### POST /api/face/register
顔画像を登録します。

**リクエスト**:
```json
{
  "personId": "worker-123",
  "imageData": "data:image/jpeg;base64,..."
}
```

**レスポンス**:
```json
{
  "success": true,
  "personId": "worker-123",
  "embeddingDimensions": 128
}
```

#### POST /api/face/recognize
顔認識を行います。

**リクエスト**:
```json
{
  "imageData": "data:image/jpeg;base64,...",
  "threshold": 0.6
}
```

**レスポンス（認識成功）**:
```json
{
  "personId": "worker-123",
  "confidence": 0.95,
  "distance": 0.05,
  "workerInfo": {
    "name": "山田太郎",
    "company": "ABC建設",
    "ccusId": "12345"
  }
}
```

**レスポンス（認識失敗）**:
```json
{
  "personId": null,
  "confidence": 0,
  "distance": 0.75,
  "error": "No match found (closest distance: 0.750, threshold: 0.6)"
}
```

### 作業員マスタAPI（認証必要）

#### GET /api/workers
全作業員を取得します。

**ヘッダー**:
```
X-API-Key: your-api-key
```

**レスポンス**:
```json
{
  "workers": [
    {
      "personId": "worker-123",
      "name": "山田太郎",
      "company": "ABC建設",
      "ccusId": "12345",
      "ccusRegistered": true,
      "socialInsurance": true
    }
  ]
}
```

#### POST /api/workers
作業員を登録します。

**ヘッダー**:
```
X-API-Key: your-api-key
Content-Type: application/json
```

**リクエスト**:
```json
{
  "personId": "worker-123",
  "name": "山田太郎",
  "company": "ABC建設",
  "ccusId": "12345",
  "ccusRegistered": true,
  "socialInsurance": true
}
```

**レスポンス**:
```json
{
  "success": true,
  "personId": "worker-123"
}
```

## 環境変数

`.env.example` を `.env` にコピーして設定してください。

| 変数名 | 説明 | デフォルト値 |
|--------|------|-------------|
| `PORT` | サーバーポート | `8100` |
| `API_KEY` | APIキー（認証用） | `development-api-key-12345` |
| `ALLOWED_ORIGIN` | CORS許可オリジン | なし |
| `FACE_THRESHOLD` | 顔認識の閾値 | `0.6` |

**開発環境の起動例**:
```bash
# .envファイルを作成
cp .env.example .env

# サーバー起動
npm run dev
```

**本番環境の起動例**:
```bash
# 環境変数を設定
export API_KEY="your-secure-random-api-key-here"
export ALLOWED_ORIGIN="https://your-production-app.com"

# ビルドして起動
npm run build
npm start
```

## CORS設定

デフォルトで以下のオリジンが許可されています：
- `http://localhost:19006` (Expo DevTools)
- `http://localhost:8081` (Metro Bundler)
- 環境変数 `ALLOWED_ORIGIN` で指定したオリジン

本番環境では、環境変数 `ALLOWED_ORIGIN` を必ず設定してください。

## 実装状況

### ✅ 完了

- [x] face-api.js の統合実装
- [x] SQLiteデータベースのスキーマ設計
- [x] 作業員マスタCRUD実装
- [x] 顔登録・認識ロジック実装
- [x] エラーハンドリング
- [x] API テスト（curl）
- [x] **簡易APIキー認証実装**
- [x] **CORS設定の厳格化**
- [x] **環境変数による設定管理**

### 📋 TODO

- [ ] モバイルアプリとの統合
- [ ] JWT/OAuth認証への移行（本番環境推奨）
- [ ] ログ機能（Winston等）
- [ ] テストコード（Jest）
- [ ] Dockerコンテナ化
- [ ] 本番環境デプロイ

## 技術スタック

- **Node.js**: ランタイム
- **Express**: Webフレームワーク
- **TypeScript**: 型安全な開発
- **@vladmandic/face-api**: 顔認識ライブラリ
- **better-sqlite3**: SQLiteデータベース
- **tsx**: TypeScript実行環境

## 開発メモ

現在は基盤のみ実装済みです。各TODOを順次実装していきます。
