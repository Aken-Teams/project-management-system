import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { ProjectTier } from '@prisma/client'

type RouteContext = { params: Promise<{ tier: string }> }

const VALID_TIERS = new Set<string>(Object.values(ProjectTier))

async function guardAdmin(request: NextRequest) {
  const email = request.headers.get('x-user-email') ?? ''
  if (!email) return false
  const user = await prisma.user.findUnique({ where: { email }, select: { role: true } })
  return user?.role === 'admin'
}

// GET /api/admin/notification-profiles/[tier]
// tier = "default" → get the default profile
// tier = "T1" etc → get tier-specific profile merged with default
export async function GET(
  request: NextRequest,
  { params }: RouteContext,
) {
  if (!await guardAdmin(request)) {
    return NextResponse.json({ error: '無權限' }, { status: 403 })
  }

  const { tier } = await params
  const isDefault = tier === 'default'

  if (!isDefault && !VALID_TIERS.has(tier)) {
    return NextResponse.json({ error: '無效的層級' }, { status: 400 })
  }

  const profile = isDefault
    ? await prisma.notificationProfile.findFirst({ where: { projectTier: null } })
    : await prisma.notificationProfile.findUnique({ where: { projectTier: tier as ProjectTier } })

  if (!profile && isDefault) {
    return NextResponse.json({ error: '預設設定不存在' }, { status: 404 })
  }

  // For tier-specific, also fetch default for merging
  if (!isDefault) {
    const defaultProfile = await prisma.notificationProfile.findFirst({
      where: { projectTier: null },
    })
    return NextResponse.json({
      profile: profile ?? null,
      defaultProfile,
    })
  }

  return NextResponse.json({ profile })
}

// PUT /api/admin/notification-profiles/[tier]
export async function PUT(
  request: NextRequest,
  { params }: RouteContext,
) {
  if (!await guardAdmin(request)) {
    return NextResponse.json({ error: '無權限' }, { status: 403 })
  }

  const { tier } = await params
  const isDefault = tier === 'default'

  if (!isDefault && !VALID_TIERS.has(tier)) {
    return NextResponse.json({ error: '無效的層級' }, { status: 400 })
  }

  const body = await request.json()

  const data = {
    frequencyWeeks: body.frequencyWeeks ?? 1,
    dayOfWeek: body.dayOfWeek ?? 5,
    hour: body.hour ?? 9,
    notifyTitle: body.notifyTitle ?? null,
    notifyMessage: body.notifyMessage ?? null,
    uploadedTitle: body.uploadedTitle ?? null,
    uploadedMessage: body.uploadedMessage ?? null,
    emailSubject: body.emailSubject ?? null,
    emailBody: body.emailBody ?? null,
  }

  let profile
  if (isDefault) {
    const existing = await prisma.notificationProfile.findFirst({ where: { projectTier: null } })
    if (existing) {
      profile = await prisma.notificationProfile.update({ where: { id: existing.id }, data })
    } else {
      profile = await prisma.notificationProfile.create({ data: { projectTier: null, ...data } })
    }
  } else {
    profile = await prisma.notificationProfile.upsert({
      where: { projectTier: tier as ProjectTier },
      create: { projectTier: tier as ProjectTier, ...data },
      update: data,
    })
  }

  return NextResponse.json(profile)
}

// DELETE /api/admin/notification-profiles/[tier]
// Only allowed for tier-specific profiles (not default)
export async function DELETE(
  request: NextRequest,
  { params }: RouteContext,
) {
  if (!await guardAdmin(request)) {
    return NextResponse.json({ error: '無權限' }, { status: 403 })
  }

  const { tier } = await params
  if (tier === 'default') {
    return NextResponse.json({ error: '不能刪除預設設定' }, { status: 400 })
  }

  if (!VALID_TIERS.has(tier)) {
    return NextResponse.json({ error: '無效的層級' }, { status: 400 })
  }

  try {
    await prisma.notificationProfile.delete({
      where: { projectTier: tier as ProjectTier },
    })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: '設定不存在' }, { status: 404 })
  }
}
