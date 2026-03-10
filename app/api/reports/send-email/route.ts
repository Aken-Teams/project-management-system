import { NextRequest, NextResponse } from 'next/server'

const AD_URL = process.env.AD_URL!
const AD_API = process.env.AD_API!

// ─── POST /api/reports/send-email ───────────────────────
// Body: { recipients: string[], pdfBase64: string, filename: string, subject: string }
export async function POST(request: NextRequest) {
  try {
    const { recipients, pdfBase64, filename, subject } = await request.json()

    if (!recipients || recipients.length === 0) {
      return NextResponse.json({ error: '請提供收件人' }, { status: 400 })
    }
    if (!pdfBase64) {
      return NextResponse.json({ error: '缺少 PDF 內容' }, { status: 400 })
    }

    const res = await fetch(`${AD_URL}/api/v1/mail/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': AD_API,
      },
      body: JSON.stringify({
        to: recipients,
        subject: subject || '專案報告',
        body: '您好，\n\n請查收附件中的專案報告。\n\n此信件由專案管理系統自動發送。',
        attachments: [
          {
            filename: filename || 'report.pdf',
            content: pdfBase64,
          },
        ],
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error('Mail API error:', res.status, errText)
      return NextResponse.json({ error: '郵件發送失敗' }, { status: 502 })
    }

    const result = await res.json()
    return NextResponse.json({ success: true, result })
  } catch (error) {
    console.error('Send email route error:', error)
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 })
  }
}
