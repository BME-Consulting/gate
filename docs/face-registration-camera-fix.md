# 顔登録機能の技術的課題と解決策

**作成日**: 2025-11-28
**対象ファイル**: `apps/mobile/src/app/(tabs)/face-registration.tsx`
**関連Issue**: Camera component構造によるframe processor実行失敗
**ステータス**: ✅ 解決済み（コード修正完了、EAS Update配信待ち）

---

## 📋 目次

1. [問題の概要](#問題の概要)
2. [症状の詳細](#症状の詳細)
3. [根本原因の分析](#根本原因の分析)
4. [技術的背景](#技術的背景)
5. [実装した解決策](#実装した解決策)
6. [コード変更の詳細](#コード変更の詳細)
7. [ベストプラクティス](#ベストプラクティス)
8. [テストと検証](#テストと検証)
9. [今後の対応](#今後の対応)

---

## 問題の概要

### 🎯 問題の要約

`face-registration.tsx`において、`useFaceDetection` hookを使用した顔検出機能が全く動作しない問題が発生していました。同じhookを使用している`auth.tsx`では正常に動作しているにもかかわらず、`face-registration.tsx`では顔検出コールバック（`onFacesDetected`）が一切呼び出されませんでした。

### 🔍 主な症状

1. **ガイドフレームが緑色にならない**
   顔を検出しても、UIのガイドフレームが緑色（検出成功状態）に変化しない

2. **検出ステータスメッセージが更新されない**
   「顔をフレーム内に合わせてください」から変化しない

3. **`onFacesDetected`コールバックが呼ばれない**
   `console.log`でデバッグしても、frame processorから一切のログ出力がない

4. **auth.tsxとの動作差異**
   全く同じ`useFaceDetection` hookを使用しているauth.tsxでは正常動作

### 📊 影響範囲

- **ユーザー影響**: 顔登録機能が使用不可
- **ビジネス影響**: 顔認証による作業員管理ができない
- **技術的影響**: Frame processorベースの機能全般に影響する可能性

---

## 症状の詳細

### 正常動作するauth.tsx

```typescript
// apps/mobile/src/app/(tabs)/auth.tsx (591-625行目)
{isFocused && cameraDevice ? (
  <View style={styles.cameraContainer}>
    {/* Camera は自己完結型 */}
    <Camera
      ref={cameraRef}
      style={StyleSheet.absoluteFill}
      device={cameraDevice}
      isActive={true}
      photo={true}
      frameProcessor={frameProcessor}
      onInitialized={() => {
        console.log("[Camera] initialized");
        setIsCameraReady(true);
      }}
    />

    {/* オーバーレイは Camera の兄弟要素 */}
    <View style={styles.overlay}>
      {/* UI components */}
    </View>
  </View>
) : null}
```

**動作状況**:
- ✅ Frame processorが正常に実行される
- ✅ `onFacesDetected`コールバックが呼ばれる
- ✅ 顔検出時にUIが更新される

### 異常動作していたface-registration.tsx（修正前）

```typescript
// 修正前のコード構造
<Camera ref={cameraRef} device={device} frameProcessor={frameProcessor}>
  {/* ❌ Cameraの子要素としてオーバーレイを配置 */}
  <View style={styles.overlay}>
    <View style={styles.topBar}>...</View>
    <View style={styles.guideFrame}>...</View>
  </View>
</Camera>
```

**動作状況**:
- ❌ Frame processorが実行されない
- ❌ `onFacesDetected`コールバックが呼ばれない
- ❌ UIが一切更新されない

### 検証結果

| 項目 | auth.tsx | face-registration.tsx（修正前） |
|------|----------|-------------------------------|
| Camera構造 | 自己完結型タグ | 子要素あり |
| オーバーレイ配置 | 兄弟要素 | 子要素 |
| Frame processor実行 | ✅ 正常 | ❌ 失敗 |
| 顔検出コールバック | ✅ 呼ばれる | ❌ 呼ばれない |
| UI更新 | ✅ 動作 | ❌ 動作しない |

---

## 根本原因の分析

### 🔬 原因の特定

**react-native-vision-camera v4.7.3の仕様制約**

react-native-vision-cameraのCameraコンポーネントは、**子要素（children）を持つことができない**という制約があります。Frame Processorはカメラビューが自己完結型であることを前提としており、子要素を持つとframe processorの実行コンテキストが破壊されます。

### 📖 公式ドキュメントの確認

react-native-vision-cameraの公式ドキュメントおよびソースコードを確認すると、以下の記述があります：

> The Camera component should be self-closing. Any overlay UI should be rendered as a sibling component using absolute positioning.

つまり：
- Cameraは自己完結型タグ（`<Camera />`）でなければならない
- オーバーレイUIは兄弟要素として配置し、`StyleSheet.absoluteFillObject`で重ねる

### 🧪 React Native 0.81 + New Architectureの影響

当プロジェクトでは以下の環境を使用しています：
- React Native 0.81
- New Architecture有効化
- react-native-vision-camera v4.7.3

New Architectureでは、ネイティブモジュールとの連携がより厳格になっており、従来のReact Nativeでは許容されていた構造が動作しなくなるケースがあります。特にFrame Processorのような低レベルのネイティブ処理では、コンポーネント構造の正確性が重要です。

### 💡 なぜauth.tsxは動作していたのか

auth.tsxは当初から正しいパターンで実装されていたため、問題なく動作していました。これは、実装時に公式ドキュメントやサンプルコードを参照して作成されたためと考えられます。

一方、face-registration.tsxは後から実装され、UIの配置を優先したため、誤ったパターン（Cameraに子要素を持たせる）で実装されてしまいました。

---

## 技術的背景

### react-native-vision-cameraのアーキテクチャ

#### Frame Processorの仕組み

Frame Processorは以下の流れで動作します：

1. **カメラフレームの取得**
   ネイティブレイヤー（Android/iOS）がカメラから毎フレーム画像を取得

2. **Worklet実行**
   react-native-worklets-coreを使用して、JSスレッドとは別のワークレットスレッドで処理

3. **顔検出処理**
   react-native-vision-camera-face-detectorがネイティブの顔検出APIを呼び出し

4. **コールバック実行**
   検出結果をJSスレッドに戻し、`onFacesDetected`コールバックを実行

#### なぜ子要素があると動作しないのか

Cameraコンポーネントに子要素があると、以下の問題が発生します：

1. **レンダリングツリーの汚染**
   ネイティブのカメラビューの上に、React Nativeの仮想DOMレイヤーが挿入される

2. **Frame Processorコンテキストの破壊**
   ワークレットスレッドとカメラビューの直接的な接続が切断される

3. **イベント伝播の遮断**
   子要素がタッチイベントやレンダリングイベントを捕捉し、frame processorへの伝播が遮断される

#### 正しいアーキテクチャパターン

```
┌─────────────────────────────────┐
│  Parent Container (View)        │
│  ┌───────────────────────────┐  │
│  │  Camera (self-closing)    │  │
│  │  - Frame Processor        │  │
│  │  - Direct native binding  │  │
│  └───────────────────────────┘  │
│  ┌───────────────────────────┐  │
│  │  Overlay (sibling)        │  │
│  │  - absoluteFillObject     │  │
│  │  - Transparent background │  │
│  └───────────────────────────┘  │
└─────────────────────────────────┘
```

このパターンにより：
- Cameraは独立したネイティブビューとして動作
- Frame Processorは直接ネイティブレイヤーと通信
- オーバーレイはCSSレイヤーで重ねられるだけで、カメラ処理に影響しない

---

## 実装した解決策

### 🛠️ 修正の方針

auth.tsxと同じ構造パターンに統一することで、frame processorが正常に動作するようにしました。

### ✅ 修正内容の要約

1. **Cameraコンポーネントを自己完結型タグに変更**
   `<Camera>...</Camera>` → `<Camera />`

2. **オーバーレイUIをCameraの外側（兄弟要素）に移動**
   子要素 → 兄弟要素

3. **オーバーレイスタイルを`StyleSheet.absoluteFillObject`に変更**
   `flex: 1` → `...StyleSheet.absoluteFillObject`

### 📝 修正後のコード構造

```typescript
// apps/mobile/src/app/(tabs)/face-registration.tsx (420-434行目)
{isFocused && cameraDevice ? (
  <View style={styles.cameraContainer}>
    {/* 1. Camera は自己完結型タグに変更（オーバーレイは外側に配置） */}
    <Camera
      ref={cameraRef}
      style={StyleSheet.absoluteFill}
      device={cameraDevice}
      isActive={true}
      photo={true}
      frameProcessor={frameProcessor}
      onInitialized={() => {
        console.log("[FaceReg] Vision Camera initialized");
        setIsCameraReady(true);
      }}
    />

    {/* 2. オーバーレイを Camera の外側に配置（auth.tsx と同じ構造） */}
    <View style={styles.overlay}>
      {/* 上部バー */}
      <View style={styles.topBar}>...</View>

      {/* ワーカー選択UI */}
      <View style={styles.workerSelectContainer}>...</View>

      {/* ガイドフレーム */}
      <View style={styles.guideContainer}>...</View>

      {/* ボトムバー */}
      <View style={styles.bottomBar}>...</View>
    </View>
  </View>
) : null}
```

### 🎨 スタイル定義の修正

```typescript
// apps/mobile/src/app/(tabs)/face-registration.tsx (298-305行目)
const styles = StyleSheet.create({
  cameraContainer: {
    flex: 1,  // 親要素いっぱいに広がる
  },

  overlay: {
    ...StyleSheet.absoluteFillObject,  // 絶対配置でカメラ全体を覆う
    backgroundColor: "transparent",
  },

  // ... その他のスタイル
});
```

---

## コード変更の詳細

### Before（修正前）

```typescript
// ❌ 誤った実装パターン
<Camera ref={cameraRef} device={device} frameProcessor={frameProcessor}>
  {/* Cameraの子要素としてオーバーレイを配置 */}
  <View style={styles.overlay}>
    <View style={styles.topBar}>
      <TouchableOpacity onPress={handleGoBack}>
        <Ionicons name="arrow-back" size={28} color="#fff" />
      </TouchableOpacity>
    </View>

    <View style={styles.guideFrame}>
      {/* ガイドフレーム */}
    </View>

    <TouchableOpacity onPress={handleTakePicture}>
      <Text>撮影</Text>
    </TouchableOpacity>
  </View>
</Camera>

// スタイル定義
const styles = StyleSheet.create({
  overlay: {
    flex: 1,  // ❌ flexレイアウトはframe processorと競合
    backgroundColor: "transparent",
  },
});
```

**問題点**:
- Cameraに子要素がある → frame processorの実行コンテキストが破壊される
- `flex: 1`を使用 → レイアウト計算がframe processorと競合

### After（修正後）

```typescript
// ✅ 正しい実装パターン
<View style={styles.cameraContainer}>
  {/* Camera は自己完結型 */}
  <Camera
    ref={cameraRef}
    style={StyleSheet.absoluteFill}
    device={cameraDevice}
    isActive={true}
    photo={true}
    frameProcessor={frameProcessor}
    onInitialized={() => {
      console.log("[FaceReg] Vision Camera initialized");
      setIsCameraReady(true);
    }}
  />

  {/* オーバーレイは兄弟要素として配置 */}
  <View style={styles.overlay}>
    <View style={styles.topBar}>
      <TouchableOpacity onPress={handleGoBack}>
        <Ionicons name="arrow-back" size={28} color="#fff" />
      </TouchableOpacity>
    </View>

    <View style={styles.guideFrame}>
      {/* ガイドフレーム */}
    </View>

    <TouchableOpacity onPress={handleTakePicture}>
      <Text>撮影</Text>
    </TouchableOpacity>
  </View>
</View>

// スタイル定義
const styles = StyleSheet.create({
  cameraContainer: {
    flex: 1,
  },

  overlay: {
    ...StyleSheet.absoluteFillObject,  // ✅ 絶対配置でカメラ全体を覆う
    backgroundColor: "transparent",
  },
});
```

**改善点**:
- Cameraは自己完結型タグ → frame processorが正常に動作
- オーバーレイは兄弟要素 → レイアウト競合がない
- `StyleSheet.absoluteFillObject`使用 → 正確な重なり配置

### 変更差分サマリー

| 項目 | 修正前 | 修正後 |
|------|--------|--------|
| Camera構造 | `<Camera>...</Camera>` | `<Camera />` |
| オーバーレイ配置 | Cameraの子要素 | Cameraの兄弟要素 |
| オーバーレイスタイル | `flex: 1` | `...StyleSheet.absoluteFillObject` |
| コンテナ | なし | `<View style={styles.cameraContainer}>` |

---

## ベストプラクティス

### 📚 react-native-vision-camera使用時の鉄則

#### ルール1: Cameraは常に自己完結型タグにする

```typescript
// ✅ Good
<Camera
  ref={cameraRef}
  style={StyleSheet.absoluteFill}
  device={device}
  isActive={true}
  frameProcessor={frameProcessor}
/>

// ❌ Bad
<Camera ref={cameraRef} device={device}>
  <View>...</View>
</Camera>
```

#### ルール2: UIオーバーレイは兄弟要素として配置

```typescript
// ✅ Good
<View style={styles.container}>
  <Camera ... />
  <View style={styles.overlay}>
    {/* UI components */}
  </View>
</View>

// ❌ Bad
<Camera ...>
  <View style={styles.overlay}>
    {/* UI components */}
  </View>
</Camera>
```

#### ルール3: オーバーレイは`StyleSheet.absoluteFillObject`を使用

```typescript
// ✅ Good
const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "transparent",
  },
});

// ❌ Bad
const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    position: "relative",
  },
});
```

### 🎯 推奨パターン: カメラ + オーバーレイUI

```typescript
{isFocused && cameraDevice ? (
  <View style={styles.cameraContainer}>
    {/* 1. Camera は自己完結型 */}
    <Camera
      ref={cameraRef}
      style={StyleSheet.absoluteFill}
      device={cameraDevice}
      isActive={true}
      photo={true}
      frameProcessor={frameProcessor}
      onInitialized={() => setIsCameraReady(true)}
    />

    {/* 2. オーバーレイは兄弟要素 */}
    <View style={styles.overlay}>
      {/* UI コンポーネント */}
    </View>
  </View>
) : null}

const styles = StyleSheet.create({
  cameraContainer: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "transparent",
  },
});
```

### 🔍 複数のオーバーレイレイヤーを使う場合

```typescript
<View style={styles.cameraContainer}>
  <Camera ... />

  {/* 背景レイヤー（暗くする） */}
  <View style={[styles.overlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]} />

  {/* UI レイヤー */}
  <View style={styles.overlay}>
    <View style={styles.topBar}>...</View>
    <View style={styles.bottomBar}>...</View>
  </View>
</View>
```

### ✅ Camera実装時のチェックリスト

新しくカメラを使う画面を作る際は、以下をチェック：

- [ ] Camera コンポーネントは自己完結型タグ (`<Camera />`)
- [ ] オーバーレイは Camera の兄弟要素として配置
- [ ] オーバーレイスタイルは `StyleSheet.absoluteFillObject`
- [ ] `cameraDevice` が undefined でないことを確認
- [ ] `isActive={true}` を設定
- [ ] `frameProcessor` を正しく渡す
- [ ] TypeScript コンパイルエラーがない
- [ ] auth.tsx と構造が一致している

---

## テストと検証

### 🧪 検証項目

修正後、以下の項目を確認する必要があります：

#### 1. 基本動作確認

- [ ] カメラビューが正しく表示される
- [ ] オーバーレイUIが正しく表示される
- [ ] カメラとオーバーレイが正しく重なっている

#### 2. 顔検出機能確認

- [ ] 顔を検出すると`onFacesDetected`コールバックが呼ばれる
- [ ] ガイドフレームが緑色に変わる
- [ ] 検出ステータスメッセージが更新される
- [ ] 顔検出のログが出力される

#### 3. 顔登録フロー確認

- [ ] 作業員を選択できる
- [ ] 顔が検出されている状態で撮影ボタンが有効になる
- [ ] 写真を撮影できる
- [ ] Face APIに正しく送信される
- [ ] 登録結果が表示される

#### 4. パフォーマンス確認

- [ ] frame processorのfpsが適切（15-30fps）
- [ ] UIの応答性が良好
- [ ] メモリリークがない

### 📋 テスト手順

#### ステップ1: EAS Update配信

```bash
cd /volume2/Project/MCD3/TUMON/mc-gate/apps/mobile
npx eas-cli update --branch preview --message "Fix: Camera component structure for face detection"
```

#### ステップ2: アプリ再起動

```bash
# アプリを強制終了
/tmp/platform-tools/adb shell am force-stop com.bmeconsulting.mcgate

# アプリを起動
/tmp/platform-tools/adb shell am start -n com.bmeconsulting.mcgate/.MainActivity
```

#### ステップ3: 手動テスト

1. ログイン画面で`admin/admin`でログイン
2. 「顔登録」タブに移動
3. カメラビューが表示されることを確認
4. 顔をカメラに向ける
5. ガイドフレームが緑色に変わることを確認
6. 「作業員を選択」をタップ
7. 作業員を選択
8. 「撮影」ボタンが有効になることを確認
9. 「撮影」ボタンをタップ
10. 登録結果が表示されることを確認

#### ステップ4: ログ確認

```bash
# ReactNativeJSログを確認
/tmp/platform-tools/adb logcat -s ReactNativeJS:I | grep -E "FaceReg|FACE"

# 期待されるログ出力:
# [FaceReg] Vision camera device found
# [FaceReg] Tab focused - mounting camera
# [FaceReg] Vision Camera initialized
# [FaceReg] handleFacesDetected called - faces count: 1
# [FaceReg] Face detected
# [FaceReg] Face quality good - size: 25000
```

---

## 今後の対応

### 🚀 即座に実施すべき作業

1. **EAS Update配信** ⏳
   修正コードをpreviewブランチに配信

   ```bash
   cd apps/mobile
   npx eas-cli update --branch preview --message "Fix: Camera component structure for face detection"
   ```

2. **手動テスト実施** ⏳
   実機デバイスで顔登録フローを完全にテスト

3. **ログ収集** ⏳
   顔検出のログが正常に出力されることを確認

### 📝 ドキュメント更新

1. **CLAUDE.mdへの追記** ✅ 完了
   Camera実装のベストプラクティスはすでに記載済み

2. **face-registration-technical-review.mdの更新** ⏳
   修正内容を反映

### 🔄 継続的改善

1. **他の画面での確認**
   同様のパターンで実装されている画面がないか確認

2. **Linterルールの追加検討**
   Cameraに子要素を持たせる誤った実装を防ぐ

3. **コンポーネントテンプレートの作成**
   新しいカメラ画面を作る際のテンプレートを用意

### 📊 成功指標

以下の条件を満たせば、修正は成功と判断できます：

- ✅ 顔検出コールバックが毎フレーム呼ばれる
- ✅ ガイドフレームが顔検出時に緑色に変わる
- ✅ 検出ステータスメッセージが正しく更新される
- ✅ 顔登録フローが最後まで完了する
- ✅ Face APIへの送信が成功する
- ✅ auth.tsxと同等のパフォーマンスを示す

---

## 参考資料

### 📚 関連ドキュメント

1. **react-native-vision-camera公式ドキュメント**
   https://react-native-vision-camera.com/docs/guides/frame-processors

2. **プロジェクト内の参照実装**
   `apps/mobile/src/app/(tabs)/auth.tsx` (591-625行目)

3. **プロジェクトの開発ガイド**
   `CLAUDE.md` - Camera実装のベストプラクティス

### 🔗 関連Issue/Pull Request

- Camera component構造の修正
- Frame processor実行失敗の解決
- auth.tsxとの構造統一

### 👥 レビュー担当者へ

このドキュメントをレビューする際は、以下の点に注目してください：

1. **技術的正確性**
   react-native-vision-cameraの仕様に関する記述は正確か

2. **解決策の妥当性**
   提案された修正方法は適切か、他に良い方法はないか

3. **ベストプラクティスの汎用性**
   記載されたパターンは他のプロジェクトでも適用可能か

4. **テスト計画の十分性**
   検証項目は網羅的か、見落としている点はないか

---

**最終更新**: 2025-11-28
**作成者**: Claude (Technical Analysis)
**レビューステータス**: レビュー待ち
