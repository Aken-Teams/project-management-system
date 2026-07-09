import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { notifyRecordUploadedToAccountable } from '@/lib/notifications'

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
// Returns: task logs from R members for the week + R member submission status
export async function GET(request: NextRequest) {
  try {
    const projectId = request.nextUrl.searchParams.get('projectId')
    const weekOfParam = request.nextUrl.searchParams.get('weekOf')

    if (!projectId) {
      return NextResponse.json({ error: '需要提供 projectId' }, { status: 400 })
    }

    const weekOf = weekOfParam
      ? getMondayOfWeek(new Date(weekOfParam))
      : getMondayOfWeek(new Date())

    // Week range: Monday 00:00 ~ Sunday 23:59
    const weekEnd = new Date(weekOf)
    weekEnd.setDate(weekEnd.getDate() + 7)

    // Get all R-role members for this project
    const rMembers = await prisma.projectTeamMember.findMany({
      where: { projectId, role: 'R' },
      select: {
        userId: true,
        user: { select: { id: true, name: true, email: true } },
      },
    })

    const rUserIds = rMembers.map(m => m.userId)

    // Get task logs from R members for this week
    const taskLogs = rUserIds.length > 0
      ? await prisma.taskLog.findMany({
          where: {
            projectId,
            authorId: { in: rUserIds },
            logDate: { gte: weekOf, lt: weekEnd },
          },
          include: {
            author: { select: { id: true, name: true, email: true } },
            task: {
              select: {
                id: true,
                title: true,
                parentId: true,
                milestoneId: true,
                milestone: { select: { id: true, name: true, sortOrder: true } },
              },
            },
          },
          orderBy: [{ logDate: 'asc' }, { createdAt: 'asc' }],
        })
      : []

    // Build submission status: which R members have logs this week
    const submittedUserIds = new Set(taskLogs.map(l => l.authorId))
    const memberStatus = rMembers.map(m => ({
      userId: m.userId,
      name: m.user.name,
      email: m.user.email,
      submitted: submittedUserIds.has(m.userId),
      reportCount: taskLogs.filter(l => l.authorId === m.userId).length,
    }))

    return NextResponse.json({
      weekOf: weekOf.toISOString(),
      reports: taskLogs.map(l => ({
        id: l.id,
        taskId: l.task.id,
        taskTitle: l.task.title,
        isSubtask: !!l.task.parentId,
        milestoneId: l.task.milestoneId,
        milestoneName: l.task.milestone.name,
        userId: l.authorId,
        userName: l.author.name,
        logDate: l.logDate.toISOString().split('T')[0],
        content: l.content,
        nextPlans: l.nextPlans,
        attachments: l.attachments,
        createdAt: l.createdAt,
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

    // R 上傳工作紀錄 → 通知該專案的當責 A
    const proj = await prisma.project.findUnique({ where: { id: projectId }, select: { name: true } })
    await notifyRecordUploadedToAccountable({
      projectId,
      projectName: proj?.name || '專案',
      uploaderName: report.user.name,
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
