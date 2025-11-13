// ==========================================
// WorkerRepository トランザクション処理テスト
// ==========================================

import { WorkerRepository } from "../repository/worker-repository";
import type { SQLiteDatabase } from "../repository/worker-repository";
import type { Worker } from "../types/index";

describe("WorkerRepository Transaction Support", () => {
  // ==========================================
  // テストヘルパー: モックデータベース
  // ==========================================
  let mockDb: jest.Mocked<SQLiteDatabase>;
  let repository: WorkerRepository;

  beforeEach(() => {
    // モックデータベースの初期化
    mockDb = {
      execAsync: jest.fn().mockResolvedValue(undefined),
      runAsync: jest.fn().mockResolvedValue({ lastInsertRowId: 1, changes: 1 }),
      getAllAsync: jest.fn().mockResolvedValue([]),
    };

    repository = new WorkerRepository(mockDb);

    // console.errorをモック化
    jest.spyOn(console, "error").mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  // ==========================================
  // テストヘルパー: サンプル作業員データ
  // ==========================================
  const createSampleWorker = (overrides?: Partial<Worker>): Worker => ({
    personId: `P-${Math.random().toString(36).substring(7)}`,
    name: "テスト太郎",
    company: "テスト建設株式会社",
    ccusId: "CCUS-001",
    ccusRegistered: true,
    socialInsurance: true,
    residencyExpiry: "2026-12-31",
    age: 35,
    isSoleProprietor: false,
    faceEmbedding: [0.1, 0.2, 0.3],
    faceImageUrl: "https://example.com/face.jpg",
    createdAt: "2025-11-13T10:00:00.000Z",
    updatedAt: "2025-11-13T10:00:00.000Z",
    ...overrides,
  });

  // ==========================================
  // 1. upsertBatch() トランザクションテスト
  // ==========================================
  describe("upsertBatch() - Transaction Support", () => {
    it("✅ 【正常系】バッチ処理がトランザクション内で実行される", async () => {
      const workers = [
        createSampleWorker({ personId: "P-001" }),
        createSampleWorker({ personId: "P-002" }),
        createSampleWorker({ personId: "P-003" }),
      ];

      await repository.upsertBatch(workers);

      // トランザクション開始、SQL実行、コミットの順に呼び出される
      expect(mockDb.execAsync).toHaveBeenCalledWith("BEGIN TRANSACTION;");
      expect(mockDb.execAsync).toHaveBeenCalledWith(
        expect.stringContaining("INSERT OR REPLACE INTO workers")
      );
      expect(mockDb.execAsync).toHaveBeenCalledWith("COMMIT;");
    });

    it("✅ 【正常系】空配列を渡すと何もしない", async () => {
      await repository.upsertBatch([]);

      expect(mockDb.execAsync).not.toHaveBeenCalled();
    });

    it("✅ 【正常系】10件ごとにバッチ処理される", async () => {
      const workers = Array.from({ length: 25 }, (_, i) =>
        createSampleWorker({ personId: `P-${i}` })
      );

      await repository.upsertBatch(workers);

      // BEGIN + バッチ3回 (10 + 10 + 5) + COMMIT = 5回
      expect(mockDb.execAsync).toHaveBeenCalledTimes(5);
      expect(mockDb.execAsync).toHaveBeenNthCalledWith(1, "BEGIN TRANSACTION;");
      expect(mockDb.execAsync).toHaveBeenNthCalledWith(5, "COMMIT;");
    });

    it("❌ エラー時はロールバックされる", async () => {
      const workers = [
        createSampleWorker({ personId: "P-001" }),
        createSampleWorker({ personId: "P-002" }),
      ];

      // 2回目のexecAsyncでエラーをスロー（トランザクション開始後、SQL実行時）
      mockDb.execAsync
        .mockResolvedValueOnce(undefined) // BEGIN TRANSACTION
        .mockRejectedValueOnce(new Error("Constraint violation")); // SQL実行でエラー

      await expect(repository.upsertBatch(workers)).rejects.toThrow(
        "Database transaction failed: Constraint violation"
      );

      // ロールバックが呼び出されることを確認
      expect(mockDb.execAsync).toHaveBeenCalledWith("ROLLBACK;");
    });

    it("❌ ロールバック失敗時もエラーを記録する", async () => {
      const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();
      const workers = [createSampleWorker({ personId: "P-001" })];

      // SQL実行でエラー、その後のロールバックでもエラー
      mockDb.execAsync
        .mockResolvedValueOnce(undefined) // BEGIN TRANSACTION
        .mockRejectedValueOnce(new Error("Constraint violation")) // SQL実行でエラー
        .mockRejectedValueOnce(new Error("Rollback failed")); // ROLLBACK でもエラー

      await expect(repository.upsertBatch(workers)).rejects.toThrow();

      // ロールバック失敗がログに記録される
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[WorkerRepository] Failed to rollback transaction:",
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });

    it("✅ 【バッチサイズ】10件の作業員が正しくINSERT OR REPLACEされる", async () => {
      const workers = Array.from({ length: 10 }, (_, i) =>
        createSampleWorker({ personId: `P-${i}` })
      );

      await repository.upsertBatch(workers);

      // BEGIN + SQL実行1回 + COMMIT = 3回
      expect(mockDb.execAsync).toHaveBeenCalledTimes(3);

      // SQL実行の内容を確認
      const sqlCall = mockDb.execAsync.mock.calls[1][0];
      expect(sqlCall).toContain("INSERT OR REPLACE INTO workers");

      // 10個のINSERT文が含まれていることを確認
      const insertCount = (sqlCall.match(/INSERT OR REPLACE INTO workers/g) || []).length;
      expect(insertCount).toBe(10);
    });

    it("✅ 【データ型】faceEmbeddingがJSON文字列として保存される", async () => {
      const workers = [
        createSampleWorker({
          personId: "P-001",
          faceEmbedding: [0.1, 0.2, 0.3, 0.4, 0.5],
        }),
      ];

      await repository.upsertBatch(workers);

      const sqlCall = mockDb.execAsync.mock.calls[1][0];
      expect(sqlCall).toContain(JSON.stringify([0.1, 0.2, 0.3, 0.4, 0.5]));
    });

    it("✅ 【NULL処理】オプショナルフィールドがNULLとして保存される", async () => {
      const workers = [
        createSampleWorker({
          personId: "P-001",
          ccusId: undefined,
          residencyExpiry: undefined,
          age: undefined,
          faceEmbedding: undefined,
          faceImageUrl: undefined,
        }),
      ];

      await repository.upsertBatch(workers);

      const sqlCall = mockDb.execAsync.mock.calls[1][0];
      expect(sqlCall).toContain("NULL");
    });
  });

  // ==========================================
  // 2. syncFromServer() トランザクションテスト
  // ==========================================
  describe("syncFromServer() - Transaction Support", () => {
    it("✅ 【正常系】DELETEとINSERTがトランザクション内で実行される", async () => {
      const workers = [
        createSampleWorker({ personId: "P-001" }),
        createSampleWorker({ personId: "P-002" }),
      ];

      await repository.syncFromServer(workers);

      // トランザクション開始
      expect(mockDb.execAsync).toHaveBeenCalledWith("BEGIN TRANSACTION;");

      // 全削除
      expect(mockDb.execAsync).toHaveBeenCalledWith("DELETE FROM workers;");

      // バッチ挿入
      expect(mockDb.execAsync).toHaveBeenCalledWith(
        expect.stringContaining("INSERT OR REPLACE INTO workers")
      );

      // コミット
      expect(mockDb.execAsync).toHaveBeenCalledWith("COMMIT;");
    });

    it("✅ 【正常系】空配列でも正常に処理される", async () => {
      await repository.syncFromServer([]);

      expect(mockDb.execAsync).toHaveBeenCalledWith("BEGIN TRANSACTION;");
      expect(mockDb.execAsync).toHaveBeenCalledWith("DELETE FROM workers;");
      expect(mockDb.execAsync).toHaveBeenCalledWith("COMMIT;");
    });

    it("❌ DELETE実行時のエラーでロールバック", async () => {
      const workers = [createSampleWorker({ personId: "P-001" })];

      mockDb.execAsync
        .mockResolvedValueOnce(undefined) // BEGIN TRANSACTION
        .mockRejectedValueOnce(new Error("DELETE failed")); // DELETE でエラー

      await expect(repository.syncFromServer(workers)).rejects.toThrow("DELETE failed");

      // ロールバックが呼び出される
      expect(mockDb.execAsync).toHaveBeenCalledWith("ROLLBACK;");
    });

    it("❌ INSERT実行時のエラーでロールバック", async () => {
      const workers = [createSampleWorker({ personId: "P-001" })];

      mockDb.execAsync
        .mockResolvedValueOnce(undefined) // BEGIN TRANSACTION
        .mockResolvedValueOnce(undefined) // DELETE
        .mockRejectedValueOnce(new Error("INSERT failed")); // INSERT でエラー

      await expect(repository.syncFromServer(workers)).rejects.toThrow("INSERT failed");

      // ロールバックが呼び出される
      expect(mockDb.execAsync).toHaveBeenCalledWith("ROLLBACK;");
    });

    it("✅ 【整合性】DELETEとINSERTが同一トランザクション内で実行", async () => {
      const workers = [createSampleWorker({ personId: "P-001" })];

      await repository.syncFromServer(workers);

      const calls = mockDb.execAsync.mock.calls.map((call) => call[0]);

      // トランザクション開始 → DELETE → INSERT → コミット の順序を確認
      expect(calls[0]).toBe("BEGIN TRANSACTION;");
      expect(calls[1]).toBe("DELETE FROM workers;");
      expect(calls[2]).toContain("INSERT OR REPLACE INTO workers");
      expect(calls[3]).toBe("COMMIT;");
    });
  });

  // ==========================================
  // 3. 統合シナリオテスト
  // ==========================================
  describe("統合シナリオ - Transaction Support", () => {
    it("✅ 大量データの同期処理（100件）", async () => {
      const workers = Array.from({ length: 100 }, (_, i) =>
        createSampleWorker({ personId: `P-${i}` })
      );

      await repository.syncFromServer(workers);

      // BEGIN + DELETE + バッチ10回 (10件ずつ) + COMMIT = 13回
      expect(mockDb.execAsync).toHaveBeenCalledTimes(13);
      expect(mockDb.execAsync).toHaveBeenNthCalledWith(1, "BEGIN TRANSACTION;");
      expect(mockDb.execAsync).toHaveBeenNthCalledWith(2, "DELETE FROM workers;");
      expect(mockDb.execAsync).toHaveBeenNthCalledWith(13, "COMMIT;");
    });

    it("❌ バッチ処理中のエラーで全体がロールバック", async () => {
      const workers = Array.from({ length: 25 }, (_, i) =>
        createSampleWorker({ personId: `P-${i}` })
      );

      // 4回目のバッチでエラー（BEGIN + DELETE + バッチ1 + バッチ2 + エラー）
      mockDb.execAsync
        .mockResolvedValueOnce(undefined) // BEGIN TRANSACTION
        .mockResolvedValueOnce(undefined) // DELETE
        .mockResolvedValueOnce(undefined) // バッチ1 (P-0 ~ P-9)
        .mockResolvedValueOnce(undefined) // バッチ2 (P-10 ~ P-19)
        .mockRejectedValueOnce(new Error("Constraint violation")); // バッチ3 でエラー

      await expect(repository.syncFromServer(workers)).rejects.toThrow();

      // ロールバックが呼び出されることを確認
      expect(mockDb.execAsync).toHaveBeenCalledWith("ROLLBACK;");

      // エラーログが記録されることを確認
      expect(console.error).toHaveBeenCalledWith(
        "[WorkerRepository.syncFromServer] Failed to sync:",
        expect.objectContaining({
          errorMessage: "Constraint violation",
          workerCount: 25,
        })
      );
    });

    it("✅ upsertBatch単独での処理", async () => {
      const workers = [
        createSampleWorker({ personId: "P-001" }),
        createSampleWorker({ personId: "P-002" }),
      ];

      await repository.upsertBatch(workers);

      // syncFromServerと異なり、DELETEは実行されない
      const calls = mockDb.execAsync.mock.calls.map((call) => call[0]);
      expect(calls).not.toContain("DELETE FROM workers;");

      // トランザクション開始 → INSERT → コミット
      expect(calls[0]).toBe("BEGIN TRANSACTION;");
      expect(calls[1]).toContain("INSERT OR REPLACE INTO workers");
      expect(calls[2]).toBe("COMMIT;");
    });
  });

  // ==========================================
  // 4. エッジケーステスト
  // ==========================================
  describe("エッジケース - Transaction Support", () => {
    it("✅ 特殊文字を含む名前でもトランザクション処理が正常", async () => {
      const workers = [
        createSampleWorker({
          personId: "P-001",
          name: "テスト太郎'DROP TABLE workers;--",
          company: "株式会社\"Test<>Company",
        }),
      ];

      await repository.upsertBatch(workers);

      expect(mockDb.execAsync).toHaveBeenCalledWith("BEGIN TRANSACTION;");
      expect(mockDb.execAsync).toHaveBeenCalledWith("COMMIT;");

      // SQLインジェクション対策がされていることを確認
      const sqlCall = mockDb.execAsync.mock.calls[1][0];
      expect(sqlCall).toContain("''"); // シングルクォートがエスケープされている
    });

    it("✅ 日本語の名前と会社名が正しく処理される", async () => {
      const workers = [
        createSampleWorker({
          personId: "P-001",
          name: "山田太郎",
          company: "株式会社山田建設",
        }),
      ];

      await repository.upsertBatch(workers);

      const sqlCall = mockDb.execAsync.mock.calls[1][0];
      expect(sqlCall).toContain("山田太郎");
      expect(sqlCall).toContain("株式会社山田建設");
    });

    it("✅ faceEmbeddingが空配列の場合はNULLとして保存", async () => {
      const workers = [
        createSampleWorker({
          personId: "P-001",
          faceEmbedding: [],
        }),
      ];

      await repository.upsertBatch(workers);

      const sqlCall = mockDb.execAsync.mock.calls[1][0];
      // 空配列は faceEmbeddingStr が null になるため NULL として保存される
      expect(sqlCall).toContain("NULL");
    });

    it("✅ 真偽値フィールドが正しく変換される", async () => {
      const workers = [
        createSampleWorker({
          personId: "P-001",
          ccusRegistered: true,
          socialInsurance: false,
          isSoleProprietor: true,
        }),
      ];

      await repository.upsertBatch(workers);

      const sqlCall = mockDb.execAsync.mock.calls[1][0];
      // true → 1, false → 0
      // SQLの構造: ccus_registered, social_insurance, ... VALUES (..., 1, 0, ...)
      expect(sqlCall).toContain("ccus_registered");
      expect(sqlCall).toContain("social_insurance");
      expect(sqlCall).toContain("is_sole_proprietor");

      // VALUESセクションの値を確認（カンマ区切りで1と0が含まれている）
      const valuesMatch = sqlCall.match(/VALUES\s*\(([\s\S]*?)\)/);
      expect(valuesMatch).toBeTruthy();
      const valuesStr = valuesMatch![1];

      // カンマで分割して、期待される位置に1と0があることを確認
      const values = valuesStr.split(',').map(v => v.trim());
      expect(values).toContain('1'); // ccusRegistered: true → 1
      expect(values).toContain('0'); // socialInsurance: false → 0
    });

    it("✅ createdAtが未設定の場合は現在時刻が使用される", async () => {
      const workers = [
        createSampleWorker({
          personId: "P-001",
          createdAt: undefined as any, // 型を無視して未設定にする
        }),
      ];

      await repository.upsertBatch(workers);

      const sqlCall = mockDb.execAsync.mock.calls[1][0];
      // ISO8601形式の日時が含まれていることを確認
      expect(sqlCall).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
    });
  });
});
