# Face API Verify v1 - 顔認証 API 仕様書

## 1. 概要

本ドキュメントは、既存の Face API に対して追加する **顔認証エンドポイント**
`POST /api/face/verify` の仕様を定義する。

**目的**:
- 入退場ゲートにおける **本人確認 (1:1 Verify)** を実現する
- 既に登録済みの顔エンベディング (`face_embeddings` テーブル) を用いて、
  新たに撮影された顔画像との類似度を計算し、**同一人物かどうか** を判定する

本バージョン (v1) は **1:1 Verify 専用** とし、
1:N Identify（「この人は誰？」探索）は将来バージョンで拡張する。

---

## 2. ユースケース

1. **入退場時の本人確認**
   - 作業員が CCUSカード / QRコード / IC などで自分の `person_id` を提示
   - ゲート端末で顔を撮影
   - `person_id` + 顔画像 を Verify API に送信
   - 「本人一致 / 不一致」を返却 → 入場可否の判断材料に

2. **現場常駐端末でのスポットチェック**
   - 指定した作業員の本人確認（安全講習など）

---

## 3. API 仕様

### 3.1 エンドポイント

- **Method**: `POST`
- **Path**: `/api/face/verify`
- **Auth**: `x-api-key` ヘッダー（既存の middleware と同じ）

```http
POST /api/face/verify HTTP/1.1
Host: face-api.example.com
Content-Type: application/json
x-api-key: <API_KEY>
```

### 3.2 リクエストボディ

```json
{
  "personId": "P010005",
  "imageData": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD..."
}
```

#### フィールド定義

| フィールド | 型 | 必須 | 説明 |
|----------|---|------|------|
| `personId` | string | ✅ | 対象作業員の一意なID（例: P010005）<br>workers / face_embeddings テーブルで管理している person_id |
| `imageData` | string | ✅ | data URL + Base64 形式の画像データ<br>例: "data:image/jpeg;base64,...."<br>登録 API (/api/face/register) と同じ形式 |

---

## 4. 判定ロジック

### 4.1 Embedding と距離

既存の顔登録処理と同じく、face-api.js により **128次元の顔エンベディング** を使用。

`face_embeddings` テーブルには以下の情報が保存されている前提:
- `person_id`
- `embedding` (128次元ベクトル; BLOB)
- `embedding_dimensions`
- `model_version` など（任意）

本 API では、以下のように距離を計算する:

**距離指標**: L2距離 (Euclidean distance)

```
distance = sqrt(sum( (x_i - y_i)^2 ))
```

**類似度**:
- v1 では距離そのものを返却
- 必要に応じて `similarity = 1 / (1 + distance)` を将来追加

### 4.2 判定ルール

**環境変数または設定値**:
- `FACE_VERIFY_THRESHOLD` (default: 0.6)
- または `FACE_THRESHOLD` (fallback)

**ルール**:
- `distance <= threshold` → `matched = true`（本人とみなす）
- `distance > threshold` → `matched = false`（別人の可能性が高い）

---

## 5. レスポンス仕様

### 5.1 成功レスポンス (HTTP 200)

```json
{
  "success": true,
  "mode": "verify",
  "person_id": "P010005",
  "distance": 0.42,
  "threshold": 0.6,
  "matched": true,
  "embedding_dimensions": 128,
  "model_version": "face-api.js:v1",
  "timestamp": "2025-12-05T10:00:00.000Z"
}
```

#### フィールド定義

| フィールド | 型 | 説明 |
|----------|---|------|
| `success` | boolean | 常に `true` |
| `mode` | string | `"verify"` 固定 |
| `person_id` | string | リクエストで指定した personId |
| `distance` | number | 0.0〜2.0 ぐらいを想定（L2距離） |
| `threshold` | number | 使用した閾値 |
| `matched` | boolean | `distance <= threshold` かどうか |
| `embedding_dimensions` | number | 128 |
| `model_version` | string | 利用したモデルのバージョン識別子 |
| `timestamp` | string | サーバー処理時間（ISO8601） |

### 5.2 代表的なエラーレスポンス

#### (1) 作業員が存在しない

**HTTP 404**

```json
{
  "success": false,
  "error_code": "WORKER_NOT_FOUND",
  "error_message": "Worker with person_id 'P010999' not found."
}
```

#### (2) 顔エンベディングが登録されていない

**HTTP 404**

