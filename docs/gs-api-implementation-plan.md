# GS API 実装計画書

**作成日**: 2025-11-19
**作成者**: Claude (SPARC Architect Mode)
**対象期間**: 2週間（2025-11-20 〜 2025-12-03）

---

## 📋 目次

1. [プロジェクト概要](#プロジェクト概要)
2. [現状分析](#現状分析)
3. [実装スコープ](#実装スコープ)
4. [技術スタック](#技術スタック)
5. [実装計画](#実装計画)
6. [チェックリスト](#チェックリスト)
7. [リスク管理](#リスク管理)
8. [検証計画](#検証計画)

---

## プロジェクト概要

### 目的
GS API（Gate Service API）の本番環境実装を完了し、モバイルアプリとの統合を完成させる。

### 目標
- ✅ PostgreSQL + Prisma による永続化層の実装
- ✅ Keycloak OAuth 2.0 認証の実装
- ✅ Redis キャッシュによるパフォーマンス最適化
- ✅ Docker Compose による本番デプロイ
- ✅ OpenAPI 仕様書に基づいた完全な実装

### 成果物
1. **アーキテクチャ設計書** (`gs-api-architecture.md`) ✅ 完成
2. **OpenAPI 仕様書** (`gs-api-openapi.yaml`) ✅ 完成
3. **実装済みバックエンドコード** (Express + PostgreSQL + Prisma)
4. **Docker Compose 構成** (GS API + PostgreSQL + Redis + Keycloak)
5. **統合テスト** (Postman/Newman)
6. **デプロイメントガイド** (README.md)

---

## 現状分析

### 実装済み機能（Development）

| 項目 | 技術 | 状態 | 備考 |
|------|------|------|------|
| Runtime | Node.js 22.x | ✅ | - |
| Framework | Express 4.18.x | ✅ | - |
| Database | SQLite (better-sqlite3) | 🟡 | 開発環境専用 |
| Auth | API Key | 🟡 | 簡易認証 |
| POST /api/events | 実装済み | ✅ | 冪等性対応 |
| GET /api/projects/:id/events | 実装済み | ✅ | ページネーション対応 |
| GET /api/projects/:id/stats | 実装済み | ✅ | 統計取得 |
| GET /api/workers | 実装済み | ✅ | 作業員マスタ |
| CORS | 実装済み | ✅ | 開発/本番切り替え |
| Timeout | 実装済み | ✅ | 60秒 |

### 未実装機能（本番環境で必須）

| 項目 | 優先度 | 備考 |
|------|--------|------|
| PostgreSQL 移行 | 🔴 高 | SQLiteは本番非推奨 |
| Prisma ORM | 🔴 高 | 型安全・マイグレーション |
| Keycloak OAuth | 🔴 高 | JWT検証 |
| Redis キャッシュ | 🟡 中 | パフォーマンス最適化 |
| Helmet セキュリティ | 🔴 高 | XSS/CSRF対策 |
| Rate Limit | 🟡 中 | DDoS対策 |
| Compression | 🟢 低 | レスポンス圧縮 |
| Logging | 🔴 高 | Winston + Loki |
| Monitoring | 🟡 中 | Prometheus + Grafana |

---

## 実装スコープ

### Phase 1: インフラ構築（Week 1: Day 1-5）

#### Day 1-2: PostgreSQL + Prisma セットアップ

**タスク**:
1. Prisma CLI インストール
2. Prisma Schema 定義
3. PostgreSQL コンテナ起動
4. 初期マイグレーション実行
5. Seed データ作成

**成果物**:
- `prisma/schema.prisma`
- `prisma/migrations/`
- `prisma/seed.ts`
- `docker-compose.yml` (PostgreSQL)

**コマンド**:
```bash
# Prisma インストール
cd apps/gs-api
pnpm add prisma @prisma/client
pnpm add -D @types/node

# Prisma 初期化
npx prisma init

# Schema 作成（後述）
vim prisma/schema.prisma

# PostgreSQL 起動
docker-compose up -d postgres

# マイグレーション実行
npx prisma migrate dev --name init

# Prisma Client 生成
npx prisma generate

# Seed 実行
npx prisma db seed
```

**Prisma Schema** (`prisma/schema.prisma`):
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Project {
  id              String        @id
  name            String
  gateMode        String        @map("gate_mode")
  scanMethodLock  String?       @map("scan_method_lock")
  gateModeLock    String?       @map("gate_mode_lock")
  checkConfig     Json          @map("check_config")
  serverLock      Boolean       @default(false) @map("server_lock")
  createdAt       DateTime      @default(now()) @map("created_at")
  updatedAt       DateTime      @updatedAt @map("updated_at")
  scanEvents      ScanEvent[]

  @@index([name])
  @@map("projects")
}

model Worker {
  personId         String        @id @map("person_id")
  name             String
  company          String
  ccusId           String?       @unique @map("ccus_id")
  ccusRegistered   Boolean       @default(false) @map("ccus_registered")
  socialInsurance  Boolean       @default(false) @map("social_insurance")
  residencyExpiry  DateTime?     @map("residency_expiry") @db.Date
  age              Int?
  isSoleProprietor Boolean       @default(false) @map("is_sole_proprietor")
  faceEmbedding    Float[]?      @map("face_embedding")
  faceImageUrl     String?       @map("face_image_url")
  createdAt        DateTime      @default(now()) @map("created_at")
  updatedAt        DateTime      @updatedAt @map("updated_at")
  scanEvents       ScanEvent[]

  @@index([name])
  @@index([company])
  @@index([ccusId])
  @@index([updatedAt])
  @@map("workers")
}

model ScanEvent {
  id                        String   @id
  projectId                 String   @map("project_id")
  personId                  String   @map("person_id")
  method                    String
  gateMode                  String   @map("gate_mode")
  decidedMode               String   @map("decided_mode")
  occurredAt                DateTime @map("occurred_at")
  ruleResult                Json     @map("rule_result")
  transportStatus           String   @default("pending") @map("transport_status")
  transportAttempts         Int      @default(0) @map("transport_attempts")
  transportLastError        String?  @map("transport_last_error")
  transportIdempotencyKey   String   @unique @map("transport_idempotency_key")
  createdAt                 DateTime @default(now()) @map("created_at")
  updatedAt                 DateTime @updatedAt @map("updated_at")

  project   Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  worker    Worker  @relation(fields: [personId], references: [personId], onDelete: Restrict)

  @@index([projectId, occurredAt(sort: Desc)])
  @@index([personId, occurredAt(sort: Desc)])
  @@index([transportStatus])
  @@index([transportIdempotencyKey])
  @@index([projectId, decidedMode, occurredAt], name: "idx_stats")
  @@map("scan_events")
}
```

#### Day 3-4: Redis セットアップ

**タスク**:
1. Redis コンテナ起動
2. ioredis クライアント実装
3. Cache-Aside パターン実装
4. Stats API にキャッシュ適用

**成果物**:
- `src/lib/redis.ts`
- `src/services/cache.service.ts`

**コマンド**:
```bash
# ioredis インストール
pnpm add ioredis
pnpm add -D @types/ioredis

# Redis 起動
docker-compose up -d redis
```

**Redis Client** (`src/lib/redis.ts`):
```typescript
import Redis from 'ioredis';

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: Number(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
});

redis.on('connect', () => {
  console.log('✅ Redis connected');
});

redis.on('error', (err) => {
  console.error('❌ Redis error:', err);
});

export default redis;
```

#### Day 5: Keycloak セットアップ

**タスク**:
1. Keycloak コンテナ起動
2. Realm/Client 作成
3. テストユーザー作成
4. JWKS 公開鍵取得確認

**成果物**:
- Keycloak Realm エクスポート (`keycloak-realm.json`)
- テストユーザー一覧

**コマンド**:
```bash
# Keycloak 起動
docker-compose up -d keycloak

# ブラウザで Keycloak 管理画面を開く
open http://localhost:8080

# Realm 作成: mcd3
# Client 作成: mc-gate-mobile (public, redirect URIs: mcgate://*)
# Role 作成: gate-user, gate-admin
# User 作成: testuser (password: testpass, role: gate-user)
```

---

### Phase 2: アプリケーション実装（Week 2: Day 6-10）

#### Day 6-7: Prisma Repository 実装

**タスク**:
1. Repository パターン設計
2. EventRepository 実装
3. WorkerRepository 実装
4. ProjectRepository 実装
5. SQLiteからPrismaへ差し替え

**成果物**:
- `src/repositories/event.repository.ts`
- `src/repositories/worker.repository.ts`
- `src/repositories/project.repository.ts`

**Event Repository** (`src/repositories/event.repository.ts`):
```typescript
import { PrismaClient, ScanEvent } from '@prisma/client';
import type { ScanEvent as ScanEventDTO } from '../types';

export class EventRepository {
  constructor(private prisma: PrismaClient) {}

  async create(event: ScanEventDTO): Promise<ScanEvent> {
    return this.prisma.scanEvent.create({
      data: {
        id: event.id,
        projectId: event.projectId,
        personId: event.personId,
        method: event.method,
        gateMode: event.gateMode,
        decidedMode: event.decidedMode,
        occurredAt: new Date(event.occurredAt),
        ruleResult: event.ruleResult,
        transportStatus: event.transport.status,
        transportAttempts: event.transport.attempts,
        transportLastError: event.transport.lastError,
        transportIdempotencyKey: event.transport.idempotencyKey,
      },
    });
  }

  async findByIdempotencyKey(key: string): Promise<ScanEvent | null> {
    return this.prisma.scanEvent.findUnique({
      where: { transportIdempotencyKey: key },
    });
  }

  async findByProject(
    projectId: string,
    filters: {
      dateFrom?: Date;
      dateTo?: Date;
      decidedMode?: string;
      limit: number;
      offset: number;
    }
  ): Promise<{ events: ScanEvent[]; total: number }> {
    const where: any = { projectId };

    if (filters.dateFrom) {
      where.occurredAt = { ...where.occurredAt, gte: filters.dateFrom };
    }

    if (filters.dateTo) {
      where.occurredAt = { ...where.occurredAt, lte: filters.dateTo };
    }

    if (filters.decidedMode) {
      where.decidedMode = filters.decidedMode;
    }

    const [events, total] = await Promise.all([
      this.prisma.scanEvent.findMany({
        where,
        orderBy: { occurredAt: 'desc' },
        take: filters.limit,
        skip: filters.offset,
      }),
      this.prisma.scanEvent.count({ where }),
    ]);

    return { events, total };
  }

  async getStats(projectId: string, date: Date): Promise<{
    todayIn: number;
    todayOut: number;
    currentInSite: number;
  }> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const stats = await this.prisma.scanEvent.groupBy({
      by: ['decidedMode'],
      where: {
        projectId,
        occurredAt: { gte: startOfDay },
        transportStatus: 'sent',
      },
      _count: { id: true },
    });

    let todayIn = 0;
    let todayOut = 0;

    stats.forEach((stat) => {
      if (stat.decidedMode === 'IN') todayIn = stat._count.id;
      if (stat.decidedMode === 'OUT') todayOut = stat._count.id;
    });

    return {
      todayIn,
      todayOut,
      currentInSite: Math.max(0, todayIn - todayOut),
    };
  }
}
```

#### Day 8-9: OAuth JWT 検証実装

**タスク**:
1. jwks-rsa ライブラリ導入
2. JWT検証ミドルウェア実装
3. 既存のauthMiddleware差し替え
4. Postmanで動作確認

**成果物**:
- `src/middleware/jwt.middleware.ts`

**コマンド**:
```bash
# jwt-decode / jwks-rsa インストール
pnpm add jsonwebtoken jwks-rsa
pnpm add -D @types/jsonwebtoken @types/jwks-rsa
```

**JWT Middleware** (`src/middleware/jwt.middleware.ts`):
```typescript
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import jwksRsa from 'jwks-rsa';

const jwksClient = jwksRsa({
  jwksUri: `${process.env.KEYCLOAK_URL}/realms/mcd3/protocol/openid-connect/certs`,
  cache: true,
  cacheMaxAge: 600000, // 10分
});

function getKey(header: any, callback: any) {
  jwksClient.getSigningKey(header.kid, (err, key) => {
    if (err) {
      return callback(err);
    }
    const signingKey = key?.getPublicKey();
    callback(null, signingKey);
  });
}

export async function jwtMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader?.replace(/^Bearer\s+/i, '');

  if (!token) {
    return res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Missing authorization token',
    });
  }

  try {
    const decoded = await new Promise((resolve, reject) => {
      jwt.verify(
        token,
        getKey,
        {
          audience: 'mc-gate-mobile',
          issuer: `${process.env.KEYCLOAK_URL}/realms/mcd3`,
          algorithms: ['RS256'],
        },
        (err, decoded) => {
          if (err) reject(err);
          else resolve(decoded);
        }
      );
    });

    // ユーザー情報をreq.userに格納
    (req as any).user = decoded;
    next();
  } catch (error: any) {
    console.error('JWT verification failed:', error.message);
    return res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Invalid or expired token',
    });
  }
}
```

#### Day 10: セキュリティ強化

**タスク**:
1. Helmet ミドルウェア導入
2. Rate Limit 実装
3. Compression 実装
4. 環境変数検証（Joi/Zod）

**成果物**:
- `src/middleware/security.middleware.ts`
- `src/lib/env.ts`

**コマンド**:
```bash
# セキュリティライブラリインストール
pnpm add helmet express-rate-limit compression joi
pnpm add -D @types/compression @types/joi
```

**Security Middleware** (`src/middleware/security.middleware.ts`):
```typescript
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import compression from 'compression';

export const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
});

