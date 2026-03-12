import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

async function guardAdmin(request: NextRequest) {
  const email = request.headers.get('x-user-email') ?? ''
  if (!email) return false
  const user = await prisma.user.findUnique({ where: { email }, select: { role: true } })
  return user?.role === 'admin'
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  if (!await guardAdmin(request)) {
    return NextResponse.json({ error: '無權限' }, { status: 403 })
  }

  const { key } = await params
  const { label, codePrefix } = await request.json()

  if (!label?.trim()) {
    return NextResponse.json({ error: '類型名稱為必填' }, { status: 400 })
  }

  const existing = await prisma.projectTypeConfig.findUnique({ where: { key } })
  if (!existing) {
    return NextResponse.json({ error: '找不到此專案類型' }, { status: 404 })
  }

  // Validate and sanitize codePrefix
  const cleanPrefix = codePrefix?.trim()?.toUpperCase()?.replace(/[^A-Z0-9]/g, '')?.slice(0, 8)

  // Check prefix uniqueness if changed
  if (cleanPrefix && cleanPrefix !== existing.codePrefix) {
    const conflict = await prisma.projectTypeConfig.findFirst({
      where: { codePrefix: cleanPrefix, key: { not: key } },
    })
    if (conflict) {
      return NextResponse.json(
        { error: `代碼前綴「${cleanPrefix}」已被「${conflict.label}」使用` },
        { status: 400 },
      )
    }
  }

  const updated = await prisma.projectTypeConfig.update({
    where: { key },
    data: {
      label: label.trim(),
      ...(cleanPrefix ? { codePrefix: cleanPrefix } : {}),
    },
  })

  return NextResponse.json(updated)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  if (!await guardAdmin(request)) {
    return NextResponse.json({ error: '無權限' }, { status: 403 })
  }

  const { key } = await params

  const existing = await prisma.projectTypeConfig.findUnique({ where: { key } })
  if (!existing) {
    return NextResponse.json({ error: '找不到此專案類型' }, { status: 404 })
  }

  // Check if any projects use this type
  const projectCount = await prisma.project.count({ where: { projectType: key } })
  if (projectCount > 0) {
    return NextResponse.json(
      { error: `此類型已有 ${projectCount} 個專案，無法刪除` },
      { status: 400 },
    )
  }

  await prisma.projectTypeConfig.delete({ where: { key } })
  return NextResponse.json({ ok: true })
}
