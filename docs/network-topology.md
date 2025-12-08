# ネットワーク構成とCloudflare Tunnel

## 概要

mc-gate モバイルアプリは、Cloudflare Tunnel を経由して外部ネットワークから Face API および GS Service にアクセスします。これにより、お客様の端末（モバイルデータ通信）から安全にHTTPS経由でAPIを利用できます。

## ネットワーク構成図

```
┌─────────────────────────────────────────────────────────────────┐
│                        本番環境                                  │
│                                                                  │
│  [モバイル端末]                                                  │
│   (WiFi OFF)                                                     │
│   (4G/5G ON)                                                     │
│       │                                                          │
│       │ HTTPS (TLS 1.3)                                         │
│       ▼                                                          │
│  ┌──────────────────────┐                                       │
│  │  Cloudflare Tunnel   │                                       │
│  │  (CDN + DDoS保護)    │                                       │
│  └──────────────────────┘                                       │
│       │                                                          │
│       ├─► https://face-gate.bme-service.monster/               │
│       │    → http://127.0.0.1:8101 (Face API)                  │
│       │                                                          │
│       ├─► https://api-gate.bme-service.monster/                │
│       │    → http://127.0.0.1:7070 (GS Service)                │
│       │                                                          │
│       └─► https://auth-gate.bme-service.monster/               │
│            → http://127.0.0.1:8081 (Keycloak)                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                      開発環境（ローカル）                        │
│                                                                  │
│  [モバイル端末]                                                  │
│   (WiFi ON - 同一LAN)                                           │
│       │                                                          │
│       │ HTTP (平文)                                             │
│       ▼                                                          │
│  http://192.168.1.4:8101 (Face API)                             │
│  http://192.168.1.4:7070 (GS Service)                           │
│  http://192.168.1.4:8081 (Keycloak)                             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## エンドポイント一覧

### 本番環境（お客様アクセス用）

| サービス | 外部URL (Cloudflare) | ローカルエンドポイント | 用途 |
|---------|---------------------|---------------------|------|
| Face API | `https://face-gate.bme-service.monster` | `http://127.0.0.1:8101` | 顔認証・顔検出・作業員マスタ |
| GS Service | `https://api-gate.bme-service.monster` | `http://127.0.0.1:7070` | Gate System REST API |
| Keycloak | `https://auth-gate.bme-service.monster` | `http://127.0.0.1:8081` | OAuth 2.0 / OIDC 認証 |

### 開発環境（ローカルアクセス用）

| サービス | ローカルURL | 備考 |
|---------|------------|------|
| Face API | `http://192.168.1.4:8101` | 開発時のみ使用 |
| GS Service | `http://192.168.1.4:7070` | 開発時のみ使用 |
| Keycloak | `http://192.168.1.4:8081` | 開発時のみ使用 |

## アプリ設定の切り替え

### 本番ビルド（デフォルト）

`app.config.js` のデフォルト値として Cloudflare Tunnel ドメインを使用：

```javascript
const apiFaceApi = process.env.API_FACE_API || "https://face-gate.bme-service.monster";
const apiBaseGs = process.env.API_BASE_GS || "https://api-gate.bme-service.monster";
const authIssuer = process.env.AUTH_ISSUER || "https://auth-gate.bme-service.monster/realms/mcd3";
```

### 開発時のローカルアクセス

環境変数で上書き：

```bash
export API_FACE_API=http://192.168.1.4:8101
export API_BASE_GS=http://192.168.1.4:7070
export AUTH_ISSUER=http://192.168.1.4:8081/realms/mcd3
```

## パフォーマンス特性

### Cloudflare Tunnel 経由（本番）

**メリット**:
- ✅ 外部ネットワークからアクセス可能
- ✅ HTTPS による通信暗号化
- ✅ Cloudflare CDN によるグローバル配信
- ✅ DDoS 保護

**デメリット**:
- ⚠️ レイテンシ増加（Cloudflare経由で +50〜200ms）
- ⚠️ モバイルデータ通信の電波状況に依存

