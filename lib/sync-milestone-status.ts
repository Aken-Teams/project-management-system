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
  const tasks = await prisma.task.findMany({
    where: { milestoneId, projectId },
    select: { status: true, progress: true },
  })

  if (tasks.length === 0) return

  const status = computeMilestoneStatus(tasks)
  const progress = Math.round(tasks.reduce((sum, t) => sum + t.progress, 0) / tasks.length)

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

  // ── in_progress → todo: startDate moved to future AND no work done ──
  const toRevert = tasks.filter(t =>
    t.status === 'in_progress' && t.startDate > today && t.progress === 0 && !t.completedAt,
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
 * Compute task progress from task-log coverage:
 *   progress = uniqueLogDates / taskDurationDays × 100  (capped at 100)
 * Completed tasks (completedAt set) are forced to 100%.
 * Works on in-memory arrays; updates DB + patches objects in place.
 */
export async function syncTaskProgressFromLogs(
  tasks: { id: string; startDate: Date; endDate: Date; progress: number; completedAt: Date | null }[],
  taskLogs: { taskId: string; logDate: Date }[],
): Promise<void> {
  const msPerDay = 1000 * 60 * 60 * 24

  for (const task of tasks) {
    let target: number

    if (task.completedAt) {
      target = 100
    } else {
      const durationDays = Math.max(1, Math.round((task.endDate.getTime() - task.startDate.getTime()) / msPerDay) + 1)
      const logDates = new Set(
        taskLogs
          .filter(l => l.taskId === task.id)
          .map(l => l.logDate.toISOString().split('T')[0]),
      )
      target = Math.min(100, Math.round((logDates.size / durationDays) * 100))
    }

    if (target !== task.progress) {
      await prisma.task.update({ where: { id: task.id }, data: { progress: target } })
      ;(task as { progress: number }).progress = target
    }
  }
}
