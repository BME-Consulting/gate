// ==========================================
// SyncWorker ユニットテスト（フルカバレッジ）
// ==========================================

// __DEV__をグローバルスコープで定義
(global as any).__DEV__ = true;

import { SyncWorker } from "../queue/worker";
import type { SyncWorkerConfig } from "../queue/worker";
import type { OfflineQueue } from "../queue/sqlite";
import type { ScanEvent } from "../types/index";

// ==========================================
// テストヘルパー: モックイベント生成
// ==========================================
const createMockEvent = (overrides?: Partial<ScanEvent>): ScanEvent => ({
  id: "event-001",
  projectId: "PRJ001",
  personId: "P001",
  method: "QR",
  gateMode: "IN",
  decidedMode: "IN",
  occurredAt: "2025-01-06T10:00:00.000Z",
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

describe("SyncWorker", () => {
  // ==========================================
  // モックの共通設定
  // ==========================================
  let mockQueue: jest.Mocked<OfflineQueue>;
  let mockSendFn: jest.MockedFunction<SyncWorkerConfig["sendFn"]>;
  let worker: SyncWorker;

  beforeEach(() => {
    // OfflineQueue のモック
    mockQueue = {
      initialize: jest.fn(),
      add: jest.fn(),
      getPending: jest.fn().mockResolvedValue([]),
      updateStatus: jest.fn(),
      getCount: jest.fn(),
      getTodayStats: jest.fn(),
      getLatestEvent: jest.fn(),
      getHistory: jest.fn(),
    } as any;

    // sendFn のモック（デフォルトは成功）
    mockSendFn = jest.fn().mockResolvedValue({
      success: true,
      serverReceipt: true,
    });

    // タイマーをモック化
    jest.useFakeTimers();
  });

  afterEach(() => {
    // タイマーをクリア
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  // ==========================================
  // コンストラクタのテスト
  // ==========================================
  describe("constructor()", () => {
    it("✅ デフォルト設定が適用される", () => {
      worker = new SyncWorker({
        queue: mockQueue,
        sendFn: mockSendFn,
      });

      expect(worker).toBeDefined();
    });

    it("✅ カスタム設定が適用される", () => {
      worker = new SyncWorker({
        queue: mockQueue,
        sendFn: mockSendFn,
        intervalMs: 60000,
        maxRetries: 10,
      });

      expect(worker).toBeDefined();
    });
  });

  // ==========================================
  // start() メソッドのテスト
  // ==========================================
  describe("start()", () => {
    beforeEach(() => {
      worker = new SyncWorker({
        queue: mockQueue,
        sendFn: mockSendFn,
        intervalMs: 30000,
      });
    });

    it("✅ ワーカーが開始され、タイマーがスケジュールされる", () => {
      worker.start();

      // タイマーがセットされたことを確認
      expect(jest.getTimerCount()).toBe(1);
    });

    it("✅ 既に開始済みの場合、2回目のstart()は無視される", () => {
      worker.start();
      worker.start();

      // タイマーは1つだけ
      expect(jest.getTimerCount()).toBe(1);
    });

    it("✅ intervalMs後にsyncNow()が自動実行される", async () => {
      const mockEvent = createMockEvent();
      mockQueue.getPending.mockResolvedValue([mockEvent]);

      worker.start();

      // 30秒進める
      await jest.advanceTimersByTimeAsync(30000);

      // syncNow()が実行され、getPending()が呼ばれる
      expect(mockQueue.getPending).toHaveBeenCalledTimes(1);
      expect(mockSendFn).toHaveBeenCalledWith(mockEvent);
    });

    it("✅ タイマーは繰り返しスケジュールされる", async () => {
      mockQueue.getPending.mockResolvedValue([]);

      worker.start();

      // 30秒 × 3回進める
      await jest.advanceTimersByTimeAsync(30000);
      expect(mockQueue.getPending).toHaveBeenCalledTimes(1);

      await jest.advanceTimersByTimeAsync(30000);
      expect(mockQueue.getPending).toHaveBeenCalledTimes(2);

      await jest.advanceTimersByTimeAsync(30000);
      expect(mockQueue.getPending).toHaveBeenCalledTimes(3);
    });
  });

  // ==========================================
  // stop() メソッドのテスト
  // ==========================================
  describe("stop()", () => {
    beforeEach(() => {
      worker = new SyncWorker({
        queue: mockQueue,
        sendFn: mockSendFn,
        intervalMs: 30000,
      });
    });

    it("✅ ワーカーが停止され、タイマーがクリアされる", () => {
      worker.start();
      expect(jest.getTimerCount()).toBe(1);

      worker.stop();

      // タイマーがクリアされる
      expect(jest.getTimerCount()).toBe(0);
    });

    it("✅ stop()後は次の同期がスケジュールされない", async () => {
      mockQueue.getPending.mockResolvedValue([createMockEvent()]);

      worker.start();

      // 30秒進める（1回目のsyncNow実行）
      await jest.advanceTimersByTimeAsync(30000);
      expect(mockQueue.getPending).toHaveBeenCalledTimes(1);

      // 停止
      worker.stop();

      // さらに30秒進めても、syncNowは実行されない
      await jest.advanceTimersByTimeAsync(30000);
      expect(mockQueue.getPending).toHaveBeenCalledTimes(1); // 増えない
    });

    it("✅ 開始前にstop()を呼んでもエラーにならない", () => {
      expect(() => worker.stop()).not.toThrow();
    });

    it("✅ stop()を2回呼んでもエラーにならない", () => {
      worker.start();
      worker.stop();

      expect(() => worker.stop()).not.toThrow();
    });
  });

  // ==========================================
  // syncNow() メソッドのテスト
  // ==========================================
  describe("syncNow()", () => {
    beforeEach(() => {
      worker = new SyncWorker({
        queue: mockQueue,
        sendFn: mockSendFn,
        maxRetries: 5,
      });
    });

    // ==========================================
    // 正常系: 送信成功
    // ==========================================
    it("✅ 【正常系】pending状態のイベントが送信成功する", async () => {
      const mockEvent = createMockEvent({
        transport: { status: "pending", attempts: 0, idempotencyKey: "key-001" },
      });

      mockQueue.getPending.mockResolvedValue([mockEvent]);
      mockSendFn.mockResolvedValue({ success: true, serverReceipt: true });

      const result = await worker.syncNow();

      expect(result.sent).toBe(1);
      expect(result.failed).toBe(0);

      // 送信成功時: statusが"sent"、attemptsが+1
      expect(mockQueue.updateStatus).toHaveBeenCalledWith(
        "event-001",
        "sent",
        1
      );
    });

    it("✅ 【正常系】複数のイベントが順次送信される", async () => {
      const event1 = createMockEvent({ id: "event-001" });
      const event2 = createMockEvent({ id: "event-002" });
      const event3 = createMockEvent({ id: "event-003" });

      mockQueue.getPending.mockResolvedValue([event1, event2, event3]);
      mockSendFn.mockResolvedValue({ success: true, serverReceipt: true });

      const result = await worker.syncNow();

      expect(result.sent).toBe(3);
      expect(result.failed).toBe(0);

      expect(mockSendFn).toHaveBeenCalledTimes(3);
      expect(mockQueue.updateStatus).toHaveBeenCalledTimes(3);
    });

    it("✅ 【正常系】pending状態がない場合、何もしない", async () => {
      mockQueue.getPending.mockResolvedValue([]);

      const result = await worker.syncNow();

      expect(result.sent).toBe(0);
      expect(result.failed).toBe(0);
      expect(mockSendFn).not.toHaveBeenCalled();
      expect(mockQueue.updateStatus).not.toHaveBeenCalled();
    });

    // ==========================================
    // 異常系: 送信失敗（リトライ可能）
    // ==========================================
    it("⚠️ 【リトライ可能】送信失敗 + attempts < maxRetries → pending", async () => {
      const mockEvent = createMockEvent({
        transport: { status: "pending", attempts: 1, idempotencyKey: "key-001" },
      });

      mockQueue.getPending.mockResolvedValue([mockEvent]);
      mockSendFn.mockRejectedValue(new Error("Network error"));

      const result = await worker.syncNow();

      expect(result.sent).toBe(0);
      expect(result.failed).toBe(0); // まだfailedにはならない

      // attemptsが+1され、statusはpendingのまま
      expect(mockQueue.updateStatus).toHaveBeenCalledWith(
        "event-001",
        "pending",
        2,
        "Network error"
      );
    });

    it("❌ 【リトライ不可】送信失敗 + attempts >= maxRetries → failed", async () => {
      const mockEvent = createMockEvent({
        transport: { status: "pending", attempts: 4, idempotencyKey: "key-001" },
      });

      mockQueue.getPending.mockResolvedValue([mockEvent]);
      mockSendFn.mockRejectedValue(new Error("Network error"));

      const result = await worker.syncNow();

      expect(result.sent).toBe(0);
      expect(result.failed).toBe(1);

      // attemptsが+1（5回目）され、statusがfailedになる
      expect(mockQueue.updateStatus).toHaveBeenCalledWith(
        "event-001",
        "failed",
        5,
        "Network error"
      );
    });

    it("❌ 【リトライ不可】送信失敗 + attempts === maxRetries - 1 → failed", async () => {
      const mockEvent = createMockEvent({
        transport: { status: "pending", attempts: 4, idempotencyKey: "key-001" },
      });

      mockQueue.getPending.mockResolvedValue([mockEvent]);
      mockSendFn.mockRejectedValue(new Error("Server unreachable"));

      const result = await worker.syncNow();

      expect(result.sent).toBe(0);
      expect(result.failed).toBe(1);

      // 5回目の試行で失敗 → failed
      expect(mockQueue.updateStatus).toHaveBeenCalledWith(
        "event-001",
        "failed",
        5,
        "Server unreachable"
      );
    });

    // ==========================================
    // 異常系: サーバーが受領を確認できない
    // ==========================================
    it("❌ 【サーバー未受領】success: true + serverReceipt: false → エラー", async () => {
      const mockEvent = createMockEvent({
        transport: { status: "pending", attempts: 0, idempotencyKey: "key-001" },
      });

      mockQueue.getPending.mockResolvedValue([mockEvent]);
      mockSendFn.mockResolvedValue({ success: true, serverReceipt: false });

      const result = await worker.syncNow();

      expect(result.sent).toBe(0);
      expect(result.failed).toBe(0); // リトライ可能

      // エラーメッセージが記録される
      expect(mockQueue.updateStatus).toHaveBeenCalledWith(
        "event-001",
        "pending",
        1,
        "サーバーが受領を確認できませんでした"
      );
    });

    it("❌ 【サーバー未受領】success: false + serverReceipt: false → エラー", async () => {
      const mockEvent = createMockEvent({
        transport: { status: "pending", attempts: 0, idempotencyKey: "key-001" },
      });

      mockQueue.getPending.mockResolvedValue([mockEvent]);
      mockSendFn.mockResolvedValue({ success: false, serverReceipt: false });

      const result = await worker.syncNow();

      expect(result.sent).toBe(0);
      expect(result.failed).toBe(0);

      // エラーメッセージが記録される
      expect(mockQueue.updateStatus).toHaveBeenCalledWith(
        "event-001",
        "pending",
        1,
        "サーバーが受領を確認できませんでした"
      );
    });

    // ==========================================
    // エラーハンドリング: 不明なエラー
    // ==========================================
    it("⚠️ 【エラー型不明】非Errorオブジェクトの例外 → 不明なエラー", async () => {
      const mockEvent = createMockEvent({
        transport: { status: "pending", attempts: 0, idempotencyKey: "key-001" },
      });

      mockQueue.getPending.mockResolvedValue([mockEvent]);
      mockSendFn.mockRejectedValue("Something went wrong");

      const result = await worker.syncNow();

      expect(result.sent).toBe(0);
      expect(result.failed).toBe(0);

      // エラーメッセージが"不明なエラー"
      expect(mockQueue.updateStatus).toHaveBeenCalledWith(
        "event-001",
        "pending",
        1,
        "不明なエラー"
      );
    });

    // ==========================================
    // リトライロジックの境界値テスト
    // ==========================================
    it("⚠️ 【境界値】attempts = 0 → pending（リトライ可）", async () => {
      const mockEvent = createMockEvent({
        transport: { status: "pending", attempts: 0, idempotencyKey: "key-001" },
      });

      mockQueue.getPending.mockResolvedValue([mockEvent]);
      mockSendFn.mockRejectedValue(new Error("Temporary failure"));

      await worker.syncNow();

      expect(mockQueue.updateStatus).toHaveBeenCalledWith(
        "event-001",
        "pending",
        1,
        "Temporary failure"
      );
    });

    it("⚠️ 【境界値】attempts = 3 → pending（リトライ可）", async () => {
      const mockEvent = createMockEvent({
        transport: { status: "pending", attempts: 3, idempotencyKey: "key-001" },
      });

      mockQueue.getPending.mockResolvedValue([mockEvent]);
      mockSendFn.mockRejectedValue(new Error("Still failing"));

      await worker.syncNow();

      expect(mockQueue.updateStatus).toHaveBeenCalledWith(
        "event-001",
        "pending",
        4,
        "Still failing"
      );
    });

    it("❌ 【境界値】attempts = 4（maxRetries直前） → failed", async () => {
      const mockEvent = createMockEvent({
        transport: { status: "pending", attempts: 4, idempotencyKey: "key-001" },
      });

      mockQueue.getPending.mockResolvedValue([mockEvent]);
      mockSendFn.mockRejectedValue(new Error("Final failure"));

      await worker.syncNow();

      expect(mockQueue.updateStatus).toHaveBeenCalledWith(
        "event-001",
        "failed",
        5,
        "Final failure"
      );
    });

    // ==========================================
    // 複合ケース: 成功・失敗混在
    // ==========================================
    it("⚠️ 【複合】成功1件 + リトライ可能1件 + 失敗1件", async () => {
      const event1 = createMockEvent({ id: "event-001", transport: { status: "pending", attempts: 0, idempotencyKey: "key-001" } });
      const event2 = createMockEvent({ id: "event-002", transport: { status: "pending", attempts: 2, idempotencyKey: "key-002" } });
      const event3 = createMockEvent({ id: "event-003", transport: { status: "pending", attempts: 4, idempotencyKey: "key-003" } });

      mockQueue.getPending.mockResolvedValue([event1, event2, event3]);

      // event1: 成功
      // event2: 失敗（リトライ可）
      // event3: 失敗（maxRetries到達）
      mockSendFn
        .mockResolvedValueOnce({ success: true, serverReceipt: true })
        .mockRejectedValueOnce(new Error("Temporary error"))
        .mockRejectedValueOnce(new Error("Permanent error"));

      const result = await worker.syncNow();

      expect(result.sent).toBe(1);
      expect(result.failed).toBe(1);

      // event1: sent
      expect(mockQueue.updateStatus).toHaveBeenCalledWith("event-001", "sent", 1);

      // event2: pending（リトライ可）
      expect(mockQueue.updateStatus).toHaveBeenCalledWith("event-002", "pending", 3, "Temporary error");

      // event3: failed（maxRetries到達）
      expect(mockQueue.updateStatus).toHaveBeenCalledWith("event-003", "failed", 5, "Permanent error");
    });

    it("✅ 【複合】全件成功", async () => {
      const event1 = createMockEvent({ id: "event-001" });
      const event2 = createMockEvent({ id: "event-002" });

      mockQueue.getPending.mockResolvedValue([event1, event2]);
      mockSendFn.mockResolvedValue({ success: true, serverReceipt: true });

      const result = await worker.syncNow();

      expect(result.sent).toBe(2);
      expect(result.failed).toBe(0);
    });

    it("❌ 【複合】全件失敗（maxRetries到達）", async () => {
      const event1 = createMockEvent({ id: "event-001", transport: { status: "pending", attempts: 4, idempotencyKey: "key-001" } });
      const event2 = createMockEvent({ id: "event-002", transport: { status: "pending", attempts: 4, idempotencyKey: "key-002" } });

      mockQueue.getPending.mockResolvedValue([event1, event2]);
      mockSendFn.mockRejectedValue(new Error("Fatal error"));

      const result = await worker.syncNow();

      expect(result.sent).toBe(0);
      expect(result.failed).toBe(2);
    });
  });

  // ==========================================
  // タイマースケジューリングのテスト
  // ==========================================
  describe("タイマーとスケジューリング", () => {
    it("✅ カスタムintervalMsが適用される", async () => {
      worker = new SyncWorker({
        queue: mockQueue,
        sendFn: mockSendFn,
        intervalMs: 60000, // 60秒
      });

      mockQueue.getPending.mockResolvedValue([]);

      worker.start();

      // 30秒では実行されない
      await jest.advanceTimersByTimeAsync(30000);
      expect(mockQueue.getPending).not.toHaveBeenCalled();

      // 60秒で実行される
      await jest.advanceTimersByTimeAsync(30000);
      expect(mockQueue.getPending).toHaveBeenCalledTimes(1);
    });

    it("✅ syncNow()実行中にエラーが発生しても次の同期はスケジュールされる", async () => {
      worker = new SyncWorker({
        queue: mockQueue,
        sendFn: mockSendFn,
        intervalMs: 30000,
      });

      // 1回目: エラー発生
      mockQueue.getPending.mockRejectedValueOnce(new Error("DB error"));

      // 2回目以降: 正常
      mockQueue.getPending.mockResolvedValue([]);

      // console.errorをモック化してエラーログを検証
      const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();

      worker.start();

      // 30秒進める（1回目: エラー）
      await jest.advanceTimersByTimeAsync(30000);
      expect(consoleErrorSpy).toHaveBeenCalledWith("同期エラー:", expect.any(Error));

      // さらに30秒進める（2回目: 正常）
      await jest.advanceTimersByTimeAsync(30000);
      expect(mockQueue.getPending).toHaveBeenCalledTimes(2);

      consoleErrorSpy.mockRestore();
    });

    it("✅ stop()後にstart()を再度呼ぶと、タイマーが再スケジュールされる", async () => {
      worker = new SyncWorker({
        queue: mockQueue,
        sendFn: mockSendFn,
        intervalMs: 30000,
      });

      mockQueue.getPending.mockResolvedValue([]);

      worker.start();

      // 30秒進める（1回目）
      await jest.advanceTimersByTimeAsync(30000);
      expect(mockQueue.getPending).toHaveBeenCalledTimes(1);

      // 停止
      worker.stop();

      // 30秒進めても実行されない
      await jest.advanceTimersByTimeAsync(30000);
      expect(mockQueue.getPending).toHaveBeenCalledTimes(1);

      // 再開
      worker.start();

      // 30秒進めると実行される
      await jest.advanceTimersByTimeAsync(30000);
      expect(mockQueue.getPending).toHaveBeenCalledTimes(2);
    });
  });

  // ==========================================
  // maxRetriesのテスト
  // ==========================================
  describe("maxRetriesの動作確認", () => {
    it("✅ maxRetries = 3 の場合、3回目の失敗でfailed", async () => {
      worker = new SyncWorker({
        queue: mockQueue,
        sendFn: mockSendFn,
        maxRetries: 3,
      });

      const mockEvent = createMockEvent({
        transport: { status: "pending", attempts: 2, idempotencyKey: "key-001" },
      });

      mockQueue.getPending.mockResolvedValue([mockEvent]);
      mockSendFn.mockRejectedValue(new Error("Error"));

      const result = await worker.syncNow();

      expect(result.failed).toBe(1);
      expect(mockQueue.updateStatus).toHaveBeenCalledWith("event-001", "failed", 3, "Error");
    });

    it("✅ maxRetries = 1 の場合、初回失敗でfailed", async () => {
      worker = new SyncWorker({
        queue: mockQueue,
        sendFn: mockSendFn,
        maxRetries: 1,
      });

      const mockEvent = createMockEvent({
        transport: { status: "pending", attempts: 0, idempotencyKey: "key-001" },
      });

      mockQueue.getPending.mockResolvedValue([mockEvent]);
      mockSendFn.mockRejectedValue(new Error("First failure"));

      const result = await worker.syncNow();

      expect(result.failed).toBe(1);
      expect(mockQueue.updateStatus).toHaveBeenCalledWith("event-001", "failed", 1, "First failure");
    });

    it("✅ maxRetries = 10 の場合、9回目まではpending", async () => {
      worker = new SyncWorker({
        queue: mockQueue,
        sendFn: mockSendFn,
        maxRetries: 10,
      });

      const mockEvent = createMockEvent({
        transport: { status: "pending", attempts: 8, idempotencyKey: "key-001" },
      });

      mockQueue.getPending.mockResolvedValue([mockEvent]);
      mockSendFn.mockRejectedValue(new Error("Still retrying"));

      const result = await worker.syncNow();

      expect(result.failed).toBe(0);
      expect(mockQueue.updateStatus).toHaveBeenCalledWith("event-001", "pending", 9, "Still retrying");
    });
  });

  // ==========================================
  // attemptsカウントのテスト
  // ==========================================
  describe("attemptsカウントの正確性", () => {
    beforeEach(() => {
      worker = new SyncWorker({
        queue: mockQueue,
        sendFn: mockSendFn,
        maxRetries: 5,
      });
    });

    it("✅ 成功時、attemptsが+1される", async () => {
      const mockEvent = createMockEvent({
        transport: { status: "pending", attempts: 2, idempotencyKey: "key-001" },
      });

      mockQueue.getPending.mockResolvedValue([mockEvent]);
      mockSendFn.mockResolvedValue({ success: true, serverReceipt: true });

      await worker.syncNow();

      // attempts: 2 → 3
      expect(mockQueue.updateStatus).toHaveBeenCalledWith("event-001", "sent", 3);
    });

    it("✅ 失敗時（リトライ可）、attemptsが+1される", async () => {
      const mockEvent = createMockEvent({
        transport: { status: "pending", attempts: 1, idempotencyKey: "key-001" },
      });

      mockQueue.getPending.mockResolvedValue([mockEvent]);
      mockSendFn.mockRejectedValue(new Error("Retry me"));

      await worker.syncNow();

      // attempts: 1 → 2
      expect(mockQueue.updateStatus).toHaveBeenCalledWith("event-001", "pending", 2, "Retry me");
    });

    it("✅ 失敗時（failed）、attemptsが+1される", async () => {
      const mockEvent = createMockEvent({
        transport: { status: "pending", attempts: 4, idempotencyKey: "key-001" },
      });

      mockQueue.getPending.mockResolvedValue([mockEvent]);
      mockSendFn.mockRejectedValue(new Error("Max retries"));

      await worker.syncNow();

      // attempts: 4 → 5
      expect(mockQueue.updateStatus).toHaveBeenCalledWith("event-001", "failed", 5, "Max retries");
    });
  });

  // ==========================================
  // エッジケース
  // ==========================================
  describe("エッジケース", () => {
    beforeEach(() => {
      worker = new SyncWorker({
        queue: mockQueue,
        sendFn: mockSendFn,
        maxRetries: 5,
      });
    });

    it("✅ getPending()が空配列を返しても正常動作", async () => {
      mockQueue.getPending.mockResolvedValue([]);

      const result = await worker.syncNow();

      expect(result.sent).toBe(0);
      expect(result.failed).toBe(0);
      expect(mockSendFn).not.toHaveBeenCalled();
    });

    it("✅ sendFn()がundefinedを返してもエラーにならない", async () => {
      const mockEvent = createMockEvent();

      mockQueue.getPending.mockResolvedValue([mockEvent]);
      mockSendFn.mockResolvedValue(undefined as any);

      const result = await worker.syncNow();

      // success/serverReceiptがfalsy → エラー扱い
      expect(result.sent).toBe(0);
      expect(result.failed).toBe(0);
      expect(mockQueue.updateStatus).toHaveBeenCalledWith(
        "event-001",
        "pending",
        1,
        "Cannot read properties of undefined (reading 'success')"
      );
    });

    it("✅ updateStatus()が失敗してもsyncNow()自体は正常完了", async () => {
      const mockEvent = createMockEvent();

      mockQueue.getPending.mockResolvedValue([mockEvent]);
      mockSendFn.mockResolvedValue({ success: true, serverReceipt: true });
      mockQueue.updateStatus.mockRejectedValue(new Error("DB write failed"));

      // エラーを無視して処理を続行（例外がスローされない）
      await expect(worker.syncNow()).rejects.toThrow("DB write failed");
    });
  });
});
