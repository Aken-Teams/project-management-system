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
              系統採用 <strong>ARCI 模型</strong>管理團隊角色，清楚劃分每位成員的權責：
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
                      <li>可新增 / 編輯專案、設定 ARCI 角色</li>
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
              {/* 1 */}
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
                      <li>子任務進度：工作日誌覆蓋天數 / 任務工期天數</li>
                      <li>父任務進度：子任務進度的加權平均（依工期天數加權）</li>
                      <li>里程碑進度：所屬父任務（不含子任務）進度平均</li>
                      <li>專案進度：所有里程碑的進度平均</li>
                    </ul>
                    <p className="text-xs text-muted-foreground">已完成的任務進度自動設為 100%。</p>
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* 2 */}
              <AccordionItem value="faq-status">
                <AccordionTrigger className="text-sm">任務狀態燈號代表什麼？</AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-2 text-sm">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="flex items-center gap-2 rounded-md border px-3 py-2">
                        <span className="h-2.5 w-2.5 rounded-full bg-blue-500 shrink-0" />
                        <div><strong>正常</strong> <span className="text-muted-foreground">— 進度符合預期</span></div>
                      </div>
                      <div className="flex items-center gap-2 rounded-md border px-3 py-2">
                        <span className="h-2.5 w-2.5 rounded-full bg-amber-500 shrink-0" />
                        <div><strong>注意</strong> <span className="text-muted-foreground">— 接近截止但落後</span></div>
                      </div>
                      <div className="flex items-center gap-2 rounded-md border px-3 py-2">
                        <span className="h-2.5 w-2.5 rounded-full bg-red-500 shrink-0" />
                        <div><strong>逾期</strong> <span className="text-muted-foreground">— 已超過結束日期</span></div>
                      </div>
                      <div className="flex items-center gap-2 rounded-md border px-3 py-2">
                        <span className="h-2.5 w-2.5 rounded-full bg-green-500 shrink-0" />
                        <div><strong>已完成</strong> <span className="text-muted-foreground">— 任務已標記完成</span></div>
                      </div>
                      <div className="flex items-center gap-2 rounded-md border px-3 py-2">
                        <span className="h-2.5 w-2.5 rounded-full bg-orange-500 shrink-0" />
                        <div><strong>逾期未開始</strong> <span className="text-muted-foreground">— 超過開始日仍未動工</span></div>
                      </div>
                      <div className="flex items-center gap-2 rounded-md border px-3 py-2">
                        <span className="h-2.5 w-2.5 rounded-full bg-gray-300 shrink-0" />
                        <div><strong>未開始</strong> <span className="text-muted-foreground">— 尚未到開始日期</span></div>
                      </div>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* 3 */}
              <AccordionItem value="faq-delay">
                <AccordionTrigger className="text-sm">如何申請延期？審核流程是什麼？</AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-2 text-sm leading-relaxed">
                    <p><strong>提交延期：</strong></p>
                    <ol className="list-decimal ml-5 space-y-1">
                      <li>進入「我的任務」，點擊要延期的任務卡片</li>
                      <li>在任務詳情中點擊「申請延期」</li>
                      <li>填寫新的結束日期、延期原因與所需支援</li>
                      <li>提交後，PM / 主管會在「審核中心」看到此申請</li>
                    </ol>
                    <p className="mt-2"><strong>審核流程：</strong></p>
                    <ul className="list-disc ml-5 space-y-1">
                      <li>審核者可核准或駁回，並附上審核備註</li>
                      <li>核准後系統自動更新里程碑日期，並<strong>連動調整</strong>後續里程碑與任務的時程</li>
                      <li>PM 也可直接在里程碑旁點「提出延期」調整日期</li>
                    </ul>
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* 4 */}
              <AccordionItem value="faq-subtask">
                <AccordionTrigger className="text-sm">子任務如何運作？天數配額是什麼？</AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-2 text-sm leading-relaxed">
                    <ul className="list-disc ml-5 space-y-1">
                      <li>在任務卡片中點擊「+」即可新增子任務</li>
                      <li>子任務有獨立的起迄日期、進度與工作日誌</li>
                      <li>子任務的天數總和不得超過父任務的工期天數（天數配額）</li>
                      <li>父任務進度會依子任務工期天數加權自動計算</li>
                      <li>子任務預設收合，點擊箭頭可展開查看</li>
                    </ul>
                    <p className="text-xs text-muted-foreground border-l-2 border-primary/30 pl-2 mt-2">
                      填寫父任務日誌時可點擊「帶入子任務紀錄」，選擇原始資料或 AI 彙整快速產生日誌
                    </p>
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* 5 */}
              <AccordionItem value="faq-auto-status">
                <AccordionTrigger className="text-sm">任務狀態會自動變更嗎？</AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-2 text-sm leading-relaxed">
                    <p>是的，系統會依據以下規則自動調整任務狀態：</p>
                    <ul className="list-disc ml-5 space-y-1">
                      <li>開始日期已到 + 無依賴（或依賴已完成）→ 自動「進行中」</li>
                      <li>開始日期已到 + 依賴未完成 + 無工作紀錄 → 「受阻」</li>
                      <li>開始日期已到 + 依賴未完成 + 有工作紀錄 → 維持「進行中」（視為前期準備）</li>
                      <li>開始日期改到未來 + 進度為 0 → 回到「待辦」</li>
                      <li>手動標記完成後，進度自動設為 100%</li>
                    </ul>
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* 6 */}
              <AccordionItem value="faq-raci">
                <AccordionTrigger className="text-sm">什麼是 ARCI？如何指派角色？</AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-2 text-sm leading-relaxed">
                    <p>ARCI 是責任分配矩陣，明確每個人在專案中的角色：</p>
                    <ul className="list-disc ml-5 space-y-1">
                      <li><strong>A（Accountable，當責）</strong>：最終負責人，通常一位，等同 PM</li>
                      <li><strong>R（Responsible，負責）</strong>：實際執行工作的人</li>
                      <li><strong>C（Consulted，諮詢）</strong>：提供意見與專業知識</li>
                      <li><strong>I（Informed，知會）</strong>：需要被告知進展</li>
                    </ul>
                    <p className="text-xs text-muted-foreground border-l-2 border-primary/30 pl-2">
                      在編輯專案的「團隊」頁籤中為成員選擇角色。新增成員時可透過搜尋自動帶入姓名、職稱與組織
                    </p>
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* 7 */}
              <AccordionItem value="faq-create-project">
                <AccordionTrigger className="text-sm">如何建立新專案？可以存草稿嗎？</AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-2 text-sm leading-relaxed">
                    <p>建立專案有兩種模式：</p>
                    <ul className="list-disc ml-5 space-y-1">
                      <li><strong>手動模式</strong>：逐步填寫專案資訊、團隊、里程碑、任務與風險</li>
                      <li><strong>AI 輔助模式</strong>：以自然語言描述需求，AI 自動建議專案結構</li>
                    </ul>
                    <p className="mt-1">任何階段都可以點擊「儲存草稿」暫存目前的編輯狀態，下次進入新增專案頁面時可從草稿列表載入繼續編輯。</p>
                    <p className="text-xs text-muted-foreground border-l-2 border-primary/30 pl-2">
                      草稿會記錄建立模式（手動 / AI），每位使用者的草稿互相獨立
                    </p>
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* 8 */}
              <AccordionItem value="faq-worklog">
                <AccordionTrigger className="text-sm">工作日誌怎麼填寫？支援語音輸入嗎？</AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-2 text-sm leading-relaxed">
                    <ol className="list-decimal ml-5 space-y-1">
                      <li>在「我的任務」點擊任務卡片開啟任務詳情</li>
                      <li>選擇日誌日期（預設為今天），在文字框輸入工作內容</li>
                      <li>點擊送出即完成紀錄</li>
                    </ol>
                    <p className="mt-1"><strong>進階功能：</strong></p>
                    <ul className="list-disc ml-5 space-y-1">
                      <li>支援<strong>語音輸入</strong>（麥克風圖示），自動辨識繁體中文</li>
                      <li>有子任務時可點「帶入子任務紀錄」一鍵匯入（原始資料 / AI 彙整）</li>
                      <li>已送出的日誌可事後<strong>編輯</strong>或<strong>刪除</strong></li>
                    </ul>
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* 9 */}
              <AccordionItem value="faq-gantt">
                <AccordionTrigger className="text-sm">甘特圖怎麼看？可以做什麼？</AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-2 text-sm leading-relaxed">
                    <p>甘特圖以時間軸方式呈現專案排程：</p>
                    <ul className="list-disc ml-5 space-y-1">
                      <li>里程碑顯示為區段，任務顯示為橫條</li>
                      <li>任務顏色對應狀態（藍=進行中、綠=完成、紅=逾期、灰=待辦）</li>
                      <li>可切換顯示<strong>任務依賴關係</strong>（連接線）</li>
                      <li>可切換顯示<strong>基準線</strong>（金色線條表示原始排程，與實際排程對比）</li>
                      <li>滑鼠停留在任務上可查看詳細日期</li>
                    </ul>
                    <p className="text-xs text-muted-foreground border-l-2 border-primary/30 pl-2">
                      透過頂部下拉選單可切換不同專案的甘特圖
                    </p>
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* 10 */}
              <AccordionItem value="faq-roles" className="border-b-0">
                <AccordionTrigger className="text-sm">三種系統角色有什麼差異？</AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-2 text-sm leading-relaxed">
                    <p>系統有三種登入角色，各自可使用的功能不同：</p>
                    <div className="overflow-x-auto mt-1">
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-1.5 pr-2 font-medium">功能</th>
                            <th className="text-center py-1.5 px-2 font-medium">PM</th>
                            <th className="text-center py-1.5 px-2 font-medium">成員</th>
                            <th className="text-center py-1.5 px-2 font-medium">主管</th>
                          </tr>
                        </thead>
                        <tbody className="text-muted-foreground">
                          <tr className="border-b border-border/50"><td className="py-1.5 pr-2">儀表板</td><td className="text-center">&#10003;</td><td className="text-center">—</td><td className="text-center">&#10003;</td></tr>
                          <tr className="border-b border-border/50"><td className="py-1.5 pr-2">我的任務</td><td className="text-center">&#10003;</td><td className="text-center">&#10003;</td><td className="text-center">—</td></tr>
                          <tr className="border-b border-border/50"><td className="py-1.5 pr-2">建立 / 編輯專案</td><td className="text-center">&#10003;</td><td className="text-center">—</td><td className="text-center">—</td></tr>
                          <tr className="border-b border-border/50"><td className="py-1.5 pr-2">審核延期申請</td><td className="text-center">&#10003;</td><td className="text-center">—</td><td className="text-center">&#10003;</td></tr>
                          <tr className="border-b border-border/50"><td className="py-1.5 pr-2">報告與 PDF 匯出</td><td className="text-center">&#10003;</td><td className="text-center">—</td><td className="text-center">&#10003;</td></tr>
                          <tr><td className="py-1.5 pr-2">專案看板（瀏覽）</td><td className="text-center">&#10003;</td><td className="text-center">&#10003;</td><td className="text-center">&#10003;</td></tr>
                        </tbody>
                      </table>
                    </div>
                    <p className="text-xs text-muted-foreground border-l-2 border-primary/30 pl-2 mt-2">
                      PM 在「我的任務」中會看到所有任務並進入管理模式；成員只看到指派給自己的任務
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
