export type ProjectStatus = 'green' | 'yellow' | 'red'
export type TaskStatus = 'todo' | 'in-progress' | 'done' | 'blocked'
export type ProjectType = 'sourcing' | 'npi' | 'cost-saving' | 'cip' | 'other'

export interface Milestone {
  id: string
  name: string
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
  affectedMilestones: {
    milestoneId: string
    originalDate: string
    proposedDate: string
  }[]
  canCatchUp: boolean
  supportNeeded: string
  status: 'pending' | 'approved' | 'rejected'
  reviewedBy?: string
  reviewedAt?: string
  reviewNotes?: string
}

export interface Project {
  id: string
  projectCode: string
  projectType: ProjectType
  name: string
  objective: string
  purpose: string
  scope: string
  roi: string
  createdReason: string
  startDate: string
  endDate: string
  status: ProjectStatus
  progress: number
  budget: number
  budgetUsed: number
  owner: string
  team: string[]
  milestones: Milestone[]
  baseline: Milestone[]
  tasks: Task[]
  risks: Risk[]
  weeklyUpdates: WeeklyUpdate[]
  delayRequests: DelayRequest[]
  createdAt: string
  updatedAt: string
}

export interface Task {
  id: string
  projectId: string
  title: string
  description: string
  assignee: string
  status: TaskStatus
  priority: 'low' | 'medium' | 'high'
  startDate: string
  endDate: string
  dependencies: string[]
  progress: number
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

export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  'sourcing': '採購案 (Sourcing)',
  'npi': '新產品開發 (NPI)',
  'cost-saving': '成本節省 (Cost Saving)',
  'cip': '持續改善 (CIP)',
  'other': '其他',
}

// Project code generation helper
let codeCounter = 3
export function generateProjectCode(type: ProjectType): string {
  codeCounter++
  const prefix: Record<ProjectType, string> = {
    'sourcing': 'SRC',
    'npi': 'NPI',
    'cost-saving': 'CST',
    'cip': 'CIP',
    'other': 'PRJ',
  }
  const year = new Date().getFullYear()
  return `${prefix[type]}-${year}-${String(codeCounter).padStart(3, '0')}`
}

// Mock projects data
export const MOCK_PROJECTS: Project[] = [
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
    progress: 65,
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
      { id: 'task-1', projectId: 'proj-1', title: 'API 端點設計', description: '設計 RESTful API 端點', assignee: 'Bob Wang', status: 'in-progress', priority: 'high', startDate: '2024-03-20', endDate: '2024-04-10', dependencies: [], progress: 75 },
      { id: 'task-2', projectId: 'proj-1', title: '資料庫架構設計', description: '設計資料庫 schema', assignee: 'David Lee', status: 'done', priority: 'high', startDate: '2024-03-15', endDate: '2024-03-30', dependencies: [], progress: 100 },
      { id: 'task-3', projectId: 'proj-1', title: '客戶列表頁面', description: '開發客戶列表與篩選功能', assignee: 'Emma Wu', status: 'in-progress', priority: 'medium', startDate: '2024-04-01', endDate: '2024-04-20', dependencies: ['task-1'], progress: 50 },
      { id: 'task-4', projectId: 'proj-1', title: '權限管理系統', description: '實作角色權限控制', assignee: 'Bob Wang', status: 'todo', priority: 'high', startDate: '2024-04-15', endDate: '2024-05-05', dependencies: ['task-1'], progress: 0 },
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
          { milestoneId: 'ms-2', progress: 100, notes: 'UI/UX 設計已完成，通過團隊審查' },
          { milestoneId: 'ms-3', progress: 40, notes: 'API 端點設計中，預計下週完成第一版' },
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
          { milestoneId: 'ms-2', progress: 85, notes: 'UI 設計基本完成，等待最終審查' },
        ],
        overallStatus: 'on-time',
        overallNotes: 'UI 設計進入尾聲，開始準備後端開發環境',
        blockers: '無',
        nextWeekPlan: 'UI/UX 設計最終審查、後端開發環境搭建',
        keyAchievements: 'UI 元件庫建立完成',
      },
    ],
    delayRequests: [],
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
    progress: 45,
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
    tasks: [],
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
          { milestoneId: 'ms-7', progress: 55, notes: 'iOS 版核心頁面完成，剩下推播功能' },
          { milestoneId: 'ms-8', progress: 40, notes: 'Android 進度落後，Vendor 交付延遲' },
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
    progress: 25,
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
    tasks: [],
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
          { milestoneId: 'ms-11', progress: 30, notes: '已完成 2 個資料源對接，第 3 個因權限問題卡住' },
          { milestoneId: 'ms-12', progress: 15, notes: 'ETL 流程受資料源進度影響，部分開發受阻' },
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
  },
]

export function getProjectById(id: string): Project | undefined {
  return MOCK_PROJECTS.find(p => p.id === id)
}

export function getProjectsByStatus(status: ProjectStatus): Project[] {
  return MOCK_PROJECTS.filter(p => p.status === status)
}

export function getAllProjects(): Project[] {
  return MOCK_PROJECTS
}
