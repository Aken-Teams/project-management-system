import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { notifTypeToDb, notifTypeToFe } from '@/lib/enum-mappers'
import type { NotificationType as FeNotifType } from '@/lib/notification-store'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 100)

    if (!userId) {
      return NextResponse.json({ error: '缺少 userId' }, { status: 400 })
    }

    const notifications = await prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })

    return NextResponse.json(
      notifications.map(n => ({
        id: n.id,
        type: notifTypeToFe(n.type),
        title: n.title,
        message: n.message,
        read: n.read,
        createdAt: n.createdAt.toISOString(),
        projectId: n.projectId ?? undefined,
      }))
    )
  } catch (error) {
    console.error('Failed to fetch notifications:', error)
    return NextResponse.json({ error: '讀取通知失敗' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId, type, title, message, projectId } = body

    if (!userId || !type || !title || !message) {
      return NextResponse.json({ error: '缺少必要欄位' }, { status: 400 })
    }

    const notification = await prisma.notification.create({
      data: {
        userId,
        type: notifTypeToDb(type as FeNotifType),
        title,
        message,
        projectId: projectId ?? null,
      },
    })

    return NextResponse.json({
      id: notification.id,
      type: notifTypeToFe(notification.type),
      title: notification.title,
      message: notification.message,
      read: notification.read,
      createdAt: notification.createdAt.toISOString(),
      projectId: notification.projectId ?? undefined,
    })
  } catch (error) {
    console.error('Failed to create notification:', error)
    return NextResponse.json({ error: '新增通知失敗' }, { status: 500 })
  }
}
