# 專案管理系統 — CRUD 完整度審查報告

> 初次審查日期：2026-02-11
> 最後更新日期：2026-02-13
> 審查範圍：Prisma Schema 所有 Model × UI 頁面 × API 路由

---

## 名詞解釋

### 什麼是「持久化到資料庫」？

目前系統中有許多 UI 操作（例如：標記任務完成、更新個人資料、核准延遲申請）看起來有在運作，但實際上只是把資料存在瀏覽器的記憶體中（React Context + localStorage）。這代表：

- **重新整理頁面後資料就消失了**
- **其他使用者看不到這些變更**
- **伺服器重啟後一切歸零**

「持久化」就是讓這些操作真正寫入 PostgreSQL 資料庫，確保資料永久保存、所有使用者都能看到。要做到這件事，需要為每個操作建立對應的 API 路由（後端），讓前端透過 API 把資料寫進 DB。

### 什麼是「TaskDependency 任務相依性」？

任務相依性是指「任務 B 必須等任務 A 完成後才能開始」的關係。例如：

```
[模具設計] ──完成後──→ [模具開模] ──完成後──→ [試模驗證]
```

Schema 中已經定義了 `TaskDependency` 資料表，用來記錄這種前後關係：

```prisma
model TaskDependency {
  dependentId    String   // 被擋住的任務（後面的任務）
  prerequisiteId String   // 前置任務（必須先完成的）
  @@id([dependentId, prerequisiteId])
}
```

目前已實作：
- ✅ 建專案時自動建立順序相依（同里程碑內依序鏈接，跨里程碑首尾串接）
- ✅ 重建相依關係 API — `POST /api/projects/[id]/rebuild-dependencies`
- ✅ 專案詳細頁「任務相依分析」Tab — 含甘特圖箭頭連線、關鍵路徑分析、延遲影響分析
- ✅ API 回傳任務時包含 `dependsOn` 相依資料

尚未實作：
- ❌ 手動新增/移除相依關係的 API 和 UI
- ❌ 前置任務未完成時自動標記後續任務為 `blocked`

---

## 圖例

| 符號 | 意義 |
|------|------|
| ✅ | UI + API 都已實作 |
| 🖥️ | 只有 UI（前端），沒有 API 後端，資料無法持久化 |
| 🔌 | 只有 API，沒有 UI |
| ❌ | UI 和 API 都沒有 |

---

## ✅ 1. User（使用者）

| 操作 | UI | API | 狀態 |
|------|-----|-----|------|
| Create | 無註冊頁面 | 只在建專案/草稿時自動建立 | ❌ 無獨立註冊功能 |
| Read（列表） | 無使用者管理頁面 | `GET /api/users/search`（只有搜尋） | ❌ 無使用者列表 |
| Read（詳細） | Profile 頁面（僅 API） | `GET /api/users/[id]` | ✅ |
| Update | Profile 有名稱/email/組織表單 | `PUT /api/users/[id]` | ✅ |
| Delete | 無 | 無 | ❌ |

### 已實作項目：
- ✅ `GET /api/users/[id]` — 取得使用者資料 + 統計（參與專案數、任務狀態分佈）+ 近期日誌 + 參與專案列表
- ✅ `PUT /api/users/[id]` — 更新 name/email/organization，含空值驗證和 email 唯一性檢查（P2002）
- ✅ Profile 頁面已完全遷移至 API — `fetch('/api/users/${user.id}')` 載入，不再使用 `useProjectStore`
- ✅ `updateUser`（auth-context）改為呼叫 `PUT /api/users/${user.id}`，回寫 localStorage 同步 session
- ✅ Profile 頁面包含 `organization` 欄位的顯示/編輯
- ✅ 參與專案列表可點擊跳轉，顯示角色標籤和 Owner 標示

### 缺少項目：
- （可選）使用者管理頁面（admin 功能）

---

## ✅ 2. Project（專案）

| 操作 | UI | API | 狀態 |
|------|-----|-----|------|
| Create | `/projects/new`（API 建立） | `POST /api/projects` | ✅ |
| Read（列表） | `/projects`（僅 API） | `GET /api/projects` | ✅ |
| Read（詳細） | `/projects/[id]`（僅 API） | `GET /api/projects/[id]` | ✅ |
| Update | `ProjectEditDialog` 編輯彈窗 | `PUT /api/projects/[id]` | ✅ |
| Delete | `ProjectDeleteDialog` 確認彈窗 | `DELETE /api/projects/[id]` | ✅ |

### 已實作項目：
- ✅ `PUT /api/projects/[id]` — 更新專案基本資訊（名稱、類型、層級、目標、範圍、預算、SMART 等）
- ✅ `DELETE /api/projects/[id]` — 刪除專案（Cascade 自動刪除子項目）
- ✅ `ProjectEditDialog` 元件 — 專案編輯彈窗
- ✅ `ProjectDeleteDialog` 元件 — 刪除確認彈窗
- ✅ 專案詳細頁有「編輯」和「刪除」按鈕

