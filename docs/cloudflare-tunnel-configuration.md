# Cloudflare Tunnel 設定ドキュメント

## 概要

mc-gate プロジェクトでは、Cloudflare Tunnel を使用してローカルサーバーを外部公開しています。
これにより、お客様の端末から HTTPS 経由で安全にアクセス可能になります。

## Tunnel 設定

### Public Hostnames（公開ホスト名）

| サブドメイン | ローカルエンドポイント | 用途 | 備考 |
|-------------|---------------------|------|------|
| `api-gate.bme-service.monster` | `http://127.0.0.1:7070` | GS Service API | Gate System の REST API |
| `face-gate.bme-service.monster` | `http://127.0.0.1:8100` | Face API | 顔認証・顔検出 API |
| `auth-gate.bme-service.monster` | `http://127.0.0.1:8081` | Keycloak 認証 | OAuth 2.0 / OIDC 認証サーバー |

### Catch-all Rule（キャッチオールルール）

未定義のパスへのアクセスは `http_status:404` を返す。

## アプリケーション設定

### モバイルアプリ（apps/mobile/app.config.js）

```javascript
// 外部公開用ドメイン（Cloudflare Tunnel 経由）
const apiBaseGs = process.env.API_BASE_GS || "https://api-gate.bme-service.monster";
const apiBaseCcus = process.env.API_BASE_CCUS || "https://api-gate.bme-service.monster";
const apiFaceApi = process.env.API_FACE_API || "https://face-gate.bme-service.monster";
const authIssuer = process.env.AUTH_ISSUER || "https://auth-gate.bme-service.monster/realms/mcd3";
```

### ローカル開発時の設定

ローカル開発時は、環境変数で上書きしてローカル IP を使用できます：

```bash
# 例: ローカル IP で Face API にアクセス
export API_FACE_API=http://192.168.1.4:8101
export API_BASE_GS=http://192.168.1.4:7070
export AUTH_ISSUER=http://192.168.1.4:8081/realms/mcd3
```

## サーバー起動コマンド

### Face API (Port 8100)

```bash
cd /volume2/Project/MCD3/TUMON/mc-gate/apps/face-api
FACE_VERIFY_THRESHOLD=0.45 PORT=8100 npm run dev
```

**注意**: Cloudflare Tunnel が `127.0.0.1:8100` を期待しているため、ポート 8100 で起動する必要があります。

### GS Service (Port 7070)

```bash
cd /volume2/Project/MCD3/TUMON/mc-gate/apps/gs-service
PORT=7070 npm run dev
```

### Keycloak (Port 8081)

Docker Compose で自動起動：

```bash
cd /volume2/Project/MCD3/TUMON/mc-gate
docker-compose up -d keycloak
```

## Cloudflare Tunnel の変更手順

### 1. Cloudflare Dashboard にアクセス

1. https://dash.cloudflare.com/ にログイン
2. `bme-service.monster` ドメインを選択
3. 左メニューから **Zero Trust** → **Access** → **Tunnels** を選択

### 2. Tunnel 設定の編集

1. 既存の Tunnel（例: `mc-gate-tunnel`）をクリック
2. **Public Hostname** タブを選択
3. 編集したいホスト名の **Edit** をクリック

### 3. ローカルエンドポイントの変更例

**例: Face API のポートを 8100 → 8101 に変更する場合**

- Subdomain: `face-gate`
- Domain: `bme-service.monster`
- Service: `http://127.0.0.1:8101` （8100 から 8101 に変更）

**Save** をクリックして保存

### 4. 変更の反映

Cloudflare Tunnel は自動的に新しい設定を適用します（通常1分以内）。

## トラブルシューティング

### Q1: 外部からアクセスできない

**確認事項**:
1. ローカルサーバーが起動しているか
   ```bash
   netstat -tuln | grep 8100
   ```
2. Cloudflare Tunnel が稼働しているか
   ```bash
   ps aux | grep cloudflared
   ```
3. ポート番号が一致しているか（Cloudflare設定 vs サーバー起動ポート）

### Q2: HTTPS エラーが発生する

**原因**: Cloudflare Tunnel は HTTPS 終端を行うため、ローカルサーバーは HTTP で動作する必要があります。

**解決策**: ローカルサーバーを HTTP モードで起動してください。

### Q3: 502 Bad Gateway エラー

**原因**: ローカルサーバーが起動していない、またはポート番号が間違っています。

**解決策**:
1. サーバープロセスが稼働しているか確認
2. ポート番号が Cloudflare Tunnel の設定と一致しているか確認

## セキュリティ考慮事項

### 1. HTTPS 通信

Cloudflare Tunnel を経由することで、すべての外部通信は自動的に HTTPS になります。

### 2. API キー認証

Face API と GS Service では API キー認証を実装しています：

```typescript
// リクエストヘッダー
headers: {
  "x-api-key": "your-api-key-here"
}
```

### 3. OAuth 2.0 認証

モバイルアプリは Keycloak 経由で OAuth 2.0 / OIDC 認証を行います。

### 4. レート制限

Cloudflare WAF でレート制限を設定可能です（将来実装予定）。

## 監視とログ

### Cloudflare Analytics

Cloudflare Dashboard から以下の情報を確認できます：

- リクエスト数
- 帯域幅使用量
- エラー率
- 地理的分布

### サーバーログ

各サーバーのログファイル：

- Face API: `/tmp/face-api-8100.log`
- GS Service: `/tmp/gs-service-7070.log`
- Keycloak: Docker logs (`docker logs mc-gate-keycloak`)

## 参考リンク

- [Cloudflare Tunnel Documentation](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/)
- [Cloudflare Zero Trust](https://www.cloudflare.com/zero-trust/)

---

**最終更新**: 2025-12-08
**作成者**: Claude (with user collaboration)
**バージョン**: 1.0
