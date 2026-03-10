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
        jobTitle: true, organization: true, createdAt: true,
        _count: { select: { ownedProjects: true, teamMemberships: true } },
      },
    }),
    prisma.project.findMany({
      where: { ownerId: id },
      select: {
        id: true, name: true, status: true, progress: true,
        projectTier: true, startDate: true, endDate: true,
        milestones: { select: { id: true, status: true, dueDate: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 10,
    }),
    prisma.projectTeamMember.findMany({
      where: { userId: id },
      select: {
        role: true,
        project: { select: { id: true, name: true, status: true, projectTier: true } },
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
    id: p.id, name: p.name, status: p.status, progress: p.progress,
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
    teamProjects: teamMemberships.map(tm => ({ teamRole: tm.role, ...tm.project })),
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
