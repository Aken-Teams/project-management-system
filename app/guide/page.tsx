'use client'

import { DashboardLayout } from '@/components/dashboard-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import {
  BookOpen,
  Shield,
  HelpCircle,
  BarChart3,
  ClipboardList,
  FolderKanban,
  FileText,
  ClipboardCheck,
  Layers,
  Bell,
  Settings,
  Users,
  PlusCircle,
  ShieldCheck,
  CalendarDays,
} from 'lucide-react'

export default function GuidePage() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">使用指南</h1>
          <p className="text-sm text-muted-foreground mt-1">
            了解專案管理系統的功能與操作方式，快速上手各項功能
          </p>
        </div>

        {/* System Overview */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              系統簡介
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm leading-relaxed space-y-3">
            <p>
              本系統是一套專為團隊協作設計的專案管理工具，支援從專案建立、里程碑規劃、任務分派到進度追蹤的完整流程。
            </p>
            <p>
              系統有兩套角色機制，分別管理不同層面的權限：
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border-2 border-blue-200 dark:border-blue-800 p-3 bg-blue-50/50 dark:bg-blue-950/20">
                <div className="flex items-center gap-1.5 font-semibold text-blue-700 dark:text-blue-400 text-xs mb-1">
                  <Shield className="h-3.5 w-3.5" /> 系統角色
                </div>
                <p className="text-xs text-muted-foreground">
                  決定使用者可以存取哪些頁面與功能，由系統管理員在後台統一設定
                </p>
              </div>
              <div className="rounded-lg border-2 border-emerald-200 dark:border-emerald-800 p-3 bg-emerald-50/50 dark:bg-emerald-950/20">
                <div className="flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-400 text-xs mb-1">
                  <Users className="h-3.5 w-3.5" /> 專案角色（RACIPS）
                </div>
                <p className="text-xs text-muted-foreground">
                  決定成員在個別專案中的職責，由專案經理在建立或編輯專案時指派
                </p>
              </div>
            </div>
            <p className="text-muted-foreground">
              任務進度會根據工作日誌自動計算，子任務進度依工期加權彙整至父任務，再由任務彙整至里程碑與專案層級。
            </p>
          </CardContent>
        </Card>

        {/* Two role systems */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* System Roles */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="h-4 w-4 text-blue-600" />
                系統角色
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">每位使用者有且只有一個系統角色，決定可存取的頁面與操作範圍</p>
            </CardHeader>
            <CardContent className="pt-0">
              <Accordion type="multiple">
                <AccordionItem value="sys-admin">
                  <AccordionTrigger className="text-sm">
                    <span className="flex items-center gap-2">
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-700">系統管理員</span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-2 text-sm leading-relaxed">
                      <p>擁有最高權限，負責系統整體運作：</p>
                      <ol className="list-decimal ml-5 space-y-1">
                        <li><strong>使用者管理</strong>：新增、編輯、停用帳號，指派系統角色</li>
                        <li><strong>專案設定</strong>：管理專案類型、代碼前綴、里程碑範本</li>
                        <li><strong>通知與報告</strong>：設定通知規則與自動報告排程</li>
                        <li><strong>排程行事曆</strong>：查看排程任務執行紀錄</li>
                        <li><strong>全域存取</strong>：可檢視所有專案、審核中心、報告</li>
                      </ol>
                      <p className="text-xs text-muted-foreground border-l-2 border-red-300 pl-2 mt-2">
                        管理後台僅此角色可見，側邊欄會顯示「管理後台」選項
                      </p>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="sys-executive">
                  <AccordionTrigger className="text-sm">
                    <span className="flex items-center gap-2">
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-700">主管</span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-2 text-sm leading-relaxed">
                      <p>負責監督與決策，掌握全局資訊：</p>
                      <ol className="list-decimal ml-5 space-y-1">
                        <li><strong>儀表板</strong>：總覽所有專案進度、預算與風險</li>
                        <li><strong>報告</strong>：查看統計圖表與匯出 PDF</li>
                        <li><strong>審核中心</strong>：檢視延期申請進度</li>
                        <li><strong>協助處理</strong>：處理「待處理協助」的支援請求</li>
                        <li><strong>專案看板</strong>：深入查看所有專案詳情</li>
                      </ol>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="sys-pm">
                  <AccordionTrigger className="text-sm">
                    <span className="flex items-center gap-2">
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700">專案經理</span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-2 text-sm leading-relaxed">
                      <p>專案的核心管理者，負責建立與推動專案：</p>
                      <ol className="list-decimal ml-5 space-y-1">
                        <li><strong>建立專案</strong>：透過手動或 AI 輔助模式建立</li>
                        <li><strong>規劃任務</strong>：為里程碑建立任務與子任務、設定負責人</li>
                        <li><strong>追蹤進度</strong>：透過儀表板掌握整體狀態</li>
                        <li><strong>審核中心</strong>：檢視團隊的延期申請進度</li>
                        <li><strong>產出報告</strong>：匯出 PDF 報告</li>
                        <li><strong>分享專案</strong>：產生分享連結供外部檢視</li>
                      </ol>
                      <p className="text-xs text-muted-foreground border-l-2 border-blue-300 pl-2 mt-2">
                        提示：建立專案時可選擇里程碑範本，自動帶入預設的任務與子任務結構
                      </p>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="sys-member" className="border-b-0">
                  <AccordionTrigger className="text-sm">
                    <span className="flex items-center gap-2">
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-700">團隊成員</span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-2 text-sm leading-relaxed">
                      <p>日常操作集中在「我的任務」頁面：</p>
                      <ol className="list-decimal ml-5 space-y-1">
                        <li><strong>查看任務</strong>：系統自動顯示被指派的任務</li>
                        <li><strong>填寫日誌</strong>：點擊任務卡片新增工作紀錄</li>
                        <li><strong>管理子任務</strong>：可新增 / 刪除子任務</li>
                        <li><strong>申請延期</strong>：提交延期申請由 S 角色審核</li>
                        <li><strong>審核中心</strong>：可查看自己參與專案的審核進度</li>
                      </ol>
                      <p className="text-xs text-muted-foreground border-l-2 border-gray-300 pl-2 mt-2">
                        僅能看到自己參與的專案，狀態燈號依起迄日期自動判定
                      </p>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </CardContent>
          </Card>

          {/* Project Roles (RACIPS) */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4 text-emerald-600" />
                專案角色（RACIPS）
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">同一人在不同專案中可擔任不同角色，由專案經理在建立專案時指派</p>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              <div className="space-y-2">
                <div className="rounded-md border px-3 py-2.5 bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-blue-700 dark:text-blue-400 text-sm">R — Responsible 執行者</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">實際執行任務的成員，負責填寫工作日誌、回報進度、管理子任務</p>
                </div>
                <div className="rounded-md border px-3 py-2.5 bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-amber-700 dark:text-amber-400 text-sm">A — Accountable 當責者</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">對專案成果負最終責任，通常為專案負責人或部門主管</p>
                </div>
                <div className="rounded-md border px-3 py-2.5 bg-violet-50 dark:bg-violet-950/20 border-violet-200 dark:border-violet-800">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-violet-700 dark:text-violet-400 text-sm">C — Consulted 諮詢者</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">提供專業意見與技術支援，在決策前被徵詢的專家</p>
                </div>
                <div className="rounded-md border px-3 py-2.5 bg-slate-50 dark:bg-slate-950/20 border-slate-200 dark:border-slate-800">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-700 dark:text-slate-400 text-sm">I — Informed 知會者</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">需被告知專案進度與決策結果，但不直接參與執行</p>
                </div>
                <div className="rounded-md border px-3 py-2.5 bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-orange-700 dark:text-orange-400 text-sm">P — Procurement 採購者</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">負責專案相關的設備採購與供應商管理</p>
                </div>
                <div className="rounded-md border-2 px-3 py-2.5 bg-emerald-50 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-700">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-emerald-700 dark:text-emerald-400 text-sm">S — Sign-off 簽核者</span>
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">審核權限</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">負責審核延期申請，可核准或駁回。每個專案可有多位 S 角色，需全部通過才算核准</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Role comparison */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <HelpCircle className="h-4 w-4" />
              系統角色 vs 專案角色 — 有什麼不同？
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-muted/40">
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground border-b"></th>
                    <th className="text-left px-4 py-2.5 font-medium border-b">
                      <span className="flex items-center gap-1.5 text-blue-700 dark:text-blue-400">
                        <Shield className="h-3.5 w-3.5" /> 系統角色
                      </span>
                    </th>
                    <th className="text-left px-4 py-2.5 font-medium border-b">
                      <span className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                        <Users className="h-3.5 w-3.5" /> 專案角色
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  <tr>
                    <td className="px-4 py-2.5 font-medium text-muted-foreground">設定方式</td>
                    <td className="px-4 py-2.5">由管理員在「使用者管理」設定</td>
                    <td className="px-4 py-2.5">由專案經理在建立/編輯專案時指派</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5 font-medium text-muted-foreground">數量</td>
                    <td className="px-4 py-2.5">每人固定一個</td>
                    <td className="px-4 py-2.5">每個專案各自指派，可不同</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5 font-medium text-muted-foreground">影響範圍</td>
                    <td className="px-4 py-2.5">全系統的頁面存取與操作權限</td>
                    <td className="px-4 py-2.5">該專案內的角色職責與審核權</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5 font-medium text-muted-foreground">種類</td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-700">管理員</span>
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-700">主管</span>
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700">PM</span>
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-700">成員</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700">R</span>
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700">A</span>
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-violet-100 text-violet-700">C</span>
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700">I</span>
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-100 text-orange-700">P</span>
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-700">S</span>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground leading-relaxed space-y-1.5">
              <p><strong className="text-foreground">舉例：</strong>小明的系統角色是「團隊成員」，他同時參與三個專案：</p>
              <ul className="list-disc ml-5 space-y-0.5">
                <li>專案 A 中擔任 <strong className="text-blue-700 dark:text-blue-400">R（執行者）</strong>— 負責填寫日誌與回報進度</li>
                <li>專案 B 中擔任 <strong className="text-emerald-700 dark:text-emerald-400">S（簽核者）</strong>— 負責審核該專案的延期申請</li>
                <li>專案 C 中擔任 <strong className="text-slate-700 dark:text-slate-400">I（知會者）</strong>— 只需接收進度通知</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">

          {/* Feature Descriptions */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Layers className="h-4 w-4" />
                功能說明
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <Accordion type="multiple">
                <AccordionItem value="dashboard">
                  <AccordionTrigger className="text-sm">
                    <span className="flex items-center gap-2">
                      <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
                      儀表板
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <ul className="list-disc ml-5 space-y-1 text-sm">
                      <li>專案數量統計（進行中 / 已完成 / 逾期）</li>
                      <li>整體進度百分比與狀態分佈圖</li>
                      <li>需要關注的風險任務提醒</li>
                    </ul>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="my-tasks">
                  <AccordionTrigger className="text-sm">
                    <span className="flex items-center gap-2">
                      <ClipboardList className="h-3.5 w-3.5 text-muted-foreground" />
                      我的任務
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <ul className="list-disc ml-5 space-y-1 text-sm">
                      <li>以卡片方式呈現任務，按專案分組</li>
                      <li>點擊卡片可填寫日誌、查看子任務</li>
                      <li>子任務支援新增 / 刪除 / 展開收合</li>
                      <li>「帶入子任務紀錄」支援原始資料或 AI 彙整</li>
                      <li>支援延期申請功能</li>
                    </ul>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="projects">
                  <AccordionTrigger className="text-sm">
                    <span className="flex items-center gap-2">
                      <FolderKanban className="h-3.5 w-3.5 text-muted-foreground" />
                      專案看板
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <ul className="list-disc ml-5 space-y-1 text-sm">
                      <li>專案列表顯示名稱、狀態、進度與團隊</li>
                      <li>點擊進入詳情查看里程碑、任務、甘特圖</li>
                      <li>可新增 / 編輯專案、設定 ARCI 角色</li>
                      <li>支援草稿功能，可稍後繼續編輯</li>
                      <li>支援分享連結，供外部人員檢視專案</li>
                    </ul>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="create-project">
                  <AccordionTrigger className="text-sm">
                    <span className="flex items-center gap-2">
                      <PlusCircle className="h-3.5 w-3.5 text-muted-foreground" />
                      建立專案
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-3 text-sm">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-md border px-3 py-2 bg-blue-50/50 dark:bg-blue-950/10 border-blue-200 dark:border-blue-800">
                          <div className="font-medium text-blue-700 dark:text-blue-400 text-xs">手動建立</div>
                          <div className="text-xs text-muted-foreground mt-0.5">五步驟精靈逐步填寫</div>
                        </div>
                        <div className="rounded-md border px-3 py-2 bg-violet-50/50 dark:bg-violet-950/10 border-violet-200 dark:border-violet-800">
                          <div className="font-medium text-violet-700 dark:text-violet-400 text-xs">AI 輔助建立</div>
                          <div className="text-xs text-muted-foreground mt-0.5">自然語言描述，AI 自動產生規劃</div>
                        </div>
                      </div>
                      <p className="text-xs font-medium">五步驟流程：</p>
                      <div className="flex items-center gap-1.5 flex-wrap text-xs">
                        <span className="rounded-md bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-1 font-medium">1. 基本資訊</span>
                        <span className="text-muted-foreground">→</span>
                        <span className="rounded-md bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 px-2 py-1 font-medium">2. SMART 目標</span>
                        <span className="text-muted-foreground">→</span>
                        <span className="rounded-md bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 px-2 py-1 font-medium">3. 專案定義</span>
                        <span className="text-muted-foreground">→</span>
                        <span className="rounded-md bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 px-2 py-1 font-medium">4. 團隊與風險</span>
                        <span className="text-muted-foreground">→</span>
                        <span className="rounded-md bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 px-2 py-1 font-medium">5. 時程里程碑</span>
                      </div>
                      <ul className="list-disc ml-5 space-y-1 text-xs text-muted-foreground">
                        <li>基本資訊：專案層別、類型、名稱、預算、投資設備清單</li>
                        <li>專案代碼依據類型自動產生（如 PDFN8080-2026-001）</li>
                        <li>選擇類型時自動帶入里程碑範本（含任務與子任務）</li>
                        <li>設備清單支援 AI 圖片辨識自動匯入</li>
                        <li>任何階段可暫存草稿，下次繼續編輯</li>
                      </ul>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="reports">
                  <AccordionTrigger className="text-sm">
                    <span className="flex items-center gap-2">
                      <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                      報告
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <ul className="list-disc ml-5 space-y-1 text-sm">
                      <li>各專案進度、任務完成率統計</li>
                      <li>風險與逾期任務清單</li>
                      <li>可匯出 PDF 報告</li>
                    </ul>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="approvals">
                  <AccordionTrigger className="text-sm">
                    <span className="flex items-center gap-2">
                      <ClipboardCheck className="h-3.5 w-3.5 text-muted-foreground" />
                      審核中心
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <ul className="list-disc ml-5 space-y-1 text-sm">
                      <li>延期申請審核（核准 / 駁回）</li>
                      <li>顯示申請人、原因與調整時程</li>
                      <li>審核紀錄可追溯</li>
                    </ul>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="notifications">
                  <AccordionTrigger className="text-sm">
                    <span className="flex items-center gap-2">
                      <Bell className="h-3.5 w-3.5 text-muted-foreground" />
                      通知系統
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <ul className="list-disc ml-5 space-y-1 text-sm">
                      <li>右上角鈴鐺圖示即時顯示未讀通知數量</li>
                      <li>通知包含：任務指派、延期審核結果、逾期提醒等</li>
                      <li>點擊通知可跳轉至對應頁面</li>
                      <li>支援已讀 / 全部已讀操作</li>
                    </ul>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="admin" className="border-b-0">
                  <AccordionTrigger className="text-sm">
                    <span className="flex items-center gap-2">
                      <Settings className="h-3.5 w-3.5 text-muted-foreground" />
                      管理後台（Admin）
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-2 text-sm">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-md border px-3 py-2">
                          <div className="flex items-center gap-1.5 font-medium text-xs">
                            <Users className="h-3 w-3" /> 使用者管理
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">新增 / 編輯 / 停用帳號</div>
                        </div>
                        <div className="rounded-md border px-3 py-2">
                          <div className="flex items-center gap-1.5 font-medium text-xs">
                            <ShieldCheck className="h-3 w-3" /> 角色權限
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">指派 PM / 成員 / 主管 / 管理員</div>
                        </div>
                        <div className="rounded-md border px-3 py-2">
                          <div className="flex items-center gap-1.5 font-medium text-xs">
                            <Settings className="h-3 w-3" /> 專案設定
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">專案類型、代碼前綴、里程碑範本（三層結構）</div>
                        </div>
                        <div className="rounded-md border px-3 py-2">
                          <div className="flex items-center gap-1.5 font-medium text-xs">
                            <Bell className="h-3 w-3" /> 通知設定
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">系統通知觸發規則</div>
                        </div>
                        <div className="rounded-md border px-3 py-2">
                          <div className="flex items-center gap-1.5 font-medium text-xs">
                            <FileText className="h-3 w-3" /> 報告設定
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">自動報告產出排程</div>
                        </div>
                        <div className="rounded-md border px-3 py-2">
                          <div className="flex items-center gap-1.5 font-medium text-xs">
                            <CalendarDays className="h-3 w-3" /> 排程行事曆
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">排程執行紀錄與日曆</div>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground border-l-2 border-primary/30 pl-2">
                        專案設定中可自訂里程碑範本（里程碑 → 任務 → 子任務三層結構），建立新專案時自動帶入
                      </p>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </CardContent>
          </Card>

          {/* FAQ */}
          <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <HelpCircle className="h-4 w-4" />
              常見問題
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <Accordion type="multiple">
              {/* 1 - Progress */}
              <AccordionItem value="faq-progress">
                <AccordionTrigger className="text-sm">進度百分比是怎麼計算的？</AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-3 text-sm">
                    <p className="text-muted-foreground">由下而上四層彙整：</p>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="rounded-md bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 px-2.5 py-1 text-xs font-medium">子任務</span>
                      <span className="text-muted-foreground text-xs">→ 加權</span>
                      <span className="rounded-md bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2.5 py-1 text-xs font-medium">父任務</span>
                      <span className="text-muted-foreground text-xs">→ 平均</span>
                      <span className="rounded-md bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 px-2.5 py-1 text-xs font-medium">里程碑</span>
                      <span className="text-muted-foreground text-xs">→ 平均</span>
                      <span className="rounded-md bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 px-2.5 py-1 text-xs font-medium">專案</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded border border-violet-200 dark:border-violet-800 px-2.5 py-1.5 bg-violet-50/50 dark:bg-violet-950/10">
                        <span className="font-medium text-violet-700 dark:text-violet-400">子任務</span>
                        <span className="text-muted-foreground ml-1">日誌天數 / 工期</span>
                      </div>
                      <div className="rounded border border-blue-200 dark:border-blue-800 px-2.5 py-1.5 bg-blue-50/50 dark:bg-blue-950/10">
                        <span className="font-medium text-blue-700 dark:text-blue-400">父任務</span>
                        <span className="text-muted-foreground ml-1">依工期加權平均</span>
                      </div>
                      <div className="rounded border border-emerald-200 dark:border-emerald-800 px-2.5 py-1.5 bg-emerald-50/50 dark:bg-emerald-950/10">
                        <span className="font-medium text-emerald-700 dark:text-emerald-400">里程碑</span>
                        <span className="text-muted-foreground ml-1">父任務進度平均</span>
                      </div>
                      <div className="rounded border border-amber-200 dark:border-amber-800 px-2.5 py-1.5 bg-amber-50/50 dark:bg-amber-950/10">
                        <span className="font-medium text-amber-700 dark:text-amber-400">專案</span>
                        <span className="text-muted-foreground ml-1">里程碑進度平均</span>
                      </div>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* 2 - Status */}
              <AccordionItem value="faq-status">
                <AccordionTrigger className="text-sm">任務狀態燈號代表什麼？</AccordionTrigger>
                <AccordionContent>
                  <div className="grid gap-2 sm:grid-cols-2 text-sm">
                    <div className="flex items-center gap-2.5 rounded-md border px-3 py-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-blue-500 shrink-0" />
                      <span><strong>正常</strong> <span className="text-muted-foreground">— 進度符合預期</span></span>
                    </div>
                    <div className="flex items-center gap-2.5 rounded-md border px-3 py-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-amber-500 shrink-0" />
                      <span><strong>注意</strong> <span className="text-muted-foreground">— 接近截止但落後</span></span>
                    </div>
                    <div className="flex items-center gap-2.5 rounded-md border px-3 py-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-red-500 shrink-0" />
                      <span><strong>逾期</strong> <span className="text-muted-foreground">— 已超過結束日期</span></span>
                    </div>
                    <div className="flex items-center gap-2.5 rounded-md border px-3 py-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-green-500 shrink-0" />
                      <span><strong>已完成</strong> <span className="text-muted-foreground">— 任務已標記完成</span></span>
                    </div>
                    <div className="flex items-center gap-2.5 rounded-md border px-3 py-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-orange-500 shrink-0" />
                      <span><strong>逾期未開始</strong> <span className="text-muted-foreground">— 超過開始日</span></span>
                    </div>
                    <div className="flex items-center gap-2.5 rounded-md border px-3 py-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-gray-300 shrink-0" />
                      <span><strong>未開始</strong> <span className="text-muted-foreground">— 尚未到開始日</span></span>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* 3 - Delay */}
              <AccordionItem value="faq-delay">
                <AccordionTrigger className="text-sm">如何申請延期？審核流程是什麼？</AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-3 text-sm">
                    <div className="flex items-start gap-3">
                      <div className="flex flex-col items-center gap-1 shrink-0">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-xs font-bold">1</span>
                        <span className="w-px h-4 bg-border" />
                      </div>
                      <div className="pt-0.5">
                        <span className="font-medium">提交申請</span>
                        <span className="text-muted-foreground ml-1">— 我的任務 → 任務卡片 → 申請延期</span>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="flex flex-col items-center gap-1 shrink-0">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-xs font-bold">2</span>
                        <span className="w-px h-4 bg-border" />
                      </div>
                      <div className="pt-0.5">
                        <span className="font-medium">填寫資訊</span>
                        <span className="text-muted-foreground ml-1">— 新結束日期、延期原因、所需支援</span>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="flex flex-col items-center gap-1 shrink-0">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 text-xs font-bold">3</span>
                        <span className="w-px h-4 bg-border" />
                      </div>
                      <div className="pt-0.5">
                        <span className="font-medium">PM / 主管審核</span>
                        <span className="text-muted-foreground ml-1">— 在審核中心核准或駁回</span>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="shrink-0">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 text-xs font-bold">4</span>
                      </div>
                      <div className="pt-0.5">
                        <span className="font-medium">自動調整</span>
                        <span className="text-muted-foreground ml-1">— 核准後連動更新後續時程</span>
                      </div>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* 4 - Subtask */}
              <AccordionItem value="faq-subtask">
                <AccordionTrigger className="text-sm">子任務如何運作？天數配額是什麼？</AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-3 text-sm">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-md border px-3 py-2 bg-blue-50/50 dark:bg-blue-950/10 border-blue-200 dark:border-blue-800">
                        <div className="font-medium text-blue-700 dark:text-blue-400 text-xs">新增方式</div>
                        <div className="text-muted-foreground text-xs mt-0.5">任務卡片中點「+」</div>
                      </div>
                      <div className="rounded-md border px-3 py-2 bg-violet-50/50 dark:bg-violet-950/10 border-violet-200 dark:border-violet-800">
                        <div className="font-medium text-violet-700 dark:text-violet-400 text-xs">獨立管理</div>
                        <div className="text-muted-foreground text-xs mt-0.5">各有起迄、進度、日誌</div>
                      </div>
                      <div className="rounded-md border px-3 py-2 bg-amber-50/50 dark:bg-amber-950/10 border-amber-200 dark:border-amber-800">
                        <div className="font-medium text-amber-700 dark:text-amber-400 text-xs">天數配額</div>
                        <div className="text-muted-foreground text-xs mt-0.5">總天數 ≤ 父任務工期</div>
                      </div>
                      <div className="rounded-md border px-3 py-2 bg-emerald-50/50 dark:bg-emerald-950/10 border-emerald-200 dark:border-emerald-800">
                        <div className="font-medium text-emerald-700 dark:text-emerald-400 text-xs">進度計算</div>
                        <div className="text-muted-foreground text-xs mt-0.5">依工期加權彙整至父任務</div>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground border-l-2 border-primary/30 pl-2">
                      父任務日誌可「帶入子任務紀錄」— 原始資料或 AI 彙整
                    </p>
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* 5 - Auto status */}
              <AccordionItem value="faq-auto-status">
                <AccordionTrigger className="text-sm">任務狀態會自動變更嗎？</AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-2 text-sm">
                    <p className="text-muted-foreground">系統依條件自動切換狀態：</p>
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs">
                        <span className="rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 font-medium shrink-0">進行中</span>
                        <span className="text-muted-foreground">開始日已到 + 無阻礙依賴</span>
                      </div>
                      <div className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs">
                        <span className="rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-1.5 py-0.5 font-medium shrink-0">受阻</span>
                        <span className="text-muted-foreground">依賴未完成 + 無工作紀錄</span>
                      </div>
                      <div className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs">
                        <span className="rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 font-medium shrink-0">進行中</span>
                        <span className="text-muted-foreground">依賴未完成但有紀錄（前期準備）</span>
                      </div>
                      <div className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs">
                        <span className="rounded bg-gray-100 dark:bg-gray-900/30 text-gray-700 dark:text-gray-300 px-1.5 py-0.5 font-medium shrink-0">待辦</span>
                        <span className="text-muted-foreground">開始日改到未來 + 進度 0%</span>
                      </div>
                      <div className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs">
                        <span className="rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-1.5 py-0.5 font-medium shrink-0">完成</span>
                        <span className="text-muted-foreground">手動標記完成 → 進度自動 100%</span>
                      </div>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* 6 - ARCI */}
              <AccordionItem value="faq-raci">
                <AccordionTrigger className="text-sm">什麼是 ARCI？如何指派角色？</AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-3 text-sm">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-md border px-3 py-2 bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
                        <span className="font-semibold text-amber-700 dark:text-amber-400">A 當責</span>
                        <div className="text-xs text-muted-foreground mt-0.5">最終負責人，等同 PM</div>
                      </div>
                      <div className="rounded-md border px-3 py-2 bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
                        <span className="font-semibold text-blue-700 dark:text-blue-400">R 負責</span>
                        <div className="text-xs text-muted-foreground mt-0.5">實際執行工作的人</div>
                      </div>
                      <div className="rounded-md border px-3 py-2 bg-violet-50 dark:bg-violet-950/20 border-violet-200 dark:border-violet-800">
                        <span className="font-semibold text-violet-700 dark:text-violet-400">C 諮詢</span>
                        <div className="text-xs text-muted-foreground mt-0.5">提供專業意見</div>
                      </div>
                      <div className="rounded-md border px-3 py-2 bg-slate-50 dark:bg-slate-950/20 border-slate-200 dark:border-slate-800">
                        <span className="font-semibold text-slate-700 dark:text-slate-400">I 知會</span>
                        <div className="text-xs text-muted-foreground mt-0.5">需被告知進展</div>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground border-l-2 border-primary/30 pl-2">
                      編輯專案「團隊」頁籤中指派，搜尋可自動帶入姓名、職稱與組織
                    </p>
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* 7 - Milestone templates */}
              <AccordionItem value="faq-templates">
                <AccordionTrigger className="text-sm">里程碑範本是什麼？怎麼使用？</AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-3 text-sm">
                    <p className="text-muted-foreground">
                      管理員可在後台為每種專案類型預設里程碑範本，包含三層結構：
                    </p>
                    <div className="flex items-center gap-1.5 flex-wrap text-xs">
                      <span className="rounded-md bg-slate-100 dark:bg-slate-900/30 text-slate-700 dark:text-slate-300 px-2.5 py-1 font-medium">里程碑</span>
                      <span className="text-muted-foreground">→</span>
                      <span className="rounded-md bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2.5 py-1 font-medium">任務</span>
                      <span className="text-muted-foreground">→</span>
                      <span className="rounded-md bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 px-2.5 py-1 font-medium">子任務</span>
                    </div>
                    <ul className="list-disc ml-5 space-y-1 text-xs text-muted-foreground">
                      <li>建立新專案時，選擇類型即自動帶入對應範本</li>
                      <li>每個任務 / 子任務可設定預設工期與優先級</li>
                      <li>管理員可在後台「專案設定」中新增、編輯、清空範本</li>
                      <li>支援全部展開 / 收合快速瀏覽範本結構</li>
                    </ul>
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* 8 - Project code */}
              <AccordionItem value="faq-project-code">
                <AccordionTrigger className="text-sm">專案代碼怎麼產生的？可以自訂嗎？</AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-3 text-sm">
                    <p className="text-muted-foreground">
                      專案代碼由系統自動產生，格式為：
                    </p>
                    <div className="rounded-md border px-3 py-2 bg-muted/50 text-center font-mono text-sm">
                      <span className="text-blue-600 dark:text-blue-400 font-medium">前綴</span>
                      <span className="text-muted-foreground mx-1">-</span>
                      <span className="text-emerald-600 dark:text-emerald-400 font-medium">年份</span>
                      <span className="text-muted-foreground mx-1">-</span>
                      <span className="text-amber-600 dark:text-amber-400 font-medium">流水號</span>
                      <div className="text-xs text-muted-foreground mt-1">例如：PDFN8080-2026-001</div>
                    </div>
                    <ul className="list-disc ml-5 space-y-1 text-xs text-muted-foreground">
                      <li>前綴由管理員在後台「專案設定」中設定（建立類型時自動產生，也可手動修改）</li>
                      <li>流水號依專案類型 + 年份自動遞增，確保唯一</li>
                      <li>已建立的專案代碼不會因前綴修改而變更</li>
                    </ul>
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* 9 - Work log */}
              <AccordionItem value="faq-worklog">
                <AccordionTrigger className="text-sm">工作日誌怎麼填寫？支援語音輸入嗎？</AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-3 text-sm">
                    <div className="flex items-center gap-2 text-xs flex-wrap">
                      <span className="rounded-md bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-1 font-medium">點擊任務卡片</span>
                      <span className="text-muted-foreground">→</span>
                      <span className="rounded-md bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 px-2 py-1 font-medium">選擇日期</span>
                      <span className="text-muted-foreground">→</span>
                      <span className="rounded-md bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 px-2 py-1 font-medium">輸入內容</span>
                      <span className="text-muted-foreground">→</span>
                      <span className="rounded-md bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 px-2 py-1 font-medium">送出</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div className="rounded-md border px-2.5 py-2 text-center">
                        <div className="font-medium">語音輸入</div>
                        <div className="text-muted-foreground mt-0.5">麥克風辨識中文</div>
                      </div>
                      <div className="rounded-md border px-2.5 py-2 text-center">
                        <div className="font-medium">帶入紀錄</div>
                        <div className="text-muted-foreground mt-0.5">子任務匯入 / AI 彙整</div>
                      </div>
                      <div className="rounded-md border px-2.5 py-2 text-center">
                        <div className="font-medium">事後修改</div>
                        <div className="text-muted-foreground mt-0.5">已送出可編輯刪除</div>
                      </div>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* 10 - Gantt */}
              <AccordionItem value="faq-gantt">
                <AccordionTrigger className="text-sm">甘特圖怎麼看？可以做什麼？</AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-3 text-sm">
                    <p className="text-muted-foreground">時間軸方式呈現排程，任務顏色對應狀態：</p>
                    <div className="flex items-center gap-2 flex-wrap text-xs">
                      <span className="inline-flex items-center gap-1 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-0.5 font-medium">
                        <span className="h-2 w-5 rounded-sm bg-blue-500 inline-block" /> 進行中
                      </span>
                      <span className="inline-flex items-center gap-1 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-2 py-0.5 font-medium">
                        <span className="h-2 w-5 rounded-sm bg-green-500 inline-block" /> 完成
                      </span>
                      <span className="inline-flex items-center gap-1 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-2 py-0.5 font-medium">
                        <span className="h-2 w-5 rounded-sm bg-red-500 inline-block" /> 逾期
                      </span>
                      <span className="inline-flex items-center gap-1 rounded bg-gray-100 dark:bg-gray-900/30 text-gray-700 dark:text-gray-300 px-2 py-0.5 font-medium">
                        <span className="h-2 w-5 rounded-sm bg-gray-400 inline-block" /> 待辦
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-md border px-2.5 py-2">
                        <span className="font-medium">依賴關係</span>
                        <span className="text-muted-foreground ml-1">連接線顯示</span>
                      </div>
                      <div className="rounded-md border px-2.5 py-2">
                        <span className="font-medium text-amber-600 dark:text-amber-400">基準線</span>
                        <span className="text-muted-foreground ml-1">金色對比原始排程</span>
                      </div>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* 11 - Roles */}
              <AccordionItem value="faq-roles" className="border-b-0">
                <AccordionTrigger className="text-sm">四種系統角色有什麼差異？</AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-2 text-sm">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-1.5 pr-2 font-medium">功能</th>
                            <th className="text-center py-1.5 px-2 font-medium text-amber-600 dark:text-amber-400">PM</th>
                            <th className="text-center py-1.5 px-2 font-medium text-blue-600 dark:text-blue-400">成員</th>
                            <th className="text-center py-1.5 px-2 font-medium text-violet-600 dark:text-violet-400">主管</th>
                            <th className="text-center py-1.5 px-2 font-medium text-rose-600 dark:text-rose-400">管理員</th>
                          </tr>
                        </thead>
                        <tbody className="text-muted-foreground">
                          <tr className="border-b border-border/50"><td className="py-1.5 pr-2">儀表板</td><td className="text-center text-green-600">&#10003;</td><td className="text-center">—</td><td className="text-center text-green-600">&#10003;</td><td className="text-center text-green-600">&#10003;</td></tr>
                          <tr className="border-b border-border/50"><td className="py-1.5 pr-2">我的任務</td><td className="text-center text-green-600">&#10003;</td><td className="text-center text-green-600">&#10003;</td><td className="text-center">—</td><td className="text-center text-green-600">&#10003;</td></tr>
                          <tr className="border-b border-border/50"><td className="py-1.5 pr-2">建立 / 編輯專案</td><td className="text-center text-green-600">&#10003;</td><td className="text-center">—</td><td className="text-center">—</td><td className="text-center text-green-600">&#10003;</td></tr>
                          <tr className="border-b border-border/50"><td className="py-1.5 pr-2">審核延期</td><td className="text-center text-green-600">&#10003;</td><td className="text-center">—</td><td className="text-center text-green-600">&#10003;</td><td className="text-center text-green-600">&#10003;</td></tr>
                          <tr className="border-b border-border/50"><td className="py-1.5 pr-2">報告 / PDF</td><td className="text-center text-green-600">&#10003;</td><td className="text-center">—</td><td className="text-center text-green-600">&#10003;</td><td className="text-center text-green-600">&#10003;</td></tr>
                          <tr className="border-b border-border/50"><td className="py-1.5 pr-2">專案看板</td><td className="text-center text-green-600">&#10003;</td><td className="text-center text-green-600">&#10003;</td><td className="text-center text-green-600">&#10003;</td><td className="text-center text-green-600">&#10003;</td></tr>
                          <tr><td className="py-1.5 pr-2">管理後台</td><td className="text-center">—</td><td className="text-center">—</td><td className="text-center">—</td><td className="text-center text-green-600">&#10003;</td></tr>
                        </tbody>
                      </table>
                    </div>
                    <p className="text-xs text-muted-foreground border-l-2 border-primary/30 pl-2">
                      管理員擁有所有 PM 權限，額外可進入管理後台設定系統參數
                    </p>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  )
}