```json
{
  "success": false,
  "error_code": "FACE_EMBEDDING_NOT_FOUND",
  "error_message": "Face embedding for person_id 'P010005' not found."
}
```

#### (3) 顔が検出できなかった

**HTTP 400**

```json
{
  "success": false,
  "error_code": "FACE_NOT_DETECTED",
  "error_message": "No face detected in the provided image."
}
```

#### (4) 複数の顔が検出された（将来実装）

**HTTP 400**

```json
{
  "success": false,
  "error_code": "MULTIPLE_FACES_DETECTED",
  "error_message": "Multiple faces detected. Please provide an image with a single face."
}
```

#### (5) その他のサーバーエラー

**HTTP 500**

```json
{
  "success": false,
  "error_code": "INTERNAL_SERVER_ERROR",
  "error_message": "Unexpected error occurred during face verification."
}
```

---

## 6. セキュリティ / ログ / 運用

### 6.1 セキュリティ

- `x-api-key` による認証（既存の middleware を共用）
- 将来的に:
  - IP制限
  - レートリミット (/api/face/verify は DoS 的に叩かれやすいため)

### 6.2 ログ

**成功時**:
```
[Face Verify] person_id=P010005 distance=0.42 threshold=0.6 matched=true
```

**失敗時**:
```
[Face Verify] ERROR <error_code> ...
```

**注意**: 個人情報（生画像）はログに書かない（base64の先頭だけなら可）

---

## 7. v2 以降の拡張案（メモ）

1. **1:N Identify モード** (`mode: "identify"`)
2. 類似度ランキング付き候補リスト返却 (`candidates: [...]`)
3. マルチモデル対応 (`model_version` を切り替える)
4. 顔エンベディングの履歴管理 / ロールバック機構

---

## 8. curl テスト例

### 8.1 正常系（本人一致）

```bash
curl -X POST "http://192.168.1.4:8101/api/face/verify" \
  -H "Content-Type: application/json" \
  -H "x-api-key: development-api-key-12345" \
  -d '{
    "personId": "P010005",
    "imageData": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD..."
  }'
```

**期待レスポンス**:
```json
{
  "success": true,
  "mode": "verify",
  "person_id": "P010005",
  "distance": 0.42,
  "threshold": 0.6,
  "matched": true,
  "embedding_dimensions": 128,
  "model_version": "face-api.js:v1",
  "timestamp": "2025-12-05T10:00:00.000Z"
}
```

### 8.2 本人不一致（距離が閾値を超える）

```json
{
  "success": true,
  "mode": "verify",
  "person_id": "P010005",
  "distance": 0.85,
  "threshold": 0.6,
  "matched": false,
  "embedding_dimensions": 128,
  "model_version": "face-api.js:v1",
  "timestamp": "2025-12-05T10:00:00.000Z"
}
```

### 8.3 作業員が存在しない

```bash
curl -X POST "http://192.168.1.4:8101/api/face/verify" \
  -H "Content-Type: application/json" \
  -H "x-api-key: development-api-key-12345" \
  -d '{
    "personId": "P099999",
    "imageData": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD..."
  }'
```

**期待レスポンス**:
```json
{
  "success": false,
  "error_code": "WORKER_NOT_FOUND",
  "error_message": "Worker with person_id 'P099999' not found."
}
```

---

## 9. 実装メモ

### 9.1 使用技術

- **Node.js + TypeScript**
- **Express.js** (ルーティング)
- **face-api.js** (顔検出・エンベディング抽出)
- **better-sqlite3** (データベース)

### 9.2 データベーススキーマ

#### workers テーブル
```sql
CREATE TABLE workers (
  person_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  company TEXT NOT NULL,
  ...
);
```

#### face_embeddings テーブル
```sql
CREATE TABLE face_embeddings (
  person_id TEXT PRIMARY KEY,
  embedding BLOB NOT NULL,
  embedding_dimensions INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (person_id) REFERENCES workers(person_id)
);
```

### 9.3 再登録ポリシー

現在の実装:
- `updateFaceEmbedding()` は **UPSERT** を使用
- 同じ `person_id` に対して再登録すると、**既存のエンベディングを上書き**
- 履歴は保存されない

将来の改善案:
- エンベディング履歴テーブルを作成
- バージョン管理（v1, v2, ...）
- ロールバック機能

---

**最終更新**: 2025-12-05
**作成者**: Claude (with user collaboration)
**バージョン**: v1.0
