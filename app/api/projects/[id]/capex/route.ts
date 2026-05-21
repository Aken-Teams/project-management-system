import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

type RouteContext = { params: Promise<{ id: string }> }

// ─── GET /api/projects/[id]/capex — List CAPEX items ───

export async function GET(
  _request: NextRequest,
  { params }: RouteContext,
) {
  try {
    const { id } = await params
    const items = await prisma.capexItem.findMany({
      where: { projectId: id },
      orderBy: { sortOrder: 'asc' },
      include: {
        budgetItem: {
          select: { id: true, station: true, vendor: true, equipment: true },
        },
      },
    })

    const result = items.map(item => ({
      id: item.id,
      projectId: item.projectId,
      budgetItemId: item.budgetItemId,
      budgetItemLabel: item.budgetItem
        ? `${item.budgetItem.station} / ${item.budgetItem.vendor} / ${item.budgetItem.equipment}`
        : null,
      equipmentCategory: item.equipmentCategory,
      station: item.station,
      supplier: item.supplier,
      issueDate: item.issueDate?.toISOString().slice(0, 10) ?? null,
      poNumber: item.poNumber,
      partNumber: item.partNumber,
      masterSummary: item.masterSummary,
      partDescription: item.partDescription,
      unit: item.unit,
      currency: item.currency,
      quantity: item.quantity,
      originalPrice: item.originalPrice,
      twdPrice: item.twdPrice,
      orderAmount: item.orderAmount,
      deliveryDate: item.deliveryDate?.toISOString().slice(0, 10) ?? null,
      bpmAcceptanceDate: item.bpmAcceptanceDate?.toISOString().slice(0, 10) ?? null,
      depositPct: item.depositPct,
      deliveryPct: item.deliveryPct,
      acceptancePct: item.acceptancePct,
      depositAmount: item.depositAmount,
      depositPayDate: item.depositPayDate?.toISOString().slice(0, 10) ?? null,
      deliveryAmount: item.deliveryAmount,
      deliveryPayDate: item.deliveryPayDate?.toISOString().slice(0, 10) ?? null,
      acceptanceAmount: item.acceptanceAmount,
      acceptancePayDate: item.acceptancePayDate?.toISOString().slice(0, 10) ?? null,
      paymentStatus: item.paymentStatus,
      sortOrder: item.sortOrder,
    }))

    return NextResponse.json(result)
  } catch (error) {
    console.error('Failed to fetch capex items:', error)
    return NextResponse.json({ error: '取得 CAPEX 資料失敗' }, { status: 500 })
  }
}

// ─── POST /api/projects/[id]/capex — Add single CAPEX item ───

export async function POST(
  request: NextRequest,
  { params }: RouteContext,
) {
  try {
    const { id } = await params
    const body = await request.json()

    const maxSort = await prisma.capexItem.aggregate({
      where: { projectId: id },
      _max: { sortOrder: true },
    })

    const item = await prisma.capexItem.create({
      data: {
        projectId: id,
        budgetItemId: body.budgetItemId || null,
        equipmentCategory: body.equipmentCategory || '',
        station: body.station || '',
        supplier: body.supplier || '',
        issueDate: body.issueDate ? new Date(body.issueDate) : null,
        poNumber: body.poNumber || '',
        partNumber: body.partNumber || '',
        masterSummary: body.masterSummary || '',
        partDescription: body.partDescription || '',
        unit: body.unit || '',
        currency: body.currency || 'TWD',
        quantity: body.quantity ?? 1,
        originalPrice: body.originalPrice ?? null,
        twdPrice: body.twdPrice ?? null,
        orderAmount: body.orderAmount ?? null,
        deliveryDate: body.deliveryDate ? new Date(body.deliveryDate) : null,
        bpmAcceptanceDate: body.bpmAcceptanceDate ? new Date(body.bpmAcceptanceDate) : null,
        depositPct: body.depositPct ?? null,
        deliveryPct: body.deliveryPct ?? null,
        acceptancePct: body.acceptancePct ?? null,
        depositAmount: body.depositAmount ?? null,
        depositPayDate: body.depositPayDate ? new Date(body.depositPayDate) : null,
        deliveryAmount: body.deliveryAmount ?? null,
        deliveryPayDate: body.deliveryPayDate ? new Date(body.deliveryPayDate) : null,
        acceptanceAmount: body.acceptanceAmount ?? null,
        acceptancePayDate: body.acceptancePayDate ? new Date(body.acceptancePayDate) : null,
        paymentStatus: body.paymentStatus || '',
        sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
      },
    })

    return NextResponse.json({ id: item.id }, { status: 201 })
  } catch (error) {
    console.error('Failed to create capex item:', error)
    return NextResponse.json({ error: '新增 CAPEX 項目失敗' }, { status: 500 })
  }
}

