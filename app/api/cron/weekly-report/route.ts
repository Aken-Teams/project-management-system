import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import puppeteer from 'puppeteer'

const AD_URL = process.env.AD_URL
const AD_API = process.env.AD_API

function replaceVars(template: string, vars: Record<string, string>): string {
  return template.replace(/{{(\w+)}}/g, (_, key) => vars[key] ?? `{{${key}}}`)
}

async function guardCron(request: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
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

  try {
    // Load settings
    const settingRows = await prisma.systemSetting.findMany({
      where: {
        key: {
          in: [
            'report.schedule.dayOfWeek',
            'report.schedule.hour',
            'report.email.subject',
            'report.email.body',
            'report.email.recipients',
          ],
        },
      },
    })
    const settings: Record<string, string> = Object.fromEntries(
      settingRows.map(r => [r.key, r.value])
    )

    // ── Schedule gate (skip in preview mode) ──────────────────────────────────
    if (!isPreview) {
      const configDay  = parseInt(settings['report.schedule.dayOfWeek'] ?? '5')
      const configHour = parseInt(settings['report.schedule.hour'] ?? '8')
      const now = new Date()
      const nowDay  = now.getDay()
      const nowHour = now.getHours()
      if (nowDay !== configDay || nowHour !== configHour) {
        return NextResponse.json({
          ok: false,
          skipped: true,
          reason: `非排程執行時間（設定：週${configDay} ${configHour}:00，現在：週${nowDay} ${nowHour}:00）`,
        })
      }
    }

    const subjectTemplate    = settings['report.email.subject']     ?? '{{date}} 專案週報 - {{reportCount}} 個專案'
    const bodyTemplate       = settings['report.email.body']        ?? '您好，\n\n附件為本週（{{date}}）的專案進度週報，共 {{reportCount}} 個專案。\n\n如有疑問，請聯繫各專案負責人。\n\n謝謝'
    const recipientsSetting  = settings['report.email.recipients']  ?? ''

    // ── Fetch all projects with their A-role (PM) team members ────────────────
    const projects = await prisma.project.findMany({
      select: {
        id: true,
        name: true,
        teamMembers: {
          where: { role: 'A' },
          select: { user: { select: { id: true, name: true, email: true } } },
        },
      },
    })

    if (projects.length === 0) {
      if (!isPreview) {
        await prisma.cronJobLog.create({
          data: { jobType: 'weekly_report', runAt, status: 'success', summary: '無專案，略過', affectedCount: 0 },
        })
      }
      return NextResponse.json({ ok: true, summary: '無專案' })
    }

    const dateStr = new Date().toLocaleDateString('zh-TW', { year: 'numeric', month: 'numeric', day: 'numeric' })
    const filename = `專案週報_${dateStr.replace(/\//g, '')}.pdf`

    const vars = { date: dateStr, reportCount: String(projects.length), projectName: '所有專案' }
    const subject = replaceVars(subjectTemplate, vars)
    const body    = replaceVars(bodyTemplate, vars)

    // ── Build recipient list ───────────────────────────────────────────────────
    // 1. Custom configured emails
    const customRecipients = recipientsSetting
      .split(',')
      .map(e => e.trim())
      .filter(e => e.includes('@'))

    // 2. All users with role = 'executive'
    const execUsers = await prisma.user.findMany({
      where: { role: 'executive' },
      select: { name: true, email: true },
    })
    const execEmails = execUsers.map(u => u.email).filter((e): e is string => !!e)

    // 3. PM of each project = team member with TeamRole 'A'
    //    (NOT user.role — PM is determined by project RACI assignment)
    const pmList = projects.flatMap(p =>
      p.teamMembers.map(m => ({
        name: m.user.name,
        email: m.user.email,
        project: p.name,
      }))
    )
    const pmEmails = pmList.map(m => m.email).filter((e): e is string => !!e)

    const allRecipients = [...new Set([...customRecipients, ...execEmails, ...pmEmails])]

    if (allRecipients.length === 0) {
      if (!isPreview) {
        await prisma.cronJobLog.create({
          data: { jobType: 'weekly_report', runAt, status: 'failed', summary: '無收件人，略過', affectedCount: 0 },
        })
      }
      return NextResponse.json({ error: '無收件人（請在報告設定中指定收件人，或確保系統中有主管或 PM）' }, { status: 400 })
    }

    // ── Preview mode: return what WOULD be sent, no actual email/PDF ───────────
    if (isPreview) {
      const origin = request.nextUrl.origin
      const projectIds = projects.map(p => p.id)
      return NextResponse.json({
        preview: true,
        configuredSchedule: {
          dayOfWeek: settings['report.schedule.dayOfWeek'] ?? '5',
          hour: settings['report.schedule.hour'] ?? '8',
        },
        email: { subject, body, filename },
        recipients: {
          executives: execUsers.map(u => ({ name: u.name, email: u.email })),
          projectPMs: pmList,
          custom: customRecipients,
          allTo: allRecipients,
          totalCount: allRecipients.length,
        },
        pdfPreviewUrl: `${origin}/api/reports/pdf?preview=1`,
        pdfProjectIds: projectIds,
        projectCount: projects.length,
        note: 'Preview 模式：不發送郵件、不產生 PDF、不寫入執行記錄。將 ?preview=1 移除即可執行正式任務。',
      })
    }

    // ── Generate HTML then render PDF ─────────────────────────────────────────
    const origin = request.nextUrl.origin
    const projectIds = projects.map(p => p.id)
    const htmlResponse = await fetch(`${origin}/api/reports/pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectIds }),
    })
    if (!htmlResponse.ok) throw new Error('PDF HTML 生成失敗')
    const html = await htmlResponse.text()

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    })
    let pdfBase64: string
    try {
      const page = await browser.newPage()
      await page.setContent(html, { waitUntil: 'networkidle0' })
      const pdfBuffer = await page.pdf({
        format: 'A4',
        landscape: true,
        margin: { top: '15mm', right: '15mm', bottom: '15mm', left: '15mm' },
        printBackground: true,
      })
      pdfBase64 = Buffer.from(pdfBuffer).toString('base64')
    } finally {
      await browser.close()
    }

    // ── Send email via LDAP/AD API ─────────────────────────────────────────────
    const mailRes = await fetch(`${AD_URL}/api/v1/mail/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': AD_API! },
      body: JSON.stringify({
        to: allRecipients,
        subject,
        body,
        attachments: [{ filename, content: pdfBase64 }],
      }),
    })

    if (!mailRes.ok) {
      const errText = await mailRes.text()
      throw new Error(`郵件發送失敗: ${mailRes.status} ${errText}`)
    }

    const summary = `已發送給 ${allRecipients.length} 位收件人（主管 ${execEmails.length} 人，專案負責人 ${pmEmails.length} 人），共 ${projects.length} 個專案`
    await prisma.cronJobLog.create({
      data: { jobType: 'weekly_report', runAt, status: 'success', summary, affectedCount: projects.length },
    })

    return NextResponse.json({ ok: true, summary })
  } catch (error) {
    console.error('weekly-report cron error:', error)
    if (!isPreview) {
      await prisma.cronJobLog.create({
        data: {
          jobType: 'weekly_report',
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
