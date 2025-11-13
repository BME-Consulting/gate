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

## API エンドポイント

### 顔認証API

#### POST /api/face/register
顔画像を登録します。

**リクエスト**:
```json
{
  "personId": "worker-123",
  "imageData": "base64-encoded-image"
}
```

**レスポンス**:
```json
{
  "success": true
}
```

#### POST /api/face/recognize
顔認識を行います。

**リクエスト**:
```json
{
  "imageData": "base64-encoded-image"
}
```

**レスポンス**:
```json
{
  "personId": "worker-123",
  "confidence": 0.95
}
```

### 作業員マスタAPI

#### GET /api/workers
全作業員を取得します。

**レスポンス**:
```json
{
  "workers": []
}
```

#### POST /api/workers
作業員を登録します。

**リクエスト**:
```json
{
  "id": "worker-123",
  "name": "山田太郎",
  "company": "ABC建設"
}
```

**レスポンス**:
```json
{
  "success": true
}
```

## 実装状況

### ✅ 完了

- [x] face-api.js の統合実装
- [x] SQLiteデータベースのスキーマ設計
- [x] 作業員マスタCRUD実装
- [x] 顔登録・認識ロジック実装
- [x] エラーハンドリング
- [x] API テスト（curl）

### 📋 TODO

- [ ] モバイルアプリとの統合
- [ ] 認証・認可機能（Keycloak連携）
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
