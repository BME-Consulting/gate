// ==========================================
// BLEカードリーダー モックブリッジ
// ==========================================

export interface CardData {
  ccusId: string;
  personId?: string;
  timestamp: string;
}

export interface ReaderDeviceInfo {
  id: string;
  name: string;
  firmwareVersion: string;
}

/**
 * BLEカードリーダーのモック実装
 *
 * 実際のSDKが到着したら、このモックを実装で置き換える
 */
export class MockCardReader {
  private connected = false;
  private listeners: ((card: CardData) => void)[] = [];
  private simulationTimer: NodeJS.Timeout | null = null;

  /**
   * リーダーに接続
   */
  async connect(deviceId?: string): Promise<void> {
    // モック: 接続をシミュレート
    await new Promise((resolve) => setTimeout(resolve, 1000));
    this.connected = true;
    console.log(`[Mock] Connected to card reader: ${deviceId || "default"}`);
  }

  /**
   * リーダーから切断
   */
  async disconnect(): Promise<void> {
    this.connected = false;
    this.stopSimulation();
    console.log("[Mock] Disconnected from card reader");
  }

  /**
   * カード検出時のコールバックを設定
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
   */
  async deviceInfo(): Promise<ReaderDeviceInfo> {
    return {
      id: "MOCK-READER-001",
      name: "Mock Card Reader",
      firmwareVersion: "1.0.0-mock",
    };
  }

  /**
   * 接続状態を確認
   */
  async isConnected(): Promise<boolean> {
    return this.connected;
  }

  /**
   * カード読取をシミュレート（テスト用）
   */
  startSimulation(intervalMs: number = 10000): void {
    if (this.simulationTimer) return;

    this.simulationTimer = setInterval(() => {
      if (!this.connected || this.listeners.length === 0) return;

      // ランダムなCCUS IDを生成
      const mockCard: CardData = {
        ccusId: `C${Math.floor(Math.random() * 100000).toString().padStart(5, "0")}`,
        personId: `P${Math.floor(Math.random() * 100000).toString().padStart(5, "0")}`,
        timestamp: new Date().toISOString(),
      };

      // すべてのリスナーに通知
      this.listeners.forEach((listener) => listener(mockCard));
    }, intervalMs) as unknown as NodeJS.Timeout;
  }

  /**
   * シミュレーションを停止
   */
  stopSimulation(): void {
    if (this.simulationTimer) {
      clearInterval(this.simulationTimer);
      this.simulationTimer = null;
    }
  }
}
