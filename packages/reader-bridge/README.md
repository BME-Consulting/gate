# @mc-gate/reader-bridge

BLEカードリーダーブリッジパッケージ - CCUSカードの読み取り機能を提供します。

## 概要

このパッケージは、CCUSカード読み取り機能を抽象化し、モック実装と実際のBLE実装を切り替え可能にします。

## インストール

```bash
pnpm install @mc-gate/reader-bridge
```

## 使い方

### 基本的な使用方法

```typescript
import { createCardReader } from "@mc-gate/reader-bridge";

// 開発環境ではモックを使用
const reader = createCardReader(__DEV__);

// デバイスに接続
await reader.connect("device-id");

// カード検出時のコールバックを設定
const unsubscribe = reader.onCardDetected((cardData) => {
  console.log("Card detected:", cardData);
  // { ccusId: "C12345", personId: "P67890", timestamp: "2025-11-11T..." }
});

// デバイス情報を取得
const info = await reader.deviceInfo();
console.log("Device info:", info);
// { id: "...", name: "BLE Reader", firmwareVersion: "1.0.0" }

// 接続状態を確認
const connected = await reader.isConnected();

// 切断
await reader.disconnect();

// リスナーを解除
unsubscribe();
```

### BLEデバイスのスキャン

```typescript
import { BLECardReader } from "@mc-gate/reader-bridge";

const reader = new BLECardReader();

// 10秒間スキャン
const devices = await reader.scan(10000);

devices.forEach((device) => {
  console.log(`Found: ${device.name || device.id}`);
});

// スキャンで見つかったデバイスに接続
if (devices.length > 0) {
  await reader.connect(devices[0].id);
}
```

## API リファレンス

### `createCardReader(useMock?: boolean)`

カードリーダーのファクトリー関数。

**パラメータ:**
- `useMock` (boolean, デフォルト: `true`) - `true`の場合はMockCardReaderを、`false`の場合はBLECardReaderを返します。

**戻り値:**
- `MockCardReader` または `BLECardReader` のインスタンス

### `BLECardReader`

実際のBLEデバイスと通信するカードリーダー実装。

#### メソッド

##### `scan(timeoutMs?: number): Promise<Device[]>`

BLEデバイスをスキャンします。

**パラメータ:**
- `timeoutMs` (number, デフォルト: `10000`) - スキャンのタイムアウト時間（ミリ秒）

**戻り値:**
- 発見されたBLEデバイスの配列

**例外:**
- Bluetoothが無効な場合やパーミッションがない場合にエラーをスロー

##### `connect(deviceId: string): Promise<void>`

指定されたBLEデバイスに接続します。

**パラメータ:**
- `deviceId` (string) - 接続するデバイスのID

**例外:**
- 接続に失敗した場合にエラーをスロー

##### `disconnect(): Promise<void>`

BLEデバイスから切断します。

##### `onCardDetected(callback: (card: CardData) => void): () => void`

カード検出時のコールバックを設定します。

**パラメータ:**
- `callback` (function) - カード検出時に呼び出される関数

**戻り値:**
- リスナーを解除するための関数

##### `isConnected(): Promise<boolean>`

デバイスが接続されているかどうかを確認します。

**戻り値:**
- 接続中の場合は`true`、それ以外は`false`

##### `deviceInfo(): Promise<ReaderDeviceInfo>`

接続中のデバイスの情報を取得します。

**戻り値:**
- デバイス情報オブジェクト

**例外:**
- デバイスが接続されていない場合にエラーをスロー

##### `destroy(): Promise<void>`

BLEマネージャーをクリーンアップします。アプリ終了時に呼び出してください。

### `MockCardReader`

テスト・開発用のモック実装。

#### メソッド

`BLECardReader`と同じインターフェースを提供しますが、実際のBLE通信は行わず、シミュレーションされたデータを返します。

##### `startSimulation(intervalMs?: number): void`

カード読み取りのシミュレーションを開始します（テスト用）。

**パラメータ:**
- `intervalMs` (number, デフォルト: `10000`) - カード検出をシミュレートする間隔（ミリ秒）

##### `stopSimulation(): void`

シミュレーションを停止します。

## データ型

### `CardData`

カード読み取り結果のデータ型。

```typescript
interface CardData {
  ccusId: string;       // CCUS ID
  personId?: string;    // 人物ID（オプション）
  timestamp: string;    // ISO 8601形式のタイムスタンプ
}
```

### `ReaderDeviceInfo`

デバイス情報のデータ型。

```typescript
interface ReaderDeviceInfo {
  id: string;               // デバイスID
  name: string;             // デバイス名
  firmwareVersion: string;  // ファームウェアバージョン
}
```

## Android/iOSパーミッション設定

