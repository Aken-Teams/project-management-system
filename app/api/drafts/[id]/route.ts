import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// ─── PUT /api/drafts/[id] ────────────────────────────────
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params

    const body = await request.json()

    const draft = await prisma.projectDraft.update({
      where: { id },
      data: {
        ...(body.title !== undefined && { title: body.title }),
        ...(body.mode !== undefined && { mode: body.mode }),
        ...(body.data !== undefined && { data: body.data }),
      },
      select: {
        id: true,
        title: true,
        mode: true,
        data: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    return NextResponse.json(draft)
  } catch (error) {
    console.error('Failed to update draft:', error)
    return NextResponse.json({ error: '更新草稿失敗' }, { status: 500 })
  }
}

// ─── DELETE /api/drafts/[id] ─────────────────────────────
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params

    await prisma.projectDraft.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete draft:', error)
    return NextResponse.json({ error: '刪除草稿失敗' }, { status: 500 })
  }
}
