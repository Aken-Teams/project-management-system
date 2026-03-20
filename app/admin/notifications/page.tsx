'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/lib/auth-context'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { Bell, CheckCircle2, AlertCircle, Info, Clock, Mail, MailX, Settings2 } from 'lucide-react'
import { TemplateTextarea, applyTemplateSamples, type VariableDef } from '@/components/template-textarea'

const DAY_OPTIONS = [
  { value: '1', label: '週一' }, { value: '2', label: '週二' }, { value: '3', label: '週三' },
  { value: '4', label: '週四' }, { value: '5', label: '週五' }, { value: '6', label: '週六' }, { value: '0', label: '週日' },
]
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => ({ value: String(i), label: `${String(i).padStart(2, '0')}:00` }))
const FREQUENCY_OPTIONS = [
  { value: '1', label: '每週' },
  { value: '2', label: '每 2 週' },
  { value: '4', label: '每 4 週' },
]

const NOTIF_VARIABLES: VariableDef[] = [
  { name: 'projectName', label: '專案名稱', sample: '條碼自動化' },
  { name: 'weekOf', label: '週次', sample: '2026-03-09' },
  { name: 'pmName', label: '負責人', sample: 'Alice Chen' },
]

const DEFAULT_TEMPLATES = {
  notifyTitle: '週報尚未上傳',
  notifyMessage: '【{{projectName}}】本週進度尚未更新，請盡快上傳週報。',
  uploadedTitle: '週報已產生',
  uploadedMessage: '【{{projectName}}】本週週報已產生，請至更新紀錄確認。',
  emailSubject: '【週報提醒】{{projectName}} 本週（{{weekOf}}）尚未上傳',
  emailBody: '{{pmName}} 您好，\n\n【{{projectName}}】本週（{{weekOf}}）的進度週報尚未上傳，請盡快完成上傳。\n\n如已上傳請忽略此信。\n\n謝謝',
}

interface Profile {
  id: string
  projectTier: string | null
  frequencyWeeks: number
  dayOfWeek: number
  hour: number
  notifyTitle: string | null
  notifyMessage: string | null
  uploadedTitle: string | null
  uploadedMessage: string | null
  emailSubject: string | null
  emailBody: string | null
}

// ── Preview components ────────────────────────────────────────────────────

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
            <p className="text-sm font-semibold text-foreground leading-snug">{title || '（標題為空）'}</p>
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed whitespace-pre-wrap">{message || '（內容為空）'}</p>
            <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>自動發送</span>
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

