import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

/**
 * GET /api/admin/fix-project-starts
 * Diagnose: find projects where the first milestone has a gap
 * (project start date < first task's actual start date).
 */
export async function GET() {
  const projects = await prisma.project.findMany({
    include: {
      milestones: { orderBy: { sortOrder: 'asc' } },
      tasks: { where: { parentId: null }, orderBy: { sortOrder: 'asc' } },
    },
  })

  const issues = []

  for (const project of projects) {
    if (project.milestones.length === 0) continue
    const firstMs = project.milestones[0]
    const firstMsTasks = project.tasks
      .filter(t => t.milestoneId === firstMs.id)
      .sort((a, b) => a.sortOrder - b.sortOrder)

    if (firstMsTasks.length === 0) continue

    const earliestTaskStart = firstMsTasks[0].startDate
    const projectStart = new Date(project.startDate)

    const gapDays = Math.round(
      (earliestTaskStart.getTime() - projectStart.getTime()) / 86400000
    )

    if (gapDays > 0) {
      issues.push({
        projectId: project.id,
        projectName: project.name,
        currentStart: projectStart.toISOString().slice(0, 10),
        effectiveStart: earliestTaskStart.toISOString().slice(0, 10),
        gapDays,
        firstMilestone: firstMs.name,
        firstMilestoneDue: new Date(firstMs.dueDate).toISOString().slice(0, 10),
      })
    }
  }

  return NextResponse.json({ issueCount: issues.length, issues })
}

/**
 * POST /api/admin/fix-project-starts
 * Fix: update project start dates to match where tasks actually begin.
 * This eliminates gaps left by old delay shifts that didn't update the project start.
 */
export async function POST() {
  try {
    const projects = await prisma.project.findMany({
      include: {
        milestones: { orderBy: { sortOrder: 'asc' } },
        tasks: { where: { parentId: null }, orderBy: { sortOrder: 'asc' } },
      },
    })

    let totalFixed = 0

    for (const project of projects) {
      if (project.milestones.length === 0) continue
      const firstMs = project.milestones[0]
      const firstMsTasks = project.tasks
        .filter(t => t.milestoneId === firstMs.id)
        .sort((a, b) => a.sortOrder - b.sortOrder)

      if (firstMsTasks.length === 0) continue

      const earliestTaskStart = firstMsTasks[0].startDate
      const projectStart = new Date(project.startDate)

      const gapDays = Math.round(
        (earliestTaskStart.getTime() - projectStart.getTime()) / 86400000
      )

      if (gapDays > 0) {
        await prisma.project.update({
          where: { id: project.id },
          data: { startDate: earliestTaskStart },
        })
        totalFixed++
      }
    }

    return NextResponse.json({
      message: 'Project start dates fixed',
      totalFixed,
    })
  } catch (error) {
    console.error('Fix project starts error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
