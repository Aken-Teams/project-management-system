import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import type { Priority } from '@prisma/client'

type RouteContext = { params: Promise<{ id: string }> }

// ─── POST /api/projects/[id]/tasks — Add task to project ────

interface AddTaskBody {
  milestoneId: string
  title: string
  description?: string
  assignee?: string
  priority?: string
  startDate: string
  endDate: string
  durationWeeks?: number
}

export async function POST(
  request: NextRequest,
  { params }: RouteContext,
) {
  try {
    const { id } = await params
    const body: AddTaskBody = await request.json()

    const project = await prisma.project.findUnique({ where: { id } })
    if (!project) {
      return NextResponse.json({ error: '找不到專案' }, { status: 404 })
    }

    if (!body.title?.trim()) {
      return NextResponse.json({ error: '任務標題為必填' }, { status: 400 })
    }
    if (!body.milestoneId) {
      return NextResponse.json({ error: '必須指定里程碑' }, { status: 400 })
    }
    if (!body.startDate || !body.endDate) {
      return NextResponse.json({ error: '起訖日期為必填' }, { status: 400 })
    }

    const milestone = await prisma.milestone.findFirst({
      where: { id: body.milestoneId, projectId: id },
    })
    if (!milestone) {
      return NextResponse.json({ error: '找不到該里程碑' }, { status: 404 })
    }

    const maxSort = await prisma.task.aggregate({
      where: { projectId: id, milestoneId: body.milestoneId },
      _max: { sortOrder: true },
    })

    const start = new Date(body.startDate)
    const end = new Date(body.endDate)
    const durationWeeks = body.durationWeeks ?? Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000)))

    const task = await prisma.task.create({
      data: {
        projectId: id,
        milestoneId: body.milestoneId,
        title: body.title.trim(),
        description: body.description?.trim() || '',
        assignee: body.assignee?.trim() || '',
        priority: (body.priority || 'medium') as Priority,
        startDate: start,
        endDate: end,
        durationWeeks,
        sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
      },
    })

    return NextResponse.json({
      id: task.id,
      projectId: id,
      milestoneId: task.milestoneId,
      title: task.title,
      description: task.description,
      assignee: task.assignee,
      status: task.status,
      priority: task.priority,
      startDate: task.startDate.toISOString().slice(0, 10),
      endDate: task.endDate.toISOString().slice(0, 10),
      durationWeeks: task.durationWeeks,
      progress: task.progress,
      dependencies: [],
    }, { status: 201 })
  } catch (error) {
    console.error('Failed to add task:', error)
    return NextResponse.json({ error: '新增任務失敗' }, { status: 500 })
  }
}
