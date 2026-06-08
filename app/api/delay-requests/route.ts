import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { notifyDelaySubmitted, notifySupportNeeded } from '@/lib/notifications'

// ─── POST /api/delay-requests — Submit a new delay request ────

interface CreateDelayRequestBody {
  projectId: string
  requesterId: string   // userId
  reason: string
  canCatchUp: boolean
  supportNeeded?: string
  type?: 'delay' | 'date_change'
  taskId?: string       // which task triggered the delay (optional)
  affectedMilestones?: {
    milestoneId: string
    originalDate: string
    proposedDate: string
    originalStartDate?: string
    proposedStartDate?: string
  }[]
  pendingTaskChanges?: {
    taskId: string
    taskTitle: string
    durationDays?: number
    startDate?: string
    endDate?: string
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

    const hasMilestoneChanges = body.affectedMilestones && body.affectedMilestones.length > 0
    const hasTaskChanges = body.pendingTaskChanges && body.pendingTaskChanges.length > 0
    if (!hasMilestoneChanges && !hasTaskChanges) {
      return NextResponse.json(
        { error: '至少需要一個受影響的里程碑或任務' },
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

    // Count S-role reviewers for this project
    const sRoleCount = await prisma.projectTeamMember.count({
      where: { projectId: body.projectId, role: 'S' },
    })

    // Create delay request with affected milestones in a transaction
    const delayRequest = await prisma.$transaction(async (tx) => {
      const dr = await tx.delayRequest.create({
        data: {
          projectId: body.projectId,
          requesterId: body.requesterId,
          reason: body.reason.trim(),
          canCatchUp: body.canCatchUp ?? false,
          supportNeeded: body.supportNeeded?.trim() || '',
          type: body.type || 'delay',
          taskId: body.taskId || null,
          status: 'pending',
          requiredReviewers: sRoleCount,
          pendingTaskChanges: hasTaskChanges ? body.pendingTaskChanges : undefined,
          affectedMilestones: hasMilestoneChanges ? {
            create: body.affectedMilestones!.map((am) => ({
              milestoneId: am.milestoneId,
              originalDate: new Date(am.originalDate),
              proposedDate: new Date(am.proposedDate),
              ...(am.originalStartDate ? { originalStartDate: new Date(am.originalStartDate) } : {}),
              ...(am.proposedStartDate ? { proposedStartDate: new Date(am.proposedStartDate) } : {}),
            })),
          } : undefined,
        },
        include: {
          requester: { select: { name: true } },
          affectedMilestones: true,
        },
      })
      return dr
    })

    // Notify executives (fire-and-forget)
    const projectForNotif = await prisma.project.findUnique({
      where: { id: body.projectId },
      select: { name: true },
    })
    if (projectForNotif) {
      notifyDelaySubmitted({
        requesterName: requester.name,
        projectId: body.projectId,
        projectName: projectForNotif.name,
      })
      // Also notify support_needed if supportNeeded text is present
      if (body.supportNeeded?.trim()) {
        notifySupportNeeded({
          requesterName: requester.name,
          projectId: body.projectId,
          projectName: projectForNotif.name,
          detail: body.supportNeeded.trim(),
        })
      }
    }

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
        type: delayRequest.type,
        status: delayRequest.status,
        affectedMilestones: delayRequest.affectedMilestones.map((am) => ({
          milestoneId: am.milestoneId,
          originalDate: am.originalDate.toISOString().split('T')[0],
          proposedDate: am.proposedDate.toISOString().split('T')[0],
          ...(am.originalStartDate ? { originalStartDate: am.originalStartDate.toISOString().split('T')[0] } : {}),
          ...(am.proposedStartDate ? { proposedStartDate: am.proposedStartDate.toISOString().split('T')[0] } : {}),
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
    const sRoleEmail = searchParams.get('sRoleEmail')

    const where: Record<string, unknown> = {}
    if (status) where.status = status
    if (projectId) where.projectId = projectId

    // Filter: show delay requests for projects where this user is the S (Sign-off) role
    if (sRoleEmail) {
      const sRoleProjects = await prisma.projectTeamMember.findMany({
        where: { user: { email: sRoleEmail }, role: 'S' },
        select: { projectId: true },
      })
      const projectIds = sRoleProjects.map(p => p.projectId)
      where.projectId = projectId
        ? (projectIds.includes(projectId) ? projectId : '__none__')
        : { in: projectIds.length > 0 ? projectIds : ['__none__'] }
    }

    const delayRequests = await prisma.delayRequest.findMany({
      where,
      include: {
        requester: { select: { name: true } },
        reviewer: { select: { name: true } },
        supportResolvedBy: { select: { name: true } },
        task: { select: { id: true, title: true } },
        affectedMilestones: {
          include: { milestone: { select: { name: true } } },
        },
        reviewDecisions: {
          include: { reviewer: { select: { name: true } } },
          orderBy: { createdAt: 'asc' },
        },
        project: {
          select: {
            id: true,
            name: true,
            projectCode: true,
            projectType: true,
            projectTier: true,
            owner: { select: { id: true, name: true } },
            milestones: {
              orderBy: { sortOrder: 'asc' },
              select: { id: true, name: true, dueDate: true, status: true, progress: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    // Batch-fetch all S-role members for relevant projects (avoid N+1)
    const uniqueProjectIds = [...new Set(delayRequests.map(dr => dr.projectId))]
    const allSMembers = await prisma.projectTeamMember.findMany({
      where: { projectId: { in: uniqueProjectIds }, role: 'S' },
      select: { projectId: true, userId: true, user: { select: { id: true, name: true } } },
    })
    const sMembersByProject = new Map<string, { id: string; name: string }[]>()
    for (const m of allSMembers) {
      const list = sMembersByProject.get(m.projectId) ?? []
      list.push({ id: m.user.id, name: m.user.name })
      sMembersByProject.set(m.projectId, list)
    }

    const result = delayRequests.map((dr) => ({
      id: dr.id,
      projectId: dr.projectId,
      project: {
        id: dr.project.id,
        name: dr.project.name,
        projectCode: dr.project.projectCode,
        projectType: dr.project.projectType,
        projectTier: dr.project.projectTier,
        ownerName: dr.project.owner.name,
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
      ...(dr.taskId ? { taskId: dr.taskId, taskTitle: dr.task?.title } : {}),
      reason: dr.reason,
      canCatchUp: dr.canCatchUp,
      supportNeeded: dr.supportNeeded,
      type: dr.type,
      status: dr.status,
      affectedMilestones: dr.affectedMilestones.map((am) => ({
        milestoneId: am.milestoneId,
        milestoneName: am.milestone.name,
        originalDate: am.originalDate.toISOString().split('T')[0],
        proposedDate: am.proposedDate.toISOString().split('T')[0],
        ...(am.originalStartDate ? { originalStartDate: am.originalStartDate.toISOString().split('T')[0] } : {}),
        ...(am.proposedStartDate ? { proposedStartDate: am.proposedStartDate.toISOString().split('T')[0] } : {}),
      })),
      ...(dr.reviewer ? { reviewedBy: dr.reviewer.name } : {}),
      ...(dr.reviewedAt ? { reviewedAt: dr.reviewedAt.toISOString() } : {}),
      ...(dr.reviewNotes ? { reviewNotes: dr.reviewNotes } : {}),
      // Multi-review data: merge S-role members with their decisions
      requiredReviewers: dr.requiredReviewers,
      approvedCount: dr.reviewDecisions.filter(d => d.action === 'approve').length,
      reviewers: (() => {
        const sMembers = sMembersByProject.get(dr.projectId) ?? []
        const decisionMap = new Map(dr.reviewDecisions.map(d => [d.reviewerId, d]))
        return sMembers.map(member => {
          const decision = decisionMap.get(member.id)
          return {
            id: member.id,
            name: member.name,
            action: decision?.action ?? null,
            notes: decision?.notes ?? null,
            createdAt: decision?.createdAt?.toISOString() ?? null,
          }
        })
      })(),
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
