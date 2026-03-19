import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

/**
 * GET /api/admin/backfill-task-durations
 * Diagnose: show projects where edit dialog dates don't match Gantt chart.
 * This happens when old delay approvals shifted tasks to the end of milestone
 * windows without extending any task's durationDays.
 */
export async function GET() {
  const projects = await prisma.project.findMany({
    include: {
      milestones: { orderBy: { sortOrder: 'asc' } },
      tasks: { where: { parentId: null }, orderBy: { sortOrder: 'asc' } },
    },
  })

  const issues: Array<{
    projectId: string
    projectName: string
    milestoneId: string
    milestoneName: string
    msComputedStart: string
    msDueDate: string
    msSpanDays: number
    taskTotalDays: number
    gapDays: number
    tasks: Array<{
      id: string
      title: string
      dbStart: string
      dbEnd: string
      durationDays: number
      wouldBeStart: string
      wouldBeEnd: string
    }>
  }> = []

  for (const project of projects) {
    let currentStart = new Date(project.startDate)

    for (const ms of project.milestones) {
      const msStart = new Date(currentStart)
      const msDueDate = new Date(ms.dueDate)
      const msSpanDays = Math.round((msDueDate.getTime() - msStart.getTime()) / 86400000) + 1

      const msTasks = project.tasks
        .filter(t => t.milestoneId === ms.id)
        .sort((a, b) => a.sortOrder - b.sortOrder)

      const taskTotalDays = msTasks.reduce((sum, t) => sum + Math.max(t.durationDays, 1), 0)
      const gapDays = msSpanDays - taskTotalDays

      if (gapDays > 0 && msTasks.length > 0) {
        // There's a gap — edit dialog will show different dates than Gantt
        let wouldBeCurrent = new Date(msStart)
        const taskDetails = msTasks.map(t => {
          const dur = Math.max(t.durationDays, 1)
          const wouldBeStart = new Date(wouldBeCurrent)
          const wouldBeEnd = addDays(wouldBeCurrent, dur - 1)
          wouldBeCurrent = addDays(wouldBeEnd, 1)
          return {
            id: t.id,
            title: t.title,
            dbStart: t.startDate.toISOString().slice(0, 10),
            dbEnd: t.endDate.toISOString().slice(0, 10),
            durationDays: t.durationDays,
            wouldBeStart: wouldBeStart.toISOString().slice(0, 10),
            wouldBeEnd: wouldBeEnd.toISOString().slice(0, 10),
          }
        })

        issues.push({
          projectId: project.id,
          projectName: project.name,
          milestoneId: ms.id,
          milestoneName: ms.name,
          msComputedStart: msStart.toISOString().slice(0, 10),
          msDueDate: msDueDate.toISOString().slice(0, 10),
          msSpanDays,
          taskTotalDays,
          gapDays,
          tasks: taskDetails,
        })
      }

      currentStart = addDays(msDueDate, 1)
    }
  }

  return NextResponse.json({
    issueCount: issues.length,
    issues,
  })
}

/**
 * POST /api/admin/backfill-task-durations
 * Fix: for milestones with gaps (dueDate span > task total days),
 * add extra days to the last task, then reposition all tasks sequentially
 * from milestone start. This makes the edit dialog match the Gantt chart.
 */
export async function POST() {
  try {
    const projects = await prisma.project.findMany({
      include: {
        milestones: { orderBy: { sortOrder: 'asc' } },
        tasks: { orderBy: { sortOrder: 'asc' } },
      },
    })

    let totalFixed = 0

    for (const project of projects) {
      let currentStart = new Date(project.startDate)
      let anyChanged = false

      for (const ms of project.milestones) {
        const msStart = new Date(currentStart)
        const msDueDate = new Date(ms.dueDate)
        const msSpanDays = Math.round((msDueDate.getTime() - msStart.getTime()) / 86400000) + 1

        const msTasks = project.tasks
          .filter(t => t.milestoneId === ms.id && t.parentId == null)
          .sort((a, b) => a.sortOrder - b.sortOrder)

        const taskTotalDays = msTasks.reduce((sum, t) => sum + Math.max(t.durationDays, 1), 0)
        const gapDays = msSpanDays - taskTotalDays

        if (gapDays > 0 && msTasks.length > 0) {
          // Add extra days to the LAST task to fill the gap
          const lastTask = msTasks[msTasks.length - 1]
          const newDuration = Math.max(lastTask.durationDays, 1) + gapDays
          await prisma.task.update({
            where: { id: lastTask.id },
            data: { durationDays: newDuration },
          })
          // Update in-memory for cascade below
          lastTask.durationDays = newDuration
          anyChanged = true
        }

        // Reposition all tasks sequentially from milestone start
        let taskCurrent = new Date(msStart)
        for (const task of msTasks) {
          const dur = Math.max(task.durationDays, 1)
          const taskStart = new Date(taskCurrent)
          const taskEnd = addDays(taskCurrent, dur - 1)

          if (task.startDate.getTime() !== taskStart.getTime() ||
              task.endDate.getTime() !== taskEnd.getTime()) {
            await prisma.task.update({
              where: { id: task.id },
              data: {
                startDate: taskStart,
                endDate: taskEnd,
              },
            })
            anyChanged = true
            totalFixed++
          }

          // Also reposition subtasks within parent range
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
              totalFixed++
            }
            subCurrent = addDays(subEnd, 1)
          }

          taskCurrent = addDays(taskEnd, 1)
        }

        currentStart = addDays(msDueDate, 1)
      }

      if (anyChanged) {
        // Reset milestone baselines to current dates
        await prisma.milestoneBaseline.deleteMany({
          where: { projectId: project.id },
        })
        const updatedMilestones = await prisma.milestone.findMany({
          where: { projectId: project.id },
          orderBy: { sortOrder: 'asc' },
          select: { id: true, name: true, dueDate: true },
        })
        for (const ms of updatedMilestones) {
          await prisma.milestoneBaseline.create({
            data: {
              projectId: project.id,
              milestoneId: ms.id,
              name: ms.name,
              dueDate: ms.dueDate,
            },
          })
        }
      }
    }

    return NextResponse.json({
      message: 'Backfill complete',
      tasksFixed: totalFixed,
    })
  } catch (error) {
    console.error('Backfill task durations error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}
