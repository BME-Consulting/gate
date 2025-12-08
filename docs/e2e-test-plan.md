# 認証タブ E2Eテスト計画書

## テスト環境

- **Face API サーバー**: http://192.168.1.4:8101 (起動済み)
- **Cloudflare Tunnel**: https://face-gate.bme-service.monster
- **モバイルアプリ**: v1.0.30 (Build ID: d485057f)
- **テストデータベース**: `/volume2/Project/MCD3/TUMON/mc-gate/apps/face-api/workers.db`

## ⚙️ プロジェクト設定の確認と調整

### 現在の実装状況
- **プロジェクト設定の保存先**: `index.tsx` にハードコードされたモック設定
- **設定の永続化**: なし（Zustand ストアのメモリ内のみ）
- **設定タブでの変更**: アプリプロセス内のみで有効（再起動で消える）

### 設定確認方法

#### 方法1: 設定タブのUIで確認
1. アプリを起動
2. 設定タブを開く
3. 「プロジェクト設定」セクションで各チェックボックスの状態を確認
   - ✅ = 有効（チェックあり）
   - ☐ = 無効（チェックなし）

#### 方法2: adbログで確認（推奨）
各シナリオのテスト前に、以下のログが出力されることを確認：

```bash
adb logcat *:S ReactNativeJS:V | grep "Active checkConfig"
```

**期待される出力例**:
```
[Auth] Active checkConfig: {
  "ccusIdCheck": true,
  "socialInsuranceCheck": true,
  "residencyCheck": false,
  "ageCheck": false,
  "healthCheck": false,
  "soleProprietorCheck": false
}
```

### 各シナリオの設定調整手順

#### シナリオ1 & シナリオ2の前に
1. 設定タブを開く
2. 「CCUS技能者ID確認」を **ON** にする
3. 「社会保険確認」を **ON** にする
4. 認証タブに戻る
5. テスト実施

#### シナリオ3の前に
1. 設定タブを開く
2. 「CCUS技能者ID確認」を **ON** にする
3. 「社会保険確認」を **OFF** にする（シナリオ3では関係ないため）
4. 認証タブに戻る
5. テスト実施

#### シナリオ4 & シナリオ5の前に
設定は任意（未登録顔やオフライン時は設定に関わらず失敗するため）

## テストデータ準備

以下の3名のテストアカウントを作成済み：

| Person ID | 名前 | CCUS登録 | 社会保険 | 期待される判定 |
|-----------|------|----------|----------|--------------|
| `E2E_ALLOW` | E2E太郎（正常） | ✅ 登録済み | ✅ 加入済み | **allow** |
| `E2E_WARN` | E2E次郎（警告） | ✅ 登録済み | ❌ 未加入 | **warn** |
| `E2E_BLOCK` | E2E三郎（ブロック） | ❌ 未登録 | ✅ 加入済み | **block** |

---

## シナリオ1: allow（正常入場）

### 前提条件
- Face API サーバー起動済み
- プロジェクト設定で `ccusIdCheck: true`, `socialInsuranceCheck: true`

### 手順

#### ステップ0: 設定確認
1. 設定タブを開く
2. 「CCUS技能者ID確認」を **ON** にする
3. 「社会保険確認」を **ON** にする
4. adb ログを確認:
   ```bash
   adb logcat *:S ReactNativeJS:V | grep "Active checkConfig"
   ```
   期待される出力:
   ```json
   {
     "ccusIdCheck": true,
     "socialInsuranceCheck": true,
     ...
   }
   ```

#### ステップ1: 顔登録
1. **顔登録タブ**で `E2E_ALLOW`（E2E太郎）の顔を登録
   - カメラで自分の顔を撮影
   - Person ID: `E2E_ALLOW` を選択
   - 「登録」ボタンをタップ
   - 登録成功を確認

#### ステップ2: 認証タブを開く
1. **認証タブ**を開く
   - タイトル：「統合認証」
   - 検出インジケーター：「顔検出」「QR検出」が1秒ごとに切り替わる

