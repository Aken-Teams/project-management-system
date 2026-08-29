import { prisma } from '@/lib/db'
import { todayUtc } from '@/lib/date-utils'
import { isSameUser } from '@/lib/user-match'

const hasAssignee = (a?: string | null) => !!(a && a.trim() && a.trim() !== '未指派')

/**
 * Weighted progress by durationDays (e.g. A=10d@100% + B=20d@0% → 33%).
 * Single source of truth so milestone/parent progress can't flip-flop between
 * weighted and plain-average across different endpoints. (Bug #2)
 * Empty list or zero total days → 0 (also guards divide-by-zero, Bug #11).
 */
export function computeWeightedProgress(
  items: { progress: number; durationDays?: number | null }[],
): number {
  if (items.length === 0) return 0
  const totalDays = items.reduce((sum, t) => sum + (t.durationDays || 1), 0)
  if (totalDays <= 0) return 0
  return Math.round(
    items.reduce((sum, t) => sum + t.progress * (t.durationDays || 1), 0) / totalDays,
  )
}

/**
 * 里程碑進度聚合：排除「無指派人的父層」(其進度＝子項聚合，純衍生節點；若一起計入會與子項重複加權)。
 * 計入 = 葉任務 ∪ 有指派人的任務(含有押人父層，其自己的報告是獨立訊號)。
 */
export function milestoneCountedTasks<T extends { id: string; parentId?: string | null; assignee?: string | null }>(msTasks: T[]): T[] {
  const parentIds = new Set(msTasks.map(t => t.parentId).filter(Boolean) as string[])
  const counted = msTasks.filter(t => !parentIds.has(t.id) || hasAssignee(t.assignee))
  return counted.length > 0 ? counted : msTasks
}

/** 里程碑加權進度（已排除無指派人父層，避免重複計）。 */
export function computeMilestoneProgress(
  msTasks: { id: string; parentId?: string | null; assignee?: string | null; progress: number; durationDays?: number | null }[],
): number {
  return computeWeightedProgress(milestoneCountedTasks(msTasks))
}

/**
 * Recalculate and update a milestone's status & progress based on its tasks.
 *  - All tasks done    → milestone done
 *  - Any task blocked  → milestone blocked
 *  - All tasks todo    → milestone todo
 *  - Otherwise         → milestone in_progress
 *  - Progress = average of task progresses
 */
export async function syncMilestoneStatus(milestoneId: string, projectId: string) {
  // 客戶決策（2026-07-10）：里程碑 =「所有任務都完成」才 100%。聚合「該里程碑所有層級的任務」
  //   （各看自己進度、依 durationDays 加權），不再只算葉任務。父層自己的報告也計入。
  const msTasks = await prisma.task.findMany({
    where: { milestoneId, projectId },
    select: { id: true, status: true, progress: true, durationDays: true, parentId: true, assignee: true },
  })
  if (msTasks.length === 0) return

  const counted = milestoneCountedTasks(msTasks)
  const status = computeMilestoneStatus(counted)
  const progress = computeWeightedProgress(counted)

  await prisma.milestone.update({
    where: { id: milestoneId },
    data: { status, progress },
  })
}

/**
 * Compute milestone status from task statuses (shared logic).
 */
export function computeMilestoneStatus(
  tasks: { status: string }[],
): 'done' | 'blocked' | 'in_progress' | 'todo' {
  if (tasks.length === 0) return 'todo'
  const allDone = tasks.every(t => t.status === 'done')
  if (allDone) return 'done'
  const anyBlocked = tasks.some(t => t.status === 'blocked')
  if (anyBlocked) return 'blocked'
  const allTodo = tasks.every(t => t.status === 'todo')
  if (allTodo) return 'todo'
  return 'in_progress'
}

/**
 * Auto-progress tasks based on startDate, dependencies, and task logs.
 *
 * Rules:
 *  - todo/blocked → in_progress: startDate passed + (no deps OR all deps done)
 *  - todo/blocked → in_progress: startDate passed + deps NOT done + HAS task logs (prep work)
 *  - todo         → blocked:     startDate passed + deps NOT done + NO task logs
 *  - blocked      → in_progress: deps now all done (regardless of logs)
 *  - in_progress  → todo:        startDate moved to future + progress=0 + not completed
 *
 * Works on in-memory arrays; updates DB + patches objects in place.
 * Returns the IDs of tasks that were updated.
 */
