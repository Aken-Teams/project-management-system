import { NextRequest, NextResponse } from 'next/server'
import { safeJsonParse } from '@/lib/utils'
import { prisma } from '@/lib/db'
import { isReportVisible } from '@/lib/report-cutoff'
import { autoProgressTasks, syncTaskProgressFromLogs, computeMilestoneStatus, computeWeightedProgress, milestoneCountedTasks } from '@/lib/sync-milestone-status'

// ─── GET /api/my-tasks — Fetch tasks for the current user ────
// Returns all projects where the user is a team member, with their
// milestones, tasks, and task logs. Frontend filters by assignee.

export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('userId')
    const userEmail = request.nextUrl.searchParams.get('userEmail')

    if (!userId && !userEmail) {
      return NextResponse.json(
        { error: '需要提供 userId 或 userEmail' },
        { status: 400 },
      )
    }

    // Resolve user (try userId first, fallback to email)
    let user = userId
      ? await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true } })
      : null
    if (!user && userEmail) {
      user = await prisma.user.findUnique({ where: { email: userEmail }, select: { id: true, name: true } })
    }

    if (!user) {
      return NextResponse.json(
        { error: '找不到使用者' },
        { status: 404 },
      )
    }

    // Find projects where user is a team member (include role for PM detection)
    const memberships = await prisma.projectTeamMember.findMany({
      where: { userId: user.id },
      select: { projectId: true, role: true },
    })
    const projectIds = memberships.map(m => m.projectId)
    const membershipRoleMap = new Map(memberships.map(m => [m.projectId, m.role]))

    if (projectIds.length === 0) {
      return NextResponse.json({ user, projects: [] })
    }

    // Fetch projects with milestones, ALL tasks (for dependency analysis), task logs, and pending delay requests
    const projects = await prisma.project.findMany({
      where: { id: { in: projectIds } },
      select: {
        id: true,
        name: true,
        startDate: true,
        milestones: {
          orderBy: { sortOrder: 'asc' },
          select: { id: true, name: true, dueDate: true, status: true, progress: true, sortOrder: true },
        },
        tasks: {
          include: {
            dependsOn: true,
            children: {
              select: { id: true, title: true, status: true, progress: true, assignee: true, startDate: true, endDate: true, priority: true, durationDays: true, completedAt: true, completedBy: true },
              orderBy: { sortOrder: 'asc' },
            },
            reviewEvents: {
              orderBy: { createdAt: 'desc' },
              select: { id: true, type: true, actor: true, note: true, createdAt: true },
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
        taskLogs: {
          include: { author: true },
          orderBy: { createdAt: 'desc' },
        },
        teamMembers: {
          select: { userId: true, reportReviewerName: true, reportReviewerEmail: true, user: { select: { name: true } } },
        },
        delayRequests: {
          where: { status: 'pending' },
          select: {
            id: true,
            affectedMilestones: {
              select: { milestoneId: true, proposedDate: true },
            },
          },
        },
      },
    })

    // ── Auto-progress, compute progress from logs, sync milestones ──
    for (const p of projects) {
      // 甘特/進度「一律以 A 為主」：只吃 A 已發布(publishedAt)或舊資料(7/12 前建檔)的紀錄，R 生料不驅動進度/狀態。
      const pPublishedLogs = p.taskLogs.filter(isReportVisible)

      // 1. Compute task progress from task-log coverage FIRST (before autoProgress
      //    reads fresh progress to decide todo→in_progress vs blocked — Bug #10)
      await syncTaskProgressFromLogs(p.tasks, pPublishedLogs)

      // 2. Auto-progress: check deps, logs, startDate to set in_progress/blocked/todo
      await autoProgressTasks(p.tasks, pPublishedLogs)

      // 3. Re-sync milestone statuses — 聚合任務(排除無指派人純聚合父層，與 syncMilestoneStatus 一致)
      for (const ms of p.milestones) {
        const allMsTasks = p.tasks.filter(t => t.milestoneId === ms.id)
        if (allMsTasks.length === 0) continue
        const msTasks = milestoneCountedTasks(allMsTasks)
        const correctStatus = computeMilestoneStatus(msTasks)
        const correctProgress = computeWeightedProgress(msTasks)
        if (ms.status !== correctStatus || ms.progress !== correctProgress) {
          await prisma.milestone.update({
            where: { id: ms.id },
            data: { status: correctStatus, progress: correctProgress },
          })
          ;(ms as { status: string }).status = correctStatus
          ;(ms as { progress: number }).progress = correctProgress
        }
      }
    }

    // Transform to frontend format
    const feProjects = projects
      .map(p => ({
        id: p.id,
        name: p.name,
        startDate: p.startDate.toISOString().split('T')[0],
        userRole: membershipRoleMap.get(p.id) || 'other',
        milestones: p.milestones.map(m => ({
          id: m.id,
          name: m.name,
          dueDate: m.dueDate.toISOString().split('T')[0],
          status: m.status === 'in_progress' ? 'in-progress' : m.status,
          progress: m.progress,
          sortOrder: m.sortOrder,
        })),
        tasks: p.tasks.map(t => ({
          id: t.id,
          projectId: p.id,
          milestoneId: t.milestoneId,
          title: t.title,
          description: t.description,
          assignee: t.assignee,
          status: t.status === 'in_progress' ? 'in-progress' : t.status,
          priority: t.priority,
          durationDays: t.durationDays,
          startDate: t.startDate.toISOString().split('T')[0],
          endDate: t.endDate.toISOString().split('T')[0],
          dependencies: (t.dependsOn || []).map(d => d.prerequisiteId),
          progress: t.progress,
          parentId: t.parentId || null,
          assignedAt: t.assignedAt ? t.assignedAt.toISOString().split('T')[0] : null,
          reportedDoneAt: t.reportedDoneAt ? t.reportedDoneAt.toISOString().split('T')[0] : null,
          reportedDoneBy: t.reportedDoneBy || null,
          reviewedAt: t.reviewedAt ? t.reviewedAt.toISOString().split('T')[0] : null,
          reviewedBy: t.reviewedBy || null,
          subtasks: ((t as Record<string, unknown>).children as Array<Record<string, unknown>> || []).map((c: Record<string, unknown>) => ({
            id: c.id,
            title: c.title,
            status: c.status === 'in_progress' ? 'in-progress' : c.status,
            progress: c.progress,
            assignee: c.assignee,
            startDate: (c.startDate as Date).toISOString().split('T')[0],
            endDate: (c.endDate as Date).toISOString().split('T')[0],
            priority: c.priority,
            durationDays: c.durationDays as number,
            ...(c.completedAt ? { completedAt: (c.completedAt as Date).toISOString().split('T')[0] } : {}),
            ...(c.completedBy ? { completedBy: c.completedBy } : {}),
          })),
          ...(t.completedAt ? { completedAt: t.completedAt.toISOString().split('T')[0] } : {}),
          ...(t.completedBy ? { completedBy: t.completedBy } : {}),
        })),
        taskLogs: p.taskLogs.map(tl => ({
          id: tl.id,
          taskId: tl.taskId,
          projectId: p.id,
          author: tl.author.name,
          authorId: tl.authorId,
          logDate: tl.logDate.toISOString().split('T')[0],
          content: tl.content,
          createdAt: tl.createdAt.toISOString(),
          updatedAt: tl.updatedAt.toISOString(),
          lastEditedBy: tl.lastEditedBy || null,
          publishedAt: tl.publishedAt ? tl.publishedAt.toISOString() : null,
          weekOf: tl.weekOf || null,
          reviewerRejectedAt: tl.reviewerRejectedAt ? tl.reviewerRejectedAt.toISOString() : null,
          reviewerNote: tl.reviewerNote || null,
          // 該報告作者(R)在此專案的報告審核主管(R主管)，供 A 端顯示「主管審核中」與追蹤
          authorReviewerName: (() => { const m = p.teamMembers.find(tm => tm.userId === tl.authorId); return m?.reportReviewerName || m?.reportReviewerEmail || null })(),
          ...(tl.nextPlans ? { nextPlans: safeJsonParse(tl.nextPlans, [] as unknown[]) } : {}),
          ...(tl.attachments ? { attachments: safeJsonParse(tl.attachments, [] as unknown[]) } : {}),
        })),
        // 每位成員在此專案的報告審核主管（null = 未指定 → 後端送出時 fallback 由當責 A 代審）。
        // 前端流程圖靠它決定「要不要畫 R主管審核那一棒」，避免把沒有主管的報告標成「主管審核中」卡死。
        memberReviewers: p.teamMembers.map(tm => ({
          name: tm.user.name,
          reviewer: tm.reportReviewerName || tm.reportReviewerEmail || null,
        })),
        reviewEvents: p.tasks.flatMap(t =>
          ((t as Record<string, unknown>).reviewEvents as Array<{ id: string; type: string; actor: string; note: string | null; createdAt: Date }> || []).map(e => ({
            id: e.id,
            taskId: t.id,
            taskTitle: t.title,
            // 麵包屑脈絡：里程碑 › 上層任務 › …（同名工站分屬不同實驗/父層，靠這條分辨是哪一個）
            path: (() => {
              const parts: string[] = []
              let cur: typeof p.tasks[number] | undefined = t.parentId ? p.tasks.find(pt => pt.id === t.parentId) : undefined
              while (cur) {
                parts.unshift(cur.title)
                const pid: string | null = cur.parentId
                cur = pid ? p.tasks.find(pt => pt.id === pid) : undefined
              }
              const ms = p.milestones.find(m => m.id === t.milestoneId)
              if (ms) parts.unshift(ms.name)
              return parts.length ? parts.join(' › ') : null
            })(),
            assignee: t.assignee,
            type: e.type,
            actor: e.actor,
            note: e.note || null,
            createdAt: e.createdAt.toISOString(),
          }))
        ),
        pendingDelayMilestoneIds: [
          ...new Set(
            p.delayRequests.flatMap(dr => dr.affectedMilestones.map(am => am.milestoneId))
          ),
        ],
        pendingDelayProposedDates: Object.fromEntries(
          p.delayRequests.flatMap(dr =>
            dr.affectedMilestones.map(am => [
              am.milestoneId,
              am.proposedDate.toISOString().split('T')[0],
            ])
          )
        ),
      }))

    return NextResponse.json({ user, projects: feProjects })
  } catch (error) {
    console.error('Failed to fetch my tasks:', error)
    return NextResponse.json(
      { error: '讀取我的任務失敗' },
      { status: 500 },
    )
  }
}
