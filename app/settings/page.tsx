'use client'

import { useState, useEffect } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { useTheme } from 'next-themes'
import { useNotificationStore } from '@/lib/notification-store'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  Sun,
  Moon,
  Monitor,
  Bell,
  Trash2,
  RotateCcw,
  Globe,
  Palette,
  AlertTriangle,
} from 'lucide-react'

const NOTIF_PREFS_KEY = 'pm-system-notification-prefs'

interface NotificationPrefs {
  taskAssigned: boolean
  delaySubmitted: boolean
  delayReviewed: boolean
  taskOverdue: boolean
  supportNeeded: boolean
}

const defaultPrefs: NotificationPrefs = {
  taskAssigned: true,
  delaySubmitted: true,
  delayReviewed: true,
  taskOverdue: true,
  supportNeeded: true,
}

function loadPrefs(): NotificationPrefs {
  if (typeof window === 'undefined') return defaultPrefs
  try {
    const stored = localStorage.getItem(NOTIF_PREFS_KEY)
    if (stored) return { ...defaultPrefs, ...JSON.parse(stored) }
  } catch { /* ignore */ }
  return defaultPrefs
}

export default function SettingsPage() {
  const { theme, setTheme } = useTheme()
  const { clearAll: clearNotifications } = useNotificationStore()
  const [mounted, setMounted] = useState(false)
  const [prefs, setPrefs] = useState<NotificationPrefs>(defaultPrefs)

  useEffect(() => {
    setMounted(true)
    setPrefs(loadPrefs())
  }, [])

  const updatePref = (key: keyof NotificationPrefs, value: boolean) => {
    const next = { ...prefs, [key]: value }
    setPrefs(next)
    localStorage.setItem(NOTIF_PREFS_KEY, JSON.stringify(next))
  }

  const handleResetData = () => {
    localStorage.removeItem('pm-system-projects')
    localStorage.removeItem('pm-system-version')
    localStorage.removeItem('pm-system-notifications')
    localStorage.removeItem('pm-system-notifications-version')
    localStorage.removeItem('pm-system-notification-prefs')
    localStorage.removeItem('currentUser')
    localStorage.removeItem('sidebar-collapsed')
    window.location.href = '/login'
  }

  const handleClearNotifications = () => {
    clearNotifications()
    toast.success('通知已清除')
  }

  const themes = [
    { value: 'light', label: '淺色', icon: Sun },
    { value: 'dark', label: '深色', icon: Moon },
    { value: 'system', label: '系統', icon: Monitor },
  ] as const

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">設定</h1>
          <p className="text-sm text-muted-foreground mt-1">管理應用程式偏好設定</p>
        </div>

        {/* Appearance */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Palette className="h-4 w-4 text-muted-foreground" />
              外觀設定
            </CardTitle>
            <CardDescription className="text-sm">選擇您偏好的主題模式</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <Label className="text-sm text-muted-foreground">主題</Label>
              <div className="flex items-center gap-2">
                {themes.map(t => {
                  const Icon = t.icon
                  const isActive = mounted && theme === t.value
                  return (
                    <button
                      key={t.value}
                      onClick={() => setTheme(t.value)}
                      className={cn(
                        'flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-all',
                        isActive
                          ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                          : 'hover:bg-muted text-muted-foreground'
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {t.label}
                    </button>
                  )
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Language */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Globe className="h-4 w-4 text-muted-foreground" />
              語言設定
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">顯示語言</p>
                <p className="text-sm text-muted-foreground mt-0.5">目前僅支援繁體中文</p>
              </div>
              <Badge variant="secondary" className="text-sm">繁體中文</Badge>
            </div>
          </CardContent>
        </Card>

        {/* Notification Preferences */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Bell className="h-4 w-4 text-muted-foreground" />
              通知偏好
            </CardTitle>
            <CardDescription className="text-sm">選擇要接收的通知類型</CardDescription>
          </CardHeader>
          <CardContent className="space-y-0 divide-y">
            {([
              { key: 'taskAssigned' as const, label: '任務指派通知', desc: '當有新任務指派給您時通知' },
              { key: 'delaySubmitted' as const, label: '延期申請通知', desc: '當有新的延期申請待審核時通知' },
              { key: 'delayReviewed' as const, label: '審核結果通知', desc: '當您的延期申請被核准或駁回時通知' },
              { key: 'taskOverdue' as const, label: '逾期提醒', desc: '當任務超過截止日期時提醒' },
              { key: 'supportNeeded' as const, label: '支援需求通知', desc: '當團隊成員需要協助時通知' },
            ]).map(item => (
              <div key={item.key} className="flex items-center justify-between py-3.5 first:pt-0 last:pb-0">
                <div>
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="text-sm text-muted-foreground mt-0.5">{item.desc}</p>
                </div>
                <Switch
                  checked={prefs[item.key]}
                  onCheckedChange={v => updatePref(item.key, v)}
                />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Data Management */}
        <Card className="border-destructive/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              資料管理
            </CardTitle>
            <CardDescription className="text-sm">管理示範資料和通知</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg border">
              <div>
                <p className="text-sm font-medium">清除通知</p>
                <p className="text-sm text-muted-foreground mt-0.5">移除所有通知紀錄</p>
              </div>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={handleClearNotifications}>
                <Trash2 className="h-3.5 w-3.5" />
                清除
              </Button>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg border border-destructive/20 bg-destructive/[0.02]">
              <div>
                <p className="text-sm font-medium">重設示範資料</p>
                <p className="text-sm text-muted-foreground mt-0.5">清除所有資料並回到初始狀態</p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" className="gap-1.5">
                    <RotateCcw className="h-3.5 w-3.5" />
                    重設
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>確認重設示範資料？</AlertDialogTitle>
                    <AlertDialogDescription>
                      此操作將清除所有專案資料、通知和設定，並將系統回復到初始狀態。此操作無法復原。
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>取消</AlertDialogCancel>
                    <AlertDialogAction onClick={handleResetData} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      確認重設
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}
