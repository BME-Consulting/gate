# EAS Update 運用ガイドライン

## 目次

1. [runtimeVersion の概要](#runtimeversion-の概要)
2. [運用ルール](#運用ルール)
3. [ワークフロー](#ワークフロー)
4. [トラブルシューティング](#トラブルシューティング)

---

## runtimeVersion の概要

### runtimeVersion とは

**runtimeVersion** は、EAS Update の互換性を管理するためのバージョン管理システムです。

- **目的**: アプリのネイティブコードとJavaScriptコードの互換性を保証する
- **重要性**: 互換性のないアップデートを配信すると、アプリがクラッシュする可能性がある

### 現在の設定

```javascript
// app.config.js
runtimeVersion: {
  policy: "sdkVersion"
}
```

**policy: "sdkVersion"** の意味:
- Expo SDK バージョンと自動的に同期
- SDK バージョンが変わると、runtimeVersion も自動的に変わる
- 同じ SDK バージョンのビルドには、同じ runtimeVersion のアップデートが配信される

### メリット

✅ **自動管理**: SDK バージョンに基づいて自動的に設定される
✅ **安全性**: SDK 互換性が自動的に保証される
✅ **シンプル**: 手動でバージョン管理する必要がない

### デメリット

⚠️ **SDK アップグレード時の注意**: SDK をアップグレードすると、runtimeVersion が変わるため、**新しいビルドが必須**

---

## 運用ルール

### ルール1: ネイティブコード変更時は新しいビルドが必須

**ネイティブコード変更**とは:
- `app.config.js` のプラグイン設定変更
- `android/` または `ios/` ディレクトリの変更
- SDK バージョンアップ
- `expo-build-properties` の設定変更

**対応**:
```bash
# 1. 変更をコミット
git add -A
git commit -m "変更内容"

# 2. 新しいビルドを作成
export EXPO_TOKEN="..."
npx eas-cli build --platform android --profile preview --non-interactive

# 3. ビルド完了後（10〜15分）、EAS Update を配信
npx eas-cli update --branch preview --message "変更内容"
```

### ルール2: JS/TSコード変更のみなら EAS Update のみでOK

**JS/TSコード変更**とは:
- React コンポーネントの修正
- ビジネスロジックの変更
- UI の変更
- バグ修正

**対応**:
```bash
# 1. 変更をコミット
git add -A
git commit -m "変更内容"

# 2. EAS Update を配信（ビルド不要）
export EXPO_TOKEN="..."
npx eas-cli update --branch preview --message "変更内容"
```

### ルール3: SDK アップグレード時は全環境で新ビルドが必要

**理由**: `policy: "sdkVersion"` により、SDK バージョンが変わると runtimeVersion が変わる

**対応**:
```bash
# 1. SDK アップグレード
npx expo install --fix

# 2. 変更をコミット
git add -A
git commit -m "Upgrade Expo SDK to vXX.0.0"

# 3. 全プロファイルで新ビルドを作成
npx eas-cli build --platform android --profile preview --non-interactive
npx eas-cli build --platform android --profile production --non-interactive

# 4. ビルド完了後、各ブランチに EAS Update を配信
npx eas-cli update --branch preview --message "SDK vXX.0.0"
npx eas-cli update --branch production --message "SDK vXX.0.0"
```

---

## ワークフロー

### 開発フロー（preview ブランチ）

```
1. コード変更
   ↓
2. コミット
   ↓
3. ネイティブ変更？
   ├─ Yes → ビルド作成 → EAS Update
   └─ No  → EAS Update のみ
   ↓
4. テスト（QRコード or APK）
   ↓
5. 問題なければ production へマージ
```

### 本番リリースフロー（production ブランチ）

```
1. preview で十分にテスト
   ↓
2. production ブランチにマージ
   ↓
3. バージョンアップ（app.config.js）
   - version: "1.0.X" → "1.0.Y"
   - versionCode: X → Y
   ↓
4. コミット
   ↓
5. プロダクションビルド作成
   export EXPO_TOKEN="..."
   npx eas-cli build --platform android --profile production --non-interactive
   ↓
6. ビルド完了後、EAS Update 配信
   npx eas-cli update --branch production --message "Release v1.0.Y"
   ↓
7. 実機で動作確認
```

---

## トラブルシューティング

### エラー: "No compatible update found"

**原因**: ビルドの runtimeVersion とアップデートの runtimeVersion が一致していない

**解決策**:
```bash
# 1. ビルドの runtimeVersion を確認
npx eas-cli build:list --platform android --limit 1

# 2. アップデートの runtimeVersion を確認
npx eas-cli update:list --branch preview --limit 1

# 3. 一致していなければ、新しいビルドを作成
npx eas-cli build --platform android --profile preview --non-interactive

# 4. ビルド完了後、EAS Update を配信
npx eas-cli update --branch preview --message "Fix runtime version mismatch"
```

### エラー: SDK アップグレード後にアップデートが配信されない

**原因**: SDK バージョンが変わり、runtimeVersion が変わった

**解決策**: 上記「ルール3」に従って全環境で新ビルドを作成

### チェックリスト: アップデート配信前

- [ ] 変更がコミット済み（`git status` で確認）
- [ ] ネイティブ変更がある場合は新ビルドを作成済み
- [ ] ビルド完了後にアップデートを配信している
- [ ] ビルドとアップデートのコミットハッシュが一致している

---

## ベストプラクティス

### 1. コミット前に未変更ファイルをチェック

```bash
git status
```

未コミットの変更があると、ビルドとアップデートのコミットハッシュが一致しない

### 2. ビルドとアップデートを常にセットで実行

```bash
# ビルド作成
npx eas-cli build --platform android --profile preview --non-interactive

# ビルド完了を待つ（10〜15分）

# EAS Update 配信
npx eas-cli update --branch preview --message "変更内容"
```

### 3. チャンネル名とブランチ名を一致させる

```json
// eas.json
{
  "build": {
    "preview": {
      "channel": "preview"  // ブランチ名と同じ
    },
    "production": {
      "channel": "production"  // ブランチ名と同じ
    }
  }
}
```

### 4. ログとエラーをモニタリング

アプリ内で以下を確認:
- `Updates.channel`: 期待するチャンネル名か
- `Updates.runtimeVersion`: 期待するバージョンか
- `checkForUpdateAsync()`: エラーなく動作するか

---

## まとめ

- **runtimeVersion: policy: "sdkVersion"** は推奨設定
- **ネイティブ変更時は新ビルドが必須**
- **JS/TS変更のみなら EAS Update のみでOK**
- **SDK アップグレード時は全環境で新ビルド**
- **ビルドとアップデートは常にセットで実行**

この運用ルールに従えば、EAS Update 事故を防止できます。

---

**最終更新**: 2025-11-25
**作成者**: Claude Code
**関連ドキュメント**: CLAUDE.md
