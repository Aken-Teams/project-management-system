import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

const AD_URL = process.env.AD_URL
const AD_API = process.env.AD_API

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

async function guardCron(request: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET
  if (!secret) return true // no secret configured = allow in dev
  const auth = request.headers.get('authorization') ?? ''
  return auth === `Bearer ${secret}`
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
    // Load all relevant settings
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
          ],
        },
      },
    })
    const settings: Record<string, string> = Object.fromEntries(
      settingRows.map(r => [r.key, r.value])
    )

    // ── Schedule gate (skip in preview mode) ──────────────────────────────────
    if (!isPreview) {
      const configDay = parseInt(settings['notification.schedule.dayOfWeek'] ?? '5')  // 0=Sun..6=Sat
      const configHour = parseInt(settings['notification.schedule.hour'] ?? '9')
      const now = new Date()
      const nowDay = now.getDay()
      const nowHour = now.getHours()
      if (nowDay !== configDay || nowHour !== configHour) {
        return NextResponse.json({
          ok: false,
          skipped: true,
          reason: `非排程執行時間（設定：週${configDay} ${configHour}:00，現在：週${nowDay} ${nowHour}:00）`,
        })
      }
    }

    // ── Template defaults ──────────────────────────────────────────────────────
    const missingTitle    = settings['notification.template.weekly_upload_missing.title']          ?? '週報尚未上傳'
    const missingMsg      = settings['notification.template.weekly_upload_missing.message']        ?? '【{{projectName}}】本週進度尚未更新，請盡快上傳週報。'
    const emailSubjectTpl = settings['notification.template.weekly_upload_missing.email_subject']  ?? '【週報提醒】{{projectName}} 本週（{{weekOf}}）尚未上傳'
    const emailBodyTpl    = settings['notification.template.weekly_upload_missing.email_body']     ?? '{{pmName}} 您好，\n\n【{{projectName}}】本週（{{weekOf}}）的進度週報尚未上傳，請盡快完成上傳。\n\n謝謝'

    const weekStart = getWeekStart()
    const weekOf = weekStart.toISOString().split('T')[0]

    // ── Fetch all projects with their full team ────────────────────────────────
    // PM = team member with TeamRole 'A' (Accountable in RACI)
    const projects = await prisma.project.findMany({
      select: {
        id: true,
        name: true,
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
      status: 'missing' | 'uploaded'
      pm: { name: string; email?: string | null } | null
      teamEmails: string[]
      emailPreview?: { subject: string; body: string; to: string[] }
      siteNotifications?: { userId: string; userName: string; title: string; message: string }[]
    }[] = []

    for (const project of projects) {
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

      // Collect all team member emails for this project
      const teamEmails = project.teamMembers
        .map(m => m.user.email)
        .filter((e): e is string => !!e)

      if (updateCount === 0) {
        // ── Missing: notify PM + all team members ────────────────────────────
        const title   = replaceVars(missingTitle, vars)
        const message = replaceVars(missingMsg, vars)
        const emailSubject = replaceVars(emailSubjectTpl, vars)
        const emailBody    = replaceVars(emailBodyTpl, vars)

        if (isPreview) {
          previewResults.push({
            projectId: project.id,
            projectName: project.name,
            status: 'missing',
            pm: pm ? { name: pm.name, email: pm.email } : null,
            teamEmails,
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
          if (teamEmails.length > 0 && AD_URL && AD_API) {
            try {
              await fetch(`${AD_URL}/api/v1/mail/send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-API-Key': AD_API },
                body: JSON.stringify({ to: teamEmails, subject: emailSubject, body: emailBody }),
              })
            } catch (e) {
              console.error(`Failed to send notification email for "${project.name}":`, e)
            }
          }
        }

        affectedCount++
        summaryParts.push(project.name)
      } else {
        if (isPreview) {
          previewResults.push({
            projectId: project.id,
            projectName: project.name,
            status: 'uploaded',
            pm: pm ? { name: pm.name, email: pm.email } : null,
            teamEmails,
          })
        }
      }
    }

    // ── Preview response ───────────────────────────────────────────────────────
    if (isPreview) {
      const missing  = previewResults.filter(p => p.status === 'missing')
      const uploaded = previewResults.filter(p => p.status === 'uploaded')
      return NextResponse.json({
        preview: true,
        weekOf,
        configuredSchedule: {
          dayOfWeek: settings['notification.schedule.dayOfWeek'] ?? '5',
          hour: settings['notification.schedule.hour'] ?? '9',
        },
        templates: {
          siteTitle: missingTitle,
          siteMessage: missingMsg,
          emailSubject: emailSubjectTpl,
          emailBody: emailBodyTpl,
        },
        projects: previewResults,
        summary: `${missing.length} 個專案未上傳（將發送通知 + Email），${uploaded.length} 個已上傳`,
      })
    }

    const summary = summaryParts.length > 0
      ? `${summaryParts.length} 個專案未上傳週報：${summaryParts.slice(0, 3).join('、')}${summaryParts.length > 3 ? '...' : ''}`
      : `${projects.length} 個專案均已上傳週報`

    await prisma.cronJobLog.create({
      data: { jobType: 'weekly_notification', runAt, status: 'success', summary, affectedCount },
    })

    return NextResponse.json({ ok: true, affectedCount, summary })
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
