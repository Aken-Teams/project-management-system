# 最終完整稽核（2026-07-10）— 給 USER 測試前的最後一次全掃

> 來源：四個平行代理用「全新視角」掃現況（延期連動+編輯一致性 / 進度+今天定義 / 通知+weekOf+cron / 新程式+一般回歸），去重整理。
> 重點放在「這一串大改動的**回歸**與**新邏輯的邊界**」，不是重列已修的舊清單。
> 主 bug 清單見 `docs/bug-audit-2026-07-09.md`（#1~#17 已處理完）。

---

## 📌 這份怎麼讀

- **A 區**：我在這次稽核當下**已經改掉**的（含一個我自己這串挖的當機）。都可回退，改完 typecheck 維持 21（零新錯誤）。
- **B 區**：**還沒動、要你先看**的發現，依嚴重度排。標 🔴/🟠/🟡。
- **C 區**：專案評分與結論。

> 流程備註（客戶節奏）：正常應「先整理 MD、你確認後再動」。A 區是我看到有當機級回歸先補了，若你要全部回退重審，說一聲即可。

---

## A 區 — 已改（可回退，typecheck 21）

| # | 改動 | 原因 | 影響檔案 | 風險 |
|---|------|------|----------|------|
| A1 | 補 `record_uploaded` 通知 UI（client union + icon/color/label 三張 map + 篩選 tab） | **本串自挖的當機**：上輪加了 DB 新型別 `record_uploaded` 卻沒同步前端 → R 一上傳工作紀錄，A 一開通知鈴/通知頁就 `<Icon undefined>` 整頁崩潰 | `lib/notification-store.tsx`、`components/notification-bell.tsx`、`app/notifications/page.tsx` | 極低（純補漏） |
| A2 | transformer 補 map `pendingTaskChanges`（+型別欄位） | 專案詳情頁的「延期影響樹」靠它畫任務列；transformer 漏 map → 專案頁只看得到里程碑條、看不到任何任務延長/順延列（審核中心頁正常，因走另一支 API） | `lib/project-transformer.ts` | 極低（補一行 + 型別） |
| A3 | batch route `JSON.parse`→`safeJsonParse` | #14 漏網的第 6 支：在 `$transaction` 內、未 try/catch，任一舊 log 的 attachments 壞掉 → 整批週報儲存 rollback | `app/api/projects/[id]/task-logs/batch/route.ts` | 極低 |
| A4 | 進度分子上界壓在「今天」 | 「有紀錄就有進度」拿掉逾期過濾後，**誤填未來日期的 log** 會讓 `latestLog > endDate` → 進度瞬間封頂 99%。改成 `min(latestLog, todayUtc())`，語意＝進度反映「到今天為止經過多少工期」 | `lib/sync-milestone-status.ts` | 低 |
| A5 | 逾期通知改用 `todayUtc()` | cron 用本地 `new Date()` 比 UTC-midnight 的 dueDate → **到期當天就發逾期信**，但 UI（甘特/里程碑視圖）當天不顯示紅 → 使用者必當 bug 回報。統一「當天到期不算逾期」 | `lib/notifications.ts` | 低 |
| A6 | 5 個 fire-and-forget 通知呼叫補 `.catch()` | 這些 async 通知未 await、函式開頭的 prisma 查詢在 createNotification 的 try/catch 之外 → DB 抖動時 unhandledRejection | `tasks/route.ts`、`tasks/[taskId]/route.ts`、`delay-requests/route.ts`(×2) | 極低（防禦） |

> 待辦：A 區動到後端 + schema 前端型別，**需重啟 dev server + 硬重新整理**再測。

---

## B 區 — 還沒動、要你先看

### 🔴 高（建議修，但屬需你點頭的範圍）

