// ==========================================
// BLEカードリーダー 実装
// ==========================================

import { BleManager, Device, Characteristic } from "react-native-ble-plx";
import type { CardData, ReaderDeviceInfo } from "./mock";

/**
 * TODO: CCUS-specific configuration
 * これらのUUIDは実際のCCUSカードリーダーの仕様に合わせて更新する必要があります
 */
const CCUS_SERVICE_UUID = "0000fff0-0000-1000-8000-00805f9b34fb"; // TODO: 実際のService UUIDに置き換え
const CCUS_CARD_DATA_CHARACTERISTIC_UUID = "0000fff1-0000-1000-8000-00805f9b34fb"; // TODO: 実際のCharacteristic UUIDに置き換え
const CCUS_DEVICE_INFO_CHARACTERISTIC_UUID = "0000fff2-0000-1000-8000-00805f9b34fb"; // TODO: 実際のCharacteristic UUIDに置き換え

/**
 * BLEカードリーダーの実装
 *
 * react-native-ble-plxを使用してBLEデバイスと通信し、
 * CCUSカードの読み取りを行います。
 */
export class BLECardReader {
  private manager: BleManager;
  private device: Device | null = null;
  private listeners: ((card: CardData) => void)[] = [];
  private scanSubscription: { remove: () => void } | null = null;
  private notificationSubscription: { remove: () => void } | null = null;

  constructor() {
    this.manager = new BleManager();
  }

  /**
   * BLEデバイスをスキャン
   *
   * @param timeoutMs スキャンのタイムアウト（ミリ秒）
   * @returns 発見されたデバイスのリスト
   */
  async scan(timeoutMs: number = 10000): Promise<Device[]> {
    const devices: Device[] = [];
    const deviceMap = new Map<string, Device>();

    // Bluetoothの状態を確認
    const state = await this.manager.state();
    if (state !== "PoweredOn") {
      throw new Error(
        `Bluetooth is not available. Current state: ${state}. Please enable Bluetooth and grant permissions.`
      );
    }

    return new Promise((resolve, reject) => {
      // スキャン開始
      this.scanSubscription = this.manager.startDeviceScan(
        [CCUS_SERVICE_UUID], // TODO: CCUSカードリーダーのService UUIDでフィルタリング
        { allowDuplicates: false },
        (error, device) => {
          if (error) {
            this.manager.stopDeviceScan();
            reject(error);
            return;
          }

          if (device && !deviceMap.has(device.id)) {
            deviceMap.set(device.id, device);
            devices.push(device);
            console.log(`[BLE] Found device: ${device.name || device.id}`);
          }
        }
      );

      // タイムアウト処理
      setTimeout(() => {
        this.manager.stopDeviceScan();
        resolve(devices);
      }, timeoutMs);
    });
  }

  /**
   * BLEデバイスに接続
   *
   * @param deviceId 接続するデバイスのID
   */
  async connect(deviceId: string): Promise<void> {
    try {
      console.log(`[BLE] Connecting to device: ${deviceId}`);

      // 既存の接続があれば切断
      if (this.device) {
        await this.disconnect();
      }

      // デバイスに接続
      this.device = await this.manager.connectToDevice(deviceId, {
        autoConnect: false,
        requestMTU: 512, // MTUサイズを大きくしてデータ転送を高速化
      });

      // サービスと特性を検出
      await this.device.discoverAllServicesAndCharacteristics();

      console.log(`[BLE] Connected to device: ${this.device.name || deviceId}`);

      // カードデータの通知を開始
      await this.startNotifications();
    } catch (error) {
      console.error("[BLE] Connection failed:", error);
      this.device = null;
      throw error;
    }
  }

  /**
   * BLEデバイスから切断
   */
  async disconnect(): Promise<void> {
    try {
      // 通知を停止
      if (this.notificationSubscription) {
        this.notificationSubscription.remove();
        this.notificationSubscription = null;
      }

      // デバイスから切断
      if (this.device) {
        await this.device.cancelConnection();
        console.log(`[BLE] Disconnected from device: ${this.device.name || this.device.id}`);
        this.device = null;
      }
    } catch (error) {
      console.error("[BLE] Disconnect failed:", error);
      this.device = null;
    }
  }

