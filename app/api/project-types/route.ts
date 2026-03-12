import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { PROJECT_TYPE_LABELS } from '@/lib/mock-data'
import { MILESTONE_TEMPLATES } from '@/lib/milestone-templates'
import { generateCodePrefix, BUILTIN_CODE_PREFIX } from '@/lib/code-prefix'

// Public endpoint — no auth required
// Returns all active project types from DB, seeding built-ins on first call
export async function GET() {
  let types = await prisma.projectTypeConfig.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  })

  // Auto-seed built-in types if table is empty
  if (types.length === 0) {
    const builtIns = Object.keys(MILESTONE_TEMPLATES).map((feKey, i) => {
      const dbKey = feKey.replace(/-/g, '_')
      return {
        key: dbKey,
        label: PROJECT_TYPE_LABELS[feKey] ?? feKey,
        codePrefix: BUILTIN_CODE_PREFIX[dbKey] ?? generateCodePrefix(feKey),
        isBuiltIn: true,
        sortOrder: i,
        isActive: true,
      }
    })
    await prisma.projectTypeConfig.createMany({ data: builtIns })
    types = await prisma.projectTypeConfig.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    })
  }

  // Return keys in hyphen-case to match frontend format
  return NextResponse.json(
    types.map(t => ({
      key: t.key.replace(/_/g, '-'),
      label: t.label,
      codePrefix: t.codePrefix ?? generateCodePrefix(t.label),
    }))
  )
}
