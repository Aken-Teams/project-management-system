import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { autoProgressTasks, syncTaskProgressFromLogs, computeMilestoneStatus } from '@/lib/sync-milestone-status'

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

    // Find projects where user is a team member
    const memberships = await prisma.projectTeamMember.findMany({
      where: { userId: user.id },
      select: { projectId: true },
    })
    const projectIds = memberships.map(m => m.projectId)

    if (projectIds.length === 0) {
      return NextResponse.json({ user, projects: [] })
    }

    // Fetch projects with milestones, ALL tasks (for dependency analysis), and task logs
    const projects = await prisma.project.findMany({
      where: { id: { in: projectIds } },
      select: {
        id: true,
        name: true,
        milestones: {
          orderBy: { sortOrder: 'asc' },
          select: { id: true, name: true, dueDate: true, status: true, progress: true },
        },
        tasks: {
          include: { dependsOn: true },
          orderBy: { sortOrder: 'asc' },
        },
        taskLogs: {
          include: { author: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    })

    // ── Auto-progress, compute progress from logs, sync milestones ──
    for (const p of projects) {
      // 1. Auto-progress: check deps, logs, startDate to set in_progress/blocked/todo
      await autoProgressTasks(p.tasks, p.taskLogs)

      // 2. Compute task progress from task-log coverage
      await syncTaskProgressFromLogs(p.tasks, p.taskLogs)

      // 3. Re-sync milestone statuses (now includes blocked)
      for (const ms of p.milestones) {
        const msTasks = p.tasks.filter(t => t.milestoneId === ms.id)
        if (msTasks.length === 0) continue
        const correctStatus = computeMilestoneStatus(msTasks)
        const correctProgress = Math.round(msTasks.reduce((s, t) => s + t.progress, 0) / msTasks.length)
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
      .filter(p => p.tasks.length > 0)
      .map(p => ({
        id: p.id,
        name: p.name,
        milestones: p.milestones.map(m => ({
          id: m.id,
          name: m.name,
          dueDate: m.dueDate.toISOString().split('T')[0],
          status: m.status === 'in_progress' ? 'in-progress' : m.status,
          progress: m.progress,
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
          durationWeeks: t.durationWeeks,
          startDate: t.startDate.toISOString().split('T')[0],
          endDate: t.endDate.toISOString().split('T')[0],
          dependencies: (t.dependsOn || []).map(d => d.prerequisiteId),
          progress: t.progress,
          ...(t.completedAt ? { completedAt: t.completedAt.toISOString().split('T')[0] } : {}),
          ...(t.completedBy ? { completedBy: t.completedBy } : {}),
        })),
        taskLogs: p.taskLogs.map(tl => ({
          id: tl.id,
          taskId: tl.taskId,
          projectId: p.id,
          author: tl.author.name,
          logDate: tl.logDate.toISOString().split('T')[0],
          content: tl.content,
          createdAt: tl.createdAt.toISOString(),
        })),
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
