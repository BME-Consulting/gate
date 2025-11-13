# 作業員マスタ統合ガイド

## 概要

MC-Gateシステムにおける作業員マスタの統合方法を説明します。QRコードスキャンから作業員情報の取得、顔認証までの完全なフローをカバーします。

## アーキテクチャ

```
┌─────────────────┐
│ Mobile App      │
│ (React Native)  │
│                 │
│ ┌─────────────┐ │
│ │ QR Scanner  │ │──┐
│ └─────────────┘ │  │
│                 │  │ QR data (M1 format)
│ ┌─────────────┐ │  │
│ │ useWorkers  │ │<─┘
│ │ Hook        │ │
│ └─────────────┘ │
│        │        │
│        ▼        │
│ ┌─────────────┐ │
│ │ Worker      │ │
│ │ Repository  │ │
│ └─────────────┘ │
│        │        │
└────────┼────────┘
         │
         ▼
  ┌─────────────┐
  │ SQLite      │
  │ (workers    │
  │  table)     │
  └─────────────┘
         │
         │ HTTP Sync
         ▼
  ┌─────────────┐
  │ Face API    │
  │ Server      │
  │             │
  │ /api/workers│
  │ /api/face/* │
  └─────────────┘
```

## データフロー

### 1. QRコードスキャン

QRコードには2つのフォーマットがあります：

#### M1フォーマット（完全データ）

```
M1|personId|name|company|ccusId|socialInsurance|residencyExpiry|age|isSoleProprietor
```

**例**:
```
M1|P001|山田太郎|株式会社ABC|C12345|1||35|0
```

#### シンプルフォーマット（IDのみ）

```
P001
```

### 2. 作業員情報の取得

#### ケース1: M1フォーマット（完全データ）

QRコードに全情報が含まれているため、直接使用できます：

```typescript
import { useWorkers } from '../hooks/useWorkers';

function ScanScreen() {
  const { getWorkerById, addWorker } = useWorkers();

  const handleQRScan = async (qrData: string) => {
    if (qrData.startsWith('M1|')) {
      // M1フォーマットをパース
      const parts = qrData.split('|');
      const workerData: Worker = {
        personId: parts[1],
        name: parts[2],
        company: parts[3],
        ccusId: parts[4] || undefined,
        ccusRegistered: parts[4] ? true : false,
        socialInsurance: parts[5] === '1',
        residencyExpiry: parts[6] || undefined,
        age: parts[7] ? parseInt(parts[7]) : undefined,
        isSoleProprietor: parts[8] === '1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // ローカルDBに保存（存在しなければ）
      const existing = await getWorkerById(workerData.personId);
      if (!existing) {
        await addWorker(workerData);
      }

      return workerData;
    }
  };
}
```

#### ケース2: シンプルフォーマット（IDのみ）

ローカルDBまたはサーバーから作業員情報を取得：

```typescript
const handleQRScan = async (qrData: string) => {
  const personId = qrData.trim();

  // ローカルDBを検索
  let worker = await getWorkerById(personId);

  // ローカルに存在しない場合、サーバーから取得
  if (!worker) {
    const response = await fetch(`http://localhost:8000/api/workers/${personId}`);
    if (response.ok) {
      worker = await response.json();
      // ローカルDBに保存
      await addWorker(worker);
    } else {
      throw new Error(`Worker ${personId} not found`);
    }
  }

  return worker;
};
```

### 3. 作業員マスタの同期

定期的にサーバーから作業員マスタを同期します：

```typescript
import { useWorkers } from '../hooks/useWorkers';

function SettingsScreen() {
  const { syncFromServer } = useWorkers();

  const handleSync = async () => {
    try {
      await syncFromServer(
        'http://localhost:8000/api/workers',
        userToken
      );
      Alert.alert('成功', '作業員マスタを同期しました');
    } catch (error) {
      Alert.alert('エラー', '同期に失敗しました');
    }
  };

  return (
    <Button title="作業員マスタを同期" onPress={handleSync} />
  );
}
```

### 4. 顔認証の統合

作業員の顔画像を登録・認識します：

#### 顔登録

```typescript
const registerFace = async (personId: string, imageBase64: string) => {
  const response = await fetch('http://localhost:8000/api/face/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      personId,
      imageData: imageBase64,
    }),
  });

  const result = await response.json();
  if (result.success) {
    console.log('Face registered for:', result.personId);
  } else {
    console.error('Face registration failed:', result.error);
  }
};
```

#### 顔認識

```typescript
const recognizeFace = async (imageBase64: string) => {
  const response = await fetch('http://localhost:8000/api/face/recognize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageData: imageBase64,
      threshold: 0.6, // 任意
    }),
  });

  const result = await response.json();
  if (result.personId) {
    console.log('Person recognized:', result.personId);
    console.log('Worker info:', result.workerInfo);

    // ローカルDBから完全な作業員情報を取得
    const worker = await getWorkerById(result.personId);
    return worker;
  } else {
    console.log('No match found:', result.error);
    return null;
  }
};
```

## WorkerRepository API

### メソッド一覧

```typescript
interface WorkerRepository {
  // 初期化
  initialize(): Promise<void>;

