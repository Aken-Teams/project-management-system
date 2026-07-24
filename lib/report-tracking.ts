// 報告填寫追蹤：A（成員週報）與 R主管（填報追蹤）共用同一套判定，
// 確保「A 追 R 的邏輯」與「R主管 追 R 的邏輯」一模一樣。
//
// 規則：
//  1. 某任務在某週「該填報告」＝ 任務有指派、已開始(startDate ≤ 週日)、且尚未完成
//     (status!=done 且無 completedAt)。→ 逾期未完成也持續每週追，直到任務真的完成。
//  2. 某週「已填」＝ 存在該任務該作者的報告，且報告的填報週(weekOf)＝該週一；
//     舊資料無 weekOf 時，fallback 以 logDate 落在該週判定。
//     報告只要「已送出」即算已填（不論是否已被主管核准/發布）。

/** 由週一(YYYY-MM-DD)推出該週週日(YYYY-MM-DD)。 */
export function weekEndOf(monday: string): string {
  const [y, m, d] = monday.split('-').map(Number)
  const e = new Date(Date.UTC(y, m - 1, d + 6))
  return e.toISOString().slice(0, 10)
}

export interface TrackTaskLike {
  assignee?: string | null
  status?: string | null
  startDate: string
  endDate?: string | null
  completedAt?: string | null
}

export function isTaskComplete(t: TrackTaskLike): boolean {
  return t.status === 'done' || !!t.completedAt
}

/** 該任務在此週是否「該填報告」（逾期未完成也持續追）。 */
export function shouldTrackReport(t: TrackTaskLike, monday: string, weekEnd: string): boolean {
  if (!t.assignee) return false
  if (isTaskComplete(t)) return false
  return t.startDate <= weekEnd
}

/** 此週相對計畫截止是否已逾期（計畫結束日早於本週一）。 */
export function isOverdueForWeek(t: TrackTaskLike, monday: string): boolean {
  return !!t.endDate && t.endDate < monday
}

export interface ReportLogLike {
  weekOf?: string | null
  logDate: string
}

/** 這筆報告是否算「此週已填」（優先看 weekOf，舊資料 fallback logDate）。 */
export function reportCountsForWeek(log: ReportLogLike, monday: string, weekEnd: string): boolean {
  if (log.weekOf) return log.weekOf === monday
  return log.logDate >= monday && log.logDate <= weekEnd
}
