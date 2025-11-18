# GS Service バックエンドAPI 詳細設計書

**作成日**: 2025-11-18
**対象**: mc-gate プロジェクト GS Service バックエンドAPI
**バージョン**: 1.0.0

---

## 目次

1. [概要](#1-概要)
2. [データベース設計](#2-データベース設計)
3. [REST API エンドポイント仕様](#3-rest-api-エンドポイント仕様)
4. [認証・認可設計](#4-認証認可設計)
5. [エラーハンドリング](#5-エラーハンドリング)
6. [技術スタック推奨](#6-技術スタック推奨)
7. [実装ステップ](#7-実装ステップ)
8. [モバイルアプリ側の変更](#8-モバイルアプリ側の変更)
9. [付録: 実装コード例](#9-付録-実装コード例)

---

## 1. 概要

### 1.1 背景

mc-gateプロジェクトは、建設現場の入退場管理を行うモバイルアプリとバックエンドAPIで構成されます。現在、モバイルアプリは完成しており、QR/顔認証機能、オフラインキュー機能（SQLite）が実装済みですが、モックAPIで動作しています。

本設計書では、実際のGS Service バックエンドAPIを実装するための詳細設計を提供します。

### 1.2 システム構成

```
[モバイルアプリ (React Native + Expo)]
    ↓ HTTPS (Bearer token)
[GS Service API (Node.js + Express/Fastify)]
    ↓
[PostgreSQL/MySQL データベース]
    ↓
[Keycloak 認証サーバー]
```

### 1.3 主要機能

1. **イベント受信**: モバイルアプリから送信されたスキャンイベントを受信・永続化
2. **イベント履歴取得**: プロジェクト別、日付範囲別にイベント履歴を取得
3. **統計情報取得**: 今日の入場/退場数、現在の場内人数を取得
4. **冪等性保証**: 同一イベントの重複登録を防止

---

## 2. データベース設計

### 2.1 テーブル定義

#### 2.1.1 `scan_events` テーブル

スキャンイベントを保存するメインテーブル。

**PostgreSQL DDL**:

```sql
CREATE TABLE scan_events (
    -- Primary Key
    id UUID PRIMARY KEY,

    -- Event Basic Info
    project_id VARCHAR(100) NOT NULL,
    person_id VARCHAR(100) NOT NULL,
    method VARCHAR(10) NOT NULL CHECK (method IN ('QR', 'CARD', 'FACE')),
    gate_mode VARCHAR(10) NOT NULL CHECK (gate_mode IN ('IN', 'OUT')),
    decided_mode VARCHAR(10) NOT NULL CHECK (decided_mode IN ('IN', 'OUT')),
    occurred_at TIMESTAMP WITH TIME ZONE NOT NULL,

    -- Rule Result (JSONB for flexibility)
    rule_result JSONB NOT NULL,

    -- Transport Status
    transport_status VARCHAR(20) NOT NULL DEFAULT 'sent' CHECK (transport_status IN ('pending', 'sent', 'failed')),
    transport_attempts INTEGER NOT NULL DEFAULT 1,
    transport_last_error TEXT,
    transport_idempotency_key VARCHAR(255) NOT NULL UNIQUE,

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    -- Indexes
    CONSTRAINT scan_events_occurred_at_check CHECK (occurred_at IS NOT NULL)
);

-- Indexes
CREATE INDEX idx_scan_events_project_id ON scan_events(project_id);
CREATE INDEX idx_scan_events_occurred_at ON scan_events(occurred_at DESC);
CREATE INDEX idx_scan_events_decided_mode ON scan_events(decided_mode);
CREATE INDEX idx_scan_events_idempotency_key ON scan_events(transport_idempotency_key);
CREATE INDEX idx_scan_events_project_occurred ON scan_events(project_id, occurred_at DESC);

-- Composite index for stats query
CREATE INDEX idx_scan_events_stats ON scan_events(project_id, occurred_at, decided_mode, transport_status);

-- Comments
COMMENT ON TABLE scan_events IS 'スキャンイベント履歴テーブル';
COMMENT ON COLUMN scan_events.id IS 'イベントID (UUID)';
COMMENT ON COLUMN scan_events.project_id IS 'プロジェクトID';
COMMENT ON COLUMN scan_events.person_id IS '作業員ID';
COMMENT ON COLUMN scan_events.method IS '読取方式 (QR/CARD/FACE)';
COMMENT ON COLUMN scan_events.gate_mode IS 'ゲートモード (IN/OUT)';
COMMENT ON COLUMN scan_events.decided_mode IS '確定した入退場モード (IN/OUT)';
COMMENT ON COLUMN scan_events.occurred_at IS 'スキャン発生日時 (ISO8601)';
COMMENT ON COLUMN scan_events.rule_result IS 'ルール判定結果 (JSON)';
COMMENT ON COLUMN scan_events.transport_idempotency_key IS '冪等性キー (重複防止用)';
```

**MySQL 8+ DDL**:

```sql
CREATE TABLE scan_events (
    -- Primary Key
    id CHAR(36) PRIMARY KEY,

    -- Event Basic Info
    project_id VARCHAR(100) NOT NULL,
    person_id VARCHAR(100) NOT NULL,
    method VARCHAR(10) NOT NULL CHECK (method IN ('QR', 'CARD', 'FACE')),
    gate_mode VARCHAR(10) NOT NULL CHECK (gate_mode IN ('IN', 'OUT')),
    decided_mode VARCHAR(10) NOT NULL CHECK (decided_mode IN ('IN', 'OUT')),
    occurred_at DATETIME(3) NOT NULL,

    -- Rule Result (JSON for flexibility)
    rule_result JSON NOT NULL,

    -- Transport Status
    transport_status VARCHAR(20) NOT NULL DEFAULT 'sent' CHECK (transport_status IN ('pending', 'sent', 'failed')),
    transport_attempts INTEGER NOT NULL DEFAULT 1,
    transport_last_error TEXT,
    transport_idempotency_key VARCHAR(255) NOT NULL UNIQUE,

    -- Metadata
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

    -- Indexes
    INDEX idx_scan_events_project_id (project_id),
    INDEX idx_scan_events_occurred_at (occurred_at DESC),
    INDEX idx_scan_events_decided_mode (decided_mode),
    INDEX idx_scan_events_idempotency_key (transport_idempotency_key),
    INDEX idx_scan_events_project_occurred (project_id, occurred_at DESC),
    INDEX idx_scan_events_stats (project_id, occurred_at, decided_mode, transport_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

#### 2.1.2 モバイルアプリのSQLiteスキーマとの対応

| モバイルアプリ (SQLite) | GS Service (PostgreSQL/MySQL) | 備考 |
|------------------------|------------------------------|------|
| `id TEXT PRIMARY KEY` | `id UUID PRIMARY KEY` | UUIDをそのまま保存 |
| `project_id TEXT` | `project_id VARCHAR(100)` | 同一 |
| `person_id TEXT` | `person_id VARCHAR(100)` | 同一 |
| `method TEXT` | `method VARCHAR(10)` | 同一 (QR/CARD/FACE) |
| `gate_mode TEXT` | `gate_mode VARCHAR(10)` | 同一 (IN/OUT) |
| `decided_mode TEXT` | `decided_mode VARCHAR(10)` | 同一 (IN/OUT) |
| `occurred_at TEXT` | `occurred_at TIMESTAMP` | ISO8601 → TIMESTAMP変換 |
| `rule_result TEXT` | `rule_result JSONB/JSON` | JSON文字列 → JSONB/JSON型 |
| `transport_status TEXT` | `transport_status VARCHAR(20)` | 同一 |
| `transport_attempts INTEGER` | `transport_attempts INTEGER` | 同一 |
| `transport_last_error TEXT` | `transport_last_error TEXT` | 同一 |
| `transport_idempotency_key TEXT` | `transport_idempotency_key VARCHAR(255)` | 同一 |

**変換処理**:
- `occurred_at`: `new Date(event.occurredAt).toISOString()` → データベースの TIMESTAMP型
- `rule_result`: `JSON.parse(event.ruleResult)` → JSONB/JSON型

### 2.2 インデックス設計

#### 2.2.1 インデックス一覧

| インデックス名 | カラム | 目的 |
|--------------|--------|------|
| `PRIMARY KEY` | `id` | 主キー検索 |
| `idx_scan_events_project_id` | `project_id` | プロジェクト絞り込み |
| `idx_scan_events_occurred_at` | `occurred_at DESC` | 日付範囲検索（降順） |
| `idx_scan_events_decided_mode` | `decided_mode` | 入退場モード絞り込み |
| `idx_scan_events_idempotency_key` | `transport_idempotency_key` | 冪等性チェック（UNIQUE） |
| `idx_scan_events_project_occurred` | `project_id, occurred_at DESC` | プロジェクト別履歴取得（複合） |
| `idx_scan_events_stats` | `project_id, occurred_at, decided_mode, transport_status` | 統計情報取得（複合） |

#### 2.2.2 インデックス使用クエリ例

**履歴取得クエリ**:
```sql
SELECT * FROM scan_events
WHERE project_id = 'PRJ001'
  AND occurred_at >= '2025-11-01T00:00:00Z'
  AND occurred_at < '2025-12-01T00:00:00Z'
ORDER BY occurred_at DESC
LIMIT 100 OFFSET 0;

-- 使用インデックス: idx_scan_events_project_occurred
```

**統計情報クエリ**:
```sql
SELECT decided_mode, COUNT(*) as count
FROM scan_events
WHERE project_id = 'PRJ001'
  AND occurred_at >= '2025-11-18T00:00:00Z'
  AND transport_status = 'sent'
GROUP BY decided_mode;

-- 使用インデックス: idx_scan_events_stats
```

**冪等性チェッククエリ**:
```sql
SELECT id FROM scan_events
WHERE transport_idempotency_key = 'abc123-xyz789';

-- 使用インデックス: idx_scan_events_idempotency_key (UNIQUE)
```

### 2.3 パフォーマンス考慮事項

#### 2.3.1 パーティショニング

**月次パーティショニング（PostgreSQL 12+）**:

```sql
CREATE TABLE scan_events (
    -- カラム定義は同じ
    ...
) PARTITION BY RANGE (occurred_at);

-- 2025年11月分
CREATE TABLE scan_events_2025_11 PARTITION OF scan_events
FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');

-- 2025年12月分
CREATE TABLE scan_events_2025_12 PARTITION OF scan_events
FOR VALUES FROM ('2025-12-01') TO ('2026-01-01');
```

**メリット**:
- 大量データでも高速検索（パーティション絞り込み）
- 古いデータの削除が高速（パーティション単位でDROP）

#### 2.3.2 アーカイブ戦略

**1年以上経過したデータをアーカイブテーブルに移動**:

```sql
-- アーカイブテーブル（構造は同じ）
CREATE TABLE scan_events_archive (LIKE scan_events INCLUDING ALL);

-- 1年以上前のデータを移動（月次バッチ処理）
INSERT INTO scan_events_archive
SELECT * FROM scan_events
WHERE occurred_at < NOW() - INTERVAL '1 year';

DELETE FROM scan_events
WHERE occurred_at < NOW() - INTERVAL '1 year';

-- VACUUMでディスク容量を解放（PostgreSQL）
VACUUM FULL scan_events;
```

#### 2.3.3 クエリ最適化

**EXPLAIN ANALYZE でクエリプラン確認**:

```sql
EXPLAIN ANALYZE
SELECT * FROM scan_events
WHERE project_id = 'PRJ001'
  AND occurred_at >= '2025-11-01T00:00:00Z'
ORDER BY occurred_at DESC
LIMIT 100;
```

**期待されるクエリプラン**:
```
Index Scan using idx_scan_events_project_occurred on scan_events
  Filter: (occurred_at >= '2025-11-01')
  Rows Removed by Filter: 0
Planning Time: 0.5 ms
Execution Time: 2.3 ms
```

---

## 3. REST API エンドポイント仕様

### 3.1 POST /api/events - イベント受信

#### 3.1.1 概要

モバイルアプリから送信されたスキャンイベントを受信し、データベースに永続化します。

#### 3.1.2 リクエスト

**エンドポイント**: `POST /api/events`

**ヘッダー**:
```http
Content-Type: application/json
Authorization: Bearer <access_token>
```

**リクエストボディ** (TypeScript型定義):

```typescript
interface PostEventRequest {
  id: string;                          // UUID
  projectId: string;
  personId: string;
  method: "QR" | "CARD" | "FACE";
  gateMode: "IN" | "OUT";
  decidedMode: "IN" | "OUT";
  occurredAt: string;                  // ISO8601 (例: "2025-11-18T12:34:56.789Z")
  ruleResult: {
    action: "allow" | "warn" | "block";
    messages: string[];
    sendToCcus: boolean;
    includeInGs: boolean;
  };
  transport: {
    idempotencyKey: string;            // 冪等性キー
  };
}
```

**リクエスト例**:

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "projectId": "PRJ001",
  "personId": "PERSON001",
  "method": "QR",
  "gateMode": "IN",
  "decidedMode": "IN",
  "occurredAt": "2025-11-18T12:34:56.789Z",
  "ruleResult": {
    "action": "allow",
    "messages": [],
    "sendToCcus": true,
    "includeInGs": true
  },
  "transport": {
    "idempotencyKey": "550e8400-e29b-41d4-a716-446655440000-1731931496789"
  }
}
```

#### 3.1.3 レスポンス

**成功 (200 OK)**:

```typescript
interface PostEventResponse {
  success: true;
  eventId: string;
  message: string;
  timestamp: string;  // ISO8601
}
```

```json
{
  "success": true,
  "eventId": "550e8400-e29b-41d4-a716-446655440000",
  "message": "Event received successfully",
  "timestamp": "2025-11-18T12:34:57.123Z"
}
```

**重複検出 (409 Conflict)**:

```json
{
  "error": "Duplicate event",
  "code": "DUPLICATE_EVENT",
  "details": {
    "idempotencyKey": "550e8400-e29b-41d4-a716-446655440000-1731931496789",
    "existingEventId": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

**バリデーションエラー (422 Unprocessable Entity)**:

```json
{
  "error": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": [
    {
      "field": "occurredAt",
      "message": "Invalid ISO8601 date format"
    }
  ]
}
```

**認証エラー (401 Unauthorized)**:

```json
{
  "error": "Unauthorized",
  "code": "UNAUTHORIZED",
  "message": "Invalid or expired access token"
}
```

**サーバーエラー (500 Internal Server Error)**:

```json
{
  "error": "Internal server error",
  "code": "INTERNAL_ERROR",
  "message": "An unexpected error occurred"
}
```

#### 3.1.4 バリデーション仕様

| フィールド | 必須 | 型 | バリデーションルール |
|-----------|------|----|--------------------|
| `id` | Yes | string | UUID v4形式 |
| `projectId` | Yes | string | 1-100文字 |
| `personId` | Yes | string | 1-100文字 |
| `method` | Yes | string | "QR", "CARD", "FACE" のいずれか |
| `gateMode` | Yes | string | "IN", "OUT" のいずれか |
| `decidedMode` | Yes | string | "IN", "OUT" のいずれか |
| `occurredAt` | Yes | string | ISO8601形式、過去7日以内 |
| `ruleResult` | Yes | object | 必須フィールドを含む |
| `ruleResult.action` | Yes | string | "allow", "warn", "block" のいずれか |
| `ruleResult.messages` | Yes | string[] | 配列 |
| `ruleResult.sendToCcus` | Yes | boolean | true/false |
| `ruleResult.includeInGs` | Yes | boolean | true/false |
| `transport.idempotencyKey` | Yes | string | 1-255文字、ユニーク |

#### 3.1.5 実装詳細

**冪等性チェック**:

```typescript
// 1. idempotencyKey でデータベース検索
const existing = await db.query(
  'SELECT id FROM scan_events WHERE transport_idempotency_key = $1',
  [request.transport.idempotencyKey]
);

// 2. 既存レコードがあれば 409 Conflict
if (existing.rows.length > 0) {
  return res.status(409).json({
    error: "Duplicate event",
    code: "DUPLICATE_EVENT",
    details: {
      idempotencyKey: request.transport.idempotencyKey,
      existingEventId: existing.rows[0].id,
    },
  });
}

// 3. 新規レコードを挿入
await db.query(
  `INSERT INTO scan_events (
    id, project_id, person_id, method, gate_mode, decided_mode,
    occurred_at, rule_result, transport_idempotency_key
  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
  [
    request.id,
    request.projectId,
    request.personId,
    request.method,
    request.gateMode,
    request.decidedMode,
    new Date(request.occurredAt),
    JSON.stringify(request.ruleResult),
    request.transport.idempotencyKey,
  ]
);
```

**トランザクション処理**:

```typescript
const client = await db.pool.connect();
try {
  await client.query('BEGIN');

  // 冪等性チェック + 挿入
  // ...

  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
}
```

---

### 3.2 GET /api/projects/:projectId/events - イベント履歴取得

#### 3.2.1 概要

プロジェクト別にスキャンイベント履歴を取得します。日付範囲、モード、ページネーションをサポートします。

#### 3.2.2 リクエスト

**エンドポイント**: `GET /api/projects/:projectId/events`

**パスパラメータ**:
- `projectId` (string): プロジェクトID

**クエリパラメータ**:

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|-----------|-------|------|-----------|------|
| `dateFrom` | string (ISO8601) | No | (制限なし) | 開始日時 |
| `dateTo` | string (ISO8601) | No | (制限なし) | 終了日時 |
| `decidedMode` | string | No | (制限なし) | "IN" または "OUT" |
| `limit` | number | No | 100 | 取得件数 (最大1000) |
| `offset` | number | No | 0 | オフセット |

**リクエスト例**:

```http
GET /api/projects/PRJ001/events?dateFrom=2025-11-01T00:00:00Z&dateTo=2025-11-30T23:59:59Z&decidedMode=IN&limit=50&offset=0
Authorization: Bearer <access_token>
```

#### 3.2.3 レスポンス

**成功 (200 OK)**:

```typescript
interface GetEventsResponse {
  events: ScanEvent[];
  total: number;
  hasMore: boolean;
  metadata: {
    projectId: string;
    dateFrom?: string;
    dateTo?: string;
    decidedMode?: string;
    limit: number;
    offset: number;
  };
}

interface ScanEvent {
  id: string;
  projectId: string;
  personId: string;
  method: "QR" | "CARD" | "FACE";
  gateMode: "IN" | "OUT";
  decidedMode: "IN" | "OUT";
  occurredAt: string;
  ruleResult: {
    action: "allow" | "warn" | "block";
    messages: string[];
    sendToCcus: boolean;
    includeInGs: boolean;
  };
}
```

**レスポンス例**:

```json
{
  "events": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "projectId": "PRJ001",
      "personId": "PERSON001",
      "method": "QR",
      "gateMode": "IN",
      "decidedMode": "IN",
      "occurredAt": "2025-11-18T12:34:56.789Z",
      "ruleResult": {
        "action": "allow",
        "messages": [],
        "sendToCcus": true,
        "includeInGs": true
      }
    }
  ],
  "total": 245,
  "hasMore": true,
  "metadata": {
    "projectId": "PRJ001",
    "dateFrom": "2025-11-01T00:00:00Z",
    "dateTo": "2025-11-30T23:59:59Z",
    "decidedMode": "IN",
    "limit": 50,
    "offset": 0
  }
}
```

#### 3.2.4 実装詳細

**SQL クエリ例**:

```typescript
// クエリビルダー
let query = `
  SELECT
    id, project_id, person_id, method, gate_mode, decided_mode,
    occurred_at, rule_result
  FROM scan_events
  WHERE project_id = $1
`;

const params: any[] = [projectId];
let paramIndex = 2;

if (dateFrom) {
  query += ` AND occurred_at >= $${paramIndex}`;
  params.push(new Date(dateFrom));
  paramIndex++;
}

if (dateTo) {
  query += ` AND occurred_at <= $${paramIndex}`;
  params.push(new Date(dateTo));
  paramIndex++;
}

if (decidedMode) {
  query += ` AND decided_mode = $${paramIndex}`;
  params.push(decidedMode);
  paramIndex++;
}

query += ` ORDER BY occurred_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
params.push(limit, offset);

const result = await db.query(query, params);

// 総件数取得
const countQuery = `SELECT COUNT(*) as total FROM scan_events WHERE ...`;
const countResult = await db.query(countQuery, params.slice(0, -2));
const total = parseInt(countResult.rows[0].total);

return {
  events: result.rows.map(mapRowToEvent),
  total,
  hasMore: offset + limit < total,
  metadata: { projectId, dateFrom, dateTo, decidedMode, limit, offset },
};
```

---

### 3.3 GET /api/projects/:projectId/stats - 統計情報取得

#### 3.3.1 概要

プロジェクト別に今日の入場/退場数、現在の場内人数を取得します。

#### 3.3.2 リクエスト

**エンドポイント**: `GET /api/projects/:projectId/stats`

**パスパラメータ**:
- `projectId` (string): プロジェクトID

**クエリパラメータ**:

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|-----------|-------|------|-----------|------|
| `date` | string (ISO8601) | No | 今日 | 統計対象日 (YYYY-MM-DD) |

**リクエスト例**:

```http
GET /api/projects/PRJ001/stats?date=2025-11-18
Authorization: Bearer <access_token>
```

#### 3.3.3 レスポンス

**成功 (200 OK)**:

```typescript
interface GetStatsResponse {
  todayIn: number;
  todayOut: number;
  currentInSite: number;
  date: string;  // ISO8601 (YYYY-MM-DD)
}
```

**レスポンス例**:

```json
{
  "todayIn": 45,
  "todayOut": 32,
  "currentInSite": 13,
  "date": "2025-11-18"
}
```

#### 3.3.4 実装詳細

**SQL クエリ例**:

```sql
-- 1クエリで入場/退場を集計
SELECT
  decided_mode,
  COUNT(*) as count
FROM scan_events
WHERE project_id = $1
  AND occurred_at >= $2  -- 今日の00:00:00
  AND occurred_at < $3   -- 明日の00:00:00
  AND transport_status = 'sent'
GROUP BY decided_mode;
```

**TypeScript 実装**:

```typescript
const date = req.query.date || new Date().toISOString().split('T')[0];
const startOfDay = new Date(`${date}T00:00:00Z`);
const endOfDay = new Date(`${date}T23:59:59.999Z`);

const result = await db.query(
  `SELECT decided_mode, COUNT(*) as count
   FROM scan_events
   WHERE project_id = $1
     AND occurred_at >= $2
     AND occurred_at <= $3
     AND transport_status = 'sent'
   GROUP BY decided_mode`,
  [projectId, startOfDay, endOfDay]
);

let todayIn = 0;
let todayOut = 0;

result.rows.forEach(row => {
  if (row.decided_mode === 'IN') todayIn = parseInt(row.count);
  if (row.decided_mode === 'OUT') todayOut = parseInt(row.count);
});

const currentInSite = Math.max(0, todayIn - todayOut);

return res.json({
  todayIn,
  todayOut,
  currentInSite,
  date,
});
```

---

## 4. 認証・認可設計

### 4.1 Keycloak統合

#### 4.1.1 認証フロー

```
[モバイルアプリ]
    ↓ 1. ログイン要求 (OAuth 2.0 Authorization Code Flow)
[Keycloak]
    ↓ 2. アクセストークン発行
[モバイルアプリ]
    ↓ 3. API リクエスト (Bearer token)
[GS Service API]
    ↓ 4. トークン検証
[Keycloak]
    ↓ 5. トークン有効性確認
[GS Service API]
    ↓ 6. API レスポンス
```

#### 4.1.2 トークン検証ミドルウェア

**実装例 (Express)**:

```typescript
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

// Keycloak公開鍵取得クライアント
const jwksClientInstance = jwksClient({
  jwksUri: `${process.env.KEYCLOAK_ISSUER}/protocol/openid-connect/certs`,
  cache: true,
  cacheMaxAge: 3600000, // 1時間キャッシュ
});

// 公開鍵取得
function getKey(header: any, callback: any) {
  jwksClientInstance.getSigningKey(header.kid, (err, key) => {
    if (err) return callback(err);
    const signingKey = key?.getPublicKey();
    callback(null, signingKey);
  });
}

// トークン検証ミドルウェア
export function authenticateToken(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(' ')[1]; // "Bearer <token>"

  if (!token) {
    return res.status(401).json({
      error: 'Unauthorized',
      code: 'MISSING_TOKEN',
      message: 'Access token is required',
    });
  }

  jwt.verify(token, getKey, {
    issuer: process.env.KEYCLOAK_ISSUER,
    audience: process.env.KEYCLOAK_AUDIENCE,
  }, (err, decoded) => {
    if (err) {
      return res.status(401).json({
        error: 'Unauthorized',
        code: 'INVALID_TOKEN',
        message: 'Invalid or expired access token',
      });
    }

    req.user = decoded;
    next();
  });
}
```

#### 4.1.3 プロジェクトアクセス権限チェック

**Keycloak トークンペイロード例**:

```json
{
  "sub": "user-123",
  "name": "山田太郎",
  "preferred_username": "yamada",
  "resource_access": {
    "mc-gate": {
      "roles": ["project:PRJ001", "project:PRJ002"]
    }
  }
}
```

**権限チェックミドルウェア**:

```typescript
export function checkProjectAccess(req: Request, res: Response, next: NextFunction) {
  const projectId = req.params.projectId;
  const userRoles = req.user?.resource_access?.['mc-gate']?.roles || [];

  if (!userRoles.includes(`project:${projectId}`)) {
    return res.status(403).json({
      error: 'Forbidden',
      code: 'INSUFFICIENT_PERMISSIONS',
      message: `No access to project ${projectId}`,
    });
  }

  next();
}
```

**使用例**:

```typescript
app.post('/api/events', authenticateToken, async (req, res) => {
  // トークン検証済み、イベント登録処理
});

app.get('/api/projects/:projectId/events',
  authenticateToken,
  checkProjectAccess,
  async (req, res) => {
    // トークン検証 + プロジェクト権限チェック済み
  }
);
```

### 4.2 APIキー認証（開発環境用）

**開発環境のみ**: Keycloakなしでも動作できるように簡易APIキー認証を提供。

```typescript
export function authenticateApiKey(req: Request, res: Response, next: NextFunction) {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({
      error: 'Forbidden',
      code: 'API_KEY_NOT_ALLOWED',
      message: 'API key authentication is disabled in production',
    });
  }

  const apiKey = req.headers['x-api-key'];

  if (apiKey !== process.env.DEV_API_KEY) {
    return res.status(401).json({
      error: 'Unauthorized',
      code: 'INVALID_API_KEY',
      message: 'Invalid API key',
    });
  }

  // 開発用のダミーユーザー情報を設定
  req.user = {
    sub: 'dev-user',
    name: 'Development User',
    resource_access: {
      'mc-gate': {
        roles: ['project:*'], // 全プロジェクトアクセス可
      },
    },
  };

  next();
}
```

---

## 5. エラーハンドリング

### 5.1 エラーコード定義

| HTTPステータス | エラーコード | 説明 |
|--------------|------------|------|
| 400 | `BAD_REQUEST` | 不正なリクエスト（パラメータ不足など） |
| 401 | `UNAUTHORIZED` | 認証失敗（トークン無効） |
| 401 | `MISSING_TOKEN` | トークン未提供 |
| 401 | `INVALID_TOKEN` | トークン検証失敗 |
| 403 | `FORBIDDEN` | 認可失敗（権限不足） |
| 403 | `INSUFFICIENT_PERMISSIONS` | プロジェクトアクセス権限なし |
| 404 | `NOT_FOUND` | リソースが見つからない |
| 409 | `DUPLICATE_EVENT` | イベント重複 |
| 422 | `VALIDATION_ERROR` | バリデーションエラー |
| 429 | `RATE_LIMIT_EXCEEDED` | レート制限超過 |
| 500 | `INTERNAL_ERROR` | サーバー内部エラー |
| 503 | `SERVICE_UNAVAILABLE` | サービス一時停止 |

### 5.2 エラーレスポンス形式

**標準エラーレスポンス**:

```typescript
interface ErrorResponse {
  error: string;       // エラーメッセージ
  code: string;        // エラーコード
  message?: string;    // 詳細メッセージ
  details?: any;       // 追加情報
  timestamp: string;   // ISO8601
  path: string;        // リクエストパス
}
```

**例 (422 Validation Error)**:

```json
{
  "error": "Validation failed",
  "code": "VALIDATION_ERROR",
  "message": "Request validation failed",
  "details": [
    {
      "field": "occurredAt",
      "message": "Invalid ISO8601 date format",
      "value": "invalid-date"
    },
    {
      "field": "method",
      "message": "Must be one of: QR, CARD, FACE",
      "value": "INVALID"
    }
  ],
  "timestamp": "2025-11-18T12:34:56.789Z",
  "path": "/api/events"
}
```

### 5.3 グローバルエラーハンドラー

**Express エラーハンドラー**:

```typescript
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  // ログ出力
  console.error('[ERROR]', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    body: req.body,
  });

  // エラーレスポンス
  const statusCode = err.statusCode || 500;
  const errorCode = err.code || 'INTERNAL_ERROR';

  res.status(statusCode).json({
    error: err.message || 'Internal server error',
    code: errorCode,
    message: err.details?.message,
    details: err.details?.fields,
    timestamp: new Date().toISOString(),
    path: req.path,
  });
});
```

---

## 6. 技術スタック推奨

### 6.1 フレームワーク

**推奨**: Node.js + TypeScript + Fastify

**理由**:
- **Fastify**: Express より高速（3倍のスループット）
- **TypeScript**: 型安全性、開発効率向上
- **Prisma**: TypeScript-first ORM、マイグレーション管理が容易

**代替案**: Express + TypeScript + Prisma

### 6.2 ORM

**推奨**: Prisma

**Prisma スキーマ例**:

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model ScanEvent {
  id                       String   @id @db.Uuid
  projectId                String   @map("project_id") @db.VarChar(100)
  personId                 String   @map("person_id") @db.VarChar(100)
  method                   String   @db.VarChar(10)
  gateMode                 String   @map("gate_mode") @db.VarChar(10)
  decidedMode              String   @map("decided_mode") @db.VarChar(10)
  occurredAt               DateTime @map("occurred_at") @db.Timestamptz
  ruleResult               Json     @map("rule_result") @db.JsonB
  transportStatus          String   @default("sent") @map("transport_status") @db.VarChar(20)
  transportAttempts        Int      @default(1) @map("transport_attempts")
  transportLastError       String?  @map("transport_last_error") @db.Text
  transportIdempotencyKey  String   @unique @map("transport_idempotency_key") @db.VarChar(255)
  createdAt                DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt                DateTime @updatedAt @map("updated_at") @db.Timestamptz

  @@index([projectId])
  @@index([occurredAt(sort: Desc)])
  @@index([decidedMode])
  @@index([transportIdempotencyKey])
  @@index([projectId, occurredAt(sort: Desc)])
  @@index([projectId, occurredAt, decidedMode, transportStatus])
  @@map("scan_events")
}
```

**マイグレーション生成**:

```bash
npx prisma migrate dev --name init
```

### 6.3 データベース

**推奨**: PostgreSQL 14+

**理由**:
- JSONB型によるクエリ最適化
- パーティショニング対応
- 豊富な拡張機能（pg_stat_statements など）

**代替案**: MySQL 8+ (JSON型、トランザクション対応)

### 6.4 その他ライブラリ

| ライブラリ | 目的 |
|-----------|------|
| `helmet` | セキュリティヘッダー設定 |
| `express-rate-limit` | レート制限 |
| `winston` | 構造化ログ |
| `joi` or `zod` | バリデーション |
| `jsonwebtoken` | JWT検証 |
| `jwks-rsa` | Keycloak公開鍵取得 |
| `dotenv` | 環境変数管理 |

### 6.5 ディレクトリ構造

```
apps/gs-api/
├── src/
│   ├── config/          # 設定ファイル
│   │   ├── database.ts
│   │   └── keycloak.ts
│   ├── middleware/      # ミドルウェア
│   │   ├── auth.ts
│   │   ├── errorHandler.ts
│   │   └── validation.ts
│   ├── routes/          # ルート定義
│   │   ├── events.ts
│   │   └── stats.ts
│   ├── services/        # ビジネスロジック
│   │   ├── eventService.ts
│   │   └── statsService.ts
│   ├── types/           # 型定義
│   │   └── index.ts
│   ├── utils/           # ユーティリティ
│   │   ├── logger.ts
│   │   └── validator.ts
│   └── index.ts         # エントリーポイント
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── .env.example
├── package.json
└── tsconfig.json
```

---

## 7. 実装ステップ

### 7.1 フェーズ1: プロジェクトセットアップ (1日)

1. **Node.js プロジェクト初期化**

```bash
mkdir -p /volume2/Project/MCD3/TUMON/mc-gate/apps/gs-api
cd /volume2/Project/MCD3/TUMON/mc-gate/apps/gs-api

npm init -y
npm install fastify @fastify/cors @fastify/helmet
npm install prisma @prisma/client
npm install dotenv winston jsonwebtoken jwks-rsa
npm install -D typescript @types/node @types/jsonwebtoken ts-node
```

2. **TypeScript 設定**

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

3. **環境変数設定**

```bash
# .env.example
NODE_ENV=development
PORT=7070

DATABASE_URL=postgresql://user:password@localhost:5432/mc_gate
KEYCLOAK_ISSUER=http://localhost:8080/auth/realms/mcd3
KEYCLOAK_AUDIENCE=mc-gate

DEV_API_KEY=dev-secret-key-12345
```

### 7.2 フェーズ2: データベースセットアップ (1日)

1. **Prisma 初期化**

```bash
npx prisma init
```

2. **スキーマ作成** (上記 6.2 参照)

3. **マイグレーション実行**

```bash
npx prisma migrate dev --name init
npx prisma generate
```

### 7.3 フェーズ3: POST /api/events 実装 (2日)

1. **ルート定義** (`src/routes/events.ts`)
2. **サービス実装** (`src/services/eventService.ts`)
3. **バリデーション実装** (`src/middleware/validation.ts`)
4. **テスト作成**

### 7.4 フェーズ4: GET /api/events 実装 (2日)

1. **ルート定義**
2. **サービス実装** (クエリビルダー)
3. **ページネーション実装**
4. **テスト作成**

### 7.5 フェーズ5: GET /api/stats 実装 (1日)

1. **ルート定義**
2. **サービス実装** (集計クエリ)
3. **テスト作成**

### 7.6 フェーズ6: Keycloak統合 (2日)

1. **認証ミドルウェア実装** (上記 4.1.2 参照)
2. **権限チェック実装** (上記 4.1.3 参照)
3. **統合テスト**

### 7.7 フェーズ7: テスト作成 (2日)

1. **ユニットテスト** (Jest)
2. **統合テスト**
3. **E2Eテスト**

### 7.8 フェーズ8: ドキュメント作成 (1日)

1. **OpenAPI 仕様書生成**
2. **README 作成**
3. **デプロイガイド作成**

---

## 8. モバイルアプリ側の変更

### 8.1 現在のモック実装

**ファイル**: `/volume2/Project/MCD3/TUMON/mc-gate/packages/api-client/src/client.ts`

**現状**:
- `sendScanEvent()`: モック実装（500ms遅延、ランダムエラー）
- `sendScanEventWithTimeout()`: 実装例のみ（未使用）

### 8.2 修正方針

#### 8.2.1 環境変数追加

**ファイル**: `/volume2/Project/MCD3/TUMON/mc-gate/apps/mobile/app.config.ts`

```typescript
extra: {
  apiBaseGs: process.env.API_BASE_GS || "http://localhost:7070",
  // ...
}
```

#### 8.2.2 API クライアント修正

**ファイル**: `/volume2/Project/MCD3/TUMON/mc-gate/packages/api-client/src/client.ts`

**変更内容**:

```typescript
import { TIMEOUT, fetchWithTimeout } from "@mc-gate/core";
import Constants from "expo-constants";

// 環境変数から API URL 取得
const API_BASE_URL = Constants.expoConfig?.extra?.apiBaseGs || "http://localhost:7070";

/**
 * スキャンイベントをサーバーに送信（本番実装）
 */
export async function sendScanEvent(
  request: SendScanEventRequest
): Promise<SendScanEventResponse> {
  try {
    const response = await fetchWithTimeout(`${API_BASE_URL}/api/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${request.token}`,
      },
      body: JSON.stringify(request.scanEvent),
      timeoutMs: TIMEOUT.DEFAULT, // 30秒
    });

    if (response.status === 409) {
      // 重複エラー（冪等性により正常扱い）
      const errorData = await response.json();
      return {
        success: true,
        serverReceipt: true,
        message: "イベントは既に登録済みです",
        timestamp: new Date().toISOString(),
      };
    }

    if (!response.ok) {
      const errorData = await response.json();
      throw new ApiError(
        errorData.code || "HTTP_ERROR",
        errorData.error || `HTTP error! status: ${response.status}`,
        response.status,
        errorData.details
      );
    }

    const result = await response.json();
    return {
      success: result.success,
      serverReceipt: true,
      message: result.message || "送信が完了しました",
      timestamp: result.timestamp,
    };
  } catch (error: any) {
    // ネットワークエラー
    if (error.name === "AbortError" || error.message?.includes("timeout")) {
      throw new ApiError(
        "TIMEOUT",
        "サーバーからの応答がタイムアウトしました",
        0
      );
    }

    // その他のエラー
    throw new ApiError(
      "NETWORK_ERROR",
      error.message || "ネットワーク接続に失敗しました",
      0
    );
  }
}

/**
 * ネットワーク接続状態を確認
 */
export async function checkConnection(): Promise<boolean> {
  try {
    const response = await fetchWithTimeout(`${API_BASE_URL}/health`, {
      method: "GET",
      timeoutMs: 5000, // 5秒
    });
    return response.ok;
  } catch {
    return false;
  }
}
```

#### 8.2.3 ヘルスチェックエンドポイント追加（サーバー側）

**ファイル**: `/volume2/Project/MCD3/TUMON/mc-gate/apps/gs-api/src/routes/health.ts`

```typescript
import { FastifyInstance } from 'fastify';

export default async function healthRoutes(fastify: FastifyInstance) {
  fastify.get('/health', async (request, reply) => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version,
    };
  });
}
```

### 8.3 テスト方法

#### 8.3.1 ローカル開発

```bash
# 1. GS APIサーバーを起動
cd apps/gs-api
npm run dev  # http://localhost:7070

# 2. モバイルアプリを起動（別ターミナル）
cd apps/mobile
API_BASE_GS=http://192.168.1.4:7070 npx expo start
```

#### 8.3.2 本番環境

```bash
# eas.json に環境変数を追加
{
  "build": {
    "production": {
      "env": {
        "API_BASE_GS": "https://api.production.example.com"
      }
    }
  }
}
```

---

## 9. 付録: 実装コード例

### 9.1 Fastify サーバー（エントリーポイント）

**ファイル**: `/volume2/Project/MCD3/TUMON/mc-gate/apps/gs-api/src/index.ts`

```typescript
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import eventRoutes from './routes/events';
import statsRoutes from './routes/stats';
import healthRoutes from './routes/health';
import { errorHandler } from './middleware/errorHandler';
import { logger } from './utils/logger';

dotenv.config();

const prisma = new PrismaClient();
const fastify = Fastify({
  logger: true,
});

// ミドルウェア
fastify.register(cors, {
  origin: process.env.CORS_ORIGIN || '*',
});

fastify.register(helmet);

// ルート
fastify.register(healthRoutes);
fastify.register(eventRoutes, { prefix: '/api' });
fastify.register(statsRoutes, { prefix: '/api' });

// エラーハンドラー
fastify.setErrorHandler(errorHandler);

// サーバー起動
const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '7070', 10);
    await fastify.listen({ port, host: '0.0.0.0' });
    logger.info(`Server listening on http://0.0.0.0:${port}`);
  } catch (err) {
    logger.error(err);
    process.exit(1);
  }
};

start();

// Graceful shutdown
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  await fastify.close();
  process.exit(0);
});
```

### 9.2 イベント登録サービス

**ファイル**: `/volume2/Project/MCD3/TUMON/mc-gate/apps/gs-api/src/services/eventService.ts`

```typescript
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

export interface CreateEventRequest {
  id: string;
  projectId: string;
  personId: string;
  method: 'QR' | 'CARD' | 'FACE';
  gateMode: 'IN' | 'OUT';
  decidedMode: 'IN' | 'OUT';
  occurredAt: string;
  ruleResult: {
    action: 'allow' | 'warn' | 'block';
    messages: string[];
    sendToCcus: boolean;
    includeInGs: boolean;
  };
  transport: {
    idempotencyKey: string;
  };
}

export class DuplicateEventError extends Error {
  constructor(public existingEventId: string, public idempotencyKey: string) {
    super('Duplicate event');
    this.name = 'DuplicateEventError';
  }
}

export async function createEvent(data: CreateEventRequest): Promise<{ eventId: string }> {
  // 冪等性チェック
  const existing = await prisma.scanEvent.findUnique({
    where: {
      transportIdempotencyKey: data.transport.idempotencyKey,
    },
  });

  if (existing) {
    throw new DuplicateEventError(existing.id, data.transport.idempotencyKey);
  }

  // イベント作成
  const event = await prisma.scanEvent.create({
    data: {
      id: data.id,
      projectId: data.projectId,
      personId: data.personId,
      method: data.method,
      gateMode: data.gateMode,
      decidedMode: data.decidedMode,
      occurredAt: new Date(data.occurredAt),
      ruleResult: data.ruleResult,
      transportStatus: 'sent',
      transportAttempts: 1,
      transportIdempotencyKey: data.transport.idempotencyKey,
    },
  });

  return { eventId: event.id };
}

export async function getEvents(
  projectId: string,
  filters: {
    dateFrom?: Date;
    dateTo?: Date;
    decidedMode?: 'IN' | 'OUT';
    limit?: number;
    offset?: number;
  }
) {
  const { dateFrom, dateTo, decidedMode, limit = 100, offset = 0 } = filters;

  const where: any = { projectId };

  if (dateFrom || dateTo) {
    where.occurredAt = {};
    if (dateFrom) where.occurredAt.gte = dateFrom;
    if (dateTo) where.occurredAt.lte = dateTo;
  }

  if (decidedMode) {
    where.decidedMode = decidedMode;
  }

  const [events, total] = await Promise.all([
    prisma.scanEvent.findMany({
      where,
      orderBy: { occurredAt: 'desc' },
      take: limit,
      skip: offset,
      select: {
        id: true,
        projectId: true,
        personId: true,
        method: true,
        gateMode: true,
        decidedMode: true,
        occurredAt: true,
        ruleResult: true,
      },
    }),
    prisma.scanEvent.count({ where }),
  ]);

  return {
    events: events.map(e => ({
      ...e,
      occurredAt: e.occurredAt.toISOString(),
    })),
    total,
    hasMore: offset + limit < total,
  };
}

export async function getStats(projectId: string, date: string) {
  const startOfDay = new Date(`${date}T00:00:00Z`);
  const endOfDay = new Date(`${date}T23:59:59.999Z`);

  const result = await prisma.$queryRaw<{ decided_mode: string; count: bigint }[]>`
    SELECT decided_mode, COUNT(*) as count
    FROM scan_events
    WHERE project_id = ${projectId}
      AND occurred_at >= ${startOfDay}
      AND occurred_at <= ${endOfDay}
      AND transport_status = 'sent'
    GROUP BY decided_mode
  `;

  let todayIn = 0;
  let todayOut = 0;

  result.forEach(row => {
    const count = Number(row.count);
    if (row.decided_mode === 'IN') todayIn = count;
    if (row.decided_mode === 'OUT') todayOut = count;
  });

  return {
    todayIn,
    todayOut,
    currentInSite: Math.max(0, todayIn - todayOut),
    date,
  };
}
```

### 9.3 イベント登録ルート

**ファイル**: `/volume2/Project/MCD3/TUMON/mc-gate/apps/gs-api/src/routes/events.ts`

```typescript
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createEvent, getEvents, DuplicateEventError } from '../services/eventService';
import { authenticateToken } from '../middleware/auth';
import { validateCreateEvent } from '../middleware/validation';

