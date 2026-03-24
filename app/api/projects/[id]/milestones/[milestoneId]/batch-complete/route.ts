import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

type RouteContext = { params: Promise<{ id: string; milestoneId: string }> }

// ─── POST /api/projects/[id]/milestones/[milestoneId]/batch-complete
// Mark all incomplete tasks (and subtasks) under this milestone as done

export async function POST(
  request: NextRequest,
  { params }: RouteContext,
) {
  try {
    const { id, milestoneId } = await params
    const body = await request.json()
    const { completedBy } = body as { completedBy?: string }

    // Verify milestone exists
    const milestone = await prisma.milestone.findFirst({
      where: { id: milestoneId, projectId: id },
    })
    if (!milestone) {
      return NextResponse.json({ error: '找不到該里程碑' }, { status: 404 })
    }

    // Find all incomplete tasks under this milestone
    const incompleteTasks = await prisma.task.findMany({
      where: {
        milestoneId,
        projectId: id,
        status: { not: 'done' },
      },
      include: {
        taskLogs: { orderBy: { logDate: 'desc' }, take: 1 },
      },
    })

    if (incompleteTasks.length === 0) {
      return NextResponse.json({ message: '所有任務已完成', updated: 0 })
    }

    // Batch update all incomplete tasks to done
    const now = new Date()
    const updates = incompleteTasks.map(task => {
      // Completion date: use last log date if available, otherwise today
      const lastLogDate = task.taskLogs[0]?.logDate
      const completedAt = lastLogDate
        ? new Date(lastLogDate)
        : now

      return prisma.task.update({
        where: { id: task.id },
        data: {
          status: 'done',
          progress: 100,
          completedAt,
          completedBy: completedBy || null,
        },
      })
    })

    await prisma.$transaction(updates)

    // Also update milestone status and progress
    await prisma.milestone.update({
      where: { id: milestoneId },
      data: {
        status: 'done',
        progress: 100,
      },
    })

    return NextResponse.json({
      message: `已將 ${incompleteTasks.length} 個任務標記為完成`,
      updated: incompleteTasks.length,
    })
  } catch (err) {
    console.error('[batch-complete]', err)
    return NextResponse.json({ error: '批次完成失敗' }, { status: 500 })
  }
}
