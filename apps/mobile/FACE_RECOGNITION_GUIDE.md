# 顔認証画面実装ガイド

## 実装完了レポート

### 作成したファイル

1. **画面ファイル**: `/volume2/Project/MCD3/TUMON/mc-gate/apps/mobile/src/app/(tabs)/face-recognition.tsx`
   - 顔認証画面の実装
   - 全484行のTypeScriptコード

2. **ナビゲーション更新**: `/volume2/Project/MCD3/TUMON/mc-gate/apps/mobile/src/app/(tabs)/_layout.tsx`
   - タブナビゲーションに「顔認証」タブを追加

---

## 使用した主なライブラリ

### 既存パッケージ（インストール済み）

1. **expo-camera** (v17.0.9)
   - カメラ機能の提供
   - 写真撮影
   - Base64エンコード機能（内蔵）

2. **@expo/vector-icons**
   - UIアイコン（Ionicons）

3. **@mc-gate/ui-kit**
   - デザイントークン
   - Buttonコンポーネント

4. **expo-router**
   - ナビゲーション機能

### 追加不要

- **expo-image-manipulator**: 不要（expo-cameraがBase64エンコード機能を内蔵）

---

## 実装した主な機能

### 1. カメラ機能

- **カメラ権限管理**
  - 権限リクエスト
  - 権限がない場合の案内画面
  - 権限許可後の自動遷移

- **カメラプレビュー**
  - フロントカメラ（自撮り）
  - 全画面表示
  - リアルタイムプレビュー

- **顔ガイドフレーム**
  - 280x350pxのガイドフレーム
  - コーナーマーカー表示
  - ガイドテキスト

### 2. 写真撮影機能

- **撮影処理**
  ```typescript
  const photo = await cameraRef.current.takePictureAsync({
    quality: 0.8,
    base64: true,
  });
  ```

- **Base64エンコード**
  - expo-cameraの内蔵機能を使用
  - data URI形式に変換（`data:image/jpeg;base64,...`）

### 3. Face API通信

- **エンドポイント**: `http://localhost:8100/api/face/recognize`

- **リクエスト形式**:
  ```json
  {
    "imageData": "data:image/jpeg;base64,/9j/4AAQ...",
    "threshold": 0.6
  }
  ```

- **レスポンス処理**:
  - 認識成功時: personId、confidence、workerInfo
  - 認識失敗時: error、distance

### 4. useWorkers フック統合

- **認識結果のpersonIdで詳細情報を取得**
  ```typescript
  const workerDetails = await getWorkerById(result.personId);
  ```

- **ローカルDBの情報で上書き**
  - 氏名
  - 会社名
  - CCUS ID

### 5. UI要素

#### カメラオーバーレイ

1. **上部バー**
   - 戻るボタン（左）
   - タイトル「顔認証」（中央）

2. **ガイドフレーム**
   - 280x350pxのフレーム
   - コーナーマーカー（4箇所）
   - ガイドテキスト「顔をフレーム内に合わせてください」

3. **結果表示カード**
   - 認識成功時:
     - チェックマークアイコン（緑）
     - 作業員名
     - 会社名
     - 信頼度（%）
   - 認識失敗時:
     - エラーアイコン（赤）
     - エラーメッセージ

4. **ボトムバー**
   - 撮影ボタン（通常時）
   - ローディングインジケーター（処理中）
   - 処理中テキスト「認識中...」

#### 撮影ボタン

- **デザイン**: 80x80pxの円形ボタン
- **色**: 白（border付き）
- **無効化**: カメラ準備中または処理中

#### ローディング状態

- **処理中の表示**:
  - ActivityIndicator
  - テキスト「認識中...」
  - 撮影ボタンを非表示

### 6. エラーハンドリング

#### カメラ権限エラー

```typescript
if (!permission.granted) {
  // 権限リクエスト画面を表示
  return (
    <View>
      <Text>カメラへのアクセスが必要です</Text>
      <Button onPress={requestPermission} />
    </View>
  );
}
```

#### 撮影エラー

- 写真撮影失敗時のアラート
- Base64変換失敗時のアラート

#### ネットワークエラー

```typescript
if (!response.ok) {
  throw new Error(`HTTP error! status: ${response.status}`);
}
```

#### 顔検出エラー

- Face APIから返される `error` フィールドを表示
- 例: "No face detected in the image"

