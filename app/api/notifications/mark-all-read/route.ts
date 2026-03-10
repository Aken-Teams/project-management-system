import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function PATCH(request: NextRequest) {
  try {
    const { userId } = await request.json()

    if (!userId) {
      return NextResponse.json({ error: '缺少 userId' }, { status: 400 })
    }

    const result = await prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    })

    return NextResponse.json({ count: result.count })
  } catch (error) {
    console.error('Failed to mark all read:', error)
    return NextResponse.json({ error: '更新通知失敗' }, { status: 500 })
  }
}
