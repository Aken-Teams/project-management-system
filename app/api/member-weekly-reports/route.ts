import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

function getMondayOfWeek(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}

// ─── GET /api/member-weekly-reports ────────────────────────
// Query params:
//   projectId (required) — the project to fetch reports for
//   weekOf (optional) — ISO date string, defaults to current week's Monday
//   userId (optional) — filter by specific user
// Returns: reports for the week + list of R members with submission status
export async function GET(request: NextRequest) {
  try {
    const projectId = request.nextUrl.searchParams.get('projectId')
    const weekOfParam = request.nextUrl.searchParams.get('weekOf')
    const userId = request.nextUrl.searchParams.get('userId')

    if (!projectId) {
      return NextResponse.json({ error: '需要提供 projectId' }, { status: 400 })
    }

    const weekOf = weekOfParam
      ? getMondayOfWeek(new Date(weekOfParam))
      : getMondayOfWeek(new Date())

    // Get all R-role members for this project
    const rMembers = await prisma.projectTeamMember.findMany({
      where: { projectId, role: 'R' },
      select: {
        userId: true,
        user: { select: { id: true, name: true, email: true } },
      },
    })

    // Get submitted reports for this week
    const whereClause: any = { projectId, weekOf }
    if (userId) whereClause.userId = userId

    // Check if model exists (Prisma client may need regeneration / dev server restart)
    if (!prisma.memberWeeklyReport) {
      return NextResponse.json({ reports: [], memberStatus: [], totalRMembers: rMembers.length, submittedCount: 0, weekOf: weekOf.toISOString() })
    }

    const reports = await prisma.memberWeeklyReport.findMany({
      where: whereClause,
      include: {
        user: { select: { id: true, name: true, email: true } },
        milestone: { select: { id: true, name: true, dueDate: true, sortOrder: true } },
      },
      orderBy: [{ milestone: { sortOrder: 'asc' } }, { user: { name: 'asc' } }],
    })

    // Build submission status: which R members have submitted / not yet
    const submittedUserIds = new Set(reports.map(r => r.userId))
    const memberStatus = rMembers.map(m => ({
      userId: m.userId,
      name: m.user.name,
      email: m.user.email,
      submitted: submittedUserIds.has(m.userId),
      reportCount: reports.filter(r => r.userId === m.userId).length,
    }))

    return NextResponse.json({
      weekOf: weekOf.toISOString(),
      reports: reports.map(r => ({
        id: r.id,
        milestoneId: r.milestoneId,
        milestoneName: r.milestone.name,
        milestoneDueDate: r.milestone.dueDate,
        userId: r.userId,
        userName: r.user.name,
        content: r.content,
        progress: r.progress,
        blockers: r.blockers,
        nextPlan: r.nextPlan,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
      memberStatus,
      totalRMembers: rMembers.length,
      submittedCount: memberStatus.filter(m => m.submitted).length,
    })
  } catch (error) {
    console.error('GET /api/member-weekly-reports error:', error)
    return NextResponse.json({ error: '取得報告失敗' }, { status: 500 })
  }
}

// ─── POST /api/member-weekly-reports ───────────────────────
// Body: { projectId, milestoneId, userId, weekOf?, content, progress?, blockers?, nextPlan? }
// Creates or updates the report for the given user/milestone/week
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { projectId, milestoneId, userId, weekOf: weekOfParam, content, progress, blockers, nextPlan } = body

    if (!projectId || !milestoneId || !userId || !content?.trim()) {
      return NextResponse.json({ error: '缺少必要欄位' }, { status: 400 })
    }

    const weekOf = weekOfParam
      ? getMondayOfWeek(new Date(weekOfParam))
      : getMondayOfWeek(new Date())

    // Verify user is R-role in this project
    const membership = await prisma.projectTeamMember.findFirst({
      where: { projectId, userId, role: 'R' },
    })
    if (!membership) {
      return NextResponse.json({ error: '只有 R 角色可以填寫週報' }, { status: 403 })
    }

    // Upsert the report
    const report = await prisma.memberWeeklyReport.upsert({
      where: {
        projectId_milestoneId_userId_weekOf: {
          projectId,
          milestoneId,
          userId,
          weekOf,
        },
      },
      update: {
        content: content.trim(),
        progress: progress ?? 0,
        blockers: blockers?.trim() ?? '',
        nextPlan: nextPlan?.trim() ?? '',
      },
      create: {
        projectId,
        milestoneId,
        userId,
        weekOf,
        content: content.trim(),
        progress: progress ?? 0,
        blockers: blockers?.trim() ?? '',
        nextPlan: nextPlan?.trim() ?? '',
      },
      include: {
        user: { select: { id: true, name: true } },
        milestone: { select: { id: true, name: true } },
      },
    })

    return NextResponse.json(report)
  } catch (error) {
    console.error('POST /api/member-weekly-reports error:', error)
    return NextResponse.json({ error: '儲存報告失敗' }, { status: 500 })
  }
}

// ─── DELETE /api/member-weekly-reports?id=xxx ───────────────
export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: '需要提供 id' }, { status: 400 })
    }

    await prisma.memberWeeklyReport.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/member-weekly-reports error:', error)
    return NextResponse.json({ error: '刪除失敗' }, { status: 500 })
  }
}
