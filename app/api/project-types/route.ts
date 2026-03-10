import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { PROJECT_TYPE_LABELS } from '@/lib/mock-data'
import { MILESTONE_TEMPLATES } from '@/lib/milestone-templates'

// Public endpoint — no auth required
// Returns all active project types from DB, seeding built-ins on first call
export async function GET() {
  let types = await prisma.projectTypeConfig.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  })

  // Auto-seed built-in types if table is empty
  if (types.length === 0) {
    const builtIns = Object.keys(MILESTONE_TEMPLATES).map((feKey, i) => ({
      key: feKey.replace(/-/g, '_'),
      label: PROJECT_TYPE_LABELS[feKey] ?? feKey,
      isBuiltIn: true,
      sortOrder: i,
      isActive: true,
    }))
    await prisma.projectTypeConfig.createMany({ data: builtIns })
    types = await prisma.projectTypeConfig.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    })
  }

  return NextResponse.json(
    types.map(t => ({ key: t.key, label: t.label }))
  )
}
