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

// ─── GET /api/dashboard — Get dashboard data for current user ───
export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('userId')
    const userEmail = request.nextUrl.searchParams.get('userEmail')
    const tierFilter = request.nextUrl.searchParams.get('tier') // T1, T2, T3, CIP
    const fromFilter = request.nextUrl.searchParams.get('from') // e.g. "2026-01-01"
    const toFilter = request.nextUrl.searchParams.get('to')     // e.g. "2026-12-31"

    if (!userId && !userEmail) {
      return NextResponse.json(
        { error: '需要提供 userId 或 userEmail' },
        { status: 400 },
      )
    }

    // Resolve user
    let user = userId
      ? await prisma.user.findUnique({ where: { id: userId } })
      : null
    if (!user && userEmail) {
      user = await prisma.user.findUnique({ where: { email: userEmail } })
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

    if (projectIds.length === 0) {
      return NextResponse.json({
        user: { id: user.id, name: user.name, role: user.role },
        stats: {
          total: 0,
          green: 0,
          yellow: 0,
          red: 0,
          tierCounts: { T1: 0, T2: 0, T3: 0, CIP: 0 },
          totalBudget: 0,
          totalBudgetUsed: 0,
          budgetUtilization: 0,
        },
        projects: [],
        openRisks: [],
        upcomingMilestones: [],
        missingUpdates: [],
        pendingApprovals: 0,
      })
    }

    // ── Fetch all project data ──
    const projects = await prisma.project.findMany({
      where: {
        id: { in: projectIds },
        ...(tierFilter ? { projectTier: tierFilter as never } : {}),
        ...(fromFilter && toFilter ? {
          startDate: { lte: new Date(`${toFilter}T23:59:59.999Z`) },
          endDate: { gte: new Date(`${fromFilter}T00:00:00.000Z`) },
        } : {}),
      },
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
        taskLogs: {
          orderBy: { logDate: 'desc' },
          take: 20,
          select: { logDate: true, author: { select: { name: true } } },
        },
        owner: {
          select: { name: true },
        },
        teamMembers: {
          include: {
            user: {
              select: { name: true },
            },
          },
        },
        budgetItems: {
          select: { actualCost: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    // ── Calculate actual status & progress for each project from tasks ──
    const projectsWithProgress = projects.map(p => {
      // Convert tasks to frontend format for status calculation
      const parentTasks = p.tasks.filter(t => !t.parentId)
      const feTasks = parentTasks.map(t => ({
        status: t.status === 'in_progress' ? 'in-progress' : t.status,
        progress: t.progress,
        endDate: t.endDate.toISOString().split('T')[0],
      }))

      // Compute actual status and progress (parent tasks only + milestone-based progress)
      const actualStatus = computeProjectStatus(feTasks, p.endDate)
      const actualProgress = computeProjectProgress(p.milestones)

      return { ...p, actualStatus, actualProgress }
    })

    // ── Calculate statistics using actual status & progress ──
    const stats = {
      total: projectsWithProgress.length,
      green: projectsWithProgress.filter(p => p.actualStatus === 'green').length,
      yellow: projectsWithProgress.filter(p => p.actualStatus === 'yellow').length,
      red: projectsWithProgress.filter(p => p.actualStatus === 'red').length,
      tierCounts: {
        T1: projectsWithProgress.filter(p => p.projectTier === 'T1').length,
        T2: projectsWithProgress.filter(p => p.projectTier === 'T2').length,
        T3: projectsWithProgress.filter(p => p.projectTier === 'T3').length,
        CIP: projectsWithProgress.filter(p => p.projectTier === 'CIP').length,
      },
      totalBudget: projectsWithProgress.reduce((acc, p) => acc + p.budget, 0),
      totalBudgetUsed: projectsWithProgress.reduce((acc, p) =>
        acc + p.budgetItems.reduce((s: number, i: { actualCost: number | null }) => s + (i.actualCost ?? 0), 0), 0),
      budgetUtilization: 0,
    }
    stats.budgetUtilization = stats.totalBudget > 0
      ? Math.round((stats.totalBudgetUsed / stats.totalBudget) * 100)
      : 0

    // ── Transform projects to frontend format ──
    const feProjects = projectsWithProgress.map(p => {
      // Find the Accountable (A) member from team, fallback to project owner
      const accountableMember = p.teamMembers.find((tm) => tm.role === 'A')
      const displayOwner = accountableMember ? accountableMember.user.name : p.owner.name

      return {
        id: p.id,
        projectCode: p.projectCode,
        name: p.name,
        projectType: projectTypeToFe(p.projectType),
        projectTier: p.projectTier,
        status: p.actualStatus,
        progress: p.actualProgress,
        owner: displayOwner,
      }
    })

    // ── Open risks (high priority for executives) ──
    // For each red/yellow project, if it has open risks, show them;
    // otherwise, create a synthetic risk entry indicating the project status itself
    const openRisks = projectsWithProgress
      .filter(p => p.actualStatus === 'red' || p.actualStatus === 'yellow')
      .flatMap(p => {
        const risks = p.risks.filter(r => user.role !== 'executive' || r.impact === 'high')

        if (risks.length > 0) {
          // Has explicit risk records
          return risks.map(risk => ({
            id: risk.id,
            projectId: p.id,
            projectName: p.name,
            title: risk.title,
            description: risk.description,
            impact: risk.impact,
            probability: risk.probability,
            mitigation: risk.mitigation,
          }))
        } else {
          // No explicit risks but project is red/yellow - show project status as risk
          return [{
            id: `project-status-${p.id}`,
            projectId: p.id,
            projectName: p.name,
            title: p.actualStatus === 'red' ? '專案處於風險狀態' : '專案需要注意',
            description: '專案狀態異常，但尚未建立具體風險項目',
            impact: p.actualStatus === 'red' ? 'high' : 'medium',
            probability: 'medium',
            mitigation: '請檢查專案進度並建立具體風險項目',
          }]
        }
      })

    // ── Upcoming milestones (within 30 days, not done) ──
    const today = new Date()
    const upcomingMilestones = projectsWithProgress
      .flatMap(p =>
        p.milestones
          .filter(m => m.status !== 'done')
          .map(m => {
            const due = new Date(m.dueDate)
            const diffDays = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
            return {
              id: m.id,
              projectId: p.id,
              projectName: p.name,
              projectStatus: p.actualStatus,
              name: m.name,
              dueDate: m.dueDate.toISOString().split('T')[0],
              diffDays,
            }
          })
      )
      .filter(m => m.diffDays <= 30)
      .sort((a, b) => a.diffDays - b.diffDays)

    // ── Projects missing this week's task log activity ──
    const getMonday = (d: Date) => {
      const day = d.getDay()
      const diff = d.getDate() - day + (day === 0 ? -6 : 1)
      const monday = new Date(d.getFullYear(), d.getMonth(), diff)
      monday.setHours(0, 0, 0, 0)
      return monday
    }
    const thisMonday = getMonday(today)
    const nextMonday = new Date(thisMonday)
    nextMonday.setDate(nextMonday.getDate() + 7)

    const twoWeeksLater = new Date(nextMonday)
    twoWeeksLater.setDate(twoWeeksLater.getDate() + 14)

    const missingUpdates = projectsWithProgress
      .filter(p => {
        // Only flag projects that have active work this week
        const hasActiveWork =
          // In-progress tasks
          p.tasks.some(t => !t.parentId && t.status === 'in_progress') ||
          // Todo tasks whose date range overlaps this week
          p.tasks.some(t => {
            if (t.parentId || t.status !== 'todo') return false
            const start = t.startDate ? new Date(t.startDate) : null
            const end = t.endDate ? new Date(t.endDate) : null
            return start && end && start < nextMonday && end >= thisMonday
          }) ||
          // Milestones not done with dueDate coming up within 2 weeks
          p.milestones.some(m => {
            const due = new Date(m.dueDate)
            return m.status !== 'done' && due >= thisMonday && due <= twoWeeksLater
          })

        if (!hasActiveWork) return false

        // Check if any task log was recorded this week
        const hasThisWeekLog = p.taskLogs.some(l => {
          const logDate = new Date(l.logDate)
          return logDate >= thisMonday && logDate < nextMonday
        })
        return !hasThisWeekLog
      })
      .map(p => {
        const accountableMember = p.teamMembers.find((tm) => tm.role === 'A')
        const displayOwner = accountableMember ? accountableMember.user.name : p.owner.name

        return {
          id: p.id,
          name: p.name,
          status: p.actualStatus,
          owner: displayOwner,
          lastUpdateWeekOf: p.taskLogs[0]?.logDate.toISOString().split('T')[0] || null,
        }
      })

    // ── Pending approvals (for PM and executives only) ──
    let pendingApprovals = 0
    if (user.role === 'pm' || user.role === 'executive') {
      const pendingCount = await prisma.delayRequest.count({
        where: {
          status: 'pending',
          project: { id: { in: projectIds } },
        },
      })
      pendingApprovals = pendingCount
    }

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
      },
      stats,
      projects: feProjects,
      openRisks,
      upcomingMilestones,
      missingUpdates,
      pendingApprovals,
    })
  } catch (error) {
    console.error('Failed to fetch dashboard data:', error)
    return NextResponse.json(
      { error: '讀取儀表板資料失敗' },
      { status: 500 },
    )
  }
}
