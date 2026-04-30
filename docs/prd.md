# 專案看板系統 產品需求文件 (PRD)

> ### v3.0 色彩標記說明
>
> 本文件使用三種底色區分功能來源，方便快速確認需求歸屬：
>
> | 底色 | 意義 | 說明 |
> |------|------|------|
> | 無底色 | 原始 PRD v1.0 範圍 | 原始規劃書已含的功能 |
> | <span style="background-color:#FFF3CD;">黃色底色</span> | 開發過程中追加（已交付） | 驗收期間持續追加的需求，已完成交付 |
> | <span style="background-color:#FFE0E0;">紅色底色</span> | 本次新提需求（🔸 規劃中） | v3.0 新增的功能需求，尚未開發 |
>
> **對比基準：** 原始規劃書 v1.0（2026-02-10）→ 追加交付（2026-03-20）→ 本次 v3.0 更新（2026-04-30）

---

## 1. 產品概述

### 產品願景與定位
- 打造一個直觀、協作式的專案管理平台，讓團隊能從專案啟動到結案，集中管理目標、流程與進度，並透過視覺化燈號與報表，即時掌握專案健康度與 KPI 達成狀況。
- 定位為企業團隊的內部專案管理與協作工具，聚焦於流程透明化、目標追蹤<span style="background-color:#FFF3CD;">與投資報酬分析</span>。

### 商業目標
- 提升跨部門專案協作效率，減少溝通與進度追蹤的行政成本。
- 確保專案執行與初始目標（效益、KPI）對齊，提高專案成功率。
- 透過數據化報表<span style="background-color:#FFE0E0;">與 OTD（準時達成率）分析</span>，為管理層提供決策支援。
- 節省管理時間和增強團隊協作透明度，讓主管能更直觀地了解專案現況並即時協助解決問題。

### 範圍定義
- 核心功能：建立專案（含 SMART 目標、<span style="background-color:#FFE0E0;">KPI 指標</span>、預期效益）、時間軸任務管理與甘特圖、工作日誌追蹤、專案健康度燈號自動計算、延期申請與審核流程、<span style="background-color:#FFF3CD;">DB 通知系統、PDF/Excel 匯出、完整後台管理</span>。
- 目前使用 Mock 驗證機制（硬編碼使用者 + <span style="background-color:#FFF3CD;">DB 角色同步</span>），未來將整合 AD/SSO 真實身分驗證。

---

## 2. 使用者分析

### 目標使用者 Persona
- **專案經理 (PM)**：負責建立專案、設定 SMART 目標<span style="background-color:#FFE0E0;">與 KPI 指標</span>、規劃里程碑與任務、分配任務、監控整體進度與健康度燈號。可審核延期申請、<span style="background-color:#FFF3CD;">提交週報</span>、管理團隊與風險。
- **團隊成員 (Member)**：執行被分配的任務，透過時間軸表格更新任務狀態，在任務下撰寫工作日誌。當任務需要延期時，可向 PM/主管提出延期申請。
- **主管 (Executive)**：從儀表板總覽所有專案燈號狀態與統計報表，審核延期申請，掌握高風險專案。在風險列表中僅顯示高影響度風險。<span style="background-color:#FFE0E0;">可查看 OTD 分析報表。</span>
- <span style="background-color:#FFF3CD;">**系統管理員 (Admin)**：管理使用者帳號與角色、設定專案類型與里程碑模板、配置通知排程、管理排程任務與報告設定。（追加交付）</span>

### 使用者痛點與需求
- 痛點：專案啟動資訊（目標、流程）散落在不同檔案與郵件中，難以查找與對齊。
- 痛點：無法快速了解專案當前是否偏離目標或時程。
- 痛點：現有內建系統介面複雜、功能不足，且無法客製化以符合不同專案類型的需求，導致團隊仍依賴 Excel 管理。
- <span style="background-color:#FFE0E0;">痛點：缺乏 KPI 與 OTD 指標，難以量化評估專案績效。（v3.0 新增）</span>
- 需求：需要一個單一平台集中管理專案全生命週期資訊。
- 需求：希望有直觀的視覺化指標（如燈號、<span style="background-color:#FFE0E0;">OTD 圖表</span>）快速判斷專案狀態與績效。
- 需求：希望系統能引導使用者以 SMART 原則填寫專案目標，<span style="background-color:#FFE0E0;">並在專案詳情頁展示</span>。
- 需求：當專案進度延後時，團隊成員能向 PM/主管提出延期申請與協助請求。
- <span style="background-color:#FFF3CD;">需求：投資報酬率計算與回收期分析，協助評估專案財務效益。</span>

### 使用者旅程
1. **專案啟動階段**：PM 建立新專案，填寫基本資訊（名稱、代碼、類型、層級、起訖時間、預算等），設定 SMART 目標、<span style="background-color:#FFE0E0;">KPI 指標</span>與專案說明。系統可 AI 輔助自動解析專案細節，或由 PM 手動編輯。建立過程支援草稿自動儲存。PM 設定團隊成員<span style="background-color:#FFF3CD;">（RACI 矩陣）</span>，<span style="background-color:#FFE0E0;">被指定為 R（負責人）的人員需簽署專案章程（🔸 規劃中）</span>。
2. **規劃與協作階段**：PM 在專案編輯介面中建立里程碑與任務<span style="background-color:#FFF3CD;">（可套用里程碑模板）</span>，使用時間軸表格拖放排序與 inline 編輯。系統自動建立任務順序相依關係。PM 可管理風險項目<span style="background-color:#FFF3CD;">與預算明細</span>。<span style="background-color:#FFE0E0;">甘特圖以重疊方式呈現平行任務（🔸 規劃中）。PM 可鎖定專案編輯避免衝突（🔸 待討論）。</span>
3. **執行與追蹤階段**：團隊成員在「我的任務」頁面查看被指派任務，撰寫工作日誌記錄進度。系統自動計算健康度燈號，自動同步里程碑狀態與進度。專案詳情頁提供甘特圖、<span style="background-color:#FFE0E0;">SMART 目標展示（🔸 規劃中）、相依分析、OTD 圖表（🔸 規劃中）</span>。<span style="background-color:#FFF3CD;">PM 定期提交週報（支援語音輸入）。</span>
4. **審核與報告階段**：PM 與主管在儀表板查看 KPI 統計、<span style="background-color:#FFE0E0;">OTD 分析</span>、風險列表、到期里程碑、未更新專案。主管審核延期申請（批准時系統自動級聯更新日期與基線）。<span style="background-color:#FFF3CD;">系統自動排程產出 PDF 報告並寄送。</span>

