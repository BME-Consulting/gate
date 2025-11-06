// ==========================================
// QRデータパーサー（M1バージョン + Zodバリデーション）
// ==========================================

import { z } from "zod";
import type { WorkerInfo } from "@mc-gate/core";

/**
 * QRコードスキーマ（M1バージョン）
 *
 * フォーマット:
 * M1|personId|name|company|ccusId|socialInsurance|residencyExpiry|age|soleProprietor
 *
 * 例:
 * M1|P001|山田太郎|株式会社ABC|C12345|1||35|0
 */
const qrSchemaM1 = z.tuple([
  z.literal("M1"),
  z.string().min(1, "作業者IDが必要です"),
  z.string().min(1, "氏名が必要です"),
  z.string().min(1, "会社名が必要です"),
  z.string().default(""),
  z.enum(["0", "1"]).transform((v) => v === "1").default("0"),
  z.string().default(""),
  z.string().transform((v) => (v ? parseInt(v, 10) : undefined)).default(""),
  z.enum(["0", "1"]).transform((v) => v === "1").default("0"),
]);

/**
 * QRコードデータをパースして技能者情報を取得
 *
 * @param data QRコードから読み取った文字列
 * @returns WorkerInfo 技能者情報
 * @throws Error パースエラー、URL検出エラー
 */
export function parseQRCode(data: string): WorkerInfo {
  try {
    // URL形式のQRコードを拒否（Expoリンク誤読防止）
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(data)) {
      throw new Error("このQRコードはアプリ用データではありません（URL検出）");
    }

    const parts = data.split("|");

    // 最小フィールド数チェック
    if (parts.length < 9) {
      throw new Error(
        `無効なQRコードフォーマットです（フィールド数不足: ${parts.length}/9）`
      );
    }

    // バージョンチェック
    if (parts[0] !== "M1") {
      throw new Error(
        `サポートされていないQRバージョンです: ${parts[0]}（M1が必要）`
      );
    }

    // Zodでバリデーション
    const parsed = qrSchemaM1.parse(parts);
    const [
      ,
      personId,
      name,
      company,
      ccusId,
      socialInsurance,
      residencyExpiry,
      age,
      isSoleProprietor,
    ] = parsed;

    // CCUS登録状況
    const ccusRegistered = ccusId.length > 0;

    // 在留資格
    let residencyStatus = undefined;
    if (residencyExpiry) {
      // 日付形式チェック（YYYY-MM-DD）
      if (!/^\d{4}-\d{2}-\d{2}$/.test(residencyExpiry)) {
        throw new Error(
          `在留期限の形式が不正です: ${residencyExpiry}（YYYY-MM-DD形式が必要）`
        );
      }
      residencyStatus = {
        expiryDate: residencyExpiry,
        workPermit: true,
      };
    }

    return {
      personId,
      name,
      company,
      ccusId: ccusId || undefined,
      ccusRegistered,
      socialInsurance,
      residencyStatus,
      age,
      healthFlags: undefined, // 将来拡張用
      isSoleProprietor,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstError = error.errors[0];
      throw new Error(
        `QRデータ検証エラー: ${firstError.message} (位置: ${firstError.path.join(".")})`
      );
    }
    throw new Error(
      `QRコードの解析に失敗しました: ${error instanceof Error ? error.message : "不明なエラー"}`
    );
  }
}

/**
 * 旧フォーマット（バージョンなし）のサポート
 *
 * 互換性のため残しておく（非推奨）
 * フォーマット: personId|name|company|ccusId|socialInsurance|residencyExpiry|age|healthFlags|soleProprietor
 */
export function parseQRCodeLegacy(data: string): WorkerInfo {
  console.warn("⚠️ 旧フォーマットのQRコードが検出されました。M1形式への移行を推奨します。");

  const parts = data.split("|");
  if (parts.length < 3) {
    throw new Error("無効なQRコードフォーマットです");
  }

  const [
    personId,
    name,
    company,
    ccusId = "",
    socialInsurance = "0",
    residencyExpiry = "",
    age = "",
    healthFlags = "",
    isSoleProprietor = "0",
  ] = parts;

  const ccusRegistered = ccusId.length > 0;

  let residencyStatus = undefined;
  if (residencyExpiry) {
    residencyStatus = {
      expiryDate: residencyExpiry,
      workPermit: true,
    };
  }

  const healthFlagsArray = healthFlags
    ? healthFlags.split(",").filter((f) => f.length > 0)
    : [];

  return {
    personId,
    name,
    company,
    ccusId: ccusId || undefined,
    ccusRegistered,
    socialInsurance: socialInsurance === "1",
    residencyStatus,
    age: age ? parseInt(age, 10) : undefined,
    healthFlags: healthFlagsArray.length > 0 ? healthFlagsArray : undefined,
    isSoleProprietor: isSoleProprietor === "1",
  };
}