  /**
   * カード検出時のコールバックを設定
   *
   * @param callback カード検出時に呼び出されるコールバック関数
   * @returns アンサブスクライブ関数
   */
  onCardDetected(callback: (card: CardData) => void): () => void {
    this.listeners.push(callback);

    // アンサブスクライブ関数を返す
    return () => {
      const index = this.listeners.indexOf(callback);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  /**
   * デバイス情報を取得
   *
   * @returns デバイス情報
   */
  async deviceInfo(): Promise<ReaderDeviceInfo> {
    if (!this.device) {
      throw new Error("Not connected to any device");
    }

    try {
      // デバイス情報の特性から読み取り
      const characteristic = await this.device.readCharacteristicForService(
        CCUS_SERVICE_UUID,
        CCUS_DEVICE_INFO_CHARACTERISTIC_UUID
      );

      // TODO: 実際のデータフォーマットに合わせてパース
      const deviceInfo = this.parseDeviceInfo(characteristic);

      return deviceInfo;
    } catch (error) {
      console.warn("[BLE] Failed to read device info, using defaults:", error);

      // フォールバック: 基本情報のみ返す
      return {
        id: this.device.id,
        name: this.device.name || "Unknown BLE Reader",
        firmwareVersion: "unknown",
      };
    }
  }

  /**
   * 接続状態を確認
   *
   * @returns 接続中の場合true
   */
  async isConnected(): Promise<boolean> {
    if (!this.device) {
      return false;
    }

    try {
      const connected = await this.device.isConnected();
      return connected;
    } catch (error) {
      console.error("[BLE] Failed to check connection status:", error);
      return false;
    }
  }

  /**
   * カードデータの通知を開始
   * @private
   */
  private async startNotifications(): Promise<void> {
    if (!this.device) {
      throw new Error("Not connected to any device");
    }

    try {
      console.log("[BLE] Starting notifications for card data");

      this.notificationSubscription = this.device.monitorCharacteristicForService(
        CCUS_SERVICE_UUID,
        CCUS_CARD_DATA_CHARACTERISTIC_UUID,
        (error, characteristic) => {
          if (error) {
            console.error("[BLE] Notification error:", error);
            return;
          }

          if (characteristic?.value) {
            try {
              const cardData = this.parseCardData(characteristic);
              console.log("[BLE] Card detected:", cardData);

              // すべてのリスナーに通知
              this.listeners.forEach((listener) => listener(cardData));
            } catch (parseError) {
              console.error("[BLE] Failed to parse card data:", parseError);
            }
          }
        }
      );
    } catch (error) {
      console.error("[BLE] Failed to start notifications:", error);
      throw error;
    }
  }

  /**
   * カードデータをパース
   * @private
   */
  private parseCardData(characteristic: Characteristic): CardData {
    if (!characteristic.value) {
      throw new Error("No data received from characteristic");
    }

    // Base64デコード（React Native環境用）
    const decoded = this.base64Decode(characteristic.value);

    // TODO: 実際のCCUSカードデータフォーマットに合わせてパース
    // 以下は仮実装です

    // 例: 最初の16文字がCCUS ID、次の16文字がPerson IDと仮定
    const ccusId = decoded.substring(0, 16).trim();
    const personId = decoded.substring(16, 32).trim() || undefined;

    return {
      ccusId,
      personId,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * デバイス情報をパース
   * @private
   */
  private parseDeviceInfo(characteristic: Characteristic): ReaderDeviceInfo {
    if (!characteristic.value || !this.device) {
      throw new Error("No data received from characteristic");
    }

    // Base64デコード（React Native環境用）
    const decoded = this.base64Decode(characteristic.value);

    // TODO: 実際のデバイス情報フォーマットに合わせてパース
    // 以下は仮実装です

    // 例: 最初の32文字がデバイス名、次の16文字がファームウェアバージョンと仮定
    const name = decoded.substring(0, 32).trim();
    const firmwareVersion = decoded.substring(32, 48).trim();

    return {
      id: this.device.id,
      name: name || this.device.name || "Unknown BLE Reader",
      firmwareVersion: firmwareVersion || "unknown",
    };
  }

  /**
   * Base64文字列をデコード
   * @private
   */
  private base64Decode(base64: string): string {
    // React Native環境でのBase64デコード
    // react-native-ble-plxは既にBase64エンコードされた文字列を返すため、
    // ネイティブのatob関数を使用してデコード
    try {
      return atob(base64);
    } catch (error) {
      console.error("[BLE] Failed to decode base64:", error);
      return base64; // フォールバック: そのまま返す
    }
  }

  /**
   * BLEマネージャーをクリーンアップ
   * アプリ終了時に呼び出す
   */
  async destroy(): Promise<void> {
    await this.disconnect();
    this.manager.destroy();
  }
}
