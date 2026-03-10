'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/lib/auth-context'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Bell, FileText, ChevronLeft, ChevronRight, CheckCircle2, XCircle, RefreshCw } from 'lucide-react'
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

export default function AdminSchedulePage() {
  const { user } = useAuth()
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [notifLogs, setNotifLogs] = useState<CronLog[]>([])
  const [reportLogs, setReportLogs] = useState<CronLog[]>([])
  const [loading, setLoading] = useState(true)
  const [calendarDate, setCalendarDate] = useState(() => new Date())

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
