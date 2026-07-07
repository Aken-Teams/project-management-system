# 系統體檢與現況總覽（System Audit）

> **用途**：本文件是整個系統的「現況地圖」與「已知問題清單」，作為後續改需求時的對照基準。
> 每次客戶提出新需求 → 對照本文判斷會踩到哪些地基問題 → 實作 → 自動測試 + 手動測試。
>
> **建立**：2026-07-07（完整一次性體檢，涵蓋 PRD、26 個資料模型、71 個 API、23 個頁面、核心邏輯、背景排程、權限落實）
> **維護方式**：每次改動後更新對應章節；修掉的 bug 移到「已修正」區並註記 commit。

---

## 目錄
1. [定位與流程](#一定位與流程)
2. [系統架構地圖](#二系統架構地圖)
3. [需求演進現況](#三需求演進現況)
4. [隱藏功能 / 死碼清單](#四隱藏功能--死碼清單)
5. [隱藏 Bug 清單（依嚴重度）](#五隱藏-bug-清單依嚴重度)
6. [測試清單（回歸測試用）](#六測試清單回歸測試用)
7. [變更紀錄](#七變更紀錄)
8. [架構決策紀錄 ADR-01：相依功能與日期模型](#八架構決策紀錄-adr-01相依功能與日期模型)

---

## 一、定位與流程

**系統定位**：企業內部的「專案全生命週期管理平台」。核心價值＝把散落在 Email/Excel 的專案資訊集中，用**自動計算的健康度燈號**與**報表**，讓 PM 與主管即時掌握專案偏離狀況。

### 兩套角色（最易混淆，務必分清）
| 類型 | 值 | 決定什麼 |
|------|-----|----------|
| **系統角色**（登入身分） | `PM / Member / Executive / Admin` | 能進哪些頁面、看哪些功能 |
| **專案角色**（每專案各自指派，RACI+PS） | `R負責 / A當責 / C諮詢 / I知會 / P採購 / S審核` | 在「我的任務」看到哪些頁籤、能否審核延期 |

> ⚠️ 這兩套並存是刻意設計，但**權限落實極不一致**（見第五章 Bug #1），是需求反覆最大的後遺症。

### 四階段主流程
1. **啟動**：PM 建案（AI 或手動精靈）→ 填 SMART 目標、預算、RACI 團隊、套里程碑範本 → 支援草稿自動儲存。
2. **規劃**：時間軸表格（TimelineTable）拖放建里程碑/任務/子任務 → 批次存檔（computeWorkItemsDiff → 6 步 API）→ 甘特圖預覽。
3. **執行**：成員在「我的任務」寫工作日誌 → 系統**自動**推算任務進度、里程碑狀態、專案燈號 → PM 交週報。
4. **審核**：成員提延期申請 → S 角色審核 → 核准時級聯更新日期 + 重設基線 → 主管看儀表板 KPI/風險。

### 健康度燈號規則（自動計算，PM 無法手動覆蓋）
- 🟢 綠：全部任務完成，或無逾期/受阻。
- 🟡 黃：有任何逾期或受阻任務（未達紅燈門檻）。
- 🔴 紅：逾期任務 >30%、受阻 >20%、或已過專案截止日仍有未完成任務。

---

## 二、系統架構地圖

### 技術棧
| 項目 | 選型 |
|------|------|
| 前端 | Next.js 16 App Router + React 19 + TypeScript |
| UI | shadcn/ui + Radix + Tailwind |
| DB | MySQL/MariaDB + Prisma 7（`@prisma/adapter-mariadb`）；用 `prisma db push`（shadow DB 權限問題無法 migrate） |
| 驗證 | Mock（`x-user-email` header + localStorage，登入後從 DB 同步角色） |
| 甘特圖 | 自建 GanttChart + GanttDependencyOverlay |
| PDF/Excel | jsPDF（前端）/ Puppeteer（後端排程）/ ExcelJS |
| 排程 | node-cron（每小時觸發，route 內判斷是否到排程時間） |
| 圖表/拖放/語音 | Recharts / @dnd-kit / Web Speech API |

### 頁面（23 個）
**掛在側邊 nav（6）**：儀表板、我的任務、專案看板、報告、審核中心、管理後台（adminOnly）
**其他入口**：使用指南（nav 底部）、個人資料/設定（右上下拉）、通知中心（鈴鐺）、公開分享（免登入）
**Admin 子頁**：users / roles / project-settings / notifications / reports / schedule
**🚩 孤兒頁（無入口）**：`/gantt`、`/projects/[id]/update`

### 專案詳情頁籤（`/projects/[id]`）
概覽 overview｜投資報酬 capex（條件顯示）｜工作項目 work-items（里程碑/任務/甘特）｜更新紀錄 updates｜風險 risks｜延遲紀錄 delays

### 維護熱點（超大檔，改動高風險）
- `components/task-detail-sheet.tsx`（~135KB）
- `components/project-edit-dialog.tsx`（~118KB，含批次存檔邏輯）
- `app/my-tasks/page.tsx`（~2986 行）
- `app/projects/new/page.tsx`（~2915 行，AI/手動兩套幾乎平行複製）
- `components/weekly-activity-summary.tsx`（~70KB）、`components/gantt-chart.tsx`（~67KB）、`components/timeline-table.tsx`（~56KB）

### 資料模型（26 個）
User, Project, ProjectTeamMember(RACI), Milestone, MilestoneBaseline, Task(子任務 parentId), TaskDependency, TaskLog, Risk, WeeklyUpdate, MilestoneUpdate, DelayRequest, AffectedMilestone, DelayReviewDecision, Notification(8 型), ProjectDraft, ShareLink, ProjectBudgetItem, ProjectCodeSequence, SystemSetting, NotificationProfile, MilestoneTemplateConfig, MilestoneTemplateTask, ProjectTypeConfig, CronJobLog, CapexItem, MemberWeeklyReport

### 背景排程（2 個 cron，`instrumentation.ts` 每小時觸發）
- **weekly-notification**：查各專案 PM 是否交週報，未交 → 發站內通知 + Email 給團隊成員。
- **weekly-report**：Puppeteer 產全專案摘要 PDF → 寄給 Executive/PM。
- 執行紀錄寫入 `CronJobLog`。

---

## 三、需求演進現況

PRD（`docs/prd.md` v3.0）以三色標記記錄演進：

| 階段 | 內容 | 狀態 |
|------|------|------|
| **v1.0 原始** | 建案 / SMART / 時間軸 / 甘特 / 燈號 / 延期 / 基線 — 3 角色 | ✅ |
| **開發中追加（已交付）** | 工作日誌系統、DB 通知系統、週報、PDF/Excel、預算+ROI、里程碑範本、公開分享、**完整 Admin 後台**、RACI 4 角色、cron | ✅ 規模膨脹逾 2 倍 |
| **v3.0 規劃中（🔸 未做）** | 甘特圖重疊、里程碑/子任務日期編輯優化、KPI 指標、OTD 圖表、SMART 展示於詳情頁、專案章程簽署、編輯鎖定、ROI 增強 | 🔸 待開發 |

> **關鍵洞察**：大量「追加交付」功能是後來硬加的，底層地基（自動同步、權限、日期處理）沒有跟著重構 → 這就是「隱藏 bug」的根源。

---

## 四、隱藏功能 / 死碼清單

### 孤兒頁面（不在 nav、無任何入口連結）
| 頁面 | 判定 | 證據 |
|------|------|------|
| `app/gantt/page.tsx` | 🚩 死頁 + 破損 | 用舊 `useProjectStore`（localStorage，非 DB，資料可能空）；「調整視圖」按鈕無 onClick；「匯出」是 `alert('示範模式')`；含 v0 殘留 `console.log('[v0]...')` |
| `app/projects/[id]/update/page.tsx` | 🚩 孤兒 | 週報頁，已被「我的任務」MY/R 頁籤取代；唯一呼叫的 `/api/weekly-updates` 也已死 |

### 死 API 路由（無任何前端呼叫）
`admin/backfill-original-dates`、`admin/backfill-task-durations`、`admin/revert-backfill`、`admin/fix-project-starts`、`test-budget-table`、`projects/[id]/reset-baseline`、`weekly-updates`、`admin/fix-auto-emails`（唯一呼叫按鈕已被註解）

### 被停用的 UI
- `app/admin/schedule/page.tsx`：整個「測試預覽」卡包在 `{false && ...}`（連帶 NotifPreviewPanel/ReportPreviewPanel 等一批 dead component）。
- `app/admin/users/page.tsx`：「修正 auto.local Email」按鈕被註解（handler/state 變 dead code）。

### 半成品 / 裝飾性
- `app/dashboard/page.tsx`：member 的「我的任務」統計卡**硬編碼 0 / 0 已完成**。
- `app/settings/page.tsx`：通知偏好**只存 localStorage、未接後端**，實際產生通知時不讀取 → 裝飾開關；語言僅「繁體中文」死選項。
- `app/admin/reports/page.tsx`：無收件人編輯欄位，但預覽/儲存讀 `report.email.recipients` → 半接線。

### 放棄的舊路徑
- `components/kanban-board.tsx`：定義但從未 import/render → **可直接刪**。
- `lib/project-store.tsx`（zustand+localStorage）：幾乎全被 `/api/*`+DB 取代，僅剩 dashboard 徽章計數與孤兒 gantt 在用（移除 gantt 後可退役）。
- `lib/mock-data.ts`：MOCK_PROJECTS 已死，但 type/label 常數仍被大量 import（**不能整檔刪**）。

> 📌 `docs/crud-audit.md` 已獨立佐證 gantt、update、project-store 的棄用判定。

---

## 五、隱藏 Bug 清單（依嚴重度）

> 格式：`#編號 標題 — 說明（關鍵檔案:行）`。修正後移到第七章並打勾。
>
> ✅ **已修正（2026-07-07）**：#2、#7（窄修）、#8、#9、#10、#11 — 詳見第七章。剩餘待處理：#1、#3、#4（安全，第二層）、#5、#6（需 PRD 變更，第三層）。

### 🔴 嚴重（資料正確性 / 安全）

- **#1 權限三方打架**
  PRD 說 Member 不能看預算/所有專案/匯出；但 `lib/permissions.ts` 全開成 `true`、`canUserAccessProject()` 永遠 return true；而 **server 端整個 mutation 面（專案/預算/團隊/風險/里程碑/任務 CRUD）完全沒有角色檢查** → `permissions.ts` 只是 UI 裝飾，直接打 API 即可繞過。`GET /api/projects` 也不依成員過濾，回傳全部。
  檔案：`lib/permissions.ts`、`app/api/projects/**`、`app/api/projects/[id]/route.ts`

- **#2 進度數字來回震盪**
  `sync-milestone-status.ts` 用 durationDays **加權**算里程碑進度；但 GET 時 `projects/[id]/route.ts:42` 與 `my-tasks/route.ts:98` 用**未加權**平均重算並寫回。任務時長不等時，每讀一次翻一個值 → 專案 % 永遠不穩。子任務→父任務同樣加權/未加權不對稱（`tasks/[taskId]/route.ts:139` 未加權）。

- **#3 破壞性 admin 路由無 auth**
  `admin/backfill-original-dates`、`admin/backfill-task-durations`、`admin/revert-backfill`、`admin/fix-project-starts` 忘了 `isAuthorized` 守衛 → 任何人可觸發全域資料改寫。`PUT /api/users/[id]` 也完全無守衛，可改任何人 email/name/org。

- **#4 Cron fail-open**
  `guardCron` 在 `CRON_SECRET` 未設時 return true（放行），且 cron route `GET = POST` → 未設 secret 時任何人用瀏覽器打網址就能觸發真實通知/報告寄送。

### 🟠 高（邏輯錯亂）

- **#5 延期審核「單審 vs 多審」兩套並存打架**
  schema 從單一 `reviewerId` 演進到多人 `DelayReviewDecision`+`requiredReviewers`，兩套都還在。審核用 `Math.max(當前S人數, 儲存值, 1)` 讓兩來源互鬥：S 成員送出後被移除 → 申請**永遠無法核准**；無 S 成員的專案 → admin 按一次即自動核准並級聯改日期。UI 顯示進度（儲存值）與 server 門檻（當前值）不一致。
  檔案：`app/api/delay-requests/[id]/review/route.ts:125-143`、`app/approvals/page.tsx`

- **#6 核准延期會刪光全專案基線**
  `review` route 每次核准都 `milestoneBaseline.deleteMany({projectId})` 再用新日期重建 → 專案永遠看起來「準時」，**延期追蹤反而抹掉延期證據**。幾乎肯定非原意。
  檔案：`app/api/delay-requests/[id]/review/route.ts:305-323`

- **#7 manualDates 在 server 端未被尊重**
  使用者手動調寬的里程碑/任務日期，被 server 的 `autoExpandMilestones`/`repairTaskDates` 覆寫（前端 3 處有檢查，server 2 處沒有）。
  檔案：`lib/timeline-utils.ts:206+`、`app/api/projects/[id]/route.ts:222+`

- **#8 批次存檔靜默失敗**
  `project-edit-dialog` executeBatchSave 6 步 fetch 幾乎不檢查 `res.ok`，中途 500 留下半存檔的樹且無錯誤提示；新里程碑用 **name** 比對 draft id，同名/空名會把任務接到錯的里程碑。
  檔案：`components/project-edit-dialog.tsx:395、400-442`

### 🟡 中

- **#9 三套「今天」定義**：`sync-milestone-status.ts:74`（local 午夜）/ `project-transformer.ts:26`（UTC 字串）/ `task-utils.ts:18`（另一套）→ Asia/Taipei 會差一天，逾期判定在不同畫面不一致。
- **#10 autoProgress 讀 stale progress**：GET 時 `autoProgressTasks` 在 `syncTaskProgressFromLogs` 之前跑，用到上一輪舊 progress 判狀態（`projects/[id]/route.ts:32 → 35`）。
- **#11 父任務進度除以零**：`tasks/[taskId]/route.ts:139` `siblings.length` 可能為 0 → NaN 寫回。
- **#12 延期通知重複/對象錯**：提交延期時同發 `delay_submitted` + `support_needed` 給同一批 S 成員（重複）；收 `support_needed` 的 S 角色卻不是 UI 上能「解決協助」的人（executive/admin）。

---

## 六、測試清單（回歸測試用）

> 每次改動後跑這份清單。自動測試 = 我用腳本/API 呼叫驗證；手動測試 = 你在 UI 操作驗證。
> 目前專案**尚無自動化測試框架**，需先評估建置（見下方備註）。

### 冒煙測試（每次改動必跑）
- [ ] `pnpm build` 通過（TypeScript 無錯）
- [ ] `pnpm dev` 啟動、登入 4 種角色（admin/pm/member/executive，密碼 demo）皆正常
- [ ] 儀表板載入、專案列表載入、專案詳情 6 頁籤皆可開

### 核心流程測試
- [ ] **建案**：AI 模式 + 手動模式各建一個專案，草稿存/載/刪
- [ ] **時間軸編輯**：新增/編輯/刪除里程碑、任務、子任務；拖放排序；批次存檔後重載資料一致
- [ ] **工作日誌**：新增日誌 → 任務進度自動更新 → 里程碑狀態/進度自動更新 → 專案燈號正確
- [ ] **進度穩定性**（針對 Bug #2）：對「任務時長不等」的里程碑，連續重載專案詳情 3 次，里程碑/專案 % **不應變動**
- [ ] **延期申請**：成員提申請 → S 角色審核（單 S / 多 S / 無 S 三種情境，針對 Bug #5）→ 核准後日期級聯 + 基線是否保留（Bug #6）
- [ ] **manualDates**（針對 Bug #7）：手動調寬里程碑日期 → 存檔重載 → 日期**不應被自動貼齊**
- [ ] **權限**（針對 Bug #1）：member 直接打 mutation API 應被拒（修正後）
- [ ] **報表**：PDF 匯出、Excel 匯出、Email 報告
- [ ] **通知**：8 種通知類型觸發正確、鈴鐺未讀數、全部已讀
- [ ] **公開分享**：建連結 → 免登入開啟 → 過期/無效錯誤處理

### 備註
- 專案目前無 Jest/Playwright 等測試框架。若要「自動測試」，建議先建立最小 API 整合測試（針對第五章 Bug 的回歸案例）+ 關鍵頁面的 Playwright 冒煙測試。此項待客戶需求確認後決定投入程度。

---

## 七、變更紀錄

> 每次改需求 → 在此記錄：日期、需求摘要、改動檔案、修掉的 Bug 編號、測試結果。

| 日期 | 需求/改動摘要 | 改動檔案 | 修正 Bug | 測試結果 |
|------|--------------|---------|---------|---------|
| 2026-07-07 | 建立本體檢文件（基準線） | docs/system-audit.md | — | — |
| 2026-07-07 | 第一層純 bug 止血：進度加權統一、同步順序、今天定義、除以零、manualDates 窄修、批次存檔報錯 | lib/date-utils.ts（新）、lib/sync-milestone-status.ts、lib/project-transformer.ts、lib/task-utils.ts、app/api/projects/[id]/route.ts、app/api/my-tasks/route.ts、app/api/projects/[id]/tasks/[taskId]/route.ts、components/project-edit-dialog.tsx | #2 #7 #8 #9 #10 #11 | `tsc --noEmit`：改動檔案零型別錯；待手動 UI 測試 |
| 2026-07-07 | 手動測試場景 2.9 發現：里程碑無任務時甘特圖畫不出色條 + tooltip 位置/計畫日期 | components/gantt-chart.tsx、app/projects/new/page.tsx | #13 | tsc 零新錯；待 UI 複驗 |
| 2026-07-07 | 手動測試場景 4 發現：manual 草稿未存/未還原團隊成員與設備清單 | app/projects/new/page.tsx | #14 | tsc 零新錯；需存**新**草稿複驗（舊草稿無資料救不回） |
| 2026-07-07 | 設計變更 ADR-01 需求A：里程碑/子任務預設全收合 + 展開狀態依專案 id 記憶（localStorage）| components/timeline-table.tsx、app/projects/new/page.tsx、components/project-edit-dialog.tsx | ADR-01(A) | tsc 零新錯；待 UI 複驗 |
| 2026-07-07 | 設計變更 ADR-01 需求B：拔除編輯流程的依序/瀑布/envelope；改絕對日期（只留 start+天數→end）；里程碑完全手動、日期永遠可編輯；範本套用時 seed 一次 | lib/timeline-utils.ts、app/projects/new/page.tsx、components/project-edit-dialog.tsx、components/timeline-table.tsx | ADR-01(B) | tsc 零新錯；待 UI 重點測「改一列不動別列」 |
| 2026-07-07 | ADR-01(B) 後續：草稿補存 manualTasks（任務/子任務原本遺失）；加 seed effect（起始日已知但里程碑未 seed 時補排，修「里程碑全擠在專案起始日」+ 救舊草稿）| app/projects/new/page.tsx | #14b、ADR-01(B) | tsc 零新錯；需存**新**草稿複驗 |
| 2026-07-07 | 拖曳優化（新增+編輯）：放大拖曳「放入」判定區（中間 70%）；建案模式補接 onItemMove/onIndent/onOutdent（原本完全沒接，無法 reparent）；抽共用 `lib/timeline-tree.ts` moveTreeItem | components/timeline-table.tsx、app/projects/new/page.tsx、lib/timeline-tree.ts（新）| #15 拖曳 | tsc 零新錯；待 UI 測跨層/跨里程碑拖曳 + 縮排/升階按鈕 |
| 2026-07-07 | ADR-02 Stage 1/2/5：3 層→6 層。遞迴渲染（TaskRow depth 化，棄用 SubtaskRow）；moveTreeItem/promoteTaskToMilestone/indent/outdent 改深度感知（上限 5，超過拒絕）；編輯彈窗改用 moveTreeItem（棄用舊 computeMove）；存檔支援深層（建案 POST 多趟解析、編輯 diff 依深度排序、visualSortMap 遞迴 DFS）| lib/timeline-tree.ts、components/timeline-table.tsx、app/projects/new/page.tsx、components/project-edit-dialog.tsx、lib/timeline-utils.ts、app/api/projects/route.ts | ADR-02 | tsc 零新錯；**待 UI 測建立/移動/存深層樹** |
| 2026-07-07 | ADR-02 Stage 3 遞迴進度 + 移除殘留的「手動/自動」鎖按鈕（ADR-01 後全手動已無意義）| lib/sync-milestone-status.ts（bottom-up 深層優先）、app/api/projects/[id]/tasks/[taskId]/route.ts（往上滾過所有祖先）、components/timeline-table.tsx（移除鎖鈕）| ADR-02、ADR-01 | tsc 零新錯 |
| 2026-07-07 | ADR-02 Stage 4 甘特圖深層遞迴：抽 `renderGanttSub(sub, depth)` 遞迴渲染第 3~6 層（展開/收合 + 深度縮排 + 用自身 stored 進度），棄用寫死的 2 層子任務區塊 | components/gantt-chart.tsx | ADR-02 | tsc 零新錯（僅剩既有 setExpandedTasks prev 問題）。**ADR-02 全 5 stage 完成** |

### 已修正 Bug（從第五章移入）

- ✅ **#2 進度數字來回震盪** — 新增共用 `computeWeightedProgress()`（durationDays 加權）為唯一算法，套用到 `sync-milestone-status.ts`、`projects/[id]/route.ts`、`my-tasks/route.ts`、`tasks/[taskId]/route.ts` 的父任務聚合。里程碑/專案 % 不再因不同端點加權/未加權而飄動。
- ✅ **#9 三套「今天」定義** — 新增 `lib/date-utils.ts`（`todayUtc`/`todayUtcStr`/`toUtcDateStr`），統一為 UTC 日曆日。修正 `autoProgressTasks` 原本用 local 午夜（UTC+8 差一天）；`task-utils.ts` 逾期判定改為「日曆日已過才算逾期」與專案燈號一致。
  > ⚠️ **行為變更（需驗）**：任務在「到期當天」不再顯示逾期，隔天才逾期（與專案燈號一致）。請確認符合預期。
- ✅ **#10 autoProgress 讀 stale progress** — `projects/[id]/route.ts` 與 `my-tasks/route.ts` 調換順序：先 `syncTaskProgressFromLogs`（算進度）再 `autoProgressTasks`（用新進度判狀態）。
- ✅ **#11 父任務進度除以零** — `computeWeightedProgress` 內建空陣列/零總天數 → 回 0；`allDone` 加 `siblings.length > 0` 保護。
- ✅ **#8 批次存檔靜默失敗** — `executeBatchSave` 新增 `ensureOk()`，任一 fetch 非 2xx 即 throw，冒泡到 `handleSave` 的 catch 顯示錯誤，不再半存檔還回報成功。
- ✅ **#13 里程碑無任務時甘特圖無色條 + tooltip 問題** — 手動測試 2.9 發現。(a) 渲染 gate `msTasks.length>0 ? ... : null` 讓無任務里程碑完全不畫條 → 補「無任務也畫計畫條」分支；`getMilestoneBarRange` 無任務時改用里程碑自身範圍；預覽補傳 `startDate`。(b) tooltip 的「規劃期間」被「有任務」擋住 → 無任務時用里程碑自身日期顯示。(c) tooltip 用 `createPortal` 掛到 body，修正在 transform 過的 Dialog 內 `position:fixed` 座標跑掉、離游標很遠的問題。
  > 🔍 **待複驗**：「改日期→預覽沒即時更新」無法從程式碼重現（`recalculatedMilestones` 每次 render 重算、預覽每次開啟讀最新值）。疑似當時 Dialog 開著時熱重載造成。請關閉預覽→改日期→重開預覽確認。
- ✅ **#14 manual 草稿遺失團隊成員與設備清單** — 手動測試場景 4 發現。存草稿 `draftData` 與 `loadDraft` 的 manual 分支都漏了 `manualTeamDetails`、`manualBudgetItems`。三處補齊（interface 欄位、存、載）。⚠️ 修正前存的舊草稿無此資料、無法回填。
- 🔸 **#7 manualDates（窄修完成，根治待 PRD 變更）** — `repairTaskDates` 重排時尊重 `manualDates`：手動且未壞的里程碑/任務/子任務保留自身日期，只重排 auto 或真正壞掉的。**完整「編輯體驗」根治（絕對日期模型）仍為 ADR-01，需走 PRD 變更。**

---

## 九、架構決策紀錄 ADR-02：里程碑/任務層級 3 層 → 6 層

> **狀態**：已核准設計變更（2026-07-07，client 需求）｜**範圍**：新增 + 編輯專案。

**需求**：里程碑當第 1 層，底下任務可巢狀往下到第 6 層（= 里程碑 + 5 層任務）。`MAX_TASK_DEPTH = 5`。

**現況**：DB 的 `Task.parentId` 自我參照，**已支援任意深度、無需 migration**。但**應用層到處寫死 2 層**（`parentId` 有/無 = 子任務/任務；拖曳會 flatten 超過 2 層；甘特、進度、渲染都假設 2 層）。

**改動分階段**（每階段 tsc + UI 驗證）：
1. **遞迴渲染**：`timeline-table` 的 MilestoneRow→TaskRow→SubtaskRow 三段寫死，改成 depth 化遞迴元件（縮排依 depth）。
2. **深度感知樹邏輯**：`moveTreeItem`/`computeMove`/indent/outdent/新增子項改成允許到 depth 5，只 flatten 超過 6 的部分（原本 flatten 超過 2）。
3. **遞迴進度聚合**：`sync-milestone-status`、`tasks/[taskId]` API、顯示，父項進度遞迴算。
4. **甘特圖遞迴渲染**。
5. **批次存檔 visual order 遞迴**（`computeWorkItemsDiff` 的 sortOrder）。

**UI 取捨**：6 層縮排會擠 → 每層縮排小幅（~14px）+ 名稱欄必要時可捲動。

**不動**：延期審核級聯。

---

## 八、架構決策紀錄 ADR-01：相依功能與日期模型

> **狀態**：討論中（2026-07-07）｜**背景**：user 反映「調整子任務/里程碑時下方會連動變動、手動編輯存檔後被推回原本，無法自由編輯」，認為是 bug；開發端認為是當初的相依/連動設計。本節釐清爭議並記錄決策方向。

### 爭議的真相：系統裡有「三種連動」，被混為一談

| 機制 | 說明 | 用途 | 是否在「日常編輯」時動日期 |
|------|------|------|:---:|
| **① 瀑布式自動排程** `scheduleTasksFromStart` | 任務若無明確 startDate 種子，自動接在前一個任務後面排 | 早期 a→b→c 首尾相接的排程假設 | ✅ 會（**user 抱怨的主因**） |
| **② 層級 envelope 綁定**（方案 A） | 里程碑 = 底下任務的最早～最晚；父任務 = 子任務範圍 | 讓里程碑/父任務自動涵蓋子項 | ✅ 會（改子任務→父/里程碑跟著動） |
| **③ TaskDependency 相依圖** | 明確 A→B 連結 | 影響分析、關鍵路徑、延期送審級聯 | ❌ 不會（僅延期核准時級聯） |

**關鍵**：user 罵的「連動 bug」是 ① 和 ②；開發端拿來辯護的「相依設計」是 ③。③（最早加的相依功能）在日常編輯時根本不動日期，是無辜的，也是最有價值、傷害最低的一個。

### 判定：bug 與設計各佔一半
- **是設計**：① ② 是刻意做的「調日期一起延後」，且已用 `manualDates` 想讓手動模式不被貼齊。
- **是真 bug（Bug #7）**：**server 端 `repairTaskDates`/`autoExpandMilestones` 沒有檢查 `manualDates`**，前端有檢查、server 沒有 → 存檔後 server 重排推回。user 說「編輯被推回、只能一筆一筆改一筆一筆存」**這句是真的**。

### 最根本病灶：derived-date（現算）而非 absolute-date（存下來）
系統**不把「任務 A = 7/1~7/5」當事實存**，而是存「工期 5 天 + 可選種子」，真正日期每次用排程器**現算**。只要日期是算出來的，就**永遠無法給 user「打什麼存什麼」的體驗**。
且 user 自己要求「任務會重疊」（a=7/1~7/5、b=7/3~7/10）時，「把 b 接在 a 後」的瀑布邏輯就已失去意義——**要重疊 = 要絕對日期、手動說了算**。瀑布與任意重疊本質衝突。

### 決策方向（待 user 確認）
- **相依作為「資料紀錄」→ 保留**（③，箭頭/影響分析/延期級聯，成本低不干擾編輯）。
- **相依/瀑布作為「自動排日期」→ 不當預設**，改為 user 主動觸發：
  1. 延期送審核准時級聯（既有）
  2. 編輯時提供「後續一起順延 X 天」按鈕（想連動才按）
- **把「連動」從沉默副作用 → 變成 user 控制的顯性開關。**

### 建議重構路線（規模待定）
1. 改**絕對日期模型**：里程碑/任務/子任務各存自己的 start/end 當權威。
2. 拿掉編輯時的自動瀑布 + envelope 貼齊當預設；**優先修 Bug #7**（不論方向都該修）。
3. 保留相依表當純資訊。
4. 「一起順延」做成顯性按鈕。
5. 甘特圖天生支援重疊，瀑布只是「首尾相接」的特例。

### 待確認問題（user / 內部）
1. 認同病根是 derived-date 嗎？還是只修 Bug #7 止血就好？
2. 「連動改顯性按鈕」user 買單嗎？還是只有延期送審才准動日期？
3. 一步到位換絕對日期模型（根治、改動大），還是先止血觀察反應？

### ✅ 決策確定（2026-07-07，已與 client 達成共識）
> 本 ADR 從「討論中」→「已核准設計變更」。範圍如下：

**編輯/新增專案（timeline-table 手動編輯）— 拔除依序相依**
- 里程碑/任務/子任務各自存**絕對日期**（own start/end），互不連動。
- **唯一保留的自動**：`結束 = 開始 + 天數 - 1`（反向：填結束→天數自動反算）。
- **移除**：依序 seeding（任務不再自動接在前一個後面）、跨列連動（改上面不動下面）、里程碑=任務 envelope 綁定。
- **里程碑也完全手動**（decoupled from tasks，可直接編日期；不一致只給警告不強制）。
- 範本套用時**只 seed 一次**當初始值，之後凍結為各自的絕對日期。

**延期/提前申請流程 — 保留依序相依**
- A 延期/提前 → 受影響的下游項目一起級聯變動（既有 affectedMilestones + 核准級聯）。
- 即「連動」從編輯時的沉默副作用，搬到延期送審這個**明確動作**。

**收合行為（需求 A）**
- 里程碑/子任務**預設全部收合**；展開/收合狀態**依專案 id 記在 localStorage**，刷新維持。新增專案無 id → 預設收合 + 本次 session 記憶。

**影響檔案**：`lib/timeline-utils.ts`、`app/projects/new/page.tsx`、`components/project-edit-dialog.tsx`、`components/timeline-table.tsx`。**不動**：延期審核（`delay-requests/**`）的級聯邏輯。

### ✅ 已實作（2026-07-07）
- **timeline-utils**：`calculateMilestoneDates`/`calculateTaskDates` 改絕對模式（own start → end，無依序/無 envelope）；新增 `seedSequentialDates`（一次性初始排列）；`dbToTimelineState` 每個里程碑帶絕對 startDate。
- **建案頁**：範本套用 seed 一次；移除 `autoExpandMilestones` 兩個 effect。日期/天數 handler 本就局部。
- **編輯彈窗**：`applyTaskChangeWithBubbleUp` 移除 envelope 冒泡 + 下游順延，改成純 `setTlTasks`。
- **timeline-table**：里程碑/父任務的天數、開始、結束**永遠可編輯**（拿掉 isAutoLocked/isManual/hasSubtasks gating）。

### 🔍 待 UI 複驗 / 待確認的行為
1. **改一列不動別列**（核心）：改任務/里程碑的天數或日期，其他列都不動。
2. **里程碑完全手動**：有任務的里程碑也能直接改日期；里程碑與任務日期可不一致（只給 ⚠ 警告不強制）。
3. **改「專案開始日」不再自動移動里程碑**（絕對模式）→ 若覺得建案時不便，可再加「依專案起始日整體平移」或「重新排列」按鈕（待 user 決定）。
4. **自動/手動 🔒 鎖 badge 已失效**（日期恆可編輯）→ 建議後續移除該 UI（vestigial）。

> 📌 **這是「需求變更」不是純 bug**：user 從「瀑布」改成「重疊」是需求方向改變，屬變更；其中僅 server 無視 manualDates（Bug #7）是純 bug。此案例是「bug vs 需求變更」的典型，處理原則見 `docs/collaboration-and-change-management.md`。
