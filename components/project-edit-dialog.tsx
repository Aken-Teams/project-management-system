'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, Settings2, FileText, Target, Users, Trash2, Plus, Building2, AlertTriangle, Pencil, X, ShieldAlert, ListChecks, TimerReset } from 'lucide-react'
import { TimelineTable, type TimelineTeamMember } from '@/components/timeline-table'
import { calculateMilestoneDates, calculateTaskDates, autoExpandMilestones, dbToTimelineState, computeWorkItemsDiff } from '@/lib/timeline-utils'
import { arrayMove } from '@dnd-kit/sortable'
import {
  type Project,
  type ProjectType,
  type ProjectTier,
  type DemandSource,
  type SmartObjective,
  type TeamRole,
  type Risk,
  PROJECT_TYPE_LABELS,
  PROJECT_TIER_LABELS,
  DEMAND_SOURCE_LABELS,
  TEAM_ROLE_LABELS,
} from '@/lib/mock-data'
import { TeamMemberAutocomplete } from '@/components/team-member-autocomplete'

interface ProjectEditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  project: Project
  onSave: (data: ProjectEditData) => Promise<void>
  onTeamChange?: () => void
  onRiskChange?: () => void
  onWorkItemsChange?: () => void
}

export interface ProjectEditData {
  name: string
  projectType: ProjectType
  projectTier?: ProjectTier | null
  demandSource?: DemandSource | null
  objective: string
  purpose: string
  scope: string
  roi: string
  createdReason: string
  expectedBenefits?: string
  budget: number
  smartObjective?: SmartObjective
  startDate?: string
  endDate?: string
}

const EMPTY_SMART: SmartObjective = {
  specific: '',
  measurable: '',
  achievable: '',
  relevant: '',
  timeBound: '',
}

