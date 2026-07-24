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

export interface TreeNodeLike { id: string; parentId?: string | null }

// 由「該成員負責且該追蹤」的任務集合，往上補齊結構祖先，攤平成樹狀順序(DFS)的清單。
// owned=true 表示該任務本身是要追的（顯示已/未填）；owned=false 為結構祖先（僅提供層級脈絡）。
// 兄弟排序沿用 orderedTasks 的既有順序（呼叫端已依 sortOrder 排好）。
export function buildTrackTree<T extends TreeNodeLike>(
  ownedIds: Set<string>, orderedTasks: T[],
): { node: T; depth: number; owned: boolean }[] {
  const byId = new Map(orderedTasks.map(t => [t.id, t]))
  const order = new Map(orderedTasks.map((t, i) => [t.id, i]))
  const showIds = new Set<string>()
  for (const id of ownedIds) {
    if (!byId.has(id)) continue
    showIds.add(id)
    let pid = byId.get(id)!.parentId
    while (pid && byId.has(pid) && !showIds.has(pid)) { showIds.add(pid); pid = byId.get(pid)!.parentId }
  }
  const childrenOf = new Map<string, T[]>()
  const roots: T[] = []
  for (const id of showIds) {
    const t = byId.get(id)!
    if (t.parentId && showIds.has(t.parentId)) {
      const arr = childrenOf.get(t.parentId) ?? childrenOf.set(t.parentId, []).get(t.parentId)!
      arr.push(t)
    } else roots.push(t)
  }
  const byOrder = (a: T, b: T) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)
  const out: { node: T; depth: number; owned: boolean }[] = []
  const walk = (t: T, depth: number) => {
    out.push({ node: t, depth, owned: ownedIds.has(t.id) })
    ;(childrenOf.get(t.id) ?? []).sort(byOrder).forEach(c => walk(c, depth + 1))
  }
  roots.sort(byOrder).forEach(r => walk(r, 0))
  return out
}
