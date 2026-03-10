import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

const AD_URL = process.env.AD_URL!
const AD_API = process.env.AD_API!

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
  if (!secret) return true // no secret configured = allow (dev mode)
  const auth = request.headers.get('authorization') ?? ''
  return auth === `Bearer ${secret}`
}

export async function POST(request: NextRequest) {
  if (!await guardCron(request)) {
    return NextResponse.json({ error: '未授權' }, { status: 401 })
  }

  const runAt = new Date()
  let affectedCount = 0
  const summaryParts: string[] = []

  try {
    // Load templates from settings
    const settingKeys = [
      'notification.template.weekly_upload_missing.title',
      'notification.template.weekly_upload_missing.message',
      'notification.template.weekly_upload_missing.email_subject',
      'notification.template.weekly_upload_missing.email_body',
      'notification.template.weekly_report_ready.title',
      'notification.template.weekly_report_ready.message',
    ]
    const settingRows = await prisma.systemSetting.findMany({
      where: { key: { in: settingKeys } },
    })
    const settings: Record<string, string> = Object.fromEntries(
      settingRows.map(r => [r.key, r.value])
    )

    const missingTitle = settings['notification.template.weekly_upload_missing.title'] ?? '週報尚未上傳'
    const missingMsg = settings['notification.template.weekly_upload_missing.message'] ?? '【{{projectName}}】本週進度尚未更新，請盡快上傳週報。'
    const missingEmailSubject = settings['notification.template.weekly_upload_missing.email_subject'] ?? '【週報提醒】{{projectName}} 本週（{{weekOf}}）尚未上傳'
    const missingEmailBody = settings['notification.template.weekly_upload_missing.email_body'] ?? '{{pmName}} 您好，\n\n【{{projectName}}】本週（{{weekOf}}）的進度週報尚未上傳，請盡快完成上傳。\n\n謝謝'
    const readyTitle = settings['notification.template.weekly_report_ready.title'] ?? '週報已產生'
    const readyMsg = settings['notification.template.weekly_report_ready.message'] ?? '【{{projectName}}】本週週報已產生，請至更新紀錄確認。'

    const weekStart = getWeekStart()
    const weekOf = weekStart.toISOString().split('T')[0]

    // Get all projects with their owners
    const projects = await prisma.project.findMany({
      select: {
        id: true,
        name: true,
        owner: { select: { id: true, name: true, email: true } },
      },
    })

    for (const project of projects) {
      if (!project.owner) continue

      // Check if any weekly update exists for current week
      const updateCount = await prisma.weeklyUpdate.count({
        where: {
          projectId: project.id,
          weekOf: { gte: weekStart },
        },
      })

      const vars = {
        projectName: project.name,
        weekOf,
        pmName: project.owner.name ?? '',
      }

      if (updateCount === 0) {
        // Missing — send reminder
        await prisma.notification.create({
          data: {
            userId: project.owner.id,
            type: 'weekly_upload_missing',
            title: replaceVars(missingTitle, vars),
            message: replaceVars(missingMsg, vars),
            projectId: project.id,
          },
        })

        // Send email if owner has an email
        if (project.owner.email && AD_URL && AD_API) {
          try {
            await fetch(`${AD_URL}/api/v1/mail/send`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'X-API-Key': AD_API },
              body: JSON.stringify({
                to: [project.owner.email],
                subject: replaceVars(missingEmailSubject, vars),
                body: replaceVars(missingEmailBody, vars),
              }),
            })
          } catch (e) {
            console.error(`Failed to send email to ${project.owner.email}:`, e)
          }
        }

        affectedCount++
        summaryParts.push(`${project.name}: 未上傳`)
      } else {
        // Uploaded — send ready notification
        await prisma.notification.create({
          data: {
            userId: project.owner.id,
            type: 'weekly_report_ready',
            title: replaceVars(readyTitle, vars),
            message: replaceVars(readyMsg, vars),
            projectId: project.id,
          },
        })
      }
    }

    const summary = summaryParts.length > 0
      ? `${summaryParts.length} 個專案未上傳週報：${summaryParts.slice(0, 3).join('、')}${summaryParts.length > 3 ? '...' : ''}`
      : `${projects.length} 個專案均已上傳週報`

    await prisma.cronJobLog.create({
      data: {
        jobType: 'weekly_notification',
        runAt,
        status: 'success',
        summary,
        affectedCount,
      },
    })

    return NextResponse.json({ ok: true, affectedCount, summary })
  } catch (error) {
    console.error('weekly-notification cron error:', error)
    await prisma.cronJobLog.create({
      data: {
        jobType: 'weekly_notification',
        runAt,
        status: 'failed',
        summary: error instanceof Error ? error.message : '未知錯誤',
        affectedCount: 0,
      },
    })
    return NextResponse.json({ error: '執行失敗' }, { status: 500 })
  }
}

// Allow GET for easy manual trigger from browser/cron services
export const GET = POST
