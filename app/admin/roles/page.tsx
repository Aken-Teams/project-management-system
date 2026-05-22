'use client'

import React, { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CheckCircle2, XCircle, ChevronDown, ChevronRight, Shield, Users, Info } from 'lucide-react'
import { cn } from '@/lib/utils'

type PermValue = boolean | 'project' | 'department'

interface PermissionRow {
  label: string
  description: string
  member: PermValue
  executive: PermValue
  pm: PermValue
  admin: PermValue
}

const CAT_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  cyan:    { bg: 'bg-cyan-50',    text: 'text-cyan-700',    border: 'border-cyan-400' },
  blue:    { bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-400' },
  indigo:  { bg: 'bg-indigo-50',  text: 'text-indigo-700',  border: 'border-indigo-400' },
  orange:  { bg: 'bg-orange-50',  text: 'text-orange-700',  border: 'border-orange-400' },
  teal:    { bg: 'bg-teal-50',    text: 'text-teal-700',    border: 'border-teal-400' },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-400' },
  violet:  { bg: 'bg-violet-50',  text: 'text-violet-700',  border: 'border-violet-400' },
  red:     { bg: 'bg-red-50',     text: 'text-red-700',     border: 'border-red-400' },
  rose:    { bg: 'bg-rose-50',    text: 'text-rose-700',    border: 'border-rose-400' },
  amber:   { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-400' },
  pink:    { bg: 'bg-pink-50',    text: 'text-pink-700',    border: 'border-pink-400' },
  slate:   { bg: 'bg-slate-100',  text: 'text-slate-600',   border: 'border-slate-400' },
}

const PERMISSIONS: { category: string; definition: string; color: string; rows: PermissionRow[] }[] = [
  {
    category: '儀表板',
    definition: '專案總覽與待辦事項入口',
    color: 'cyan',
    rows: [
      { label: '查看儀表板', description: '瀏覽專案統計、燈號分佈、風險列表等總覽', member: 'project', executive: true, pm: true, admin: true },
      { label: '查看待審核項目', description: '進入審核中心處理延期申請', member: false, executive: true, pm: true, admin: true },
    ],
  },
  {
    category: '專案管理',
    definition: '專案的建立、檢視與維護',
    color: 'blue',
    rows: [
      { label: '查看專案', description: '瀏覽專案列表與詳細資訊（含 SMART 目標）', member: 'project', executive: true, pm: true, admin: true },
      { label: '建立專案', description: '新增專案、設定基本資訊與 SMART 目標', member: false, executive: false, pm: true, admin: true },
      { label: '編輯專案', description: '修改專案資訊、SMART 目標、KPI 指標等', member: false, executive: false, pm: 'project', admin: true },
      { label: '刪除專案', description: '永久刪除專案及所有相關資料', member: false, executive: false, pm: 'project', admin: true },
      { label: '建立分享連結', description: '產生專案唯讀公開連結（含到期時間）', member: false, executive: false, pm: 'project', admin: true },
    ],
  },
  {
    category: '里程碑與任務',
    definition: '時程規劃、任務指派與進度追蹤',
    color: 'indigo',
    rows: [
      { label: '查看里程碑與任務', description: '瀏覽時間軸表格中的里程碑、任務與子任務', member: 'project', executive: true, pm: 'project', admin: true },
      { label: '建立/編輯里程碑', description: '新增里程碑、修改名稱與日期、批次完成', member: false, executive: false, pm: 'project', admin: true },
      { label: '建立/編輯任務', description: '新增任務與子任務、指派人員、修改狀態與進度', member: 'project', executive: false, pm: 'project', admin: true },
      { label: '拖放排序', description: '在時間軸表格中拖放調整里程碑與任務順序', member: false, executive: false, pm: 'project', admin: true },
      { label: '查看我的任務', description: '在「我的任務」頁面查看被指派的任務清單', member: true, executive: true, pm: true, admin: true },
    ],
  },
  {
    category: '工作日誌與週報',
    definition: '任務執行紀錄與每週進度自動彙整',
    color: 'orange',
    rows: [
      { label: '撰寫工作日誌', description: '在任務下新增工作紀錄，記錄工時與內容', member: 'project', executive: false, pm: 'project', admin: true },
      { label: '查看工作日誌', description: '瀏覽任務的工作紀錄與歷史', member: 'project', executive: true, pm: 'project', admin: true },
      { label: '編輯工作日誌', description: '修改自己撰寫的工作紀錄', member: 'project', executive: false, pm: 'project', admin: true },
      { label: '查看週報摘要', description: '瀏覽由工作日誌自動彙整的每週進度摘要', member: 'project', executive: true, pm: 'project', admin: true },
    ],
  },
  {
    category: '甘特圖',
    definition: '專案時程視覺化呈現與基線比較',
    color: 'teal',
    rows: [
      { label: '查看甘特圖', description: '瀏覽專案時程甘特圖，包含計畫、實際進度與延期標示', member: 'project', executive: true, pm: 'project', admin: true },
    ],
  },
  {
    category: '預算',
    definition: '專案費用規劃與設備清單管理',
    color: 'emerald',
    rows: [
      { label: '查看預算', description: '查看專案預算總覽與設備清單', member: false, executive: 'department', pm: 'project', admin: true },
      { label: '編輯預算', description: '新增/修改設備清單與費用明細', member: false, executive: false, pm: 'project', admin: true },
    ],
  },
  {
    category: '團隊',
    definition: '專案人員組成與 SAPRCI 角色分配',
    color: 'violet',
    rows: [
      { label: '查看團隊成員', description: '瀏覽專案團隊成員與 SAPRCI 角色分配', member: 'project', executive: true, pm: 'project', admin: true },
      { label: '管理團隊成員', description: '新增/移除團隊成員、設定 SAPRCI 角色', member: false, executive: false, pm: 'project', admin: true },
    ],
  },
  {
    category: '風險管理',
    definition: '專案風險識別、評估與緩解',
    color: 'red',
    rows: [
      { label: '查看風險', description: '瀏覽專案風險列表與處理狀態', member: 'project', executive: true, pm: 'project', admin: true },
      { label: '管理風險', description: '新增/編輯/關閉風險項目與緩解措施', member: false, executive: false, pm: 'project', admin: true },
    ],
  },
  {
    category: '延期申請',
    definition: '里程碑日期調整的申請與審核流程',
    color: 'rose',
    rows: [
      { label: '提交延期申請', description: '發起里程碑延期或日期調整申請', member: 'project', executive: false, pm: 'project', admin: true },
      { label: '審核延期申請', description: '核准或駁回延期申請', member: false, executive: true, pm: true, admin: true },
      { label: '處理協助需求', description: '回覆並解決延期申請中標記的協助請求', member: false, executive: true, pm: true, admin: true },
    ],
  },
  {
    category: '報告與匯出',
    definition: '專案報告產出與資料匯出',
    color: 'pink',
    rows: [
      { label: '查看報告', description: '檢視專案進度與統計分析', member: true, executive: true, pm: true, admin: true },
      { label: '匯出 PDF 報告', description: '產生並下載專案 PDF 報告', member: true, executive: true, pm: true, admin: true },
      { label: '寄送報告郵件', description: '以 Email 發送報告給指定收件人', member: false, executive: false, pm: true, admin: true },
      { label: '匯出 Excel', description: '批次匯出所有專案資料為 Excel 檔案', member: true, executive: true, pm: true, admin: true },
    ],
  },
  {
    category: '通知',
    definition: '系統訊息接收與管理',
    color: 'cyan',
    rows: [
      { label: '接收系統通知', description: '接收任務指派、逾期提醒、延期審核結果等通知', member: true, executive: true, pm: true, admin: true },
      { label: '標記已讀', description: '將通知標記為已讀或全部已讀', member: true, executive: true, pm: true, admin: true },
    ],
  },
  {
    category: '後台管理',
    definition: '系統層級設定與使用者管理',
    color: 'slate',
    rows: [
      { label: '存取管理後台', description: '進入後台管理頁面', member: false, executive: false, pm: false, admin: true },
      { label: '管理使用者', description: '修改使用者角色、部門與帳號資訊', member: false, executive: false, pm: false, admin: true },
      { label: '設定專案類型', description: '管理專案類型與層級分類設定', member: false, executive: false, pm: false, admin: true },
      { label: '設定里程碑範本', description: '自訂各專案類型的里程碑預設結構', member: false, executive: false, pm: false, admin: true },
      { label: '設定通知排程', description: '調整系統自動通知與報告寄送排程', member: false, executive: false, pm: false, admin: true },
      { label: '查看排程紀錄', description: '查看 cron 任務執行紀錄與結果', member: false, executive: false, pm: false, admin: true },
    ],
  },
]

const SYSTEM_ROLES = [
  { key: 'member', label: '團隊成員', color: 'bg-gray-100 text-gray-700', description: '執行被指派的任務，撰寫工作日誌，可提交延期申請。僅能查看自己參與的專案。' },
  { key: 'executive', label: '主管', color: 'bg-purple-100 text-purple-700', description: '總覽所有專案狀態與報告，審核延期申請。以唯讀為主，不直接修改專案。' },
  { key: 'pm', label: '專案經理', color: 'bg-blue-100 text-blue-700', description: '對負責的專案有完整操作權：規劃里程碑、分配任務、填寫週報、管理風險與預算。' },
  { key: 'admin', label: '系統管理員', color: 'bg-red-100 text-red-700', description: '最高權限，可操作所有專案，並管理使用者帳號、系統設定與排程配置。' },
] as const

const PROJECT_ROLES = [
  { key: 'S', label: 'Sign-off 簽核者', color: 'bg-emerald-100 text-emerald-700 border-emerald-300', badge: '最高審核權限', description: '負責審核延期申請，可核准或駁回。每個專案可有多位 S 角色，需全部通過才算核准。' },
  { key: 'A', label: 'Accountable 當責者', color: 'bg-amber-100 text-amber-700 border-amber-300', description: '對專案成果負最終責任，通常為專案負責人或部門主管。可查看所有專案資訊與進度。' },
  { key: 'P', label: 'Procurement 採購者', color: 'bg-orange-100 text-orange-700 border-orange-300', description: '負責專案相關的設備採購與供應商管理。可查看與編輯預算設備清單。' },
  { key: 'R', label: 'Responsible 執行者', color: 'bg-blue-100 text-blue-700 border-blue-300', description: '實際執行任務的成員，負責填寫工作日誌、回報進度、管理子任務。是任務執行的核心角色。' },
  { key: 'C', label: 'Consulted 諮詢者', color: 'bg-violet-100 text-violet-700 border-violet-300', description: '提供專業意見與技術支援，在決策前被徵詢的專家。可查看專案資訊但不直接操作。' },
  { key: 'I', label: 'Informed 知會者', color: 'bg-slate-100 text-slate-700 border-slate-300', description: '需被告知專案進度與決策結果，但不直接參與執行。僅接收通知與查看。' },
] as const

interface ProjectPermRow {
  label: string
  S: boolean
  A: boolean
  P: boolean
  R: boolean
  C: boolean
  I: boolean
}

const PROJECT_PERMISSIONS: { category: string; rows: ProjectPermRow[] }[] = [
  {
    category: '任務與甘特圖',
    rows: [
      { label: '查看任務與甘特圖',              S: true,  A: true,  P: true,  R: true,  C: true,  I: true },
      { label: '建立/編輯任務與子任務',          S: false, A: true,  P: false, R: false, C: false, I: false },
      { label: '填寫工作日誌',                   S: false, A: true,  P: false, R: true,  C: false, I: false },
      { label: '編輯/刪除自己的工作日誌',        S: false, A: true,  P: false, R: true,  C: false, I: false },
      { label: '查看 R 成員週報',                S: false, A: true,  P: false, R: false, C: false, I: false },
    ],
  },
  {
    category: '預算與採購',
    rows: [
      { label: '查看預算與設備清單',             S: false, A: true,  P: true,  R: false, C: false, I: false },
      { label: '編輯設備清單',                   S: false, A: false, P: true,  R: false, C: false, I: false },
    ],
  },
  {
    category: '延期申請',
    rows: [
      { label: '提交延期申請',                   S: false, A: true,  P: false, R: false, C: false, I: false },
      { label: '審核延期申請（核准/駁回）',       S: true,  A: false, P: false, R: false, C: false, I: false },
    ],
  },
  {
    category: '通知與資訊',
    rows: [
      { label: '接收專案相關通知',               S: true,  A: true,  P: true,  R: true,  C: true,  I: true },
      { label: '查看專案資訊與團隊',             S: true,  A: true,  P: true,  R: true,  C: true,  I: true },
    ],
  },
]

type RoleKey = 'member' | 'executive' | 'pm' | 'admin'

function PermCell({ value }: { value: PermValue }) {
  if (value === 'department') {
    return (
      <div className="flex items-center justify-center" title="僅限部門專案">
        <CheckCircle2 className="h-4 w-4 text-violet-500" />
      </div>
    )
  }
  if (value === 'project') {
    return (
      <div className="flex items-center justify-center" title="僅限負責的專案">
        <CheckCircle2 className="h-4 w-4 text-orange-500" />
      </div>
    )
  }
  if (value) {
    return (
      <div className="flex items-center justify-center">
        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
      </div>
    )
  }
  return (
    <div className="flex items-center justify-center">
      <XCircle className="h-4 w-4 text-muted-foreground/30" />
    </div>
  )
}

function BoolCell({ value }: { value: boolean }) {
  return value
    ? <div className="flex items-center justify-center"><CheckCircle2 className="h-4 w-4 text-emerald-500" /></div>
    : <div className="flex items-center justify-center"><XCircle className="h-4 w-4 text-muted-foreground/30" /></div>
}

export default function AdminRolesPage() {
  const [activeTab, setActiveTab] = useState<'system' | 'project'>('system')

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const toggle = (cat: string) => setCollapsed(prev => {
    const next = new Set(prev)
    next.has(cat) ? next.delete(cat) : next.add(cat)
    return next
  })

  const [projCollapsed, setProjCollapsed] = useState<Set<string>>(new Set())
  const toggleProj = (cat: string) => setProjCollapsed(prev => {
    const next = new Set(prev)
    next.has(cat) ? next.delete(cat) : next.add(cat)
    return next
  })

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h2 className="text-base font-semibold">角色權限</h2>
        <p className="text-sm text-muted-foreground mt-0.5">本系統有兩套獨立的角色機制，點擊下方卡片切換查看</p>
      </div>

      {/* Switchable cards */}
      <div className="grid grid-cols-2 gap-4">
        <button
          className={cn(
            'rounded-lg border-2 p-4 text-left transition-all',
            activeTab === 'system'
              ? 'border-blue-400 bg-blue-50/80 ring-2 ring-blue-200'
              : 'border-muted hover:border-blue-200 hover:bg-blue-50/30',
          )}
          onClick={() => setActiveTab('system')}
        >
          <div className="flex items-center gap-2 font-semibold text-blue-700 text-sm mb-1.5">
            <Shield className="h-4 w-4" /> 系統角色
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            由管理員在「使用者管理」中設定，每人固定一個。控制<span className="font-medium text-foreground">全系統的頁面存取與操作權限</span>。
          </p>
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {SYSTEM_ROLES.map(r => (
              <span key={r.key} className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${r.color}`}>
                {r.label}
              </span>
            ))}
          </div>
        </button>
        <button
          className={cn(
            'rounded-lg border-2 p-4 text-left transition-all',
            activeTab === 'project'
              ? 'border-emerald-400 bg-emerald-50/80 ring-2 ring-emerald-200'
              : 'border-muted hover:border-emerald-200 hover:bg-emerald-50/30',
          )}
          onClick={() => setActiveTab('project')}
        >
          <div className="flex items-center gap-2 font-semibold text-emerald-700 text-sm mb-1.5">
            <Users className="h-4 w-4" /> 專案角色（SAPRCI）
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            由專案經理在建立或編輯專案時指派，同一人在不同專案可擔任不同角色。控制<span className="font-medium text-foreground">該專案內的角色職責</span>。
          </p>
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {PROJECT_ROLES.map(r => (
              <span key={r.key} className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border ${r.color}`}>
                {r.key}
              </span>
            ))}
          </div>
        </button>
      </div>

      {/* ═══ System Roles Content ═══ */}
      {activeTab === 'system' && (
        <div className="space-y-4">
          {/* System role cards */}
          <div className="grid grid-cols-4 gap-3">
            {SYSTEM_ROLES.map(role => (
              <Card key={role.key} className="border">
                <CardContent className="pt-4 pb-3 px-4">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium mb-2 ${role.color}`}>
                    {role.label}
                  </span>
                  <p className="text-xs text-muted-foreground leading-relaxed">{role.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-3 text-xs text-muted-foreground bg-muted/40 rounded-md px-3 py-2.5 flex-wrap">
            <span className="inline-flex items-center gap-1"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> 綠色：完整存取</span>
            <span className="text-muted-foreground/40">|</span>
            <span className="inline-flex items-center gap-1"><CheckCircle2 className="h-4 w-4 text-violet-500" /> 紫色：僅限部門專案</span>
            <span className="text-muted-foreground/40">|</span>
            <span className="inline-flex items-center gap-1"><CheckCircle2 className="h-4 w-4 text-orange-500" /> 橙色：僅限自己負責的專案</span>
          </div>

          {/* System permission table */}
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground w-48">功能</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground flex-1">說明</th>
                      {SYSTEM_ROLES.map(role => (
                        <th key={role.key} className="px-4 py-3 w-28 text-center">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${role.color}`}>
                            {role.label}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {PERMISSIONS.map(section => (
                      <React.Fragment key={section.category}>
                        <tr
                          className="cursor-pointer select-none"
                          onClick={() => toggle(section.category)}
                        >
                          <td colSpan={6} className={cn(
                            'border-l-4 pl-3 pr-4 py-2.5 text-xs font-bold uppercase tracking-widest',
                            CAT_STYLES[section.color].bg,
                            CAT_STYLES[section.color].text,
                            CAT_STYLES[section.color].border,
                          )}>
                            <span className="flex items-center gap-1.5">
                              {collapsed.has(section.category)
                                ? <ChevronRight className="h-3.5 w-3.5" />
                                : <ChevronDown className="h-3.5 w-3.5" />}
                              {section.category}
                              <span className="font-normal normal-case tracking-normal text-[11px] opacity-70 ml-1">— {section.definition}</span>
                            </span>
                          </td>
                        </tr>
                        {!collapsed.has(section.category) && section.rows.map(row => (
                          <tr key={row.label} className="border-b last:border-0 hover:bg-muted/10">
                            <td className="px-4 py-2.5 font-medium">{row.label}</td>
                            <td className="px-4 py-2.5 text-muted-foreground text-xs">{row.description}</td>
                            {SYSTEM_ROLES.map(role => (
                              <td key={role.key} className="px-4 py-2.5">
                                <PermCell value={row[role.key as RoleKey]} />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ═══ Project Roles Content (SAPRCI) ═══ */}
      {activeTab === 'project' && (
        <div className="space-y-4">
          {/* Project role cards */}
          <div className="grid grid-cols-3 gap-3">
            {PROJECT_ROLES.map(role => (
              <Card key={role.key} className="border">
                <CardContent className="pt-4 pb-3 px-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold border ${role.color}`}>
                      {role.key}
                    </span>
                    <span className="text-xs font-medium text-foreground">{role.label}</span>
                    {'badge' in role && role.badge && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 ml-auto">
                        {role.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{role.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Hierarchy note */}
          <div className="flex items-start gap-2 text-xs text-muted-foreground bg-emerald-50/50 border border-emerald-200 rounded-md px-3 py-2.5">
            <Info className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-medium text-foreground">層級順序：</span>
              <span className="font-mono tracking-wider ml-1">S &gt; A &gt; P &gt; R &gt; C &gt; I</span>
              <span className="ml-2">— 同一人在不同專案中可擔任不同角色。我的任務頁面依此順序顯示各角色頁籤。</span>
            </div>
          </div>

          {/* Project permission table */}
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground flex-1">功能</th>
                      {PROJECT_ROLES.map(role => (
                        <th key={role.key} className="px-4 py-3 w-20 text-center">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold border ${role.color}`}>
                            {role.key}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {PROJECT_PERMISSIONS.map(section => (
                      <React.Fragment key={section.category}>
                        <tr
                          className="cursor-pointer select-none"
                          onClick={() => toggleProj(section.category)}
                        >
                          <td colSpan={7} className="border-l-4 border-emerald-400 pl-3 pr-4 py-2.5 text-xs font-bold uppercase tracking-widest bg-emerald-50 text-emerald-700">
                            <span className="flex items-center gap-1.5">
                              {projCollapsed.has(section.category)
                                ? <ChevronRight className="h-3.5 w-3.5" />
                                : <ChevronDown className="h-3.5 w-3.5" />}
                              {section.category}
                            </span>
                          </td>
                        </tr>
                        {!projCollapsed.has(section.category) && section.rows.map(row => (
                          <tr key={row.label} className="border-b last:border-0 hover:bg-muted/10">
                            <td className="px-4 py-2.5 font-medium">{row.label}</td>
                            {PROJECT_ROLES.map(role => (
                              <td key={role.key} className="px-4 py-2.5">
                                <BoolCell value={row[role.key as keyof ProjectPermRow] as boolean} />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Relationship note */}
          <Card className="border-dashed">
            <CardContent className="pt-4 pb-4 px-5">
              <h4 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                <Info className="h-3.5 w-3.5 text-muted-foreground" />
                系統角色 vs 專案角色 — 兩者的關係
              </h4>
              <div className="text-xs text-muted-foreground space-y-1.5 leading-relaxed">
                <p><span className="font-medium text-foreground">互不衝突：</span>系統角色決定你能進入哪些頁面，專案角色決定你在個別專案中扮演什麼職責。兩者獨立運作。</p>
                <p><span className="font-medium text-foreground">舉例：</span>一位「團隊成員」(系統角色) 可以在 A 專案擔任 R 執行者、在 B 專案擔任 S 簽核者。</p>
                <p><span className="font-medium text-foreground">管理員特權：</span>系統管理員 (Admin) 擁有最高權限，不受專案角色限制，可操作所有專案的所有功能。</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
