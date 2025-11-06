// ==========================================
// キュー管理フック
// ==========================================

import { useEffect, useState } from "react";
import { Platform } from "react-native";
import type { ScanEvent, SQLiteDatabase } from "@mc-gate/core";
import {
  DB_NAME,
  SYNC_INTERVAL_MS,
  MAX_RETRIES,
} from "@mc-gate/core";
import { useAppStore } from "../store/appStore";

// Platform-conditional imports
let openDatabaseAsync: any;
let OfflineQueue: any;
let SyncWorker: any;
let sendScanEvent: any;

// Only import native modules on native platforms
if (Platform.OS !== "web") {
  const expoSqlite = require("expo-sqlite");
  openDatabaseAsync = expoSqlite.openDatabaseAsync;

  const core = require("@mc-gate/core");
  OfflineQueue = core.OfflineQueue;
  SyncWorker = core.SyncWorker;

  const apiClient = require("@mc-gate/api-client");
  sendScanEvent = apiClient.sendScanEvent;
}

let queueInstance: any | null = null;
let workerInstance: any | null = null;
let dbInstance: SQLiteDatabase | null = null;

/**
 * キュー管理フック
 */
export function useQueue() {
  const { user } = useAppStore();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function initialize() {
      try {
        // Skip SQLite initialization on web platform
        if (Platform.OS === "web") {
          console.warn(
            "Queue is disabled on web platform - SQLite is not available"
          );
          if (mounted) {
            setIsReady(true);
          }
          return;
        }

        if (!queueInstance) {
          // SQLiteデータベースを開く
          const db = await openDatabaseAsync(DB_NAME);
          dbInstance = db as unknown as SQLiteDatabase;

          // キューを初期化
          queueInstance = new OfflineQueue(dbInstance);
          await queueInstance.initialize();

          // ワーカーを初期化
          workerInstance = new SyncWorker({
            queue: queueInstance,
            sendFn: async (event: ScanEvent) => {
              if (!user?.token) {
                throw new Error("認証トークンがありません");
              }
              return await sendScanEvent({
                scanEvent: event,
                token: user.token,
              });
            },
            intervalMs: SYNC_INTERVAL_MS,
            maxRetries: MAX_RETRIES,
          });

          // ワーカーを開始
          workerInstance.start();
        }

        if (mounted) {
          setIsReady(true);
        }
      } catch (error) {
        console.error("Queue initialization failed:", error);
      }
    }

    initialize();

    return () => {
      mounted = false;
      // クリーンアップ（アプリ終了時のみ）
      // workerInstance?.stop();
    };
  }, [user?.token]);

  const addToQueue = async (event: ScanEvent): Promise<void> => {
    if (!queueInstance) {
      throw new Error("Queue is not initialized");
    }
    await queueInstance.add(event);
  };

  const getPendingCount = async (): Promise<number> => {
    if (!queueInstance) return 0;
    const counts = await queueInstance.getCount();
    return counts.pending;
  };

  const syncNow = async (): Promise<{ sent: number; failed: number }> => {
    if (!workerInstance) {
      throw new Error("Worker is not initialized");
    }
    return await workerInstance.syncNow();
  };

  const getTodayStats = async (projectId: string) => {
    if (!queueInstance) {
      throw new Error("Queue is not initialized");
    }
    return await queueInstance.getTodayStats(projectId);
  };

  const getLatestEvent = async (projectId: string) => {
    if (!queueInstance) return null;
    return await queueInstance.getLatestEvent(projectId);
  };

  const getQueueCounts = async () => {
    if (!queueInstance) {
      return { pending: 0, sent: 0, failed: 0 };
    }
    return await queueInstance.getCount();
  };

  const getHistory = async (
    projectId: string,
    options?: {
      status?: "pending" | "sent" | "failed";
      limit?: number;
      offset?: number;
    }
  ) => {
    if (!queueInstance) return [];
    return await queueInstance.getHistory(projectId, options);
  };

  return {
    isReady,
    queue: queueInstance,
    addToQueue,
    getPendingCount,
    syncNow,
    getTodayStats,
    getLatestEvent,
    getQueueCounts,
    getHistory,
  };
}
