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
