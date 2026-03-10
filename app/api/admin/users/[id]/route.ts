import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import type { UserRole } from '@prisma/client'

async function guardAdmin(request: NextRequest) {
  const email = request.headers.get('x-user-email') ?? ''
  if (!email) return false
  const user = await prisma.user.findUnique({ where: { email }, select: { role: true } })
  return user?.role === 'admin'
}

const VALID_ROLES: UserRole[] = ['pm', 'member', 'executive', 'admin']

type RouteContext = { params: Promise<{ id: string }> }

function computeProjectStatus(
  tasks: { status: string; endDate: Date }[],
  projectEndDate: Date,
): 'green' | 'yellow' | 'red' {
  if (tasks.length === 0) return 'green'
  const today = new Date().toISOString().split('T')[0]
  const overdueTasks = tasks.filter(t => t.status !== 'done' && t.endDate.toISOString().split('T')[0] < today)
  const blockedTasks = tasks.filter(t => t.status === 'blocked')
  const doneTasks = tasks.filter(t => t.status === 'done')
  if (doneTasks.length === tasks.length) return 'green'
  const overdueRatio = overdueTasks.length / tasks.length
  const blockedRatio = blockedTasks.length / tasks.length
  const projectEnd = projectEndDate.toISOString().split('T')[0]
  if (overdueRatio > 0.3 || blockedRatio > 0.2 || (projectEnd < today && doneTasks.length < tasks.length)) return 'red'
  if (overdueTasks.length > 0 || blockedTasks.length > 0) return 'yellow'
  return 'green'
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  if (!await guardAdmin(request)) {
    return NextResponse.json({ error: '無權限' }, { status: 403 })
  }

  const { id } = await params
  const now = new Date()
  const eightWeeksAgo = new Date(now.getTime() - 56 * 24 * 60 * 60 * 1000)

  const [user, ownedProjects, teamMemberships, weeklyUpdates] = await Promise.all([
    prisma.user.findUnique({
      where: { id },
      select: {
        id: true, name: true, email: true, role: true,
        isActive: true, jobTitle: true, organization: true, createdAt: true,
        _count: { select: { ownedProjects: true, teamMemberships: true } },
      },
    }),
    prisma.project.findMany({
      where: { ownerId: id },
      select: {
        id: true, name: true, progress: true,
        projectTier: true, startDate: true, endDate: true,
        milestones: { select: { id: true, status: true, dueDate: true } },
        tasks: { where: { parentId: null }, select: { status: true, endDate: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 10,
    }),
    prisma.projectTeamMember.findMany({
      where: { userId: id },
      select: {
        role: true,
        project: {
          select: {
            id: true, name: true, projectTier: true, endDate: true,
            tasks: { where: { parentId: null }, select: { status: true, endDate: true } },
          },
        },
      },
    }),
    prisma.weeklyUpdate.findMany({
      where: { updatedById: id, weekOf: { gte: eightWeeksAgo } },
      select: { weekOf: true, overallStatus: true },
      orderBy: { weekOf: 'desc' },
      take: 8,
    }),
  ])

  if (!user) return NextResponse.json({ error: '找不到使用者' }, { status: 404 })

  const ownedProjectsWithStats = ownedProjects.map(p => ({
    id: p.id, name: p.name, progress: p.progress,
    status: computeProjectStatus(p.tasks, p.endDate),
    projectTier: p.projectTier,
    startDate: p.startDate.toISOString(),
    endDate: p.endDate.toISOString(),
    totalMilestones: p.milestones.length,
    doneMilestones: p.milestones.filter(m => m.status === 'done').length,
    overdueMilestones: p.milestones.filter(
      m => m.status !== 'done' && new Date(m.dueDate) < now
    ).length,
  }))

  return NextResponse.json({
    user,
    ownedProjects: ownedProjectsWithStats,
    teamProjects: teamMemberships.map(tm => ({
      teamRole: tm.role,
      id: tm.project.id,
      name: tm.project.name,
      projectTier: tm.project.projectTier,
      status: computeProjectStatus(tm.project.tasks, tm.project.endDate),
    })),
    weeklyUpdates: weeklyUpdates.map(wu => ({
      weekOf: wu.weekOf.toISOString(),
      status: wu.overallStatus,
    })),
  })
}

export async function PUT(request: NextRequest, { params }: RouteContext) {
  if (!await guardAdmin(request)) {
    return NextResponse.json({ error: '無權限' }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json()
  const data: Record<string, unknown> = {}

  if (body.role !== undefined) {
    if (!VALID_ROLES.includes(body.role)) {
      return NextResponse.json({ error: '無效的角色' }, { status: 400 })
    }
    data.role = body.role
  }
  if (body.organization !== undefined) data.organization = body.organization
  if (body.isActive !== undefined) data.isActive = Boolean(body.isActive)

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: '沒有提供更新欄位' }, { status: 400 })
  }

  const user = await prisma.user.update({
    where: { id },
    data,
    select: { id: true, name: true, email: true, role: true, organization: true, jobTitle: true },
  })

  return NextResponse.json(user)
}