---

## 3. User Stories

### 專案經理 (PM)

- **US-PM-01**：建立新專案，填寫基本資訊（名稱、代碼、類型、層級、起訖時間、預算、負責人），以及<span style="background-color:#FFF3CD;">專案層別、需求來源</span>、開案原因、預期效益、專案需求描述。
- **US-PM-02**：在專案建立時設定 SMART 目標（具體、可衡量、可達成、相關性、時限性），系統提供獨立欄位引導填寫。
- <span style="background-color:#FFE0E0;">**US-PM-03**：🔸 在專案建立/編輯時設定 KPI 指標（如 OTD、預算使用率、品質指標等），作為專案績效衡量基準。（v3.0 新增）</span>
- **US-PM-04**：在專案編輯介面中，透過時間軸表格建立里程碑與任務，支援拖放排序與 inline 編輯，並可批次儲存變更。
- <span style="background-color:#FFE0E0;">**US-PM-05**：🔸 在編輯里程碑、任務、子任務時，可直接透過日期欄位修改起訖日期，系統自動調整相依任務。（v3.0 新增）</span>
- **US-PM-06**：在專案詳情頁查看甘特圖，視覺化任務時程、相依關係，支援多種時間尺度（日/週/月/季/年）。<span style="background-color:#FFE0E0;">🔸 甘特圖支援重疊顯示平行任務。（v3.0 新增）</span>
- **US-PM-07**：系統自動計算專案健康度燈號（紅/黃/綠），無需手動設定。
- **US-PM-08**：審核團隊成員提出的延期申請，選擇批准或駁回並填寫意見，批准時系統自動更新相關日期。
- **US-PM-09**：管理專案風險項目（新增/編輯/關閉），包含影響度、機率、緩解措施等資訊。
- **US-PM-10**：儲存里程碑基線快照，用於比較原始計畫與實際進度的差異。
- **US-PM-11**：在建立專案的過程中隨時儲存草稿，下次可繼續編輯。
- <span style="background-color:#FFF3CD;">**US-PM-12**：透過週報功能，按里程碑填寫進度備註與狀態（準時/延遲），支援語音輸入。（開發期間追加）</span>
- <span style="background-color:#FFF3CD;">**US-PM-13**：管理專案預算明細（站點、廠商、設備、成本），並查看投資報酬率分析。（開發期間追加）</span>
- <span style="background-color:#FFE0E0;">**US-PM-14**：🔸 鎖定專案編輯，避免其他人同時修改里程碑與任務資料（待討論）。（v3.0 新增）</span>
- <span style="background-color:#FFF3CD;">**US-PM-15**：產生公開分享連結，讓外部人員以唯讀方式查看專案狀態。（開發期間追加）</span>

### 團隊成員 (Member)

- **US-Member-01**：在「我的任務」頁面一目了然地看到被指派的所有任務，按專案分組顯示。
- **US-Member-02**：透過任務詳情面板更新任務狀態，並在任務下撰寫工作日誌記錄進度、工時與日期。
- **US-Member-03**：在專案詳情頁查看 SMART 目標、<span style="background-color:#FFE0E0;">KPI 指標</span>、健康度燈號，了解專案全貌。
- **US-Member-04**：當任務需要延期時，在「我的任務」頁面提出延期申請，填寫延期原因、新的預估截止日期與受影響的里程碑。
- **US-Member-05**：在個人資料頁查看任務統計（總數、已完成、進行中、待開始）、參與專案列表與近期活動紀錄。
- <span style="background-color:#FFE0E0;">**US-Member-06**：🔸 專案成立時，作為 R（負責人）角色的成員，需簽署專案章程以確認知悉專案目標與範圍（需求者內部待討論）。（v3.0 新增）</span>

### 主管 (Executive)

- **US-Exec-01**：在儀表板總覽所有專案名稱、負責 PM 及健康度燈號。
- **US-Exec-02**：查看 KPI 統計：專案總數、各燈號數量、平均進度、預算使用率。
- <span style="background-color:#FFE0E0;">**US-Exec-03**：🔸 查看準時達成率（OTD）圖表，了解組織整體專案交付績效趨勢。（v3.0 新增）</span>
- **US-Exec-04**：查看高風險專案列表（僅高影響度風險），即時掌握需要關注的問題。
- **US-Exec-05**：審核延期申請，選擇批准或駁回並填寫意見，批准時系統自動級聯更新日期與基線。
- **US-Exec-06**：查看即將到期里程碑（30 天內）與本週未更新活動的專案列表。
- <span style="background-color:#FFF3CD;">**US-Exec-07**：接收系統自動排程產出的 PDF/Excel 報告（含統計、狀態分佈、專案詳情）。（開發期間追加）</span>

### <span style="background-color:#FFF3CD;">系統管理員 (Admin)（追加交付）</span>

