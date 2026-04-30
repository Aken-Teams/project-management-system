'use client'

import React, { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { CheckCircle2, XCircle, ChevronDown, ChevronRight } from 'lucide-react'
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

const PERMISSIONS: { category: string; color: string; rows: PermissionRow[] }[] = [
  {
    category: '儀表板',
    color: 'cyan',
    rows: [
      { label: '查看儀表板', description: '瀏覽專案統計、燈號分佈、風險列表等總覽', member: 'project', executive: true, pm: true, admin: true },
      { label: '查看待審核項目', description: '進入審核中心處理延期申請', member: false, executive: true, pm: true, admin: true },
    ],
  },
  {
    category: '專案管理',
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
    category: '工作日誌',
    color: 'orange',
    rows: [
      { label: '撰寫工作日誌', description: '在任務下新增工作紀錄，記錄工時與內容', member: 'project', executive: false, pm: 'project', admin: true },
      { label: '查看工作日誌', description: '瀏覽任務的工作紀錄與歷史', member: 'project', executive: true, pm: 'project', admin: true },
      { label: '編輯工作日誌', description: '修改自己撰寫的工作紀錄', member: 'project', executive: false, pm: 'project', admin: true },
    ],
  },
  {
    category: '甘特圖',
    color: 'teal',
    rows: [
      { label: '查看甘特圖', description: '瀏覽專案時程甘特圖與基線比較', member: 'project', executive: true, pm: 'project', admin: true },
      { label: '拖拉調整時程', description: '在甘特圖上拖拉調整任務起訖日期', member: false, executive: false, pm: 'project', admin: true },
    ],
  },
  {
    category: '預算',
    color: 'emerald',
    rows: [
      { label: '查看預算', description: '查看專案預算總覽與設備清單', member: false, executive: 'department', pm: 'project', admin: true },
      { label: '編輯預算', description: '新增/修改設備清單與費用明細', member: false, executive: false, pm: 'project', admin: true },
      { label: '影像解析預算', description: '透過 OCR 從圖片匯入預算表格資料', member: false, executive: false, pm: 'project', admin: true },
    ],
  },
  {
    category: '團隊',
    color: 'violet',
    rows: [
      { label: '查看團隊成員', description: '瀏覽專案團隊成員與 RACI 角色分配', member: 'project', executive: true, pm: 'project', admin: true },
      { label: '管理團隊成員', description: '新增/移除團隊成員、設定 RACI 角色', member: false, executive: false, pm: 'project', admin: true },
    ],
  },
  {
    category: '風險管理',
    color: 'red',
    rows: [
      { label: '查看風險', description: '瀏覽專案風險列表與處理狀態', member: 'project', executive: true, pm: 'project', admin: true },
      { label: '管理風險', description: '新增/編輯/關閉風險項目與緩解措施', member: false, executive: false, pm: 'project', admin: true },
    ],
  },
  {
    category: '延期申請',
    color: 'rose',
    rows: [
      { label: '提交延期申請', description: '發起里程碑延期或日期調整申請', member: 'project', executive: false, pm: 'project', admin: true },
      { label: '審核延期申請', description: '核准或駁回延期申請', member: false, executive: true, pm: true, admin: true },
      { label: '處理協助需求', description: '回覆並解決延期申請中標記的協助請求', member: false, executive: true, pm: true, admin: true },
    ],
  },
  {
    category: '週報',
    color: 'amber',
    rows: [
      { label: '填寫週報', description: '按里程碑填寫每週進度更新、狀態與阻礙事項', member: false, executive: false, pm: 'project', admin: true },
      { label: '查看週報', description: '瀏覽專案的週報更新紀錄', member: 'project', executive: true, pm: 'project', admin: true },
    ],
  },
  {
    category: '報告與匯出',
    color: 'pink',
    rows: [
      { label: '匯出 PDF 報告', description: '產生並下載專案 PDF 報告', member: 'project', executive: true, pm: 'project', admin: true },
      { label: '寄送報告郵件', description: '以 Email 發送報告給指定收件人', member: false, executive: true, pm: 'project', admin: true },
      { label: '匯出 Excel', description: '批次匯出所有專案資料為 Excel 檔案', member: false, executive: false, pm: false, admin: true },
    ],
  },
  {
    category: '通知',
    color: 'cyan',
    rows: [
      { label: '接收系統通知', description: '接收任務指派、逾期提醒、延期審核結果等通知', member: true, executive: true, pm: true, admin: true },
      { label: '標記已讀', description: '將通知標記為已讀或全部已讀', member: true, executive: true, pm: true, admin: true },
    ],
  },
  {
    category: '後台管理',
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

const ROLES = [
  { key: 'member', label: '團隊成員', color: 'bg-gray-100 text-gray-700', description: '執行被指派的任務，撰寫工作日誌，可提交延期申請。僅能查看自己參與的專案。' },
  { key: 'executive', label: '主管', color: 'bg-purple-100 text-purple-700', description: '總覽所有專案狀態與報告，審核延期申請。以唯讀為主，不直接修改專案。' },
  { key: 'pm', label: '專案經理', color: 'bg-blue-100 text-blue-700', description: '對負責的專案有完整操作權：規劃里程碑、分配任務、填寫週報、管理風險與預算。' },
  { key: 'admin', label: '系統管理員', color: 'bg-red-100 text-red-700', description: '最高權限，可操作所有專案，並管理使用者帳號、系統設定與排程配置。' },
] as const

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

export default function AdminRolesPage() {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const toggle = (cat: string) => setCollapsed(prev => {
    const next = new Set(prev)
    next.has(cat) ? next.delete(cat) : next.add(cat)
    return next
  })

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold">角色權限</h2>
        <p className="text-sm text-muted-foreground mt-0.5">各角色在系統中可查看與操作的功能範圍</p>
      </div>

      {/* Role cards */}
      <div className="grid grid-cols-4 gap-3">
        {ROLES.map(role => (
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

      {/* Note */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground bg-muted/40 rounded-md px-3 py-2.5 flex-wrap">
        <span className="inline-flex items-center gap-1"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> 綠色：完整存取</span>
        <span className="text-muted-foreground/40">|</span>
        <span className="inline-flex items-center gap-1"><CheckCircle2 className="h-4 w-4 text-violet-500" /> 紫色：僅限部門專案</span>
        <span className="text-muted-foreground/40">|</span>
        <span className="inline-flex items-center gap-1"><CheckCircle2 className="h-4 w-4 text-orange-500" /> 橙色：僅限自己負責的專案</span>
      </div>

      {/* Permission table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground w-48">功能</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground flex-1">說明</th>
                  {ROLES.map(role => (
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
                        </span>
                      </td>
                    </tr>
                    {!collapsed.has(section.category) && section.rows.map(row => (
                      <tr key={row.label} className="border-b last:border-0 hover:bg-muted/10">
                        <td className="px-4 py-2.5 font-medium">{row.label}</td>
                        <td className="px-4 py-2.5 text-muted-foreground text-xs">{row.description}</td>
                        {ROLES.map(role => (
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
  )
}
