import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

interface RouteParams {
  params: Promise<{ id: string }>
}

// ─── GET /api/projects/[id]/budget-items ────────────────
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { id } = await params
  try {
    const items = await prisma.projectBudgetItem.findMany({
      where: { projectId: id },
      orderBy: { sortOrder: 'asc' },
    })
    return NextResponse.json(items)
  } catch (error) {
    console.error('Failed to fetch budget items:', error)
    return NextResponse.json({ error: '讀取預算清單失敗' }, { status: 500 })
  }
}

// ─── PUT /api/projects/[id]/budget-items ─────────────────
// Bulk replace: delete all existing items, then insert the new list.
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  try {
    const { items } = await request.json() as {
      items: {
        station?: string
        vendor?: string
        equipment: string
        quantity?: number
        purchaseType?: string
        estimatedCost?: number | null
        actualCost?: number | null
      }[]
    }

    await prisma.$transaction(async (tx) => {
      await tx.projectBudgetItem.deleteMany({ where: { projectId: id } })
      if (items && items.length > 0) {
        await tx.projectBudgetItem.createMany({
          data: items.map((item, i) => ({
            projectId: id,
            station: item.station ?? '',
            vendor: item.vendor ?? '',
            equipment: item.equipment ?? '',
            quantity: item.quantity ?? 1,
            purchaseType: item.purchaseType ?? '',
            estimatedCost: item.estimatedCost ?? null,
            actualCost: item.actualCost ?? null,
            sortOrder: i,
          })),
        })
      }
    })

    const saved = await prisma.projectBudgetItem.findMany({
      where: { projectId: id },
      orderBy: { sortOrder: 'asc' },
    })
    return NextResponse.json(saved)
  } catch (error) {
    console.error('Failed to save budget items:', error)
    return NextResponse.json({ error: '儲存預算清單失敗' }, { status: 500 })
  }
}
