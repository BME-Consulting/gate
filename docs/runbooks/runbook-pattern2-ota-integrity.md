# Runbook: Pattern 2（Worker Sync）障害UX & OTA整合性（P2-6）

**対象**: Pattern 2（10s timeout / retry / user-friendly messaging）、P2-6（Commit Hash / Integrity / 起動時必須関数チェック）、G-3-2（検証完了・完全クローズ）

**ステータス**: ✅ VERIFIED & CLOSED（2025-12-23）

---

## 0. SOOT（Single Source of Truth）- 成功判定はこれだけ見ろ

### Settings > App Info 表示確認

```
Commit Hash: b9dd1d8
Channel: production
Launch Mode: OTA Update
Integrity: ✅ PASS
```

### logcat での即座確認

```bash
adb logcat -d | grep "\[P2-6\] Integrity"
# 期待値: [P2-6] Integrity: ✅ PASS
```

**これが揃わない限り、テストも障害調査も開始禁止**（全部ズレる）

---

## 1. 本テスト開始前チェックリスト（30秒）

実行前に必ず以下を確認：

- [ ] Settings > App Info が表示できる
- [ ] Commit Hash が `b9dd1d8` 以上
- [ ] Channel が `production`
- [ ] Launch Mode が `OTA Update`
- [ ] logcat に `[P2-6] Integrity: ✅ PASS` が出ている

**いずれか1つでも欠けたら、先に Recovery SOOT（5. 参照）を実行**

---

## 2. Pattern 2 本テスト手順（ネットワーク遮断）

### 2-1. ネットワーク遮断（Android）

```bash
adb shell settings put global airplane_mode_on 1
adb shell am broadcast -a android.intent.action.AIRPLANE_MODE --ez state true
adb shell svc wifi disable
adb shell svc data disable

# 確認
adb shell settings get global airplane_mode_on
# 期待値: 1
```

### 2-2. 手動同期実行（端末操作）

1. Settings タブをタップ
2. **「作業員マスタ管理」** セクションまでスクロール
3. **「サーバーから同期」** ボタンをタップ
4. **10〜15秒待つ**

### 2-3. 合格条件

以下が全て揃ったら合格：

- [ ] Alert タイトル表示: **「同期失敗」**
- [ ] ボタン表示: **「閉じる」「再試行」** が出る
- [ ] メッセージに **"undefined is not a function" が一切出ない**
- [ ] 体感で **10秒前後で失敗が返る**（90秒待ちは再発禁止）

**メッセージの例**:
```
通信タイムアウト

サーバーとの通信が時間内に完了しません。
ネットワーク接続を確認してください。
```

---

## 3. logcat 確認（一次切り分け）

### 3-1. Worker Sync エラーログを確認

```bash
adb logcat -d | grep "\[P2\]\[WorkerSync\]" | tail -50
```

### 3-2. 期待するログの形（例）

```
[P2][WorkerSync] Error type: Timeout
[P2][WorkerSync] Message: timeout / Network / Auth / etc
[P2][WorkerSync] Stack: ...
```

**スタックが出ていない場合は、別途 toUserMessageSafe() の実装確認が必要**

---

## 4. エラーメッセージ別の対応

| 表示メッセージ | 原因 | まずやること |
|---|---|---|
| 通信タイムアウト | 応答遅延 / 電波弱 | 再試行、ネットワーク確認 |
| ネットワークエラー | 疎通不可 | 機内モード/WiFi/DNS確認 |
| 認証エラー | 401/403 | 再ログイン（G-3-1側のUXに従う） |
| 予期しないエラー | 想定外 | logcat採取→原因解析 |

---

## 5. OTA不整合（更新が採用されない）時の最終兵器

### Recovery のSSOT

**以下の手順で直らなきゃ設計側の問題**

```bash
# Step 1: アプリデータ完全削除
adb shell pm clear com.bmeconsulting.mcgate

# Step 2: Boot 1（ダウンロード相）
adb shell am start -n com.bmeconsulting.mcgate/.MainActivity
# → 数十秒待つ（update download を進捗）

# Step 3: 強制停止
adb shell am force-stop com.bmeconsulting.mcgate

# Step 4: Boot 2（採用相）
adb shell am start -n com.bmeconsulting.mcgate/.MainActivity
# → 数秒で起動完了
```

### 採用確認方法

**Settings > App Info の「Commit Hash」で決め打ち**

- 期待値: `b9dd1d8`
- 確認方法: `adb shell uiautomator dump` または logcat で `[P2-6] Commit Hash: b9dd1d8`

---

## 6. 完全クローズ宣言

### ✅ 検証完了（2025-12-23）

- P2（Worker Sync Error Handling）: **PASS**
  - toUserMessageSafe() 全エラーに適用
  - ログ: `[P2][WorkerSync]` 出力確認

- P2-6（Commit Hash / Integrity）: **PASS**
  - Commit Hash: `b9dd1d8` で実行中
  - Integrity: `✅ PASS`（起動時チェック完了）

- G-3-2（エラーメッセージ人間語化）: **PASS**
  - "undefined is not a function" が出ない
  - ユーザー向け日本語メッセージで統一

### 再発時対応

**このRunbookの SOOT → Recovery SOOT で即座に復旧可能**

---

## 7. 次のステップ

- [ ] このRunbookを `docs/runbooks/` に保存
- [ ] `production-incident-response.md` にリファレンスを追記
- [ ] git commit で P2/G-3-2/P2-6 を正式CLOSE
- [ ] G-3-4（初期化専用エラー画面）へ移行

---

**作成**: 2025-12-23
**最終検証**: Commit b9dd1d8 with "Integrity: ✅ PASS"
**保証スコープ**: Pattern 2 complete error message transformation + OTA adoption integrity
