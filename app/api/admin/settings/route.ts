import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

async function guardAdmin(request: NextRequest) {
  const email = request.headers.get('x-user-email') ?? ''
  if (!email) return false
  const user = await prisma.user.findUnique({ where: { email }, select: { role: true } })
  return user?.role === 'admin'
}

export async function GET(request: NextRequest) {
  if (!await guardAdmin(request)) {
    return NextResponse.json({ error: '無權限' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const keysParam = searchParams.get('keys')
  const keys = keysParam ? keysParam.split(',').map(k => k.trim()).filter(Boolean) : []

  const rows = await prisma.systemSetting.findMany(
    keys.length > 0 ? { where: { key: { in: keys } } } : undefined
  )

  const result: Record<string, string> = {}
  rows.forEach(r => { result[r.key] = r.value })
  return NextResponse.json(result)
}

export async function PUT(request: NextRequest) {
  if (!await guardAdmin(request)) {
    return NextResponse.json({ error: '無權限' }, { status: 403 })
  }

  const body: Record<string, string> = await request.json()
  const entries = Object.entries(body)

  if (entries.length === 0) {
    return NextResponse.json({ error: '沒有提供設定值' }, { status: 400 })
  }

  await Promise.all(
    entries.map(([key, value]) =>
      prisma.systemSetting.upsert({
        where: { key },
        create: { key, value: String(value) },
        update: { value: String(value) },
      })
    )
  )

  return NextResponse.json({ updated: entries.map(([k]) => k) })
}
