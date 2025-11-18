# Face API Server

顔認識APIサーバー - MC-Gateプロジェクト用

## 機能

- **顔登録**: 顔画像をpersonIdと紐づけて登録
- **顔認証**: 顔画像から登録済みの人物を特定
- **高精度**: face_recognition (dlib) による99.38%の精度
- **軽量**: SQLiteベースのストレージ
- **セキュア**: APIキー認証

## クイックスタート

### Docker Compose（推奨）

```bash
# 1. ディレクトリに移動
cd apps/face-api

# 2. 環境変数ファイルをコピー
cp .env.example .env

# 3. Docker Composeで起動
docker-compose up -d

# 4. ログ確認
docker-compose logs -f
```

サーバーが `http://localhost:8100` で起動します。

### ローカル実行（開発用）

```bash
# 1. Python 3.10+ が必要
python --version

# 2. 仮想環境作成
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 3. 依存関係インストール
pip install -r requirements.txt

# 4. 環境変数設定
cp .env.example .env

# 5. サーバー起動
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8100
```

## API仕様

### 1. ヘルスチェック

```bash
GET /health
```

**レスポンス**:
```json
{
  "status": "ok",
  "version": "1.0.0",
  "registered_faces": 5
}
```

### 2. 顔登録

```bash
POST /api/face/register
Headers:
  x-api-key: development-api-key-12345
  Content-Type: application/json

Body:
{
  "personId": "PERSON001",
  "imageData": "data:image/jpeg;base64,/9j/4AAQ..."
}
```

**レスポンス（成功）**:
```json
{
  "success": true,
  "personId": "PERSON001",
  "embeddingDimensions": 128,
  "faceCount": 1
}
```

**レスポンス（エラー）**:
```json
{
  "success": false,
  "error": "No face detected in the image"
}
```

### 3. 顔認証

```bash
POST /api/face/recognize
Headers:
  x-api-key: development-api-key-12345
  Content-Type: application/json

Body:
{
  "imageData": "data:image/jpeg;base64,/9j/4AAQ...",
  "threshold": 0.6
}
```

**レスポンス（マッチあり）**:
```json
{
  "personId": "PERSON001",
  "confidence": 0.85,
  "distance": 0.35
}
```

**レスポンス（マッチなし）**:
```json
{
  "personId": null,
  "confidence": 0.45,
  "distance": 0.72
}
```

## 設定

### 環境変数

| 変数名 | デフォルト | 説明 |
|--------|-----------|------|
| `HOST` | `0.0.0.0` | バインドホスト |
| `PORT` | `8100` | ポート番号 |
| `API_KEY` | `development-api-key-12345` | APIキー |
| `CORS_ORIGINS` | `http://localhost:3000,...` | CORS許可オリジン |
| `DATABASE_PATH` | `./data/embeddings.db` | SQLiteデータベースパス |
| `FACE_DETECTION_MODEL` | `hog` | 顔検出モデル (hog or cnn) |
| `FACE_RECOGNITION_TOLERANCE` | `0.6` | 認識閾値 (0.0-1.0) |
| `MAX_IMAGE_SIZE_MB` | `10` | 最大画像サイズ |
| `LOG_LEVEL` | `INFO` | ログレベル |

### 顔検出モデル

- **hog**: CPU向け、高速だが精度はやや低い
- **cnn**: GPU向け、高精度だが重い

開発環境では `hog` を推奨。

### 認識閾値

- `0.6`: デフォルト（バランス）
- `< 0.6`: 厳格（誤認識↓、未認識↑）
- `> 0.6`: 緩和（未認識↓、誤認識↑）

## トラブルシューティング

### Docker起動に失敗する

```bash
# ログ確認
docker-compose logs face-api

# コンテナ再ビルド
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

### 顔検出に失敗する

- **画像サイズ**: 最大10MB
- **画像形式**: JPEG, PNG推奨
- **顔の向き**: 正面を向いている
- **解像度**: 最低でも200x200px

### パフォーマンスが遅い

- **顔検出モデル**: `hog` → `cnn` (GPU必要)
- **画像サイズ**: リサイズして送信
- **登録件数**: 1000件以上は検索が遅くなる可能性

## 開発

### テスト実行

```bash
pytest
```

### 自動フォーマット

```bash
black app/
isort app/
```

### 型チェック

```bash
mypy app/
```

## ライセンス

MIT License
