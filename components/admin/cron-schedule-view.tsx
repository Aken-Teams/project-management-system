'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '@/lib/auth-context'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, XCircle, Clock, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface CronJobLog {
  id: string
  jobType: string
  runAt: string
  status: string
  summary: string | null
  affectedCount: number
}

interface CronScheduleViewProps {
  jobType: 'weekly_notification' | 'weekly_report'
  scheduleDay: number   // 0=Sun … 6=Sat
  scheduleHour: number  // 0-23
}

const DAY_NAMES = ['週日', '週一', '週二', '週三', '週四', '週五', '週六']

function getNextOccurrences(dayOfWeek: number, hour: number, count = 4): Date[] {
  const results: Date[] = []
  const now = new Date()
  const current = new Date(now)
  current.setSeconds(0, 0)

  for (let i = 0; results.length < count; i++) {
    const candidate = new Date(current)
    candidate.setDate(current.getDate() + i)
    if (candidate.getDay() === dayOfWeek) {
      candidate.setHours(hour, 0, 0, 0)
      if (candidate > now) {
        results.push(new Date(candidate))
      }
    }
  }
  return results
}

function formatDateTime(date: Date): string {
  return date.toLocaleDateString('zh-TW', {
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  }) + ' ' + date.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })
}

function formatRunAt(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' }) +
    ' ' + d.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })
}

export function CronScheduleView({ jobType, scheduleDay, scheduleHour }: CronScheduleViewProps) {
  const { user } = useAuth()
  const [logs, setLogs] = useState<CronJobLog[]>([])
  const [loading, setLoading] = useState(true)

  const loadLogs = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/cron-logs?jobType=${jobType}&limit=10`, {
        headers: { 'x-user-email': user.email ?? '' },
      })
      if (res.ok) setLogs(await res.json())
    } finally {
      setLoading(false)
    }
  }, [user, jobType])

  useEffect(() => { loadLogs() }, [loadLogs])

  const nextRuns = getNextOccurrences(scheduleDay, scheduleHour, 4)

  return (
    <div className="space-y-6">
      {/* Next scheduled runs */}
      <div>
        <h3 className="text-sm font-medium mb-3">下次排程</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {nextRuns.map((d, i) => (
            <div key={i} className="rounded-md border bg-muted/30 px-3 py-2 text-center">
              <div className="text-xs text-muted-foreground">{DAY_NAMES[d.getDay()]}</div>
              <div className="font-medium text-sm mt-0.5">
                {d.getMonth() + 1}/{d.getDate()}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {String(scheduleHour).padStart(2, '0')}:00
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          排程設定：每{DAY_NAMES[scheduleDay]} {String(scheduleHour).padStart(2, '0')}:00 執行
        </p>
      </div>

      {/* Run history */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium">執行記錄</h3>
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={loadLogs}>
            <RefreshCw className="h-3 w-3" />
            重新整理
          </Button>
        </div>

        {loading ? (
          <p className="text-xs text-muted-foreground py-4 text-center">載入中...</p>
        ) : logs.length === 0 ? (
          <div className="rounded-md border border-dashed py-8 text-center">
            <Clock className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">尚無執行記錄</p>
            <p className="text-xs text-muted-foreground mt-1">排程執行後記錄將顯示在此</p>
          </div>
        ) : (
          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">執行時間</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">狀態</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">影響筆數</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">摘要</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log, i) => (
                  <tr key={log.id} className={i % 2 === 0 ? 'bg-background' : 'bg-muted/20'}>
                    <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                      {formatRunAt(log.runAt)}
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
      </div>
    </div>
  )
}
