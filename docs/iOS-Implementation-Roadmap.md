# iOS アプリ実装ロードマップ - mc-gate プロジェクト

**作成日**: 2025-11-18
**対象プロジェクト**: mc-gate (Gate Authentication Mobile App)
**現在のバージョン**: v1.0.11 (Android実装完了)
**目標**: iOS アプリの実装と App Store 公開

---

## 📋 目次

1. [プロジェクト概要](#プロジェクト概要)
2. [現在の状況](#現在の状況)
3. [iOS実装ロードマップ](#ios実装ロードマップ)
4. [タイムライン](#タイムライン)
5. [必要なリソース](#必要なリソース)
6. [リスクと対策](#リスクと対策)

---

## プロジェクト概要

### アプリ名
**mc-gate** - 建設現場向け入退場管理モバイルアプリ

### 技術スタック
- **フレームワーク**: React Native 0.81.5 + New Architecture
- **開発プラットフォーム**: Expo SDK 54
- **ビルドサービス**: EAS Build
- **更新配信**: EAS Update
- **状態管理**: Zustand
- **データベース**: expo-sqlite (SQLite)
- **認証**: Expo Auth Session (OAuth 2.0 / Keycloak想定)

### 主な機能
1. **QRコード認証**: カメラでQRコードをスキャンして入退場記録
2. **顔認証**: Face API Serverと連携した顔認証（将来実装）
3. **オフライン対応**: ネットワーク切断時でもローカルに記録し、復帰時に同期
4. **履歴管理**: 入退場履歴の表示とフィルタリング
5. **統計情報**: 今日の入場/退場数、現在の場内人数表示

### Bundle Identifier
- **iOS**: `com.bmeconsulting.mcgate`
- **Android**: `com.bmeconsulting.mcgate` (実装済み)

---

## 現在の状況

### ✅ 完了している項目
- Androidアプリ完成（v1.0.11, versionCode 12）
- EAS Build 設定完了
- EAS Update 配信実績あり
- オフライン同期機能実装済み
- SQLiteローカルデータベース実装済み
- QRコードスキャン機能実装済み

### ⏳ iOS未実装の理由
- Apple Developer Program 未登録
- iOS証明書・Provisioning Profile 未作成
- iOS実機テスト未実施

### 📦 現在のEAS設定

**eas.json** (`/volume2/Project/MCD3/TUMON/mc-gate/eas.json`):
```json
{
  "cli": {
    "version": ">= 16.0.0",
    "appVersionSource": "remote"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "channel": "development",
      "ios": {
        "buildConfiguration": "Debug",
        "simulator": false
      }
    },
    "preview": {
      "distribution": "internal",
      "channel": "preview",
      "ios": {
        "simulator": false
      },
      "android": {
        "buildType": "apk"
      }
    },
    "production": {
      "channel": "production",
      "ios": {
        "simulator": false
      },
      "android": {
        "buildType": "app-bundle"
      }
    }
  },
  "submit": {
    "production": {}
  }
}
```

**app.config.ts** (`/volume2/Project/MCD3/TUMON/mc-gate/apps/mobile/app.config.ts`):
```typescript
ios: {
  bundleIdentifier: "com.bmeconsulting.mcgate",
  supportsTablet: true,
  infoPlist: {
    NSCameraUsageDescription: "QRコードの読み取りにカメラを使用します。",
    NSBluetoothAlwaysUsageDescription:
      "CCUSカードリーダーとの通信にBluetoothを使用します。",
  },
}
```

---

## iOS実装ロードマップ

### フェーズ1: 開発環境セットアップ（所要時間: 1〜2日）

#### 1.1 Apple Developer Program 登録

**必要な情報**:
- Apple ID（2要素認証有効化必須）
- クレジットカード（年間 $99 USD）
- D-U-N-S Number（法人の場合）

**手順**:
1. [Apple Developer Program](https://developer.apple.com/programs/) にアクセス
2. 「Enroll」をクリック
3. Apple IDでログイン（2要素認証を有効化）
4. 登録タイプを選択:
   - **個人**: Individual（個人名義）
   - **法人**: Organization（D-U-N-S Number必要）
5. 支払い情報を入力（$99/年）
6. 登録完了まで待つ（1〜2営業日）

**確認事項**:
- [ ] Apple Developer Program登録完了
- [ ] Apple IDで[Apple Developer Portal](https://developer.apple.com/account/)にアクセス可能
- [ ] 2要素認証設定済み

---

#### 1.2 App ID 作成

**手順**:
1. [Apple Developer Portal - Identifiers](https://developer.apple.com/account/resources/identifiers/list) にアクセス
2. 「+」ボタンをクリック
3. 「App IDs」を選択して「Continue」
4. 「App」を選択して「Continue」
5. 設定を入力:
   - **Description**: `mc-gate`
   - **Bundle ID**: `Explicit` を選択
   - **Bundle Identifier**: `com.bmeconsulting.mcgate`
6. Capabilities（必要な権限）を選択:
   - ✅ **Associated Domains**（将来のディープリンク用）
   - ✅ **Push Notifications**（将来のプッシュ通知用）
7. 「Continue」→「Register」をクリック

**確認事項**:
- [ ] App ID作成完了
- [ ] Bundle Identifier: `com.bmeconsulting.mcgate`

---

#### 1.3 開発者証明書取得

**手順**:
1. **iOS App Development 証明書**（開発用）
   - [Certificates](https://developer.apple.com/account/resources/certificates/list) → 「+」ボタン
   - 「Apple Development」を選択して「Continue」
   - CSR（Certificate Signing Request）をアップロード:
     - Mac の場合: キーチェーンアクセス → 証明書アシスタント → 認証局に証明書を要求
     - EAS Buildの場合: **スキップ可能**（EAS Buildが自動管理）
   - 「Continue」→「Download」

2. **iOS Distribution 証明書**（本番配信用）
   - 「Apple Distribution」を選択して「Continue」
   - CSRをアップロード
   - 「Continue」→「Download」

**EAS Build使用時の注意**:
- EAS Buildは証明書を自動管理可能
- 初回ビルド時に `eas credentials` で証明書を生成できる
- 手動で証明書を作成する必要はない（推奨: EAS自動管理）

**確認事項**:
- [ ] 証明書管理方針を決定（EAS自動管理 or 手動管理）
- [ ] EAS自動管理を選択する場合: この手順をスキップ

---

#### 1.4 App Store Connect でアプリ作成

**手順**:
1. [App Store Connect](https://appstoreconnect.apple.com/) にアクセス
2. 「マイApp」→「+」ボタン → 「新規App」
3. アプリ情報を入力:
   - **プラットフォーム**: iOS
   - **名前**: `mc-gate`（App Store表示名、32文字以内）
   - **プライマリ言語**: 日本語
   - **Bundle ID**: `com.bmeconsulting.mcgate`（先ほど作成したApp IDを選択）
   - **SKU**: `com.bmeconsulting.mcgate`（内部管理用、任意の文字列）
   - **ユーザーアクセス**: フルアクセス
4. 「作成」をクリック

**確認事項**:
- [ ] App Store Connectでアプリ作成完了
- [ ] App Store Connect App ID（数字のID）をメモ

---

### フェーズ2: EAS Build設定（iOS Development）（所要時間: 0.5日）

#### 2.1 eas.json の iOS設定確認

現在の `eas.json` は既にiOS設定が含まれています。確認のみ実施:

```json
{
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "channel": "development",
      "ios": {
        "buildConfiguration": "Debug",
        "simulator": false  // 実機配信（TestFlight経由）
      }
    },
    "preview": {
      "distribution": "internal",
      "channel": "preview",
      "ios": {
        "simulator": false  // 実機配信
      }
    },
    "production": {
      "channel": "production",
      "ios": {
        "simulator": false  // App Store配信
      }
    }
  }
}
```

**確認事項**:
- [ ] `ios.simulator: false` が設定されている（実機配信）
- [ ] 各プロファイルに `channel` が設定されている

**注意**: シミュレーターでテストしたい場合は、別途 `simulator: true` のプロファイルを追加可能

---

#### 2.2 app.config.ts の iOS設定確認

現在の設定を確認:

```typescript
ios: {
  bundleIdentifier: "com.bmeconsulting.mcgate",  // ✅ 設定済み
  supportsTablet: true,  // iPad対応
  infoPlist: {
    NSCameraUsageDescription: "QRコードの読み取りにカメラを使用します。",  // ✅
    NSBluetoothAlwaysUsageDescription:
      "CCUSカードリーダーとの通信にBluetoothを使用します。",  // ✅
  },
},
plugins: [
  "expo-updates",
  [
    "expo-build-properties",
    {
      ios: {
        newArchEnabled: true,  // ✅ New Architecture有効
        infoPlist: {
          NSAppTransportSecurity: {
            NSAllowsArbitraryLoads: !isProduction,  // 開発中はHTTP許可
          }
        }
      },
      android: {
        newArchEnabled: true,
        usesCleartextTraffic: !isProduction,
      },
    },
  ],
],
```

**追加設定が必要な項目**:

```typescript
// app.config.ts に追加（顔認証を使用する場合）
ios: {
  bundleIdentifier: "com.bmeconsulting.mcgate",
  supportsTablet: true,
  infoPlist: {
    NSCameraUsageDescription: "QRコードの読み取りにカメラを使用します。",
    NSBluetoothAlwaysUsageDescription:
      "CCUSカードリーダーとの通信にBluetoothを使用します。",
    NSFaceIDUsageDescription: "顔認証機能で使用します。",  // 追加（Face ID使用時）
    NSPhotoLibraryUsageDescription: "QRコード画像の保存に使用します。",  // 追加（写真保存時）
  },
},
```

**確認事項**:
- [ ] Bundle Identifier が正しい
- [ ] Privacy権限（Camera, Bluetooth）が設定されている
- [ ] ATS（App Transport Security）設定が開発環境に対応している

---

#### 2.3 初回ビルド作成（iOS Development）

**前提条件**:
- EXPO_TOKEN 取得済み（EAS CLI認証用）
- プロジェクトディレクトリ: `/volume2/Project/MCD3/TUMON/mc-gate/apps/mobile`

**コマンド**:
```bash
# 環境変数設定
export EXPO_TOKEN="r3kIBuCA-RDE1_KYFJKcsEIaMi-t2TThCKIOPgBu"

# プロジェクトディレクトリに移動
cd /volume2/Project/MCD3/TUMON/mc-gate/apps/mobile

# iOS Development ビルド作成
npx eas-cli build --platform ios --profile development --non-interactive
```

**初回ビルド時の対話プロンプト**:
1. **Apple IDの入力**:
   ```
   ? What is your Apple ID? your-apple-id@example.com
   ```

2. **Apple ID パスワードの入力**:
   ```
   ? Password for your-apple-id@example.com: [入力]
   ```

3. **2要素認証コードの入力**:
   ```
   ? Two-factor authentication code: [6桁のコード]
   ```

4. **証明書管理方法の選択**:
   ```
   ? Would you like EAS to handle provisioning and signing for you? (recommended) (Y/n)
   ```
   → **Y** を選択（EAS自動管理を推奨）

**ビルド時間**: 15〜20分

**ビルド成功の確認**:
```bash
# ビルドリストを表示
npx eas-cli build:list --platform ios --limit 1
```

**期待される出力**:
```
✔ Build finished
Build ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
Status: finished
Platform: ios
Profile: development
Version: 1.0.11
Build number: 1
```

**確認事項**:
- [ ] ビルドが成功（Status: finished）
- [ ] EAS Dashboard でビルドを確認: https://expo.dev/accounts/bme_llc/projects/mc-gate/builds

---

### フェーズ3: シミュレーターテスト（所要時間: 1〜2日）

#### 3.1 シミュレータービルドの作成（オプション）

実機テスト前にシミュレーターで動作確認したい場合:

**eas.json に追加**:
```json
{
  "build": {
    "simulator": {
      "distribution": "internal",
      "channel": "development",
      "ios": {
        "simulator": true  // シミュレーター用
      }
    }
  }
}
```

**ビルド作成**:
```bash
npx eas-cli build --platform ios --profile simulator
```

**シミュレーターにインストール**:
```bash
# ビルドをダウンロード
npx eas-cli build:download --platform ios --profile simulator

# Xcodeシミュレーターで開く
open path/to/downloaded.app
```

---

#### 3.2 動作確認項目

**基本機能**:
- [ ] アプリ起動確認
- [ ] ログイン画面表示
- [ ] プロジェクト選択画面表示
- [ ] スキャン画面表示

**QRコードスキャン**:
- [ ] カメラ権限の要求ダイアログ表示
- [ ] カメラ起動確認
- [ ] QRコードスキャン成功
- [ ] スキャン結果の保存確認

**履歴管理**:
- [ ] 履歴一覧表示
- [ ] 日付フィルタリング
- [ ] 入場/退場フィルタリング

**オフライン対応**:
- [ ] ネットワーク切断時のローカル保存
- [ ] ネットワーク復帰時の同期

**設定画面**:
- [ ] アプリ情報表示
- [ ] ダミーデータ生成
- [ ] ログアウト

---

#### 3.3 iOSで発生しうる問題と対策

**問題1: カメラ権限が取得できない**

**原因**: `NSCameraUsageDescription` が設定されていない

**対策**:
```typescript
// app.config.ts で設定済み
infoPlist: {
  NSCameraUsageDescription: "QRコードの読み取りにカメラを使用します。",
}
```

---

**問題2: HTTP接続が失敗する（ATS制限）**

**原因**: iOS はデフォルトでHTTP通信を拒否（App Transport Security）

**対策**:
```typescript
// app.config.ts で設定済み
plugins: [
  [
    "expo-build-properties",
    {
      ios: {
        infoPlist: {
          NSAppTransportSecurity: {
            NSAllowsArbitraryLoads: !isProduction,  // 開発中のみHTTP許可
          }
        }
      }
    }
  ]
]
```

**本番環境での対策**:
```typescript
// 本番環境では特定ドメインのみ例外設定
NSAppTransportSecurity: {
  NSExceptionDomains: {
    "192.168.1.4": {
      NSTemporaryExceptionAllowsInsecureHTTPLoads: true
    }
  }
}
```

---

**問題3: SQLiteデータベースが動作しない**

**原因**: `expo-sqlite` のiOS対応が不完全

**対策**:
- React Native 0.81 + Expo SDK 54 では問題なし
- `expo-sqlite@15.0.4` を使用（package.jsonで設定済み）

---

### フェーズ4: TestFlight ベータ配信（所要時間: 1〜2週間）

#### 4.1 TestFlight用ビルド作成

**ビルド作成**:
```bash
export EXPO_TOKEN="r3kIBuCA-RDE1_KYFJKcsEIaMi-t2TThCKIOPgBu"
cd /volume2/Project/MCD3/TUMON/mc-gate/apps/mobile

# iOS Preview ビルド作成
npx eas-cli build --platform ios --profile preview --non-interactive
```

**ビルド完了確認**:
```bash
npx eas-cli build:list --platform ios --profile preview --limit 1
```

---

#### 4.2 TestFlightアップロード

**自動アップロード（推奨）**:
```bash
# EAS Submit で自動アップロード
npx eas-cli submit --platform ios --profile preview
```

**対話プロンプト**:
```
? Apple ID: your-apple-id@example.com
? Password: [入力]
? Two-factor authentication code: [6桁のコード]
? App Store Connect App ID: [App Store ConnectのApp ID（数字）]
```

**アップロード成功の確認**:
- App Store Connect → TestFlight タブ
- 「処理中」から「テスト可能」に変わるまで待つ（5〜10分）

---

#### 4.3 内部テスター招待

**手順**:
1. App Store Connect → TestFlight → 「内部テスト」
2. 「+」ボタン → 「新規内部グループ」
3. グループ名を入力: `mc-gate Internal Testers`
4. テスターを追加:
   - テスターのApple IDを入力
   - 「追加」をクリック
5. ビルドを選択:
   - 最新ビルドを選択
   - 「テスト開始」をクリック

**テスターへの招待メール送信**:
- テスターのメールアドレスに TestFlight 招待が届く
- テスターが TestFlight アプリをインストールして受諾

**確認事項**:
- [ ] 内部テスターグループ作成完了
- [ ] テスター追加完了
- [ ] 招待メール送信完了
- [ ] テスターが TestFlight で受諾

---

#### 4.4 ベータテスト

**テスト項目**:

1. **基本機能テスト**:
   - [ ] アプリインストール成功
   - [ ] 初回起動確認
   - [ ] ログイン機能
   - [ ] プロジェクト選択

2. **QRコードスキャン**:
   - [ ] カメラ起動
   - [ ] QRコードスキャン成功
   - [ ] 入場/退場モード切り替え
   - [ ] スキャン結果保存

3. **履歴管理**:
   - [ ] 履歴一覧表示
   - [ ] フィルタリング機能
   - [ ] ページネーション

4. **オフライン対応**:
   - [ ] ネットワーク切断時の動作
   - [ ] ローカル保存確認
   - [ ] 同期機能

5. **パフォーマンス**:
   - [ ] アプリ起動速度
   - [ ] スキャン速度
   - [ ] データベースクエリ速度

**フィードバック収集**:
- TestFlight の「フィードバック」機能を活用
- クラッシュレポートの確認
- バグ修正と再ビルド

**所要時間**: 1〜2週間（テスター募集・フィードバック収集）

---

### フェーズ5: App Store審査準備（所要時間: 2〜3日）

#### 5.1 App Store Connect 設定

**アプリ情報**:
1. App Store Connect → 「マイApp」 → 「mc-gate」
2. 「App情報」タブ:
   - **名前**: `mc-gate`
   - **サブタイトル**: `建設現場入退場管理`（30文字以内）
   - **プライバシーポリシーURL**: `https://your-domain.com/privacy-policy`
   - **カテゴリ**: `ビジネス` → `生産性`

**App Store説明文（日本語）**:
```
mc-gateは、建設現場やイベント会場での入退場管理を効率化するモバイルアプリです。

【主な機能】
• QRコードスキャン: カメラでQRコードを読み取り、瞬時に入退場を記録
• オフライン対応: ネットワーク環境がない場所でも利用可能
• 履歴管理: 入退場履歴をリアルタイムで確認
• 統計情報: 今日の入場者数、退場者数、現在の場内人数を表示

【こんな方におすすめ】
• 建設現場の入退場管理担当者
• イベント運営スタッフ
• セキュリティ管理者

【特徴】
• シンプルで使いやすいUI
• オフライン環境でも動作
• 高速なスキャン処理
• 安全なデータ管理
```

**App Store説明文（英語）**:
```
mc-gate is a mobile app designed to streamline entry/exit management at construction sites and event venues.

【Key Features】
• QR Code Scanning: Instantly record entry/exit by scanning QR codes with the camera
• Offline Support: Works even without network connectivity
• History Management: View entry/exit history in real-time
• Statistics: Display today's entry count, exit count, and current on-site personnel

【Recommended For】
• Construction site entry/exit managers
• Event operation staff
• Security managers

【Highlights】
• Simple and intuitive UI
• Offline functionality
• Fast scanning process
• Secure data management
```

**キーワード設定**:
```
入退場管理,QRコード,建設現場,セキュリティ,Gate,Entry,Exit,Construction,Site Management,QR Scanner
```

**サポートURL**:
```
https://your-domain.com/support
```

---

#### 5.2 スクリーンショット準備

**必須サイズ**:
- **6.7インチ (iPhone 14 Pro Max)**: 1290 x 2796 px
- **6.5インチ (iPhone 11 Pro Max)**: 1242 x 2688 px
- **5.5インチ (iPhone 8 Plus)**: 1242 x 2208 px
- **12.9インチ iPad Pro**: 2048 x 2732 px（iPad対応の場合）

**推奨枚数**: 3〜10枚

**推奨内容**:
1. **ログイン画面**: アプリの初回画面
2. **QRコードスキャン画面**: メイン機能のデモ
3. **履歴一覧画面**: 入退場履歴の表示
4. **統計情報画面**: 今日の入場者数などの統計
5. **設定画面**: アプリ設定

**スクリーンショット作成方法**:
- Xcodeシミュレーターで撮影（Cmd + S）
- Figmaなどでモックアップ作成（推奨）
- [App Store Screenshot Generator](https://www.appscreens.com/) を活用

---

#### 5.3 アプリアイコン・プロモーション素材

**App Storeアイコン**:
- **サイズ**: 1024 x 1024 px
- **形式**: PNG（透明度なし）
- **既存アイコン**: `/volume2/Project/MCD3/TUMON/mc-gate/apps/mobile/assets/icon.png`

**確認事項**:
- [ ] アイコンサイズが1024x1024である
- [ ] 透明度がない
- [ ] 角丸なし（Appleが自動的に角丸処理）

---

#### 5.4 審査用情報

**審査ノート（App Review Information）**:
```
【アプリの使い方】
1. アプリを起動すると、ログイン画面が表示されます
2. テストアカウントでログイン（下記参照）
3. プロジェクト選択画面でプロジェクトを選択
4. スキャン画面でQRコードをスキャン
5. 履歴画面で入退場履歴を確認

【テストアカウント】
Username: demo-user
Password: demo-password-123

【QRコードテスト】
スキャン画面で「ダミーデータ生成」ボタンをタップすると、
テスト用のQRコードが表示されます。

【注意事項】
- 本アプリは建設現場向けの業務用アプリです
- 実際の使用には管理者によるプロジェクト設定が必要です
- デモ環境では模擬データを使用しています
```

**デモビデオ（オプション）**:
- アプリの使い方を30秒〜1分程度のビデオで説明
- 審査の通過率が向上

---

### フェーズ6: App Review ガイドライン確認（所要時間: 0.5日）

#### 6.1 App Store Review ガイドライン確認

**必須確認項目**:

1. **4.0 Design - デザイン**
   - [ ] アプリが完全に動作する
   - [ ] クラッシュしない
   - [ ] すべての機能が実装されている

2. **2.1 App Completeness - 完全性**
   - [ ] テストアカウントが有効
   - [ ] デモモードが動作する
   - [ ] プレースホルダーコンテンツがない

3. **2.3 Accurate Metadata - 正確なメタデータ**
   - [ ] スクリーンショットが実際のアプリと一致
   - [ ] 説明文が正確
   - [ ] カテゴリが適切

4. **5.1.1 Privacy - プライバシー**
   - [ ] プライバシーポリシーが公開されている
   - [ ] データ収集の開示が正確
   - [ ] Privacy Nutrition Labelが設定されている

---

#### 6.2 プライバシー設定（App Privacy）

**App Store Connect → App Privacy**:

1. **データ収集の開示**:
   - **位置情報**: 収集しない
   - **連絡先情報**: 収集しない
   - **ユーザーコンテンツ**: QRコードスキャンデータ（デバイスに保存）
   - **識別子**: なし
   - **使用状況データ**: 収集しない
   - **診断**: クラッシュログ（オプション）

2. **データの使用目的**:
   - **アプリの機能**: 入退場記録の保存
   - **サードパーティ広告**: なし
   - **サードパーティ分析**: なし

---

#### 6.3 カメラ・プライバシー設定確認

**app.config.ts で設定済み**:
```typescript
infoPlist: {
  NSCameraUsageDescription: "QRコードの読み取りにカメラを使用します。",
  NSBluetoothAlwaysUsageDescription:
    "CCUSカードリーダーとの通信にBluetoothを使用します。",
}
```

**確認事項**:
- [ ] カメラ権限の説明が適切
- [ ] Bluetooth権限の説明が適切
- [ ] 実際の使用目的と一致している

---

### フェーズ7: プロダクションビルド作成（所要時間: 0.5日）

#### 7.1 最終確認

**バージョン番号確認**:
```typescript
// app.config.ts
version: "1.0.11",  // Androidと同じバージョン
```

**ビルド番号**:
- iOS: 自動インクリメント（EAS Buildが管理）
- Android: `versionCode: 12`（現在の値）

**本番環境設定確認**:
```bash
# 設定を確認
cd /volume2/Project/MCD3/TUMON/mc-gate/apps/mobile
npx expo config --json | jq '{
  owner: .expo.owner,
  slug: .expo.slug,
  bundleIdentifier: .expo.ios.bundleIdentifier,
  version: .expo.version
}'
```

**期待される出力**:
```json
{
  "owner": "bme_llc",
  "slug": "mc-gate",
  "bundleIdentifier": "com.bmeconsulting.mcgate",
  "version": "1.0.11"
}
```

---

#### 7.2 プロダクションビルド作成

**コマンド**:
```bash
export EXPO_TOKEN="r3kIBuCA-RDE1_KYFJKcsEIaMi-t2TThCKIOPgBu"
cd /volume2/Project/MCD3/TUMON/mc-gate/apps/mobile

# iOS Production ビルド作成
npx eas-cli build --platform ios --profile production --non-interactive
```

**ビルド時間**: 15〜20分

**ビルド成功確認**:
```bash
npx eas-cli build:list --platform ios --profile production --limit 1
```

---

#### 7.3 EAS Update 配信

**ビルド完了後にUpdate配信**:
```bash
cd /volume2/Project/MCD3/TUMON/mc-gate/apps/mobile
npx eas-cli update --branch production --message "Initial iOS release v1.0.11"
```

**確認事項**:
- [ ] ビルドが成功（Status: finished）
- [ ] EAS Update配信成功
- [ ] ビルドとUpdateのコミットハッシュが一致

---

### フェーズ8: App Store提出（所要時間: 0.5日 + 審査待ち1〜3日）

#### 8.1 EAS Submit実行

**コマンド**:
```bash
export EXPO_TOKEN="r3kIBuCA-RDE1_KYFJKcsEIaMi-t2TThCKIOPgBu"
cd /volume2/Project/MCD3/TUMON/mc-gate/apps/mobile

# App Store に自動提出
npx eas-cli submit --platform ios --profile production
```

**対話プロンプト**:
```
? Apple ID: your-apple-id@example.com
? Password: [入力]
? Two-factor authentication code: [6桁のコード]
? App Store Connect App ID: [App Store ConnectのApp ID（数字）]
```

**アップロード成功の確認**:
- App Store Connect → 「アクティビティ」タブ
- 「処理中」から「審査準備完了」に変わるまで待つ（5〜10分）

---

#### 8.2 App Store Connect で最終確認

**手順**:
1. App Store Connect → 「マイApp」 → 「mc-gate」
2. 「+バージョンまたはプラットフォーム」 → 「iOS」
3. バージョン番号: `1.0.11`
4. ビルドを選択:
   - 最新のプロダクションビルドを選択
5. 「新機能」を入力:
   ```
   初回リリース
   • QRコードスキャン機能
   • 入退場履歴管理
   • オフライン対応
   ```
6. 「審査に提出」をクリック

**確認事項**:
- [ ] すべてのメタデータが入力済み
- [ ] スクリーンショットがアップロード済み
- [ ] プライバシー設定が完了
- [ ] 審査ノートが入力済み

---

#### 8.3 審査状況の確認

**審査ステータス**:
1. **審査待ち（Waiting for Review）**: 審査キューに追加済み
2. **審査中（In Review）**: 審査が開始されました
3. **承認済み（Approved）**: 審査に合格しました
4. **却下（Rejected）**: 修正が必要です

**審査期間**: 通常1〜3日（最大7日）

**却下された場合の対応**:
1. App Store Connect で却下理由を確認
2. 問題を修正
3. 新しいビルドを作成（バージョン番号を上げる）
4. 再度審査に提出

---

### フェーズ9: 審査通過後の対応（所要時間: 0.5日）

#### 9.1 公開設定

**手動リリース vs 自動リリース**:
- **手動リリース**: 審査通過後、自分で「リリース」ボタンをクリック
- **自動リリース**: 審査通過後、自動的にApp Storeで公開

**推奨**: 手動リリース（初回は動作確認後に公開）

**価格設定**:
- **価格**: 無料
- **配信国・地域**: 日本（追加で他国も選択可能）

---

#### 9.2 公開

**手順**:
1. App Store Connect → 「マイApp」 → 「mc-gate」
2. 「バージョンをリリース」ボタンをクリック
3. App Storeでの表示を確認（反映まで数時間）

**確認事項**:
- [ ] App Storeで検索可能
- [ ] ダウンロード可能
- [ ] スクリーンショット・説明文が正しく表示されている

---

#### 9.3 事後対応

**ユーザーレビュー監視**:
- App Store Connect → 「レビュー」タブ
- ネガティブなレビューには迅速に対応

**クラッシュレポート確認**:
- App Store Connect → 「分析」 → 「クラッシュ」
- 頻発するクラッシュは優先的に修正

**アップデート計画**:
- バグ修正: 随時
- 機能追加: 四半期ごと

---

### フェーズ10: 継続的メンテナンス

#### 10.1 アップデート配信

**OTA（Over-The-Air）アップデート（EAS Update）**:
```bash
# JS/TSコードのみの変更の場合
export EXPO_TOKEN="r3kIBuCA-RDE1_KYFJKcsEIaMi-t2TThCKIOPgBu"
cd /volume2/Project/MCD3/TUMON/mc-gate/apps/mobile

# コード変更をコミット
git add -A
git commit -m "fix: バグ修正"

# EAS Update配信（ビルド不要、数秒で配信）
npx eas-cli update --branch production --message "バグ修正 v1.0.11"
```

**新しいビルドが必要な場合（ネイティブ変更）**:
```bash
# app.config.ts の変更、プラグイン追加、SDKアップグレードなど

# バージョンアップ
# app.config.ts: version: "1.0.12"

# コミット
git add -A
git commit -m "feat: 新機能追加"

# 新しいビルド作成
npx eas-cli build --platform ios --profile production --non-interactive

# ビルド完了後（15〜20分）、App Storeに提出
npx eas-cli submit --platform ios --profile production

# EAS Update配信
npx eas-cli update --branch production --message "新機能追加 v1.0.12"
```

---

#### 10.2 バージョン管理

**Semantic Versioning**:
- **MAJOR**: 1.x.x（破壊的変更）
- **MINOR**: x.1.x（後方互換性のある機能追加）
- **PATCH**: x.x.1（バグ修正）

**例**:
- `1.0.11` → `1.0.12`（バグ修正）
- `1.0.12` → `1.1.0`（新機能追加）
- `1.1.0` → `2.0.0`（破壊的変更）

**CHANGELOG.md 更新**:
```markdown
## [1.0.12] - 2025-11-20
### Fixed
- QRコードスキャン時のクラッシュを修正

### Added
- 統計情報のグラフ表示機能

### Changed
- UI デザインの改善
```

**Git Tag 作成**:
```bash
git tag -a v1.0.12 -m "Release v1.0.12"
git push origin v1.0.12
```

---

## タイムライン

| フェーズ | タスク | 所要時間 | 累積時間 | 依存関係 |
|---------|--------|---------|---------|---------|
| 1 | 開発環境セットアップ | 1〜2日 | 1〜2日 | なし |
| 2 | EAS Build設定 | 0.5日 | 1.5〜2.5日 | フェーズ1完了 |
| 3 | シミュレーターテスト | 1〜2日 | 2.5〜4.5日 | フェーズ2完了 |
| 4 | TestFlightベータ配信 | 1〜2週間 | 2.5〜4.5週間 | フェーズ3完了 |
| 5 | App Store審査準備 | 2〜3日 | 3〜5週間 | フェーズ4完了 |
| 6 | ガイドライン確認 | 0.5日 | 3〜5週間 | フェーズ5と並行 |
| 7 | プロダクションビルド | 0.5日 | 3〜5週間 | フェーズ5完了 |
| 8 | App Store提出 | 0.5日 + 審査待ち1〜3日 | 4〜6週間 | フェーズ7完了 |
| 9 | 審査通過後の対応 | 0.5日 | 4〜6週間 | フェーズ8完了 |
| 10 | 継続的メンテナンス | 継続 | - | フェーズ9完了 |

**合計所要時間**: 約4〜6週間（審査期間含む）

**最短ルート**: 約4週間（審査がスムーズな場合）

---

## 必要なリソース

### 費用

| 項目 | 金額 | 備考 |
|------|------|------|
| Apple Developer Program | $99/年 | 必須（個人・法人共通） |
| EAS Build（iOS） | 無料枠あり | 月30分まで無料、超過分は従量課金 |
| **合計** | **$99/年** | 継続費用 |

**注意**: EAS Buildの無料枠（月30分）を超える場合、有料プラン（$29/月〜）が必要

---

### 人員

| 役割 | 人数 | スキル要件 |
|------|------|-----------|
| iOS開発者 | 1名 | React Native, Expo, iOS開発経験 |
| QAテスター | 2〜3名 | iOS実機テスト、TestFlight使用経験 |
| デザイナー | 1名（オプション） | App Storeスクリーンショット作成 |

---

### 機材

| 項目 | 必要性 | 用途 |
|------|--------|------|
| Mac（macOS Monterey以上） | 必須 | Xcode, シミュレーターテスト |
| iPhone実機（iOS 15以上） | 必須 | 実機テスト |
| iPad（オプション） | 推奨 | iPad対応のテスト |

**推奨テスト端末**:
- iPhone 14 Pro Max（6.7インチ）
- iPhone 11 Pro Max（6.5インチ）
- iPhone 8 Plus（5.5インチ）

---

## リスクと対策

### リスク1: Apple Developer Program 登録遅延

**リスク**: 法人登録の場合、D-U-N-S Number取得に2〜4週間かかる

**対策**:
- 個人アカウントで先行登録（1〜2日で完了）
- 後日、法人アカウントに移行

---

### リスク2: App Store 審査却下

**リスク**: 審査ガイドライン違反で却下される（初回却下率: 約30%）

**よくある却下理由**:
1. プライバシーポリシーが不適切
2. スクリーンショットが実際のアプリと異なる
3. テストアカウントが無効
4. クラッシュが発生する

**対策**:
- 事前に審査ガイドラインを熟読
- TestFlightで十分にテスト
- 審査ノートを詳細に記載
- デモビデオを提供

---

### リスク3: iOS特有のバグ

**リスク**: Androidで動作していた機能がiOSで動作しない

**対策**:
- シミュレーターテストを徹底
- TestFlightで複数デバイスでテスト
- React Native New ArchitectureはAndroid/iOS共通なので互換性は高い

---

### リスク4: HTTP接続の問題（ATS制限）

**リスク**: 開発環境がHTTPのため、iOSで接続できない

**対策**:
- `app.config.ts` で既に対策済み:
  ```typescript
  NSAppTransportSecurity: {
    NSAllowsArbitraryLoads: !isProduction,  // 開発中のみHTTP許可
  }
  ```
- 本番環境では必ずHTTPS化

---

### リスク5: EAS Buildの無料枠超過

**リスク**: ビルド回数が多く、無料枠（月30分）を超える

**対策**:
- ビルド前に十分にローカルテスト
- 不要なビルドを避ける
- 有料プラン（$29/月）への切り替えを検討

---

## 参考リンク

### 公式ドキュメント
- [Apple Developer Portal](https://developer.apple.com/)
- [App Store Connect](https://appstoreconnect.apple.com/)
- [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [EAS iOS Build Guide](https://docs.expo.dev/build/setup/)
- [EAS Submit iOS Guide](https://docs.expo.dev/submit/ios/)
- [Expo Configuration](https://docs.expo.dev/workflow/configuration/)

### プロジェクト情報
- **Owner**: bme_llc
- **Slug**: mc-gate
- **Project ID**: 0f0feec5-4f4b-4252-ad34-c1594238b4b8
- **Updates URL**: https://u.expo.dev/0f0feec5-4f4b-4252-ad34-c1594238b4b8
- **Dashboard**: https://expo.dev/accounts/bme_llc/projects/mc-gate

### 重要ファイルパス
- **eas.json**: `/volume2/Project/MCD3/TUMON/mc-gate/eas.json`
- **app.config.ts**: `/volume2/Project/MCD3/TUMON/mc-gate/apps/mobile/app.config.ts`
- **package.json**: `/volume2/Project/MCD3/TUMON/mc-gate/apps/mobile/package.json`
- **CLAUDE.md**: `/volume2/Project/MCD3/TUMON/mc-gate/CLAUDE.md`

---

## チェックリスト: iOS リリース前の最終確認

### 開発環境
- [ ] Apple Developer Program 登録完了
- [ ] App ID作成完了（`com.bmeconsulting.mcgate`）
- [ ] App Store Connect でアプリ作成完了

### ビルド設定
- [ ] `eas.json` のiOS設定確認
- [ ] `app.config.ts` のiOS設定確認
- [ ] Bundle Identifier 正しい
- [ ] Privacy権限（Camera, Bluetooth）設定済み

### ビルド・テスト
- [ ] Development ビルド成功
- [ ] シミュレーターテスト完了
- [ ] TestFlightビルド成功
- [ ] 実機テスト完了
- [ ] ベータテスト完了（1〜2週間）

### App Store準備
- [ ] アプリ情報（名前、説明文）入力完了
- [ ] スクリーンショット作成・アップロード完了
- [ ] プライバシーポリシー公開
- [ ] 審査ノート作成完了
- [ ] テストアカウント有効

### プロダクションリリース
- [ ] Production ビルド成功
- [ ] EAS Update配信完了
- [ ] App Store提出完了
- [ ] 審査通過
- [ ] App Store公開完了

---

## 次のステップ

1. **Apple Developer Program 登録**（最優先）
2. **App ID作成**
3. **初回iOS Developmentビルド作成**
4. **シミュレーター・実機テスト**
5. **TestFlightベータ配信**

---

**作成日**: 2025-11-18
**最終更新**: 2025-11-18
**作成者**: Claude (with user collaboration)
**プロジェクト**: mc-gate v1.0.11