#### B-H1　延期核准 step-4 會誤改「無關任務」的日期、還冒出假紅段【受保護的 cascade 區】＋ pending 鎖編輯（客戶設計決策 2026-07-10）
- **位置**：`app/api/delay-requests/[id]/review/route.ts:247-283` × `app/api/projects/[id]/tasks/[taskId]/route.ts:87-118`
- **問題**：核准任一延期時，step-4 對**整個專案每一個任務**強制 `end = start + durationDays - 1`。而任務允許三值（start/end/duration）各自獨立設定，且任何日期/工期編輯會把 `originalStartDate` 清成 null。於是只要專案裡存在任一「end ≠ start+dur-1」的任務（**手動改期/拖曳後常出現**），一個**完全無關**的延期核准就會：① 改寫它的 endDate；② 因為 original 是 null 而把當下日期存成 original → 甘特 `hasExtension` 判定 span 變大 → 在**沒被延期的任務**上畫紅色延長段。
- **會不會發生**：會。觸發＝專案內有任一工期/端點不一致的任務 + 之後任一次延期核准。

##### 客戶設計決策（日期主權模型）
1. **有 pending 延期申請時 → 鎖住日期編輯，等 S 審完才能改。**
2. **編輯以「最後一次核准的延期結果」為主**：建案第一版里程碑 → 編輯可改里程碑 → 延期通過後 → 編輯看到的是「通過後」的日期。
3. **手動拖曳/編輯 = 只動自己、不連動**（舊行為會動+連動，USER 視為 bug）。
4. **唯一的相依只有「延期申請」這條**，且是甘特上算的；一旦寫進 DB 就只是「綁在那一列的日期」，不是活的相依線。

##### 現況對照（已查程式，好消息：規則 2/3/4 大半已符合）
| 規則 | 現況 | 差距 |
|---|---|---|
| 規則 2「編輯以核准結果為主」 | 編輯對話框讀 DB、已核准延期已寫進 DB → **已符合**（客戶測試一致） | 無 |
| 規則 3「拖曳不動日期」 | `timeline-table` 拖曳縮排註解明寫 `dates preserved`，只改層級不動日期 → **已符合** | 無 |
| 規則 3/4「編輯不連動」 | 編輯對話框註解「連動只保留在延期申請流程，不在此編輯流程」，日期變更走審核申請不即時改 → **已符合** | 無 |
| 規則 1「pending 時鎖編輯」 | 目前**沒有**任何 pending 擋編輯的卡控 | ⬅ 要新增 |
| B-H1 本身 | 核准 step-4 對全專案每任務強制 `end=start+dur-1` | ⬅ 要縮範圍 |

##### 修復方案（兩件事）
1. **（新增）pending 卡控**
   - **欄位範圍（客戶確認）**：**只鎖日期/里程碑欄位**；名稱、負責人、團隊、預算仍可即時改。
   - **入口範圍（客戶確認）**：**編輯專案對話框的日期/里程碑 + 甘特/時程表的拖曳縮排，兩個入口都鎖。**
   - **條件**：該專案存在任一 `status='pending'` 的延期申請時觸發鎖定，S 審核（核准或駁回）後解鎖。
   - **UX**：鎖定處顯示「有延期申請審核中，暫不可調整時程」提示。
2. **（修 B-H1）核准 step-4 縮範圍**
   - 核准時**只動「這筆延期實際影響的任務」**（延長群組 `pendingTaskChanges` + 順延下游 + `affectedMilestones`），**其餘任務的手動日期一律不碰**。
   - 對應「除了延期，誰都不連動、以手動 DB 為主」。
   - **保護區注意**：屬「不可移除 cascade」，實作前另出「改動點＋影響範圍」細部 diff 再動。

