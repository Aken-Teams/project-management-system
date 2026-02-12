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
 * Works on an in-memory array of tasks (from a prior DB fetch).
 * Returns the IDs of tasks that were updated in the DB.
 */
export async function autoProgressTasks(
  tasks: { id: string; status: string; startDate: Date }[],
): Promise<string[]> {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const stale = tasks.filter(t => t.status === 'todo' && t.startDate <= today)
  if (stale.length === 0) return []

  await prisma.task.updateMany({
    where: { id: { in: stale.map(t => t.id) } },
    data: { status: 'in_progress' },
  })

  return stale.map(t => t.id)
}
