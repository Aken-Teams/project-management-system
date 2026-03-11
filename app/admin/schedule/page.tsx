'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/lib/auth-context'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Bell, FileText, ChevronLeft, ChevronRight, CheckCircle2, XCircle, RefreshCw,
  Mail, Paperclip, AlertCircle, Users, Play, Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const DAY_NAMES = ['日', '一', '二', '三', '四', '五', '六']
const DAY_NAMES_FULL = ['週日', '週一', '週二', '週三', '週四', '週五', '週六']

const SETTING_KEYS = [
  'notification.schedule.dayOfWeek', 'notification.schedule.hour',
  'report.schedule.dayOfWeek', 'report.schedule.hour',
]

interface CronLog {
  id: string
  jobType: string
  runAt: string
  status: string
  summary: string | null
  affectedCount: number
}

// ── Types for preview API responses ─────────────────────────────────────────
interface NotifProjectPreview {
  projectId: string
  projectName: string
  status: 'missing' | 'uploaded'
  pm: { name: string; email?: string | null } | null
  teamEmails: string[]
  emailPreview?: { subject: string; body: string; to: string[] }
}

interface NotifPreviewResult {
  preview: true
  weekOf: string
  configuredSchedule: { dayOfWeek: string; hour: string }
  templates: { siteTitle: string; siteMessage: string; emailSubject: string; emailBody: string }
  projects: NotifProjectPreview[]
  summary: string
}

interface ReportPreviewResult {
  preview: true
  configuredSchedule: { dayOfWeek: string; hour: string }
  email: { subject: string; body: string; filename: string }
  recipients: {
    executives: { name: string; email: string | null }[]
    projectPMs: { name: string; email: string | null; project: string }[]
    custom: string[]
    allTo: string[]
    totalCount: number
  }
  pdfPreviewUrl: string
  projectCount: number
  note: string
}

// ── Calendar helpers ─────────────────────────────────────────────────────────
function getCalendarDays(year: number, month: number): (Date | null)[] {
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const days: (Date | null)[] = []
  for (let i = 0; i < firstDay.getDay(); i++) days.push(null)
  for (let d = 1; d <= lastDay.getDate(); d++) days.push(new Date(year, month, d))
  return days
}

function isSameDate(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
}

// ── Email client preview for notification ───────────────────────────────────
function NotifEmailCard({ project }: { project: NotifProjectPreview }) {
  const ep = project.emailPreview
  if (!ep) return null
  const toDisplay = ep.to.length > 2
    ? ep.to.slice(0, 2).join(', ') + ` +${ep.to.length - 2}`
    : ep.to.join(', ') || '（無收件人）'
  return (
    <div className="rounded-xl border shadow-sm overflow-hidden text-sm bg-white mt-2">
      <div className="bg-slate-100 px-3 py-1.5 flex items-center gap-2 border-b">
        <Mail className="h-3 w-3 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Email 通知</span>
      </div>
      <div className="divide-y divide-border/60">
        <div className="grid grid-cols-[36px_1fr] px-3 py-1.5 text-xs">
          <span className="text-muted-foreground">收件</span>
          <span className="text-foreground break-all">{toDisplay}</span>
        </div>
        <div className="grid grid-cols-[36px_1fr] px-3 py-1.5 text-xs">
          <span className="text-muted-foreground">主旨</span>
          <span className="font-semibold">{ep.subject}</span>
        </div>
      </div>
      <div className="px-3 py-3 bg-white">
        <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">{ep.body}</p>
      </div>
    </div>
  )
}

