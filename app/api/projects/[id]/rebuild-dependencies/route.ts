import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

type RouteContext = { params: Promise<{ id: string }> }

// ─── POST /api/projects/[id]/rebuild-dependencies — Rebuild sequential task dependencies ───

export async function POST(
  _request: NextRequest,
  { params }: RouteContext,
) {
  try {
    const { id } = await params

    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        milestones: { orderBy: { sortOrder: 'asc' } },
        tasks: { orderBy: { sortOrder: 'asc' } },
      },
    })
    if (!project) {
      return NextResponse.json({ error: '找不到專案' }, { status: 404 })
    }

    if (project.tasks.length < 2) {
      // Nothing to link — clear any stale deps
      await prisma.taskDependency.deleteMany({
        where: { dependent: { projectId: id } },
      })
      return NextResponse.json({ success: true, created: 0 })
    }

    await prisma.$transaction(async (tx) => {
      // 1. Delete all existing dependencies for this project's tasks
      const taskIds = project.tasks.map(t => t.id)
      await tx.taskDependency.deleteMany({
        where: {
          OR: [
            { dependentId: { in: taskIds } },
            { prerequisiteId: { in: taskIds } },
          ],
        },
      })

      // 2. Group parent tasks by milestone (skip subtasks — they don't
      //    participate in the sequential dependency chain)
      const tasksByMilestone = new Map<string, typeof project.tasks>()
      for (const task of project.tasks) {
        if (task.parentId) continue // subtasks are internal to their parent
        const list = tasksByMilestone.get(task.milestoneId) || []
        list.push(task)
        tasksByMilestone.set(task.milestoneId, list)
      }

      // 3. Rebuild sequential dependencies
      const orderedMilestoneIds = project.milestones.map(m => m.id)
      let prevMilestoneLastTask: (typeof project.tasks)[number] | null = null

      for (const msId of orderedMilestoneIds) {
        const msTasks = tasksByMilestone.get(msId)
        if (!msTasks || msTasks.length === 0) continue

        // Cross-milestone: last task of prev milestone → first task of this milestone
        if (prevMilestoneLastTask) {
          await tx.taskDependency.create({
            data: {
              dependentId: msTasks[0].id,
              prerequisiteId: prevMilestoneLastTask.id,
            },
          })
        }

        // Within milestone: sequential chain
        for (let i = 1; i < msTasks.length; i++) {
          await tx.taskDependency.create({
            data: {
              dependentId: msTasks[i].id,
              prerequisiteId: msTasks[i - 1].id,
            },
          })
        }

        prevMilestoneLastTask = msTasks[msTasks.length - 1]
      }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to rebuild dependencies:', error)
    return NextResponse.json({ error: '重建相依關係失敗' }, { status: 500 })
  }
}