// ─── PUT /api/projects/[id]/capex — Batch save (full replace) ───

export async function PUT(
  request: NextRequest,
  { params }: RouteContext,
) {
  try {
    const { id } = await params
    const { items } = await request.json() as { items: Record<string, unknown>[] }

    if (!Array.isArray(items)) {
      return NextResponse.json({ error: 'items 必須是陣列' }, { status: 400 })
    }

    await prisma.$transaction(async (tx) => {
      await tx.capexItem.deleteMany({ where: { projectId: id } })

      if (items.length > 0) {
        await tx.capexItem.createMany({
          data: items.map((item, index) => ({
            projectId: id,
            budgetItemId: (item.budgetItemId as string) || null,
            equipmentCategory: (item.equipmentCategory as string) || '',
            station: (item.station as string) || '',
            supplier: (item.supplier as string) || '',
            issueDate: item.issueDate ? new Date(item.issueDate as string) : null,
            poNumber: (item.poNumber as string) || '',
            partNumber: (item.partNumber as string) || '',
            masterSummary: (item.masterSummary as string) || '',
            partDescription: (item.partDescription as string) || '',
            unit: (item.unit as string) || '',
            currency: (item.currency as string) || 'TWD',
            quantity: (item.quantity as number) ?? 1,
            originalPrice: (item.originalPrice as number) ?? null,
            twdPrice: (item.twdPrice as number) ?? null,
            orderAmount: (item.orderAmount as number) ?? null,
            deliveryDate: item.deliveryDate ? new Date(item.deliveryDate as string) : null,
            bpmAcceptanceDate: item.bpmAcceptanceDate ? new Date(item.bpmAcceptanceDate as string) : null,
            depositPct: (item.depositPct as number) ?? null,
            deliveryPct: (item.deliveryPct as number) ?? null,
            acceptancePct: (item.acceptancePct as number) ?? null,
            depositAmount: (item.depositAmount as number) ?? null,
            depositPayDate: item.depositPayDate ? new Date(item.depositPayDate as string) : null,
            deliveryAmount: (item.deliveryAmount as number) ?? null,
            deliveryPayDate: item.deliveryPayDate ? new Date(item.deliveryPayDate as string) : null,
            acceptanceAmount: (item.acceptanceAmount as number) ?? null,
            acceptancePayDate: item.acceptancePayDate ? new Date(item.acceptancePayDate as string) : null,
            paymentStatus: (item.paymentStatus as string) || '',
            sortOrder: index,
          })),
        })
      }
    })

    const saved = await prisma.capexItem.findMany({
      where: { projectId: id },
      orderBy: { sortOrder: 'asc' },
    })

    return NextResponse.json(saved.map(item => ({
      id: item.id,
      budgetItemId: item.budgetItemId,
      equipmentCategory: item.equipmentCategory,
      station: item.station,
      supplier: item.supplier,
      issueDate: item.issueDate?.toISOString().slice(0, 10) ?? null,
      poNumber: item.poNumber,
      partNumber: item.partNumber,
      masterSummary: item.masterSummary,
      partDescription: item.partDescription,
      unit: item.unit,
      currency: item.currency,
      quantity: item.quantity,
      originalPrice: item.originalPrice,
      twdPrice: item.twdPrice,
      orderAmount: item.orderAmount,
      deliveryDate: item.deliveryDate?.toISOString().slice(0, 10) ?? null,
      bpmAcceptanceDate: item.bpmAcceptanceDate?.toISOString().slice(0, 10) ?? null,
      depositPct: item.depositPct,
      deliveryPct: item.deliveryPct,
      acceptancePct: item.acceptancePct,
      depositAmount: item.depositAmount,
      depositPayDate: item.depositPayDate?.toISOString().slice(0, 10) ?? null,
      deliveryAmount: item.deliveryAmount,
      deliveryPayDate: item.deliveryPayDate?.toISOString().slice(0, 10) ?? null,
      acceptanceAmount: item.acceptanceAmount,
      acceptancePayDate: item.acceptancePayDate?.toISOString().slice(0, 10) ?? null,
      paymentStatus: item.paymentStatus,
      sortOrder: item.sortOrder,
    })))
  } catch (error) {
    console.error('Failed to batch save capex items:', error)
    return NextResponse.json({ error: '批次儲存 CAPEX 失敗' }, { status: 500 })
  }
}
