# SDD 系統設計文件

# System Design Document

**專案名稱：** 專案管理系統 (Project Management System)
**版本：** 1.0
**日期：** 2026-05-29
**技術堆疊：** Next.js 15 / TypeScript / Prisma ORM / MySQL (MariaDB)

---

## 目錄

1. [系統概述](#1-系統概述)
2. [架構設計](#2-架構設計)
3. [資料庫設計](#3-資料庫設計)
4. [模組設計](#4-模組設計)
5. [API 設計](#5-api-設計)
6. [前端架構設計](#6-前端架構設計)
7. [認證與授權設計](#7-認證與授權設計)
8. [排程與自動化設計](#8-排程與自動化設計)
9. [整合設計](#9-整合設計)
10. [部署架構](#10-部署架構)
11. [安全性設計](#11-安全性設計)
12. [效能設計](#12-效能設計)

---

## 1. 系統概述

### 1.1 系統目的

本系統為企業級專案管理平台，用於管理多階段複雜專案，涵蓋時程追蹤、里程碑管理、任務分配、風險管理、預算控制、延遲審批、週報機制及主管儀表板。

### 1.2 系統範圍

| 功能範圍 | 說明 |
|---------|------|
| 專案生命週期管理 | 建立、追蹤、更新、關閉專案 |
| 里程碑與任務管理 | 階層式任務、依賴關係、進度自動同步 |
| 延遲申請審批 | 多人審核、里程碑日期自動更新 |
| 週報與進度追蹤 | PM 週報、成員週報、排程提醒 |
| 通知系統 | 站內通知、Email 通知、自動提醒 |
| 預算與 CAPEX | 設備採購追蹤、付款進度管理 |
| 風險管理 | 風險登記、影響評估、緩解追蹤 |
| 報表與匯出 | PDF/Excel 報表、Email 分發 |
| 管理員後台 | 使用者管理、系統設定、排程監控 |

### 1.3 技術架構摘要

```
┌──────────────────────────────────────────────────────────────┐
│                        Client (Browser)                       │
│  ┌─────────┐ ┌──────────┐ ┌─────────┐ ┌─────────────────┐  │
│  │ React 19│ │ Tailwind │ │ Recharts│ │ Radix UI / shadcn│  │
│  └─────────┘ └──────────┘ └─────────┘ └─────────────────┘  │
│            ↕ HTTP (REST API)                                  │
├──────────────────────────────────────────────────────────────┤
│                   Next.js 15 (App Router)                     │
│  ┌─────────────────┐  ┌────────────────┐  ┌──────────────┐  │
│  │ Server Components│  │ API Routes     │  │ Middleware    │  │
│  │ (SSR/RSC)       │  │ (REST handlers)│  │ (Auth check) │  │
│  └────────┬────────┘  └───────┬────────┘  └──────────────┘  │
│           │                   │                               │
│  ┌────────▼───────────────────▼────────┐                     │
│  │         Prisma ORM (7.3)            │                     │
│  │   ┌─────────────────────────────┐   │                     │
│  │   │  @prisma/adapter-mariadb    │   │                     │
│  │   └─────────────────────────────┘   │                     │
│  └─────────────────┬───────────────────┘                     │
│                    │                                          │
├────────────────────┼──────────────────────────────────────────┤
│              ┌─────▼─────┐  ┌───────────┐  ┌─────────────┐  │
│              │ MySQL 8.0 │  │ AD API    │  │ AI Services │  │
│              │ (MariaDB) │  │ (LDAP)    │  │ (OpenAI/    │  │
│              │           │  │           │  │  DeepSeek)  │  │
│              └───────────┘  └───────────┘  └─────────────┘  │
│                  Infrastructure Layer                         │
└──────────────────────────────────────────────────────────────┘
```

---

## 2. 架構設計

### 2.1 系統架構模式

本系統採用 **Next.js Fullstack Monolith** 架構模式：

- **前端：** React 19 + Next.js App Router (Server/Client Components)
- **後端：** Next.js API Routes (RESTful)
- **資料層：** Prisma ORM + MySQL

### 2.2 分層架構

```
Layer 1: Presentation (展示層)
├── Pages (app/*.tsx)           — 路由頁面
├── Components (components/*.tsx) — 可重用元件
├── Layouts (dashboard-layout.tsx) — 頁面框架
└── Styles (Tailwind CSS)        — 樣式

Layer 2: Application (應用層)
├── API Routes (app/api/**)      — HTTP 端點
├── Contexts (lib/*-context.tsx) — 全域狀態
└── Hooks (hooks/*.ts)           — 自訂 Hooks

Layer 3: Domain (業務層)
├── Permissions (lib/permissions.ts)       — 權限控制
├── Task Sync (lib/sync-milestone-status.ts) — 狀態同步
├── Notifications (lib/notifications.ts)    — 通知邏輯
├── Code Gen (lib/code-prefix.ts)           — 編碼生成
└── Dependency Graph (lib/dependency-graph.ts) — 依賴分析

Layer 4: Infrastructure (基礎設施層)
├── Database (prisma/schema.prisma)   — 資料模型
├── ORM (lib/prisma.ts)              — DB 連線
├── Email (lib/send-mail.ts)         — 郵件發送
├── Cron (instrumentation.ts)        — 排程任務
└── External APIs (AD, AI)           — 外部整合
```

### 2.3 資料流架構

```
使用者操作
    │
    ▼
React Component (Client)
    │ fetch() / useEffect
    ▼
Next.js API Route (Server)
    │ Prisma query
    ▼
MySQL Database
    │ response data
    ▼
API Route → JSON Response
    │
    ▼
React Component → UI Update
```

### 2.4 狀態管理架構

```
┌─────────────────────────────────────────┐
│              React App                    │
│                                           │
│  ┌───────────────────────────────────┐   │
│  │  AuthContext (認證狀態)            │   │
│  │  ├── user: User | null            │   │
│  │  ├── login() / logout()           │   │
│  │  └── DB role sync                 │   │
│  └───────────────────────────────────┘   │
│                                           │
│  ┌───────────────────────────────────┐   │
│  │  NotificationStoreContext         │   │
│  │  ├── notifications: Notification[]│   │
│  │  ├── unreadCount: number          │   │
│  │  ├── 20s polling interval         │   │
│  │  └── markAsRead() / clearAll()    │   │
│  └───────────────────────────────────┘   │
│                                           │
│  ┌───────────────────────────────────┐   │
│  │  ProjectStoreContext (Legacy)      │   │
│  │  ├── projects: Project[]          │   │
│  │  ├── localStorage persistence     │   │
│  │  └── fallback when DB unavailable │   │
│  └───────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

---

## 3. 資料庫設計

### 3.1 ER 圖 (Entity-Relationship Diagram)

```
┌──────────┐     ┌──────────────────┐     ┌────────────┐
│   User   │1───*│ProjectTeamMember │*───1│  Project    │
│          │     │  (RACIPS role)   │     │            │
│ id       │     └──────────────────┘     │ id         │
│ name     │                               │ projectCode│
│ email    │1──────────────────────────*│ name       │
│ role     │     (owner)                   │ projectType│
│ isActive │                               │ projectTier│
└──┬───────┘                               │ status     │
   │                                       │ progress   │
   │1                                      │ budget     │
   │                                       └──┬─────────┘
   │                                          │1
   │                                          │
   │    ┌─────────────┐                      │*
   │    │  Milestone   │*─────────────────1──┘
   │    │ id           │
   │    │ name         │1
   │    │ dueDate      │ │
   │    │ status       │ │*
   │    │ progress     │ ┌──────────┐
   │    └──────────────┘ │  Task    │
   │                      │ id       │
   │                      │ title    │
   │*                     │ assignee │
┌──▼───────────┐         │ status   │
│ Notification  │         │ priority │
│ id            │         │ progress │
│ type          │         │ parentId │◄──┐ (self-ref)
│ title         │         └────┬─────┘   │
│ message       │              │*         │
│ read          │         ┌────▼──────┐   │
└───────────────┘         │TaskDepen- │   │
                          │dency      │   │
   ┌───────────────┐      │dependent  │   │
   │ DelayRequest   │      │prerequisite│  │
   │ id             │      └───────────┘   │
   │ reason         │                      │
   │ type           │      ┌──────────┐    │
   │ status         │      │ TaskLog  │    │
   │ canCatchUp     │      │ id       │    │
   │ supportNeeded  │      │ content  │    │
   │ requiredReview │      │ nextPlans│    │
   └───┬───────────┘      │attachments│   │
       │*                  └──────────┘    │
  ┌────▼──────────────┐                    │
  │AffectedMilestone  │                    │
  │ originalDate      │                    │
  │ proposedDate      │                    │
  └───────────────────┘                    │
                                           │
  ┌───────────────────┐   ┌──────────────┐│
  │ Risk              │   │ WeeklyUpdate ││
  │ impact/probability│   │ overallStatus││
  │ mitigation/status │   │ blockers     ││
  └───────────────────┘   │ nextWeekPlan ││
                          └──────────────┘│
  ┌───────────────────┐                   │
  │ProjectBudgetItem  │   ┌─────────────┐│
  │ station/vendor    │   │CapexItem    ││
  │ equipment/cost    │   │ PO/part no  ││
  └───────────────────┘   │ payments    ││
                          └─────────────┘│
```

### 3.2 資料模型詳細設計

#### 核心模型

| 模型 | 表名 | 主鍵 | 重要欄位 | 索引 |
|------|------|------|---------|------|
| User | users | id (CUID) | email (unique), role (enum), isActive | email |
| Project | projects | id (CUID) | projectCode (unique), ownerId (FK) | projectCode, ownerId |
| ProjectTeamMember | project_team_members | id | projectId+userId (unique), role (RACIPS) | [projectId, userId] |
| Milestone | milestones | id | projectId (FK), status, sortOrder | projectId |
| Task | tasks | id | milestoneId (FK), assignee, status, parentId (self-ref) | milestoneId, assignee |
| TaskDependency | task_dependencies | composite | dependentId + prerequisiteId | [dependentId, prerequisiteId] |

#### 業務模型

| 模型 | 表名 | 主鍵 | 重要欄位 | 索引 |
|------|------|------|---------|------|
| DelayRequest | delay_requests | id | projectId, status, requiredReviewers | projectId, status |
| DelayReviewDecision | delay_review_decisions | id | delayRequestId+reviewerId (unique) | [delayRequestId, reviewerId] |
| AffectedMilestone | affected_milestones | id | delayRequestId, milestoneId | delayRequestId |
| WeeklyUpdate | weekly_updates | id | projectId, weekOf | [projectId, weekOf] |
| MilestoneUpdate | milestone_updates | id | weeklyUpdateId, milestoneId | weeklyUpdateId |
| MemberWeeklyReport | member_weekly_reports | id | projectId+milestoneId+userId+weekOf (unique) | composite |
| TaskLog | task_logs | id | taskId, projectId, logDate | taskId |
| Risk | risks | id | projectId, status | projectId |

#### 系統模型

| 模型 | 表名 | 主鍵 | 重要欄位 |
|------|------|------|---------|
| Notification | notifications | id | userId, type, read |
| SystemSetting | system_settings | key | value (JSON Text) |
| NotificationProfile | notification_profiles | id | projectTier (unique), schedule |
| MilestoneTemplateConfig | milestone_template_configs | id | projectType, tasks |
| ProjectTypeConfig | project_type_configs | key | label, codePrefix, isActive |
| ProjectCodeSequence | project_code_sequences | id | projectType+year (unique), lastSeq |
| CronJobLog | cron_job_logs | id | jobType, status, runAt |
| ShareLink | share_links | id | token (unique), projectId |
| ProjectDraft | project_drafts | id | userId, data (JSON) |
| ProjectBudgetItem | project_budget_items | id | projectId, sortOrder |
| CapexItem | capex_items | id | projectId, budgetItemId |

### 3.3 列舉型別 (Enums)

```sql
-- User Roles
enum UserRole { pm, member, executive, admin }

-- Team Member Roles (RACIPS)
enum TeamRole { R, A, C, I, P, S }
  -- R = Responsible (負責執行)
  -- A = Accountable (當責)
  -- C = Consulted (諮詢)
  -- I = Informed (知會)
  -- P = Procurer (採購)
  -- S = Sign-off (審核簽核)

-- Project Status (Traffic Light)
enum ProjectStatus { green, yellow, red }

-- Project Tier
enum ProjectTier { T1, T2, T3, CIP }

-- Demand Source
enum DemandSource { company_policy, external_requirement, internal_demand, self_proposal }

-- Task Status
enum TaskStatus { todo, in_progress, done, blocked }

-- Priority
enum Priority { low, medium, high }

-- Risk Impact & Probability
enum RiskImpact { low, medium, high }
enum RiskProbability { low, medium, high }
enum RiskStatus { open, mitigated, closed }

-- Delay Request
enum DelayRequestType { delay, date_change }
enum DelayRequestStatus { pending, approved, rejected }

-- Weekly Update
enum WeeklyUpdateStatus { on_time, delay }

-- Notification Type
enum NotificationType {
  task_assigned, delay_submitted, delay_approved, delay_rejected,
  task_overdue, support_needed, weekly_upload_missing, weekly_report_ready
}
```

### 3.4 資料庫約束

```
Unique Constraints:
  - User.email
  - Project.projectCode
  - ProjectTeamMember.[projectId, userId]
  - ProjectCodeSequence.[projectType, year]
  - NotificationProfile.projectTier
  - DelayReviewDecision.[delayRequestId, reviewerId]
  - MemberWeeklyReport.[projectId, milestoneId, userId, weekOf]
  - ShareLink.token

Foreign Key Relations:
  - Project.ownerId → User.id
  - ProjectTeamMember.projectId → Project.id (CASCADE delete)
  - ProjectTeamMember.userId → User.id (CASCADE delete)
  - Milestone.projectId → Project.id (CASCADE delete)
  - Task.milestoneId → Milestone.id (CASCADE delete)
  - Task.projectId → Project.id (CASCADE delete)
  - Task.parentId → Task.id (self-ref, SET NULL)
  - TaskDependency → Task (CASCADE delete)
  - DelayRequest.projectId → Project.id (CASCADE delete)
  - Notification.userId → User.id (CASCADE delete)
```

---

## 4. 模組設計

### 4.1 認證模組

```
Module: Authentication
├── Components
│   ├── LoginPage (app/login/page.tsx)
│   └── AuthProvider (lib/auth-context.tsx)
├── API
│   └── POST /api/auth/login
├── Logic
│   ├── AD Authentication (primary)
│   ├── Mock User Authentication (fallback)
│   └── DB Role Synchronization
└── State
    └── AuthContext { user, login(), logout(), loading }
```

**認證流程序列圖：**

```
User        LoginPage      API/login      AD API        DB (Prisma)
 │   submit    │              │              │              │
 │ ──────────> │              │              │              │
 │             │  POST /login │              │              │
 │             │ ───────────> │              │              │
 │             │              │  auth check  │              │
 │             │              │ ───────────> │              │
 │             │              │  (fail/ok)   │              │
 │             │              │ <─────────── │              │
 │             │              │                             │
 │             │              │  If AD fail → mock check    │
 │             │              │                             │
 │             │              │  find/create user           │
 │             │              │ ───────────────────────────>│
 │             │              │  user + role                │
 │             │              │ <───────────────────────────│
 │             │  200 { user }│                             │
 │             │ <─────────── │                             │
 │  redirect   │              │                             │
 │ <────────── │              │                             │
 │ /dashboard  │              │                             │
```

### 4.2 專案管理模組

```
Module: Project Management
├── Pages
│   ├── /projects (List + Search)
│   ├── /projects/new (Create Wizard)
│   ├── /projects/[id] (Detail + 9 Tabs)
│   └── /projects/[id]/update (Edit)
├── API
│   ├── GET/POST /api/projects
│   ├── GET/PUT/DELETE /api/projects/[id]
│   ├── GET/PUT /api/projects/[id]/budget-items
│   └── GET /api/milestone-templates/[type]
├── Components
│   ├── ProjectEditDialog
│   ├── ProjectRiskTab
│   ├── ProjectDelayTab
│   ├── TimelineTable
│   └── CapexTable
└── Logic
    ├── Auto-generate project code
    ├── Milestone template loading
    ├── Progress calculation
    └── Status color computation
```

**專案狀態機：**

```
                   ┌──────────┐
       建立 ──────>│  Green   │
                   │ (正常)   │
                   └────┬─────┘
                        │ 有逾期或阻塞任務
                        ▼
                   ┌──────────┐
                   │  Yellow  │
                   │ (注意)   │
                   └────┬─────┘
                        │ >30% 逾期 或 >20% 阻塞
                        ▼
                   ┌──────────┐
                   │   Red    │
                   │ (警告)   │
                   └──────────┘

狀態計算邏輯：
  Green  → 所有任務正常
  Yellow → overdue < 30% AND blocked < 20%
  Red    → overdue ≥ 30% OR blocked ≥ 20% OR 超過結束日仍未完成
```

### 4.3 任務同步模組

```
Module: Task & Milestone Sync
├── Core Functions
│   ├── syncMilestoneStatus() — 從任務更新里程碑狀態
│   ├── computeMilestoneStatus() — 計算里程碑狀態
│   ├── autoProgressTasks() — 自動推進任務狀態
│   └── syncTaskProgressFromLogs() — 從日誌同步進度
├── Computation Rules
│   ├── Milestone Progress = Σ(task.progress × task.durationDays) / Σ(durationDays)
│   ├── Task auto-start: startDate ≤ today → in_progress
│   ├── Task auto-block: dependency not done → blocked
│   └── Task progress from logs: hasLogs && status=todo → in_progress
└── Trigger Points
    ├── GET /api/my-tasks (on every load)
    ├── Task status change
    └── Cron interval
```

### 4.4 延遲申請模組

```
Module: Delay Request Workflow
├── States: pending → approved | rejected
├── Roles:
│   ├── Requester: PM / Team Member (submit)
│   └── Reviewer: S-role Team Members (approve/reject)
├── Rules:
│   ├── Single rejection → immediately rejected
│   ├── All approvals required → approved
│   ├── requiredReviewers = count(S-role members)
│   └── Approved → auto-update milestone dates
└── Notifications:
    ├── Submit → notify all S-role reviewers
    ├── Approve → notify requester
    ├── Reject → notify requester
    └── Support needed → notify executives
```

**延遲申請狀態機：**

```
                   ┌──────────┐
      提交 ──────> │ Pending  │
                   └────┬─────┘
                        │
              ┌─────────┼─────────┐
              │         │         │
         全數通過    部分通過   任一駁回
              │     (等待中)      │
              ▼                   ▼
        ┌──────────┐       ┌──────────┐
        │ Approved │       │ Rejected │
        │ (核准)   │       │ (駁回)   │
        └────┬─────┘       └──────────┘
             │
    更新里程碑日期
    通知申請者
```

### 4.5 通知模組

```
Module: Notification System
├── Storage: Database (Notification model)
├── Delivery Channels:
│   ├── In-App: DB + 20s polling
│   └── Email: AD Mail API
├── Notification Types:
│   ├── task_assigned — 任務指派
│   ├── delay_submitted — 延遲申請提交
│   ├── delay_approved — 延遲核准
│   ├── delay_rejected — 延遲駁回
│   ├── task_overdue — 任務/里程碑逾期
│   ├── support_needed — 支援需求
│   ├── weekly_upload_missing — 週報缺繳提醒
│   └── weekly_report_ready — 週報產生完成
├── Frontend State: NotificationStoreContext
│   ├── 20s interval polling
│   ├── Unread count badge
│   └── Mark read / Clear all
└── Server Logic: lib/notifications.ts
    ├── createNotification()
    ├── notifyTaskAssigned()
    ├── notifyDelaySubmitted()
    ├── notifyDelayReviewed()
    └── notifySupportNeeded()
```

### 4.6 管理員模組

```
Module: Admin Panel
├── Guard: x-user-email header → DB role check → admin only
├── Sub-modules:
│   ├── User Management (/admin/users)
│   │   ├── List/Search users
│   │   ├── Role assignment
│   │   ├── Pre-registration (AD import)
│   │   └── Activate/Deactivate
│   │
│   ├── Project Settings (/admin/project-settings)
│   │   ├── Project type CRUD
│   │   ├── Code prefix config
│   │   └── Type enable/disable
│   │
│   ├── Notification Config (/admin/notifications)
│   │   ├── Per-tier profiles
│   │   ├── Schedule (day, hour, frequency)
│   │   └── Template customization
│   │
│   ├── Schedule Management (/admin/schedule)
│   │   ├── Cron job monitoring
│   │   ├── Enable/Disable cron
│   │   └── Manual trigger
│   │
│   ├── Milestone Templates
│   │   ├── Per project-type templates
│   │   └── DB overrides hardcoded defaults
│   │
│   └── Report Config (/admin/reports)
│       ├── Email distribution
│       └── Report schedule
│
└── APIs: /api/admin/* (all guarded)
```

---

## 5. API 設計

### 5.1 API 路由總覽

```
/api/
├── auth/
│   └── login                POST   — 使用者登入
├── projects/
│   ├── (root)               GET    — 專案列表
│   ├── (root)               POST   — 建立專案
│   └── [id]/
│       ├── (root)           GET    — 專案詳情
│       ├── (root)           PUT    — 更新專案
│       ├── (root)           DELETE — 刪除專案
│       └── budget-items     GET/PUT— 預算項目
├── my-tasks/                GET    — 我的任務
├── delay-requests/
│   ├── (root)               POST   — 提交延遲申請
│   └── [id]/
│       ├── review           PATCH  — 審核
│       └── resolve-support  PATCH  — 解決支援
├── notifications/
│   ├── (root)               GET    — 取得通知
│   ├── (root)               POST   — 建立通知
│   ├── [id]                 PATCH  — 標記已讀
│   └── mark-all-read        PATCH  — 全部已讀
├── dashboard/               GET    — 儀表板資料
├── milestone-templates/
│   └── [projectType]        GET    — 里程碑模板
├── project-types/           GET    — 專案類型 (公開)
├── ad-users/
│   ├── search               GET    — 搜尋 AD 使用者
│   ├── org-tree             GET    — 組織樹
│   └── [username]           GET    — 使用者詳情
├── cron/
│   ├── weekly-notification  POST   — 週報提醒 Cron
│   └── weekly-report        POST   — 週報產生 Cron
├── admin/
│   ├── users/
│   │   ├── (root)           GET/POST — 使用者管理
│   │   ├── [id]             GET      — 使用者詳情
│   │   └── org-members      POST     — AD 組織成員
│   ├── project-types/
│   │   ├── (root)           GET/POST — 專案類型管理
│   │   └── [key]            PUT      — 更新類型
│   ├── notification-profiles GET/POST — 通知設定檔
│   ├── settings             GET/PUT  — 系統設定
│   ├── cron-logs            GET      — Cron 記錄
│   ├── milestone-templates/ POST     — 模板管理
│   ├── export-excel         POST     — Excel 匯出
│   └── reports              配置報表
├── parse-budget-image       POST     — OCR 預算解析
└── share/[token]            GET      — 共享連結
```

### 5.2 API 設計規範

**請求格式：**
- Content-Type: `application/json`
- 認證標頭: `x-user-email: user@example.com`
- Cron 認證: `x-cron-secret: <CRON_SECRET>`

**回應格式：**
```json
// 成功
{ "data": {...}, "message": "success" }

// 錯誤
{ "error": "Error message", "status": 400 }

// 列表 (含分頁)
{ "data": [...], "total": 100, "page": 1, "limit": 12 }
```

**HTTP 狀態碼：**

| 狀態碼 | 用途 |
|-------|------|
| 200 | 成功 |
| 201 | 建立成功 |
| 400 | 請求參數錯誤 |
| 401 | 未認證 |
| 403 | 權限不足 |
| 404 | 資源不存在 |
| 500 | 伺服器錯誤 |

### 5.3 Admin API 權限守衛

```typescript
// Admin Guard Pattern
async function adminGuard(request: NextRequest) {
  const email = request.headers.get('x-user-email')
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return null // Guard passed
}
```

---

## 6. 前端架構設計

### 6.1 頁面路由結構

```
app/
├── layout.tsx                — Root Layout (Providers: Auth, Notification, Theme)
├── page.tsx                  — Root → redirect to /dashboard or /login
├── login/page.tsx            — Login Page
├── dashboard/page.tsx        — Dashboard (Protected)
├── projects/
│   ├── page.tsx              — Project List
│   ├── new/page.tsx          — Create Project
│   └── [id]/
│       ├── page.tsx          — Project Detail (9 Tabs)
│       └── update/page.tsx   — Edit Project
├── my-tasks/page.tsx         — My Tasks
├── approvals/page.tsx        — Delay Approvals
├── reports/page.tsx          — Reports
├── gantt/page.tsx            — Gantt Chart
├── notifications/page.tsx    — Notification List
├── guide/page.tsx            — User Guide
├── profile/page.tsx          — User Profile
├── settings/page.tsx         — Settings
├── share/[token]/page.tsx    — Shared View (Public)
└── admin/
    ├── page.tsx              — Admin Home (→ /admin/users)
    ├── users/page.tsx        — User Management
    ├── roles/page.tsx        — Role Management
    ├── project-settings/page.tsx — Project Type Config
    ├── notifications/page.tsx — Notification Config
    ├── schedule/page.tsx     — Cron Schedule
    └── reports/page.tsx      — Report Config
```

### 6.2 元件架構

```
components/
├── Layout
│   └── dashboard-layout.tsx    — Main layout with sidebar, nav, notification bell
│
├── Project
│   ├── project-edit-dialog.tsx — Full project CRUD form
│   ├── project-risk-tab.tsx    — Risk management tab
│   ├── project-delay-tab.tsx   — Delay request history tab
│   └── timeline-table.tsx      — Milestone/task timeline table
│
├── Task
│   ├── task-detail-sheet.tsx   — Task detail slide-over panel
│   └── milestone-detail-sheet.tsx — Milestone detail panel
│
├── Charts
│   ├── gantt-chart.tsx         — Custom Gantt chart component
│   └── (Recharts wrappers)     — Line/Bar/Pie charts
│
├── Reports
│   ├── weekly-activity-summary.tsx — Weekly summary component
│   └── capex-table.tsx         — CAPEX tracking table
│
└── ui/ (shadcn/ui)
    ├── button.tsx, input.tsx, textarea.tsx
    ├── card.tsx, dialog.tsx, sheet.tsx
    ├── select.tsx, popover.tsx, dropdown-menu.tsx
    ├── tabs.tsx, badge.tsx, progress.tsx
    ├── calendar.tsx, week-picker.tsx
    └── sonner.tsx (toast)
```

### 6.3 Provider 巢套結構

```tsx
// app/layout.tsx
<ThemeProvider>
  <AuthProvider>
    <NotificationStoreProvider>
      <ProjectStoreProvider>
        <Toaster />
        {children}
      </ProjectStoreProvider>
    </NotificationStoreProvider>
  </AuthProvider>
</ThemeProvider>
```

---

## 7. 認證與授權設計

### 7.1 認證架構

```
認證策略: Mock Auth + AD Fallback + DB Role Sync

┌─────────────┐    ┌──────────────┐    ┌─────────────┐
│  Login Form │───>│  API /login  │───>│   AD API    │
│  (Client)   │    │  (Server)    │    │   (LDAP)    │
└─────────────┘    └──────┬───────┘    └──────┬──────┘
                          │                   │
                   AD success?                │
                   ├── Yes ──>  Create/Update User in DB
                   └── No  ──> Try Mock Users
                                │
                         Mock match?
                         ├── Yes ──> Create/Update User in DB
                         └── No  ──> Return 401
```

**Mock 使用者列表：**

| Email | Name | Default Role | Password |
|-------|------|-------------|----------|
| alice@example.com | Alice Chen | admin | demo |
| dave@example.com | Dave Liu | pm | demo |
| bob@example.com | Bob Wang | member | demo |
| carol@example.com | Carol Lee | executive | demo |

### 7.2 授權矩陣

#### 系統角色權限

| 操作 | Admin | PM | Executive | Member |
|------|-------|-----|-----------|--------|
| 建立專案 | ✅ | ✅ | ❌ | ❌ |
| 編輯專案 | ✅ | ✅ | ❌ | ❌ |
| 刪除專案 | ✅ | ✅ | ❌ | ❌ |
| 檢視預算 | ✅ | ✅ | ✅ | ✅ |
| 編輯預算 | ✅ | ✅ | ❌ | ❌ |
| 管理團隊 | ✅ | ✅ | ❌ | ❌ |
| 檢視所有專案 | ✅ | ✅ | ✅ | ✅ |
| 匯出報表 | ✅ | ✅ | ✅ | ✅ |
| 管理風險 | ✅ | ✅ | ❌ | ❌ |
| 檢視甘特圖 | ✅ | ✅ | ✅ | ✅ |
| 存取管理後台 | ✅ | ❌ | ❌ | ❌ |
| 審核延遲 | — | — | — | S-role |
| 解決支援需求 | ✅ | ❌ | ✅ | ❌ |

#### 專案角色 (RACIPS)

| 角色代碼 | 名稱 | 權限說明 |
|---------|------|---------|
| R | Responsible (負責執行) | 執行任務、提交日誌 |
| A | Accountable (當責) | 最終責任人 |
| C | Consulted (諮詢) | 提供專業意見 |
| I | Informed (知會) | 接收專案更新通知 |
| P | Procurer (採購) | 處理採購事宜 |
| S | Sign-off (審核簽核) | 審核延遲申請 |

### 7.3 前端權限控制

```typescript
// Dashboard Layout Navigation Filter
const navItems = [
  { label: '儀表板', href: '/dashboard' },
  { label: '專案', href: '/projects' },
  { label: '我的任務', href: '/my-tasks' },
  { label: '審批', href: '/approvals' },
  { label: '報表', href: '/reports' },
  { label: '甘特圖', href: '/gantt' },
  { label: '系統管理', href: '/admin', adminOnly: true },  // ← 僅 Admin
]

// Filter logic
const visibleItems = navItems.filter(item =>
  !item.adminOnly || isAdmin(currentUser)
)
```

---

## 8. 排程與自動化設計

### 8.1 Cron 架構

```
┌──────────────────────────────────────┐
│       instrumentation.ts              │
│  (Next.js server startup)            │
│                                       │
│  node-cron schedule:                  │
│  '0 * * * *' (every hour at :00)     │
│                                       │
│  ┌──────────────────────────────┐    │
│  │  Check: Is cron enabled?     │    │
│  │  (SystemSetting check)       │    │
│  └─────────┬────────────────────┘    │
│            │ Yes                      │
│  ┌─────────▼────────────────────┐    │
│  │  /api/cron/weekly-notification│    │
│  │  ├── Check day/hour match     │    │
│  │  ├── Find missing updates     │    │
│  │  ├── Send notifications       │    │
│  │  └── Log to CronJobLog       │    │
│  └──────────────────────────────┘    │
│                                       │
│  ┌──────────────────────────────┐    │
│  │  /api/cron/weekly-report     │    │
│  │  ├── Check day/hour match     │    │
│  │  ├── Compile project stats    │    │
│  │  ├── Send email reports       │    │
│  │  └── Log to CronJobLog       │    │
│  └──────────────────────────────┘    │
└──────────────────────────────────────┘
```

### 8.2 Cron 設定模型

```
SystemSetting Keys:
  notification.cron.enabled     — boolean (啟用/停用)
  notification.schedule.dayOfWeek — 0-6 (週日-週六)
  notification.schedule.hour     — 0-23
  report.cron.enabled           — boolean
  report.schedule.dayOfWeek     — 0-6
  report.schedule.hour          — 0-23

NotificationProfile:
  Per ProjectTier (T1, T2, T3, CIP, default):
  ├── frequencyWeeks: 1|2|4 (每 N 週)
  ├── dayOfWeek: 0-6
  ├── hour: 0-23
  ├── notifyTitle / notifyMessage  — 站內通知模板
  ├── uploadedTitle / uploadedMessage
  └── emailSubject / emailBody     — Email 模板
      (支援 {{projectName}}, {{pmName}}, {{weekOf}})
```

### 8.3 Cron 執行日誌

```
CronJobLog:
  jobType: 'weekly-notification' | 'weekly-report'
  runAt: DateTime
  status: 'success' | 'partial' | 'failed'
  summary: 'Sent 5 notifications for 3 projects'
  affectedCount: 5
```

---

## 9. 整合設計

### 9.1 Active Directory (AD) 整合

```
AD API Endpoints (External):
├── POST /ldap/api/v1/auth           — 使用者認證
│   Request:  { username, password }
│   Response: { success, user: { name, email, org } }
│
├── GET  /ldap/api/v1/organizations/tree — 組織架構
│   Response: hierarchical org tree
│
├── GET  /ldap/api/v1/users/{username}  — 使用者資訊
│   Response: { name, email, department, title }
│
└── POST /ldap/api/v1/mail/send        — 發送 Email
    Request:  { to, subject, body, isHtml }
    Response: { success }

Configuration:
  AD_URL  = https://apigw.company.com
  AD_API  = api_key (in Authorization header)
```

### 9.2 AI 服務整合

```
AI Integration (lib/ai-service.ts):
├── Provider: OpenAI (GPT-4) / DeepSeek
├── Usage:
│   ├── Project complexity analysis
│   ├── Task breakdown suggestions
│   ├── Summary generation
│   └── Budget image OCR parsing
└── Configuration:
    ├── OPENAI_KEY
    └── DEEPSEEK_API_KEY
```

### 9.3 Email 發送設計

```
Email Flow:
  Application → lib/send-mail.ts → AD Mail API → SMTP → Recipient

sendMail(options):
  Input:  { to, subject, body, isHtml? }
  Method: Native Node.js HTTPS (no external library)
  Headers: { Authorization: AD_API, Content-Type: application/json }
  Encoding: UTF-8 with Windows encoding workaround
```

---

## 10. 部署架構

### 10.1 部署拓撲

```
┌─────────────────────────────────────────┐
│           Production Server              │
│                                          │
│  ┌────────────────────────────────┐     │
│  │    Next.js App (Port 12039)    │     │
│  │    ├── SSR Pages               │     │
│  │    ├── API Routes              │     │
│  │    ├── Static Files            │     │
│  │    └── Cron Scheduler          │     │
│  └──────────────┬─────────────────┘     │
│                 │                        │
│  ┌──────────────▼─────────────────┐     │
│  │    MySQL 8.0 (Port 33306)      │     │
│  │    (Docker Container)          │     │
│  └────────────────────────────────┘     │
│                                          │
│  External:                               │
│  ├── AD API (LDAP) ← Auth + Email       │
│  └── AI API (OpenAI/DeepSeek) ← Optional│
└─────────────────────────────────────────┘
```

### 10.2 環境變數

```bash
# Database
DATABASE_URL=mysql://user:pass@host:33306/db_name
MYSQL_HOST=host
MYSQL_PORT=33306
MYSQL_USER=user
MYSQL_PASSWORD=password
MYSQL_DB=db_name

# AD Integration
AD_URL=https://apigw.company.com
AD_API=api_key

# AI Services (Optional)
OPENAI_KEY=sk-...
DEEPSEEK_API_KEY=sk-...

# Application
APP_URL=http://localhost:12039
CRON_SECRET=secret_for_cron_auth
```

### 10.3 建置流程

```bash
# 1. 安裝相依套件
npm install

# 2. 推送資料庫 Schema
npx prisma db push

# 3. 載入測試資料 (可選)
npx prisma db seed

# 4. 建置
npm run build

# 5. 啟動
npm run start  # Production (port 12039)
npm run dev    # Development (hot reload)
```

### 10.4 Docker Compose 設定

```yaml
# docker-compose.yml
services:
  mysql:
    image: mysql:8.0
    ports:
      - "33306:3306"
    environment:
      MYSQL_ROOT_PASSWORD: root
      MYSQL_DATABASE: project_mgmt
    volumes:
      - mysql_data:/var/lib/mysql
```

---

## 11. 安全性設計

### 11.1 認證安全

| 項目 | 實作 |
|------|------|
| 密碼儲存 | Mock 系統使用固定密碼，AD 認證由外部系統處理 |
| Session | localStorage 儲存使用者資訊 |
| API 認證 | `x-user-email` header 用於識別使用者 |
| Admin Guard | API route 層級的角色檢查 |
| Cron 認證 | `x-cron-secret` header 驗證 |

### 11.2 資料安全

| 項目 | 實作 |
|------|------|
| SQL Injection | Prisma ORM 參數化查詢 |
| XSS | React 自動跳脫 + Next.js 安全標頭 |
| CSRF | Same-origin API 呼叫 |
| 資料隔離 | 通知僅查詢本人 userId |
| 共享連結 | 唯一 token + 可選到期日 |

### 11.3 API 安全

```
Public APIs (no auth):
  /api/auth/login
  /api/project-types
  /api/share/[token]

Authenticated APIs (x-user-email):
  /api/projects/*
  /api/my-tasks
  /api/notifications/*
  /api/delay-requests/*
  /api/dashboard
  /api/ad-users/*

Admin APIs (role=admin check):
  /api/admin/*

Cron APIs (x-cron-secret):
  /api/cron/*
```

---

## 12. 效能設計

### 12.1 資料庫效能

| 策略 | 實作 |
|------|------|
| 索引 | 所有 FK 欄位、unique 欄位均建立索引 |
| 關聯查詢 | Prisma `include` 批次載入 (避免 N+1) |
| 分頁 | 專案列表 12 筆/頁，通知/使用者列表分頁 |
| 連線池 | Prisma 連線池管理 |

### 12.2 前端效能

| 策略 | 實作 |
|------|------|
| Server Components | Next.js RSC 減少客戶端 JS |
| 懶載入 | 分頁載入、按需載入甘特圖 |
| 輪詢優化 | 通知 20 秒間隔 (非即時) |
| 圖片 | unoptimized mode (開發階段) |

### 12.3 Cron 效能

| 策略 | 實作 |
|------|------|
| 每小時檢查 | 輕量級 day/hour 比對，不符合即跳過 |
| 批次處理 | 一次查詢所有缺漏專案 |
| 日誌記錄 | CronJobLog 追蹤執行時間與影響數 |

---

*文件結束 — SDD 系統設計文件*
