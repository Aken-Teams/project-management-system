import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// ─── GET /api/users/search?q=keyword&limit=8 ────────────
export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams.get('q')?.trim()
    const limit = Number(request.nextUrl.searchParams.get('limit')) || 8

    if (!q) {
      return NextResponse.json([])
    }

    const users = await prisma.user.findMany({
      where: {
        OR: [
          { name: { contains: q } },
          { email: { contains: q } },
        ],
      },
      select: {
        id: true,
        name: true,
        email: true,
        jobTitle: true,
        organization: true,
      },
      take: limit,
      orderBy: { name: 'asc' },
    })

    return NextResponse.json(users)
  } catch (error) {
    console.error('Failed to search users:', error)
    return NextResponse.json({ error: '搜尋使用者失敗' }, { status: 500 })
  }
}