### 缺少項目：
- `PATCH /api/projects/[id]/status` — 獨立的專案狀態快速更新（green / yellow / red）

---

## ✅ 3. ProjectTeamMember（專案團隊成員）

| 操作 | UI | API | 狀態 |
|------|-----|-----|------|
| Create | 建專案時 + `ProjectEditDialog` 團隊 Tab | `POST /api/projects`（建專案時）+ `POST /api/projects/[id]/team`（現有專案） | ✅ |
| Read | 專案詳細頁 Team tab | `GET /api/projects/[id]` 包含 | ✅ |
| Update | `ProjectEditDialog` 團隊 Tab 編輯角色/職責 | `PUT /api/projects/[id]/team/[memberId]` | ✅ |
| Delete | `ProjectEditDialog` 團隊 Tab 移除按鈕 | `DELETE /api/projects/[id]/team/[memberId]` | ✅ |

### 已實作項目：
- ✅ `POST /api/projects/[id]/team` — 新增成員到現有專案（支援 userId / email / name 解析）
- ✅ `PUT /api/projects/[id]/team/[memberId]` — 更新成員角色/職責
- ✅ `DELETE /api/projects/[id]/team/[memberId]` — 移除成員
- ✅ `ProjectEditDialog` 團隊管理 Tab — 含新增成員表單（`NameAutocompleteInput` 搜尋使用者）、編輯角色/職責、移除成員
- ✅ 專案詳細頁 `onTeamChange` 回調，修改團隊後自動重新載入專案資料

---

## ✅ 4. Milestone（里程碑）

| 操作 | UI | API | 狀態 |
|------|-----|-----|------|
| Create | 建專案時 + `ProjectEditDialog` 里程碑 Tab | `POST /api/projects`（建專案時）+ `POST /api/projects/[id]/milestones`（現有專案） | ✅ |
| Read | 專案詳細頁、Dashboard、Gantt | `GET /api/projects/[id]` 包含 | ✅ |
| Update | `ProjectEditDialog` 里程碑 Tab（inline 編輯名稱/日期） | `PUT /api/projects/[id]/milestones/[milestoneId]` | ✅ |
| Delete | `ProjectEditDialog` 里程碑 Tab 刪除按鈕 | `DELETE /api/projects/[id]/milestones/[milestoneId]` | ✅ |

### 已實作項目：
- ✅ `POST /api/projects/[id]/milestones` — 新增里程碑到現有專案（自動排序 sortOrder）
- ✅ `PUT /api/projects/[id]/milestones/[milestoneId]` — 更新名稱、到期日、狀態、排序
- ✅ `DELETE /api/projects/[id]/milestones/[milestoneId]` — 刪除里程碑（安全檢查：有任務時拒絕刪除）
- ✅ `ProjectEditDialog` 工作項目 Tab — `TimelineTable` 元件（拖放排序 `@dnd-kit/sortable`、inline 編輯名稱/週數/日期、展開/收合任務）
- ✅ 批次儲存模式 — `computeWorkItemsDiff` 計算差異，依序執行 delete tasks → delete milestones → create milestones → update milestones → create tasks → update tasks
- ✅ 專案詳細頁 `onWorkItemsChange` 回調，修改後自動重新載入專案資料

---

## ✅ 5. Task（任務）

| 操作 | UI | API | 狀態 |
|------|-----|-----|------|
| Create | 建專案時 + `ProjectEditDialog` 工作項目 Tab | `POST /api/projects`（建專案時）+ `POST /api/projects/[id]/tasks`（現有專案） | ✅ |
| Read | My Tasks、專案詳細頁 | `GET /api/projects/[id]` 包含 | ✅ |
| Update（詳細） | `ProjectEditDialog` 工作項目 Tab（inline 編輯） | `PUT /api/projects/[id]/tasks/[taskId]` | ✅ |
| Update（狀態） | My Tasks 有「標記完成/取消完成」按鈕 | `PUT /api/projects/[id]/tasks/[taskId]`（status + progress） | ✅ |
| Delete | `ProjectEditDialog` 工作項目 Tab 刪除按鈕 | `DELETE /api/projects/[id]/tasks/[taskId]` | ✅ |

