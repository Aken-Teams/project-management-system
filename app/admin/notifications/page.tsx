'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/lib/auth-context'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/hooks/use-toast'
import { Bell, CheckCircle2, AlertCircle, Info, Clock, Mail, MailX } from 'lucide-react'
import { TemplateTextarea, applyTemplateSamples, type VariableDef } from '@/components/template-textarea'
import { CronScheduleView } from '@/components/admin/cron-schedule-view'

const DAY_OPTIONS = [
  { value: '1', label: '週一' }, { value: '2', label: '週二' }, { value: '3', label: '週三' },
  { value: '4', label: '週四' }, { value: '5', label: '週五' }, { value: '6', label: '週六' }, { value: '0', label: '週日' },
]
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => ({ value: String(i), label: `${String(i).padStart(2, '0')}:00` }))

const SETTING_KEYS = [
  'notification.schedule.dayOfWeek', 'notification.schedule.hour',
  'notification.template.weekly_upload_missing.title', 'notification.template.weekly_upload_missing.message',
  'notification.template.weekly_upload_missing.email_subject', 'notification.template.weekly_upload_missing.email_body',
  'notification.template.weekly_report_ready.title', 'notification.template.weekly_report_ready.message',
]
const DEFAULTS = {
  'notification.schedule.dayOfWeek': '5', 'notification.schedule.hour': '9',
  'notification.template.weekly_upload_missing.title': '週報尚未上傳',
  'notification.template.weekly_upload_missing.message': '【{{projectName}}】本週進度尚未更新，請盡快上傳週報。',
  'notification.template.weekly_upload_missing.email_subject': '【週報提醒】{{projectName}} 本週（{{weekOf}}）尚未上傳',
  'notification.template.weekly_upload_missing.email_body': '{{pmName}} 您好，\n\n【{{projectName}}】本週（{{weekOf}}）的進度週報尚未上傳，請盡快完成上傳。\n\n如已上傳請忽略此信。\n\n謝謝',
  'notification.template.weekly_report_ready.title': '週報已產生',
  'notification.template.weekly_report_ready.message': '【{{projectName}}】本週週報已產生，請至更新紀錄確認。',
}
const NOTIF_VARIABLES: VariableDef[] = [
  { name: 'projectName', label: '專案名稱', sample: '條碼自動化' },
  { name: 'weekOf', label: '週次', sample: '2026-03-09' },
  { name: 'pmName', label: '負責人', sample: 'Alice Chen' },
]