export const rateLimitMiddleware = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分
  max: 100, // 100リクエスト/15分
  message: {
    error: 'TOO_MANY_REQUESTS',
    message: 'Too many requests, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const compressionMiddleware = compression({
  level: 6,
  threshold: 1024, // 1KB以上を圧縮
});
```

---

## チェックリスト

### Phase 1: インフラ構築

- [ ] PostgreSQL コンテナ起動確認
- [ ] Prisma Schema 定義完了
- [ ] 初期マイグレーション実行
- [ ] Seed データ投入
- [ ] Prisma Client 生成確認
- [ ] Redis コンテナ起動確認
- [ ] Redis 接続確認
- [ ] Keycloak コンテナ起動確認
- [ ] Realm/Client 作成完了
- [ ] テストユーザー作成完了
- [ ] JWKS エンドポイント確認

### Phase 2: アプリケーション実装

- [ ] EventRepository 実装
- [ ] WorkerRepository 実装
- [ ] ProjectRepository 実装
- [ ] SQLite → Prisma 差し替え完了
- [ ] キャッシュサービス実装
- [ ] Stats API にキャッシュ適用
- [ ] JWT検証ミドルウェア実装
- [ ] API Key → JWT 差し替え完了
- [ ] Helmet 導入
- [ ] Rate Limit 導入
- [ ] Compression 導入
- [ ] 環境変数検証実装

### 統合テスト

- [ ] POST /api/events (Bearer Token)
- [ ] POST /api/events (冪等性確認)
- [ ] GET /api/projects/:id/events
- [ ] GET /api/projects/:id/stats (キャッシュ確認)
- [ ] GET /api/workers
- [ ] 401 Unauthorized (トークン無し)
- [ ] 403 Forbidden (無効なトークン)
- [ ] 429 Too Many Requests (レート制限)

---

## リスク管理

| リスク | 影響度 | 確率 | 対策 |
|--------|--------|------|------|
| Prisma マイグレーション失敗 | 高 | 中 | SQLite → PostgreSQL DDL を事前作成 |
| Keycloak 設定ミス | 高 | 中 | 設定手順書を作成、Realm エクスポート |
| JWT検証エラー | 高 | 中 | Postman で事前テスト、モックモード維持 |
| Redis 接続失敗 | 中 | 低 | フォールバック（DB直接） |
| パフォーマンス劣化 | 中 | 中 | インデックス最適化、EXPLAIN ANALYZE |
| 環境変数不足 | 中 | 高 | Joi でバリデーション、.env.example 作成 |

---

## 検証計画

### 1. 単体テスト（Jest）

**対象**:
- EventRepository
- WorkerRepository
- ProjectRepository
- CacheService
- JWT検証ミドルウェア

**コマンド**:
```bash
pnpm test
```

### 2. 統合テスト（Postman/Newman）

**シナリオ**:
1. Keycloak でトークン取得
2. POST /api/events（新規作成）
3. POST /api/events（冪等確認）
4. GET /api/projects/:id/events
5. GET /api/projects/:id/stats（初回・キャッシュ）
6. 無効なトークンで 401 確認

**Postman Collection**:
```json
{
  "info": {
    "name": "GS API Integration Tests",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "1. Get Keycloak Token",
      "request": {
        "method": "POST",
        "url": "http://localhost:8080/realms/mcd3/protocol/openid-connect/token",
        "body": {
          "mode": "urlencoded",
          "urlencoded": [
            { "key": "grant_type", "value": "password" },
            { "key": "client_id", "value": "mc-gate-mobile" },
            { "key": "username", "value": "testuser" },
            { "key": "password", "value": "testpass" }
          ]
        }
      },
      "event": [
        {
          "listen": "test",
          "script": {
            "exec": [
              "pm.test(\"Token acquired\", function() {",
              "  pm.response.to.have.status(200);",
              "  var json = pm.response.json();",
              "  pm.environment.set(\"access_token\", json.access_token);",
              "});"
            ]
          }
        }
      ]
    },
    {
      "name": "2. POST /api/events",
      "request": {
        "method": "POST",
        "url": "http://localhost:7070/api/events",
        "header": [
          { "key": "Authorization", "value": "Bearer {{access_token}}" }
        ],
        "body": {
          "mode": "raw",
          "raw": "{\"id\":\"test-event-001\",\"projectId\":\"PRJ001\",\"personId\":\"W001\",\"method\":\"QR\",\"gateMode\":\"IN\",\"decidedMode\":\"IN\",\"occurredAt\":\"2025-11-19T10:30:00.000Z\",\"ruleResult\":{\"action\":\"allow\",\"messages\":[],\"sendToCcus\":true,\"includeInGs\":true},\"transport\":{\"status\":\"sent\",\"attempts\":1,\"idempotencyKey\":\"test-key-001\"}}"
        }
      },
      "event": [
        {
          "listen": "test",
          "script": {
            "exec": [
              "pm.test(\"Event created\", function() {",
              "  pm.response.to.have.status(201);",
              "});"
            ]
          }
        }
      ]
    }
  ]
}
```

### 3. パフォーマンステスト（k6）

**シナリオ**:
- 100 VUs（仮想ユーザー）
- 10分間継続
- POST /api/events（60%）
- GET /api/stats（30%）
- GET /api/events（10%）

**k6 Script** (`performance-test.js`):
```javascript
import http from 'k6/http';
import { check } from 'k6';