### 已實作項目：
- ✅ `POST /api/projects/[id]/tasks` — 新增任務到現有專案（指定 milestoneId、title、assignee、priority、起訖日期）
- ✅ `PUT /api/projects/[id]/tasks/[taskId]` — 更新任務所有欄位（title、description、assignee、priority、status、progress、startDate、endDate、milestoneId）
- ✅ `DELETE /api/projects/[id]/tasks/[taskId]` — 刪除任務，自動觸發 `syncMilestoneStatus` 重算里程碑狀態
- ✅ `ProjectEditDialog` 工作項目 Tab — `TimelineTable` 元件（inline 新增/編輯任務標題/日期/指派人/優先度 cycling、拖放排序、刪除）
- ✅ `/my-tasks` 頁面已遷移至 API — 透過 `GET /api/my-tasks` 載入資料，「標記完成/取消完成」呼叫 `PUT` 更新 status
- ✅ 任務狀態/進度變更後自動觸發 `syncMilestoneStatus` 重算里程碑狀態與進度
- ✅ 專案詳細頁 `onWorkItemsChange` 回調，修改後自動重新載入專案資料

---

## 6. TaskDependency（任務相依性）

| 操作 | UI | API | 狀態 |
|------|-----|-----|------|
| Create（自動） | 無手動建立 UI | 建專案時自動建立（順序鏈接） | ✅（僅建專案時自動） |
| Read | 專案詳細頁「任務相依分析」Tab | `GET /api/projects/[id]` 包含 `dependsOn` | ✅ |
| Rebuild（重建） | 無獨立 UI（編輯工作項目時觸發） | `POST /api/projects/[id]/rebuild-dependencies` | ✅ |
| Update（手動新增/移除） | ❌ | ❌ | ❌ |
| Delete | 無 | Task 刪除時 Cascade 自動清除 | ✅（自動） |

### 已實作項目：
- ✅ 建專案時自動建立順序相依（同里程碑內 task[i]→task[i+1]，跨里程碑 last→first）
- ✅ `POST /api/projects/[id]/rebuild-dependencies` — 重建專案所有任務的順序相依關係（刪除舊關係 → 依里程碑排序重建）
- ✅ API 回傳 task 包含 `dependsOn` 相依資料
- ✅ `TaskDependencyAnalysis` 元件 — 含甘特圖 + Bezier 箭頭連線 + 關鍵路徑分析 + 延遲影響分析
- ✅ `lib/dependency-graph.ts` — 相依圖工具函式（`buildDepGraph`、`computeImpact`）

### 缺少項目：
- `POST /api/tasks/[id]/dependencies` — 手動設定前置任務
- `DELETE /api/tasks/[id]/dependencies/[prerequisiteId]` — 手動移除相依關係
- 任務詳細 Dialog 中的「前置任務」選擇器
- 循環相依檢測（Cycle Detection）

---

## ✅ 7. TaskLog（任務日誌 / 工作紀錄）

| 操作 | UI | API | 狀態 |
|------|-----|-----|------|
| Create | My Tasks 任務 Dialog 有新增日誌表單 | `POST /api/projects/[id]/task-logs` | ✅ |
| Read | My Tasks 任務 Dialog + `GET /api/my-tasks` 回傳 taskLogs | `GET /api/my-tasks` 包含 taskLogs | ✅ |
| Update | My Tasks 任務 Dialog 編輯日誌（inline edit） | `PUT /api/projects/[id]/task-logs/[logId]` | ✅ |
| Delete | My Tasks 任務 Dialog 刪除日誌按鈕 | `DELETE /api/projects/[id]/task-logs/[logId]` | ✅ |

### 已實作項目：
- ✅ `POST /api/projects/[id]/task-logs` — 建立任務日誌（含 taskId、userId、logDate、content，驗證任務和使用者存在）
- ✅ `PUT /api/projects/[id]/task-logs/[logId]` — 更新日誌（logDate、content），日期變更時自動重算任務進度
- ✅ `DELETE /api/projects/[id]/task-logs/[logId]` — 刪除日誌，刪除後自動重算任務進度與里程碑狀態
- ✅ `GET /api/my-tasks` — 回傳使用者所屬專案的所有 taskLogs（含 author 名稱）
- ✅ `/my-tasks` 頁面任務 Dialog — 新增/編輯/刪除日誌皆已串接 API，含 optimistic update
- ✅ 日誌變更後自動觸發 `syncTaskProgressFromLogs` + `syncMilestoneStatus` 重算進度

---

## ✅ 8. Risk（風險）

| 操作 | UI | API | 狀態 |
|------|-----|-----|------|
| Create | 建專案時 + `ProjectEditDialog` 風險管理 Tab | `POST /api/projects`（建專案時）+ `POST /api/projects/[id]/risks`（現有專案） | ✅ |
| Read | 專案詳細頁 Risks tab、Dashboard | `GET /api/projects/[id]` 包含 | ✅ |
| Update | `ProjectEditDialog` 風險管理 Tab（inline 編輯） | `PUT /api/projects/[id]/risks/[riskId]` | ✅ |
| Delete | `ProjectEditDialog` 風險管理 Tab 刪除按鈕 | `DELETE /api/projects/[id]/risks/[riskId]` | ✅ |