#### 認識失敗エラー

- 顔は検出されたがマッチしなかった場合
- 信頼度と距離を表示

---

## TypeScript型定義

### FaceRecognitionResponse

```typescript
interface FaceRecognitionResponse {
  personId: string | null;
  confidence: number;
  distance?: number;
  workerInfo?: {
    name: string;
    company: string;
    ccusId?: string;
  };
  error?: string;
}
```

---

## 動作確認の方法

### 1. Face APIサーバーを起動

```bash
cd /volume2/Project/MCD3/TUMON/mc-gate/apps/face-api
npm run dev
```

サーバーが `http://localhost:8100` で起動していることを確認。

### 2. 作業員を登録（Face APIに）

```bash
# 作業員マスタを追加
curl -X POST http://localhost:8100/api/workers \
  -H "Content-Type: application/json" \
  -d '{
    "personId": "P001",
    "name": "山田太郎",
    "company": "株式会社ABC",
    "ccusId": "C12345"
  }'

# 顔画像を登録（実際の顔画像のBase64データが必要）
curl -X POST http://localhost:8100/api/face/register \
  -H "Content-Type: application/json" \
  -d '{
    "personId": "P001",
    "imageData": "data:image/jpeg;base64,/9j/4AAQ..."
  }'
```

### 3. モバイルアプリを起動

```bash
cd /volume2/Project/MCD3/TUMON/mc-gate/apps/mobile
npm start
```

### 4. 動作確認手順

1. **アプリを開く**
   - 「顔認証」タブをタップ

2. **カメラ権限を許可**
   - 初回起動時に権限リクエストダイアログが表示される
   - 「許可」をタップ

3. **カメラプレビューの確認**
   - フロントカメラのプレビューが表示される
   - ガイドフレームが表示される

4. **写真を撮影**
   - 顔をガイドフレーム内に合わせる
   - 撮影ボタン（白い円形ボタン）をタップ

5. **認識処理の確認**
   - 「認識中...」が表示される
   - ローディングインジケーターが表示される

6. **結果の確認**
   - **成功時**:
     - 緑のチェックマークアイコン
     - 作業員名、会社名、信頼度が表示される
     - アラートダイアログが表示される
   - **失敗時**:
     - 赤のエラーアイコン
     - エラーメッセージが表示される
     - アラートダイアログが表示される

---

## 注意点と今後の改善点

### 現在の制限事項

1. **Face APIのURLがハードコード**
   - `http://localhost:8100/api/face/recognize`
   - 本番環境では環境変数で管理すべき

2. **エラーメッセージが英語**
   - Face APIが返すエラーメッセージは英語
   - 日本語化が必要

3. **オフライン対応なし**
   - 現在はオンライン環境でのみ動作
   - オフライン時のエラーハンドリングが必要

4. **撮影画像のプレビューなし**
   - 撮影後すぐにAPIに送信される
   - 撮影画像の確認・再撮影機能がない

5. **複数の顔が写った場合の処理**
   - 現在は1つの顔のみを想定
   - 複数の顔が検出された場合の動作は未定義

### 改善提案

#### 1. 環境変数化

```typescript
// app.config.ts
export default {
  extra: {
    faceApiUrl: process.env.FACE_API_URL || "http://localhost:8100",
  },
};

// face-recognition.tsx
import Constants from "expo-constants";

const FACE_API_URL = Constants.expoConfig?.extra?.faceApiUrl;
const response = await fetch(`${FACE_API_URL}/api/face/recognize`, {
  // ...
});
```

#### 2. エラーメッセージの日本語化

```typescript
const ERROR_MESSAGES: Record<string, string> = {
  "No face detected in the image": "顔が検出されませんでした",
  "No match found": "登録された作業員とマッチしませんでした",
  // ...
};

const errorMessage = ERROR_MESSAGES[result.error] || result.error;
```

#### 3. 撮影画像プレビュー機能

```typescript
const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);

// 撮影後
const photo = await cameraRef.current.takePictureAsync({
  quality: 0.8,
  base64: true,
});
setCapturedPhoto(photo.uri);

// プレビュー画面を表示
// 「この画像で認識する」「再撮影」ボタンを提供
```

#### 4. オフライン対応

```typescript
import { useNetworkStatus } from "../../hooks/useNetworkStatus";

const { isOffline } = useNetworkStatus();

if (isOffline) {
  Alert.alert("エラー", "オフライン時は顔認証を使用できません");
  return;
}
```

