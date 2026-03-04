import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { syncTaskProgressFromLogs, syncMilestoneStatus } from '@/lib/sync-milestone-status'

type RouteContext = { params: Promise<{ id: string }> }

// ─── POST /api/projects/[id]/task-logs — Add task log ───────

interface AddTaskLogBody {
  taskId: string
  userId: string
  logDate: string
  content: string
  nextPlan?: string
  nextPlanDate?: string
}

export async function POST(
  request: NextRequest,
  { params }: RouteContext,
) {
  try {
    const { id } = await params
    const body: AddTaskLogBody = await request.json()

    if (!body.taskId || !body.userId || !body.content?.trim()) {
      return NextResponse.json({ error: '必填欄位不完整' }, { status: 400 })
    }

    const task = await prisma.task.findFirst({
      where: { id: body.taskId, projectId: id },
    })
    if (!task) {
      return NextResponse.json({ error: '找不到該任務' }, { status: 404 })
    }

    const user = await prisma.user.findUnique({
      where: { id: body.userId },
      select: { id: true, name: true },
    })
    if (!user) {
      return NextResponse.json({ error: '找不到使用者' }, { status: 404 })
    }

    const log = await prisma.taskLog.create({
      data: {
        taskId: body.taskId,
        projectId: id,
        authorId: user.id,
        logDate: new Date(body.logDate),
        content: body.content.trim(),
        ...(body.nextPlan?.trim() ? { nextPlan: body.nextPlan.trim() } : {}),
        ...(body.nextPlanDate ? { nextPlanDate: new Date(body.nextPlanDate) } : {}),
      },
      include: { author: true },
    })

    // ── Sync task progress & milestone after adding log ──
    const allLogs = await prisma.taskLog.findMany({
      where: { taskId: body.taskId },
      select: { taskId: true, logDate: true },
    })
    await syncTaskProgressFromLogs([task], allLogs)
    await syncMilestoneStatus(task.milestoneId, id)

    return NextResponse.json({
      id: log.id,
      taskId: log.taskId,
      projectId: id,
      author: log.author.name,
      logDate: log.logDate.toISOString().split('T')[0],
      content: log.content,
      ...(log.nextPlan ? { nextPlan: log.nextPlan } : {}),
      ...(log.nextPlanDate ? { nextPlanDate: log.nextPlanDate.toISOString().split('T')[0] } : {}),
      createdAt: log.createdAt.toISOString(),
    }, { status: 201 })
  } catch (error) {
    console.error('Failed to add task log:', error)
    return NextResponse.json({ error: '新增工作紀錄失敗' }, { status: 500 })
  }
}
