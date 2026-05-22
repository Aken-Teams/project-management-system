import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { projectTypeToFe } from '@/lib/enum-mappers'

// ─── Auto-compute project status & progress from tasks ─────
interface FeTask {
  status: string
  progress: number
  endDate: string
}

function computeProjectProgress(milestones: { progress: number }[]): number {
  if (milestones.length === 0) return 0
  const total = milestones.reduce((sum, m) => sum + m.progress, 0)
  return Math.round(total / milestones.length)
}

function computeProjectStatus(
  tasks: FeTask[],
  projectEndDate: Date,
): 'green' | 'yellow' | 'red' {
  if (tasks.length === 0) return 'green'

  const today = new Date().toISOString().split('T')[0]
  const overdueTasks = tasks.filter(t => t.status !== 'done' && t.endDate < today)
  const blockedTasks = tasks.filter(t => t.status === 'blocked')
  const doneTasks = tasks.filter(t => t.status === 'done')

  // All done → green
  if (doneTasks.length === tasks.length) return 'green'

  const overdueRatio = overdueTasks.length / tasks.length
  const blockedRatio = blockedTasks.length / tasks.length

  // Red: >30% overdue or >20% blocked, or project end date passed
  const projectEnd = projectEndDate.toISOString().split('T')[0]
  if (overdueRatio > 0.3 || blockedRatio > 0.2 || (projectEnd < today && doneTasks.length < tasks.length)) {
    return 'red'
  }

  // Yellow: any overdue or blocked tasks
  if (overdueTasks.length > 0 || blockedTasks.length > 0) {
    return 'yellow'
  }

  return 'green'
}

