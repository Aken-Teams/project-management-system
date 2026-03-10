'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/lib/auth-context'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Plus, Trash2, RotateCcw, Pencil } from 'lucide-react'

interface ProjectTypeConfig {
  key: string
  label: string
  sortOrder: number
}

interface TemplateSummary {
  projectType: string
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

  // Project types state
  const [projectTypes, setProjectTypes] = useState<ProjectTypeConfig[]>([])

  // Template state
  const [summaries, setSummaries] = useState<TemplateSummary[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [detail, setDetail] = useState<TypeDetail | null>(null)
  const [editing, setEditing] = useState<TemplateRow[]>([])
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [saving, setSaving] = useState(false)

  // Project type CRUD dialogs
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [addLabel, setAddLabel] = useState('')
  const [addSaving, setAddSaving] = useState(false)

  const [editDialog, setEditDialog] = useState<{ key: string; label: string } | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  const [deleteDialog, setDeleteDialog] = useState<{ key: string; label: string } | null>(null)
  const [deleteSaving, setDeleteSaving] = useState(false)

  const headers = useCallback(() =>
    ({ 'x-user-email': user?.email ?? '' }), [user])

  // Load project types and summaries together
  const loadData = useCallback(async () => {
    if (!user) return
    const [typesRes, summariesRes] = await Promise.all([
      fetch('/api/admin/project-types', { headers: headers() }),
      fetch('/api/admin/milestone-templates', { headers: headers() }),
    ])
    const types: ProjectTypeConfig[] = await typesRes.json()
    const sums: TemplateSummary[] = await summariesRes.json()
    setProjectTypes(types)
    setSummaries(sums)
  }, [user, headers])

  useEffect(() => { loadData() }, [loadData])

  const selectType = async (key: string) => {
    if (!user) return
    setSelected(key)
    setLoadingDetail(true)
    try {
      const res = await fetch(`/api/admin/milestone-templates/${key}`, { headers: headers() })
      const data: TypeDetail = await res.json()
      setDetail(data)
      setEditing(data.templates.map(t => ({ ...t })))
    } finally {
      setLoadingDetail(false)
    }
  }

  // ── Template row actions ──────────────────────────────
  const addRow = () => setEditing(prev => [...prev, { name: '', durationDays: 14 }])
  const removeRow = (i: number) => setEditing(prev => prev.filter((_, idx) => idx !== i))
  const updateRow = (i: number, field: 'name' | 'durationDays', value: string | number) =>
    setEditing(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: value } : r))

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
        const label = projectTypes.find(pt => pt.key === selected)?.label ?? selected
        setSummaries(prev => prev.map(s =>
          s.projectType === selected ? { ...s, isCustomized: data.isCustomized, count: data.templates.length } : s
        ))
        toast({ title: '已儲存', description: `${label} 里程碑範本已更新` })
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
        toast({ title: '已重設', description: '已還原為預設範本' })
      }
    } finally {
      setSaving(false)
    }
  }

  // ── Project type CRUD ─────────────────────────────────
  const handleAdd = async () => {
    if (!addLabel.trim()) return
    setAddSaving(true)
    try {
      const res = await fetch('/api/admin/project-types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers() },
        body: JSON.stringify({ label: addLabel.trim() }),
      })
      if (res.ok) {
        setAddDialogOpen(false)
        setAddLabel('')
        toast({ title: '已新增', description: `專案類型「${addLabel.trim()}」已建立` })
        await loadData()
      } else {
        const err = await res.json()
        toast({ title: '新增失敗', description: err.error, variant: 'destructive' })
      }
    } finally {
      setAddSaving(false)
    }
  }

  const handleEdit = async () => {
    if (!editDialog || !editLabel.trim()) return
    setEditSaving(true)
    try {
      const res = await fetch(`/api/admin/project-types/${editDialog.key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...headers() },
        body: JSON.stringify({ label: editLabel.trim() }),
      })
      if (res.ok) {
        setEditDialog(null)
        toast({ title: '已更新', description: `名稱已更新為「${editLabel.trim()}」` })
        await loadData()
        // If currently selected, update label in detail
        if (selected === editDialog.key) {
          setDetail(prev => prev ? { ...prev } : null)
        }
      } else {
        const err = await res.json()
        toast({ title: '更新失敗', description: err.error, variant: 'destructive' })
      }
    } finally {
      setEditSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteDialog) return
    setDeleteSaving(true)
    try {
      const res = await fetch(`/api/admin/project-types/${deleteDialog.key}`, {
        method: 'DELETE',
        headers: headers(),
      })
      if (res.ok) {
        if (selected === deleteDialog.key) {
          setSelected(null)
          setDetail(null)
          setEditing([])
        }
        setDeleteDialog(null)
        toast({ title: '已刪除', description: `專案類型「${deleteDialog.label}」已移除` })
        await loadData()
      } else {
        const err = await res.json()
        toast({ title: '刪除失敗', description: err.error, variant: 'destructive' })
      }
    } finally {
      setDeleteSaving(false)
    }
  }

  const selectedLabel = projectTypes.find(pt => pt.key === selected)?.label ?? selected ?? ''

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">專案設定</h2>
        <p className="text-sm text-muted-foreground mt-0.5">管理專案類型，並編輯各類型的里程碑範本</p>
      </div>

      <div className="grid grid-cols-[240px_1fr] gap-4 items-start">
        {/* Left: type list with CRUD */}
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm">專案類型</CardTitle>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0"
              onClick={() => { setAddLabel(''); setAddDialogOpen(true) }}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="p-2">
            <div className="space-y-0.5">
              {projectTypes.map(pt => {
                const isSelected = selected === pt.key
                return (
                  <div
                    key={pt.key}
                    className={`group w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center gap-2 cursor-pointer ${
                      isSelected ? 'bg-primary text-primary-foreground' : 'hover:bg-muted/50'
                    }`}
                    onClick={() => selectType(pt.key)}
                  >
                    <span className="truncate flex-1">{pt.label}</span>
                    {/* Action buttons (visible on hover or when selected) */}
                    <div className={`flex items-center gap-0.5 shrink-0 ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}
                      onClick={e => e.stopPropagation()}
                    >
                      <button
                        className={`h-6 w-6 flex items-center justify-center rounded hover:bg-black/10 ${isSelected ? 'text-primary-foreground' : 'text-muted-foreground'}`}
                        title="編輯名稱"
                        onClick={() => { setEditDialog({ key: pt.key, label: pt.label }); setEditLabel(pt.label) }}
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        className={`h-6 w-6 flex items-center justify-center rounded hover:bg-destructive/10 hover:text-destructive ${isSelected ? 'text-primary-foreground' : 'text-muted-foreground'}`}
                        title="刪除類型"
                        onClick={() => setDeleteDialog({ key: pt.key, label: pt.label })}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* Right: milestone template editor */}
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
                  <CardTitle className="text-sm">{selectedLabel}</CardTitle>
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

      {/* Add project type dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>新增專案類型</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Input
              placeholder="例如：客製化專案"
              value={addLabel}
              onChange={e => setAddLabel(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !addSaving && handleAdd()}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)} disabled={addSaving}>取消</Button>
            <Button onClick={handleAdd} disabled={addSaving || !addLabel.trim()}>
              {addSaving ? '新增中...' : '新增'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit project type dialog */}
      <Dialog open={!!editDialog} onOpenChange={open => !open && setEditDialog(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>編輯專案類型名稱</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Input
              value={editLabel}
              onChange={e => setEditLabel(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !editSaving && handleEdit()}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialog(null)} disabled={editSaving}>取消</Button>
            <Button onClick={handleEdit} disabled={editSaving || !editLabel.trim()}>
              {editSaving ? '儲存中...' : '儲存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm dialog */}
      <Dialog open={!!deleteDialog} onOpenChange={open => !open && setDeleteDialog(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>刪除專案類型</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            確定要刪除「<span className="font-medium text-foreground">{deleteDialog?.label}</span>」嗎？
            此操作無法復原，且無法刪除已有專案的類型。
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog(null)} disabled={deleteSaving}>取消</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteSaving}>
              {deleteSaving ? '刪除中...' : '確認刪除'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
