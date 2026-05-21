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
      select: { id: true, name: true },
    })
    if (!reviewer) {
      return NextResponse.json({ error: '找不到審核人' }, { status: 404 })
    }

    const now = new Date()

    if (body.action === 'approve') {
      // Approve: update request + cascade milestone & task dates
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

        // 3. If a specific task triggered the delay, extend its durationDays
        //    so the Gantt chart correctly shows which task actually got extended.
        const triggerTaskId = delayRequest.taskId
        if (triggerTaskId) {
          // Calculate how many days the milestone was extended
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

        // Walk milestones — each uses its own startDate (overlapping support)
        for (const ms of project.milestones) {
          // Use milestone's own startDate if set, otherwise fall back to project start
          const msStart = (ms as any).startDate
            ? new Date((ms as any).startDate)
            : new Date(project.startDate)

          const msTasks = project.tasks
            .filter(t => t.milestoneId === ms.id && t.parentId == null)
            .sort((a, b) => a.sortOrder - b.sortOrder)

          // Check if this milestone's dueDate needs to be pushed forward
          const msDueDate = new Date(ms.dueDate)
          let newDueDate = msDueDate

          // Recalculate task dates — each task uses its own startDate or milestone start
          for (const task of msTasks) {
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
                data: {
                  startDate: taskStart,
                  endDate: taskEnd,
                  ...preserveOriginal,
                },
              })
            }

            // Schedule subtasks — each uses its own startDate or parent start
            const subtasks = project.tasks
              .filter(t => t.parentId === task.id)
              .sort((a, b) => a.sortOrder - b.sortOrder)
            for (const sub of subtasks) {
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

              // Track latest task end for milestone expansion
              if (subEnd > newDueDate) newDueDate = subEnd
            }

            // Track latest task end for milestone expansion
            if (taskEnd > newDueDate) newDueDate = taskEnd
          }

          // Update milestone dueDate if tasks extend beyond it
          if (newDueDate > msDueDate) {
            await tx.milestone.update({
              where: { id: ms.id },
              data: { dueDate: newDueDate },
            })
          }
        }

        // 4. Update project endDate to latest milestone dueDate (overlapping)
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

        // 5. Reset milestone baselines to the new approved dates
        //    so the Gantt chart no longer shows delay indicators
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
    } else {
      // Reject: only update request status
      await prisma.delayRequest.update({
        where: { id },
        data: {
          status: 'rejected',
          reviewerId: body.reviewerId,
          reviewedAt: now,
          reviewNotes: body.reviewNotes?.trim() || null,
        },
      })
    }

    // Notify requester of review result (fire-and-forget)
    const projectForNotif = await prisma.project.findUnique({
      where: { id: delayRequest.projectId },
      select: { name: true },
    })
    if (projectForNotif) {
      notifyDelayReviewed({
        requesterId: delayRequest.requesterId,
        projectId: delayRequest.projectId,
        projectName: projectForNotif.name,
        approved: body.action === 'approve',
        reviewNotes: body.reviewNotes,
      })
    }

    return NextResponse.json({
      success: true,
      message: body.action === 'approve' ? '已核准延遲申請' : '已駁回延遲申請',
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