  // CRUD操作
  add(worker: Worker): Promise<void>;
  update(worker: Worker): Promise<void>;
  delete(personId: string): Promise<void>;
  findById(personId: string): Promise<Worker | null>;
  findAll(): Promise<Worker[]>;

  // バッチ操作
  upsertBatch(workers: Worker[]): Promise<void>;
}
```

### useWorkers フックAPI

```typescript
const {
  isReady,              // 初期化完了フラグ
  repository,           // WorkerRepositoryインスタンス
  workers,              // 現在の作業員リスト
  getAllWorkers,        // 全作業員を取得
  getWorkerById,        // IDで検索
  addWorker,            // 作業員を追加
  updateWorker,         // 作業員を更新
  deleteWorker,         // 作業員を削除
  syncFromServer,       // サーバーから同期
  findWorkersByFaceEmbedding,  // 顔登録済み作業員を検索
} = useWorkers();
```

## テストシナリオ

### シナリオ1: QRコードから作業員情報を取得

1. QRコード `P001_m1.png` をスキャン
2. M1フォーマットをパース
3. 作業員情報をローカルDBに保存
4. ルールエンジンでチェック
5. 結果を表示

**期待される結果**:
- 作業員名: 山田太郎
- 会社: 株式会社ABC
- CCUS登録: あり（C12345）
- 社会保険: あり
- 判定: すべてパス（グリーン）

### シナリオ2: サーバー同期

1. 設定画面で「作業員マスタを同期」をタップ
2. サーバーから全作業員を取得
3. ローカルDBにUPSERT
4. 同期完了を表示

**期待される結果**:
- サーバーの全作業員がローカルDBに保存される
- 既存の作業員は更新される
- 新規作業員は追加される

### シナリオ3: 顔認証フロー

1. カメラで作業員の顔を撮影
2. Base64エンコード
3. `/api/face/recognize` に送信
4. 認識結果を取得
5. 作業員情報を表示

**期待される結果**:
- 登録済みの顔の場合: personId と信頼度が返る
- 未登録の顔の場合: null が返る

## 実装状況

### ✅ 完了

- [x] WorkerRepository 実装（packages/core）
- [x] useWorkers フック実装（apps/mobile）
- [x] 作業員マスタAPI実装（apps/face-api）
- [x] 顔認証API実装（apps/face-api）
- [x] SQLiteテーブル設計
- [x] QRコード生成（10サンプル）

### 📋 TODO

- [ ] QRスキャン画面での作業員情報取得実装
- [ ] 設定画面に「作業員マスタ同期」ボタン追加
- [ ] 顔認証画面の実装
- [ ] エラーハンドリングの強化
- [ ] オフライン動作の完全対応
- [ ] E2Eテスト

## トラブルシューティング

### エラー: WorkerRepository is not initialized

**原因**: useWorkers フックが初期化される前に呼び出された

**解決策**: `isReady` フラグを確認してから使用する

```typescript
const { isReady, getWorkerById } = useWorkers();

useEffect(() => {
  if (isReady) {
    // リポジトリが使用可能
    getWorkerById('P001');
  }
}, [isReady]);
```

### エラー: Worker not found

**原因**: ローカルDBに作業員が存在しない

**解決策**: サーバーから同期するか、M1フォーマットのQRコードを使用する

### エラー: SQLite is not available

**原因**: Web プラットフォームで実行されている

**解決策**: ネイティブプラットフォーム（Android/iOS）でのみ動作します

## 参考資料

- [WorkerRepository 実装](/volume2/Project/MCD3/TUMON/mc-gate/packages/core/src/repository/worker-repository.ts)
- [useWorkers フック](/volume2/Project/MCD3/TUMON/mc-gate/apps/mobile/src/hooks/useWorkers.ts)
- [Face API サーバー](/volume2/Project/MCD3/TUMON/mc-gate/apps/face-api)
- [QRコードサンプル](/volume2/Project/MCD3/TUMON/mc-gate/qr-codes)
