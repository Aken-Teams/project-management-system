import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { dbProjectToFrontend, projectFullInclude } from '@/lib/project-transformer'

type RouteContext = { params: Promise<{ token: string }> }

// ─── GET /api/share/[token] — Public read-only project data ───

export async function GET(
  _request: NextRequest,
  { params }: RouteContext,
) {
  try {
    const { token } = await params

    const shareLink = await prisma.shareLink.findUnique({
      where: { token },
    })

    if (!shareLink) {
      return NextResponse.json({ error: '分享連結無效' }, { status: 404 })
    }

    // Check expiration
    if (shareLink.expiresAt && new Date() > shareLink.expiresAt) {
      return NextResponse.json({ error: '分享連結已過期' }, { status: 410 })
    }

    const project = await prisma.project.findUnique({
      where: { id: shareLink.projectId },
      include: projectFullInclude,
    })

    if (!project) {
      return NextResponse.json({ error: '專案不存在' }, { status: 404 })
    }

    const feProject = dbProjectToFrontend(project as Parameters<typeof dbProjectToFrontend>[0])

    return NextResponse.json(feProject)
  } catch (error) {
    console.error('Failed to fetch shared project:', error)
    return NextResponse.json({ error: '讀取分享專案失敗' }, { status: 500 })
  }
}
