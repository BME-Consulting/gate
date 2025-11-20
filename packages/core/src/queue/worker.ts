// ==========================================
// 再送ワーカー
// ==========================================

import type { ScanEvent } from "../types/index.js";
import type { OfflineQueue } from "./sqlite.js";
import { TIMEOUT } from "../constants/timeout";

export interface SyncWorkerConfig {
  queue: OfflineQueue;
  sendFn: (event: ScanEvent) => Promise<{ success: boolean; serverReceipt: boolean }>;
  intervalMs?: number;
  maxRetries?: number;
}

/**
 * 同期ワーカー
 * pending状態のイベントを定期的にサーバーに送信
 */
export class SyncWorker {
  private config: Required<SyncWorkerConfig>;
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(config: SyncWorkerConfig) {
    this.config = {
      ...config,
      intervalMs: config.intervalMs || 30000, // 30秒
      maxRetries: config.maxRetries || 5,
    };
  }

  /**
   * ワーカーを開始
   */
  start(): void {
    if (this.running) return;

    this.running = true;
    this.scheduleNext();
  }

  /**
   * ワーカーを停止
   */
  stop(): void {
    this.running = false;

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /**
   * 即座に同期を実行
   */
  async syncNow(): Promise<{ sent: number; failed: number }> {
    const pending = await this.config.queue.getPending();

    let sent = 0;
    let failed = 0;

    for (const event of pending) {
      try {
        // タイムアウト付きで送信
        const result = await this.sendWithTimeout(event);

        if (result.success && result.serverReceipt) {
          // 送信成功
          await this.config.queue.updateStatus(
            event.id,
            "sent",
            event.transport.attempts + 1
          );
          sent++;
        } else {
          // サーバーが受領していない
          throw new Error("サーバーが受領を確認できませんでした");
        }
      } catch (error) {
        const newAttempts = event.transport.attempts + 1;
        let errorMessage = error instanceof Error ? error.message : "不明なエラー";

        // タイムアウトエラーの判定
        if (error instanceof Error && (error.name === 'AbortError' || error.message.includes('タイムアウト'))) {
          errorMessage = `タイムアウト (${TIMEOUT.DEFAULT / 1000}秒)`;
        }

        if (newAttempts >= this.config.maxRetries) {
          // 最大リトライ回数超過
          await this.config.queue.updateStatus(
            event.id,
            "failed",
            newAttempts,
            errorMessage
          );
          failed++;

          if (__DEV__) {
            console.error(
              `[SyncWorker] Event ${event.id} reached max retries (${this.config.maxRetries}): ${errorMessage}`
            );
          }
        } else {
          // リトライ可能
          await this.config.queue.updateStatus(
            event.id,
            "pending",
            newAttempts,
            errorMessage
          );
        }
      }
    }

    return { sent, failed };
  }

  /**
   * タイムアウト付きでイベントを送信
   */
  private async sendWithTimeout(
    event: ScanEvent
  ): Promise<{ success: boolean; serverReceipt: boolean }> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`リクエストがタイムアウトしました（${TIMEOUT.DEFAULT / 1000}秒）`));
      }, TIMEOUT.DEFAULT);

      this.config
        .sendFn(event)
        .then((result) => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  /**
   * 次の同期をスケジュール
   */
  private scheduleNext(): void {
    if (!this.running) return;

    this.timer = setTimeout(async () => {
      try {
        await this.syncNow();
      } catch (error) {
        console.error("同期エラー:", error);
      }

      this.scheduleNext();
    }, this.config.intervalMs) as unknown as NodeJS.Timeout;
  }
}
