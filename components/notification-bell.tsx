'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useNotificationStore, type NotificationType, type Notification } from '@/lib/notification-store'
import { notificationHref } from '@/lib/notification-route'
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
  ChevronRight,
  Undo2,
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
  'record-uploaded': ClipboardList,
  'report-review-needed': ClipboardList,
  'report-published': CheckCircle2,
  'report-done-review': ClipboardList,
  'report-review-overdue': AlertTriangle,
  'completion-reopened': Undo2,
  'approval-revoked': Undo2,
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
  'record-uploaded': 'text-sky-500',
  'report-review-needed': 'text-amber-500',
  'report-published': 'text-emerald-500',
  'report-done-review': 'text-amber-500',
  'report-review-overdue': 'text-red-500',
  'completion-reopened': 'text-orange-500',
  'approval-revoked': 'text-orange-500',
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
  'record-uploaded': '工作紀錄',
  'report-review-needed': '待審核報告',
  'report-published': '報告已進更新紀錄',
  'report-done-review': '待審核完成',
  'completion-reopened': '完成被解除',
  'approval-revoked': '審核被撤回',
  'report-review-overdue': '審核逾期',
}

// 查表防呆：後端新增通知型別、前端還沒登記時，回退成通用樣式。
// （實際踩過：新增 approval_revoked 後 <Icon /> 拿到 undefined，整個通知鈴直接崩潰。）
const iconOf = (t: NotificationType) => NOTIFICATION_ICONS[t] ?? Bell
const colorOf = (t: NotificationType) => NOTIFICATION_COLORS[t] ?? 'text-muted-foreground'
const labelOf = (t: NotificationType) => NOTIFICATION_LABEL[t] ?? '通知'


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

export function NotificationBell({
  side = 'bottom',
  align = 'end',
}: {
  side?: 'top' | 'right' | 'bottom' | 'left'
  align?: 'start' | 'center' | 'end'
} = {}) {
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotificationStore()
  const [open, setOpen] = useState(false)
  const router = useRouter()

  const recentNotifications = notifications.slice(0, 20)
  const totalCount = notifications.length
  const summary = buildSummary(notifications)

  function handleNotificationClick(n: Notification) {
    markAsRead(n.id)
    const href = notificationHref(n)
    if (href) {
      setOpen(false)
      router.push(href)
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
              className="absolute -top-1 -right-1 h-5 min-w-5 px-1 flex items-center justify-center text-[11px] p-0"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent side={side} align={align} collisionPadding={12} className="w-80 p-0" sideOffset={8}>

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
                const Icon = iconOf(type)
                const color = colorOf(type)
                return (
                  <span
                    key={type}
                    className={cn('inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] font-medium', color, 'border-current/20 bg-current/5')}
                  >
                    <Icon className="h-2.5 w-2.5" />
                    {labelOf(type)} {count}
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
            <div className="max-h-72 overflow-y-auto overscroll-contain">
              <div className="divide-y">
                {recentNotifications.map(notification => {
                  const Icon = iconOf(notification.type)
                  const iconColor = colorOf(notification.type)
                  const canNavigate = !!notificationHref(notification)

                  return (
                    <button
                      key={notification.id}
                      className={cn(
                        'group relative flex items-start gap-3 w-full pl-4 pr-2.5 py-2.5 text-left transition-colors',
                        !notification.read ? 'bg-primary/[0.035]' : '',
                        canNavigate ? 'hover:bg-muted/60 cursor-pointer' : 'hover:bg-muted/40',
                      )}
                      onClick={() => handleNotificationClick(notification)}
                    >
                      {/* 未讀左側強調條 */}
                      {!notification.read && <span className="absolute left-0 top-0 h-full w-[3px] bg-primary" />}

                      {/* Icon（柔色圓底） */}
                      <div className={cn('mt-0.5 shrink-0 h-8 w-8 rounded-full flex items-center justify-center bg-current/10', iconColor)}>
                        <Icon className="h-4 w-4" />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className={cn('text-sm leading-snug', !notification.read ? 'font-semibold' : 'font-medium text-muted-foreground')}>
                            {notification.title}
                          </p>
                          <span className="text-[11px] text-muted-foreground/60 shrink-0 mt-0.5 whitespace-nowrap">
                            {formatRelativeTime(notification.createdAt)}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">
                          {notification.message}
                        </p>
                      </div>

                      {/* 可導覽 → 右側箭頭（hover 轉主色） */}
                      {canNavigate && (
                        <ChevronRight className="h-4 w-4 shrink-0 self-center text-muted-foreground/30 group-hover:text-primary transition-colors" />
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Footer */}
            <div className="border-t px-4 py-2">
              {totalCount > 20 && (
                <p className="text-xs text-muted-foreground text-center mb-1.5">僅顯示最近 20 則，共 {totalCount} 則通知</p>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="w-full h-8 text-xs text-muted-foreground hover:text-foreground gap-1.5"
                onClick={() => { setOpen(false); router.push('/notifications') }}
              >
                查看所有通知
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}
