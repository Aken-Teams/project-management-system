'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useNotificationStore, type NotificationType, type Notification } from '@/lib/notification-store'
import {
  Bell,
  ClipboardList,
  CalendarClock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  HelpCircle,
  CheckCheck,
  AlertCircle,
  ArrowRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const NOTIFICATION_ICONS: Record<NotificationType, typeof Bell> = {
  'task-assigned': ClipboardList,
  'delay-submitted': CalendarClock,
  'delay-approved': CheckCircle2,
  'delay-rejected': XCircle,
  'task-overdue': AlertTriangle,
  'support-needed': HelpCircle,
  'weekly-upload-missing': AlertCircle,
  'weekly-report-ready': CheckCircle2,
}

const NOTIFICATION_COLORS: Record<NotificationType, string> = {
  'task-assigned': 'text-blue-500',
  'delay-submitted': 'text-amber-500',
  'delay-approved': 'text-emerald-500',
  'delay-rejected': 'text-red-500',
  'task-overdue': 'text-red-500',
  'support-needed': 'text-amber-500',
  'weekly-upload-missing': 'text-amber-500',
  'weekly-report-ready': 'text-emerald-500',
}

const NOTIFICATION_LABEL: Record<NotificationType, string> = {
  'task-assigned': '任務指派',
  'delay-submitted': '延期申請',
  'delay-approved': '申請核准',
  'delay-rejected': '申請駁回',
  'task-overdue': '逾期提醒',
  'support-needed': '支援需求',
  'weekly-upload-missing': '未上傳週報',
  'weekly-report-ready': '週報已寄出',
}

function formatRelativeTime(dateStr: string): string {
  const now = new Date()
  const date = new Date(dateStr)
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMins < 1) return '剛剛'
  if (diffMins < 60) return `${diffMins} 分鐘前`
  if (diffHours < 24) return `${diffHours} 小時前`
  if (diffDays < 7) return `${diffDays} 天前`
  return date.toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })
}

/** Build type-based summary chips for unread notifications */
function buildSummary(notifications: Notification[]) {
  const unread = notifications.filter(n => !n.read)
  const counts: Partial<Record<NotificationType, number>> = {}
  for (const n of unread) {
    counts[n.type] = (counts[n.type] ?? 0) + 1
  }
  return Object.entries(counts) as [NotificationType, number][]
}

export function NotificationBell() {
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotificationStore()
  const [open, setOpen] = useState(false)
  const router = useRouter()

  const recentNotifications = notifications.slice(0, 20)
  const totalCount = notifications.length
  const summary = buildSummary(notifications)

  function handleNotificationClick(n: Notification) {
    markAsRead(n.id)
    if (n.projectId) {
      setOpen(false)
      router.push(`/projects/${n.projectId}`)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9">
          <Bell className="h-4.5 w-4.5" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 min-w-5 px-1 flex items-center justify-center text-[10px] p-0"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0" sideOffset={8}>

        {/* Header */}
        <div className="px-4 py-3 border-b space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-semibold">通知</h4>
              <span className="text-sm text-muted-foreground">
                {unreadCount > 0 ? `${unreadCount} 未讀 / ${totalCount} 則` : `共 ${totalCount} 則`}
              </span>
            </div>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1 text-muted-foreground"
                onClick={markAllAsRead}
              >
                <CheckCheck className="h-3.5 w-3.5" />
                全部已讀
              </Button>
            )}
          </div>

          {/* Type breakdown chips */}
          {summary.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {summary.map(([type, count]) => {
                const Icon = NOTIFICATION_ICONS[type]
                const color = NOTIFICATION_COLORS[type]
                return (
                  <span
                    key={type}
                    className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium', color, 'border-current/20 bg-current/5')}
                  >
                    <Icon className="h-2.5 w-2.5" />
                    {NOTIFICATION_LABEL[type]} {count}
                  </span>
                )
              })}
            </div>
          )}
        </div>

        {/* Notification List */}
        {recentNotifications.length === 0 ? (
          <div className="py-10 text-center">
            <Bell className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">沒有通知</p>
          </div>
        ) : (
          <>
            <ScrollArea className="max-h-72">
              <div className="divide-y">
                {recentNotifications.map(notification => {
                  const Icon = NOTIFICATION_ICONS[notification.type]
                  const iconColor = NOTIFICATION_COLORS[notification.type]
                  const canNavigate = !!notification.projectId

                  return (
                    <button
                      key={notification.id}
                      className={cn(
                        'flex items-start gap-3 w-full px-4 py-3 text-left transition-colors',
                        !notification.read ? 'bg-primary/[0.03]' : '',
                        canNavigate ? 'hover:bg-muted/60 cursor-pointer' : 'hover:bg-muted/40',
                      )}
                      onClick={() => handleNotificationClick(notification)}
                    >
                      {/* Unread dot */}
                      <div className="flex items-center pt-1.5">
                        <div className={cn(
                          'h-1.5 w-1.5 rounded-full shrink-0',
                          notification.read ? 'bg-transparent' : 'bg-primary'
                        )} />
                      </div>

                      {/* Icon */}
                      <div className={cn('mt-0.5 shrink-0', iconColor)}>
                        <Icon className="h-4 w-4" />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-1">
                          <p className={cn('text-sm font-semibold leading-snug', !notification.read ? '' : 'text-muted-foreground')}>
                            {notification.title}
                          </p>
                          <span className="text-xs text-muted-foreground/60 shrink-0 mt-0.5">
                            {formatRelativeTime(notification.createdAt)}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
                          {notification.message}
                        </p>
                        {canNavigate && (
                          <span className="inline-flex items-center gap-0.5 text-xs text-primary mt-1 font-medium">
                            查看專案 <ArrowRight className="h-3 w-3" />
                          </span>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </ScrollArea>

            {/* Footer */}
            {totalCount > 20 && (
              <div className="border-t px-4 py-2 text-center">
                <span className="text-xs text-muted-foreground">僅顯示最近 20 則，共 {totalCount} 則通知</span>
              </div>
            )}
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}
