import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

type RouteContext = { params: Promise<{ id: string }> }

// ─── POST /api/projects/[id]/reset-baseline — Snapshot milestone dates as new baseline ───
// If body contains `milestones` array, use those dates directly.
// Otherwise, read current milestone dates from DB.

interface ResetBaselineBody {
  milestones?: { id: string; name: string; dueDate: string }[]
}

export async function POST(
  request: NextRequest,
  { params }: RouteContext,
) {
  try {
    const { id } = await params

    const project = await prisma.project.findUnique({
      where: { id },
      include: { milestones: { orderBy: { sortOrder: 'asc' } } },
    })
    if (!project) {
      return NextResponse.json({ error: '找不到專案' }, { status: 404 })
    }

    // Accept milestone dates from request body, or fall back to DB
    let body: ResetBaselineBody = {}
    try { body = await request.json() } catch { /* empty body is OK */ }

    const milestonesToSnapshot = body.milestones && body.milestones.length > 0
      ? body.milestones.map(m => ({
          milestoneId: m.id,
          name: m.name,
          dueDate: new Date(m.dueDate),
        }))
      : project.milestones.map(ms => ({
          milestoneId: ms.id,
          name: ms.name,
          dueDate: ms.dueDate,
        }))

    if (milestonesToSnapshot.length === 0) {
      return NextResponse.json({ error: '專案沒有里程碑，無法建立基線' }, { status: 400 })
    }

    await prisma.$transaction(async (tx) => {
      // Delete existing baselines for this project
      await tx.milestoneBaseline.deleteMany({ where: { projectId: id } })

      // Create new baselines
      for (const ms of milestonesToSnapshot) {
        await tx.milestoneBaseline.create({
          data: {
            projectId: id,
            milestoneId: ms.milestoneId,
            name: ms.name,
            dueDate: ms.dueDate,
          },
        })
      }
    })

    return NextResponse.json({ success: true, message: '基線已重設' })
  } catch (error) {
    console.error('Failed to reset baseline:', error)
    return NextResponse.json({ error: '重設基線失敗' }, { status: 500 })
  }
}
