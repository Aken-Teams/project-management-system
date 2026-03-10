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
  const jobType = searchParams.get('jobType') ?? ''
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '10'), 50)

  const logs = await prisma.cronJobLog.findMany({
    where: jobType ? { jobType } : undefined,
    orderBy: { runAt: 'desc' },
    take: limit,
  })

  return NextResponse.json(logs)
}
