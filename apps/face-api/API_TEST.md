# Face API Testing Guide

## サーバー起動

```bash
cd /volume2/Project/MCD3/TUMON/mc-gate/apps/face-api
npm run dev
```

サーバーは `http://localhost:8000` で起動します。

## API エンドポイントテスト

### 1. 作業員マスタAPI

#### 作業員を追加

```bash
curl -X POST http://localhost:8000/api/workers \
  -H "Content-Type: application/json" \
  -d '{
    "personId": "P001",
    "name": "山田太郎",
    "company": "株式会社ABC",
    "ccusId": "C12345",
    "ccusRegistered": true,
    "socialInsurance": true,
    "age": 35,
    "isSoleProprietor": false
  }'
```

**期待されるレスポンス**:
```json
{
  "success": true,
  "personId": "P001"
}
```

#### 全作業員を取得

```bash
curl http://localhost:8000/api/workers | jq .
```

**期待されるレスポンス**:
```json
{
  "workers": [
    {
      "personId": "P001",
      "name": "山田太郎",
      "company": "株式会社ABC",
      "ccusId": "C12345",
      "ccusRegistered": true,
      "socialInsurance": true,
      "age": 35,
      "isSoleProprietor": false,
      "createdAt": "2025-11-13T05:28:32.027Z",
      "updatedAt": "2025-11-13T05:28:32.027Z"
    }
  ]
}
```

#### 特定の作業員を取得

```bash
curl http://localhost:8000/api/workers/P001 | jq .
```

**期待されるレスポンス**:
```json
{
  "personId": "P001",
  "name": "山田太郎",
  "company": "株式会社ABC",
  ...
}
```

### 2. 顔認証API

#### 顔登録（POST /api/face/register）

**リクエスト**:
```bash
curl -X POST http://localhost:8000/api/face/register \
  -H "Content-Type: application/json" \
  -d '{
    "personId": "P001",
    "imageData": "data:image/jpeg;base64,/9j/4AAQ..."
  }'
```

**パラメータ**:
- `personId` (required): 作業員ID（事前に `/api/workers` で登録済みである必要があります）
- `imageData` (required): Base64エンコードされた顔画像（data URI形式）

**成功時のレスポンス**:
```json
{
  "success": true,
  "personId": "P001",
  "embeddingDimensions": 128
}
```

**エラー例**:
```json
{
  "success": false,
  "error": "No face detected in the image"
}
```

```json
{
  "success": false,
  "error": "Worker with personId 'P999' not found"
}
```

#### 顔認識（POST /api/face/recognize）

**リクエスト**:
```bash
curl -X POST http://localhost:8000/api/face/recognize \
  -H "Content-Type: application/json" \
  -d '{
    "imageData": "data:image/jpeg;base64,/9j/4AAQ...",
    "threshold": 0.6
  }'
```

**パラメータ**:
- `imageData` (required): Base64エンコードされた顔画像（data URI形式）
- `threshold` (optional): マッチング閾値（デフォルト: 0.6）

**成功時のレスポンス（マッチした場合）**:
```json
{
  "personId": "P001",
  "confidence": 0.85,
  "distance": 0.15,
  "workerInfo": {
    "name": "山田太郎",
    "company": "株式会社ABC",
    "ccusId": "C12345"
  }
}
```

**マッチしなかった場合**:
```json
{
  "personId": null,
  "confidence": 0,
  "distance": 0.85,
  "error": "No match found (closest distance: 0.850, threshold: 0.6)"
}
```

**顔が検出されない場合**:
```json
{
  "personId": null,
  "confidence": 0,
  "error": "No face detected in the image"
}
```

## テスト結果（2025-11-13）

### ✅ 成功したテスト

1. **サーバー起動**: ポート8000で正常に起動
2. **face-api.jsモデルロード**: 3つのモデル（SSD MobileNet v1、Face Landmark 68、Face Recognition）が正常にロード
3. **POST /api/workers**: 作業員の追加が成功（P001を登録）
4. **GET /api/workers**: 全作業員の取得が成功
5. **GET /api/workers/:personId**: 特定作業員の取得が成功
6. **POST /api/face/register**: エラーハンドリングが正常動作（顔検出なしのエラーを正しく返す）
7. **POST /api/face/recognize**: エラーハンドリングが正常動作（顔検出なしのエラーを正しく返す）

### 📝 備考

- 実際の顔画像を使った完全なエンドツーエンドテストは、フロントエンド統合時に実施予定
- 現時点では、APIの構造とエラーハンドリングが正しく動作していることを確認済み
- face-api.jsの顔検出モデルは正常にロードされており、実際の顔画像を投げれば正常に動作する見込み

## 次のステップ

1. モバイルアプリからのAPI呼び出し実装
2. カメラで撮影した顔画像をBase64エンコードして送信
3. 実際の顔画像を使った完全なテスト
4. パフォーマンステスト（複数作業員登録時の認識速度）
5. エラーケースの網羅的なテスト

## トラブルシューティング

### エラー: Cannot find module '@tensorflow/tfjs-node'

**解決策**:
```bash
npm install @tensorflow/tfjs-node
```

### エラー: face-api.js models not found

**原因**: `apps/face-api/models/` ディレクトリにモデルファイルがない

**解決策**: モデルファイルをダウンロード（詳細はREADME参照）

### エラー: CORS policy

**原因**: フロントエンドから別オリジンでアクセスしている

**解決策**: `src/index.ts` で既にCORSは有効化済み。特定のオリジンに制限する場合は設定を変更してください。

```typescript
app.use(cors({
  origin: 'http://localhost:19000' // Expo Dev Server
}));
```
