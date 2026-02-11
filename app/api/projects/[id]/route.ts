import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { dbProjectToFrontend, projectFullInclude } from '@/lib/project-transformer'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params

    const project = await prisma.project.findUnique({
      where: { id },
      include: projectFullInclude,
    })

    if (!project) {
      return NextResponse.json({ error: '找不到專案' }, { status: 404 })
    }

    const feProject = dbProjectToFrontend(project as Parameters<typeof dbProjectToFrontend>[0])

    return NextResponse.json(feProject)
  } catch (error) {
    console.error('Failed to fetch project:', error)
    return NextResponse.json(
      { error: '讀取專案失敗' },
      { status: 500 },
    )
  }
}
