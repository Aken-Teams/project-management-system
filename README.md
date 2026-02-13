# Project Management System

企業級專案管理系統，支援專案建立、里程碑追蹤、任務管理、風險識別、延遲審批流程與主管儀表板。

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript 5.7 |
| UI | React 19 + Radix UI + shadcn/ui |
| Styling | Tailwind CSS 4 |
| ORM | Prisma 7 |
| Database | PostgreSQL 16 |
| Charts | Recharts |
| Icons | Lucide React |
| PDF | jsPDF + jsPDF-AutoTable |
| Drag & Drop | @dnd-kit |
| Notifications | Sonner |

## Features

- **專案管理** — 建立專案（手動 / AI 輔助）、自動產生專案編號、SMART 目標、預算追蹤
- **里程碑 & 任務** — 里程碑排程、任務指派、自動進度計算、任務相依性管理
- **風險識別** — 影響 / 機率矩陣、緩解策略、風險狀態追蹤
- **週報更新** — 語音輸入、整體狀態、里程碑進度、障礙與下週計畫
- **延遲審批** — 提交延遲申請 → PM/主管審核 → 自動更新時程
- **主管儀表板** — KPI 卡片、專案概覽、風險摘要、即將到期里程碑
- **甘特圖** — 專案 / 里程碑 / 任務視覺化時間線
- **我的任務** — 個人任務清單、工作日誌記錄
- **通知系統** — 任務指派、延遲審批、逾期提醒
- **角色控管** — PM / 成員 / 主管三種角色，各有不同權限與視圖

## Prerequisites

- Node.js 18+
- Docker & Docker Compose
- pnpm

## Getting Started

```bash
# 1. Clone
git clone <repo-url>
cd project-management-system

# 2. Install dependencies
pnpm install

# 3. Setup environment
cp .env.example .env

# 4. Start database
pnpm db:up

# 5. Run migrations
pnpm db:migrate

# 6. Seed sample data
pnpm db:seed

# 7. Start dev server
pnpm dev
# → http://localhost:12039
```

## Demo Accounts

| Role | Email | Password |
|------|-------|----------|
| PM (專案經理) | alice@example.com | any |
| Member (團隊成員) | bob@example.com | any |
| Executive (主管) | carol@example.com | any |

## Scripts

```bash
pnpm dev              # 開發伺服器 (port 12039)
pnpm build            # Production build
pnpm start            # Production server
pnpm lint             # ESLint
pnpm db:up            # 啟動 PostgreSQL + pgAdmin
pnpm db:down          # 停止資料庫容器
pnpm db:migrate       # 執行 Prisma migration
pnpm db:seed          # 填入範例資料
pnpm db:studio        # 開啟 Prisma Studio
pnpm db:reset         # 重置資料庫
```

## Project Structure

```
app/
├── api/
│   ├── dashboard/             # GET — 儀表板 KPI & 專案概覽
│   ├── projects/
│   │   ├── route.ts           # GET / POST — 專案列表 & 建立
│   │   └── [id]/
│   │       ├── route.ts       # GET / PUT — 專案詳情 & 更新
│   │       ├── milestones/    # CRUD — 里程碑
│   │       ├── tasks/         # CRUD — 任務
│   │       ├── task-logs/     # CRUD — 工作日誌
│   │       ├── risks/         # CRUD — 風險
│   │       ├── team/          # CRUD — 團隊成員
│   │       ├── rebuild-dependencies/  # POST — 重建任務相依
│   │       └── reset-baseline/        # POST — 重設里程碑基線
│   ├── delay-requests/        # GET / POST — 延遲申請
│   │   └── [id]/review/       # POST — 審批延遲
│   ├── my-tasks/              # GET — 我的任務
│   ├── reports/               # GET / POST (PDF) — 報表
│   ├── users/
│   │   ├── [id]/              # GET / PUT — 使用者資料
│   │   └── search/            # GET — 搜尋使用者
│   └── drafts/                # CRUD — 專案草稿
├── dashboard/                 # 主管儀表板
├── projects/                  # 專案列表 / 詳情 / 新增 / 週報
├── gantt/                     # 甘特圖
├── my-tasks/                  # 我的任務
├── approvals/                 # 延遲審批
├── reports/                   # 報表
├── profile/                   # 個人資料
├── settings/                  # 設定
└── login/                     # 登入

components/
├── ui/                        # shadcn/ui 元件 (50+)
├── dashboard-layout.tsx       # 主版面配置
├── gantt-chart.tsx            # 甘特圖
├── kanban-board.tsx           # 看板視圖
├── timeline-table.tsx         # 時間線表格
├── team-member-table.tsx      # 團隊管理表格
├── task-detail-sheet.tsx      # 任務詳情側欄
├── notification-bell.tsx      # 通知鈴鐺
└── voice-input-button.tsx     # 語音輸入

lib/
├── db.ts                      # Prisma client
├── auth-context.tsx           # 認證 context
├── permissions.ts             # 權限控管
├── task-utils.ts              # 任務狀態計算
├── risk-utils.ts              # 風險分析
├── enum-mappers.ts            # DB ↔ 前端 enum 轉換
├── dependency-graph.ts        # 任務相依圖分析
├── milestone-templates.ts     # 里程碑範本
└── ai-service.ts              # AI 專案生成

prisma/
├── schema.prisma              # 資料庫 schema
└── seed.ts                    # 範例資料
```