#### ステップ3: 顔認証を実行
   - 自分の顔をカメラに向ける
   - 顔検出 → 認証中... → 結果表示

### 期待される結果

#### UI表示
- Alert: 「入場登録完了」
- メッセージ:
  ```
  E2E太郎（正常）さん（テスト建設株式会社）
  認証方法: 顔認証
  CCUS ID: CCUS-A001

  ✅ 問題なく登録されました
  ```

#### サーバーログ（Face API）
```
[Face Recognize] Request received
[Face Recognize] Worker found: E2E太郎（正常）
[Face Recognize] Distance: 0.25 (threshold: 0.6)
[Face Recognize] ✅ Matched: E2E_ALLOW
```

#### モバイルアプリログ
```
[Auth] Face detected - processing...
[Auth] Sending face recognition request to: https://face-gate.bme-service.monster
[Auth] Recognition success: E2E_ALLOW
[RuleEngine] action: "allow", messages: []
[Auth] Entry event recorded: eventId=...
```

#### ローカルDB（scan_events）
- 新しいレコードが追加される
- `person_id = "E2E_ALLOW"`
- `decided_mode = "IN"` (プロジェクト設定による)
- `method = "FACE"`
- `rule_result.action = "allow"`
- `transport_status = "pending"`

---

## シナリオ2: warn（警告付き入場）

### 前提条件
- Face API サーバー起動済み
- プロジェクト設定で `socialInsuranceCheck: true`

### 手順

#### ステップ0: 設定確認
1. 設定タブを開く
2. 「CCUS技能者ID確認」を **ON** にする（シナリオ1と同じ設定を継続）
3. 「社会保険確認」を **ON** にする
4. adb ログで `socialInsuranceCheck: true` を確認

#### ステップ1: 顔登録
1. **顔登録タブ**で `E2E_WARN`（E2E次郎）の顔を登録

#### ステップ2: 顔認証
1. **認証タブ**で顔認証を実行

### 期待される結果

#### UI表示
- Alert: 「入場登録完了」
- メッセージ:
  ```
  E2E次郎（警告）さん（テスト建設株式会社）
  認証方法: 顔認証
  CCUS ID: CCUS-B001

  ⚠️ 注意:
  社会保険未加入です
  ```

#### RuleEngine判定
- `action: "warn"`
- `messages: ["msg.socialInsurance.none"]`
- `sendToCcus: true`
- `includeInGs: true`

#### ローカルDB
- イベントは**記録される**（warnでも入場可能）
- `rule_result.action = "warn"`

---

## シナリオ3: block（入場不可）

### 前提条件
- Face API サーバー起動済み
- プロジェクト設定で `ccusIdCheck: true`

### 手順

#### ステップ0: 設定確認
1. 設定タブを開く
2. 「CCUS技能者ID確認」を **ON** にする
3. 「社会保険確認」は **任意**（シナリオ3では関係ない）
4. adb ログで `ccusIdCheck: true` を確認

#### ステップ1: 顔登録
1. **顔登録タブ**で `E2E_BLOCK`（E2E三郎）の顔を登録

#### ステップ2: 顔認証
1. **認証タブ**で顔認証を実行

### 期待される結果

#### UI表示
- Alert: 「入場不可」
- メッセージ:
  ```
  E2E三郎（ブロック）さん（テスト建設株式会社）
  認証方法: 顔認証

  CCUS技能者登録がありません
  ```

#### RuleEngine判定
- `action: "block"`
- `messages: ["msg.ccus.unregistered"]`
- `sendToCcus: false`
- `includeInGs: false`

#### ローカルDB
- イベントは**記録されない**（auth.tsx:258で早期リターン）

#### コード確認ポイント
```typescript
// auth.tsx:258
if (ruleResult.action === "block") {
  showResultAlert(worker, ruleResult, method);
  return; // イベント記録せずにリターン
}
```

---

## シナリオ4: 未登録顔（認識失敗）