- <span style="background-color:#FFF3CD;">**US-Admin-01**：管理系統使用者（新增/編輯/刪除），支援從 AD 匯入使用者。</span>
- <span style="background-color:#FFF3CD;">**US-Admin-02**：設定使用者角色（PM/Member/Executive/Admin）與權限。</span>
- <span style="background-color:#FFF3CD;">**US-Admin-03**：管理專案類型設定（類型代碼、名稱、預設模板）。</span>
- <span style="background-color:#FFF3CD;">**US-Admin-04**：管理里程碑模板（依專案類型設定預設里程碑與任務結構）。</span>
- <span style="background-color:#FFF3CD;">**US-Admin-05**：設定通知排程（依專案層級配置通知頻率、標題、內容、Email 範本）。</span>
- <span style="background-color:#FFF3CD;">**US-Admin-06**：設定報告排程（PDF 產出時間、收件人清單、Email 範本）。</span>
- <span style="background-color:#FFF3CD;">**US-Admin-07**：監控排程任務執行紀錄（Cron Job Logs）。</span>
- <span style="background-color:#FFF3CD;">**US-Admin-08**：匯出系統資料為 Excel 格式。</span>
- <span style="background-color:#FFE0E0;">**US-Admin-09**：🔸 管理角色權限矩陣，含「填寫週報」權限的說明與配置。（v3.0 新增）</span>

### 驗收標準（Acceptance Criteria）

- **US-PM-04 的 AC**：
  - 在專案編輯彈窗的「工作項目」分頁中，PM 可透過時間軸表格新增里程碑與任務。
  - 支援拖放排序（@dnd-kit/sortable），拖放後排序立即更新。
  - 支援 inline 編輯任務欄位（標題、指派人、日期、狀態、進度等）。
  - 變更以批次方式儲存（computeWorkItemsDiff 計算差異 → 6 步驟批次 API 呼叫）。
- **US-PM-07 的 AC**：
  - 系統根據以下規則自動計算專案健康度：
    - 🟢 綠燈：所有任務已完成，或無逾期/受阻任務。
    - 🟡 黃燈：有任何逾期或受阻任務（但未達紅燈門檻）。
    - 🔴 紅燈：逾期任務超過 30%、受阻任務超過 20%、或專案已過截止日但仍有未完成任務。
  - 燈號在儀表板、專案列表、專案詳情頁等處清晰顯示。
- **US-Member-04 的 AC**：
  - 在「我的任務」頁面中，成員可找到「申請延期」按鈕。
  - 申請表單需包含：延期原因、新的預估截止日期、受影響的里程碑清單。
  - 提交申請後，PM 與主管可在「延遲審核」頁面查看待處理的申請。
  - <span style="background-color:#FFF3CD;">提交後，相關審核者收到站內通知。</span>

---

## 4. 功能需求

### 4.1 已實作功能 ✅

#### 專案管理核心
- 建立/編輯/刪除專案（基本資訊：名稱、專案代碼、專案類型、描述、起訖時間、預算、負責人）。
- 專案建立時需填寫：<span style="background-color:#FFF3CD;">專案層別（T1/T2/T3/CIP）、需求來源（公司政策/外部需求/內部需求/自提）</span>、專案類型、開案原因、預期效益、專案需求描述。
- <span style="background-color:#FFF3CD;">SMART 目標設定：提供獨立欄位引導使用者填寫（具體、可衡量、可達成、相關性、時限性），位於專案編輯彈窗的「SMART 目標」分頁。</span>
- AI 輔助專案建立：根據使用者輸入的基本資料，自動建議專案細節內容（里程碑、任務大綱）。
- 專案草稿功能：建立過程可儲存為草稿，支援列表管理（查看/編輯/刪除）。
- <span style="background-color:#FFF3CD;">專案代碼自動產生：依專案類型 + 年份自動遞增序號（ProjectCodeSequence）。</span>

#### 時間軸任務管理
- 使用時間軸表格（TimelineTable）作為主要管理介面，支援試算表式操作體驗。
- 里程碑與任務的 inline 新增、編輯、刪除，支援拖放排序（@dnd-kit/sortable）。
- <span style="background-color:#FFF3CD;">子任務支援：任務可設定 parent_id 建立父子階層，父任務進度由子任務自動聚合。</span>
- 批次儲存變更：computeWorkItemsDiff 計算差異 → 6 步驟 API 呼叫。
- 任務欄位：標題、指派人、開始/結束日期、狀態（todo/in_progress/done/blocked）、進度百分比、描述、優先級（low/medium/high）。
- 任務相依性：系統在建立時自動建立順序相依關係，並提供重建相依性 API。
- <span style="background-color:#FFF3CD;">里程碑批次完成：一鍵將里程碑下所有未完成任務標記為已完成。</span>

#### 甘特圖與相依分析
- 自建 GanttChart 元件 + GanttDependencyOverlay，視覺化任務時程與里程碑。
- <span style="background-color:#FFF3CD;">雙色條：琥珀色（計畫時程）+ 藍色（實際進度）+ 紅色延展段（延期部分）。</span>
- 支援拖拉調整任務時間、相依關係箭頭顯示。
- 支援多種檢視模式：日/週/月/季/年。
- <span style="background-color:#FFF3CD;">基線比較：可選擇顯示原始計畫基線。</span>
- <span style="background-color:#FFF3CD;">自動展開：首個未完成里程碑 + 逾期未開始的里程碑自動展開。</span>
- <span style="background-color:#FFF3CD;">任務相依分析 Tab：關鍵路徑計算、影響分析。</span>

#### <span style="background-color:#FFF3CD;">工作日誌（TaskLog）系統（開發期間追加：從簡單記錄升級為完整系統）</span>
- 團隊成員在任務下撰寫工作日誌，記錄工作內容、日期與工時。
- <span style="background-color:#FFF3CD;">完整 CRUD：新增/編輯/刪除日誌，支援篩選和分頁。</span>
- 工作日誌支援草稿自動儲存至 localStorage。
- <span style="background-color:#FFF3CD;">「更新紀錄」Tab 自動彙整所有任務日誌，按成員/日期分組顯示。</span>
- <span style="background-color:#FFF3CD;">儀表板根據 TaskLog 活動追蹤「本週是否有更新」。</span>

