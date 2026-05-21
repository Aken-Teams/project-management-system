import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

type RouteContext = { params: Promise<{ id: string }> }

// ─── POST /api/projects/[id]/milestones — Add milestone to project ───

interface AddMilestoneBody {
  name: string
  dueDate: string
  startDate?: string
}

export async function POST(
  request: NextRequest,
  { params }: RouteContext,
) {
  try {
    const { id } = await params
    const body: AddMilestoneBody = await request.json()

    const project = await prisma.project.findUnique({ where: { id } })
    if (!project) {
      return NextResponse.json({ error: '找不到專案' }, { status: 404 })
    }

    if (!body.name?.trim()) {
      return NextResponse.json({ error: '里程碑名稱為必填' }, { status: 400 })
    }
    if (!body.dueDate) {
      return NextResponse.json({ error: '到期日為必填' }, { status: 400 })
    }

    const maxSort = await prisma.milestone.aggregate({
      where: { projectId: id },
      _max: { sortOrder: true },
    })

    const milestone = await prisma.milestone.create({
      data: {
        projectId: id,
        name: body.name.trim(),
        startDate: body.startDate ? new Date(body.startDate) : undefined,
        dueDate: new Date(body.dueDate),
        sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
      },
    })

    return NextResponse.json({
      id: milestone.id,
      projectId: id,
      name: milestone.name,
      dueDate: milestone.dueDate.toISOString().slice(0, 10),
      status: milestone.status,
      progress: milestone.progress,
      sortOrder: milestone.sortOrder,
    }, { status: 201 })
  } catch (error) {
    console.error('Failed to add milestone:', error)
    return NextResponse.json({ error: '新增里程碑失敗' }, { status: 500 })
  }
}
