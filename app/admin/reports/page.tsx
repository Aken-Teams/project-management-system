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
  'report.schedule.dayOfWeek',
  'report.schedule.hour',
  'report.email.subject',
  'report.email.body',
]

const DEFAULTS = {
  'report.schedule.dayOfWeek': '5',
  'report.schedule.hour': '8',
  'report.email.subject': '{{date}} 專案週報 - {{reportCount}} 個專案',
  'report.email.body': '您好，\n\n附件為本週（{{date}}）的專案進度週報，共 {{reportCount}} 個專案。\n\n如有疑問，請聯繫各專案負責人。\n\n謝謝',
}

export default function AdminReportsPage() {
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
        toast({ title: '已儲存', description: '報告設定已更新' })
      }
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">載入中...</p>

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-base font-semibold">報告設定</h2>
        <p className="text-sm text-muted-foreground mt-0.5">設定自動週報的寄送排程與郵件範本</p>
      </div>

      {/* Schedule */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">自動報告排程</CardTitle>
          <CardDescription className="text-xs">設定後由排程系統自動觸發，需搭配外部 cron job</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">星期幾發送</Label>
            <Select value={settings['report.schedule.dayOfWeek']} onValueChange={v => set('report.schedule.dayOfWeek', v)}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DAY_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">幾點發送</Label>
            <Select value={settings['report.schedule.hour']} onValueChange={v => set('report.schedule.hour', v)}>
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

      {/* Email template */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">郵件範本</CardTitle>
          <CardDescription className="text-xs">
            可用變數：<code className="bg-muted px-1 rounded">{'{{date}}'}</code>、<code className="bg-muted px-1 rounded">{'{{reportCount}}'}</code>、<code className="bg-muted px-1 rounded">{'{{projectName}}'}</code>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">郵件主旨</Label>
            <Input
              value={settings['report.email.subject']}
              onChange={e => set('report.email.subject', e.target.value)}
              className="h-9 text-sm"
              placeholder="郵件主旨"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">郵件內文</Label>
            <Textarea
              value={settings['report.email.body']}
              onChange={e => set('report.email.body', e.target.value)}
              rows={6}
              className="text-sm"
              placeholder="郵件內文"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>{saving ? '儲存中...' : '儲存設定'}</Button>
      </div>
    </div>
  )
}
