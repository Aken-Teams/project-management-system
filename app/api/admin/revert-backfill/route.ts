import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

/**
 * POST /api/admin/revert-backfill
 * Revert the bad backfill: reposition tasks at END of milestone window
 * (old delay logic) and restore original durationDays.
 */
export async function POST() {
  try {
    const projects = await prisma.project.findMany({
      include: {
        milestones: { orderBy: { sortOrder: 'asc' } },
        tasks: { orderBy: { sortOrder: 'asc' } },
      },
    })

    let totalReverted = 0

    for (const project of projects) {
      let currentStart = new Date(project.startDate)

      for (const ms of project.milestones) {
        const msStart = new Date(currentStart)
        const msDueDate = new Date(ms.dueDate)

        const msTasks = project.tasks
          .filter(t => t.milestoneId === ms.id && t.parentId == null)
          .sort((a, b) => a.sortOrder - b.sortOrder)

        if (msTasks.length === 0) {
          currentStart = addDays(msDueDate, 1)
          continue
        }

        // First: fix durationDays for any task that was inflated by the backfill.
        // A task's real durationDays = endDate - startDate + 1 based on its CURRENT dates.
        // But the backfill changed both dates AND durationDays, so we need to use
        // the original span. If task has originalEndDate/originalStartDate, those
        // are the pre-delay dates. The actual durationDays should be based on the
        // original task duration (before any delay).
        //
        // Actually, the simplest approach: compute each task's "natural" durationDays
        // as the date span that would fill the milestone evenly.
        // Since we don't know the original durationDays, we use:
        //   durationDays = (endDate - startDate) / 86400000 + 1
        // But endDate was also changed by backfill...
        //
        // Best approach: look at originalStartDate/originalEndDate if they exist,
        // because those represent the pre-delay dates and the durationDays should
        // match that original span.
        for (const task of msTasks) {
          if (task.originalStartDate && task.originalEndDate) {
            const origSpan = Math.round(
              (task.originalEndDate.getTime() - task.originalStartDate.getTime()) / 86400000
            ) + 1
            if (task.durationDays !== origSpan) {
              await prisma.task.update({
                where: { id: task.id },
                data: { durationDays: origSpan },
              })
              task.durationDays = origSpan
              totalReverted++
            }
          }
        }

        // Now reposition tasks at the END of the milestone window (old logic)
        const totalTaskDays = msTasks.reduce((sum, t) => sum + Math.max(t.durationDays, 1), 0)
        const adjustedStart = addDays(msDueDate, -totalTaskDays + 1)
        let taskCurrent = adjustedStart > msStart ? new Date(adjustedStart) : new Date(msStart)

        for (const task of msTasks) {
          const dur = Math.max(task.durationDays, 1)
          const taskStart = new Date(taskCurrent)
          const taskEnd = addDays(taskCurrent, dur - 1)

          if (task.startDate.getTime() !== taskStart.getTime() ||
              task.endDate.getTime() !== taskEnd.getTime()) {
            await prisma.task.update({
              where: { id: task.id },
              data: { startDate: taskStart, endDate: taskEnd },
            })
            totalReverted++
          }

          // Also fix subtasks
          const subtasks = project.tasks
            .filter(t => t.parentId === task.id)
            .sort((a, b) => a.sortOrder - b.sortOrder)
          let subCurrent = new Date(taskStart)
          for (const sub of subtasks) {
            const subDur = Math.max(sub.durationDays, 1)
            const subStart = new Date(subCurrent)
            const subEnd = addDays(subCurrent, subDur - 1)
            if (sub.startDate.getTime() !== subStart.getTime() ||
                sub.endDate.getTime() !== subEnd.getTime()) {
              await prisma.task.update({
                where: { id: sub.id },
                data: { startDate: subStart, endDate: subEnd },
              })
              totalReverted++
            }
            subCurrent = addDays(subEnd, 1)
          }

          taskCurrent = addDays(taskEnd, 1)
        }

        currentStart = addDays(msDueDate, 1)
      }
    }

    return NextResponse.json({ message: 'Revert complete', totalReverted })
  } catch (error) {
    console.error('Revert error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}
