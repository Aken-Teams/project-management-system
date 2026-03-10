'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/lib/auth-context'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { Info } from 'lucide-react'

const DAY_OPTIONS = [
  { value: '1', label: '週一' },
  { value: '2', label: '週二' },
  { value: '3', label: '週三' },
  { value: '4', label: '週四' },
  { value: '5', label: '週五' },
  { value: '6', label: '週六' },
  { value: '0', label: '週日' },
]

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => ({
  value: String(i),
  label: `${String(i).padStart(2, '0')}:00`,
}))

const SETTING_KEYS = [
  'notification.schedule.dayOfWeek',
  'notification.schedule.hour',
  'notification.template.weekly_upload_missing.title',
  'notification.template.weekly_upload_missing.message',
  'notification.template.weekly_report_ready.title',
  'notification.template.weekly_report_ready.message',
]

const DEFAULTS = {
  'notification.schedule.dayOfWeek': '5',
  'notification.schedule.hour': '9',
  'notification.template.weekly_upload_missing.title': '週報尚未上傳',
  'notification.template.weekly_upload_missing.message': '【{{projectName}}】本週進度尚未更新，請盡快上傳週報。',
  'notification.template.weekly_report_ready.title': '週報已產生',
  'notification.template.weekly_report_ready.message': '【{{projectName}}】本週週報已產生，請至更新紀錄確認。',
}

export default function AdminNotificationsPage() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [settings, setSettings] = useState<Record<string, string>>(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const headers = useCallback(() =>
    ({ 'x-user-email': user?.email ?? '' }), [user])

  useEffect(() => {
    if (!user) return
    const keys = SETTING_KEYS.join(',')
    fetch(`/api/admin/settings?keys=${keys}`, { headers: headers() })
      .then(r => r.json())
      .then(data => {
        setSettings(prev => ({ ...prev, ...data }))
      })
      .finally(() => setLoading(false))
  }, [user, headers])

  const set = (key: string, value: string) => {
    setSettings(prev => ({ ...prev, [key]: value }))
  }

  const save = async () => {
    if (!user) return
    setSaving(true)
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...headers() },
        body: JSON.stringify(settings),
      })
      if (res.ok) {
        toast({ title: '已儲存', description: '通知設定已更新' })
      }
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">載入中...</p>

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-base font-semibold">通知設定</h2>
        <p className="text-sm text-muted-foreground mt-0.5">設定週報通知的觸發時間與訊息內容</p>
      </div>

      {/* Flow explanation */}
      <Card className="bg-blue-50/50 border-blue-100">
        <CardContent className="py-3 px-4">
          <div className="flex items-start gap-2">
            <Info className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
            <div className="text-xs text-blue-700 space-y-1">
              <p className="font-medium">通知流程</p>
              <p>系統在設定時間檢查各專案：若 PM <strong>未上傳</strong>當週進度 → 發送提醒通知；若 PM <strong>已上傳</strong> → 發送週報已產生通知。</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Schedule */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">週報通知排程</CardTitle>
          <CardDescription className="text-xs">系統在每週幾、幾點執行通知檢查</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">星期幾</Label>
            <Select value={settings['notification.schedule.dayOfWeek']} onValueChange={v => set('notification.schedule.dayOfWeek', v)}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DAY_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">幾點</Label>
            <Select value={settings['notification.schedule.hour']} onValueChange={v => set('notification.schedule.hour', v)}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HOUR_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Templates */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">通知訊息範本</CardTitle>
          <CardDescription className="text-xs">
            可用變數：<code className="bg-muted px-1 rounded">{'{{projectName}}'}</code>、<code className="bg-muted px-1 rounded">{'{{weekOf}}'}</code>、<code className="bg-muted px-1 rounded">{'{{pmName}}'}</code>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Missing upload */}
          <div className="space-y-3">
            <p className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-1 rounded">週報未上傳時</p>
            <div className="space-y-1.5">
              <Label className="text-xs">通知標題</Label>
              <Input
                value={settings['notification.template.weekly_upload_missing.title']}
                onChange={e => set('notification.template.weekly_upload_missing.title', e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">通知內容</Label>
              <Textarea
                value={settings['notification.template.weekly_upload_missing.message']}
                onChange={e => set('notification.template.weekly_upload_missing.message', e.target.value)}
                rows={2}
                className="text-sm resize-none"
              />
            </div>
          </div>

          {/* Report ready */}
          <div className="space-y-3">
            <p className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded">週報已上傳時</p>
            <div className="space-y-1.5">
              <Label className="text-xs">通知標題</Label>
              <Input
                value={settings['notification.template.weekly_report_ready.title']}
                onChange={e => set('notification.template.weekly_report_ready.title', e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">通知內容</Label>
              <Textarea
                value={settings['notification.template.weekly_report_ready.message']}
                onChange={e => set('notification.template.weekly_report_ready.message', e.target.value)}
                rows={2}
                className="text-sm resize-none"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>{saving ? '儲存中...' : '儲存設定'}</Button>
      </div>
    </div>
  )
}
