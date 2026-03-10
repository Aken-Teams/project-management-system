import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { MILESTONE_TEMPLATES } from '@/lib/milestone-templates'

async function guardAdmin(request: NextRequest) {
  const email = request.headers.get('x-user-email') ?? ''
  if (!email) return false
  const user = await prisma.user.findUnique({ where: { email }, select: { role: true } })
  return user?.role === 'admin'
}

export async function GET(request: NextRequest) {
  if (!await guardAdmin(request)) {
    return NextResponse.json({ error: '無權限' }, { status: 403 })
  }

  // Load project types from DB (populated by /api/admin/project-types on first access)
  const projectTypes = await prisma.projectTypeConfig.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  })

  const dbCounts = await prisma.milestoneTemplateConfig.groupBy({
    by: ['projectType'],
    _count: { id: true },
  })
  const dbCountMap: Record<string, number> = {}
  dbCounts.forEach(r => { dbCountMap[r.projectType] = r._count.id })

  const result = projectTypes.map(pt => {
    const dbCount = dbCountMap[pt.key] ?? 0
    const feKey = pt.key.replace(/_/g, '-')
    const defaultCount = MILESTONE_TEMPLATES[feKey]?.length ?? 0
    return {
      projectType: pt.key,
      label: pt.label,
      count: dbCount > 0 ? dbCount : defaultCount,
      isCustomized: dbCount > 0,
    }
  })

  return NextResponse.json(result)
}