### 已實作項目：
- ✅ `POST /api/projects/[id]/risks` — 新增風險到現有專案（含 title、description、impact、probability、mitigation）
- ✅ `PUT /api/projects/[id]/risks/[riskId]` — 更新風險所有欄位（含 status 變更：open → mitigated → closed）
- ✅ `DELETE /api/projects/[id]/risks/[riskId]` — 刪除風險
- ✅ `ProjectEditDialog` 風險管理 Tab — 含 `RiskCard`（檢視/編輯模式切換）+ `RiskAddForm`（新增風險表單）
- ✅ 風險狀態標籤（未處理/已緩解/已關閉）含色彩區分
- ✅ 專案詳細頁 `onRiskChange` 回調，修改風險後自動重新載入專案資料

---

## 🗑️ 9. WeeklyUpdate（週報）— 已棄用

> **已棄用。** 舊的週報提交頁面（`/projects/[id]/update`）已從系統中移除入口，不再使用。
>
> 週報功能已被專案詳細頁的「更新紀錄」Tab + 「AI 報告產生」功能取代：
> - **更新紀錄 Tab** — 自動彙整自任務日誌（TaskLog）的每週活動紀錄，按成員/日期分組顯示
> - **AI 報告產生** — 可選擇週報/月報、PPT/Word/PDF 格式，自動從 DB 資料產生報告
>
> Schema 中的 `WeeklyUpdate` / `MilestoneUpdate` 資料表目前未被使用，可在未來清理時移除。

### 🗑️ 可清理項目：
- `app/projects/[id]/update/page.tsx` — 舊週報提交頁面（已無入口，使用 `useProjectStore`，可安全刪除）
- Prisma Schema 中的 `WeeklyUpdate` / `MilestoneUpdate` Model（目前無 API 使用，可選擇保留或移除）
- ~~`GET /api/dashboard` 中的 `missingUpdates` 區段~~ — ✅ 已改為基於 TaskLog 的活動追蹤（判斷本週是否有 TaskLog 記錄）

---

## ~~10. MilestoneUpdate（里程碑週報更新）~~ — 已棄用

> 隨 WeeklyUpdate 一起棄用。舊的里程碑週報更新已被「更新紀錄」Tab 的任務日誌彙整取代。

---

## ✅ 11. DelayRequest（延遲申請）

| 操作 | UI | API | 狀態 |
|------|-----|-----|------|
| Create | `/my-tasks` 頁面「申請延期」按鈕 | `POST /api/delay-requests` | ✅ |
| Read | `/approvals` 頁面顯示列表 | `GET /api/delay-requests`（支援 status / projectId 篩選） | ✅ |
| Update（審核） | `/approvals` 有核准/駁回按鈕 | `PATCH /api/delay-requests/[id]/review` | ✅ |
| Delete | ❌ | ❌ | ❌（可選） |

### 已實作項目：
- ✅ `POST /api/delay-requests` — 建立延遲申請（含 AffectedMilestone），驗證專案和申請人存在
- ✅ `GET /api/delay-requests` — 列出延遲申請（支援 `?status=pending&projectId=xxx` 篩選），包含專案里程碑、申請人、審核人、支援解決資訊
- ✅ `PATCH /api/delay-requests/[id]/review` — 核准或駁回延遲申請
  - 核准時自動級聯更新：更新受影響里程碑日期 → 重算後續里程碑 → 重算所有任務日期 → 更新專案結束日期 → 重設基線
  - 駁回時僅更新申請狀態
- ✅ `/approvals` 頁面已完全遷移至 API — 透過 `GET /api/delay-requests` 載入資料，審核操作呼叫 `PATCH`
- ✅ `/my-tasks` 頁面「申請延期」功能 — 任務為 at-risk/overdue/not-started 時顯示「申請延期」按鈕，提交延遲原因、建議新日期、所需支援，呼叫 `POST /api/delay-requests`

### 缺少項目：
- `DELETE /api/delay-requests/[id]` — 刪除延遲申請（可選，通常不需要刪除已提交的申請）

---

## 12. AffectedMilestone（受影響里程碑）

> 作為 DelayRequest 的子項目，隨延遲申請 API 一起處理，不需獨立 API。已在 `POST /api/delay-requests` 中自動建立。

---

## 13. Notification（通知）

| 操作 | UI | API | 狀態 |
|------|-----|-----|------|
| Create | 無（應由後端事件自動觸發） | ❌ | ❌ |
| Read | NotificationBell 元件顯示 | **無 API** | 🖥️ 從 store 讀取 |
| Update（已讀） | 點擊通知標記已讀 | **無 API** | 🖥️ 無法持久化 |
| Delete（清除） | Settings 有清除按鈕 | **無 API** | 🖥️ 無法持久化 |

