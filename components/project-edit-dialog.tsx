'use client'

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
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
import { Loader2, Settings2, FileText, Target, Users, Trash2, Plus, AlertTriangle, Pencil, X, ShieldAlert, ListChecks, CalendarClock, Send, DollarSign, BarChart3 } from 'lucide-react'
import { BudgetListEditor, validateBudgetItems, type BudgetItem } from '@/components/budget-list-editor'
import { GanttChart } from '@/components/gantt-chart'
import { TimelineTable, type TimelineTeamMember, type OverflowInfo } from '@/components/timeline-table'
import { calculateMilestoneDates, calculateTaskDates, dbToTimelineState, computeWorkItemsDiff, daysBetween } from '@/lib/timeline-utils'
import { arrayMove } from '@dnd-kit/sortable'
import {
  type Project,
  type ProjectType,
  type ProjectTier,
  type DemandSource,
  type SmartObjective,
  type TeamRole,
  type Risk,
  PROJECT_TIER_LABELS,
  DEMAND_SOURCE_LABELS,
  TEAM_ROLE_LABELS,
} from '@/lib/mock-data'
import { useProjectTypes } from '@/hooks/use-project-types'
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
  onSaved?: () => Promise<void> | void
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
  roiGrossMargin?: number | null
  roiAvgPrice?: number | null
  roiCapacity?: number | null
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
  P: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  S: { bg: 'bg-rose-50',   text: 'text-rose-700',   dot: 'bg-rose-500' },
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

