import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { PROJECT_TYPE_LABELS } from '@/lib/mock-data'
import { MILESTONE_TEMPLATES } from '@/lib/milestone-templates'

async function guardAdmin(request: NextRequest) {
  const email = request.headers.get('x-user-email') ?? ''
  if (!email) return false
  const user = await prisma.user.findUnique({ where: { email }, select: { role: true } })
  return user?.role === 'admin'
}

// Seed built-in types if the table is empty
async function ensureBuiltInTypes() {
  const count = await prisma.projectTypeConfig.count()
  if (count > 0) return

  const builtIns = Object.keys(MILESTONE_TEMPLATES).map((feKey, i) => ({
    key: feKey.replace(/-/g, '_'),
    label: PROJECT_TYPE_LABELS[feKey] ?? feKey,
    isBuiltIn: true,
    sortOrder: i,
    isActive: true,
  }))

  await prisma.projectTypeConfig.createMany({ data: builtIns })
}

export async function GET(request: NextRequest) {
  if (!await guardAdmin(request)) {
    return NextResponse.json({ error: '無權限' }, { status: 403 })
  }

  await ensureBuiltInTypes()

  const types = await prisma.projectTypeConfig.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  })

  return NextResponse.json(types)
}

export async function POST(request: NextRequest) {
  if (!await guardAdmin(request)) {
    return NextResponse.json({ error: '無權限' }, { status: 403 })
  }

  const { label } = await request.json()
  if (!label?.trim()) {
    return NextResponse.json({ error: '類型名稱為必填' }, { status: 400 })
  }

  // Auto-generate key from timestamp to ensure uniqueness
  const key = `custom_${Date.now()}`

  const maxOrder = await prisma.projectTypeConfig.aggregate({ _max: { sortOrder: true } })
  const sortOrder = (maxOrder._max.sortOrder ?? 0) + 1

  const created = await prisma.projectTypeConfig.create({
    data: { key, label: label.trim(), isBuiltIn: false, sortOrder },
  })

  return NextResponse.json(created, { status: 201 })
}