### 缺少項目：
- `GET /api/notifications` — 取得當前使用者的通知列表
- `PATCH /api/notifications/[id]/read` — 標記單則通知為已讀
- `PATCH /api/notifications/read-all` — 全部標記已讀
- `DELETE /api/notifications` — 清除所有通知
- 後端通知觸發邏輯（任務指派、延遲提交、到期提醒等）

---

## ✅ 14. ProjectDraft（專案草稿）

| 操作 | UI | API | 狀態 |
|------|-----|-----|------|
| Create | `/projects/new` 儲存草稿 | `POST /api/drafts` | ✅ |
| Read | 載入草稿 Dialog | `GET /api/drafts` | ✅ |
| Update | 自動儲存 | `PUT /api/drafts/[id]` | ✅ |
| Delete | 刪除草稿按鈕 | `DELETE /api/drafts/[id]` | ✅ |

---

## ✅ 15. MilestoneBaseline（里程碑基線）

| 操作 | UI | API | 狀態 |
|------|-----|-----|------|
| Create | 建專案時自動建立 | `POST /api/projects` 內建立 | ✅（自動） |
| Read | Gantt 圖中顯示基線對比 | `GET /api/projects/[id]` 包含 | ✅ |
| Reset（重設基線） | 專案詳細頁「工作項目」Tab 重設基線按鈕 | `POST /api/projects/[id]/reset-baseline` | ✅ |
| Reset（延遲核准時自動重設） | 延遲申請核准時自動觸發 | `PATCH /api/delay-requests/[id]/review` 內含 | ✅（自動） |
| Update | 不需要（基線是歷史快照） | — | — |
| Delete | 不需要 | — | — |

### 已實作項目：
- ✅ `POST /api/projects/[id]/reset-baseline` — 以目前里程碑日期建立新基線快照（事務性操作：先刪舊基線再建新基線）
- ✅ `MilestoneTaskView` 元件中的「重設基線」按鈕呼叫此 API
- ✅ 延遲申請核准時自動重設基線到新日期（在 `PATCH /api/delay-requests/[id]/review` 交易中執行）

---

## ✅ 16. ProjectCodeSequence（專案編號序列）

> 內部使用的計數器，建專案時自動遞增，不需要 CRUD UI 或獨立 API。

---

## 待開發 API 總覽（依優先級排序）

### ✅ 已完成 API

| # | API 路由 | 方法 | 說明 |
|---|---------|------|------|
| — | `/api/projects` | `GET` | ✅ 取得專案列表（含篩選） |
| — | `/api/projects` | `POST` | ✅ 建立專案（含里程碑/任務/團隊/風險/相依/基線） |
| — | `/api/projects/[id]` | `GET` | ✅ 取得專案詳細（含所有子項目） |
| — | `/api/projects/[id]` | `PUT` | ✅ 更新專案基本資訊、狀態、預算等 |
| — | `/api/projects/[id]` | `DELETE` | ✅ 刪除專案（Cascade） |
| — | `/api/projects/[id]/team` | `POST` | ✅ 新增團隊成員到現有專案 |
| — | `/api/projects/[id]/team/[memberId]` | `PUT` | ✅ 更新成員角色/職責 |
| — | `/api/projects/[id]/team/[memberId]` | `DELETE` | ✅ 移除團隊成員 |
| — | `/api/projects/[id]/risks` | `POST` | ✅ 新增風險到現有專案 |
| — | `/api/projects/[id]/risks/[riskId]` | `PUT` | ✅ 更新風險內容與狀態 |
| — | `/api/projects/[id]/risks/[riskId]` | `DELETE` | ✅ 刪除風險 |
| — | `/api/projects/[id]/milestones` | `POST` | ✅ 新增里程碑到現有專案 |
| — | `/api/projects/[id]/milestones/[milestoneId]` | `PUT` | ✅ 更新里程碑名稱/日期/狀態 |
| — | `/api/projects/[id]/milestones/[milestoneId]` | `DELETE` | ✅ 刪除里程碑（有任務時拒絕） |
| — | `/api/projects/[id]/tasks` | `POST` | ✅ 新增任務到現有專案 |
| — | `/api/projects/[id]/tasks/[taskId]` | `PUT` | ✅ 更新任務所有欄位（含 status） |
| — | `/api/projects/[id]/tasks/[taskId]` | `DELETE` | ✅ 刪除任務 |
| — | `/api/projects/[id]/task-logs` | `POST` | ✅ 建立任務工作日誌 |
| — | `/api/projects/[id]/task-logs/[logId]` | `PUT` | ✅ 更新工作日誌（日期/內容），自動重算進度 |
| — | `/api/projects/[id]/task-logs/[logId]` | `DELETE` | ✅ 刪除工作日誌，自動重算進度 |
| — | `/api/projects/[id]/reset-baseline` | `POST` | ✅ 以目前里程碑日期重設基線快照 |
| — | `/api/projects/[id]/rebuild-dependencies` | `POST` | ✅ 重建專案任務的順序相依關係 |
| — | `/api/my-tasks` | `GET` | ✅ 取得使用者所屬專案的任務/日誌 |
| — | `/api/dashboard` | `GET` | ✅ 儀表板聚合資料（統計、風險、里程碑、本週未更新、待審核數） |
| — | `/api/reports` | `GET` | ✅ 報告聚合資料（統計、狀態分佈、專案詳細、團隊工作量） |
| — | `/api/reports/pdf` | `POST` | ✅ 生成 PDF 報告（HTML 格式） |
| — | `/api/delay-requests` | `GET` | ✅ 列出延遲申請（支援 status/projectId 篩選） |
| — | `/api/delay-requests` | `POST` | ✅ 建立延遲申請（含受影響里程碑） |
| — | `/api/delay-requests/[id]/review` | `PATCH` | ✅ 核准/駁回延遲申請（核准時級聯更新日期+重設基線） |
| — | `/api/drafts` | `GET` | ✅ 取得使用者草稿列表 |
| — | `/api/drafts` | `POST` | ✅ 建立專案草稿 |
| — | `/api/drafts/[id]` | `PUT` | ✅ 更新草稿 |
| — | `/api/drafts/[id]` | `DELETE` | ✅ 刪除草稿 |
| — | `/api/users/search` | `GET` | ✅ 搜尋使用者（by name/email） |
| — | `/api/users/[id]` | `GET` | ✅ 取得使用者資料 + 統計 + 近期日誌 + 參與專案 |
| — | `/api/users/[id]` | `PUT` | ✅ 更新使用者資料（name/email/organization），含 email 唯一性檢查 |

