import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

type RouteContext = { params: Promise<{ id: string }> }

// ─── PATCH /api/delay-requests/[id]/review — Approve or reject a delay request ────

interface ReviewBody {
  action: 'approve' | 'reject'
  reviewerId: string   // userId of the reviewer
  reviewNotes?: string
}

export async function PATCH(
  request: NextRequest,
  { params }: RouteContext,
) {
  try {
    const { id } = await params
    const body: ReviewBody = await request.json()

    if (!body.action || !body.reviewerId) {
      return NextResponse.json(
        { error: '缺少必要欄位（action, reviewerId）' },
        { status: 400 },
      )
    }

    if (body.action !== 'approve' && body.action !== 'reject') {
      return NextResponse.json(
        { error: 'action 必須是 approve 或 reject' },
        { status: 400 },
      )
    }

    // Verify delay request exists and is pending
    const delayRequest = await prisma.delayRequest.findUnique({
      where: { id },
      include: { affectedMilestones: true },
    })
    if (!delayRequest) {
      return NextResponse.json({ error: '找不到延遲申請' }, { status: 404 })
    }
    if (delayRequest.status !== 'pending') {
      return NextResponse.json(
        { error: '此申請已審核過' },
        { status: 400 },
      )
    }

    // Verify reviewer exists
    const reviewer = await prisma.user.findUnique({
      where: { id: body.reviewerId },
      select: { id: true, name: true },
    })
    if (!reviewer) {
      return NextResponse.json({ error: '找不到審核人' }, { status: 404 })
    }

    const now = new Date()

    if (body.action === 'approve') {
      // Approve: update request status + update milestone dueDates in transaction
      await prisma.$transaction(async (tx) => {
        // Update delay request status
        await tx.delayRequest.update({
          where: { id },
          data: {
            status: 'approved',
            reviewerId: body.reviewerId,
            reviewedAt: now,
            reviewNotes: body.reviewNotes?.trim() || null,
          },
        })

        // Update affected milestone dueDates to proposed dates
        for (const am of delayRequest.affectedMilestones) {
          await tx.milestone.update({
            where: { id: am.milestoneId },
            data: { dueDate: am.proposedDate },
          })
        }
      })
    } else {
      // Reject: only update request status
      await prisma.delayRequest.update({
        where: { id },
        data: {
          status: 'rejected',
          reviewerId: body.reviewerId,
          reviewedAt: now,
          reviewNotes: body.reviewNotes?.trim() || null,
        },
      })
    }

    return NextResponse.json({
      success: true,
      message: body.action === 'approve' ? '已核准延遲申請' : '已駁回延遲申請',
    })
  } catch (error) {
    console.error('Failed to review delay request:', error)
    return NextResponse.json(
      { error: '審核延遲申請失敗' },
      { status: 500 },
    )
  }
}
