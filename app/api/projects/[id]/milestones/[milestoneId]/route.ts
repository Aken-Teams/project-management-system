import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import type { TaskStatus } from '@prisma/client'

type RouteContext = { params: Promise<{ id: string; milestoneId: string }> }

// ─── PUT /api/projects/[id]/milestones/[milestoneId] — Update milestone ───

interface UpdateMilestoneBody {
  name?: string
  startDate?: string | null
  dueDate?: string
  status?: string
  sortOrder?: number
}

export async function PUT(
  request: NextRequest,
  { params }: RouteContext,
) {
  try {
    const { id, milestoneId } = await params
    const body: UpdateMilestoneBody = await request.json()

    const milestone = await prisma.milestone.findFirst({
      where: { id: milestoneId, projectId: id },
    })
    if (!milestone) {
      return NextResponse.json({ error: '找不到該里程碑' }, { status: 404 })
    }

    const data: Record<string, unknown> = {}
    if (body.name !== undefined) {
      const name = body.name.trim()
      if (!name) {
        return NextResponse.json({ error: '里程碑名稱不可為空' }, { status: 400 })
      }
      data.name = name
    }
    if (body.startDate !== undefined) {
      if (body.startDate === null) {
        data.startDate = null
      } else {
        const sd = new Date(body.startDate)
        if (isNaN(sd.getTime())) {
          return NextResponse.json({ error: '開始日期格式不正確' }, { status: 400 })
        }
        data.startDate = sd
      }
    }
    if (body.dueDate !== undefined) {
      const d = new Date(body.dueDate)
      if (isNaN(d.getTime())) {
        return NextResponse.json({ error: '日期格式不正確' }, { status: 400 })
      }
      data.dueDate = d
    }
    if (body.status !== undefined) data.status = body.status as TaskStatus
    if (body.sortOrder !== undefined) data.sortOrder = body.sortOrder

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: '沒有提供任何更新欄位' }, { status: 400 })
    }

    const updated = await prisma.milestone.update({
      where: { id: milestoneId },
      data,
    })

    return NextResponse.json({
      id: updated.id,
      projectId: id,
      name: updated.name,
      dueDate: updated.dueDate.toISOString().slice(0, 10),
      status: updated.status,
      progress: updated.progress,
      sortOrder: updated.sortOrder,
    })
  } catch (error) {
    console.error('Failed to update milestone:', error)
    return NextResponse.json({ error: '更新里程碑失敗' }, { status: 500 })
  }
}

// ─── DELETE /api/projects/[id]/milestones/[milestoneId] — Remove milestone ──

export async function DELETE(
  _request: NextRequest,
  { params }: RouteContext,
) {
  try {
    const { id, milestoneId } = await params

    const milestone = await prisma.milestone.findFirst({
      where: { id: milestoneId, projectId: id },
      include: { tasks: { select: { id: true } } },
    })
    if (!milestone) {
      return NextResponse.json({ error: '找不到該里程碑' }, { status: 404 })
    }

    if (milestone.tasks.length > 0) {
      return NextResponse.json(
        { error: `此里程碑下仍有 ${milestone.tasks.length} 個任務，請先移除或搬移任務後再刪除` },
        { status: 400 },
      )
    }

    await prisma.milestone.delete({ where: { id: milestoneId } })

    return NextResponse.json({ success: true, message: '里程碑已刪除' })
  } catch (error) {
    console.error('Failed to remove milestone:', error)
    return NextResponse.json({ error: '刪除里程碑失敗' }, { status: 500 })
  }
}
