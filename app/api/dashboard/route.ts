import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// ─── GET /api/dashboard — Get dashboard data for current user ───
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
          avgProgress: 0,
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
          take: 5, // Only need recent updates
        },
        owner: {
          select: { name: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    // ── Calculate statistics ──
    const stats = {
      total: projects.length,
      green: projects.filter(p => p.status === 'green').length,
      yellow: projects.filter(p => p.status === 'yellow').length,
      red: projects.filter(p => p.status === 'red').length,
      avgProgress: projects.length > 0
        ? Math.round(projects.reduce((acc, p) => acc + p.progress, 0) / projects.length)
        : 0,
      totalBudget: projects.reduce((acc, p) => acc + p.budget, 0),
      totalBudgetUsed: projects.reduce((acc, p) => acc + p.budgetUsed, 0),
      budgetUtilization: 0,
    }
    stats.budgetUtilization = stats.totalBudget > 0
      ? Math.round((stats.totalBudgetUsed / stats.totalBudget) * 100)
      : 0

    // ── Transform projects to frontend format ──
    const feProjects = projects.map(p => ({
      id: p.id,
      projectCode: p.projectCode,
      name: p.name,
      projectType: p.projectType,
      status: p.status,
      progress: p.progress,
      owner: p.owner.name,
    }))

    // ── Open risks (high priority for executives) ──
    const openRisks = projects
      .filter(p => p.status === 'red' || p.status === 'yellow')
      .flatMap(p =>
        p.risks
          .filter(r => user.role !== 'executive' || r.impact === 'high')
          .map(risk => ({
            id: risk.id,
            projectId: p.id,
            projectName: p.name,
            title: risk.title,
            description: risk.description,
            impact: risk.impact,
            probability: risk.probability,
            mitigation: risk.mitigation,
          }))
      )

    // ── Upcoming milestones (within 30 days, not done) ──
    const today = new Date()
    const upcomingMilestones = projects
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
              projectStatus: p.status,
              name: m.name,
              dueDate: m.dueDate.toISOString().split('T')[0],
              diffDays,
            }
          })
      )
      .filter(m => m.diffDays <= 30)
      .sort((a, b) => a.diffDays - b.diffDays)

    // ── Projects missing this week's update ──
    const getMonday = (d: Date) => {
      const day = d.getDay()
      const diff = d.getDate() - day + (day === 0 ? -6 : 1)
      const monday = new Date(d.getFullYear(), d.getMonth(), diff)
      monday.setHours(0, 0, 0, 0)
      return monday
    }
    const thisMonday = getMonday(today)

    const missingUpdates = projects
      .filter(p => {
        const hasThisWeek = p.weeklyUpdates.some(u => {
          const updateMonday = getMonday(new Date(u.weekOf))
          return updateMonday.getTime() === thisMonday.getTime()
        })
        return !hasThisWeek
      })
      .map(p => ({
        id: p.id,
        name: p.name,
        status: p.status,
        owner: p.owner.name,
        lastUpdateWeekOf: p.weeklyUpdates[0]?.weekOf.toISOString().split('T')[0] || null,
      }))

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
