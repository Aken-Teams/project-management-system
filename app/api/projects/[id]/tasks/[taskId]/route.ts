import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { syncMilestoneStatus } from '@/lib/sync-milestone-status'
import { notifyTaskAssigned } from '@/lib/notifications'
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
  durationDays?: number
  completedBy?: string
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
    if (body.status !== undefined) {
      data.status = body.status as TaskStatus
      if (body.status === 'done') {
        // Use provided completedAt or auto-set when marking done
        if (body.completedAt) {
          data.completedAt = new Date(body.completedAt)
        } else if (!task.completedAt) {
          data.completedAt = new Date()
        }
        if (body.completedBy) {
          data.completedBy = body.completedBy
        }
        data.progress = 100
      } else if (task.status === 'done') {
        // Clearing completedAt/completedBy when un-completing
        data.completedAt = null
        data.completedBy = null
      }
    }
    if (body.progress !== undefined && data.progress === undefined) data.progress = body.progress
    if (body.startDate !== undefined) data.startDate = new Date(body.startDate)
    if (body.endDate !== undefined) data.endDate = new Date(body.endDate)
    if (body.sortOrder !== undefined) data.sortOrder = body.sortOrder
    if (body.durationDays !== undefined) data.durationDays = body.durationDays
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

    // ── Notify new assignee when assignee changes ──
    const newAssignee = data.assignee as string | undefined
    if (newAssignee && newAssignee !== task.assignee && newAssignee.includes('@')) {
      const project = await prisma.project.findUnique({ where: { id }, select: { name: true } })
      if (project) {
        notifyTaskAssigned({
          assigneeEmail: newAssignee,
          taskTitle: updated.title,
          projectId: id,
          projectName: project.name,
        })
      }
    }

    // ── Auto-sync milestone status & progress ──
    const milestoneId = updated.milestoneId ?? task.milestoneId
    if (milestoneId && (data.status !== undefined || data.progress !== undefined || data.milestoneId !== undefined)) {
      await syncMilestoneStatus(milestoneId, id)
      // If task moved to a different milestone, also sync the old one
      if (data.milestoneId !== undefined && task.milestoneId && task.milestoneId !== milestoneId) {
        await syncMilestoneStatus(task.milestoneId, id)
      }
    }

    // ── Auto-sync parent task progress from children ──
    if (task.parentId && (data.status !== undefined || data.progress !== undefined)) {
      const siblings = await prisma.task.findMany({
        where: { parentId: task.parentId },
        select: { status: true, progress: true },
      })
      const avgProgress = Math.round(siblings.reduce((s, t) => s + t.progress, 0) / siblings.length)
      const allDone = siblings.every(t => t.status === 'done')

      const parentUpdate: Record<string, unknown> = { progress: avgProgress }
      if (allDone) {
        parentUpdate.status = 'done'
        parentUpdate.completedAt = new Date()
        parentUpdate.completedBy = 'system'
        parentUpdate.progress = 100
      } else {
        // If parent was auto-completed but children are no longer all done, revert
        const parent = await prisma.task.findUnique({ where: { id: task.parentId }, select: { status: true } })
        if (parent?.status === 'done') {
          parentUpdate.status = 'in_progress'
          parentUpdate.completedAt = null
          parentUpdate.completedBy = null
        }
      }

      const updatedParent = await prisma.task.update({
        where: { id: task.parentId },
        data: parentUpdate,
      })
      await syncMilestoneStatus(milestoneId, id)

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
        durationDays: updated.durationDays,
        progress: updated.progress,
        parentId: updated.parentId || null,
        parentProgress: updatedParent.progress,
        parentStatus: updatedParent.status,
        ...(updated.completedAt ? { completedAt: updated.completedAt.toISOString().slice(0, 10) } : {}),
        ...(updated.completedBy ? { completedBy: updated.completedBy } : {}),
      })
    }

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
      durationDays: updated.durationDays,
      progress: updated.progress,
      parentId: updated.parentId || null,
      ...(updated.completedAt ? { completedAt: updated.completedAt.toISOString().slice(0, 10) } : {}),
      ...(updated.completedBy ? { completedBy: updated.completedBy } : {}),
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

    // Sync milestone after task removal
    if (task.milestoneId) {
      await syncMilestoneStatus(task.milestoneId, id)
    }

    return NextResponse.json({ success: true, message: '任務已刪除' })
  } catch (error) {
    console.error('Failed to remove task:', error)
    return NextResponse.json({ error: '刪除任務失敗' }, { status: 500 })
  }
}