### 🟡 中優先 — 重要流程缺失

| # | API 路由 | 方法 | 說明 |
|---|---------|------|------|
| 4 | `/api/notifications` | `GET` | 取得使用者通知列表 |
| 5 | `/api/notifications/[id]/read` | `PATCH` | 標記通知已讀 |
| 6 | `/api/notifications/read-all` | `PATCH` | 全部標記已讀 |

### 🟢 低優先 — 進階管理功能

| # | API 路由 | 方法 | 說明 |
|---|---------|------|------|
| 7 | `/api/tasks/[id]/dependencies` | `POST/DELETE` | 任務相依性手動管理（自動建立已完成） |

---

## 待開發 UI 總覽

### ✅ 已完成 UI

| # | 頁面 / 元件 | 說明 |
|---|------------|------|
| — | 專案編輯功能 | ✅ `ProjectEditDialog` 彈窗 + 專案詳細頁「編輯」按鈕 |
| — | 專案刪除功能 | ✅ `ProjectDeleteDialog` 確認彈窗 + 專案詳細頁「刪除」按鈕 |
| — | 團隊管理功能 | ✅ `ProjectEditDialog` 團隊 Tab — 新增/編輯/移除成員（含 `NameAutocompleteInput` 使用者搜尋） |
| — | 風險管理功能 | ✅ `ProjectEditDialog` 風險管理 Tab — `RiskCard`（檢視/編輯切換）+ `RiskAddForm`（新增風險） |
| — | 里程碑 + 任務管理功能 | ✅ `ProjectEditDialog` 工作項目 Tab — `TimelineTable` 元件（拖放排序、inline 編輯、批次儲存 `computeWorkItemsDiff`） |
| — | 任務日誌 CRUD | ✅ `/my-tasks` 頁面任務 Dialog — 新增/編輯/刪除日誌皆已串接 API |
| — | 基線重設功能 | ✅ 專案詳細頁「工作項目」Tab — `POST /api/projects/[id]/reset-baseline` |
| — | 任務相依性分析 | ✅ 專案詳細頁「任務相依分析」Tab（Gantt 箭頭 + 關鍵路徑 + 影響分析） |
| — | Dashboard 頁面 | ✅ 已遷移至 `/api/dashboard`（KPI 統計、風險列表、里程碑、本週未更新、待審核） |
| — | Reports 頁面 | ✅ 已遷移至 `/api/reports`（含 PDF 生成 `/api/reports/pdf`） |
| — | Approvals 頁面 | ✅ 已遷移至 `/api/delay-requests`（含核准/駁回操作） |
| — | Profile 頁面 | ✅ 已遷移至 `/api/users/[id]`（GET 載入 + PUT 更新，含統計、近期日誌、參與專案列表、組織欄位） |

### 待開發 UI

| # | 頁面 / 元件 | 說明 |
|---|------------|------|
| 1 | 任務相依性手動編輯 | 無法手動新增/移除相依關係（僅建專案時自動建立） |
| 2 | 通知列表頁面 | 目前只有 bell icon，沒有完整通知歷史頁 |
| 3 | 使用者管理頁面 | 管理者檢視/編輯所有使用者（可選功能） |