#### 專案健康度燈號
- 系統根據任務完成狀態**自動計算**專案健康度燈號，PM 無法手動覆蓋：
  - 🟢 綠燈：所有任務已完成，或無逾期/受阻任務。
  - 🟡 黃燈：有任何逾期或受阻任務。
  - 🔴 紅燈：逾期 >30%、受阻 >20%、或專案已過截止日。
- 燈號在儀表板、專案列表、專案詳情頁等處清晰顯示。

#### 里程碑基線功能
- 儲存里程碑基線快照，用於比較原始計畫與實際進度的差異。
- <span style="background-color:#FFF3CD;">延期申請核准時自動重設基線。</span>
- <span style="background-color:#FFF3CD;">里程碑 originalStartDate / originalEndDate 記錄初始日期。</span>

#### <span style="background-color:#FFF3CD;">自動同步機制（開發期間追加）</span>
- <span style="background-color:#FFF3CD;">`syncMilestoneStatus`：根據任務完成比例自動更新里程碑狀態與進度。</span>
- <span style="background-color:#FFF3CD;">`syncTaskProgressFromLogs`：根據工作日誌自動更新任務進度。</span>
- <span style="background-color:#FFF3CD;">`autoProgressTasks`：自動將已過開始日期的 todo 任務推進為 in_progress。</span>
- <span style="background-color:#FFF3CD;">父任務進度由子任務自動聚合計算。</span>

#### 延期申請流程
- 由團隊成員在「我的任務」頁面發起，填寫延期原因、新日期及受影響的里程碑。
- 支援兩種類型：延期（delay）與日期變更（date_change）。
- PM 與主管在「延遲審核」頁面查看待處理申請，選擇批准或駁回並填寫意見。
- <span style="background-color:#FFF3CD;">批准時系統自動級聯更新：更新對應任務的結束日期 + 重設里程碑基線。</span>
- <span style="background-color:#FFF3CD;">支援標記「需要協助」並追蹤解決狀態。</span>

#### <span style="background-color:#FFF3CD;">角色權限系統（RBAC）（開發期間追加：從 3 角色擴展為 4 角色 + RACI）</span>
- <span style="background-color:#FFF3CD;">系統有四個角色：**PM**、**Member**、**Executive**、**Admin**。</span>
- 權限矩陣：

| 功能 | PM | Member | Executive | <span style="background-color:#FFF3CD;">Admin</span> |
|------|:--:|:------:|:---------:|:-----:|
| 建立/編輯/刪除專案 | ✓ | ✗ | ✗ | <span style="background-color:#FFF3CD;">✓</span> |
| 查看所有專案 | ✓ | ✗ | ✓ | <span style="background-color:#FFF3CD;">✓</span> |
| 查看預算 | ✓ | ✗ | ✓ | <span style="background-color:#FFF3CD;">✓</span> |
| 編輯預算 | ✓ | ✗ | ✗ | <span style="background-color:#FFF3CD;">✓</span> |
| 管理團隊 | ✓ | ✗ | ✗ | <span style="background-color:#FFF3CD;">✓</span> |
| 管理風險 | ✓ | ✗ | ✗ | <span style="background-color:#FFF3CD;">✓</span> |
| 查看甘特圖 | ✓ | ✓ | ✓ | <span style="background-color:#FFF3CD;">✓</span> |
| 匯出報表 | ✓ | ✗ | ✓ | <span style="background-color:#FFF3CD;">✓</span> |
| 審核延期申請 | ✓ | ✗ | ✓ | <span style="background-color:#FFF3CD;">✓</span> |
| <span style="background-color:#FFF3CD;">填寫週報</span> | <span style="background-color:#FFF3CD;">✓</span> | ✗ | ✗ | <span style="background-color:#FFF3CD;">✓</span> |
| <span style="background-color:#FFF3CD;">後台管理</span> | ✗ | ✗ | ✗ | <span style="background-color:#FFF3CD;">✓</span> |

- Member 只能看到自己參與的專案。
- Executive 在風險列表中僅顯示高影響度（high）風險。
- 目前使用 Mock 驗證（硬編碼使用者清單 + 統一密碼 "demo"），登入後從 DB 同步真實角色。<span style="background-color:#FFF3CD;">API 端以 `x-user-email` header 做 admin 權限檢查。</span>

#### 儀表板
- KPI 統計卡片：專案總數、各燈號數量分佈、平均進度、預算使用率。
- <span style="background-color:#FFF3CD;">專案層級篩選：依 T1/T2/T3/CIP/全部 過濾顯示。</span>
- 風險列表：紅/黃燈專案的風險項目（Executive 僅顯示高影響度）。
- 即將到期里程碑：30 天內到期且未完成的里程碑。
- 本週未更新專案：根據 <span style="background-color:#FFF3CD;">TaskLog/WeeklyUpdate</span> 判斷本週是否有更新。
- 待審核延期申請數量。

#### <span style="background-color:#FFF3CD;">通知系統（開發期間追加：從 localStorage 遷移到 DB 完整實作）</span>
- <span style="background-color:#FFF3CD;">DB 支撐的通知中心，支援 8 種通知類型：</span>
  - <span style="background-color:#FFF3CD;">`task_assigned`（任務指派）、`delay_submitted`（延期提交）、`delay_approved`（延期核准）、`delay_rejected`（延期駁回）、`task_overdue`（任務逾期）、`support_needed`（需要協助）、`weekly_upload_missing`（週報缺繳）、`weekly_report_ready`（週報就緒）。</span>
- <span style="background-color:#FFF3CD;">通知鈴鐺圖示顯示未讀數量，支援全部標為已讀。</span>
- <span style="background-color:#FFF3CD;">前端每 20 秒輪詢一次取得最新通知。</span>
- <span style="background-color:#FFF3CD;">Admin 可依專案層級（T1/T2/T3/CIP）配置通知排程與 Email 範本。</span>

