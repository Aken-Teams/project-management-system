import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { syncMilestoneStatus } from '@/lib/sync-milestone-status'
import { notifyTaskAssigned, resolveAssignee, notifyReportReviewNeeded, notifyCompletionReopened } from '@/lib/notifications'
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
  parentId?: string | null
  status?: string
  progress?: number
  sortOrder?: number
  durationDays?: number
  completedAt?: string
  completedBy?: string
  completedWeekOf?: string
  manualDates?: boolean
  // R 自我回報「已完成/無後續」：true=設定、false=取消（與 completedAt 正式完成獨立）
  reportedDone?: boolean
  reportedDoneBy?: string
  // 審視歷程事件：reported(R回報) | cancelled(R取消) | confirmed(A確認) | rejected(A退回)
  reviewEvent?: 'reported' | 'cancelled' | 'confirmed' | 'rejected'
  reviewActor?: string
  reviewNote?: string      // 駁回原因等備註
  publishLogs?: boolean    // A 發布此任務紀錄到官方更新紀錄
  reviewedDone?: boolean   // A 審核通過（設 reviewedAt）
  markComplete?: boolean   // A 審核通過＝確認 100% 完成：一併標記 status=done + completedAt（甘特 100% + 完成區）
  reopenNotify?: boolean   // 解除完成時：通知此任務負責人＋所有仍完成的父層負責人（completion_reopened）
  reopenActor?: string     // 操作者姓名（避免通知自己）
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
    if (body.assignee !== undefined) {
      const newAssignee = body.assignee.trim()
      data.assignee = newAssignee
      // 指派對象改變 → 更新指派時刻（R 從這一刻起才在週報看到此任務）
      if (newAssignee !== task.assignee) data.assignedAt = new Date()
    }
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
        // 記「完成時所屬的報告填報週」→ 更新紀錄依此分組（放在 A 送報告那週）
        if (body.completedWeekOf) {
          data.completedWeekOf = body.completedWeekOf
        }
        data.progress = 100
      } else if (task.status === 'done') {
        // 任務從 done 退回 → 清完成欄位；連 A 確認(reviewedAt)一起清，
        //   避免出現「已 A 確認卻沒正式完成」的不一致（成員週報顯示已完成、甘特卻 99%）。
        data.completedAt = null
        data.completedBy = null
        data.completedWeekOf = null
        data.reviewedAt = null
        data.reviewedBy = null
      }
    }
    if (body.progress !== undefined && data.progress === undefined) data.progress = body.progress
    if (body.startDate !== undefined) data.startDate = new Date(body.startDate)
    if (body.endDate !== undefined) data.endDate = new Date(body.endDate)
    if (body.sortOrder !== undefined) data.sortOrder = body.sortOrder
    if (body.durationDays !== undefined) data.durationDays = body.durationDays
    if (body.manualDates !== undefined) data.manualDates = body.manualDates
    // R 自我回報完成/取消回報（不影響 status/progress，也不觸發里程碑同步）
    if (body.reportedDone !== undefined) {
      if (body.reportedDone) {
        data.reportedDoneAt = new Date()
        data.reportedDoneBy = body.reportedDoneBy || null
      } else {
        data.reportedDoneAt = null
        data.reportedDoneBy = null
        data.reviewedAt = null // 取消/退回時一併清掉審核狀態
        data.reviewedBy = null
      }
    }
    // A 審核通過（確認 R 回報的 100% 完成）
    if (body.reviewedDone !== undefined) {
      if (body.reviewedDone) {
        data.reviewedAt = new Date()
        data.reviewedBy = body.reviewActor || null
        // markComplete → 正式標記完成：甘特顯示 100% + 移入完成區 + 觸發里程碑同步
        if (body.markComplete) {
          data.status = 'done'
          data.progress = 100
          if (!task.completedAt) data.completedAt = new Date()
          data.completedBy = body.reviewActor || null
          if (body.completedWeekOf) data.completedWeekOf = body.completedWeekOf
        }
      } else {
        data.reviewedAt = null
        data.reviewedBy = null
      }
    }

    // When dates or duration are manually changed, clear stale original dates
    // (set by delay approval) so the Gantt chart no longer shows phantom extensions
    if ((data.startDate || data.endDate || data.durationDays !== undefined) && task.originalStartDate) {
      data.originalStartDate = null
      data.originalEndDate = null
    }
    if (body.milestoneId !== undefined) {
      const ms = await prisma.milestone.findFirst({ where: { id: body.milestoneId, projectId: id } })
      if (!ms) return NextResponse.json({ error: '找不到該里程碑' }, { status: 404 })
      data.milestoneId = body.milestoneId
    }
    if (body.parentId !== undefined) {
      if (body.parentId === null) {
        data.parentId = null
      } else {
        const parent = await prisma.task.findFirst({ where: { id: body.parentId, projectId: id } })
        if (!parent) return NextResponse.json({ error: '找不到上層任務' }, { status: 404 })
        data.parentId = body.parentId
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: '沒有提供任何更新欄位' }, { status: 400 })
    }

    const updated = await prisma.task.update({
      where: { id: taskId },
      data,
    })

    // 審視歷程：記錄 R 回報/取消、A 確認/退回，供追蹤
    if (body.reviewEvent) {
      await prisma.taskReviewEvent.create({
        data: { taskId, projectId: id, type: body.reviewEvent, actor: body.reviewActor || '', note: body.reviewNote || null },
      })
    }

    // 解除完成 → 通知該任務負責人＋往上仍為完成的父層負責人（他們的完成已失效，需重新確認/補報告）。
    //   以「更新前」的狀態判斷是否原本已完成，避免對本來就未完成的任務誤發。
    if (body.reopenNotify && (task.completedAt || task.status === 'done' || task.reportedDoneAt)) {
      const proj = await prisma.project.findUnique({ where: { id }, select: { name: true } })
      await notifyCompletionReopened({
        projectId: id, projectName: proj?.name || '專案', taskId, actorName: body.reopenActor,
      }).catch(() => {})
    }

    // 「有主管就必須先過主管」：R 回報 100% 完成、但這位作者對此任務完全沒有任何報告，
    //   且他有指定報告審核主管時 → 補一筆「完成待審」占位報告，讓 R主管能先審核
    //   (核准→進 A 待確認；駁回→退回 R)。否則會繞過主管直接跑到 A（先前的漏洞）。
    if (body.reportedDone === true) {
      const reporter = await resolveAssignee(body.reportedDoneBy || task.assignee || '')
      if (reporter) {
        const member = await prisma.projectTeamMember.findFirst({
          where: { projectId: id, userId: reporter.id },
          select: { reportReviewerEmail: true, reportReviewerName: true },
        })
        const hasReviewer = !!(member?.reportReviewerEmail || member?.reportReviewerName)
        // 「目前有沒有待審(未發布、未駁回)的報告」→ 有就交給主管審那筆；沒有就補占位。
        //   關鍵：完成被解除後又回報時，舊的「已核准」報告不算待審 → 一樣補占位，強制重新過主管，
        //   不能吃舊核准直接繞到 A。（涵蓋「完全沒寫」與「只有舊核准報告」兩種情況）
        const pendingLog = await prisma.taskLog.findFirst({
          where: { taskId, authorId: reporter.id, publishedAt: null, reviewerRejectedAt: null },
          select: { id: true },
        })
        if (hasReviewer && !pendingLog) {
          const now = new Date()
          const day = now.getUTCDay(); const diff = now.getUTCDate() - day + (day === 0 ? -6 : 1)
          const weekOf = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), diff)).toISOString().slice(0, 10)
          await prisma.taskLog.create({
            data: {
              taskId, projectId: id, authorId: reporter.id,
              logDate: now, weekOf,
              content: '（回報任務已 100% 完成，未另附工作說明，請主管確認）',
            },
          }).catch(() => {})
          // 通知 R主管有待審報告
          const proj = await prisma.project.findUnique({ where: { id }, select: { name: true } })
          if (member?.reportReviewerEmail) {
            await notifyReportReviewNeeded({
              projectId: id, projectName: proj?.name || '專案',
              reviewerEmail: member.reportReviewerEmail, rName: reporter.name, taskTitle: updated.title,
            }).catch(() => {})
          }
        }
      }
    }

    // 發布到官方更新紀錄「只由 A 送出自己的週報時觸發」(publishLogs)。
    // 「審核通過(reviewEvent=confirmed)」只是認可 R 的回報，不代表 A 的報告，故不發布。
    if (body.publishLogs) {
      await prisma.taskLog.updateMany({
        where: { taskId, publishedAt: null },
        data: { publishedAt: new Date(), publishedBy: body.reviewActor || '' },
      })
    }

    // ── Notify new assignee when assignee changes ──
    const newAssignee = data.assignee as string | undefined
    if (newAssignee && newAssignee !== task.assignee) {
      const project = await prisma.project.findUnique({ where: { id }, select: { name: true } })
      if (project) {
        notifyTaskAssigned({
          assignee: newAssignee,
          taskTitle: updated.title,
          projectId: id,
          projectName: project.name,
        }).catch((e) => console.error('notifyTaskAssigned failed', e))
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

    // ── 父任務進度不再從子任務 rollup（B-H2）──
    //    模型：每個任務（含父層）進度＝自己報告，只有里程碑聚合葉任務（見 syncMilestoneStatus）。
    //    子任務變動不再改寫父層進度/狀態，否則會與 GET 的 syncTaskProgressFromLogs（父＝自己報告）
    //    互相打架 → 父任務那格在 50%↔0% 來回跳。里程碑已於上方 syncMilestoneStatus 同步。
    //    仍回傳父層「現值」供前端更新該列（唯讀，不重算、不寫入）。
    if (task.parentId && (data.status !== undefined || data.progress !== undefined)) {
      const parentNow = await prisma.task.findUnique({
        where: { id: task.parentId },
        select: { progress: true, status: true },
      })
      const updatedParent = parentNow ?? { progress: 0, status: 'todo' }

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
        reportedDoneAt: updated.reportedDoneAt ? updated.reportedDoneAt.toISOString().slice(0, 10) : null,
        reportedDoneBy: updated.reportedDoneBy || null,
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
      reportedDoneAt: updated.reportedDoneAt ? updated.reportedDoneAt.toISOString().slice(0, 10) : null,
      reportedDoneBy: updated.reportedDoneBy || null,
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
