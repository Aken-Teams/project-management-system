import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

async function guardAdmin(request: NextRequest) {
  const email = request.headers.get('x-user-email') ?? ''
  if (!email) return false
  const user = await prisma.user.findUnique({ where: { email }, select: { role: true } })
  return user?.role === 'admin'
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  if (!await guardAdmin(request)) {
    return NextResponse.json({ error: '無權限' }, { status: 403 })
  }

  const { key } = await params
  const count = await prisma.project.count({ where: { projectType: key } })
  return NextResponse.json({ count })
}
