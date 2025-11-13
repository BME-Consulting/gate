// ==========================================
// OfflineQueue トランザクション処理テスト
// ==========================================

import { OfflineQueue } from "../queue/sqlite";
import type { SQLiteDatabase } from "../queue/sqlite";
import type { ScanEvent } from "../types/index";

describe("OfflineQueue Transaction Support", () => {
  // ==========================================
  // テストヘルパー: モックデータベース
  // ==========================================
  let mockDb: jest.Mocked<SQLiteDatabase>;
  let queue: OfflineQueue;

  beforeEach(() => {
    // モックデータベースの初期化
    mockDb = {
      execAsync: jest.fn().mockResolvedValue(undefined),
      runAsync: jest.fn().mockResolvedValue({ lastInsertRowId: 1, changes: 1 }),
      getAllAsync: jest.fn().mockResolvedValue([]),
    };

    queue = new OfflineQueue(mockDb);

    // console.errorをモック化
    jest.spyOn(console, "error").mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  // ==========================================
  // テストヘルパー: サンプルイベントデータ
  // ==========================================
  const createSampleEvent = (overrides?: Partial<ScanEvent>): ScanEvent => ({
    id: `evt-${Math.random().toString(36).substring(7)}`,
    projectId: "PRJ001",
    personId: "P001",
    method: "QR",
    gateMode: "IN",
    decidedMode: "IN",
    occurredAt: "2025-11-13T10:00:00.000Z",
    ruleResult: {
      action: "allow",
      messages: [],
      sendToCcus: true,
      includeInGs: true,
    },
    transport: {
      status: "pending",
      attempts: 0,
      idempotencyKey: `key-${Math.random().toString(36).substring(7)}`,
    },
    ...overrides,
  });

  // ==========================================
  // 1. upsertBatch() トランザクションテスト
  // ==========================================
  describe("upsertBatch() - Transaction Support", () => {
    it("✅ 【正常系】バッチ処理がトランザクション内で実行される", async () => {
      const events = [
        createSampleEvent({ id: "evt-001" }),
        createSampleEvent({ id: "evt-002" }),
        createSampleEvent({ id: "evt-003" }),
      ];

      await queue.upsertBatch(events);

      // トランザクション開始、SQL実行、コミットの順に呼び出される
      expect(mockDb.execAsync).toHaveBeenCalledWith("BEGIN TRANSACTION;");
      expect(mockDb.execAsync).toHaveBeenCalledWith(
        expect.stringContaining("INSERT OR REPLACE INTO scan_events")
      );
      expect(mockDb.execAsync).toHaveBeenCalledWith("COMMIT;");
    });

    it("✅ 【正常系】空配列を渡すと何もしない", async () => {
      await queue.upsertBatch([]);

      expect(mockDb.execAsync).not.toHaveBeenCalled();
    });

    it("✅ 【正常系】10件ごとにバッチ処理される", async () => {
      const events = Array.from({ length: 25 }, (_, i) =>
        createSampleEvent({ id: `evt-${i}` })
      );

      await queue.upsertBatch(events);

      // BEGIN + バッチ3回 (10 + 10 + 5) + COMMIT = 5回
      expect(mockDb.execAsync).toHaveBeenCalledTimes(5);
      expect(mockDb.execAsync).toHaveBeenNthCalledWith(1, "BEGIN TRANSACTION;");
      expect(mockDb.execAsync).toHaveBeenNthCalledWith(5, "COMMIT;");
    });

    it("❌ エラー時はロールバックされる", async () => {
      const events = [
        createSampleEvent({ id: "evt-001" }),
        createSampleEvent({ id: "evt-002" }),
      ];

      // 2回目のexecAsyncでエラーをスロー（トランザクション開始後、SQL実行時）
      mockDb.execAsync
        .mockResolvedValueOnce(undefined) // BEGIN TRANSACTION
        .mockRejectedValueOnce(new Error("Constraint violation")); // SQL実行でエラー

      await expect(queue.upsertBatch(events)).rejects.toThrow(
        "Database transaction failed: Constraint violation"
      );

      // ロールバックが呼び出されることを確認
      expect(mockDb.execAsync).toHaveBeenCalledWith("ROLLBACK;");
    });

    it("❌ ロールバック失敗時もエラーを記録する", async () => {
      const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();
      const events = [createSampleEvent({ id: "evt-001" })];

      // SQL実行でエラー、その後のロールバックでもエラー
      mockDb.execAsync
        .mockResolvedValueOnce(undefined) // BEGIN TRANSACTION
        .mockRejectedValueOnce(new Error("Constraint violation")) // SQL実行でエラー
        .mockRejectedValueOnce(new Error("Rollback failed")); // ROLLBACK でもエラー

      await expect(queue.upsertBatch(events)).rejects.toThrow();

      // ロールバック失敗がログに記録される
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[OfflineQueue] Failed to rollback transaction:",
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });

    it("✅ 【バッチサイズ】10件のイベントが正しくINSERT OR REPLACEされる", async () => {
      const events = Array.from({ length: 10 }, (_, i) =>
        createSampleEvent({ id: `evt-${i}` })
      );

      await queue.upsertBatch(events);

      // BEGIN + SQL実行1回 + COMMIT = 3回
      expect(mockDb.execAsync).toHaveBeenCalledTimes(3);

      // SQL実行の内容を確認
      const sqlCall = mockDb.execAsync.mock.calls[1][0];
      expect(sqlCall).toContain("INSERT OR REPLACE INTO scan_events");

      // 10個のINSERT文が含まれていることを確認
      const insertCount = (sqlCall.match(/INSERT OR REPLACE INTO scan_events/g) || []).length;
      expect(insertCount).toBe(10);
    });
  });

  // ==========================================
  // 2. markAsSent() トランザクションテスト
  // ==========================================
  describe("markAsSent() - Transaction Support", () => {
    it("✅ 【正常系】トランザクション内でUPDATEが実行される", async () => {
      await queue.markAsSent("key-001");

      expect(mockDb.execAsync).toHaveBeenCalledWith("BEGIN TRANSACTION;");
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE scan_events"),
        ["key-001"]
      );
      expect(mockDb.execAsync).toHaveBeenCalledWith("COMMIT;");
    });

    it("❌ エラー時はロールバックされる", async () => {
      mockDb.runAsync.mockRejectedValueOnce(new Error("Update failed"));

      await expect(queue.markAsSent("key-002")).rejects.toThrow("Update failed");

      expect(mockDb.execAsync).toHaveBeenCalledWith("BEGIN TRANSACTION;");
      expect(mockDb.execAsync).toHaveBeenCalledWith("ROLLBACK;");
    });

    it("❌ ロールバック失敗時もエラーを記録する", async () => {
      const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();

      mockDb.execAsync
        .mockResolvedValueOnce(undefined) // BEGIN TRANSACTION
        .mockRejectedValueOnce(new Error("Rollback failed")); // ROLLBACK でエラー

      mockDb.runAsync.mockRejectedValueOnce(new Error("Update failed"));

      await expect(queue.markAsSent("key-003")).rejects.toThrow("Update failed");

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[OfflineQueue] Failed to rollback transaction:",
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });
  });

  // ==========================================
  // 3. markAsFailed() トランザクションテスト
  // ==========================================
  describe("markAsFailed() - Transaction Support", () => {
    it("✅ 【正常系】トランザクション内でUPDATEが実行される", async () => {
      await queue.markAsFailed("key-001", "Network timeout");

      expect(mockDb.execAsync).toHaveBeenCalledWith("BEGIN TRANSACTION;");
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE scan_events"),
        ["Network timeout", "key-001"]
      );
      expect(mockDb.execAsync).toHaveBeenCalledWith("COMMIT;");
    });

    it("✅ 【正常系】attemptsがインクリメントされる", async () => {
      await queue.markAsFailed("key-002", "API Error");

      const updateSQL = mockDb.runAsync.mock.calls[0][0];
      expect(updateSQL).toContain("transport_attempts = transport_attempts + 1");
    });

    it("❌ エラー時はロールバックされる", async () => {
      mockDb.runAsync.mockRejectedValueOnce(new Error("Update failed"));

      await expect(
        queue.markAsFailed("key-003", "Error message")
      ).rejects.toThrow("Update failed");

      expect(mockDb.execAsync).toHaveBeenCalledWith("BEGIN TRANSACTION;");
      expect(mockDb.execAsync).toHaveBeenCalledWith("ROLLBACK;");
    });

    it("❌ ロールバック失敗時もエラーを記録する", async () => {
      const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();

      mockDb.execAsync
        .mockResolvedValueOnce(undefined) // BEGIN TRANSACTION
        .mockRejectedValueOnce(new Error("Rollback failed")); // ROLLBACK でエラー

      mockDb.runAsync.mockRejectedValueOnce(new Error("Update failed"));

      await expect(
        queue.markAsFailed("key-004", "Error message")
      ).rejects.toThrow("Update failed");

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[OfflineQueue] Failed to rollback transaction:",
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });
  });

  // ==========================================
  // 4. 統合シナリオテスト
  // ==========================================
  describe("統合シナリオ - Transaction Support", () => {
    it("✅ バッチ挿入 → マーク処理の一連の流れ", async () => {
      // 1. バッチ挿入
      const events = [
        createSampleEvent({ id: "evt-001", transport: { status: "pending", attempts: 0, idempotencyKey: "key-001" } }),
        createSampleEvent({ id: "evt-002", transport: { status: "pending", attempts: 0, idempotencyKey: "key-002" } }),
      ];

      await queue.upsertBatch(events);

      expect(mockDb.execAsync).toHaveBeenCalledWith("BEGIN TRANSACTION;");
      expect(mockDb.execAsync).toHaveBeenCalledWith("COMMIT;");

      // 2. 送信成功をマーク
      await queue.markAsSent("key-001");

      expect(mockDb.execAsync).toHaveBeenCalledWith("BEGIN TRANSACTION;");
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining("transport_status = 'sent'"),
        ["key-001"]
      );
      expect(mockDb.execAsync).toHaveBeenCalledWith("COMMIT;");

      // 3. 送信失敗をマーク
      await queue.markAsFailed("key-002", "Network error");

      expect(mockDb.execAsync).toHaveBeenCalledWith("BEGIN TRANSACTION;");
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining("transport_status = 'failed'"),
        ["Network error", "key-002"]
      );
      expect(mockDb.execAsync).toHaveBeenCalledWith("COMMIT;");
    });

    it("✅ 大量データのバッチ処理（100件）", async () => {
      const events = Array.from({ length: 100 }, (_, i) =>
        createSampleEvent({ id: `evt-${i}` })
      );

      await queue.upsertBatch(events);

      // BEGIN + バッチ10回 (10件ずつ) + COMMIT = 12回
      expect(mockDb.execAsync).toHaveBeenCalledTimes(12);
      expect(mockDb.execAsync).toHaveBeenNthCalledWith(1, "BEGIN TRANSACTION;");
      expect(mockDb.execAsync).toHaveBeenNthCalledWith(12, "COMMIT;");
    });

    it("❌ バッチ処理中のエラーで全体がロールバック", async () => {
      const events = Array.from({ length: 25 }, (_, i) =>
        createSampleEvent({ id: `evt-${i}` })
      );

      // 3回目のバッチでエラー（BEGIN + バッチ1 + バッチ2 + エラー）
      mockDb.execAsync
        .mockResolvedValueOnce(undefined) // BEGIN TRANSACTION
        .mockResolvedValueOnce(undefined) // バッチ1 (evt-0 ~ evt-9)
        .mockResolvedValueOnce(undefined) // バッチ2 (evt-10 ~ evt-19)
        .mockRejectedValueOnce(new Error("Constraint violation")); // バッチ3 でエラー

      await expect(queue.upsertBatch(events)).rejects.toThrow();

      // ロールバックが呼び出されることを確認
      expect(mockDb.execAsync).toHaveBeenCalledWith("ROLLBACK;");

      // エラーログが記録されることを確認
      expect(console.error).toHaveBeenCalledWith(
        "[OfflineQueue] Batch upsert failed, rolled back:",
        expect.objectContaining({
          operation: "upsertBatch",
          eventCount: 25,
        })
      );
    });
  });

  // ==========================================
  // 5. エッジケーステスト
  // ==========================================
  describe("エッジケース - Transaction Support", () => {
    it("✅ トランザクション開始直後のエラー", async () => {
      mockDb.execAsync.mockRejectedValueOnce(new Error("BEGIN TRANSACTION failed"));

      const events = [createSampleEvent({ id: "evt-001" })];

      await expect(queue.upsertBatch(events)).rejects.toThrow();

      // BEGIN TRANSACTIONでエラーが発生した後でもROLLBACKが呼ばれる
      expect(mockDb.execAsync).toHaveBeenCalledWith("ROLLBACK;");
    });

    it("✅ COMMIT時のエラー", async () => {
      mockDb.execAsync
        .mockResolvedValueOnce(undefined) // BEGIN TRANSACTION
        .mockResolvedValueOnce(undefined) // SQL実行
        .mockRejectedValueOnce(new Error("COMMIT failed")); // COMMIT でエラー

      const events = [createSampleEvent({ id: "evt-001" })];

      await expect(queue.upsertBatch(events)).rejects.toThrow();

      // ROLLBACKが呼び出される
      expect(mockDb.execAsync).toHaveBeenCalledWith("ROLLBACK;");
    });

    it("✅ 特殊文字を含むデータでもトランザクション処理が正常", async () => {
      const events = [
        createSampleEvent({
          id: "evt-001",
          personId: "P-001'DROP TABLE scan_events;--",
        }),
      ];

      await queue.upsertBatch(events);

      expect(mockDb.execAsync).toHaveBeenCalledWith("BEGIN TRANSACTION;");
      expect(mockDb.execAsync).toHaveBeenCalledWith("COMMIT;");

      // SQLインジェクション対策がされていることを確認
      const sqlCall = mockDb.execAsync.mock.calls[1][0];
      expect(sqlCall).toContain("''"); // シングルクォートがエスケープされている
    });
  });
});
