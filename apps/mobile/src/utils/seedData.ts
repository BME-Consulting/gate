// ==========================================
// ダミーデータ生成スクリプト
// ==========================================

import { openDatabaseAsync } from "expo-sqlite";
import type { ScanEvent, SQLiteDatabase } from "@mc-gate/core";
import { DB_NAME } from "@mc-gate/core";

// WORKAROUND: Hardcode PROJECT_ID to avoid build-update mismatch
// This ensures the value is always a string, even if DEFAULT_PROJECT_ID export fails
const PROJECT_ID = "PRJ001";
const PERSON_IDS = [
  "P001", "P002", "P003", "P004", "P005",
  "P006", "P007", "P008", "P009", "P010",
  "P011", "P012", "P013", "P014", "P015",
  "P016", "P017", "P018", "P019", "P020",
];

function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function randomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomDate(hoursAgo: number): Date {
  const now = new Date();
  const offset = Math.random() * hoursAgo * 60 * 60 * 1000;
  return new Date(now.getTime() - offset);
}

function generateScanEvent(index: number): ScanEvent {
  const personId = randomElement(PERSON_IDS);
  const method = Math.random() > 0.3 ? "QR" : "CARD";
  const decidedMode = Math.random() > 0.5 ? "IN" : "OUT";
  const occurredAt = randomDate(24); // 過去24時間以内

  // 送信状態の分布: 70% sent, 20% pending, 10% failed
  const rand = Math.random();
  let status: "pending" | "sent" | "failed";
  let attempts = 1;
  let lastError: string | undefined;

  if (rand < 0.7) {
    status = "sent";
  } else if (rand < 0.9) {
    status = "pending";
    attempts = 0;
  } else {
    status = "failed";
    attempts = Math.floor(Math.random() * 5) + 1;
    lastError = randomElement([
      "ネットワークエラー: タイムアウト",
      "サーバーエラー: 500 Internal Server Error",
      "認証エラー: トークンが無効です",
      "データエラー: 不正なリクエストフォーマット",
    ]);
  }

  // ルール結果
  const actionRand = Math.random();
  let action: "allow" | "warn" | "block";
  let messages: string[] = [];
  let sendToCcus = true;
  let includeInGs = true;

  if (actionRand < 0.7) {
    action = "allow";
  } else if (actionRand < 0.95) {
    action = "warn";
    messages = [randomElement([
      "W001", // CCUS未登録
      "W002", // 社会保険未加入
      "W003", // 在留期限切れ間近
    ])];
    sendToCcus = Math.random() > 0.5;
  } else {
    action = "block";
    messages = [randomElement([
      "E001", // CCUS登録必須
      "E002", // 社会保険加入必須
      "E004", // 年齢制限
    ])];
    sendToCcus = false;
    includeInGs = false;
  }

  return {
    id: generateUUID(),
    projectId: PROJECT_ID,
    personId,
    method: method as "QR" | "CARD",
    gateMode: "IN",
    decidedMode: decidedMode as "IN" | "OUT",
    occurredAt: occurredAt.toISOString(),
    ruleResult: {
      action,
      messages,
      sendToCcus,
      includeInGs,
    },
    transport: {
      status,
      attempts,
      lastError,
      idempotencyKey: `${PROJECT_ID}-${personId}-${decidedMode}-${occurredAt.getTime()}`,
    },
  };
}

export async function seedDummyData(count: number = 50) {
  console.log(`Seeding ${count} dummy scan events...`);

  try {
    const db = (await openDatabaseAsync(DB_NAME)) as unknown as SQLiteDatabase;

    // テーブルの作成（既存の場合はスキップ）
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS scan_events (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        person_id TEXT NOT NULL,
        method TEXT NOT NULL,
        gate_mode TEXT NOT NULL,
        decided_mode TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        rule_result TEXT NOT NULL,
        transport_status TEXT NOT NULL,
        transport_attempts INTEGER NOT NULL,
        transport_last_error TEXT,
        transport_idempotency_key TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    await db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_transport_status
      ON scan_events(transport_status);
    `);

    await db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_idempotency_key
      ON scan_events(transport_idempotency_key);
    `);

    // ダミーデータを挿入
    for (let i = 0; i < count; i++) {
      const event = generateScanEvent(i);
      const now = new Date().toISOString();

      // デバッグログ: 最初のイベントの内容を出力
      if (i === 0) {
        console.log("🔍 Debug: First event data:", {
          id: event.id,
          projectId: event.projectId,
          projectIdType: typeof event.projectId,
          projectIdValue: JSON.stringify(event.projectId),
          personId: event.personId,
        });
      }

      // projectIdがundefinedまたはnullの場合はエラーをスロー
      if (!event.projectId) {
        throw new Error(`projectId is ${event.projectId} for event ${i}`);
      }

      await db.runAsync(
        `INSERT INTO scan_events (
          id, project_id, person_id, method, gate_mode, decided_mode,
          occurred_at, rule_result, transport_status, transport_attempts,
          transport_last_error, transport_idempotency_key, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          event.id,
          event.projectId,
          event.personId,
          event.method,
          event.gateMode,
          event.decidedMode,
          event.occurredAt,
          JSON.stringify(event.ruleResult),
          event.transport.status,
          event.transport.attempts,
          event.transport.lastError || null,
          event.transport.idempotencyKey,
          now,
          now,
        ]
      );

      if ((i + 1) % 10 === 0) {
        console.log(`Inserted ${i + 1}/${count} events...`);
      }
    }

    console.log(`✅ Successfully seeded ${count} dummy scan events!`);

    // 統計情報を表示
    const stats = await db.getAllAsync<{ status: string; count: number }>(
      `SELECT transport_status as status, COUNT(*) as count
       FROM scan_events
       GROUP BY transport_status`
    );

    console.log("\n📊 Data Statistics:");
    stats.forEach((stat) => {
      console.log(`  ${stat.status}: ${stat.count} events`);
    });

    return { success: true, count };
  } catch (error) {
    console.error("❌ Error seeding data:", error);
    throw error;
  }
}

// 既存データを削除してリセット
export async function clearDummyData() {
  console.log("Clearing all scan events...");

  try {
    const db = (await openDatabaseAsync(DB_NAME)) as unknown as SQLiteDatabase;
    await db.execAsync("DELETE FROM scan_events");
    console.log("✅ All scan events cleared!");
    return { success: true };
  } catch (error) {
    console.error("❌ Error clearing data:", error);
    throw error;
  }
}