export default async function eventRoutes(fastify: FastifyInstance) {
  // POST /api/events
  fastify.post('/events', {
    preHandler: [authenticateToken, validateCreateEvent],
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { eventId } = await createEvent(request.body as any);

        return reply.status(200).send({
          success: true,
          eventId,
          message: 'Event received successfully',
          timestamp: new Date().toISOString(),
        });
      } catch (error: any) {
        if (error instanceof DuplicateEventError) {
          return reply.status(409).send({
            error: 'Duplicate event',
            code: 'DUPLICATE_EVENT',
            details: {
              idempotencyKey: error.idempotencyKey,
              existingEventId: error.existingEventId,
            },
          });
        }

        throw error;
      }
    },
  });

  // GET /api/projects/:projectId/events
  fastify.get('/projects/:projectId/events', {
    preHandler: [authenticateToken],
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      const { projectId } = request.params as { projectId: string };
      const query = request.query as any;

      const result = await getEvents(projectId, {
        dateFrom: query.dateFrom ? new Date(query.dateFrom) : undefined,
        dateTo: query.dateTo ? new Date(query.dateTo) : undefined,
        decidedMode: query.decidedMode,
        limit: query.limit ? parseInt(query.limit) : 100,
        offset: query.offset ? parseInt(query.offset) : 0,
      });

      return reply.send({
        ...result,
        metadata: {
          projectId,
          dateFrom: query.dateFrom,
          dateTo: query.dateTo,
          decidedMode: query.decidedMode,
          limit: query.limit || 100,
          offset: query.offset || 0,
        },
      });
    },
  });
}
```

### 9.4 バリデーションミドルウェア

**ファイル**: `/volume2/Project/MCD3/TUMON/mc-gate/apps/gs-api/src/middleware/validation.ts`

```typescript
import { FastifyRequest, FastifyReply } from 'fastify';
import Joi from 'joi';

