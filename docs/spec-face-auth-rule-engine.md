# 顔認証ルール仕様書（RuleEngine）

## 📋 対象機能

- **画面**: 認証タブ（auth.tsx）
- **機能**: 顔認証（1:N）+ RuleEngine による入退場判定
- **実装ファイル**:
  - `/packages/core/src/rules/engine.ts`
  - `/apps/mobile/src/app/(tabs)/auth.tsx`

---

## 🎯 RuleEngine の役割

作業員の属性（CCUS登録、社会保険、在留資格など）をチェックし、以下の3つの判定結果を返す：

| action | 意味 | UI表示例 | DB記録 |
|--------|------|----------|--------|
| `allow` | 入場許可（正常） | 「入場登録完了」 | ✅ 記録する |
| `warn` | 入場許可（警告付き） | 「注意が必要です」 | ✅ 記録する |
| `block` | 入場拒否 | 「入場できません」 | **❌ 記録しない**（現在の実装） |

---

## 🔍 チェック項目一覧

### 現在実装されているチェック項目

| 項目 | 設定キー | 参照データ | 条件 | 判定結果 | メッセージID |
|------|---------|-----------|------|----------|-------------|
| **1. CCUS技能者ID確認** | `ccusIdCheck` | `worker.ccusRegistered` | `false` | `block` | `msg.ccus.unregistered` |
| **2. 在留資格確認** | `residencyCheck` | `worker.residencyStatus.workPermit` | `false` | `block` | `msg.residency.noWorkPermit` |
| **2. 在留資格確認** | `residencyCheck` | `worker.residencyStatus.expiryDate` | 期限切れ | `block` | `msg.residency.expired` |
| **3. 社会保険確認** | `socialInsuranceCheck` | `worker.socialInsurance` | `false` | `warn` | `msg.socialInsurance.none` |
| **4. 年齢確認** | `ageCheck` | `worker.age` | `< 18` | `warn` | `msg.age.tooYoung` |
| **4. 年齢確認** | `ageCheck` | `worker.age` | `> 65` | `warn` | `msg.age.tooOld` |
| **5. 健康確認** | `healthCheck` | `worker.healthStatus` | 未確認 | `warn` | `msg.health.unverified` |
| **6. 一人親方確認** | `soleProprietorCheck` | `worker.isSoleProprietor` | `true` | `warn` | `msg.soleProprietor.detected` |

### チェックの優先順位

1. **CCUS技能者ID確認** → `block` の可能性あり
2. **在留資格確認** → `block` の可能性あり
3. **社会保険確認** → `warn` のみ
4. **年齢確認** → `warn` のみ
5. **健康確認** → `warn` のみ
6. **一人親方確認** → `warn` のみ

**重要**: `block` 判定が1つでもあれば、全体の `action` は `block` になる。

---

## 📊 action と UI/DB の対応表

### UI表示

