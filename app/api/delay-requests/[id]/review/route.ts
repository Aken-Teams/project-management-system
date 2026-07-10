import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { notifyDelayReviewed } from '@/lib/notifications'

type RouteContext = { params: Promise<{ id: string }> }

// ─── PATCH /api/delay-requests/[id]/review — Approve or reject a delay request ────

interface ReviewBody {
  action: 'approve' | 'reject'
  reviewerId: string   // userId of the reviewer
  reviewNotes?: string
}

export async function PATCH(
  request: NextRequest,
  { params }: RouteContext,
) {
  try {
    const { id } = await params
    const body: ReviewBody = await request.json()

    if (!body.action || !body.reviewerId) {
      return NextResponse.json(
        { error: '缺少必要欄位（action, reviewerId）' },
        { status: 400 },
      )
    }

    if (body.action !== 'approve' && body.action !== 'reject') {
      return NextResponse.json(
        { error: 'action 必須是 approve 或 reject' },
        { status: 400 },
      )
    }

    // Verify delay request exists and is pending
    const delayRequest = await prisma.delayRequest.findUnique({
      where: { id },
      include: { affectedMilestones: true },
    })
    if (!delayRequest) {
      return NextResponse.json({ error: '找不到延遲申請' }, { status: 404 })
    }
    if (delayRequest.status !== 'pending') {
      return NextResponse.json(
        { error: '此申請已審核過' },
        { status: 400 },
      )
    }

    // Verify reviewer exists
    const reviewer = await prisma.user.findUnique({
      where: { id: body.reviewerId },
      select: { id: true, name: true, role: true },
    })
    if (!reviewer) {
      return NextResponse.json({ error: '找不到審核人' }, { status: 404 })
    }

    // Verify reviewer is S-role in this project (or admin)
    if (reviewer.role !== 'admin') {
      const sRole = await prisma.projectTeamMember.findFirst({
        where: { projectId: delayRequest.projectId, userId: body.reviewerId, role: 'S' },
      })
      if (!sRole) {
        return NextResponse.json({ error: '您不是此專案的審核者（需要 S 角色）' }, { status: 403 })
      }
    }

    // Check if this reviewer already submitted a decision
    const existingDecision = await prisma.delayReviewDecision.findUnique({
      where: { delayRequestId_reviewerId: { delayRequestId: id, reviewerId: body.reviewerId } },
    })
    if (existingDecision) {
      return NextResponse.json({ error: '您已審核過此申請' }, { status: 400 })
    }

    const now = new Date()

    // 1. Record the individual decision
    await prisma.delayReviewDecision.create({
      data: {
        delayRequestId: id,
        reviewerId: body.reviewerId,
        action: body.action,
        notes: body.reviewNotes?.trim() || null,
      },
    })

    if (body.action === 'reject') {
      // Any single rejection → immediately reject the whole request
      await prisma.delayRequest.update({
        where: { id },
        data: {
          status: 'rejected',
          reviewerId: body.reviewerId,
          reviewedAt: now,
          reviewNotes: body.reviewNotes?.trim() || null,
        },
      })

      // Notify requester of rejection
      const projectForNotif = await prisma.project.findUnique({
        where: { id: delayRequest.projectId },
        select: { name: true },
      })
      if (projectForNotif) {
        notifyDelayReviewed({
          requesterId: delayRequest.requesterId,
          projectId: delayRequest.projectId,
          projectName: projectForNotif.name,
          approved: false,
          reviewNotes: body.reviewNotes,
        })
      }

      return NextResponse.json({
        success: true,
        message: '已駁回延遲申請',
      })
    }

    // action === 'approve': check if all S-role reviewers have approved
    const approvedCount = await prisma.delayReviewDecision.count({
      where: { delayRequestId: id, action: 'approve' },
    })

    // Get current S-role count for this project
    const currentSCount = await prisma.projectTeamMember.count({
      where: { projectId: delayRequest.projectId, role: 'S' },
    })
    const requiredCount = Math.max(currentSCount, delayRequest.requiredReviewers, 1)

    if (approvedCount < requiredCount) {
      // Not all reviewers have approved yet — stay pending
      return NextResponse.json({
        success: true,
        message: `已記錄您的核准（${approvedCount}/${requiredCount}）`,
        approvedCount,
        requiredCount,
      })
    }

    // All reviewers approved → approve the request and cascade dates
    await prisma.$transaction(async (tx) => {
      // 1. Update delay request status
      await tx.delayRequest.update({
        where: { id },
        data: {
          status: 'approved',
          reviewerId: body.reviewerId,
          reviewedAt: now,
          reviewNotes: body.reviewNotes?.trim() || null,
        },
      })

      // 2. Update affected milestone dueDates
      for (const am of delayRequest.affectedMilestones) {
        await tx.milestone.update({
          where: { id: am.milestoneId },
          data: { dueDate: am.proposedDate },
        })
      }

      // 2b. Update project startDate if a proposed start date was included
      const proposedStart = delayRequest.affectedMilestones.find(am => am.proposedStartDate)
      if (proposedStart?.proposedStartDate) {
        await tx.project.update({
          where: { id: delayRequest.projectId },
          data: { startDate: proposedStart.proposedStartDate },
        })
      }

      // 2c. Apply pending task changes (duration, start/end date edits)
      const pendingTaskChanges = delayRequest.pendingTaskChanges as Array<{
        taskId: string; durationDays?: number; startDate?: string; endDate?: string
      }> | null
      if (pendingTaskChanges && pendingTaskChanges.length > 0) {
        for (const tc of pendingTaskChanges) {
          const data: Record<string, unknown> = {}
          if (tc.durationDays !== undefined) data.durationDays = tc.durationDays
          if (tc.startDate) data.startDate = new Date(tc.startDate)
          if (tc.endDate) data.endDate = new Date(tc.endDate)
          if (Object.keys(data).length > 0) {
            // 保存原始日期（僅首次延期）→ 甘特能畫出「延期前 vs 延期後」的紅段
            if (data.startDate || data.endDate) {
              const cur = await tx.task.findUnique({
                where: { id: tc.taskId },
                select: { startDate: true, endDate: true, originalStartDate: true },
              })
              if (cur && cur.originalStartDate == null) {
                data.originalStartDate = cur.startDate
                data.originalEndDate = cur.endDate
              }
            }
            await tx.task.update({ where: { id: tc.taskId }, data })
          }
        }
      }

      // 3. If a specific task triggered the delay, extend its durationDays
      const triggerTaskId = delayRequest.taskId
      if (triggerTaskId) {
        const am = delayRequest.affectedMilestones[0]
        if (am) {
          const delayDays = daysBetween(am.originalDate, am.proposedDate)
          if (delayDays > 0) {
            const triggerTask = await tx.task.findUnique({
              where: { id: triggerTaskId },
              select: { durationDays: true },
            })
            if (triggerTask) {
              await tx.task.update({
                where: { id: triggerTaskId },
                data: { durationDays: triggerTask.durationDays + delayDays },
              })
            }
          }
        }
      }

      // 4. Cascade: recalculate subsequent milestones & all task dates
      const project = await tx.project.findUnique({
        where: { id: delayRequest.projectId },
        include: {
          milestones: { orderBy: { sortOrder: 'asc' } },
          tasks: { orderBy: { sortOrder: 'asc' } },
        },
      })
      if (!project) return

      const affectedMsIds = new Set(delayRequest.affectedMilestones.map(am => am.milestoneId))
      // B-H1：step-4 只重排「這筆延期實際影響的任務」（pendingTaskChanges + trigger）。
      //   真正的延期連動（群組延長/下游順延）由 step-2/2c/3 依撰寫台算好的值套用；
      //   step-4 原本會把「全專案每個任務」強制 end=start+dur-1，會誤改手動改過(end≠start+dur-1)
      //   的無關任務、還存 original 冒假紅段。改成：只有受影響任務才重排、存 original；
      //   其餘任務用「實際 DB 日期」納入里程碑 envelope，完全不改寫（以手動 DB 為主）。
      const affectedTaskIds = new Set<string>([
        ...((pendingTaskChanges ?? []).map(tc => tc.taskId)),
        ...(triggerTaskId ? [triggerTaskId] : []),
      ])

      for (const ms of project.milestones) {
        const msTasks = project.tasks
          .filter(t => t.milestoneId === ms.id && t.parentId == null)
          .sort((a, b) => a.sortOrder - b.sortOrder)

        const msDueDate = new Date(ms.dueDate)
        let newDueDate = msDueDate

        for (const task of msTasks) {
          if (affectedTaskIds.has(task.id)) {
            const taskDurationDays = Math.max(task.durationDays, 1)
            const taskStart = new Date(task.startDate)
            const taskEnd = addDays(taskStart, taskDurationDays - 1)
            if (task.startDate.getTime() !== taskStart.getTime() ||
                task.endDate.getTime() !== taskEnd.getTime()) {
              const preserveOriginal = (task as any).originalStartDate == null
                ? { originalStartDate: task.startDate, originalEndDate: task.endDate }
                : {}
              await tx.task.update({
                where: { id: task.id },
                data: { startDate: taskStart, endDate: taskEnd, ...preserveOriginal },
              })
            }
            if (taskEnd > newDueDate) newDueDate = taskEnd
          } else if (task.endDate > newDueDate) {
            // 未受影響：不改寫，只用實際日期納入 envelope
            newDueDate = new Date(task.endDate)
          }

          const subtasks = project.tasks
            .filter(t => t.parentId === task.id)
            .sort((a, b) => a.sortOrder - b.sortOrder)
          for (const sub of subtasks) {
            if (affectedTaskIds.has(sub.id)) {
              const subDays = Math.max(sub.durationDays || 1, 1)
              const subStart = new Date(sub.startDate)
              const subEnd = addDays(subStart, subDays - 1)
              if (sub.startDate.getTime() !== subStart.getTime() ||
                  sub.endDate.getTime() !== subEnd.getTime()) {
                const subPreserve = (sub as any).originalStartDate == null
                  ? { originalStartDate: sub.startDate, originalEndDate: sub.endDate }
                  : {}
                await tx.task.update({
                  where: { id: sub.id },
                  data: { startDate: subStart, endDate: subEnd, ...subPreserve },
                })
              }
              if (subEnd > newDueDate) newDueDate = subEnd
            } else if (sub.endDate > newDueDate) {
              newDueDate = new Date(sub.endDate)
            }
          }
        }

        if (affectedMsIds.has(ms.id)) {
          // Directly affected: keep approved date, but extend if tasks need more time
          if (newDueDate > msDueDate) {
            await tx.milestone.update({
              where: { id: ms.id },
              data: { dueDate: newDueDate },
            })
          }
        } else if (newDueDate.getTime() !== msDueDate.getTime()) {
          // Non-affected milestone: cascade any direction
          await tx.milestone.update({
            where: { id: ms.id },
            data: { dueDate: newDueDate },
          })
        }
      }

      // Update project endDate to latest milestone dueDate
      const allMs = await tx.milestone.findMany({
        where: { projectId: project.id },
        select: { dueDate: true },
        orderBy: { dueDate: 'desc' },
        take: 1,
      })
      if (allMs.length > 0) {
        await tx.project.update({
          where: { id: project.id },
          data: { endDate: allMs[0].dueDate },
        })
      }

      // Reset milestone baselines to the new approved dates
      await tx.milestoneBaseline.deleteMany({
        where: { projectId: project.id },
      })
      const updatedMilestones = await tx.milestone.findMany({
        where: { projectId: project.id },
        orderBy: { sortOrder: 'asc' },
        select: { id: true, name: true, dueDate: true },
      })
      for (const ms of updatedMilestones) {
        await tx.milestoneBaseline.create({
          data: {
            projectId: project.id,
            milestoneId: ms.id,
            name: ms.name,
            dueDate: ms.dueDate,
          },
        })
      }
    })

    // Notify requester — all approved
    const projectForNotif = await prisma.project.findUnique({
      where: { id: delayRequest.projectId },
      select: { name: true },
    })
    if (projectForNotif) {
      notifyDelayReviewed({
        requesterId: delayRequest.requesterId,
        projectId: delayRequest.projectId,
        projectName: projectForNotif.name,
        approved: true,
        reviewNotes: body.reviewNotes,
      })
    }

    return NextResponse.json({
      success: true,
      message: '全部審核者已核准，延遲申請已通過',
    })
  } catch (error) {
    console.error('Failed to review delay request:', error)
    return NextResponse.json(
      { error: '審核延遲申請失敗' },
      { status: 500 },
    )
  }
}

// ─── Date helpers ────

function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24))
}
