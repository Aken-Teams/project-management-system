import { NextRequest, NextResponse } from 'next/server'

// Support both common naming conventions
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || process.env.OPENAI_KEY

// 地端視覺模型（OpenAI 相容 gateway）。設了就優先用，失敗再退回 OpenAI。
const LOCAL_AI_URL = process.env.LOCAL_AI_URL
const LOCAL_AI_KEY = process.env.LOCAL_AI_KEY
const LOCAL_AI_VISION_MODEL = process.env.LOCAL_AI_VISION_MODEL || 'mlx-community/Qwen3-VL-30B-A3B-Instruct-4bit'

type ChatMessage = { role: string; content: string | Array<{ type: string; [k: string]: unknown }> }

interface ParsedItem {
  station: string
  vendor: string | null
  equipment: string
  quantity: number
  purchaseType: string | null
  unitPrice: number | null
  estimatedCost: number | null
}

/** 地端 gateway。走 Cloudflare，不帶 User-Agent 會吃到 error code 1010，所以明確帶一個。 */
async function callLocal(messages: ChatMessage[], maxTokens: number) {
  const res = await fetch(`${LOCAL_AI_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOCAL_AI_KEY}`,
      'Content-Type': 'application/json',
      'User-Agent': 'project-management-system/1.0',
    },
    body: JSON.stringify({
      model: LOCAL_AI_VISION_MODEL,
      temperature: 0,
      messages,
      max_tokens: maxTokens,
    }),
  })
  if (!res.ok) throw new Error(`Local AI error ${res.status}: ${await res.text()}`)
  const data = await res.json()
  const msg = data.choices?.[0]?.message
  // thinking 模型在 tokens 不夠時 content 會是空字串，答案留在 reasoning
  return (msg?.content || msg?.reasoning || '') as string
}

async function callOpenAI(messages: ChatMessage[], maxTokens: number) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-5.4',
      temperature: 0,
      messages,
      max_completion_tokens: maxTokens,
    }),
  })
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`OpenAI API error ${res.status}: ${errText}`)
  }
  const data = await res.json()
  return data.choices?.[0]?.message?.content ?? ''
}

/**
 * 地端優先、失敗退回 OpenAI。
 * 地端跑在本機 MLX 上，機器沒開或模型沒載就連不上——退回雲端才不會整個功能掛掉。
 * 回傳值第二個元素是實際用了哪一邊，供前端／記錄判斷。
 */
async function callAI(messages: ChatMessage[], maxTokens = 6000): Promise<[string, 'local' | 'openai']> {
  if (LOCAL_AI_URL && LOCAL_AI_KEY) {
    try {
      const out = await callLocal(messages, maxTokens)
      if (out.trim()) return [out, 'local']
      console.warn('Local AI returned empty content, falling back to OpenAI')
    } catch (e) {
      console.warn('Local AI failed, falling back to OpenAI:', e instanceof Error ? e.message : e)
    }
  }
  if (!OPENAI_API_KEY) throw new Error('地端 AI 無法使用，且未設定 OpenAI API Key')
  return [await callOpenAI(messages, maxTokens), 'openai']
}

