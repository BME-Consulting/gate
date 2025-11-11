# BLE Card Reader Usage Examples

## 完全な実装例

### 1. BLEパーミッションのリクエスト

```typescript
// utils/blePermissions.ts
import { PermissionsAndroid, Platform } from "react-native";

export async function requestBluetoothPermissions(): Promise<boolean> {
  if (Platform.OS === "android") {
    if (Platform.Version >= 31) {
      // Android 12以降
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
    } else {
      // Android 11以前
      const granted = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ]);

      return (
        granted["android.permission.ACCESS_FINE_LOCATION"] === PermissionsAndroid.RESULTS.GRANTED
      );
    }
  }

  // iOSは自動的にパーミッションダイアログが表示される
  return true;
}
```

### 2. BLEカードリーダーフック

```typescript
// hooks/useBLECardReader.ts
import { useState, useEffect, useCallback } from "react";
import { BLECardReader, CardData } from "@mc-gate/reader-bridge";
import { Device } from "react-native-ble-plx";
import { requestBluetoothPermissions } from "../utils/blePermissions";

export function useBLECardReader() {
  const [reader] = useState(() => new BLECardReader());
  const [devices, setDevices] = useState<Device[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [connectedDevice, setConnectedDevice] = useState<Device | null>(null);
  const [error, setError] = useState<string | null>(null);

  // デバイスをスキャン
  const scanDevices = useCallback(async () => {
    try {
      setError(null);
      setIsScanning(true);

      // パーミッションチェック
      const hasPermission = await requestBluetoothPermissions();
      if (!hasPermission) {
        throw new Error("Bluetooth permissions not granted");
      }

      // スキャン実行
      const foundDevices = await reader.scan(10000);
      setDevices(foundDevices);

      if (foundDevices.length === 0) {
        setError("No devices found. Please ensure the card reader is powered on.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to scan devices");
      console.error("Scan error:", err);
    } finally {
      setIsScanning(false);
    }
  }, [reader]);

  // デバイスに接続
  const connectToDevice = useCallback(
    async (deviceId: string) => {
      try {
        setError(null);
        await reader.connect(deviceId);
        setIsConnected(true);

        // 接続されたデバイス情報を保存
        const device = devices.find((d) => d.id === deviceId);
        setConnectedDevice(device || null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to connect");
        setIsConnected(false);
        console.error("Connection error:", err);
      }
    },
    [reader, devices]
  );

  // 切断
  const disconnect = useCallback(async () => {
    try {
      await reader.disconnect();
      setIsConnected(false);
      setConnectedDevice(null);
    } catch (err) {
      console.error("Disconnect error:", err);
    }
  }, [reader]);

  // カード検出のリスナーを設定
  const onCardDetected = useCallback(
    (callback: (card: CardData) => void) => {
      return reader.onCardDetected(callback);
    },
    [reader]
  );

  // クリーンアップ
  useEffect(() => {
    return () => {
      reader.destroy();
    };
  }, [reader]);

  return {
    reader,
    devices,
    isScanning,
    isConnected,
    connectedDevice,
    error,
    scanDevices,
    connectToDevice,
    disconnect,
    onCardDetected,
  };
}
```

### 3. BLEデバイス選択画面

```typescript
// screens/BLEDeviceSelectionScreen.tsx
import React, { useEffect } from "react";
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, StyleSheet } from "react-native";
import { useBLECardReader } from "../hooks/useBLECardReader";

interface Props {
  onDeviceSelected: (deviceId: string) => void;
}

export function BLEDeviceSelectionScreen({ onDeviceSelected }: Props) {
  const { devices, isScanning, error, scanDevices } = useBLECardReader();

  useEffect(() => {
    // 画面表示時に自動スキャン
    scanDevices();
  }, [scanDevices]);

  const renderDevice = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.deviceItem}
      onPress={() => onDeviceSelected(item.id)}
    >
      <Text style={styles.deviceName}>{item.name || "Unknown Device"}</Text>
      <Text style={styles.deviceId}>{item.id}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Select BLE Card Reader</Text>

      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {isScanning ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Scanning for devices...</Text>
        </View>
      ) : (
        <>
          <FlatList
            data={devices}
            renderItem={renderDevice}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContainer}
            ListEmptyComponent={
              <Text style={styles.emptyText}>
                No devices found. Tap "Scan Again" to retry.
              </Text>
            }
          />

          <TouchableOpacity style={styles.scanButton} onPress={scanDevices}>
            <Text style={styles.scanButtonText}>Scan Again</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: "#f5f5f5",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 16,
  },
  errorContainer: {
    backgroundColor: "#fee",
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorText: {
    color: "#c00",
    fontSize: 14,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: "#666",
  },
  listContainer: {
    flexGrow: 1,
  },
  deviceItem: {
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  deviceName: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 4,
  },
  deviceId: {
    fontSize: 14,
    color: "#666",
  },
  emptyText: {
    textAlign: "center",
    fontSize: 16,
    color: "#666",
    marginTop: 32,
  },
  scanButton: {
    backgroundColor: "#007AFF",
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 16,
  },
  scanButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
```

