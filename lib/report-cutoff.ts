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

// ─────────────────────────────────────────────────────────────
// 駁回追蹤起算點（客戶決策 2026-08-27）
// 8/26 以前的駁回不納入「待修正」清單、也不發提醒：那批資料產生時還沒有
// 駁回追蹤與提醒機制，現在才要求 R 回頭補不合理，也會讓清單永遠清不掉。
export const REJECTION_FOLLOWUP_SINCE = '2026-08-27T00:00:00+08:00'
const FOLLOWUP_SINCE_MS = new Date(REJECTION_FOLLOWUP_SINCE).getTime()

/** 這筆駁回要不要納入追蹤（待修正清單／逾期提醒）。 */
export function isRejectionTracked(rejectedAt: string | Date | null | undefined): boolean {
  if (!rejectedAt) return false
  return new Date(rejectedAt).getTime() >= FOLLOWUP_SINCE_MS
}

/** 逾期門檻：超過一週未處理就提醒（週報以週為單位）。 */
export const FOLLOWUP_OVERDUE_DAYS = 7

/** 撤回時限：超過一個月的動作不能撤回，避免甘特與里程碑無預警倒退。 */
export const REVOKE_WINDOW_DAYS = 30

/** 這個時間點的動作還在可撤回的期限內嗎？ */
export function isWithinRevokeWindow(at: string | Date | null | undefined): boolean {
  if (!at) return false
  return Date.now() - new Date(at).getTime() <= REVOKE_WINDOW_DAYS * 86400000
}

/**
 * Prisma where 片段：只取「已進更新紀錄」的報告（已發布，或 7/12 前建檔的舊資料）。
 * 給需要在查詢層就過濾的地方用——例如帶 take:N 的查詢，事後在 JS 濾會讓筆數不足。
 */
export const visibleReportWhere = {
  OR: [
    { publishedAt: { not: null } },
    { createdAt: { lt: new Date(REPORT_LEGACY_CUTOFF) } },
  ],
}
