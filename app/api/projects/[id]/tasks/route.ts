import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { notifyTaskAssigned } from '@/lib/notifications'
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
  durationDays?: number
  parentId?: string
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

    // Validate parentId if creating a subtask
    if (body.parentId) {
      const parentTask = await prisma.task.findFirst({
        where: { id: body.parentId, projectId: id },
      })
      if (!parentTask) {
        return NextResponse.json({ error: '找不到父任務' }, { status: 404 })
      }
      if (parentTask.parentId) {
        return NextResponse.json({ error: '子任務不能再建立子任務' }, { status: 400 })
      }
      // Subtask inherits milestoneId from parent
      body.milestoneId = parentTask.milestoneId
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
    const durationDays = body.durationDays ?? Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1)

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
        durationDays,
        sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
        ...(body.parentId ? { parentId: body.parentId } : {}),
      },
    })

    // Notify assignee (fire-and-forget)
    if (task.assignee) {
      notifyTaskAssigned({
        assigneeEmail: task.assignee,
        taskTitle: task.title,
        projectId: id,
        projectName: project.name,
      })
    }

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
      durationDays: task.durationDays,
      progress: task.progress,
      parentId: task.parentId || null,
      dependencies: [],
    }, { status: 201 })
  } catch (error) {
    console.error('Failed to add task:', error)
    return NextResponse.json({ error: '新增任務失敗' }, { status: 500 })
  }
}
