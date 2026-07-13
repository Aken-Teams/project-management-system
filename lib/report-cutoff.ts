// 舊資料寬限（測試區歷史資料相容）
// ─────────────────────────────────────────────────────────────
// 背景：客戶把真實歷史資料「直接匯入」測試區（completedAt / taskLog 皆已建檔），
//       但這些資料從未走過「A 撰寫本週報告 → 送出」流程，因此都沒有 publishedAt。
//       系統改為「一律以 A 送出的報告為主」後，這批舊資料在更新紀錄／甘特最終報告
//       就沒有內容可呈現。
// 作法：以 2026-07-12 00:00（台北）為界。
//       此界線「之前」建檔(createdAt)的紀錄 → 視為已呈現，照舊全部顯示（不需 publishedAt）。
//       此界線「之後」建立的紀錄 → 回到新規則，需 A 送出(publishedAt)才呈現。
// 為何用 createdAt 而非 logDate/weekOf：舊資料的 logDate 是歷史日期、weekOf 全為空，
//       只有「建檔時間」能精準切出「現有匯入資料 vs 未來新資料」這條界線。
export const REPORT_LEGACY_CUTOFF = '2026-07-12T00:00:00+08:00'
const CUTOFF_MS = new Date(REPORT_LEGACY_CUTOFF).getTime()

/**
 * 這筆報告紀錄是否應被呈現／驅動進度。
 * 前後端共用：createdAt / publishedAt 可為 Date 或 ISO 字串。
 */
export function isReportVisible(log: {
  publishedAt?: string | Date | null
  createdAt?: string | Date | null
}): boolean {
  if (log.publishedAt) return true
  if (!log.createdAt) return false
  return new Date(log.createdAt).getTime() < CUTOFF_MS
}