// ─── GET /api/reports — Get reports data ───
export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('userId')
    const userEmail = request.nextUrl.searchParams.get('userEmail')
    const projectId = request.nextUrl.searchParams.get('projectId') // Optional: filter by specific project

    if (!userId && !userEmail) {
      return NextResponse.json(
        { error: '需要提供 userId 或 userEmail' },
        { status: 400 },
      )
    }

    // Resolve user (try ID first, fallback to email, auto-create if needed)
    let user = userId
      ? await prisma.user.findUnique({ where: { id: userId } })
      : null
    if (!user && userEmail) {
      user = await prisma.user.findUnique({ where: { email: userEmail } })
    }
    if (!user && userEmail) {
      const userName = request.nextUrl.searchParams.get('userName')
      user = await prisma.user.create({
        data: {
          name: userName || userEmail.split('@')[0],
          email: userEmail,
          role: 'member',
        },
      })
    }

    if (!user) {
      return NextResponse.json(
        { error: '找不到使用者' },
        { status: 404 },
      )
    }

    // ── Determine which projects the user can see ──
    let projectIds: string[] = []

    if (user.role === 'member') {
      // Members only see projects they're part of
      const memberships = await prisma.projectTeamMember.findMany({
        where: { userId: user.id },
        select: { projectId: true },
      })
      projectIds = memberships.map(m => m.projectId)
    } else {
      // PMs and executives see all projects
      const allProjects = await prisma.project.findMany({
        select: { id: true },
      })
      projectIds = allProjects.map(p => p.id)
    }

    // Filter by specific project if requested
    if (projectId && projectIds.includes(projectId)) {
      projectIds = [projectId]
    }

    if (projectIds.length === 0) {
      return NextResponse.json({
        user: { id: user.id, name: user.name, role: user.role },
        stats: {
          totalProjects: 0,
          totalTasks: 0,
          doneTasks: 0,
          inProgressTasks: 0,
          blockedTasks: 0,
          todoTasks: 0,
          totalMilestones: 0,
          doneMilestones: 0,
          budget: 0,
          budgetUsed: 0,
          openRisks: 0,
          pendingDelays: 0,
          teamSize: 0,
          progress: 0,
        },
        statusDistribution: { green: 0, yellow: 0, red: 0 },
        projects: [],
        teamWorkload: [],
      })
    }

    // ── Fetch all project data ──
    const projects = await prisma.project.findMany({
      where: { id: { in: projectIds } },
      include: {
        milestones: {
          orderBy: { sortOrder: 'asc' },
        },
        tasks: {
          orderBy: { sortOrder: 'asc' },
        },
        risks: {
          where: { status: 'open' },
        },
        weeklyUpdates: {
          orderBy: { weekOf: 'desc' },
        },
        delayRequests: {
          where: { status: 'pending' },
        },
        teamMembers: {
          include: {
            user: {
              select: { name: true },
            },
          },
        },
        owner: {
          select: { name: true },
        },
        budgetItems: {
          select: { actualCost: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    // ── Calculate actual status & progress for each project from tasks ──
    const projectsWithProgress = projects.map(p => {
      // Convert parent tasks only to frontend format for status calculation
      const parentTasks = p.tasks.filter(t => !t.parentId)
      const feTasks = parentTasks.map(t => ({
        status: t.status === 'in_progress' ? 'in-progress' : t.status,
        progress: t.progress,
        endDate: t.endDate.toISOString().split('T')[0],
      }))

      // Compute actual status (parent tasks only) and progress (milestone-based)
      const actualStatus = computeProjectStatus(feTasks, p.endDate)
      const actualProgress = computeProjectProgress(p.milestones)

      return { ...p, actualStatus, actualProgress }
    })

    // ── Aggregate statistics (parent tasks only) ──
    const totalTasks = projectsWithProgress.reduce((a, p) => a + p.tasks.filter(t => !t.parentId).length, 0)
    const doneTasks = projectsWithProgress.reduce((a, p) => a + p.tasks.filter(t => !t.parentId && t.status === 'done').length, 0)
    const inProgressTasks = projectsWithProgress.reduce((a, p) => a + p.tasks.filter(t => !t.parentId && t.status === 'in_progress').length, 0)
    const blockedTasks = projectsWithProgress.reduce((a, p) => a + p.tasks.filter(t => !t.parentId && t.status === 'blocked').length, 0)
    const todoTasks = totalTasks - doneTasks - inProgressTasks - blockedTasks

    const totalMilestones = projectsWithProgress.reduce((a, p) => a + p.milestones.length, 0)
    const doneMilestones = projectsWithProgress.reduce((a, p) => a + p.milestones.filter(m => m.status === 'done').length, 0)

    const budget = projectsWithProgress.reduce((a, p) => a + p.budget, 0)
    const budgetUsed = projectsWithProgress.reduce((a, p) =>
      a + p.budgetItems.reduce((s: number, i: { actualCost: number | null }) => s + (i.actualCost ?? 0), 0), 0)
    const openRisks = projectsWithProgress.reduce((a, p) => a + p.risks.length, 0)
    const pendingDelays = projectsWithProgress.reduce((a, p) => a + p.delayRequests.length, 0)

    // Calculate unique team members
    const allTeamMembers = new Set<string>()
    projectsWithProgress.forEach(p => {
      p.teamMembers.forEach(tm => allTeamMembers.add(tm.user.name))
    })
    const teamSize = allTeamMembers.size

    const progress = projectsWithProgress.length > 0
      ? Math.round(projectsWithProgress.reduce((a, p) => a + p.actualProgress, 0) / projectsWithProgress.length)
      : 0

    // ── Status distribution ──
    const statusDistribution = {
      green: projectsWithProgress.filter(p => p.actualStatus === 'green').length,
      yellow: projectsWithProgress.filter(p => p.actualStatus === 'yellow').length,
      red: projectsWithProgress.filter(p => p.actualStatus === 'red').length,
    }

    // ── Team workload ──
    const workloadMap = new Map<string, { total: number; done: number }>()
    projectsWithProgress.forEach(p => {
      p.tasks.forEach(t => {
        const entry = workloadMap.get(t.assignee) || { total: 0, done: 0 }
        entry.total++
        if (t.status === 'done') entry.done++
        workloadMap.set(t.assignee, entry)
      })
    })

    const teamWorkload = [...workloadMap.entries()]
      .map(([name, data]) => ({
        name,
        total: data.total,
        done: data.done,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10) // Top 10 members

    // ── Transform projects to frontend format ──
    const feProjects = projectsWithProgress.map(p => {
      const parentTasks = p.tasks.filter(t => !t.parentId)
      const doneTasks = parentTasks.filter(t => t.status === 'done').length
      const inProgressTasks = parentTasks.filter(t => t.status === 'in_progress').length
      const blockedTasks = parentTasks.filter(t => t.status === 'blocked').length
      const todoTasks = parentTasks.filter(t => t.status === 'todo').length
      const doneMilestones = p.milestones.filter(m => m.status === 'done').length

      // Find the Accountable (A) member from team, fallback to project owner
      const accountableMember = p.teamMembers.find((tm) => tm.role === 'A')
      const displayOwner = accountableMember ? accountableMember.user.name : p.owner.name

      // Calculate team workload for this project
      const projectWorkloadMap = new Map<string, { total: number; done: number }>()
      p.tasks.forEach(t => {
        const entry = projectWorkloadMap.get(t.assignee) || { total: 0, done: 0 }
        entry.total++
        if (t.status === 'done') entry.done++
        projectWorkloadMap.set(t.assignee, entry)
      })
      const projectTeamWorkload = [...projectWorkloadMap.entries()]
        .map(([name, data]) => ({ name, total: data.total, done: data.done }))
        .sort((a, b) => b.total - a.total)

      return {
        id: p.id,
        projectCode: p.projectCode,
        name: p.name,
        projectType: projectTypeToFe(p.projectType),
        projectTier: p.projectTier,
        status: p.actualStatus,
        progress: p.actualProgress,
        owner: displayOwner,
        startDate: p.startDate.toISOString().split('T')[0],
        endDate: p.endDate.toISOString().split('T')[0],
        budget: p.budget,
        budgetUsed: p.budgetItems.reduce((s: number, i: { actualCost: number | null }) => s + (i.actualCost ?? 0), 0),
        teamSize: p.teamMembers.length,
        totalTasks: parentTasks.length,
        doneTasks,
        inProgressTasks,
        blockedTasks,
        todoTasks,
        totalMilestones: p.milestones.length,
        doneMilestones,
        openRisks: p.risks.length,
        weeklyUpdatesCount: p.weeklyUpdates.length,
        milestones: p.milestones.map(m => ({
          id: m.id,
          name: m.name,
          status: m.status === 'in_progress' ? 'in-progress' : m.status,
          progress: m.progress,
          dueDate: m.dueDate.toISOString().split('T')[0],
        })),
        risks: p.risks.map(r => ({
          id: r.id,
          title: r.title,
          impact: r.impact,
          status: r.status,
        })),
        teamWorkload: projectTeamWorkload,
      }
    })

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
      },
      stats: {
        totalProjects: projectsWithProgress.length,
        totalTasks,
        doneTasks,
        inProgressTasks,
        blockedTasks,
        todoTasks,
        totalMilestones,
        doneMilestones,
        budget,
        budgetUsed,
        openRisks,
        pendingDelays,
        teamSize,
        progress,
      },
      statusDistribution,
      projects: feProjects,
      teamWorkload,
    })
  } catch (error) {
    console.error('Failed to fetch reports data:', error)
    return NextResponse.json(
      { error: '讀取報告資料失敗' },
      { status: 500 },
    )
  }
}
