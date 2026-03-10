'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/lib/auth-context'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { Plus, Trash2, RotateCcw } from 'lucide-react'
import { PROJECT_TYPE_LABELS } from '@/lib/mock-data'
import type { ProjectType } from '@/lib/mock-data'

interface TemplateSummary {
  projectType: ProjectType
  label: string
  count: number
  isCustomized: boolean
}

interface TemplateRow {
  id?: string
  name: string
  durationDays: number
}

interface TypeDetail {
  projectType: string
  isCustomized: boolean
  templates: TemplateRow[]
}

export default function AdminProjectSettingsPage() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [summaries, setSummaries] = useState<TemplateSummary[]>([])
  const [selected, setSelected] = useState<ProjectType | null>(null)
  const [detail, setDetail] = useState<TypeDetail | null>(null)
  const [editing, setEditing] = useState<TemplateRow[]>([])
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [saving, setSaving] = useState(false)

  const headers = useCallback(() =>
    ({ 'x-user-email': user?.email ?? '' }), [user])

  useEffect(() => {
    if (!user) return
    fetch('/api/admin/milestone-templates', { headers: headers() })
      .then(r => r.json())
      .then(setSummaries)
  }, [user, headers])

  const selectType = async (type: ProjectType) => {
    if (!user) return
    setSelected(type)
    setLoadingDetail(true)
    try {
      const res = await fetch(`/api/admin/milestone-templates/${type}`, { headers: headers() })
      const data: TypeDetail = await res.json()
      setDetail(data)
      setEditing(data.templates.map(t => ({ ...t })))
    } finally {
      setLoadingDetail(false)
    }
  }

  const addRow = () => {
    setEditing(prev => [...prev, { name: '', durationDays: 14 }])
  }

  const removeRow = (i: number) => {
    setEditing(prev => prev.filter((_, idx) => idx !== i))
  }

  const updateRow = (i: number, field: 'name' | 'durationDays', value: string | number) => {
    setEditing(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: value } : r))
  }

  const save = async () => {
    if (!user || !selected) return
    if (editing.some(r => !r.name.trim())) {
      toast({ title: '請填寫所有里程碑名稱', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/milestone-templates/${selected}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...headers() },
        body: JSON.stringify({ templates: editing.map(r => ({ name: r.name, durationDays: Number(r.durationDays) })) }),
      })
      if (res.ok) {
        const data: TypeDetail = await res.json()
        setDetail(data)
        setEditing(data.templates.map(t => ({ ...t })))
        setSummaries(prev => prev.map(s =>
          s.projectType === selected ? { ...s, isCustomized: data.isCustomized, count: data.templates.length } : s
        ))
        toast({ title: '已儲存', description: `${PROJECT_TYPE_LABELS[selected]} 里程碑範本已更新` })
      }
    } finally {
      setSaving(false)
    }
  }

  const reset = async () => {
    if (!user || !selected) return
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/milestone-templates/${selected}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...headers() },
        body: JSON.stringify({ templates: [] }),
      })
      if (res.ok) {
        const data: TypeDetail = await res.json()
        setDetail(data)
        setEditing(data.templates.map(t => ({ ...t })))
        setSummaries(prev => prev.map(s =>
          s.projectType === selected ? { ...s, isCustomized: false, count: data.templates.length } : s
        ))
        toast({ title: '已重設', description: `已還原為預設範本` })
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">專案設定</h2>
        <p className="text-sm text-muted-foreground mt-0.5">編輯各專案類型的里程碑範本，新建專案時將套用對應範本</p>
      </div>

      <div className="grid grid-cols-[240px_1fr] gap-4 items-start">
        {/* Left: type list */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">專案類型</CardTitle>
          </CardHeader>
          <CardContent className="p-2">
            <div className="space-y-0.5">
              {summaries.map(s => (
                <button
                  key={s.projectType}
                  onClick={() => selectType(s.projectType)}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center justify-between gap-2 ${
                    selected === s.projectType
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-muted/50'
                  }`}
                >
                  <span className="truncate">{s.label}</span>
                  {s.isCustomized && (
                    <Badge
                      variant="secondary"
                      className={`text-[10px] px-1.5 shrink-0 ${selected === s.projectType ? 'bg-primary-foreground/20 text-primary-foreground' : ''}`}
                    >
                      自訂
                    </Badge>
                  )}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Right: editor */}
        {!selected ? (
          <Card>
            <CardContent className="py-16 text-center text-muted-foreground text-sm">
              選擇左側專案類型以編輯里程碑範本
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm">{PROJECT_TYPE_LABELS[selected]}</CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    {detail?.isCustomized ? '使用自訂範本' : '使用預設範本'}
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  {detail?.isCustomized && (
                    <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={reset} disabled={saving}>
                      <RotateCcw className="h-3 w-3" />重設為預設
                    </Button>
                  )}
                  <Button size="sm" className="h-8 text-xs" onClick={save} disabled={saving}>
                    {saving ? '儲存中...' : '儲存'}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {loadingDetail ? (
                <p className="text-sm text-muted-foreground py-4 text-center">載入中...</p>
              ) : (
                <>
                  <div className="grid grid-cols-[1fr_100px_36px] gap-2 text-xs text-muted-foreground px-1 mb-1">
                    <span>里程碑名稱</span>
                    <span>天數</span>
                    <span />
                  </div>
                  {editing.map((row, i) => (
                    <div key={i} className="grid grid-cols-[1fr_100px_36px] gap-2 items-center">
                      <Input
                        value={row.name}
                        onChange={e => updateRow(i, 'name', e.target.value)}
                        placeholder="里程碑名稱"
                        className="h-8 text-sm"
                      />
                      <Input
                        type="number"
                        min={1}
                        value={row.durationDays}
                        onChange={e => updateRow(i, 'durationDays', parseInt(e.target.value) || 1)}
                        className="h-8 text-sm"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => removeRow(i)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" className="h-8 text-xs gap-1 mt-2" onClick={addRow}>
                    <Plus className="h-3.5 w-3.5" />新增里程碑
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
