import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import type { RiskImpact, RiskProbability, RiskStatus } from '@prisma/client'

type RouteContext = { params: Promise<{ id: string; riskId: string }> }

// ─── PUT /api/projects/[id]/risks/[riskId] — Update risk ─────

interface UpdateRiskBody {
  title?: string
  description?: string
  impact?: string
  probability?: string
  mitigation?: string
  status?: string
}

export async function PUT(
  request: NextRequest,
  { params }: RouteContext,
) {
  try {
    const { id, riskId } = await params
    const body: UpdateRiskBody = await request.json()

    const risk = await prisma.risk.findFirst({
      where: { id: riskId, projectId: id },
    })
    if (!risk) {
      return NextResponse.json({ error: '找不到該風險' }, { status: 404 })
    }

    const data: Record<string, unknown> = {}
    if (body.title !== undefined) data.title = body.title.trim()
    if (body.description !== undefined) data.description = body.description.trim()
    if (body.impact !== undefined) data.impact = body.impact as RiskImpact
    if (body.probability !== undefined) data.probability = body.probability as RiskProbability
    if (body.mitigation !== undefined) data.mitigation = body.mitigation.trim()
    if (body.status !== undefined) data.status = body.status as RiskStatus

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: '沒有提供任何更新欄位' }, { status: 400 })
    }

    const updated = await prisma.risk.update({
      where: { id: riskId },
      data,
    })

    return NextResponse.json({
      id: updated.id,
      projectId: id,
      title: updated.title,
      description: updated.description,
      impact: updated.impact,
      probability: updated.probability,
      mitigation: updated.mitigation,
      status: updated.status,
    })
  } catch (error) {
    console.error('Failed to update risk:', error)
    return NextResponse.json({ error: '更新風險失敗' }, { status: 500 })
  }
}

// ─── DELETE /api/projects/[id]/risks/[riskId] — Remove risk ──

export async function DELETE(
  _request: NextRequest,
  { params }: RouteContext,
) {
  try {
    const { id, riskId } = await params

    const risk = await prisma.risk.findFirst({
      where: { id: riskId, projectId: id },
    })
    if (!risk) {
      return NextResponse.json({ error: '找不到該風險' }, { status: 404 })
    }

    await prisma.risk.delete({ where: { id: riskId } })

    return NextResponse.json({ success: true, message: '風險已刪除' })
  } catch (error) {
    console.error('Failed to remove risk:', error)
    return NextResponse.json({ error: '刪除風險失敗' }, { status: 500 })
  }
}