##### 實作狀態（2026-07-10，兩部分都已完成）
- ✅ **pending 卡控已實作**：`project-edit-dialog` 算 `hasPendingDelay = delayRequests.some(status==='pending')` → 傳 `locked` 給 `TimelineTable`；`TimelineTable` 新增 `locked` prop，鎖住拖曳(不 spread dnd listeners)、里程碑/任務的改名/日曆天/日期(改唯讀 span)/優先度/新增/刪除/縮排/升降階/新增里程碑，**唯一保留「指派人」下拉可改**；專案開始日期 input 也一併 disable。里程碑分頁頂端顯示琥珀色審核中提示。TimelineTable 僅用於編輯對話框與建案精靈（新專案無 pending），入口全覆蓋。
- ✅ **step-4 縮範圍已實作**：`review/route.ts` 核准 step-4 加 `affectedTaskIds`（= pendingTaskChanges 的 taskId ∪ trigger），**只有受影響任務才重排日期/存 original**；其餘任務用「實際 DB 日期」納入里程碑 envelope、完全不改寫。真正的延期連動（群組延長/下游順延）照舊由 step-2/2c/3 套用，未動。
  - **關鍵發現**：舊 step-4 的 `taskStart = new Date(task.startDate)` 從不移動 start，它只是全域強制 `end=start+dur-1`（＝ B-H1 來源）；真正順延在 pendingTaskChanges。
  - **為何卡控之外仍需這條**：卡控只擋 pending 窗內；step-4 守的是「延期**之前/之間**產生的手動日期」——(a) 第一筆延期前就手動拖成 end≠start+dur-1；(b) 某任務延期**核准後**（無 pending、可自由拖）USER 又拖成 end≠start+dur-1，再送**另一筆**延期核准。這兩條卡控管不到，靠 step-4 縮範圍守住。

##### 驗收測試（B-H1）
1. **延期連動仍正確**：送一筆會「延長+順延」的延期 → 核准 → 群組延長、下游順延、里程碑 dueDate 皆正確。
2. **無關手動任務不被清**：在**無 pending**時把某無關任務拖成 end≠start+dur-1（pending 時鎖住無法設置，故先設置）→ 再送並核准**另一筆**延期 → 該無關任務日期**不變、無假紅段**。
3. **卡控**：有 pending 時開「編輯專案 › 里程碑」→ 只有指派人可改、其餘全鎖 + 提示橫幅；S 審完解鎖。

#### B-H2　父任務進度雙來源、會 50%↔0% 來回跳 ✅ 已修（2026-07-10，客戶授權直接動手）
- **位置**：`app/api/projects/[id]/tasks/[taskId]/route.ts:185-219`（原 PATCH rollup）
- **問題（原）**：改子任務時 PATCH 把父進度 rollup 成子加權（如 50%）；下次 GET 用 `syncTaskProgressFromLogs` 把父重算成「父自己報告」（父沒寫→0）→ 父那格 50%↔0% 閃跳，與模型「每個任務含父＝自己報告、只有里程碑聚合葉任務」衝突。
- **修法**：**移除 PATCH 時的祖先進度 rollup 整段**（不再改寫父層 progress/status/completedAt）。父任務進度單一來源＝GET 的自己報告；里程碑聚合維持葉任務。回傳殼保留（`parentProgress/parentStatus` 改回傳父層現值，不重算、不寫入），前端該列更新不受影響。順手移除已無用的 `computeWeightedProgress` import。
- **附帶行為變更**：父任務不再「子任務全完成就自動完成」——符合模型（父完成看自己報告）。里程碑進度不受影響（本就聚合葉任務）。

### 🟠 中（要你決定語意/範圍）

#### B-M1　側邊欄徽章數字與「我的任務」頁對不上
- **位置**：`app/api/sidebar-badges/route.ts:40-44`（我上輪新加的端點）vs `app/my-tasks/page.tsx:479-487`
- **問題**：徽章的「風險任務」只算 `未完成 && endDate<今天`（純逾期，且含父任務）；但「我的任務」頁的 at-risk 涵蓋 `at-risk + overdue + overdue-not-started` 三種、**且**把「已送延期申請」的排除。→ 側邊欄顯示 N，點進去是另一個數字；已申請延期的逾期任務側邊欄仍紅點。
- **另一點（低）**：送出延期/完成任務後徽章不即時刷新，要整頁重載才更新。
- **要你決定**：徽章要對齊「我的任務」頁的定義（含 at-risk、排除延期中）嗎？

