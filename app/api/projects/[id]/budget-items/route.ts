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
// Upsert: update existing items (preserve IDs for CAPEX linkage), create new, delete removed.
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  try {
    const { items } = await request.json() as {
      items: {
        id?: string
        station?: string
        vendor?: string
        equipment: string
        quantity?: number
        purchaseType?: string
        unitPrice?: number | null
        estimatedCost?: number | null
        actualCost?: number | null
      }[]
    }

    await prisma.$transaction(async (tx) => {
      const incomingIds = (items ?? []).filter(i => i.id).map(i => i.id!)
      // Delete items that are no longer in the list
      await tx.projectBudgetItem.deleteMany({
        where: { projectId: id, ...(incomingIds.length > 0 ? { id: { notIn: incomingIds } } : {}) },
      })
      // Upsert each item: update existing (preserve ID), create new
      for (let i = 0; i < (items ?? []).length; i++) {
        const item = items[i]
        const data = {
          station: item.station ?? '',
          vendor: item.vendor ?? '',
          equipment: item.equipment ?? '',
          quantity: item.quantity ?? 1,
          purchaseType: item.purchaseType ?? '',
          unitPrice: item.unitPrice ?? null,
          estimatedCost: item.estimatedCost ?? null,
          actualCost: item.actualCost ?? null,
          sortOrder: i,
        }
        if (item.id) {
          await tx.projectBudgetItem.upsert({
            where: { id: item.id },
            update: data,
            create: { ...data, id: item.id, projectId: id },
          })
        } else {
          await tx.projectBudgetItem.create({
            data: { ...data, projectId: id },
          })
        }
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
