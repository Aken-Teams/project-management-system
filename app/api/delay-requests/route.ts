import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// ─── POST /api/delay-requests — Submit a new delay request ────

interface CreateDelayRequestBody {
  projectId: string
  requesterId: string   // userId
  reason: string
  canCatchUp: boolean
  supportNeeded?: string
  affectedMilestones: {
    milestoneId: string
    originalDate: string
    proposedDate: string
  }[]
}

export async function POST(request: NextRequest) {
  try {
    const body: CreateDelayRequestBody = await request.json()

    if (!body.projectId || !body.requesterId || !body.reason?.trim()) {
      return NextResponse.json(
        { error: '缺少必要欄位（projectId, requesterId, reason）' },
        { status: 400 },
      )
    }

    if (!body.affectedMilestones || body.affectedMilestones.length === 0) {
      return NextResponse.json(
        { error: '至少需要一個受影響的里程碑' },
        { status: 400 },
      )
    }

    // Verify project exists
    const project = await prisma.project.findUnique({
      where: { id: body.projectId },
      select: { id: true },
    })
    if (!project) {
      return NextResponse.json({ error: '找不到專案' }, { status: 404 })
    }

    // Verify requester exists
    const requester = await prisma.user.findUnique({
      where: { id: body.requesterId },
      select: { id: true, name: true },
    })
    if (!requester) {
      return NextResponse.json({ error: '找不到申請人' }, { status: 404 })
    }

    // Create delay request with affected milestones in a transaction
    const delayRequest = await prisma.$transaction(async (tx) => {
      const dr = await tx.delayRequest.create({
        data: {
          projectId: body.projectId,
          requesterId: body.requesterId,
          reason: body.reason.trim(),
          canCatchUp: body.canCatchUp ?? false,
          supportNeeded: body.supportNeeded?.trim() || '',
          status: 'pending',
          affectedMilestones: {
            create: body.affectedMilestones.map((am) => ({
              milestoneId: am.milestoneId,
              originalDate: new Date(am.originalDate),
              proposedDate: new Date(am.proposedDate),
            })),
          },
        },
        include: {
          requester: { select: { name: true } },
          affectedMilestones: true,
        },
      })
      return dr
    })

    // Return frontend-friendly format
    return NextResponse.json({
      success: true,
      delayRequest: {
        id: delayRequest.id,
        projectId: delayRequest.projectId,
        requestedBy: delayRequest.requester.name,
        requestedAt: delayRequest.createdAt.toISOString(),
        reason: delayRequest.reason,
        canCatchUp: delayRequest.canCatchUp,
        supportNeeded: delayRequest.supportNeeded,
        status: delayRequest.status,
        affectedMilestones: delayRequest.affectedMilestones.map((am) => ({
          milestoneId: am.milestoneId,
          originalDate: am.originalDate.toISOString().split('T')[0],
          proposedDate: am.proposedDate.toISOString().split('T')[0],
        })),
      },
    })
  } catch (error) {
    console.error('Failed to create delay request:', error)
    return NextResponse.json(
      { error: '建立延遲申請失敗' },
      { status: 500 },
    )
  }
}

// ─── GET /api/delay-requests — List delay requests ────
// Query params: status (pending|approved|rejected), projectId

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const status = searchParams.get('status')
    const projectId = searchParams.get('projectId')

    const where: Record<string, unknown> = {}
    if (status) where.status = status
    if (projectId) where.projectId = projectId

    const delayRequests = await prisma.delayRequest.findMany({
      where,
      include: {
        requester: { select: { name: true } },
        reviewer: { select: { name: true } },
        supportResolvedBy: { select: { name: true } },
        affectedMilestones: {
          include: { milestone: { select: { name: true } } },
        },
        project: {
          select: {
            id: true,
            name: true,
            projectCode: true,
            milestones: {
              orderBy: { sortOrder: 'asc' },
              select: { id: true, name: true, dueDate: true, status: true, progress: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    const result = delayRequests.map((dr) => ({
      id: dr.id,
      projectId: dr.projectId,
      project: {
        id: dr.project.id,
        name: dr.project.name,
        projectCode: dr.project.projectCode,
        milestones: dr.project.milestones.map((m) => ({
          id: m.id,
          name: m.name,
          dueDate: m.dueDate.toISOString().split('T')[0],
          status: m.status === 'in_progress' ? 'in-progress' : m.status,
          progress: m.progress,
        })),
      },
      requestedBy: dr.requester.name,
      requestedAt: dr.createdAt.toISOString(),
      reason: dr.reason,
      canCatchUp: dr.canCatchUp,
      supportNeeded: dr.supportNeeded,
      status: dr.status,
      affectedMilestones: dr.affectedMilestones.map((am) => ({
        milestoneId: am.milestoneId,
        milestoneName: am.milestone.name,
        originalDate: am.originalDate.toISOString().split('T')[0],
        proposedDate: am.proposedDate.toISOString().split('T')[0],
      })),
      ...(dr.reviewer ? { reviewedBy: dr.reviewer.name } : {}),
      ...(dr.reviewedAt ? { reviewedAt: dr.reviewedAt.toISOString() } : {}),
      ...(dr.reviewNotes ? { reviewNotes: dr.reviewNotes } : {}),
      ...(dr.supportResolved !== null ? { supportResolved: dr.supportResolved } : {}),
      ...(dr.supportResolvedAt ? { supportResolvedAt: dr.supportResolvedAt.toISOString() } : {}),
      ...(dr.supportResolvedBy ? { supportResolvedBy: dr.supportResolvedBy.name } : {}),
      ...(dr.supportResolvedNotes ? { supportResolvedNotes: dr.supportResolvedNotes } : {}),
    }))

    return NextResponse.json({ delayRequests: result })
  } catch (error) {
    console.error('Failed to fetch delay requests:', error)
    return NextResponse.json(
      { error: '讀取延遲申請失敗' },
      { status: 500 },
    )
  }
}
