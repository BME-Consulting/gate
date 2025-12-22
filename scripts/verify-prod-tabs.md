# Production タブ検証チェックリスト

**最終更新**: 2025-12-22
**対象環境**: mc-gate Production ビルド
**目的**: Production アプリが禁止タブを含まないことを実機で検証する

---

## 📋 共通手順（iOS / Android）

### 前提条件

- Production APK または iOS アプリがインストール済み
- Update Group ID: `a4d74837-a7d6-4c35-b048-7bb508232a49` が適用済み
- Runtime Version: `exposdk:54.0.0`

### 手順 1: アプリの完全再起動

1. **アプリを強制終了**
   - iOS: アプリスイッチャーから上にスワイプ
   - Android: 設定 → アプリ → mc-gate → 強制停止

2. **アプリを再起動**
   - ホーム画面から mc-gate アイコンをタップ

### 手順 2: タブ数の確認（最重要）

画面下部のタブバーを確認し、**正確に 5つのタブ** が表示されることを確認：

#### ✅ 期待されるタブ（5つのみ）

1. ホーム（home）
2. 認証（auth）
3. 顔登録（face-registration）
4. 履歴（history）
5. 設定（settings）

#### 🚨 禁止タブ（これらが表示されたらバグ）

以下のタブが **1つでも存在したら緊急ロールバック**：

- `debug` （デバッグタブ）
- `vision-test` （カメラテストタブ）
- `camera-test` （カメラテストタブ）

### 手順 3: 環境変数確認（オプション）

設定画面で `appEnv=production` が確認できる場合は確認：

1. **設定タブ** をタップ
2. バージョン情報 または デバッグ情報セクションを確認
3. `appEnv: production` または `Environment: production` の表示を確認

**注意**: 実装されていない場合はスキップ可（手順2の確認で十分）

---

## 🤖 Android 向け補助コマンド（任意）

adb が使用可能な場合、以下のコマンドでログを監視できます：

### 前提条件

- adb がインストール済み（`/tmp/platform-tools/adb` または `adb`）
- デバイスが USB デバッグモードで接続済み

### アプリ起動時のログ確認

```bash
# アプリ起動前にログをクリア
/tmp/platform-tools/adb logcat -c

# アプリを起動してログを監視（30秒間）
timeout 30 /tmp/platform-tools/adb logcat | grep -iE "prohibited|tabs|production|security|appEnv"
```

### 期待されるログ出力

```
✅ appEnv: production
✅ Tabs count: 5
```

### 異常なログ（緊急ロールバック対象）

```
❌ [SECURITY] Prohibited tabs found in production: debug, vision-test
❌ appEnv: development
```

---

## 📱 iOS 向け補助確認（任意）

### Xcode Console でログ確認

1. Mac に iPhone を接続
2. Xcode → Window → Devices and Simulators
3. デバイスを選択 → Open Console
4. アプリを起動してログを確認

### 検索キーワード

- `appEnv`
- `prohibited`
- `SECURITY`
- `Tabs.Screen`

---

## 🔄 代替手順（adb / Xcode が使えない場合）

以下の **目視確認のみ** で検証可能：

### チェックリスト

- [ ] アプリを強制終了 → 再起動した
- [ ] タブバーに **5つのタブのみ** 表示されている
- [ ] 禁止タブ（debug / vision-test / camera-test）が **存在しない**
- [ ] 設定画面で Production 環境が確認できた（オプション）

**結果**:
- ✅ すべてチェックが通れば検証完了
- ❌ 禁止タブが見つかった場合 → `docs/runbooks/production-incident-response.md` の「④ 緊急ロールバック手順」を実施

---

## 📊 検証結果の記録

検証完了後、以下の情報を記録：

```markdown
## 実機検証結果

**検証日時**: 2025-XX-XX XX:XX JST
**検証者**: [名前]
**デバイス**: [iPhone 14 Pro / Pixel 8 など]
**Update Group ID**: a4d74837-a7d6-4c35-b048-7bb508232a49

### タブ確認結果

- [ ] ホーム（home）
- [ ] 認証（auth）
- [ ] 顔登録（face-registration）
- [ ] 履歴（history）
- [ ] 設定（settings）

**タブ総数**: 5つ
**禁止タブ存在**: なし（✅ OK）

### 備考

[特記事項があれば記載]
```

---

## 🔗 関連ドキュメント

- **Incident Response Runbook**: `docs/runbooks/production-incident-response.md`
- **3層セキュリティロック**: Commit `faf1f94`
- **EAS Update 情報**: https://expo.dev/accounts/bme_llc/projects/mc-gate/updates/a4d74837-a7d6-4c35-b048-7bb508232a49

---

**この検証手順は Production 配信後の必須確認事項です。必ず実施してください。**
