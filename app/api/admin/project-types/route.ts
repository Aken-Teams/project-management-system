import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { PROJECT_TYPE_LABELS } from '@/lib/mock-data'
import { MILESTONE_TEMPLATES } from '@/lib/milestone-templates'
import { generateCodePrefix, BUILTIN_CODE_PREFIX } from '@/lib/code-prefix'

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

  const builtIns = Object.keys(MILESTONE_TEMPLATES).map((feKey, i) => {
    const dbKey = feKey.replace(/-/g, '_')
    return {
      key: dbKey,
      label: PROJECT_TYPE_LABELS[feKey] ?? feKey,
      codePrefix: BUILTIN_CODE_PREFIX[dbKey] ?? generateCodePrefix(feKey),
      isBuiltIn: true,
      sortOrder: i,
      isActive: true,
    }
  })

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

  const { label, codePrefix: userPrefix } = await request.json()
  if (!label?.trim()) {
    return NextResponse.json({ error: '類型名稱為必填' }, { status: 400 })
  }

  // Auto-generate key from timestamp to ensure uniqueness
  const key = `custom_${Date.now()}`

  // Use user-provided prefix if given, otherwise auto-generate
  let codePrefix = userPrefix?.trim()?.toUpperCase()?.replace(/[^A-Z0-9]/g, '')?.slice(0, 8)
    || generateCodePrefix(label.trim())

  // Ensure prefix uniqueness — append digit if conflict
  const existing = await prisma.projectTypeConfig.findFirst({
    where: { codePrefix },
  })
  if (existing) {
    for (let i = 2; i <= 9; i++) {
      const candidate = `${codePrefix.slice(0, 7)}${i}`
      const conflict = await prisma.projectTypeConfig.findFirst({
        where: { codePrefix: candidate },
      })
      if (!conflict) {
        codePrefix = candidate
        break
      }
    }
  }

  const maxOrder = await prisma.projectTypeConfig.aggregate({ _max: { sortOrder: true } })
  const sortOrder = (maxOrder._max.sortOrder ?? 0) + 1

  const created = await prisma.projectTypeConfig.create({
    data: { key, label: label.trim(), codePrefix, isBuiltIn: false, sortOrder },
  })

  return NextResponse.json(created, { status: 201 })
}
