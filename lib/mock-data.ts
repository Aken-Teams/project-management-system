export type ProjectStatus = 'green' | 'yellow' | 'red'
export type TaskStatus = 'todo' | 'in-progress' | 'done' | 'blocked'

export interface Milestone {
  id: string
  name: string
  dueDate: string
  status: TaskStatus
  progress: number
}

export interface Project {
  id: string
  name: string
  objective: string
  purpose: string
  scope: string
  roi: string
  startDate: string
  endDate: string
  status: ProjectStatus
  progress: number
  budget: number
  budgetUsed: number
  owner: string
  team: string[]
  milestones: Milestone[]
  tasks: Task[]
  risks: Risk[]
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

// Mock projects data
export const MOCK_PROJECTS: Project[] = [
  {
    id: 'proj-1',
    name: '客戶管理系統開發',
    objective: '建立全新的 CRM 系統以提升客戶管理效率',
    purpose: '整合現有客戶資料，提供 360 度客戶視圖，提升銷售團隊效率 30%',
    scope: '包含客戶資料管理、銷售機會追蹤、報價單管理、客戶服務記錄等功能',
    roi: '預計第一年節省人力成本 200 萬，提升銷售轉換率 25%，ROI 約 250%',
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
      {
        id: 'ms-1',
        name: '需求分析完成',
        dueDate: '2024-02-15',
        status: 'done',
        progress: 100
      },
      {
        id: 'ms-2',
        name: 'UI/UX 設計完成',
        dueDate: '2024-03-15',
        status: 'done',
        progress: 100
      },
      {
        id: 'ms-3',
        name: '後端 API 開發',
        dueDate: '2024-04-30',
        status: 'in-progress',
        progress: 70
      },
      {
        id: 'ms-4',
        name: '前端開發',
        dueDate: '2024-05-31',
        status: 'in-progress',
        progress: 60
      },
      {
        id: 'ms-5',
        name: '測試與上線',
        dueDate: '2024-06-30',
        status: 'todo',
        progress: 0
      }
    ],
    tasks: [
      {
        id: 'task-1',
        projectId: 'proj-1',
        title: 'API 端點設計',
        description: '設計 RESTful API 端點',
        assignee: 'Bob Wang',
        status: 'in-progress',
        priority: 'high',
        startDate: '2024-03-20',
        endDate: '2024-04-10',
        dependencies: [],
        progress: 75
      },
      {
        id: 'task-2',
        projectId: 'proj-1',
        title: '資料庫架構設計',
        description: '設計資料庫 schema',
        assignee: 'David Lee',
        status: 'done',
        priority: 'high',
        startDate: '2024-03-15',
        endDate: '2024-03-30',
        dependencies: [],
        progress: 100
      },
      {
        id: 'task-3',
        projectId: 'proj-1',
        title: '客戶列表頁面',
        description: '開發客戶列表與篩選功能',
        assignee: 'Emma Wu',
        status: 'in-progress',
        priority: 'medium',
        startDate: '2024-04-01',
        endDate: '2024-04-20',
        dependencies: ['task-1'],
        progress: 50
      },
      {
        id: 'task-4',
        projectId: 'proj-1',
        title: '權限管理系統',
        description: '實作角色權限控制',
        assignee: 'Bob Wang',
        status: 'todo',
        priority: 'high',
        startDate: '2024-04-15',
        endDate: '2024-05-05',
        dependencies: ['task-1'],
        progress: 0
      }
    ],
    risks: [
      {
        id: 'risk-1',
        projectId: 'proj-1',
        title: '第三方 API 整合延遲',
        description: '外部 CRM 系統整合可能需要更多時間',
        impact: 'medium',
        probability: 'medium',
        mitigation: '提前與第三方供應商協調，準備備案方案',
        status: 'open'
      }
    ]
  },
  {
    id: 'proj-2',
    name: '行動應用程式改版',
    objective: '更新行動 App，提升使用者體驗與效能',
    purpose: '改善 App 載入速度、更新 UI 設計、增加新功能以提升用戶留存率',
    scope: 'iOS 與 Android 雙平台更新，包含首頁重設計、效能優化、新增社群分享功能',
    roi: '預計提升 DAU 20%，降低跳出率 15%，增加營收 150 萬/年',
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
      {
        id: 'ms-6',
        name: 'UI/UX 重設計',
        dueDate: '2024-03-10',
        status: 'done',
        progress: 100
      },
      {
        id: 'ms-7',
        name: 'iOS 開發',
        dueDate: '2024-04-20',
        status: 'in-progress',
        progress: 55
      },
      {
        id: 'ms-8',
        name: 'Android 開發',
        dueDate: '2024-04-20',
        status: 'in-progress',
        progress: 40
      },
      {
        id: 'ms-9',
        name: 'Beta 測試',
        dueDate: '2024-05-10',
        status: 'todo',
        progress: 0
      },
      {
        id: 'ms-10',
        name: '正式上線',
        dueDate: '2024-05-31',
        status: 'todo',
        progress: 0
      }
    ],
    tasks: [],
    risks: [
      {
        id: 'risk-2',
        projectId: 'proj-2',
        title: 'Android 開發進度落後',
        description: 'Android 版本開發進度比預期慢 2 週',
        impact: 'high',
        probability: 'high',
        mitigation: '增加開發人力，調整部分功能優先順序',
        status: 'open'
      }
    ]
  },
  {
    id: 'proj-3',
    name: '資料分析平台建置',
    objective: '建立內部資料分析平台',
    purpose: '整合各系統資料，提供即時分析報表，協助管理層決策',
    scope: '資料 ETL 流程、視覺化儀表板、自動化報表、權限管理',
    roi: '提升決策效率 40%，減少人工報表時間 80%，年度效益約 300 萬',
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
      {
        id: 'ms-11',
        name: '資料源整合',
        dueDate: '2024-04-15',
        status: 'in-progress',
        progress: 30
      },
      {
        id: 'ms-12',
        name: 'ETL 流程開發',
        dueDate: '2024-05-31',
        status: 'blocked',
        progress: 15
      },
      {
        id: 'ms-13',
        name: '儀表板開發',
        dueDate: '2024-07-15',
        status: 'todo',
        progress: 0
      },
      {
        id: 'ms-14',
        name: '測試與部署',
        dueDate: '2024-08-31',
        status: 'todo',
        progress: 0
      }
    ],
    tasks: [],
    risks: [
      {
        id: 'risk-3',
        projectId: 'proj-3',
        title: '資料源存取權限問題',
        description: '部分系統資料存取權限申請流程冗長',
        impact: 'high',
        probability: 'high',
        mitigation: '升級至高層協調，尋找替代資料來源',
        status: 'open'
      },
      {
        id: 'risk-4',
        projectId: 'proj-3',
        title: '技術選型不確定',
        description: '資料倉儲技術方案仍在評估中',
        impact: 'medium',
        probability: 'medium',
        mitigation: '加速 POC 測試，2 週內做出決定',
        status: 'open'
      }
    ]
  }
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
