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
| `block` | 入場拒否 | 「入場できません」 | **✅ 記録する**（仕様変更） |

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
| `block` | **✅ 記録する**（仕様変更） | `{"action":"block","messages":["msg.ccus.unregistered"],...}` | `"pending"` |

**旧実装（廃止）**: `auth.tsx:258`
```typescript
// ❌ 旧実装: BLOCKは記録しない（廃止）
if (ruleResult.action === "block") {
  showResultAlert(worker, ruleResult, method);
  return; // イベント記録せずにリターン
}
```

**新実装（確定）**: `auth.tsx:258付近`で実装予定
```typescript
// ✅ 新実装: BLOCKも記録する
if (ruleResult.action === "block") {
  // BLOCKの場合も記録する（仕様変更）
  const scanEvent: ScanEvent = { /* ... */ };
  await addToQueue(scanEvent);
  showResultAlert(worker, ruleResult, method);
  return;
}
```

#### PostgreSQL（scan_events テーブル）

モバイルから同期されたイベントのみ記録される。
- `allow` → 同期される
- `warn` → 同期される
- `block` → **同期される**（仕様変更: モバイルで記録されるようになった）

---

## 🚨 BLOCK時のDB挙動仕様（確定版）

### ✅ 仕様決定: BLOCKも記録する

**結論**: BLOCK判定時も `scan_events` に記録する

**理由**:
1. **監査・クレーム対応**: 「誰がいつ、なぜ現場に入れなかったか」のログは証拠として必須
2. **なりすまし対策**: 不正アクセス試行の記録が残る
3. **安全衛生・労務**: 労災・労務トラブル時の証拠として求められる可能性が高い
4. **統計分析**: BLOCK回数、BLOCK理由の分析が可能
5. **ゼネコン訴求**: 監査機能として強力なアピールポイント

### 記録方式

**DB記録内容**:
- イベントは必ず `scan_events` に記録する
- `rule_result.action = "block"` として格納
- `rule_result.messages` にBLOCK理由を格納
- `transport_status = "pending"` で記録（サーバーへ同期）

**実装方針**:
```typescript
// auth.tsx:258 付近を修正
if (ruleResult.action === "block") {
  // BLOCKの場合も記録する（仕様変更）
  // 入退モードを決定
  const decidedMode: DecidedMode = currentProject.gateMode;

  // スキャンイベントを作成
  const occurredAt = new Date().toISOString();
  const scanEvent: ScanEvent = {
    id: generateUUID(),
    projectId: currentProject.projectId,
    personId: worker.personId,
    method,
    gateMode: currentProject.gateMode,
    decidedMode,
    occurredAt,
    ruleResult,  // action: "block" を含む
    transport: {
      status: "pending",
      attempts: 0,
      idempotencyKey: makeIdempotencyKey({
        projectId: currentProject.projectId,
        personId: worker.personId,
        decidedMode,
        occurredAt,
      }),
    },
  };

  // キューに追加
  await addToQueue(scanEvent);

  // 結果を表示
  showResultAlert(worker, ruleResult, method);
  return;
}
```

### E2Eテストでの確認方法

**シナリオ3（BLOCK）テスト後に確認**:
```bash
# BLOCKイベントが記録されていることを確認
sqlite3 mc-gate.db "SELECT person_id, decided_mode, rule_result FROM scan_events WHERE person_id = 'E2E_BLOCK' ORDER BY occurred_at DESC LIMIT 1;"
```

**期待される結果**:
- ✅ レコードが **1件以上**存在する
- ✅ `person_id = "E2E_BLOCK"`
- ✅ `rule_result` に `{"action":"block","messages":["msg.ccus.unregistered"],...}` が格納されている

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
   - **すべてのaction（allow/warn/block）** → scanEventを作成してキューに追加
   - 結果をUI表示（Alert または カード）
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
- ✅ Alert（またはカード）: 「入場できません」「CCUS技能者登録が確認できません」
- ✅ DB: `scan_events` に**レコードあり**（仕様変更）
- ✅ `rule_result.action = "block"`
- ✅ `rule_result.messages = ["msg.ccus.unregistered"]`

**確認コマンド**:
```bash
# BLOCKイベントが記録されていることを確認
sqlite3 mc-gate.db "SELECT person_id, decided_mode, rule_result FROM scan_events WHERE person_id = 'E2E_BLOCK' ORDER BY occurred_at DESC LIMIT 1;"
# → 1件以上のレコードが表示される
# → rule_result に {"action":"block",...} が含まれる
```

---

## 🎯 Option B 実装時の方針（確定版）

### ✅ Alert使用ポリシー

**結論**: 致命的エラーのみAlert、それ以外はカード表示

#### Alert使用箇所（システム的な致命的エラー）

1. **カメラ権限NG**
   ```
   タイトル: カメラアクセス権限が必要です
   本文: カメラへのアクセス権限がありません。端末の設定から許可してください。
   ```

2. **ネットワーク不通**（Face APIサーバー接続失敗）
   ```
   タイトル: サーバー接続エラー
   本文: サーバーに接続できません。ネットワーク設定を確認してください。
   ```

3. **Face API 500系エラー**
   ```
   タイトル: サーバーエラー
   本文: 顔認証サーバーでエラーが発生しました。しばらくしてから再度お試しください。
   ```

#### カード表示箇所（ビジネスロジック系）

1. **認識成功**（allow / warn / block）
2. **認識失敗**（マッチなし）
3. **ルール違反によるブロック**

**運用上のメリット**:
- 現場担当者は「カードだけ見ていれば良い」
- 致命的エラーだけポップアップで気づける
- UX的に一貫性がある

### ✅ WARN/BLOCK時の文言（確定版）

**結論**: 現場寄り文言を採用（固すぎず、でもそれっぽい）

#### WARN時UI仕様

**タイトル**: `⚠️ 注意が必要です`

**本文**:
```
この作業員は社会保険の加入状況に注意が必要です。
現場事務所または所長に確認してください。
```

**文言設計のポイント**:
- 「未加入です」と断定しない（データ誤差・反映遅れを考慮）
- 「スルーしていい話ではない」ことはちゃんと伝える
- 現場担当者が迷わない明確な指示

#### BLOCK時UI仕様

**タイトル**: `❌ 入場できません`

**本文**:
```
この作業員のCCUS技能者登録が確認できません。
現場事務所で確認を受けてください。
```

**文言設計のポイント**:
- 「入場できません」を先頭に置いて、現場担当が迷わないように
- BLOCK理由も一行で明示
- 次のアクション（現場事務所で確認）を具体的に指示

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
[追記予定: BLOCK時にレコードが1件以上存在することの確認]
[追記予定: rule_result に {"action":"block",...} が含まれることの確認]
```

### 想定外の挙動

```
[追記予定: テスト中に発見した想定外の挙動や改善点]
```

---

**作成日**: 2025-12-08
**最終更新**: 2025-12-08
**作成者**: Claude (with user collaboration)
**ステータス**: 仕様確定版（E2Eテスト実施待ち）

---

## 📝 変更履歴

### 2025-12-08: 仕様確定（v1.0）
- ✅ BLOCK時のDB挙動を確定（記録する方式に変更）
- ✅ Option B実装方針を確定（Alert vs カード使い分け）
- ✅ WARN/BLOCK時の文言を確定（現場寄り文言）
- ✅ すべての仕様を「確定版」としてマーク
- 次ステップ: auth.tsxの実装 → E2Eテスト → 実例データ追記
