import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import type { UserRole } from '@prisma/client'

async function guardAdmin(request: NextRequest) {
  const email = request.headers.get('x-user-email') ?? ''
  if (!email) return false
  const user = await prisma.user.findUnique({ where: { email }, select: { role: true } })
  return user?.role === 'admin'
}

const VALID_ROLES: UserRole[] = ['pm', 'member', 'executive', 'admin']

type RouteContext = { params: Promise<{ id: string }> }

export async function PUT(request: NextRequest, { params }: RouteContext) {
  if (!await guardAdmin(request)) {
    return NextResponse.json({ error: '無權限' }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json()
  const data: Record<string, unknown> = {}

  if (body.role !== undefined) {
    if (!VALID_ROLES.includes(body.role)) {
      return NextResponse.json({ error: '無效的角色' }, { status: 400 })
    }
    data.role = body.role
  }
  if (body.organization !== undefined) data.organization = body.organization

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: '沒有提供更新欄位' }, { status: 400 })
  }

  const user = await prisma.user.update({
    where: { id },
    data,
    select: { id: true, name: true, email: true, role: true, organization: true, jobTitle: true },
  })

  return NextResponse.json(user)
}
