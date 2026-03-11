'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardLayout } from '@/components/dashboard-layout'
import { useAuth } from '@/lib/auth-context'
import { useNotificationStore, type NotificationType, type Notification } from '@/lib/notification-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import {
  Bell,
  ClipboardList,
  CalendarClock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  HelpCircle,
  AlertCircle,
  ArrowRight,
  CheckCheck,
  Search,
  Circle,
  CheckCircle,
} from 'lucide-react'

// ─── Constants shared with bell ─────────────────────────────────────────────

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

const TYPE_TABS: { value: NotificationType | 'all'; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'task-assigned', label: '任務指派' },
  { value: 'task-overdue', label: '逾期提醒' },
  { value: 'delay-submitted', label: '延期申請' },
  { value: 'delay-approved', label: '申請核准' },
  { value: 'delay-rejected', label: '申請駁回' },
  { value: 'support-needed', label: '支援需求' },
  { value: 'weekly-upload-missing', label: '未上傳週報' },
  { value: 'weekly-report-ready', label: '週報已寄出' },
]

function formatTime(dateStr: string): string {
  const now = new Date()
  const date = new Date(dateStr)
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMins < 1) return '剛剛'
  if (diffMins < 60) return `${diffMins} 分鐘前`
  if (diffHours < 24) return `${diffHours} 小時前`
  if (diffDays < 30) return `${diffDays} 天前`
  return date.toLocaleDateString('zh-TW', { year: 'numeric', month: 'numeric', day: 'numeric' })
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const { user } = useAuth()
  const router = useRouter()
  const { notifications: storeNotifications, unreadCount, markAsRead, markAllAsRead, refreshNotifications } = useNotificationStore()

  // Fetch all (up to 500) for this page — store only caches 50
  const [allNotifications, setAllNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    if (!user?.id) return
    try {
      const res = await fetch(`/api/notifications?userId=${user.id}&limit=500`)
      if (res.ok) {
        const data: Notification[] = await res.json()
        setAllNotifications(data)
      }
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  // Re-sync when store updates (e.g. mark-as-read from bell)
  useEffect(() => {
    setAllNotifications(prev =>
      prev.map(n => {
        const storeMatch = storeNotifications.find(s => s.id === n.id)
        return storeMatch ? { ...n, read: storeMatch.read } : n
      })
    )
  }, [storeNotifications])

  // ─── Filter state ────────────────────────────────────────────────────────
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<NotificationType | 'all'>('all')
  const [readFilter, setReadFilter] = useState<'all' | 'unread' | 'read'>('all')

  const filtered = useMemo(() => {
    return allNotifications.filter(n => {
      if (typeFilter !== 'all' && n.type !== typeFilter) return false
      if (readFilter === 'unread' && n.read) return false
      if (readFilter === 'read' && !n.read) return false
      if (search.trim()) {
        const q = search.trim().toLowerCase()
        if (!n.title.toLowerCase().includes(q) && !n.message.toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [allNotifications, typeFilter, readFilter, search])

  const filteredUnread = filtered.filter(n => !n.read).length

  // ─── Actions ─────────────────────────────────────────────────────────────

  function handleMarkRead(n: Notification) {
    if (n.read) return
    markAsRead(n.id)
    setAllNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x))
  }

  function handleMarkAllRead() {
    markAllAsRead()
    setAllNotifications(prev => prev.map(n => ({ ...n, read: true })))
  }

  function handleNavigate(n: Notification) {
    handleMarkRead(n)
    if (n.projectId) router.push(`/projects/${n.projectId}`)
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <DashboardLayout>
      <div className="space-y-6">

        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">通知中心</h1>
            <p className="text-sm text-muted-foreground mt-1">查看所有系統通知紀錄</p>
          </div>
          <div className="flex items-center gap-3">
            {unreadCount > 0 && (
              <Badge variant="destructive" className="h-6 px-2 text-xs">
                {unreadCount} 未讀
              </Badge>
            )}
            {unreadCount > 0 && (
              <Button size="sm" className="gap-1.5 text-sm" onClick={handleMarkAllRead}>
                <CheckCheck className="h-4 w-4" />
                全部標為已讀
              </Button>
            )}
          </div>
        </div>

        {/* Search + read filter */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="搜尋通知內容..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex rounded-md border overflow-hidden text-sm">
            {(['all', 'unread', 'read'] as const).map(v => (
              <button
                key={v}
                onClick={() => setReadFilter(v)}
                className={cn(
                  'px-3 py-1.5 transition-colors',
                  readFilter === v
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted text-muted-foreground'
                )}
              >
                {v === 'all' ? '全部' : v === 'unread' ? '未讀' : '已讀'}
              </button>
            ))}
          </div>
        </div>

        {/* Type filter tabs */}
        <Tabs value={typeFilter} onValueChange={v => setTypeFilter(v as NotificationType | 'all')}>
          <TabsList className="flex flex-wrap h-auto gap-1 bg-muted/50 p-1">
            {TYPE_TABS.map(tab => {
              const cnt = tab.value === 'all'
                ? allNotifications.filter(n => !n.read).length
                : allNotifications.filter(n => n.type === tab.value && !n.read).length
              return (
                <TabsTrigger key={tab.value} value={tab.value} className="text-sm px-3 py-1.5 gap-1.5">
                  {tab.label}
                  {cnt > 0 && (
                    <span className="rounded-full bg-red-500 text-white text-[10px] font-semibold min-w-[16px] h-4 px-1 inline-flex items-center justify-center leading-none">
                      {cnt}
                    </span>
                  )}
                </TabsTrigger>
              )
            })}
          </TabsList>
        </Tabs>

        {/* Result count */}
        <p className="text-sm text-muted-foreground">
          {loading ? '載入中...' : `顯示 ${filtered.length} 則${filteredUnread > 0 ? `，其中 ${filteredUnread} 則未讀` : ''}`}
        </p>

        {/* Notification list */}
        {loading ? (
          <div className="py-16 text-center text-muted-foreground text-sm">載入中...</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center space-y-2">
            <Bell className="h-10 w-10 mx-auto text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">沒有符合條件的通知</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(n => {
              const Icon = NOTIFICATION_ICONS[n.type]
              const iconColor = NOTIFICATION_COLORS[n.type]
              const canNavigate = !!n.projectId

              return (
                <div
                  key={n.id}
                  className={cn(
                    'flex items-start gap-3 px-4 py-4 rounded-lg border shadow-sm transition-colors',
                    !n.read ? 'bg-card border-primary/20' : 'bg-card'
                  )}
                >
                  {/* Unread dot */}
                  <div className="flex items-center pt-1.5 shrink-0">
                    <div className={cn('h-2 w-2 rounded-full', n.read ? 'bg-transparent' : 'bg-primary')} />
                  </div>

                  {/* Icon */}
                  <div className={cn('mt-0.5 shrink-0', iconColor)}>
                    <Icon className="h-4 w-4" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={cn('text-sm font-semibold', n.read ? 'text-muted-foreground' : '')}>
                            {n.title}
                          </span>
                          <span className={cn(
                            'inline-flex items-center rounded-full border px-2 py-0 text-[11px] font-medium',
                            NOTIFICATION_COLORS[n.type],
                            'border-current/20 bg-current/5'
                          )}>
                            {NOTIFICATION_LABEL[n.type]}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed">{n.message}</p>
                      </div>
                      <span className="text-xs text-muted-foreground/60 shrink-0 mt-0.5 whitespace-nowrap">
                        {formatTime(n.createdAt)}
                      </span>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-between pt-1">
                      <div className="flex items-center gap-2">
                        {!n.read && (
                          <button
                            onClick={() => handleMarkRead(n)}
                            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <Circle className="h-3 w-3" />
                            標為已讀
                          </button>
                        )}
                        {n.read && (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground/50">
                            <CheckCircle className="h-3 w-3" />
                            已讀
                          </span>
                        )}
                      </div>
                      {canNavigate && (
                        <button
                          onClick={() => handleNavigate(n)}
                          className="inline-flex items-center gap-1 text-xs text-primary font-medium hover:underline"
                        >
                          查看專案
                          <ArrowRight className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