export let options = {
  vus: 100,
  duration: '10m',
};

const BASE_URL = 'http://localhost:7070';
const TOKEN = __ENV.ACCESS_TOKEN;

export default function () {
  const rand = Math.random();

  if (rand < 0.6) {
    // POST /api/events (60%)
    const payload = JSON.stringify({
      id: `event-${Date.now()}-${Math.random()}`,
      projectId: 'PRJ001',
      personId: 'W001',
      method: 'QR',
      gateMode: 'IN',
      decidedMode: 'IN',
      occurredAt: new Date().toISOString(),
      ruleResult: {
        action: 'allow',
        messages: [],
        sendToCcus: true,
        includeInGs: true,
      },
      transport: {
        status: 'sent',
        attempts: 1,
        idempotencyKey: `key-${Date.now()}-${Math.random()}`,
      },
    });

    const res = http.post(`${BASE_URL}/api/events`, payload, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TOKEN}`,
      },
    });

    check(res, { 'POST /api/events status 201': (r) => r.status === 201 });
  } else if (rand < 0.9) {
    // GET /api/stats (30%)
    const res = http.get(`${BASE_URL}/api/projects/PRJ001/stats`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });

    check(res, { 'GET /api/stats status 200': (r) => r.status === 200 });
  } else {
    // GET /api/events (10%)
    const res = http.get(`${BASE_URL}/api/projects/PRJ001/events?limit=20`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });

    check(res, { 'GET /api/events status 200': (r) => r.status === 200 });
  }
}
```

**実行**:
```bash
# トークン取得
export ACCESS_TOKEN=$(curl -s -X POST \
  http://localhost:8080/realms/mcd3/protocol/openid-connect/token \
  -d "grant_type=password&client_id=mc-gate-mobile&username=testuser&password=testpass" \
  | jq -r '.access_token')

# k6 実行
k6 run performance-test.js
```

---

## 次のステップ

1. **Week 1 開始**: PostgreSQL + Prisma セットアップ
2. **Week 2 開始**: OAuth JWT 実装
3. **Week 2 終了**: 統合テスト完了
4. **Week 3**: モバイルアプリとの統合テスト
5. **Week 4**: 本番デプロイ

---

**承認者**: 村山慶伍 (BME Consulting)
**レビュー日**: 2025-11-19
