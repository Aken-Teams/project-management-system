import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { toDbEnum } from '@/lib/enum-mappers'
import type { TeamRole as DbTeamRole } from '@prisma/client'

type RouteContext = { params: Promise<{ id: string }> }

// ─── POST /api/projects/[id]/team — Add member to project ────

interface AddMemberBody {
  userId?: string
  name?: string
  email?: string
  adId?: string   // AD username — used to generate stable placeholder email
  role: string
  jobTitle?: string
  organization?: string
  responsibility?: string
}

export async function POST(
  request: NextRequest,
  { params }: RouteContext,
) {
  try {
    const { id } = await params
    const body: AddMemberBody = await request.json()

    // Check project exists
    const project = await prisma.project.findUnique({ where: { id } })
    if (!project) {
      return NextResponse.json({ error: '找不到專案' }, { status: 404 })
    }

    if (!body.role) {
      return NextResponse.json({ error: '角色為必填' }, { status: 400 })
    }

    // Resolve user: by userId, email, or name
    let userId = body.userId
    if (!userId && body.email) {
      const user = await prisma.user.findUnique({ where: { email: body.email } })
      if (user) userId = user.id
    }
    if (!userId && body.name) {
      const user = await prisma.user.findFirst({ where: { name: body.name } })
      if (user) userId = user.id
    }

    if (!userId) {
      // Auto-create user from AD / external system so they can be added to projects
      const autoEmail = body.email && body.email.includes('@')
        ? body.email
        : body.adId
          ? `${body.adId}@ad.panjit.local`
          : `_ad_.${(body.name ?? 'user').replace(/\s+/g, '.').toLowerCase()}@ad.panjit.local`
      const upserted = await prisma.user.upsert({
        where: { email: autoEmail },
        update: {},
        create: {
          name: body.name ?? '',
          email: autoEmail,
          jobTitle: body.jobTitle?.trim() ?? '',
          organization: body.organization?.trim() ?? '',
        },
      })
      userId = upserted.id
    }

    // Check not already a member
    const existing = await prisma.projectTeamMember.findUnique({
      where: { projectId_userId: { projectId: id, userId } },
    })
    if (existing) {
      return NextResponse.json({ error: '該成員已在專案團隊中' }, { status: 409 })
    }

    const member = await prisma.projectTeamMember.create({
      data: {
        projectId: id,
        userId,
        role: toDbEnum<DbTeamRole>(body.role),
        jobTitle: body.jobTitle?.trim() || '',
        organization: body.organization?.trim() || '',
        responsibility: body.responsibility?.trim() || '',
      },
      include: { user: true },
    })

    return NextResponse.json({
      id: member.id,
      name: member.user.name,
      email: member.user.email,
      jobTitle: member.jobTitle,
      organization: member.organization || member.user.organization || '',
      role: body.role,
      responsibility: member.responsibility,
    }, { status: 201 })
  } catch (error) {
    console.error('Failed to add team member:', error)
    return NextResponse.json(
      { error: '新增成員失敗' },
      { status: 500 },
    )
  }
}