// ── In-app notification card ──────────────────────────────────────────────
function NotificationPreview({ title, message, type }: { title: string; message: string; type: 'missing' | 'ready' }) {
  const isMissing = type === 'missing'
  return (
    <div className={`rounded-xl border shadow-sm overflow-hidden ${isMissing ? 'border-amber-200' : 'border-emerald-200'}`}>
      <div className={`px-4 py-2 flex items-center gap-2 border-b text-xs text-muted-foreground ${isMissing ? 'bg-amber-50' : 'bg-emerald-50'}`}>
        <Bell className="h-3.5 w-3.5" />
        <span>系統通知</span>
        <span className="ml-auto">剛剛</span>
      </div>
      <div className={`p-4 ${isMissing ? 'bg-amber-50/30' : 'bg-emerald-50/30'}`}>
        <div className="flex gap-3">
          <div className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${isMissing ? 'bg-amber-100' : 'bg-emerald-100'}`}>
            {isMissing
              ? <AlertCircle className="h-5 w-5 text-amber-500" />
              : <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            }
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground leading-snug">
              {title || '（標題為空）'}
            </p>
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed whitespace-pre-wrap">
              {message || '（內容為空）'}
            </p>
            <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>週五 09:00 自動發送</span>
            </div>
          </div>
        </div>
      </div>
      <div className={`px-4 py-2 border-t text-xs font-medium text-center ${isMissing ? 'text-amber-600 bg-amber-50' : 'text-emerald-600 bg-emerald-50'}`}>
        {isMissing ? '點擊前往上傳週報' : '點擊查看週報'}
      </div>
    </div>
  )
}

// ── Email notification preview (missing type only) ────────────────────────
function EmailNotificationPreview({ subject, body }: { subject: string; body: string }) {
  return (
    <div className="rounded-xl border shadow-sm overflow-hidden bg-white">
      <div className="bg-slate-100 px-4 py-2 flex items-center gap-2 border-b text-xs text-muted-foreground">
        <Mail className="h-3.5 w-3.5" />
        <span>信件通知</span>
      </div>
      <div className="bg-white divide-y divide-border/60">
        <div className="grid grid-cols-[40px_1fr] px-4 py-2 text-xs">
          <span className="text-muted-foreground self-start pt-0.5">寄件</span>
          <span className="text-foreground">專案管理系統</span>
        </div>
        <div className="grid grid-cols-[40px_1fr] px-4 py-2 text-xs">
          <span className="text-muted-foreground self-start pt-0.5">收件</span>
          <span className="text-foreground">pm@example.com（專案負責人）</span>
        </div>
        <div className="grid grid-cols-[40px_1fr] px-4 py-2 text-xs">
          <span className="text-muted-foreground self-start pt-0.5">主旨</span>
          <span className="font-semibold text-foreground">{subject || '（主旨為空）'}</span>
        </div>
      </div>
      <div className="bg-white px-4 py-4 border-t min-h-[80px]">
        <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
          {body || '（內容為空）'}
        </p>
      </div>
    </div>
  )
}

export default function AdminNotificationsPage() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [settings, setSettings] = useState<Record<string, string>>(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [previewType, setPreviewType] = useState<'missing' | 'ready'>('missing')
  const [previewChannel, setPreviewChannel] = useState<'app' | 'email'>('app')

  const headers = useCallback(() => ({ 'x-user-email': user?.email ?? '' }), [user])

  useEffect(() => {
    if (!user) return
    fetch(`/api/admin/settings?keys=${SETTING_KEYS.join(',')}`, { headers: headers() })
      .then(r => r.json())
      .then(data => setSettings(prev => ({ ...prev, ...data })))
      .finally(() => setLoading(false))
  }, [user, headers])

  const set = (key: string, value: string) => setSettings(prev => ({ ...prev, [key]: value }))

  const save = async () => {
    if (!user) return
    setSaving(true)
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...headers() },
        body: JSON.stringify(settings),
      })
      if (res.ok) toast({ title: '已儲存', description: '通知設定已更新' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">載入中...</p>

  const scheduleDay = parseInt(settings['notification.schedule.dayOfWeek'] ?? '5')
  const scheduleHour = parseInt(settings['notification.schedule.hour'] ?? '9')

  const templateKey = previewType === 'missing' ? 'upload_missing' : 'report_ready'
  const previewTitle = applyTemplateSamples(
    settings[`notification.template.weekly_${templateKey}.title`] ?? '',
    NOTIF_VARIABLES
  )
  const previewMessage = applyTemplateSamples(
    settings[`notification.template.weekly_${templateKey}.message`] ?? '',
    NOTIF_VARIABLES
  )
  // Email preview uses dedicated email templates (only for missing type)
  const previewEmailSubject = applyTemplateSamples(
    settings['notification.template.weekly_upload_missing.email_subject'] ?? '',
    NOTIF_VARIABLES
  )
  const previewEmailBody = applyTemplateSamples(
    settings['notification.template.weekly_upload_missing.email_body'] ?? '',
    NOTIF_VARIABLES
  )

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">通知設定</h2>
        <p className="text-sm text-muted-foreground mt-0.5">設定週報通知的觸發時間與訊息內容</p>
      </div>

      <Tabs defaultValue="settings">
        <TabsList className="mb-4">
          <TabsTrigger value="settings">通知設定</TabsTrigger>
          <TabsTrigger value="schedule">行事曆</TabsTrigger>
        </TabsList>

        {/* ── Settings Tab ── */}
        <TabsContent value="settings">
          <div className="grid grid-cols-[1fr_320px] gap-6 items-start">

            {/* Left: settings */}
            <div className="space-y-5">
              {/* Flow */}
              <Card className="bg-blue-50/50 border-blue-100">
                <CardContent className="py-3 px-4">
                  <div className="flex items-start gap-2">
                    <Info className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                    <p className="text-xs text-blue-700">
                      系統在設定時間檢查各專案：若 PM <strong>未上傳</strong>當週進度 → 發送站內通知 + Email 提醒；若 PM <strong>已上傳</strong> → 僅發送站內通知。
                    </p>
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
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>{DAY_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">幾點</Label>
                    <Select value={settings['notification.schedule.hour']} onValueChange={v => set('notification.schedule.hour', v)}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>{HOUR_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              {/* Templates */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">通知訊息範本</CardTitle>
                  <CardDescription className="text-xs">輸入 <code className="bg-muted px-1 rounded">{'{{'}</code> 可自動補全以下變數</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Variable reference — shown once */}
                  <div className="flex flex-wrap gap-1.5 rounded-md border border-dashed bg-muted/20 px-3 py-2">
                    <span className="self-center text-xs text-muted-foreground mr-1">可用變數：</span>
                    {NOTIF_VARIABLES.map(v => (
                      <span key={v.name} className="inline-flex items-center gap-1 rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700 font-mono">
                        {`{{${v.name}}}`}
                        <span className="text-blue-500 font-sans ml-0.5">= {v.label}</span>
                      </span>
                    ))}
                  </div>

                  {/* 站內通知 section */}
                  <div className="rounded-lg border border-amber-200 overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border-b border-amber-200">
                      <Bell className="h-3.5 w-3.5 text-amber-600" />
                      <span className="text-xs font-medium text-amber-700">站內通知</span>
                    </div>
                    <div className="p-4 space-y-4">
                      {/* 未上傳 */}
                      <div className="space-y-3">
                        <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                          <span className="inline-block w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                          週報未上傳時
                        </p>
                        <div className="space-y-1.5">
                          <Label className="text-xs">通知標題</Label>
                          <Input
                            value={settings['notification.template.weekly_upload_missing.title']}
                            onChange={e => set('notification.template.weekly_upload_missing.title', e.target.value)}
                            className="h-9 text-sm"
                            onFocus={() => { setPreviewType('missing'); setPreviewChannel('app') }}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">通知內容</Label>
                          <TemplateTextarea
                            value={settings['notification.template.weekly_upload_missing.message']}
                            onChange={v => set('notification.template.weekly_upload_missing.message', v)}
                            variables={NOTIF_VARIABLES}
                            rows={2}
                            showPreview={false}
                            showVariableChips={false}
                            onFocus={() => { setPreviewType('missing'); setPreviewChannel('app') }}
                          />
                        </div>
                      </div>
                      {/* 已上傳 */}
                      <div className="border-t pt-3 space-y-3">
                        <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                          <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                          週報已上傳時
                        </p>
                        <div className="space-y-1.5">
                          <Label className="text-xs">通知標題</Label>
                          <Input
                            value={settings['notification.template.weekly_report_ready.title']}
                            onChange={e => set('notification.template.weekly_report_ready.title', e.target.value)}
                            className="h-9 text-sm"
                            onFocus={() => { setPreviewType('ready'); setPreviewChannel('app') }}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">通知內容</Label>
                          <TemplateTextarea
                            value={settings['notification.template.weekly_report_ready.message']}
                            onChange={v => set('notification.template.weekly_report_ready.message', v)}
                            variables={NOTIF_VARIABLES}
                            rows={2}
                            showPreview={false}
                            showVariableChips={false}
                            onFocus={() => { setPreviewType('ready'); setPreviewChannel('app') }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Email 通知 section */}
                  <div className="rounded-lg border border-blue-200 overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border-b border-blue-200">
                      <Mail className="h-3.5 w-3.5 text-blue-600" />
                      <span className="text-xs font-medium text-blue-700">Email 通知</span>
                      <span className="ml-auto text-xs text-blue-400">僅「週報未上傳時」發送</span>
                    </div>
                    <div className="p-4 space-y-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">信件主旨</Label>
                        <TemplateTextarea
                          value={settings['notification.template.weekly_upload_missing.email_subject']}
                          onChange={v => set('notification.template.weekly_upload_missing.email_subject', v)}
                          variables={NOTIF_VARIABLES}
                          singleLine
                          showPreview={false}
                          showVariableChips={false}
                          onFocus={() => { setPreviewType('missing'); setPreviewChannel('email') }}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">信件內文</Label>
                        <TemplateTextarea
                          value={settings['notification.template.weekly_upload_missing.email_body']}
                          onChange={v => set('notification.template.weekly_upload_missing.email_body', v)}
                          variables={NOTIF_VARIABLES}
                          rows={4}
                          showPreview={false}
                          showVariableChips={false}
                          onFocus={() => { setPreviewType('missing'); setPreviewChannel('email') }}
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-end">
                <Button onClick={save} disabled={saving}>{saving ? '儲存中...' : '儲存設定'}</Button>
              </div>
            </div>

            {/* Right: live preview panel */}
            <div className="sticky top-4 space-y-3">
              {/* Title row + type toggle */}
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">通知預覽</p>
                <div className="flex rounded-md border overflow-hidden text-xs">
                  <button
                    className={`px-2.5 py-1 transition-colors ${previewType === 'missing' ? 'bg-amber-50 text-amber-700 font-medium' : 'text-muted-foreground hover:bg-muted/50'}`}
                    onClick={() => setPreviewType('missing')}
                  >未上傳</button>
                  <button
                    className={`px-2.5 py-1 transition-colors border-l ${previewType === 'ready' ? 'bg-emerald-50 text-emerald-700 font-medium' : 'text-muted-foreground hover:bg-muted/50'}`}
                    onClick={() => setPreviewType('ready')}
                  >已上傳</button>
                </div>
              </div>

              {/* Channel toggle */}
              <div className="flex rounded-lg border overflow-hidden text-xs">
                <button
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 transition-colors ${previewChannel === 'app' ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:bg-muted/40'}`}
                  onClick={() => setPreviewChannel('app')}
                >
                  <Bell className="h-3 w-3" />
                  站內通知
                </button>
                <button
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 transition-colors border-l ${
                    previewType === 'ready'
                      ? 'text-muted-foreground/40 cursor-not-allowed bg-muted/20'
                      : previewChannel === 'email'
                        ? 'bg-muted font-medium text-foreground'
                        : 'text-muted-foreground hover:bg-muted/40'
                  }`}
                  onClick={() => previewType !== 'ready' && setPreviewChannel('email')}
                  disabled={previewType === 'ready'}
                >
                  {previewType === 'ready'
                    ? <MailX className="h-3 w-3" />
                    : <Mail className="h-3 w-3" />
                  }
                  信件通知
                  {previewType === 'ready' && <span className="ml-1 opacity-60">（不發送）</span>}
                </button>
              </div>

              {/* Preview */}
              {previewChannel === 'app' || previewType === 'ready' ? (
                <NotificationPreview title={previewTitle} message={previewMessage} type={previewType} />
              ) : (
                <EmailNotificationPreview subject={previewEmailSubject} body={previewEmailBody} />
              )}

              <p className="text-xs text-muted-foreground text-center">以上為模擬預覽，實際通知以實際結果為準</p>
            </div>
          </div>
        </TabsContent>

        {/* ── Calendar Tab ── */}
        <TabsContent value="schedule">
          <Card className="max-w-2xl">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">通知排程行事曆</CardTitle>
              <CardDescription className="text-xs">查看下次執行時間與歷史記錄</CardDescription>
            </CardHeader>
            <CardContent>
              <CronScheduleView jobType="weekly_notification" scheduleDay={scheduleDay} scheduleHour={scheduleHour} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
