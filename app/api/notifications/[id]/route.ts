import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

type RouteContext = { params: Promise<{ id: string }> }

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params
    const { read } = await request.json()

    const notification = await prisma.notification.update({
      where: { id },
      data: { read: Boolean(read) },
    })

    return NextResponse.json({ id: notification.id, read: notification.read })
  } catch (error) {
    console.error('Failed to update notification:', error)
    return NextResponse.json({ error: '更新通知失敗' }, { status: 500 })
  }
}
