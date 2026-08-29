export type ProjectStatus = 'green' | 'yellow' | 'red'
export type TaskStatus = 'todo' | 'in-progress' | 'done' | 'blocked'
export type ProjectType = 'npi' | 'cost-optimization' | 'quality-improvement' | 'automation' | 'product-strategy' | 'process-optimization' | 'external-requirement' | (string & {})

export type ProjectTier = 'T1' | 'T2' | 'T3' | 'CIP'

export type DemandSource = 'company-policy' | 'external-requirement' | 'internal-demand' | 'self-proposal'

export interface Milestone {
  id: string
  name: string
  startDate?: string
  dueDate: string
  status: TaskStatus
  progress: number
}

export interface WeeklyUpdate {
  id: string
  projectId: string
  weekOf: string
  updatedBy: string
  updatedAt: string
  milestoneUpdates: {
    milestoneId: string
    progress: number
    notes: string
  }[]
  overallStatus: 'on-time' | 'delay'
  overallNotes: string
  blockers: string
  nextWeekPlan: string
  keyAchievements: string
}

export interface DelayRequest {
  id: string
  projectId: string
  requestedBy: string
  requestedAt: string
  reason: string
  type?: 'delay' | 'date_change'
  taskId?: string
  taskTitle?: string
  affectedMilestones: {
    milestoneId: string
    originalDate: string
    proposedDate: string
    originalStartDate?: string
    proposedStartDate?: string
  }[]
  pendingTaskChanges?: {
    taskId: string
    taskTitle: string
    durationDays?: number
    startDate?: string
    endDate?: string
  }[]
  canCatchUp: boolean
  supportNeeded: string
  status: 'pending' | 'approved' | 'rejected'
  reviewedBy?: string
  reviewedAt?: string
  reviewNotes?: string
  supportResolved?: boolean
  supportResolvedAt?: string
  supportResolvedBy?: string
  supportResolvedNotes?: string
}

export interface SmartObjective {
  specific: string      // 具體目標
  measurable: string    // 可衡量指標
  achievable: string    // 可達成性
  relevant: string      // 相關性
  timeBound: string     // 時限性
}

export type ProjectPhase = 'draft' | 'active'

export interface Project {
  id: string
  projectCode: string
  projectType: ProjectType
  projectTier?: ProjectTier
  demandSource?: DemandSource
  phase?: ProjectPhase
  name: string
  objective: string
  purpose: string
  scope: string
  roi: string
  createdReason: string
  expectedBenefits?: string
  smartObjective?: SmartObjective
  startDate: string
  endDate: string
  status: ProjectStatus
  progress: number
  budget: number
  budgetUsed: number
  budgetDenom?: number // 預算卡分母：有採購明細時=實際採購總額，否則=budget
  owner: string
  team: string[]
  teamMembers?: TeamMember[]
  milestones: Milestone[]
  baseline: Milestone[]
  tasks: Task[]
  risks: Risk[]
  weeklyUpdates: WeeklyUpdate[]
  delayRequests: DelayRequest[]
  taskLogs: TaskLog[]
  createdAt: string
  updatedAt: string
}

export interface SubTask {
  id: string
  title: string
  status: TaskStatus
  progress: number
  assignee: string
  startDate: string
  endDate: string
  priority: 'low' | 'medium' | 'high'
  durationDays: number
  completedAt?: string
  completedBy?: string
  completedWeekOf?: string
}

export interface Task {
  id: string
  projectId: string
  milestoneId: string
  title: string
  description: string
  assignee: string
  status: TaskStatus
  priority: 'low' | 'medium' | 'high'
  durationDays: number
  startDate: string
  endDate: string
  dependencies: string[]
  progress: number
  completedAt?: string
  completedBy?: string
  completedWeekOf?: string
  // 指派時刻（R 從被指派那刻起才在週報看到此任務）
  assignedAt?: string | null
  // R 自我回報「已完成/無後續」（≠ A 的 completedAt 正式完成）
  reportedDoneAt?: string | null
  reportedDoneBy?: string | null
  // A 審核通過 R 的回報（認可內容，不代表 100% 完成）
  reviewedAt?: string | null
  reviewedBy?: string | null
  originalStartDate?: string
  originalEndDate?: string
  parentId?: string | null
  subtasks?: SubTask[]
}

export interface NextPlanItem {
  date?: string
  content: string
}

export interface TaskLogAttachment {
  name: string
  url: string
  type: 'image' | 'file'
}

export interface TaskLog {
  id: string
  taskId: string
  projectId: string
  author: string
  /** 作者的 user id；A 代審報告時要帶給 /api/report-reviews */
  authorId?: string
  logDate: string
  content: string
  nextPlans?: NextPlanItem[]
  attachments?: TaskLogAttachment[]
  createdAt: string
  updatedAt?: string
  lastEditedBy?: string | null
  publishedAt?: string | null
  weekOf?: string | null
  reviewerRejectedAt?: string | null // 被 R 報告審核主管駁回的時間
  reviewerRejectedBy?: string | null // 駁回者姓名
  reviewerNote?: string | null       // 駁回原因
  authorReviewerName?: string | null // 作者(R)的報告審核主管(R主管)名稱，供 A 端顯示「主管審核中」
  /**
   * true = 這筆是當責在撰寫台「我的補充」寫的，不是執行者交的報告。
   * 補充完全不走「R 填報 → R主管審核 → 當責確認」，送出後直接進更新紀錄，
   * 所以所有審核相關的清單與流程都要用這個旗標排除它。
   */
  reportOnly?: boolean
  /**
   * true = 執行者在任務「已完成」之後補交的資料。
   * 照常送 R主管審核、核准即進更新紀錄，但不影響任務完成日與進度。
   */
  postDoneSupplement?: boolean
  /** R主管核准時間。完成後補充要再經當責通過才會 publishedAt 進更新紀錄 */
  reviewerApprovedAt?: string | null
}

export interface Risk {
  id: string
  projectId: string
  title: string
  description: string
  impact: 'low' | 'medium' | 'high'
  probability: 'low' | 'medium' | 'high'
  mitigation: string
  status: 'open' | 'mitigated' | 'closed'
}

export type TeamRole = 'R' | 'A' | 'C' | 'I' | 'P' | 'S'

export const TEAM_ROLE_LABELS: Record<TeamRole, string> = {
  'A': '當責 (A)',
  'R': '負責 (R)',
  'C': '諮詢 (C)',
  'I': '知會 (I)',
  'P': '採購 (P)',
  'S': '審核 (S)',
}

export interface TeamMember {
  id: string
  name: string
  email?: string
  jobTitle?: string
  organization?: string
  role: TeamRole
  responsibility: string
  isActive?: boolean
  reportReviewerName?: string // 該成員的報告審核主管（R 主管），選填
  reportReviewerEmail?: string
}

export const PROJECT_TYPE_LABELS: Record<string, string> = {
  'npi': 'NPI-新產品開發',
  'cost-optimization': '成本優化',
  'quality-improvement': '品質提升',
  'automation': '自動化',
  'product-strategy': '產品策略',
  'process-optimization': '製程優化',
  'external-requirement': '外部需求',
}

export const PROJECT_TIER_LABELS: Record<ProjectTier, string> = {
  'T1': 'T1',
  'T2': 'T2',
  'T3': 'T3',
  'CIP': 'CIP',
}

export const DEMAND_SOURCE_LABELS: Record<DemandSource, string> = {
  'company-policy': '公司政策/年度目標',
  'external-requirement': '外部要求',
  'internal-demand': '內部需求',
  'self-proposal': '自主提案',
}

// Project code generation helper
let codeCounter = 0
export function generateProjectCode(type: ProjectType): string {
  codeCounter++
  const prefix: Record<ProjectType, string> = {
    'npi': 'NPI',
    'cost-optimization': 'CST',
    'quality-improvement': 'QAL',
    'automation': 'AUT',
    'product-strategy': 'PST',
    'process-optimization': 'PRC',
    'external-requirement': 'EXT',
  }
  const year = new Date().getFullYear()
  return `${prefix[type]}-${year}-${String(codeCounter).padStart(3, '0')}`
}

// Initial projects data (empty — ready for backend integration)
export const MOCK_PROJECTS: Project[] = []