export async function autoProgressTasks(
  tasks: {
    id: string
    status: string
    startDate: Date
    progress: number
    completedAt: Date | null
    dependsOn?: { prerequisiteId: string }[]
  }[],
  taskLogs?: { taskId: string }[],
): Promise<string[]> {
  // UTC-midnight today, matching DB-stored calendar dates (Bug #9)
  const today = todayUtc()

  const updatedIds: string[] = []
  const doneTaskIds = new Set(tasks.filter(t => t.status === 'done').map(t => t.id))

  // A 為主：狀態不再看 R 的 log。進行中只認「A 已發布的進度」(progress>0，已在 syncTaskProgressFromLogs
  //   只用 publishedAt 計算)。taskLogs 參數保留給呼叫端相容，但不再用於狀態判定。

  // Helper: check if all prerequisites are done
  const allDepsDone = (task: typeof tasks[number]) => {
    const deps = task.dependsOn ?? []
    if (deps.length === 0) return true
    return deps.every(d => doneTaskIds.has(d.prerequisiteId))
  }

  // ── Tasks that need status change (startDate has passed, not done) ──
  const pastStart = tasks.filter(t =>
    t.startDate <= today && t.status !== 'done',
  )

  const toInProgress: string[] = []
  const toBlocked: string[] = []
  const toTodoPast: string[] = []   // 相依完成但 A 還沒發布進度 → 待辦（即使 startDate 過了）

  for (const t of pastStart) {
    if (t.status === 'done') continue

    const depsDone = allDepsDone(t)

    // A 為主：
    //  - 進行中 = A 已發布進度(progress>0)（不再因 startDate 過了就自動進行中）
    //  - 受阻   = 無 A 進度 且 相依未完成（保留，讓使用者知道卡在相依）
    //  - 待辦   = 無 A 進度 且 相依完成（startDate 過了也維持待辦）
    if (t.progress > 0) {
      if (t.status !== 'in_progress') toInProgress.push(t.id)
    } else if (!depsDone) {
      if (t.status !== 'blocked') toBlocked.push(t.id)
    } else {
      if (t.status !== 'todo') toTodoPast.push(t.id)
    }
  }

  // Batch update: → in_progress
  if (toInProgress.length > 0) {
    await prisma.task.updateMany({
      where: { id: { in: toInProgress } },
      data: { status: 'in_progress' },
    })
    for (const t of tasks) {
      if (toInProgress.includes(t.id)) {
        ;(t as { status: string }).status = 'in_progress'
      }
    }
    updatedIds.push(...toInProgress)
  }

  // Batch update: → blocked
  if (toBlocked.length > 0) {
    await prisma.task.updateMany({
      where: { id: { in: toBlocked } },
      data: { status: 'blocked' },
    })
    for (const t of tasks) {
      if (toBlocked.includes(t.id)) {
        ;(t as { status: string }).status = 'blocked'
      }
    }
    updatedIds.push(...toBlocked)
  }

  // Batch update: → todo（相依完成但 A 還沒發布進度；startDate 過了也維持待辦，A 為主）
  if (toTodoPast.length > 0) {
    await prisma.task.updateMany({
      where: { id: { in: toTodoPast } },
      data: { status: 'todo' },
    })
    for (const t of tasks) {
      if (toTodoPast.includes(t.id)) {
        ;(t as { status: string }).status = 'todo'
      }
    }
    updatedIds.push(...toTodoPast)
  }

  // ── in_progress/blocked → todo: startDate moved to future AND no work done ──
  const toRevert = tasks.filter(t =>
    (t.status === 'in_progress' || t.status === 'blocked') && t.startDate > today && t.progress === 0 && !t.completedAt,
  )
  if (toRevert.length > 0) {
    await prisma.task.updateMany({
      where: { id: { in: toRevert.map(t => t.id) } },
      data: { status: 'todo' },
    })
    for (const t of toRevert) {
      ;(t as { status: string }).status = 'todo'
    }
    updatedIds.push(...toRevert.map(t => t.id))
  }

  return updatedIds
}

/**
 * Compute task progress from time-position of latest log:
 *   progress = (latestLogDate - startDate) / (endDate - startDate) × 100  (capped at 100)
 * Completed tasks (completedAt set) are forced to 100%.
 * No logs → 0%. latestLogDate before startDate → 0%.
 * Parent tasks with subtasks: progress = weighted avg of subtask progress (by durationDays).
 * Works on in-memory arrays; updates DB + patches objects in place.
 */
