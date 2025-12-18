# EAS Build と OTA Update 運用ルール

**最終更新**: 2025-12-18
**状態**: 確定版（運用開始）

## 🎯 目的

「ビルドAにUpdate Bを当てたつもり事故」を防止し、Build/Update/runtimeVersionの3点セットを常に整合させる。

---

## 📋 黄金ルール

### 1. runtimeVersion は固定値を使用

```json
// app.config.ts
{
  "runtimeVersion": {
    "policy": "sdkVersion"  // 推奨: Expo SDK バージョンに連動
  }
}
```

**理由**: `appVersion` ポリシーだと、ビルドごとにruntimeVersionが変わり、Updateが古いビルドに配信されない事故が起きる。

**代替案**: カスタム値を使う場合は、Breaking Changes がある時だけインクリメントする：

```json
{
  "runtimeVersion": "1.0.0"  // Breaking Change がない限り固定
}
```

---

### 2. Update メッセージに「対応コミット/Build ID」を必須記載

```bash
# ✅ 良い例
npx eas-cli update --branch preview \
  --message "Fix: Align API Keys (commit: b69df7a, Build: 79fbb0f4)"

# ❌ 悪い例
npx eas-cli update --branch preview --message "バグ修正"
```

**必須フォーマット**:
```
[type]: [description] (commit: [short-hash], Build: [build-id])
```

**例**:
- `Fix: Correct Auth Issuer URL (commit: abc1234, Build: 79fbb0f4)`
- `Feat: Add face detection (commit: def5678, Build: 8a9b0c1d)`
- `Refactor: Simplify state management (commit: ghi9012, Build: e2f3g4h5)`

---

### 3. 設定タブに表示する情報

アプリの設定画面に以下を表示し、ユーザーがビルド/Updateの紐づけを確認できるようにする：

```tsx
// apps/mobile/src/app/(tabs)/settings.tsx

import * as Updates from 'expo-updates';
import Constants from 'expo-constants';

const appVersion = Constants.expoConfig?.version;
const runtimeVersion = Updates.runtimeVersion;
const updateId = Updates.updateId;
const channel = Updates.channel;
const isEmbeddedLaunch = Updates.isEmbeddedLaunch;

<View>
  <Text>バージョン: {appVersion}</Text>
  <Text>Runtime Version: {runtimeVersion}</Text>
  <Text>Update ID: {updateId?.substring(0, 8)}</Text>
  <Text>配信チャンネル: {channel}</Text>
  <Text>起動モード: {isEmbeddedLaunch ? 'Embedded' : 'OTA Update'}</Text>
</View>
```

**既に実装済み** ✅ (apps/mobile/src/app/(tabs)/settings.tsx:254-281)

---

### 4. Build 作成 → Update 配信の標準フロー

#### 4.1 ネイティブ変更なし（JS/TSのみ）

```bash
# 1. コード変更
vim apps/mobile/src/components/FaceDetection.tsx

# 2. コミット
git add -A
git commit -m "Fix: Improve face detection accuracy"

# 3. EAS Update のみ配信
export EXPO_TOKEN="r3kIBuCA-RDE1_KYFJKcsEIaMi-t2TThCKIOPgBu"
cd apps/mobile
npx eas-cli update --branch preview \
  --message "Fix: Improve face detection accuracy (commit: $(git rev-parse --short HEAD), Build: 最新BuildID)"
```

**重要**: ネイティブ変更がない場合、新しいビルドは不要。既存ビルドにUpdateを当てるだけで良い。

#### 4.2 ネイティブ変更あり（android/, ios/, app.config.ts plugin等）

```bash
# 1. ネイティブ設定変更
vim apps/mobile/app.config.ts  # plugin 追加など

# 2. コミット
git add -A
git commit -m "Feat: Add camera permission handling"

# 3. 新しいビルド作成（10〜15分）
export EXPO_TOKEN="r3kIBuCA-RDE1_KYFJKcsEIaMi-t2TThCKIOPgBu"
cd apps/mobile
npx eas-cli build --platform android --profile preview --non-interactive

# 4. ビルド完了を待つ
# Build ID をメモ: 例 79fbb0f4-31ac-4059-8181-667402e2f7a5

# 5. ビルド完了後、EAS Update を配信
npx eas-cli update --branch preview \
  --message "Feat: Add camera permission handling (commit: $(git rev-parse --short HEAD), Build: 79fbb0f4)"
```