### 4. カードスキャン画面（BLE統合版）

```typescript
// screens/CardScanScreen.tsx
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useBLECardReader } from "../hooks/useBLECardReader";
import { CardData } from "@mc-gate/reader-bridge";

interface Props {
  deviceId: string;
  onCardScanned: (card: CardData) => void;
  onDisconnect: () => void;
}

export function CardScanScreen({ deviceId, onCardScanned, onDisconnect }: Props) {
  const { connectToDevice, disconnect, isConnected, connectedDevice, onCardDetected, error } =
    useBLECardReader();
  const [lastCard, setLastCard] = useState<CardData | null>(null);

  useEffect(() => {
    // デバイスに接続
    connectToDevice(deviceId);

    return () => {
      // クリーンアップ: 切断
      disconnect();
    };
  }, [deviceId, connectToDevice, disconnect]);

  useEffect(() => {
    if (!isConnected) return;

    // カード検出リスナーを設定
    const unsubscribe = onCardDetected((card) => {
      setLastCard(card);
      onCardScanned(card);
    });

    return () => {
      unsubscribe();
    };
  }, [isConnected, onCardDetected, onCardScanned]);

  const handleDisconnect = async () => {
    await disconnect();
    onDisconnect();
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Card Scanner</Text>
        <TouchableOpacity onPress={handleDisconnect} style={styles.disconnectButton}>
          <Text style={styles.disconnectButtonText}>Disconnect</Text>
        </TouchableOpacity>
      </View>

      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <View style={styles.statusContainer}>
        <Text style={styles.statusLabel}>Status:</Text>
        <Text style={[styles.statusValue, isConnected ? styles.connected : styles.disconnected]}>
          {isConnected ? "Connected" : "Connecting..."}
        </Text>
      </View>

      {connectedDevice && (
        <View style={styles.deviceInfo}>
          <Text style={styles.deviceInfoLabel}>Connected Device:</Text>
          <Text style={styles.deviceInfoValue}>
            {connectedDevice.name || "Unknown Device"}
          </Text>
          <Text style={styles.deviceInfoId}>{connectedDevice.id}</Text>
        </View>
      )}

      <View style={styles.scanArea}>
        <Text style={styles.scanInstruction}>
          {isConnected ? "Hold card near reader" : "Connecting to reader..."}
        </Text>
      </View>

      {lastCard && (
        <View style={styles.lastCardContainer}>
          <Text style={styles.lastCardLabel}>Last Scanned Card:</Text>
          <Text style={styles.lastCardValue}>CCUS ID: {lastCard.ccusId}</Text>
          {lastCard.personId && (
            <Text style={styles.lastCardValue}>Person ID: {lastCard.personId}</Text>
          )}
          <Text style={styles.lastCardTimestamp}>{lastCard.timestamp}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: "#f5f5f5",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
  },
  disconnectButton: {
    backgroundColor: "#ff3b30",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  disconnectButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  errorContainer: {
    backgroundColor: "#fee",
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorText: {
    color: "#c00",
    fontSize: 14,
  },
  statusContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  statusLabel: {
    fontSize: 16,
    marginRight: 8,
  },
  statusValue: {
    fontSize: 16,
    fontWeight: "600",
  },
  connected: {
    color: "#34c759",
  },
  disconnected: {
    color: "#ff9500",
  },
  deviceInfo: {
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 8,
    marginBottom: 24,
  },
  deviceInfoLabel: {
    fontSize: 14,
    color: "#666",
    marginBottom: 8,
  },
  deviceInfoValue: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 4,
  },
  deviceInfoId: {
    fontSize: 12,
    color: "#999",
  },
  scanArea: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 16,
    marginBottom: 24,
    borderWidth: 2,
    borderColor: "#007AFF",
    borderStyle: "dashed",
  },
  scanInstruction: {
    fontSize: 18,
    color: "#666",
    textAlign: "center",
  },
  lastCardContainer: {
    backgroundColor: "#e8f5e9",
    padding: 16,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: "#4caf50",
  },
  lastCardLabel: {
    fontSize: 14,
    color: "#2e7d32",
    marginBottom: 8,
    fontWeight: "600",
  },
  lastCardValue: {
    fontSize: 16,
    color: "#1b5e20",
    marginBottom: 4,
  },
  lastCardTimestamp: {
    fontSize: 12,
    color: "#4caf50",
    marginTop: 8,
  },
});
```

