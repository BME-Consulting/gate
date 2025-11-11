// ==========================================
// OfflineQueue ユニットテスト（ホワイトボックス・全網羅）
// ==========================================

import { OfflineQueue } from "../queue/sqlite";
import type { SQLiteDatabase } from "../queue/sqlite";
import type { ScanEvent } from "../types/index";

describe("OfflineQueue", () => {
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
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ==========================================
  // テストヘルパー: サンプルイベントデータ
  // ==========================================
  const createSampleEvent = (overrides?: Partial<ScanEvent>): ScanEvent => ({
    id: "evt-001",
    projectId: "PRJ001",
    personId: "P001",
    method: "QR",
    gateMode: "IN",
    decidedMode: "IN",
    occurredAt: "2025-11-06T10:00:00.000Z",
    ruleResult: {
      action: "allow",
      messages: [],
      sendToCcus: true,
      includeInGs: true,
    },
    transport: {
      status: "pending",
      attempts: 0,
      idempotencyKey: "key-001",
    },
    ...overrides,
  });

  // ==========================================
  // テストヘルパー: データベース行（raw形式）
  // ==========================================
  const createSampleRow = (overrides?: any) => ({
    id: "evt-001",
    project_id: "PRJ001",
    person_id: "P001",
    method: "QR",
    gate_mode: "IN",
    decided_mode: "IN",
    occurred_at: "2025-11-06T10:00:00.000Z",
    rule_result: JSON.stringify({
      action: "allow",
      messages: [],
      sendToCcus: true,
      includeInGs: true,
    }),
    transport_status: "pending",
    transport_attempts: 0,
    transport_last_error: null,
    transport_idempotency_key: "key-001",
    created_at: "2025-11-06T10:00:00.000Z",
    updated_at: "2025-11-06T10:00:00.000Z",
    ...overrides,
  });

  // ==========================================
  // 1. initialize() メソッドのテスト
  // ==========================================
  describe("initialize()", () => {
    it("✅ テーブルとインデックスを作成するSQLを実行する", async () => {
      await queue.initialize();

      expect(mockDb.execAsync).toHaveBeenCalledTimes(3);

      // テーブル作成SQL
      expect(mockDb.execAsync).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining("CREATE TABLE IF NOT EXISTS scan_events")
      );

      // インデックス作成SQL (transport_status)
      expect(mockDb.execAsync).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining("CREATE INDEX IF NOT EXISTS idx_transport_status")
      );

      // インデックス作成SQL (idempotency_key)
      expect(mockDb.execAsync).toHaveBeenNthCalledWith(
        3,
        expect.stringContaining("CREATE INDEX IF NOT EXISTS idx_idempotency_key")
      );
    });

    it("❌ データベースエラー時は例外をスローする", async () => {
      mockDb.execAsync.mockRejectedValueOnce(new Error("DB connection failed"));

      await expect(queue.initialize()).rejects.toThrow("DB connection failed");
    });
  });

  // ==========================================
  // 2. add() メソッドのテスト
  // ==========================================
  describe("add()", () => {
    it("✅ 【正常系】イベントをデータベースに挿入できる", async () => {
      const event = createSampleEvent();

      await queue.add(event);

      expect(mockDb.runAsync).toHaveBeenCalledTimes(1);
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO scan_events"),
        [
          "evt-001",
          "PRJ001",
          "P001",
          "QR",
          "IN",
          "IN",
          "2025-11-06T10:00:00.000Z",
          JSON.stringify({
            action: "allow",
            messages: [],
            sendToCcus: true,
            includeInGs: true,
          }),
          "pending",
          0,
          null,
          "key-001",
          expect.any(String), // created_at
          expect.any(String), // updated_at
        ]
      );
    });

    it("✅ 【境界値】lastError が存在する場合も正しく挿入できる", async () => {
      const event = createSampleEvent({
        transport: {
          status: "failed",
          attempts: 3,
          lastError: "Network timeout",
          idempotencyKey: "key-002",
        },
      });

      await queue.add(event);

      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO scan_events"),
        expect.arrayContaining(["Network timeout"])
      );
    });

    it("✅ 【境界値】lastError が undefined の場合は null として挿入", async () => {
      const event = createSampleEvent({
        transport: {
          status: "pending",
          attempts: 0,
          lastError: undefined,
          idempotencyKey: "key-003",
        },
      });

      await queue.add(event);

      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO scan_events"),
        expect.arrayContaining([null])
      );
    });

    it("❌ データベースエラー時は例外をスローする", async () => {
      mockDb.runAsync.mockRejectedValueOnce(new Error("Constraint violation"));

      const event = createSampleEvent();

      await expect(queue.add(event)).rejects.toThrow("Constraint violation");
    });
  });

  // ==========================================
  // 3. getPending() メソッドのテスト
  // ==========================================
  describe("getPending()", () => {
    it("✅ 【正常系】pending 状態のイベントを取得できる", async () => {
      const row1 = createSampleRow({ id: "evt-001" });
      const row2 = createSampleRow({ id: "evt-002" });

      mockDb.getAllAsync.mockResolvedValueOnce([row1, row2]);

      const result = await queue.getPending();

      expect(mockDb.getAllAsync).toHaveBeenCalledWith(
        expect.stringContaining("WHERE transport_status = ?"),
        ["pending", 50]
      );
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe("evt-001");
      expect(result[1].id).toBe("evt-002");
    });

    it("✅ 【境界値】limit パラメータを指定できる", async () => {
      mockDb.getAllAsync.mockResolvedValueOnce([]);

      await queue.getPending(10);

      expect(mockDb.getAllAsync).toHaveBeenCalledWith(
        expect.any(String),
        ["pending", 10]
      );
    });

    it("✅ 【境界値】結果が空の場合は空配列を返す", async () => {
      mockDb.getAllAsync.mockResolvedValueOnce([]);

      const result = await queue.getPending();

      expect(result).toEqual([]);
    });

    it("✅ 【データ変換】データベース行を ScanEvent 型に正しく変換", async () => {
      const row = createSampleRow({
        id: "evt-999",
        transport_last_error: "API Error",
      });

      mockDb.getAllAsync.mockResolvedValueOnce([row]);

      const result = await queue.getPending();

      expect(result[0]).toMatchObject({
        id: "evt-999",
        projectId: "PRJ001",
        personId: "P001",
        method: "QR",
        gateMode: "IN",
        decidedMode: "IN",
        occurredAt: "2025-11-06T10:00:00.000Z",
        ruleResult: {
          action: "allow",
          messages: [],
          sendToCcus: true,
          includeInGs: true,
        },
        transport: {
          status: "pending",
          attempts: 0,
          lastError: "API Error",
          idempotencyKey: "key-001",
        },
      });
    });

    it("✅ 【NULL 処理】lastError が NULL の場合は undefined に変換", async () => {
      const row = createSampleRow({ transport_last_error: null });

      mockDb.getAllAsync.mockResolvedValueOnce([row]);

      const result = await queue.getPending();

      expect(result[0].transport.lastError).toBeUndefined();
    });

    it("❌ データベースエラー時は例外をスローする", async () => {
      mockDb.getAllAsync.mockRejectedValueOnce(new Error("Query failed"));

      await expect(queue.getPending()).rejects.toThrow("Query failed");
    });
  });

  // ==========================================
  // 4. updateStatus() メソッドのテスト
  // ==========================================
  describe("updateStatus()", () => {
    it("✅ 【正常系】ステータスを pending → sent に更新できる", async () => {
      await queue.updateStatus("evt-001", "sent", 1);

      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE scan_events"),
        ["sent", 1, null, expect.any(String), "evt-001"]
      );
    });

    it("✅ 【正常系】ステータスを pending → failed に更新できる", async () => {
      await queue.updateStatus("evt-002", "failed", 3, "Connection timeout");

      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE scan_events"),
        ["failed", 3, "Connection timeout", expect.any(String), "evt-002"]
      );
    });

    it("✅ 【境界値】lastError が undefined の場合は null として更新", async () => {
      await queue.updateStatus("evt-003", "sent", 1, undefined);

      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.any(String),
        ["sent", 1, null, expect.any(String), "evt-003"]
      );
    });

    it("✅ 【境界値】attempts が 0 の場合も正しく更新", async () => {
      await queue.updateStatus("evt-004", "pending", 0);

      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.any(String),
        ["pending", 0, null, expect.any(String), "evt-004"]
      );
    });

    it("❌ データベースエラー時は例外をスローする", async () => {
      mockDb.runAsync.mockRejectedValueOnce(new Error("Update failed"));

      await expect(
        queue.updateStatus("evt-005", "sent", 1)
      ).rejects.toThrow("Update failed");
    });
  });

  // ==========================================
  // 5. getCount() メソッドのテスト（最適化版）
  // ==========================================
  describe("getCount()", () => {
    it("✅ 【正常系】全ステータスの件数を1クエリで取得", async () => {
      mockDb.getAllAsync.mockResolvedValueOnce([
        { status: "pending", count: 10 },
        { status: "sent", count: 50 },
        { status: "failed", count: 5 },
      ]);

      const result = await queue.getCount();

      expect(mockDb.getAllAsync).toHaveBeenCalledTimes(1);
      expect(mockDb.getAllAsync).toHaveBeenCalledWith(
        expect.stringContaining("GROUP BY transport_status")
      );
      expect(result).toEqual({
        pending: 10,
        sent: 50,
        failed: 5,
      });
    });

    it("✅ 【境界値】一部のステータスが存在しない場合は 0 を返す", async () => {
      mockDb.getAllAsync.mockResolvedValueOnce([
        { status: "sent", count: 20 },
      ]);

      const result = await queue.getCount();

      expect(result).toEqual({
        pending: 0,
        sent: 20,
        failed: 0,
      });
    });

    it("✅ 【境界値】結果が空の場合は全て 0 を返す", async () => {
      mockDb.getAllAsync.mockResolvedValueOnce([]);

      const result = await queue.getCount();

      expect(result).toEqual({
        pending: 0,
        sent: 0,
        failed: 0,
      });
    });

    it("✅ 【最適化確認】1回のクエリで処理が完了する", async () => {
      mockDb.getAllAsync.mockResolvedValueOnce([
        { status: "pending", count: 5 },
      ]);

      await queue.getCount();

      // 最適化版では1回のクエリで完了
      expect(mockDb.getAllAsync).toHaveBeenCalledTimes(1);
    });

    it("❌ データベースエラー時は例外をスローする", async () => {
      mockDb.getAllAsync.mockRejectedValueOnce(new Error("Query failed"));

      await expect(queue.getCount()).rejects.toThrow("Query failed");
    });
  });

  // ==========================================
  // 6. getTodayStats() メソッドのテスト（最適化版）
  // ==========================================
  describe("getTodayStats()", () => {
    it("✅ 【正常系】今日の統計を1クエリで取得", async () => {
      mockDb.getAllAsync.mockResolvedValueOnce([
        { decided_mode: "IN", count: 30 },
        { decided_mode: "OUT", count: 10 },
      ]);

      const result = await queue.getTodayStats("PRJ001");

      expect(mockDb.getAllAsync).toHaveBeenCalledTimes(1);
      expect(mockDb.getAllAsync).toHaveBeenCalledWith(
        expect.stringContaining("GROUP BY decided_mode"),
        ["PRJ001", expect.any(String)]
      );
      expect(result).toEqual({
        todayIn: 30,
        todayOut: 10,
        currentInSite: 20,
      });
    });

    it("✅ 【境界値】OUT が IN より多い場合は currentInSite = 0", async () => {
      mockDb.getAllAsync.mockResolvedValueOnce([
        { decided_mode: "IN", count: 10 },
        { decided_mode: "OUT", count: 15 },
      ]);

      const result = await queue.getTodayStats("PRJ001");

      expect(result).toEqual({
        todayIn: 10,
        todayOut: 15,
        currentInSite: 0, // Math.max(0, 10 - 15) = 0
      });
    });

    it("✅ 【境界値】IN のみ存在する場合", async () => {
      mockDb.getAllAsync.mockResolvedValueOnce([
        { decided_mode: "IN", count: 25 },
      ]);

      const result = await queue.getTodayStats("PRJ001");

      expect(result).toEqual({
        todayIn: 25,
        todayOut: 0,
        currentInSite: 25,
      });
    });

    it("✅ 【境界値】OUT のみ存在する場合", async () => {
      mockDb.getAllAsync.mockResolvedValueOnce([
        { decided_mode: "OUT", count: 5 },
      ]);

      const result = await queue.getTodayStats("PRJ001");

      expect(result).toEqual({
        todayIn: 0,
        todayOut: 5,
        currentInSite: 0,
      });
    });

    it("✅ 【境界値】結果が空の場合は全て 0", async () => {
      mockDb.getAllAsync.mockResolvedValueOnce([]);

      const result = await queue.getTodayStats("PRJ001");

      expect(result).toEqual({
        todayIn: 0,
        todayOut: 0,
        currentInSite: 0,
      });
    });

    it("✅ 【フィルタ確認】今日の00:00:00以降のデータのみ取得", async () => {
      mockDb.getAllAsync.mockResolvedValueOnce([]);

      await queue.getTodayStats("PRJ001");

      const callArgs = mockDb.getAllAsync.mock.calls[0];
      const todayStr = callArgs?.[1]?.[1];

      // ISO8601形式の日時文字列であることを確認
      expect(todayStr).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

      // 今日の日付であることを確認
      const receivedDate = new Date(todayStr as string);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      expect(receivedDate.getTime()).toBe(today.getTime());
    });

    it("✅ 【フィルタ確認】sent ステータスのみを集計", async () => {
      mockDb.getAllAsync.mockResolvedValueOnce([]);

      await queue.getTodayStats("PRJ001");

      expect(mockDb.getAllAsync).toHaveBeenCalledWith(
        expect.stringContaining("transport_status = 'sent'"),
        expect.any(Array)
      );
    });

    it("✅ 【最適化確認】1回のクエリで処理が完了する", async () => {
      mockDb.getAllAsync.mockResolvedValueOnce([
        { decided_mode: "IN", count: 10 },
      ]);

      await queue.getTodayStats("PRJ001");

      // 最適化版では1回のクエリで完了
      expect(mockDb.getAllAsync).toHaveBeenCalledTimes(1);
    });

    it("❌ データベースエラー時は例外をスローする", async () => {
      mockDb.getAllAsync.mockRejectedValueOnce(new Error("Query failed"));

      await expect(queue.getTodayStats("PRJ001")).rejects.toThrow("Query failed");
    });
  });

  // ==========================================
  // 7. getLatestEvent() メソッドのテスト
  // ==========================================
  describe("getLatestEvent()", () => {
    it("✅ 【正常系】最新のイベントを取得できる", async () => {
      const row = createSampleRow({ id: "evt-latest" });
      mockDb.getAllAsync.mockResolvedValueOnce([row]);

      const result = await queue.getLatestEvent("PRJ001");

      expect(mockDb.getAllAsync).toHaveBeenCalledWith(
        expect.stringContaining("ORDER BY occurred_at DESC"),
        ["PRJ001"]
      );
      expect(result).not.toBeNull();
      expect(result?.id).toBe("evt-latest");
    });

    it("✅ 【境界値】結果が空の場合は null を返す", async () => {
      mockDb.getAllAsync.mockResolvedValueOnce([]);

      const result = await queue.getLatestEvent("PRJ001");

      expect(result).toBeNull();
    });

    it("✅ 【フィルタ確認】sent ステータスのみを対象", async () => {
      mockDb.getAllAsync.mockResolvedValueOnce([]);

      await queue.getLatestEvent("PRJ001");

      expect(mockDb.getAllAsync).toHaveBeenCalledWith(
        expect.stringContaining("transport_status = 'sent'"),
        expect.any(Array)
      );
    });

    it("✅ 【制限確認】LIMIT 1 で1件のみ取得", async () => {
      mockDb.getAllAsync.mockResolvedValueOnce([]);

      await queue.getLatestEvent("PRJ001");

      expect(mockDb.getAllAsync).toHaveBeenCalledWith(
        expect.stringContaining("LIMIT 1"),
        expect.any(Array)
      );
    });

    it("❌ データベースエラー時は例外をスローする", async () => {
      mockDb.getAllAsync.mockRejectedValueOnce(new Error("Query failed"));

      await expect(queue.getLatestEvent("PRJ001")).rejects.toThrow("Query failed");
    });
  });

  // ==========================================
  // 8. getHistory() メソッドのテスト
  // ==========================================
  describe("getHistory()", () => {
    it("✅ 【正常系】履歴を取得できる（デフォルト設定）", async () => {
      const rows = [
        createSampleRow({ id: "evt-001" }),
        createSampleRow({ id: "evt-002" }),
      ];
      mockDb.getAllAsync.mockResolvedValueOnce(rows);

      const result = await queue.getHistory("PRJ001");

      expect(mockDb.getAllAsync).toHaveBeenCalledWith(
        expect.stringContaining("WHERE project_id = ?"),
        ["PRJ001", 100, 0]
      );
      expect(result).toHaveLength(2);
    });

    it("✅ 【フィルタ】status を指定できる", async () => {
      mockDb.getAllAsync.mockResolvedValueOnce([]);

      await queue.getHistory("PRJ001", { status: "sent" });

      expect(mockDb.getAllAsync).toHaveBeenCalledWith(
        expect.stringContaining("AND transport_status = ?"),
        ["PRJ001", "sent", 100, 0]
      );
    });

    it("✅ 【ページネーション】limit を指定できる", async () => {
      mockDb.getAllAsync.mockResolvedValueOnce([]);

      await queue.getHistory("PRJ001", { limit: 20 });

      expect(mockDb.getAllAsync).toHaveBeenCalledWith(
        expect.any(String),
        ["PRJ001", 20, 0]
      );
    });

    it("✅ 【ページネーション】offset を指定できる", async () => {
      mockDb.getAllAsync.mockResolvedValueOnce([]);

      await queue.getHistory("PRJ001", { offset: 50 });

      expect(mockDb.getAllAsync).toHaveBeenCalledWith(
        expect.any(String),
        ["PRJ001", 100, 50]
      );
    });

    it("✅ 【複合フィルタ】status + limit + offset を同時指定", async () => {
      mockDb.getAllAsync.mockResolvedValueOnce([]);

      await queue.getHistory("PRJ001", {
        status: "failed",
        limit: 10,
        offset: 20,
      });

      expect(mockDb.getAllAsync).toHaveBeenCalledWith(
        expect.stringContaining("AND transport_status = ?"),
        ["PRJ001", "failed", 10, 20]
      );
    });

    it("✅ 【境界値】結果が空の場合は空配列を返す", async () => {
      mockDb.getAllAsync.mockResolvedValueOnce([]);

      const result = await queue.getHistory("PRJ001");

      expect(result).toEqual([]);
    });

    it("✅ 【ソート確認】occurred_at DESC で降順ソート", async () => {
      mockDb.getAllAsync.mockResolvedValueOnce([]);

      await queue.getHistory("PRJ001");

      expect(mockDb.getAllAsync).toHaveBeenCalledWith(
        expect.stringContaining("ORDER BY occurred_at DESC"),
        expect.any(Array)
      );
    });

    it("❌ データベースエラー時は例外をスローする", async () => {
      mockDb.getAllAsync.mockRejectedValueOnce(new Error("Query failed"));

      await expect(queue.getHistory("PRJ001")).rejects.toThrow("Query failed");
    });
  });

  // ==========================================
  // 9. rowToEvent() プライベートメソッドのテスト（間接的）
  // ==========================================
  describe("rowToEvent() データ変換（間接的テスト）", () => {
    it("✅ スネークケース → キャメルケース 変換", async () => {
      const row = createSampleRow();
      mockDb.getAllAsync.mockResolvedValueOnce([row]);

      const result = await queue.getPending();

      expect(result[0]).toMatchObject({
        projectId: row.project_id,
        personId: row.person_id,
        gateMode: row.gate_mode,
        decidedMode: row.decided_mode,
        occurredAt: row.occurred_at,
      });
    });

    it("✅ JSON 文字列を RuleResult オブジェクトにパース", async () => {
      const row = createSampleRow({
        rule_result: JSON.stringify({
          action: "warn",
          messages: ["msg.warning"],
          sendToCcus: false,
          includeInGs: true,
        }),
      });
      mockDb.getAllAsync.mockResolvedValueOnce([row]);

      const result = await queue.getPending();

      expect(result[0].ruleResult).toEqual({
        action: "warn",
        messages: ["msg.warning"],
        sendToCcus: false,
        includeInGs: true,
      });
    });

    it("✅ NULL を undefined に変換", async () => {
      const row = createSampleRow({ transport_last_error: null });
      mockDb.getAllAsync.mockResolvedValueOnce([row]);

      const result = await queue.getPending();

      expect(result[0].transport.lastError).toBeUndefined();
    });

    it("✅ 文字列値を undefined に変換", async () => {
      const row = createSampleRow({ transport_last_error: "Network error" });
      mockDb.getAllAsync.mockResolvedValueOnce([row]);

      const result = await queue.getPending();

      expect(result[0].transport.lastError).toBe("Network error");
    });
  });

  // ==========================================
  // 10. エッジケーステスト
  // ==========================================
  describe("エッジケース", () => {
    it("✅ 空文字列の projectId でも処理できる", async () => {
      mockDb.getAllAsync.mockResolvedValueOnce([]);

      const result = await queue.getTodayStats("");

      expect(result).toEqual({
        todayIn: 0,
        todayOut: 0,
        currentInSite: 0,
      });
    });

    it("✅ 特殊文字を含む personId でも処理できる", async () => {
      const event = createSampleEvent({
        personId: "P-001@example.com",
      });

      await queue.add(event);

      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(["P-001@example.com"])
      );
    });

    it("✅ 非常に大きな attempts 値でも処理できる", async () => {
      await queue.updateStatus("evt-001", "failed", 999999);

      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([999999])
      );
    });

    it("✅ 非常に長い lastError メッセージでも処理できる", async () => {
      const longError = "Error: ".repeat(1000);

      await queue.updateStatus("evt-001", "failed", 1, longError);

      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([longError])
      );
    });

    it("✅ CARD メソッドのイベントも正しく処理", async () => {
      const event = createSampleEvent({ method: "CARD" });

      await queue.add(event);

      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(["CARD"])
      );
    });

    it("✅ OUT モードのイベントも正しく処理", async () => {
      const event = createSampleEvent({ decidedMode: "OUT" });

      await queue.add(event);

      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(["OUT"])
      );
    });
  });

  // ==========================================
  // 11. 統合シナリオテスト
  // ==========================================
  describe("統合シナリオ", () => {
    it("✅ 完全なライフサイクル: add → getPending → updateStatus", async () => {
      // 1. イベントを追加
      const event = createSampleEvent();
      await queue.add(event);

      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining("INSERT"),
        expect.any(Array)
      );

      // 2. pending イベントを取得
      const row = createSampleRow();
      mockDb.getAllAsync.mockResolvedValueOnce([row]);
      const pending = await queue.getPending();

      expect(pending).toHaveLength(1);
      expect(pending[0].id).toBe("evt-001");

      // 3. ステータスを sent に更新
      await queue.updateStatus("evt-001", "sent", 1);

      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE"),
        ["sent", 1, null, expect.any(String), "evt-001"]
      );
    });

    it("✅ リトライシナリオ: pending → failed → pending → sent", async () => {
      // 1. 初回失敗
      await queue.updateStatus("evt-001", "failed", 1, "Timeout");

      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.any(String),
        ["failed", 1, "Timeout", expect.any(String), "evt-001"]
      );

      // 2. リトライ（pending に戻す）
      await queue.updateStatus("evt-001", "pending", 1);

      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.any(String),
        ["pending", 1, null, expect.any(String), "evt-001"]
      );

      // 3. 再送成功
      await queue.updateStatus("evt-001", "sent", 2);

      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.any(String),
        ["sent", 2, null, expect.any(String), "evt-001"]
      );
    });
  });
});
