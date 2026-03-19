import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { addDays } from 'date-fns'

// GET: diagnose current state
export async function GET() {
  const approvedDelays = await prisma.delayRequest.findMany({
    where: { status: 'approved' },
    include: { affectedMilestones: true },
    orderBy: { createdAt: 'asc' },
  })

  const affectedMsIds = new Set<string>()
  for (const dr of approvedDelays) {
    for (const am of dr.affectedMilestones) affectedMsIds.add(am.milestoneId)
  }

  const tasks = await prisma.task.findMany({
    where: { milestoneId: { in: [...affectedMsIds] }, parentId: null },
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true, title: true, milestoneId: true,
      startDate: true, endDate: true, durationDays: true,
      originalStartDate: true, originalEndDate: true,
    },
  })

  return NextResponse.json({
    approvedDelays: approvedDelays.length,
    affectedMilestones: [...affectedMsIds],
    tasks: tasks.map(t => ({
      id: t.id,
      title: t.title,
      milestoneId: t.milestoneId,
      startDate: t.startDate?.toISOString().slice(0, 10),
      endDate: t.endDate?.toISOString().slice(0, 10),
      durationDays: t.durationDays,
      originalStartDate: (t as any).originalStartDate?.toISOString().slice(0, 10) ?? null,
      originalEndDate: (t as any).originalEndDate?.toISOString().slice(0, 10) ?? null,
    })),
  })
}

/**
 * POST /api/admin/backfill-original-dates
 * One-time backfill: reconstruct originalStartDate/originalEndDate for tasks
 * that were affected by approved delay requests before we added these fields.
 */
export async function POST() {
  try {
    // Find all approved delay requests with their affected milestones
    const approvedDelays = await prisma.delayRequest.findMany({
      where: { status: 'approved' },
      include: {
        affectedMilestones: true,
      },
      orderBy: { createdAt: 'asc' },
    })

    if (approvedDelays.length === 0) {
      return NextResponse.json({ message: 'No approved delays found', updated: 0 })
    }

    // Collect affected milestone IDs → earliest originalDate
    const milestoneOriginalDates = new Map<string, { originalDate: Date; projectId: string }>()
    for (const dr of approvedDelays) {
      for (const am of dr.affectedMilestones) {
        if (!milestoneOriginalDates.has(am.milestoneId)) {
          milestoneOriginalDates.set(am.milestoneId, {
            originalDate: am.originalDate,
            projectId: dr.projectId,
          })
        }
      }
    }

    let totalUpdated = 0

    for (const [milestoneId, info] of milestoneOriginalDates) {
      // Get ALL tasks for this milestone (no originalEndDate filter — do it in JS)
      const allTasks = await prisma.task.findMany({
        where: { milestoneId, parentId: null },
        orderBy: { sortOrder: 'asc' },
      })

      // Filter in JS: only tasks that don't have originalEndDate yet
      const tasks = allTasks.filter(t => t.originalEndDate == null)
      if (tasks.length === 0) continue

      // Reconstruct original layout: tasks end at originalDate
      const originalDueDate = info.originalDate
      const totalTaskDays = allTasks.reduce((sum, t) => sum + Math.max(t.durationDays, 1), 0)
      const msOriginalStart = addDays(originalDueDate, -totalTaskDays + 1)

      // Lay out ALL tasks sequentially to compute original positions
      let current = new Date(msOriginalStart)
      for (const task of allTasks) {
        const dur = Math.max(task.durationDays, 1)
        const origStart = new Date(current)
        const origEnd = addDays(current, dur - 1)

        // Only backfill tasks that need it and whose dates actually changed
        if (task.originalEndDate == null &&
            (task.startDate.getTime() !== origStart.getTime() ||
             task.endDate.getTime() !== origEnd.getTime())) {
          await prisma.task.update({
            where: { id: task.id },
            data: {
              originalStartDate: origStart,
              originalEndDate: origEnd,
            },
          })
          totalUpdated++
        }

        current = addDays(origEnd, 1)
      }
    }

    return NextResponse.json({
      message: `Backfill complete`,
      updated: totalUpdated,
      milestonesProcessed: milestoneOriginalDates.size,
    })
  } catch (error) {
    console.error('Backfill error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
