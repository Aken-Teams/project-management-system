import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { MILESTONE_TEMPLATES } from '@/lib/milestone-templates'
import { PROJECT_TYPE_LABELS } from '@/lib/mock-data'
import type { ProjectType } from '@/lib/mock-data'

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

  const projectTypes = Object.keys(MILESTONE_TEMPLATES) as ProjectType[]

  const dbCounts = await prisma.milestoneTemplateConfig.groupBy({
    by: ['projectType'],
    _count: { id: true },
  })
  const dbCountMap: Record<string, number> = {}
  dbCounts.forEach(r => { dbCountMap[r.projectType] = r._count.id })

  const result = projectTypes.map(type => {
    const dbType = type.replace(/-/g, '_')
    const dbCount = dbCountMap[dbType] ?? 0
    return {
      projectType: type,
      label: PROJECT_TYPE_LABELS[type],
      count: dbCount > 0 ? dbCount : MILESTONE_TEMPLATES[type].length,
      isCustomized: dbCount > 0,
    }
  })

  return NextResponse.json(result)
}
