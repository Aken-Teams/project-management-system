import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import type { Priority, TaskStatus } from '@prisma/client'

type RouteContext = { params: Promise<{ id: string; taskId: string }> }

// ─── PUT /api/projects/[id]/tasks/[taskId] — Update task ─────

interface UpdateTaskBody {
  title?: string
  description?: string
  assignee?: string
  priority?: string
  startDate?: string
  endDate?: string
  milestoneId?: string
  status?: string
  progress?: number
  sortOrder?: number
  durationWeeks?: number
}

export async function PUT(
  request: NextRequest,
  { params }: RouteContext,
) {
  try {
    const { id, taskId } = await params
    const body: UpdateTaskBody = await request.json()

    const task = await prisma.task.findFirst({
      where: { id: taskId, projectId: id },
    })
    if (!task) {
      return NextResponse.json({ error: '找不到該任務' }, { status: 404 })
    }

    const data: Record<string, unknown> = {}
    if (body.title !== undefined) {
      const title = body.title.trim()
      if (!title) return NextResponse.json({ error: '任務標題不可為空' }, { status: 400 })
      data.title = title
    }
    if (body.description !== undefined) data.description = body.description.trim()
    if (body.assignee !== undefined) data.assignee = body.assignee.trim()
    if (body.priority !== undefined) data.priority = body.priority as Priority
    if (body.status !== undefined) data.status = body.status as TaskStatus
    if (body.progress !== undefined) data.progress = body.progress
    if (body.startDate !== undefined) data.startDate = new Date(body.startDate)
    if (body.endDate !== undefined) data.endDate = new Date(body.endDate)
    if (body.sortOrder !== undefined) data.sortOrder = body.sortOrder
    if (body.durationWeeks !== undefined) data.durationWeeks = body.durationWeeks
    if (body.milestoneId !== undefined) {
      const ms = await prisma.milestone.findFirst({ where: { id: body.milestoneId, projectId: id } })
      if (!ms) return NextResponse.json({ error: '找不到該里程碑' }, { status: 404 })
      data.milestoneId = body.milestoneId
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: '沒有提供任何更新欄位' }, { status: 400 })
    }

    const updated = await prisma.task.update({
      where: { id: taskId },
      data,
    })

    return NextResponse.json({
      id: updated.id,
      projectId: id,
      milestoneId: updated.milestoneId,
      title: updated.title,
      description: updated.description,
      assignee: updated.assignee,
      status: updated.status,
      priority: updated.priority,
      startDate: updated.startDate.toISOString().slice(0, 10),
      endDate: updated.endDate.toISOString().slice(0, 10),
      durationWeeks: updated.durationWeeks,
      progress: updated.progress,
    })
  } catch (error) {
    console.error('Failed to update task:', error)
    return NextResponse.json({ error: '更新任務失敗' }, { status: 500 })
  }
}

// ─── DELETE /api/projects/[id]/tasks/[taskId] — Remove task ──

export async function DELETE(
  _request: NextRequest,
  { params }: RouteContext,
) {
  try {
    const { id, taskId } = await params

    const task = await prisma.task.findFirst({
      where: { id: taskId, projectId: id },
    })
    if (!task) {
      return NextResponse.json({ error: '找不到該任務' }, { status: 404 })
    }

    await prisma.task.delete({ where: { id: taskId } })

    return NextResponse.json({ success: true, message: '任務已刪除' })
  } catch (error) {
    console.error('Failed to remove task:', error)
    return NextResponse.json({ error: '刪除任務失敗' }, { status: 500 })
  }
}
