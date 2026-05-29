import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { sendMail } from '@/lib/send-mail'

function replaceVars(template: string, vars: Record<string, string>): string {
  return template.replace(/{{(\w+)}}/g, (_, key) => vars[key] ?? `{{${key}}}`)
}

function getWeekStart(): Date {
  const now = new Date()
  const day = now.getDay() // 0=Sun
  const monday = new Date(now)
  monday.setDate(now.getDate() - ((day === 0 ? 7 : day) - 1))
  monday.setHours(0, 0, 0, 0)
  return monday
}

/** ISO week number (1-53) */
function getISOWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}

async function guardCron(request: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET
  if (!secret) return true // no secret configured = allow in dev
  const auth = request.headers.get('authorization') ?? ''
  return auth === `Bearer ${secret}`
}

// Default template values (fallback if no profile exists at all)
const FALLBACK_TEMPLATES = {
  notifyTitle: '週報尚未上傳',
  notifyMessage: '【{{projectName}}】本週進度尚未更新，請盡快上傳週報。',
  uploadedTitle: '週報已產生',
  uploadedMessage: '【{{projectName}}】本週週報已產生，請至更新紀錄確認。',
  emailSubject: '【週報提醒】{{projectName}} 本週（{{weekOf}}）尚未上傳',
  emailBody: '{{pmName}} 您好，\n\n【{{projectName}}】本週（{{weekOf}}）的進度週報尚未上傳，請盡快完成上傳。\n\n如已上傳請忽略此信。\n\n謝謝',
}

interface MergedProfile {
  frequencyWeeks: number
  dayOfWeek: number
  hour: number
  notifyTitle: string
  notifyMessage: string
  uploadedTitle: string
  uploadedMessage: string
  emailSubject: string
  emailBody: string
}

/** Merge a tier-specific profile with the default profile, falling back for null fields */
function mergeProfile(
  tierProfile: {
    frequencyWeeks: number; dayOfWeek: number; hour: number
    notifyTitle: string | null; notifyMessage: string | null
    uploadedTitle: string | null; uploadedMessage: string | null
    emailSubject: string | null; emailBody: string | null
  } | null,
  defaultProfile: {
    frequencyWeeks: number; dayOfWeek: number; hour: number
    notifyTitle: string | null; notifyMessage: string | null
    uploadedTitle: string | null; uploadedMessage: string | null
    emailSubject: string | null; emailBody: string | null
  } | null,
): MergedProfile {
  const base = defaultProfile ?? tierProfile
  const over = tierProfile

  return {
    frequencyWeeks: over?.frequencyWeeks ?? base?.frequencyWeeks ?? 1,
    dayOfWeek: over?.dayOfWeek ?? base?.dayOfWeek ?? 5,
    hour: over?.hour ?? base?.hour ?? 9,
    notifyTitle: over?.notifyTitle ?? base?.notifyTitle ?? FALLBACK_TEMPLATES.notifyTitle,
    notifyMessage: over?.notifyMessage ?? base?.notifyMessage ?? FALLBACK_TEMPLATES.notifyMessage,
    uploadedTitle: over?.uploadedTitle ?? base?.uploadedTitle ?? FALLBACK_TEMPLATES.uploadedTitle,
    uploadedMessage: over?.uploadedMessage ?? base?.uploadedMessage ?? FALLBACK_TEMPLATES.uploadedMessage,
    emailSubject: over?.emailSubject ?? base?.emailSubject ?? FALLBACK_TEMPLATES.emailSubject,
    emailBody: over?.emailBody ?? base?.emailBody ?? FALLBACK_TEMPLATES.emailBody,
  }
}

