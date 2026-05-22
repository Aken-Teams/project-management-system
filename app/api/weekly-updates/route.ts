import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// ─── POST /api/weekly-updates ───────────────────────
// Body: { projectId, userId, weekOf, overallStatus, overallNotes, blockers, keyAchievements, nextWeekPlan, milestoneUpdates: [{milestoneId, progress, notes}] }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      projectId,
      userId,
      weekOf,
      overallStatus,
      overallNotes,
      blockers,
      keyAchievements,
      nextWeekPlan,
      milestoneUpdates,
    } = body

    if (!projectId || !userId || !weekOf) {
      return NextResponse.json({ error: '缺少必要欄位' }, { status: 400 })
    }

    const weekOfDate = new Date(weekOf)
    weekOfDate.setHours(0, 0, 0, 0)

    // Check if weekly update already exists for this project+week
    const existing = await prisma.weeklyUpdate.findFirst({
      where: { projectId, weekOf: weekOfDate },
    })

    let weeklyUpdate
    if (existing) {
      // Update existing
      // Delete old milestone updates first
      await prisma.milestoneUpdate.deleteMany({
        where: { weeklyUpdateId: existing.id },
      })

      weeklyUpdate = await prisma.weeklyUpdate.update({
        where: { id: existing.id },
        data: {
          updatedById: userId,
          overallStatus: overallStatus === 'delay' ? 'delay' : 'on_time',
          overallNotes: overallNotes?.trim() || '',
          blockers: blockers?.trim() || '',
          nextWeekPlan: nextWeekPlan?.trim() || '',
          keyAchievements: keyAchievements?.trim() || '',
          milestoneUpdates: {
            create: (milestoneUpdates || []).map((mu: any) => ({
              milestoneId: mu.milestoneId,
              progress: mu.progress ?? 0,
              notes: mu.notes?.trim() || '',
            })),
          },
        },
        include: {
          milestoneUpdates: true,
          updatedBy: { select: { id: true, name: true } },
        },
      })
    } else {
      // Create new
      weeklyUpdate = await prisma.weeklyUpdate.create({
        data: {
          projectId,
          weekOf: weekOfDate,
          updatedById: userId,
          overallStatus: overallStatus === 'delay' ? 'delay' : 'on_time',
          overallNotes: overallNotes?.trim() || '',
          blockers: blockers?.trim() || '',
          nextWeekPlan: nextWeekPlan?.trim() || '',
          keyAchievements: keyAchievements?.trim() || '',
          milestoneUpdates: {
            create: (milestoneUpdates || []).map((mu: any) => ({
              milestoneId: mu.milestoneId,
              progress: mu.progress ?? 0,
              notes: mu.notes?.trim() || '',
            })),
          },
        },
        include: {
          milestoneUpdates: true,
          updatedBy: { select: { id: true, name: true } },
        },
      })
    }

    return NextResponse.json(weeklyUpdate)
  } catch (error) {
    console.error('POST /api/weekly-updates error:', error)
    return NextResponse.json({ error: '儲存週報失敗' }, { status: 500 })
  }
}

// ─── GET /api/weekly-updates?projectId=xxx&weekOf=xxx ───
export async function GET(request: NextRequest) {
  try {
    const projectId = request.nextUrl.searchParams.get('projectId')
    if (!projectId) {
      return NextResponse.json({ error: '需要提供 projectId' }, { status: 400 })
    }

    const weekOfParam = request.nextUrl.searchParams.get('weekOf')
    const where: any = { projectId }
    if (weekOfParam) {
      const weekOfDate = new Date(weekOfParam)
      weekOfDate.setHours(0, 0, 0, 0)
      where.weekOf = weekOfDate
    }

    const updates = await prisma.weeklyUpdate.findMany({
      where,
      include: {
        milestoneUpdates: {
          include: {
            milestone: { select: { id: true, name: true } },
          },
        },
        updatedBy: { select: { id: true, name: true } },
      },
      orderBy: { weekOf: 'desc' },
    })

    return NextResponse.json(updates)
  } catch (error) {
    console.error('GET /api/weekly-updates error:', error)
    return NextResponse.json({ error: '取得週報失敗' }, { status: 500 })
  }
}