### 🗑️ 可清理的遺留頁面

| # | 頁面 / 元件 | 說明 |
|---|------------|------|
| 1 | `/gantt` 獨立頁面 | `app/gantt/page.tsx` 已從側邊導覽移除，無入口可到達。使用 `useProjectStore`（localStorage），可安全刪除。注意：`GanttChart` 元件仍在專案詳細頁使用中，不可刪除 |
| 2 | `/projects/[id]/update` 週報頁面 | `app/projects/[id]/update/page.tsx` 已無入口。週報功能已被「更新紀錄」Tab + 「AI 報告產生」取代，可安全刪除 |
| 3 | `WeeklyUpdate` / `MilestoneUpdate` Schema | Prisma Schema 中的兩個 Model 目前無 API 使用，可選擇保留或移除 |

---

## ⚠️ 架構問題：雙軌資料來源

目前系統存在 **API 頁面與 localStorage 頁面並存** 的問題，但已大幅改善：

### ✅ 已遷移至 API 的頁面

| 頁面 | 資料來源 | 說明 |
|------|---------|------|
| `/projects`（列表） | 僅 API | ✅ `fetch('/api/projects')` |
| `/projects/[id]`（詳細） | 僅 API | ✅ `fetch('/api/projects/${id}')` + PUT/DELETE |
| `/projects/new`（建立） | API 建立 + API 草稿 | ✅ 手動模式：`POST /api/projects` + `/api/drafts`；AI 模式：顯示「功能開發中」 |
| `/my-tasks`（我的任務） | 僅 API | ✅ `GET /api/my-tasks` + `PUT /tasks` + `POST/PUT/DELETE /task-logs` + `POST /api/delay-requests`（申請延期） |
| `/dashboard`（儀表板） | 僅 API | ✅ `GET /api/dashboard`（含角色權限過濾、即時計算專案狀態/進度、基於 TaskLog 的本週未更新追蹤） |
| `/reports`（報告） | 僅 API | ✅ `GET /api/reports` + `POST /api/reports/pdf` |
| `/approvals`（延遲審核） | 僅 API | ✅ `GET /api/delay-requests` + `PATCH .../review` |
| `/profile`（個人資料） | 僅 API | ✅ `GET /api/users/[id]` + `PUT /api/users/[id]`（含統計、近期日誌、參與專案） |

### ❌ 仍使用 localStorage 的頁面

| 頁面 | 使用的 store 方法 | 問題 |
|------|------------------|------|
| `/settings` | `useNotificationStore`（localStorage） | ⚠️ 通知偏好直接存 localStorage（此為設定頁面，影響較低） |

### 根本原因

**`lib/project-store.tsx`** 初始化時只讀 localStorage（或 MOCK_PROJECTS），**不會呼叫 API**。目前僅剩已棄用的 `/gantt` 和 `/projects/[id]/update` 頁面仍依賴此 store。

> **特別注意：** `/projects/new` 的 AI 解析模式目前顯示「功能開發中」提示，手動建立模式已完全走 `POST /api/projects`。但 `addProject`（store）仍被 import，屬於遺留程式碼。

**建議：** 刪除已棄用的 `/gantt` 和 `/projects/[id]/update` 頁面後，即可移除 `lib/project-store.tsx`。

---

## 🔧 自動同步機制（Auto-Sync）

系統已實作一套自動同步機制，確保任務/里程碑的狀態和進度保持一致：

### 工具函式 — `lib/sync-milestone-status.ts`

| 函式 | 說明 |
|------|------|
| `syncMilestoneStatus(milestoneId, projectId)` | 根據里程碑下所有任務的狀態/進度，重算里程碑的 status（todo/in_progress/done）與 progress（任務進度平均值） |
| `autoProgressTasks(tasks)` | 自動將 `startDate` 已過但狀態仍為 `todo` 的任務轉為 `in_progress`，回傳更新的任務 ID 列表 |
| `syncTaskProgressFromLogs(tasks, taskLogs)` | 根據任務日誌覆蓋率計算任務進度（唯一日誌日期數 / 任務期間天數 × 100，上限 100%；已完成任務強制 100%） |

### 觸發時機

| 操作 | 觸發的同步 |
|------|-----------|
| `PUT /api/projects/[id]/tasks/[taskId]`（status/progress 變更） | `syncMilestoneStatus` |
| `DELETE /api/projects/[id]/tasks/[taskId]` | `syncMilestoneStatus` |
| `POST /api/projects/[id]/task-logs` | `syncTaskProgressFromLogs` + `syncMilestoneStatus` |
| `PUT /api/projects/[id]/task-logs/[logId]`（日期變更） | `syncTaskProgressFromLogs` + `syncMilestoneStatus` |
| `DELETE /api/projects/[id]/task-logs/[logId]` | `syncTaskProgressFromLogs` + `syncMilestoneStatus` |
| `GET /api/projects/[id]` | `autoProgressTasks` + `syncTaskProgressFromLogs` |
| `GET /api/my-tasks` | `autoProgressTasks` + `syncTaskProgressFromLogs` + 里程碑狀態重算 |
| `PATCH /api/delay-requests/[id]/review`（核准） | 級聯更新里程碑/任務日期 + 重設基線 |