## Data Models

```
User ──< ProjectTeamMember >── Project
  │                              │
  │── Notification               ├── Milestone ──< Task
  │── TaskLog                    │     └── MilestoneBaseline
  │── WeeklyUpdate               ├── Risk
  │     └── MilestoneUpdate      ├── WeeklyUpdate
  │── DelayRequest               ├── DelayRequest
  └── ProjectDraft               │     └── AffectedMilestone
                                 ├── TaskLog
                                 └── Notification

Task ──< TaskDependency >── Task  (self-referential)
```

### Key Models

| Model | Purpose |
|-------|---------|
| **Project** | 專案主體，含類型、層級、SMART 目標、預算、狀態 (green/yellow/red) |
| **Milestone** | 里程碑，含到期日、進度 (自動計算)、排序 |
| **MilestoneBaseline** | 里程碑基線快照，用於比較原始 vs 實際時程 |
| **Task** | 任務，含指派人、優先級、日期、進度、完成紀錄 |
| **TaskDependency** | 任務相依關係 (多對多自關聯) |
| **TaskLog** | 工作日誌，記錄每日工作內容 |
| **Risk** | 風險項目，含影響/機率/緩解策略/狀態 |
| **WeeklyUpdate** | 週報，含整體狀態、障礙、下週計畫 |
| **DelayRequest** | 延遲申請，含三階段審批流程 |
| **Notification** | 通知，含類型、已讀狀態 |

## Pages

| Route | Page | Description |
|-------|------|-------------|
| `/login` | 登入 | 快速切換 Demo 帳號 |
| `/dashboard` | 儀表板 | KPI、專案概覽、風險、即將到期里程碑 |
| `/projects` | 專案列表 | 多條件篩選 (狀態/類型/層級/負責人) |
| `/projects/new` | 建立專案 | 手動 / AI 輔助模式，含團隊、里程碑、風險 |
| `/projects/[id]` | 專案詳情 | 里程碑、任務、團隊、風險、時間線、週報 |
| `/projects/[id]/update` | 週報更新 | 語音輸入、里程碑進度、障礙回報 |
| `/gantt` | 甘特圖 | 專案/里程碑/任務時間線視覺化 |
| `/my-tasks` | 我的任務 | 個人任務清單、工作日誌 |
| `/approvals` | 審批 | 延遲申請審核 |
| `/reports` | 報表 | 專案報表、團隊工作量圖表 |
| `/profile` | 個人資料 | 統計數據、參與專案、近期活動 |
| `/settings` | 設定 | 使用者偏好設定 |

## Database Access

| Tool | URL / Command |
|------|---------------|
| Prisma Studio | `pnpm db:studio` |
| pgAdmin | http://localhost:5050 (admin@pm.local / admin) |
| PostgreSQL | localhost:65535 (pm_admin / pm_secret_2026) |

## Environment Variables

```env
DATABASE_URL="postgresql://pm_admin:pm_secret_2026@localhost:65535/project_management?schema=public"
```
