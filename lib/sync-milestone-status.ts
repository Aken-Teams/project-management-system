import { prisma } from '@/lib/db'

/**
 * Recalculate and update a milestone's status & progress based on its tasks.
 *  - All tasks todo   → milestone todo
 *  - All tasks done   → milestone done
 *  - Otherwise        → milestone in_progress
 *  - Progress = average of task progresses
 */
export async function syncMilestoneStatus(milestoneId: string, projectId: string) {
  const tasks = await prisma.task.findMany({
    where: { milestoneId, projectId },
    select: { status: true, progress: true },
  })

  if (tasks.length === 0) return

  const allDone = tasks.every(t => t.status === 'done')
  const allTodo = tasks.every(t => t.status === 'todo')
  const status = allDone ? 'done' as const
    : allTodo ? 'todo' as const
    : 'in_progress' as const
  const progress = Math.round(tasks.reduce((sum, t) => sum + t.progress, 0) / tasks.length)

  await prisma.milestone.update({
    where: { id: milestoneId },
    data: { status, progress },
  })
}

/**
 * Auto-progress tasks whose startDate has passed but are still 'todo'.
 * Also reverts 'in_progress' → 'todo' when startDate moves to the future
 * AND no real work has been done (progress = 0, not completed).
 * Works on an in-memory array of tasks (from a prior DB fetch).
 * Returns the IDs of tasks that were updated in the DB.
 */
export async function autoProgressTasks(
  tasks: { id: string; status: string; startDate: Date; progress: number; completedAt: Date | null }[],
): Promise<string[]> {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const updatedIds: string[] = []

  // todo → in_progress: startDate has passed
  const toProgress = tasks.filter(t => t.status === 'todo' && t.startDate <= today)
  if (toProgress.length > 0) {
    await prisma.task.updateMany({
      where: { id: { in: toProgress.map(t => t.id) } },
      data: { status: 'in_progress' },
    })
    for (const t of toProgress) {
      ;(t as { status: string }).status = 'in_progress'
    }
    updatedIds.push(...toProgress.map(t => t.id))
  }

  // in_progress → todo: startDate moved to future AND no work done
  const toRevert = tasks.filter(t =>
    t.status === 'in_progress' && t.startDate > today && t.progress === 0 && !t.completedAt
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
