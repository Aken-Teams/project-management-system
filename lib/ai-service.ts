// Mock AI service to simulate AI parsing of project requirements
// In a real application, this would call an actual AI API

export interface ProjectRequirements {
  description: string
}

export interface SmartObjective {
  specific: string
  measurable: string
  achievable: string
  relevant: string
  timeBound: string
}

export interface ParsedProjectData {
  name: string
  objective: string
  smartObjective: SmartObjective
  purpose: string
  scope: string
  roi: string
  startDate: string
  endDate: string
  suggestedMilestones: Array<{
    name: string
    description: string
    estimatedDuration: string
  }>
  estimatedBudget: number
  recommendedTeamSize: number
  identifiedRisks: Array<{
    title: string
    description: string
    impact: 'low' | 'medium' | 'high'
    probability: 'low' | 'medium' | 'high'
  }>
}

// Simulate AI processing delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export async function parseProjectRequirements(
  requirements: ProjectRequirements
): Promise<ParsedProjectData> {
  // Simulate API call delay
  await delay(2000)

  // Mock AI parsing - in real app, this would call OpenAI/Claude/etc
  const description = requirements.description.toLowerCase()

  // Simple keyword-based mock parsing
  const isCRM = description.includes('客戶') || description.includes('crm')
  const isApp = description.includes('app') || description.includes('應用')
  const isDataPlatform = description.includes('資料') || description.includes('分析')
  const isEcommerce = description.includes('電商') || description.includes('購物')

  let parsedData: ParsedProjectData

  if (isCRM) {
    parsedData = {
      name: '客戶關係管理系統',
      objective: '建立整合的 CRM 系統以提升客戶管理與銷售效率，在 6 個月內整合 3 個獨立客戶資料庫，提升銷售轉換率 25%',
      smartObjective: {
        specific: '開發一套整合的客戶關係管理系統，整合現有 3 個獨立的客戶資料庫，建立統一的客戶視圖',
        measurable: '提升銷售轉換率 25%，減少客戶資料查詢時間 50%，降低資料重複率至 5% 以下',
        achievable: '現有 IT 團隊 6 人具備相關開發經驗，預算 500 萬元充足，已有成熟的技術架構可參考',
        relevant: '支持公司 2026 年業績成長 30% 的戰略目標，強化客戶關係管理能力，提升市場競爭力',
        timeBound: '2026 年 Q2-Q3 完成開發（6 個月），Q4 全面上線運行並進行成效評估'
      },
      purpose: '整合客戶資料、追蹤銷售機會、提供完整的客戶視圖，預期提升銷售轉換率 25%',
      scope: '包含客戶資料管理、銷售機會追蹤、報價管理、客戶服務記錄、數據分析儀表板',
      roi: '預計第一年節省人力成本 200 萬，提升銷售效率 30%，ROI 約 250%',
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      suggestedMilestones: [
        { name: '需求分析與規劃', description: '收集需求、制定系統架構', estimatedDuration: '3 週' },
        { name: 'UI/UX 設計', description: '設計使用者介面與體驗流程', estimatedDuration: '4 週' },
        { name: '後端開發', description: '開發 API 與資料庫架構', estimatedDuration: '6 週' },
        { name: '前端開發', description: '實作使用者介面', estimatedDuration: '6 週' },
        { name: '測試與部署', description: '系統測試、用戶驗收、上線', estimatedDuration: '4 週' }
      ],
      estimatedBudget: 5000000,
      recommendedTeamSize: 6,
      identifiedRisks: [
        {
          title: '第三方系統整合複雜度',
          description: '與現有 ERP 系統整合可能遇到技術挑戰',
          impact: 'high',
          probability: 'medium'
        },
        {
          title: '使用者採用度',
          description: '內部員工可能需要時間適應新系統',
          impact: 'medium',
          probability: 'medium'
        }
      ]
    }
  } else if (isApp) {
    parsedData = {
      name: '行動應用程式開發',
      objective: '開發 iOS 與 Android 跨平台行動應用程式，在 5 個月內上線，提升 MAU 40% 並增加用戶數 50%',
      smartObjective: {
        specific: '開發 iOS 與 Android 雙平台行動應用程式，包含核心功能、推播通知、離線支援等完整功能',
        measurable: '提升月活躍用戶（MAU）40%，增加總用戶數 50%，App Store 評分達 4.5 星以上',
        achievable: '團隊 5 人具備行動開發經驗，預算 350 萬元，採用 React Native 跨平台框架加速開發',
        relevant: '配合公司行動優先戰略，拓展行動市場佔有率，提升用戶黏著度與品牌影響力',
        timeBound: '2026 年 Q2-Q3 完成開發（5 個月），Q3 進行 Beta 測試並正式上架'
      },
      purpose: '提供優質的行動體驗，增加用戶觸及率，預期提升 MAU 40%',
      scope: 'iOS 與 Android 雙平台開發，包含核心功能、推播通知、離線支援',
      roi: '預計增加用戶數 50%，年度營收成長 300 萬，ROI 約 180%',
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date(Date.now() + 150 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      suggestedMilestones: [
        { name: '產品規劃', description: '定義功能與使用者旅程', estimatedDuration: '2 週' },
        { name: 'UI/UX 設計', description: '設計行動介面', estimatedDuration: '3 週' },
        { name: 'iOS 開發', description: '開發 iOS 版本', estimatedDuration: '8 週' },
        { name: 'Android 開發', description: '開發 Android 版本', estimatedDuration: '8 週' },
        { name: 'Beta 測試與上線', description: '測試、修正、正式發布', estimatedDuration: '3 週' }
      ],
      estimatedBudget: 3500000,
      recommendedTeamSize: 5,
      identifiedRisks: [
        {
          title: '跨平台一致性',
          description: 'iOS 和 Android 平台功能與體驗差異',
          impact: 'medium',
          probability: 'high'
        },
        {
          title: 'App Store 審核',
          description: '應用程式商店審核可能延遲上線時間',
          impact: 'medium',
          probability: 'medium'
        }
      ]
    }
  } else if (isDataPlatform) {
    parsedData = {
      name: '資料分析平台',
      objective: '建立企業資料分析與視覺化平台，在 7 個月內整合所有資料源，提升決策效率 50% 並減少人工報表時間 80%',
      smartObjective: {
        specific: '建立整合的資料分析平台，包含資料倉儲、ETL 流程、BI 儀表板、自動化報表系統',
        measurable: '整合 5 個以上資料來源，提供 20+ 即時儀表板，減少人工報表時間 80%，提升決策效率 50%',
        achievable: '團隊 7 人具備資料工程與 BI 開發經驗，預算 800 萬元，採用成熟的資料倉儲技術',
        relevant: '支持數據驅動決策文化，提升管理效率，強化企業競爭優勢與市場洞察能力',
        timeBound: '2026 年 Q2-Q4 完成建置（7 個月），Q4 全面上線並提供完整分析功能'
      },
      purpose: '整合多源資料，提供即時分析與決策支援，提升決策效率 50%',
      scope: '資料倉儲、ETL 流程、BI 儀表板、自動化報表、權限管理',
      roi: '減少人工報表時間 80%，提升決策速度，年度效益約 400 萬',
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date(Date.now() + 210 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      suggestedMilestones: [
        { name: '資料架構設計', description: '設計資料倉儲與 ETL 架構', estimatedDuration: '4 週' },
        { name: '資料源整合', description: '連接各系統資料來源', estimatedDuration: '6 週' },
        { name: 'ETL 開發', description: '開發資料處理流程', estimatedDuration: '6 週' },
        { name: '儀表板開發', description: '開發視覺化與報表功能', estimatedDuration: '6 週' },
        { name: '測試與優化', description: '效能調校與用戶驗收', estimatedDuration: '4 週' }
      ],
      estimatedBudget: 8000000,
      recommendedTeamSize: 7,
      identifiedRisks: [
        {
          title: '資料品質問題',
          description: '來源系統資料可能不一致或不完整',
          impact: 'high',
          probability: 'high'
        },
        {
          title: '效能瓶頸',
          description: '大量資料處理可能影響查詢效能',
          impact: 'high',
          probability: 'medium'
        }
      ]
    }
  } else if (isEcommerce) {
    parsedData = {
      name: '電子商務平台',
      objective: '建立完整的線上購物平台，在 4 個月內上線營運，第一年達成 GMV 1000 萬元目標',
      smartObjective: {
        specific: '建立包含商品管理、購物車、金流串接、物流整合、會員系統的完整電商平台',
        measurable: '第一年 GMV 達 1000 萬元，註冊會員數 5000 人以上，月訂單量 500 筆以上',
        achievable: '團隊 6 人具備電商開發經驗，預算 400 萬元，已完成金物流廠商評估與洽談',
        relevant: '配合公司全通路策略，開拓線上銷售通路，提升品牌數位化能力與市場競爭力',
        timeBound: '2026 年 Q2-Q3 完成開發（4 個月），Q3 正式上線營運並進行行銷推廣'
      },
      purpose: '拓展線上銷售通路，提供便利的購物體驗，預期年度營收 1000 萬',
      scope: '商品管理、購物車、金流串接、物流整合、會員系統、訂單管理',
      roi: '開拓新營收來源，預計第一年 GMV 1000 萬，ROI 約 300%',
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date(Date.now() + 120 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      suggestedMilestones: [
        { name: '平台規劃', description: '規劃商業模式與系統架構', estimatedDuration: '2 週' },
        { name: 'UI/UX 設計', description: '設計購物流程與介面', estimatedDuration: '3 週' },
        { name: '核心功能開發', description: '商品、購物車、結帳流程', estimatedDuration: '6 週' },
        { name: '金物流整合', description: '串接金流與物流系統', estimatedDuration: '4 週' },
        { name: '測試與上線', description: '壓力測試與正式營運', estimatedDuration: '2 週' }
      ],
      estimatedBudget: 4000000,
      recommendedTeamSize: 6,
      identifiedRisks: [
        {
          title: '金流整合風險',
          description: '第三方金流服務整合可能遇到技術問題',
          impact: 'high',
          probability: 'medium'
        },
        {
          title: '資安風險',
          description: '交易與個資安全需要嚴格把關',
          impact: 'high',
          probability: 'low'
        }
      ]
    }
  } else {
    // Generic project
    parsedData = {
      name: '軟體開發專案',
      objective: '根據需求開發客製化軟體系統，在 5 個月內完成開發與部署，提升營運效率 20-30%',
      smartObjective: {
        specific: '開發符合業務需求的客製化軟體系統，包含需求分析、系統設計、開發、測試與部署',
        measurable: '提升營運效率 20-30%，減少人工作業時間 40%，系統穩定度達 99% 以上',
        achievable: '團隊 5 人具備軟體開發經驗，預算 300 萬元，採用成熟的開發框架與方法論',
        relevant: '支持業務流程優化，提升作業效率，降低人力成本，增強企業競爭力',
        timeBound: '2026 年 Q2-Q3 完成開發（5 個月），Q3 進行測試與驗收，Q4 正式上線'
      },
      purpose: '滿足特定業務需求，提升營運效率與競爭力',
      scope: '系統分析、設計、開發、測試、部署與維護',
      roi: '預期提升營運效率 20-30%，年度效益視專案規模而定',
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date(Date.now() + 150 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      suggestedMilestones: [
        { name: '需求分析', description: '收集與分析需求', estimatedDuration: '3 週' },
        { name: '系統設計', description: '架構與介面設計', estimatedDuration: '3 週' },
        { name: '開發實作', description: '程式開發與整合', estimatedDuration: '10 週' },
        { name: '測試', description: '功能測試與除錯', estimatedDuration: '3 週' },
        { name: '部署上線', description: '系統部署與驗收', estimatedDuration: '2 週' }
      ],
      estimatedBudget: 3000000,
      recommendedTeamSize: 5,
      identifiedRisks: [
        {
          title: '需求變更',
          description: '專案進行中可能有需求變更',
          impact: 'medium',
          probability: 'high'
        },
        {
          title: '技術挑戰',
          description: '可能遇到預期外的技術難題',
          impact: 'medium',
          probability: 'medium'
        }
      ]
    }
  }

  return parsedData
}
