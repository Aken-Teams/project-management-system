import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

type RouteContext = { params: Promise<{ id: string }> }

// ─── GET /api/users/[id] ────────────────────────────────
export async function GET(
  _request: NextRequest,
  context: RouteContext,
) {
  try {
    const { id } = await context.params

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        organization: true,
        createdAt: true,
      },
    })

    if (!user) {
      return NextResponse.json({ error: '找不到使用者' }, { status: 404 })
    }

    // Projects where user is owner or team member
    const teamMemberships = await prisma.projectTeamMember.findMany({
      where: { userId: id },
      select: {
        role: true,
        project: {
          select: {
            id: true,
            name: true,
            projectCode: true,
            ownerId: true,
            endDate: true,
          },
        },
      },
    })

    const projectIds = teamMemberships.map(m => m.project.id)

    // Task stats: query all tasks assigned to user (by name) within their projects
    const tasks = projectIds.length > 0
      ? await prisma.task.findMany({
          where: {
            projectId: { in: projectIds },
            assignee: user.name,
          },
          select: {
            id: true,
            status: true,
            progress: true,
          },
        })
      : []

    const completedTasks = tasks.filter(t => t.status === 'done').length
    const inProgressTasks = tasks.filter(t => t.status === 'in_progress').length
    const todoTasks = tasks.filter(t => t.status === 'todo').length
    const blockedTasks = tasks.filter(t => t.status === 'blocked').length

    // Recent task logs
    const recentLogs = await prisma.taskLog.findMany({
      where: { authorId: id },
      orderBy: { logDate: 'desc' },
      take: 10,
      select: {
        id: true,
        content: true,
        logDate: true,
        task: {
          select: {
            title: true,
            project: {
              select: { name: true },
            },
          },
        },
      },
    })

    // Owned projects count
    const ownedProjectCount = await prisma.project.count({
      where: { ownerId: id },
    })

    // Build project list with role info
    const projects = teamMemberships.map(m => ({
      id: m.project.id,
      name: m.project.name,
      projectCode: m.project.projectCode,
      role: m.role,
      isOwner: m.project.ownerId === id,
    }))

    return NextResponse.json({
      ...user,
      createdAt: user.createdAt.toISOString().split('T')[0],
      stats: {
        projectCount: projectIds.length,
        ownedProjectCount,
        totalTasks: tasks.length,
        completedTasks,
        inProgressTasks,
        todoTasks,
        blockedTasks,
      },
      recentLogs: recentLogs.map(l => ({
        id: l.id,
        content: l.content,
        logDate: l.logDate.toISOString().split('T')[0],
        taskTitle: l.task.title,
        projectName: l.task.project.name,
      })),
      projects,
    })
  } catch (error) {
    console.error('Failed to get user:', error)
    return NextResponse.json({ error: '取得使用者資料失敗' }, { status: 500 })
  }
}

// ─── PUT /api/users/[id] ────────────────────────────────
export async function PUT(
  request: NextRequest,
  context: RouteContext,
) {
  try {
    const { id } = await context.params
    const body = await request.json()

    const { name, email, organization } = body as {
      name?: string
      email?: string
      organization?: string
    }

    const data: Record<string, string> = {}
    if (name !== undefined) {
      if (!name.trim()) {
        return NextResponse.json({ error: '姓名不能為空' }, { status: 400 })
      }
      data.name = name.trim()
    }
    if (email !== undefined) {
      if (!email.trim()) {
        return NextResponse.json({ error: 'Email 不能為空' }, { status: 400 })
      }
      data.email = email.trim()
    }
    if (organization !== undefined) {
      data.organization = organization.trim()
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: '沒有要更新的欄位' }, { status: 400 })
    }

    const updated = await prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        organization: true,
      },
    })

    return NextResponse.json(updated)
  } catch (error: unknown) {
    // Handle unique constraint (email)
    if (error && typeof error === 'object' && 'code' in error && (error as { code: string }).code === 'P2002') {
      return NextResponse.json({ error: '此 Email 已被使用' }, { status: 409 })
    }
    console.error('Failed to update user:', error)
    return NextResponse.json({ error: '更新使用者資料失敗' }, { status: 500 })
  }
}
