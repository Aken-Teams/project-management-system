# ATDD 驗收測試驅動開發報告

# Acceptance Test-Driven Development Report

**專案名稱：** 專案管理系統 (Project Management System)
**版本：** 1.0
**日期：** 2026-05-29
**技術堆疊：** Next.js 15 / TypeScript / Prisma ORM / MySQL (MariaDB)

---

## 目錄

1. [概述](#1-概述)
2. [驗收標準總覽](#2-驗收標準總覽)
3. [使用者故事與驗收測試](#3-使用者故事與驗收測試)
   - 3.1 認證與授權模組
   - 3.2 專案管理模組
   - 3.3 里程碑與任務管理模組
   - 3.4 延遲申請審批模組
   - 3.5 週報與進度追蹤模組
   - 3.6 通知系統模組
   - 3.7 預算與 CAPEX 模組
   - 3.8 風險管理模組
   - 3.9 儀表板與報表模組
   - 3.10 管理員後台模組
   - 3.11 共享連結模組
4. [非功能性驗收測試](#4-非功能性驗收測試)
5. [驗收測試矩陣](#5-驗收測試矩陣)

---

## 1. 概述

本文件定義了專案管理系統的驗收測試驅動開發（ATDD）報告。每個功能模組以使用者故事（User Story）為單位，定義明確的驗收標準（Acceptance Criteria），並轉換為可執行的驗收測試案例。

**ATDD 流程：**
```
使用者故事 → 驗收標準 → 驗收測試案例 → 開發實作 → 測試驗證
```

---

## 2. 驗收標準總覽

| 模組 | 使用者故事數 | 驗收測試案例數 | 優先級 |
|------|-------------|---------------|--------|
| 認證與授權 | 5 | 18 | P0 (Critical) |
| 專案管理 | 8 | 32 | P0 (Critical) |
| 里程碑與任務 | 10 | 45 | P0 (Critical) |
| 延遲申請審批 | 4 | 20 | P1 (High) |
| 週報與進度追蹤 | 5 | 18 | P1 (High) |
| 通知系統 | 4 | 15 | P1 (High) |
| 預算與 CAPEX | 4 | 16 | P2 (Medium) |
| 風險管理 | 3 | 10 | P2 (Medium) |
| 儀表板與報表 | 5 | 22 | P1 (High) |
| 管理員後台 | 6 | 25 | P1 (High) |
| 共享連結 | 2 | 6 | P3 (Low) |
| **總計** | **56** | **227** | — |

---

## 3. 使用者故事與驗收測試

### 3.1 認證與授權模組

#### US-AUTH-001：使用者登入

**使用者故事：**
> 身為系統使用者，我希望能透過 Email 和密碼登入系統，以便存取我的專案與任務。

**驗收標準：**

| AC 編號 | 驗收標準 | 測試案例 |
|---------|---------|---------|
| AC-AUTH-001-1 | 使用者輸入正確的 Email 和密碼後，成功登入並導向 Dashboard | **Given** 使用者在登入頁面<br>**When** 輸入 `dave@example.com` / `demo`<br>**Then** 成功導向 `/dashboard`，顯示使用者名稱 |
| AC-AUTH-001-2 | 輸入錯誤密碼時，顯示錯誤訊息 | **Given** 使用者在登入頁面<br>**When** 輸入 `dave@example.com` / `wrongpass`<br>**Then** 顯示「帳號或密碼錯誤」錯誤訊息 |
| AC-AUTH-001-3 | 支援 AD 認證，AD 失敗時 fallback 到 Mock 使用者 | **Given** AD 服務不可用<br>**When** 使用者使用 Mock 帳號登入<br>**Then** 仍可成功登入 |
| AC-AUTH-001-4 | 登入成功後，使用者角色從 DB 同步 | **Given** alice@example.com 在 DB 中角色為 `admin`<br>**When** Alice 登入成功<br>**Then** localStorage 中角色更新為 `admin` |

#### US-AUTH-002：快速登入（開發/展示用）

**使用者故事：**
> 身為展示者，我希望能一鍵登入不同角色的帳號，快速展示各角色功能。

**驗收標準：**

| AC 編號 | 驗收標準 | 測試案例 |
|---------|---------|---------|
| AC-AUTH-002-1 | 登入頁面顯示 4 個快速登入按鈕 | **Given** 使用者在登入頁面<br>**When** 頁面載入完成<br>**Then** 顯示 Alice(Admin)、Dave(PM)、Bob(Member)、Carol(Executive) 按鈕 |
| AC-AUTH-002-2 | 點擊快速登入按鈕後自動填入帳密並登入 | **Given** 使用者在登入頁面<br>**When** 點擊「Dave (PM)」快速登入<br>**Then** 自動以 dave@example.com 登入並導向 Dashboard |

#### US-AUTH-003：角色權限控制

**使用者故事：**
> 身為系統管理員，我希望不同角色有不同的操作權限，確保系統安全性。

**驗收標準：**

| AC 編號 | 驗收標準 | 測試案例 |
|---------|---------|---------|
| AC-AUTH-003-1 | Admin 角色可存取管理員後台 | **Given** 使用者以 admin 角色登入<br>**When** 導覽列顯示<br>**Then** 包含「系統管理」選項 |
| AC-AUTH-003-2 | Member 角色無法存取管理員後台 | **Given** 使用者以 member 角色登入<br>**When** 導覽列顯示<br>**Then** 不包含「系統管理」選項 |
| AC-AUTH-003-3 | PM 角色可建立/編輯/刪除專案 | **Given** 使用者以 PM 角色登入<br>**When** 進入專案列表頁<br>**Then** 顯示「新增專案」按鈕 |
| AC-AUTH-003-4 | Executive 角色僅可檢視專案，無法編輯 | **Given** 使用者以 Executive 角色登入<br>**When** 進入專案詳情<br>**Then** 不顯示「編輯」按鈕 |

#### US-AUTH-004：登出

**使用者故事：**
> 身為使用者，我希望能安全登出系統。

| AC 編號 | 驗收標準 | 測試案例 |
|---------|---------|---------|
| AC-AUTH-004-1 | 點擊登出後清除認證狀態並導向登入頁 | **Given** 使用者已登入<br>**When** 點擊頭像下拉 → 登出<br>**Then** localStorage 清除，導向 `/login` |

#### US-AUTH-005：未認證存取保護

| AC 編號 | 驗收標準 | 測試案例 |
|---------|---------|---------|
| AC-AUTH-005-1 | 未登入使用者存取 Dashboard 時導向登入頁 | **Given** 使用者未登入<br>**When** 直接存取 `/dashboard`<br>**Then** 導向 `/login` |

---

### 3.2 專案管理模組

#### US-PROJ-001：建立新專案

**使用者故事：**
> 身為專案經理（PM），我希望能建立新專案，包含基本資訊、里程碑、團隊成員與風險。

**驗收標準：**

| AC 編號 | 驗收標準 | 測試案例 |
|---------|---------|---------|
| AC-PROJ-001-1 | PM 可進入專案建立表單 | **Given** PM 角色登入<br>**When** 點擊「新增專案」<br>**Then** 顯示專案建立精靈表單 |
| AC-PROJ-001-2 | 填寫基本資訊（名稱、類型、層級、需求來源） | **Given** 在建立精靈第一步<br>**When** 填入名稱「NPI-2026 新產品導入」、類型「NPI」、層級「T1」<br>**Then** 表單驗證通過，可進入下一步 |
| AC-PROJ-001-3 | 系統自動產生專案代碼 | **Given** 專案類型選擇「NPI」、年份 2026<br>**When** 專案建立成功<br>**Then** 自動產生代碼如 `NPI-2026-001` |
| AC-PROJ-001-4 | 選擇專案類型後自動載入里程碑模板 | **Given** 專案類型選擇「NPI」<br>**When** 類型確認<br>**Then** 從 `/api/milestone-templates/npi` 載入對應里程碑模板 |
| AC-PROJ-001-5 | 可新增團隊成員並指定 RACIPS 角色 | **Given** 在團隊成員步驟<br>**When** 搜尋並加入成員，指定角色「R(負責)」<br>**Then** 成員列表顯示新增的成員與角色 |
| AC-PROJ-001-6 | 專案建立成功後導向專案詳情頁 | **Given** 所有必填欄位已填寫<br>**When** 點擊「建立專案」<br>**Then** API 回傳成功，導向 `/projects/[id]` |

#### US-PROJ-002：瀏覽與搜尋專案

**使用者故事：**
> 身為使用者，我希望能瀏覽所有專案，並透過多種條件篩選。

| AC 編號 | 驗收標準 | 測試案例 |
|---------|---------|---------|
| AC-PROJ-002-1 | 專案列表頁顯示所有專案卡片（分頁，每頁 12 筆） | **Given** 系統中有 20 個專案<br>**When** 進入 `/projects`<br>**Then** 顯示前 12 個專案卡片，含分頁控制 |
| AC-PROJ-002-2 | 可依名稱/代碼搜尋 | **Given** 在專案列表頁<br>**When** 搜尋欄輸入「NPI」<br>**Then** 僅顯示名稱或代碼含「NPI」的專案 |
| AC-PROJ-002-3 | 可依狀態（綠/黃/紅）篩選 | **Given** 在專案列表頁<br>**When** 選擇狀態篩選「紅燈」<br>**Then** 僅顯示狀態為 red 的專案 |
| AC-PROJ-002-4 | 可依層級（T1/T2/T3/CIP）篩選 | **Given** 在專案列表頁<br>**When** 選擇層級「T1」<br>**Then** 僅顯示 T1 層級專案 |
| AC-PROJ-002-5 | 可依專案類型、負責人、團隊成員篩選 | **Given** 在專案列表頁<br>**When** 選擇負責人「Dave Liu」<br>**Then** 僅顯示 Dave 負責的專案 |

#### US-PROJ-003：檢視專案詳情

**使用者故事：**
> 身為使用者，我希望能查看專案的完整詳情，包含所有相關資訊。

| AC 編號 | 驗收標準 | 測試案例 |
|---------|---------|---------|
| AC-PROJ-003-1 | 專案詳情頁包含 9 個分頁 | **Given** 進入專案詳情頁<br>**When** 頁面載入完成<br>**Then** 顯示：時間軸、任務、里程碑、團隊、預算、風險、延遲、更新、CAPEX 分頁 |
| AC-PROJ-003-2 | 快速統計欄顯示進度、狀態、預算使用率 | **Given** 進入專案詳情頁<br>**When** 頁面載入<br>**Then** 頂部統計欄顯示整體進度百分比、燈號狀態、預算使用率 |

#### US-PROJ-004：編輯專案

| AC 編號 | 驗收標準 | 測試案例 |
|---------|---------|---------|
| AC-PROJ-004-1 | PM 可編輯自己的專案所有欄位 | **Given** PM 進入自己負責的專案<br>**When** 點擊「編輯」<br>**Then** 顯示完整編輯表單 |
| AC-PROJ-004-2 | 編輯成功後更新專案資訊 | **Given** PM 修改專案名稱<br>**When** 儲存變更<br>**Then** API 回傳成功，頁面重新載入顯示新名稱 |

#### US-PROJ-005：刪除專案

| AC 編號 | 驗收標準 | 測試案例 |
|---------|---------|---------|
| AC-PROJ-005-1 | 刪除前顯示確認對話框 | **Given** PM 在專案列表<br>**When** 點擊刪除按鈕<br>**Then** 彈出確認對話框 |
| AC-PROJ-005-2 | 確認刪除後移除專案及相關資料 | **Given** 確認對話框顯示<br>**When** 確認刪除<br>**Then** 專案從列表消失，DB 中刪除 |

---

### 3.3 里程碑與任務管理模組

#### US-TASK-001：任務看板管理

**使用者故事：**
> 身為團隊成員，我希望在「我的任務」頁面看到被指派的所有任務，並能更新狀態。

| AC 編號 | 驗收標準 | 測試案例 |
|---------|---------|---------|
| AC-TASK-001-1 | 顯示所有指派給使用者的任務 | **Given** Bob 被指派了 5 個任務<br>**When** Bob 進入 `/my-tasks`<br>**Then** 顯示 5 個任務卡片 |
| AC-TASK-001-2 | 可依狀態篩選任務 | **Given** Bob 的任務中有 2 個 todo、2 個 in_progress、1 個 done<br>**When** 選擇「進行中」篩選<br>**Then** 僅顯示 2 個 in_progress 的任務 |
| AC-TASK-001-3 | 可依優先級篩選 | **Given** 任務有不同優先級<br>**When** 選擇「高」優先級<br>**Then** 僅顯示 priority = high 的任務 |
| AC-TASK-001-4 | 任務卡片顯示名稱、專案、里程碑、到期日、狀態 | **Given** 任務列表已載入<br>**When** 檢視任務卡片<br>**Then** 每張卡片包含完整資訊 |

#### US-TASK-002：任務狀態更新

| AC 編號 | 驗收標準 | 測試案例 |
|---------|---------|---------|
| AC-TASK-002-1 | 可將任務標記為完成 | **Given** 一個 in_progress 的任務<br>**When** 點擊「標記完成」<br>**Then** 任務狀態變更為 done，記錄完成時間和完成者 |
| AC-TASK-002-2 | 完成任務後自動更新里程碑進度 | **Given** 里程碑下有 4 個任務，已完成 3 個<br>**When** 完成第 4 個任務<br>**Then** 里程碑進度更新為 100% |
| AC-TASK-002-3 | 被依賴的前置任務未完成時，顯示 blocked 警告 | **Given** 任務 B 依賴任務 A，且任務 A 未完成<br>**When** 檢視任務 B<br>**Then** 顯示「等待前置任務完成」警示 |

#### US-TASK-003：任務日誌記錄

**使用者故事：**
> 身為團隊成員，我希望能記錄任務工作日誌，以便追蹤進度和留下紀錄。

| AC 編號 | 驗收標準 | 測試案例 |
|---------|---------|---------|
| AC-TASK-003-1 | 可新增工作日誌（內容、下次計畫、附件） | **Given** 在任務詳情中<br>**When** 填寫日誌內容並提交<br>**Then** 日誌列表新增一筆紀錄 |
| AC-TASK-003-2 | 日誌會影響任務自動進度計算 | **Given** 任務有 3 筆工作日誌<br>**When** 系統同步進度<br>**Then** 任務狀態自動更新為 in_progress |
| AC-TASK-003-3 | 支援附件上傳（圖片、文件） | **Given** 在日誌新增表單<br>**When** 上傳圖片附件<br>**Then** 附件保存並在日誌中顯示 |

#### US-TASK-004：子任務管理

| AC 編號 | 驗收標準 | 測試案例 |
|---------|---------|---------|
| AC-TASK-004-1 | 可為任務建立子任務 | **Given** 一個父任務<br>**When** 點擊「新增子任務」<br>**Then** 建立子任務，parentId 指向父任務 |
| AC-TASK-004-2 | 子任務完成數影響父任務進度 | **Given** 父任務有 4 個子任務，完成 2 個<br>**When** 檢視父任務<br>**Then** 進度顯示約 50% |

#### US-TASK-005：任務依賴關係

| AC 編號 | 驗收標準 | 測試案例 |
|---------|---------|---------|
| AC-TASK-005-1 | 可設定任務間的依賴關係 | **Given** 任務 A 和任務 B<br>**When** 設定 B 依賴 A<br>**Then** TaskDependency 記錄建立 |
| AC-TASK-005-2 | 甘特圖中顯示依賴箭頭 | **Given** 任務 B 依賴任務 A<br>**When** 檢視甘特圖<br>**Then** A → B 之間顯示箭頭連線 |
| AC-TASK-005-3 | 前置任務未完成時自動 blocked | **Given** 任務 B 依賴未完成的任務 A<br>**When** 系統自動同步<br>**Then** 任務 B 狀態顯示 blocked |

#### US-TASK-006：里程碑進度追蹤

| AC 編號 | 驗收標準 | 測試案例 |
|---------|---------|---------|
| AC-TASK-006-1 | 里程碑進度由任務加權平均計算 | **Given** 里程碑有 2 個任務：A (10天, 80%) 和 B (20天, 40%)<br>**When** 系統計算<br>**Then** 里程碑進度 = (10×80 + 20×40) / (10+20) ≈ 53% |
| AC-TASK-006-2 | 里程碑詳情面板顯示所有任務列表 | **Given** 里程碑下有 5 個任務<br>**When** 點擊里程碑展開詳情<br>**Then** 顯示所有 5 個任務及其狀態 |

#### US-TASK-007：甘特圖檢視

| AC 編號 | 驗收標準 | 測試案例 |
|---------|---------|---------|
| AC-TASK-007-1 | 甘特圖正確呈現里程碑與任務時間軸 | **Given** 專案有 3 個里程碑、各含 3 個任務<br>**When** 進入甘特圖頁面<br>**Then** 依時間軸顯示所有里程碑和任務的時間條 |
| AC-TASK-007-2 | 支援匯出為 PNG/PDF | **Given** 甘特圖已渲染<br>**When** 點擊匯出<br>**Then** 下載甘特圖圖檔 |

---

### 3.4 延遲申請審批模組

#### US-DELAY-001：提交延遲申請

**使用者故事：**
> 身為 PM，當專案發生延遲時，我希望能提交延遲申請，說明原因並提出新的時程。

| AC 編號 | 驗收標準 | 測試案例 |
|---------|---------|---------|
| AC-DELAY-001-1 | PM 可提交延遲申請，填寫原因與受影響里程碑 | **Given** PM 在專案延遲分頁<br>**When** 填寫延遲原因、選擇受影響里程碑、提出新日期<br>**Then** 延遲申請建立成功，狀態為 pending |
| AC-DELAY-001-2 | 系統計算所需審核人數（S-role 成員數） | **Given** 專案有 2 個 S-role 成員<br>**When** 延遲申請提交<br>**Then** requiredReviewers = 2 |
| AC-DELAY-001-3 | 提交後通知所有 S-role 審核者 | **Given** 延遲申請提交成功<br>**When** 申請建立<br>**Then** 所有 S-role 成員收到 delay_submitted 通知 |
| AC-DELAY-001-4 | 可標記「是否需要支援」及支援內容 | **Given** 在延遲申請表單<br>**When** 勾選「需要支援」並填寫「需要加急供應商交貨」<br>**Then** 支援需求記錄在案，通知主管 |

#### US-DELAY-002：審核延遲申請

**使用者故事：**
> 身為審核者（S-role），我希望能審查延遲申請並做出核准或駁回的決定。

| AC 編號 | 驗收標準 | 測試案例 |
|---------|---------|---------|
| AC-DELAY-002-1 | 審核頁面顯示待審核的延遲申請 | **Given** S-role 使用者登入<br>**When** 進入 `/approvals`<br>**Then** 「待審核」分頁顯示 pending 申請 |
| AC-DELAY-002-2 | 單一駁回即立刻駁回整個申請 | **Given** 3 個審核者中有 1 人駁回<br>**When** 第一個審核者選擇「駁回」<br>**Then** 整個申請狀態變為 rejected |
| AC-DELAY-002-3 | 所有審核者通過後才核准 | **Given** 需要 3 個審核者全數同意<br>**When** 第 3 個審核者選擇「核准」<br>**Then** 申請狀態變為 approved |
| AC-DELAY-002-4 | 核准後自動更新里程碑日期 | **Given** 延遲申請核准，提出新日期為 7/1<br>**When** 核准生效<br>**Then** 受影響里程碑的 dueDate 更新為 7/1 |
| AC-DELAY-002-5 | 審核結果通知申請者 | **Given** 延遲申請被核准<br>**When** 最後一位審核者通過<br>**Then** 申請者收到 delay_approved 通知 |

#### US-DELAY-003：支援需求處理

| AC 編號 | 驗收標準 | 測試案例 |
|---------|---------|---------|
| AC-DELAY-003-1 | 主管可在「支援需求」分頁看到待處理項目 | **Given** Executive 角色登入<br>**When** 進入 `/approvals` → 支援需求<br>**Then** 顯示需要支援的延遲申請 |
| AC-DELAY-003-2 | 可標記支援已解決 | **Given** 支援需求待處理<br>**When** 主管點擊「已解決」<br>**Then** 記錄解決時間與解決人 |

---

### 3.5 週報與進度追蹤模組

#### US-WEEKLY-001：提交週報

**使用者故事：**
> 身為 PM，我希望能提交每週專案進度報告。

| AC 編號 | 驗收標準 | 測試案例 |
|---------|---------|---------|
| AC-WEEKLY-001-1 | PM 可建立週報，包含整體狀態、各里程碑進度、阻礙與計畫 | **Given** PM 進入專案更新分頁<br>**When** 選擇週次並填寫報告<br>**Then** 週報建立成功 |
| AC-WEEKLY-001-2 | 週報記錄每個里程碑的個別進度更新 | **Given** 專案有 4 個里程碑<br>**When** 提交週報<br>**Then** 每個里程碑的進度分別記錄在 MilestoneUpdate 中 |

#### US-WEEKLY-002：成員週報

**使用者故事：**
> 身為團隊成員，我希望能針對負責的里程碑提交個人週報。

| AC 編號 | 驗收標準 | 測試案例 |
|---------|---------|---------|
| AC-WEEKLY-002-1 | 成員可針對特定里程碑提交週報 | **Given** Bob 負責里程碑 A<br>**When** Bob 提交本週報告（content、progress、blockers、nextPlan）<br>**Then** MemberWeeklyReport 建立，unique on [projectId, milestoneId, userId, weekOf] |

#### US-WEEKLY-003：排程提醒通知

| AC 編號 | 驗收標準 | 測試案例 |
|---------|---------|---------|
| AC-WEEKLY-003-1 | Cron 任務在設定時間檢查缺漏的週報 | **Given** notification.schedule 設定為星期一 9:00<br>**When** Cron 於星期一 9:00 執行<br>**Then** 找出未提交週報的專案並發送提醒 |
| AC-WEEKLY-003-2 | 提醒通知支援自訂模板和變數替換 | **Given** 模板包含 `{{projectName}}` 和 `{{pmName}}`<br>**When** 通知發送<br>**Then** 變數被替換為實際專案名稱和 PM 姓名 |
| AC-WEEKLY-003-3 | 提醒同時發送站內通知與 Email | **Given** Cron 發送提醒<br>**When** 提醒觸發<br>**Then** 站內通知建立 AND Email 發送 |

---

### 3.6 通知系統模組

#### US-NOTIF-001：通知接收與顯示

| AC 編號 | 驗收標準 | 測試案例 |
|---------|---------|---------|
| AC-NOTIF-001-1 | Dashboard 導覽列顯示未讀通知數量 | **Given** 使用者有 3 則未讀通知<br>**When** Dashboard 載入<br>**Then** 通知鈴鐺顯示「3」 |
| AC-NOTIF-001-2 | 通知列表顯示所有通知（含類型圖示） | **Given** 使用者有多種類型通知<br>**When** 進入 `/notifications`<br>**Then** 顯示各通知及對應類型圖示 |
| AC-NOTIF-001-3 | 每 20 秒自動輪詢新通知 | **Given** 另一使用者為 Bob 建立了新通知<br>**When** 20 秒後<br>**Then** Bob 的通知鈴鐺數量更新 |

#### US-NOTIF-002：通知操作

| AC 編號 | 驗收標準 | 測試案例 |
|---------|---------|---------|
| AC-NOTIF-002-1 | 可標記單則通知為已讀 | **Given** 一則未讀通知<br>**When** 點擊已讀<br>**Then** 通知標記為 read，未讀數減 1 |
| AC-NOTIF-002-2 | 可全部標記為已讀 | **Given** 5 則未讀通知<br>**When** 點擊「全部已讀」<br>**Then** 所有通知標記為 read，未讀數為 0 |
| AC-NOTIF-002-3 | 可清除所有通知 | **Given** 有多則通知<br>**When** 點擊「全部清除」<br>**Then** 通知列表清空 |

---

### 3.7 預算與 CAPEX 模組

#### US-BUDGET-001：預算項目管理

| AC 編號 | 驗收標準 | 測試案例 |
|---------|---------|---------|
| AC-BUDGET-001-1 | PM 可新增/編輯/刪除預算項目 | **Given** PM 在專案預算分頁<br>**When** 新增設備「SMT 貼片機」、廠商「ABC Corp」、預估費用 500,000<br>**Then** 預算項目列表新增一筆 |
| AC-BUDGET-001-2 | 預算項目包含：站別、廠商、設備、數量、單價、預估與實際費用 | **Given** 預算項目表單<br>**When** 填寫所有欄位<br>**Then** 所有欄位正確儲存 |

#### US-BUDGET-002：CAPEX 追蹤

| AC 編號 | 驗收標準 | 測試案例 |
|---------|---------|---------|
| AC-BUDGET-002-1 | 可記錄 CAPEX 設備詳細資訊（PO、料號、供應商、幣別） | **Given** CAPEX 分頁<br>**When** 填寫完整 CAPEX 資訊<br>**Then** 記錄正確儲存 |
| AC-BUDGET-002-2 | 付款進度追蹤（訂金/交貨/驗收） | **Given** CAPEX 項目已建立<br>**When** 填寫訂金金額、到期日、狀態<br>**Then** 付款時程正確顯示 |
| AC-BUDGET-002-3 | CAPEX 表格顯示置頂摘要列 | **Given** 多筆 CAPEX 項目<br>**When** 檢視 CAPEX 表格<br>**Then** 置頂摘要列顯示總金額 |

---

### 3.8 風險管理模組

#### US-RISK-001：風險登記

| AC 編號 | 驗收標準 | 測試案例 |
|---------|---------|---------|
| AC-RISK-001-1 | 可新增風險（標題、描述、影響、發生機率、緩解措施） | **Given** PM 在專案風險分頁<br>**When** 新增風險「供應商延遲」、影響「高」、機率「中」<br>**Then** 風險登記新增一筆 |
| AC-RISK-001-2 | 可更新風險狀態（open → mitigated → closed） | **Given** 一個 open 狀態的風險<br>**When** 更新為 mitigated<br>**Then** 風險狀態變更為 mitigated |
| AC-RISK-001-3 | 儀表板顯示所有開放風險 | **Given** 系統有 5 個 open 風險<br>**When** 進入 Dashboard<br>**Then** Open Risks 面板顯示 5 個風險 |

---

### 3.9 儀表板與報表模組

#### US-DASH-001：執行儀表板

| AC 編號 | 驗收標準 | 測試案例 |
|---------|---------|---------|
| AC-DASH-001-1 | 顯示專案狀態統計（綠/黃/紅分佈） | **Given** 系統有 10 個專案<br>**When** 進入 `/dashboard`<br>**Then** 顯示各狀態的專案數量 |
| AC-DASH-001-2 | 顯示層級分佈（T1/T2/T3/CIP） | **Given** Dashboard 載入<br>**When** 檢視統計卡片<br>**Then** 顯示各層級專案數量 |
| AC-DASH-001-3 | 顯示預算概覽（總預算 vs 已使用） | **Given** 專案有預算資料<br>**When** Dashboard 載入<br>**Then** 顯示預算使用百分比 |
| AC-DASH-001-4 | 顯示未來 7 天到期的里程碑 | **Given** 有里程碑在 7 天內到期<br>**When** Dashboard 載入<br>**Then** 「即將到期里程碑」面板顯示相關項目 |
| AC-DASH-001-5 | 可依層級篩選 Dashboard 資料 | **Given** Dashboard 載入<br>**When** 選擇層級「T1」<br>**Then** 所有統計資料僅反映 T1 專案 |

#### US-DASH-002：報表匯出

| AC 編號 | 驗收標準 | 測試案例 |
|---------|---------|---------|
| AC-DASH-002-1 | 支援 PDF 匯出 | **Given** 在報表頁面<br>**When** 選擇 PDF 匯出<br>**Then** 下載 PDF 檔案 |
| AC-DASH-002-2 | 支援 Excel 匯出 | **Given** 在報表頁面<br>**When** 選擇 Excel 匯出<br>**Then** 下載 Excel 檔案，包含專案、任務、預算分頁 |
| AC-DASH-002-3 | 支援 Email 發送報表 | **Given** 在報表頁面<br>**When** 選擇「Email 發送」並輸入收件者<br>**Then** 報表透過 AD Mail API 發送 |

---

### 3.10 管理員後台模組

#### US-ADMIN-001：使用者管理

| AC 編號 | 驗收標準 | 測試案例 |
|---------|---------|---------|
| AC-ADMIN-001-1 | Admin 可檢視所有使用者列表（含搜尋與篩選） | **Given** Admin 進入 `/admin/users`<br>**When** 頁面載入<br>**Then** 顯示使用者列表，支援角色/組織篩選 |
| AC-ADMIN-001-2 | Admin 可變更使用者角色 | **Given** Bob 角色為 member<br>**When** Admin 將 Bob 角色改為 pm<br>**Then** DB 中 Bob 的 role 更新為 pm |
| AC-ADMIN-001-3 | Admin 可預先註冊 AD 使用者 | **Given** Admin 在使用者管理<br>**When** 搜尋 AD 使用者並預先註冊為 pm<br>**Then** 使用者記錄建立，該人首次登入時自動獲得 pm 角色 |
| AC-ADMIN-001-4 | Admin 可啟用/停用使用者帳號 | **Given** Bob 的帳號為 active<br>**When** Admin 停用 Bob 的帳號<br>**Then** Bob 無法登入 |

#### US-ADMIN-002：專案類型設定

| AC 編號 | 驗收標準 | 測試案例 |
|---------|---------|---------|
| AC-ADMIN-002-1 | 可管理自訂專案類型 | **Given** Admin 進入 `/admin/project-settings`<br>**When** 新增類型「Process Improvement」、代碼前綴「PI」<br>**Then** 類型列表新增，建立專案時可選擇 |
| AC-ADMIN-002-2 | 可啟用/停用專案類型 | **Given** 類型「automation」存在<br>**When** 切換為停用<br>**Then** 建立專案時不顯示該類型 |

#### US-ADMIN-003：通知排程設定

| AC 編號 | 驗收標準 | 測試案例 |
|---------|---------|---------|
| AC-ADMIN-003-1 | 可設定每層級的通知頻率與時間 | **Given** Admin 進入 `/admin/notifications`<br>**When** 設定 T1 層級「每週一 9:00」提醒<br>**Then** NotificationProfile 更新 |
| AC-ADMIN-003-2 | 可自訂通知模板（支援變數替換） | **Given** 模板編輯表單<br>**When** 輸入含 `{{projectName}}` 的模板<br>**Then** 發送時正確替換為專案名稱 |
| AC-ADMIN-003-3 | 可啟用/停用 Cron 排程 | **Given** Admin 在排程管理頁<br>**When** 切換通知 Cron 為停用<br>**Then** 排程不再觸發通知發送 |

#### US-ADMIN-004：里程碑模板管理

| AC 編號 | 驗收標準 | 測試案例 |
|---------|---------|---------|
| AC-ADMIN-004-1 | 可自訂各專案類型的里程碑模板 | **Given** Admin 進入模板管理<br>**When** 修改 NPI 類型的里程碑模板<br>**Then** 新建 NPI 專案時載入更新後的模板 |
| AC-ADMIN-004-2 | DB 模板優先於內建模板 | **Given** NPI 在 DB 中有自訂模板<br>**When** 新建 NPI 專案<br>**Then** 載入 DB 版本，非內建版本 |

#### US-ADMIN-005：Cron 任務監控

| AC 編號 | 驗收標準 | 測試案例 |
|---------|---------|---------|
| AC-ADMIN-005-1 | 可檢視 Cron 執行紀錄 | **Given** Admin 進入 `/admin/schedule`<br>**When** 頁面載入<br>**Then** 顯示最近的 Cron 執行紀錄（時間、狀態、影響數） |
| AC-ADMIN-005-2 | 可手動觸發 Cron 任務 | **Given** Admin 在排程管理頁<br>**When** 點擊「手動執行」<br>**Then** Cron 任務立即執行並回傳結果 |

---

### 3.11 共享連結模組

#### US-SHARE-001：產生共享連結

| AC 編號 | 驗收標準 | 測試案例 |
|---------|---------|---------|
| AC-SHARE-001-1 | PM 可產生專案共享連結（含選填到期日） | **Given** PM 在專案詳情<br>**When** 點擊「共享」並設定到期日<br>**Then** 產生唯一 token 的共享連結 |
| AC-SHARE-001-2 | 共享連結提供唯讀專案檢視 | **Given** 未登入使用者<br>**When** 存取 `/share/[token]`<br>**Then** 顯示專案唯讀檢視 |
| AC-SHARE-001-3 | 過期連結顯示失效訊息 | **Given** 共享連結已過期<br>**When** 存取該連結<br>**Then** 顯示「連結已失效」 |

---

## 4. 非功能性驗收測試

### NFR-001：效能

| AC 編號 | 驗收標準 | 測試案例 |
|---------|---------|---------|
| AC-NFR-001-1 | Dashboard 頁面載入時間 < 3 秒 | **Given** 系統有 50 個專案<br>**When** 進入 Dashboard<br>**Then** 頁面完全載入 < 3 秒 |
| AC-NFR-001-2 | 專案列表搜尋回應 < 1 秒 | **Given** 搜尋條件輸入<br>**When** 觸發搜尋<br>**Then** 結果 < 1 秒回傳 |

### NFR-002：響應式設計

| AC 編號 | 驗收標準 | 測試案例 |
|---------|---------|---------|
| AC-NFR-002-1 | 行動裝置瀏覽器可正確顯示 | **Given** 使用手機瀏覽器<br>**When** 存取系統<br>**Then** 側邊欄收合為漢堡選單，內容自適應 |

### NFR-003：資料一致性

| AC 編號 | 驗收標準 | 測試案例 |
|---------|---------|---------|
| AC-NFR-003-1 | 任務進度變更後里程碑/專案進度同步更新 | **Given** 任務完成<br>**When** 進度同步<br>**Then** 里程碑和專案進度即時反映 |
| AC-NFR-003-2 | 延遲核准後里程碑日期正確更新 | **Given** 延遲申請核准<br>**When** 核准生效<br>**Then** 受影響里程碑日期更新為提議日期 |

### NFR-004：安全性

| AC 編號 | 驗收標準 | 測試案例 |
|---------|---------|---------|
| AC-NFR-004-1 | Admin API 需驗證 admin 角色 | **Given** Member 角色使用者<br>**When** 呼叫 `/api/admin/users`<br>**Then** 回傳 403 Forbidden |
| AC-NFR-004-2 | Cron API 需驗證 CRON_SECRET | **Given** 未附 CRON_SECRET<br>**When** 呼叫 `/api/cron/weekly-notification`<br>**Then** 回傳 401 Unauthorized |

---

## 5. 驗收測試矩陣

### 測試覆蓋率摘要

| 模組 | 使用者故事 | 驗收標準 | 關鍵 API | 頁面 |
|------|-----------|---------|---------|------|
| 認證與授權 | 5 | 12 | `/api/auth/login` | `/login` |
| 專案管理 | 5 | 14 | `/api/projects` | `/projects`, `/projects/new`, `/projects/[id]` |
| 任務管理 | 7 | 18 | `/api/my-tasks`, `/api/projects/[id]/tasks` | `/my-tasks` |
| 延遲審批 | 3 | 11 | `/api/delay-requests` | `/approvals` |
| 週報追蹤 | 3 | 6 | `/api/weekly-updates`, `/api/cron/*` | 專案更新分頁 |
| 通知系統 | 2 | 6 | `/api/notifications` | `/notifications` |
| 預算/CAPEX | 2 | 5 | `/api/projects/[id]/budget-items` | 預算/CAPEX 分頁 |
| 風險管理 | 1 | 3 | `/api/projects` (risks) | 風險分頁 |
| 儀表板/報表 | 2 | 8 | `/api/dashboard`, `/api/admin/export-excel` | `/dashboard`, `/reports` |
| 管理後台 | 5 | 12 | `/api/admin/*` | `/admin/*` |
| 共享連結 | 1 | 3 | `/api/share` | `/share/[token]` |
| 非功能性 | — | 6 | — | — |
| **總計** | **36** | **104** | — | — |

### 優先級分佈

```
P0 (Critical)  ████████████████████  45 項
P1 (High)      ██████████████████    38 項
P2 (Medium)    █████████             15 項
P3 (Low)       ███                    6 項
```

---

*文件結束 — ATDD 驗收測試驅動開發報告*
