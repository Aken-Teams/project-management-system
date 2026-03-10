import { NextRequest, NextResponse } from 'next/server'
import puppeteer from 'puppeteer'

// ─── POST /api/reports/pdf-binary ───────────────────────────────────────────
// Accepts { projectIds } — returns a PDF byte stream rendered by headless Chrome.
// This produces identical output to the browser "匯出 PDF" print flow.
export async function POST(request: NextRequest) {
  try {
    const { projectIds } = await request.json()

    if (!projectIds || !Array.isArray(projectIds) || projectIds.length === 0) {
      return NextResponse.json({ error: '請選擇至少一個專案' }, { status: 400 })
    }

    // 1. Fetch the HTML template from the existing pdf route
    const origin = request.nextUrl.origin
    const htmlResponse = await fetch(`${origin}/api/reports/pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectIds }),
    })

    if (!htmlResponse.ok) throw new Error('HTML 模板生成失敗')
    const html = await htmlResponse.text()

    // 2. Render to PDF with headless Chrome (same engine as window.print())
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    })

    try {
      const page = await browser.newPage()
      await page.setContent(html, { waitUntil: 'networkidle0' })
      const pdfBuffer = await page.pdf({
        format: 'A4',
        landscape: true,
        margin: { top: '15mm', right: '15mm', bottom: '15mm', left: '15mm' },
        printBackground: true,
      })

      return new NextResponse(pdfBuffer, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'attachment; filename="report.pdf"',
        },
      })
    } finally {
      await browser.close()
    }
  } catch (error) {
    console.error('PDF binary generation failed:', error)
    return NextResponse.json({ error: 'PDF 生成失敗' }, { status: 500 })
  }
}