export async function syncTaskProgressFromLogs(
  tasks: { id: string; parentId?: string | null; durationDays?: number; startDate: Date; endDate: Date; originalStartDate?: Date | null; progress: number; completedAt: Date | null; assignee?: string | null }[],
  taskLogs: { taskId: string; logDate: Date; reportOnly?: boolean; postDoneSupplement?: boolean; author?: { name?: string | null } | null }[],
): Promise<void> {
  // Group logs (date + 作者名) by taskId — 用來依指派人挑「該由誰的報告算進度」。
  const logsByTask = new Map<string, { date: Date; author: string | null }[]>()
  for (const log of taskLogs) {
    // 完成後補充不參與進度：執行者 8/29 完成、9/2 才補上 8/30 的紀錄，
    //   完成日仍是 8/29。補充只補事實，不改時間軸。
    if (log.postDoneSupplement) continue
    const list = logsByTask.get(log.taskId) || []
    list.push({ date: log.logDate, author: log.author?.name ?? null })
    logsByTask.set(log.taskId, list)
  }

  // Group subtasks by parent
  const subtasksByParent = new Map<string, typeof tasks>()
  for (const t of tasks) {
    if (t.parentId) {
      const list = subtasksByParent.get(t.parentId) || []
      list.push(t)
      subtasksByParent.set(t.parentId, list)
    }
  }

  // ADR-02: process bottom-up (deepest first) so a parent aggregates its children's
  // ALREADY-updated progress — rolls up correctly through any nesting depth.
  const byId = new Map(tasks.map(t => [t.id, t]))
  const depthOf = (t: typeof tasks[number]) => {
    let d = 0
    let cur: typeof tasks[number] | undefined = t
    const seen = new Set<string>()
    while (cur?.parentId && !seen.has(cur.id)) { seen.add(cur.id); d++; cur = byId.get(cur.parentId) }
    return d
  }
  const ordered = [...tasks].sort((a, b) => depthOf(b) - depthOf(a))
  const today = todayUtc()

  for (const task of ordered) {
    let target: number
    if (task.completedAt) {
      target = 100
    } else {
      // 進度來源依「有無指派人」分流（客戶決策 2026-07-26）：
      //   有指派人      → 只算「該指派人(R)」的報告日期覆蓋（A 補充純脈絡，不動進度）。
      //   無指派人・父層 → 子項加權聚合（A 不用額外寫父層 100%）。
      //   無指派人・葉    → 算「A 補充報告」的日期覆蓋（該任務的報告本就出自 A）。
      const assigned = hasAssignee(task.assignee)
      const children = subtasksByParent.get(task.id) || []
      if (!assigned && children.length > 0) {
        target = computeWeightedProgress(children.map(c => ({ progress: c.progress, durationDays: c.durationDays })))
      } else {
        const all = logsByTask.get(task.id) || []
        // 有指派人：只留該指派人寫的 log；無指派人葉：全留（都是 A 的）。
        const relevant = assigned
          ? all.filter(l => l.author && isSameUser(task.assignee!, { name: l.author }))
          : all
        if (relevant.length === 0) {
          target = 0
        } else {
          // 提前開工：把基準往前拉到實際最早日，用「涵蓋多少工期」推算 %；分子上界壓在今天。
          const plannedStart = task.originalStartDate && task.originalStartDate < task.startDate
            ? task.originalStartDate : task.startDate
          const dates = relevant.map(l => l.date)
          const earliestLog = dates.reduce((a, b) => (a < b ? a : b))
          const rawLatest = dates.reduce((a, b) => (a > b ? a : b))
          const latestLog = rawLatest > today ? today : rawLatest
          const effStart = earliestLog < plannedStart ? earliestLog : plannedStart
          const totalSpan = task.endDate.getTime() - effStart.getTime()
          target = totalSpan <= 0
            ? 99
            : Math.min(99, Math.max(0, Math.round(((latestLog.getTime() - effStart.getTime()) / totalSpan) * 100)))
        }
      }
    }

    if (target !== task.progress) {
      await prisma.task.update({ where: { id: task.id }, data: { progress: target } })
      ;(task as { progress: number }).progress = target
    }
  }
}
