// ==========================================
// MCD3 通門管理 ユーティリティ
// ==========================================

/**
 * 日付をフォーマット
 */
export function formatDate(date: Date | string, format: "date" | "time" | "datetime" = "datetime"): string {
  const d = typeof date === "string" ? new Date(date) : date;

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hour = String(d.getHours()).padStart(2, "0");
  const minute = String(d.getMinutes()).padStart(2, "0");

  switch (format) {
    case "date":
      return `${year}/${month}/${day}`;
    case "time":
      return `${hour}:${minute}`;
    case "datetime":
      return `${year}/${month}/${day} ${hour}:${minute}`;
  }
}

/**
 * 遅延実行
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
