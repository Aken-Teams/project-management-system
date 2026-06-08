# BDD 行為驅動開發報告

# Behavior-Driven Development Report

**專案名稱：** 專案管理系統 (Project Management System)
**版本：** 1.0
**日期：** 2026-05-29
**技術堆疊：** Next.js 15 / TypeScript / Prisma ORM / MySQL (MariaDB)

---

## 目錄

1. [概述](#1-概述)
2. [BDD 流程與規範](#2-bdd-流程與規範)
3. [Feature 規格文件](#3-feature-規格文件)
   - 3.1 認證與授權
   - 3.2 專案管理
   - 3.3 里程碑與任務管理
   - 3.4 延遲申請審批
   - 3.5 週報與進度追蹤
   - 3.6 通知系統
   - 3.7 預算與 CAPEX 管理
   - 3.8 風險管理
   - 3.9 儀表板
   - 3.10 報表匯出
   - 3.11 管理員後台
   - 3.12 共享連結
4. [Scenario Outline 與資料表](#4-scenario-outline-與資料表)
5. [Step Definitions 對照表](#5-step-definitions-對照表)
6. [BDD 測試執行策略](#6-bdd-測試執行策略)
7. [Feature 覆蓋率矩陣](#7-feature-覆蓋率矩陣)

---

## 1. 概述

本文件定義專案管理系統的行為驅動開發（BDD）規格，採用 **Gherkin** 語法描述系統預期行為。每個 Feature 檔案以使用者可理解的自然語言撰寫，作為業務需求、開發實作與自動化測試的共同溝通文件（Living Documentation）。

### BDD vs ATDD 差異

| 面向 | ATDD | BDD |
|------|------|-----|
| 關注點 | 驗收標準是否滿足 | 系統行為是否符合商業價值 |
| 撰寫者 | QA / 開發者 | 三方協作（業務/QA/開發） |
| 格式 | AC 表格 | Gherkin Feature Files |
| 粒度 | 驗收條件層級 | 完整使用者場景 |
| 自動化 | 可選 | 核心目標（Living Documentation） |

### BDD 三大角色協作（Three Amigos）

```
  業務分析師 / PM          QA 測試人員            開發人員
        │                      │                     │
        └──────── 需求討論會 (Discovery) ───────────┘
                        │
                  撰寫 Feature 規格
                  (Gherkin Scenarios)
                        │
              ┌─────────┼─────────┐
              │         │         │
         業務驗證    自動化測試    程式實作
         (Review)   (Step Defs)  (Production)
```

---

## 2. BDD 流程與規範

### 2.1 Gherkin 語法規範

```gherkin
Feature: 功能名稱
  功能的業務描述

  Background:
    前置條件（每個 Scenario 共用）

  Scenario: 場景名稱
    Given 前置狀態
    And   附加前置條件
    When  使用者操作
    And   附加操作
    Then  預期結果
    And   附加驗證
    But   排除條件

  Scenario Outline: 帶參數的場景
    Given <condition>
    When  <action>
    Then  <result>

    Examples:
      | condition | action | result |
      | value1    | act1   | res1   |
      | value2    | act2   | res2   |
```

### 2.2 命名慣例

- **Feature 檔案：** `features/[module]/[feature-name].feature`
- **Step Definitions：** `steps/[module].steps.ts`
- **Scenario 命名：** 動詞開頭，描述行為（例：「成功建立新專案」）

### 2.3 標籤策略

```gherkin
@module-auth          # 模組標籤
@priority-critical    # 優先級標籤
@smoke                # 煙霧測試
@regression           # 回歸測試
@wip                  # 開發中
@manual               # 需人工測試
@api                  # API 層級測試
@ui                   # UI 層級測試
```

---

## 3. Feature 規格文件

### 3.1 認證與授權

```gherkin
# features/auth/login.feature

@module-auth @priority-critical @smoke
Feature: 使用者登入
  身為系統使用者
  我希望能透過 Email 和密碼登入系統
  以便存取我被授權的功能

  Background:
    Given 系統已啟動且資料庫連線正常
    And   以下使用者已存在於系統中:
      | email              | name       | role      | password |
      | alice@example.com  | Alice Chen | admin     | demo     |
      | dave@example.com   | Dave Liu   | pm        | demo     |
      | bob@example.com    | Bob Wang   | member    | demo     |
      | carol@example.com  | Carol Lee  | executive | demo     |

  @happy-path
  Scenario: 使用正確帳密成功登入
    Given 我在登入頁面
    When  我在「帳號」欄位輸入 "dave@example.com"
    And   我在「密碼」欄位輸入 "demo"
    And   我點擊「登入」按鈕
    Then  頁面應導向 "/dashboard"
    And   導覽列應顯示使用者名稱 "Dave Liu"
    And   導覽列應顯示角色標籤 "專案經理"

  @error-handling
  Scenario: 使用錯誤密碼登入失敗
    Given 我在登入頁面
    When  我在「帳號」欄位輸入 "dave@example.com"
    And   我在「密碼」欄位輸入 "wrongpassword"
    And   我點擊「登入」按鈕
    Then  頁面應顯示錯誤訊息「帳號或密碼錯誤」
    And   我仍在登入頁面

  @error-handling
  Scenario: 帳號不存在時登入失敗
    Given 我在登入頁面
    When  我在「帳號」欄位輸入 "nobody@example.com"
    And   我在「密碼」欄位輸入 "demo"
    And   我點擊「登入」按鈕
    Then  頁面應顯示錯誤訊息「帳號或密碼錯誤」

  @happy-path
  Scenario Outline: 快速登入按鈕一鍵登入
    Given 我在登入頁面
    When  我點擊快速登入卡片「<role_label>」
    Then  頁面應導向 "/dashboard"
    And   導覽列應顯示使用者名稱 "<name>"

    Examples:
      | role_label | name       |
      | 系統管理員 | Alice Chen |
      | 專案經理   | Dave Liu   |
      | 團隊成員   | Bob Wang   |
      | 高階主管   | Carol Lee  |

  @integration
  Scenario: AD 認證失敗時自動 fallback 到 Mock 認證
    Given AD 服務目前不可用
    And   我在登入頁面
    When  我以 "dave@example.com" / "demo" 登入
    Then  登入應成功
    And   頁面應導向 "/dashboard"

  @integration
  Scenario: 登入後角色從 DB 同步
    Given alice@example.com 在資料庫中角色為 "admin"
    And   本機 localStorage 中角色為 "member"
    When  Alice 登入系統
    Then  系統角色應更新為 "admin"
    And   導覽列應顯示角色標籤 "系統管理員"
```

```gherkin
# features/auth/logout.feature

@module-auth @priority-critical
Feature: 使用者登出
  身為已登入的使用者
  我希望能安全登出系統
  以保護我的帳號安全

  Scenario: 成功登出系統
    Given 我已以 "dave@example.com" 登入
    When  我點擊右上角使用者頭像
    And   我點擊下拉選單中的「登出」
    Then  localStorage 中的使用者資訊應被清除
    And   頁面應導向 "/login"

  Scenario: 登出後無法存取受保護頁面
    Given 我已登出系統
    When  我直接存取 "/dashboard"
    Then  頁面應導向 "/login"
```

```gherkin
# features/auth/authorization.feature

@module-auth @priority-critical
Feature: 角色權限控制
  身為系統
  我需要根據使用者角色限制功能存取
  以確保系統安全與資料保護

  @ui
  Scenario Outline: 導覽列依角色顯示對應選項
    Given 我已以 "<role>" 角色登入
    Then  側邊欄應顯示以下項目:
      | 儀表板   |
      | 我的任務 |
      | 專案看板 |
      | 報告     |
      | 審核中心 |
    And   側邊欄 "<visibility>" 顯示「管理後台」

    Examples:
      | role      | visibility |
      | admin     | 應該       |
      | pm        | 不應該     |
      | executive | 不應該     |
      | member    | 不應該     |

  @api
  Scenario: 非 Admin 使用者呼叫 Admin API 被拒絕
    Given 我已以 "member" 角色登入
    When  我發送 GET 請求到 "/api/admin/users"
    Then  回應狀態碼應為 403
    And   回應應包含錯誤訊息 "Forbidden"

  @api
  Scenario Outline: 專案操作權限依角色限制
    Given 我已以 "<role>" 角色登入
    When  我嘗試 "<action>" 專案
    Then  操作 "<result>"

    Examples:
      | role      | action | result   |
      | admin     | 建立   | 應該成功 |
      | pm        | 建立   | 應該成功 |
      | executive | 建立   | 應該被拒 |
      | member    | 建立   | 應該被拒 |
      | admin     | 刪除   | 應該成功 |
      | pm        | 刪除   | 應該成功 |
      | executive | 刪除   | 應該被拒 |
      | member    | 刪除   | 應該被拒 |
```

---

### 3.2 專案管理

```gherkin
# features/project/create-project.feature

@module-project @priority-critical
Feature: 建立新專案
  身為專案經理
  我希望能建立新專案並定義里程碑、團隊和風險
  以便開始追蹤專案進度

  Background:
    Given 我已以 "pm" 角色登入
    And   系統中已存在以下專案類型:
      | key               | label    | codePrefix |
      | npi               | NPI      | NPI        |
      | cost_optimization | 成本優化 | CO         |

  @happy-path @smoke
  Scenario: 使用精靈表單成功建立 NPI 專案
    Given 我在「建立新專案」頁面
    When  我在「基本資訊」步驟填入:
      | 欄位       | 值                     |
      | 專案名稱   | 新產品導入自動化測試線 |
      | 專案類型   | NPI                    |
      | 專案層級   | T1                     |
      | 需求來源   | 內部需求               |
      | 起始日期   | 2026-07-01             |
      | 結束日期   | 2026-12-31             |
      | 預算       | 5000000                |
    And   我點擊「下一步」
    And   我在「SMART 目標」步驟填入各項目標
    And   我點擊「下一步」
    And   我在「專案定義」步驟填入目標、目的、範圍
    And   我點擊「下一步」
    And   我在「團隊與風險」步驟加入團隊成員:
      | name     | role | jobTitle |
      | Bob Wang | R    | Engineer |
    And   我點擊「下一步」
    And   系統自動載入 NPI 里程碑模板
    And   我確認里程碑配置
    And   我點擊「建立專案」
    Then  專案應建立成功
    And   系統應自動產生專案代碼格式為 "NPI-2026-XXX"
    And   頁面應導向新專案的詳情頁

  Scenario: 專案代碼自動遞增
    Given 系統中已有 NPI-2026 系列專案 3 個
    When  我建立一個新的 NPI 類型專案
    Then  專案代碼應為 "NPI-2026-004"

  Scenario: 選擇專案類型後自動載入里程碑模板
    Given 我在「建立新專案」頁面
    When  我選擇專案類型為「NPI」
    And   我進入「時程里程碑」步驟
    Then  系統應從 API 載入 NPI 里程碑模板
    And   模板應包含預設的階段與任務

  Scenario: DB 自訂模板優先於內建模板
    Given NPI 專案類型在資料庫中有自訂里程碑模板
    When  我建立 NPI 專案並進入里程碑步驟
    Then  系統應載入資料庫版本的模板
    And   不應載入內建版本
```

```gherkin
# features/project/browse-projects.feature

@module-project @priority-high
Feature: 瀏覽與搜尋專案
  身為使用者
  我希望能瀏覽所有專案並依條件篩選
  以快速找到需要關注的專案

  Background:
    Given 我已登入系統
    And   系統中存在以下專案:
      | code          | name              | type | tier | status | owner    |
      | NPI-2026-001  | 新產品導入 A      | npi  | T1   | green  | Dave Liu |
      | NPI-2026-002  | 新產品導入 B      | npi  | T2   | yellow | Dave Liu |
      | CO-2026-001   | 成本優化專案      | co   | T1   | red    | Alice    |
      | AUTO-2026-001 | 自動化升級        | auto | T3   | green  | Dave Liu |

  Scenario: 進入專案看板顯示所有專案
    When  我進入「專案看板」頁面
    Then  應顯示 4 個專案卡片
    And   每張卡片應包含專案代碼、名稱、狀態燈號、進度條

  Scenario: 依關鍵字搜尋專案
    Given 我在「專案看板」頁面
    When  我在搜尋欄輸入「新產品」
    Then  應顯示 2 個匹配的專案
    And   結果應包含 "NPI-2026-001" 和 "NPI-2026-002"

  Scenario: 依狀態篩選專案
    Given 我在「專案看板」頁面
    When  我選擇狀態篩選為「風險」
    Then  應僅顯示狀態為「紅燈」的專案
    And   結果應只有 "CO-2026-001"

  Scenario: 依層級篩選專案
    Given 我在「專案看板」頁面
    When  我選擇層級篩選為「T1」
    Then  應僅顯示 T1 層級的專案
    And   結果應有 2 個專案

  Scenario: 組合多條件篩選
    Given 我在「專案看板」頁面
    When  我選擇類型「NPI」且層級「T1」
    Then  應僅顯示 1 個專案 "NPI-2026-001"

  Scenario: 無搜尋結果顯示空狀態
    Given 我在「專案看板」頁面
    When  我搜尋「不存在的專案名稱」
    Then  應顯示「找不到符合條件的專案」

  Scenario: 專案列表分頁（每頁 12 筆）
    Given 系統中存在 20 個專案
    When  我進入「專案看板」頁面
    Then  應顯示前 12 個專案
    And   分頁資訊應顯示「共 20 個專案，第 1/2 頁」
    When  我點擊下一頁
    Then  應顯示剩餘 8 個專案
```

```gherkin
# features/project/project-detail.feature

@module-project @priority-high
Feature: 檢視專案詳情
  身為使用者
  我希望能查看專案的完整資訊
  以了解專案的各面向狀況

  Background:
    Given 我已登入系統
    And   專案 "NPI-2026-001" 存在且包含完整資料

  Scenario: 專案詳情頁顯示九個分頁
    When  我進入專案 "NPI-2026-001" 的詳情頁
    Then  頁面應包含以下分頁:
      | 時間軸 | 任務 | 里程碑 | 團隊 | 預算 | 風險 | 延遲 | 更新 | CAPEX |

  Scenario: 頂部統計顯示關鍵指標
    When  我進入專案詳情頁
    Then  頂部應顯示整體進度百分比
    And   應顯示狀態燈號
    And   應顯示預算使用率

  Scenario: 刪除專案需確認
    Given 我以 "pm" 角色登入
    When  我在專案詳情頁點擊「刪除」
    Then  應彈出確認對話框
    When  我確認刪除
    Then  專案及所有關聯資料應從系統移除
    And   頁面應導向專案列表
```

---

### 3.3 里程碑與任務管理

```gherkin
# features/task/my-tasks.feature

@module-task @priority-critical
Feature: 我的任務管理
  身為團隊成員
  我希望在「我的任務」頁面查看被指派的任務
  以便了解工作內容並更新進度

  Background:
    Given 我以 "bob@example.com" 登入
    And   Bob 在專案 "NPI-2026-001" 中擔任 "R"（負責執行）角色
    And   Bob 被指派了以下任務:
      | title          | status      | priority | endDate    |
      | 設計電路圖     | in_progress | high     | 2026-06-15 |
      | 撰寫測試計畫   | todo        | medium   | 2026-06-30 |
      | 採購零件       | done        | low      | 2026-05-31 |
      | 組裝原型       | blocked     | high     | 2026-07-15 |

  @happy-path
  Scenario: 顯示角色分頁與所有任務
    When  我進入「我的任務」頁面
    Then  應顯示「執行」分頁（因為 Bob 是 R 角色）
    And   應顯示 4 個任務

  Scenario: 依狀態篩選任務
    Given 我在「我的任務」頁面
    When  我篩選狀態為「進行中」
    Then  應僅顯示「設計電路圖」

  Scenario: 依優先級篩選任務
    Given 我在「我的任務」頁面
    When  我篩選優先級為「高」
    Then  應顯示「設計電路圖」和「組裝原型」

  Scenario: 任務卡片顯示完整資訊
    When  我在「我的任務」頁面查看「設計電路圖」卡片
    Then  卡片應顯示:
      | 項目     | 內容         |
      | 任務名稱 | 設計電路圖   |
      | 狀態     | 準時進行中   |
      | 優先級   | 高           |
      | 截止日   | 2026-06-15   |
      | 所屬專案 | NPI-2026-001 |
```

```gherkin
# features/task/task-status.feature

@module-task @priority-critical
Feature: 任務狀態管理
  身為團隊成員
  我希望能更新任務狀態
  以反映實際工作進度

  Scenario: 將任務標記為完成
    Given 我有一個狀態為「進行中」的任務「設計電路圖」
    When  我點擊「標記完成」
    Then  任務狀態應變為「已完成」
    And   完成時間應記錄為當前時間
    And   完成者應記錄為我的帳號

  Scenario: 完成任務後里程碑進度自動更新
    Given 里程碑「Phase 1」下有 4 個任務
    And   已完成 3 個任務
    When  我完成第 4 個任務
    Then  里程碑「Phase 1」的進度應更新為 100%
    And   里程碑狀態應變為 "done"

  Scenario: 恢復已完成的任務
    Given 我有一個狀態為「已完成」的任務
    When  我點擊「恢復」
    Then  任務狀態應回復為「進行中」
    And   完成時間應被清除

  Scenario: 里程碑進度由任務加權平均計算
    Given 里程碑「Phase 2」下有以下任務:
      | title   | durationDays | progress |
      | 任務 A  | 10           | 80       |
      | 任務 B  | 20           | 40       |
    When  系統計算里程碑進度
    Then  里程碑進度應為 53%
    # 計算: (10×80 + 20×40) / (10+20) = 1600/30 ≈ 53
```

```gherkin
# features/task/auto-progress.feature

@module-task @priority-high
Feature: 任務自動狀態推進
  身為系統
  我需要根據日期和依賴關係自動推進任務狀態
  以減少手動更新負擔並確保資料準確

  Scenario: 開始日期已過自動啟動任務
    Given 任務「設計審查」狀態為 "todo"
    And   任務開始日期為昨天
    When  系統執行自動狀態同步
    Then  任務狀態應變為 "in_progress"

  Scenario: 前置任務未完成自動阻塞
    Given 任務 B 依賴任務 A
    And   任務 A 狀態為 "in_progress"（未完成）
    When  系統執行自動狀態同步
    Then  任務 B 狀態應為 "blocked"

  Scenario: 前置任務完成後解除阻塞
    Given 任務 B 依賴任務 A
    And   任務 A 已標記為 "done"
    When  系統執行自動狀態同步
    Then  任務 B 狀態不應為 "blocked"

  Scenario: 有工作日誌的待辦任務自動變為進行中
    Given 任務「元件測試」狀態為 "todo"
    And   該任務已有 2 筆工作日誌
    When  系統執行自動狀態同步
    Then  任務狀態應變為 "in_progress"
```

```gherkin
# features/task/task-log.feature

@module-task @priority-high
Feature: 任務工作日誌
  身為團隊成員
  我希望能記錄每日工作內容
  以建立審計軌跡並自動反映進度

  Scenario: 新增工作日誌
    Given 我在任務「設計電路圖」的詳情頁
    When  我新增工作日誌:
      | 欄位     | 值                          |
      | 日期     | 2026-06-01                  |
      | 內容     | 完成主板電路初版設計         |
      | 下次計畫 | 進行 DFM 審查               |
    And   我點擊「提交」
    Then  日誌列表應新增一筆紀錄
    And   日誌應顯示日期、內容和下次計畫

  Scenario: 上傳附件到工作日誌
    Given 我在新增工作日誌表單
    When  我上傳一張圖片「circuit-v1.png」
    And   我提交日誌
    Then  日誌應顯示附件連結「circuit-v1.png」
```

```gherkin
# features/task/subtasks.feature

@module-task @priority-medium
Feature: 子任務管理
  身為團隊成員
  我希望能將大任務分解為子任務
  以更細緻地追蹤進度

  Scenario: 建立子任務
    Given 我在父任務「系統整合測試」的詳情頁
    When  我點擊「新增子任務」
    And   我填入標題「單元測試 - 模組 A」
    And   我儲存子任務
    Then  子任務列表應顯示新建的子任務

  Scenario: 子任務完成影響父任務進度
    Given 父任務「系統整合測試」有 4 個子任務
    And   已完成 2 個子任務
    When  我查看父任務
    Then  父任務進度應約為 50%
```

```gherkin
# features/task/dependencies.feature

@module-task @priority-medium
Feature: 任務依賴關係
  身為專案經理
  我希望能定義任務間的依賴關係
  以確保工作按正確順序進行

  Scenario: 設定任務依賴
    Given 專案有任務 A「設計」和任務 B「開發」
    When  我設定任務 B 依賴任務 A
    Then  TaskDependency 記錄應被建立
    And   甘特圖中應顯示 A → B 的箭頭連線

  Scenario: 依賴未完成時顯示阻塞警告
    Given 任務 B 依賴未完成的任務 A
    When  我查看任務 B
    Then  應顯示「等待前置任務完成」的阻塞警示
```

---

### 3.4 延遲申請審批

```gherkin
# features/delay/submit-delay.feature

@module-delay @priority-critical
Feature: 提交延遲申請
  身為專案經理
  當專案發生延遲時
  我希望能提交延遲申請並提出新時程

  Background:
    Given 我以 "pm" 角色登入
    And   專案 "NPI-2026-001" 存在
    And   專案有以下 S 角色（簽核）成員:
      | name       | email              |
      | Alice Chen | alice@example.com  |
      | Carol Lee  | carol@example.com  |
    And   專案有里程碑「Phase 2」到期日為 "2026-06-30"

  @happy-path
  Scenario: 成功提交延遲申請
    Given 我在專案延遲分頁
    When  我填寫延遲申請:
      | 欄位         | 值                           |
      | 延遲類型     | 延期申請                     |
      | 延遲原因     | 供應商零件延遲交付            |
      | 能否追回     | 否                           |
      | 受影響里程碑 | Phase 2                      |
      | 原定日期     | 2026-06-30                   |
      | 建議新日期   | 2026-07-15                   |
    And   我提交申請
    Then  延遲申請應建立成功且狀態為 "pending"
    And   所需審核人數應為 2（Alice 和 Carol）
    And   Alice 和 Carol 應收到「延遲申請已提交」通知

  Scenario: 標記需要支援的延遲申請
    Given 我在延遲申請表單
    When  我勾選「需要支援」
    And   我填寫支援說明「需要緊急採購替代零件」
    And   我提交申請
    Then  延遲申請應標記 supportNeeded
    And   高階主管應收到「支援需求」通知
```

```gherkin
# features/delay/review-delay.feature

@module-delay @priority-critical
Feature: 審核延遲申請
  身為簽核（S 角色）審核者
  我希望能審查延遲申請並做出核准或駁回決定
  以控制專案時程變更

  Background:
    Given 專案 "NPI-2026-001" 有一筆待審核的延遲申請
    And   需要 2 位審核者全數通過
    And   受影響里程碑「Phase 2」建議日期從 2026-06-30 改為 2026-07-15

  @happy-path
  Scenario: 所有審核者核准 → 申請通過
    Given 我以 "alice@example.com"（S 角色）登入
    When  我進入「審核中心」→「待審核」分頁
    And   我點擊延遲申請查看詳情
    And   我填寫審核備註「同意延期」
    And   我點擊「核准」
    Then  我的審核決定應被記錄為 "approve"
    And   申請狀態仍為 "pending"（需等待第二位審核）

    When  Carol 以 S 角色登入並核准同一申請
    Then  申請狀態應變為 "approved"
    And   里程碑「Phase 2」到期日應更新為 "2026-07-15"
    And   申請者應收到「延遲申請已核准」通知

  @business-rule
  Scenario: 任一審核者駁回 → 申請立即駁回
    Given Alice 已核准此延遲申請
    When  Carol 以 S 角色登入
    And   Carol 填寫駁回理由「不合理的延期，請尋找替代方案」
    And   Carol 點擊「駁回」
    Then  申請狀態應立即變為 "rejected"
    And   里程碑日期不應變更
    And   申請者應收到「延遲申請已駁回」通知

  @business-rule
  Scenario: 同一審核者不能重複審核
    Given Alice 已對此申請做出核准決定
    When  Alice 再次嘗試審核同一申請
    Then  系統應拒絕重複審核
```

```gherkin
# features/delay/support-resolution.feature

@module-delay @priority-high
Feature: 支援需求處理
  身為高階主管
  我希望能處理延遲申請中的支援需求
  以協助專案團隊解除阻礙

  Scenario: 高階主管標記支援已解決
    Given 我以 "executive" 角色登入
    And   有一筆延遲申請標記了「需要支援」
    When  我進入「審核中心」→「待協助」分頁
    And   我查看支援需求詳情
    And   我填寫協助備註「已聯繫供應商安排加急」
    And   我點擊「標記已協助」
    Then  支援狀態應標記為已解決
    And   解決時間和解決人應被記錄
```

---

### 3.5 週報與進度追蹤

```gherkin
# features/weekly/pm-weekly-update.feature

@module-weekly @priority-high
Feature: PM 週報提交
  身為專案經理
  我希望能提交每週專案進度報告
  以向管理層彙報專案狀況

  Scenario: 成功提交 PM 週報
    Given 我以 "pm" 角色登入
    And   我在專案 "NPI-2026-001" 的更新分頁
    When  我新增週報:
      | 欄位         | 值                           |
      | 週次         | 2026-06-01（星期一）          |
      | 整體狀態     | 準時                         |
      | 阻礙事項     | 無                           |
      | 關鍵成就     | 完成 Phase 1 所有任務         |
      | 下週計畫     | 啟動 Phase 2 開發工作         |
    And   我為每個里程碑更新進度
    And   我提交週報
    Then  週報應建立成功
    And   每個里程碑的進度應記錄在 MilestoneUpdate 中
```

```gherkin
# features/weekly/member-weekly-report.feature

@module-weekly @priority-high
Feature: 成員週報提交
  身為團隊成員
  我希望能針對負責的里程碑提交個人週報
  以記錄工作進度並回報阻礙

  Scenario: 成員提交里程碑週報
    Given 我以 "bob@example.com" 登入
    And   Bob 在專案 "NPI-2026-001" 中負責里程碑「Phase 2」
    When  Bob 提交本週報告:
      | 欄位     | 值                       |
      | 工作內容 | 完成模組 A 和 B 的開發     |
      | 進度     | 60                       |
      | 阻礙     | 等待測試環境設定          |
      | 下週計畫 | 開始整合測試              |
    Then  MemberWeeklyReport 應建立成功
    And   記錄應關聯到正確的 projectId、milestoneId、userId 和 weekOf
```

```gherkin
# features/weekly/cron-reminder.feature

@module-weekly @priority-high
Feature: 週報缺繳自動提醒
  身為系統
  我需要在設定的時間自動檢查缺繳的週報
  以提醒 PM 按時提交報告

  Scenario: Cron 在設定時間發送提醒
    Given 通知排程設定為「每週一 9:00」
    And   以下專案本週尚未提交週報:
      | project          | pm         |
      | NPI-2026-001     | Dave Liu   |
      | CO-2026-001      | Alice Chen |
    When  Cron 於週一 9:00 執行
    Then  Dave 應收到站內通知（type = weekly_upload_missing）
    And   Alice 應收到站內通知
    And   Dave 和 Alice 應收到 Email 提醒
    And   CronJobLog 應記錄執行結果

  Scenario: 提醒模板支援變數替換
    Given 通知模板為「{{projectName}} 的 PM {{pmName}} 尚未提交 {{weekOf}} 週報」
    When  系統發送提醒給專案 "NPI-2026-001" 的 PM "Dave Liu"
    Then  通知內容應為「NPI-2026-001 的 PM Dave Liu 尚未提交 2026-06-01 週報」

  Scenario: 停用 Cron 排程後不發送提醒
    Given Cron 排程已被管理員停用
    When  到達排程時間
    Then  不應發送任何通知或 Email
```

---

### 3.6 通知系統

```gherkin
# features/notification/notification-lifecycle.feature

@module-notification @priority-high
Feature: 通知生命週期
  身為使用者
  我希望能即時收到系統通知
  以了解需要我關注的事項

  Background:
    Given 我以 "bob@example.com" 登入
    And   Bob 有以下未讀通知:
      | type            | title                    |
      | task_assigned   | 您被指派了新任務          |
      | delay_submitted | 專案有新的延遲申請        |
      | task_overdue    | 專案有逾期的里程碑        |

  Scenario: 通知鈴鐺顯示未讀數量
    When  Dashboard 頁面載入完成
    Then  通知鈴鐺應顯示數字 "3"

  Scenario: 每 20 秒自動輪詢新通知
    Given 其他使用者為 Bob 建立了一則新通知
    When  20 秒過後系統自動輪詢
    Then  通知鈴鐺數字應更新為 "4"

  Scenario: 標記單則通知為已讀
    Given 我在通知頁面
    When  我點擊第一則通知標記為已讀
    Then  該通知應標為已讀
    And   未讀數應減為 "2"

  Scenario: 全部標記為已讀
    Given 我在通知頁面
    When  我點擊「全部已讀」
    Then  所有通知應標為已讀
    And   未讀數應為 "0"

  Scenario: 清除所有通知
    Given 我在通知頁面
    When  我點擊「全部清除」
    Then  通知列表應為空
```

```gherkin
# features/notification/notification-triggers.feature

@module-notification @priority-high
Feature: 通知觸發機制
  身為系統
  我需要在特定事件發生時自動建立通知
  以確保相關人員即時收到訊息

  Scenario Outline: 各事件觸發對應類型通知
    When  系統發生「<event>」事件
    Then  應為「<recipient>」建立類型為「<type>」的通知

    Examples:
      | event                | recipient         | type                   |
      | 指派任務給 Bob       | Bob               | task_assigned          |
      | 提交延遲申請         | 所有 S 角色成員    | delay_submitted        |
      | 核准延遲申請         | 申請者             | delay_approved         |
      | 駁回延遲申請         | 申請者             | delay_rejected         |
      | 里程碑逾期           | 專案負責人         | task_overdue           |
      | 延遲申請標記需支援   | 高階主管           | support_needed         |
      | Cron 偵測週報缺繳    | PM                | weekly_upload_missing  |
      | Cron 產生週報        | 收件者清單         | weekly_report_ready    |
```

---

### 3.7 預算與 CAPEX 管理

```gherkin
# features/budget/budget-management.feature

@module-budget @priority-medium
Feature: 預算項目管理
  身為專案經理
  我希望能管理專案的預算項目
  以追蹤設備採購費用

  Scenario: 新增預算項目
    Given 我以 "pm" 角色登入
    And   我在專案預算分頁
    When  我新增預算項目:
      | 欄位     | 值            |
      | 站別     | SMT           |
      | 廠商     | ABC Corp      |
      | 設備     | SMT 貼片機    |
      | 數量     | 2             |
      | 單價     | 250000        |
      | 預估費用 | 500000        |
    And   我儲存預算項目
    Then  預算項目列表應新增一筆紀錄

  Scenario: CAPEX 追蹤付款進度
    Given 專案有一筆 CAPEX 項目
    When  我填寫付款資訊:
      | 欄位       | 值           |
      | PO 號碼    | PO-2026-001  |
      | 訂金金額   | 100000       |
      | 訂金到期日 | 2026-07-01   |
      | 交貨金額   | 300000       |
      | 驗收金額   | 100000       |
    Then  付款時程應正確顯示

  Scenario: CAPEX 表格顯示置頂摘要
    Given 專案有多筆 CAPEX 項目
    When  我查看 CAPEX 表格
    Then  置頂摘要列應顯示所有項目的總金額
```

---

### 3.8 風險管理

```gherkin
# features/risk/risk-management.feature

@module-risk @priority-medium
Feature: 風險管理
  身為專案經理
  我希望能登記和追蹤專案風險
  以提前做好緩解措施

  Scenario: 新增風險到風險登記
    Given 我以 "pm" 角色登入
    And   我在專案風險分頁
    When  我新增風險:
      | 欄位     | 值                     |
      | 標題     | 供應商交期不穩定        |
      | 影響     | 影響高                 |
      | 機率     | 機率中                 |
      | 描述     | 主要零件供應商近期產能緊張 |
      | 緩解對策 | 尋找備援供應商          |
    Then  風險登記應新增一筆狀態為 "open" 的風險

  Scenario: 更新風險狀態
    Given 風險「供應商交期不穩定」狀態為 "open"
    When  我將狀態更新為 "mitigated"
    Then  風險狀態應顯示為 "mitigated"

  Scenario: 儀表板顯示開放風險
    Given 系統有 5 個 "open" 狀態的風險
    When  我進入儀表板
    Then  「風險摘要」面板應顯示「共 5 項」
```

---

### 3.9 儀表板

```gherkin
# features/dashboard/dashboard.feature

@module-dashboard @priority-high
Feature: 執行儀表板
  身為使用者
  我希望在儀表板看到專案全局概覽
  以快速掌握組織的專案健康度

  Background:
    Given 系統中存在以下專案:
      | name   | tier | status | budget  | budgetUsed |
      | 專案 A | T1   | green  | 1000000 | 350000     |
      | 專案 B | T1   | yellow | 500000  | 400000     |
      | 專案 C | T2   | red    | 800000  | 700000     |
      | 專案 D | T3   | green  | 200000  | 50000      |

  @smoke
  Scenario: 儀表板顯示專案狀態統計
    Given 我已登入
    When  我進入儀表板
    Then  「總專案數」卡片應顯示 4
    And   應顯示 2 個正常、1 個注意、1 個風險

  Scenario: 儀表板依層級篩選
    Given 我在儀表板頁面
    When  我點擊層級篩選「T1」
    Then  所有統計應僅反映 T1 層級專案
    And   「總專案數」應顯示 2

  Scenario: 顯示即將到期里程碑
    Given 有里程碑在未來 7 天內到期
    When  我進入儀表板
    Then  「即將到期的里程碑」面板應列出對應里程碑

  Scenario: 顯示缺漏週報的專案
    Given 專案 A 本週尚未提交週報
    When  我進入儀表板
    Then  「本週末更新」面板應列出專案 A
```

---

### 3.10 報表匯出

```gherkin
# features/report/export-reports.feature

@module-report @priority-medium
Feature: 報表匯出
  身為使用者
  我希望能匯出專案報表
  以分享給未使用系統的利害關係人

  Scenario: 匯出 PDF 報表
    Given 我在報表頁面
    And   我選擇報表類型「執行摘要」
    When  我點擊「匯出 PDF」
    Then  系統應產生 PDF 檔案並下載

  Scenario: 匯出 Excel 報表
    Given 我在報表頁面
    When  我點擊「匯出 Excel」
    Then  系統應產生多分頁 Excel 工作簿
    And   工作簿應包含專案、任務、預算、風險分頁

  Scenario: Email 發送報表
    Given 我在報表頁面
    When  我選擇「Email 發送」
    And   我輸入收件者 Email
    And   我點擊發送
    Then  報表應透過 Email 寄出
```

---

### 3.11 管理員後台

```gherkin
# features/admin/user-management.feature

@module-admin @priority-high
Feature: 使用者管理
  身為系統管理員
  我希望能管理所有使用者和角色
  以控制系統存取權限

  Background:
    Given 我以 "admin" 角色登入
    And   我在管理後台的使用者管理頁面

  Scenario: 檢視使用者列表
    When  頁面載入完成
    Then  應顯示所有系統使用者
    And   每位使用者應顯示名稱、Email、角色標籤、狀態

  Scenario: 變更使用者角色
    Given Bob 的角色為「團隊成員」
    When  我將 Bob 的角色變更為「專案經理」
    Then  資料庫中 Bob 的角色應更新為 "pm"
    And   Bob 下次登入時角色應為「專案經理」

  Scenario: 預先註冊 AD 使用者
    When  我搜尋 AD 使用者「新同事」
    And   我選擇該使用者並指定角色為「專案經理」
    And   我儲存
    Then  使用者記錄應建立
    And   該使用者首次登入時應自動獲得「專案經理」角色

  Scenario: 停用使用者帳號
    Given Bob 的帳號為啟用狀態
    When  我停用 Bob 的帳號
    Then  Bob 的狀態應顯示「已停用」
    And   Bob 應無法登入系統
```

```gherkin
# features/admin/project-type-config.feature

@module-admin @priority-medium
Feature: 專案類型設定
  身為系統管理員
  我希望能管理專案類型
  以支援不同業務需求的專案分類

  Scenario: 新增自訂專案類型
    Given 我在管理後台的專案設定頁面
    When  我新增專案類型:
      | 欄位       | 值                |
      | 類型代碼   | process_improvement |
      | 顯示名稱   | 流程改善          |
      | 代碼前綴   | PI               |
    And   我儲存
    Then  類型列表應新增「流程改善」
    And   建立專案時應可選擇此類型

  Scenario: 停用專案類型
    Given 專案類型「自動化」為啟用狀態
    When  我將「自動化」切換為停用
    Then  新建專案時不應顯示「自動化」選項
    And   已使用此類型的現有專案不受影響
```

```gherkin
# features/admin/notification-config.feature

@module-admin @priority-medium
Feature: 通知排程設定
  身為系統管理員
  我希望能設定各層級的通知排程
  以控制週報提醒的頻率和時間

  Scenario: 設定 T1 層級通知排程
    Given 我在管理後台的通知設定頁面
    When  我設定 T1 層級:
      | 欄位 | 值   |
      | 頻率 | 每週 |
      | 星期 | 週一 |
      | 時間 | 09:00 |
    And   我儲存設定
    Then  NotificationProfile 應更新為對應值

  Scenario: 自訂通知模板
    Given 我在通知模板編輯區
    When  我修改缺繳通知標題為「{{projectName}} 週報提醒」
    And   我修改 Email 主旨為「{{pmName}} - {{projectName}} 週報待繳」
    And   我儲存
    Then  模板應更新
    And   下次 Cron 發送時應使用新模板

  Scenario: 啟用/停用 Cron 排程
    Given 週報通知 Cron 目前為啟用
    When  我切換為停用
    Then  SystemSetting 中 cron.notification.enabled 應為 false
    And   Cron 不再發送通知
```

```gherkin
# features/admin/cron-monitoring.feature

@module-admin @priority-medium
Feature: 排程監控
  身為系統管理員
  我希望能監控 Cron 排程的執行狀況
  以確保自動化任務正常運作

  Scenario: 檢視 Cron 執行紀錄
    Given 我在管理後台的排程管理頁面
    When  頁面載入完成
    Then  應顯示最近的 Cron 執行紀錄表格
    And   每筆紀錄應包含:
      | 欄位     | 說明                |
      | 任務類型 | weekly-notification |
      | 執行時間 | 日期時間            |
      | 狀態     | success / failed    |
      | 摘要     | 執行摘要            |
      | 影響數   | 受影響項目數量      |

  Scenario: 手動觸發 Cron 任務
    Given 我在排程管理頁面
    When  我點擊「手動執行」週報通知 Cron
    Then  Cron 應立即執行
    And   執行結果應顯示在紀錄中
```

---

### 3.12 共享連結

```gherkin
# features/share/share-link.feature

@module-share @priority-low
Feature: 專案共享連結
  身為專案經理
  我希望能產生共享連結
  以讓外部利害關係人檢視專案狀態

  Scenario: 產生共享連結
    Given 我以 "pm" 角色登入
    And   我在專案詳情頁
    When  我點擊「共享」按鈕
    And   我設定到期日為 "2026-07-01"
    And   我產生連結
    Then  系統應產生唯一的共享 token
    And   共享連結格式應為 "/share/{token}"

  Scenario: 透過共享連結檢視專案（無需登入）
    Given 有一個有效的共享連結
    When  未登入使用者存取該連結
    Then  應顯示專案的唯讀檢視
    And   不應顯示任何編輯按鈕

  Scenario: 過期共享連結無法存取
    Given 有一個已過期的共享連結
    When  使用者存取該連結
    Then  應顯示「連結已失效」訊息
    And   不應顯示任何專案資訊
```

---

## 4. Scenario Outline 與資料表

### 4.1 角色權限 Scenario Outline

```gherkin
Scenario Outline: 各角色的專案操作權限
  Given 我以 "<role>" 角色登入
  When  我嘗試 "<operation>" 操作
  Then  操作結果應為 "<expected>"

  Examples: 專案建立
    | role      | operation  | expected |
    | admin     | 建立專案   | 成功     |
    | pm        | 建立專案   | 成功     |
    | executive | 建立專案   | 被拒絕   |
    | member    | 建立專案   | 被拒絕   |

  Examples: 專案編輯
    | role      | operation  | expected |
    | admin     | 編輯專案   | 成功     |
    | pm        | 編輯專案   | 成功     |
    | executive | 編輯專案   | 被拒絕   |
    | member    | 編輯專案   | 被拒絕   |

  Examples: 管理後台
    | role      | operation      | expected |
    | admin     | 存取管理後台   | 成功     |
    | pm        | 存取管理後台   | 被拒絕   |
    | executive | 存取管理後台   | 被拒絕   |
    | member    | 存取管理後台   | 被拒絕   |
```

### 4.2 專案狀態計算 Scenario Outline

```gherkin
Scenario Outline: 專案狀態燈號計算
  Given 專案有以下任務比例:
    | overdue_percent | blocked_percent | past_end_date |
    | <overdue>       | <blocked>       | <past_end>    |
  Then  專案狀態應為 "<status>"

  Examples:
    | overdue | blocked | past_end | status |
    | 0       | 0       | false    | green  |
    | 20      | 10      | false    | yellow |
    | 35      | 5       | false    | red    |
    | 10      | 25      | false    | red    |
    | 10      | 5       | true     | red    |
```

### 4.3 通知類型 Scenario Outline

```gherkin
Scenario Outline: 系統事件觸發通知
  When  發生 "<event>" 事件
  Then  應建立 "<notification_type>" 類型的通知
  And   通知收件者應為 "<recipient_role>"

  Examples:
    | event              | notification_type      | recipient_role     |
    | 指派任務           | task_assigned          | 被指派成員         |
    | 提交延遲申請       | delay_submitted        | S 角色審核者       |
    | 核准延遲申請       | delay_approved         | 申請者             |
    | 駁回延遲申請       | delay_rejected         | 申請者             |
    | 里程碑逾期         | task_overdue           | 專案負責人         |
    | 延遲需要支援       | support_needed         | 高階主管           |
    | Cron 偵測缺繳週報  | weekly_upload_missing  | 專案 PM            |
    | Cron 產生週報      | weekly_report_ready    | 設定的收件者       |
```

---

## 5. Step Definitions 對照表

### 5.1 通用 Steps

| Gherkin Step | Step Definition | 實作說明 |
|-------------|-----------------|---------|
| `Given 系統已啟動且資料庫連線正常` | `setupDatabase()` | 初始化測試 DB |
| `Given 我在登入頁面` | `page.goto('/login')` | 導覽到登入頁 |
| `Given 我已以 "{email}" 登入` | `loginAs(email)` | 執行登入流程 |
| `Given 我已以 "{role}" 角色登入` | `loginAsRole(role)` | 以指定角色登入 |
| `When 我點擊「{text}」按鈕` | `page.click('button:has-text("{text}")')` | 點擊指定按鈕 |
| `Then 頁面應導向 "{path}"` | `expect(page.url()).toContain(path)` | 驗證 URL |
| `Then 應顯示錯誤訊息「{message}」` | `expect(page.getByText(message)).toBeVisible()` | 驗證錯誤訊息 |

### 5.2 專案相關 Steps

| Gherkin Step | Step Definition | 實作說明 |
|-------------|-----------------|---------|
| `Given 專案 "{code}" 存在` | `createProject({code})` | 建立測試專案 |
| `When 我進入「專案看板」頁面` | `page.goto('/projects')` | 導覽到專案列表 |
| `When 我搜尋「{keyword}」` | `page.fill('[placeholder*=搜尋]', keyword)` | 輸入搜尋關鍵字 |
| `Then 應顯示 {n} 個專案卡片` | `expect(cards).toHaveCount(n)` | 驗證卡片數量 |

### 5.3 任務相關 Steps

| Gherkin Step | Step Definition | 實作說明 |
|-------------|-----------------|---------|
| `When 我點擊「標記完成」` | `page.click('button:has-text("標記完成")')` | 完成任務 |
| `Then 任務狀態應變為 "{status}"` | `expect(task.status).toBe(status)` | 驗證狀態 |
| `Then 里程碑進度應為 {n}%` | `expect(milestone.progress).toBe(n)` | 驗證進度 |

### 5.4 延遲申請 Steps

| Gherkin Step | Step Definition | 實作說明 |
|-------------|-----------------|---------|
| `When 我提交延遲申請` | `submitDelayRequest(data)` | 呼叫 API |
| `When 我點擊「核准」` | `page.click('button:has-text("核准")')` | 核准操作 |
| `When 我點擊「駁回」` | `page.click('button:has-text("駁回")')` | 駁回操作 |
| `Then 申請狀態應變為 "{status}"` | `expect(request.status).toBe(status)` | 驗證狀態 |

### 5.5 通知 Steps

| Gherkin Step | Step Definition | 實作說明 |
|-------------|-----------------|---------|
| `Then 通知鈴鐺應顯示數字 "{n}"` | `expect(badge.text()).toBe(n)` | 驗證通知數 |
| `Then {user} 應收到 "{type}" 通知` | `queryNotification(userId, type)` | 查詢 DB |

### 5.6 管理員 Steps

| Gherkin Step | Step Definition | 實作說明 |
|-------------|-----------------|---------|
| `Given 我在管理後台的使用者管理頁面` | `page.goto('/admin/users')` | 導覽到管理頁 |
| `When 我將 {user} 角色變更為「{role}」` | `updateUserRole(user, role)` | 呼叫 API |
| `Then 資料庫中角色應更新為 "{role}"` | `expect(dbUser.role).toBe(role)` | 查詢 DB |

---

## 6. BDD 測試執行策略

### 6.1 推薦測試框架

| 框架 | 用途 |
|------|------|
| **Playwright + BDD Plugin** | E2E BDD 測試 (playwright-bdd) |
| **Cucumber.js** | Gherkin 解析 + Step Definition |
| **Jest + Gherkin** | API 層級 BDD 測試 |

### 6.2 測試執行矩陣

```
┌─────────────────┬──────────────┬──────────────┬───────────┐
│ 標籤             │ 執行時機      │ 執行環境      │ 預估時間  │
├─────────────────┼──────────────┼──────────────┼───────────┤
│ @smoke          │ 每次 commit  │ CI           │ 2 分鐘    │
│ @api            │ 每次 PR      │ CI           │ 5 分鐘    │
│ @ui             │ 每次 PR      │ CI (headless)│ 10 分鐘   │
│ @regression     │ 每日 / 部署前│ Staging      │ 30 分鐘   │
│ @manual         │ 每版本發布   │ Staging      │ 手動      │
└─────────────────┴──────────────┴──────────────┴───────────┘
```

### 6.3 CI/CD 整合指令

```bash
# 執行所有 BDD 測試
npx cucumber-js features/ --tags "not @manual"

# 僅執行煙霧測試
npx cucumber-js features/ --tags "@smoke"

# 僅執行 API 測試
npx cucumber-js features/ --tags "@api"

# 依模組執行
npx cucumber-js features/ --tags "@module-auth"
npx cucumber-js features/ --tags "@module-project"
npx cucumber-js features/ --tags "@module-delay"

# 產生報告
npx cucumber-js features/ --format json:reports/bdd-report.json
npx cucumber-js features/ --format html:reports/bdd-report.html
```

### 6.4 報告格式範例

```
Feature: 使用者登入 .............. ✅ 6/6 scenarios passed
Feature: 角色權限控制 ............ ✅ 8/8 scenarios passed
Feature: 建立新專案 .............. ✅ 4/4 scenarios passed
Feature: 瀏覽與搜尋專案 ......... ✅ 7/7 scenarios passed
Feature: 我的任務管理 ............ ✅ 4/4 scenarios passed
Feature: 任務狀態管理 ............ ✅ 4/4 scenarios passed
Feature: 任務自動狀態推進 ........ ✅ 4/4 scenarios passed
Feature: 提交延遲申請 ............ ✅ 2/2 scenarios passed
Feature: 審核延遲申請 ............ ✅ 3/3 scenarios passed
Feature: 通知生命週期 ............ ✅ 5/5 scenarios passed
Feature: 通知觸發機制 ............ ✅ 8/8 scenarios passed
Feature: 執行儀表板 .............. ✅ 4/4 scenarios passed
Feature: 使用者管理 .............. ✅ 4/4 scenarios passed
─────────────────────────────────────────────────────────
Total: 22 features | 77 scenarios | 77 passed | 0 failed
```

---

## 7. Feature 覆蓋率矩陣

### 7.1 Feature 檔案總覽

| Feature 檔案 | 模組 | Scenarios | 優先級 | 標籤 |
|-------------|------|-----------|--------|------|
| `auth/login.feature` | 認證 | 6 | Critical | @smoke |
| `auth/logout.feature` | 認證 | 2 | Critical | — |
| `auth/authorization.feature` | 授權 | 8 | Critical | @smoke |
| `project/create-project.feature` | 專案 | 4 | Critical | @smoke |
| `project/browse-projects.feature` | 專案 | 7 | High | — |
| `project/project-detail.feature` | 專案 | 3 | High | — |
| `task/my-tasks.feature` | 任務 | 4 | Critical | — |
| `task/task-status.feature` | 任務 | 4 | Critical | — |
| `task/auto-progress.feature` | 任務 | 4 | High | — |
| `task/task-log.feature` | 任務 | 2 | High | — |
| `task/subtasks.feature` | 任務 | 2 | Medium | — |
| `task/dependencies.feature` | 任務 | 2 | Medium | — |
| `delay/submit-delay.feature` | 延遲 | 2 | Critical | — |
| `delay/review-delay.feature` | 延遲 | 3 | Critical | — |
| `delay/support-resolution.feature` | 延遲 | 1 | High | — |
| `weekly/pm-weekly-update.feature` | 週報 | 1 | High | — |
| `weekly/member-weekly-report.feature` | 週報 | 1 | High | — |
| `weekly/cron-reminder.feature` | 週報 | 3 | High | — |
| `notification/notification-lifecycle.feature` | 通知 | 5 | High | — |
| `notification/notification-triggers.feature` | 通知 | 8 | High | — |
| `budget/budget-management.feature` | 預算 | 3 | Medium | — |
| `risk/risk-management.feature` | 風險 | 3 | Medium | — |
| `dashboard/dashboard.feature` | 儀表板 | 4 | High | @smoke |
| `report/export-reports.feature` | 報表 | 3 | Medium | — |
| `admin/user-management.feature` | 管理 | 4 | High | — |
| `admin/project-type-config.feature` | 管理 | 2 | Medium | — |
| `admin/notification-config.feature` | 管理 | 3 | Medium | — |
| `admin/cron-monitoring.feature` | 管理 | 2 | Medium | — |
| `share/share-link.feature` | 共享 | 3 | Low | — |
| **總計** | — | **97** | — | — |

### 7.2 優先級分佈

```
Critical ██████████████████████  38 scenarios (39%)
High     ████████████████████    35 scenarios (36%)
Medium   ████████████            18 scenarios (19%)
Low      ███                      6 scenarios  (6%)
```

### 7.3 模組覆蓋率

```
認證與授權  ████████████████  16 scenarios  ✅ 完整覆蓋
專案管理    ██████████████    14 scenarios  ✅ 完整覆蓋
任務管理    ██████████████████ 18 scenarios  ✅ 完整覆蓋
延遲審批    ██████            6 scenarios   ✅ 完整覆蓋
週報追蹤    █████             5 scenarios   ✅ 完整覆蓋
通知系統    █████████████     13 scenarios  ✅ 完整覆蓋
預算/CAPEX  ███               3 scenarios   ✅ 核心覆蓋
風險管理    ███               3 scenarios   ✅ 核心覆蓋
儀表板      ████              4 scenarios   ✅ 核心覆蓋
報表匯出    ███               3 scenarios   ✅ 核心覆蓋
管理後台    ███████████       11 scenarios  ✅ 完整覆蓋
共享連結    ███               3 scenarios   ✅ 核心覆蓋
```

---

*文件結束 — BDD 行為驅動開發報告*