#### <span style="background-color:#FFF3CD;">週報系統（開發期間追加）</span>
- <span style="background-color:#FFF3CD;">PM 在 `/projects/[id]/update` 頁面提交週報。</span>
- <span style="background-color:#FFF3CD;">按里程碑填寫進度備註、整體狀態（on_time/delay）。</span>
- <span style="background-color:#FFF3CD;">延遲時可填寫追回可能性、建議重排日期、延遲原因，並可自動建立延期申請。</span>
- <span style="background-color:#FFF3CD;">支援「需要協助」與「下週計畫」欄位。</span>
- <span style="background-color:#FFF3CD;">支援語音輸入（Web Speech API，中文語音識別）。</span>

#### <span style="background-color:#FFF3CD;">報告功能（開發期間追加：大幅增強）</span>
- 報告頁面：統計、狀態分佈、專案詳細資訊、團隊工作量分佈。
- <span style="background-color:#FFF3CD;">PDF 報告匯出：</span>
  - <span style="background-color:#FFF3CD;">前端 jsPDF 即時產出 + 後端 Puppeteer 排程產出。</span>
  - <span style="background-color:#FFF3CD;">含儀表板統計、甜甜圈圖、專案狀態表格、漸層標頭樣式。</span>
- <span style="background-color:#FFF3CD;">Excel 匯出：ExcelJS 產出完整專案資料表。</span>
- <span style="background-color:#FFF3CD;">報告排程：Admin 設定每週固定時間自動產出 PDF 並透過 Email 寄送。</span>

#### <span style="background-color:#FFF3CD;">預算與投資報酬追蹤（開發期間追加）</span>
- <span style="background-color:#FFF3CD;">預算明細管理（ProjectBudgetItem）：站點、廠商、設備、數量、採購方式、單價、預估成本、實際成本。</span>
- <span style="background-color:#FFF3CD;">預估成本自動計算，不一致偵測提醒。</span>
- <span style="background-color:#FFF3CD;">支援 OCR/影像解析預算表格（parse-budget-image API）。</span>
- <span style="background-color:#FFF3CD;">ROI 計算器（roi-section）：</span>
  - <span style="background-color:#FFF3CD;">6 項指標輸入：毛利率（%）、均價（NTD/K）、產能（K/M）。</span>
  - <span style="background-color:#FFF3CD;">自動計算月利潤。</span>
  - <span style="background-color:#FFF3CD;">回收期 = 資本支出 / 月利潤。</span>
  - <span style="background-color:#FFF3CD;">Recharts 圖表視覺化呈現。</span>

#### <span style="background-color:#FFF3CD;">里程碑模板系統（開發期間追加）</span>
- <span style="background-color:#FFF3CD;">DB 層（MilestoneTemplateConfig + MilestoneTemplateTask）支援按專案類型設定預設里程碑與任務。</span>
- <span style="background-color:#FFF3CD;">模板支援樹狀結構（里程碑 → 任務 → 子任務）。</span>
- <span style="background-color:#FFF3CD;">Admin 後台可新增/編輯/刪除各專案類型的模板。</span>
- <span style="background-color:#FFF3CD;">建立專案時自動套用對應類型的模板，DB 模板優先、無則回退到硬編碼預設。</span>

#### <span style="background-color:#FFF3CD;">公開分享功能（開發期間追加）</span>
- <span style="background-color:#FFF3CD;">PM 可產生含 Token 的分享連結，設定到期時間。</span>
- <span style="background-color:#FFF3CD;">外部人員透過 `/share/[token]` 以唯讀方式查看專案（基本資訊、里程碑、任務、預算、ROI）。</span>
- <span style="background-color:#FFF3CD;">支援錯誤處理：連結無效（404）、已過期（410）、無權限（403）。</span>

#### 個人資料頁
- 使用者可檢視和編輯個人資訊（姓名、Email、組織/部門）。
- <span style="background-color:#FFF3CD;">顯示統計資訊：參與專案數、任務狀態分佈（總數/已完成/進行中/待開始）。</span>
- <span style="background-color:#FFF3CD;">顯示參與專案列表（可點擊跳轉）與近期活動紀錄。</span>

#### <span style="background-color:#FFF3CD;">後台管理系統（Admin）（開發期間追加：全新模組）</span>
- <span style="background-color:#FFF3CD;">**使用者管理**（`/admin/users`）：使用者列表、角色指派、組織樹狀結構側邊欄、AD 匯入。</span>
- <span style="background-color:#FFF3CD;">**角色管理**（`/admin/roles`）：角色權限說明與配置。</span>
- <span style="background-color:#FFF3CD;">**專案設定**（`/admin/project-settings`）：專案類型管理（代碼、名稱、預設模板）。</span>
- <span style="background-color:#FFF3CD;">**通知設定**（`/admin/notifications`）：依層級配置通知頻率、標題、訊息、Email 範本。</span>
- <span style="background-color:#FFF3CD;">**報告設定**（`/admin/reports`）：Email 排程（星期/時間）、收件人清單、PDF 檔名格式。</span>
- <span style="background-color:#FFF3CD;">**排程監控**（`/admin/schedule`）：Cron Job 執行紀錄（類型、時間、狀態、摘要、影響數）。</span>
- <span style="background-color:#FFF3CD;">**資料匯出**（`/admin/export-excel`）：全系統資料 Excel 匯出。</span>

#### <span style="background-color:#FFF3CD;">排程任務（Cron Jobs）（開發期間追加）</span>
- <span style="background-color:#FFF3CD;">使用 node-cron 每小時觸發一次，於路由內判斷是否為設定的執行時間。</span>
- <span style="background-color:#FFF3CD;">**weekly-notification**：檢查 PM 是否提交週報，未提交者發送缺繳通知 + Email。</span>
- <span style="background-color:#FFF3CD;">**weekly-report**：使用 Puppeteer 渲染所有專案摘要為 PDF，寄送給 Executive/PM。</span>
- <span style="background-color:#FFF3CD;">執行紀錄寫入 CronJobLog 表。</span>