### Android (`app.json` / `app.config.ts`)

```json
{
  "android": {
    "permissions": [
      "BLUETOOTH",
      "BLUETOOTH_ADMIN",
      "BLUETOOTH_SCAN",
      "BLUETOOTH_CONNECT",
      "ACCESS_FINE_LOCATION"
    ]
  }
}
```

### iOS (`app.json` / `app.config.ts`)

```json
{
  "ios": {
    "infoPlist": {
      "NSBluetoothAlwaysUsageDescription": "This app needs Bluetooth to connect to CCUS card readers.",
      "NSBluetoothPeripheralUsageDescription": "This app needs Bluetooth to connect to CCUS card readers."
    }
  }
}
```

### 実行時パーミッションリクエスト

```typescript
import { PermissionsAndroid, Platform } from "react-native";

async function requestBluetoothPermissions() {
  if (Platform.OS === "android") {
    const granted = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    ]);

    return (
      granted["android.permission.BLUETOOTH_SCAN"] === PermissionsAndroid.RESULTS.GRANTED &&
      granted["android.permission.BLUETOOTH_CONNECT"] === PermissionsAndroid.RESULTS.GRANTED &&
      granted["android.permission.ACCESS_FINE_LOCATION"] === PermissionsAndroid.RESULTS.GRANTED
    );
  }

  return true; // iOSはInfo.plistで設定済み
}
```

## CCUS固有の設定（TODO）

現在の実装では、UUIDやデータフォーマットが仮のものとなっています。
実際のCCUSカードリーダーを使用する際は、以下の設定を更新してください：

### `/packages/reader-bridge/src/ble-reader.ts` の更新が必要な箇所

1. **Service UUID** (Line 10)
   ```typescript
   const CCUS_SERVICE_UUID = "0000fff0-0000-1000-8000-00805f9b34fb";
   // ↑ 実際のCCUSカードリーダーのService UUIDに置き換え
   ```

2. **Card Data Characteristic UUID** (Line 11)
   ```typescript
   const CCUS_CARD_DATA_CHARACTERISTIC_UUID = "0000fff1-0000-1000-8000-00805f9b34fb";
   // ↑ カードデータを通知するCharacteristic UUIDに置き換え
   ```

3. **Device Info Characteristic UUID** (Line 12)
   ```typescript
   const CCUS_DEVICE_INFO_CHARACTERISTIC_UUID = "0000fff2-0000-1000-8000-00805f9b34fb";
   // ↑ デバイス情報を読み取るCharacteristic UUIDに置き換え
   ```

4. **parseCardData メソッド** (Line 254-270)
   - CCUSカードリーダーから送信される実際のデータフォーマットに合わせて実装
   - バイナリデータのパース方法を修正

5. **parseDeviceInfo メソッド** (Line 276-297)
   - デバイス情報の実際のフォーマットに合わせて実装

## トラブルシューティング

### Bluetoothが利用できない

**エラー:** `Bluetooth is not available. Current state: PoweredOff`

**解決策:**
1. デバイスのBluetooth設定でBluetoothを有効にする
2. アプリに必要なパーミッションが付与されているか確認
3. Androidの場合、位置情報サービスも有効にする必要がある

### デバイスが見つからない

**解決策:**
1. CCUSカードリーダーの電源が入っているか確認
2. カードリーダーがペアリングモードになっているか確認
3. `scan()`の引数でタイムアウト時間を長くしてみる
4. Service UUIDが正しく設定されているか確認

### 接続がすぐに切れる

**解決策:**
1. デバイスとの距離が近いか確認（Bluetoothの通信範囲内）
2. 他のアプリがBluetooth接続を使用していないか確認
3. MTUサイズを調整してみる（`connect()`メソッド内）

### カードデータが受信できない

**解決策:**
1. Characteristic UUIDが正しいか確認
2. `parseCardData()`メソッドのデータパース処理を確認
3. カードリーダーのログで通知が送信されているか確認

## 開発ヒント

### デバッグログの有効化

BLE通信のデバッグには、以下のログが出力されます：

```
[BLE] Found device: XXX
[BLE] Connecting to device: XXX
[BLE] Connected to device: XXX
[BLE] Starting notifications for card data
[BLE] Card detected: { ccusId: "...", ... }
[BLE] Disconnected from device: XXX
```

### モックとの切り替え

開発中は環境変数やフラグでモックと実装を切り替えることを推奨します：

```typescript
// 環境変数で切り替え
const useMock = process.env.USE_MOCK_READER === "true" || __DEV__;
const reader = createCardReader(useMock);
```

## ライセンス

Private

## サポート

問題が発生した場合は、プロジェクトのIssueトラッカーで報告してください。