/* ---- Legacy mock data removed ---- */
/*
  {
    id: 'proj-1',
    projectCode: 'NPI-2024-001',
    projectType: 'npi',
    name: '客戶管理系統開發',
    objective: '建立全新的 CRM 系統以提升客戶管理效率',
    purpose: '整合現有客戶資料，提供 360 度客戶視圖，提升銷售團隊效率 30%',
    scope: '包含客戶資料管理、銷售機會追蹤、報價單管理、客戶服務記錄等功能',
    roi: '預計第一年節省人力成本 200 萬，提升銷售轉換率 25%，ROI 約 250%',
    createdReason: '現有 CRM 系統老舊無法滿足業務成長需求，需建置新一代系統整合客戶資料',
    startDate: '2024-01-15',
    endDate: '2024-06-30',
    status: 'green',
    progress: 66,
    budget: 5000000,
    budgetUsed: 3200000,
    owner: 'Alice Chen',
    team: ['Alice Chen', 'Bob Wang', 'David Lee', 'Emma Wu'],
    createdAt: '2024-01-10',
    updatedAt: '2024-03-15',
    milestones: [
      { id: 'ms-1', name: '需求分析完成', dueDate: '2024-02-15', status: 'done', progress: 100 },
      { id: 'ms-2', name: 'UI/UX 設計完成', dueDate: '2024-03-15', status: 'done', progress: 100 },
      { id: 'ms-3', name: '後端 API 開發', dueDate: '2024-04-30', status: 'in-progress', progress: 70 },
      { id: 'ms-4', name: '前端開發', dueDate: '2024-05-31', status: 'in-progress', progress: 60 },
      { id: 'ms-5', name: '測試與上線', dueDate: '2024-06-30', status: 'todo', progress: 0 },
    ],
    baseline: [
      { id: 'ms-1', name: '需求分析完成', dueDate: '2024-02-15', status: 'todo', progress: 0 },
      { id: 'ms-2', name: 'UI/UX 設計完成', dueDate: '2024-03-15', status: 'todo', progress: 0 },
      { id: 'ms-3', name: '後端 API 開發', dueDate: '2024-04-30', status: 'todo', progress: 0 },
      { id: 'ms-4', name: '前端開發', dueDate: '2024-05-31', status: 'todo', progress: 0 },
      { id: 'ms-5', name: '測試與上線', dueDate: '2024-06-30', status: 'todo', progress: 0 },
    ],
    tasks: [
      { id: 'task-1', projectId: 'proj-1', milestoneId: 'ms-1', title: '需求訪談與彙整', description: '訪談各部門收集需求', assignee: 'Alice Chen', status: 'done', priority: 'high', startDate: '2024-01-15', endDate: '2024-02-01', dependencies: [], progress: 100, completedAt: '2024-01-31', completedBy: 'Alice Chen' },
      { id: 'task-1b', projectId: 'proj-1', milestoneId: 'ms-1', title: '需求規格書撰寫', description: '撰寫完整需求規格文件', assignee: 'Alice Chen', status: 'done', priority: 'high', startDate: '2024-02-01', endDate: '2024-02-15', dependencies: ['task-1'], progress: 100, completedAt: '2024-02-14', completedBy: 'Alice Chen' },
      { id: 'task-1c', projectId: 'proj-1', milestoneId: 'ms-2', title: 'UI 線框圖設計', description: '設計主要頁面線框圖', assignee: 'Emma Wu', status: 'done', priority: 'high', startDate: '2024-02-15', endDate: '2024-03-01', dependencies: ['task-1b'], progress: 100, completedAt: '2024-02-28', completedBy: 'Emma Wu' },
      { id: 'task-1d', projectId: 'proj-1', milestoneId: 'ms-2', title: '視覺設計與元件庫', description: '完成視覺設計並建立元件庫', assignee: 'Emma Wu', status: 'done', priority: 'medium', startDate: '2024-03-01', endDate: '2024-03-15', dependencies: ['task-1c'], progress: 100, completedAt: '2024-03-14', completedBy: 'Emma Wu' },
      { id: 'task-2', projectId: 'proj-1', milestoneId: 'ms-3', title: '資料庫架構設計', description: '設計資料庫 schema', assignee: 'David Lee', status: 'done', priority: 'high', startDate: '2024-03-15', endDate: '2024-03-30', dependencies: [], progress: 100, completedAt: '2024-03-28', completedBy: 'David Lee' },
      { id: 'task-3', projectId: 'proj-1', milestoneId: 'ms-3', title: 'API 端點設計與開發', description: '設計 RESTful API 端點並實作', assignee: 'Bob Wang', status: 'in-progress', priority: 'high', startDate: '2024-03-20', endDate: '2024-04-10', dependencies: ['task-2'], progress: 75 },
      { id: 'task-3b', projectId: 'proj-1', milestoneId: 'ms-3', title: '認證與授權模組', description: '實作 JWT 認證與角色權限', assignee: 'Bob Wang', status: 'in-progress', priority: 'high', startDate: '2024-04-01', endDate: '2024-04-20', dependencies: ['task-3'], progress: 40 },
      { id: 'task-4', projectId: 'proj-1', milestoneId: 'ms-4', title: '客戶列表頁面', description: '開發客戶列表與篩選功能', assignee: 'Emma Wu', status: 'in-progress', priority: 'medium', startDate: '2024-04-01', endDate: '2024-04-20', dependencies: ['task-3'], progress: 50 },
      { id: 'task-4b', projectId: 'proj-1', milestoneId: 'ms-4', title: '客戶詳情頁面', description: '開發客戶 360 度視圖頁面', assignee: 'Emma Wu', status: 'todo', priority: 'medium', startDate: '2024-04-15', endDate: '2024-05-05', dependencies: ['task-4'], progress: 0 },
      { id: 'task-4c', projectId: 'proj-1', milestoneId: 'ms-4', title: '報價單模組', description: '開發報價單建立與管理功能', assignee: 'David Lee', status: 'todo', priority: 'medium', startDate: '2024-04-20', endDate: '2024-05-15', dependencies: ['task-3'], progress: 0 },
      { id: 'task-4d', projectId: 'proj-1', milestoneId: 'ms-5', title: '測試計畫與執行', description: '撰寫測試案例並執行整合測試', assignee: 'Alice Chen', status: 'todo', priority: 'high', startDate: '2024-05-20', endDate: '2024-06-15', dependencies: ['task-4b', 'task-4c'], progress: 0 },
      { id: 'task-4e', projectId: 'proj-1', milestoneId: 'ms-5', title: '上線部署與教育訓練', description: '系統部署至正式環境並培訓使用者', assignee: 'Bob Wang', status: 'todo', priority: 'high', startDate: '2024-06-15', endDate: '2024-06-30', dependencies: ['task-4d'], progress: 0 },
    ],
    risks: [
      { id: 'risk-1', projectId: 'proj-1', title: '第三方 API 整合延遲', description: '外部 CRM 系統整合可能需要更多時間', impact: 'medium', probability: 'medium', mitigation: '提前與第三方供應商協調，準備備案方案', status: 'open' },
    ],
    weeklyUpdates: [
      {
        id: 'wu-1',
        projectId: 'proj-1',
        weekOf: '2024-03-11',
        updatedBy: 'Alice Chen',
        updatedAt: '2024-03-15T09:00:00',
        milestoneUpdates: [
          { milestoneId: 'ms-1', progress: 100, notes: '需求分析已全部完成' },
          { milestoneId: 'ms-2', progress: 100, notes: 'UI/UX 設計已完成，通過團隊審查' },
          { milestoneId: 'ms-3', progress: 25, notes: '資料庫設計進行中，API 端點規劃中' },
          { milestoneId: 'ms-4', progress: 0, notes: '' },
          { milestoneId: 'ms-5', progress: 0, notes: '' },
        ],
        overallStatus: 'on-time',
        overallNotes: '本週完成 UI/UX 設計審查，後端開發順利進行中',
        blockers: '無',
        nextWeekPlan: '完成 API 端點設計，開始資料庫開發',
        keyAchievements: 'UI/UX 設計通過審查、資料庫 schema 定案',
      },
      {
        id: 'wu-2',
        projectId: 'proj-1',
        weekOf: '2024-03-04',
        updatedBy: 'Alice Chen',
        updatedAt: '2024-03-08T10:30:00',
        milestoneUpdates: [
          { milestoneId: 'ms-1', progress: 100, notes: '需求分析已全部完成' },
          { milestoneId: 'ms-2', progress: 75, notes: 'UI 設計基本完成，等待最終審查' },
          { milestoneId: 'ms-3', progress: 0, notes: '' },
          { milestoneId: 'ms-4', progress: 0, notes: '' },
          { milestoneId: 'ms-5', progress: 0, notes: '' },
        ],
        overallStatus: 'on-time',
        overallNotes: 'UI 設計進入尾聲，開始準備後端開發環境',
        blockers: '無',
        nextWeekPlan: 'UI/UX 設計最終審查、後端開發環境搭建',
        keyAchievements: 'UI 元件庫建立完成',
      },
    ],
    delayRequests: [],
    taskLogs: [
      { id: 'tl-1', taskId: 'task-1', projectId: 'proj-1', author: 'Alice Chen', logDate: '2024-01-25', content: '完成 5 個部門的需求訪談，整理初步需求清單', createdAt: '2024-01-25T17:00:00' },
      { id: 'tl-2', taskId: 'task-1', projectId: 'proj-1', author: 'Alice Chen', logDate: '2024-01-31', content: '完成所有需求彙整，產出需求摘要報告交由團隊確認', createdAt: '2024-01-31T16:30:00' },
      { id: 'tl-3', taskId: 'task-1b', projectId: 'proj-1', author: 'Alice Chen', logDate: '2024-02-10', content: '需求規格書初稿完成，送交各部門確認', createdAt: '2024-02-10T15:00:00' },
      { id: 'tl-4', taskId: 'task-1c', projectId: 'proj-1', author: 'Emma Wu', logDate: '2024-02-22', content: '完成客戶列表、客戶詳情、報價單三個主要頁面的線框圖', createdAt: '2024-02-22T18:00:00' },
      { id: 'tl-5', taskId: 'task-1d', projectId: 'proj-1', author: 'Emma Wu', logDate: '2024-03-12', content: '完成 Design Token 定義與元件庫 Figma 文件', createdAt: '2024-03-12T17:00:00' },
      { id: 'tl-6', taskId: 'task-2', projectId: 'proj-1', author: 'David Lee', logDate: '2024-03-25', content: '完成資料庫 ER Diagram 與 schema 設計，通過架構審查', createdAt: '2024-03-25T16:00:00' },
      { id: 'tl-7', taskId: 'task-3', projectId: 'proj-1', author: 'Bob Wang', logDate: '2024-03-28', content: '完成客戶 CRUD API 與搜尋功能，已通過單元測試', createdAt: '2024-03-28T17:30:00' },
      { id: 'tl-8', taskId: 'task-3b', projectId: 'proj-1', author: 'Bob Wang', logDate: '2024-04-05', content: 'JWT 認證機制開發完成，正在實作角色權限控制', createdAt: '2024-04-05T16:00:00' },
    ],
  },
  {
    id: 'proj-2',
    projectCode: 'SRC-2024-001',
    projectType: 'sourcing',
    name: '行動應用程式改版',
    objective: '更新行動 App，提升使用者體驗與效能',
    purpose: '改善 App 載入速度、更新 UI 設計、增加新功能以提升用戶留存率',
    scope: 'iOS 與 Android 雙平台更新，包含首頁重設計、效能優化、新增社群分享功能',
    roi: '預計提升 DAU 20%，降低跳出率 15%，增加營收 150 萬/年',
    createdReason: 'App 使用者反饋載入速度慢、UI 過時，DAU 持續下降需改版',
    startDate: '2024-02-01',
    endDate: '2024-05-31',
    status: 'yellow',
    progress: 39,
    budget: 3000000,
    budgetUsed: 1500000,
    owner: 'Alice Chen',
    team: ['Alice Chen', 'Frank Chen', 'Grace Liu'],
    createdAt: '2024-01-25',
    updatedAt: '2024-03-18',
    milestones: [
      { id: 'ms-6', name: 'UI/UX 重設計', dueDate: '2024-03-10', status: 'done', progress: 100 },
      { id: 'ms-7', name: 'iOS 開發', dueDate: '2024-04-20', status: 'in-progress', progress: 55 },
      { id: 'ms-8', name: 'Android 開發', dueDate: '2024-04-20', status: 'in-progress', progress: 40 },
      { id: 'ms-9', name: 'Beta 測試', dueDate: '2024-05-10', status: 'todo', progress: 0 },
      { id: 'ms-10', name: '正式上線', dueDate: '2024-05-31', status: 'todo', progress: 0 },
    ],
    baseline: [
      { id: 'ms-6', name: 'UI/UX 重設計', dueDate: '2024-03-01', status: 'todo', progress: 0 },
      { id: 'ms-7', name: 'iOS 開發', dueDate: '2024-04-10', status: 'todo', progress: 0 },
      { id: 'ms-8', name: 'Android 開發', dueDate: '2024-04-10', status: 'todo', progress: 0 },
      { id: 'ms-9', name: 'Beta 測試', dueDate: '2024-05-01', status: 'todo', progress: 0 },
      { id: 'ms-10', name: '正式上線', dueDate: '2024-05-20', status: 'todo', progress: 0 },
    ],
    tasks: [
      { id: 'task-20', projectId: 'proj-2', milestoneId: 'ms-6', title: 'UI 風格定義', description: '制定新版 App 視覺風格與 Design Token', assignee: 'Grace Liu', status: 'done', priority: 'high', startDate: '2024-02-01', endDate: '2024-02-20', dependencies: [], progress: 100, completedAt: '2024-02-19', completedBy: 'Grace Liu' },
      { id: 'task-21', projectId: 'proj-2', milestoneId: 'ms-6', title: '頁面 Prototype 設計', description: '完成首頁、商品頁、個人頁 Prototype', assignee: 'Grace Liu', status: 'done', priority: 'high', startDate: '2024-02-20', endDate: '2024-03-10', dependencies: ['task-20'], progress: 100, completedAt: '2024-03-08', completedBy: 'Grace Liu' },
      { id: 'task-22', projectId: 'proj-2', milestoneId: 'ms-7', title: 'iOS 首頁重構', description: '使用 SwiftUI 重構首頁', assignee: 'Alice Chen', status: 'done', priority: 'high', startDate: '2024-03-10', endDate: '2024-03-25', dependencies: ['task-21'], progress: 100, completedAt: '2024-03-24', completedBy: 'Alice Chen' },
      { id: 'task-23', projectId: 'proj-2', milestoneId: 'ms-7', title: 'iOS 效能優化', description: '圖片快取與懶載入優化', assignee: 'Alice Chen', status: 'in-progress', priority: 'high', startDate: '2024-03-25', endDate: '2024-04-10', dependencies: ['task-22'], progress: 60 },
      { id: 'task-24', projectId: 'proj-2', milestoneId: 'ms-7', title: 'iOS 推播功能', description: '實作推播通知與深層連結', assignee: 'Alice Chen', status: 'todo', priority: 'medium', startDate: '2024-04-10', endDate: '2024-04-20', dependencies: ['task-23'], progress: 0 },
      { id: 'task-25', projectId: 'proj-2', milestoneId: 'ms-8', title: 'Android 首頁重構', description: '使用 Jetpack Compose 重構首頁', assignee: 'Frank Chen', status: 'in-progress', priority: 'high', startDate: '2024-03-10', endDate: '2024-04-01', dependencies: ['task-21'], progress: 50 },
      { id: 'task-26', projectId: 'proj-2', milestoneId: 'ms-8', title: 'Android 效能優化', description: '記憶體優化與啟動速度改善', assignee: 'Frank Chen', status: 'in-progress', priority: 'high', startDate: '2024-04-01', endDate: '2024-04-15', dependencies: ['task-25'], progress: 20 },
      { id: 'task-27', projectId: 'proj-2', milestoneId: 'ms-8', title: 'Android 社群分享', description: '實作社群分享與深層連結', assignee: 'Frank Chen', status: 'todo', priority: 'medium', startDate: '2024-04-15', endDate: '2024-04-20', dependencies: ['task-26'], progress: 0 },
      { id: 'task-28', projectId: 'proj-2', milestoneId: 'ms-9', title: 'Beta 測試與回饋收集', description: '內部 Beta 測試並收集回饋', assignee: 'Grace Liu', status: 'todo', priority: 'high', startDate: '2024-04-20', endDate: '2024-05-10', dependencies: ['task-24', 'task-27'], progress: 0 },
      { id: 'task-29', projectId: 'proj-2', milestoneId: 'ms-10', title: 'App Store 送審與上線', description: '提交 App Store 與 Google Play 審核', assignee: 'Alice Chen', status: 'todo', priority: 'high', startDate: '2024-05-10', endDate: '2024-05-31', dependencies: ['task-28'], progress: 0 },
    ],
    risks: [
      { id: 'risk-2', projectId: 'proj-2', title: 'Android 開發進度落後', description: 'Android 版本開發進度比預期慢 2 週', impact: 'high', probability: 'high', mitigation: '增加開發人力，調整部分功能優先順序', status: 'open' },
    ],
    weeklyUpdates: [
      {
        id: 'wu-3',
        projectId: 'proj-2',
        weekOf: '2024-03-11',
        updatedBy: 'Alice Chen',
        updatedAt: '2024-03-15T14:00:00',
        milestoneUpdates: [
          { milestoneId: 'ms-6', progress: 100, notes: 'UI/UX 重設計全部完成' },
          { milestoneId: 'ms-7', progress: 33, notes: 'iOS 首頁重構完成，效能優化進行中' },
          { milestoneId: 'ms-8', progress: 10, notes: 'Android 進度落後，Vendor 交付延遲' },
          { milestoneId: 'ms-9', progress: 0, notes: '' },
          { milestoneId: 'ms-10', progress: 0, notes: '' },
        ],
        overallStatus: 'delay',
        overallNotes: 'Android 開發因 Vendor 交付延遲影響進度，iOS 部分正常推進',
        blockers: 'Android Vendor 程式碼品質不佳，需要額外時間修正',
        nextWeekPlan: '協調 Vendor 加速交付，iOS 繼續推播功能開發',
        keyAchievements: 'iOS 核心頁面全部完成',
      },
    ],
    delayRequests: [
      {
        id: 'dr-1',
        projectId: 'proj-2',
        requestedBy: 'Alice Chen',
        requestedAt: '2024-03-15T15:00:00',
        reason: 'Android Vendor 交貨延遲，程式碼品質不符預期需要額外修正時間，導致 Android 開發與 Beta 測試時程順延',
        affectedMilestones: [
          { milestoneId: 'ms-8', originalDate: '2024-04-10', proposedDate: '2024-04-20' },
          { milestoneId: 'ms-9', originalDate: '2024-05-01', proposedDate: '2024-05-10' },
          { milestoneId: 'ms-10', originalDate: '2024-05-20', proposedDate: '2024-05-31' },
        ],
        canCatchUp: false,
        supportNeeded: '需要增加一位 Android 開發人員支援，或協調 Vendor 增派人力',
        status: 'pending',
      },
    ],
    taskLogs: [
      { id: 'tl-10', taskId: 'task-20', projectId: 'proj-2', author: 'Grace Liu', logDate: '2024-02-15', content: '完成 App 新版色彩體系與字型規範定義', createdAt: '2024-02-15T17:00:00' },
      { id: 'tl-11', taskId: 'task-21', projectId: 'proj-2', author: 'Grace Liu', logDate: '2024-03-05', content: '完成首頁與商品頁 Prototype，進行用戶測試', createdAt: '2024-03-05T16:00:00' },
      { id: 'tl-12', taskId: 'task-22', projectId: 'proj-2', author: 'Alice Chen', logDate: '2024-03-20', content: '首頁使用 SwiftUI 重構完成，包含動態內容載入', createdAt: '2024-03-20T17:00:00' },
      { id: 'tl-13', taskId: 'task-23', projectId: 'proj-2', author: 'Alice Chen', logDate: '2024-04-02', content: '完成圖片快取機制優化，載入速度提升 40%', createdAt: '2024-04-02T16:30:00' },
      { id: 'tl-14', taskId: 'task-25', projectId: 'proj-2', author: 'Frank Chen', logDate: '2024-03-25', content: 'Android 首頁 Compose 版面配置完成，正在處理動畫效果', createdAt: '2024-03-25T18:00:00' },
    ],
  },
  {
    id: 'proj-3',
    projectCode: 'CST-2024-001',
    projectType: 'cost-saving',
    name: '資料分析平台建置',
    objective: '建立內部資料分析平台',
    purpose: '整合各系統資料，提供即時分析報表，協助管理層決策',
    scope: '資料 ETL 流程、視覺化儀表板、自動化報表、權限管理',
    roi: '提升決策效率 40%，減少人工報表時間 80%，年度效益約 300 萬',
    createdReason: '各部門報表分散管理、人工彙整耗時且易出錯，需統一分析平台',
    startDate: '2024-03-01',
    endDate: '2024-08-31',
    status: 'red',
    progress: 11,
    budget: 8000000,
    budgetUsed: 2000000,
    owner: 'Carol Lin',
    team: ['Carol Lin', 'Henry Chang', 'Iris Chen'],
    createdAt: '2024-02-20',
    updatedAt: '2024-03-20',
    milestones: [
      { id: 'ms-11', name: '資料源整合', dueDate: '2024-04-15', status: 'in-progress', progress: 30 },
      { id: 'ms-12', name: 'ETL 流程開發', dueDate: '2024-05-31', status: 'blocked', progress: 15 },
      { id: 'ms-13', name: '儀表板開發', dueDate: '2024-07-15', status: 'todo', progress: 0 },
      { id: 'ms-14', name: '測試與部署', dueDate: '2024-08-31', status: 'todo', progress: 0 },
    ],
    baseline: [
      { id: 'ms-11', name: '資料源整合', dueDate: '2024-04-01', status: 'todo', progress: 0 },
      { id: 'ms-12', name: 'ETL 流程開發', dueDate: '2024-05-15', status: 'todo', progress: 0 },
      { id: 'ms-13', name: '儀表板開發', dueDate: '2024-07-01', status: 'todo', progress: 0 },
      { id: 'ms-14', name: '測試與部署', dueDate: '2024-08-15', status: 'todo', progress: 0 },
    ],
    tasks: [
      { id: 'task-30', projectId: 'proj-3', milestoneId: 'ms-11', title: 'ERP 資料源對接', description: '建立 ERP 系統資料連線', assignee: 'Henry Chang', status: 'in-progress', priority: 'high', startDate: '2024-03-01', endDate: '2024-03-25', dependencies: [], progress: 30 },
      { id: 'task-31', projectId: 'proj-3', milestoneId: 'ms-11', title: 'CRM 資料源對接', description: '建立 CRM 系統資料連線', assignee: 'Henry Chang', status: 'done', priority: 'high', startDate: '2024-03-10', endDate: '2024-03-20', dependencies: [], progress: 100, completedAt: '2024-03-19', completedBy: 'Henry Chang' },
      { id: 'task-32', projectId: 'proj-3', milestoneId: 'ms-11', title: 'HR 系統資料對接', description: '建立人事系統資料連線', assignee: 'Iris Chen', status: 'done', priority: 'medium', startDate: '2024-03-10', endDate: '2024-03-22', dependencies: [], progress: 100, completedAt: '2024-03-21', completedBy: 'Iris Chen' },
      { id: 'task-33', projectId: 'proj-3', milestoneId: 'ms-12', title: 'ETL 框架建置', description: '搭建 ETL Pipeline 基礎架構', assignee: 'Henry Chang', status: 'in-progress', priority: 'high', startDate: '2024-03-25', endDate: '2024-04-15', dependencies: ['task-31'], progress: 25 },
      { id: 'task-34', projectId: 'proj-3', milestoneId: 'ms-12', title: 'ETL 轉換規則開發', description: '開發各資料源的清洗與轉換規則', assignee: 'Iris Chen', status: 'blocked', priority: 'high', startDate: '2024-04-01', endDate: '2024-05-15', dependencies: ['task-30', 'task-33'], progress: 10 },
      { id: 'task-35', projectId: 'proj-3', milestoneId: 'ms-13', title: '儀表板 UI 設計', description: '設計分析儀表板介面', assignee: 'Carol Lin', status: 'todo', priority: 'medium', startDate: '2024-05-01', endDate: '2024-05-20', dependencies: [], progress: 0 },
      { id: 'task-36', projectId: 'proj-3', milestoneId: 'ms-13', title: '儀表板前端開發', description: '使用圖表庫開發互動式儀表板', assignee: 'Iris Chen', status: 'todo', priority: 'medium', startDate: '2024-05-20', endDate: '2024-06-30', dependencies: ['task-34', 'task-35'], progress: 0 },
      { id: 'task-37', projectId: 'proj-3', milestoneId: 'ms-13', title: '自動化報表排程', description: '設定日報/週報/月報自動產出', assignee: 'Henry Chang', status: 'todo', priority: 'medium', startDate: '2024-06-15', endDate: '2024-07-15', dependencies: ['task-34'], progress: 0 },
      { id: 'task-38', projectId: 'proj-3', milestoneId: 'ms-14', title: '系統測試與部署', description: '整合測試並部署至正式環境', assignee: 'Carol Lin', status: 'todo', priority: 'high', startDate: '2024-07-15', endDate: '2024-08-31', dependencies: ['task-36', 'task-37'], progress: 0 },
    ],
    risks: [
      { id: 'risk-3', projectId: 'proj-3', title: '資料源存取權限問題', description: '部分系統資料存取權限申請流程冗長', impact: 'high', probability: 'high', mitigation: '升級至高層協調，尋找替代資料來源', status: 'open' },
      { id: 'risk-4', projectId: 'proj-3', title: '技術選型不確定', description: '資料倉儲技術方案仍在評估中', impact: 'medium', probability: 'medium', mitigation: '加速 POC 測試，2 週內做出決定', status: 'open' },
    ],
    weeklyUpdates: [
      {
        id: 'wu-4',
        projectId: 'proj-3',
        weekOf: '2024-03-18',
        updatedBy: 'Carol Lin',
        updatedAt: '2024-03-20T11:00:00',
        milestoneUpdates: [
          { milestoneId: 'ms-11', progress: 70, notes: '已完成 2 個資料源對接，ERP 因權限問題卡住' },
          { milestoneId: 'ms-12', progress: 8, notes: 'ETL 框架剛起步，轉換規則受資料源進度影響受阻' },
          { milestoneId: 'ms-13', progress: 0, notes: '' },
          { milestoneId: 'ms-14', progress: 0, notes: '' },
        ],
        overallStatus: 'delay',
        overallNotes: '資料源存取權限問題導致整體進度落後，已向 IT 部門申請加速審核',
        blockers: 'ERP 系統資料存取權限尚未核准，已等待 3 週',
        nextWeekPlan: '持續追蹤權限申請、完成已有資料源的 ETL 開發',
        keyAchievements: '完成 2 個資料源連接與初步驗證',
      },
    ],
    delayRequests: [
      {
        id: 'dr-2',
        projectId: 'proj-3',
        requestedBy: 'Carol Lin',
        requestedAt: '2024-03-20T14:00:00',
        reason: 'ERP 系統資料存取權限審核流程冗長（已等待3週），導致資料源整合與 ETL 開發連帶延遲。技術選型也因為無法取得完整資料進行 POC 而延後決定。',
        affectedMilestones: [
          { milestoneId: 'ms-11', originalDate: '2024-04-01', proposedDate: '2024-04-15' },
          { milestoneId: 'ms-12', originalDate: '2024-05-15', proposedDate: '2024-05-31' },
          { milestoneId: 'ms-13', originalDate: '2024-07-01', proposedDate: '2024-07-15' },
          { milestoneId: 'ms-14', originalDate: '2024-08-15', proposedDate: '2024-08-31' },
        ],
        canCatchUp: false,
        supportNeeded: '需要高層協調 IT 部門加速權限審核，或提供替代資料存取管道',
        status: 'pending',
      },
    ],
    taskLogs: [
      { id: 'tl-20', taskId: 'task-31', projectId: 'proj-3', author: 'Henry Chang', logDate: '2024-03-18', content: '完成 CRM 系統 API 連線測試，資料格式驗證通過', createdAt: '2024-03-18T17:00:00' },
      { id: 'tl-21', taskId: 'task-32', projectId: 'proj-3', author: 'Iris Chen', logDate: '2024-03-20', content: '完成 HR 系統資料欄位對應與連線測試，可正常取得員工資料', createdAt: '2024-03-20T16:30:00' },
      { id: 'tl-22', taskId: 'task-33', projectId: 'proj-3', author: 'Henry Chang', logDate: '2024-04-05', content: 'ETL Pipeline 基礎架構搭建完成，已可執行簡單的資料抽取任務', createdAt: '2024-04-05T18:00:00' },
    ],
  },
  {
    id: 'proj-4',
    projectCode: 'CIP-2024-001',
    projectType: 'cip',
    name: '生產線自動化升級',
    objective: '導入自動化設備提升產線效率與良率',
    purpose: '降低人工操作錯誤率，提升產能 25%，減少加班成本',
    scope: '包含 A 線、B 線自動化設備安裝、PLC 程式開發、操作人員培訓',
    roi: '年度節省人力成本 500 萬，良率提升 5%，ROI 約 180%',
    createdReason: '產線良率不穩定且人力成本逐年攀升，需透過自動化改善',
    startDate: '2024-02-15',
    endDate: '2024-07-31',
    status: 'green',
    progress: 40,
    budget: 12000000,
    budgetUsed: 6500000,
    owner: 'Bob Wang',
    team: ['Bob Wang', 'David Lee', 'Henry Chang', 'Jack Liu', 'Karen Hsu'],
    createdAt: '2024-02-10',
    updatedAt: '2024-03-18',
    milestones: [
      { id: 'ms-15', name: '設備採購與驗收', dueDate: '2024-03-31', status: 'done', progress: 100 },
      { id: 'ms-16', name: 'A 線安裝調試', dueDate: '2024-05-15', status: 'in-progress', progress: 60 },
      { id: 'ms-17', name: 'B 線安裝調試', dueDate: '2024-06-30', status: 'todo', progress: 0 },
      { id: 'ms-18', name: '人員培訓與驗證', dueDate: '2024-07-31', status: 'todo', progress: 0 },
    ],
    baseline: [
      { id: 'ms-15', name: '設備採購與驗收', dueDate: '2024-03-31', status: 'todo', progress: 0 },
      { id: 'ms-16', name: 'A 線安裝調試', dueDate: '2024-05-15', status: 'todo', progress: 0 },
      { id: 'ms-17', name: 'B 線安裝調試', dueDate: '2024-06-30', status: 'todo', progress: 0 },
      { id: 'ms-18', name: '人員培訓與驗證', dueDate: '2024-07-31', status: 'todo', progress: 0 },
    ],
    tasks: [
      { id: 'task-40', projectId: 'proj-4', milestoneId: 'ms-15', title: '設備規格評估', description: '評估自動化設備規格與報價', assignee: 'Bob Wang', status: 'done', priority: 'high', startDate: '2024-02-15', endDate: '2024-03-05', dependencies: [], progress: 100, completedAt: '2024-03-04', completedBy: 'Bob Wang' },
      { id: 'task-41', projectId: 'proj-4', milestoneId: 'ms-15', title: '設備採購下單', description: '簽約並下單採購設備', assignee: 'Karen Hsu', status: 'done', priority: 'high', startDate: '2024-03-05', endDate: '2024-03-15', dependencies: ['task-40'], progress: 100, completedAt: '2024-03-14', completedBy: 'Karen Hsu' },
      { id: 'task-42', projectId: 'proj-4', milestoneId: 'ms-15', title: '設備到貨驗收', description: '設備到貨後品質檢驗', assignee: 'Jack Liu', status: 'done', priority: 'high', startDate: '2024-03-15', endDate: '2024-03-31', dependencies: ['task-41'], progress: 100, completedAt: '2024-03-29', completedBy: 'Jack Liu' },
      { id: 'task-43', projectId: 'proj-4', milestoneId: 'ms-16', title: 'A 線設備安裝', description: '監督 A 線設備安裝進度與品質', assignee: 'Jack Liu', status: 'in-progress', priority: 'high', startDate: '2024-04-01', endDate: '2024-04-25', dependencies: ['task-42'], progress: 70 },
      { id: 'task-44', projectId: 'proj-4', milestoneId: 'ms-16', title: 'A 線 PLC 程式開發', description: '撰寫 A 線自動化控制程式', assignee: 'David Lee', status: 'in-progress', priority: 'high', startDate: '2024-04-01', endDate: '2024-05-10', dependencies: ['task-42'], progress: 65 },
      { id: 'task-45', projectId: 'proj-4', milestoneId: 'ms-16', title: 'A 線連動測試', description: 'A 線設備與 PLC 連動調試', assignee: 'David Lee', status: 'todo', priority: 'high', startDate: '2024-04-25', endDate: '2024-05-15', dependencies: ['task-43', 'task-44'], progress: 0 },
      { id: 'task-46', projectId: 'proj-4', milestoneId: 'ms-17', title: 'B 線設備安裝', description: 'B 線自動化設備安裝', assignee: 'Jack Liu', status: 'todo', priority: 'high', startDate: '2024-05-15', endDate: '2024-06-10', dependencies: ['task-42'], progress: 0 },
      { id: 'task-47', projectId: 'proj-4', milestoneId: 'ms-17', title: 'B 線 PLC 程式開發', description: '撰寫 B 線控制程式（複用 A 線經驗）', assignee: 'David Lee', status: 'todo', priority: 'high', startDate: '2024-05-20', endDate: '2024-06-15', dependencies: ['task-45'], progress: 0 },
      { id: 'task-48', projectId: 'proj-4', milestoneId: 'ms-17', title: 'B 線連動測試', description: 'B 線設備與 PLC 連動調試', assignee: 'Henry Chang', status: 'todo', priority: 'high', startDate: '2024-06-15', endDate: '2024-06-30', dependencies: ['task-46', 'task-47'], progress: 0 },
      { id: 'task-49', projectId: 'proj-4', milestoneId: 'ms-18', title: '操作員培訓', description: '培訓產線操作員使用新設備', assignee: 'Bob Wang', status: 'todo', priority: 'medium', startDate: '2024-07-01', endDate: '2024-07-20', dependencies: ['task-48'], progress: 0 },
      { id: 'task-49b', projectId: 'proj-4', milestoneId: 'ms-18', title: '試產驗證', description: '試產並驗證良率與產能目標', assignee: 'Karen Hsu', status: 'todo', priority: 'high', startDate: '2024-07-15', endDate: '2024-07-31', dependencies: ['task-49'], progress: 0 },
    ],
    risks: [
      { id: 'risk-5', projectId: 'proj-4', title: '設備交期風險', description: 'B 線設備供應商可能延遲交貨', impact: 'medium', probability: 'low', mitigation: '已與供應商確認交期並設定違約條款', status: 'open' },
    ],
    weeklyUpdates: [
      {
        id: 'wu-5',
        projectId: 'proj-4',
        weekOf: '2024-04-08',
        updatedBy: 'Bob Wang',
        updatedAt: '2024-04-12T16:00:00',
        milestoneUpdates: [
          { milestoneId: 'ms-15', progress: 100, notes: '設備採購驗收全部完成' },
          { milestoneId: 'ms-16', progress: 45, notes: 'A 線設備安裝中，PLC 程式開發順利' },
          { milestoneId: 'ms-17', progress: 0, notes: '' },
          { milestoneId: 'ms-18', progress: 0, notes: '' },
        ],
        overallStatus: 'on-time',
        overallNotes: 'A 線進度正常，設備安裝品質良好',
        blockers: '無',
        nextWeekPlan: '完成 A 線 PLC 程式測試，開始連動調試',
        keyAchievements: 'A 線主設備安裝完成',
      },
    ],
    delayRequests: [],
    taskLogs: [
      { id: 'tl-30', taskId: 'task-40', projectId: 'proj-4', author: 'Bob Wang', logDate: '2024-03-01', content: '完成三家設備供應商規格比較與報價評估，推薦方案提交主管審核', createdAt: '2024-03-01T17:00:00' },
      { id: 'tl-31', taskId: 'task-41', projectId: 'proj-4', author: 'Karen Hsu', logDate: '2024-03-12', content: '完成採購合約簽署與下單，預計設備兩週內交貨', createdAt: '2024-03-12T16:00:00' },
      { id: 'tl-32', taskId: 'task-42', projectId: 'proj-4', author: 'Jack Liu', logDate: '2024-03-28', content: '設備到貨完成品質檢驗，所有項目符合規格要求，安排入廠安裝', createdAt: '2024-03-28T17:30:00' },
    ],
  },
  {
    id: 'proj-5',
    projectCode: 'NPI-2024-002',
    projectType: 'npi',
    name: '智慧倉儲管理系統',
    objective: '建置 WMS 系統整合倉庫作業流程',
    purpose: '提升倉庫揀貨效率 40%，降低庫存差異率至 0.1% 以下',
    scope: '入庫管理、出庫管理、庫存盤點、儲位優化、與 ERP 串接',
    roi: '年度節省倉儲人力成本 350 萬，減少庫存損失 200 萬',
    createdReason: '倉庫仍以紙本作業為主，揀貨效率低且庫存帳實不符問題嚴重',
    startDate: '2024-03-15',
    endDate: '2024-09-30',
    status: 'green',
    progress: 30,
    budget: 6000000,
    budgetUsed: 1800000,
    owner: 'Alice Chen',
    team: ['Alice Chen', 'Emma Wu', 'Frank Chen'],
    createdAt: '2024-03-10',
    updatedAt: '2024-03-20',
    milestones: [
      { id: 'ms-19', name: '需求訪談與分析', dueDate: '2024-04-15', status: 'done', progress: 100 },
      { id: 'ms-20', name: '系統架構設計', dueDate: '2024-05-15', status: 'in-progress', progress: 50 },
      { id: 'ms-21', name: '核心模組開發', dueDate: '2024-07-31', status: 'todo', progress: 0 },
      { id: 'ms-22', name: 'ERP 串接與測試', dueDate: '2024-08-31', status: 'todo', progress: 0 },
      { id: 'ms-23', name: '上線與教育訓練', dueDate: '2024-09-30', status: 'todo', progress: 0 },
    ],
    baseline: [
      { id: 'ms-19', name: '需求訪談與分析', dueDate: '2024-04-15', status: 'todo', progress: 0 },
      { id: 'ms-20', name: '系統架構設計', dueDate: '2024-05-15', status: 'todo', progress: 0 },
      { id: 'ms-21', name: '核心模組開發', dueDate: '2024-07-31', status: 'todo', progress: 0 },
      { id: 'ms-22', name: 'ERP 串接與測試', dueDate: '2024-08-31', status: 'todo', progress: 0 },
      { id: 'ms-23', name: '上線與教育訓練', dueDate: '2024-09-30', status: 'todo', progress: 0 },
    ],
    tasks: [
      { id: 'task-50', projectId: 'proj-5', milestoneId: 'ms-19', title: '倉庫現場勘查', description: '實地勘查倉庫動線與設備', assignee: 'Alice Chen', status: 'done', priority: 'high', startDate: '2024-03-15', endDate: '2024-03-25', dependencies: [], progress: 100, completedAt: '2024-03-24', completedBy: 'Alice Chen' },
      { id: 'task-51', projectId: 'proj-5', milestoneId: 'ms-19', title: '需求訪談與文件', description: '訪談倉管人員並撰寫需求文件', assignee: 'Alice Chen', status: 'done', priority: 'high', startDate: '2024-03-25', endDate: '2024-04-15', dependencies: ['task-50'], progress: 100, completedAt: '2024-04-14', completedBy: 'Alice Chen' },
      { id: 'task-52', projectId: 'proj-5', milestoneId: 'ms-20', title: '儲位規劃設計', description: '設計最佳儲位配置', assignee: 'Emma Wu', status: 'in-progress', priority: 'medium', startDate: '2024-04-20', endDate: '2024-05-10', dependencies: ['task-51'], progress: 40 },
      { id: 'task-53', projectId: 'proj-5', milestoneId: 'ms-20', title: '系統架構設計', description: '設計 WMS 系統架構與技術選型', assignee: 'Frank Chen', status: 'in-progress', priority: 'high', startDate: '2024-04-15', endDate: '2024-05-15', dependencies: ['task-51'], progress: 55 },
      { id: 'task-54', projectId: 'proj-5', milestoneId: 'ms-21', title: '入庫模組開發', description: '開發進貨驗收與上架功能', assignee: 'Frank Chen', status: 'todo', priority: 'high', startDate: '2024-05-15', endDate: '2024-06-15', dependencies: ['task-53'], progress: 0 },
      { id: 'task-55', projectId: 'proj-5', milestoneId: 'ms-21', title: '出庫模組開發', description: '開發揀貨、包裝、出貨功能', assignee: 'Emma Wu', status: 'todo', priority: 'high', startDate: '2024-06-01', endDate: '2024-07-01', dependencies: ['task-53'], progress: 0 },
      { id: 'task-56', projectId: 'proj-5', milestoneId: 'ms-21', title: '盤點模組開發', description: '開發庫存盤點與差異處理', assignee: 'Frank Chen', status: 'todo', priority: 'medium', startDate: '2024-06-15', endDate: '2024-07-15', dependencies: ['task-54'], progress: 0 },
      { id: 'task-57', projectId: 'proj-5', milestoneId: 'ms-22', title: 'ERP 串接開發', description: '與 ERP 系統建立雙向資料同步', assignee: 'Emma Wu', status: 'todo', priority: 'high', startDate: '2024-07-15', endDate: '2024-08-15', dependencies: ['task-54', 'task-55'], progress: 0 },
      { id: 'task-58', projectId: 'proj-5', milestoneId: 'ms-22', title: '整合測試', description: '端對端測試與壓力測試', assignee: 'Alice Chen', status: 'todo', priority: 'high', startDate: '2024-08-15', endDate: '2024-09-10', dependencies: ['task-57'], progress: 0 },
      { id: 'task-59', projectId: 'proj-5', milestoneId: 'ms-23', title: '教育訓練與上線', description: '倉管人員培訓與系統上線', assignee: 'Alice Chen', status: 'todo', priority: 'high', startDate: '2024-09-10', endDate: '2024-09-30', dependencies: ['task-58'], progress: 0 },
    ],
    risks: [],
    weeklyUpdates: [
      {
        id: 'wu-6',
        projectId: 'proj-5',
        weekOf: '2024-04-15',
        updatedBy: 'Alice Chen',
        updatedAt: '2024-04-18T09:00:00',
        milestoneUpdates: [
          { milestoneId: 'ms-19', progress: 100, notes: '需求訪談與文件已全部完成' },
          { milestoneId: 'ms-20', progress: 48, notes: '系統架構初版完成，儲位規劃進行中' },
          { milestoneId: 'ms-21', progress: 0, notes: '' },
          { milestoneId: 'ms-22', progress: 0, notes: '' },
          { milestoneId: 'ms-23', progress: 0, notes: '' },
        ],
        overallStatus: 'on-time',
        overallNotes: '架構設計進展順利，已完成倉庫現場勘查與需求分析',
        blockers: '無',
        nextWeekPlan: '完成架構審查、開始資料庫設計',
        keyAchievements: '需求文件簽核完成、架構初版產出',
      },
    ],
    delayRequests: [],
    taskLogs: [],
  },
  {
    id: 'proj-6',
    projectCode: 'SRC-2024-002',
    projectType: 'sourcing',
    name: '供應商評鑑系統建置',
    objective: '建立數位化供應商評鑑與管理平台',
    purpose: '統一評鑑標準、提升採購透明度、降低供應鏈風險',
    scope: '供應商資料庫、評分機制、稽核排程、績效儀表板',
    roi: '降低採購成本 8%，減少供應鏈中斷風險 60%',
    createdReason: '供應商評鑑仍靠 Excel 管理，資料分散且無法即時追蹤績效',
    startDate: '2024-04-01',
    endDate: '2024-08-31',
    status: 'yellow',
    progress: 15,
    budget: 4000000,
    budgetUsed: 800000,
    owner: 'Grace Liu',
    team: ['Grace Liu', 'Iris Chen', 'Karen Hsu'],
    createdAt: '2024-03-25',
    updatedAt: '2024-03-20',
    milestones: [
      { id: 'ms-24', name: '評鑑標準制定', dueDate: '2024-04-30', status: 'in-progress', progress: 60 },
      { id: 'ms-25', name: '系統開發', dueDate: '2024-06-30', status: 'todo', progress: 0 },
      { id: 'ms-26', name: '資料遷移', dueDate: '2024-07-31', status: 'todo', progress: 0 },
      { id: 'ms-27', name: '上線與推廣', dueDate: '2024-08-31', status: 'todo', progress: 0 },
    ],
    baseline: [
      { id: 'ms-24', name: '評鑑標準制定', dueDate: '2024-04-30', status: 'todo', progress: 0 },
      { id: 'ms-25', name: '系統開發', dueDate: '2024-06-30', status: 'todo', progress: 0 },
      { id: 'ms-26', name: '資料遷移', dueDate: '2024-07-31', status: 'todo', progress: 0 },
      { id: 'ms-27', name: '上線與推廣', dueDate: '2024-08-31', status: 'todo', progress: 0 },
    ],
    tasks: [
      { id: 'task-60', projectId: 'proj-6', milestoneId: 'ms-24', title: '評鑑指標研究', description: '研究業界最佳實踐並制定評鑑框架', assignee: 'Iris Chen', status: 'in-progress', priority: 'high', startDate: '2024-04-01', endDate: '2024-04-15', dependencies: [], progress: 70 },
      { id: 'task-61', projectId: 'proj-6', milestoneId: 'ms-24', title: '跨部門共識會議', description: '召集各部門確認評鑑標準', assignee: 'Grace Liu', status: 'in-progress', priority: 'high', startDate: '2024-04-10', endDate: '2024-04-25', dependencies: ['task-60'], progress: 40 },
      { id: 'task-62', projectId: 'proj-6', milestoneId: 'ms-24', title: '評分機制設計', description: '設計量化評分模型與權重', assignee: 'Iris Chen', status: 'todo', priority: 'high', startDate: '2024-04-25', endDate: '2024-04-30', dependencies: ['task-61'], progress: 0 },
      { id: 'task-63', projectId: 'proj-6', milestoneId: 'ms-25', title: '供應商資料庫開發', description: '開發供應商主檔管理功能', assignee: 'Karen Hsu', status: 'todo', priority: 'high', startDate: '2024-05-01', endDate: '2024-05-25', dependencies: ['task-62'], progress: 0 },
      { id: 'task-64', projectId: 'proj-6', milestoneId: 'ms-25', title: '評鑑表單與流程開發', description: '開發線上評鑑表單與審核流程', assignee: 'Iris Chen', status: 'todo', priority: 'high', startDate: '2024-05-15', endDate: '2024-06-10', dependencies: ['task-62'], progress: 0 },
      { id: 'task-65', projectId: 'proj-6', milestoneId: 'ms-25', title: '績效儀表板開發', description: '開發供應商績效視覺化儀表板', assignee: 'Karen Hsu', status: 'todo', priority: 'medium', startDate: '2024-06-01', endDate: '2024-06-30', dependencies: ['task-63'], progress: 0 },
      { id: 'task-66', projectId: 'proj-6', milestoneId: 'ms-26', title: '歷史資料遷移', description: '將 Excel 評鑑資料匯入新系統', assignee: 'Iris Chen', status: 'todo', priority: 'medium', startDate: '2024-07-01', endDate: '2024-07-31', dependencies: ['task-63'], progress: 0 },
      { id: 'task-67', projectId: 'proj-6', milestoneId: 'ms-27', title: '使用者培訓與推廣', description: '培訓採購部門使用新系統', assignee: 'Grace Liu', status: 'todo', priority: 'medium', startDate: '2024-08-01', endDate: '2024-08-31', dependencies: ['task-65', 'task-66'], progress: 0 },
    ],
    risks: [
      { id: 'risk-6', projectId: 'proj-6', title: '部門配合度不足', description: '各部門對統一評鑑標準意見分歧', impact: 'medium', probability: 'high', mitigation: '舉辦跨部門工作坊，由高層主持達成共識', status: 'open' },
    ],
    weeklyUpdates: [],
    delayRequests: [],
    taskLogs: [],
  },
  {
    id: 'proj-7',
    projectCode: 'CST-2024-002',
    projectType: 'cost-saving',
    name: '能源管理優化專案',
    objective: '導入能源監控系統降低廠區能耗成本',
    purpose: '即時監控各區域用電，找出浪費熱點並進行改善',
    scope: '電力監控安裝、數據分析平台、節能改善措施、月報自動化',
    roi: '年度節省電費 400 萬，碳排減少 15%',
    createdReason: '電費逐年上漲，廠區用電缺乏可視化管理，無法有效節能',
    startDate: '2024-01-10',
    endDate: '2024-05-31',
    status: 'green',
    progress: 68,
    budget: 3500000,
    budgetUsed: 2800000,
    owner: 'Carol Lin',
    team: ['Carol Lin', 'Henry Chang', 'Jack Liu'],
    createdAt: '2024-01-05',
    updatedAt: '2024-03-19',
    milestones: [
      { id: 'ms-28', name: '監控設備安裝', dueDate: '2024-02-28', status: 'done', progress: 100 },
      { id: 'ms-29', name: '數據平台開發', dueDate: '2024-03-31', status: 'done', progress: 100 },
      { id: 'ms-30', name: '節能改善執行', dueDate: '2024-04-30', status: 'in-progress', progress: 70 },
      { id: 'ms-31', name: '成效驗證與報告', dueDate: '2024-05-31', status: 'todo', progress: 0 },
    ],
    baseline: [
      { id: 'ms-28', name: '監控設備安裝', dueDate: '2024-02-28', status: 'todo', progress: 0 },
      { id: 'ms-29', name: '數據平台開發', dueDate: '2024-03-31', status: 'todo', progress: 0 },
      { id: 'ms-30', name: '節能改善執行', dueDate: '2024-04-30', status: 'todo', progress: 0 },
      { id: 'ms-31', name: '成效驗證與報告', dueDate: '2024-05-31', status: 'todo', progress: 0 },
    ],
    tasks: [
      { id: 'task-70', projectId: 'proj-7', milestoneId: 'ms-28', title: '電表安裝規劃', description: '規劃各區域智慧電表安裝位置', assignee: 'Jack Liu', status: 'done', priority: 'high', startDate: '2024-01-10', endDate: '2024-01-25', dependencies: [], progress: 100, completedAt: '2024-01-24', completedBy: 'Jack Liu' },
      { id: 'task-71', projectId: 'proj-7', milestoneId: 'ms-28', title: '智慧電表安裝', description: '安裝各區域智慧電表與感測器', assignee: 'Jack Liu', status: 'done', priority: 'high', startDate: '2024-01-25', endDate: '2024-02-28', dependencies: ['task-70'], progress: 100, completedAt: '2024-02-27', completedBy: 'Jack Liu' },
      { id: 'task-72', projectId: 'proj-7', milestoneId: 'ms-29', title: '數據收集平台開發', description: '開發電力數據即時收集與儲存', assignee: 'Henry Chang', status: 'done', priority: 'high', startDate: '2024-02-15', endDate: '2024-03-15', dependencies: ['task-71'], progress: 100, completedAt: '2024-03-14', completedBy: 'Henry Chang' },
      { id: 'task-73', projectId: 'proj-7', milestoneId: 'ms-29', title: '能耗分析儀表板', description: '開發各區域用電視覺化分析', assignee: 'Henry Chang', status: 'done', priority: 'high', startDate: '2024-03-10', endDate: '2024-03-31', dependencies: ['task-72'], progress: 100, completedAt: '2024-03-30', completedBy: 'Henry Chang' },
      { id: 'task-74', projectId: 'proj-7', milestoneId: 'ms-30', title: '照明設備汰換', description: '將傳統燈具更換為 LED', assignee: 'Henry Chang', status: 'done', priority: 'medium', startDate: '2024-03-15', endDate: '2024-04-10', dependencies: [], progress: 100, completedAt: '2024-04-09', completedBy: 'Henry Chang' },
      { id: 'task-75', projectId: 'proj-7', milestoneId: 'ms-30', title: '空調系統優化', description: '調整空調運轉排程降低尖峰用電', assignee: 'Jack Liu', status: 'in-progress', priority: 'high', startDate: '2024-04-01', endDate: '2024-04-25', dependencies: ['task-73'], progress: 60 },
      { id: 'task-76', projectId: 'proj-7', milestoneId: 'ms-30', title: '尖峰用電管控策略', description: '制定尖峰時段用電管控方案', assignee: 'Carol Lin', status: 'in-progress', priority: 'medium', startDate: '2024-04-10', endDate: '2024-04-30', dependencies: ['task-73'], progress: 40 },
      { id: 'task-77', projectId: 'proj-7', milestoneId: 'ms-31', title: '月報自動化', description: '設定能耗月報自動產出與寄送', assignee: 'Henry Chang', status: 'todo', priority: 'medium', startDate: '2024-04-20', endDate: '2024-05-10', dependencies: ['task-73'], progress: 0 },
      { id: 'task-78', projectId: 'proj-7', milestoneId: 'ms-31', title: '成效驗證報告', description: '統計節能成效並撰寫結案報告', assignee: 'Carol Lin', status: 'todo', priority: 'high', startDate: '2024-05-10', endDate: '2024-05-31', dependencies: ['task-75', 'task-76', 'task-77'], progress: 0 },
    ],
    risks: [],
    weeklyUpdates: [
      {
        id: 'wu-7',
        projectId: 'proj-7',
        weekOf: '2024-04-08',
        updatedBy: 'Carol Lin',
        updatedAt: '2024-04-10T10:00:00',
        milestoneUpdates: [
          { milestoneId: 'ms-28', progress: 100, notes: '監控設備全部安裝完成' },
          { milestoneId: 'ms-29', progress: 100, notes: '數據平台與儀表板開發完成' },
          { milestoneId: 'ms-30', progress: 67, notes: 'LED 汰換完成，空調排程優化進行中' },
          { milestoneId: 'ms-31', progress: 0, notes: '' },
        ],
        overallStatus: 'on-time',
        overallNotes: '節能改善措施執行順利，已看到初步成效',
        blockers: '無',
        nextWeekPlan: '完成空調排程調整、開始評估其他節能機會',
        keyAchievements: 'LED 汰換完成，預估年省 80 萬電費',
      },
    ],
    delayRequests: [],
    taskLogs: [
      { id: 'tl-60', taskId: 'task-70', projectId: 'proj-7', author: 'Jack Liu', logDate: '2024-01-22', content: '完成廠區各區域電表安裝位置規劃圖，共規劃 32 個監測點', createdAt: '2024-01-22T17:00:00' },
      { id: 'tl-61', taskId: 'task-71', projectId: 'proj-7', author: 'Jack Liu', logDate: '2024-02-20', content: '已完成 28 個監測點的智慧電表安裝，剩餘 4 個預計本週完成', createdAt: '2024-02-20T16:30:00' },
      { id: 'tl-62', taskId: 'task-72', projectId: 'proj-7', author: 'Henry Chang', logDate: '2024-03-10', content: '數據收集平台上線，可即時接收所有電表數據並存入時序資料庫', createdAt: '2024-03-10T18:00:00' },
      { id: 'tl-63', taskId: 'task-74', projectId: 'proj-7', author: 'Henry Chang', logDate: '2024-04-08', content: '完成廠區 A、B 棟照明設備 LED 汰換，預估年省電費 80 萬元', createdAt: '2024-04-08T17:00:00' },
    ],
  },
]
*/

export function getProjectById(id: string): Project | undefined {
  return MOCK_PROJECTS.find(p => p.id === id)
}

export function getProjectsByStatus(status: ProjectStatus): Project[] {
  return MOCK_PROJECTS.filter(p => p.status === status)
}

export function getAllProjects(): Project[] {
  return MOCK_PROJECTS
}
