import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { toDbEnum } from '@/lib/enum-mappers'
import type { TeamRole as DbTeamRole } from '@prisma/client'

type RouteContext = { params: Promise<{ id: string; memberId: string }> }

// ─── PUT /api/projects/[id]/team/[memberId] — Update member ──

interface UpdateMemberBody {
  role?: string
  jobTitle?: string
  organization?: string
  responsibility?: string
  reportReviewerName?: string | null
  reportReviewerEmail?: string | null
}

export async function PUT(
  request: NextRequest,
  { params }: RouteContext,
) {
  try {
    const { id, memberId } = await params
    const body: UpdateMemberBody = await request.json()

    const member = await prisma.projectTeamMember.findFirst({
      where: { id: memberId, projectId: id },
    })
    if (!member) {
      return NextResponse.json({ error: '找不到該團隊成員' }, { status: 404 })
    }

    const data: Record<string, unknown> = {}
    if (body.role !== undefined) {
      data.role = toDbEnum<DbTeamRole>(body.role)
    }
    if (body.jobTitle !== undefined) {
      data.jobTitle = body.jobTitle.trim()
    }
    if (body.organization !== undefined) {
      data.organization = body.organization.trim()
    }
    if (body.responsibility !== undefined) {
      data.responsibility = body.responsibility.trim()
    }
    if (body.reportReviewerName !== undefined) {
      data.reportReviewerName = body.reportReviewerName?.trim() || null
    }
    if (body.reportReviewerEmail !== undefined) {
      data.reportReviewerEmail = body.reportReviewerEmail?.trim() || null
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: '沒有提供任何更新欄位' }, { status: 400 })
    }

    const updated = await prisma.projectTeamMember.update({
      where: { id: memberId },
      data,
      include: { user: true },
    })

    return NextResponse.json({
      id: updated.id,
      name: updated.user.name,
      email: updated.user.email,
      jobTitle: updated.jobTitle,
      organization: updated.organization || updated.user.organization || '',
      role: body.role ?? updated.role,
      responsibility: updated.responsibility,
      reportReviewerName: updated.reportReviewerName || undefined,
      reportReviewerEmail: updated.reportReviewerEmail || undefined,
    })
  } catch (error) {
    console.error('Failed to update team member:', error)
    return NextResponse.json(
      { error: '更新成員失敗' },
      { status: 500 },
    )
  }
}

// ─── DELETE /api/projects/[id]/team/[memberId] — Remove member ─

export async function DELETE(
  _request: NextRequest,
  { params }: RouteContext,
) {
  try {
    const { id, memberId } = await params

    const member = await prisma.projectTeamMember.findFirst({
      where: { id: memberId, projectId: id },
    })
    if (!member) {
      return NextResponse.json({ error: '找不到該團隊成員' }, { status: 404 })
    }

    await prisma.projectTeamMember.delete({ where: { id: memberId } })

    return NextResponse.json({ success: true, message: '成員已移除' })
  } catch (error) {
    console.error('Failed to remove team member:', error)
    return NextResponse.json(
      { error: '移除成員失敗' },
      { status: 500 },
    )
  }
}
