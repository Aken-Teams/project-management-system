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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus, Trash2, Pencil, ChevronDown, ChevronRight, ListTodo, ChevronsUpDown } from 'lucide-react'
import { generateCodePrefix } from '@/lib/code-prefix'

interface ProjectTypeConfig {
  key: string
  label: string
  codePrefix?: string
  sortOrder: number
}

interface TemplateSummary {
  projectType: string
  label: string
  count: number
  isCustomized: boolean
}

interface TemplateSubtaskRow {
  id?: string
  title: string
  durationDays: number
  priority: string
}

interface TemplateTaskRow {
  id?: string
  title: string
  durationDays: number
  priority: string
  children: TemplateSubtaskRow[]
}

interface TemplateRow {
  id?: string
  name: string
  durationDays: number
  tasks: TemplateTaskRow[]
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

  // Expanded milestone indices (for task editing)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  // Expanded task indices (for subtask editing), key = "milestoneIdx-taskIdx"
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set())

  // Clear confirm dialog
  const [clearDialogOpen, setClearDialogOpen] = useState(false)

  // Project type CRUD dialogs
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [addLabel, setAddLabel] = useState('')
  const [addPrefix, setAddPrefix] = useState('')
  const [addPrefixTouched, setAddPrefixTouched] = useState(false)
  const [addSaving, setAddSaving] = useState(false)

  const [editDialog, setEditDialog] = useState<{ key: string; label: string; codePrefix?: string } | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [editPrefix, setEditPrefix] = useState('')
  const [editPrefixChanged, setEditPrefixChanged] = useState(false)
  const [editProjectCount, setEditProjectCount] = useState(0)
  const [editConfirmOpen, setEditConfirmOpen] = useState(false)
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
    setExpanded(new Set())
    setExpandedTasks(new Set())
    try {
      const res = await fetch(`/api/admin/milestone-templates/${key}`, { headers: headers() })
      const data: TypeDetail = await res.json()
      setDetail(data)
      setEditing(data.templates.map(t => ({
        ...t,
        tasks: t.tasks?.map(tk => ({
          ...tk,
          children: tk.children?.map((c: TemplateSubtaskRow) => ({ ...c })) ?? [],
        })) ?? [],
      })))
    } finally {
      setLoadingDetail(false)
    }
  }

  // ── Template row actions ──────────────────────────────
  const addRow = () => setEditing(prev => [...prev, { name: '', durationDays: 14, tasks: [] }])
  const removeRow = (i: number) => {
    setEditing(prev => prev.filter((_, idx) => idx !== i))
    setExpanded(prev => {
      const next = new Set<number>()
      prev.forEach(idx => { if (idx < i) next.add(idx); else if (idx > i) next.add(idx - 1) })
      return next
    })
  }
  const updateRow = (i: number, field: 'name' | 'durationDays', value: string | number) =>
    setEditing(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: value } : r))

  // ── Task row actions ──────────────────────────────────
  const toggleExpand = (i: number) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i); else next.add(i)
      return next
    })
  }

  const addTask = (milestoneIdx: number) => {
    setEditing(prev => prev.map((r, idx) =>
      idx === milestoneIdx
        ? { ...r, tasks: [...r.tasks, { title: '', durationDays: 1, priority: 'medium', children: [] }] }
        : r
    ))
    setExpanded(prev => new Set(prev).add(milestoneIdx))
  }

  const removeTask = (milestoneIdx: number, taskIdx: number) => {
    setEditing(prev => prev.map((r, idx) =>
      idx === milestoneIdx
        ? { ...r, tasks: r.tasks.filter((_, ti) => ti !== taskIdx) }
        : r
    ))
  }

  const updateTask = (milestoneIdx: number, taskIdx: number, field: keyof TemplateTaskRow, value: string | number) => {
    setEditing(prev => prev.map((r, idx) =>
      idx === milestoneIdx
        ? { ...r, tasks: r.tasks.map((t, ti) => ti === taskIdx ? { ...t, [field]: value } : t) }
        : r
    ))
  }

  // ── Subtask row actions ────────────────────────────────
  const toggleExpandTask = (milestoneIdx: number, taskIdx: number) => {
    const key = `${milestoneIdx}-${taskIdx}`
    setExpandedTasks(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  const addSubtask = (milestoneIdx: number, taskIdx: number) => {
    setEditing(prev => prev.map((r, mi) =>
      mi === milestoneIdx
        ? { ...r, tasks: r.tasks.map((t, ti) =>
            ti === taskIdx
              ? { ...t, children: [...t.children, { title: '', durationDays: 1, priority: 'medium' }] }
              : t
          )}
        : r
    ))
    setExpandedTasks(prev => new Set(prev).add(`${milestoneIdx}-${taskIdx}`))
    setExpanded(prev => new Set(prev).add(milestoneIdx))
  }

  const removeSubtask = (milestoneIdx: number, taskIdx: number, subtaskIdx: number) => {
    setEditing(prev => prev.map((r, mi) =>
      mi === milestoneIdx
        ? { ...r, tasks: r.tasks.map((t, ti) =>
            ti === taskIdx
              ? { ...t, children: t.children.filter((_, si) => si !== subtaskIdx) }
              : t
          )}
        : r
    ))
  }

  const updateSubtask = (milestoneIdx: number, taskIdx: number, subtaskIdx: number, field: keyof TemplateSubtaskRow, value: string | number) => {
    setEditing(prev => prev.map((r, mi) =>
      mi === milestoneIdx
        ? { ...r, tasks: r.tasks.map((t, ti) =>
            ti === taskIdx
              ? { ...t, children: t.children.map((c, si) => si === subtaskIdx ? { ...c, [field]: value } : c) }
              : t
          )}
        : r
    ))
  }

  const save = async () => {
    if (!user || !selected) return
    if (editing.some(r => !r.name.trim())) {
      toast({ title: '請填寫所有里程碑名稱', variant: 'destructive' })
      return
    }
    // Validate task and subtask names
    for (const row of editing) {
      if (row.tasks.some(t => !t.title.trim())) {
        toast({ title: '請填寫所有任務名稱', variant: 'destructive' })
        return
      }
      for (const task of row.tasks) {
        if (task.children.some(c => !c.title.trim())) {
          toast({ title: '請填寫所有子任務名稱', variant: 'destructive' })
          return
        }
      }
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/milestone-templates/${selected}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...headers() },
        body: JSON.stringify({
          templates: editing.map(r => ({
            name: r.name,
            durationDays: Number(r.durationDays),
            tasks: r.tasks.map(t => ({
              title: t.title,
              durationDays: Number(t.durationDays),
              priority: t.priority,
              children: t.children.map(c => ({
                title: c.title,
                durationDays: Number(c.durationDays),
                priority: c.priority,
              })),
            })),
          })),
        }),
      })
      if (res.ok) {
        const data: TypeDetail = await res.json()
        setDetail(data)
        setEditing(data.templates.map(t => ({
          ...t,
          tasks: t.tasks?.map(tk => ({
            ...tk,
            children: tk.children?.map((c: TemplateSubtaskRow) => ({ ...c })) ?? [],
          })) ?? [],
        })))
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

  const clearAll = async () => {
    if (!user || !selected) return
    setClearDialogOpen(false)
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/milestone-templates/${selected}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...headers() },
        body: JSON.stringify({ templates: [] }),
      })
      if (res.ok) {
        setDetail({ projectType: selected, isCustomized: false, templates: [] })
        setEditing([])
        setExpanded(new Set())
        setExpandedTasks(new Set())
        setSummaries(prev => prev.map(s =>
          s.projectType === selected ? { ...s, isCustomized: false, count: 0 } : s
        ))
        toast({ title: '已清空', description: '所有里程碑範本已清除' })
      }
    } finally {
      setSaving(false)
    }
  }

  // ── Project type CRUD ─────────────────────────────────
  const handleAdd = async () => {
    if (!addLabel.trim() || !addPrefix.trim()) return
    setAddSaving(true)
    try {
      const res = await fetch('/api/admin/project-types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers() },
        body: JSON.stringify({ label: addLabel.trim(), codePrefix: addPrefix.trim().toUpperCase() }),
      })
      if (res.ok) {
        setAddDialogOpen(false)
        setAddLabel('')
        setAddPrefix('')
        setAddPrefixTouched(false)
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

  const handleEditSave = () => {
    if (!editDialog || !editLabel.trim() || !editPrefix.trim()) return
    // If prefix changed and there are existing projects, require confirmation
    if (editPrefixChanged && editProjectCount > 0) {
      setEditConfirmOpen(true)
      return
    }
    doEditSave()
  }

  const doEditSave = async () => {
    if (!editDialog || !editLabel.trim() || !editPrefix.trim()) return
    setEditConfirmOpen(false)
    setEditSaving(true)
    try {
      const res = await fetch(`/api/admin/project-types/${editDialog.key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...headers() },
        body: JSON.stringify({ label: editLabel.trim(), codePrefix: editPrefix.trim().toUpperCase() }),
      })
      if (res.ok) {
        setEditDialog(null)
        toast({ title: '已更新', description: `專案類型已更新` })
        await loadData()
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
                    <span className="truncate flex-1">
                      {pt.label}
                      {pt.codePrefix && (
                        <span className={`ml-1.5 text-[10px] font-mono px-1 py-0.5 rounded ${isSelected ? 'bg-white/20' : 'bg-muted text-muted-foreground'}`}>
                          {pt.codePrefix}
                        </span>
                      )}
                    </span>
                    <div className={`flex items-center gap-0.5 shrink-0 ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}
                      onClick={e => e.stopPropagation()}
                    >
                      <button
                        className={`h-6 w-6 flex items-center justify-center rounded hover:bg-black/10 ${isSelected ? 'text-primary-foreground' : 'text-muted-foreground'}`}
                        title="編輯名稱"
                        onClick={async () => {
                          setEditDialog({ key: pt.key, label: pt.label, codePrefix: pt.codePrefix })
                          setEditLabel(pt.label)
                          setEditPrefix(pt.codePrefix ?? '')
                          setEditPrefixChanged(false)
                          // Fetch existing project count for this type
                          try {
                            const res = await fetch(`/api/admin/project-types/${pt.key}/count`, { headers: headers() })
                            if (res.ok) { const d = await res.json(); setEditProjectCount(d.count ?? 0) }
                            else setEditProjectCount(0)
                          } catch { setEditProjectCount(0) }
                        }}
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
                {editing.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs gap-1"
                    onClick={() => {
                      const allExpanded = editing.every((_, i) => expanded.has(i))
                      if (allExpanded) {
                        setExpanded(new Set())
                        setExpandedTasks(new Set())
                      } else {
                        setExpanded(new Set(editing.map((_, i) => i)))
                        const allTaskKeys = new Set<string>()
                        editing.forEach((row, i) => {
                          row.tasks.forEach((task, j) => {
                            if (task.children.length > 0) allTaskKeys.add(`${i}-${j}`)
                          })
                        })
                        setExpandedTasks(allTaskKeys)
                      }
                    }}
                  >
                    <ChevronsUpDown className="h-3 w-3" />
                    {editing.every((_, i) => expanded.has(i)) ? '全部收合' : '全部展開'}
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-1">
              {loadingDetail ? (
                <p className="text-sm text-muted-foreground py-4 text-center">載入中...</p>
              ) : (
                <>
                  <div className="grid grid-cols-[24px_1fr_80px_36px_36px] gap-2 text-xs text-muted-foreground px-1 mb-1">
                    <span />
                    <span>里程碑名稱</span>
                    <span>天數</span>
                    <span />
                    <span />
                  </div>
                  {editing.map((row, i) => (
                    <div key={i}>
                      {/* Milestone row */}
                      <div className="grid grid-cols-[24px_1fr_80px_36px_36px] gap-2 items-center bg-slate-50 rounded-md px-1 py-0.5">
                        <button
                          className="h-6 w-6 flex items-center justify-center rounded hover:bg-muted text-muted-foreground"
                          onClick={() => toggleExpand(i)}
                          title={expanded.has(i) ? '收合任務' : '展開任務'}
                        >
                          {expanded.has(i) ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                        </button>
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
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-primary"
                          onClick={() => addTask(i)}
                          title="新增任務"
                        >
                          <ListTodo className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => removeRow(i)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>

                      {/* Task count badge (when collapsed) */}
                      {!expanded.has(i) && row.tasks.length > 0 && (
                        <button
                          className="ml-8 mt-0.5 mb-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                          onClick={() => toggleExpand(i)}
                        >
                          <ListTodo className="h-3 w-3" />
                          {row.tasks.length} 個任務
                        </button>
                      )}

                      {/* Expanded task list */}
                      {expanded.has(i) && (
                        <div className="ml-8 mt-1 mb-2 pl-3 border-l-2 border-blue-200 space-y-1">
                          {row.tasks.length > 0 && (
                            <div className="grid grid-cols-[20px_1fr_70px_90px_28px_28px] gap-1.5 text-[11px] text-muted-foreground px-0.5">
                              <span />
                              <span>任務名稱</span>
                              <span>天數</span>
                              <span>優先級</span>
                              <span />
                              <span />
                            </div>
                          )}
                          {row.tasks.map((task, j) => (
                            <div key={j}>
                              {/* Task row */}
                              <div className="grid grid-cols-[20px_1fr_70px_90px_28px_28px] gap-1.5 items-center bg-blue-50/60 rounded px-1 py-0.5">
                                <button
                                  className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted text-muted-foreground"
                                  onClick={() => toggleExpandTask(i, j)}
                                  title={expandedTasks.has(`${i}-${j}`) ? '收合子任務' : '展開子任務'}
                                >
                                  {expandedTasks.has(`${i}-${j}`) ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                                </button>
                                <Input
                                  value={task.title}
                                  onChange={e => updateTask(i, j, 'title', e.target.value)}
                                  placeholder="任務名稱"
                                  className="h-7 text-xs"
                                />
                                <Input
                                  type="number"
                                  min={1}
                                  value={task.durationDays}
                                  onChange={e => updateTask(i, j, 'durationDays', parseInt(e.target.value) || 1)}
                                  className="h-7 text-xs"
                                />
                                <Select
                                  value={task.priority}
                                  onValueChange={v => updateTask(i, j, 'priority', v)}
                                >
                                  <SelectTrigger className="h-7 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="high">高</SelectItem>
                                    <SelectItem value="medium">中</SelectItem>
                                    <SelectItem value="low">低</SelectItem>
                                  </SelectContent>
                                </Select>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 text-muted-foreground hover:text-primary"
                                  onClick={() => addSubtask(i, j)}
                                  title="新增子任務"
                                >
                                  <Plus className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                                  onClick={() => removeTask(i, j)}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>

                              {/* Subtask count badge (when collapsed) */}
                              {!expandedTasks.has(`${i}-${j}`) && task.children.length > 0 && (
                                <button
                                  className="ml-7 mt-0.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                                  onClick={() => toggleExpandTask(i, j)}
                                >
                                  {task.children.length} 個子任務
                                </button>
                              )}

                              {/* Expanded subtask list */}
                              {expandedTasks.has(`${i}-${j}`) && (
                                <div className="ml-7 mt-1 mb-1 pl-3 border-l-2 border-muted space-y-1">
                                  {task.children.length > 0 && (
                                    <div className="grid grid-cols-[1fr_70px_90px_28px] gap-1.5 text-[11px] text-muted-foreground px-0.5">
                                      <span>子任務名稱</span>
                                      <span>天數</span>
                                      <span>優先級</span>
                                      <span />
                                    </div>
                                  )}
                                  {task.children.map((subtask, k) => (
                                    <div key={k} className="grid grid-cols-[1fr_70px_90px_28px] gap-1.5 items-center bg-amber-50/50 rounded px-1 py-0.5">
                                      <Input
                                        value={subtask.title}
                                        onChange={e => updateSubtask(i, j, k, 'title', e.target.value)}
                                        placeholder="子任務名稱"
                                        className="h-7 text-xs"
                                      />
                                      <Input
                                        type="number"
                                        min={1}
                                        value={subtask.durationDays}
                                        onChange={e => updateSubtask(i, j, k, 'durationDays', parseInt(e.target.value) || 1)}
                                        className="h-7 text-xs"
                                      />
                                      <Select
                                        value={subtask.priority}
                                        onValueChange={v => updateSubtask(i, j, k, 'priority', v)}
                                      >
                                        <SelectTrigger className="h-7 text-xs">
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="high">高</SelectItem>
                                          <SelectItem value="medium">中</SelectItem>
                                          <SelectItem value="low">低</SelectItem>
                                        </SelectContent>
                                      </Select>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                                        onClick={() => removeSubtask(i, j, k)}
                                      >
                                        <Trash2 className="h-2.5 w-2.5" />
                                      </Button>
                                    </div>
                                  ))}
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground"
                                    onClick={() => addSubtask(i, j)}
                                  >
                                    <Plus className="h-3 w-3" />新增子任務
                                  </Button>
                                </div>
                              )}
                            </div>
                          ))}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground"
                            onClick={() => addTask(i)}
                          >
                            <Plus className="h-3 w-3" />新增任務
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                  <div className="flex items-center justify-between mt-3 pt-3 border-t">
                    <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={addRow}>
                      <Plus className="h-3.5 w-3.5" />新增里程碑
                    </Button>
                    <div className="flex gap-2">
                      {editing.length > 0 && (
                        <Button variant="outline" size="sm" className="h-8 text-xs gap-1 text-destructive hover:text-destructive" onClick={() => setClearDialogOpen(true)} disabled={saving}>
                          <Trash2 className="h-3 w-3" />清空內容
                        </Button>
                      )}
                      <Button size="sm" className="h-8 text-xs" onClick={save} disabled={saving}>
                        {saving ? '儲存中...' : '儲存'}
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Add project type dialog */}
      <Dialog open={addDialogOpen} onOpenChange={open => {
        setAddDialogOpen(open)
        if (!open) { setAddLabel(''); setAddPrefix(''); setAddPrefixTouched(false) }
      }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>新增專案類型</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-sm font-medium mb-1 block">類型名稱</label>
              <Input
                placeholder="例如：客製化專案"
                value={addLabel}
                onChange={e => {
                  const val = e.target.value
                  setAddLabel(val)
                  if (!addPrefixTouched) {
                    setAddPrefix(generateCodePrefix(val))
                  }
                }}
                autoFocus
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">專案代碼前綴</label>
              <Input
                placeholder="例如：APQP（2~8 碼英數字）"
                value={addPrefix}
                onChange={e => {
                  setAddPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))
                  setAddPrefixTouched(true)
                }}
                onKeyDown={e => e.key === 'Enter' && !addSaving && handleAdd()}
                maxLength={8}
              />
              <p className="text-xs text-muted-foreground mt-1">
                用於專案代碼，如 <span className="font-mono">{addPrefix || 'XXX'}-2026-001</span>
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)} disabled={addSaving}>取消</Button>
            <Button onClick={handleAdd} disabled={addSaving || !addLabel.trim() || !addPrefix.trim()}>
              {addSaving ? '新增中...' : '新增'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit project type dialog */}
      <Dialog open={!!editDialog} onOpenChange={open => !open && setEditDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>編輯專案類型</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-sm font-medium mb-1 block">類型名稱</label>
              <Input
                value={editLabel}
                onChange={e => setEditLabel(e.target.value)}
                autoFocus
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">專案代碼前綴</label>
              <Input
                value={editPrefix}
                onChange={e => {
                  const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)
                  setEditPrefix(val)
                  setEditPrefixChanged(val !== (editDialog?.codePrefix ?? ''))
                }}
                onKeyDown={e => e.key === 'Enter' && !editSaving && handleEditSave()}
                maxLength={8}
                placeholder="2~8 碼英數字"
              />
              <p className="text-xs text-muted-foreground mt-1">
                專案代碼格式：<span className="font-mono">{editPrefix || 'XXX'}-2026-001</span>
              </p>
            </div>
            {editPrefixChanged && editProjectCount > 0 && (
              <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <p className="font-medium">注意：此類型已有 {editProjectCount} 個專案</p>
                <p className="mt-0.5 text-xs">
                  修改前綴後，未來新建的專案代碼將使用「<span className="font-mono font-medium">{editPrefix}</span>」，
                  但已建立的專案代碼（如 <span className="font-mono">{editDialog?.codePrefix}-2026-001</span>）不會變更，
                  可能導致同類型專案編號不一致。
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialog(null)} disabled={editSaving}>取消</Button>
            <Button onClick={handleEditSave} disabled={editSaving || !editLabel.trim() || !editPrefix.trim()}>
              {editSaving ? '儲存中...' : '儲存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit prefix change confirmation dialog */}
      <Dialog open={editConfirmOpen} onOpenChange={setEditConfirmOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>確認修改代碼前綴</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-2 text-sm">
            <p>
              此類型已有 <span className="font-bold text-amber-600">{editProjectCount}</span> 個專案使用前綴
              「<span className="font-mono font-medium">{editDialog?.codePrefix}</span>」。
            </p>
            <p>
              修改後，舊專案代碼<span className="font-medium">不會變更</span>，
              新專案將使用「<span className="font-mono font-medium">{editPrefix}</span>」，
              可能導致同類型編號不一致。
            </p>
            <p className="font-medium text-destructive">確定要修改嗎？</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditConfirmOpen(false)}>取消</Button>
            <Button variant="destructive" onClick={doEditSave} disabled={editSaving}>
              {editSaving ? '儲存中...' : '確認修改'}
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

      {/* Clear all confirm dialog */}
      <Dialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>清空里程碑範本</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            確定要清空「<span className="font-medium text-foreground">{selectedLabel}</span>」的所有里程碑範本嗎？此操作將刪除所有里程碑、任務及子任務，且無法復原。
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClearDialogOpen(false)} disabled={saving}>取消</Button>
            <Button variant="destructive" onClick={clearAll} disabled={saving}>
              {saving ? '清空中...' : '確認清空'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
