// ==========================================
// 作業員マスタ管理フック
// ==========================================

import { useEffect, useState, useCallback } from "react";
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

/**
 * モック用：ダミー作業員データを生成
 */
function generateMockWorkers(count: number): Worker[] {
  const workers: Worker[] = [];
  const companies = ["大成建設", "鹿島建設", "清水建設", "竹中工務店", "大林組", "テスト建設株式会社"];
  const lastNames = ["田中", "佐藤", "鈴木", "高橋", "渡辺", "伊藤", "山本", "中村", "小林", "加藤"];
  const firstNames = ["太郎", "次郎", "三郎", "一郎", "健太", "大輔", "翔太", "拓也", "直樹", "和也"];

  // P010005を確実に含める（E2Eテスト用）
  workers.push({
    personId: "P010005",
    name: "テスト作業員 P010005",
    ccusId: "CCUS000005",
    ccusRegistered: false,
    socialInsurance: false,
    company: "テスト建設株式会社",
    residencyExpiry: new Date(2025, 11, 31).toISOString(),
    age: 30,
    isSoleProprietor: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  for (let i = 0; i < count; i++) {
    const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
    const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
    const name = `${lastName} ${firstName}`;
    const ccusId = `CCUS${String(i + 1).padStart(6, "0")}`;
    const personId = `P${String(10000 + i).padStart(6, "0")}`;

    workers.push({
      personId,
      name,
      ccusId,
      ccusRegistered: Math.random() > 0.1, // 90%はCCUS登録済み
      socialInsurance: Math.random() > 0.1, // 90%は社会保険加入
      company: companies[i % companies.length],
      residencyExpiry: new Date(2025, 11, 31).toISOString(), // 2025年12月31日
      age: 25 + Math.floor(Math.random() * 40), // 25〜64歳
      isSoleProprietor: Math.random() > 0.8, // 20%は一人親方
      // faceEmbedding is optional and omitted here (no face data registered)
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  return workers;
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
  const getAllWorkers = useCallback(async (): Promise<Worker[]> => {
    if (!repositoryInstance) {
      throw new Error("WorkerRepository is not initialized");
    }
    const allWorkers = await repositoryInstance.findAll();
    setWorkers(allWorkers);
    return allWorkers;
  }, []); // repositoryInstanceは一度初期化されたら変わらないため空配列

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
   * サーバーから作業員を取得（実API実装）
   */
  const fetchWorkersFromServer = async (apiUrl: string, apiKey: string, bearerToken: string): Promise<Worker[]> => {
    console.log("[Workers] Fetching from server:", apiUrl);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT.BULK_FETCH);

    try {
      const response = await fetch(apiUrl, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "Authorization": `Bearer ${bearerToken}`,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.error("[Workers] Failed to fetch workers:", response.status, response.statusText);
        const error: any = new Error(`Failed to fetch workers: ${response.status}`);
        error.status = response.status; // 401/403検出のためにstatusを付与
        throw error;
      }

      const json = await response.json();

      // サーバーのレスポンス構造に合わせてパース
      // { workers: [...] } または直接配列 の両方に対応
      const rows = Array.isArray(json) ? json : json.workers;

      if (!Array.isArray(rows)) {
        throw new Error("Invalid workers payload - expected array");
      }

      // camelCase / snake_case 両対応でマッピング
      const workers: Worker[] = rows.map((w: any) => ({
        personId: w.personId ?? w.person_id,
        name: w.name,
        ccusId: w.ccusId ?? w.ccus_id ?? null,
        ccusRegistered: !!(w.ccusRegistered ?? w.ccus_registered),
        socialInsurance: !!(w.socialInsurance ?? w.social_insurance),
        company: w.company ?? w.company_name,
        residencyExpiry: w.residencyExpiry ?? w.residency_expiry ?? null,
        age: w.age ?? null,
        isSoleProprietor: !!(w.isSoleProprietor ?? w.is_sole_proprietor),
        faceEmbedding: w.faceEmbedding ?? w.face_embedding ?? null,
        createdAt: w.createdAt ?? w.created_at,
        updatedAt: w.updatedAt ?? w.updated_at,
      }));

      console.log(`[Workers] Fetched ${workers.length} workers from server`);
      return workers;
    } catch (error: any) {
      clearTimeout(timeoutId);
      console.error("[Workers] Error fetching workers:", error);
      throw error;
    }
  };

  /**
   * サーバーから作業員マスタを同期
   */
  const syncFromServer = async (apiUrl: string, apiKey: string, bearerToken: string): Promise<void> => {
    if (!repositoryInstance) {
      throw new Error("WorkerRepository is not initialized");
    }

    try {
      // モック使用フラグの判定（Constants経由）
      const Constants = require("expo-constants").default;
      const useMockWorkers = Constants.expoConfig?.extra?.useMockWorkers ?? false;

      let serverWorkers: Worker[];

      if (useMockWorkers) {
        // モック実装: ダミー作業員データを生成（明示的にONにした場合のみ）
        console.log("🔄 Using mock worker sync (useMockWorkers = true)");
        serverWorkers = generateMockWorkers(30); // 30人のダミーデータ

        // モック同期の遅延（サーバー接続を模擬）
        await new Promise(resolve => setTimeout(resolve, 1000));
      } else {
        // 本番実装: 実際のサーバーから取得（デフォルト）
        console.log("🔄 Fetching workers from server (useMockWorkers = false)");
        serverWorkers = await fetchWorkersFromServer(apiUrl, apiKey, bearerToken);
      }

      // バッチでUPSERT
      await repositoryInstance.upsertBatch(serverWorkers);
      await getAllWorkers(); // リストを更新

      console.log(`✅ Synced ${serverWorkers.length} workers from server`);
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
