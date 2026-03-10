import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import puppeteer from 'puppeteer'

const AD_URL = process.env.AD_URL!
const AD_API = process.env.AD_API!

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

  const runAt = new Date()

  try {
    // Load settings
    const settingRows = await prisma.systemSetting.findMany({
      where: {
        key: {
          in: ['report.email.subject', 'report.email.body', 'report.email.recipients'],
        },
      },
    })
    const settings: Record<string, string> = Object.fromEntries(
      settingRows.map(r => [r.key, r.value])
    )

    const subjectTemplate = settings['report.email.subject'] ?? '{{date}} 專案週報 - {{reportCount}} 個專案'
    const bodyTemplate = settings['report.email.body'] ?? '您好，\n\n附件為本週（{{date}}）的專案進度週報，共 {{reportCount}} 個專案。\n\n謝謝'
    const recipientsSetting = settings['report.email.recipients'] ?? ''

    // Get all project IDs
    const projects = await prisma.project.findMany({ select: { id: true, name: true } })
    if (projects.length === 0) {
      await prisma.cronJobLog.create({
        data: { jobType: 'weekly_report', runAt, status: 'success', summary: '無專案，略過', affectedCount: 0 },
      })
      return NextResponse.json({ ok: true, summary: '無專案' })
    }

    // Build template variables
    const dateStr = new Date().toLocaleDateString('zh-TW', { year: 'numeric', month: 'numeric', day: 'numeric' })
    const vars = { date: dateStr, reportCount: String(projects.length), projectName: '所有專案' }
    const subject = replaceVars(subjectTemplate, vars)
    const body = replaceVars(bodyTemplate, vars)

    // Determine recipients: configured list + all executive users
    const customRecipients = recipientsSetting
      .split(',')
      .map(e => e.trim())
      .filter(e => e.includes('@'))

    const execUsers = await prisma.user.findMany({
      where: { role: 'executive', email: { not: null } },
      select: { email: true },
    })
    const execEmails = execUsers.map(u => u.email!).filter(Boolean)

    const allRecipients = [...new Set([...customRecipients, ...execEmails])]
    if (allRecipients.length === 0) {
      await prisma.cronJobLog.create({
        data: { jobType: 'weekly_report', runAt, status: 'failed', summary: '無收件人', affectedCount: 0 },
      })
      return NextResponse.json({ error: '無收件人' }, { status: 400 })
    }

    // Generate HTML report
    const origin = request.nextUrl.origin
    const projectIds = projects.map(p => p.id)
    const htmlResponse = await fetch(`${origin}/api/reports/pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectIds }),
    })
    if (!htmlResponse.ok) throw new Error('PDF HTML 生成失敗')
    const html = await htmlResponse.text()

    // Render to PDF
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

    // Send email
    const filename = `專案週報_${dateStr.replace(/\//g, '')}.pdf`
    const mailRes = await fetch(`${AD_URL}/api/v1/mail/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': AD_API },
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

    const summary = `已發送給 ${allRecipients.length} 位收件人，共 ${projects.length} 個專案`
    await prisma.cronJobLog.create({
      data: { jobType: 'weekly_report', runAt, status: 'success', summary, affectedCount: projects.length },
    })

    return NextResponse.json({ ok: true, summary })
  } catch (error) {
    console.error('weekly-report cron error:', error)
    await prisma.cronJobLog.create({
      data: {
        jobType: 'weekly_report',
        runAt,
        status: 'failed',
        summary: error instanceof Error ? error.message : '未知錯誤',
        affectedCount: 0,
      },
    })
    return NextResponse.json({ error: '執行失敗' }, { status: 500 })
  }
}

export const GET = POST