#### <span style="background-color:#FFF3CD;">其他已實作功能（開發期間追加）</span>
- <span style="background-color:#FFF3CD;">語音輸入（VoiceInputButton）：Web Speech API 中文語音識別，用於週報與任務備註。</span>
- <span style="background-color:#FFF3CD;">深色模式（next-themes）：支援亮色/深色主題切換。</span>
- <span style="background-color:#FFF3CD;">使用指南頁面（`/guide`）：系統操作說明。</span>
- <span style="background-color:#FFF3CD;">AD 整合 API：搜尋 AD 使用者、取得組織樹狀結構。</span>

---

### 4.2 規劃中功能 🔸

#### <span style="background-color:#FFE0E0;">🔸 甘特圖重疊設計（v3.0 新增需求）</span>
- **現狀**：甘特圖以循序（Sequential）方式排列任務列，同一里程碑下的任務按順序逐行顯示。
- **目標**：改為「重疊」設計，允許時間重疊的平行任務在視覺上更緊湊地呈現，減少垂直空間浪費，更直觀地看出哪些任務可以同時進行。
- **規格**：
  - 同一里程碑下，時間不重疊的任務可共享同一行（swim lane）。
  - 時間重疊的任務分配到不同行。
  - 保留現有的雙色條（計畫/實際）、相依線、基線對比等功能。
  - 使用者可在「循序」與「重疊」模式間切換。

#### <span style="background-color:#FFE0E0;">🔸 里程碑 / 任務 / 子任務日期編輯（v3.0 新增需求）</span>
- **現狀**：任務日期可在時間軸表格與任務詳情面板中編輯，但里程碑與子任務的日期調整方式不夠直觀。
- **目標**：在專案編輯介面中，里程碑、任務、子任務均可透過日期欄位直接修改起訖日期。
- **規格**：
  - 里程碑：修改起訖日期時，可選擇是否連帶調整其下所有任務的日期（等比位移或僅調整邊界）。
  - 任務：修改日期時，自動檢查是否違反相依性約束，若有衝突則提示。
  - 子任務：修改子任務日期時，自動更新父任務的起訖日期範圍。
  - 支援日曆選擇器（DatePicker）inline 編輯。

#### <span style="background-color:#FFE0E0;">🔸 專案 KPI 指標（v3.0 新增需求）</span>
- **現狀**：專案有 SMART 目標但無獨立的 KPI 指標管理。
- **目標**：在新增/編輯專案時，增加「KPI 指標」區塊，讓 PM 定義該專案的關鍵績效指標。
- **規格**：
  - KPI 欄位：指標名稱、目標值、單位、衡量方式、當前值、達成狀態。
  - 支援多筆 KPI（動態新增/刪除）。
  - 在專案詳情頁的「專案資訊」區塊展示 KPI 達成狀況。
  - 在儀表板/報表中可彙整各專案 KPI 達成率。

#### <span style="background-color:#FFE0E0;">🔸 準時達成率（OTD）圖表（v3.0 新增需求）</span>
- **現狀**：系統追蹤任務是否逾期（健康度燈號），但未提供 OTD 指標的獨立圖表分析。
- **目標**：在專案詳情頁與報表分析中，新增 OTD（On-Time Delivery）圖表，呈現專案/組織的準時交付績效。
- **規格**：
  - OTD 計算：準時完成的任務數 / 總完成任務數 × 100%。
  - 可按里程碑、月份、專案類型等維度分析。
  - 圖表類型：折線圖（趨勢）+ 柱狀圖（各期 OTD）。
  - 在專案詳情頁新增「OTD 分析」Tab 或區塊。
  - 在報表頁面增加 OTD 彙整圖表。

#### <span style="background-color:#FFE0E0;">🔸 專案章程簽署（v3.0 新增需求 — 需求者內部待討論）</span>
- **目標**：專案成立時，被指定為 R（Responsible，負責人）角色的團隊成員需簽署專案章程，確保所有利害關係人同步了解專案目標、範圍與責任。
- **規格（初步）**：
  - 專案建立/發布後，系統自動通知所有 R 角色成員進行章程簽署。
  - 簽署頁面展示專案基本資訊、SMART 目標、里程碑概要、各成員責任分工。
  - 成員確認「已閱讀並同意」後完成簽署，系統記錄簽署時間與 IP。
  - PM 可在專案詳情頁查看章程簽署狀態（已簽/未簽清單）。
  - 未簽署者定期收到提醒通知。

#### <span style="background-color:#FFE0E0;">🔸 SMART 目標展示於專案詳情頁（v3.0 新增需求）</span>
- **現狀**：SMART 目標在專案編輯彈窗中可填寫，但專案詳情頁（project detail page）的「專案資訊」區塊未直接展示。
- **目標**：在專案詳情頁的專案資訊區塊中，清楚展示 SMART 五項目標內容。
- **規格**：
  - 以卡片或折疊面板形式呈現 S / M / A / R / T 五個維度。
  - 僅在有填寫內容時顯示，避免空白區塊。
  - 唯讀展示，編輯仍透過專案編輯彈窗進行。

#### <span style="background-color:#FFE0E0;">🔸 後台角色權限 — 週報填寫權限說明（v3.0 新增需求）</span>
- **現狀**：角色管理頁面列出各角色權限，但缺少「填寫週報」權限的明確說明。
- **目標**：在後台角色管理頁面中，補上「填寫週報」權限的說明，並確保權限控制與 UI 一致。
- **規格**：
  - 權限矩陣新增「填寫週報」列，標明哪些角色可提交週報（目前為 PM 與 Admin）。
  - 若未來開放 Member 填寫，需在此處可配置。