**重要**: ネイティブ変更がある場合、**必ず新しいビルドを作成** → その後にUpdateを配信する。

---

## 🔍 トラブルシューティング

### Q1: Updateを配信したのに古いコードが動く

**原因**: ビルドとUpdateのruntimeVersionが一致していない

**確認方法**:
```bash
# ビルドのruntimeVersionを確認
npx eas-cli build:list --platform android --limit 1

# UpdateのruntimeVersionを確認
npx eas-cli update:list --branch preview --limit 1
```

**解決策**: runtimeVersionが一致するビルドを作り直すか、runtimeVersion を `sdkVersion` ポリシーに統一する。

### Q2: Updateが「pending」のまま適用されない

**原因**: アプリが再起動されていない

**解決策**:
```bash
# 実機でアプリを強制終了 → 再起動
adb shell am force-stop com.bmeconsulting.mcgate
adb shell am start -n com.bmeconsulting.mcgate/.MainActivity
```

Updateは **次回の起動時** に適用される（React Native のリロードでは適用されない）。

### Q3: ビルドに古いコードが含まれている

**原因**: ビルド作成前にgit commitしていない

**解決策**: 必ずコミットしてから `eas build` を実行する。

---

## 📊 運用チェックリスト

### ビルド作成前

- [ ] すべての変更がgitにコミット済み
- [ ] `git status` で未コミットの変更がないことを確認
- [ ] ネイティブ変更の有無を確認
- [ ] app.config.ts の `version` と `versionCode` をインクリメント（必要に応じて）

### ビルド作成後

- [ ] ビルドが完了している（Status: finished）
- [ ] Build ID をメモ
- [ ] QRコードで実機テスト
- [ ] 問題なければEAS Update配信

### Update配信前

- [ ] Update message に commit hash と Build ID を含める
- [ ] 配信先のbranchが正しいことを確認（preview / production）
- [ ] runtimeVersionがビルドと一致していることを確認

### Update配信後

- [ ] 実機でアプリを再起動
- [ ] 設定タブで Update ID と Update日時が更新されていることを確認
- [ ] 主要機能が正常動作することを確認

---

## 🚨 禁止事項

### ❌ やってはいけないこと

1. **未コミットの変更でビルド作成**
   - 結果: ビルドに変更が含まれず、Updateとの不整合が発生

2. **Build作成せずにネイティブ変更をUpdate配信**
   - 結果: アプリがクラッシュまたは動作不良

3. **runtimeVersionをコロコロ変える**
   - 結果: 古いビルドにUpdateが配信されず、ユーザーが古いバージョンのまま放置される

4. **Updateメッセージに「修正」「更新」だけ書く**
   - 結果: どのビルドに対応するか不明で、トラブル時に追跡不可能

5. **productionブランチにpreviewキーを含むUpdate配信**
   - 結果: 本番環境でテストキーが使われ、セキュリティリスク

---

## 📝 Expo警告の対処

### cli.appVersionSource 警告

```
The field "cli.appVersionSource" is not set, but it will be required in the future.
```

**対処**:
```json
// eas.json
{
  "cli": {
    "version": ">= 16.0.0",
    "appVersionSource": "local"  // local | remote
  }
}
```

**推奨**: `"local"` を使用（app.config.ts の version を信頼する）

---

## 🔗 参考資料

- [EAS Update 公式ドキュメント](https://docs.expo.dev/eas-update/introduction/)
- [Runtime Versions](https://docs.expo.dev/eas-update/runtime-versions/)
- [アプリバージョン管理](https://docs.expo.dev/build-reference/app-versions/)

---

**最終確認日**: 2025-12-18
**確認者**: Claude (with user collaboration)
**状態**: 実機テスト済み ✅
