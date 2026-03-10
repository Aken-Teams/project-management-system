'use client'

import React from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { CheckCircle2, XCircle, Info } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PermissionRow {
  label: string
  description: string
  member: boolean
  executive: boolean
  pm: 'project' | boolean  // 'project' = 僅限負責的專案
  admin: boolean
}

const PERMISSIONS: { category: string; rows: PermissionRow[] }[] = [
  {
    category: '專案',
    rows: [
      { label: '查看所有專案', description: '可瀏覽所有專案的基本資訊', member: false, executive: true, pm: true, admin: true },
      { label: '查看負責專案', description: '只能查看自己被指派的專案', member: true, executive: false, pm: false, admin: false },
      { label: '建立專案', description: '新增新的專案', member: false, executive: false, pm: true, admin: true },
      { label: '編輯專案', description: '修改專案基本資訊、目標、範圍', member: false, executive: false, pm: 'project', admin: true },
      { label: '刪除專案', description: '永久刪除專案及所有相關資料', member: false, executive: false, pm: 'project', admin: true },
    ],
  },
  {
    category: '預算',
    rows: [
      { label: '查看預算', description: '查看專案預算與設備清單', member: false, executive: true, pm: true, admin: true },
      { label: '編輯預算', description: '新增/修改設備清單與費用', member: false, executive: false, pm: 'project', admin: true },
    ],
  },
  {
    category: '團隊',
    rows: [
      { label: '管理團隊成員', description: '新增/移除團隊成員、設定 RACI 角色', member: false, executive: false, pm: 'project', admin: true },
    ],
  },
  {
    category: '風險與延期',
    rows: [
      { label: '管理風險', description: '新增/編輯/關閉風險項目', member: false, executive: false, pm: 'project', admin: true },
      { label: '提交延期申請', description: '提交里程碑延期或調整申請', member: false, executive: false, pm: 'project', admin: true },
      { label: '審核延期申請', description: '核准或駁回延期申請', member: false, executive: true, pm: true, admin: true },
    ],
  },
  {
    category: '報告',
    rows: [
      { label: '匯出報告', description: '產生並下載 PDF 報告', member: false, executive: true, pm: true, admin: true },
      { label: '寄送報告郵件', description: '以 Email 發送週報給指定收件人', member: false, executive: true, pm: true, admin: true },
    ],
  },
  {
    category: '甘特圖',
    rows: [
      { label: '查看甘特圖', description: '瀏覽時程甘特圖', member: true, executive: true, pm: true, admin: true },
    ],
  },
  {
    category: '後台管理',
    rows: [
      { label: '存取管理後台', description: '進入後台管理頁面', member: false, executive: false, pm: false, admin: true },
      { label: '管理使用者', description: '修改使用者角色與部門', member: false, executive: false, pm: false, admin: true },
      { label: '設定里程碑範本', description: '自訂各專案類型的里程碑預設值', member: false, executive: false, pm: false, admin: true },
      { label: '設定通知與報告排程', description: '調整系統自動通知與報告寄送時間', member: false, executive: false, pm: false, admin: true },
    ],
  },
]

const ROLES = [
  { key: 'member', label: '團隊成員', color: 'bg-gray-100 text-gray-700', description: '被指派到專案的執行人員，只能查看自己參與的專案' },
  { key: 'executive', label: '主管', color: 'bg-purple-100 text-purple-700', description: '有查閱所有專案、預算與報告的權限，但不能修改' },
  { key: 'pm', label: '專案經理', color: 'bg-blue-100 text-blue-700', description: '對自己負責的專案有完整操作權，非本人專案只能查看' },
  { key: 'admin', label: '系統管理員', color: 'bg-red-100 text-red-700', description: '最高權限，可管理系統設定與所有使用者' },
] as const

type RoleKey = 'member' | 'executive' | 'pm' | 'admin'

function PermCell({ value }: { value: boolean | 'project' }) {
  if (value === 'project') {
    return (
      <div className="flex items-center justify-center" title="僅限負責的專案">
        <CheckCircle2 className="h-5 w-5 text-orange-500" />
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
      <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/40 rounded-md px-3 py-2.5">
        <Info className="h-4 w-4 mt-0.5 shrink-0 text-orange-500" />
        <span>
          <span className="inline-flex items-center gap-1 mr-1"><CheckCircle2 className="h-4 w-4 text-orange-500 inline" /> 橙色</span>表示「僅限負責的專案」，專案經理只對自己建立或被指派的專案擁有此權限。
        </span>
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
                    <tr className="bg-muted/20">
                      <td colSpan={6} className="px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        {section.category}
                      </td>
                    </tr>
                    {section.rows.map(row => (
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