// ─── POST /api/parse-budget-image ────────────────────────
// Two-pass + programmatic validation:
//   Pass 1 (Vision): Transcribe ALL columns per row in vertical format
//   Pass 2 (Text):   Convert structured text to JSON, filter out 產能 columns
//   Validation:      Programmatic auto-fix for unitPrice × qty ≠ estimatedCost
export async function POST(request: NextRequest) {
  if (!OPENAI_API_KEY && !(LOCAL_AI_URL && LOCAL_AI_KEY)) {
    console.error('No AI backend configured. Set LOCAL_AI_URL/LOCAL_AI_KEY or OPENAI_API_KEY in .env')
    return NextResponse.json({ error: '未設定 AI 服務（地端或 OpenAI 擇一）' }, { status: 500 })
  }

  try {
    const { imageBase64, mimeType = 'image/png' } = await request.json()
    if (!imageBase64) {
      return NextResponse.json({ error: '請提供圖片資料' }, { status: 400 })
    }

    const imageUrl = `data:${mimeType};base64,${imageBase64}`

    // ── Pass 1: Vision → Vertical per-row transcription (ALL columns) ──
    const pass1System = `你是一個精確的表格 OCR 轉錄員。你的任務是將圖片中的設備投資預算表格逐行轉錄。

重要：你必須先仔細看表頭行，從左到右數每一欄的標題，記住欄位順序和總數。
常見欄位順序（約 9-10 欄）：
  1.站別 | 2.廠牌/廠商 | 3.設備機型/名稱 | 4.組數 | 5.產能K/D | 6.產能K/M | 7.選購方式 | 8.預估單價 | 9.預估費用 | 10.備註

⚠️ 表頭中可能寫「產能(K/D)」「產能(K/M)」或類似文字，這些是產能欄位，數值通常是幾百到幾萬的小數字。
⚠️ 「預估單價」和「預估費用」的金額通常有千分位逗號，數值常在數十萬到數千萬之間（如 1,500,000 / 2,909,700）。

關鍵規則：
1. 每一個物理行（每一筆設備）都必須轉錄，不可跳過或合併。
2. 「站別」欄（最左邊）通常有合併儲存格（例如 DB 跨多行），請為每行重複填入站別。
3. ⚠️ 除了「站別」以外，所有欄位如果該儲存格是空白的，就寫「空白」。絕對不可以從上一行或下一行搬移數值。
4. 文字必須逐字照抄圖片原文。
5. 數字照抄（保留原本的逗號格式，例如 2,909,700）。`

    const pass1User = `請先看表頭，從左到右列出所有欄位名稱。然後逐行轉錄。

步驟一：先數一下表格有幾個資料行（不含表頭和合計行），輸出「資料行數: N」

步驟二：對每一筆設備（每一個物理行），用以下格式輸出所有欄位：

---
行 N:
欄1(站別): XXX
欄2(廠商): XXX 或 空白
欄3(設備): XXX
欄4(組數): XXX
欄5(產能K/D): XXX 或 空白
欄6(產能K/M): XXX 或 空白
欄7(選購方式): 新購/現有/移撥/空白
欄8(預估單價): XXX 或 空白 或 -
欄9(預估費用): XXX 或 空白 或 -
---

步驟三：輸出合計行的預估費用總金額：
合計: XXX

步驟四：自我檢查 — 列出所有設備名稱（步驟二的欄3），確認總數等於步驟一的數量。

規則：
- 先輸出一行「表頭欄位：」列出你看到的表頭（從左到右），確認欄位對應
- 如果實際表頭的欄位名稱或順序不同，請依實際表頭調整欄位名稱，但保持上述格式結構
- 忽略表頭行本身（只轉錄資料行）
- 忽略小計/合計/TOTAL/瓶頸/平衡率等匯總行（但步驟三要輸出合計金額）
- 站別合併儲存格：為每行重複填入
- 廠商空白就寫「空白」，不要從上一行複製
- 每個儲存格空白就寫「空白」，不要猜測或從其他行搬移
- 只輸出上述格式，不要其他說明`

    const [transcription, pass1Backend] = await callAI([
      { role: 'system', content: pass1System },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: imageUrl, detail: 'high' } },
          { type: 'text', text: pass1User },
        ],
      },
    ], 6000)

    if (!transcription.includes('行')) {
      return NextResponse.json({ error: '無法從圖片中辨識表格', raw: transcription }, { status: 422 })
    }

    // ── Pass 2: Structured text → JSON ──
    const pass2System = `你是一個資料格式轉換專家。你的任務是將逐行轉錄的設備資料轉換為 JSON。

規則：
1. 每一個「行 N:」區塊對應 JSON items 中的一個物件
2. 「空白」和「-」和欄位名稱本身（如「廠商」「站別」等）都轉為 null
3. 數字去掉千分位逗號，只填純數字
4. quantity 支持小數（如 0.1、0.2、16.25）
5. 如果 unitPrice 和 estimatedCost 都是 null，保持 null，不要填 0
6. ⚠️ 忽略「產能K/D」和「產能K/M」欄位，這些不需要輸出到 JSON
7. ⚠️ vendor 欄位：如果值是「空白」或就是「廠商」二字，設為 null
8. 如果最後有「合計」數字，把合計金額放在 total 欄位`

    const pass2User = `以下是從設備投資預算表格逐行轉錄的資料（包含所有欄位）：

${transcription}

請轉換為以下 JSON 格式（不要 markdown 代碼塊，只要純 JSON）。
注意：不要包含產能K/D和產能K/M的資料，只需要以下欄位：

{
  "total": 12345678,
  "items": [
    {
      "station": "站別",
      "vendor": "廠商名稱或null",
      "equipment": "設備名稱",
      "quantity": 1,
      "purchaseType": "新購或現有或null",
      "unitPrice": null,
      "estimatedCost": null
    }
  ]
}

只回傳 JSON，不要任何說明文字。`

    const [pass2Content, pass2Backend] = await callAI([
      { role: 'system', content: pass2System },
      { role: 'user', content: pass2User },
    ])

    const jsonMatch = pass2Content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json({ error: '無法解析 AI 回傳格式', raw: pass2Content }, { status: 422 })
    }

    const parsed = JSON.parse(jsonMatch[0])
    const items: ParsedItem[] = parsed.items ?? []
    const expectedTotal: number | null = typeof parsed.total === 'number' ? parsed.total : null

    // ── 不改寫 AI 讀到的數字 ──
    //   這裡原本會在「單價 × 組數 ≠ 預估費用」時自動改寫預估費用（或反推組數）。
    //   但實務上的表格，「組數」常常是設計產能的比例（0.35、0.45、0.3），
    //   本來就不是費用的乘數——表上的費用才是對的，改寫反而把正確值弄壞。
    //   實際踩過：某張 15 列的表被改掉 4 列，合計少了 789,800，
    //   前端對帳對不起來又擋住儲存，使用者完全無解。
    //   表格是真相來源：照實回傳，不一致的列交給人在畫面上判斷。
    const inconsistent = items
      .map((item, idx) => ({ idx, item }))
      .filter(({ item }) =>
        item.unitPrice != null && item.estimatedCost != null
        && !(item.unitPrice === 0 && item.estimatedCost === 0)
        && Math.abs(item.unitPrice * item.quantity - item.estimatedCost) >= 1)
      .map(({ idx, item }) => ({
        row: idx + 1,
        equipment: item.equipment,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        estimatedCost: item.estimatedCost,
        computed: (item.unitPrice ?? 0) * item.quantity,
      }))

    // ── Clean up vendor values ──
    for (const item of items) {
      if (typeof item.vendor === 'string') {
        const v = item.vendor.trim()
        if (['廠商', '廠牌', '空白', '-', ''].includes(v)) {
          item.vendor = null
        }
      }
    }

    // ── Compute validation info ──
    const computedSum = items.reduce((s, i) => s + (i.estimatedCost ?? 0), 0)
    const totalMatch = expectedTotal != null ? Math.abs(computedSum - expectedTotal) < 1 : null

    return NextResponse.json({
      items,
      total: expectedTotal,
      _validation: {
        expectedTotal,
        computedSum,
        totalMatch,
        itemCount: items.length,
        // 單價 × 組數 與預估費用不一致的列。不代表讀錯——組數可能是產能比例，
        //   所以只回報、不自動改，讓人在畫面上確認。
        inconsistent,
        // 哪一邊解析的：地端沒開或失敗時會是 openai
        backend: pass1Backend === pass2Backend ? pass1Backend : `${pass1Backend}+${pass2Backend}`,
      },
    })
  } catch (error) {
    console.error('parse-budget-image error:', error)
    return NextResponse.json({ error: '圖片解析失敗' }, { status: 500 })
  }
}