### 工具函式 — `lib/timeline-utils.ts`

| 函式 | 說明 |
|------|------|
| `calculateMilestoneDates(milestones, projectStartDate, tasks)` | 依序排程里程碑日期（有效期間 = max(milestone.durationWeeks, 任務總週數)） |
| `calculateTaskDates(tasks, milestones)` | 在里程碑日期範圍內依序排程任務，回傳 Map\<taskId, {startDate, endDate}\> |
| `autoExpandMilestones(milestones, tasks)` | 當任務總週數超過里程碑期間時自動擴展里程碑 |
| `dbToTimelineState(dbMilestones, dbTasks, projectStartDate)` | 將 DB 資料轉換為 `TimelineTable` 格式 |
| `computeWorkItemsDiff(orig, current, taskDates)` | 計算里程碑/任務的批次變更差異（新增/更新/刪除），供 `ProjectEditDialog` 批次儲存使用 |

---

## 總結

```
已完成     ████████████████░ ~90%
只有前端   ░░░░░░░░░░░░░░░░ ~2%   ← 僅通知系統缺 API
已棄用     █░░░░░░░░░░░░░░░ ~5%   ← 可清理（/gantt、/projects/[id]/update、WeeklyUpdate Schema）
完全未做   ░░░░░░░░░░░░░░░░ ~3%
```

### API 統計

| 項目 | 數量 |
|------|------|
| API 路由檔案 | 24 個 |
| API 端點（HTTP 方法） | 36 個（GET: 9, POST: 10, PUT: 9, DELETE: 5, PATCH: 1, + 複合） |
| 工具函式檔案 | 3 個（`sync-milestone-status.ts`、`timeline-utils.ts`、`dependency-graph.ts`） |

**已完成模組（API + UI 完整）：** User（Profile 頁面 + GET/PUT API）、Project、ProjectTeamMember、Milestone、Task（含 My Tasks 頁面 API 遷移）、Risk、TaskLog（完整 CRUD）、ProjectDraft、TaskDependency（自動建立 + 重建）、MilestoneBaseline（含重設基線 + 延遲核准自動重設）、DelayRequest（完整提交/列表/審核流程） — 共 11/16 個模組具有實質 API 覆蓋。

**已遷移至 API 的頁面：** `/projects`、`/projects/[id]`、`/projects/new`、`/my-tasks`、`/dashboard`、`/reports`、`/approvals`、`/profile` — 共 8/11 個功能頁面。

**現狀：** 專案核心 CRUD 鏈路（專案 → 里程碑 → 任務 → 團隊 → 風險 → 草稿 → 任務日誌 → 延遲申請）已全部具備完整的 API 後端和 UI。儀表板、報告、延遲審核頁面也已遷移至 API。

- `ProjectEditDialog` 6 分頁 UI（基本資訊、SMART、專案說明、團隊成員、風險管理、工作項目）覆蓋所有專案子項目的 CRUD
- `TimelineTable` 元件支援拖放排序（`@dnd-kit/sortable`）、inline 新增/編輯/刪除里程碑和任務
- `computeWorkItemsDiff` 批次差異計算 + 6 步驟批次儲存（delete tasks → delete milestones → create milestones → update milestones → create tasks → update tasks）
- `/my-tasks` 頁面已完成 API 遷移 — 任務狀態更新、工作日誌完整 CRUD（新增/編輯/刪除）、申請延期（`POST /api/delay-requests`）皆透過 API
- 自動同步機制 — 任務/日誌變更自動觸發里程碑狀態與進度重算（`syncMilestoneStatus`、`syncTaskProgressFromLogs`）
- 任務自動推進 — `autoProgressTasks` 將已過 startDate 的 todo 任務自動轉為 in_progress
- 延遲申請核准時自動級聯更新日期 + 重設基線
- Dashboard/Reports API 自動計算專案狀態/進度（從任務即時計算，不依賴手動設定）

**剩餘問題：** 通知系統仍缺少 API 後端（僅 localStorage）。`/gantt` 和 `/projects/[id]/update` 頁面已棄用，可安全刪除。

**建議開發順序：**
1. **通知系統** — 建立通知 API 端點 + 後端觸發邏輯
2. **清理遺留** — 刪除 `app/gantt/page.tsx`、`app/projects/[id]/update/page.tsx`，確認所有頁面不再依賴 `useProjectStore` 後，移除 `lib/project-store.tsx`