#### 5. 信頼度の閾値を設定画面で調整可能に

```typescript
// settings.tsx
const [faceRecognitionThreshold, setFaceRecognitionThreshold] = useState(0.6);

// face-recognition.tsx
const threshold = faceRecognitionThreshold; // 設定から取得
```

#### 6. 顔登録機能の追加

```typescript
// 新しい画面: face-registration.tsx
// 作業員の顔を登録する機能
// POST /api/face/register を呼び出す
```

#### 7. 認識履歴の保存

```typescript
// 認識結果をローカルDBに保存
// 誰がいつ認証されたかを記録
// 監査ログとして活用
```

#### 8. パフォーマンス最適化

```typescript
// 画像サイズの最適化
const photo = await cameraRef.current.takePictureAsync({
  quality: 0.6, // 品質を下げる
  exif: false,  // EXIF情報を除外
});

// 画像リサイズ（expo-image-manipulatorを使用する場合）
const manipResult = await manipulateAsync(
  photo.uri,
  [{ resize: { width: 640 } }],
  { compress: 0.7, format: SaveFormat.JPEG, base64: true }
);
```

---

## トラブルシューティング

### カメラが起動しない

**原因**: カメラ権限が拒否されている

**解決策**:
1. アプリを完全に終了
2. デバイス設定でアプリのカメラ権限を確認
3. 権限を許可してアプリを再起動

### 「認識中...」で固まる

**原因**: Face APIサーバーが起動していない

**解決策**:
```bash
cd /volume2/Project/MCD3/TUMON/mc-gate/apps/face-api
npm run dev
```

サーバーが `http://localhost:8100` で起動していることを確認。

### HTTP error! status: 500

**原因**: Face APIでエラーが発生している

**解決策**:
1. Face APIサーバーのログを確認
2. モデルファイルが正しく配置されているか確認（`apps/face-api/models/`）
3. 顔が明確に写っているか確認

### TypeError: Cannot read property 'takePictureAsync'

**原因**: カメラが準備完了していない

**解決策**: カメラが準備完了するまで待つ（`isCameraReady` フラグで管理済み）

---

## セキュリティ考慮事項

### 1. Base64データの取り扱い

- 撮影した画像はメモリ上でのみ保持
- API送信後は即座にクリア
- ローカルストレージには保存しない

### 2. Face API通信

- 本番環境ではHTTPS通信を使用
- トークン認証の実装を検討
- レート制限の実装を検討

### 3. 顔データの保護

- 顔エンコーディングは暗号化して保存
- GDPR/個人情報保護法への対応
- ユーザー同意の取得

---

## パフォーマンス指標

### 想定処理時間

1. **カメラ起動**: 1〜2秒
2. **写真撮影**: 0.5秒
3. **Base64エンコード**: 0.3秒
4. **Face API通信**: 1〜3秒
5. **結果表示**: 即座

**合計**: 約3〜6秒

### メモリ使用量

- **カメラプレビュー**: 約50MB
- **撮影画像（Base64）**: 約2〜5MB
- **合計**: 約50〜60MB

---

## まとめ

### 完了した実装

- ✅ 顔認証画面の作成
- ✅ カメラ機能（expo-camera）
- ✅ 写真撮影とBase64エンコード
- ✅ Face API通信
- ✅ useWorkers フック統合
- ✅ エラーハンドリング
- ✅ TypeScript型安全性
- ✅ タブナビゲーション追加

### 未実装の機能

- ⏳ 環境変数化
- ⏳ エラーメッセージ日本語化
- ⏳ 撮影画像プレビュー
- ⏳ オフライン対応
- ⏳ 顔登録機能
- ⏳ 認識履歴保存

### 次のステップ

1. **テスト**: 実際の顔画像でエンドツーエンドテスト
2. **UI改善**: ユーザーフィードバックを元にUI調整
3. **パフォーマンス最適化**: 画像サイズ最適化、通信速度改善
4. **セキュリティ強化**: HTTPS化、認証追加
5. **本番環境設定**: 環境変数化、エラーロギング

---

**実装日**: 2025-11-13
**実装者**: Claude
**ファイルパス**: `/volume2/Project/MCD3/TUMON/mc-gate/apps/mobile/src/app/(tabs)/face-recognition.tsx`