| action | Alertタイトル（現在） | カードタイトル（Option B） | アイコン | 色 |
|--------|---------------------|--------------------------|---------|-----|
| `allow` | 「入場登録完了」 | 「入場登録完了」 | ✅ checkmark-circle | 緑 (#0f766e) |
| `warn` | 「入場登録完了」（注意付き） | 「注意が必要です」 | ⚠️ alert-circle | 黄 (#ca8a04) |
| `block` | 「入場不可」 | 「入場できません」 | ❌ close-circle | 赤 (#b91c1c) |

### DB記録（現在の実装）

#### モバイルSQLite（scan_events テーブル）

| action | レコード作成 | rule_result カラム | transport_status |
|--------|------------|-------------------|------------------|
| `allow` | ✅ 記録する | `{"action":"allow","messages":[],...}` | `"pending"` |
| `warn` | ✅ 記録する | `{"action":"warn","messages":["msg.socialInsurance.none"],...}` | `"pending"` |
| `block` | **❌ 記録しない** | - | - |

**コード根拠**: `auth.tsx:258`
```typescript
if (ruleResult.action === "block") {
  showResultAlert(worker, ruleResult, method);
  return; // イベント記録せずにリターン
}
```

#### PostgreSQL（scan_events テーブル）

モバイルから同期されたイベントのみ記録される。
- `allow` → 同期される
- `warn` → 同期される
- `block` → **同期されない**（モバイルで記録されないため）

---

## 🚨 BLOCK時のDB挙動仕様（要決定）

### オプションA: 現在の実装を継続（記録しない）

**メリット**:
- 実装がシンプル
- ストレージ容量の節約
- 「入場していない人」のデータは残らない

**デメリット**:
- 監査証跡が残らない
- 不正アクセス試行の記録がない
- 統計分析に使えない（BLOCK回数など）

### オプションB: BLOCKも記録する（推奨）

**メリット**:
- 監査証跡が完全
- セキュリティインシデントの追跡が可能
- 統計分析に使える（「誰が何回BLOCKされたか」など）
- ゼネコン向けデモで「監査機能」として訴求できる

**デメリット**:
- ストレージ容量が増える（ただし軽微）
- 実装の修正が必要

**実装方針（オプションBの場合）**:
```typescript
// auth.tsx:258 付近を修正
if (ruleResult.action === "block") {
  // イベントを記録する（allow/warnと同じ処理）
  await recordEntryEvent(workerInfo, "FACE");
  return;
}
```

**決定事項**:
- [ ] オプションA（記録しない）を継続
- [ ] オプションB（記録する）に変更

---

## 📝 メッセージ一覧

### 実装されているメッセージ（packages/core/src/rules/messages.ts）

| メッセージID | 日本語 | 英語 |
|-------------|-------|------|
| `msg.ccus.unregistered` | CCUS技能者登録がありません | CCUS technician registration not found |
| `msg.ccus.unregistered.warn` | CCUS技能者登録が確認できません | CCUS technician registration cannot be verified |
| `msg.residency.noWorkPermit` | 在留資格に就労許可がありません | No work permit in residency status |
| `msg.residency.expired` | 在留資格の有効期限が切れています | Residency status has expired |
| `msg.socialInsurance.none` | 社会保険未加入です | Not enrolled in social insurance |
| `msg.age.tooYoung` | 18歳未満のため入場できません | Under 18 years old |
| `msg.age.tooOld` | 65歳以上のため要確認です | Over 65 years old, verification required |
| `msg.health.unverified` | 健康診断が未確認です | Health check not verified |
| `msg.soleProprietor.detected` | 一人親方として検出されました | Detected as sole proprietor |

---

## 🔄 処理フロー

### 顔認証 → RuleEngine → DB記録の流れ

```
1. 顔認証実行（auth.tsx:processFaceRecognition）
   ↓
2. Face APIに画像送信（/api/face/recognize）
   ↓
3. person_id が返ってくる
   ↓
4. ローカルDBから作業員情報を取得（getWorkerById）
   ↓
5. WorkerInfo型に変換
   ↓
6. recordEntryEvent(workerInfo, "FACE") を呼び出し
   ↓
7. RuleEngineでルール判定（ruleEngine.evaluate(worker)）
   ↓
8. ruleResult.action で分岐:
   - block → Alert表示してリターン（DB記録なし）
   - allow/warn → scanEventを作成してキューに追加
   ↓
9. addToQueue(scanEvent)
   ↓
10. SQLiteのscan_eventsテーブルに挿入
   ↓
11. transport_status = "pending" で記録
   ↓
12. SyncWorkerがバックグラウンドで同期（オンライン時）
```

---

## 🧪 E2Eテストで確認すべきポイント

### シナリオ1: ALLOW（正常入場）

**設定**:
- `ccusIdCheck: true`
- `socialInsuranceCheck: true`

**テストデータ**: `E2E_ALLOW`
- CCUS登録: ✅
- 社会保険: ✅

**期待される挙動**:
- ✅ adbログ: `"action":"allow"`
- ✅ Alert: 「入場登録完了」
- ✅ DB: `scan_events` に新規レコード
- ✅ `rule_result.action = "allow"`
- ✅ `rule_result.messages = []`

### シナリオ2: WARN（警告付き入場）

**設定**:
- `ccusIdCheck: true`
- `socialInsuranceCheck: true`

**テストデータ**: `E2E_WARN`
- CCUS登録: ✅
- 社会保険: ❌

**期待される挙動**:
- ✅ adbログ: `"action":"warn"`
- ✅ Alert: 「⚠️ 注意: 社会保険未加入です」
- ✅ DB: `scan_events` に新規レコード
- ✅ `rule_result.action = "warn"`
- ✅ `rule_result.messages = ["msg.socialInsurance.none"]`

### シナリオ3: BLOCK（入場不可）

**設定**:
- `ccusIdCheck: true`

**テストデータ**: `E2E_BLOCK`
- CCUS登録: ❌

**期待される挙動**:
- ✅ adbログ: `"action":"block"`
- ✅ Alert: 「入場不可」「CCUS技能者登録がありません」
- ❌ DB: `scan_events` に**レコードなし**（現在の実装）
- ❌ `rule_result` は生成されるが、DBには記録されない

**確認コマンド**:
```bash
# BLOCKイベントが記録されていないことを確認
sqlite3 mc-gate.db "SELECT * FROM scan_events WHERE person_id = 'E2E_BLOCK';"
# → 0件
```

---

## 🎯 Option B 実装時の方針（要決定）

### Alert使用ポリシー

#### オプション1: 致命的エラーのみAlert、それ以外はカード

**Alert使用箇所**:
- カメラ権限NG
- ネットワーク不通（Face APIサーバー接続失敗）
- Face API 500系エラー
- データベースエラー

**カード表示箇所**:
- 認識成功（allow / warn / block）
- 認識失敗（マッチなし）

**推奨理由**:
- UX的に一貫性がある
- 認証結果は画面内カードで、致命的エラーのみモーダルAlert

#### オプション2: すべてカード表示（Alert完全廃止）

**メリット**: UI/UX の完全統一
**デメリット**: 致命的エラーも画面内カードになるため、見逃される可能性

**決定事項**:
- [ ] オプション1（致命的エラーのみAlert、推奨）
- [ ] オプション2（Alert完全廃止）

### WARN/BLOCK時の文言レベル

#### 現場寄り文言（推奨）

**WARN例**:
```
⚠️ 注意:
社会保険未加入の可能性があります。
所長に確認してください。
```

**BLOCK例**:
```
❌ 入場できません
CCUS技能者登録が確認できません。
現場事務所で確認を受けてください。
```

#### 法令寄り文言

**WARN例**:
```
⚠️ 注意:
この作業員は社会保険加入状況が未確認です。
労働安全衛生法に基づき確認が必要です。
```

**BLOCK例**:
```
❌ 入場不可
建設キャリアアップシステム（CCUS）への
技能者登録が確認できません。
```

**決定事項**:
- [ ] 現場寄り文言（推奨）
- [ ] 法令寄り文言
- [ ] カスタム文言（個別に記載）

---

## 📚 参考情報

### データベーススキーマ

#### モバイルSQLite（scan_events）
```sql
CREATE TABLE IF NOT EXISTS scan_events (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  person_id TEXT NOT NULL,
  method TEXT NOT NULL,
  gate_mode TEXT NOT NULL,
  decided_mode TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  rule_result TEXT NOT NULL,  -- JSON: {"action":"allow/warn/block","messages":[...],...}
  transport_status TEXT NOT NULL,
  transport_attempts INTEGER NOT NULL,
  transport_last_error TEXT,
  transport_idempotency_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

#### PostgreSQL（scan_events）
```prisma
model ScanEvent {
  id                        String   @id
  projectId                 String   @map("project_id")
  personId                  String   @map("person_id")
  method                    String
  gateMode                  String   @map("gate_mode")
  decidedMode               String   @map("decided_mode")
  occurredAt                DateTime @map("occurred_at") @db.Timestamptz
  ruleResult                Json     @map("rule_result")
  transportStatus           String   @default("pending") @map("transport_status")
  // ...
}
```

### RuleResult型定義

```typescript
export interface RuleResult {
  action: "allow" | "warn" | "block";
  messages: string[];         // メッセージIDの配列
  sendToCcus: boolean;        // CCUSへの送信可否
  includeInGs: boolean;       // GS統計への含有可否
}
```

---

## ✅ E2Eテスト完了後に埋める項目

以下はテスト結果を踏まえて記載します：

### 実際のログ出力例

#### シナリオ1（ALLOW）
```
[追記予定: adbログとFace APIログの実例]
```

#### シナリオ2（WARN）
```
[追記予定: adbログとFace APIログの実例]
```

#### シナリオ3（BLOCK）
```
[追記予定: adbログとFace APIログの実例]
```

### 実際のDB状態

#### シナリオ1のレコード
```
[追記予定: SQLiteクエリ結果]
```

#### シナリオ2のレコード
```
[追記予定: SQLiteクエリ結果]
```

#### シナリオ3のレコード確認
```
[追記予定: BLOCK時にレコードが0件であることの確認]
```

### 想定外の挙動

```
[追記予定: テスト中に発見した想定外の挙動や改善点]
```

---

**作成日**: 2025-12-08
**作成者**: Claude (with user collaboration)
**ステータス**: E2Eテスト完了後に実例データを追記予定
