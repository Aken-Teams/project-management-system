import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

type RouteContext = { params: Promise<{ id: string }> }

// ─── POST /api/projects/[id]/task-logs — Add task log ───────

interface AddTaskLogBody {
  taskId: string
  userId: string
  logDate: string
  content: string
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
      },
      include: { author: true },
    })

    return NextResponse.json({
      id: log.id,
      taskId: log.taskId,
      projectId: id,
      author: log.author.name,
      logDate: log.logDate.toISOString().split('T')[0],
      content: log.content,
      createdAt: log.createdAt.toISOString(),
    }, { status: 201 })
  } catch (error) {
    console.error('Failed to add task log:', error)
    return NextResponse.json({ error: '新增工作紀錄失敗' }, { status: 500 })
  }
}