// ─── Role color map ─────────────────────────────────────────
const ROLE_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  pm:            { bg: 'bg-blue-50',   text: 'text-blue-700',   dot: 'bg-blue-500' },
  engineer:      { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  procurement:   { bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-500' },
  qa:            { bg: 'bg-violet-50', text: 'text-violet-700', dot: 'bg-violet-500' },
  manufacturing: { bg: 'bg-amber-50',  text: 'text-amber-700',  dot: 'bg-amber-500' },
  designer:      { bg: 'bg-pink-50',   text: 'text-pink-700',   dot: 'bg-pink-500' },
  other:         { bg: 'bg-slate-50',  text: 'text-slate-600',  dot: 'bg-slate-400' },
}

function RoleBadge({ role, label }: { role: string; label: string }) {
  const c = ROLE_COLORS[role] || ROLE_COLORS.other
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-sm font-medium ${c.bg} ${c.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {label}
    </span>
  )
}

// ─── Risk labels & colors ────────────────────────────────────
const RISK_IMPACT_LABELS: Record<string, string> = { low: '低', medium: '中', high: '高' }
const RISK_PROBABILITY_LABELS: Record<string, string> = { low: '低', medium: '中', high: '高' }
const RISK_STATUS_LABELS: Record<string, string> = { open: '未處理', mitigated: '已緩解', closed: '已關閉' }
const RISK_STATUS_COLORS: Record<string, string> = {
  open: 'bg-red-50 text-red-700 border-red-200',
  mitigated: 'bg-amber-50 text-amber-700 border-amber-200',
  closed: 'bg-green-50 text-green-700 border-green-200',
}
const RISK_LEVEL_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  low:    { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  medium: { bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-500' },
  high:   { bg: 'bg-red-50',     text: 'text-red-700',     dot: 'bg-red-500' },
}
const RISK_SEVERITY_BORDER: Record<string, string> = {
  low: 'border-l-emerald-400',
  medium: 'border-l-amber-400',
  high: 'border-l-red-400',
}
function getRiskSeverity(impact: string, probability: string): 'low' | 'medium' | 'high' {
  const scores: Record<string, number> = { low: 1, medium: 2, high: 3 }
  const score = (scores[impact] ?? 2) * (scores[probability] ?? 2)
  if (score >= 6) return 'high'
  if (score >= 3) return 'medium'
  return 'low'
}

export function ProjectEditDialog({ open, onOpenChange, project, onSave, onTeamChange, onRiskChange, onWorkItemsChange }: ProjectEditDialogProps) {
  const [form, setForm] = useState<ProjectEditData>({
    name: project.name,
    projectType: project.projectType,
    projectTier: project.projectTier ?? null,
    demandSource: project.demandSource ?? null,
    objective: project.objective,
    purpose: project.purpose,
    scope: project.scope,
    roi: project.roi,
    createdReason: project.createdReason,
    expectedBenefits: project.expectedBenefits ?? '',
    budget: project.budget,
    smartObjective: project.smartObjective ?? { ...EMPTY_SMART },
    startDate: project.startDate,
    endDate: project.endDate,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('basic')

  // ─── Team member state ────────────────────────────────────
  const [teamMembers, setTeamMembers] = useState(project.teamMembers ?? [])
  const [teamLoading, setTeamLoading] = useState<string | null>(null)
  const [teamError, setTeamError] = useState('')

  // ─── Risk state ─────────────────────────────────────────
  const [risks, setRisks] = useState<Risk[]>(project.risks ?? [])
  const [riskLoading, setRiskLoading] = useState<string | null>(null)
  const [riskError, setRiskError] = useState('')
  const [editingRiskId, setEditingRiskId] = useState<string | null>(null)

  // ─── Milestone & Task state (TimelineTable format) ──────────
  const [tlInit] = useState(() =>
    dbToTimelineState(project.milestones ?? [], project.tasks ?? [], project.startDate)
  )
  const [tlMilestones, setTlMilestones] = useState(tlInit.milestones)
  const [tlTasks, setTlTasks] = useState(tlInit.tasks)
  const [workItemError, setWorkItemError] = useState('')
  const [resettingBaseline, setResettingBaseline] = useState(false)
  const [baselineResetDialogOpen, setBaselineResetDialogOpen] = useState(false)

  // Snapshot of original data for diff on save
  const [origMilestones] = useState(() =>
    (project.milestones ?? []).map(m => ({ id: m.id, name: m.name, dueDate: m.dueDate }))
  )
  const [origTasks] = useState(() =>
    (project.tasks ?? []).map(t => ({
      id: t.id, milestoneId: t.milestoneId, title: t.title,
      assignee: t.assignee, priority: t.priority,
      durationWeeks: t.durationWeeks, startDate: t.startDate, endDate: t.endDate,
    }))
  )

  // Recalculate dates on every render
  const recalcMilestones = calculateMilestoneDates(tlMilestones, form.startDate || project.startDate, tlTasks)
  const tlTaskDates = calculateTaskDates(tlTasks, recalcMilestones)

  // Auto-expand milestone when tasks exceed its duration
  useEffect(() => {
    const { milestones: updated, changed } = autoExpandMilestones(tlMilestones, tlTasks)
    if (changed) setTlMilestones(updated)
  }, [tlTasks]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-update project end date from last milestone
  const lastMsEndDate = useMemo(() => {
    const last = [...recalcMilestones].reverse().find(m => m.endDate && m.durationWeeks > 0)
    return last?.endDate || ''
  }, [recalcMilestones])

  useEffect(() => {
    if (lastMsEndDate && form.startDate) {
      update('endDate', lastMsEndDate)
    }
  }, [lastMsEndDate]) // eslint-disable-line react-hooks/exhaustive-deps

  // Convert team members for TimelineTable
  const tlTeamMembers: TimelineTeamMember[] = useMemo(() =>
    (teamMembers ?? []).map(m => ({ id: m.id, name: m.name, role: m.role, responsibility: m.responsibility })),
    [teamMembers],
  )

  const handleSave = async () => {
    // Validation matching the creation form
    if (!form.name.trim()) {
      setError('專案名稱不可為空')
      setActiveTab('basic')
      return
    }
    if (!form.projectTier) {
      setError('專案層級為必填')
      setActiveTab('basic')
      return
    }
    if (!form.projectType) {
      setError('專案類型為必填')
      setActiveTab('basic')
      return
    }
    if (!form.demandSource) {
      setError('需求來源為必填')
      setActiveTab('basic')
      return
    }
    if (!form.createdReason.trim()) {
      setError('開案原因不可為空')
      setActiveTab('basic')
      return
    }
    if (!form.smartObjective?.specific?.trim()) {
      setError('SMART 目標中「具體目標」不可為空')
      setActiveTab('smart')
      return
    }
    if (!form.smartObjective?.measurable?.trim()) {
      setError('SMART 目標中「可衡量指標」不可為空')
      setActiveTab('smart')
      return
    }
    if (!form.smartObjective?.achievable?.trim()) {
      setError('SMART 目標中「可達成性」不可為空')
      setActiveTab('smart')
      return
    }
    if (!form.smartObjective?.relevant?.trim()) {
      setError('SMART 目標中「相關性」不可為空')
      setActiveTab('smart')
      return
    }
    if (!form.smartObjective?.timeBound?.trim()) {
      setError('SMART 目標中「時限性」不可為空')
      setActiveTab('smart')
      return
    }
    if (!form.purpose.trim()) {
      setError('專案目的不可為空')
      setActiveTab('description')
      return
    }

    setError('')
    setWorkItemError('')
    setSaving(true)
    try {
      // Auto-generate objective from SMART (matching creation form logic)
      const smart = form.smartObjective
      const autoObjective = smart?.specific
        ? `${smart.specific}${smart.measurable ? '，' + smart.measurable : ''}`
        : form.objective
      await onSave({ ...form, objective: autoObjective })

      // ─── Batch save work items ──────────────────────────────
      const diff = computeWorkItemsDiff(origMilestones, origTasks, recalcMilestones, tlTasks, tlTaskDates)

      // 1. Delete tasks first (milestone DELETE rejects if tasks exist)
      for (const taskId of diff.tasksToDelete) {
        await fetch(`/api/projects/${project.id}/tasks/${taskId}`, { method: 'DELETE' })
      }
      // 2. Delete milestones
      for (const msId of diff.milestonesToDelete) {
        await fetch(`/api/projects/${project.id}/milestones/${msId}`, { method: 'DELETE' })
      }
      // 3. Create new milestones → collect real IDs
      const newMsIdMap = new Map<string, string>()
      for (const ms of diff.milestonesToAdd) {
        const res = await fetch(`/api/projects/${project.id}/milestones`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(ms),
        })
        if (res.ok) {
          const created = await res.json()
          const draftMs = tlMilestones.find(m => m.name === ms.name && !origMilestones.some(o => o.id === m.id))
          if (draftMs) newMsIdMap.set(draftMs.id, created.id)
        }
      }
      // 4. Update existing milestones
      for (const ms of diff.milestonesToUpdate) {
        await fetch(`/api/projects/${project.id}/milestones/${ms.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(ms),
        })
      }
      // 5. Create new tasks (resolve draft milestone IDs)
      for (const task of diff.tasksToAdd) {
        const resolvedMsId = newMsIdMap.get(task.milestoneId) || task.milestoneId
        await fetch(`/api/projects/${project.id}/tasks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...task, milestoneId: resolvedMsId }),
        })
      }
      // 6. Update existing tasks
      for (const task of diff.tasksToUpdate) {
        await fetch(`/api/projects/${project.id}/tasks/${task.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(task),
        })
      }

      onWorkItemsChange?.()
      onOpenChange(false)
    } catch {
      setError('儲存失敗，請稍後再試')
    } finally {
      setSaving(false)
    }
  }

  const update = <K extends keyof ProjectEditData>(key: K, value: ProjectEditData[K]) => {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  const updateSmart = (key: keyof SmartObjective, value: string) => {
    setForm(prev => ({
      ...prev,
      smartObjective: { ...(prev.smartObjective ?? EMPTY_SMART), [key]: value },
    }))
  }

  // ─── Team member API calls ────────────────────────────────

  const handleAddMember = useCallback(async (user: { name: string; email?: string }, role: string, responsibility: string) => {
    setTeamError('')
    setTeamLoading('adding')
    try {
      const res = await fetch(`/api/projects/${project.id}/team`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: user.name, email: user.email, role, responsibility }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setTeamError(err.error || '新增成員失敗')
        return
      }
      const newMember = await res.json()
      setTeamMembers(prev => [...prev, { ...newMember, email: user.email }])
      onTeamChange?.()
    } catch {
      setTeamError('新增成員失敗')
    } finally {
      setTeamLoading(null)
    }
  }, [project.id, onTeamChange])

  const handleUpdateMember = useCallback(async (memberId: string, field: 'role' | 'responsibility', value: string) => {
    setTeamError('')
    setTeamLoading(memberId)
    try {
      const res = await fetch(`/api/projects/${project.id}/team/${memberId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setTeamError(err.error || '更新成員失敗')
        return
      }
      setTeamMembers(prev => prev.map(m =>
        m.id === memberId ? { ...m, [field]: value } : m
      ))
      onTeamChange?.()
    } catch {
      setTeamError('更新成員失敗')
    } finally {
      setTeamLoading(null)
    }
  }, [project.id, onTeamChange])

  const handleRemoveMember = useCallback(async (memberId: string) => {
    setTeamError('')
    setTeamLoading(memberId)
    try {
      const res = await fetch(`/api/projects/${project.id}/team/${memberId}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setTeamError(err.error || '移除成員失敗')
        return
      }
      setTeamMembers(prev => prev.filter(m => m.id !== memberId))
      onTeamChange?.()
    } catch {
      setTeamError('移除成員失敗')
    } finally {
      setTeamLoading(null)
    }
  }, [project.id, onTeamChange])

  // ─── Risk API calls ───────────────────────────────────────

  const handleAddRisk = useCallback(async (data: { title: string; description: string; impact: string; probability: string; mitigation: string }) => {
    setRiskError('')
    setRiskLoading('adding')
    try {
      const res = await fetch(`/api/projects/${project.id}/risks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setRiskError(err.error || '新增風險失敗')
        return
      }
      const newRisk = await res.json()
      setRisks(prev => [...prev, newRisk])
      onRiskChange?.()
    } catch {
      setRiskError('新增風險失敗')
    } finally {
      setRiskLoading(null)
    }
  }, [project.id, onRiskChange])

  const handleUpdateRisk = useCallback(async (riskId: string, data: Partial<Pick<Risk, 'title' | 'description' | 'impact' | 'probability' | 'mitigation' | 'status'>>) => {
    setRiskError('')
    setRiskLoading(riskId)
    try {
      const res = await fetch(`/api/projects/${project.id}/risks/${riskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setRiskError(err.error || '更新風險失敗')
        return
      }
      const updated = await res.json()
      setRisks(prev => prev.map(r => r.id === riskId ? { ...r, ...updated } : r))
      setEditingRiskId(null)
      onRiskChange?.()
    } catch {
      setRiskError('更新風險失敗')
    } finally {
      setRiskLoading(null)
    }
  }, [project.id, onRiskChange])

  const handleRemoveRisk = useCallback(async (riskId: string) => {
    setRiskError('')
    setRiskLoading(riskId)
    try {
      const res = await fetch(`/api/projects/${project.id}/risks/${riskId}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setRiskError(err.error || '刪除風險失敗')
        return
      }
      setRisks(prev => prev.filter(r => r.id !== riskId))
      onRiskChange?.()
    } catch {
      setRiskError('刪除風險失敗')
    } finally {
      setRiskLoading(null)
    }
  }, [project.id, onRiskChange])

  // ─── TimelineTable callbacks (local state only, batch save on submit) ──

  const handleTlMilestoneUpdate = useCallback((index: number, field: 'name' | 'durationWeeks', value: string | number) => {
    setTlMilestones(prev => prev.map((m, i) => i === index ? { ...m, [field]: value } : m))
  }, [])

  const handleTlMilestoneRemove = useCallback((index: number) => {
    setTlMilestones(prev => {
      const msId = prev[index].id
      setTlTasks(t => t.filter(task => task.milestoneId !== msId))
      return prev.filter((_, i) => i !== index)
    })
  }, [])

  const handleTlMilestoneAdd = useCallback(() => {
    setTlMilestones(prev => [...prev, { id: `draft-ms-${Date.now()}`, name: '', durationWeeks: 0 }])
  }, [])

  const handleTlMilestoneReorder = useCallback((oldIdx: number, newIdx: number) => {
    setTlMilestones(prev => arrayMove(prev, oldIdx, newIdx))
  }, [])

  const handleTlTaskAdd = useCallback((task: { id: string; milestoneId: string; title: string; assignee: string; priority: 'low' | 'medium' | 'high'; durationWeeks: number }) => {
    setTlTasks(prev => [...prev, task])
  }, [])

  const handleTlTaskRemove = useCallback((taskId: string) => {
    setTlTasks(prev => prev.filter(t => t.id !== taskId))
  }, [])

  const handleTlTaskUpdate = useCallback((taskId: string, field: string, value: string | number) => {
    setTlTasks(prev => prev.map(t => t.id === taskId ? { ...t, [field]: value } : t))
  }, [])

  const handleTlTaskReorder = useCallback((oldIdx: number, newIdx: number) => {
    setTlTasks(prev => arrayMove(prev, oldIdx, newIdx))
  }, [])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle>編輯專案</DialogTitle>
          <DialogDescription>
            修改專案資訊。專案編號（{project.projectCode}）及日期範圍由里程碑決定，無法在此變更。
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 min-h-0 flex flex-col">
          <TabsList className="shrink-0 w-full grid grid-cols-6">
            <TabsTrigger value="basic" className="gap-1 text-sm">
              <Settings2 className="h-3.5 w-3.5" />
              基本資訊
            </TabsTrigger>
            <TabsTrigger value="smart" className="gap-1 text-sm">
              <Target className="h-3.5 w-3.5" />
              SMART
            </TabsTrigger>
            <TabsTrigger value="description" className="gap-1 text-sm">
              <FileText className="h-3.5 w-3.5" />
              專案說明
            </TabsTrigger>
            <TabsTrigger value="team" className="gap-1 text-sm">
              <Users className="h-3.5 w-3.5" />
              團隊成員
            </TabsTrigger>
            <TabsTrigger value="risks" className="gap-1 text-sm">
              <AlertTriangle className="h-3.5 w-3.5" />
              風險管理
            </TabsTrigger>
            <TabsTrigger value="workitems" className="gap-1 text-sm">
              <ListChecks className="h-3.5 w-3.5" />
              里程碑
            </TabsTrigger>
          </TabsList>

          {/* Tab 1: Basic Info */}
          <TabsContent value="basic" className="flex-1 min-h-0 overflow-y-auto mt-4 space-y-4 px-1">
            <div className="space-y-1.5">
              <Label htmlFor="edit-name">
                專案名稱 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="edit-name"
                value={form.name}
                onChange={e => update('name', e.target.value)}
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>
                  專案層級 <span className="text-destructive">*</span>
                </Label>
                <Select value={form.projectTier ?? ''} onValueChange={v => update('projectTier', v as ProjectTier)}>
                  <SelectTrigger><SelectValue placeholder="選擇層級" /></SelectTrigger>
                  <SelectContent>
                    {(Object.entries(PROJECT_TIER_LABELS) as [ProjectTier, string][]).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>
                  專案類型 <span className="text-destructive">*</span>
                </Label>
                <Select value={form.projectType} onValueChange={v => update('projectType', v as ProjectType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.entries(PROJECT_TYPE_LABELS) as [ProjectType, string][]).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>
                  需求來源 <span className="text-destructive">*</span>
                </Label>
                <Select value={form.demandSource ?? ''} onValueChange={v => update('demandSource', v as DemandSource)}>
                  <SelectTrigger><SelectValue placeholder="選擇來源" /></SelectTrigger>
                  <SelectContent>
                    {(Object.entries(DEMAND_SOURCE_LABELS) as [DemandSource, string][]).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-budget">預算 (NTD)</Label>
              <Input
                id="edit-budget"
                type="number"
                value={form.budget}
                onChange={e => update('budget', Number(e.target.value) || 0)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-reason">
                開案原因 <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="edit-reason"
                value={form.createdReason}
                onChange={e => update('createdReason', e.target.value)}
                rows={2}
              />
            </div>

            <div className="rounded-lg border bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground">
              專案期間：{form.startDate} ~ {form.endDate}（可在「里程碑」分頁中調整）
            </div>
          </TabsContent>

          {/* Tab 2: Description */}
          <TabsContent value="description" className="flex-1 min-h-0 overflow-y-auto mt-4 space-y-4 px-1">
            <div className="space-y-1.5">
              <Label htmlFor="edit-purpose">
                專案目的 <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="edit-purpose"
                value={form.purpose}
                onChange={e => update('purpose', e.target.value)}
                rows={2}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-scope">專案範圍</Label>
              <Textarea
                id="edit-scope"
                value={form.scope}
                onChange={e => update('scope', e.target.value)}
                rows={2}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-roi">投資報酬 (ROI)</Label>
              <Textarea
                id="edit-roi"
                value={form.roi}
                onChange={e => update('roi', e.target.value)}
                rows={2}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-benefits">預期效益</Label>
              <Textarea
                id="edit-benefits"
                value={form.expectedBenefits ?? ''}
                onChange={e => update('expectedBenefits', e.target.value)}
                rows={2}
              />
            </div>
          </TabsContent>

          {/* Tab 3: SMART Objective */}
          <TabsContent value="smart" className="flex-1 min-h-0 overflow-y-auto mt-4 space-y-4 px-1">
            <div className="space-y-1.5">
              <Label htmlFor="edit-smart-s">
                Specific — 具體目標 <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="edit-smart-s"
                placeholder="明確描述要達成什麼具體成果"
                value={form.smartObjective?.specific ?? ''}
                onChange={e => updateSmart('specific', e.target.value)}
                rows={2}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-smart-m">
                Measurable — 可衡量指標 <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="edit-smart-m"
                placeholder="如何量化衡量目標是否達成"
                value={form.smartObjective?.measurable ?? ''}
                onChange={e => updateSmart('measurable', e.target.value)}
                rows={2}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-smart-a">
                Achievable — 可達成性 <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="edit-smart-a"
                placeholder="目標是否在資源與時間限制下可行"
                value={form.smartObjective?.achievable ?? ''}
                onChange={e => updateSmart('achievable', e.target.value)}
                rows={2}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-smart-r">
                Relevant — 相關性 <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="edit-smart-r"
                placeholder="目標與組織策略或業務需求的關聯"
                value={form.smartObjective?.relevant ?? ''}
                onChange={e => updateSmart('relevant', e.target.value)}
                rows={2}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-smart-t">
                Time-bound — 時限性 <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="edit-smart-t"
                placeholder="預計在何時完成目標"
                value={form.smartObjective?.timeBound ?? ''}
                onChange={e => updateSmart('timeBound', e.target.value)}
                rows={2}
              />
            </div>

          </TabsContent>

          {/* Tab 4: Team Members */}
          <TabsContent value="team" className="flex-1 min-h-0 overflow-y-auto mt-4 space-y-3 px-1">
            <div className="rounded-lg border overflow-hidden">
              {/* Header */}
              <div className="grid grid-cols-[1fr_80px_140px_1fr_32px] gap-0 items-center px-3 py-2 bg-muted/60 border-b text-sm font-medium text-muted-foreground tracking-wide">
                <span>姓名</span>
                <span>組織</span>
                <span>角色</span>
                <span className="pl-1.5">負責工作項目</span>
                <span />
              </div>

              {/* Member rows */}
              {teamMembers.map((member) => (
                <div
                  key={member.id}
                  className="grid grid-cols-[1fr_80px_140px_1fr_32px] gap-0 items-center px-3 py-1.5 border-t hover:bg-muted/20 transition-colors text-sm"
                >
                  {/* Name */}
                  <div className="flex items-center gap-2 pr-2 min-w-0">
                    <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${(ROLE_COLORS[member.role] || ROLE_COLORS.other).bg} ${(ROLE_COLORS[member.role] || ROLE_COLORS.other).text}`}>
                      {member.name.charAt(0)}
                    </div>
                    <span className="truncate font-medium">{member.name}</span>
                  </div>

                  {/* Organization */}
                  <div className="px-1 min-w-0">
                    {member.organization ? (
                      <span className="flex items-center gap-1 text-sm text-muted-foreground truncate">
                        <Building2 className="h-3 w-3 shrink-0" />
                        <span className="truncate">{member.organization}</span>
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground/40">—</span>
                    )}
                  </div>

                  {/* Role */}
                  <div>
                    <Select
                      value={member.role}
                      onValueChange={(v) => handleUpdateMember(member.id, 'role', v)}
                      disabled={teamLoading === member.id}
                    >
                      <SelectTrigger className="h-8 border-0 bg-transparent text-sm focus:ring-1 px-0.5 [&>span]:overflow-visible">
                        <RoleBadge role={member.role} label={TEAM_ROLE_LABELS[member.role as TeamRole] || member.role} />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.entries(TEAM_ROLE_LABELS) as [TeamRole, string][]).map(([k, v]) => (
                          <SelectItem key={k} value={k}>
                            <RoleBadge role={k} label={v} />
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Responsibility */}
                  <div className="px-1">
                    <Input
                      value={member.responsibility}
                      onChange={(e) => {
                        setTeamMembers(prev => prev.map(m =>
                          m.id === member.id ? { ...m, responsibility: e.target.value } : m
                        ))
                      }}
                      onBlur={(e) => {
                        const original = project.teamMembers?.find(m => m.id === member.id)
                        if (original && original.responsibility !== e.target.value) {
                          handleUpdateMember(member.id, 'responsibility', e.target.value)
                        }
                      }}
                      placeholder="負責工作項目"
                      className="h-8 border-0 bg-transparent text-sm focus-visible:ring-1 px-1.5"
                      disabled={teamLoading === member.id}
                    />
                  </div>

                  {/* Remove */}
                  <div className="flex justify-center">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-destructive"
                      onClick={() => handleRemoveMember(member.id)}
                      disabled={teamLoading === member.id}
                    >
                      {teamLoading === member.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Trash2 className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                </div>
              ))}

              {/* Inline add row */}
              <TeamMemberAddRow
                existingEmails={new Set(teamMembers.map(m => m.email).filter(Boolean) as string[])}
                onAdd={handleAddMember}
                loading={teamLoading === 'adding'}
              />

              {/* Footer */}
              <div className="px-3 py-2 border-t bg-muted/20 text-sm text-muted-foreground">
                共 {teamMembers.length} 位成員
              </div>
            </div>

            {teamError && (
              <p className="text-sm text-destructive">{teamError}</p>
            )}
          </TabsContent>

          {/* Tab 5: Risks */}
          <TabsContent value="risks" className="flex-1 min-h-0 overflow-y-auto mt-4 space-y-3 px-1">
            <div className="rounded-lg border overflow-hidden">
              {/* Header */}
              <div className="px-3 py-2 bg-muted/60 border-b text-sm font-medium text-muted-foreground tracking-wide flex items-center justify-between">
                <span>風險項目</span>
                <span className="text-xs font-normal">共 {risks.length} 項</span>
              </div>

              {/* Risk rows */}
              {risks.map((risk) => {
                const isEditing = editingRiskId === risk.id
                return (
                  <RiskCard
                    key={risk.id}
                    risk={risk}
                    isEditing={isEditing}
                    loading={riskLoading === risk.id}
                    onEdit={() => setEditingRiskId(isEditing ? null : risk.id)}
                    onUpdate={(data) => handleUpdateRisk(risk.id, data)}
                    onRemove={() => handleRemoveRisk(risk.id)}
                  />
                )
              })}

              {risks.length === 0 && (
                <div className="text-center py-6 text-sm text-muted-foreground">
                  目前沒有風險紀錄
                </div>
              )}

              {/* Inline add row */}
              <RiskAddForm
                onAdd={handleAddRisk}
                loading={riskLoading === 'adding'}
              />
            </div>

            {riskError && (
              <p className="text-sm text-destructive">{riskError}</p>
            )}
          </TabsContent>

          {/* Tab 6: Milestones & Tasks */}
          <TabsContent value="workitems" className="flex-1 min-h-0 overflow-y-auto mt-4 space-y-4 px-1">
            {/* Project dates */}
            <div className="grid gap-4 grid-cols-2 p-3 rounded-lg border bg-muted/30">
              <div className="space-y-1.5">
                <Label className="text-sm">
                  專案開始日期 <span className="text-destructive">*</span>
                </Label>
                <Input
                  type="date"
                  value={form.startDate || ''}
                  onChange={e => update('startDate', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">專案結束日期</Label>
                <Input
                  type="date"
                  value={form.endDate || ''}
                  disabled
                  className="text-muted-foreground"
                />
                <p className="text-xs text-muted-foreground">自動依里程碑計算</p>
              </div>
            </div>

            {/* Reset Baseline button */}
            {(project.milestones?.length ?? 0) > 0 && (
              <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/30 px-3 py-2">
                <div className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
                  <TimerReset className="h-4 w-4 shrink-0" />
                  <span>編輯里程碑或任務後，建議重設基線以更新甘特圖基準線</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-sm gap-1.5 border-amber-400 bg-amber-50 text-amber-700 hover:bg-amber-100 hover:text-amber-800 dark:border-amber-600 dark:bg-amber-950 dark:text-amber-400 dark:hover:bg-amber-900 shrink-0 ml-3"
                  disabled={resettingBaseline}
                  onClick={() => setBaselineResetDialogOpen(true)}
                >
                  {resettingBaseline ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TimerReset className="h-3.5 w-3.5" />}
                  重設基線
                </Button>
              </div>
            )}

            <TimelineTable
              milestones={recalcMilestones}
              tasks={tlTasks}
              taskDates={tlTaskDates}
              teamMembers={tlTeamMembers}
              onMilestoneUpdate={handleTlMilestoneUpdate}
              onMilestoneRemove={handleTlMilestoneRemove}
              onMilestoneAdd={handleTlMilestoneAdd}
              onMilestoneReorder={handleTlMilestoneReorder}
              onTaskAdd={handleTlTaskAdd}
              onTaskRemove={handleTlTaskRemove}
              onTaskUpdate={handleTlTaskUpdate}
              onTaskReorder={handleTlTaskReorder}
            />

            {workItemError && (
              <p className="text-sm text-destructive">{workItemError}</p>
            )}
          </TabsContent>
        </Tabs>

        {error && (
          <p className="text-sm text-destructive shrink-0">{error}</p>
        )}

        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            儲存變更
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Reset Baseline Confirmation Dialog */}
      <Dialog open={baselineResetDialogOpen} onOpenChange={setBaselineResetDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>重設里程碑基線</DialogTitle>
            <DialogDescription>
              將目前的里程碑日期設為新的基線。原本的基線紀錄會被覆蓋，延遲標示將會清除。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBaselineResetDialogOpen(false)} disabled={resettingBaseline}>
              取消
            </Button>
            <Button
              disabled={resettingBaseline}
              onClick={async () => {
                setResettingBaseline(true)
                try {
                  const res = await fetch(`/api/projects/${project.id}/reset-baseline`, { method: 'POST' })
                  if (res.ok) {
                    setBaselineResetDialogOpen(false)
                    onWorkItemsChange?.()
                  }
                } finally {
                  setResettingBaseline(false)
                }
              }}
            >
              {resettingBaseline && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
              確認重設
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  )
}

// ─── Inline Add Row ──────────────────────────────────────────

function TeamMemberAddRow({
  existingEmails,
  onAdd,
  loading,
}: {
  existingEmails: Set<string>
  onAdd: (user: { name: string; email?: string }, role: string, responsibility: string) => void
  loading: boolean
}) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [organization, setOrganization] = useState('')
  const [role, setRole] = useState<string>('engineer')
  const [responsibility, setResponsibility] = useState('')

  const handleAdd = () => {
    if (!name.trim()) return
    onAdd({ name: name.trim(), email: email || undefined }, role, responsibility.trim())
    setName('')
    setEmail('')
    setOrganization('')
    setRole('engineer')
    setResponsibility('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAdd()
    }
  }

  return (
    <div className="grid grid-cols-[1fr_80px_140px_1fr_32px] gap-0 items-center px-3 py-1 border-t">
      {/* Name with autocomplete */}
      <div className="pr-2">
        <TeamMemberAutocomplete
          value={name}
          onChange={(val: string) => { setName(val); setEmail(''); setOrganization('') }}
          onSelect={(user: { name: string; email: string; organization: string }) => {
            setName(user.name)
            setEmail(user.email)
            setOrganization(user.organization || '')
          }}
          onKeyDown={handleKeyDown}
          excludeEmails={existingEmails}
          placeholder="+ 新增成員..."
          className="h-8 border-0 bg-transparent text-sm text-muted-foreground placeholder:text-muted-foreground/40 focus-visible:ring-0 focus-visible:border-b focus-visible:border-primary focus-visible:rounded-none px-1.5"
        />
      </div>

      {/* Organization (auto-filled, read-only) */}
      <div className="px-1 min-w-0">
        {organization && (
          <span className="flex items-center gap-1 text-sm text-muted-foreground truncate">
            <Building2 className="h-3 w-3 shrink-0" />
            <span className="truncate">{organization}</span>
          </span>
        )}
      </div>

      {/* Role */}
      <div>
        {name.trim() && (
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger className="h-8 border-0 bg-transparent text-sm focus:ring-1 px-0.5 [&>span]:overflow-visible">
              <RoleBadge role={role} label={TEAM_ROLE_LABELS[role as TeamRole] || role} />
            </SelectTrigger>
            <SelectContent>
              {(Object.entries(TEAM_ROLE_LABELS) as [TeamRole, string][]).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  <RoleBadge role={k} label={v} />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Responsibility */}
      <div className="px-1">
        {name.trim() && (
          <Input
            value={responsibility}
            onChange={(e) => setResponsibility(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="負責工作項目"
            className="h-8 border-0 bg-transparent text-sm text-muted-foreground focus-visible:ring-1 px-1.5"
          />
        )}
      </div>

      {/* Add button */}
      <div className="flex justify-center">
        {name.trim() && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-primary"
            onClick={handleAdd}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Plus className="h-3 w-3" />
            )}
          </Button>
        )}
      </div>
    </div>
  )
}

// ─── Risk Card ───────────────────────────────────────────────

function RiskCard({
  risk,
  isEditing,
  loading,
  onEdit,
  onUpdate,
  onRemove,
}: {
  risk: Risk
  isEditing: boolean
  loading: boolean
  onEdit: () => void
  onUpdate: (data: Partial<Pick<Risk, 'title' | 'description' | 'impact' | 'probability' | 'mitigation' | 'status'>>) => void
  onRemove: () => void
}) {
  const [editForm, setEditForm] = useState({
    title: risk.title,
    description: risk.description,
    impact: risk.impact,
    probability: risk.probability,
    mitigation: risk.mitigation,
    status: risk.status,
  })

  const handleSave = () => {
    if (!editForm.title.trim()) return
    onUpdate(editForm)
  }

  const severity = getRiskSeverity(risk.impact, risk.probability)
  const impactC = RISK_LEVEL_COLORS[risk.impact] || RISK_LEVEL_COLORS.medium
  const probC = RISK_LEVEL_COLORS[risk.probability] || RISK_LEVEL_COLORS.medium

  if (!isEditing) {
    return (
      <div className={`border-t border-l-[3px] ${RISK_SEVERITY_BORDER[severity]} px-3 py-2 hover:bg-muted/30 transition-colors space-y-1`}>
        {/* Row 1: icon + title + tags + actions */}
        <div className="flex items-center gap-2">
          <ShieldAlert className={`h-3.5 w-3.5 shrink-0 ${
            severity === 'high' ? 'text-red-500' : severity === 'medium' ? 'text-amber-500' : 'text-emerald-500'
          }`} />
          <span className="font-medium text-sm truncate">{risk.title}</span>
          <div className="flex items-center gap-1 ml-auto shrink-0">
            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${RISK_STATUS_COLORS[risk.status] || ''}`}>
              {RISK_STATUS_LABELS[risk.status] || risk.status}
            </span>
            <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-medium ${impactC.bg} ${impactC.text}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${impactC.dot}`} />影響{RISK_IMPACT_LABELS[risk.impact]}
            </span>
            <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-medium ${probC.bg} ${probC.text}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${probC.dot}`} />機率{RISK_PROBABILITY_LABELS[risk.probability]}
            </span>
            <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground" onClick={onEdit} disabled={loading}>
              <Pencil className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={onRemove} disabled={loading}>
              {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
            </Button>
          </div>
        </div>

        {/* Row 2 (optional): description + mitigation */}
        {(risk.description || risk.mitigation) && (
          <div className="pl-[1.375rem] text-sm text-muted-foreground leading-relaxed line-clamp-1">
            {risk.description && <span>{risk.description}</span>}
            {risk.description && risk.mitigation && <span className="mx-1.5 text-border">|</span>}
            {risk.mitigation && <span><span className="font-medium text-foreground/70">對策：</span>{risk.mitigation}</span>}
          </div>
        )}
      </div>
    )
  }

  // ─── Inline edit mode ────────────────────────────────────
  return (
    <div className={`border-t border-l-[3px] ${RISK_SEVERITY_BORDER[severity]} bg-primary/5 px-3 py-2 space-y-2`}>
      {/* Row 1: title input + selects + save/cancel */}
      <div className="flex items-center gap-2">
        <Input
          value={editForm.title}
          onChange={e => setEditForm(prev => ({ ...prev, title: e.target.value }))}
          placeholder="風險標題"
          className="h-7 text-sm flex-1 min-w-0"
          autoFocus
        />
        <Select value={editForm.status} onValueChange={v => setEditForm(prev => ({ ...prev, status: v as Risk['status'] }))}>
          <SelectTrigger className="h-7 text-xs w-[88px] shrink-0"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(RISK_STATUS_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={editForm.impact} onValueChange={v => setEditForm(prev => ({ ...prev, impact: v as Risk['impact'] }))}>
          <SelectTrigger className="h-7 text-xs w-[88px] shrink-0"><SelectValue placeholder="影響" /></SelectTrigger>
          <SelectContent>
            {Object.entries(RISK_IMPACT_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>影響{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={editForm.probability} onValueChange={v => setEditForm(prev => ({ ...prev, probability: v as Risk['probability'] }))}>
          <SelectTrigger className="h-7 text-xs w-[88px] shrink-0"><SelectValue placeholder="機率" /></SelectTrigger>
          <SelectContent>
            {Object.entries(RISK_PROBABILITY_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>機率{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 text-primary hover:text-primary" onClick={handleSave} disabled={loading || !editForm.title.trim()}>
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3.5 w-3.5 rotate-45" />}
        </Button>
        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 text-muted-foreground" onClick={onEdit}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Row 2: description + mitigation */}
      <div className="flex items-center gap-2">
        <Input
          value={editForm.description}
          onChange={e => setEditForm(prev => ({ ...prev, description: e.target.value }))}
          placeholder="風險描述"
          className="h-7 text-sm flex-1 min-w-0 border-dashed"
        />
        <Input
          value={editForm.mitigation}
          onChange={e => setEditForm(prev => ({ ...prev, mitigation: e.target.value }))}
          placeholder="緩解對策"
          className="h-7 text-sm flex-1 min-w-0 border-dashed"
          onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
        />
      </div>
    </div>
  )
}

// ─── Risk Add Form (inline) ──────────────────────────────────

function RiskAddForm({
  onAdd,
  loading,
}: {
  onAdd: (data: { title: string; description: string; impact: string; probability: string; mitigation: string }) => void
  loading: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [impact, setImpact] = useState('medium')
  const [probability, setProbability] = useState('medium')
  const [mitigation, setMitigation] = useState('')

  const handleAdd = () => {
    if (!title.trim()) return
    onAdd({ title: title.trim(), description: description.trim(), impact, probability, mitigation: mitigation.trim() })
    setTitle('')
    setDescription('')
    setImpact('medium')
    setProbability('medium')
    setMitigation('')
    setExpanded(false)
  }

  if (!expanded) {
    return (
      <div
        className="border-t px-3 py-2 flex items-center gap-2 text-sm text-muted-foreground/60 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(true)}
      >
        <Plus className="h-3.5 w-3.5" />
        <span>新增風險...</span>
      </div>
    )
  }

  return (
    <div className="border-t bg-muted/20 px-3 py-2 space-y-2">
      {/* Row 1: title + selects + add button */}
      <div className="flex items-center gap-2">
        <Input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="+ 風險標題..."
          className="h-7 text-sm flex-1 min-w-0 border-dashed"
          autoFocus
        />
        <Select value={impact} onValueChange={setImpact}>
          <SelectTrigger className="h-7 text-xs w-[88px] shrink-0"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(RISK_IMPACT_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>影響{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={probability} onValueChange={setProbability}>
          <SelectTrigger className="h-7 text-xs w-[88px] shrink-0"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(RISK_PROBABILITY_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>機率{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 text-primary hover:text-primary" onClick={handleAdd} disabled={loading || !title.trim()}>
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
        </Button>
        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 text-muted-foreground" onClick={() => setExpanded(false)}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Row 2: description + mitigation */}
      {title.trim() && (
        <div className="flex items-center gap-2">
          <Input
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="風險描述（選填）"
            className="h-7 text-sm flex-1 min-w-0 border-dashed"
          />
          <Input
            value={mitigation}
            onChange={e => setMitigation(e.target.value)}
            placeholder="緩解對策（選填）"
            className="h-7 text-sm flex-1 min-w-0 border-dashed"
            onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
          />
        </div>
      )}
    </div>
  )
}


