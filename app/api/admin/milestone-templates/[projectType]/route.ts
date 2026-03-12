import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getMilestoneTemplates, MILESTONE_TEMPLATES } from '@/lib/milestone-templates'
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
  const feKey = projectType.replace(/_/g, '-')
  const templates = await getMilestoneTemplates(feKey, prisma)
  const dbRows = await prisma.milestoneTemplateConfig.findMany({
    where: { projectType },
    orderBy: { sortOrder: 'asc' },
    include: {
      tasks: {
        where: { parentId: null },
        orderBy: { sortOrder: 'asc' },
        include: { children: { orderBy: { sortOrder: 'asc' } } },
      },
    },
  })

  return NextResponse.json({
    projectType,
    isCustomized: dbRows.length > 0,
    templates: templates.map((t, i) => ({
      id: dbRows[i]?.id,
      name: t.name,
      durationDays: t.durationDays,
      tasks: (t.tasks ?? []).map((task, j) => ({
        id: dbRows[i]?.tasks?.[j]?.id,
        title: task.title,
        durationDays: task.durationDays,
        priority: task.priority,
        children: (task.children ?? []).map((child, k) => ({
          id: dbRows[i]?.tasks?.[j]?.children?.[k]?.id,
          title: child.title,
          durationDays: child.durationDays,
          priority: child.priority,
        })),
      })),
    })),
  })
}

export async function PUT(request: NextRequest, { params }: RouteContext) {
  if (!await guardAdmin(request)) {
    return NextResponse.json({ error: '無權限' }, { status: 403 })
  }

  const { projectType } = await params
  const feKey = projectType.replace(/_/g, '-')
  const { templates } = await request.json() as {
    templates: {
      name: string
      durationDays: number
      tasks?: {
        title: string
        durationDays: number
        priority: string
        children?: { title: string; durationDays: number; priority: string }[]
      }[]
    }[]
  }

  if (!Array.isArray(templates)) {
    return NextResponse.json({ error: '無效的範本格式' }, { status: 400 })
  }

  if (templates.length === 0) {
    await prisma.milestoneTemplateConfig.deleteMany({ where: { projectType } })
    return NextResponse.json({
      projectType,
      isCustomized: false,
      templates: (MILESTONE_TEMPLATES[feKey] ?? []).map(t => ({
        name: t.name,
        durationDays: t.durationDays,
        tasks: (t.tasks ?? []).map(task => ({
          title: task.title,
          durationDays: task.durationDays,
          priority: task.priority,
          children: task.children ?? [],
        })),
      })),
    })
  }

  // Full replace: use interactive transaction
  await prisma.$transaction(async (tx) => {
    await tx.milestoneTemplateConfig.deleteMany({ where: { projectType } })

    for (let i = 0; i < templates.length; i++) {
      const t = templates[i]
      const milestone = await tx.milestoneTemplateConfig.create({
        data: {
          projectType,
          name: t.name,
          durationDays: t.durationDays,
          sortOrder: i,
        },
      })

      if (t.tasks && t.tasks.length > 0) {
        for (let j = 0; j < t.tasks.length; j++) {
          const task = t.tasks[j]
          const createdTask = await tx.milestoneTemplateTask.create({
            data: {
              milestoneTemplateId: milestone.id,
              title: task.title,
              durationDays: task.durationDays,
              priority: task.priority || 'medium',
              sortOrder: j,
            },
          })

          if (task.children && task.children.length > 0) {
            await tx.milestoneTemplateTask.createMany({
              data: task.children.map((child, k) => ({
                milestoneTemplateId: milestone.id,
                parentId: createdTask.id,
                title: child.title,
                durationDays: child.durationDays,
                priority: child.priority || 'medium',
                sortOrder: k,
              })),
            })
          }
        }
      }
    }
  })

  const saved = await prisma.milestoneTemplateConfig.findMany({
    where: { projectType },
    orderBy: { sortOrder: 'asc' },
    include: {
      tasks: {
        where: { parentId: null },
        orderBy: { sortOrder: 'asc' },
        include: { children: { orderBy: { sortOrder: 'asc' } } },
      },
    },
  })

  return NextResponse.json({
    projectType,
    isCustomized: true,
    templates: saved.map(r => ({
      id: r.id,
      name: r.name,
      durationDays: r.durationDays,
      tasks: r.tasks.map(t => ({
        id: t.id,
        title: t.title,
        durationDays: t.durationDays,
        priority: t.priority,
        children: t.children.map(c => ({
          id: c.id,
          title: c.title,
          durationDays: c.durationDays,
          priority: c.priority,
        })),
      })),
    })),
  })
}
