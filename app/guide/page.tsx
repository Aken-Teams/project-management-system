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
} from 'lucide-react'

export default function GuidePage() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page Header — matches other pages */}
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
              系統採用 <strong>RACI 模型</strong>管理團隊角色，清楚劃分每位成員的權責：
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-md border px-3 py-2 bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
                <span className="font-semibold text-amber-700 dark:text-amber-400">A 當責</span>
                <span className="text-muted-foreground ml-1.5">— 對專案成果負最終責任</span>
              </div>
              <div className="rounded-md border px-3 py-2 bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
                <span className="font-semibold text-blue-700 dark:text-blue-400">R 負責</span>
                <span className="text-muted-foreground ml-1.5">— 實際執行任務的成員</span>
              </div>
              <div className="rounded-md border px-3 py-2 bg-violet-50 dark:bg-violet-950/20 border-violet-200 dark:border-violet-800">
                <span className="font-semibold text-violet-700 dark:text-violet-400">C 諮詢</span>
                <span className="text-muted-foreground ml-1.5">— 提供專業意見的顧問</span>
              </div>
              <div className="rounded-md border px-3 py-2 bg-slate-50 dark:bg-slate-950/20 border-slate-200 dark:border-slate-800">
                <span className="font-semibold text-slate-700 dark:text-slate-400">I 知會</span>
                <span className="text-muted-foreground ml-1.5">— 需被告知進度的人</span>
              </div>
            </div>
            <p className="text-muted-foreground">
              任務進度會根據工作日誌自動計算，子任務進度依工期加權彙整至父任務，再由任務彙整至里程碑與專案層級。
            </p>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Role-based Guides */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="h-4 w-4" />
                角色指南
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <Accordion type="multiple">
                <AccordionItem value="pm">
                  <AccordionTrigger className="text-sm">專案經理（PM / 當責 A）</AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-2 text-sm leading-relaxed">
                      <p>身為專案經理，您是系統的核心使用者：</p>
                      <ol className="list-decimal ml-5 space-y-1">
                        <li><strong>建立專案</strong>：在「專案看板」點擊新增</li>
                        <li><strong>規劃任務</strong>：為里程碑建立任務、設定負責人</li>
                        <li><strong>追蹤進度</strong>：透過「儀表板」掌握整體狀態</li>
                        <li><strong>審核變更</strong>：在「審核中心」處理延期申請</li>
                        <li><strong>產出報告</strong>：透過「報告」匯出 PDF</li>
                      </ol>
                      <p className="text-xs text-muted-foreground border-l-2 border-primary/30 pl-2 mt-2">
                        提示：「我的任務」中可透過卡片快速填寫日誌與更新進度
                      </p>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="member">
                  <AccordionTrigger className="text-sm">團隊成員</AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-2 text-sm leading-relaxed">
                      <p>日常操作集中在「我的任務」頁面：</p>
                      <ol className="list-decimal ml-5 space-y-1">
                        <li><strong>查看任務</strong>：系統自動顯示指派的任務</li>
                        <li><strong>填寫日誌</strong>：點擊任務卡片新增工作紀錄</li>
                        <li><strong>管理子任務</strong>：可新增 / 刪除子任務</li>
                        <li><strong>申請延期</strong>：提交延期申請由 PM 審核</li>
                      </ol>
                      <p className="text-xs text-muted-foreground border-l-2 border-primary/30 pl-2 mt-2">
                        提示：狀態燈號依起迄日期自動判定，無需手動設定
                      </p>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="executive" className="border-b-0">
                  <AccordionTrigger className="text-sm">主管（Executive）</AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-2 text-sm leading-relaxed">
                      <p>主要透過以下頁面掌握專案狀態：</p>
                      <ol className="list-decimal ml-5 space-y-1">
                        <li><strong>儀表板</strong>：總覽所有專案進度與風險</li>
                        <li><strong>報告</strong>：查看統計圖表與摘要</li>
                        <li><strong>審核中心</strong>：審批延期申請</li>
                        <li><strong>專案看板</strong>：深入查看專案詳情</li>
                      </ol>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </CardContent>
          </Card>

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
                      <li>可新增 / 編輯專案、設定 RACI 角色</li>
                      <li>支援草稿功能，可稍後繼續編輯</li>
                    </ul>
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

                <AccordionItem value="approvals" className="border-b-0">
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
              </Accordion>
            </CardContent>
          </Card>
        </div>

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
              <AccordionItem value="faq-progress">
                <AccordionTrigger className="text-sm">進度百分比是怎麼計算的？</AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-2 text-sm leading-relaxed">
                    <p>系統採用由下而上的四層進度計算：</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                      <span className="rounded-md bg-muted px-2 py-1">子任務</span>
                      <span>→</span>
                      <span className="rounded-md bg-muted px-2 py-1">父任務（加權平均）</span>
                      <span>→</span>
                      <span className="rounded-md bg-muted px-2 py-1">里程碑（平均）</span>
                      <span>→</span>
                      <span className="rounded-md bg-muted px-2 py-1">專案（平均）</span>
                    </div>
                    <ul className="list-disc ml-5 space-y-1 mt-2">
                      <li>子任務：工作日誌覆蓋天數 / 任務工期天數</li>
                      <li>父任務：子任務進度加權平均（依工期天數）</li>
                      <li>里程碑：所屬任務（不含子任務）進度平均</li>
                      <li>專案：所有里程碑的進度平均</li>
                    </ul>
                    <p className="text-xs text-muted-foreground">已完成的任務進度自動設為 100%。</p>
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="faq-status">
                <AccordionTrigger className="text-sm">任務狀態燈號代表什麼？</AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-2 text-sm">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="flex items-center gap-2 rounded-md border px-3 py-2">
                        <span className="h-2.5 w-2.5 rounded-full bg-green-500 shrink-0" />
                        <div><strong>正常</strong> <span className="text-muted-foreground">— 進度符合預期</span></div>
                      </div>
                      <div className="flex items-center gap-2 rounded-md border px-3 py-2">
                        <span className="h-2.5 w-2.5 rounded-full bg-yellow-500 shrink-0" />
                        <div><strong>注意</strong> <span className="text-muted-foreground">— 接近截止但落後</span></div>
                      </div>
                      <div className="flex items-center gap-2 rounded-md border px-3 py-2">
                        <span className="h-2.5 w-2.5 rounded-full bg-red-500 shrink-0" />
                        <div><strong>逾期</strong> <span className="text-muted-foreground">— 已超過結束日期</span></div>
                      </div>
                      <div className="flex items-center gap-2 rounded-md border px-3 py-2">
                        <span className="h-2.5 w-2.5 rounded-full bg-blue-500 shrink-0" />
                        <div><strong>已完成</strong> <span className="text-muted-foreground">— 任務已標記完成</span></div>
                      </div>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="faq-delay">
                <AccordionTrigger className="text-sm">如何申請延期？</AccordionTrigger>
                <AccordionContent>
                  <ol className="list-decimal ml-5 space-y-1 text-sm leading-relaxed">
                    <li>進入「我的任務」，點擊要延期的任務卡片</li>
                    <li>在任務詳情中點擊「申請延期」</li>
                    <li>填寫新的結束日期與延期原因</li>
                    <li>提交後，PM / 主管會在「審核中心」看到此申請</li>
                    <li>審核通過後，結束日期自動更新</li>
                  </ol>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="faq-subtask">
                <AccordionTrigger className="text-sm">子任務如何運作？</AccordionTrigger>
                <AccordionContent>
                  <ul className="list-disc ml-5 space-y-1 text-sm leading-relaxed">
                    <li>在任務卡片中點擊「+」新增子任務</li>
                    <li>子任務有獨立的起迄日期、進度與工作日誌</li>
                    <li>父任務進度依子任務工期天數加權自動計算</li>
                    <li>子任務預設收合，點擊箭頭可展開</li>
                    <li>填寫父任務日誌時可「帶入子任務紀錄」快速彙整</li>
                  </ul>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="faq-auto-status">
                <AccordionTrigger className="text-sm">任務會自動變更狀態嗎？</AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-2 text-sm leading-relaxed">
                    <p>系統會依據以下規則自動調整：</p>
                    <ul className="list-disc ml-5 space-y-1">
                      <li>開始日期已到 + 無依賴 → 自動「進行中」</li>
                      <li>開始日期已到 + 依賴未完成 + 無日誌 → 「受阻」</li>
                      <li>開始日期已到 + 依賴未完成 + 有日誌 → 維持「進行中」</li>
                      <li>開始日期改到未來 + 進度 0 → 回到「待辦」</li>
                    </ul>
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="faq-raci" className="border-b-0">
                <AccordionTrigger className="text-sm">什麼是 RACI？如何指派角色？</AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-2 text-sm leading-relaxed">
                    <p>RACI 是責任分配矩陣，明確每個人在專案中的角色：</p>
                    <ul className="list-disc ml-5 space-y-1">
                      <li><strong>A（Accountable）</strong>：最終負責人，通常一位</li>
                      <li><strong>R（Responsible）</strong>：實際執行工作的人</li>
                      <li><strong>C（Consulted）</strong>：提供意見與專業知識</li>
                      <li><strong>I（Informed）</strong>：需要被告知進展</li>
                    </ul>
                    <p className="text-xs text-muted-foreground border-l-2 border-primary/30 pl-2">
                      在編輯專案的「團隊」頁籤中，為每位成員選擇對應的 RACI 角色即可
                    </p>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}
