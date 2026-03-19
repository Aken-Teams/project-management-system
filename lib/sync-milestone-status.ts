import { prisma } from '@/lib/db'

/**
 * Recalculate and update a milestone's status & progress based on its tasks.
 *  - All tasks done    → milestone done
 *  - Any task blocked  → milestone blocked
 *  - All tasks todo    → milestone todo
 *  - Otherwise         → milestone in_progress
 *  - Progress = average of task progresses
 */
export async function syncMilestoneStatus(milestoneId: string, projectId: string) {
  // Exclude subtasks (parentId != null) to prevent double-counting
  const tasks = await prisma.task.findMany({
    where: { milestoneId, projectId, parentId: null },
    select: { status: true, progress: true, durationDays: true },
  })

  if (tasks.length === 0) return

  const status = computeMilestoneStatus(tasks)

  // Weighted average by durationDays (e.g. A=10d@100% + B=20d@0% → 33%)
  const totalDays = tasks.reduce((sum, t) => sum + (t.durationDays || 1), 0)
  const progress = totalDays > 0
    ? Math.round(tasks.reduce((sum, t) => sum + t.progress * (t.durationDays || 1), 0) / totalDays)
    : 0

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
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const updatedIds: string[] = []
  const doneTaskIds = new Set(tasks.filter(t => t.status === 'done').map(t => t.id))

  // Build set of task IDs that have at least one log
  const tasksWithLogs = new Set<string>()
  if (taskLogs) {
    for (const log of taskLogs) {
      tasksWithLogs.add(log.taskId)
    }
  }

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

  for (const t of pastStart) {
    if (t.status === 'done') continue

    const depsDone = allDepsDone(t)
    const hasLogs = tasksWithLogs.has(t.id)

    if (depsDone) {
      // No blocking deps → should be in_progress
      if (t.status !== 'in_progress') {
        toInProgress.push(t.id)
      }
    } else if (hasLogs || t.progress > 0) {
      // Deps not done but person has started prep work → in_progress
      if (t.status !== 'in_progress') {
        toInProgress.push(t.id)
      }
    } else {
      // Deps not done, no work done → blocked
      if (t.status !== 'blocked') {
        toBlocked.push(t.id)
      }
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
  taskLogs: { taskId: string; logDate: Date }[],
): Promise<void> {
  const msPerDay = 1000 * 60 * 60 * 24

  // Group all log dates by taskId (we'll filter per-task by endDate later)
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

  for (const task of tasks) {
    const subtasks = subtasksByParent.get(task.id)

    let target: number
    if (task.completedAt) {
      target = 100
    } else if (subtasks && subtasks.length > 0) {
      // Parent task: weighted average of subtask progress by durationDays
      const totalDays = subtasks.reduce((sum, s) => sum + (s.durationDays || 1), 0)
      target = totalDays > 0
        ? Math.round(subtasks.reduce((sum, s) => sum + s.progress * (s.durationDays || 1), 0) / totalDays)
        : 0
    } else {
      // Leaf task: time-position based progress
      // IMPORTANT: Only completedAt grants 100%. Auto-calc caps at 99%.
      // effectiveStart = min(originalStartDate, startDate) — so logs from the
      // original period still count even after delay shifts dates forward.
      // Logs past endDate = overdue work, don't inflate progress.
      const effectiveStart = task.originalStartDate && task.originalStartDate < task.startDate
        ? task.originalStartDate : task.startDate
      const allLogs = logsByTask.get(task.id) || []
      const validLogs = allLogs.filter(d => d >= effectiveStart && d <= task.endDate)
      const latestLog = validLogs.length > 0
        ? validLogs.reduce((a, b) => (a > b ? a : b))
        : null
      if (!latestLog) {
        target = 0
      } else {
        const totalSpan = task.endDate.getTime() - effectiveStart.getTime()
        if (totalSpan <= 0) {
          target = 99
        } else {
          const elapsed = latestLog.getTime() - effectiveStart.getTime()
          target = Math.min(99, Math.max(0, Math.round((elapsed / totalSpan) * 100)))
        }
      }
    }

    if (target !== task.progress) {
      await prisma.task.update({ where: { id: task.id }, data: { progress: target } })
      ;(task as { progress: number }).progress = target
    }
  }
}
