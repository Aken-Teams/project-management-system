import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

type RouteContext = { params: Promise<{ id: string; logId: string }> }

// ─── PUT /api/projects/[id]/task-logs/[logId] — Update task log ──

interface UpdateTaskLogBody {
  logDate?: string
  content?: string
}

export async function PUT(
  request: NextRequest,
  { params }: RouteContext,
) {
  try {
    const { id, logId } = await params
    const body: UpdateTaskLogBody = await request.json()

    const log = await prisma.taskLog.findFirst({
      where: { id: logId, projectId: id },
    })
    if (!log) {
      return NextResponse.json({ error: '找不到該工作紀錄' }, { status: 404 })
    }

    const data: Record<string, unknown> = {}
    if (body.content !== undefined) {
      const content = body.content.trim()
      if (!content) return NextResponse.json({ error: '內容不可為空' }, { status: 400 })
      data.content = content
    }
    if (body.logDate !== undefined) {
      data.logDate = new Date(body.logDate)
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: '沒有提供任何更新欄位' }, { status: 400 })
    }

    const updated = await prisma.taskLog.update({
      where: { id: logId },
      data,
      include: { author: true },
    })

    return NextResponse.json({
      id: updated.id,
      taskId: updated.taskId,
      projectId: id,
      author: updated.author.name,
      logDate: updated.logDate.toISOString().split('T')[0],
      content: updated.content,
      createdAt: updated.createdAt.toISOString(),
    })
  } catch (error) {
    console.error('Failed to update task log:', error)
    return NextResponse.json({ error: '更新工作紀錄失敗' }, { status: 500 })
  }
}

// ─── DELETE /api/projects/[id]/task-logs/[logId] — Delete task log ──

export async function DELETE(
  _request: NextRequest,
  { params }: RouteContext,
) {
  try {
    const { id, logId } = await params

    const log = await prisma.taskLog.findFirst({
      where: { id: logId, projectId: id },
    })
    if (!log) {
      return NextResponse.json({ error: '找不到該工作紀錄' }, { status: 404 })
    }

    await prisma.taskLog.delete({ where: { id: logId } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete task log:', error)
    return NextResponse.json({ error: '刪除工作紀錄失敗' }, { status: 500 })
  }
}
