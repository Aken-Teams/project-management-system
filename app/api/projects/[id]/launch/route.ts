import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const project = await prisma.project.findUnique({
      where: { id },
      include: { milestones: true },
    })
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }
    if (project.phase === 'active') {
      return NextResponse.json({ error: 'Project already launched' }, { status: 400 })
    }

    await prisma.$transaction([
      prisma.project.update({
        where: { id },
        data: { phase: 'active' },
      }),
      prisma.milestoneBaseline.deleteMany({ where: { projectId: id } }),
      ...(project.milestones.length > 0
        ? [prisma.milestoneBaseline.createMany({
            data: project.milestones.map((m: { id: string; name: string; dueDate: Date }) => ({
              projectId: id,
              milestoneId: m.id,
              name: m.name,
              dueDate: m.dueDate,
            })),
          })]
        : []),
    ])

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Launch project error:', err)
    return NextResponse.json(
      { error: 'Failed to launch project' },
      { status: 500 },
    )
  }
}