#### <span style="background-color:#FFE0E0;">🔸 專案編輯 Lock 功能（v3.0 新增需求 — 待討論）</span>
- **目標**：PM 在編輯專案里程碑/任務時，可「鎖定」專案，防止其他人同時修改造成資料衝突。
- **規格（初步）**：
  - PM 進入專案編輯模式時，系統自動或手動鎖定。
  - 其他使用者嘗試編輯時看到「目前由 XXX 編輯中」提示，僅能唯讀查看。
  - 鎖定設有逾時機制（如 30 分鐘無操作自動解鎖）。
  - Admin 可手動強制解鎖。

#### <span style="background-color:#FFE0E0;">🔸 投資報酬區塊增強（v3.0 新增需求）</span>
- **現狀**：ROI section 已有 6 項指標計算與 Recharts 圖表。
- **目標**：進一步完善投資報酬分析區塊。
- **規格（初步）**：
  - 在專案詳情頁獨立顯示 ROI 分析區塊（目前僅在編輯彈窗與分享頁）。
  - 增加 ROI 歷史對比（若有多次更新）。
  - 在儀表板增加整體 ROI 彙總指標。

---

### 4.3 功能發展藍圖

#### 近期（Next Release）
1. <span style="background-color:#FFE0E0;">甘特圖重疊設計</span>
2. <span style="background-color:#FFE0E0;">里程碑/任務/子任務日期編輯優化</span>
3. <span style="background-color:#FFE0E0;">專案 KPI 指標</span>
4. <span style="background-color:#FFE0E0;">OTD 圖表</span>
5. <span style="background-color:#FFE0E0;">SMART 展示於專案詳情頁</span>
6. <span style="background-color:#FFE0E0;">後台角色權限補充週報填寫說明</span>
7. <span style="background-color:#FFE0E0;">投資報酬區塊增強</span>

#### 中期
1. <span style="background-color:#FFE0E0;">專案章程簽署（待內部討論後確認規格）</span>
2. <span style="background-color:#FFE0E0;">專案編輯 Lock 功能（待評估必要性）</span>
3. 燈號門檻值自訂功能
4. 真實身分驗證（JWT/Session + AD SSO 整合）
5. 專案文件管理（上傳/預覽/版本/審核）
6. 個人化儀表板（自訂小工具）

#### 長期
- 行事曆視圖（月曆形式呈現任務截止日期）
- 第三方整合（Webhook 通知至 Slack/Teams）
- AI 進階功能（自動摘要、風險識別建議）
- 任務獨立評論系統（與工作日誌分開）
- 手機響應式優化
- 多層級簽核流程

---

## 5. 非功能性需求

### 效能
- 頁面主要功能載入時間（標準網路環境）應小於 3 秒。
- 時間軸表格拖放排序與甘特圖操作的反饋延遲應小於 100 毫秒。
- 系統應能支援至少 50 個專案與 5000 個任務同時運作。

### 安全性
- 所有傳輸資料必須使用 HTTPS 加密。
- 目前為 Mock 驗證，統一密碼 "demo"（正式上線前需替換為真實身分驗證）。
- <span style="background-color:#FFF3CD;">API 層面以 `x-user-email` header 做角色權限檢查（Admin guard）。</span>
- 嚴格實作角色權限控制（RBAC），確保使用者只能存取被授權的專案與功能。

### 可用性
- 介面設計符合直覺操作，參考主流專案管理工具的使用模式，避免過於複雜。
- 系統為響應式網頁設計（RWD），適應桌面、平板等不同螢幕尺寸。
- 提供明確的操作指引與工具提示（Tooltip），特別是首次使用時間軸表格、甘特圖與燈號功能時。
- <span style="background-color:#FFF3CD;">支援深色模式。</span>

### 可靠性
- 系統核心服務（專案存取、任務更新）的可用性目標為 99.5%。
- 需建立定期自動備份機制，確保資料可恢復。
- 關鍵操作（如刪除專案、刪除任務）需有二次確認彈窗。
- 專案草稿與工作日誌草稿有自動儲存機制，防止資料遺失。

---

## 6. 成功指標（KPI）

### 量化的成功標準
- **使用者採用率**：上線三個月內，目標團隊的註冊使用者啟用率達 80%（啟用定義：至少建立一個任務或更新一次狀態）。
- **專案覆蓋率**：六個月內，公司內 70% 的新啟動專案使用此系統管理。
- **操作效率**：相較於舊方法（Email + Excel），專案狀態同步頻率提升 50%。
- **使用者滿意度**：季度問卷 NPS ≥ +30。
- **管理效率**：延期申請從提出到回覆的平均時間縮短 30%。
- <span style="background-color:#FFE0E0;">**準時達成率**：🔸 系統上線後追蹤 OTD 指標，目標 OTD ≥ 85%。（v3.0 新增）</span>

### 衡量方式
- 採用率與覆蓋率：透過後台數據分析使用者活躍度與專案創建數量。
- 操作效率：比對系統內任務更新次數與過往同期間的郵件往來。
- 使用者滿意度：定期線上問卷。
- 管理效率：分析系統內延期申請流程日誌。
- <span style="background-color:#FFE0E0;">OTD：系統內建 OTD 圖表自動計算與追蹤。</span>

---

## 7. 風險與假設

### 已知風險與應對方案
- **風險**：團隊抗拒改變，不願從現有工具遷移。
  - **應對**：由上而下推動，從示範團隊開始展示效益。提供資料導入範本。
- **風險**：自動燈號門檻值不適用所有專案類型。
  - **應對**：中期規劃門檻值自訂功能。持續觀察預設值合理性。
- <span style="background-color:#FFE0E0;">**風險**：甘特圖重疊設計可能在大量任務時造成視覺混亂。</span>
  - <span style="background-color:#FFE0E0;">**應對**：提供「循序」與「重疊」模式切換，讓使用者依需求選擇。</span>
- **風險**：Mock 驗證不適合正式部署，存在安全風險。
  - **應對**：正式上線前替換為真實身分驗證（JWT/Session + AD SSO）。