function EmailNotificationPreview({ subject, body }: { subject: string; body: string }) {
  return (
    <div className="rounded-xl border shadow-sm overflow-hidden bg-white">
      <div className="bg-slate-100 px-4 py-2 flex items-center gap-2 border-b text-xs text-muted-foreground">
        <Mail className="h-3.5 w-3.5" />
        <span>信件通知</span>
      </div>
      <div className="bg-white divide-y divide-border/60">
        <div className="grid grid-cols-[40px_1fr] px-4 py-2 text-xs">
          <span className="text-muted-foreground self-start pt-0.5">主旨</span>
          <span className="font-semibold text-foreground">{subject || '（主旨為空）'}</span>
        </div>
      </div>
      <div className="bg-white px-4 py-4 border-t min-h-[80px]">
        <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{body || '（內容為空）'}</p>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────

export default function AdminNotificationsPage() {
  const { user } = useAuth()
  const { toast } = useToast()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Data from API
  const [defaultProfile, setDefaultProfile] = useState<Profile | null>(null)
  const [tierProfiles, setTierProfiles] = useState<Profile[]>([])
  const [tiers, setTiers] = useState<string[]>([])

  // Currently selected: 'default' or a tier like 'T1'
  const [selected, setSelected] = useState<string>('default')

  // Editing form state
  const [form, setForm] = useState({
    frequencyWeeks: 1,
    dayOfWeek: 5,
    hour: 9,
    notifyTitle: '',
    notifyMessage: '',
    uploadedTitle: '',
    uploadedMessage: '',
    emailSubject: '',
    emailBody: '',
  })

  // For tier-specific: is custom enabled?
  const [isCustom, setIsCustom] = useState(false)

  // Preview state
  const [previewType, setPreviewType] = useState<'missing' | 'ready'>('missing')
  const [previewChannel, setPreviewChannel] = useState<'app' | 'email'>('app')

  const headers = useCallback(() => ({ 'x-user-email': user?.email ?? '' }), [user])

  // Load all profiles
  const loadData = useCallback(async () => {
    if (!user) return
    try {
      const res = await fetch('/api/admin/notification-profiles', { headers: headers() })
      const data = await res.json()
      setDefaultProfile(data.defaultProfile)
      setTierProfiles(data.tierProfiles ?? [])
      setTiers(data.tiers ?? [])
    } finally {
      setLoading(false)
    }
  }, [user, headers])

  useEffect(() => { loadData() }, [loadData])

  // When selection changes, populate form
  useEffect(() => {
    if (!defaultProfile) return

    if (selected === 'default') {
      setForm({
        frequencyWeeks: defaultProfile.frequencyWeeks,
        dayOfWeek: defaultProfile.dayOfWeek,
        hour: defaultProfile.hour,
        notifyTitle: defaultProfile.notifyTitle ?? DEFAULT_TEMPLATES.notifyTitle,
        notifyMessage: defaultProfile.notifyMessage ?? DEFAULT_TEMPLATES.notifyMessage,
        uploadedTitle: defaultProfile.uploadedTitle ?? DEFAULT_TEMPLATES.uploadedTitle,
        uploadedMessage: defaultProfile.uploadedMessage ?? DEFAULT_TEMPLATES.uploadedMessage,
        emailSubject: defaultProfile.emailSubject ?? DEFAULT_TEMPLATES.emailSubject,
        emailBody: defaultProfile.emailBody ?? DEFAULT_TEMPLATES.emailBody,
      })
      setIsCustom(true) // default is always "custom"
    } else {
      const tierProfile = tierProfiles.find(p => p.projectTier === selected)
      if (tierProfile) {
        setIsCustom(true)
        setForm({
          frequencyWeeks: tierProfile.frequencyWeeks,
          dayOfWeek: tierProfile.dayOfWeek,
          hour: tierProfile.hour,
          notifyTitle: tierProfile.notifyTitle ?? defaultProfile.notifyTitle ?? DEFAULT_TEMPLATES.notifyTitle,
          notifyMessage: tierProfile.notifyMessage ?? defaultProfile.notifyMessage ?? DEFAULT_TEMPLATES.notifyMessage,
          uploadedTitle: tierProfile.uploadedTitle ?? defaultProfile.uploadedTitle ?? DEFAULT_TEMPLATES.uploadedTitle,
          uploadedMessage: tierProfile.uploadedMessage ?? defaultProfile.uploadedMessage ?? DEFAULT_TEMPLATES.uploadedMessage,
          emailSubject: tierProfile.emailSubject ?? defaultProfile.emailSubject ?? DEFAULT_TEMPLATES.emailSubject,
          emailBody: tierProfile.emailBody ?? defaultProfile.emailBody ?? DEFAULT_TEMPLATES.emailBody,
        })
      } else {
        setIsCustom(false)
        // Show default values (read-only preview)
        setForm({
          frequencyWeeks: defaultProfile.frequencyWeeks,
          dayOfWeek: defaultProfile.dayOfWeek,
          hour: defaultProfile.hour,
          notifyTitle: defaultProfile.notifyTitle ?? DEFAULT_TEMPLATES.notifyTitle,
          notifyMessage: defaultProfile.notifyMessage ?? DEFAULT_TEMPLATES.notifyMessage,
          uploadedTitle: defaultProfile.uploadedTitle ?? DEFAULT_TEMPLATES.uploadedTitle,
          uploadedMessage: defaultProfile.uploadedMessage ?? DEFAULT_TEMPLATES.uploadedMessage,
          emailSubject: defaultProfile.emailSubject ?? DEFAULT_TEMPLATES.emailSubject,
          emailBody: defaultProfile.emailBody ?? DEFAULT_TEMPLATES.emailBody,
        })
      }
    }
  }, [selected, defaultProfile, tierProfiles])

  const set = (key: keyof typeof form, value: string | number) =>
    setForm(prev => ({ ...prev, [key]: value }))

  const handleSave = async () => {
    if (!user) return
    setSaving(true)
    try {
      const endpoint = selected === 'default'
        ? '/api/admin/notification-profiles/default'
        : `/api/admin/notification-profiles/${selected}`

      const res = await fetch(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...headers() },
        body: JSON.stringify(form),
      })

      if (res.ok) {
        toast({ title: '已儲存', description: '通知設定已更新' })
        await loadData()
      }
    } finally {
      setSaving(false)
    }
  }

  const handleToggleCustom = async (enabled: boolean) => {
    if (!user || !defaultProfile) return

    if (!enabled) {
      // Delete the tier-specific profile
      setSaving(true)
      try {
        await fetch(`/api/admin/notification-profiles/${selected}`, {
          method: 'DELETE',
          headers: headers(),
        })
        toast({ title: '已移除', description: '已改為使用預設設定' })
        await loadData()
      } finally {
        setSaving(false)
      }
    } else {
      // Create with suggested defaults per tier
      // T1 defaults to weekly (1), T2/T3/CIP default to biweekly (2)
      const suggestedFrequency = selected === 'T1' ? 1 : 2
      setIsCustom(true)
      setForm({
        frequencyWeeks: suggestedFrequency,
        dayOfWeek: defaultProfile.dayOfWeek,
        hour: defaultProfile.hour,
        notifyTitle: defaultProfile.notifyTitle ?? DEFAULT_TEMPLATES.notifyTitle,
        notifyMessage: defaultProfile.notifyMessage ?? DEFAULT_TEMPLATES.notifyMessage,
        uploadedTitle: defaultProfile.uploadedTitle ?? DEFAULT_TEMPLATES.uploadedTitle,
        uploadedMessage: defaultProfile.uploadedMessage ?? DEFAULT_TEMPLATES.uploadedMessage,
        emailSubject: defaultProfile.emailSubject ?? DEFAULT_TEMPLATES.emailSubject,
        emailBody: defaultProfile.emailBody ?? DEFAULT_TEMPLATES.emailBody,
      })
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">載入中...</p>

  const isDefault = selected === 'default'
  const isEditable = isDefault || isCustom

  // Build preview
  const templateKey = previewType === 'missing' ? 'notify' : 'uploaded'
  const previewTitle = applyTemplateSamples(
    form[`${templateKey}Title` as keyof typeof form] as string ?? '',
    NOTIF_VARIABLES,
  )
  const previewMessage = applyTemplateSamples(
    form[`${templateKey}Message` as keyof typeof form] as string ?? '',
    NOTIF_VARIABLES,
  )
  const previewEmailSubject = applyTemplateSamples(form.emailSubject ?? '', NOTIF_VARIABLES)
  const previewEmailBody = applyTemplateSamples(form.emailBody ?? '', NOTIF_VARIABLES)

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">通知設定</h2>
        <p className="text-sm text-muted-foreground mt-0.5">設定週報通知的觸發時間與訊息內容，可依專案層級個別調整</p>
      </div>

      <div className="grid grid-cols-[200px_1fr_300px] gap-4 items-start">

        {/* ── Left sidebar: profile list ── */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">通知配置</CardTitle>
          </CardHeader>
          <CardContent className="p-2">
            <div className="space-y-0.5">
              {/* Default */}
              <button
                className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center gap-2 ${
                  selected === 'default' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted/50'
                }`}
                onClick={() => setSelected('default')}
              >
                <Settings2 className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">預設設定</span>
              </button>

              {/* Divider */}
              {tiers.length > 0 && (
                <div className="px-3 py-1.5">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">依層級覆寫</span>
                </div>
              )}

              {/* Project tiers */}
              {tiers.map(tier => {
                const hasCustom = tierProfiles.some(p => p.projectTier === tier)
                const isSelected = selected === tier
                return (
                  <button
                    key={tier}
                    className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center gap-2 ${
                      isSelected ? 'bg-primary text-primary-foreground' : 'hover:bg-muted/50'
                    }`}
                    onClick={() => setSelected(tier)}
                  >
                    <span className="truncate flex-1">{tier}</span>
                    {hasCustom && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${
                        isSelected ? 'bg-white/20' : 'bg-blue-100 text-blue-600'
                      }`}>
                        自訂
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* ── Center: editor ── */}
        <div className="space-y-4">
          {/* Info banner */}
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

          {/* Custom toggle for tier-specific */}
          {!isDefault && (
            <Card>
              <CardContent className="py-3 px-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">使用自訂設定</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {isCustom ? `「${selected}」使用獨立的通知設定` : `「${selected}」目前使用預設設定`}
                    </p>
                  </div>
                  <Switch checked={isCustom} onCheckedChange={handleToggleCustom} />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Schedule + Frequency */}
          <Card className={!isEditable ? 'opacity-60' : ''}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">排程設定</CardTitle>
              <CardDescription className="text-xs">通知頻率與發送時間</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">頻率</Label>
                <Select
                  value={String(form.frequencyWeeks)}
                  onValueChange={v => set('frequencyWeeks', parseInt(v))}
                  disabled={!isEditable}
                >
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FREQUENCY_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">星期幾</Label>
                <Select
                  value={String(form.dayOfWeek)}
                  onValueChange={v => set('dayOfWeek', parseInt(v))}
                  disabled={!isEditable}
                >
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>{DAY_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">幾點</Label>
                <Select
                  value={String(form.hour)}
                  onValueChange={v => set('hour', parseInt(v))}
                  disabled={!isEditable}
                >
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>{HOUR_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Templates */}
          <Card className={!isEditable ? 'opacity-60' : ''}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">通知訊息範本</CardTitle>
              <CardDescription className="text-xs">輸入 <code className="bg-muted px-1 rounded">{'{{'}</code> 可自動補全變數</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Variable reference */}
              <div className="flex flex-wrap gap-1.5 rounded-md border border-dashed bg-muted/20 px-3 py-2">
                <span className="self-center text-xs text-muted-foreground mr-1">可用變數：</span>
                {NOTIF_VARIABLES.map(v => (
                  <span key={v.name} className="inline-flex items-center gap-1 rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700 font-mono">
                    {`{{${v.name}}}`}
                    <span className="text-blue-500 font-sans ml-0.5">= {v.label}</span>
                  </span>
                ))}
              </div>

              {/* 站內通知 */}
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
                        value={form.notifyTitle}
                        onChange={e => set('notifyTitle', e.target.value)}
                        className="h-9 text-sm"
                        disabled={!isEditable}
                        onFocus={() => { setPreviewType('missing'); setPreviewChannel('app') }}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">通知內容</Label>
                      <TemplateTextarea
                        value={form.notifyMessage}
                        onChange={v => set('notifyMessage', v)}
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
                        value={form.uploadedTitle}
                        onChange={e => set('uploadedTitle', e.target.value)}
                        className="h-9 text-sm"
                        disabled={!isEditable}
                        onFocus={() => { setPreviewType('ready'); setPreviewChannel('app') }}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">通知內容</Label>
                      <TemplateTextarea
                        value={form.uploadedMessage}
                        onChange={v => set('uploadedMessage', v)}
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

              {/* Email 通知 */}
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
                      value={form.emailSubject}
                      onChange={v => set('emailSubject', v)}
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
                      value={form.emailBody}
                      onChange={v => set('emailBody', v)}
                      variables={NOTIF_VARIABLES}
                      rows={7}
                      showPreview={false}
                      showVariableChips={false}
                      onFocus={() => { setPreviewType('missing'); setPreviewChannel('email') }}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {isEditable && (
            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={saving}>{saving ? '儲存中...' : '儲存設定'}</Button>
            </div>
          )}
        </div>

        {/* ── Right: live preview ── */}
        <div className="sticky top-4 space-y-3">
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
              {previewType === 'ready' ? <MailX className="h-3 w-3" /> : <Mail className="h-3 w-3" />}
              信件通知
              {previewType === 'ready' && <span className="ml-1 opacity-60">（不發送）</span>}
            </button>
          </div>

          {previewChannel === 'app' || previewType === 'ready' ? (
            <NotificationPreview title={previewTitle} message={previewMessage} type={previewType} />
          ) : (
            <EmailNotificationPreview subject={previewEmailSubject} body={previewEmailBody} />
          )}

          {/* Schedule info */}
          <div className="rounded-lg border bg-muted/20 p-3 space-y-1">
            <p className="text-xs font-medium text-muted-foreground">排程資訊</p>
            <p className="text-xs text-muted-foreground">
              頻率：{FREQUENCY_OPTIONS.find(o => o.value === String(form.frequencyWeeks))?.label ?? '每週'}
            </p>
            <p className="text-xs text-muted-foreground">
              時間：{DAY_OPTIONS.find(o => o.value === String(form.dayOfWeek))?.label ?? '週五'} {String(form.hour).padStart(2, '0')}:00
            </p>
            {!isDefault && !isCustom && (
              <p className="text-xs text-blue-600 mt-1">使用預設設定</p>
            )}
          </div>

          <p className="text-xs text-muted-foreground text-center">以上為模擬預覽，實際通知以實際結果為準</p>
        </div>
      </div>
    </div>
  )
}