### 前提条件
- Face API サーバー起動済み
- `E2E_ALLOW`, `E2E_WARN`, `E2E_BLOCK` の3名のみ顔登録済み

### 手順
1. **認証タブ**を開く
2. **未登録の人の顔**をカメラに向ける（または、顔登録していない自分で実行）

### 期待される結果

#### UI表示
- Alert: 「認識失敗」
- メッセージ:
  ```
  顔が検出されましたが、登録された作業員とマッチしませんでした。

  信頼度: 12.3%
  ```

#### サーバーログ（Face API）
```
[Face Recognize] No match found (closest distance: 0.88, threshold: 0.6)
```

#### モバイルアプリログ
```
[Auth] Recognition failed: person_id=null, confidence=0.12
```

#### ローカルDB
- イベントは**記録されない**（auth.tsx:395でperson_idチェック）

---

## シナリオ5: オフライン時の挙動確認

### 前提条件
- Face API サーバーを停止 OR ネットワークを切断

### 手順
1. Face API サーバーを停止
   ```bash
   pkill -f "tsx watch src/index.ts"
   ```
   または、モバイルのWiFi/モバイルデータをOFFにする

2. **認証タブ**で顔認証を実行

### 期待される結果

#### UI表示
- Alert: 「エラー」
- メッセージ:
  ```
  Face APIサーバーに接続できません。

  ネットワーク接続とサーバーの起動状態を確認してください。
  ```

#### モバイルアプリログ
```
[Auth] Face recognition error: Failed to fetch
[Auth] Network error detected
```

#### ローカルDB
- イベントは**記録されない**
- **オフラインキュー**への記録もなし（顔認証は即時処理のため）

#### 補足説明
- 現在の実装では、顔認証はオンライン必須（Face API依存）
- QRコード認証はローカルDBで動作可能なので、オフラインでもOK
- 今後のオフライン対応は別タスクとして検討

---

## チェックリスト

### 事前準備
- [ ] Face API サーバー起動確認: `curl http://192.168.1.4:8101/health`
- [ ] テストデータ作成確認: `sqlite3 workers.db "SELECT * FROM workers WHERE person_id LIKE 'E2E_%'"`
- [ ] モバイルアプリが最新版（v1.0.30）
- [ ] adb ログ監視の準備: `adb logcat *:S ReactNativeJS:V | grep -E "\[Auth\]|Active checkConfig"`

### 各シナリオの設定確認
- [ ] シナリオ1実施前: 設定タブで `ccusIdCheck: ON`, `socialInsuranceCheck: ON` を確認
- [ ] シナリオ2実施前: 設定タブで `socialInsuranceCheck: ON` を確認
- [ ] シナリオ3実施前: 設定タブで `ccusIdCheck: ON` を確認
- [ ] 各シナリオで adb ログに checkConfig が出力されることを確認

### テスト実施
- [ ] シナリオ1: allow（正常入場）
- [ ] シナリオ2: warn（警告付き入場）
- [ ] シナリオ3: block（入場不可）
- [ ] シナリオ4: 未登録顔（認識失敗）
- [ ] シナリオ5: オフライン時の挙動確認

### ログ確認
- [ ] Face API サーバーログ: `tail -f /tmp/face-api-8101-new.log`
- [ ] モバイルアプリログ: `adb logcat *:I | grep -E "\[Auth\]|\[Face"`
- [ ] ローカルDB: `sqlite3 mc-gate.db "SELECT * FROM scan_events ORDER BY occurred_at DESC LIMIT 5"`

---

## 次のステップ

テスト完了後：
1. **結果を記録** - このファイルに実際のログと結果を追記
2. **問題があれば修正** - auth.tsx, RuleEngine, Face API の調整
3. **UI統一（Option B）** - テスト成功後にauth.tsxのUI改修
4. **ゼネコンデモシナリオ作成** - デモ用の台本（セリフ付き）を作成

---

**最終更新**: 2025-12-08
**作成者**: Claude (with user collaboration)
**ステータス**: テスト準備完了 - 実施待ち