export async function POST(request: NextRequest) {
  if (!await guardCron(request)) {
    return NextResponse.json({ error: '未授權' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const isPreview = searchParams.get('preview') === '1' || searchParams.get('dryRun') === '1'

  const runAt = new Date()
  let affectedCount = 0
  const summaryParts: string[] = []

  try {
    // ── Check if notification cron is enabled ───────────────────────────────────
    const enabledSetting = await prisma.systemSetting.findUnique({
      where: { key: 'cron.notification.enabled' },
    })
    if (enabledSetting?.value === 'false') {
      if (isPreview) {
        return NextResponse.json({ preview: true, paused: true, message: '通知排程已暫停' })
      }
      return NextResponse.json({ ok: true, skipped: true, reason: '通知排程已暫停' })
    }

    // ── Load all notification profiles ─────────────────────────────────────────
    const allProfiles = await prisma.notificationProfile.findMany()
    const defaultProfile = allProfiles.find(p => p.projectTier === null) ?? null
    const tierProfileMap = new Map(
      allProfiles.filter(p => p.projectTier !== null).map(p => [p.projectTier!, p])
    )

    // Build merged profile per tier
    const profileByTier = new Map<string, MergedProfile>()
    for (const tier of ['T1', 'T2', 'T3', 'CIP'] as const) {
      const tierProf = tierProfileMap.get(tier) ?? null
      profileByTier.set(tier, mergeProfile(tierProf, defaultProfile))
    }
    // Default merged profile for projects without a tier
    const fallbackProfile = mergeProfile(null, defaultProfile)

    // ── Frequency gate: check ISO week number ──────────────────────────────────
    const now = new Date()
    const isoWeek = getISOWeekNumber(now)
    const nowDay = now.getDay()
    const nowHour = now.getHours()

    const weekStart = getWeekStart()
    const weekOf = weekStart.toISOString().split('T')[0]

    // ── Fetch all projects with team + projectTier ─────────────────────────────
    const projects = await prisma.project.findMany({
      select: {
        id: true,
        name: true,
        projectTier: true,
        teamMembers: {
          select: {
            role: true,
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    })

    // Preview accumulator
    const previewResults: {
      projectId: string
      projectName: string
      projectTier: string | null
      status: 'missing' | 'uploaded' | 'skipped'
      skipReason?: string
      pm: { name: string; email?: string | null } | null
      teamEmails: string[]
      profile: MergedProfile
      emailPreview?: { subject: string; body: string; to: string[] }
      siteNotifications?: { userId: string; userName: string; title: string; message: string }[]
    }[] = []

    // Per-tier summary for logging
    const tierSummary: Record<string, { notified: number; skipped: number }> = {}

    for (const project of projects) {
      const tier = project.projectTier ?? null
      const profile = (tier ? profileByTier.get(tier) : null) ?? fallbackProfile

      // Initialize tier summary
      const tierKey = tier ?? '(default)'
      if (!tierSummary[tierKey]) tierSummary[tierKey] = { notified: 0, skipped: 0 }

      // ── Schedule gate: check dayOfWeek + hour (skip in preview) ─────────────
      if (!isPreview) {
        if (nowDay !== profile.dayOfWeek || nowHour !== profile.hour) {
          tierSummary[tierKey].skipped++
          continue
        }
      }

      // ── Frequency gate: check ISO week vs frequencyWeeks ───────────────────
      if (profile.frequencyWeeks > 1 && isoWeek % profile.frequencyWeeks !== 0) {
        if (isPreview) {
          const pmEntry = project.teamMembers.find(m => m.role === 'A')
          const pm = pmEntry?.user ?? null
          previewResults.push({
            projectId: project.id,
            projectName: project.name,
            projectTier: tier,
            status: 'skipped',
            skipReason: `本週（第${isoWeek}週）非通知週（每${profile.frequencyWeeks}週通知一次）`,
            pm: pm ? { name: pm.name, email: pm.email } : null,
            teamEmails: project.teamMembers.map(m => m.user.email).filter((e): e is string => !!e),
            profile,
          })
        }
        tierSummary[tierKey].skipped++
        continue
      }

      // Identify PM = first member with role 'A'
      const pmEntry = project.teamMembers.find(m => m.role === 'A')
      const pm = pmEntry?.user ?? null

      // Check if any WeeklyUpdate was submitted this week
      const updateCount = await prisma.weeklyUpdate.count({
        where: { projectId: project.id, weekOf: { gte: weekStart } },
      })

      const vars = {
        projectName: project.name,
        weekOf,
        pmName: pm?.name ?? '專案負責人',
      }

      // Collect all team member emails
      const teamEmails = project.teamMembers
        .map(m => m.user.email)
        .filter((e): e is string => !!e)

      if (updateCount === 0) {
        // ── Missing: notify PM + all team members ──────────────────────────────
        const title = replaceVars(profile.notifyTitle, vars)
        const message = replaceVars(profile.notifyMessage, vars)
        const emailSubject = replaceVars(profile.emailSubject, vars)
        const emailBody = replaceVars(profile.emailBody, vars)

        if (isPreview) {
          previewResults.push({
            projectId: project.id,
            projectName: project.name,
            projectTier: tier,
            status: 'missing',
            pm: pm ? { name: pm.name, email: pm.email } : null,
            teamEmails,
            profile,
            emailPreview: { subject: emailSubject, body: emailBody, to: teamEmails },
            siteNotifications: project.teamMembers.map(m => ({
              userId: m.user.id,
              userName: m.user.name,
              title,
              message,
            })),
          })
        } else {
          // Create in-app notification for every team member
          for (const member of project.teamMembers) {
            await prisma.notification.create({
              data: {
                userId: member.user.id,
                type: 'weekly_upload_missing',
                title,
                message,
                projectId: project.id,
              },
            })
          }

          // Send email to all team members who have an email address
          if (teamEmails.length > 0 && process.env.AD_URL && process.env.AD_API) {
            try {
              await sendMail({ to: teamEmails, subject: emailSubject, body: emailBody })
            } catch (e) {
              console.error(`Failed to send notification email for "${project.name}":`, e)
            }
          }
        }

        affectedCount++
        tierSummary[tierKey].notified++
        summaryParts.push(project.name)
      } else {
        if (isPreview) {
          previewResults.push({
            projectId: project.id,
            projectName: project.name,
            projectTier: tier,
            status: 'uploaded',
            pm: pm ? { name: pm.name, email: pm.email } : null,
            teamEmails,
            profile,
          })
        }
      }
    }

    // ── Preview response ───────────────────────────────────────────────────────
    if (isPreview) {
      const missing = previewResults.filter(p => p.status === 'missing')
      const uploaded = previewResults.filter(p => p.status === 'uploaded')
      const skipped = previewResults.filter(p => p.status === 'skipped')
      return NextResponse.json({
        preview: true,
        weekOf,
        isoWeek,
        profiles: {
          default: defaultProfile ? mergeProfile(null, defaultProfile) : fallbackProfile,
          byTier: Object.fromEntries(profileByTier),
        },
        projects: previewResults,
        tierSummary,
        summary: [
          `${missing.length} 個專案未上傳（將發送通知）`,
          `${uploaded.length} 個已上傳`,
          skipped.length > 0 ? `${skipped.length} 個因頻率設定跳過` : null,
        ].filter(Boolean).join('，'),
      })
    }

    // Build detailed summary with per-tier info
    const tierDetails = Object.entries(tierSummary)
      .filter(([, v]) => v.notified > 0 || v.skipped > 0)
      .map(([tier, v]) => `${tier}: ${v.notified}通知/${v.skipped}跳過`)
      .join(', ')

    const summary = summaryParts.length > 0
      ? `${summaryParts.length} 個專案未上傳週報：${summaryParts.slice(0, 3).join('、')}${summaryParts.length > 3 ? '...' : ''}（${tierDetails}）`
      : `${projects.length} 個專案均已上傳週報`

    await prisma.cronJobLog.create({
      data: { jobType: 'weekly_notification', runAt, status: 'success', summary, affectedCount },
    })

    return NextResponse.json({ ok: true, affectedCount, summary, tierSummary })
  } catch (error) {
    console.error('weekly-notification cron error:', error)
    if (!isPreview) {
      await prisma.cronJobLog.create({
        data: {
          jobType: 'weekly_notification',
          runAt,
          status: 'failed',
          summary: error instanceof Error ? error.message : '未知錯誤',
          affectedCount: 0,
        },
      })
    }
    return NextResponse.json({ error: '執行失敗' }, { status: 500 })
  }
}

// Allow GET for easy browser / cron-service triggering
export const GET = POST
