import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// ─── GET /api/drafts?email={email} ──────────────────────
export async function GET(request: NextRequest) {
  try {
    const email = request.nextUrl.searchParams.get('email')
    if (!email) {
      return NextResponse.json({ error: '缺少 email' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) {
      return NextResponse.json([])
    }

    const drafts = await prisma.projectDraft.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        title: true,
        mode: true,
        data: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    return NextResponse.json(drafts)
  } catch (error) {
    console.error('Failed to fetch drafts:', error)
    return NextResponse.json({ error: '讀取草稿失敗' }, { status: 500 })
  }
}

// ─── POST /api/drafts ────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    if (!body.email || !body.title || !body.mode) {
      return NextResponse.json({ error: '缺少必要欄位' }, { status: 400 })
    }

    // Find or create user by email
    let user = await prisma.user.findUnique({ where: { email: body.email } })
    if (!user) {
      user = await prisma.user.create({
        data: {
          name: body.userName || body.email.split('@')[0],
          email: body.email,
          role: 'member',
        },
      })
    }

    const draft = await prisma.projectDraft.create({
      data: {
        userId: user.id,
        title: body.title,
        mode: body.mode,
        data: body.data ?? {},
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

    return NextResponse.json(draft, { status: 201 })
  } catch (error) {
    console.error('Failed to create draft:', error)
    return NextResponse.json({ error: '儲存草稿失敗' }, { status: 500 })
  }
}
