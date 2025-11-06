// ==========================================
// Idempotency Helper Functions Unit Tests
// ==========================================

import { makeIdempotencyKey, generateUUID } from "../queue/idempotency";
import type { PersonId, ProjectId, DecidedMode } from "../types/index";

describe("Idempotency Helper Functions", () => {
  // ==========================================
  // makeIdempotencyKey() テスト
  // ==========================================
  describe("makeIdempotencyKey()", () => {
    // ==========================================
    // 正常系: 基本的なキー生成
    // ==========================================
    it("✅ 【正常系】同じパラメータで同じキーが生成される", () => {
      const params = {
        projectId: "PRJ001" as ProjectId,
        personId: "P001" as PersonId,
        decidedMode: "IN" as DecidedMode,
        occurredAt: "2025-11-06T10:30:45.123Z",
      };

      const key1 = makeIdempotencyKey(params);
      const key2 = makeIdempotencyKey(params);

      expect(key1).toBe(key2);
      expect(typeof key1).toBe("string");
      expect(key1.length).toBeGreaterThan(0);
    });

    it("✅ 【正常系】分粒度に丸められる（秒・ミリ秒が無視される）", () => {
      const params1 = {
        projectId: "PRJ001" as ProjectId,
        personId: "P001" as PersonId,
        decidedMode: "IN" as DecidedMode,
        occurredAt: "2025-11-06T10:30:00.000Z",
      };

      const params2 = {
        projectId: "PRJ001" as ProjectId,
        personId: "P001" as PersonId,
        decidedMode: "IN" as DecidedMode,
        occurredAt: "2025-11-06T10:30:59.999Z",
      };

      const key1 = makeIdempotencyKey(params1);
      const key2 = makeIdempotencyKey(params2);

      // 同じ分（10:30）なので同じキーが生成される
      expect(key1).toBe(key2);
    });

    // ==========================================
    // 異常系: パラメータが異なる場合
    // ==========================================
    it("❌ 【異常系】異なるprojectIdで異なるキーが生成される", () => {
      const params1 = {
        projectId: "PRJ001" as ProjectId,
        personId: "P001" as PersonId,
        decidedMode: "IN" as DecidedMode,
        occurredAt: "2025-11-06T10:30:00.000Z",
      };

      const params2 = {
        ...params1,
        projectId: "PRJ002" as ProjectId,
      };

      const key1 = makeIdempotencyKey(params1);
      const key2 = makeIdempotencyKey(params2);

      expect(key1).not.toBe(key2);
    });

    it("❌ 【異常系】異なるpersonIdで異なるキーが生成される", () => {
      const params1 = {
        projectId: "PRJ001" as ProjectId,
        personId: "P001" as PersonId,
        decidedMode: "IN" as DecidedMode,
        occurredAt: "2025-11-06T10:30:00.000Z",
      };

      const params2 = {
        ...params1,
        personId: "P002" as PersonId,
      };

      const key1 = makeIdempotencyKey(params1);
      const key2 = makeIdempotencyKey(params2);

      expect(key1).not.toBe(key2);
    });

    it("❌ 【異常系】異なるdecidedModeで異なるキーが生成される", () => {
      const params1 = {
        projectId: "PRJ001" as ProjectId,
        personId: "P001" as PersonId,
        decidedMode: "IN" as DecidedMode,
        occurredAt: "2025-11-06T10:30:00.000Z",
      };

      const params2 = {
        ...params1,
        decidedMode: "OUT" as DecidedMode,
      };

      const key1 = makeIdempotencyKey(params1);
      const key2 = makeIdempotencyKey(params2);

      expect(key1).not.toBe(key2);
    });

    it("❌ 【異常系】異なる分で異なるキーが生成される", () => {
      const params1 = {
        projectId: "PRJ001" as ProjectId,
        personId: "P001" as PersonId,
        decidedMode: "IN" as DecidedMode,
        occurredAt: "2025-11-06T10:30:00.000Z",
      };

      const params2 = {
        ...params1,
        occurredAt: "2025-11-06T10:31:00.000Z", // 1分後
      };

      const key1 = makeIdempotencyKey(params1);
      const key2 = makeIdempotencyKey(params2);

      expect(key1).not.toBe(key2);
    });

    // ==========================================
    // 境界値: タイムスタンプの境界
    // ==========================================
    it("⚠️ 【境界値】分の境界で異なるキーが生成される", () => {
      const params1 = {
        projectId: "PRJ001" as ProjectId,
        personId: "P001" as PersonId,
        decidedMode: "IN" as DecidedMode,
        occurredAt: "2025-11-06T10:29:59.999Z",
      };

      const params2 = {
        ...params1,
        occurredAt: "2025-11-06T10:30:00.000Z",
      };

      const key1 = makeIdempotencyKey(params1);
      const key2 = makeIdempotencyKey(params2);

      expect(key1).not.toBe(key2);
    });

    it("⚠️ 【境界値】時の境界で異なるキーが生成される", () => {
      const params1 = {
        projectId: "PRJ001" as ProjectId,
        personId: "P001" as PersonId,
        decidedMode: "IN" as DecidedMode,
        occurredAt: "2025-11-06T10:59:59.999Z",
      };

      const params2 = {
        ...params1,
        occurredAt: "2025-11-06T11:00:00.000Z",
      };

      const key1 = makeIdempotencyKey(params1);
      const key2 = makeIdempotencyKey(params2);

      expect(key1).not.toBe(key2);
    });

    it("⚠️ 【境界値】日付の境界で異なるキーが生成される", () => {
      const params1 = {
        projectId: "PRJ001" as ProjectId,
        personId: "P001" as PersonId,
        decidedMode: "IN" as DecidedMode,
        occurredAt: "2025-11-06T23:59:59.999Z",
      };

      const params2 = {
        ...params1,
        occurredAt: "2025-11-07T00:00:00.000Z",
      };

      const key1 = makeIdempotencyKey(params1);
      const key2 = makeIdempotencyKey(params2);

      expect(key1).not.toBe(key2);
    });

    // ==========================================
    // エッジケース: 特殊な値
    // ==========================================
    it("⚠️ 【エッジケース】空文字列のIDでもキーが生成される", () => {
      const params = {
        projectId: "" as ProjectId,
        personId: "" as PersonId,
        decidedMode: "IN" as DecidedMode,
        occurredAt: "2025-11-06T10:30:00.000Z",
      };

      const key = makeIdempotencyKey(params);

      expect(typeof key).toBe("string");
      expect(key.length).toBeGreaterThan(0);
    });

    it("⚠️ 【エッジケース】特殊文字を含むIDでもキーが生成される", () => {
      const params = {
        projectId: "PRJ-001:TEST" as ProjectId,
        personId: "P@001#TEST" as PersonId,
        decidedMode: "IN" as DecidedMode,
        occurredAt: "2025-11-06T10:30:00.000Z",
      };

      const key = makeIdempotencyKey(params);

      expect(typeof key).toBe("string");
      expect(key.length).toBeGreaterThan(0);
    });

    it("⚠️ 【エッジケース】非常に長いIDでもキーが生成される", () => {
      const params = {
        projectId: "A".repeat(1000) as ProjectId,
        personId: "B".repeat(1000) as PersonId,
        decidedMode: "IN" as DecidedMode,
        occurredAt: "2025-11-06T10:30:00.000Z",
      };

      const key = makeIdempotencyKey(params);

      expect(typeof key).toBe("string");
      expect(key.length).toBeGreaterThan(0);
    });

    // ==========================================
    // フォーマット検証
    // ==========================================
    it("✅ 【フォーマット】生成されるキーは36進数の文字列である", () => {
      const params = {
        projectId: "PRJ001" as ProjectId,
        personId: "P001" as PersonId,
        decidedMode: "IN" as DecidedMode,
        occurredAt: "2025-11-06T10:30:00.000Z",
      };

      const key = makeIdempotencyKey(params);

      // 36進数の文字列（0-9, a-z）であることを確認
      expect(key).toMatch(/^[0-9a-z]+$/);
    });

    // ==========================================
    // 実用例: 冪等性の保証
    // ==========================================
    it("✅ 【実用例】同じ人が同じ分に複数回スキャンしても同じキーになる", () => {
      // 10:30:15にスキャン
      const scan1 = {
        projectId: "PRJ001" as ProjectId,
        personId: "P001" as PersonId,
        decidedMode: "IN" as DecidedMode,
        occurredAt: "2025-11-06T10:30:15.123Z",
      };

      // 10:30:45にスキャン（誤操作で再スキャン）
      const scan2 = {
        projectId: "PRJ001" as ProjectId,
        personId: "P001" as PersonId,
        decidedMode: "IN" as DecidedMode,
        occurredAt: "2025-11-06T10:30:45.678Z",
      };

      const key1 = makeIdempotencyKey(scan1);
      const key2 = makeIdempotencyKey(scan2);

      // 同じ分なので同じキー（重複検出可能）
      expect(key1).toBe(key2);
    });

    it("✅ 【実用例】同じ人が異なる分にスキャンすると異なるキーになる", () => {
      // 10:30にスキャン
      const scan1 = {
        projectId: "PRJ001" as ProjectId,
        personId: "P001" as PersonId,
        decidedMode: "IN" as DecidedMode,
        occurredAt: "2025-11-06T10:30:00.000Z",
      };

      // 10:31にスキャン（正常な再入場）
      const scan2 = {
        projectId: "PRJ001" as ProjectId,
        personId: "P001" as PersonId,
        decidedMode: "IN" as DecidedMode,
        occurredAt: "2025-11-06T10:31:00.000Z",
      };

      const key1 = makeIdempotencyKey(scan1);
      const key2 = makeIdempotencyKey(scan2);

      // 異なる分なので異なるキー（別イベントとして記録）
      expect(key1).not.toBe(key2);
    });
  });

  // ==========================================
  // generateUUID() テスト
  // ==========================================
  describe("generateUUID()", () => {
    // ==========================================
    // 正常系: 基本的なUUID生成
    // ==========================================
    it("✅ 【正常系】UUIDが生成される", () => {
      const uuid = generateUUID();

      expect(typeof uuid).toBe("string");
      expect(uuid.length).toBe(36);
    });

    it("✅ 【正常系】RFC4122準拠のフォーマット（8-4-4-4-12）", () => {
      const uuid = generateUUID();

      // UUID v4フォーマット: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

      expect(uuid).toMatch(uuidRegex);
    });

    it("✅ 【正常系】バージョン番号が4である", () => {
      const uuid = generateUUID();

      // 13文字目（0-indexed）がバージョン番号
      const version = uuid.charAt(14);

      expect(version).toBe("4");
    });

    it("✅ 【正常系】バリアント番号が正しい（RFC4122準拠）", () => {
      const uuid = generateUUID();

      // 19文字目（0-indexed）がバリアント番号
      const variant = uuid.charAt(19);

      // RFC4122では8, 9, a, bのいずれか
      expect(["8", "9", "a", "b"]).toContain(variant);
    });

    // ==========================================
    // ユニーク性のテスト
    // ==========================================
    it("✅ 【ユニーク性】連続生成で異なるUUIDが生成される", () => {
      const uuid1 = generateUUID();
      const uuid2 = generateUUID();

      expect(uuid1).not.toBe(uuid2);
    });

    it("✅ 【ユニーク性】100個生成してすべて異なる", () => {
      const uuids = new Set<string>();

      for (let i = 0; i < 100; i++) {
        uuids.add(generateUUID());
      }

      // すべて異なるUUIDが生成されている
      expect(uuids.size).toBe(100);
    });

    it("✅ 【ユニーク性】1000個生成してすべて異なる", () => {
      const uuids = new Set<string>();

      for (let i = 0; i < 1000; i++) {
        uuids.add(generateUUID());
      }

      // すべて異なるUUIDが生成されている
      expect(uuids.size).toBe(1000);
    });

    it("✅ 【ユニーク性】10000個生成してすべて異なる", () => {
      const uuids = new Set<string>();

      for (let i = 0; i < 10000; i++) {
        uuids.add(generateUUID());
      }

      // すべて異なるUUIDが生成されている
      expect(uuids.size).toBe(10000);
    });

    // ==========================================
    // パフォーマンステスト
    // ==========================================
    it("✅ 【パフォーマンス】10000個のUUIDを1秒以内に生成できる", () => {
      const start = Date.now();

      for (let i = 0; i < 10000; i++) {
        generateUUID();
      }

      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(1000);
    });

    // ==========================================
    // フォーマット詳細検証
    // ==========================================
    it("✅ 【フォーマット】小文字の16進数のみ使用される", () => {
      const uuid = generateUUID();

      // ハイフンを除去して16進数チェック
      const hex = uuid.replace(/-/g, "");

      expect(hex).toMatch(/^[0-9a-f]+$/);
      expect(hex).not.toMatch(/[A-F]/); // 大文字は含まれない
    });

    it("✅ 【フォーマット】ハイフンの位置が正しい", () => {
      const uuid = generateUUID();

      // ハイフンの位置: 8, 13, 18, 23
      expect(uuid.charAt(8)).toBe("-");
      expect(uuid.charAt(13)).toBe("-");
      expect(uuid.charAt(18)).toBe("-");
      expect(uuid.charAt(23)).toBe("-");

      // ハイフン以外の位置にハイフンがないことを確認
      const withoutExpectedHyphens =
        uuid.slice(0, 8) +
        uuid.slice(9, 13) +
        uuid.slice(14, 18) +
        uuid.slice(19, 23) +
        uuid.slice(24);

      expect(withoutExpectedHyphens).not.toContain("-");
    });

    // ==========================================
    // 統計的ランダム性のテスト
    // ==========================================
    it("✅ 【ランダム性】生成されるUUIDの各桁が偏っていない", () => {
      const samples = 1000;
      const firstCharCounts: Record<string, number> = {};

      for (let i = 0; i < samples; i++) {
        const uuid = generateUUID();
        const firstChar = uuid.charAt(0);

        firstCharCounts[firstChar] = (firstCharCounts[firstChar] || 0) + 1;
      }

      // 各文字の出現回数が極端に偏っていないことを確認
      // 理論値: 1000回 / 16文字 = 62.5回
      // 許容範囲: 30回〜120回（統計的に十分）
      Object.values(firstCharCounts).forEach((count) => {
        expect(count).toBeGreaterThan(30);
        expect(count).toBeLessThan(120);
      });
    });

    // ==========================================
    // 実用例
    // ==========================================
    it("✅ 【実用例】イベントIDとして使用できる", () => {
      const eventId = generateUUID();

      expect(eventId).toBeTruthy();
      expect(typeof eventId).toBe("string");
      expect(eventId.length).toBe(36);
    });

    it("✅ 【実用例】複数のイベントで異なるIDが生成される", () => {
      const event1Id = generateUUID();
      const event2Id = generateUUID();
      const event3Id = generateUUID();

      expect(event1Id).not.toBe(event2Id);
      expect(event2Id).not.toBe(event3Id);
      expect(event1Id).not.toBe(event3Id);
    });

    it("✅ 【実用例】大量のイベントIDを生成しても衝突しない", () => {
      const eventIds = new Set<string>();
      const count = 10000;

      for (let i = 0; i < count; i++) {
        eventIds.add(generateUUID());
      }

      // 衝突がないことを確認
      expect(eventIds.size).toBe(count);
    });
  });

  // ==========================================
  // 複合テスト: makeIdempotencyKey と generateUUID
  // ==========================================
  describe("複合テスト: makeIdempotencyKey と generateUUID", () => {
    it("✅ 【複合】IdempotencyKeyとUUIDは異なるフォーマットである", () => {
      const params = {
        projectId: "PRJ001" as ProjectId,
        personId: "P001" as PersonId,
        decidedMode: "IN" as DecidedMode,
        occurredAt: "2025-11-06T10:30:00.000Z",
      };

      const idempotencyKey = makeIdempotencyKey(params);
      const uuid = generateUUID();

      // IdempotencyKeyは36進数、UUIDは16進数+ハイフン
      expect(idempotencyKey).not.toContain("-");
      expect(uuid).toContain("-");

      // フォーマットが異なる
      expect(idempotencyKey.length).not.toBe(36);
    });

    it("✅ 【複合】同じイベントに対してIdempotencyKeyとUUIDを両方生成できる", () => {
      const params = {
        projectId: "PRJ001" as ProjectId,
        personId: "P001" as PersonId,
        decidedMode: "IN" as DecidedMode,
        occurredAt: "2025-11-06T10:30:00.000Z",
      };

      // IdempotencyKey: 冪等性保証用（同じ入力→同じキー）
      const idempotencyKey = makeIdempotencyKey(params);

      // UUID: イベントID用（常にユニーク）
      const eventId = generateUUID();

      expect(idempotencyKey).toBeTruthy();
      expect(eventId).toBeTruthy();
      expect(typeof idempotencyKey).toBe("string");
      expect(typeof eventId).toBe("string");
    });

    it("✅ 【複合】IdempotencyKeyは決定的、UUIDはランダム", () => {
      const params = {
        projectId: "PRJ001" as ProjectId,
        personId: "P001" as PersonId,
        decidedMode: "IN" as DecidedMode,
        occurredAt: "2025-11-06T10:30:00.000Z",
      };

      // IdempotencyKeyは同じパラメータで同じキー
      const key1 = makeIdempotencyKey(params);
      const key2 = makeIdempotencyKey(params);
      expect(key1).toBe(key2);

      // UUIDは常に異なる
      const uuid1 = generateUUID();
      const uuid2 = generateUUID();
      expect(uuid1).not.toBe(uuid2);
    });

    it("✅ 【実用例】重複検出とイベント識別の併用", () => {
      // シナリオ: 同じ人が同じ分に2回スキャン

      // 1回目のスキャン
      const scan1 = {
        projectId: "PRJ001" as ProjectId,
        personId: "P001" as PersonId,
        decidedMode: "IN" as DecidedMode,
        occurredAt: "2025-11-06T10:30:15.123Z",
      };
      const idempotencyKey1 = makeIdempotencyKey(scan1);
      const eventId1 = generateUUID();

      // 2回目のスキャン（誤操作）
      const scan2 = {
        projectId: "PRJ001" as ProjectId,
        personId: "P001" as PersonId,
        decidedMode: "IN" as DecidedMode,
        occurredAt: "2025-11-06T10:30:45.678Z",
      };
      const idempotencyKey2 = makeIdempotencyKey(scan2);
      const eventId2 = generateUUID();

      // IdempotencyKeyは同じ（重複検出可能）
      expect(idempotencyKey1).toBe(idempotencyKey2);

      // EventIDは異なる（個別のイベントとして識別可能）
      expect(eventId1).not.toBe(eventId2);
    });
  });
});