const createEventSchema = Joi.object({
  id: Joi.string().uuid().required(),
  projectId: Joi.string().max(100).required(),
  personId: Joi.string().max(100).required(),
  method: Joi.string().valid('QR', 'CARD', 'FACE').required(),
  gateMode: Joi.string().valid('IN', 'OUT').required(),
  decidedMode: Joi.string().valid('IN', 'OUT').required(),
  occurredAt: Joi.date().iso().max('now').required(),
  ruleResult: Joi.object({
    action: Joi.string().valid('allow', 'warn', 'block').required(),
    messages: Joi.array().items(Joi.string()).required(),
    sendToCcus: Joi.boolean().required(),
    includeInGs: Joi.boolean().required(),
  }).required(),
  transport: Joi.object({
    idempotencyKey: Joi.string().max(255).required(),
  }).required(),
});

export async function validateCreateEvent(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const { error, value } = createEventSchema.validate(request.body, {
    abortEarly: false,
  });

  if (error) {
    return reply.status(422).send({
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      details: error.details.map(d => ({
        field: d.path.join('.'),
        message: d.message,
        value: d.context?.value,
      })),
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }

  request.body = value;
}
```

---

## まとめ

本設計書は、mc-gateプロジェクトのGS Service バックエンドAPIを実装するための完全な設計を提供します。

### 主要な実装ポイント

1. **データベース設計**: PostgreSQL/MySQLで冪等性を保証するスキーマ
2. **REST API**: 3つのエンドポイント（イベント登録、履歴取得、統計取得）
3. **認証・認可**: Keycloak統合によるBearer token検証
4. **エラーハンドリング**: 標準化されたエラーレスポンス
5. **技術スタック**: Fastify + Prisma + PostgreSQL

### 実装期間見積もり

- **フェーズ1-2**: プロジェクトセットアップ + データベース (2日)
- **フェーズ3-5**: API実装 (5日)
- **フェーズ6**: Keycloak統合 (2日)
- **フェーズ7-8**: テスト + ドキュメント (3日)
- **合計**: 約12日（約2.5週間）

### 次のステップ

1. 本設計書をレビュー
2. 技術スタック承認
3. 実装開始（フェーズ1から順次）
4. モバイルアプリ側の接続テスト
5. 本番デプロイ

---

**作成者**: Claude Code
**最終更新**: 2025-11-18
