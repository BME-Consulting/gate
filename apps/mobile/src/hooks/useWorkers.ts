// ==========================================
// 作業員マスタ管理フック
// ==========================================

import { useEffect, useState } from "react";
import { Platform } from "react-native";
import type { Worker, SQLiteDatabase } from "@mc-gate/core";
import { DB_NAME as IMPORTED_DB_NAME, TIMEOUT, fetchWithTimeout } from "@mc-gate/core";

// WORKAROUND: Ensure DB_NAME is a string, not a module object
const DB_NAME = typeof IMPORTED_DB_NAME === "string" ? IMPORTED_DB_NAME : "mc-gate.db";

// Platform-conditional imports
let openDatabaseAsync: any;
let WorkerRepository: any;

// Only import native modules on native platforms
if (Platform.OS !== "web") {
  const expoSqlite = require("expo-sqlite");
  openDatabaseAsync = expoSqlite.openDatabaseAsync;

  const core = require("@mc-gate/core");
  WorkerRepository = core.WorkerRepository;
}

let repositoryInstance: any | null = null;
let dbInstance: SQLiteDatabase | null = null;

/**
 * 作業員マスタ管理フック
 */
export function useWorkers() {
  const [isReady, setIsReady] = useState(false);
  const [workers, setWorkers] = useState<Worker[]>([]);

  useEffect(() => {
    let mounted = true;

    async function initialize() {
      try {
        // Skip SQLite initialization on web platform
        if (Platform.OS === "web") {
          console.warn(
            "WorkerRepository is disabled on web platform - SQLite is not available"
          );
          if (mounted) {
            setIsReady(true);
          }
          return;
        }

        if (!repositoryInstance) {
          // SQLiteデータベースを開く
          const db = await openDatabaseAsync(DB_NAME);
          dbInstance = db as unknown as SQLiteDatabase;

          // リポジトリを初期化
          repositoryInstance = new WorkerRepository(dbInstance);
          await repositoryInstance.initialize();
        }

        if (mounted) {
          setIsReady(true);
        }
      } catch (error: any) {
        console.error("WorkerRepository initialization failed:", {
          errorMessage: error?.message,
          platform: Platform.OS,
          dbName: DB_NAME,
        });
      }
    }

    initialize();

    return () => {
      mounted = false;
    };
  }, []);

  /**
   * 全作業員を取得
   */
  const getAllWorkers = async (): Promise<Worker[]> => {
    if (!repositoryInstance) {
      throw new Error("WorkerRepository is not initialized");
    }
    const allWorkers = await repositoryInstance.findAll();
    setWorkers(allWorkers);
    return allWorkers;
  };

  /**
   * IDで作業員を検索
   */
  const getWorkerById = async (personId: string): Promise<Worker | null> => {
    if (!repositoryInstance) {
      throw new Error("WorkerRepository is not initialized");
    }
    return await repositoryInstance.findById(personId);
  };

  /**
   * 作業員を追加
   */
  const addWorker = async (worker: Worker): Promise<void> => {
    if (!repositoryInstance) {
      throw new Error("WorkerRepository is not initialized");
    }
    await repositoryInstance.add(worker);
    await getAllWorkers(); // リストを更新
  };

  /**
   * 作業員を更新
   */
  const updateWorker = async (worker: Worker): Promise<void> => {
    if (!repositoryInstance) {
      throw new Error("WorkerRepository is not initialized");
    }
    await repositoryInstance.update(worker);
    await getAllWorkers(); // リストを更新
  };

  /**
   * 作業員を削除
   */
  const deleteWorker = async (personId: string): Promise<void> => {
    if (!repositoryInstance) {
      throw new Error("WorkerRepository is not initialized");
    }
    await repositoryInstance.delete(personId);
    await getAllWorkers(); // リストを更新
  };

  /**
   * サーバーから作業員マスタを同期
   */
  const syncFromServer = async (apiUrl: string, token: string): Promise<void> => {
    if (!repositoryInstance) {
      throw new Error("WorkerRepository is not initialized");
    }

    try {
      // サーバーから全作業員を取得（タイムアウト付き）
      const response = await fetchWithTimeout(apiUrl, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        timeoutMs: TIMEOUT.BULK_FETCH, // 90秒（大量データ対応）
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const serverWorkers: Worker[] = data.workers || [];

      // バッチでUPSERT
      await repositoryInstance.upsertBatch(serverWorkers);
      await getAllWorkers(); // リストを更新

      if (__DEV__) {
        console.log(`✅ Synced ${serverWorkers.length} workers from server`);
      }
    } catch (error: any) {
      console.error("Failed to sync workers from server:", error);
      throw error;
    }
  };

  /**
   * 顔エンコーディングで作業員を検索
   */
  const findWorkersByFaceEmbedding = async (): Promise<Worker[]> => {
    if (!repositoryInstance) {
      throw new Error("WorkerRepository is not initialized");
    }

    const allWorkers = await repositoryInstance.findAll();
    return allWorkers.filter((worker: Worker) => worker.faceEmbedding && worker.faceEmbedding.length > 0);
  };

  return {
    isReady,
    repository: repositoryInstance,
    workers,
    getAllWorkers,
    getWorkerById,
    addWorker,
    updateWorker,
    deleteWorker,
    syncFromServer,
    findWorkersByFaceEmbedding,
  };
}
