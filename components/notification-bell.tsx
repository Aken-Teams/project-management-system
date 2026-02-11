'use client'

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useNotificationStore, type NotificationType } from '@/lib/notification-store'
import {
  Bell,
  ClipboardList,
  CalendarClock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  HelpCircle,
  CheckCheck,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const NOTIFICATION_ICONS: Record<NotificationType, typeof Bell> = {
  'task-assigned': ClipboardList,
  'delay-submitted': CalendarClock,
  'delay-approved': CheckCircle2,
  'delay-rejected': XCircle,
  'task-overdue': AlertTriangle,
  'support-needed': HelpCircle,
}

const NOTIFICATION_COLORS: Record<NotificationType, string> = {
  'task-assigned': 'text-blue-500',
  'delay-submitted': 'text-amber-500',
  'delay-approved': 'text-emerald-500',
  'delay-rejected': 'text-red-500',
  'task-overdue': 'text-red-500',
  'support-needed': 'text-amber-500',
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

export function NotificationBell() {
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotificationStore()
  const recentNotifications = notifications.slice(0, 20)

  return (
    <Popover>
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
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold">通知</h4>
            {unreadCount > 0 && (
              <Badge variant="secondary" className="text-[10px] px-1.5">{unreadCount} 未讀</Badge>
            )}
          </div>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-sm gap-1 text-muted-foreground"
              onClick={markAllAsRead}
            >
              <CheckCheck className="h-3.5 w-3.5" />
              全部已讀
            </Button>
          )}
        </div>

        {/* Notification List */}
        {recentNotifications.length === 0 ? (
          <div className="py-10 text-center">
            <Bell className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">沒有通知</p>
          </div>
        ) : (
          <ScrollArea className="max-h-80">
            <div className="divide-y">
              {recentNotifications.map(notification => {
                const Icon = NOTIFICATION_ICONS[notification.type]
                const iconColor = NOTIFICATION_COLORS[notification.type]
                return (
                  <button
                    key={notification.id}
                    className={cn(
                      'flex items-start gap-3 w-full px-4 py-3 text-left hover:bg-muted/50 transition-colors',
                      !notification.read && 'bg-primary/[0.03]'
                    )}
                    onClick={() => markAsRead(notification.id)}
                  >
                    {/* Unread dot */}
                    <div className="flex items-center pt-1">
                      <div className={cn(
                        'h-2 w-2 rounded-full shrink-0',
                        notification.read ? 'bg-transparent' : 'bg-primary'
                      )} />
                    </div>
                    {/* Icon */}
                    <div className={cn('mt-0.5 shrink-0', iconColor)}>
                      <Icon className="h-4 w-4" />
                    </div>
                    {/* Content */}
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <p className={cn('text-sm', !notification.read ? 'font-semibold' : 'font-medium text-muted-foreground')}>
                        {notification.title}
                      </p>
                      <p className="text-sm text-muted-foreground line-clamp-2">{notification.message}</p>
                      <p className="text-[10px] text-muted-foreground/60">{formatRelativeTime(notification.createdAt)}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  )
}
