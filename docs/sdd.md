# 專案看板系統 軟體設計文件 (SDD)

**文件版本**：v1.0
**建立時間**：2026/2/13
**對應 PRD 版本**：v2.0
**文件狀態**：初版 — 基於目前已實作系統撰寫

---

## 目錄

1. [系統概述](#1-系統概述)
2. [系統架構](#2-系統架構)
3. [技術選型](#3-技術選型)
4. [目錄結構](#4-目錄結構)
5. [資料庫設計](#5-資料庫設計)
6. [API 設計](#6-api-設計)
7. [前端架構](#7-前端架構)
8. [核心業務邏輯](#8-核心業務邏輯)
9. [驗證與權限機制](#9-驗證與權限機制)
10. [狀態管理](#10-狀態管理)
11. [部署架構](#11-部署架構)
12. [附錄](#附錄)

---

## 1. 系統概述

### 1.1 系統目的

本系統為企業團隊內部專案管理平台，提供專案建立、任務追蹤、甘特圖視覺化、工作日誌記錄、延期申請審核、自動健康度計算等功能，取代傳統 Excel + Email 的管理模式。

### 1.2 設計原則

- **Server-Side Data, Client-Side Rendering**：資料存於 PostgreSQL，透過 Next.js API Routes 存取，前端以 Client Component 渲染。
- **Auto-Sync over Manual Input**：里程碑狀態、任務進度、專案健康度皆由系統自動計算，減少人為操作。
- **Batch Save over Real-Time Sync**：任務編輯採批次儲存模式（diff → 6-step API），非即時逐筆同步。
- **Role-Based Visibility**：權限以角色為基礎控制可見性（PM/Member/Executive），而非細粒度的 ACL。

### 1.3 系統邊界

```mermaid
block-beta
  columns 1
  block:client["瀏覽器 (Client)"]
    A["Next.js Client Components + React Context API"]
  end
  block:server["Next.js Server (API Routes)"]
    B["app/api/** → Prisma ORM"]
  end
  block:db["PostgreSQL Database"]
    C["Docker Container (docker-compose.yml)"]
  end

  client --> server --> db
```

外部依賴：無。目前不整合任何第三方服務（無 OAuth、無郵件、無 WebSocket）。

---

## 2. 系統架構

### 2.1 整體架構圖

```mermaid
graph TB
  subgraph Browser["Browser (Client)"]
    direction TB
    subgraph Providers["Context Providers"]
      AuthProvider
      ProjectStoreProvider
      NotificationStoreProvider
      ThemeProvider
    end
    subgraph Pages["Pages (app/)"]
      Dashboard
      Projects
      MyTasks
      Reports
      Approvals
    end
    subgraph Components["Components"]
      TimelineTable
      GanttChart
      ProjectEditDialog
      TaskDetailSheet
    end
  end

  subgraph Server["Next.js API Routes (Server)"]
    direction TB
    subgraph ServerModules["Modules"]
      REST["REST Endpoints<br/>(app/api/**)"]
      BizLogic["Business Logic<br/>(lib/*.ts)"]
      AutoSync["Auto-Sync<br/>Functions"]
    end
    Prisma["Prisma ORM<br/>(Singleton PrismaClient + pg adapter)"]
    REST --> Prisma
    BizLogic --> Prisma
    AutoSync --> Prisma
  end

  subgraph DB["PostgreSQL Database (Docker)"]
    DBContent["15 Models, 14 Enums, 20+ Indexes"]
  end

  Browser -- "fetch()" --> Server
  Prisma --> DB
```

### 2.2 分層架構

| 層級 | 職責 | 技術 |
|------|------|------|
| **展示層** | UI 渲染、使用者互動、表單驗證 | React 19 + shadcn/ui + Tailwind CSS |
| **狀態層** | 全域狀態管理、本地快取 | React Context API + localStorage |
| **路由層** | URL 路由、頁面導航 | Next.js App Router |
| **API 層** | HTTP 端點、請求驗證、回應格式化 | Next.js API Routes (app/api/) |
| **業務邏輯層** | 自動同步、健康度計算、風險偵測 | lib/*.ts (TypeScript) |
| **資料存取層** | ORM 查詢、交易管理 | Prisma Client + @prisma/adapter-pg |
| **資料庫層** | 資料持久化、索引、約束 | PostgreSQL 15+ |

---

## 3. 技術選型

### 3.1 核心技術棧

| 分類 | 技術 | 版本 | 用途 |
|------|------|------|------|
| 框架 | Next.js | 16.1.6 | App Router + API Routes |
| 前端 | React | 19.x | UI 渲染引擎 |
| 語言 | TypeScript | 5.7.3 | 全專案型別安全 |
| ORM | Prisma | 7.3.0 | 資料庫存取 + Migration |
| 資料庫 | PostgreSQL | 15+ | 關聯式資料儲存 |
| 樣式 | Tailwind CSS | 3.4.17 | Utility-first CSS |
| 元件庫 | shadcn/ui | — | Radix UI + Tailwind 封裝 |

### 3.2 關鍵套件

| 套件 | 版本 | 用途 |
|------|------|------|
| @dnd-kit/core + sortable | 6.3.1 / 10.0.0 | 拖放排序（時間軸表格） |
| jspdf + jspdf-autotable | 4.1.0 / 5.0.7 | 前端 PDF 報告生成 |
| recharts | 2.15.0 | 統計圖表（報告頁面） |
| date-fns | 4.1.0 | 日期運算與格式化 |
| zod | 3.24.1 | Schema 驗證 |
| react-hook-form | 7.54.1 | 表單管理 |
| lucide-react | 0.544.0 | 圖示系統 |
| sonner | 1.7.1 | Toast 通知 |
| next-themes | 0.4.6 | 深色/淺色模式 |

### 3.3 開發工具

| 工具 | 用途 |
|------|------|
| Docker Compose | 本機 PostgreSQL 容器化 |
| Prisma Studio | 資料庫視覺化管理 |
| pnpm | 套件管理器 |
| tsx | TypeScript 直接執行（seed 腳本） |

---

## 4. 目錄結構

```
project-management-system/
├── app/                          # Next.js App Router
│   ├── layout.tsx                # 根佈局（Provider 堆疊）
│   ├── page.tsx                  # 首頁（重導至 Dashboard/MyTasks）
│   ├── globals.css               # 全域樣式
│   ├── login/page.tsx            # 登入頁
│   ├── dashboard/page.tsx        # 儀表板
│   ├── projects/
│   │   ├── page.tsx              # 專案列表
│   │   ├── new/page.tsx          # 新建專案（手動/AI 模式）
│   │   └── [id]/
│   │       ├── page.tsx          # 專案詳情（甘特圖、相依分析）
│   │       └── update/page.tsx   # 專案更新（已棄用）
│   ├── my-tasks/page.tsx         # 我的任務
│   ├── gantt/page.tsx            # 甘特圖獨立頁面
│   ├── reports/page.tsx          # 報告頁面
│   ├── approvals/page.tsx        # 延期審核
│   ├── settings/page.tsx         # 設定頁面
│   ├── profile/page.tsx          # 個人資料
│   └── api/                      # API Routes（詳見第 6 節）
│       ├── projects/             # 專案 CRUD + 子資源
│       ├── drafts/               # 草稿管理
│       ├── delay-requests/       # 延期申請
│       ├── users/                # 使用者查詢
│       ├── reports/              # 報告生成
│       ├── dashboard/            # 儀表板資料
│       └── my-tasks/             # 個人任務
│
├── components/                   # React 元件
│   ├── ui/                       # shadcn/ui 基礎元件（50+ 個）
│   ├── dashboard-layout.tsx      # 主佈局（側邊欄 + 導覽列）
│   ├── timeline-table.tsx        # 時間軸表格（主要任務管理介面）
│   ├── gantt-chart.tsx           # 甘特圖元件
│   ├── gantt-dependency-overlay.tsx  # 甘特圖相依箭頭疊加
│   ├── project-edit-dialog.tsx   # 專案編輯對話框（5 分頁）
│   ├── task-detail-sheet.tsx     # 任務詳情側邊抽屜
│   ├── task-dependency-analysis.tsx  # 相依分析面板
│   ├── milestone-task-view.tsx   # 里程碑 + 任務綜合檢視
│   ├── kanban-board.tsx          # 看板（部分實作）
│   ├── team-member-table.tsx     # 團隊成員表格
│   ├── team-member-autocomplete.tsx  # 成員搜尋自動完成
│   ├── notification-bell.tsx     # 通知鈴鐺
│   ├── project-delete-dialog.tsx # 專案刪除確認
│   ├── voice-input-button.tsx    # 語音輸入按鈕
│   └── theme-provider.tsx        # 主題提供者
│
├── lib/                          # 業務邏輯與工具函式
│   ├── db.ts                     # Prisma Client 單例
│   ├── auth-context.tsx          # 驗證 Context（Mock Auth）
│   ├── project-store.tsx         # 專案 Store（localStorage 備援）
│   ├── notification-store.tsx    # 通知 Store
│   ├── permissions.ts            # 角色權限矩陣
│   ├── sync-milestone-status.ts  # 自動同步核心邏輯
│   ├── dependency-graph.ts       # 相依圖建構 + 關鍵路徑
│   ├── project-transformer.ts    # DB ↔ Frontend 資料轉換
│   ├── enum-mappers.ts           # Enum 格式轉換
│   ├── mock-data.ts              # 型別定義 + 常數
│   ├── task-utils.ts             # 任務狀態計算
│   ├── risk-utils.ts             # 自動風險偵測
│   ├── timeline-utils.ts         # 時間軸計算 + Diff
│   ├── milestone-templates.ts    # 里程碑範本
│   ├── ai-service.ts             # AI 解析服務（Mock）
│   └── utils.ts                  # cn() 工具函式
│
├── prisma/
│   ├── schema.prisma             # 資料庫 Schema
│   ├── seed.ts                   # 種子資料腳本
│   └── migrations/               # 4 次 Migration
│
├── hooks/                        # React Hooks
│   ├── use-mobile.tsx            # 行動裝置偵測
│   └── use-toast.ts              # Toast 通知 Hook
│
├── docs/                         # 文件
│   ├── prd.md                    # 產品需求文件
│   ├── sdd.md                    # 本文件
│   ├── crud-audit.md             # CRUD 完成度審計
│   └── project-examples.md       # 專案範例資料
│
├── scripts/                      # 工具腳本
│   └── import-data.sql           # SQL 匯入腳本
│
├── docker-compose.yml            # PostgreSQL 容器
├── package.json                  # 套件定義
├── next.config.mjs               # Next.js 設定
├── tailwind.config.ts            # Tailwind 設定
├── tsconfig.json                 # TypeScript 設定
└── .env                          # 環境變數
```

---

## 5. 資料庫設計

### 5.1 ER 關聯圖

```mermaid
erDiagram
    User ||--o{ ProjectTeamMember : "teamMemberships"
    User ||--o{ TaskLog : "taskLogs"
    User ||--o{ DelayRequest : "requests"
    User ||--o{ Notification : "notifications"
    User ||--o{ ProjectDraft : "drafts"
    User ||--o{ Project : "ownedProjects"

    Project ||--o{ ProjectTeamMember : "teamMembers"
    Project ||--o{ Milestone : "milestones"
    Project ||--o{ Task : "tasks"
    Project ||--o{ Risk : "risks"
    Project ||--o{ TaskLog : "taskLogs"
    Project ||--o{ DelayRequest : "delayRequests"
    Project ||--o{ MilestoneBaseline : "baselines"
    Project ||--o{ Notification : "notifications"

    Milestone ||--o{ Task : "tasks"
    Milestone ||--o{ MilestoneBaseline : "baselines"
    Milestone ||--o{ AffectedMilestone : "affectedIn"

    Task ||--o{ TaskLog : "taskLogs"
    Task ||--o{ TaskDependency : "dependsOn"
    Task ||--o{ TaskDependency : "dependedBy"

    DelayRequest ||--o{ AffectedMilestone : "affectedMilestones"

    User {
        string id PK
        string name
        string email UK
        UserRole role
        string organization
    }
    Project {
        string id PK
        string projectCode UK
        ProjectType projectType
        string name
        ProjectStatus status
        int progress
        float budget
        float budgetUsed
    }
    Milestone {
        string id PK
        string projectId FK
        string name
        datetime dueDate
        TaskStatus status
        int progress
    }
    Task {
        string id PK
        string milestoneId FK
        string title
        string assignee
        TaskStatus status
        Priority priority
        int progress
    }
    TaskLog {
        string id PK
        string taskId FK
        string authorId FK
        datetime logDate
        string content
    }
    Risk {
        string id PK
        string projectId FK
        string title
        RiskImpact impact
        RiskProbability probability
        RiskStatus status
    }
    DelayRequest {
        string id PK
        string projectId FK
        string requesterId FK
        string reason
        DelayRequestStatus status
    }
    MilestoneBaseline {
        string id PK
        string milestoneId FK
        string name
        datetime dueDate
        datetime baselinedAt
    }
    TaskDependency {
        string dependentId PK
        string prerequisiteId PK
    }
```

### 5.2 資料模型定義

#### 5.2.1 User（使用者）

| 欄位 | 型別 | 約束 | 說明 |
|------|------|------|------|
| id | String (CUID) | PK | 使用者 ID |
| name | String | NOT NULL | 姓名 |
| email | String | UNIQUE | 電子郵件 |
| role | UserRole | DEFAULT member | 角色 |
| organization | String | DEFAULT "" | 組織/部門 |
| avatarUrl | String? | NULLABLE | 頭像 URL |
| createdAt | DateTime | AUTO | 建立時間 |
| updatedAt | DateTime | AUTO | 更新時間 |

#### 5.2.2 Project（專案）

| 欄位 | 型別 | 約束 | 說明 |
|------|------|------|------|
| id | String (CUID) | PK | 專案 ID |
| projectCode | String | UNIQUE | 專案代碼（自動生成，如 NPI-2026-001） |
| projectType | ProjectType | NOT NULL | 專案類型 |
| projectTier | ProjectTier? | NULLABLE | 專案層別 |
| demandSource | DemandSource? | NULLABLE | 需求來源 |
| name | String | NOT NULL | 專案名稱 |
| objective | String | DEFAULT "" | 專案目標 |
| purpose | String | DEFAULT "" | 專案目的 |
| scope | String | DEFAULT "" | 專案範圍 |
| roi | String | DEFAULT "" | 投資報酬 |
| createdReason | String | DEFAULT "" | 開案原因 |
| expectedBenefits | String? | NULLABLE | 預期效益 |
| smartSpecific | String? | NULLABLE | SMART - 具體 |
| smartMeasurable | String? | NULLABLE | SMART - 可衡量 |
| smartAchievable | String? | NULLABLE | SMART - 可達成 |
| smartRelevant | String? | NULLABLE | SMART - 相關性 |
| smartTimeBound | String? | NULLABLE | SMART - 時限性 |
| startDate | DateTime | NOT NULL | 開始日期 |
| endDate | DateTime | NOT NULL | 結束日期 |
| status | ProjectStatus | DEFAULT green | 健康度燈號 |
| progress | Int | DEFAULT 0 | 進度 (0-100) |
| budget | Float | DEFAULT 0 | 預算 |
| budgetUsed | Float | DEFAULT 0 | 已使用預算 |
| ownerId | String | FK→User | 專案負責人 |

**索引**：`[startDate, endDate]`

#### 5.2.3 Milestone（里程碑）

| 欄位 | 型別 | 約束 | 說明 |
|------|------|------|------|
| id | String (CUID) | PK | 里程碑 ID |
| projectId | String | FK→Project (CASCADE) | 所屬專案 |
| name | String | NOT NULL | 名稱 |
| dueDate | DateTime | NOT NULL | 到期日 |
| status | TaskStatus | DEFAULT todo | 狀態 |
| progress | Int | DEFAULT 0 | 進度 |
| sortOrder | Int | DEFAULT 0 | 排序順序 |

**索引**：`[projectId, sortOrder]`

#### 5.2.4 Task（任務）

| 欄位 | 型別 | 約束 | 說明 |
|------|------|------|------|
| id | String (CUID) | PK | 任務 ID |
| projectId | String | FK→Project (CASCADE) | 所屬專案 |
| milestoneId | String | FK→Milestone (CASCADE) | 所屬里程碑 |
| title | String | NOT NULL | 標題 |
| description | String | DEFAULT "" | 說明 |
| assignee | String | DEFAULT "" | 指派人姓名 |
| status | TaskStatus | DEFAULT todo | 狀態 |
| priority | Priority | DEFAULT medium | 優先級 |
| startDate | DateTime | NOT NULL | 開始日期 |
| endDate | DateTime | NOT NULL | 結束日期 |
| durationWeeks | Int | DEFAULT 0 | 持續週數 |
| progress | Int | DEFAULT 0 | 進度 (0-100) |
| sortOrder | Int | DEFAULT 0 | 排序順序 |
| completedAt | DateTime? | NULLABLE | 完成時間 |
| completedBy | String? | NULLABLE | 完成者 |

**索引**：`[projectId, milestoneId, sortOrder]`, `[assignee]`, `[status]`

#### 5.2.5 TaskDependency（任務相依性）

| 欄位 | 型別 | 約束 | 說明 |
|------|------|------|------|
| dependentId | String | PK (composite), FK→Task | 後續任務 |
| prerequisiteId | String | PK (composite), FK→Task | 前置任務 |

**索引**：`[prerequisiteId]`

#### 5.2.6 TaskLog（工作日誌）

| 欄位 | 型別 | 約束 | 說明 |
|------|------|------|------|
| id | String (CUID) | PK | 日誌 ID |
| taskId | String | FK→Task (CASCADE) | 所屬任務 |
| projectId | String | FK→Project (CASCADE) | 所屬專案 |
| authorId | String | FK→User | 撰寫者 |
| logDate | DateTime | NOT NULL | 日誌日期 |
| content | String | NOT NULL | 內容 |
| createdAt | DateTime | AUTO | 建立時間 |

**索引**：`[taskId]`, `[projectId]`

#### 5.2.7 Risk（風險）

| 欄位 | 型別 | 約束 | 說明 |
|------|------|------|------|
| id | String (CUID) | PK | 風險 ID |
| projectId | String | FK→Project (CASCADE) | 所屬專案 |
| title | String | NOT NULL | 標題 |
| description | String | DEFAULT "" | 說明 |
| impact | RiskImpact | DEFAULT medium | 影響度 |
| probability | RiskProbability | DEFAULT medium | 發生機率 |
| mitigation | String | DEFAULT "" | 緩解措施 |
| status | RiskStatus | DEFAULT open | 狀態 |

**索引**：`[projectId]`

#### 5.2.8 MilestoneBaseline（里程碑基線）

| 欄位 | 型別 | 約束 | 說明 |
|------|------|------|------|
| id | String (CUID) | PK | 基線 ID |
| projectId | String | FK→Project (CASCADE) | 所屬專案 |
| milestoneId | String | FK→Milestone (CASCADE) | 所屬里程碑 |
| name | String | NOT NULL | 里程碑名稱快照 |
| dueDate | DateTime | NOT NULL | 到期日快照 |
| baselinedAt | DateTime | AUTO | 建立時間 |

**索引**：`[projectId]`, `[milestoneId]`

#### 5.2.9 DelayRequest（延期申請）

| 欄位 | 型別 | 約束 | 說明 |
|------|------|------|------|
| id | String (CUID) | PK | 申請 ID |
| projectId | String | FK→Project (CASCADE) | 所屬專案 |
| requesterId | String | FK→User | 申請者 |
| reason | String | NOT NULL | 延期原因 |
| canCatchUp | Boolean | DEFAULT false | 是否可追回 |
| supportNeeded | String | DEFAULT "" | 需協助事項 |
| status | DelayRequestStatus | DEFAULT pending | 審核狀態 |
| reviewerId | String? | FK→User, NULLABLE | 審核者 |
| reviewedAt | DateTime? | NULLABLE | 審核時間 |
| reviewNotes | String? | NULLABLE | 審核意見 |
| supportResolved | Boolean? | NULLABLE | 協助已解決 |
| supportResolvedAt | DateTime? | NULLABLE | 解決時間 |
| supportResolvedById | String? | FK→User, NULLABLE | 解決者 |
| supportResolvedNotes | String? | NULLABLE | 解決備註 |

**索引**：`[projectId]`, `[requesterId]`

#### 5.2.10 AffectedMilestone（受影響里程碑）

| 欄位 | 型別 | 約束 | 說明 |
|------|------|------|------|
| id | String (CUID) | PK | ID |
| delayRequestId | String | FK→DelayRequest (CASCADE) | 所屬申請 |
| milestoneId | String | FK→Milestone (CASCADE) | 受影響里程碑 |
| originalDate | DateTime | NOT NULL | 原始日期 |
| proposedDate | DateTime | NOT NULL | 建議新日期 |

#### 5.2.11 其他模型

| 模型 | 說明 | 狀態 |
|------|------|------|
| **ProjectDraft** | 專案草稿（JSON 儲存） | ✅ 使用中 |
| **ProjectCodeSequence** | 專案代碼流水號（type + year → lastSeq） | ✅ 使用中 |
| **Notification** | 通知（Schema 已定義） | 📋 API 待實作 |
| **WeeklyUpdate** | 週報（已棄用，保留於 Schema） | ⚠️ 已棄用 |
| **MilestoneUpdate** | 週報里程碑更新（已棄用） | ⚠️ 已棄用 |

### 5.3 列舉型別

```
ProjectStatus:    green | yellow | red
TaskStatus:       todo | in_progress | done | blocked
ProjectType:      npi | cost_optimization | quality_improvement | automation |
                  product_strategy | process_optimization | external_requirement
ProjectTier:      T1 | T2 | T3 | CIP
DemandSource:     company_policy | external_requirement | internal_demand | self_proposal
TeamRole:         pm | engineer | procurement | qa | manufacturing | designer | other
UserRole:         pm | member | executive
Priority:         low | medium | high
RiskImpact:       low | medium | high
RiskProbability:  low | medium | high
RiskStatus:       open | mitigated | closed
DelayRequestStatus: pending | approved | rejected
NotificationType: task_assigned | delay_submitted | delay_approved |
                  delay_rejected | task_overdue | support_needed
```

### 5.4 Migration 歷史

| # | 時間 | 說明 |
|---|------|------|
| 1 | 2026-02-11 08:53 | 初始 Schema（所有核心模型） |
| 2 | 2026-02-11 10:02 | Task 新增 durationWeeks 欄位 |
| 3 | 2026-02-11 11:09 | 新增 ProjectDraft 模型 |
| 4 | 2026-02-11 11:29 | User 新增 organization 欄位 |

---

## 6. API 設計

### 6.1 API 總覽

所有 API 路徑以 `/api/` 開頭，採 RESTful 風格設計，回應格式統一為 JSON。錯誤訊息以繁體中文呈現。

**統計**：24 個路由檔案，涵蓋約 36 個 HTTP 端點。

### 6.2 端點清單

#### 6.2.1 專案管理

| 方法 | 路徑 | 說明 |
|------|------|------|
| GET | `/api/projects` | 取得所有專案（含里程碑、任務、風險、團隊、日誌） |
| POST | `/api/projects` | 建立新專案（自動生成 projectCode） |
| GET | `/api/projects/[id]` | 取得單一專案（觸發 auto-sync） |
| PUT | `/api/projects/[id]` | 更新專案基本資訊 |
| DELETE | `/api/projects/[id]` | 刪除專案（CASCADE 刪除所有子資料） |

#### 6.2.2 里程碑管理

| 方法 | 路徑 | 說明 |
|------|------|------|
| POST | `/api/projects/[id]/milestones` | 新增里程碑（auto sortOrder） |
| PUT | `/api/projects/[id]/milestones/[milestoneId]` | 更新里程碑 |

#### 6.2.3 任務管理

| 方法 | 路徑 | 說明 |
|------|------|------|
| POST | `/api/projects/[id]/tasks` | 新增任務 |
| PUT | `/api/projects/[id]/tasks/[taskId]` | 更新任務 |

#### 6.2.4 工作日誌

| 方法 | 路徑 | 說明 |
|------|------|------|
| POST | `/api/projects/[id]/task-logs` | 新增日誌（觸發 syncTaskProgress + syncMilestoneStatus） |
| PUT | `/api/projects/[id]/task-logs/[logId]` | 更新日誌（觸發重新同步） |

#### 6.2.5 團隊管理

| 方法 | 路徑 | 說明 |
|------|------|------|
| POST | `/api/projects/[id]/team` | 新增團隊成員（支援 userId/email/name 解析） |
| PUT | `/api/projects/[id]/team/[memberId]` | 更新成員角色/職責 |

#### 6.2.6 風險管理

| 方法 | 路徑 | 說明 |
|------|------|------|
| POST | `/api/projects/[id]/risks` | 新增風險 |
| PUT | `/api/projects/[id]/risks/[riskId]` | 更新風險 |

#### 6.2.7 基線與相依性

| 方法 | 路徑 | 說明 |
|------|------|------|
| POST | `/api/projects/[id]/reset-baseline` | 建立里程碑基線快照 |
| POST | `/api/projects/[id]/rebuild-dependencies` | 重建順序相依性 |

#### 6.2.8 延期申請

| 方法 | 路徑 | 說明 |
|------|------|------|
| POST | `/api/delay-requests` | 提交延期申請 |
| PATCH | `/api/delay-requests/[id]/review` | 審核（approve/reject + 級聯更新） |

#### 6.2.9 草稿管理

| 方法 | 路徑 | 說明 |
|------|------|------|
| GET | `/api/drafts?email=xxx` | 取得使用者草稿列表 |
| POST | `/api/drafts` | 建立草稿 |
| PUT | `/api/drafts/[id]` | 更新草稿 |
| DELETE | `/api/drafts/[id]` | 刪除草稿 |

#### 6.2.10 使用者

| 方法 | 路徑 | 說明 |
|------|------|------|
| GET | `/api/users/search?q=xxx` | 搜尋使用者（name/email，limit 8） |
| GET | `/api/users/[id]` | 取得使用者資料 + 統計 |
| PUT | `/api/users/[id]` | 更新個人資料（name/email/organization） |

#### 6.2.11 儀表板與報告

| 方法 | 路徑 | 說明 |
|------|------|------|
| GET | `/api/dashboard?userId=x&role=y` | 儀表板資料（KPI、風險、里程碑、未更新） |
| GET | `/api/my-tasks?userId=x&userEmail=y` | 個人任務列表 |
| GET | `/api/reports` | 報告資料 |
| POST | `/api/reports` | 生成 PDF 報告 |
| POST | `/api/reports/pdf` | 生成 PDF 檔案 |

### 6.3 API 設計模式

#### 回應格式

```typescript
// 成功回應
NextResponse.json(data)                    // 200
NextResponse.json(data, { status: 201 })   // 201 Created

// 錯誤回應
NextResponse.json({ error: "錯誤訊息" }, { status: 400 })  // 400 Bad Request
NextResponse.json({ error: "找不到資源" }, { status: 404 })  // 404 Not Found
NextResponse.json({ error: "伺服器錯誤" }, { status: 500 })  // 500 Server Error
```

#### Auto-Sync 觸發點

以下 API 操作會自動觸發同步：

| API | 觸發同步 |
|-----|---------|
| GET `/api/projects/[id]` | syncTaskProgressFromLogs → syncMilestoneStatus |
| POST `/api/projects/[id]/task-logs` | syncTaskProgressFromLogs → syncMilestoneStatus |
| PUT `/api/projects/[id]/task-logs/[logId]` | syncTaskProgressFromLogs → syncMilestoneStatus |
| PATCH `/api/delay-requests/[id]/review` | 更新任務 endDate + reset-baseline（核准時） |

#### 批次儲存流程（工作項目編輯）

前端 `computeWorkItemsDiff()` 計算差異後，依序呼叫 6 步驟 API：

```mermaid
sequenceDiagram
    participant FE as Frontend
    participant API as API Routes
    participant DB as PostgreSQL

    Note over FE: computeWorkItemsDiff()
    FE->>API: Step 1: DELETE /tasks/[taskId]
    API->>DB: DELETE tasks
    FE->>API: Step 2: DELETE /milestones/[msId]
    API->>DB: DELETE milestones
    FE->>API: Step 3: POST /milestones
    API->>DB: INSERT milestones
    FE->>API: Step 4: PUT /milestones/[msId]
    API->>DB: UPDATE milestones
    FE->>API: Step 5: POST /tasks
    API->>DB: INSERT tasks
    FE->>API: Step 6: PUT /tasks/[taskId]
    API->>DB: UPDATE tasks
    Note over FE,DB: 順序重要：先刪再建，里程碑先於任務（FK 依賴）
```

---

## 7. 前端架構

### 7.1 Provider 堆疊

```tsx
// app/layout.tsx
<ThemeProvider>          // next-themes（深色/淺色模式）
  <AuthProvider>         // 驗證狀態（Mock Auth）
    <ProjectStoreProvider>  // 專案全域 Store
      <NotificationStoreProvider>  // 通知 Store
        {children}
        <Toaster />      // sonner（Toast）
      </NotificationStoreProvider>
    </ProjectStoreProvider>
  </AuthProvider>
</ThemeProvider>
```

### 7.2 頁面路由與權限

| 路由 | 頁面 | 可存取角色 | 描述 |
|------|------|-----------|------|
| `/login` | 登入 | 所有人 | Mock 驗證登入 |
| `/dashboard` | 儀表板 | PM, Executive | KPI 統計、風險、里程碑 |
| `/projects` | 專案列表 | 所有人 | 搜尋、篩選、建立專案 |
| `/projects/new` | 新建專案 | PM | 手動/AI 模式建立 |
| `/projects/[id]` | 專案詳情 | 所有人 | 甘特圖、相依分析、更新紀錄 |
| `/my-tasks` | 我的任務 | PM, Member | 任務清單、工作日誌、延期申請 |
| `/gantt` | 甘特圖 | 所有人 | 獨立甘特圖頁面 |
| `/reports` | 報告 | PM, Executive | 統計報表、PDF 匯出 |
| `/approvals` | 延期審核 | PM, Executive | 審核延期申請 |
| `/profile` | 個人資料 | 所有人 | 編輯個人資訊、查看統計 |
| `/settings` | 設定 | 所有人 | 通知偏好 |

### 7.3 核心元件設計

#### 7.3.1 DashboardLayout

主佈局元件，所有頁面（除 `/login`）皆被此元件包裹。

```mermaid
block-beta
  columns 5
  block:sidebar:1
    columns 1
    S1["儀表板"]
    S2["我的任務"]
    S3["專案看板"]
    S4["報告"]
    S5["審批中心"]
  end
  block:main:4
    columns 1
    block:header:1
      columns 3
      Breadcrumb["Breadcrumb"]
      Bell["Notification Bell"]
      UserMenu["User Menu"]
    end
    block:content:1
      PageContent["Page Content {children}"]
    end
  end
```

- 側邊欄可收合，狀態持久化至 localStorage
- 導覽項目依角色動態顯示（PM/Member/Executive 看到不同選項）
- Badge 即時顯示待審核數量與風險任務數

#### 7.3.2 TimelineTable（時間軸表格）

主要任務管理元件，嵌入 ProjectEditDialog 的「工作項目」分頁。

```mermaid
graph TD
    subgraph TimelineTable["TimelineTable"]
        subgraph MSA["☰ 里程碑 A (到期: 2026/3/15) [+任務]"]
            T1["☰ 任務 1 | 張三 | 2/15-3/1 | 進行中 | 60%"]
            T2["☰ 任務 2 | 李四 | 3/1-3/10 | 待開始 | 0%"]
            T3["☰ 任務 3 | 王五 | 3/10-3/15 | 待開始 | 0%"]
        end
        subgraph MSB["☰ 里程碑 B (到期: 2026/4/30) [+任務]"]
            T4["☰ 任務 4 | 張三 | 3/15-4/30 | 待開始 | 0%"]
        end
        AddMS["[+里程碑]"]
    end
```

- `☰` = 拖放手柄（@dnd-kit/sortable）
- 所有欄位支援 inline 編輯
- 變更在本地 state 累積，批次儲存

#### 7.3.3 GanttChart（甘特圖）

自建元件，非第三方套件。

```mermaid
gantt
    title 甘特圖示意
    dateFormat  YYYY-MM-DD
    axisFormat  %m/%d

    section 里程碑 A
    Task 1 (張三)     :active, t1, 2026-02-15, 2026-03-01
    Task 2 (李四)     :t2, 2026-03-01, 2026-03-10
    Task 3 (王五)     :t3, 2026-03-10, 2026-03-15

    section 里程碑 B
    Task 4 (張三)     :t4, 2026-03-15, 2026-04-30
```

- 支援 5 種時間尺度：日 / 週 / 月 / 季 / 年
- 相依關係箭頭透過 GanttDependencyOverlay SVG 疊加
- 基線以淡黃色底線顯示比較
- 逾期未開始任務以橘色標示

#### 7.3.4 ProjectEditDialog（專案編輯對話框）

5 個分頁的完整專案編輯介面。

| 分頁 | 內容 |
|------|------|
| **基本資訊** | 名稱、類型、層別、需求來源、目標、SMART 目標 |
| **專案說明** | 目的、範圍、ROI、開案原因、預期效益 |
| **團隊成員** | TeamMemberTable + TeamMemberAutocomplete |
| **風險管理** | 風險列表、新增/編輯/關閉 |
| **工作項目** | TimelineTable（里程碑 + 任務） |

#### 7.3.5 TaskDetailSheet（任務詳情抽屜）

從右側滑入的任務詳情面板。

| 區塊 | 內容 |
|------|------|
| Header | 任務名稱 + 狀態圓點 |
| 基本資訊 | 指派人、優先級、日期、進度條 |
| 相依分析 | 前置/後續任務列表、影響範圍 |
| 工作日誌 | 日誌列表、新增日誌表單 |

---

## 8. 核心業務邏輯

### 8.1 專案健康度自動計算

**檔案**：`lib/project-transformer.ts`

```mermaid
flowchart TD
    Start["輸入：專案所有任務"] --> CalcOverdue["計算逾期比例<br/>overdueRate = (endDate < today && status ≠ done) / total"]
    CalcOverdue --> CalcBlocked["計算受阻比例<br/>blockedRate = (status == blocked) / total"]
    CalcBlocked --> CheckRed1{"overdueRate > 30%?"}
    CheckRed1 -- Yes --> Red["🔴 RED"]
    CheckRed1 -- No --> CheckRed2{"blockedRate > 20%?"}
    CheckRed2 -- Yes --> Red
    CheckRed2 -- No --> CheckRed3{"專案已過 endDate<br/>且有未完成任務?"}
    CheckRed3 -- Yes --> Red
    CheckRed3 -- No --> CheckYellow{"有任何逾期<br/>或受阻任務?"}
    CheckYellow -- Yes --> Yellow["🟡 YELLOW"]
    CheckYellow -- No --> Green["🟢 GREEN"]

    style Red fill:#ef4444,color:#fff
    style Yellow fill:#eab308,color:#fff
    style Green fill:#22c55e,color:#fff
```

**專案進度** = 所有任務 progress 的平均值

### 8.2 里程碑狀態同步

**檔案**：`lib/sync-milestone-status.ts`

#### syncMilestoneStatus(milestoneId, projectId)

```mermaid
flowchart TD
    Start["查詢里程碑下所有 Task"] --> AllDone{"全部 done?"}
    AllDone -- Yes --> Done["status = done"]
    AllDone -- No --> AnyBlocked{"有任何 blocked?"}
    AnyBlocked -- Yes --> Blocked["status = blocked"]
    AnyBlocked -- No --> AllTodo{"全部 todo?"}
    AllTodo -- Yes --> Todo["status = todo"]
    AllTodo -- No --> InProgress["status = in_progress"]

    Done --> CalcProgress["progress = avg(tasks.progress)"]
    Blocked --> CalcProgress
    Todo --> CalcProgress
    InProgress --> CalcProgress
    CalcProgress --> Save["UPDATE milestone SET status, progress"]
```

#### autoProgressTasks(tasks, taskLogs)

```mermaid
flowchart TD
    Start["遍歷每個任務"] --> CheckStarted{"startDate 已過?"}
    CheckStarted -- No --> CheckFuture{"progress=0<br/>且非完成?"}
    CheckFuture -- Yes --> SetTodo["status = todo"]
    CheckFuture -- No --> Skip["不處理"]

    CheckStarted -- Yes --> CheckDeps{"所有前置任務 done?"}
    CheckDeps -- Yes --> SetIP1["status = in_progress"]
    CheckDeps -- No --> CheckLogs{"有工作日誌?"}
    CheckLogs -- Yes --> SetIP2["status = in_progress<br/>(準備工作)"]
    CheckLogs -- No --> SetBlocked["status = blocked"]

    Start --> CheckUnblock{"原本 blocked<br/>且前置全部 done?"}
    CheckUnblock -- Yes --> SetIP3["status = in_progress"]
```

#### syncTaskProgressFromLogs(tasks, taskLogs)

```mermaid
flowchart LR
    Logs["收集 TaskLogs"] --> Unique["計算 uniqueLogDates"]
    Unique --> Duration["計算 taskDurationDays<br/>(endDate - startDate)"]
    Duration --> Calc["progress = uniqueLogDates / taskDurationDays × 100"]
    Calc --> Cap{"> 100?"}
    Cap -- Yes --> Set100["progress = 100"]
    Cap -- No --> SetVal["progress = 計算值"]
    Set100 --> Done{"任務已完成?"}
    SetVal --> Done
    Done -- Yes --> Force100["強制 progress = 100"]
```

### 8.3 任務相依圖與關鍵路徑

**檔案**：`lib/dependency-graph.ts`

#### buildDepGraph(project)

```mermaid
flowchart TD
    A["建構 DepNode Map<br/>(taskId → DepNode)"] --> B["填入 prerequisites / dependents 關係"]
    B --> C["BFS 從根節點（無前置）<br/>計算各節點 depth"]
    C --> D["找出最長路徑 = 關鍵路徑"]
    D --> E["標記 isOnCriticalPath = true"]
    E --> F["回傳 Map&lt;string, DepNode&gt;"]
```

#### computeImpact(taskId, nodeMap)

```mermaid
flowchart LR
    Start["指定任務"] --> BFS["下游 BFS 遍歷"]
    BFS --> Direct["directlyBlocked<br/>直接依賴的任務"]
    BFS --> Indirect["indirectlyAffected<br/>間接受影響任務"]
    BFS --> Milestones["affectedMilestones<br/>受影響的里程碑"]
    BFS --> Chain["totalDelayChain<br/>延遲鏈總長度"]
```

### 8.4 自動風險偵測

**檔案**：`lib/risk-utils.ts`

系統自動偵測 6 類風險：

| 風險類型 | 偵測條件 | 嚴重度 |
|---------|---------|--------|
| **逾期任務** | endDate < today && status ≠ done | >14 天: high, 7-14: medium, <7: low |
| **受阻鏈** | startDate 已過但前置未完成 | medium |
| **待審延期** | DelayRequest status == pending | >3 天: high, 否則: medium |
| **無近期更新** | in_progress 但 7+ 天無 TaskLog | medium |
| **里程碑延遲** | dueDate < today && status ≠ done | >14 天: high, 否則: medium |
| **待解決協助** | 已核准延期但 supportResolved == false | high |

### 8.5 專案代碼自動生成

**檔案**：`app/api/projects/route.ts`

```mermaid
sequenceDiagram
    participant API as POST /api/projects
    participant DB as ProjectCodeSequence

    Note over API: 格式：{TYPE}-{YEAR}-{SEQ}<br/>範例：NPI-2026-001
    API->>DB: 查詢 (projectType, year)
    alt 不存在
        DB-->>API: null
        API->>DB: 建立紀錄 lastSeq = 1
    else 存在
        DB-->>API: lastSeq = N
        API->>DB: UPDATE lastSeq = N + 1
    end
    Note over API: 格式化：TYPE + "-" + YEAR + "-" + padStart(seq, 3, "0")
```

### 8.6 批次儲存差異計算

**檔案**：`lib/timeline-utils.ts`

`computeWorkItemsDiff(original, current)` 比較兩個版本的里程碑+任務狀態，產出：

```typescript
interface WorkItemsDiff {
  milestones: {
    added: TimelineMilestone[]      // 新增的里程碑
    updated: TimelineMilestone[]    // 有變更的里程碑
    deleted: string[]               // 被刪除的里程碑 ID
  }
  tasks: {
    added: TimelineTask[]           // 新增的任務
    updated: TimelineTask[]         // 有變更的任務
    deleted: string[]               // 被刪除的任務 ID
  }
}
```

偵測變更的欄位：name, dueDate, sortOrder（里程碑）；title, assignee, priority, durationWeeks, milestoneId, sortOrder（任務）。

### 8.7 里程碑範本系統

**檔案**：`lib/milestone-templates.ts`

每種 ProjectType 對應預設里程碑範本：

| 專案類型 | 里程碑數量 | 範例 |
|---------|-----------|------|
| NPI | 6 | 需求分析 → 設計 → 試作 → 驗證 → 試產 → 量產 |
| Cost Optimization | 5 | 成本分析 → 方案設計 → 實施 → 驗證 → 持續追蹤 |
| Quality Improvement | 5 | 問題分析 → 改善方案 → 實施 → 驗證 → 標準化 |
| Automation | 5 | 流程分析 → 系統設計 → 開發 → 測試 → 上線教育 |
| Product Strategy | 5 | 市場調查 → 策略規劃 → 執行 → 檢討 → 評估 |
| Process Optimization | 5 | 分析 → 設計 → 實施 → 驗證 → 標準化 |
| External Requirement | 5 | 需求確認 → 影響評估 → 實施 → 驗證 → 移交 |

---

## 9. 驗證與權限機制

### 9.1 驗證機制（Mock Auth）

**檔案**：`lib/auth-context.tsx`

目前使用 Mock 驗證，不含真實身分驗證：

**預設使用者：**

| 姓名 | Email | 角色 |
|------|-------|------|
| Alice Chen | alice@example.com | PM |
| Bob Wang | bob@example.com | Member |
| Carol Lee | carol@example.com | Executive |

```mermaid
sequenceDiagram
    actor User
    participant Login as Login Page
    participant Auth as AuthContext
    participant DB as PostgreSQL
    participant LS as localStorage

    Note over User,LS: 登入流程
    User->>Login: 輸入 email + 密碼 ("demo")
    Login->>Auth: login(email, password)
    Auth->>Auth: 比對 MOCK_USERS 清單
    Auth->>DB: GET /api/users/search?q=email
    DB-->>Auth: user.id (CUID)
    Auth->>LS: 存入 currentUser
    Auth-->>Login: user state 更新
    Login-->>User: 導向 Dashboard / MyTasks

    Note over User,LS: 登出流程
    User->>Auth: logout()
    Auth->>LS: 清除 currentUser
    Auth-->>User: 導向 /login
```

### 9.2 權限矩陣

**檔案**：`lib/permissions.ts`

| 權限 | PM | Executive | Member |
|------|:---:|:---------:|:------:|
| canCreateProject | ✓ | ✗ | ✗ |
| canEditProject | ✓ | ✗ | ✗ |
| canDeleteProject | ✓ | ✗ | ✗ |
| canViewBudget | ✓ | ✓ | ✗ |
| canEditBudget | ✓ | ✗ | ✗ |
| canManageTeam | ✓ | ✗ | ✗ |
| canViewAllProjects | ✓ | ✓ | ✗ |
| canExportReports | ✓ | ✓ | ✗ |
| canManageRisks | ✓ | ✗ | ✗ |
| canViewGantt | ✓ | ✓ | ✓ |

### 9.3 專案可見性

```mermaid
flowchart TD
    Start["canUserAccessProject(userId, userName, role, project)"] --> CheckRole{"role = PM<br/>or Executive?"}
    CheckRole -- Yes --> Allow["✅ 允許存取<br/>（所有專案）"]
    CheckRole -- No --> CheckOwner{"project.owner.id<br/>== userId?"}
    CheckOwner -- Yes --> Allow
    CheckOwner -- No --> CheckTeam{"project.teamMembers<br/>包含 userId?"}
    CheckTeam -- Yes --> Allow
    CheckTeam -- No --> CheckAssignee{"project.tasks 中<br/>assignee == userName?"}
    CheckAssignee -- Yes --> Allow
    CheckAssignee -- No --> Deny["❌ 拒絕存取"]
```

### 9.4 已知限制

- **無 API 層面的權限檢查**：API Routes 不驗證呼叫者身分，任何知道端點的人皆可存取。
- **無 Session/Token 機制**：完全依賴前端 localStorage 判斷登入狀態。
- **無密碼雜湊**：統一密碼 "demo"，無加密。
- **角色切換**：前端提供 `switchRole()` 函式，可任意切換角色（僅供開發測試）。

---

## 10. 狀態管理

### 10.1 全域 Context 一覽

| Context | 檔案 | 持久化 | 用途 |
|---------|------|--------|------|
| AuthProvider | auth-context.tsx | localStorage('currentUser') | 登入狀態、使用者資訊 |
| ProjectStoreProvider | project-store.tsx | localStorage('pm-system-projects') | 專案備援（逐步遷移至 API） |
| NotificationStoreProvider | notification-store.tsx | localStorage('notification-store-v2') | 通知列表、未讀數 |

### 10.2 資料流模式

目前系統處於 **localStorage → API 遷移過渡期**，兩種資料流並存：

**已遷移至 API 的頁面**（主流）：
```
Page mount → fetch('/api/...') → setState → render
User action → fetch('/api/...', {method}) → refetch → re-render
```

**仍使用 localStorage 的功能**：
```
Page mount → useProjectStore() → 讀取 localStorage → render
User action → store.method() → 更新 localStorage → re-render
```

### 10.3 已遷移 vs 待遷移

| 頁面/功能 | 資料來源 |
|-----------|---------|
| 儀表板 | ✅ API (`/api/dashboard`) |
| 專案列表 | ✅ API (`/api/projects`) |
| 專案詳情 | ✅ API (`/api/projects/[id]`) |
| 新建專案 | ✅ API (`POST /api/projects`) |
| 我的任務 | ✅ API (`/api/my-tasks`) |
| 報告 | ✅ API (`/api/reports`) |
| 延期審核 | ✅ API (`/api/delay-requests`) |
| 個人資料 | ✅ API (`/api/users/[id]`) |
| 通知偏好 | localStorage（notification-store） |
| 側邊欄收合 | localStorage（sidebar key） |

---

## 11. 部署架構

### 11.1 開發環境

```
npm run dev         → Next.js dev server (port 12039)
npm run db:up       → docker compose up -d (PostgreSQL)
npm run db:migrate  → prisma migrate dev
npm run db:seed     → tsx prisma/seed.ts
npm run db:studio   → prisma studio (DB GUI)
```

### 11.2 環境變數

| 變數 | 用途 | 範例 |
|------|------|------|
| DATABASE_URL | PostgreSQL 連線字串 | postgresql://user:pass@localhost:5432/db |

### 11.3 建置流程

```
npm run build       → next build (Static Generation + SSR)
npm run start       → next start (Production server)
```

### 11.4 Docker Compose（資料庫）

```yaml
services:
  postgres:
    image: postgres:15
    ports: ["5432:5432"]
    volumes: [pgdata:/var/lib/postgresql/data]
    environment:
      POSTGRES_USER: ...
      POSTGRES_PASSWORD: ...
      POSTGRES_DB: ...
```

### 11.5 正式部署（待定）

正式部署方案尚未確定。可能選項：
- Vercel（Next.js 原生支援）+ 外部 PostgreSQL（如 Supabase、Neon）
- 自建 Docker（Next.js + PostgreSQL 同機）
- 公司內部伺服器

---

## 附錄

### A. Enum 前後端格式對照

系統使用 hyphen-case（前端）與 underscore_case（DB）兩種格式，透過 `lib/enum-mappers.ts` 轉換：

| 前端值 | DB 值 |
|--------|-------|
| in-progress | in_progress |
| cost-optimization | cost_optimization |
| quality-improvement | quality_improvement |
| company-policy | company_policy |
| task-assigned | task_assigned |

### B. 專案代碼類型對照

| ProjectType | 代碼前綴 |
|------------|---------|
| npi | NPI |
| cost_optimization | CO |
| quality_improvement | QI |
| automation | AUTO |
| product_strategy | PS |
| process_optimization | PO |
| external_requirement | ER |

### C. npm scripts

| 指令 | 說明 |
|------|------|
| `dev` | 啟動開發伺服器 (port 12039) |
| `build` | 生產環境建置 |
| `start` | 啟動生產伺服器 |
| `lint` | ESLint 檢查 |
| `db:up` | 啟動 PostgreSQL 容器 |
| `db:down` | 關閉 PostgreSQL 容器 |
| `db:migrate` | 執行資料庫 Migration |
| `db:seed` | 執行種子資料 |
| `db:studio` | 開啟 Prisma Studio |
| `db:reset` | 重置資料庫 |

---

**文件版本**：v1.0
**建立時間**：2026/2/13
**對應 PRD 版本**：v2.0
