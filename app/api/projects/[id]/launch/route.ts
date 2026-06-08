import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const body = await request.json().catch(() => ({}))
    const targetPhase = body.phase as string | undefined

    const project = await prisma.project.findUnique({
      where: { id },
      include: { milestones: true },
    })
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const newPhase = targetPhase === 'draft' ? 'draft' : 'active'
    if (project.phase === newPhase) {
      return NextResponse.json({ error: 'Phase unchanged' }, { status: 400 })
    }

    if (newPhase === 'active') {
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
    } else {
      await prisma.project.update({
        where: { id },
        data: { phase: 'draft' },
      })
    }

    return NextResponse.json({ success: true, phase: newPhase })
  } catch (err) {
    console.error('Toggle project phase error:', err)
    return NextResponse.json(
      { error: 'Failed to update project phase' },
      { status: 500 },
    )
  }
}
