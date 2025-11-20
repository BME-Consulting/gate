// ==========================================
// ダミーデータ生成スクリプト（execAsync版）
// ==========================================

import { Alert } from "react-native";
import { openDatabaseAsync } from "expo-sqlite";
import Constants from "expo-constants";
import type { ScanEvent, SQLiteDatabase } from "@mc-gate/core";

// 定数取得用ヘルパー関数（トップレベルでのアクセスを回避）
function getProjectId(): string {
  const configProjectId = Constants.expoConfig?.extra?.defaultProjectId;
  return (typeof configProjectId === "string" && configProjectId) ? configProjectId : "PRJ001";
}

function getDbName(): string {
  return Constants.expoConfig?.extra?.dbName || "mc-gate.db";
}

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

/**
 * SQLエスケープ関数
 * シングルクォートをエスケープして、SQLインジェクションを防ぐ
 */
function escapeSQLString(str: string | null | undefined): string {
  if (str === null || str === undefined) {
    return "NULL";
  }
  // シングルクォートを2つ重ねてエスケープ
  return `'${String(str).replace(/'/g, "''")}'`;
}

function generateScanEvent(index: number): ScanEvent {
  const personId = randomElement(PERSON_IDS);
  const method = Math.random() > 0.3 ? "QR" : "CARD";
  const decidedMode = Math.random() > 0.5 ? "IN" : "OUT";
  const projectId = getProjectId();

  // 今日(00:00:00)から現在時刻までのランダムな時刻を生成
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const now = new Date();
  const todayMs = today.getTime();
  const nowMs = now.getTime();
  const randomMs = todayMs + Math.random() * (nowMs - todayMs);
  const occurredAt = new Date(randomMs);

  // すべて送信済み(sent)として生成
  // これにより統計画面で正しくカウントされる
  const status: "pending" | "sent" | "failed" = "sent";
  const attempts = 1;
  const lastError: string | undefined = undefined;

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
    projectId: projectId,
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
      idempotencyKey: `${projectId}-${personId}-${decidedMode}-${occurredAt.getTime()}`,
    },
  };
}

/**
 * ScanEventからINSERT文を生成（execAsync用）
 */
function generateInsertSQL(event: ScanEvent): string {
  const now = new Date().toISOString();

  // lastErrorがundefinedの場合はNULLを使用
  const lastErrorValue = event.transport.lastError !== undefined
    ? escapeSQLString(event.transport.lastError)
    : "NULL";

  return `INSERT INTO scan_events (
    id, project_id, person_id, method, gate_mode, decided_mode,
    occurred_at, rule_result, transport_status, transport_attempts,
    transport_last_error, transport_idempotency_key, created_at, updated_at
  ) VALUES (
    ${escapeSQLString(event.id)},
    ${escapeSQLString(event.projectId)},
    ${escapeSQLString(event.personId)},
    ${escapeSQLString(event.method)},
    ${escapeSQLString(event.gateMode)},
    ${escapeSQLString(event.decidedMode)},
    ${escapeSQLString(event.occurredAt)},
    ${escapeSQLString(JSON.stringify(event.ruleResult))},
    ${escapeSQLString(event.transport.status)},
    ${event.transport.attempts},
    ${lastErrorValue},
    ${escapeSQLString(event.transport.idempotencyKey)},
    ${escapeSQLString(now)},
    ${escapeSQLString(now)}
  );`;
}

export async function seedDummyData(count: number = 50) {
  console.log(`Seeding ${count} dummy scan events using execAsync...`);
  const dbName = getDbName();
  const projectId = getProjectId();

  try {
    const db = (await openDatabaseAsync(dbName)) as unknown as SQLiteDatabase;

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

    // ダミーデータを挿入（バッチ処理）
    const batchSize = 10;
    for (let batchStart = 0; batchStart < count; batchStart += batchSize) {
      const batchEnd = Math.min(batchStart + batchSize, count);
      const insertStatements: string[] = [];

      for (let i = batchStart; i < batchEnd; i++) {
        const event = generateScanEvent(i);
        const insertSQL = generateInsertSQL(event);
        insertStatements.push(insertSQL);

        // 最初のイベントのSQLを表示（デバッグ用）
        if (i === 0) {
          console.log("🔍 Debug: First INSERT SQL:");
          console.log(insertSQL);

          Alert.alert(
            "デバッグ情報（execAsync版）",
            `DB_NAME: ${dbName}\nPROJECT_ID: ${projectId}\n\n最初のSQL:\n${insertSQL.substring(0, 200)}...`,
            [{ text: "OK" }]
          );
        }
      }

      try {
        // バッチ実行（1つのexecAsyncで複数のINSERT文を実行）
        const batchSQL = insertStatements.join("\n");
        await db.execAsync(batchSQL);

        console.log(`Inserted ${batchEnd}/${count} events...`);
      } catch (execError: any) {
        const errorMsg = `execAsync エラー！\n\nエラー: ${execError.message}\n\nDB_NAME: ${dbName}\nPROJECT_ID: ${projectId}\n\nバッチ範囲: ${batchStart}-${batchEnd}`;

        Alert.alert(
          "❌ execAsync エラー",
          errorMsg,
          [{ text: "OK" }]
        );

        throw execError;
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

    Alert.alert(
      "✅ ダミーデータ生成成功",
      `${count}件のスキャンイベントを登録しました！`,
      [{ text: "OK" }]
    );

    return { success: true, count };
  } catch (error) {
    console.error("❌ Error seeding data:", error);
    throw error;
  }
}

// 既存データを削除してリセット
export async function clearDummyData() {
  console.log("Clearing all scan events...");
  const dbName = getDbName();

  try {
    const db = (await openDatabaseAsync(dbName)) as unknown as SQLiteDatabase;
    await db.execAsync("DELETE FROM scan_events");
    console.log("✅ All scan events cleared!");

    Alert.alert(
      "✅ データクリア成功",
      "すべてのスキャンイベントを削除しました",
      [{ text: "OK" }]
    );

    return { success: true };
  } catch (error) {
    console.error("❌ Error clearing data:", error);
    throw error;
  }
}
