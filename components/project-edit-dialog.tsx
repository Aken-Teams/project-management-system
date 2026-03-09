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
import { Loader2, Settings2, FileText, Target, Users, Trash2, Plus, AlertTriangle, Pencil, X, ShieldAlert, ListChecks, CalendarClock, Send } from 'lucide-react'
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
import { useAuth } from '@/lib/auth-context'
import { toast } from 'sonner'

interface ProjectEditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  project: Project
  onSave: (data: ProjectEditData) => Promise<void>
  onTeamChange?: () => void
  onRiskChange?: () => void
  onWorkItemsChange?: () => Promise<void> | void
  defaultTab?: string
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

// ─── Role color map (RACI) ───────────────────────────────────
const ROLE_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  R: { bg: 'bg-blue-50',   text: 'text-blue-700',   dot: 'bg-blue-500' },
  A: { bg: 'bg-amber-50',  text: 'text-amber-700',  dot: 'bg-amber-500' },
  C: { bg: 'bg-violet-50', text: 'text-violet-700', dot: 'bg-violet-500' },
  I: { bg: 'bg-slate-50',  text: 'text-slate-600',  dot: 'bg-slate-400' },
}

function RoleBadge({ role, label }: { role: string; label: string }) {
  const c = ROLE_COLORS[role] || ROLE_COLORS.I
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

export function ProjectEditDialog({ open, onOpenChange, project, onSave, onTeamChange, onRiskChange, onWorkItemsChange, defaultTab }: ProjectEditDialogProps) {
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
  const [activeTab, setActiveTab] = useState(defaultTab || 'basic')

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
  // ─── Date change approval state ──────────────────────────
  const { user } = useAuth()
  const [dateChangeDialogOpen, setDateChangeDialogOpen] = useState(false)
  const [dateChangeReason, setDateChangeReason] = useState('')
  const [dateChangeSaving, setDateChangeSaving] = useState(false)
  const [affectedMilestoneDates, setAffectedMilestoneDates] = useState<Array<{
    milestoneId: string
    milestoneName: string
    originalDate: string
    proposedDate: string
  }>>([])

  // Snapshot of original data for diff on save.
  // Use calculated endDates (not raw DB dueDate) so that stale DB values
  // (e.g. after a project startDate change was approved) don't cause false positives.
  const [origMilestones] = useState(() => {
    const initRecalc = calculateMilestoneDates(tlInit.milestones, project.startDate, tlInit.tasks)
    return initRecalc.map(ms => ({ id: ms.id, name: ms.name, dueDate: ms.endDate || '' }))
  })
  const [origTasks] = useState(() =>
    (project.tasks ?? []).map(t => ({
      id: t.id, milestoneId: t.milestoneId, title: t.title,
      assignee: t.assignee, priority: t.priority,
      durationDays: t.durationDays, startDate: t.startDate, endDate: t.endDate,
      parentId: t.parentId ?? undefined,
    }))
  )

  // Recalculate dates on every render
  const recalcMilestones = calculateMilestoneDates(tlMilestones, form.startDate || project.startDate, tlTasks)
  const tlTaskDates = calculateTaskDates(tlTasks, recalcMilestones)

  // Detect if milestones or tasks changed (for showing reset baseline prompt)
  // Detect which existing milestones have date changes
  const detectMilestoneDateChanges = useCallback(() => {
    const changes: Array<{
      milestoneId: string
      milestoneName: string
      originalDate: string
      proposedDate: string
    }> = []
    for (const ms of recalcMilestones) {
      const orig = origMilestones.find(o => o.id === ms.id)
      if (!orig) continue // skip newly added milestones
      if (ms.endDate && ms.endDate !== orig.dueDate) {
        changes.push({
          milestoneId: ms.id,
          milestoneName: ms.name,
          originalDate: orig.dueDate,
          proposedDate: ms.endDate,
        })
      }
    }
    return changes
  }, [recalcMilestones, origMilestones])

  // Auto-resize milestone duration to match task total (expand + shrink)
  useEffect(() => {
    const { milestones: updated, changed } = autoExpandMilestones(tlMilestones, tlTasks)
    if (changed) setTlMilestones(updated)
  }, [tlTasks]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-update project end date from last milestone
  const lastMsEndDate = useMemo(() => {
    const last = [...recalcMilestones].reverse().find(m => m.endDate && m.durationDays > 0)
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

  // ─── Batch save work items (extracted for reuse) ───
  type WorkItemsDiff = ReturnType<typeof computeWorkItemsDiff>

  const executeBatchSave = async (diff: WorkItemsDiff) => {
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
    // 5. Create new tasks (resolve draft milestone/parent IDs)
    const newTaskIdMap = new Map<string, string>()
    for (const task of diff.tasksToAdd) {
      const resolvedMsId = newMsIdMap.get(task.milestoneId) || task.milestoneId
      const resolvedParentId = task.parentId
        ? (newTaskIdMap.get(task.parentId) || task.parentId)
        : undefined
      const res = await fetch(`/api/projects/${project.id}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...task, milestoneId: resolvedMsId, parentId: resolvedParentId }),
      })
      if (res.ok) {
        const created = await res.json()
        newTaskIdMap.set(task.tempId, created.id)
      }
    }
    // 6. Update existing tasks
    for (const task of diff.tasksToUpdate) {
      await fetch(`/api/projects/${project.id}/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(task),
      })
    }
    // 7. Rebuild sequential task dependencies on ANY work item change
    const hasAnyWorkItemChange =
      diff.tasksToAdd.length > 0 || diff.tasksToDelete.length > 0 || diff.tasksToUpdate.length > 0 ||
      diff.milestonesToAdd.length > 0 || diff.milestonesToDelete.length > 0 || diff.milestonesToUpdate.length > 0
    if (hasAnyWorkItemChange) {
      await fetch(`/api/projects/${project.id}/rebuild-dependencies`, { method: 'POST' })
    }
    return newMsIdMap
  }

  // ─── Core validate + save logic ───
  const validateAndSaveAll = async (): Promise<boolean> => {
    // Validation matching the creation form
    if (!form.name.trim()) {
      setError('專案名稱不可為空')
      setActiveTab('basic')
      return false
    }
    if (!form.projectTier) {
      setError('專案層級為必填')
      setActiveTab('basic')
      return false
    }
    if (!form.projectType) {
      setError('專案類型為必填')
      setActiveTab('basic')
      return false
    }
    if (!form.demandSource) {
      setError('需求來源為必填')
      setActiveTab('basic')
      return false
    }
    if (!form.createdReason.trim()) {
      setError('開案原因不可為空')
      setActiveTab('basic')
      return false
    }
    if (!form.smartObjective?.specific?.trim()) {
      setError('SMART 目標中「具體目標」不可為空')
      setActiveTab('smart')
      return false
    }
    if (!form.smartObjective?.measurable?.trim()) {
      setError('SMART 目標中「可衡量指標」不可為空')
      setActiveTab('smart')
      return false
    }
    if (!form.smartObjective?.achievable?.trim()) {
      setError('SMART 目標中「可達成性」不可為空')
      setActiveTab('smart')
      return false
    }
    if (!form.smartObjective?.relevant?.trim()) {
      setError('SMART 目標中「相關性」不可為空')
      setActiveTab('smart')
      return false
    }
    if (!form.smartObjective?.timeBound?.trim()) {
      setError('SMART 目標中「時限性」不可為空')
      setActiveTab('smart')
      return false
    }
    if (!form.purpose.trim()) {
      setError('專案目的不可為空')
      setActiveTab('description')
      return false
    }

    setError('')
    setWorkItemError('')

    // Auto-generate objective from SMART (matching creation form logic)
    const smart = form.smartObjective
    const autoObjective = smart?.specific
      ? `${smart.specific}${smart.measurable ? '，' + smart.measurable : ''}`
      : form.objective

    // ─── Batch save work items ──────────────────────────────
    const diff = computeWorkItemsDiff(origMilestones, origTasks, recalcMilestones, tlTasks, tlTaskDates)

    // ─── Detect milestone date changes → require approval ───
    const dateChanges = detectMilestoneDateChanges()
    const startDateChanged = form.startDate !== project.startDate

    if (dateChanges.length > 0) {
      // Save project metadata with ORIGINAL startDate to avoid inconsistency
      // (the new startDate will be applied when the delay request is approved)
      const saveForm = startDateChanged
        ? { ...form, objective: autoObjective, startDate: project.startDate }
        : { ...form, objective: autoObjective }
      await onSave(saveForm)

      // Strip dueDate from milestone updates (defer to approval)
      const strippedMsUpdates = diff.milestonesToUpdate
        .map(ms => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { dueDate, ...rest } = ms as typeof ms & { dueDate?: string }
          return rest
        })
        .filter(ms => {
          const { id, ...fields } = ms
          return Object.keys(fields).length > 0
        }) as WorkItemsDiff['milestonesToUpdate']

      // Strip startDate/endDate from task updates (keep durationDays etc.)
      const strippedTaskUpdates = diff.tasksToUpdate
        .map(task => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { startDate, endDate, ...rest } = task as typeof task & { startDate?: string; endDate?: string }
          return rest
        })
        .filter(task => {
          const { id, ...fields } = task
          return Object.keys(fields).length > 0
        }) as WorkItemsDiff['tasksToUpdate']

      // Save non-date changes immediately
      await executeBatchSave({
        ...diff,
        milestonesToUpdate: strippedMsUpdates,
        tasksToUpdate: strippedTaskUpdates,
      })

      // Open date change dialog for approval
      setAffectedMilestoneDates(dateChanges)
      setDateChangeDialogOpen(true)
      return false // don't close edit dialog yet
    }

    // No date changes: save project metadata normally
    await onSave({ ...form, objective: autoObjective })

    // ─── No date changes: proceed with normal full save ──
    await executeBatchSave(diff)

    return true
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      if (await validateAndSaveAll()) {
        await onWorkItemsChange?.()
        onOpenChange(false)
      }
    } catch {
      setError('儲存失敗，請稍後再試')
    } finally {
      setSaving(false)
    }
  }

  const handleSubmitDateChange = async () => {
    if (!user || affectedMilestoneDates.length === 0 || !dateChangeReason.trim()) return
    setDateChangeSaving(true)
    const startDateChanged = form.startDate !== project.startDate
    try {
      const res = await fetch('/api/delay-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: project.id,
          requesterId: user.id,
          type: 'date_change',
          reason: dateChangeReason.trim(),
          canCatchUp: true,
          affectedMilestones: affectedMilestoneDates.map((am, idx) => ({
            milestoneId: am.milestoneId,
            originalDate: am.originalDate,
            proposedDate: am.proposedDate,
            // Attach proposed startDate to first milestone entry
            ...(idx === 0 && startDateChanged ? {
              originalStartDate: project.startDate,
              proposedStartDate: form.startDate,
            } : {}),
          })),
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || '送出失敗')
      }
      setDateChangeDialogOpen(false)
      setDateChangeReason('')
      setAffectedMilestoneDates([])
      setPendingSaveOptions(null)
      await onWorkItemsChange?.()
      onOpenChange(false)
      toast.success('日期變更申請已送出審核')
    } catch (err) {
      setError(err instanceof Error ? err.message : '送出日期變更申請失敗')
    } finally {
      setDateChangeSaving(false)
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

  const handleAddMember = useCallback(async (user: { name: string; email?: string; adId?: string }, role: string, jobTitle: string, organization: string, responsibility: string) => {
    setTeamError('')
    setTeamLoading('adding')
    try {
      const res = await fetch(`/api/projects/${project.id}/team`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: user.name, email: user.email, adId: user.adId, role, jobTitle, organization, responsibility }),
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

  const handleUpdateMember = useCallback(async (memberId: string, field: 'role' | 'jobTitle' | 'organization' | 'responsibility', value: string) => {
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

  const handleTlMilestoneUpdate = useCallback((index: number, field: 'name' | 'durationDays', value: string | number) => {
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
    setTlMilestones(prev => [...prev, { id: `draft-ms-${Date.now()}`, name: '', durationDays: 0 }])
  }, [])

  const handleTlMilestoneReorder = useCallback((oldIdx: number, newIdx: number) => {
    setTlMilestones(prev => arrayMove(prev, oldIdx, newIdx))
  }, [])

  // Auto-sync parent durationDays = sum of children durationDays
  const syncParentDurations = useCallback((tasks: typeof tlTasks) => {
    const parentIds = new Set(tasks.filter(t => t.parentId).map(t => t.parentId!))
    if (parentIds.size === 0) return tasks
    let changed = false
    const updated = tasks.map(t => {
      if (!parentIds.has(t.id)) return t
      const childSum = tasks
        .filter(c => c.parentId === t.id)
        .reduce((sum, c) => sum + Math.max(c.durationDays || 1, 1), 0)
      if (childSum > 0 && t.durationDays !== childSum) {
        changed = true
        return { ...t, durationDays: childSum }
      }
      return t
    })
    return changed ? updated : tasks
  }, [])

  const handleTlTaskAdd = useCallback((task: { id: string; milestoneId: string; title: string; assignee: string; priority: 'low' | 'medium' | 'high'; durationDays: number; parentId?: string }) => {
    setTlTasks(prev => syncParentDurations([...prev, task]))
  }, [syncParentDurations])

  const handleTlTaskRemove = useCallback((taskId: string) => {
    setTlTasks(prev => {
      const remaining = prev.filter(t => t.id !== taskId && t.parentId !== taskId)
      return syncParentDurations(remaining)
    })
  }, [syncParentDurations])

  const handleTlTaskUpdate = useCallback((taskId: string, field: string, value: string | number) => {
    setTlTasks(prev => {
      const updated = prev.map(t => t.id === taskId ? { ...t, [field]: value } : t)
      return syncParentDurations(updated)
    })
  }, [syncParentDurations])

  const handleTlTaskReorder = useCallback((oldIdx: number, newIdx: number) => {
    setTlTasks(prev => arrayMove(prev, oldIdx, newIdx))
  }, [])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-4xl max-h-[90vh] flex flex-col"
      >
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
              <div className="grid grid-cols-[1fr_80px_80px_100px_1fr_32px] gap-0 items-center px-3 py-2 bg-muted/60 border-b text-sm font-medium text-muted-foreground tracking-wide">
                <span>姓名</span>
                <span className="text-center">職稱</span>
                <span className="text-center">組織</span>
                <span className="text-center">角色</span>
                <span className="pl-1.5">負責工作項目</span>
                <span />
              </div>

              {/* Member rows */}
              {teamMembers.map((member) => (
                <div
                  key={member.id}
                  className="grid grid-cols-[1fr_80px_80px_100px_1fr_32px] gap-0 items-center px-3 py-1.5 border-t hover:bg-muted/20 transition-colors text-sm"
                >
                  {/* Name */}
                  <div className="flex items-center gap-2 pr-2 min-w-0">
                    <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${(ROLE_COLORS[member.role] || ROLE_COLORS.I).bg} ${(ROLE_COLORS[member.role] || ROLE_COLORS.I).text}`}>
                      {member.name.charAt(0)}
                    </div>
                    <span className="truncate font-medium">{member.name}</span>
                  </div>

                  {/* Job Title */}
                  <div className="px-1 min-w-0 text-center">
                    <Input
                      value={member.jobTitle || ''}
                      onChange={(e) => {
                        setTeamMembers(prev => prev.map(m =>
                          m.id === member.id ? { ...m, jobTitle: e.target.value } : m
                        ))
                      }}
                      onBlur={(e) => {
                        const original = project.teamMembers?.find(m => m.id === member.id)
                        if (original && (original.jobTitle || '') !== e.target.value) {
                          handleUpdateMember(member.id, 'jobTitle', e.target.value)
                        }
                      }}
                      placeholder="—"
                      className="h-8 border-0 bg-transparent text-sm text-center focus-visible:ring-1 px-1"
                      disabled={teamLoading === member.id}
                    />
                  </div>

                  {/* Organization */}
                  <div className="px-1 min-w-0 text-center">
                    <Input
                      value={member.organization || ''}
                      onChange={(e) => {
                        setTeamMembers(prev => prev.map(m =>
                          m.id === member.id ? { ...m, organization: e.target.value } : m
                        ))
                      }}
                      onBlur={(e) => {
                        const original = project.teamMembers?.find(m => m.id === member.id)
                        if (original && (original.organization || '') !== e.target.value) {
                          handleUpdateMember(member.id, 'organization', e.target.value)
                        }
                      }}
                      placeholder="—"
                      className="h-8 border-0 bg-transparent text-sm text-center focus-visible:ring-1 px-1"
                      disabled={teamLoading === member.id}
                    />
                  </div>

                  {/* Role */}
                  <div className="flex justify-center">
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

      {/* Date Change Approval Dialog */}
      <Dialog open={dateChangeDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setDateChangeDialogOpen(false)
          setDateChangeReason('')
        }
      }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-amber-500" />
              日期變更需要審核
            </DialogTitle>
            <DialogDescription>
              以下里程碑的日期已變更，需提交審核申請。其他變更（名稱、負責人等）已儲存。
            </DialogDescription>
          </DialogHeader>

          {form.startDate !== project.startDate && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950 px-3 py-2 text-sm text-blue-700 dark:text-blue-400 flex items-center gap-2">
              <CalendarClock className="h-4 w-4 shrink-0" />
              專案開始日期：{project.startDate} → {form.startDate}（一併提交審核）
            </div>
          )}

          <div className="rounded-lg border overflow-hidden">
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 px-3 py-2 bg-muted/60 border-b text-xs font-medium text-muted-foreground">
              <span>里程碑</span>
              <span className="text-center">原預定日</span>
              <span className="text-center">新預定日</span>
              <span className="text-center">天數</span>
            </div>
            {affectedMilestoneDates.map((am) => {
              const days = Math.ceil(
                (new Date(am.proposedDate).getTime() - new Date(am.originalDate).getTime()) / (1000 * 60 * 60 * 24)
              )
              return (
                <div key={am.milestoneId} className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 items-center px-3 py-2 border-t text-sm">
                  <span className="font-medium truncate">{am.milestoneName}</span>
                  <span className="text-muted-foreground tabular-nums text-xs">{am.originalDate}</span>
                  <span className="text-amber-600 dark:text-amber-400 font-medium tabular-nums text-xs">{am.proposedDate}</span>
                  <span className={`text-xs tabular-nums font-medium ${days > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                    {days > 0 ? `+${days}` : days}天
                  </span>
                </div>
              )
            })}
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">
              變更原因 <span className="text-destructive">*</span>
            </Label>
            <Textarea
              placeholder="說明日期變更的原因..."
              value={dateChangeReason}
              onChange={e => setDateChangeReason(e.target.value)}
              rows={3}
            />
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <DialogFooter>
            <Button
              onClick={handleSubmitDateChange}
              disabled={dateChangeSaving || !dateChangeReason.trim()}
              className="gap-1.5"
            >
              {dateChangeSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              提交審核
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
  onAdd: (user: { name: string; email?: string; adId?: string }, role: string, jobTitle: string, organization: string, responsibility: string) => void
  loading: boolean
}) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [jobTitle, setJobTitle] = useState('')
  const [organization, setOrganization] = useState('')
  const [role, setRole] = useState<string>('R')
  const [responsibility, setResponsibility] = useState('')

  const handleAdd = () => {
    if (!name.trim()) return
    onAdd({ name: name.trim(), email: email || undefined, adId: undefined }, role, jobTitle.trim(), organization.trim(), responsibility.trim())
    setName('')
    setEmail('')
    setJobTitle('')
    setOrganization('')
    setRole('R')
    setResponsibility('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAdd()
    }
  }

  return (
    <div className="grid grid-cols-[1fr_80px_80px_100px_1fr_32px] gap-0 items-center px-3 py-1 border-t">
      {/* Name with autocomplete */}
      <div className="pr-2">
        <TeamMemberAutocomplete
          value={name}
          onChange={(val: string) => { setName(val); setEmail(''); setJobTitle(''); setOrganization('') }}
          onSelect={(user: { id?: string; name: string; email: string; jobTitle?: string; organization: string }) => {
            // Immediately add the member (pass adId = AD username for stable DB identity)
            onAdd({ name: user.name, email: user.email || undefined, adId: user.id }, role, user.jobTitle || '', user.organization || '', responsibility.trim())
            setName('')
            setEmail('')
            setJobTitle('')
            setOrganization('')
            setRole('R')
            setResponsibility('')
          }}
          onKeyDown={handleKeyDown}
          excludeEmails={existingEmails}
          placeholder="+ 新增成員..."
          className="h-8 border-0 bg-transparent text-sm text-muted-foreground placeholder:text-muted-foreground/40 focus-visible:ring-0 focus-visible:border-b focus-visible:border-primary focus-visible:rounded-none px-1.5"
        />
      </div>

      {/* Job Title (auto-filled, editable) */}
      <div className="px-1 min-w-0 text-center">
        {name.trim() && (
          <Input
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="—"
            className="h-8 border-0 bg-transparent text-sm text-center text-muted-foreground focus-visible:ring-1 px-1"
          />
        )}
      </div>

      {/* Organization (auto-filled, editable) */}
      <div className="px-1 min-w-0 text-center">
        {name.trim() && (
          <Input
            value={organization}
            onChange={(e) => setOrganization(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="—"
            className="h-8 border-0 bg-transparent text-sm text-center text-muted-foreground focus-visible:ring-1 px-1"
          />
        )}
      </div>

      {/* Role */}
      <div className="flex justify-center">
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


