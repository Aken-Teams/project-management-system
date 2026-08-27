import { NextRequest, NextResponse } from 'next/server'
import { safeJsonParse } from '@/lib/utils'
import { prisma } from '@/lib/db'
import { syncTaskProgressFromLogs, syncMilestoneStatus } from '@/lib/sync-milestone-status'
import { isReportVisible } from '@/lib/report-cutoff'

type RouteContext = { params: Promise<{ id: string; logId: string }> }

// ─── Helper: re-sync task progress & milestone after log change ──

async function syncAfterLogChange(taskId: string, projectId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, parentId: true, durationDays: true, startDate: true, endDate: true, originalStartDate: true, progress: true, completedAt: true, milestoneId: true, assignee: true },
  })
  if (!task) return

  // 與 task-logs / weekly-report / my-tasks / projects 一致：只有已核准（或 7/12 前的舊資料）才驅動進度
  const allLogs = (await prisma.taskLog.findMany({
    where: { taskId },
    select: { taskId: true, logDate: true, createdAt: true, publishedAt: true, author: { select: { name: true } } },
  })).filter(isReportVisible)
  await syncTaskProgressFromLogs([task], allLogs)
  await syncMilestoneStatus(task.milestoneId, projectId)
}

// ─── PUT /api/projects/[id]/task-logs/[logId] — Update task log ──

interface UpdateTaskLogBody {
  logDate?: string
  content?: string
  nextPlans?: { date?: string; content: string }[] | null
  attachments?: { name: string; url: string; type: 'image' | 'file' }[] | null
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
    if (body.nextPlans !== undefined) {
      const validPlans = body.nextPlans?.filter(p => p.content.trim()) || []
      data.nextPlans = validPlans.length > 0 ? JSON.stringify(validPlans) : null
    }
    if (body.attachments !== undefined) {
      data.attachments = body.attachments?.length ? JSON.stringify(body.attachments) : null
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: '沒有提供任何更新欄位' }, { status: 400 })
    }

    const updated = await prisma.taskLog.update({
      where: { id: logId },
      data,
      include: { author: true },
    })

    // Sync progress if logDate changed (may affect unique-date count)
    if (body.logDate !== undefined) {
      await syncAfterLogChange(updated.taskId, id)
    }

    return NextResponse.json({
      id: updated.id,
      taskId: updated.taskId,
      projectId: id,
      author: updated.author.name,
      logDate: updated.logDate.toISOString().split('T')[0],
      content: updated.content,
      ...(updated.nextPlans ? { nextPlans: safeJsonParse(updated.nextPlans, [] as unknown[]) } : {}),
      ...(updated.attachments ? { attachments: safeJsonParse(updated.attachments, [] as unknown[]) } : {}),
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

    const taskId = log.taskId
    const wasUnderReview = !log.publishedAt || !!log.reviewerRejectedAt
    await prisma.taskLog.delete({ where: { id: logId } })

    // 刪掉的是「還在審／已被駁回」的報告時，要一併收拾任務上的審核狀態。
    //   駁回紀錄是掛在 log 上的（reviewerRejectedAt/reviewerNote），log 一刪就沒了，
    //   但 task.reportedDoneAt 還在——任務會變成「回報完成了卻從沒填過報告」，
    //   重新回到當責的待辦，執行者的「待修正」也一起清空，等於刪報告就能規避駁回。
    //   （實際踩過：R 被退件後把報告刪掉，該任務就一直掛在當責待辦上。）
    if (wasUnderReview) {
      const task = await prisma.task.findUnique({
        where: { id: taskId },
        select: { reportedDoneAt: true, reportedDoneBy: true, reviewedAt: true, completedAt: true },
      })
      // 當責已確認／已完成的不動——那是既成事實，不該被一次刪除推翻
      if (task?.reportedDoneAt && !task.reviewedAt && !task.completedAt) {
        const left = await prisma.taskLog.count({ where: { taskId, reportOnly: false } })
        if (left === 0) {
          await prisma.task.update({
            where: { id: taskId },
            data: { reportedDoneAt: null, reportedDoneBy: null },
          })
          await prisma.taskReviewEvent.create({
            data: { taskId, projectId: id, type: 'reported_cleared', actor: task.reportedDoneBy || '', note: '報告已刪除，回報完成一併取消' },
          }).catch(() => {})
        }
      }
    }

    // Sync progress after deletion
    await syncAfterLogChange(taskId, id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete task log:', error)
    return NextResponse.json({ error: '刪除工作紀錄失敗' }, { status: 500 })
  }
}