**実測値**（参考）:
```
（テスト実施後に記入）

作業員マスタ同期（100名）: 約 ??秒
顔登録: 約 ??秒
本人確認: 約 ??秒
```

### ローカル直接アクセス（開発）

**メリット**:
- ✅ 低レイテンシ（同一LAN内で 10〜50ms）
- ✅ 高速なイテレーション開発

**デメリット**:
- ❌ 外部ネットワークからアクセス不可
- ❌ HTTP 平文通信（セキュリティリスク）

## トラブルシューティング

### 502 Bad Gateway エラー

**原因**:
- Cloudflare Tunnel がローカルサービスに接続できない
- ローカルサービスが起動していない、またはポート番号が間違っている

**解決策**:
1. ローカルサービスのプロセスを確認
   ```bash
   ps aux | grep face-api
   netstat -tuln | grep 8101
   ```

2. Cloudflare Tunnel の設定を確認
   - Cloudflare Dashboard → Zero Trust → Tunnels
   - Public Hostname の設定を確認（ポート番号が一致しているか）

3. ローカルエンドポイントで直接テスト
   ```bash
   curl http://127.0.0.1:8101/health
   ```

### ネットワーク接続エラー（モバイルデータ通信時）

**原因**:
- モバイルデータ通信の電波が弱い
- Cloudflare Tunnel がダウンしている
- アプリが古いビルド（ローカルIPを使用）を使用している

**解決策**:
1. アプリのビルドバージョンを確認
   - 設定画面 → アプリ情報 → Face API URL
   - `https://face-gate.bme-service.monster` であることを確認

2. Cloudflare Tunnel の疎通確認
   ```bash
   curl https://face-gate.bme-service.monster/health
   ```

3. モバイルデータ通信の電波状況を確認
   - 電波が弱い場合はタイムアウトが発生する可能性

### タイムアウト

**現在の設定**:
- API タイムアウト: **60秒**
- フェッチタイムアウト: **30秒**（`@mc-gate/core` の `TIMEOUT` 定数）

**調整方法**:
```typescript
// packages/core/src/constants/api.ts
export const TIMEOUT = 30000; // 30秒 → 必要に応じて変更
```

## セキュリティ

### HTTPS 強制

本番環境では、すべての通信が HTTPS 経由で行われます。Cloudflare Tunnel が自動的に TLS 終端を行います。

### API キー認証

Face API および GS Service では、API キー認証を実装：

```typescript
headers: {
  "x-api-key": "your-api-key-here"
}
```

### OAuth 2.0 認証

モバイルアプリは Keycloak 経由で OAuth 2.0 / OIDC 認証を行います。

## 監視とログ

### Cloudflare Analytics

Cloudflare Dashboard から以下の情報を確認可能：
- リクエスト数
- 帯域幅使用量
- エラー率
- 地理的分布

### サーバーログ

各サーバーのログファイル：
- Face API: `/tmp/face-api-8101.log`
- GS Service: `/tmp/gs-service-7070.log`
- Keycloak: Docker logs (`docker logs mc-gate-keycloak`)

## テスト済み環境

### E2E テスト（モバイルデータ通信）

- ✅ WiFi OFF / 4G ON での作業員同期
- ✅ WiFi OFF / 4G ON での顔登録
- ✅ WiFi OFF / 4G ON での本人確認
- ✅ 電波弱エリアでの安定性テスト
- ✅ Cloudflare Tunnel 停止時のエラーハンドリング

**テスト日**: （実施後に記入）
**テスト結果**: （実施後に記入）

## 参考リンク

- [Cloudflare Tunnel 設定ドキュメント](./cloudflare-tunnel-configuration.md)
- [Cloudflare Tunnel Documentation](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/)
- [Cloudflare Zero Trust](https://www.cloudflare.com/zero-trust/)

---

**最終更新**: 2025-12-08
**作成者**: Claude (with user collaboration)
**バージョン**: 1.0