// ── Notification preview panel ───────────────────────────────────────────────
function NotifPreviewPanel({ data }: { data: NotifPreviewResult }) {
  const missing = data.projects.filter(p => p.status === 'missing')
  const uploaded = data.projects.filter(p => p.status === 'uploaded')
  const [expanded, setExpanded] = useState<string | null>(missing[0]?.projectId ?? null)

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex flex-wrap gap-2">
        <div className="flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs text-amber-700">
          <AlertCircle className="h-3 w-3" />
          {missing.length} 個專案未上傳 → 將發送通知
        </div>
        <div className="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs text-emerald-700">
          <CheckCircle2 className="h-3 w-3" />
          {uploaded.length} 個已上傳
        </div>
        <div className="ml-auto text-xs text-muted-foreground self-center">週次 {data.weekOf}</div>
      </div>

      {/* Missing projects */}
      {missing.length === 0 ? (
        <div className="rounded-lg border border-dashed py-6 text-center text-sm text-muted-foreground">
          本週所有專案均已上傳週報，不會發送通知
        </div>
      ) : (
        <div className="space-y-2">
          {missing.map(p => (
            <div key={p.projectId} className="rounded-xl border border-amber-200 overflow-hidden">
              <button
                className="w-full flex items-center gap-3 px-4 py-3 bg-amber-50 hover:bg-amber-100/70 transition-colors text-left"
                onClick={() => setExpanded(e => e === p.projectId ? null : p.projectId)}
              >
                <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-amber-800">{p.projectName}</p>
                  <p className="text-xs text-amber-600">
                    PM: {p.pm?.name ?? '未設定'} · {p.teamEmails.length} 位成員收件
                  </p>
                </div>
                <ChevronRight className={cn('h-4 w-4 text-amber-400 transition-transform shrink-0', expanded === p.projectId && 'rotate-90')} />
              </button>
              {expanded === p.projectId && (
                <div className="px-4 py-3 bg-white space-y-2">
                  {/* Recipients */}
                  <div className="flex flex-wrap gap-1.5">
                    <span className="text-xs text-muted-foreground self-center">收件人：</span>
                    {p.teamEmails.length > 0
                      ? p.teamEmails.map(e => (
                        <span key={e} className="inline-flex items-center gap-1 rounded-full border bg-muted/40 px-2 py-0.5 text-xs">
                          <Users className="h-2.5 w-2.5 text-muted-foreground" />{e}
                        </span>
                      ))
                      : <span className="text-xs text-muted-foreground">無收件人</span>
                    }
                  </div>
                  {/* Email card */}
                  <NotifEmailCard project={p} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Uploaded projects (collapsed list) */}
      {uploaded.length > 0 && (
        <details className="group">
          <summary className="flex items-center gap-2 cursor-pointer text-xs text-muted-foreground hover:text-foreground list-none">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            {uploaded.length} 個已上傳（不發通知）
            <ChevronRight className="h-3.5 w-3.5 group-open:rotate-90 transition-transform ml-auto" />
          </summary>
          <div className="mt-2 space-y-1 pl-5">
            {uploaded.map(p => (
              <div key={p.projectId} className="flex items-center gap-2 text-xs text-muted-foreground">
                <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />
                {p.projectName}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}

// ── Report preview panel ─────────────────────────────────────────────────────
function ReportPreviewPanel({ data }: { data: ReportPreviewResult }) {
  const { email, recipients } = data
  const toDisplay = recipients.allTo.length > 3
    ? recipients.allTo.slice(0, 3).join(', ') + ` +${recipients.allTo.length - 3}`
    : recipients.allTo.join(', ') || '（無收件人）'

  const dateStr = new Date().toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric', weekday: 'short' })

  return (
    <div className="space-y-4">
      {/* Email card */}
      <div className="rounded-xl border shadow-sm overflow-hidden text-sm bg-white">
        <div className="bg-slate-100 px-4 py-2.5 flex items-center gap-2 border-b">
          <Mail className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground font-medium">郵件預覽</span>
          <span className="ml-auto text-xs text-muted-foreground">{dateStr}</span>
        </div>
        <div className="divide-y divide-border/60 bg-white">
          <div className="grid grid-cols-[40px_1fr] px-4 py-2 text-xs">
            <span className="text-muted-foreground self-start pt-0.5">寄件</span>
            <span>專案管理系統</span>
          </div>
          <div className="grid grid-cols-[40px_1fr] px-4 py-2 text-xs">
            <span className="text-muted-foreground self-start pt-0.5">收件</span>
            <span className="break-all">{toDisplay}</span>
          </div>
          <div className="grid grid-cols-[40px_1fr] px-4 py-2 text-xs">
            <span className="text-muted-foreground self-start pt-0.5">主旨</span>
            <span className="font-semibold">{email.subject || '（主旨為空）'}</span>
          </div>
        </div>
        <div className="px-4 py-4 bg-white border-t min-h-[80px]">
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{email.body || '（內文為空）'}</p>
        </div>
        {/* PDF attachment */}
        <div className="bg-muted/30 border-t px-4 py-3">
          <div className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2">
            <div className="flex h-8 w-8 items-center justify-center rounded bg-red-100 shrink-0">
              <Paperclip className="h-4 w-4 text-red-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">{email.filename}</p>
              <p className="text-xs text-muted-foreground">PDF 附件 · 涵蓋 {data.projectCount} 個專案</p>
            </div>
          </div>
        </div>
      </div>

      {/* Recipient breakdown */}
      <div className="rounded-xl border overflow-hidden">
        <div className="px-4 py-2.5 bg-muted/40 border-b">
          <p className="text-xs font-medium">收件人明細（共 {recipients.totalCount} 人）</p>
        </div>
        <div className="divide-y text-xs">
          {recipients.executives.length > 0 && (
            <div className="px-4 py-2.5">
              <p className="text-muted-foreground mb-1.5">主管角色（{recipients.executives.length} 人）</p>
              <div className="flex flex-wrap gap-1.5">
                {recipients.executives.map(u => (
                  <span key={u.email} className="inline-flex items-center gap-1 rounded-full border bg-blue-50 border-blue-200 px-2 py-0.5 text-blue-700">
                    {u.name}{u.email ? ` <${u.email}>` : ''}
                  </span>
                ))}
              </div>
            </div>
          )}
          {recipients.projectPMs.length > 0 && (
            <div className="px-4 py-2.5">
              <p className="text-muted-foreground mb-1.5">專案負責人（A角色，{recipients.projectPMs.length} 人）</p>
              <div className="flex flex-wrap gap-1.5">
                {recipients.projectPMs.map((m, i) => (
                  <span key={i} className="inline-flex items-center gap-1 rounded-full border bg-amber-50 border-amber-200 px-2 py-0.5 text-amber-700">
                    {m.name} · {m.project}
                  </span>
                ))}
              </div>
            </div>
          )}
          {recipients.custom.length > 0 && (
            <div className="px-4 py-2.5">
              <p className="text-muted-foreground mb-1.5">自訂收件人（{recipients.custom.length} 人）</p>
              <div className="flex flex-wrap gap-1.5">
                {recipients.custom.map(e => (
                  <span key={e} className="inline-flex items-center gap-1 rounded-full border bg-muted/40 px-2 py-0.5 text-muted-foreground">{e}</span>
                ))}
              </div>
            </div>
          )}
          {recipients.totalCount === 0 && (
            <div className="px-4 py-3 text-muted-foreground">無收件人（請至報告設定新增主管或指定收件人）</div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function AdminSchedulePage() {
  const { user } = useAuth()
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [notifLogs, setNotifLogs] = useState<CronLog[]>([])
  const [reportLogs, setReportLogs] = useState<CronLog[]>([])
  const [loading, setLoading] = useState(true)
  const [calendarDate, setCalendarDate] = useState(() => new Date())

  // Preview state
  const [previewTab, setPreviewTab] = useState<'notification' | 'report'>('notification')
  const [notifPreview, setNotifPreview] = useState<NotifPreviewResult | null>(null)
  const [reportPreview, setReportPreview] = useState<ReportPreviewResult | null>(null)
  const [notifLoading, setNotifLoading] = useState(false)
  const [reportLoading, setReportLoading] = useState(false)
  const [notifError, setNotifError] = useState<string | null>(null)
  const [reportError, setReportError] = useState<string | null>(null)

  const headers = useCallback(() => ({ 'x-user-email': user?.email ?? '' }), [user])

  const loadData = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const [settingsRes, notifRes, reportRes] = await Promise.all([
        fetch(`/api/admin/settings?keys=${SETTING_KEYS.join(',')}`, { headers: headers() }),
        fetch('/api/admin/cron-logs?jobType=weekly_notification&limit=60', { headers: headers() }),
        fetch('/api/admin/cron-logs?jobType=weekly_report&limit=60', { headers: headers() }),
      ])
      if (settingsRes.ok) setSettings(await settingsRes.json())
      if (notifRes.ok) setNotifLogs(await notifRes.json())
      if (reportRes.ok) setReportLogs(await reportRes.json())
    } finally {
      setLoading(false)
    }
  }, [user, headers])

  useEffect(() => { loadData() }, [loadData])

  const runNotifPreview = async () => {
    setNotifLoading(true)
    setNotifError(null)
    try {
      const res = await fetch('/api/cron/weekly-notification?preview=1', { method: 'POST' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setNotifPreview(data)
    } catch (e) {
      setNotifError(e instanceof Error ? e.message : '請求失敗')
    } finally {
      setNotifLoading(false)
    }
  }

  const runReportPreview = async () => {
    setReportLoading(true)
    setReportError(null)
    try {
      const res = await fetch('/api/cron/weekly-report?preview=1', { method: 'POST' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setReportPreview(data)
    } catch (e) {
      setReportError(e instanceof Error ? e.message : '請求失敗')
    } finally {
      setReportLoading(false)
    }
  }

  const notifDay = parseInt(settings['notification.schedule.dayOfWeek'] ?? '5')
  const notifHour = parseInt(settings['notification.schedule.hour'] ?? '9')
  const reportDay = parseInt(settings['report.schedule.dayOfWeek'] ?? '5')
  const reportHour = parseInt(settings['report.schedule.hour'] ?? '8')

  const year = calendarDate.getFullYear()
  const month = calendarDate.getMonth()
  const days = getCalendarDays(year, month)
  const today = new Date()

  const allLogs = [...notifLogs, ...reportLogs]
    .sort((a, b) => new Date(b.runAt).getTime() - new Date(a.runAt).getTime())
    .slice(0, 20)

  if (loading) return <p className="text-sm text-muted-foreground">載入中...</p>

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold">排程行事曆</h2>
        <p className="text-sm text-muted-foreground mt-0.5">通知與報告自動排程的執行總覽</p>
      </div>

      {/* Schedule summary badges */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
          <Bell className="h-4 w-4 text-amber-600" />
          <span className="text-sm font-medium text-amber-700">週報通知</span>
          <span className="text-xs text-amber-600">
            每{DAY_NAMES_FULL[notifDay]} {String(notifHour).padStart(2, '0')}:00
          </span>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
          <FileText className="h-4 w-4 text-blue-600" />
          <span className="text-sm font-medium text-blue-700">週報郵件</span>
          <span className="text-xs text-blue-600">
            每{DAY_NAMES_FULL[reportDay]} {String(reportHour).padStart(2, '0')}:00
          </span>
        </div>
      </div>

      {/* Calendar */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">{year}年{month + 1}月</CardTitle>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCalendarDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCalendarDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs ml-1" onClick={loadData}>
                <RefreshCw className="h-3 w-3" />
                重新整理
              </Button>
            </div>
          </div>
          {/* Legend */}
          <div className="flex flex-wrap gap-4 pt-1">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block shrink-0" />
              通知排程日
            </span>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-400 inline-block shrink-0" />
              報告排程日
            </span>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
              執行成功
            </span>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <XCircle className="h-3 w-3 text-red-500 shrink-0" />
              執行失敗
            </span>
          </div>
        </CardHeader>
        <CardContent>
          {/* Day-of-week headers */}
          <div className="grid grid-cols-7 mb-1">
            {DAY_NAMES.map(d => (
              <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">{d}</div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7 gap-1">
            {days.map((day, i) => {
              if (!day) return <div key={`pad-${i}`} />

              const isToday = isSameDate(day, today)
              const isPast = day < today && !isToday
              const isNotifDay = day.getDay() === notifDay
              const isReportDay = day.getDay() === reportDay

              const dayNotifLogs = notifLogs.filter(l => isSameDate(new Date(l.runAt), day))
              const dayReportLogs = reportLogs.filter(l => isSameDate(new Date(l.runAt), day))
              const allDayLogs = [...dayNotifLogs, ...dayReportLogs]
              const hasSuccess = allDayLogs.some(l => l.status === 'success')
              const hasFailure = allDayLogs.some(l => l.status === 'failed')

              return (
                <div
                  key={day.toISOString()}
                  className={cn(
                    'rounded-md p-1.5 min-h-[60px] text-xs transition-colors',
                    isToday
                      ? 'bg-primary/10 ring-1 ring-primary/40'
                      : isPast
                        ? 'bg-muted/20'
                        : 'hover:bg-muted/30',
                  )}
                >
                  <div className={cn(
                    'font-semibold text-[13px] leading-none mb-1.5',
                    isToday ? 'text-primary' : isPast ? 'text-muted-foreground' : 'text-foreground'
                  )}>
                    {day.getDate()}
                  </div>
                  <div className="flex flex-wrap gap-0.5 items-center">
                    {isNotifDay && (
                      <span
                        className="inline-block w-2 h-2 rounded-full bg-amber-400 shrink-0"
                        title={`通知 ${String(notifHour).padStart(2, '0')}:00`}
                      />
                    )}
                    {isReportDay && (
                      <span
                        className="inline-block w-2 h-2 rounded-full bg-blue-400 shrink-0"
                        title={`報告 ${String(reportHour).padStart(2, '0')}:00`}
                      />
                    )}
                    {hasSuccess && <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />}
                    {hasFailure && <XCircle className="h-3 w-3 text-red-500 shrink-0" />}
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* ── Test Preview Panel (hidden for now) ────────────────────────────── */}
      {false && <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <CardTitle className="text-sm">測試預覽</CardTitle>
              <CardDescription className="text-xs mt-0.5">模擬排程執行結果，不實際發送郵件或建立通知</CardDescription>
            </div>
            {/* Tab toggle */}
            <div className="flex rounded-lg border overflow-hidden text-xs">
              <button
                className={cn('flex items-center gap-1.5 px-3 py-1.5 transition-colors', previewTab === 'notification' ? 'bg-amber-50 text-amber-700 font-medium' : 'text-muted-foreground hover:bg-muted/40')}
                onClick={() => setPreviewTab('notification')}
              >
                <Bell className="h-3 w-3" />
                週報通知
              </button>
              <button
                className={cn('flex items-center gap-1.5 px-3 py-1.5 border-l transition-colors', previewTab === 'report' ? 'bg-blue-50 text-blue-700 font-medium' : 'text-muted-foreground hover:bg-muted/40')}
                onClick={() => setPreviewTab('report')}
              >
                <FileText className="h-3 w-3" />
                週報郵件
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {previewTab === 'notification' ? (
            <div className="space-y-4">
              <Button
                size="sm"
                variant="outline"
                className="gap-2 border-amber-200 text-amber-700 hover:bg-amber-50"
                onClick={runNotifPreview}
                disabled={notifLoading}
              >
                {notifLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                {notifLoading ? '檢查中...' : '執行通知預覽'}
              </Button>

              {notifError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                  {notifError}
                </div>
              )}

              {notifPreview && !notifLoading && (
                <NotifPreviewPanel data={notifPreview} />
              )}

              {!notifPreview && !notifLoading && !notifError && (
                <div className="rounded-lg border border-dashed py-10 text-center">
                  <Bell className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">點擊「執行通知預覽」查看本週哪些專案未上傳，以及將發送的通知內容</p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <Button
                size="sm"
                variant="outline"
                className="gap-2 border-blue-200 text-blue-700 hover:bg-blue-50"
                onClick={runReportPreview}
                disabled={reportLoading}
              >
                {reportLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                {reportLoading ? '準備中...' : '執行報告預覽'}
              </Button>

              {reportError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                  {reportError}
                </div>
              )}

              {reportPreview && !reportLoading && (
                <ReportPreviewPanel data={reportPreview} />
              )}

              {!reportPreview && !reportLoading && !reportError && (
                <div className="rounded-lg border border-dashed py-10 text-center">
                  <FileText className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">點擊「執行報告預覽」查看將寄出的郵件內容與所有收件人</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>}

      {/* Combined run history */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">近期執行記錄</CardTitle>
          <CardDescription className="text-xs">通知與報告排程的執行歷史（最近 20 筆）</CardDescription>
        </CardHeader>
        <CardContent>
          {allLogs.length === 0 ? (
            <div className="rounded-md border border-dashed py-10 text-center">
              <p className="text-sm text-muted-foreground">尚無執行記錄</p>
              <p className="text-xs text-muted-foreground mt-1">排程執行後記錄將顯示在此</p>
            </div>
          ) : (
            <div className="rounded-md border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">執行時間</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">類型</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">狀態</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">影響筆數</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">摘要</th>
                  </tr>
                </thead>
                <tbody>
                  {allLogs.map((log, i) => (
                    <tr key={log.id} className={i % 2 === 0 ? 'bg-background' : 'bg-muted/20'}>
                      <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(log.runAt).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })}
                        {' '}
                        {new Date(log.runAt).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-3 py-2">
                        {log.jobType === 'weekly_notification' ? (
                          <span className="inline-flex items-center gap-1 text-xs text-amber-600">
                            <Bell className="h-3 w-3" />通知
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-blue-600">
                            <FileText className="h-3 w-3" />報告
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {log.status === 'success' ? (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                            <CheckCircle2 className="h-3 w-3" />成功
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-red-500">
                            <XCircle className="h-3 w-3" />失敗
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs">{log.affectedCount}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{log.summary ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
