'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/lib/auth-context'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { Mail, Paperclip, Info } from 'lucide-react'
import { TemplateTextarea, applyTemplateSamples, type VariableDef } from '@/components/template-textarea'

const DAY_OPTIONS = [
  { value: '1', label: '週一' }, { value: '2', label: '週二' }, { value: '3', label: '週三' },
  { value: '4', label: '週四' }, { value: '5', label: '週五' }, { value: '6', label: '週六' }, { value: '0', label: '週日' },
]
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => ({ value: String(i), label: `${String(i).padStart(2, '0')}:00` }))

const SETTING_KEYS = [
  'report.schedule.dayOfWeek', 'report.schedule.hour',
  'report.email.subject', 'report.email.body',
]
const DEFAULTS = {
  'report.schedule.dayOfWeek': '5',
  'report.schedule.hour': '8',
  'report.email.subject': '{{date}} 專案週報 - {{reportCount}} 個專案',
  'report.email.body': '您好，\n\n附件為本週（{{date}}）的專案進度週報，共 {{reportCount}} 個專案。\n\n如有疑問，請聯繫各專案負責人。\n\n謝謝',
}
const REPORT_VARIABLES: VariableDef[] = [
  { name: 'date', label: '日期', sample: '2026-03-14' },
  { name: 'reportCount', label: '專案數', sample: '6' },
  { name: 'projectName', label: '專案名稱', sample: '條碼自動化' },
]

// ── Email client preview ───────────────────────────────────────────────────
function EmailPreview({ subject, body, recipients }: { subject: string; body: string; recipients: string }) {
  const toList = recipients
    .split(',')
    .map(e => e.trim())
    .filter(e => e.includes('@'))

  const displayTo = toList.length > 0
    ? toList.slice(0, 2).join(', ') + (toList.length > 2 ? ` +${toList.length - 2}` : '')
    : '主管角色用戶（自動）'

  const dateStr = new Date().toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric', weekday: 'short' })
  const timeStr = new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="rounded-xl border shadow-sm overflow-hidden text-sm bg-white">
      {/* Email client chrome */}
      <div className="bg-slate-100 px-4 py-2.5 flex items-center gap-2 border-b">
        <Mail className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs text-muted-foreground font-medium">郵件預覽</span>
      </div>

      {/* Header fields */}
      <div className="bg-white border-b divide-y divide-border/60">
        <div className="grid grid-cols-[40px_1fr] px-4 py-2 text-xs">
          <span className="text-muted-foreground self-start pt-0.5">寄件</span>
          <span className="text-foreground">專案管理系統 &lt;noreply@system&gt;</span>
        </div>
        <div className="grid grid-cols-[40px_1fr] px-4 py-2 text-xs">
          <span className="text-muted-foreground self-start pt-0.5">收件</span>
          <span className="text-foreground break-all">{displayTo}</span>
        </div>
        <div className="grid grid-cols-[40px_1fr] px-4 py-2 text-xs">
          <span className="text-muted-foreground self-start pt-0.5">主旨</span>
          <span className="font-semibold text-foreground">{subject || '（主旨為空）'}</span>
        </div>
        <div className="grid grid-cols-[40px_1fr] px-4 py-1.5 text-xs">
          <span className="text-muted-foreground" />
          <span className="text-muted-foreground">{dateStr} {timeStr}</span>
        </div>
      </div>

      {/* Email body */}
      <div className="bg-white px-4 py-4 min-h-[100px]">
        {body ? (
          <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
            {body}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground italic">（內文為空）</p>
        )}
      </div>

      {/* PDF attachment */}
      <div className="bg-muted/30 border-t px-4 py-3">
        <div className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-red-100 shrink-0">
            <Paperclip className="h-4 w-4 text-red-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-foreground truncate">專案週報_20260314.pdf</p>
            <p className="text-xs text-muted-foreground">PDF 附件 · 由系統自動生成</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function AdminReportsPage() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [settings, setSettings] = useState<Record<string, string>>(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

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
      if (res.ok) toast({ title: '已儲存', description: '報告設定已更新' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">載入中...</p>

  // Live preview with sample data substituted
  const previewSubject = applyTemplateSamples(settings['report.email.subject'] ?? '', REPORT_VARIABLES)
  const previewBody = applyTemplateSamples(settings['report.email.body'] ?? '', REPORT_VARIABLES)

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">報告設定</h2>
        <p className="text-sm text-muted-foreground mt-0.5">設定自動週報的寄送排程與郵件範本</p>
      </div>

      <div className="grid grid-cols-[1fr_320px] gap-6 items-start">

            {/* Left: settings */}
            <div className="space-y-5">
              {/* Info banner */}
              <Card className="bg-blue-50/50 border-blue-100">
                <CardContent className="py-3 px-4">
                  <div className="flex items-start gap-2">
                    <Info className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                    <p className="text-xs text-blue-700">
                      系統在設定時間自動匯出所有專案週報 PDF，並寄送給主管及指定收件人。
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Schedule */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">自動報告排程</CardTitle>
                  <CardDescription className="text-xs">系統啟動後自動排程，修改時間後即時生效（下一個整點套用）</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">星期幾發送</Label>
                    <Select value={settings['report.schedule.dayOfWeek']} onValueChange={v => set('report.schedule.dayOfWeek', v)}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>{DAY_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">幾點發送</Label>
                    <Select value={settings['report.schedule.hour']} onValueChange={v => set('report.schedule.hour', v)}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>{HOUR_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              {/* Email template */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">郵件範本</CardTitle>
                  <CardDescription className="text-xs">輸入 <code className="bg-muted px-1 rounded">{'{{'}</code> 可自動補全以下變數</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Variable reference — shown once */}
                  <div className="flex flex-wrap gap-1.5 rounded-md border border-dashed bg-muted/20 px-3 py-2">
                    <span className="self-center text-xs text-muted-foreground mr-1">可用變數：</span>
                    {REPORT_VARIABLES.map(v => (
                      <span key={v.name} className="inline-flex items-center gap-1 rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700 font-mono">
                        {`{{${v.name}}}`}
                        <span className="text-blue-500 font-sans ml-0.5">= {v.label}</span>
                      </span>
                    ))}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">郵件主旨</Label>
                    <TemplateTextarea
                      value={settings['report.email.subject']}
                      onChange={v => set('report.email.subject', v)}
                      variables={REPORT_VARIABLES}
                      placeholder="郵件主旨"
                      singleLine
                      showPreview={false}
                      showVariableChips={false}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">郵件內文</Label>
                    <TemplateTextarea
                      value={settings['report.email.body']}
                      onChange={v => set('report.email.body', v)}
                      variables={REPORT_VARIABLES}
                      rows={9}
                      placeholder="郵件內文"
                      showPreview={false}
                      showVariableChips={false}
                    />
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-end">
                <Button onClick={save} disabled={saving}>{saving ? '儲存中...' : '儲存設定'}</Button>
              </div>
            </div>

            {/* Right: sticky email preview */}
            <div className="sticky top-4 space-y-3">
              <p className="text-sm font-medium">郵件預覽</p>
              <EmailPreview
                subject={previewSubject}
                body={previewBody}
                recipients={settings['report.email.recipients'] ?? ''}
              />
              <p className="text-xs text-muted-foreground text-center">以上為模擬預覽，實際郵件以實際結果為準</p>
            </div>
          </div>
    </div>
  )
}
