# Migration Guide: Mock to BLE Card Reader

このガイドでは、MockCardReaderから実際のBLECardReaderへの移行手順を説明します。

## 目次

1. [前提条件](#前提条件)
2. [CCUS固有の設定](#ccus固有の設定)
3. [アプリケーション設定の更新](#アプリケーション設定の更新)
4. [コードの変更](#コードの変更)
5. [テスト手順](#テスト手順)
6. [トラブルシューティング](#トラブルシューティング)

---

## 前提条件

### 1. CCUSカードリーダーの仕様確認

BLECardReaderを使用する前に、以下の情報を入手してください：

- **Service UUID**: BLEサービスの識別子
- **Card Data Characteristic UUID**: カードデータを通知する特性の識別子
- **Device Info Characteristic UUID**: デバイス情報を読み取る特性の識別子（オプション）
- **データフォーマット**: カードデータのバイナリ形式
  - CCUS IDのバイト位置とエンコーディング
  - Person IDのバイト位置とエンコーディング（存在する場合）
  - その他のメタデータ

### 2. 必要なパッケージの確認

`package.json`で以下のパッケージがインストールされていることを確認：

```json
{
  "dependencies": {
    "react-native-ble-plx": "^3.3.0"
  }
}
```

既にインストール済みです（`packages/reader-bridge/package.json`）。

---

## CCUS固有の設定

### ステップ1: UUIDの更新

`/volume2/Project/MCD3/TUMON/mc-gate/packages/reader-bridge/src/ble-reader.ts` を編集：

```typescript
// 現在の値（仮のUUID）
const CCUS_SERVICE_UUID = "0000fff0-0000-1000-8000-00805f9b34fb"; // TODO
const CCUS_CARD_DATA_CHARACTERISTIC_UUID = "0000fff1-0000-1000-8000-00805f9b34fb"; // TODO
const CCUS_DEVICE_INFO_CHARACTERISTIC_UUID = "0000fff2-0000-1000-8000-00805f9b34fb"; // TODO

// ↓ 実際のCCUSカードリーダーのUUIDに置き換え
const CCUS_SERVICE_UUID = "XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX";
const CCUS_CARD_DATA_CHARACTERISTIC_UUID = "YYYYYYYY-YYYY-YYYY-YYYY-YYYYYYYYYYYY";
const CCUS_DEVICE_INFO_CHARACTERISTIC_UUID = "ZZZZZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZZZZZZZZZ";
```

### ステップ2: データパーサーの実装

`parseCardData()`メソッドを実際のデータフォーマットに合わせて修正：

```typescript
// 現在の実装（仮のフォーマット）
private parseCardData(characteristic: Characteristic): CardData {
  const decoded = this.base64Decode(characteristic.value);
  const ccusId = decoded.substring(0, 16).trim();
  const personId = decoded.substring(16, 32).trim() || undefined;
  // ...
}

// ↓ 実際のフォーマットに合わせる例
private parseCardData(characteristic: Characteristic): CardData {
  const decoded = this.base64Decode(characteristic.value);

  // 例1: JSON形式の場合
  const data = JSON.parse(decoded);
  return {
    ccusId: data.ccus_id,
    personId: data.person_id,
    timestamp: new Date().toISOString(),
  };

  // 例2: 固定バイト位置の場合
  const ccusId = decoded.substring(0, 10).trim(); // 最初の10バイト
  const personId = decoded.substring(10, 20).trim() || undefined; // 次の10バイト
  return {
    ccusId,
    personId,
    timestamp: new Date().toISOString(),
  };

  // 例3: 区切り文字がある場合
  const parts = decoded.split('|');
  return {
    ccusId: parts[0],
    personId: parts[1] || undefined,
    timestamp: new Date().toISOString(),
  };
}
```

### ステップ3: デバイス情報パーサーの実装（オプション）

`parseDeviceInfo()`メソッドも同様に実装：

```typescript
private parseDeviceInfo(characteristic: Characteristic): ReaderDeviceInfo {
  const decoded = this.base64Decode(characteristic.value);

  // 実際のフォーマットに合わせて実装
  const name = decoded.substring(0, 32).trim();
  const firmwareVersion = decoded.substring(32, 48).trim();

  return {
    id: this.device.id,
    name: name || this.device.name || "Unknown BLE Reader",
    firmwareVersion: firmwareVersion || "unknown",
  };
}
```

---

## アプリケーション設定の更新

### ステップ1: パーミッションの追加

`/volume2/Project/MCD3/TUMON/mc-gate/apps/mobile/app.config.ts` を編集：

```typescript
export default ({ config }: ConfigContext): ExpoConfig => ({
  // ... 既存の設定

  android: {
    // ... 既存の設定
    permissions: [
      // 既存のパーミッション
      "CAMERA",
      "INTERNET",
      // 以下を追加
      "BLUETOOTH",
      "BLUETOOTH_ADMIN",
      "BLUETOOTH_SCAN",
      "BLUETOOTH_CONNECT",
      "ACCESS_FINE_LOCATION",
    ],
  },

  ios: {
    // ... 既存の設定
    infoPlist: {
      // 既存の設定
      NSCameraUsageDescription: "...",
      // 以下を追加
      NSBluetoothAlwaysUsageDescription:
        "This app needs Bluetooth to connect to CCUS card readers for gate access management.",
      NSBluetoothPeripheralUsageDescription:
        "This app needs Bluetooth to connect to CCUS card readers for gate access management.",
    },
  },

  // ... その他の設定
});
```

### ステップ2: 環境変数の追加（オプション）

`.env`ファイルに設定を追加：

```bash
# BLE Card Reader Configuration
USE_MOCK_READER=false
BLE_SCAN_TIMEOUT=10000
BLE_AUTO_RECONNECT=true
```

---

## コードの変更

### パターンA: ファクトリー関数を使用（推奨）

```typescript
// 既存のコード
import { MockCardReader } from "@mc-gate/reader-bridge";
const reader = new MockCardReader();

// ↓ 変更後
import { createCardReader } from "@mc-gate/reader-bridge";
const reader = createCardReader(false); // falseで実際のBLEリーダーを使用
```

環境変数で切り替える場合：

```typescript
import { createCardReader } from "@mc-gate/reader-bridge";

// 開発環境ではモック、本番環境ではBLE
const useMock = __DEV__ || process.env.USE_MOCK_READER === "true";
const reader = createCardReader(useMock);
```

### パターンB: 直接インポート

```typescript
// 既存のコード
import { MockCardReader } from "@mc-gate/reader-bridge";
const reader = new MockCardReader();

// ↓ 変更後
import { BLECardReader } from "@mc-gate/reader-bridge";
const reader = new BLECardReader();
```

### 既存のAPIとの互換性

BLECardReaderとMockCardReaderは同じインターフェースを実装しているため、以下のメソッドはそのまま使用できます：

```typescript
// これらのメソッドは変更不要
await reader.connect(deviceId);
await reader.disconnect();
const info = await reader.deviceInfo();
const connected = await reader.isConnected();

const unsubscribe = reader.onCardDetected((card) => {
  console.log("Card:", card);
});
```

### 追加機能: デバイススキャン

BLECardReaderには新しい`scan()`メソッドがあります：

```typescript
import { BLECardReader } from "@mc-gate/reader-bridge";

const reader = new BLECardReader();

// デバイスをスキャン
const devices = await reader.scan(10000); // 10秒間スキャン

// ユーザーにデバイスを選択させる
const selectedDevice = devices[0]; // 実際はUIで選択

// 選択されたデバイスに接続
await reader.connect(selectedDevice.id);
```

---

## テスト手順

### フェーズ1: 開発環境でのテスト

1. **モックとBLEを切り替え可能にする**

```typescript
// config.ts
export const READER_CONFIG = {
  useMock: __DEV__, // 開発環境ではモック
  // useMock: false, // テスト時はこれをコメントアウト解除
};

// 使用箇所
import { createCardReader } from "@mc-gate/reader-bridge";
import { READER_CONFIG } from "./config";

const reader = createCardReader(READER_CONFIG.useMock);
```

2. **BLEスキャンのテスト**

```typescript
// テスト用のスクリプト
async function testBLEScan() {
  const reader = new BLECardReader();

  console.log("Starting BLE scan...");
  const devices = await reader.scan(10000);

  console.log(`Found ${devices.length} devices:`);
  devices.forEach((device, index) => {
    console.log(`${index + 1}. ${device.name || "Unknown"} (${device.id})`);
  });
}
```

3. **接続テスト**

```typescript
async function testBLEConnection(deviceId: string) {
  const reader = new BLECardReader();

  try {
    console.log("Connecting...");
    await reader.connect(deviceId);

    console.log("Connected!");
    const info = await reader.deviceInfo();
    console.log("Device info:", info);

    const connected = await reader.isConnected();
    console.log("Connection status:", connected);

    console.log("Disconnecting...");
    await reader.disconnect();

    console.log("Test completed successfully!");
  } catch (error) {
    console.error("Test failed:", error);
  }
}
```

4. **カード検出テスト**

```typescript
async function testCardDetection(deviceId: string) {
  const reader = new BLECardReader();

  await reader.connect(deviceId);

  console.log("Waiting for card...");
  const unsubscribe = reader.onCardDetected((card) => {
    console.log("Card detected:", card);
  });

  // 30秒待つ
  await new Promise((resolve) => setTimeout(resolve, 30000));

  unsubscribe();
  await reader.disconnect();
}
```

### フェーズ2: 実機テスト

1. **Android実機でテスト**

```bash
# ビルド
npx eas-cli build --platform android --profile preview --local

# インストール
adb install build-xxx.apk

# ログ確認
adb logcat | grep -i "BLE"
```

2. **iOS実機でテスト**

```bash
# ビルド
npx eas-cli build --platform ios --profile preview

# TestFlightでインストール
```

### フェーズ3: 本番環境へのデプロイ

1. **環境変数の設定**

```bash
# .env.production
USE_MOCK_READER=false
```

2. **本番ビルド**

```bash
npx eas-cli build --platform all --profile production
```

---

## トラブルシューティング

### 問題1: Bluetoothパーミッションエラー

**症状**: `Bluetooth is not available` エラー

**解決策**:
1. `app.config.ts`にパーミッションが追加されているか確認
2. 実行時にパーミッションをリクエストしているか確認
3. Androidの場合、位置情報サービスが有効になっているか確認

```typescript
import { PermissionsAndroid } from "react-native";

const granted = await PermissionsAndroid.requestMultiple([
  PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
  PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
  PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
]);
```

### 問題2: デバイスが見つからない

**症状**: `scan()`が空の配列を返す

**解決策**:
1. CCUSカードリーダーの電源が入っているか確認
2. カードリーダーがペアリングモードになっているか確認
3. Service UUIDが正しいか確認（`ble-reader.ts`の設定）
4. スキャン時間を長くしてみる：`await reader.scan(20000)`

### 問題3: 接続できない

**症状**: `connect()`がエラーをスロー

**解決策**:
1. デバイスとの距離が近いか確認
2. 他のアプリがBluetooth接続を使用していないか確認
3. デバイスを再起動してみる
4. ログを確認：`[BLE]` で始まるメッセージ

### 問題4: カードデータが受信できない

**症状**: `onCardDetected`が呼び出されない

**解決策**:
1. Characteristic UUIDが正しいか確認
2. 通知が有効になっているか確認（自動的に有効化されるはず）
3. `parseCardData()`でエラーが発生していないか確認
4. デバッグログを有効にして、受信データを確認

```typescript
// デバッグ用のコード追加
this.device.monitorCharacteristicForService(
  CCUS_SERVICE_UUID,
  CCUS_CARD_DATA_CHARACTERISTIC_UUID,
  (error, characteristic) => {
    console.log("[DEBUG] Notification received:", {
      error,
      value: characteristic?.value,
    });
    // 既存の処理...
  }
);
```

### 問題5: データのパースエラー

**症状**: `parseCardData()`でエラーが発生

**解決策**:
1. 受信データの実際のフォーマットを確認
2. Base64デコードが正しく行われているか確認
3. バイト位置やエンコーディングを調整

```typescript
// デバッグ用の一時的な実装
private parseCardData(characteristic: Characteristic): CardData {
  const rawValue = characteristic.value;
  console.log("[DEBUG] Raw base64:", rawValue);

  const decoded = this.base64Decode(rawValue);
  console.log("[DEBUG] Decoded string:", decoded);
  console.log("[DEBUG] Decoded bytes:", Array.from(decoded).map(c => c.charCodeAt(0)));

  // ここでフォーマットを確認してから実装
  // ...
}
```

---

## チェックリスト

移行完了前に以下を確認してください：

### 設定

- [ ] `ble-reader.ts`のService UUIDを更新
- [ ] `ble-reader.ts`のCharacteristic UUIDを更新
- [ ] `parseCardData()`を実際のフォーマットに合わせて実装
- [ ] `app.config.ts`にBluetoothパーミッションを追加

### コード

- [ ] `createCardReader()`を使用してモック/BLEを切り替え可能に
- [ ] パーミッションリクエストを実装
- [ ] デバイススキャンUIを実装（必要な場合）
- [ ] エラーハンドリングを実装

### テスト

- [ ] BLEスキャンが正常に動作することを確認
- [ ] デバイス接続が正常に動作することを確認
- [ ] カード検出が正常に動作することを確認
- [ ] 切断・再接続が正常に動作することを確認

### ドキュメント

- [ ] 実際のUUIDをドキュメント化
- [ ] データフォーマットをドキュメント化
- [ ] 運用手順書を作成

---

## サポート

問題が解決しない場合は、以下の情報を含めてサポートに連絡してください：

1. エラーメッセージ全文
2. デバッグログ（`[BLE]` で始まるメッセージ）
3. 使用しているデバイス情報
4. CCUSカードリーダーのモデル名

---

**最終更新**: 2025-11-11
