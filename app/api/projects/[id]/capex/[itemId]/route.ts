import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

type RouteContext = { params: Promise<{ id: string; itemId: string }> }

// ─── PUT /api/projects/[id]/capex/[itemId] — Update single CAPEX item ───

export async function PUT(
  request: NextRequest,
  { params }: RouteContext,
) {
  try {
    const { id, itemId } = await params
    const body = await request.json()

    const existing = await prisma.capexItem.findFirst({
      where: { id: itemId, projectId: id },
    })
    if (!existing) {
      return NextResponse.json({ error: '找不到該 CAPEX 項目' }, { status: 404 })
    }

    const data: Record<string, unknown> = {}
    const stringFields = [
      'equipmentCategory', 'station', 'supplier', 'poNumber', 'partNumber',
      'masterSummary', 'partDescription', 'unit', 'currency', 'paymentStatus',
    ] as const
    for (const f of stringFields) {
      if (body[f] !== undefined) data[f] = body[f]
    }

    const floatFields = [
      'originalPrice', 'twdPrice', 'orderAmount',
      'depositPct', 'deliveryPct', 'acceptancePct',
      'depositAmount', 'deliveryAmount', 'acceptanceAmount',
    ] as const
    for (const f of floatFields) {
      if (body[f] !== undefined) data[f] = body[f]
    }

    if (body.quantity !== undefined) data.quantity = body.quantity
    if (body.budgetItemId !== undefined) data.budgetItemId = body.budgetItemId || null
    if (body.sortOrder !== undefined) data.sortOrder = body.sortOrder

    const boolFields = ['depositPaid', 'deliveryPaid', 'acceptancePaid'] as const
    for (const f of boolFields) {
      if (body[f] !== undefined) data[f] = !!body[f]
    }

    const dateFields = [
      'issueDate', 'deliveryDate', 'bpmAcceptanceDate',
      'depositPayDate', 'deliveryPayDate', 'acceptancePayDate',
    ] as const
    for (const f of dateFields) {
      if (body[f] !== undefined) {
        data[f] = body[f] ? new Date(body[f]) : null
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: '沒有提供任何更新欄位' }, { status: 400 })
    }

    const updated = await prisma.capexItem.update({
      where: { id: itemId },
      data,
    })

    return NextResponse.json({ id: updated.id })
  } catch (error) {
    console.error('Failed to update capex item:', error)
    return NextResponse.json({ error: '更新 CAPEX 項目失敗' }, { status: 500 })
  }
}

// ─── DELETE /api/projects/[id]/capex/[itemId] — Remove single CAPEX item ───

export async function DELETE(
  _request: NextRequest,
  { params }: RouteContext,
) {
  try {
    const { id, itemId } = await params

    const existing = await prisma.capexItem.findFirst({
      where: { id: itemId, projectId: id },
    })
    if (!existing) {
      return NextResponse.json({ error: '找不到該 CAPEX 項目' }, { status: 404 })
    }

    await prisma.capexItem.delete({ where: { id: itemId } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete capex item:', error)
    return NextResponse.json({ error: '刪除 CAPEX 項目失敗' }, { status: 500 })
  }
}
