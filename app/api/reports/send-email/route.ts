import { NextRequest, NextResponse } from 'next/server'
import puppeteer from 'puppeteer'
import { sendMail, parseJsonUtf8 } from '@/lib/send-mail'

// ─── POST /api/reports/send-email ───────────────────────────────────────────
// Body: { projectIds: string[], recipients: string[], cc?: string[], subject?: string, body?: string, filename?: string }
// Generates the PDF server-side (same quality as browser print) then sends email.
export async function POST(request: NextRequest) {
  try {
    const { projectIds, recipients, cc, subject, body: emailBody, filename } =
      await parseJsonUtf8<{ projectIds: string[]; recipients: string[]; cc?: string[]; subject?: string; body?: string; filename?: string }>(request)

    if (!recipients || recipients.length === 0) {
      return NextResponse.json({ error: '請提供收件人' }, { status: 400 })
    }
    if (!projectIds || !Array.isArray(projectIds) || projectIds.length === 0) {
      return NextResponse.json({ error: '請選擇至少一個專案' }, { status: 400 })
    }

    // 1. Generate HTML from the PDF template route
    const origin = request.nextUrl.origin
    const htmlResponse = await fetch(`${origin}/api/reports/pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectIds }),
    })

    if (!htmlResponse.ok) throw new Error('HTML 模板生成失敗')
    const html = await htmlResponse.text()

    // 2. Render to PDF with headless Chrome
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

    // 3. Send email with PDF attachment via native https (avoids fetch encoding issues on Windows)
    const result = await sendMail({
      to: recipients,
      ...(cc && cc.length > 0 ? { cc } : {}),
      subject: subject || '專案報告',
      body: emailBody || '您好，\n\n請查收附件中的專案報告。\n\n此信件由專案管理系統自動發送。',
      attachments: [{ filename: filename || 'report.pdf', content: pdfBase64 }],
    })
    return NextResponse.json({ success: true, result })
  } catch (error) {
    console.error('Send email route error:', error)
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 })
  }
}