#### B-M2　A 撰寫台「一鍵前序完成」實際會標完「整個里程碑」
- **位置**：`components/a-weekly-report-composer.tsx:152-155,189`
- **問題**：文案是「前序皆已完成」，但實作是用 `milestoneId` 收集**整個里程碑內所有未完成任務**都標 100%（不是只標前序/相依）。可能把不該完成的任務一起標掉。
- **要你決定**：這顆按鈕到底該標「哪些」？（真前序/相依 vs 整個里程碑 vs 拿掉這功能）

### 🟡 低（邊界 / 清理，記錄即可）

- **B-L1**　`app/api/dashboard/route.ts:264` 還有一處用本地 `new Date()` 判「即將到期/本週」→ 第 4 套「今天」漏網，邊界日差一天。
- **B-L2**　`lib/user-match.ts` `isSameUser` 規則 4「姓名互為末段」偏寬（如「怡君」對「王怡君」會誤配），中文短名長尾風險。
- **B-L3**　舊 `lib/project-store.tsx`（localStorage mock）仍被 `app/gantt/page.tsx`、`app/projects/new/page.tsx` 引用 → 這些頁資料與 DB 不同步（屬 memory 記的 dead-and-hidden-features）。
- **B-L4**　`components/weekly-activity-summary.tsx` 舊資料（無 weekOf）的 `getWeekMonday` fallback 用 `toISOString()` 會位移一週；新資料有 weekOf 不受影響。
- **B-L5**　`notifyRecordUploadedToAccountable` 去重窗以 UTC 日為界，台北 08:00 前後各上傳一次會多發一則（方向是多發、非漏發）。

### ✅ 代理交叉驗證「安全、非 bug」（避免誤修）
- 延頂層任務不會 duration 雙加；里程碑聚合葉任務三處一致；孤兒子任務不存在（milestoneId 非空）；weekOf 格式 R/A/WeekPicker 三方一致；cron 閘門/preview/ownerId 正確；safeJsonParse 五支替換正確；編輯對話框 origTasks 三處 init 一致（開啟不誤觸發存檔）。

---

## C 區 — 專案評分與結論

### 分數：**7.5 / 10**（基準＝即將給 USER 測試的內部工具）

**加分（+）**
- 核心流程完整自洽：建案 → 任務 → R 報告 → A 彙整 → 延期審核 → 甘特/進度。
- 延期連動、進度聚合、weekOf、通知這串大改後，「使用者看得到的流程 bug」已清得差不多。
- 有稽核文件、身分容錯比對、typecheck 守住 21。

**扣分（−）**
- ~~正確性暗雷：B-H1 step-4 誤改日期、B-H2 父進度雙來源~~ → **已修（2026-07-10）**，兩顆 🔴 收掉。
- **權限層整套是 mock**：server 端幾乎不擋、`x-user-email` 可偽造、4 支破壞性 admin API 裸奔（#S1~S5）。內部測沒差，**上線前必過**。
- 剩中/低：B-M1 徽章一致性、B-M2 一鍵前序完成語意、B-L 邊界（第 4 套今天、isSameUser 過寬、舊 project-store 孤兒頁）。

### 一句話結論（2026-07-10 更新）
> **兩顆 🔴 正確性暗雷（B-H1 step-4 + pending 卡控、B-H2 父進度）已收 → 流程面可以請 USER 測了。** 剩中/低（徽章、一鍵完成語意、時區邊界）可測試中一併觀察；權限（#S1~S5）是**上線前**的門檻，非測試前。

### 建議下一步（三選一）
- **(A)** A 區已改的先回退，我們一條一條看。
- **(B)** A 區保留（都是補漏），我把 B-H1、B-H2 各寫一份「方案＋影響範圍」給你審。
- **(C)** B 區先不碰，直接去寫給 USER 的測試流程＋觸發時間文件（大量 Mermaid，見 memory pending-flow-doc-for-client）。