### 5. 環境別の設定

```typescript
// config/readerConfig.ts
import { Platform } from "react-native";

export const READER_CONFIG = {
  // 開発環境ではモックを使用
  useMock: __DEV__,

  // スキャンタイムアウト（ミリ秒）
  scanTimeout: 10000,

  // 自動再接続を有効化
  autoReconnect: true,

  // 再接続の試行回数
  maxReconnectAttempts: 3,

  // 再接続の間隔（ミリ秒）
  reconnectInterval: 2000,

  // プラットフォーム別設定
  platform: {
    android: {
      // Android 12以降で必要なパーミッション
      permissions: Platform.Version >= 31
        ? ["BLUETOOTH_SCAN", "BLUETOOTH_CONNECT", "ACCESS_FINE_LOCATION"]
        : ["ACCESS_FINE_LOCATION"],
    },
    ios: {
      // iOSで表示されるパーミッションメッセージ
      permissionMessage: "This app needs Bluetooth to connect to CCUS card readers.",
    },
  },
};
```

## テストコード例

```typescript
// __tests__/BLECardReader.test.ts
import { BLECardReader } from "@mc-gate/reader-bridge";

jest.mock("react-native-ble-plx", () => ({
  BleManager: jest.fn().mockImplementation(() => ({
    state: jest.fn().mockResolvedValue("PoweredOn"),
    startDeviceScan: jest.fn(),
    stopDeviceScan: jest.fn(),
    connectToDevice: jest.fn().mockResolvedValue({
      id: "test-device",
      name: "Test Reader",
      discoverAllServicesAndCharacteristics: jest.fn().mockResolvedValue(undefined),
      isConnected: jest.fn().mockResolvedValue(true),
      cancelConnection: jest.fn().mockResolvedValue(undefined),
    }),
    destroy: jest.fn(),
  })),
}));

describe("BLECardReader", () => {
  let reader: BLECardReader;

  beforeEach(() => {
    reader = new BLECardReader();
  });

  afterEach(async () => {
    await reader.destroy();
  });

  it("should scan for devices", async () => {
    const devices = await reader.scan(1000);
    expect(Array.isArray(devices)).toBe(true);
  });

  it("should connect to a device", async () => {
    await expect(reader.connect("test-device")).resolves.not.toThrow();
  });

  it("should check connection status", async () => {
    await reader.connect("test-device");
    const connected = await reader.isConnected();
    expect(connected).toBe(true);
  });

  it("should disconnect from device", async () => {
    await reader.connect("test-device");
    await expect(reader.disconnect()).resolves.not.toThrow();
  });
});
```

## トラブルシューティング

### 問題: デバイスが見つからない

```typescript
// デバッグ用のスキャン関数
async function debugScan() {
  const reader = new BLECardReader();

  try {
    console.log("Starting scan...");
    const devices = await reader.scan(20000); // 20秒間スキャン

    console.log(`Found ${devices.length} devices:`);
    devices.forEach(device => {
      console.log(`- ${device.name || "Unnamed"} (${device.id})`);
    });

    if (devices.length === 0) {
      console.log("No devices found. Check:");
      console.log("1. Card reader is powered on");
      console.log("2. Bluetooth is enabled");
      console.log("3. Permissions are granted");
      console.log("4. Device is in pairing mode");
    }
  } catch (error) {
    console.error("Scan failed:", error);
  }
}
```

### 問題: 接続が頻繁に切れる

```typescript
// 自動再接続機能付きラッパー
class RobustBLECardReader extends BLECardReader {
  private reconnectAttempts = 0;
  private maxAttempts = 3;
  private deviceId: string | null = null;

  async connect(deviceId: string): Promise<void> {
    this.deviceId = deviceId;
    this.reconnectAttempts = 0;

    try {
      await super.connect(deviceId);
      this.setupConnectionMonitor();
    } catch (error) {
      await this.attemptReconnect();
    }
  }

  private setupConnectionMonitor() {
    setInterval(async () => {
      const connected = await this.isConnected();
      if (!connected && this.deviceId) {
        console.log("Connection lost, attempting to reconnect...");
        await this.attemptReconnect();
      }
    }, 5000);
  }

  private async attemptReconnect() {
    if (this.reconnectAttempts >= this.maxAttempts || !this.deviceId) {
      console.error("Max reconnect attempts reached");
      return;
    }

    this.reconnectAttempts++;
    console.log(`Reconnect attempt ${this.reconnectAttempts}/${this.maxAttempts}`);

    try {
      await super.connect(this.deviceId);
      this.reconnectAttempts = 0;
      console.log("Reconnected successfully");
    } catch (error) {
      console.error("Reconnect failed:", error);
      setTimeout(() => this.attemptReconnect(), 2000);
    }
  }
}
```