export function ProjectEditDialog({ open, onOpenChange, project, onSave, onTeamChange, onRiskChange, onWorkItemsChange, onSaved, defaultTab }: ProjectEditDialogProps) {
  const { projectTypes } = useProjectTypes()
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
    roiGrossMargin: (project as any).roiGrossMargin ?? null,
    roiAvgPrice: (project as any).roiAvgPrice ?? null,
    roiCapacity: (project as any).roiCapacity ?? null,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState(defaultTab || 'basic')

  // ─── Team member state ────────────────────────────────────
  const [teamMembers, setTeamMembers] = useState(project.teamMembers ?? [])
  const [teamLoading, setTeamLoading] = useState<string | null>(null)
  const [teamError, setTeamError] = useState('')

  // ─── Budget items state ──────────────────────────────────
  const [budgetItems, setBudgetItems] = useState<BudgetItem[]>([])
  const [budgetItemsLoaded, setBudgetItemsLoaded] = useState(false)

  useEffect(() => {
    if (!open) return
    setBudgetItemsLoaded(false)
    fetch(`/api/projects/${project.id}/budget-items`)
      .then(r => r.ok ? r.json() : [])
      .then((data: BudgetItem[]) => { setBudgetItems(data); setBudgetItemsLoaded(true) })
      .catch(() => setBudgetItemsLoaded(true))
  }, [open, project.id])

  // Track whether budget was set by AI total (合計 row from image)
  const [aiBudgetTotal, setAiBudgetTotal] = useState<number | null>(null)

  // Auto-sync budget from items total (only when no AI total is set)
  useEffect(() => {
    if (!budgetItemsLoaded) return
    if (aiBudgetTotal != null) return // AI total takes priority — don't auto-sync
    const total = budgetItems.reduce((sum, item) => sum + (item.estimatedCost ?? 0), 0)
    if (budgetItems.some(i => i.estimatedCost != null)) {
      update('budget', total)
    }
  }, [budgetItems, budgetItemsLoaded, aiBudgetTotal]) // eslint-disable-line react-hooks/exhaustive-deps

  // Handler: AI parsing sets the budget to the image's 合計 total
  const handleAITotal = (total: number) => {
    setAiBudgetTotal(total)
    update('budget', total)
  }

  // Budget validation: items sum must match AI total
  const budgetItemsTotal = budgetItems.reduce((sum, item) => sum + (item.estimatedCost ?? 0), 0)
  const hasBudgetMismatch = aiBudgetTotal != null && budgetItems.length > 0
    && Math.abs(budgetItemsTotal - aiBudgetTotal) >= 1

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
  const [ganttPreviewOpen, setGanttPreviewOpen] = useState(false)
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
  const [pendingTaskChanges, setPendingTaskChanges] = useState<Array<{
    taskId: string
    taskTitle: string
    durationDays?: number
    startDate?: string
    endDate?: string
  }>>([])
  // ─── Overflow confirmation state ─────────────────────────
  const [overflowConfirmOpen, setOverflowConfirmOpen] = useState(false)
  const overflowConfirmResolveRef = useRef<((confirmed: boolean) => void) | null>(null)

  // Snapshot of original data for diff on save.
  // Use calculated endDates (not raw DB dueDate) so that stale DB values
  // (e.g. after a project startDate change was approved) don't cause false positives.
  const [origMilestones] = useState(() => {
    const initRecalc = calculateMilestoneDates(tlInit.milestones, project.startDate, tlInit.tasks)
    return initRecalc.map(ms => ({ id: ms.id, name: ms.name, dueDate: ms.endDate || '', startDate: ms.startDate }))
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

  // Detect overflow: milestone end < task end, or task end < subtask end
  const overflowMap = useMemo(() => {
    const map = new Map<string, OverflowInfo>()
    for (const ms of recalcMilestones) {
      if (!ms.endDate) continue
      const msEnd = new Date(ms.endDate).getTime()
      const msTasks = tlTasks.filter(t => t.milestoneId === ms.id && !t.parentId)
      let maxChildEnd = 0
      let maxChildEndStr = ''
      for (const t of msTasks) {
        const dates = tlTaskDates.get(t.id)
        if (dates) {
          const tEnd = new Date(dates.endDate).getTime()
          if (tEnd > maxChildEnd) { maxChildEnd = tEnd; maxChildEndStr = dates.endDate }
        }
      }
      if (maxChildEnd > msEnd) {
        map.set(ms.id, { childEnd: maxChildEndStr, overflowDays: Math.ceil((maxChildEnd - msEnd) / 86400000) })
      }
    }
    for (const t of tlTasks.filter(t => !t.parentId)) {
      const subtasks = tlTasks.filter(s => s.parentId === t.id)
      if (subtasks.length === 0) continue
      const taskDates = tlTaskDates.get(t.id)
      if (!taskDates) continue
      const taskEnd = new Date(taskDates.endDate).getTime()
      let maxSubEnd = 0
      let maxSubEndStr = ''
      for (const s of subtasks) {
        const sd = tlTaskDates.get(s.id)
        if (sd) {
          const sEnd = new Date(sd.endDate).getTime()
          if (sEnd > maxSubEnd) { maxSubEnd = sEnd; maxSubEndStr = sd.endDate }
        }
      }
      if (maxSubEnd > taskEnd) {
        map.set(t.id, { childEnd: maxSubEndStr, overflowDays: Math.ceil((maxSubEnd - taskEnd) / 86400000) })
      }
    }
    return map
  }, [recalcMilestones, tlTasks, tlTaskDates])

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

  // Auto-update project end date from latest milestone end
  const lastMsEndDate = useMemo(() => {
    const endDates = recalcMilestones
      .filter(m => m.endDate && m.durationDays > 0)
      .map(m => m.endDate!)
    return endDates.length > 0 ? endDates.sort().pop()! : ''
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

    // Validate budget items cost consistency
    const budgetErrors = validateBudgetItems(budgetItems)
    if (budgetErrors.length > 0) {
      setError(`設備清單費用有誤：${budgetErrors[0]}${budgetErrors.length > 1 ? ` 等 ${budgetErrors.length} 筆` : ''}`)
      setActiveTab('basic')
      return false
    }

    setError('')
    setWorkItemError('')

    // ─── Overflow confirmation (milestone < tasks, task < subtasks) ───
    if (overflowMap.size > 0) {
      const confirmed = await new Promise<boolean>((resolve) => {
        overflowConfirmResolveRef.current = resolve
        setOverflowConfirmOpen(true)
      })
      if (!confirmed) return false
    }

    // Auto-generate objective from SMART (matching creation form logic)
    const smart = form.smartObjective
    const autoObjective = smart?.specific
      ? `${smart.specific}${smart.measurable ? '，' + smart.measurable : ''}`
      : form.objective

    // ─── Batch save work items ──────────────────────────────
    const diff = computeWorkItemsDiff(origMilestones, origTasks, recalcMilestones, tlTasks, tlTaskDates)

    // ─── Detect date changes → require approval (active phase only) ───
    const msDateChanges = detectMilestoneDateChanges()
    const taskDateChanges = diff.tasksToUpdate
      .filter(t => t.durationDays !== undefined || t.startDate !== undefined || t.endDate !== undefined)
      .map(t => {
        const orig = origTasks.find(ot => ot.id === t.id)
        return {
          taskId: t.id,
          taskTitle: orig?.title || tlTasks.find(tt => tt.id === t.id)?.title || '',
          ...(t.durationDays !== undefined ? { durationDays: t.durationDays } : {}),
          ...(t.startDate !== undefined ? { startDate: t.startDate } : {}),
          ...(t.endDate !== undefined ? { endDate: t.endDate } : {}),
        }
      })
    const startDateChanged = form.startDate !== project.startDate
    const hasAnyDateChange = msDateChanges.length > 0 || taskDateChanges.length > 0 || startDateChanged

    // ─── Save budget items (must run regardless of date-change path) ───
    await fetch(`/api/projects/${project.id}/budget-items`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: budgetItems }),
    })

    if (hasAnyDateChange && project.phase === 'active') {
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

      // Strip ALL date-related fields from task updates (defer to approval)
      const strippedTaskUpdates = diff.tasksToUpdate
        .map(task => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { startDate, endDate, durationDays, ...rest } = task as typeof task & { startDate?: string; endDate?: string; durationDays?: number }
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
      setAffectedMilestoneDates(msDateChanges)
      setPendingTaskChanges(taskDateChanges)
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
        await onSaved?.()
        onOpenChange(false)
      }
    } catch {
      setError('儲存失敗，請稍後再試')
    } finally {
      setSaving(false)
    }
  }

  const handleSubmitDateChange = async () => {
    if (!user || !dateChangeReason.trim()) return
    if (affectedMilestoneDates.length === 0 && pendingTaskChanges.length === 0) return
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
          ...(affectedMilestoneDates.length > 0 ? {
            affectedMilestones: affectedMilestoneDates.map((am, idx) => ({
              milestoneId: am.milestoneId,
              originalDate: am.originalDate,
              proposedDate: am.proposedDate,
              ...(idx === 0 && startDateChanged ? {
                originalStartDate: project.startDate,
                proposedStartDate: form.startDate,
              } : {}),
            })),
          } : {}),
          ...(pendingTaskChanges.length > 0 ? { pendingTaskChanges } : {}),
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || '送出失敗')
      }
      setDateChangeDialogOpen(false)
      setDateChangeReason('')
      setAffectedMilestoneDates([])
      setPendingTaskChanges([])
      await onWorkItemsChange?.()
      await onSaved?.()
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

  // ─── Bubble-up: child changes → auto-adjust parent duration ───
  // subtask change → parent task adjusts; task change → milestone adjusts.
  // directEditId: skip this task in parent-sync (user is editing it directly).
  const applyTaskChangeWithBubbleUp = useCallback((
    newTasks: typeof tlTasks,
    directEditId?: string,
  ) => {
    const start = form.startDate || project.startDate

    // Pass 1: compute dates with current milestones + new tasks
    const msComputed = calculateMilestoneDates(tlMilestones, start, newTasks)
    const dates = calculateTaskDates(newTasks, msComputed)

    // Pass 2: bubble subtask → parent task (span-based, not sum)
    const parentIds = new Set(newTasks.filter(t => t.parentId).map(t => t.parentId!))
    let tasksChanged = false
    let finalTasks = newTasks

    if (parentIds.size > 0) {
      finalTasks = newTasks.map(t => {
        if (!parentIds.has(t.id) || t.id === directEditId) return t
        const td = dates.get(t.id)
        if (!td) return t
        const children = newTasks.filter(c => c.parentId === t.id)
        const maxChildEnd = Math.max(...children.map(c => {
          const cd = dates.get(c.id)
          return cd ? new Date(cd.endDate).getTime() : 0
        }))
        if (maxChildEnd <= 0) return t
        const needed = Math.ceil((maxChildEnd - new Date(td.startDate).getTime()) / 86400000) + 1
        if (needed > 0 && needed !== t.durationDays) {
          tasksChanged = true
          return { ...t, durationDays: needed }
        }
        return t
      })
    }

    // Pass 3: recompute dates if tasks changed, then bubble task → milestone
    const msComputed2 = tasksChanged ? calculateMilestoneDates(tlMilestones, start, finalTasks) : msComputed
    const dates2 = tasksChanged ? calculateTaskDates(finalTasks, msComputed2) : dates

    let msChanged = false
    const newMilestones = tlMilestones.map((ms, idx) => {
      const msData = msComputed2[idx]
      if (!msData?.startDate) return ms
      const msTasks = finalTasks.filter(t => t.milestoneId === ms.id)
      if (msTasks.length === 0) return ms
      const maxEnd = Math.max(...msTasks.map(t => {
        const td = dates2.get(t.id)
        return td ? new Date(td.endDate).getTime() : 0
      }))
      if (maxEnd <= 0) return ms
      const needed = Math.ceil((maxEnd - new Date(msData.startDate).getTime()) / 86400000) + 1
      if (needed > 0 && needed !== ms.durationDays) {
        msChanged = true
        return { ...ms, durationDays: needed }
      }
      return ms
    })

    setTlTasks(finalTasks)
    if (msChanged) setTlMilestones(newMilestones)
  }, [tlMilestones, form.startDate, project.startDate])

  const handleTlTaskAdd = useCallback((task: { id: string; milestoneId: string; title: string; assignee: string; priority: 'low' | 'medium' | 'high'; durationDays: number; parentId?: string }) => {
    applyTaskChangeWithBubbleUp([...tlTasks, task])
  }, [tlTasks, applyTaskChangeWithBubbleUp])

  const handleTlTaskRemove = useCallback((taskId: string) => {
    const remaining = tlTasks.filter(t => t.id !== taskId && t.parentId !== taskId)
    applyTaskChangeWithBubbleUp(remaining)
  }, [tlTasks, applyTaskChangeWithBubbleUp])

  const handleTlTaskUpdate = useCallback((taskId: string, field: string, value: string | number) => {
    const updated = tlTasks.map(t => t.id === taskId ? { ...t, [field]: value } : t)
    const isParent = tlTasks.some(t => t.parentId === taskId)
    applyTaskChangeWithBubbleUp(updated, isParent ? taskId : undefined)
  }, [tlTasks, applyTaskChangeWithBubbleUp])

  const handleTlTaskReorder = useCallback((oldIdx: number, newIdx: number) => {
    applyTaskChangeWithBubbleUp(arrayMove(tlTasks, oldIdx, newIdx))
  }, [tlTasks, applyTaskChangeWithBubbleUp])

  // ─── Date change handlers (reverse-calculate durationDays from date) ──

  const handleTlMilestoneDateChange = useCallback((index: number, field: 'startDate' | 'endDate', value: string) => {
    // Direct milestone edit → no bubble up
    if (!value) return
    if (field === 'endDate') {
      const ms = recalcMilestones[index]
      if (!ms?.startDate) return
      const newDuration = daysBetween(ms.startDate, value) + 1
      if (newDuration < 1) return
      setTlMilestones(prev => prev.map((m, i) => i === index ? { ...m, durationDays: newDuration } : m))
    } else {
      setTlMilestones(prev => prev.map((m, i) => {
        if (i !== index) return m
        const currentEnd = recalcMilestones[index]?.endDate
        const newDuration = currentEnd ? daysBetween(value, currentEnd) + 1 : m.durationDays
        return { ...m, startDate: value, durationDays: Math.max(newDuration, 1) }
      }))
    }
  }, [recalcMilestones])

  const handleTlTaskDateChange = useCallback((taskId: string, field: 'startDate' | 'endDate', value: string) => {
    if (!value) return
    const taskDates = tlTaskDates.get(taskId)
    if (!taskDates) return
    const isParent = tlTasks.some(t => t.parentId === taskId)

    if (field === 'endDate') {
      const newDuration = daysBetween(taskDates.startDate, value) + 1
      if (newDuration < 1) return
      const updated = tlTasks.map(t => t.id === taskId ? { ...t, durationDays: newDuration } : t)
      applyTaskChangeWithBubbleUp(updated, isParent ? taskId : undefined)
    } else {
      const currentEnd = taskDates.endDate
      const newDuration = daysBetween(value, currentEnd) + 1
      const updated = tlTasks.map(t => t.id === taskId ? { ...t, startDate: value, durationDays: Math.max(newDuration, 1) } : t)
      applyTaskChangeWithBubbleUp(updated, isParent ? taskId : undefined)
    }
  }, [tlTasks, tlTaskDates, applyTaskChangeWithBubbleUp])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-4xl max-h-[90vh] flex flex-col"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onFocusOutside={(e) => e.preventDefault()}
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
                    {projectTypes.map(({ key, label }) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
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
              <div className="flex items-center justify-between">
                <Label htmlFor="edit-budget">投資預算 (NTD)</Label>
                {aiBudgetTotal != null && (
                  <span className="text-xs text-muted-foreground">由 AI 解析合計帶入</span>
                )}
              </div>
              <Input
                id="edit-budget"
                type="number"
                value={form.budget}
                onChange={e => update('budget', Number(e.target.value) || 0)}
                readOnly={aiBudgetTotal != null}
                className={aiBudgetTotal != null ? 'bg-muted/60 cursor-not-allowed' : ''}
              />
              {hasBudgetMismatch && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  清單合計 NT$ {budgetItemsTotal.toLocaleString('zh-TW')} 與預算 NT$ {aiBudgetTotal!.toLocaleString('zh-TW')} 不符（差 {Math.abs(budgetItemsTotal - aiBudgetTotal!).toLocaleString('zh-TW')}），請修正設備清單後再儲存
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>投資設備清單</Label>
              <p className="text-xs text-muted-foreground -mt-0.5">
                有設備清單時，預算由 AI 解析的合計金額帶入
              </p>
              {!budgetItemsLoaded ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  載入中...
                </div>
              ) : (
                <BudgetListEditor items={budgetItems} onChange={setBudgetItems} onAITotal={handleAITotal} />
              )}
            </div>

            {/* ROI Parameters */}
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <BarChart3 className="h-3.5 w-3.5" />
                ROI 參數
              </Label>
              <p className="text-xs text-muted-foreground -mt-0.5">
                投資報酬率計算所需參數（毛利率、售價、產能）
              </p>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">毛利率 (%)</Label>
                  <Input
                    type="number"
                    placeholder="例: 25"
                    value={form.roiGrossMargin ?? ''}
                    onChange={e => update('roiGrossMargin', e.target.value === '' ? null : Number(e.target.value))}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">平均售價 (NTD/K)</Label>
                  <Input
                    type="number"
                    placeholder="例: 150"
                    value={form.roiAvgPrice ?? ''}
                    onChange={e => update('roiAvgPrice', e.target.value === '' ? null : Number(e.target.value))}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Capacity (K/M)</Label>
                  <Input
                    type="number"
                    placeholder="例: 1000"
                    value={form.roiCapacity ?? ''}
                    onChange={e => update('roiCapacity', e.target.value === '' ? null : Number(e.target.value))}
                  />
                </div>
              </div>
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
              overflows={overflowMap}
              onMilestoneUpdate={handleTlMilestoneUpdate}
              onMilestoneRemove={handleTlMilestoneRemove}
              onMilestoneAdd={handleTlMilestoneAdd}
              onMilestoneReorder={handleTlMilestoneReorder}
              onMilestoneDateChange={handleTlMilestoneDateChange}
              onTaskAdd={handleTlTaskAdd}
              onTaskRemove={handleTlTaskRemove}
              onTaskUpdate={handleTlTaskUpdate}
              onTaskReorder={handleTlTaskReorder}
              onTaskDateChange={handleTlTaskDateChange}
              onGanttPreview={() => setGanttPreviewOpen(true)}
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
          <Button onClick={handleSave} disabled={saving || hasBudgetMismatch}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            儲存變更
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Overflow Confirmation Dialog */}
      <Dialog open={overflowConfirmOpen} onOpenChange={(open) => {
        if (!open) {
          overflowConfirmResolveRef.current?.(false)
          overflowConfirmResolveRef.current = null
          setOverflowConfirmOpen(false)
        }
      }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              時程溢出提醒
            </DialogTitle>
            <DialogDescription>
              以下時程設定不符合包含關係，是否仍要儲存？
            </DialogDescription>
          </DialogHeader>

          <ul className="space-y-1.5 text-sm list-disc pl-5">
            {Array.from(overflowMap.entries()).map(([id]) => {
              const ms = recalcMilestones.find(m => m.id === id)
              const task = !ms ? tlTasks.find(t => t.id === id) : null
              const name = ms?.name || task?.title || id
              return (
                <li key={id}>
                  {ms
                    ? <>里程碑「<span className="font-medium">{name}</span>」的任務超出里程碑範圍</>
                    : <>任務「<span className="font-medium">{name}</span>」的子任務超出任務範圍</>
                  }
                </li>
              )
            })}
          </ul>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => {
              overflowConfirmResolveRef.current?.(false)
              overflowConfirmResolveRef.current = null
              setOverflowConfirmOpen(false)
            }}>
              返回修改
            </Button>
            <Button onClick={() => {
              overflowConfirmResolveRef.current?.(true)
              overflowConfirmResolveRef.current = null
              setOverflowConfirmOpen(false)
            }}>
              確認儲存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              以下時程已變更，需提交審核申請。其他變更（名稱、負責人等）已儲存。
            </DialogDescription>
          </DialogHeader>

          {form.startDate !== project.startDate && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950 px-3 py-2 text-sm text-blue-700 dark:text-blue-400 flex items-center gap-2">
              <CalendarClock className="h-4 w-4 shrink-0" />
              專案開始日期：{project.startDate} → {form.startDate}（一併提交審核）
            </div>
          )}

          {affectedMilestoneDates.length > 0 && (
            <div className="rounded-lg border overflow-hidden">
              <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 px-3 py-2 bg-muted/60 border-b text-xs font-medium text-muted-foreground">
                <span>里程碑</span>
                <span>日期變更</span>
                <span className="text-right">天數</span>
              </div>
              {affectedMilestoneDates.map((am) => {
                const days = Math.ceil(
                  (new Date(am.proposedDate).getTime() - new Date(am.originalDate).getTime()) / (1000 * 60 * 60 * 24)
                )
                return (
                  <div key={am.milestoneId} className="grid grid-cols-[1fr_auto_auto] gap-x-4 items-center px-3 py-2 border-t text-sm">
                    <span className="font-medium truncate">{am.milestoneName}</span>
                    <div className="flex items-center gap-1.5 tabular-nums text-xs whitespace-nowrap">
                      <span className="text-muted-foreground line-through">{am.originalDate}</span>
                      <span className="text-muted-foreground">→</span>
                      <span className="text-amber-600 dark:text-amber-400 font-medium">{am.proposedDate}</span>
                    </div>
                    <span className={`text-xs tabular-nums font-medium text-right ${days > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                      {days > 0 ? `+${days}` : days}天
                    </span>
                  </div>
                )
              })}
            </div>
          )}

          {pendingTaskChanges.length > 0 && (
            <div className="rounded-lg border overflow-hidden">
              <div className="grid grid-cols-[1fr_auto] gap-x-4 px-3 py-2 bg-muted/60 border-b text-xs font-medium text-muted-foreground">
                <span>任務</span>
                <span>變更</span>
              </div>
              {pendingTaskChanges.map((tc) => {
                const orig = origTasks.find(t => t.id === tc.taskId)
                return (
                  <div key={tc.taskId} className="grid grid-cols-[1fr_auto] gap-x-4 items-center px-3 py-2 border-t text-sm">
                    <span className="font-medium truncate">{tc.taskTitle}</span>
                    <div className="flex items-center gap-2 text-xs whitespace-nowrap">
                      {tc.durationDays !== undefined && orig && (
                        <span className="tabular-nums">
                          天數 <span className="text-muted-foreground line-through">{orig.durationDays}</span> → <span className="text-amber-600 font-medium">{tc.durationDays}</span>
                        </span>
                      )}
                      {tc.startDate && orig && tc.startDate !== orig.startDate && (
                        <span className="tabular-nums">
                          起 <span className="text-muted-foreground line-through">{orig.startDate}</span> → <span className="text-amber-600 font-medium">{tc.startDate}</span>
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

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

      {/* Gantt Preview Dialog */}
      <Dialog open={ganttPreviewOpen} onOpenChange={setGanttPreviewOpen}>
        <DialogContent className="sm:max-w-6xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-blue-500" />
              甘特圖預覽
            </DialogTitle>
            <DialogDescription>
              根據目前編輯中的里程碑與任務產生的甘特圖預覽，尚未儲存。
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-auto">
            {ganttPreviewOpen && (() => {
              const lastMs = [...recalcMilestones].reverse().find(m => m.endDate)
              const previewStartDate = form.startDate || project.startDate
              const previewEndDate = lastMs?.endDate || form.endDate || project.endDate
              const previewMilestones = recalcMilestones.map(m => ({
                id: m.id,
                name: m.name,
                dueDate: m.endDate || '',
                status: 'todo' as const,
                progress: 0,
              }))
              const previewTasks = tlTasks.map(t => {
                const dates = tlTaskDates.get(t.id)
                return {
                  id: t.id,
                  projectId: project.id,
                  milestoneId: t.milestoneId,
                  title: t.title,
                  description: '',
                  assignee: t.assignee || '',
                  status: 'todo' as const,
                  priority: t.priority,
                  durationDays: t.durationDays,
                  startDate: dates?.startDate || '',
                  endDate: dates?.endDate || '',
                  dependencies: [] as string[],
                  progress: 0,
                  parentId: t.parentId || null,
                }
              })
              return (
                <GanttChart
                  milestones={previewMilestones}
                  tasks={previewTasks}
                  startDate={previewStartDate}
                  endDate={previewEndDate}
                />
              )
            })()}
          </div>
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


