import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import crypto from 'crypto'

type RouteContext = { params: Promise<{ id: string }> }

// ─── POST /api/projects/[id]/share — Create or get existing share link ───

export async function POST(
  request: NextRequest,
  { params }: RouteContext,
) {
  try {
    const { id } = await params
    const { userId } = await request.json()

    // Check if project exists
    const project = await prisma.project.findUnique({ where: { id } })
    if (!project) {
      return NextResponse.json({ error: '找不到專案' }, { status: 404 })
    }

    // Check for existing active share link
    const existing = await prisma.shareLink.findFirst({
      where: {
        projectId: id,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
    })

    if (existing) {
      return NextResponse.json({ token: existing.token })
    }

    // Create new share link with random token
    const token = crypto.randomBytes(16).toString('base64url')
    await prisma.shareLink.create({
      data: {
        projectId: id,
        token,
        createdById: userId,
      },
    })

    return NextResponse.json({ token })
  } catch (error) {
    console.error('Failed to create share link:', error)
    return NextResponse.json({ error: '建立分享連結失敗' }, { status: 500 })
  }
}
