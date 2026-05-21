import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import crypto from 'crypto'

type RouteContext = { params: Promise<{ id: string }> }

// ─── GET /api/projects/[id]/share — List all share links ───

export async function GET(
  _request: NextRequest,
  { params }: RouteContext,
) {
  try {
    const { id } = await params
    const links = await prisma.shareLink.findMany({
      where: { projectId: id },
      include: { createdBy: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(links)
  } catch (error) {
    console.error('Failed to list share links:', error)
    return NextResponse.json({ error: '讀取分享連結失敗' }, { status: 500 })
  }
}

// ─── DELETE /api/projects/[id]/share — Delete a share link ───

export async function DELETE(
  request: NextRequest,
  { params }: RouteContext,
) {
  try {
    const { id } = await params
    const { linkId } = await request.json()
    await prisma.shareLink.delete({
      where: { id: linkId, projectId: id },
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Failed to delete share link:', error)
    return NextResponse.json({ error: '刪除分享連結失敗' }, { status: 500 })
  }
}

// ─── POST /api/projects/[id]/share — Create or get existing share link ───

export async function POST(
  request: NextRequest,
  { params }: RouteContext,
) {
  try {
    const { id } = await params
    const { userId, expiresAt } = await request.json()

    // Check if project exists
    const project = await prisma.project.findUnique({ where: { id } })
    if (!project) {
      return NextResponse.json({ error: '找不到專案' }, { status: 404 })
    }

    // Create new share link with random token and expiration
    const token = crypto.randomBytes(16).toString('base64url')
    const link = await prisma.shareLink.create({
      data: {
        projectId: id,
        token,
        createdById: userId,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
    })

    return NextResponse.json({ token: link.token, expiresAt: link.expiresAt })
  } catch (error) {
    console.error('Failed to create share link:', error)
    return NextResponse.json({ error: '建立分享連結失敗' }, { status: 500 })
  }
}
