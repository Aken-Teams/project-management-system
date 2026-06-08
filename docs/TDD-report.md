# TDD 測試驅動開發報告

# Test-Driven Development Report

**專案名稱：** 專案管理系統 (Project Management System)
**版本：** 1.0
**日期：** 2026-05-29
**技術堆疊：** Next.js 15 / TypeScript / Prisma ORM / MySQL (MariaDB)

---

## 目錄

1. [概述](#1-概述)
2. [測試策略](#2-測試策略)
3. [單元測試規格](#3-單元測試規格)
   - 3.1 認證模組
   - 3.2 專案 API
   - 3.3 任務與里程碑邏輯
   - 3.4 延遲申請流程
   - 3.5 通知服務
   - 3.6 Cron 排程引擎
   - 3.7 工具函式
4. [整合測試規格](#4-整合測試規格)
5. [API 端點測試](#5-api-端點測試)
6. [前端元件測試](#6-前端元件測試)
7. [端對端測試場景](#7-端對端測試場景)
8. [測試資料策略](#8-測試資料策略)
9. [測試覆蓋率目標](#9-測試覆蓋率目標)

---

## 1. 概述

本文件定義了專案管理系統的測試驅動開發（TDD）報告，涵蓋從單元測試到端對端測試的完整測試策略。每個功能模組的核心業務邏輯均先定義測試案例，再進行實作開發。

**TDD 流程（Red-Green-Refactor）：**
```
1. Red    — 撰寫失敗的測試案例
2. Green  — 撰寫最小程式碼使測試通過
3. Refactor — 重構程式碼，確保測試仍通過
```

**測試金字塔：**
```
         ╱  E2E Tests  ╲        (少量，高價值)
        ╱ Integration Tests╲    (適量，驗證互動)
       ╱   Unit Tests        ╲  (大量，快速回饋)
```

---

## 2. 測試策略

### 2.1 測試框架選型

| 層級 | 框架 | 用途 |
|------|------|------|
| 單元測試 | Jest / Vitest | 業務邏輯、工具函式、API 處理器 |
| 元件測試 | React Testing Library | React 元件渲染與互動 |
| API 測試 | Supertest / Next.js Test Helpers | API route handler 測試 |
| E2E 測試 | Playwright / Cypress | 完整使用者流程 |
| DB 測試 | Prisma Client (test DB) | 資料庫操作正確性 |

### 2.2 測試環境

```
開發環境      → 單元測試 + 元件測試 (每次 commit)
CI 環境       → 單元 + 整合 + API 測試 (每次 PR)
Staging 環境  → E2E 測試 (每次部署前)
```

### 2.3 Mock 策略

| 依賴 | Mock 方式 |
|------|----------|
| Prisma Client | `jest.mock('@/lib/prisma')` 或 in-memory SQLite |
| AD API | Mock HTTP responses via `msw` (Mock Service Worker) |
| Email (sendMail) | Mock `lib/send-mail.ts` |
| AI Service | Mock `lib/ai-service.ts` |
| localStorage | `jest-localstorage-mock` |
| Date/Time | `jest.useFakeTimers()` |

---

## 3. 單元測試規格

### 3.1 認證模組

#### 檔案：`lib/auth-context.tsx`

```
TEST SUITE: AuthContext
├── describe('login')
│   ├── it('should authenticate with valid credentials')
│   │   Input:  { email: 'dave@example.com', password: 'demo' }
│   │   Expect: user object with name='Dave Liu', role='pm'
│   │
│   ├── it('should reject invalid credentials')
│   │   Input:  { email: 'dave@example.com', password: 'wrong' }
│   │   Expect: throw Error('帳號或密碼錯誤')
│   │
│   ├── it('should fallback to mock users when AD fails')
│   │   Setup:  Mock AD API to return 500
│   │   Input:  { email: 'dave@example.com', password: 'demo' }
│   │   Expect: user object returned successfully
│   │
│   └── it('should sync role from DB after login')
│       Setup:  DB has alice role='admin', MOCK_USERS has role='pm'
│       Input:  { email: 'alice@example.com', password: 'demo' }
│       Expect: user.role === 'admin' (from DB)
│
├── describe('logout')
│   └── it('should clear user state and localStorage')
│       Setup:  user is logged in
│       Action: logout()
│       Expect: user === null, localStorage cleared
│
└── describe('role sync on mount')
    └── it('should refresh role from DB on component mount')
        Setup:  localStorage has role='member', DB has role='pm'
        Action: Component mounts
        Expect: user.role updated to 'pm'
```

#### 檔案：`lib/permissions.ts`

```
TEST SUITE: Permissions
├── describe('getRolePermissions')
│   ├── it('admin should have all permissions')
│   │   Input:  'admin'
│   │   Expect: { createProject: true, editProject: true, deleteProject: true,
│   │            viewBudget: true, editBudget: true, manageTeam: true, ... }
│   │
│   ├── it('pm should have project management permissions')
│   │   Input:  'pm'
│   │   Expect: { createProject: true, editProject: true, deleteProject: true }
│   │
│   ├── it('executive should have view-only permissions')
│   │   Input:  'executive'
│   │   Expect: { createProject: false, editProject: false, viewBudget: true }
│   │
│   └── it('member should have limited permissions')
│       Input:  'member'
│       Expect: { createProject: false, editProject: false, viewBudget: true }
│
├── describe('isAdmin')
│   ├── it('should return true for admin role')
│   │   Input:  { role: 'admin' }
│   │   Expect: true
│   │
│   └── it('should return false for non-admin roles')
│       Input:  { role: 'pm' }
│       Expect: false
│
└── describe('canUserAccessProject')
    ├── it('admin can access any project')
    └── it('member can only access assigned projects')
```

---

### 3.2 專案 API

#### 檔案：`app/api/projects/route.ts`

```
TEST SUITE: Projects API
├── describe('GET /api/projects')
│   ├── it('should return all projects with relations')
│   │   Setup:  DB has 3 projects
│   │   Expect: Array of 3 projects with teamMembers, milestones, tasks
│   │
│   └── it('should return empty array when no projects')
│       Setup:  DB empty
│       Expect: []
│
├── describe('POST /api/projects')
│   ├── it('should create project with auto-generated code')
│   │   Input:  { name: 'Test', projectType: 'npi', ... }
│   │   Expect: project.projectCode matches /^NPI-2026-\d{3}$/
│   │
│   ├── it('should create milestones, tasks, and risks')
│   │   Input:  { milestones: [{name: 'Phase 1', tasks: [...]}], risks: [...] }
│   │   Expect: DB contains milestone + task + risk records
│   │
│   ├── it('should assign team members with RACIPS roles')
│   │   Input:  { teamMembers: [{userId: 'u1', role: 'R'}, {userId: 'u2', role: 'S'}] }
│   │   Expect: ProjectTeamMember records created with correct roles
│   │
│   ├── it('should reject when required fields missing')
│   │   Input:  { name: '' }
│   │   Expect: 400 Bad Request
│   │
│   └── it('should increment project code sequence')
│       Setup:  NPI-2026 lastSeq = 5
│       Input:  { projectType: 'npi' }
│       Expect: code = 'NPI-2026-006', lastSeq updated to 6
```

#### 檔案：`lib/code-prefix.ts`

```
TEST SUITE: Code Generation
├── it('should generate correct prefix for each project type')
│   Cases: 'npi' → 'NPI', 'cost_optimization' → 'CO', 'automation' → 'AUTO'
│
├── it('should pad sequence number to 3 digits')
│   Input:  seq = 1
│   Expect: '001'
│
└── it('should handle year-based sequencing')
    Input:  type='npi', year=2026, lastSeq=0
    Expect: 'NPI-2026-001'
```

---

### 3.3 任務與里程碑邏輯

#### 檔案：`lib/sync-milestone-status.ts`

```
TEST SUITE: Milestone Status Sync
├── describe('computeMilestoneStatus')
│   ├── it('should return "done" when all tasks complete')
│   │   Input:  tasks = [{status:'done'}, {status:'done'}]
│   │   Expect: 'done'
│   │
│   ├── it('should return "blocked" when any task blocked')
│   │   Input:  tasks = [{status:'done'}, {status:'blocked'}]
│   │   Expect: 'blocked'
│   │
│   ├── it('should return "in_progress" when some tasks started')
│   │   Input:  tasks = [{status:'done'}, {status:'in_progress'}]
│   │   Expect: 'in_progress'
│   │
│   └── it('should return "todo" when no tasks started')
│       Input:  tasks = [{status:'todo'}, {status:'todo'}]
│       Expect: 'todo'
│
├── describe('autoProgressTasks')
│   ├── it('should auto-start task when startDate is past')
│   │   Input:  task with status='todo', startDate='2026-05-01'
│   │   Expect: status changed to 'in_progress'
│   │
│   ├── it('should block task when dependency not completed')
│   │   Input:  taskB depends on taskA (status='todo')
│   │   Expect: taskB status = 'blocked'
│   │
│   └── it('should unblock task when all dependencies completed')
│       Input:  taskB depends on taskA (status='done')
│       Expect: taskB status != 'blocked'
│
├── describe('syncTaskProgressFromLogs')
│   ├── it('should set in_progress when task has logs but no progress')
│   │   Input:  task with status='todo', logs=[{content: 'worked on it'}]
│   │   Expect: status = 'in_progress'
│   │
│   └── it('should calculate progress from log count')
│       Input:  task with 5 logs, expected 10 total
│       Expect: progress ≈ 50
│
└── describe('syncMilestoneStatus')
    └── it('should update milestone progress as weighted average')
        Input:  tasks = [
          {durationDays: 10, progress: 80},
          {durationDays: 20, progress: 40}
        ]
        Expect: milestoneProgress = (10*80 + 20*40)/(10+20) ≈ 53
```

#### 檔案：`lib/task-utils.ts`

```
TEST SUITE: Task Utilities
├── describe('computeTaskStatus')
│   ├── it('should compute "at-risk" for overdue in-progress task')
│   │   Input:  { status: 'in_progress', endDate: past_date }
│   │   Expect: computed status = 'at-risk'
│   │
│   ├── it('should compute "on-track" for task within deadline')
│   │   Input:  { status: 'in_progress', endDate: future_date }
│   │   Expect: computed status = 'on-track'
│   │
│   └── it('should compute "done" for completed task')
│       Input:  { status: 'done', completedAt: some_date }
│       Expect: computed status = 'done'
│
├── describe('getStatusColor')
│   ├── it('should return green for "done"')
│   ├── it('should return yellow for "in_progress"')
│   ├── it('should return red for "blocked"')
│   └── it('should return gray for "todo"')
│
└── describe('getDaysUntilDeadline')
    ├── it('should return positive for future deadline')
    │   Input:  endDate = today + 5 days
    │   Expect: 5
    │
    └── it('should return negative for past deadline')
        Input:  endDate = today - 3 days
        Expect: -3
```

---

### 3.4 延遲申請流程

#### 檔案：`app/api/delay-requests/route.ts`

```
TEST SUITE: Delay Requests API
├── describe('POST /api/delay-requests')
│   ├── it('should create delay request with pending status')
│   │   Input:  { projectId, requesterId, reason, affectedMilestones: [...] }
│   │   Expect: delayRequest.status = 'pending'
│   │
│   ├── it('should count S-role reviewers for required count')
│   │   Setup:  Project has 3 S-role members
│   │   Expect: delayRequest.requiredReviewers = 3
│   │
│   ├── it('should create AffectedMilestone records')
│   │   Input:  affectedMilestones: [{milestoneId, originalDate, proposedDate}]
│   │   Expect: AffectedMilestone records created
│   │
│   └── it('should send notifications to S-role reviewers')
│       Setup:  2 S-role members
│       Expect: 2 notifications created (type='delay_submitted')
│
├── describe('PATCH /api/delay-requests/[id]/review')
│   ├── it('should approve when all reviewers approve')
│   │   Setup:  requiredReviewers = 2, existing 1 approve
│   │   Input:  { action: 'approve', reviewerId: 'reviewer2' }
│   │   Expect: delayRequest.status = 'approved'
│   │
│   ├── it('should reject immediately on first rejection')
│   │   Setup:  requiredReviewers = 3
│   │   Input:  { action: 'reject', reviewerId: 'reviewer1' }
│   │   Expect: delayRequest.status = 'rejected'
│   │
│   ├── it('should update milestone dates on approval')
│   │   Setup:  approved delay with proposedDate='2026-07-01'
│   │   Expect: milestone.dueDate = '2026-07-01'
│   │
│   ├── it('should notify requester on approval')
│   │   Expect: notification with type='delay_approved'
│   │
│   ├── it('should notify requester on rejection')
│   │   Expect: notification with type='delay_rejected'
│   │
│   └── it('should prevent duplicate review by same reviewer')
│       Setup:  reviewer1 already reviewed
│       Input:  { action: 'approve', reviewerId: 'reviewer1' }
│       Expect: Error or no-op (unique constraint)
│
└── describe('PATCH /api/delay-requests/[id]/resolve-support')
    ├── it('should mark support as resolved')
    │   Input:  { resolvedById: 'executive1' }
    │   Expect: supportResolved = true, supportResolvedAt = now
    │
    └── it('should record resolver identity')
        Expect: supportResolvedById = 'executive1'
```

---

### 3.5 通知服務

#### 檔案：`lib/notifications.ts`

```
TEST SUITE: Notification Service
├── describe('createNotification')
│   ├── it('should create DB notification record')
│   │   Input:  { userId, type: 'task_assigned', title, message, projectId }
│   │   Expect: Notification record in DB
│   │
│   └── it('should default read to false')
│       Expect: notification.read = false
│
├── describe('notifyTaskAssigned')
│   └── it('should create notification for assignee')
│       Input:  { taskTitle, assigneeId, projectId }
│       Expect: Notification with type='task_assigned'
│
├── describe('notifyDelaySubmitted')
│   └── it('should notify all S-role reviewers')
│       Setup:  Project has 2 S-role members
│       Expect: 2 notifications created
│
├── describe('notifyDelayReviewed')
│   ├── it('should notify requester on approval')
│   │   Input:  { status: 'approved' }
│   │   Expect: type='delay_approved'
│   │
│   └── it('should notify requester on rejection')
│       Input:  { status: 'rejected' }
│       Expect: type='delay_rejected'
│
└── describe('notifyProjectOverdueIfNeeded')
    └── it('should create overdue notification when milestones past due')
        Setup:  Project has overdue milestones
        Expect: type='task_overdue'
```

#### 檔案：`lib/notification-store.tsx`

```
TEST SUITE: NotificationStore Context
├── describe('polling')
│   ├── it('should fetch notifications every 20 seconds')
│   │   Setup:  useFakeTimers(), mount component
│   │   Action: advance timer 20000ms
│   │   Expect: API called twice
│   │
│   └── it('should update unread count from API response')
│       Mock API: return 3 unread notifications
│       Expect: unreadCount = 3
│
├── describe('markAsRead')
│   └── it('should PATCH notification and decrement count')
│       Action: markAsRead('notif-1')
│       Expect: PATCH /api/notifications/notif-1 called, unreadCount decremented
│
└── describe('markAllAsRead')
    └── it('should PATCH bulk and set count to 0')
        Action: markAllAsRead()
        Expect: PATCH /api/notifications/mark-all-read called, unreadCount = 0
```

---

### 3.6 Cron 排程引擎

#### 檔案：`app/api/cron/weekly-notification/route.ts`

```
TEST SUITE: Weekly Notification Cron
├── describe('schedule matching')
│   ├── it('should execute when current day/hour matches profile')
│   │   Setup:  profile dayOfWeek=1, hour=9; current=Monday 9:00
│   │   Expect: cron executes
│   │
│   ├── it('should skip when day/hour does not match')
│   │   Setup:  profile dayOfWeek=1, hour=9; current=Tuesday 14:00
│   │   Expect: cron skips
│   │
│   └── it('should respect frequency (skip if not on schedule)')
│       Setup:  frequencyWeeks=2, last run 1 week ago
│       Expect: cron skips
│
├── describe('missing update detection')
│   ├── it('should find projects without weekly update for current week')
│   │   Setup:  3 projects, 1 has update, 2 don't
│   │   Expect: 2 projects flagged
│   │
│   └── it('should filter by project tier matching profile')
│       Setup:  T1 profile, projects are T1 and T2
│       Expect: only T1 project checked
│
├── describe('notification sending')
│   ├── it('should create in-app notifications for PMs')
│   │   Expect: notification type='weekly_upload_missing'
│   │
│   ├── it('should send email with template variables replaced')
│   │   Template: "{{projectName}} 需要提交週報"
│   │   Expect: "NPI-2026 新產品導入 需要提交週報"
│   │
│   └── it('should log cron execution to CronJobLog')
│       Expect: CronJobLog entry with jobType='weekly-notification'
│
└── describe('enable/disable')
    └── it('should skip entirely when cron disabled in settings')
        Setup:  SystemSetting 'notification.cron.enabled' = 'false'
        Expect: no notifications sent
```

---

### 3.7 工具函式

#### 檔案：`lib/enum-mappers.ts`

```
TEST SUITE: Enum Mappers
├── describe('taskStatusToDb')
│   ├── it('"in-progress" → "in_progress"')
│   ├── it('"todo" → "todo"')
│   └── it('"done" → "done"')
│
├── describe('taskStatusToFe')
│   ├── it('"in_progress" → "in-progress"')
│   └── it('"blocked" → "blocked"')
│
├── describe('projectTypeToDb')
│   ├── it('"cost-optimization" → "cost_optimization"')
│   └── it('"npi" → "npi"')
│
├── describe('projectTierToDb')
│   ├── it('"T1" → "T1"')
│   └── it('"CIP" → "CIP"')
│
└── describe('roundtrip consistency')
    └── it('toDb(toFe(value)) should equal original')
        Cases: all enum values
```

#### 檔案：`lib/project-transformer.ts`

```
TEST SUITE: Project Transformer
├── describe('dbProjectToFrontend')
│   ├── it('should transform DB project to frontend format')
│   │   Input:  Prisma project with relations
│   │   Expect: frontend-compatible object with camelCase keys
│   │
│   ├── it('should include computed fields')
│   │   Expect: progress, statusColor, budgetUtilization computed
│   │
│   └── it('should handle null optional fields')
│       Input:  project with null expectedBenefits
│       Expect: no error, field omitted or null
│
└── describe('projectFullInclude')
    └── it('should include all necessary relations')
        Expect: includes teamMembers, milestones, tasks, risks, etc.
```

#### 檔案：`lib/send-mail.ts`

```
TEST SUITE: Send Mail
├── it('should send email via AD mail API')
│   Input:  { to: 'user@company.com', subject: 'Test', body: 'Hello' }
│   Mock:   AD API returns 200
│   Expect: HTTPS request sent to AD_URL/ldap/api/v1/mail/send
│
├── it('should handle AD API failure gracefully')
│   Mock:   AD API returns 500
│   Expect: Error logged, no crash
│
└── it('should handle UTF-8 encoding correctly on Windows')
    Input:  { subject: '中文主旨', body: '中文內容' }
    Expect: Correct encoding in request
```

#### 檔案：`lib/timeline-utils.ts`

```
TEST SUITE: Timeline Utilities
├── it('should calculate duration between two dates')
│   Input:  start='2026-01-01', end='2026-01-31'
│   Expect: 30 days
│
├── it('should determine if date is past')
│   Input:  '2025-01-01'
│   Expect: true
│
└── it('should calculate overlap between two date ranges')
    Input:  range1=[Jan 1, Jan 31], range2=[Jan 15, Feb 15]
    Expect: overlap = 16 days
```

#### 檔案：`lib/dependency-graph.ts`

```
TEST SUITE: Dependency Graph
├── it('should detect circular dependencies')
│   Input:  A→B, B→C, C→A
│   Expect: circular dependency detected
│
├── it('should compute topological order')
│   Input:  A→B, A→C, B→D, C→D
│   Expect: [A, B|C, B|C, D] (valid topological sort)
│
└── it('should identify critical path')
    Input:  tasks with durations and dependencies
    Expect: longest path through graph
```

---

## 4. 整合測試規格

### 4.1 專案建立到完成流程

```
TEST SUITE: Project Lifecycle Integration
├── it('should create project → add milestones → assign tasks → complete')
│   Steps:
│   1. POST /api/projects → create project with milestones and tasks
│   2. Verify DB: project, milestones, tasks created
│   3. PATCH task status to 'done' for all tasks
│   4. Verify: milestone progress = 100%, project progress = 100%
│
├── it('should auto-generate project code and increment sequence')
│   Steps:
│   1. POST /api/projects (type=npi) → NPI-2026-001
│   2. POST /api/projects (type=npi) → NPI-2026-002
│   3. Verify: ProjectCodeSequence lastSeq = 2
│
└── it('should cascade delete project and all related records')
    Steps:
    1. Create project with milestones, tasks, risks, team members
    2. DELETE /api/projects/[id]
    3. Verify: all related records removed from DB
```

### 4.2 延遲申請審核流程

```
TEST SUITE: Delay Request Integration
├── it('should handle full approval workflow')
│   Steps:
│   1. Create project with 2 S-role members
│   2. POST /api/delay-requests (submit delay)
│   3. Verify: 2 notifications sent
│   4. PATCH reviewer1 approve
│   5. Verify: status still 'pending' (need 2 approvals)
│   6. PATCH reviewer2 approve
│   7. Verify: status = 'approved', milestone dates updated
│   8. Verify: requester notified
│
├── it('should handle single rejection killing request')
│   Steps:
│   1. Submit delay with 3 required reviewers
│   2. Reviewer1 approves
│   3. Reviewer2 rejects
│   4. Verify: status = 'rejected' immediately
│   5. Verify: requester gets rejection notification
│
└── it('should handle support resolution by executive')
    Steps:
    1. Submit delay with supportNeeded='需要供應商協助'
    2. Verify: executive notified
    3. Executive resolves support
    4. Verify: supportResolved=true, supportResolvedById set
```

### 4.3 通知與 Cron 整合

```
TEST SUITE: Notification & Cron Integration
├── it('should send weekly reminders for missing updates')
│   Steps:
│   1. Create 3 projects, submit weekly update for 1
│   2. Trigger cron/weekly-notification
│   3. Verify: 2 projects' PMs get reminder notifications
│   4. Verify: CronJobLog entry created
│
└── it('should respect per-tier notification profiles')
    Steps:
    1. Create T1 profile (weekly, Monday 9am) and T2 profile (biweekly, Friday 5pm)
    2. Trigger cron on Monday 9am
    3. Verify: only T1 projects checked
    4. Trigger cron on Friday 5pm (biweekly match)
    5. Verify: T2 projects checked
```

### 4.4 認證與授權整合

```
TEST SUITE: Auth Integration
├── it('should create new user on first login')
│   Steps:
│   1. Login with new email (not in DB)
│   2. Verify: User record created with role='member'
│
├── it('should sync pre-registered role on login')
│   Steps:
│   1. Admin pre-registers user with role='pm'
│   2. User logs in for first time
│   3. Verify: user gets role='pm'
│
└── it('should block admin API for non-admin users')
    Steps:
    1. Login as member
    2. GET /api/admin/users with member's x-user-email
    3. Verify: 403 Forbidden
```

---

## 5. API 端點測試

### 5.1 RESTful API 測試矩陣

| 端點 | Method | 正常情境 | 錯誤情境 | 權限測試 |
|------|--------|---------|---------|---------|
| `/api/auth/login` | POST | 正確帳密 → 200 | 錯誤密碼 → 401 | N/A |
| `/api/projects` | GET | 回傳專案列表 → 200 | DB 連線失敗 → 500 | 所有角色可讀 |
| `/api/projects` | POST | 建立成功 → 201 | 缺少必填 → 400 | PM/Admin 可建 |
| `/api/projects/[id]` | PUT | 更新成功 → 200 | ID 不存在 → 404 | PM/Admin 可改 |
| `/api/projects/[id]` | DELETE | 刪除成功 → 200 | ID 不存在 → 404 | PM/Admin 可刪 |
| `/api/my-tasks` | GET | 回傳使用者任務 → 200 | 無 userId → 400 | 本人任務 |
| `/api/delay-requests` | POST | 建立成功 → 201 | 無專案 → 400 | PM/Member |
| `/api/delay-requests/[id]/review` | PATCH | 審核成功 → 200 | 非 S-role → 403 | S-role 限定 |
| `/api/notifications` | GET | 回傳通知 → 200 | 無 userId → 400 | 本人通知 |
| `/api/notifications/[id]` | PATCH | 標記已讀 → 200 | ID 不存在 → 404 | 本人通知 |
| `/api/dashboard` | GET | 回傳統計 → 200 | 參數錯誤 → 400 | 所有角色 |
| `/api/admin/users` | GET | 回傳列表 → 200 | 非 Admin → 403 | Admin 限定 |
| `/api/admin/users` | POST | 建立/更新 → 200 | 缺少 email → 400 | Admin 限定 |
| `/api/admin/project-types` | GET | 回傳類型 → 200 | — | Admin 限定 |
| `/api/admin/notification-profiles` | POST | 更新成功 → 200 | 無效資料 → 400 | Admin 限定 |
| `/api/admin/settings` | PUT | 更新成功 → 200 | 無效 key → 400 | Admin 限定 |
| `/api/cron/weekly-notification` | POST | 執行成功 → 200 | 無 SECRET → 401 | Cron 限定 |
| `/api/milestone-templates/[type]` | GET | 回傳模板 → 200 | 類型不存在 → 回傳空 | 公開 |
| `/api/project-types` | GET | 回傳類型 → 200 | — | 公開 |
| `/api/ad-users/search` | GET | 回傳 AD 使用者 → 200 | AD 不可用 → 500 | 已認證 |

### 5.2 API 回應格式驗證

```
TEST SUITE: API Response Format
├── describe('Project response')
│   └── it('should match expected schema')
│       Expect: { id, projectCode, name, projectType, projectTier, status,
│                 progress, budget, budgetUsed, startDate, endDate,
│                 owner: { id, name, email }, teamMembers: [...],
│                 milestones: [...], tasks: [...], risks: [...] }
│
├── describe('Notification response')
│   └── it('should match expected schema')
│       Expect: { id, type, title, message, read, createdAt, projectId? }
│
└── describe('Dashboard response')
    └── it('should match expected schema')
        Expect: { totalProjects, byStatus: {green, yellow, red},
                  byTier: {T1, T2, T3, CIP}, budgetTotal, budgetUsed,
                  openRisks: [...], upcomingMilestones: [...],
                  missingUpdates: [...], pendingApprovals }
```

---

## 6. 前端元件測試

### 6.1 元件渲染測試

```
TEST SUITE: Component Rendering
├── describe('DashboardLayout')
│   ├── it('should render sidebar with navigation items')
│   ├── it('should show admin nav items for admin role')
│   ├── it('should hide admin nav items for non-admin roles')
│   ├── it('should show notification bell with unread count')
│   └── it('should collapse sidebar on mobile')
│
├── describe('LoginPage')
│   ├── it('should render login form with email/password fields')
│   ├── it('should render 4 quick-login buttons')
│   ├── it('should call login on form submit')
│   └── it('should show error message on failed login')
│
├── describe('ProjectCard')
│   ├── it('should display project code, name, status badge')
│   ├── it('should show progress bar with correct percentage')
│   └── it('should show tier badge')
│
├── describe('GanttChart')
│   ├── it('should render milestone bars correctly')
│   ├── it('should render task bars under milestones')
│   ├── it('should draw dependency arrows')
│   └── it('should handle empty project gracefully')
│
├── describe('TaskDetailSheet')
│   ├── it('should render task info: title, status, assignee, dates')
│   ├── it('should render subtask list')
│   ├── it('should render task log history')
│   └── it('should allow adding new task log')
│
└── describe('CapexTable')
    ├── it('should render CAPEX items in table format')
    ├── it('should show sticky summary bar with totals')
    └── it('should handle empty CAPEX list')
```

### 6.2 互動測試

```
TEST SUITE: Component Interactions
├── describe('ProjectFilters')
│   ├── it('should filter projects by status on click')
│   ├── it('should filter projects by tier on select')
│   └── it('should search projects by name on input')
│
├── describe('TaskStatusToggle')
│   ├── it('should call API on status change')
│   └── it('should update UI optimistically')
│
├── describe('DelayRequestForm')
│   ├── it('should validate required fields')
│   ├── it('should submit delay request on form submit')
│   └── it('should show affected milestones selection')
│
└── describe('NotificationBell')
    ├── it('should show dropdown on click')
    ├── it('should mark as read on notification click')
    └── it('should show "no notifications" when empty')
```

---

## 7. 端對端測試場景

### E2E-001：完整專案生命週期

```
Scenario: 專案從建立到完成的完整流程
  Given Dave (PM) 已登入
  When  Dave 建立一個 NPI 專案「自動化產線改善」
  And   加入團隊成員 Bob (R), Alice (S)
  And   自動載入 NPI 里程碑模板
  Then  專案列表顯示新專案

  When  Bob 登入並進入「我的任務」
  Then  顯示被指派的任務

  When  Bob 完成所有任務
  Then  里程碑進度 = 100%
  And   專案進度 = 100%
```

### E2E-002：延遲申請審核流程

```
Scenario: 延遲申請的提交與審核
  Given Dave (PM) 的專案有延遲
  When  Dave 提交延遲申請
  Then  Alice (S-role) 收到通知

  When  Alice 進入審核頁面
  And   Alice 核准延遲申請
  Then  Dave 收到核准通知
  And   里程碑日期更新
```

### E2E-003：管理員操作流程

```
Scenario: 管理員管理使用者和設定
  Given Alice (Admin) 已登入
  When  進入 /admin/users
  Then  顯示所有使用者

  When  修改 Bob 角色為 pm
  Then  Bob 下次登入角色為 pm

  When  進入 /admin/project-settings
  And   新增自訂專案類型
  Then  建立專案時可選擇新類型
```

### E2E-004：報表匯出流程

```
Scenario: 匯出專案報表
  Given Carol (Executive) 已登入
  When  進入 /reports
  And   選擇報表類型「執行摘要」
  And   篩選 T1 層級
  And   點擊「匯出 Excel」
  Then  下載 Excel 檔案包含專案資料
```

### E2E-005：通知生命週期

```
Scenario: 通知接收、閱讀、清除
  Given Bob 登入
  And   Bob 有 5 則未讀通知
  Then  通知鈴鐺顯示 5

  When  Bob 點擊第一則通知
  Then  該通知標為已讀，鈴鐺顯示 4

  When  Bob 點擊「全部已讀」
  Then  鈴鐺顯示 0
```

---

## 8. 測試資料策略

### 8.1 Fixtures (測試固定資料)

```typescript
// test/fixtures/users.ts
export const TEST_USERS = {
  admin: { id: 'user-admin', name: 'Alice Chen', email: 'alice@example.com', role: 'admin' },
  pm:    { id: 'user-pm',    name: 'Dave Liu',   email: 'dave@example.com',  role: 'pm' },
  member:{ id: 'user-member', name: 'Bob Wang',  email: 'bob@example.com',   role: 'member' },
  exec:  { id: 'user-exec',  name: 'Carol Lee',  email: 'carol@example.com', role: 'executive' },
}

// test/fixtures/projects.ts
export const TEST_PROJECT = {
  id: 'proj-test-001',
  projectCode: 'NPI-2026-001',
  name: 'Test NPI Project',
  projectType: 'npi',
  projectTier: 'T1',
  status: 'green',
  progress: 45,
  budget: 1000000,
  budgetUsed: 350000,
  startDate: '2026-01-01',
  endDate: '2026-12-31',
  ownerId: 'user-pm',
}

// test/fixtures/milestones.ts
export const TEST_MILESTONES = [
  { id: 'ms-1', name: 'Phase 1: Design', dueDate: '2026-03-31', status: 'done', progress: 100 },
  { id: 'ms-2', name: 'Phase 2: Build',  dueDate: '2026-06-30', status: 'in_progress', progress: 60 },
  { id: 'ms-3', name: 'Phase 3: Test',   dueDate: '2026-09-30', status: 'todo', progress: 0 },
]
```

### 8.2 Factory Functions

```typescript
// test/factories/project.factory.ts
export function createTestProject(overrides = {}) {
  return {
    name: `Test Project ${Date.now()}`,
    projectType: 'npi',
    projectTier: 'T1',
    status: 'green',
    progress: 0,
    budget: 500000,
    startDate: new Date(),
    endDate: addMonths(new Date(), 6),
    ...overrides,
  }
}

export function createTestTask(overrides = {}) {
  return {
    title: `Test Task ${Date.now()}`,
    status: 'todo',
    priority: 'medium',
    progress: 0,
    ...overrides,
  }
}
```

### 8.3 Database Seeding for Tests

```typescript
// test/helpers/db-setup.ts
export async function seedTestDB() {
  await prisma.user.createMany({ data: Object.values(TEST_USERS) })
  await prisma.project.create({ data: TEST_PROJECT })
  // ... create milestones, tasks, etc.
}

export async function cleanTestDB() {
  await prisma.$transaction([
    prisma.notification.deleteMany(),
    prisma.taskLog.deleteMany(),
    prisma.task.deleteMany(),
    prisma.milestone.deleteMany(),
    prisma.project.deleteMany(),
    prisma.user.deleteMany(),
  ])
}
```

---

## 9. 測試覆蓋率目標

### 9.1 覆蓋率目標

| 測試類型 | 覆蓋率目標 | 涵蓋範圍 |
|---------|-----------|---------|
| 單元測試 | ≥ 80% | 業務邏輯、工具函式、enum mappers |
| API 測試 | ≥ 90% | 所有 API routes |
| 元件測試 | ≥ 70% | 關鍵 UI 元件 |
| E2E 測試 | ≥ 60% | 核心使用者流程 |
| 整體覆蓋 | ≥ 75% | 全部程式碼 |

### 9.2 關鍵路徑覆蓋率

| 關鍵路徑 | 要求覆蓋率 |
|---------|-----------|
| 認證流程 | 100% |
| 延遲審核邏輯 | 100% |
| 任務狀態同步 | 95% |
| 里程碑進度計算 | 95% |
| 通知發送 | 90% |
| Cron 排程 | 90% |
| 專案 CRUD | 90% |
| 權限控制 | 100% |

### 9.3 測試報告格式

```
===============================================================
  Test Report - Project Management System
  Date: 2026-05-29
  Environment: CI/CD Pipeline
===============================================================

  UNIT TESTS
    Suites:  45 passed, 45 total
    Tests:   312 passed, 312 total
    Coverage: 82.4% (statements)

  API TESTS
    Suites:  22 passed, 22 total
    Tests:   158 passed, 158 total
    Coverage: 91.2% (routes)

  COMPONENT TESTS
    Suites:  18 passed, 18 total
    Tests:   89 passed, 89 total
    Coverage: 73.1% (components)

  E2E TESTS
    Specs:   5 passed, 5 total
    Scenarios: 28 passed, 28 total
    Coverage: 65.0% (user flows)

  OVERALL: 587 tests passed | Coverage: 78.3%
===============================================================
```

---

*文件結束 — TDD 測試驅動開發報告*
