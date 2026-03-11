import { NextRequest, NextResponse } from 'next/server'

// ─── Types ────────────────────────────────────────────────────────────────────

interface RequestBody {
  projectType: string
  projectTier: string
  demandSource: string
  createdReason: string
  expectedBenefits: string
  requirements: string
  // Additional hints
  projectNameHint?: string
  durationMonths?: number
  budgetRange?: string
  constraints?: string
}

interface AIProjectPlan {
  name: string
  objective: string
  smartObjective: {
    specific: string
    measurable: string
    achievable: string
    relevant: string
    timeBound: string
  }
  purpose: string
  scope: string
  roi: string
  expectedBenefits: string
  startDate: string
  endDate: string
  budget: number
  milestones: Array<{
    name: string
    description: string
    durationDays: number
  }>
  tasks: Array<{
    milestoneIndex: number
    title: string
    description: string
    priority: 'low' | 'medium' | 'high'
    durationDays: number
  }>
  team: Array<{
    name: string
    role: 'R' | 'A' | 'C' | 'I'
    jobTitle: string
    responsibility: string
  }>
  risks: Array<{
    title: string
    description: string
    impact: 'low' | 'medium' | 'high'
    probability: 'low' | 'medium' | 'high'
    mitigation: string
  }>
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PROJECT_TYPE_NAMES: Record<string, string> = {
  npi: '新產品導入（NPI）',
  cost_optimization: '成本優化',
  quality_improvement: '品質改善',
  automation: '自動化',
  product_strategy: '產品策略',
  process_optimization: '流程優化',
  external_requirement: '外部需求',
}

const TIER_NAMES: Record<string, string> = {
  T1: 'T1 (最高優先級)',
  T2: 'T2 (中高優先級)',
  T3: 'T3 (一般優先級)',
  CIP: 'CIP (持續改善)',
}

const DEMAND_SOURCE_NAMES: Record<string, string> = {
  customer_requirement: '客戶需求',
  internal_improvement: '內部改善',
  company_policy: '公司政策',
  regulatory_compliance: '法規要求',
  market_opportunity: '市場機會',
}

function buildPrompt(body: RequestBody): string {
  const today = new Date().toISOString().split('T')[0]
  const sections = [
    `今天日期：${today}`,
    `專案類型：${PROJECT_TYPE_NAMES[body.projectType] ?? body.projectType}`,
    `專案層別：${TIER_NAMES[body.projectTier] ?? body.projectTier}`,
    `需求來源：${DEMAND_SOURCE_NAMES[body.demandSource] ?? body.demandSource}`,
    `開案原因：${body.createdReason}`,
    `預期效益：${body.expectedBenefits}`,
    `專案需求描述：${body.requirements}`,
  ]
  if (body.projectNameHint) sections.push(`專案名稱提示：${body.projectNameHint}`)
  if (body.durationMonths) sections.push(`預計工期：約 ${body.durationMonths} 個月`)
  if (body.budgetRange) sections.push(`預算範圍：${body.budgetRange}`)
  if (body.constraints) sections.push(`主要限制與備註：${body.constraints}`)

  return `你是一位專業的製造業專案管理顧問。請根據以下專案資訊，產生一份完整的專案規劃。

${sections.join('\n')}

請依照以下格式回傳 JSON（只回傳 JSON，不要有其他文字）：
{
  "name": "專案名稱（簡潔有意義，20字以內）",
  "objective": "專案目標（1-2句話，說明目標和可衡量的成果）",
  "smartObjective": {
    "specific": "具體說明要完成什麼（50-100字）",
    "measurable": "如何量化衡量成功（具體數字）",
    "achievable": "為何目標可達成（資源、能力說明）",
    "relevant": "與公司策略的關聯性",
    "timeBound": "時間限制與關鍵節點"
  },
  "purpose": "專案目的（為何要做這個專案，50-80字）",
  "scope": "專案範圍（包含哪些，不含哪些，50-80字）",
  "roi": "投資回報說明（量化效益，40-60字）",
  "expectedBenefits": "預期效益摘要（30-50字）",
  "startDate": "YYYY-MM-DD（今天或合理的開始日）",
  "endDate": "YYYY-MM-DD（根據工期計算）",
  "budget": 數字（台幣，不含單位，例如 5000000 代表 500 萬）,
  "milestones": [
    { "name": "里程碑名稱", "description": "描述", "durationDays": 天數（整數）}
  ],
  "tasks": [
    { "milestoneIndex": 里程碑索引(0開始), "title": "任務標題", "description": "描述", "priority": "high|medium|low", "durationDays": 天數 }
  ],
  "team": [
    { "name": "待確認", "role": "A|R|C|I", "jobTitle": "職稱", "responsibility": "職責說明" }
  ],
  "risks": [
    { "title": "風險標題", "description": "風險描述", "impact": "high|medium|low", "probability": "high|medium|low", "mitigation": "緩解措施" }
  ]
}

規則：
- milestones：4-7 個，按時間順序，durationDays 加總應符合預計工期
- tasks：每個里程碑 2-5 個任務，milestoneIndex 對應 milestones 陣列索引
- team：4-6 人，包含 A(負責人)、R(執行者)、C(諮詢)、I(知會) 角色，name 統一填「待確認」
- risks：3-5 個，涵蓋技術、時程、資源等面向
- 所有文字使用繁體中文
- startDate 設為今天，endDate 根據工期推算
- budget 根據 budgetRange 設定合理數字`
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body: RequestBody = await request.json()

    if (!body.requirements?.trim() || !body.projectType || !body.projectTier || !body.demandSource) {
      return NextResponse.json({ error: '缺少必要欄位' }, { status: 400 })
    }

    const apiKey = process.env.DEEPSEEK_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'AI 服務未設定' }, { status: 500 })
    }

    const prompt = buildPrompt(body)

    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: '你是一位專業的製造業專案管理顧問，精通 SMART 目標設定和專案規劃。請只回傳有效的 JSON，不要包含 markdown 代碼塊或其他文字。',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 4096,
        response_format: { type: 'json_object' },
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      console.error('DeepSeek API error:', err)
      return NextResponse.json({ error: 'AI 服務回應錯誤' }, { status: 502 })
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content

    if (!content) {
      return NextResponse.json({ error: 'AI 未回傳內容' }, { status: 502 })
    }

    let plan: AIProjectPlan
    try {
      plan = JSON.parse(content)
    } catch {
      console.error('Failed to parse AI response:', content)
      return NextResponse.json({ error: 'AI 回傳格式錯誤' }, { status: 502 })
    }

    // Validate and sanitize key fields
    if (!plan.name || !plan.milestones?.length) {
      return NextResponse.json({ error: 'AI 回傳資料不完整' }, { status: 502 })
    }

    return NextResponse.json({ plan })
  } catch (error) {
    console.error('AI analyze-project error:', error)
    return NextResponse.json({ error: '分析失敗，請稍後再試' }, { status: 500 })
  }
}
