# @mc-gate/face

顔認証パッケージ - MCD3 通門管理システム

## 概要

このパッケージは、mc-gate プロジェクトの顔認証機能を提供します。QRコードやCCUSカードと並ぶ、新しい認証方法として実装されています。

**現在のステータス**: Phase 1 (モック実装)

## Phase 1 vs Phase 2

### Phase 1: モック実装（現在）

- カメラプレビューの表示
- モックの顔データ生成
- 固定の技能者情報を返す（`name: "顔認証ユーザー"`）
- 開発・UI/UXテスト用

### Phase 2: 本格実装（予定）

- `expo-face-detector` による実際の顔検出
- 顔照合APIとの連携
- 実際の技能者情報の取得
- エラーハンドリング（顔が見つからない、API障害など）

## インストール

```bash
# ワークスペースルートから
pnpm install
```

## 使用方法

### FaceScanner コンポーネント

```tsx
import { FaceScanner } from "@mc-gate/face";
import type { FaceData } from "@mc-gate/face";

function MyComponent() {
  const handleDetect = (data: FaceData) => {
    console.log("顔を検出しました:", data);
    // パーサーで技能者情報を取得
  };

  const handleError = (error: Error) => {
    console.error("エラー:", error.message);
  };

  return (
    <FaceScanner
      onDetect={handleDetect}
      onError={handleError}
      enabled={true}
    />
  );
}
```

### パーサー関数

```tsx
import { parseFaceData } from "@mc-gate/face";
import type { FaceData } from "@mc-gate/face";

async function handleFaceDetection(data: FaceData) {
  try {
    const workerInfo = await parseFaceData(data);
    console.log("技能者情報:", workerInfo);
    // workerInfo を使って入退場処理を行う
  } catch (error) {
    console.error("顔認証に失敗しました:", error);
  }
}
```

## API

### FaceScanner コンポーネント

#### Props

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `onDetect` | `(data: FaceData) => void` | Yes | - | 顔検出時のコールバック |
| `onError` | `(error: Error) => void` | No | - | エラー時のコールバック |
| `enabled` | `boolean` | No | `true` | スキャンの有効/無効 |

### FaceData 型

```typescript
interface FaceData {
  faceId?: string;           // Phase 2 で使用
  confidence: number;         // 検出信頼度 (0.0 - 1.0)
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  capturedAt: string;         // ISO8601形式
}
```

### parseFaceData 関数

```typescript
async function parseFaceData(data: FaceData): Promise<WorkerInfo>
```

**Phase 1 の動作**:
- モックの技能者情報を返す
- 固定値: `name: "顔認証ユーザー"`
- API遅延をシミュレート（500ms）
- 信頼度が 0.6 未満の場合はエラー

**Phase 2 の実装予定**:
- 顔照合APIに `FaceData` を送信
- APIから返された実際の技能者情報を返す
- エラーハンドリング

### isFaceRecognitionAvailable 関数

```typescript
async function isFaceRecognitionAvailable(): Promise<boolean>
```

顔認証APIの利用可能性をチェックします。

**Phase 1**: 常に `true` を返す（モック）
**Phase 2**: 実際のAPI接続をチェック

## 開発

### 型チェック

```bash
pnpm type-check
```

### テスト

```bash
pnpm test
```

### Lint

```bash
pnpm lint
```

## 依存関係

- `@mc-gate/core`: コアパッケージ（型定義）
- `expo-camera`: カメラアクセス
- `expo-face-detector`: 顔検出（Phase 2 で使用予定）
- `react` / `react-native`: UI コンポーネント

## TODO（Phase 2）

- [ ] `expo-face-detector` の実装
- [ ] 顔照合APIの設計・実装
- [ ] 顔画像のキャプチャ・送信
- [ ] エラーハンドリングの強化
- [ ] パフォーマンス最適化
- [ ] セキュリティ対策（画像データの暗号化など）
- [ ] ユニットテストの追加

## ライセンス

Private
