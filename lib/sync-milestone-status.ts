import { prisma } from '@/lib/db'
import { todayUtc } from '@/lib/date-utils'

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
 * Recalculate and update a milestone's status & progress based on its tasks.
 *  - All tasks done    → milestone done
 *  - Any task blocked  → milestone blocked
 *  - All tasks todo    → milestone todo
 *  - Otherwise         → milestone in_progress
 *  - Progress = average of task progresses
 */
export async function syncMilestoneStatus(milestoneId: string, projectId: string) {
  // 新模型：里程碑聚合「葉任務」(實際有人做的最底層)，不再用頂層父任務
  //  —— 因父任務進度現在只反映它自己的報告(可能 0)，用它彙整會失真。
  const msTasks = await prisma.task.findMany({
    where: { milestoneId, projectId },
    select: { id: true, status: true, progress: true, durationDays: true },
  })
  if (msTasks.length === 0) return

  const parentIds = new Set(
    (await prisma.task.findMany({ where: { projectId, parentId: { not: null } }, select: { parentId: true } }))
      .map(t => t.parentId),
  )
  const leaves = msTasks.filter(t => !parentIds.has(t.id))
  const basis = leaves.length > 0 ? leaves : msTasks

  const status = computeMilestoneStatus(basis)
  const progress = computeWeightedProgress(basis)

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
  tasks: { id: string; parentId?: string | null; durationDays?: number; startDate: Date; endDate: Date; originalStartDate?: Date | null; progress: number; completedAt: Date | null }[],
  taskLogs: { taskId: string; logDate: Date; reportOnly?: boolean }[],
): Promise<void> {
  const msPerDay = 1000 * 60 * 60 * 24

  // Group all log dates by taskId (we'll filter per-task by endDate later).
  // 報告日期→時間推算進度：A 的報告 log 也算（reportOnly 不再被略過）。
  const logsByTask = new Map<string, Date[]>()
  for (const log of taskLogs) {
    const list = logsByTask.get(log.taskId) || []
    list.push(log.logDate)
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

  for (const task of ordered) {
    let target: number
    if (task.completedAt) {
      target = 100
    } else {
      // 新模型：每個任務（含父層）一律以「自己的報告」推算時間進度，不繼承子層。
      //   父層沒寫自己的報告 → 沒有 log → 0。里程碑才做聚合（見 syncMilestoneStatus）。
      // IMPORTANT: Only completedAt grants 100%. Auto-calc caps at 99%.
      // 提前開工：把基準往前拉到實際最早日，用「涵蓋多少工期」推算 %。
      const plannedStart = task.originalStartDate && task.originalStartDate < task.startDate
        ? task.originalStartDate : task.startDate
      const allLogs = logsByTask.get(task.id) || []
      // 客戶決策（2026-07-10）：「有紀錄就有進度」——不管快逾期/已延期，有報告就算，
      //   不再濾掉逾期紀錄（逾期報告日超過 endDate → 分子>分母 → 封頂 99%）。
      const logsUpToEnd = allLogs
      if (logsUpToEnd.length === 0) {
        target = 0
      } else {
        const earliestLog = logsUpToEnd.reduce((a, b) => (a < b ? a : b))
        // 進度分子上界壓在「今天」：避免誤填未來日期的 log 讓進度瞬間跳到 99%（A-1）。
        //   語意＝進度反映「到今天為止經過多少工期」，不是到某個未來報告日。
        const today = todayUtc()
        const rawLatest = logsUpToEnd.reduce((a, b) => (a > b ? a : b))
        const latestLog = rawLatest > today ? today : rawLatest
        // 提前開工：把基準往前拉到實際最早日，用「涵蓋多少工期」推算 %
        const effStart = earliestLog < plannedStart ? earliestLog : plannedStart
        const totalSpan = task.endDate.getTime() - effStart.getTime()
        target = totalSpan <= 0
          ? 99
          : Math.min(99, Math.max(0, Math.round(((latestLog.getTime() - effStart.getTime()) / totalSpan) * 100)))
      }
    }

    if (target !== task.progress) {
      await prisma.task.update({ where: { id: task.id }, data: { progress: target } })
      ;(task as { progress: number }).progress = target
    }
  }
}
