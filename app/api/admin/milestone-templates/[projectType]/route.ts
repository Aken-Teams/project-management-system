import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getMilestoneTemplates, MILESTONE_TEMPLATES } from '@/lib/milestone-templates'
import type { ProjectType } from '@/lib/mock-data'

async function guardAdmin(request: NextRequest) {
  const email = request.headers.get('x-user-email') ?? ''
  if (!email) return false
  const user = await prisma.user.findUnique({ where: { email }, select: { role: true } })
  return user?.role === 'admin'
}

type RouteContext = { params: Promise<{ projectType: string }> }

export async function GET(request: NextRequest, { params }: RouteContext) {
  if (!await guardAdmin(request)) {
    return NextResponse.json({ error: '無權限' }, { status: 403 })
  }

  const { projectType } = await params
  const templates = await getMilestoneTemplates(projectType as ProjectType, prisma)
  const dbType = projectType.replace(/-/g, '_')
  const dbRows = await prisma.milestoneTemplateConfig.findMany({
    where: { projectType: dbType },
    orderBy: { sortOrder: 'asc' },
  })

  return NextResponse.json({
    projectType,
    isCustomized: dbRows.length > 0,
    templates: templates.map((t, i) => ({
      id: dbRows[i]?.id,
      name: t.name,
      durationDays: t.durationDays,
    })),
  })
}

export async function PUT(request: NextRequest, { params }: RouteContext) {
  if (!await guardAdmin(request)) {
    return NextResponse.json({ error: '無權限' }, { status: 403 })
  }

  const { projectType } = await params
  const { templates } = await request.json() as {
    templates: { name: string; durationDays: number }[]
  }

  if (!Array.isArray(templates)) {
    return NextResponse.json({ error: '無效的範本格式' }, { status: 400 })
  }

  const dbType = projectType.replace(/-/g, '_')

  if (templates.length === 0) {
    // Reset to defaults: delete all DB rows
    await prisma.milestoneTemplateConfig.deleteMany({ where: { projectType: dbType } })
    return NextResponse.json({
      projectType,
      isCustomized: false,
      templates: (MILESTONE_TEMPLATES[projectType as ProjectType] ?? []).map(t => ({
        name: t.name,
        durationDays: t.durationDays,
      })),
    })
  }

  // Full replace
  await prisma.$transaction([
    prisma.milestoneTemplateConfig.deleteMany({ where: { projectType: dbType } }),
    prisma.milestoneTemplateConfig.createMany({
      data: templates.map((t, i) => ({
        projectType: dbType,
        name: t.name,
        durationDays: t.durationDays,
        sortOrder: i,
      })),
    }),
  ])

  const saved = await prisma.milestoneTemplateConfig.findMany({
    where: { projectType: dbType },
    orderBy: { sortOrder: 'asc' },
  })

  return NextResponse.json({
    projectType,
    isCustomized: true,
    templates: saved.map(r => ({ id: r.id, name: r.name, durationDays: r.durationDays })),
  })
}
