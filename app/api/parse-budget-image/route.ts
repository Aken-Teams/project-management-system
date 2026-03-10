import { NextRequest, NextResponse } from 'next/server'

// Support both common naming conventions
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || process.env.OPENAI_KEY

// ─── POST /api/parse-budget-image ────────────────────────
// Body: { imageBase64: string, mimeType?: string }
// Returns: { items: BudgetItem[] }
export async function POST(request: NextRequest) {
  if (!OPENAI_API_KEY) {
    console.error('OpenAI key not found. Set OPENAI_API_KEY or OPENAI_KEY in .env')
    return NextResponse.json({ error: '未設定 OpenAI API Key' }, { status: 500 })
  }

  try {
    const { imageBase64, mimeType = 'image/png' } = await request.json()
    if (!imageBase64) {
      return NextResponse.json({ error: '請提供圖片資料' }, { status: 400 })
    }

    const prompt = `這是一份設備投資預算表格截圖（可能是 PowerPoint 或 Excel 截圖）。
請從圖片中提取設備清單中的每一行資料，回傳純 JSON 格式（不要 markdown 代碼塊）：

{
  "items": [
    {
      "station": "站別（如 DW、MD、DG、TF、TMTT 等）",
      "vendor": "廠商名稱（請仔細辨識原始文字，不要自行推測或替換）",
      "equipment": "設備機型/名稱（請仔細辨識原始文字，不要自行推測或替換）",
      "quantity": 1,
      "purchaseType": "選購方式（如 新購、移撥）",
      "unitPrice": 123456,
      "estimatedCost": 123456
    }
  ]
}

規則：
- 數字欄位只填純數字（去掉千分位逗號和貨幣符號）
- unitPrice：填「預估單價」欄（每組單價），若無此欄填 null
- estimatedCost：填「預估費用」欄（總金額 = 單價 × 組數）；若表格只有單價欄而無費用欄，則自行計算 unitPrice × quantity
- 文字欄位（vendor、equipment）請逐字對照圖片原文，勿替換為相近詞彙
- 若某欄位讀不到值，填 null 或空字串
- 略過小計、合計、TOTAL 等匯總行
- 只回傳 JSON，不要任何說明文字`

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-2024-11-20',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: { url: `data:${mimeType};base64,${imageBase64}` },
              },
              { type: 'text', text: prompt },
            ],
          },
        ],
        max_tokens: 2000,
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error('OpenAI API error:', response.status, errText)
      return NextResponse.json({ error: 'AI 解析失敗，請稍後再試' }, { status: 502 })
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content ?? ''

    // Extract JSON from the response (handle cases where GPT adds extra text)
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json({ error: '無法解析 AI 回傳格式', raw: content }, { status: 422 })
    }

    const parsed = JSON.parse(jsonMatch[0])
    return NextResponse.json(parsed)
  } catch (error) {
    console.error('parse-budget-image error:', error)
    return NextResponse.json({ error: '圖片解析失敗' }, { status: 500 })
  }
}
