import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

type RouteContext = { params: Promise<{ id: string }> }

// ─── PATCH /api/delay-requests/[id]/resolve-support — Mark support as resolved ────

interface ResolveBody {
  resolvedById: string // userId
  notes?: string
}

export async function PATCH(
  request: NextRequest,
  { params }: RouteContext,
) {
  try {
    const { id } = await params
    const body: ResolveBody = await request.json()

    if (!body.resolvedById) {
      return NextResponse.json(
        { error: '缺少必要欄位（resolvedById）' },
        { status: 400 },
      )
    }

    const dr = await prisma.delayRequest.findUnique({
      where: { id },
      select: { id: true, status: true, supportNeeded: true, supportResolved: true },
    })
    if (!dr) {
      return NextResponse.json({ error: '找不到延遲申請' }, { status: 404 })
    }
    if (dr.status !== 'approved') {
      return NextResponse.json({ error: '僅已核准的申請可標記協助已解決' }, { status: 400 })
    }

    const resolver = await prisma.user.findUnique({
      where: { id: body.resolvedById },
      select: { id: true, name: true },
    })
    if (!resolver) {
      return NextResponse.json({ error: '找不到使用者' }, { status: 404 })
    }

    await prisma.delayRequest.update({
      where: { id },
      data: {
        supportResolved: true,
        supportResolvedById: body.resolvedById,
        supportResolvedAt: new Date(),
        supportResolvedNotes: body.notes?.trim() || null,
      },
    })

    return NextResponse.json({
      success: true,
      message: '已標記協助已解決',
    })
  } catch (error) {
    console.error('Failed to resolve support:', error)
    return NextResponse.json(
      { error: '標記協助已解決失敗' },
      { status: 500 },
    )
  }
}
