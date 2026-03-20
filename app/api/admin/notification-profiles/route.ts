import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

async function guardAdmin(request: NextRequest) {
  const email = request.headers.get('x-user-email') ?? ''
  if (!email) return false
  const user = await prisma.user.findUnique({ where: { email }, select: { role: true } })
  return user?.role === 'admin'
}

// Default template values (used when creating the default profile for the first time)
const DEFAULT_TEMPLATES = {
  notifyTitle: '週報尚未上傳',
  notifyMessage: '【{{projectName}}】本週進度尚未更新，請盡快上傳週報。',
  uploadedTitle: '週報已產生',
  uploadedMessage: '【{{projectName}}】本週週報已產生，請至更新紀錄確認。',
  emailSubject: '【週報提醒】{{projectName}} 本週（{{weekOf}}）尚未上傳',
  emailBody: '{{pmName}} 您好，\n\n【{{projectName}}】本週（{{weekOf}}）的進度週報尚未上傳，請盡快完成上傳。\n\n如已上傳請忽略此信。\n\n謝謝',
}

/** Ensure a default profile (projectTier = null) exists, migrating from SystemSetting if needed */
async function ensureDefaultProfile() {
  const existing = await prisma.notificationProfile.findFirst({
    where: { projectTier: null },
  })
  if (existing) return existing

  // Try to migrate from old SystemSetting keys
  const settingRows = await prisma.systemSetting.findMany({
    where: {
      key: {
        in: [
          'notification.schedule.dayOfWeek',
          'notification.schedule.hour',
          'notification.template.weekly_upload_missing.title',
          'notification.template.weekly_upload_missing.message',
          'notification.template.weekly_upload_missing.email_subject',
          'notification.template.weekly_upload_missing.email_body',
          'notification.template.weekly_report_ready.title',
          'notification.template.weekly_report_ready.message',
        ],
      },
    },
  })
  const s: Record<string, string> = Object.fromEntries(settingRows.map(r => [r.key, r.value]))

  return prisma.notificationProfile.create({
    data: {
      projectTier: null,
      frequencyWeeks: 1,
      dayOfWeek: parseInt(s['notification.schedule.dayOfWeek'] ?? '5'),
      hour: parseInt(s['notification.schedule.hour'] ?? '9'),
      notifyTitle: s['notification.template.weekly_upload_missing.title'] ?? DEFAULT_TEMPLATES.notifyTitle,
      notifyMessage: s['notification.template.weekly_upload_missing.message'] ?? DEFAULT_TEMPLATES.notifyMessage,
      uploadedTitle: s['notification.template.weekly_report_ready.title'] ?? DEFAULT_TEMPLATES.uploadedTitle,
      uploadedMessage: s['notification.template.weekly_report_ready.message'] ?? DEFAULT_TEMPLATES.uploadedMessage,
      emailSubject: s['notification.template.weekly_upload_missing.email_subject'] ?? DEFAULT_TEMPLATES.emailSubject,
      emailBody: s['notification.template.weekly_upload_missing.email_body'] ?? DEFAULT_TEMPLATES.emailBody,
    },
  })
}

// GET /api/admin/notification-profiles — list all profiles + available tiers
export async function GET(request: NextRequest) {
  if (!await guardAdmin(request)) {
    return NextResponse.json({ error: '無權限' }, { status: 403 })
  }

  await ensureDefaultProfile()

  const profiles = await prisma.notificationProfile.findMany({ orderBy: { createdAt: 'asc' } })

  const defaultProfile = profiles.find(p => p.projectTier === null)
  const tierProfiles = profiles.filter(p => p.projectTier !== null)

  return NextResponse.json({
    defaultProfile,
    tierProfiles,
    tiers: ['T1', 'T2', 'T3', 'CIP'],
  })
}