- <span style="background-color:#FFE0E0;">**風險**：專案章程簽署流程可能增加使用門檻，降低團隊接受度。</span>
  - <span style="background-color:#FFE0E0;">**應對**：先進行內部討論確認需求，簡化簽署流程（一鍵確認），避免過於繁複。</span>
- <span style="background-color:#FFF3CD;">**風險**：大型元件（task-detail-sheet 121KB、gantt-chart 71KB）可能影響頁面效能。</span>
  - <span style="background-color:#FFF3CD;">**應對**：視需要進行元件拆分與懶載入優化。</span>

### 關鍵假設
- 假設目標使用者已具備基本專案管理概念（任務、截止日期、里程碑）。
- 假設公司內部網路環境穩定，足以支援 Web 應用程式正常操作。
- 假設管理層願意支持並要求團隊使用此系統進行專案追蹤。
- 假設團隊能接受並遵守在任務下定期撰寫工作日誌的要求。

---

## 附錄：技術架構摘要

| 項目 | 技術選型 |
|------|---------|
| 前端框架 | Next.js 16 (App Router) + React 19 + TypeScript |
| UI 元件庫 | shadcn/ui + Radix UI + Tailwind CSS 4 |
| 資料庫 | <span style="background-color:#FFF3CD;">MySQL/MariaDB + Prisma ORM 7（@prisma/adapter-mariadb）</span> |
| 狀態管理 | <span style="background-color:#FFF3CD;">Zustand（client-side）</span> |
| 甘特圖 | 自建元件（GanttChart + GanttDependencyOverlay） |
| PDF 生成 | jsPDF（前端）<span style="background-color:#FFF3CD;">+ Puppeteer（後端排程）</span> |
| Excel 匯出 | <span style="background-color:#FFF3CD;">ExcelJS</span> |
| 拖放排序 | @dnd-kit/sortable |
| 圖表 | <span style="background-color:#FFF3CD;">Recharts</span> |
| 排程 | <span style="background-color:#FFF3CD;">node-cron</span> |
| 語音輸入 | <span style="background-color:#FFF3CD;">Web Speech API</span> |
| 驗證機制 | Mock 驗證（hardcoded users + localStorage <span style="background-color:#FFF3CD;">+ DB role sync</span>） |
| 部署環境 | 待定 |

### <span style="background-color:#FFF3CD;">資料模型概要（23 Models，原 12 個）</span>
- **User** — 使用者（pm / member / executive / <span style="background-color:#FFF3CD;">admin</span>）
- **Project** — 專案（含 SMART 目標、預算、專案類型、<span style="background-color:#FFF3CD;">層級</span>等）
- **ProjectTeamMember** — 專案團隊成員（<span style="background-color:#FFF3CD;">RACI 矩陣</span>）
- **Milestone** — 里程碑（<span style="background-color:#FFF3CD;">含基線日期</span>）
- **MilestoneBaseline** — 里程碑基線快照
- **Task** — 任務（<span style="background-color:#FFF3CD;">支援子任務 parent_id、優先級</span>）
- **TaskDependency** — 任務相依性
- **TaskLog** — 工作日誌（<span style="background-color:#FFF3CD;">含附件</span>）
- **Risk** — 風險項目（影響度/機率矩陣）
- <span style="background-color:#FFF3CD;">**WeeklyUpdate** — 週報（含里程碑更新）</span>
- <span style="background-color:#FFF3CD;">**MilestoneUpdate** — 週報中的里程碑進度更新</span>
- **DelayRequest** — 延期申請（含受影響里程碑）
- <span style="background-color:#FFF3CD;">**AffectedMilestone** — 延期影響的里程碑</span>
- <span style="background-color:#FFF3CD;">**Notification** — 通知（8 種類型）</span>
- **ProjectDraft** — 專案草稿
- <span style="background-color:#FFF3CD;">**ShareLink** — 公開分享連結</span>
- <span style="background-color:#FFF3CD;">**ProjectBudgetItem** — 預算明細</span>
- <span style="background-color:#FFF3CD;">**ProjectCodeSequence** — 專案代碼自動遞增序號</span>
- <span style="background-color:#FFF3CD;">**SystemSetting** — 系統設定（key/value）</span>
- <span style="background-color:#FFF3CD;">**NotificationProfile** — 通知排程配置（依層級）</span>
- <span style="background-color:#FFF3CD;">**MilestoneTemplateConfig** — 里程碑模板（依專案類型）</span>
- <span style="background-color:#FFF3CD;">**MilestoneTemplateTask** — 模板任務（樹狀結構）</span>
- <span style="background-color:#FFF3CD;">**ProjectTypeConfig** — 專案類型定義</span>
- <span style="background-color:#FFF3CD;">**CronJobLog** — 排程任務執行紀錄</span>

### API 路由數量
- <span style="background-color:#FFF3CD;">共 56 個 REST API 端點（原預估 20-30 個）</span>，涵蓋：專案 CRUD、團隊、里程碑、任務、風險、<span style="background-color:#FFF3CD;">預算、延期審核、通知、儀表板、報表、週報、管理後台、AI、排程、分享</span>、使用者搜尋、<span style="background-color:#FFF3CD;">AD 整合</span>等。

---

**文件版本**：v3.0
**建立時間**：2026/2/9
**更新時間**：2026/4/30
**文件狀態**：已修訂 — 反映系統現況 + 納入新規劃功能

### 狀態標記說明
- ✅ — 已實作
- 🔸 — 規劃中（v3.0 本次新增需求）
- ⏳ — 待討論（需內部確認後決定規格）

### 底色標記說明
- 無底色 — 原始 PRD v1.0 規劃範圍
- <span style="background-color:#FFF3CD;">黃色底色</span> — 開發期間追加的已交付功能
- <span style="background-color:#FFE0E0;">紅色底色</span> — v3.0 本次新提的需求（🔸 尚未開發）
