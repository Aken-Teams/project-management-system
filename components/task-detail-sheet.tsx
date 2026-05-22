'use client'

import { useMemo, useState, useEffect, useRef, useCallback } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { WeekPicker } from '@/components/ui/week-picker'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { type Project, type Task, type TaskLog, type TaskLogAttachment, type TaskStatus, type NextPlanItem } from '@/lib/mock-data'
import { VoiceInputButton } from '@/components/voice-input-button'
import { type DepNode, computeImpact } from '@/lib/dependency-graph'
import { computeTaskStatus, getStatusLabel, getStatusColor, getDaysUntilDeadline, type ComputedTaskStatus } from '@/lib/task-utils'
import { useAuth } from '@/lib/auth-context'
import { cn } from '@/lib/utils'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Ban,
  Calendar,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CircleCheck,
  Clock,
  Flag,
  Info,
  Loader2,
  Pencil,
  Route,
  Save,
  Send,
  Trash2,
  Undo2,
  User,
  Check,
  X,
  FileText,
  ImagePlus,
  Paperclip,
  Sparkles,
} from 'lucide-react'

interface TaskDetailSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  task: Task | null
  project: Project
  nodeMap: Map<string, DepNode>
  onSelectTask?: (task: Task) => void
  onTaskUpdate?: () => void
  readOnly?: boolean
}

const AVATAR_COLORS = [
  'bg-blue-600', 'bg-emerald-600', 'bg-violet-600', 'bg-amber-600',
  'bg-rose-600', 'bg-cyan-600', 'bg-pink-600', 'bg-teal-600',
  'bg-indigo-600', 'bg-orange-600', 'bg-lime-600', 'bg-fuchsia-600',
  'bg-sky-600', 'bg-red-600', 'bg-green-600', 'bg-purple-600',
]

function getStatusDot(status: ComputedTaskStatus) {
  const colors: Record<ComputedTaskStatus, string> = {
    completed: 'bg-green-500',
    'on-track': 'bg-blue-500',
    'at-risk': 'bg-amber-500',
    overdue: 'bg-red-500',
    'overdue-not-started': 'bg-orange-500',
    'not-started': 'bg-gray-300',
  }
  return <div className={cn('h-2 w-2 rounded-full shrink-0', colors[status])} />
}

function getComputedStatusBadge(status: ComputedTaskStatus) {
  return (
    <Badge className={cn('text-xs px-2 py-0.5 shrink-0', getStatusColor(status))}>
      {getStatusLabel(status)}
    </Badge>
  )
}

export function TaskDetailSheet({ open, onOpenChange, task, project, nodeMap, onSelectTask, onTaskUpdate, readOnly }: TaskDetailSheetProps) {
  const { user } = useAuth()

  // Progress (for optimistic updates on complete/uncomplete)
  const [editProgress, setEditProgress] = useState<number>(0)

  // Completion date
  const [completedDate, setCompletedDate] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })

  // Helper: format local Date → "YYYY-MM-DD" (avoids toISOString UTC offset issues)
  const fmtLocalDate = useCallback((d: Date) => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }, [])

  // Weekly batch log submission — flexible rows (not fixed Mon-Sun grid)
  interface LogRow { date: string; content: string; existingLogId?: string; attachments?: TaskLogAttachment[] }
  const [selectedWeekStart, setSelectedWeekStart] = useState(() => {
    const now = new Date()
    const day = now.getDay()
    const diff = now.getDate() - day + (day === 0 ? -6 : 1)
    return fmtLocalDate(new Date(now.getFullYear(), now.getMonth(), diff))
  })
  const [logRows, setLogRows] = useState<LogRow[]>([{ date: '', content: '' }])
  const [uploadingRowIdx, setUploadingRowIdx] = useState<number | null>(null)
  const [logNextWeekPlan, setLogNextWeekPlan] = useState('')
  const [showActions, setShowActions] = useState(false)
  const [submittingBatch, setSubmittingBatch] = useState(false)

  // R 週報 tab — separate week state so R/A can navigate weeks independently
  const [rWeekStart, setRWeekStart] = useState(() => {
    const now = new Date()
    const day = now.getDay()
    const diff = now.getDate() - day + (day === 0 ? -6 : 1)
    return fmtLocalDate(new Date(now.getFullYear(), now.getMonth(), diff))
  })

  // Backward compat: logDate used by subtask import and edit flows
  const logDate = useMemo(() => {
    const filledDates = logRows.filter(r => r.content.trim()).map(r => r.date).sort()
    return filledDates[filledDates.length - 1] || fmtLocalDate(new Date())
  }, [logRows, fmtLocalDate])

  // Auto-calculated progress display
  const autoProgress = useMemo(() => {
    if (!task) return null
    const taskStart = new Date(task.startDate)
    const taskEnd = new Date(task.endDate)
    // effectiveStart: use originalStartDate if it's earlier (delay shifted dates forward)
    const origStart = task.originalStartDate ? new Date(task.originalStartDate) : null
    const effectiveStart = origStart && origStart < taskStart ? origStart : taskStart
    const totalSpan = taskEnd.getTime() - effectiveStart.getTime()
    if (totalSpan <= 0) return null
    const totalDays = Math.round(totalSpan / 86400000)
    // Completed tasks are always 100%
    if (task.completedAt) return { percent: 100, latestDate: task.completedAt, totalDays, hasOverdueLogs: false }
    // Valid logs: [effectiveStart, endDate] — includes original period + extension
    // Logs past endDate = overdue work, don't inflate progress
    const taskEndStr = task.endDate.slice(0, 10)
    const effectiveStartStr = effectiveStart.toISOString().slice(0, 10)
    const existingLogDates = project.taskLogs
      .filter(l => l.taskId === task.id)
      .map(l => l.logDate.slice(0, 10))
    const currentEntryDates = logRows.filter(r => r.content.trim() && r.date).map(r => r.date)
    const allRawDates = [...existingLogDates, ...currentEntryDates]
    const validDates = allRawDates.filter(d => d >= effectiveStartStr && d <= taskEndStr).sort()
    const hasOverdueLogs = allRawDates.some(d => d > taskEndStr)
    const latestDate = validDates[validDates.length - 1]
    if (!latestDate) return { percent: 0, latestDate: null, totalDays, hasOverdueLogs }
    const elapsed = new Date(latestDate).getTime() - effectiveStart.getTime()
    const percent = Math.min(99, Math.max(0, Math.round((elapsed / totalSpan) * 100)))
    return { percent, latestDate, totalDays, hasOverdueLogs }
  }, [task, project.taskLogs, logRows])

  // Preceding item check dialog (milestone or task level)
  const [showPrecedingDialog, setShowPrecedingDialog] = useState(false)
  const [showBatchCompleteConfirm, setShowBatchCompleteConfirm] = useState(false)
  const [batchCompleting, setBatchCompleting] = useState(false)
  const [precedingDismissed, setPrecedingDismissed] = useState(false)

  // Find incomplete preceding item: check both preceding tasks (same milestone) and preceding milestones
  const incompletePreceding = useMemo<{
    type: 'task' | 'milestone'
    name: string
    id: string        // task id or milestone id
    milestoneId: string
    totalItems: number
    incompleteItems: number
  } | null>(() => {
    if (!task) return null

    // 1) Check preceding parent task within the same milestone
    const parentTask = task.parentId
      ? project.tasks.find(t => t.id === task.parentId)
      : task
    if (parentTask) {
      const siblingParents = project.tasks
        .filter(t => t.milestoneId === parentTask.milestoneId && !t.parentId)
      const parentIdx = siblingParents.findIndex(t => t.id === parentTask.id)
      // Walk backward to find nearest incomplete preceding sibling task
      for (let i = parentIdx - 1; i >= 0; i--) {
        const prev = siblingParents[i]
        if (prev.status !== 'done') {
          const prevSubtasks = project.tasks.filter(t => t.parentId === prev.id)
          const allItems = [prev, ...prevSubtasks]
          const incomplete = allItems.filter(t => t.status !== 'done')
          return {
            type: 'task',
            name: prev.title,
            id: prev.id,
            milestoneId: prev.milestoneId,
            totalItems: allItems.length,
            incompleteItems: incomplete.length,
          }
        }
      }
    }

    // 2) Check preceding milestone
    const msIdx = project.milestones.findIndex(m => m.id === task.milestoneId)
    if (msIdx > 0) {
      for (let i = msIdx - 1; i >= 0; i--) {
        const prev = project.milestones[i]
        if (prev.status !== 'done' && prev.progress < 100) {
          const prevTasks = project.tasks.filter(t => t.milestoneId === prev.id)
          const incomplete = prevTasks.filter(t => t.status !== 'done')
          return {
            type: 'milestone',
            name: prev.name,
            id: prev.id,
            milestoneId: prev.id,
            totalItems: prevTasks.length,
            incompleteItems: incomplete.length,
          }
        }
      }
    }

    return null
  }, [task, project.milestones, project.tasks])

  // Trigger dialog when sheet opens on a task with incomplete preceding item
  useEffect(() => {
    if (open && task && incompletePreceding && !precedingDismissed) {
      setShowPrecedingDialog(true)
    }
    if (!open) {
      setPrecedingDismissed(false)
    }
  }, [open, task?.id, incompletePreceding, precedingDismissed])

  // Extension/delay request
  const [showExtensionForm, setShowExtensionForm] = useState(false)
  const [extensionReason, setExtensionReason] = useState('')
  const [extensionDate, setExtensionDate] = useState('')
  const [extensionSupport, setExtensionSupport] = useState('')

  // Log editing
  const [editingLogId, setEditingLogId] = useState<string | null>(null)
  const [editLogContent, setEditLogContent] = useState('')
  const [editLogNextPlans, setEditLogNextPlans] = useState<NextPlanItem[]>([])
  const [editLogDate, setEditLogDate] = useState('')
  const [editLogAttachments, setEditLogAttachments] = useState<TaskLogAttachment[]>([])
  const [editUploadingFiles, setEditUploadingFiles] = useState(false)
  const [editLogContentInterim, setEditLogContentInterim] = useState('')
  const [deletingLog, setDeletingLog] = useState<TaskLog | null>(null)

  // Completion confirmation step
  const [showCompleteDateStep, setShowCompleteDateStep] = useState(false)

  // Optimistic completion state: null = use task prop, true/false = override
  const [optimisticCompleted, setOptimisticCompleted] = useState<boolean | null>(null)

  // Subtask log import
  const [importSubLogsOpen, setImportSubLogsOpen] = useState(false)
  const [importSubLogsLoading, setImportSubLogsLoading] = useState(false)

  const editFileInputRef = useRef<HTMLInputElement>(null)
  const editImageInputRef = useRef<HTMLInputElement>(null)

  // Sync editProgress when task changes
  useEffect(() => {
    if (task) {
      setEditProgress(task.progress)
      setOptimisticCompleted(null) // reset optimistic override when real data arrives
    }
  }, [task])

  // Reset state when opening a new task
  useEffect(() => {
    if (open && task) {
      const now = new Date()
      const day = now.getDay()
      const diff = now.getDate() - day + (day === 0 ? -6 : 1)
      setSelectedWeekStart(fmtLocalDate(new Date(now.getFullYear(), now.getMonth(), diff)))
      setLogRows([{ date: '', content: '' }])
      setLogNextWeekPlan('')
      // Default completion date = latest log date (if any), otherwise today
      const latestLog = project.taskLogs
        .filter(l => l.taskId === task.id)
        .sort((a, b) => b.logDate.localeCompare(a.logDate))[0]
      setCompletedDate(latestLog?.logDate || fmtLocalDate(now))
      setShowActions(false)
      setShowCompleteDateStep(false)
      setShowExtensionForm(false)
      setExtensionReason('')
      setExtensionDate('')
      setExtensionSupport('')
      setEditingLogId(null)
      setOptimisticCompleted(null)
    }
  }, [open, task?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Prefill logRows from existing logs within selected week range
  useEffect(() => {
    if (!task || !open) return
    const [y, m, d] = selectedWeekStart.split('-').map(Number)
    const weekStart = fmtLocalDate(new Date(y, m - 1, d))
    const weekEnd = fmtLocalDate(new Date(y, m - 1, d + 6))
    const logs = project.taskLogs
      .filter(l => l.taskId === task.id && l.logDate >= weekStart && l.logDate <= weekEnd)
      .sort((a, b) => a.logDate.localeCompare(b.logDate))
    if (logs.length > 0) {
      setLogRows(logs.map(l => ({
        date: l.logDate,
        content: l.content,
        existingLogId: l.id,
        attachments: l.attachments?.length ? [...l.attachments] : undefined,
      })))
      // Prefill nextWeekPlan from the latest log's nextPlans
      const latestWithPlans = [...logs].reverse().find(l => l.nextPlans?.length)
      if (latestWithPlans?.nextPlans) {
        setLogNextWeekPlan(latestWithPlans.nextPlans.map(p => p.content).join('\n'))
      } else {
        setLogNextWeekPlan('')
      }
    } else {
      setLogRows([{ date: '', content: '' }])
      setLogNextWeekPlan('')
    }
  }, [selectedWeekStart, task?.id, open, project.taskLogs, fmtLocalDate]) // eslint-disable-line react-hooks/exhaustive-deps

  // File upload for batch log rows
  const rowFileInputRef = useRef<HTMLInputElement>(null)

  const handleRowFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0 || uploadingRowIdx === null) return
    const idx = uploadingRowIdx
    const fileArray = Array.from(files)
    e.target.value = ''
    try {
      const uploaded: TaskLogAttachment[] = []
      for (const file of fileArray) {
        const fd = new FormData()
        fd.append('file', file)
        const res = await fetch('/api/upload', { method: 'POST', body: fd })
        if (res.ok) uploaded.push(await res.json())
      }
      if (uploaded.length > 0) {
        setLogRows(prev => prev.map((r, i) =>
          i === idx ? { ...r, attachments: [...(r.attachments || []), ...uploaded] } : r
        ))
      }
    } catch {
      // ignore
    } finally {
      setUploadingRowIdx(null)
    }
  }

  // ── Subtask log import ──
  const getSubtaskLogsContent = useCallback(() => {
    if (!task) return null
    const subtasks = task.subtasks || []
    if (subtasks.length === 0) return null

    const entries: { title: string; progress: number; content: string }[] = []
    for (const sub of subtasks) {
      const subLogs = project.taskLogs
        .filter(l => l.taskId === sub.id)
        .sort((a, b) => new Date(b.logDate).getTime() - new Date(a.logDate).getTime())
      const latestLog = subLogs.find(l => l.logDate <= logDate) || subLogs[0]
      if (latestLog) {
        entries.push({ title: sub.title, progress: sub.progress, content: latestLog.content })
      }
    }
    return entries.length > 0 ? entries : null
  }, [task, project.taskLogs, logDate])

  // Helper: append imported text to the first empty row or add a new row
  const appendToLogRows = useCallback((text: string) => {
    setLogRows(prev => {
      const emptyIdx = prev.findIndex(r => !r.content.trim())
      if (emptyIdx >= 0) {
        const updated = [...prev]
        updated[emptyIdx] = { ...updated[emptyIdx], content: text }
        return updated
      }
      return [...prev, { date: fmtLocalDate(new Date()), content: text }]
    })
  }, [fmtLocalDate])

  const handleImportSubLogsRaw = () => {
    const entries = getSubtaskLogsContent()
    if (!entries) return
    const text = entries.map(e => `【${e.title}】(${e.progress}%)\n${e.content}`).join('\n\n')
    appendToLogRows(text)
    setImportSubLogsOpen(false)
  }

  const handleImportSubLogsAI = async () => {
    const entries = getSubtaskLogsContent()
    if (!entries) return
    setImportSubLogsLoading(true)
    try {
      const res = await fetch('/api/ai/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entries: entries.map(e => ({ title: e.title, progress: e.progress, content: e.content })),
          taskTitle: task?.title || '',
        }),
      })
      if (!res.ok) throw new Error()
      const { summary } = await res.json()
      appendToLogRows(summary)
    } catch {
      handleImportSubLogsRaw()
    }
    setImportSubLogsLoading(false)
    setImportSubLogsOpen(false)
  }

  // ── Batch log submission (weekly) ──
  const handleBatchSubmitLogs = async () => {
    if (!task || !user) return
    const entries = logRows
      .filter(r => r.content.trim() && r.date)
      .map(r => ({
        logDate: r.date,
        content: r.content.trim(),
        existingLogId: r.existingLogId,
        attachments: r.attachments?.length ? r.attachments : undefined,
      }))
    if (entries.length === 0) return

    setSubmittingBatch(true)
    try {
      const nextPlans = logNextWeekPlan.trim()
        ? [{ content: logNextWeekPlan.trim() }]
        : []
      const res = await fetch(`/api/projects/${project.id}/task-logs/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: task.id,
          userId: user.id,
          entries,
          ...(nextPlans.length > 0 ? { nextPlans } : {}),
        }),
      })
      if (!res.ok) throw new Error()
      onTaskUpdate?.()
      setShowActions(true)
    } catch {
      // fail silently
    } finally {
      setSubmittingBatch(false)
    }
  }

  // Check if any row's date exceeds task endDate (overdue blocking — triggers on date selection alone)
  const overdueEntryDates = useMemo(() => {
    if (!task) return [] as string[]
    return logRows
      .filter(r => r.date && r.date > task.endDate)
      .map(r => r.date)
  }, [logRows, task])


  // ── Log editing ──
  const handleStartEditLog = (log: TaskLog) => {
    setEditingLogId(log.id)
    setEditLogContent(log.content)
    setEditLogNextPlans(log.nextPlans?.length ? [...log.nextPlans] : [{ content: '', date: '' }])
    setEditLogDate(log.logDate)
    setEditLogAttachments(log.attachments ? [...log.attachments] : [])
  }

  const handleCancelEditLog = () => {
    setEditingLogId(null)
    setEditLogContent('')
    setEditLogNextPlans([])
    setEditLogDate('')
    setEditLogAttachments([])
    setEditLogContentInterim('')
  }

  const handleEditFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    const fileArray = Array.from(files)
    e.target.value = ''
    setEditUploadingFiles(true)
    try {
      const uploaded: TaskLogAttachment[] = []
      for (const file of fileArray) {
        const fd = new FormData()
        fd.append('file', file)
        const res = await fetch('/api/upload', { method: 'POST', body: fd })
        if (res.ok) uploaded.push(await res.json())
        else alert(`上傳失敗：${res.status}`)
      }
      if (uploaded.length > 0) setEditLogAttachments(prev => [...prev, ...uploaded])
    } catch {
      alert('上傳失敗，請確認網路連線')
    } finally {
      setEditUploadingFiles(false)
    }
  }

  const handleSaveEditLog = async (log: TaskLog) => {
    if (!editLogContent.trim()) return
    try {
      const res = await fetch(`/api/projects/${log.projectId}/task-logs/${log.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: editLogContent.trim(),
          logDate: editLogDate,
          nextPlans: editLogNextPlans.filter(p => p.content.trim()),
          attachments: editLogAttachments.length > 0 ? editLogAttachments : null,
        }),
      })
      if (!res.ok) throw new Error()
      onTaskUpdate?.()
    } catch {
      // fail silently
    }
    handleCancelEditLog()
  }

  const handleConfirmDeleteLog = async () => {
    if (!deletingLog) return
    const log = deletingLog
    setDeletingLog(null)
    try {
      const res = await fetch(`/api/projects/${log.projectId}/task-logs/${log.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error()
      onTaskUpdate?.()
    } catch {
      // fail silently
    }
  }

  // ── Batch complete preceding item (task or milestone) ──
  const handleBatchCompletePreceding = async () => {
    if (!incompletePreceding || !user) return
    setBatchCompleting(true)
    try {
      if (incompletePreceding.type === 'milestone') {
        // Batch complete all tasks in the milestone
        const res = await fetch(`/api/projects/${project.id}/milestones/${incompletePreceding.id}/batch-complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ completedBy: user.name }),
        })
        if (!res.ok) throw new Error()
      } else {
        // Complete the parent task + all its subtasks
        const taskAndSubs = project.tasks.filter(t => t.id === incompletePreceding.id || t.parentId === incompletePreceding.id)
        const incomplete = taskAndSubs.filter(t => t.status !== 'done')
        for (const t of incomplete) {
          // Use last log date as completion date
          const lastLog = project.taskLogs.filter(l => l.taskId === t.id).sort((a, b) => b.logDate.localeCompare(a.logDate))[0]
          const completedAt = lastLog?.logDate || new Date().toISOString().split('T')[0]
          await fetch(`/api/projects/${project.id}/tasks/${t.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'done', progress: 100, completedBy: user.name, completedAt }),
          })
        }
      }
      setShowBatchCompleteConfirm(false)
      setShowPrecedingDialog(false)
      setPrecedingDismissed(true)
      onTaskUpdate?.()
    } catch {
      // ignore
    } finally {
      setBatchCompleting(false)
    }
  }

  // ── Task completion ──
  const handleCompleteTask = async () => {
    if (!task || !user) return
    try {
      const res = await fetch(`/api/projects/${project.id}/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'done', progress: 100, completedBy: user.name, completedAt: completedDate }),
      })
      if (!res.ok) throw new Error()
      // Optimistic: immediately show completed state
      setOptimisticCompleted(true)
      setEditProgress(100)
      setShowCompleteDateStep(false)
      setShowActions(false)
      onTaskUpdate?.()
    } catch {
      // ignore
    }
  }

  const handleUncompleteTask = async () => {
    if (!task) return
    try {
      const res = await fetch(`/api/projects/${project.id}/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'in_progress', progress: 0 }),
      })
      if (!res.ok) throw new Error()
      // Optimistic: immediately show non-completed state with progress UI
      setOptimisticCompleted(false)
      setEditProgress(0)
      setShowActions(false)
      setShowCompleteDateStep(false)
      onTaskUpdate?.()
    } catch {
      // ignore
    }
  }

  // ── Delay request: compute milestone impact from task extension ──
  const delayImpact = useMemo(() => {
    if (!task || !extensionDate) return null
    const milestone = project.milestones.find(m => m.id === task.milestoneId)
    if (!milestone) return null

    const currentTaskEnd = new Date(task.endDate)
    const proposedTaskEnd = new Date(extensionDate)
    const extraDays = Math.round((proposedTaskEnd.getTime() - currentTaskEnd.getTime()) / 86400000)
    if (extraDays <= 0) return null

    // Calculate new total task days for this milestone
    const msTasks = project.tasks
      .filter(t => t.milestoneId === milestone.id && !t.parentId)
    const currentTotal = msTasks.reduce((sum, t) => sum + Math.max(t.durationDays, 1), 0)
    const newTotal = currentTotal + extraDays

    // Compute milestone effective start & new end
    const msDueDate = new Date(milestone.dueDate)
    const effectiveStart = new Date(msDueDate)
    effectiveStart.setDate(effectiveStart.getDate() - currentTotal + 1)
    const newMsEnd = new Date(effectiveStart)
    newMsEnd.setDate(newMsEnd.getDate() + newTotal - 1)

    const milestoneDelta = Math.max(0, Math.round((newMsEnd.getTime() - msDueDate.getTime()) / 86400000))
    const proposedMilestoneDate = milestoneDelta > 0
      ? newMsEnd.toISOString().split('T')[0]
      : milestone.dueDate.split('T')[0]

    return { extraDays, milestoneDelta, proposedMilestoneDate }
  }, [task, extensionDate, project])

  // ── Delay request submission ──
  const handleSubmitExtension = async () => {
    if (!task || !user) return
    const milestone = project.milestones.find(m => m.id === task.milestoneId)
    if (!milestone) return

    const impact = delayImpact
    if (!impact || impact.extraDays <= 0) {
      alert('新完成日必須晚於目前截止日')
      return
    }

    try {
      const res = await fetch('/api/delay-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: project.id,
          requesterId: user.id,
          reason: extensionReason.trim(),
          canCatchUp: false,
          supportNeeded: extensionSupport.trim() || '',
          taskId: task.id,
          affectedMilestones: [{
            milestoneId: milestone.id,
            originalDate: milestone.dueDate,
            proposedDate: impact.proposedMilestoneDate,
          }],
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || '送出失敗')
      }
      setShowExtensionForm(false)
      setShowActions(true)
      setExtensionReason('')
      setExtensionDate('')
      setExtensionSupport('')
      onTaskUpdate?.()
    } catch (err) {
      alert(err instanceof Error ? err.message : '送出延期申請失敗')
    }
  }

  const assigneeColorMap = useMemo(() => {
    const map = new Map<string, string>()
    const names = [...new Set(project.tasks.map(t => t.assignee).filter(Boolean))].sort()
    names.forEach((name, i) => map.set(name, AVATAR_COLORS[i % AVATAR_COLORS.length]))
    return map
  }, [project.tasks])

  if (!task) return null

  const isCompleted = optimisticCompleted !== null ? optimisticCompleted : !!task.completedAt
  const hasSubtasks = (task.subtasks || []).length > 0
  const computedStatus = computeTaskStatus(task, project.taskLogs)
  const days = getDaysUntilDeadline(task)
  const isOverdue = !isCompleted && new Date() > new Date(task.endDate)

  const node = nodeMap.get(task.id)
  const impact = computeImpact(task.id, nodeMap)
  const milestone = project.milestones.find(m => m.id === task.milestoneId)

  // Dependency analysis
  const upstreamTasks = task.dependencies
    .map(depId => {
      const depTask = project.tasks.find(t => t.id === depId)
      if (!depTask) return null
      return { task: depTask, status: computeTaskStatus(depTask, project.taskLogs) }
    })
    .filter(Boolean) as { task: Task; status: ComputedTaskStatus }[]

  const downstreamTasks = project.tasks
    .filter(t => t.dependencies.includes(task.id))
    .map(t => ({ task: t, status: computeTaskStatus(t, project.taskLogs) }))

  const hasBlockedUpstream = upstreamTasks.some(u => u.status !== 'completed')

  // Task logs for this task
  const taskLogs = project.taskLogs
    .filter(l => l.taskId === task.id)
    .sort((a, b) => new Date(b.logDate).getTime() - new Date(a.logDate).getTime())

  // Check pending delay — look at project.delayRequests if available
  const hasPendingDelay = (project as Record<string, unknown>).pendingDelayMilestoneIds
    ? ((project as Record<string, unknown>).pendingDelayMilestoneIds as string[]).includes(task.milestoneId)
    : project.delayRequests?.some(dr =>
        dr.status === 'pending' &&
        dr.affectedMilestones?.some(am => am.milestoneId === task.milestoneId)
      ) ?? false

  // Badge text with days info
  const badgeText = (() => {
    if (isCompleted) return '已完成'
    if (hasPendingDelay && (computedStatus === 'overdue' || computedStatus === 'overdue-not-started')) return '延期申請中'
    if (computedStatus === 'overdue') return `逾期${Math.abs(days)}天`
    if (computedStatus === 'at-risk') return `剩${days}天`
    return getStatusLabel(computedStatus)
  })()

  const getAvatarColor = (name: string) => assigneeColorMap.get(name) || AVATAR_COLORS[0]

  const getPriorityColor = (priority: 'low' | 'medium' | 'high') => {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-700 border-red-300'
      case 'medium': return 'bg-amber-100 text-amber-700 border-amber-300'
      case 'low': return 'bg-slate-100 text-slate-500 border-slate-300'
    }
  }

  const getPriorityText = (priority: 'low' | 'medium' | 'high') => {
    switch (priority) { case 'high': return '高'; case 'medium': return '中'; case 'low': return '低' }
  }

  const handleSelectTask = (t: Task) => {
    onSelectTask?.(t)
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="sm:max-w-md p-0 gap-0 overflow-hidden flex flex-col">
          {/* Header - fixed */}
          <div className="px-6 pt-5 pb-3 shrink-0">
            <SheetHeader>
              <div className="flex items-start gap-3">
                <div className={cn(
                  'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                  isCompleted ? 'bg-green-100 text-green-600 dark:bg-green-950 dark:text-green-400' :
                  hasPendingDelay && (computedStatus === 'overdue' || computedStatus === 'overdue-not-started') ? 'bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400' :
                  computedStatus === 'overdue' ? 'bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400' :
                  computedStatus === 'overdue-not-started' ? 'bg-orange-100 text-orange-600 dark:bg-orange-950 dark:text-orange-400' :
                  computedStatus === 'at-risk' ? 'bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400' :
                  'bg-primary/10 text-primary'
                )}>
                  {isCompleted ? <CheckCircle2 className="h-5 w-5" /> :
                   hasPendingDelay && (computedStatus === 'overdue' || computedStatus === 'overdue-not-started') ? <Clock className="h-5 w-5" /> :
                   computedStatus === 'overdue' ? <AlertTriangle className="h-5 w-5" /> :
                   computedStatus === 'overdue-not-started' ? <AlertTriangle className="h-5 w-5" /> :
                   computedStatus === 'at-risk' ? <AlertTriangle className="h-5 w-5" /> :
                   <Flag className="h-5 w-5" />}
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <SheetTitle className={cn('text-base text-left leading-tight', isCompleted && 'text-muted-foreground')}>
                      {task.title}
                    </SheetTitle>
                    <Badge className={cn('text-xs px-2 py-0.5 shrink-0',
                      hasPendingDelay && (computedStatus === 'overdue' || computedStatus === 'overdue-not-started')
                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300'
                        : getStatusColor(computedStatus)
                    )}>
                      {badgeText}
                    </Badge>
                  </div>
                  <SheetDescription className="text-left text-sm space-y-0.5">
                    <span className="text-muted-foreground">
                      {project.name}
                      {milestone && <> · {milestone.name}</>}
                    </span>
                    <br />
                    <span className="font-mono text-muted-foreground/80">
                      {new Date(task.startDate).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })}
                      {' ~ '}
                      {new Date(task.endDate).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })}
                    </span>
                  </SheetDescription>
                  {hasBlockedUpstream && (
                    <div className="flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400">
                      <div className="h-1 w-1 rounded-full bg-blue-500 animate-pulse" />
                      前置任務尚未完成
                    </div>
                  )}
                  {hasPendingDelay && (
                    <div className="flex items-center gap-1.5 text-sm text-amber-600 dark:text-amber-400">
                      <div className="h-1 w-1 rounded-full bg-amber-500 animate-pulse" />
                      已申請延期（等待審核）
                    </div>
                  )}
                </div>
              </div>
            </SheetHeader>
          </div>

          {/* Progress section */}
          <div className="px-6 py-3 border-t shrink-0">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <Badge className={cn('text-sm', getPriorityColor(task.priority))}>
                {getPriorityText(task.priority)}優先
              </Badge>
              {isOverdue && !isCompleted && (
                <Badge variant="destructive" className="text-sm gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  逾期
                </Badge>
              )}
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-3">
                <Progress value={autoProgress?.percent ?? task.progress} className="h-2 flex-1" />
                <span className="text-sm font-medium tabular-nums">{autoProgress?.percent ?? task.progress}%</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {hasSubtasks
                  ? '進度由子任務自動計算'
                  : autoProgress?.latestDate
                    ? `自動計算：最晚有效工作日 ${autoProgress.latestDate.slice(5).replace('-', '/')} / 總天數 ${autoProgress.totalDays} 天`
                    : '自動計算：任務期間內尚無工作紀錄'}
              </p>
              {!hasSubtasks && isOverdue && !isCompleted && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400">
                  {autoProgress?.percent === 0 && autoProgress?.hasOverdueLogs
                    ? '提示：任務已逾期，期間內無工作紀錄。請申請延期以繼續回報，核准後進度將重新計算。'
                    : (autoProgress?.percent ?? 0) >= 99
                      ? '提示：進度已達計算上限 99%，請「標記完成」結案或「申請延期」調整時程。'
                      : autoProgress?.hasOverdueLogs
                        ? '提示：超過預計完成日的工作紀錄不計入進度，請申請延期以更新時程。'
                        : '提示：任務已逾期，請申請延期或標記完成。'}
                </p>
              )}
            </div>
          </div>

          {/* Tabs */}
          {!showExtensionForm ? (
            <Tabs defaultValue={readOnly ? 'history' : 'log'} className="flex-1 flex flex-col min-h-0">
              <div className="px-6 pt-1 pb-0 border-t shrink-0">
                <TabsList className="w-full bg-transparent h-auto p-0 rounded-none gap-0">
                  {!readOnly && (
                    <TabsTrigger value="log" className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none pb-2.5 pt-2 text-sm">
                      工作紀錄
                    </TabsTrigger>
                  )}
                  <TabsTrigger value="history" className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none pb-2.5 pt-2 text-sm">
                    過往紀錄
                    {taskLogs.length > 0 && (
                      <Badge variant="secondary" className="ml-1.5 h-4 min-w-4 px-1 text-[10px] rounded-full">
                        {taskLogs.length}
                      </Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="r-reports" className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none pb-2.5 pt-2 text-sm">
                    R 週報
                  </TabsTrigger>
                  <TabsTrigger value="info" className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none pb-2.5 pt-2 text-sm">
                    任務資訊
                  </TabsTrigger>
                </TabsList>
              </div>

              {/* Tab: 工作紀錄 (editable, hidden in readOnly) */}
              {!readOnly && <TabsContent value="log" className="flex-1 overflow-y-auto px-6 mt-0">
                <div className="py-4 space-y-4">
                  {isCompleted ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-3 p-4 rounded-xl bg-green-50 border border-green-100 dark:bg-green-950/20 dark:border-green-900">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-100 dark:bg-green-900">
                          <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-green-700 dark:text-green-400">此任務已完成</p>
                          {(task.completedAt || optimisticCompleted) && (
                            <p className="text-sm text-green-600/70 dark:text-green-400/70 mt-0.5">
                              完成於 {new Date(task.completedAt || completedDate).toLocaleDateString('zh-TW')}
                            </p>
                          )}
                        </div>
                      </div>
                      {!readOnly && !hasSubtasks && (
                        <Button size="sm" variant="outline" className="gap-1.5 text-muted-foreground" onClick={handleUncompleteTask}>
                          <Undo2 className="h-3.5 w-3.5" />
                          取消完成
                        </Button>
                      )}
                    </div>
                  ) : hasSubtasks && !readOnly ? (
                    /* Parent task with subtasks — guide user to fill progress on subtasks */
                    <div className="space-y-4">
                      <div className="rounded-xl border-2 border-blue-200 bg-blue-50/50 dark:bg-blue-950/10 dark:border-blue-900 p-4 space-y-2">
                        <div className="flex items-start gap-2.5">
                          <Info className="h-4.5 w-4.5 text-blue-500 shrink-0 mt-0.5" />
                          <div>
                            <p className="text-sm font-semibold text-blue-700 dark:text-blue-400">此任務包含子任務</p>
                            <p className="text-xs text-blue-600/80 dark:text-blue-400/70 mt-1">
                              進度由子任務自動彙整，請點擊下方子任務填寫工作紀錄。
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <span className="text-xs font-medium text-muted-foreground">子任務列表</span>
                        <div className="rounded-lg border divide-y">
                          {(task.subtasks || []).map(sub => {
                            const subTask = project.tasks.find(t => t.id === sub.id)
                            if (!subTask) return null
                            const subStatus = computeTaskStatus(subTask, project.taskLogs)
                            return (
                              <button
                                key={sub.id}
                                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 transition-colors text-left"
                                onClick={() => onSelectTask?.(subTask)}
                              >
                                {getStatusDot(subStatus)}
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm truncate">{subTask.title}</p>
                                  <p className="text-[11px] text-muted-foreground">
                                    {subTask.assignee || '未指派'} · {subTask.endDate}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <div className="w-12 h-1.5 rounded-full bg-muted overflow-hidden">
                                    <div
                                      className={cn('h-full rounded-full', subTask.status === 'done' ? 'bg-green-500' : 'bg-blue-500')}
                                      style={{ width: `${subTask.progress}%` }}
                                    />
                                  </div>
                                  <span className="text-xs text-muted-foreground w-8 text-right">{subTask.progress}%</span>
                                </div>
                                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  ) : !showActions ? (
                    /* Step 1: Weekly batch input form (matching Proposal A mockup) */
                    <>
                      {/* Week selector */}
                      <WeekPicker
                        value={selectedWeekStart}
                        onChange={setSelectedWeekStart}
                      />

                      {/* Log entry table (Proposal A: 日期 | 工作內容 | 附件 side-by-side) */}
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5">
                          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-xs font-medium text-muted-foreground">本周工作紀錄</span>
                          <span className="text-[10px] text-muted-foreground/60">（不限每天都要填，日期也不限當周）</span>
                        </div>
                        <div className="rounded-lg border overflow-hidden">
                          <table className="w-full border-collapse">
                            <thead>
                              <tr className="bg-muted/40">
                                <th className="text-[11px] font-medium text-muted-foreground text-left px-2 py-1.5 w-[120px] border-b">日期</th>
                                <th className="text-[11px] font-medium text-muted-foreground text-left px-2 py-1.5 border-b">工作內容</th>
                                <th className="text-[11px] font-medium text-muted-foreground text-center px-1 py-1.5 w-[36px] border-b">附件</th>
                                <th className="w-[28px] border-b"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {logRows.map((row, idx) => {
                                const isOverdue = row.date && row.date > task.endDate
                                const attCount = row.attachments?.length || 0
                                return (
                                  <tr key={idx} className="border-b border-border last:border-b-0">
                                    <td className="px-1.5 py-1.5 align-top">
                                      <input
                                        type="date"
                                        value={row.date}
                                        onChange={e => {
                                          const updated = [...logRows]
                                          updated[idx] = { ...updated[idx], date: e.target.value }
                                          setLogRows(updated)
                                        }}
                                        className={cn(
                                          'w-full text-xs border rounded-md h-[34px] px-1.5 bg-background',
                                          isOverdue && 'border-red-300 text-red-600',
                                        )}
                                      />
                                      {row.existingLogId && (
                                        <span className="text-[10px] text-amber-600 dark:text-amber-400 block mt-0.5 px-0.5">已有紀錄</span>
                                      )}
                                      {/* Attachment thumbnails under date */}
                                      {attCount > 0 && (
                                        <div className="flex flex-wrap gap-1 mt-1">
                                          {row.attachments!.map((att, ai) => att.type === 'image' ? (
                                            <a key={ai} href={att.url} target="_blank" rel="noopener">
                                              <img src={att.url} alt={att.name} className="h-7 w-7 rounded object-cover border hover:opacity-80" />
                                            </a>
                                          ) : (
                                            <a key={ai} href={att.url} target="_blank" rel="noopener"
                                              className="flex items-center gap-0.5 px-1 py-0.5 rounded bg-muted text-[9px] hover:bg-muted/80"
                                            >
                                              <Paperclip className="h-2.5 w-2.5 shrink-0" />
                                              <span className="truncate max-w-[50px]">{att.name}</span>
                                            </a>
                                          ))}
                                        </div>
                                      )}
                                    </td>
                                    <td className="px-1.5 py-1.5 align-top">
                                      <textarea
                                        placeholder="工作內容..."
                                        value={row.content}
                                        onChange={e => {
                                          const updated = [...logRows]
                                          updated[idx] = { ...updated[idx], content: e.target.value }
                                          setLogRows(updated)
                                          // Auto-resize height
                                          e.target.style.height = '34px'
                                          e.target.style.height = e.target.scrollHeight + 'px'
                                        }}
                                        rows={1}
                                        className="w-full min-h-[34px] text-xs resize-none border rounded-md bg-background px-2 py-[7px] focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/30"
                                        style={{ overflow: 'hidden' }}
                                      />
                                    </td>
                                    <td className="px-0.5 py-1.5 align-top text-center">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setUploadingRowIdx(idx)
                                          rowFileInputRef.current?.click()
                                        }}
                                        className={cn(
                                          'inline-flex items-center justify-center w-[34px] h-[34px] border rounded-md bg-background hover:bg-muted transition-colors',
                                          attCount > 0 ? 'text-primary border-primary/30' : 'text-muted-foreground/40',
                                        )}
                                        title="上傳附件"
                                      >
                                        {uploadingRowIdx === idx
                                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                          : <Paperclip className="h-3.5 w-3.5" />
                                        }
                                      </button>
                                    </td>
                                    <td className="px-0 py-1.5 align-top text-center">
                                      {logRows.length > 1 ? (
                                        <button
                                          type="button"
                                          onClick={() => setLogRows(logRows.filter((_, i) => i !== idx))}
                                          className="inline-flex items-center justify-center w-[34px] h-[34px] rounded-md text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors"
                                          title="移除此列"
                                        >
                                          <X className="h-3.5 w-3.5" />
                                        </button>
                                      ) : <div className="w-[34px] h-[34px]" />}
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>

                          {/* Hidden file input */}
                          <input
                            ref={rowFileInputRef}
                            type="file"
                            multiple
                            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip"
                            className="hidden"
                            onChange={handleRowFileSelect}
                          />

                          <button
                            type="button"
                            className="w-full text-xs text-primary hover:bg-primary/5 transition-colors py-2 border-t border-dashed border-primary/20"
                            onClick={() => setLogRows([...logRows, { date: '', content: '' }])}
                          >
                            + 新增一列
                          </button>
                        </div>
                      </div>

                      {/* Import subtask logs (if applicable) */}
                      {(task.subtasks || []).length > 0 && (
                        <div className="flex justify-end">
                          <Popover open={importSubLogsOpen} onOpenChange={setImportSubLogsOpen}>
                            <PopoverTrigger asChild>
                              <button
                                type="button"
                                className="flex items-center gap-1 text-xs text-primary/70 hover:text-primary transition-colors"
                              >
                                <FileText className="h-3 w-3" />
                                帶入子任務紀錄
                              </button>
                            </PopoverTrigger>
                            <PopoverContent align="end" className="w-52 p-1.5">
                              <button
                                onClick={handleImportSubLogsRaw}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md hover:bg-muted transition-colors text-left"
                              >
                                <FileText className="h-4 w-4 text-muted-foreground" />
                                原始資料
                              </button>
                              <button
                                onClick={handleImportSubLogsAI}
                                disabled={importSubLogsLoading}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md hover:bg-muted transition-colors text-left disabled:opacity-50"
                              >
                                {importSubLogsLoading
                                  ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                  : <Sparkles className="h-4 w-4 text-amber-500" />
                                }
                                AI 彙整
                              </button>
                            </PopoverContent>
                          </Popover>
                        </div>
                      )}

                      {/* Overdue entry blocking — date-level validation */}
                      {overdueEntryDates.length > 0 && (
                        <div className="rounded-xl border-2 border-red-200 bg-red-50/50 dark:bg-red-950/10 dark:border-red-900 p-4 space-y-3">
                          <div className="flex items-start gap-2.5">
                            <Ban className="h-4.5 w-4.5 text-red-500 shrink-0 mt-0.5" />
                            <div>
                              <p className="text-sm font-semibold text-red-700 dark:text-red-400">
                                {overdueEntryDates.length} 筆工作日期超過截止日
                              </p>
                              <p className="text-xs text-red-600/80 dark:text-red-400/70 mt-1">
                                任務預計截止日為 {new Date(task.endDate).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })}，請先申請延期或移除超過截止日的紀錄。
                              </p>
                            </div>
                          </div>
                          {hasPendingDelay ? (
                            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-950/20 dark:border-amber-800">
                              <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                              <p className="text-xs text-amber-700 dark:text-amber-400">延期申請審核中，請等待主管核准</p>
                            </div>
                          ) : (
                            <Button
                              variant="outline"
                              className="w-full gap-2 border-red-200 text-red-700 hover:bg-red-100 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30"
                              onClick={() => {
                                const d = new Date(task.endDate)
                                d.setDate(d.getDate() + 7)
                                setExtensionDate(d.toISOString().split('T')[0])
                                setShowExtensionForm(true)
                                setShowActions(false)
                              }}
                            >
                              <CalendarClock className="h-4 w-4" />
                              申請延期
                            </Button>
                          )}
                        </div>
                      )}

                      {/* Divider */}
                      <div className="border-t border-dashed border-border" />

                      {/* Next week plan (optional, simple textarea) */}
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5">
                          <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-xs font-medium text-muted-foreground">預計下周工作</span>
                          <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded">選填</span>
                        </div>
                        <Textarea
                          placeholder="預計下周要做什麼..."
                          value={logNextWeekPlan}
                          onChange={e => setLogNextWeekPlan(e.target.value)}
                          rows={2}
                          className="min-h-[60px] text-sm resize-y"
                        />
                      </div>

                      {/* Submit + Skip */}
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          className="flex-1 gap-1.5 text-sm"
                          onClick={() => setShowActions(true)}
                        >
                          跳過，直接操作
                          <ArrowRight className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          className="flex-1 gap-1.5 rounded-lg shadow-sm text-sm"
                          disabled={!logRows.some(r => r.content.trim() && r.date) || logRows.some(r => r.content.trim() && !r.date) || overdueEntryDates.length > 0 || submittingBatch}
                          onClick={handleBatchSubmitLogs}
                        >
                          {submittingBatch ? (
                            <><Loader2 className="h-3.5 w-3.5 animate-spin" />儲存中...</>
                          ) : (
                            <><Send className="h-3.5 w-3.5" />提交週報</>
                          )}
                        </Button>
                      </div>
                    </>
                  ) : (
                    /* Step 2: Action buttons */
                    showCompleteDateStep ? (
                      /* Step 2b: Completion date confirmation */
                      <div className="space-y-4 animate-in fade-in slide-in-from-bottom-3 duration-300">
                        {/* Header */}
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                            <CheckCircle2 className="h-4 w-4 text-primary" />
                          </div>
                          <div>
                            <p className="text-sm font-medium">標記任務完成</p>
                            <p className="text-xs text-muted-foreground">請選擇實際完成日期</p>
                          </div>
                        </div>

                        {/* Date picker */}
                        <div className="space-y-2">
                          <Label className="text-sm text-muted-foreground flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5" />
                            完成日期
                          </Label>
                          <input
                            type="date"
                            value={completedDate}
                            min={(() => {
                              // Must be after actual start date (earliest log date)
                              const earliestLog = taskLogs.length > 0
                                ? taskLogs.reduce((min, l) => l.logDate < min ? l.logDate : min, taskLogs[0].logDate)
                                : null
                              return earliestLog || task.startDate
                            })()}
                            onChange={e => setCompletedDate(e.target.value)}
                            className="w-full text-sm border rounded-lg px-3 py-2.5 bg-background"
                          />
                          <p className="text-[11px] text-muted-foreground">
                            預設為最晚工作紀錄日，不可早於實際開始日期
                          </p>
                        </div>

                        {/* Progress warning */}
                        {(autoProgress?.percent ?? task.progress) < 100 && (
                          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-950/20 dark:border-amber-800">
                            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                            <p className="text-sm text-amber-700 dark:text-amber-400">
                              目前進度為 <span className="font-semibold">{autoProgress?.percent ?? task.progress}%</span>，標記完成後將自動更新為 100%
                            </p>
                          </div>
                        )}

                        {/* Actions */}
                        <div className="flex items-center gap-2 pt-1">
                          <Button
                            variant="outline"
                            className="flex-1 gap-1.5"
                            onClick={() => setShowCompleteDateStep(false)}
                          >
                            <ArrowLeft className="h-3.5 w-3.5" />
                            返回
                          </Button>
                          <Button
                            className="flex-1 gap-1.5"
                            onClick={handleCompleteTask}
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            確認完成
                          </Button>
                        </div>
                      </div>
                    ) : (
                    <div className="space-y-3 animate-in fade-in slide-in-from-bottom-3 duration-300">
                      <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                        <CheckCircle2 className="h-4 w-4 shrink-0" />
                        <span>請選擇下一步操作</span>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        {hasSubtasks ? (
                          <div className="flex items-center gap-3 p-3 rounded-xl border border-border bg-muted/30 text-left opacity-60">
                            <CircleCheck className="h-5 w-5 shrink-0 text-muted-foreground" />
                            <div>
                              <p className="text-sm font-medium text-muted-foreground">此任務已完成</p>
                              <p className="text-[11px] text-muted-foreground">需完成所有子任務</p>
                            </div>
                          </div>
                        ) : taskLogs.length === 0 ? (
                          <button
                            className="flex items-center gap-3 p-3 rounded-xl border border-border bg-muted/30 text-left opacity-60 cursor-not-allowed"
                            onClick={() => {
                              setShowActions(false)
                            }}
                          >
                            <CircleCheck className="h-5 w-5 shrink-0 text-muted-foreground" />
                            <div>
                              <p className="text-sm font-medium text-muted-foreground">此任務已完成</p>
                              <p className="text-[11px] text-amber-600 dark:text-amber-400">請先填寫至少一筆紀錄</p>
                            </div>
                          </button>
                        ) : (
                          <button
                            className="group flex items-center gap-3 p-3 rounded-xl border border-primary/30 bg-primary/5 hover:bg-primary/10 transition-all text-left"
                            onClick={() => setShowCompleteDateStep(true)}
                          >
                            <CircleCheck className="h-5 w-5 shrink-0 text-primary" />
                            <div>
                              <p className="text-sm font-medium">此任務已完成</p>
                              <p className="text-[11px] text-muted-foreground">已完成所有工作</p>
                            </div>
                          </button>
                        )}

                        {(computedStatus === 'at-risk' || computedStatus === 'overdue' || computedStatus === 'overdue-not-started') ? (
                          hasPendingDelay ? (
                            <div className="flex items-center gap-3 p-3 rounded-xl border border-amber-300 bg-amber-50/50 dark:border-amber-700 dark:bg-amber-950/20 text-left opacity-70">
                              <Clock className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
                              <div>
                                <p className="text-sm font-medium text-amber-700 dark:text-amber-400">延期申請中</p>
                                <p className="text-[11px] text-muted-foreground">等待主管審核</p>
                              </div>
                            </div>
                          ) : (
                            <button
                              className="group flex items-center gap-3 p-3 rounded-xl border border-amber-300 bg-amber-50/50 hover:bg-amber-50 dark:border-amber-700 dark:bg-amber-950/20 dark:hover:bg-amber-950/40 transition-all text-left"
                              onClick={() => {
                                // Pre-fill with task end date + 7 days
                                const d = new Date(task.endDate)
                                d.setDate(d.getDate() + 7)
                                setExtensionDate(d.toISOString().split('T')[0])
                                setShowActions(false)
                                setShowExtensionForm(true)
                              }}
                            >
                              <CalendarClock className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
                              <div>
                                <p className="text-sm font-medium text-amber-700 dark:text-amber-400">申請延期</p>
                                <p className="text-[11px] text-muted-foreground">需要更多時間</p>
                              </div>
                            </button>
                          )
                        ) : (
                          <button
                            className="group flex items-center gap-3 p-3 rounded-xl border border-border hover:bg-muted/50 transition-all text-left"
                            onClick={() => onOpenChange(false)}
                          >
                            <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                            <div>
                              <p className="text-sm font-medium">完成回報</p>
                              <p className="text-[11px] text-muted-foreground">關閉此視窗</p>
                            </div>
                          </button>
                        )}
                      </div>

                      <button
                        className="text-sm text-muted-foreground hover:text-foreground w-full text-center py-1 transition-colors"
                        onClick={() => setShowActions(false)}
                      >
                        <ArrowLeft className="h-3 w-3 inline mr-1" />
                        返回繼續填寫
                      </button>
                    </div>
                    )
                  )}
                </div>
              </TabsContent>}

              {/* Tab: 過往紀錄 */}
              <TabsContent value="history" className="flex-1 px-4 mt-0 overflow-y-auto">
                {hasSubtasks ? (() => {
                  // For parent tasks with subtasks: show aggregated subtask logs (read-only)
                  const subIds = (task.subtasks || []).map(s => s.id)
                  const subLogs = project.taskLogs
                    .filter(l => subIds.includes(l.taskId))
                    .sort((a, b) => new Date(b.logDate).getTime() - new Date(a.logDate).getTime())
                  // Also include any legacy logs on this parent task
                  const parentLogs = taskLogs
                  const allLogs = [...subLogs, ...parentLogs]
                    .sort((a, b) => new Date(b.logDate).getTime() - new Date(a.logDate).getTime())

                  if (allLogs.length === 0) return (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
                        <Clock className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <p className="text-sm text-muted-foreground">子任務尚無工作紀錄</p>
                    </div>
                  )

                  return (
                    <div className="py-4 divide-y divide-border">
                      {allLogs.map((log) => {
                        const subTask = project.tasks.find(t => t.id === log.taskId)
                        const isParentLog = log.taskId === task.id
                        return (
                          <div key={log.id} className="flex gap-3 px-4 py-3">
                            <div className="flex flex-col items-center pt-0.5">
                              <Avatar className="h-7 w-7 shrink-0">
                                <AvatarFallback className={cn('text-[11px] font-semibold text-white', getAvatarColor(log.author))}>
                                  {log.author.split(' ').map(n => n[0]).join('').slice(0, 2)}
                                </AvatarFallback>
                              </Avatar>
                            </div>
                            <div className="flex-1 min-w-0 space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium truncate">{log.author}</span>
                                <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                                  {new Date(log.logDate).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <Badge variant="outline" className="text-xs px-2 py-0.5 h-5 font-normal">
                                  {isParentLog ? '本任務（舊紀錄）' : subTask?.title || '子任務'}
                                </Badge>
                              </div>
                              <p className="text-sm leading-relaxed whitespace-pre-line">{log.content}</p>
                              {log.attachments && log.attachments.filter(a => a.type === 'image').length > 0 && (
                                <div className="flex flex-wrap gap-1.5 pt-1">
                                  {log.attachments.filter(a => a.type === 'image').map((att, ai) => (
                                    <a key={ai} href={att.url} target="_blank" rel="noopener">
                                      <img src={att.url} alt={att.name} className="h-16 w-16 rounded-lg object-cover border hover:opacity-80 transition-opacity" />
                                    </a>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )
                })() : taskLogs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
                      <Clock className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground">尚無工作紀錄</p>
                    <p className="text-sm text-muted-foreground/60 mt-1">提交第一筆紀錄後會顯示在這裡</p>
                  </div>
                ) : (
                  <div className="py-4 divide-y divide-border">
                    {taskLogs.map((log) => (
                      <div key={log.id} className="group transition-colors hover:bg-muted/30">
                        {editingLogId === log.id ? (
                          /* ── Edit mode ── */
                          <div>
                            <div className="flex items-center gap-2 px-4 py-3 border-b border-primary/20 bg-primary/5 rounded-t-xl">
                              <Pencil className="h-3.5 w-3.5 text-primary" />
                              <span className="text-sm font-medium text-primary">編輯紀錄</span>
                              <input
                                type="date"
                                value={editLogDate}
                                onChange={e => setEditLogDate(e.target.value)}
                                className="ml-auto h-7 text-xs border rounded px-2 bg-background"
                              />
                            </div>
                            <div className="px-4 py-3 space-y-3">
                              {/* Textarea with toolbar (same style as new-log input) */}
                              <div className={cn(
                                'rounded-xl border bg-muted/30 transition-colors overflow-hidden',
                                'border-muted-foreground/20 focus-within:border-primary/40 focus-within:bg-background'
                              )}>
                                <Textarea
                                  value={editLogContent + (editLogContentInterim ? (editLogContent ? ' ' : '') + editLogContentInterim : '')}
                                  onChange={e => { setEditLogContent(e.target.value); setEditLogContentInterim('') }}
                                  className="text-sm min-h-[80px] resize-none border-0 bg-transparent shadow-none focus-visible:ring-0 rounded-none"
                                  placeholder="工作內容"
                                />
                                {/* Attachment previews below textarea */}
                                {editLogAttachments.length > 0 && (
                                  <div className="px-3 pb-2 space-y-1.5">
                                    {editLogAttachments.filter(a => a.type === 'image').length > 0 && (
                                      <div className="flex flex-wrap gap-1.5">
                                        {editLogAttachments.filter(a => a.type === 'image').map((att) => (
                                          <div key={att.url} className="relative group/img">
                                            <img src={att.url} alt={att.name} className="h-14 w-14 object-cover rounded-lg border border-border" />
                                            <button
                                              onClick={() => setEditLogAttachments(prev => prev.filter(a => a.url !== att.url))}
                                              className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-background border border-border shadow-sm text-muted-foreground hover:text-destructive flex items-center justify-center"
                                            >
                                              <X className="h-2.5 w-2.5" />
                                            </button>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                    {editLogAttachments.filter(a => a.type === 'file').length > 0 && (
                                      <div className="flex flex-wrap gap-1.5">
                                        {editLogAttachments.filter(a => a.type === 'file').map((att) => (
                                          <div key={att.url} className="flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-lg border border-border/70 bg-background text-xs">
                                            <Paperclip className="h-3 w-3 text-muted-foreground shrink-0" />
                                            <span className="max-w-[120px] truncate">{att.name}</span>
                                            <button
                                              onClick={() => setEditLogAttachments(prev => prev.filter(a => a.url !== att.url))}
                                              className="ml-0.5 text-muted-foreground hover:text-destructive"
                                            >
                                              <X className="h-3 w-3" />
                                            </button>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}
                                {/* Toolbar */}
                                <div className="flex items-center gap-0.5 px-2 py-1.5 border-t border-border/40">
                                  <VoiceInputButton
                                    className="h-7 w-7"
                                    onTranscript={(text) => { setEditLogContent(prev => prev ? `${prev} ${text}` : text); setEditLogContentInterim('') }}
                                    onInterimTranscript={setEditLogContentInterim}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => editImageInputRef.current?.click()}
                                    disabled={editUploadingFiles}
                                    className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
                                    title="上傳圖片"
                                  >
                                    <ImagePlus className="h-4 w-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => editFileInputRef.current?.click()}
                                    disabled={editUploadingFiles}
                                    className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
                                    title="上傳檔案"
                                  >
                                    <Paperclip className="h-4 w-4" />
                                  </button>
                                  {editUploadingFiles && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground ml-1" />}
                                </div>
                              </div>
                              <input ref={editImageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleEditFileSelect} />
                              <input ref={editFileInputRef} type="file" multiple className="hidden" onChange={handleEditFileSelect} />
                              {/* Next plans in edit */}
                              <div className="rounded-lg border border-dashed border-border p-3 space-y-2">
                                <div className="flex items-center gap-1.5">
                                  <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />
                                  <span className="text-xs font-medium text-muted-foreground">後續計畫</span>
                                  <span className="text-[10px] text-muted-foreground/50">選填</span>
                                </div>
                                <div className="space-y-2">
                                  {editLogNextPlans.map((item, idx) => (
                                    <div key={idx} className="flex gap-2 items-start">
                                      <div className="flex-1 space-y-1">
                                        <input
                                          type="date"
                                          value={item.date || ''}
                                          min={(() => { const d = new Date(editLogDate); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0] })()}
                                          onChange={e => { const u = [...editLogNextPlans]; u[idx] = { ...u[idx], date: e.target.value }; setEditLogNextPlans(u) }}
                                          className="h-6 text-xs border rounded px-1.5 bg-background text-muted-foreground w-full"
                                        />
                                        <Textarea
                                          value={item.content}
                                          onChange={e => { const u = [...editLogNextPlans]; u[idx] = { ...u[idx], content: e.target.value }; setEditLogNextPlans(u) }}
                                          className="text-sm min-h-[48px] resize-none border-0 bg-muted/30 shadow-none focus-visible:ring-0"
                                          placeholder="預計要做什麼事項..."
                                        />
                                      </div>
                                      {editLogNextPlans.length > 1 && (
                                        <button
                                          type="button"
                                          className="mt-1 p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                                          onClick={() => setEditLogNextPlans(editLogNextPlans.filter((_, i) => i !== idx))}
                                        >
                                          <X className="h-3.5 w-3.5" />
                                        </button>
                                      )}
                                    </div>
                                  ))}
                                </div>
                                <button
                                  type="button"
                                  className="text-xs text-primary hover:text-primary/80 transition-colors flex items-center gap-1"
                                  onClick={() => setEditLogNextPlans([...editLogNextPlans, { content: '', date: '' }])}
                                >
                                  <span className="text-sm leading-none">+</span> 新增一筆
                                </button>
                              </div>
                              {/* Save / cancel */}
                              <div className="flex items-center justify-end gap-1.5 pt-1 border-t border-border/40">
                                <Button size="sm" variant="ghost" className="h-7 px-3 text-sm" onClick={handleCancelEditLog}>
                                  <X className="h-3.5 w-3.5 mr-1" />取消
                                </Button>
                                <Button size="sm" className="h-7 px-3 text-sm" disabled={!editLogContent.trim()} onClick={() => handleSaveEditLog(log)}>
                                  <Check className="h-3.5 w-3.5 mr-1" />儲存
                                </Button>
                              </div>
                            </div>
                          </div>
                        ) : (
                          /* ── Display mode — timeline style ── */
                          <div className="flex gap-3 px-4 py-3">
                            {/* Timeline dot + line */}
                            <div className="flex flex-col items-center pt-0.5">
                              <Avatar className="h-7 w-7 shrink-0">
                                <AvatarFallback className={cn('text-[11px] font-semibold text-white', getAvatarColor(log.author))}>
                                  {log.author.split(' ').map(n => n[0]).join('').slice(0, 2)}
                                </AvatarFallback>
                              </Avatar>
                            </div>
                            {/* Content */}
                            <div className="flex-1 min-w-0 space-y-1.5">
                              {/* Header line */}
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="text-sm font-medium truncate">{log.author}</span>
                                  <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                                    {new Date(log.logDate).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })}
                                  </span>
                                </div>
                                {!readOnly && user && log.author === user.name && (
                                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                    <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground hover:text-foreground" onClick={() => handleStartEditLog(log)}>
                                      <Pencil className="h-3 w-3" />
                                    </Button>
                                    <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => setDeletingLog(log)}>
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </div>
                                )}
                              </div>
                              {/* Content text */}
                              <p className="text-sm leading-relaxed whitespace-pre-line">{log.content}</p>
                              {/* Attachments - images */}
                              {log.attachments && log.attachments.filter(a => a.type === 'image').length > 0 && (
                                <div className="flex flex-wrap gap-1.5 pt-1">
                                  {log.attachments.filter(a => a.type === 'image').map((att, ai) => (
                                    <a key={ai} href={att.url} target="_blank" rel="noopener noreferrer"
                                      className="block overflow-hidden rounded-lg border border-border/50 hover:opacity-90 transition-opacity">
                                      <img src={att.url} alt={att.name} className="h-16 w-16 object-cover" />
                                    </a>
                                  ))}
                                </div>
                              )}
                              {/* Attachments - files */}
                              {log.attachments && log.attachments.filter(a => a.type === 'file').length > 0 && (
                                <div className="flex flex-wrap gap-1.5 pt-1">
                                  {log.attachments.filter(a => a.type === 'file').map((att, ai) => (
                                    <a key={ai} href={att.url} target="_blank" rel="noopener noreferrer"
                                      className="flex items-center gap-1.5 pl-2 pr-2.5 py-1 rounded-md border border-border/60 bg-muted/40 text-xs text-foreground hover:bg-muted transition-colors">
                                      <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
                                      <span className="max-w-[120px] truncate">{att.name}</span>
                                    </a>
                                  ))}
                                </div>
                              )}
                              {/* Next plans */}
                              {log.nextPlans && log.nextPlans.length > 0 && (
                                <div className="mt-1 pl-2.5 border-l-2 border-primary/20 space-y-1">
                                  <div className="flex items-center gap-1">
                                    <CalendarClock className="h-3 w-3 text-primary/60" />
                                    <span className="text-[11px] text-primary/60 font-medium">後續計畫</span>
                                  </div>
                                  {log.nextPlans.map((plan, pi) => (
                                    <div key={pi} className="text-sm text-muted-foreground">
                                      {plan.date && (
                                        <span className="text-[11px] text-primary/50 tabular-nums mr-1.5">
                                          {new Date(plan.date).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })}
                                        </span>
                                      )}
                                      <span className="whitespace-pre-line leading-relaxed">{plan.content}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* Tab: R 週報 — Show R members' task logs for A to review */}
              <TabsContent value="r-reports" className="flex-1 px-6 mt-0 overflow-y-auto">
                {(() => {
                  // Collect all task logs from the same milestone for the selected week
                  const [wy, wm, wd] = rWeekStart.split('-').map(Number)
                  const wkStart = `${wy}-${String(wm).padStart(2, '0')}-${String(wd).padStart(2, '0')}`
                  const wkEndDate = new Date(wy, wm - 1, wd + 6)
                  const wkEnd = `${wkEndDate.getFullYear()}-${String(wkEndDate.getMonth() + 1).padStart(2, '0')}-${String(wkEndDate.getDate()).padStart(2, '0')}`

                  // Collect all tasks in same milestone (including subtasks)
                  const milestoneTasks = project.tasks.filter(t => t.milestoneId === task.milestoneId)
                  const milestoneTaskIds = new Set(milestoneTasks.map(t => t.id))
                  // Also include subtask IDs
                  for (const mt of milestoneTasks) {
                    if (mt.subtasks) {
                      for (const sub of mt.subtasks) milestoneTaskIds.add(sub.id)
                    }
                  }

                  // Build task map for display
                  const targetTaskMap = new Map<string, { title: string; assignee: string }>()
                  for (const mt of milestoneTasks) {
                    targetTaskMap.set(mt.id, { title: mt.title, assignee: mt.assignee })
                    if (mt.subtasks) {
                      for (const sub of mt.subtasks) {
                        targetTaskMap.set(sub.id, { title: sub.title, assignee: sub.assignee })
                      }
                    }
                  }

                  // Filter logs for this week
                  // readOnly (R role): show ALL members' logs; A: exclude own logs (for import)
                  const weekLogs = project.taskLogs
                    .filter(l =>
                      milestoneTaskIds.has(l.taskId) &&
                      l.logDate >= wkStart &&
                      l.logDate <= wkEnd &&
                      (readOnly || l.author !== user?.name)
                    )
                    .sort((a, b) => a.logDate.localeCompare(b.logDate))

                  // Group by author
                  const byAuthor = new Map<string, typeof weekLogs>()
                  for (const log of weekLogs) {
                    const key = log.author
                    if (!byAuthor.has(key)) byAuthor.set(key, [])
                    byAuthor.get(key)!.push(log)
                  }

                  // Find tasks assigned to others that have NO logs this week
                  const otherMemberTasks = Array.from(targetTaskMap.entries())
                    .filter(([, info]) => info.assignee && info.assignee !== user?.name)
                  const tasksWithLogs = new Set(weekLogs.map(l => l.taskId))
                  const tasksWithoutLogs = otherMemberTasks.filter(([id]) => !tasksWithLogs.has(id))

                  return (
                    <div className="py-4 space-y-4">
                      {/* Week picker */}
                      <WeekPicker value={rWeekStart} onChange={setRWeekStart} />

                      {weekLogs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-10 text-center">
                          <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
                            <Clock className="h-5 w-5 text-muted-foreground" />
                          </div>
                          <p className="text-sm text-muted-foreground">本周尚無其他成員工作紀錄</p>
                          <p className="text-xs text-muted-foreground/60 mt-1">R 成員在「我的任務」或甘特圖填寫週報後會顯示在這裡</p>
                        </div>
                      ) : (
                        <>
                          {/* By author */}
                          {Array.from(byAuthor.entries()).map(([author, logs]) => (
                            <div key={author} className="border rounded-lg overflow-hidden">
                              <div className="px-4 py-2.5 bg-muted/30 flex items-center gap-2">
                                <Avatar className="h-6 w-6 shrink-0">
                                  <AvatarFallback className={cn('text-[10px] font-semibold text-white', getAvatarColor(author))}>
                                    {author.split(' ').map(n => n[0]).join('').slice(0, 2)}
                                  </AvatarFallback>
                                </Avatar>
                                <span className="text-sm font-medium">{author}</span>
                                <Badge variant="secondary" className="text-[10px] ml-auto">{logs.length} 筆紀錄</Badge>
                              </div>
                              <div className="divide-y">
                                {logs.map(log => {
                                  const taskInfo = targetTaskMap.get(log.taskId)
                                  return (
                                    <div key={log.id} className="px-4 py-3 space-y-1.5">
                                      <div className="flex items-center gap-2">
                                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">
                                          {taskInfo?.title || '任務'}
                                        </Badge>
                                        <span className="text-[11px] text-muted-foreground tabular-nums ml-auto">
                                          {new Date(log.logDate).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })}
                                        </span>
                                      </div>
                                      <p className="text-sm leading-relaxed whitespace-pre-line">{log.content}</p>
                                      {log.nextPlans && log.nextPlans.length > 0 && (
                                        <div className="text-xs text-blue-600 dark:text-blue-400">
                                          <span className="font-medium">下週計畫：</span>
                                          {log.nextPlans.map(p => p.content).join('、')}
                                        </div>
                                      )}
                                      {log.attachments && log.attachments.filter(a => a.type === 'image').length > 0 && (
                                        <div className="flex flex-wrap gap-1.5 pt-1">
                                          {log.attachments.filter(a => a.type === 'image').map((att, ai) => (
                                            <a key={ai} href={att.url} target="_blank" rel="noopener">
                                              <img src={att.url} alt={att.name} className="h-14 w-14 rounded-lg object-cover border hover:opacity-80 transition-opacity" />
                                            </a>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          ))}

                          {/* Tasks without logs this week */}
                          {tasksWithoutLogs.length > 0 && (
                            <div className="rounded-lg border border-dashed border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/10 px-4 py-3">
                              <div className="flex items-center gap-1.5 mb-2">
                                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                                <span className="text-xs font-medium text-amber-700 dark:text-amber-400">本周尚未填寫的任務</span>
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {tasksWithoutLogs.map(([id, info]) => (
                                  <Badge key={id} variant="outline" className="text-[10px] px-2 py-0.5 text-amber-600 border-amber-300">
                                    {info.assignee} — {info.title}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Import into my log (only for editable users) */}
                          {!readOnly && (
                            <div className="border-t pt-3">
                              <Button
                                size="sm"
                                variant="outline"
                                className="w-full gap-1.5 text-xs"
                                onClick={() => {
                                  // Build summary text from R logs
                                  const lines: string[] = []
                                  for (const [author, logs] of byAuthor) {
                                    for (const log of logs) {
                                      const taskInfo = targetTaskMap.get(log.taskId)
                                      lines.push(`【${taskInfo?.title || '任務'}】(${author})\n${log.content}`)
                                    }
                                  }
                                  const text = lines.join('\n\n')
                                  // Append to logRows
                                  appendToLogRows(text)
                                }}
                              >
                                <FileText className="h-3.5 w-3.5" />
                                帶入 R 週報到我的工作紀錄
                              </Button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )
                })()}
              </TabsContent>

              {/* Tab: 任務資訊 */}
              <TabsContent value="info" className="flex-1 overflow-y-auto px-6 mt-0">
                <div className="space-y-4 py-4">
                  {/* Description */}
                  {task.description && (
                    <div className="p-3 rounded-xl bg-muted/30 border border-border/50">
                      <p className="text-sm text-muted-foreground leading-relaxed">{task.description}</p>
                    </div>
                  )}

                  {/* Info card */}
                  <div className="rounded-lg border divide-y">
                    <div className="flex items-center justify-between py-2.5 px-3">
                      <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                        <User className="h-3.5 w-3.5" />
                        負責人
                      </span>
                      <div className="flex items-center gap-2">
                        <Avatar className="h-5 w-5">
                          <AvatarFallback className={cn('text-[10px] text-white', getAvatarColor(task.assignee))}>
                            {task.assignee.split(' ').map(n => n[0]).join('')}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm font-medium">{task.assignee}</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between py-2.5 px-3">
                      <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5" />
                        時程
                      </span>
                      <span className="text-sm font-medium">
                        {new Date(task.startDate).toLocaleDateString('zh-TW')}
                        <span className="text-muted-foreground mx-1">→</span>
                        <span className={cn(isOverdue && 'text-destructive')}>
                          {new Date(task.endDate).toLocaleDateString('zh-TW')}
                        </span>
                        <span className="text-muted-foreground text-xs ml-1">（{task.durationDays} 天）</span>
                      </span>
                    </div>
                    {task.completedAt && (
                      <div className="flex items-center justify-between py-2.5 px-3">
                        <span className="text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          完成
                        </span>
                        <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                          {new Date(task.completedAt).toLocaleDateString('zh-TW')}
                          {task.completedBy && <span className="text-muted-foreground font-normal ml-1.5">由 {task.completedBy}</span>}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Upstream tasks */}
                  {upstreamTasks.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="h-5 w-5 rounded flex items-center justify-center bg-blue-100 dark:bg-blue-900/30">
                          <ArrowLeft className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                        </div>
                        <span className="text-sm font-medium text-muted-foreground">需先完成</span>
                      </div>
                      <div className="space-y-1.5 ml-7">
                        {upstreamTasks.map(({ task: dep, status: depStatus }) => (
                          <div
                            key={dep.id}
                            className="flex items-center gap-2.5 text-sm py-2 px-3 rounded-lg bg-muted/30 border border-border/50 cursor-pointer hover:bg-muted/50"
                            onClick={() => handleSelectTask(dep)}
                          >
                            {getStatusDot(depStatus)}
                            <span className="flex-1 truncate">{dep.title}</span>
                            {getComputedStatusBadge(depStatus)}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Downstream tasks */}
                  {downstreamTasks.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="h-5 w-5 rounded flex items-center justify-center bg-purple-100 dark:bg-purple-900/30">
                          <ArrowRight className="h-3 w-3 text-purple-600 dark:text-purple-400" />
                        </div>
                        <span className="text-sm font-medium text-muted-foreground">完成後開始</span>
                      </div>
                      <div className="space-y-1.5 ml-7">
                        {downstreamTasks.map(({ task: dep, status: depStatus }) => (
                          <div
                            key={dep.id}
                            className="flex items-center gap-2.5 text-sm py-2 px-3 rounded-lg bg-muted/30 border border-border/50 cursor-pointer hover:bg-muted/50"
                            onClick={() => handleSelectTask(dep)}
                          >
                            {getStatusDot(depStatus)}
                            <span className="flex-1 truncate">{dep.title}</span>
                            {getComputedStatusBadge(depStatus)}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Impact Analysis */}
                  <div className="pt-2 border-t">
                    <h4 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                      延遲影響
                    </h4>

                    {impact.totalDelayChain === 0 ? (
                      <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900">
                        <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
                          <CheckCircle2 className="h-4 w-4" />
                          <span className="font-medium">無連鎖影響，此任務延遲不會影響其他任務</span>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className={`p-3 rounded-lg border ${
                          impact.totalDelayChain >= 3
                            ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900'
                            : 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900'
                        }`}>
                          <div className={`flex items-center gap-2 text-sm font-medium ${
                            impact.totalDelayChain >= 3
                              ? 'text-red-700 dark:text-red-400'
                              : 'text-amber-700 dark:text-amber-400'
                          }`}>
                            <AlertTriangle className="h-4 w-4" />
                            若此任務延遲，將影響 {impact.totalDelayChain} 個後續任務
                          </div>
                          {impact.affectedMilestones.length > 0 && (
                            <p className="text-sm text-muted-foreground mt-1">
                              涉及里程碑：{impact.affectedMilestones.map(m => m.name).join('、')}
                            </p>
                          )}
                        </div>

                        {impact.directlyBlocked.length > 0 && (
                          <div>
                            <div className="text-sm font-medium text-muted-foreground mb-1.5">
                              直接影響（{impact.directlyBlocked.length}）
                            </div>
                            <div className="space-y-1">
                              {impact.directlyBlocked.map(t => (
                                <div
                                  key={t.id}
                                  className="flex items-center gap-2 p-2 rounded-md border text-sm cursor-pointer hover:bg-muted/30"
                                  onClick={() => handleSelectTask(t)}
                                >
                                  <span className="flex-1 truncate">{t.title}</span>
                                  <span className="text-sm text-muted-foreground">{t.assignee}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {impact.indirectlyAffected.length > 0 && (
                          <div>
                            <div className="text-sm font-medium text-muted-foreground mb-1.5">
                              間接影響（{impact.indirectlyAffected.length}）
                            </div>
                            <div className="space-y-1">
                              {impact.indirectlyAffected.map(t => (
                                <div
                                  key={t.id}
                                  className="flex items-center gap-2 p-2 rounded-md border border-dashed text-sm cursor-pointer hover:bg-muted/30"
                                  onClick={() => handleSelectTask(t)}
                                >
                                  <span className="flex-1 truncate text-muted-foreground">{t.title}</span>
                                  <span className="text-sm text-muted-foreground">{t.assignee}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Critical path indicator */}
                  {node?.isOnCriticalPath && (
                    <div className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 rounded-md p-2.5 border border-amber-200 dark:border-amber-900">
                      <Route className="h-3.5 w-3.5 shrink-0" />
                      <span>此任務在<strong>關鍵路徑</strong>上，延遲會直接影響專案完成日期</span>
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          ) : null}

          {/* Extension Form (replaces tabs when shown) */}
          {!readOnly && showExtensionForm && (
            <div className="flex-1 overflow-y-auto px-6 py-4 border-t bg-amber-50/30 dark:bg-amber-950/10 space-y-3 animate-in slide-in-from-bottom-2 duration-200">
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded flex items-center justify-center bg-amber-100 dark:bg-amber-900/30">
                  <CalendarClock className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                </div>
                <span className="text-sm font-medium">申請延期</span>
              </div>
              {/* Current task dates */}
              <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
                目前任務期間：{new Date(task.startDate).toLocaleDateString('zh-TW')} ~ {new Date(task.endDate).toLocaleDateString('zh-TW')}（{task.durationDays} 天）
              </div>
              <div>
                <Label className="text-sm text-muted-foreground">延遲原因 <span className="text-red-500">*</span></Label>
                <Textarea
                  placeholder="說明延遲的原因..."
                  value={extensionReason}
                  onChange={e => setExtensionReason(e.target.value)}
                  rows={2}
                  className="text-sm mt-1.5 rounded-lg"
                />
              </div>
              <div>
                <Label className="text-sm text-muted-foreground">任務預計完成日 <span className="text-red-500">*</span></Label>
                <input
                  type="date"
                  value={extensionDate}
                  min={(() => { const d = new Date(task.endDate); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0] })()}
                  onChange={e => setExtensionDate(e.target.value)}
                  className="w-full text-sm border rounded-lg px-2.5 py-1.5 mt-1.5 bg-background"
                />
              </div>
              {/* Impact preview */}
              {delayImpact && (
                <div className="text-xs space-y-1 bg-amber-100/60 dark:bg-amber-900/20 rounded-lg px-3 py-2 border border-amber-200 dark:border-amber-800">
                  <div className="font-medium text-amber-800 dark:text-amber-300">影響預估：</div>
                  <div className="text-amber-700 dark:text-amber-400">
                    任務延長 +{delayImpact.extraDays} 天
                    （{new Date(task.endDate).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })} → {new Date(extensionDate).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })}）
                  </div>
                  {delayImpact.milestoneDelta > 0 ? (
                    <div className="text-amber-700 dark:text-amber-400">
                      里程碑延後 +{delayImpact.milestoneDelta} 天
                    </div>
                  ) : (
                    <div className="text-green-700 dark:text-green-400">
                      里程碑不受影響（仍有餘裕）
                    </div>
                  )}
                </div>
              )}
              <div>
                <Label className="text-sm text-muted-foreground">需要協助</Label>
                <Textarea
                  placeholder="選填，說明是否需要額外資源或支援..."
                  value={extensionSupport}
                  onChange={e => setExtensionSupport(e.target.value)}
                  rows={2}
                  className="text-sm mt-1.5 rounded-lg"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 rounded-lg"
                  onClick={() => {
                    setShowExtensionForm(false)
                    setShowActions(true)
                  }}
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  取消
                </Button>
                <Button
                  size="sm"
                  className="gap-1.5 flex-1 rounded-lg shadow-sm"
                  disabled={!extensionReason.trim() || !delayImpact}
                  onClick={handleSubmitExtension}
                >
                  <Send className="h-3.5 w-3.5" />
                  送出延期申請
                </Button>
              </div>
            </div>
          )}


        </SheetContent>
      </Sheet>

      {/* Delete task log confirmation */}
      <AlertDialog open={!!deletingLog} onOpenChange={open => { if (!open) setDeletingLog(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認刪除工作紀錄</AlertDialogTitle>
            <AlertDialogDescription>
              確定要刪除這筆工作紀錄嗎？此操作無法復原。
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deletingLog && (
            <div className="rounded-lg border bg-muted/50 p-3 text-sm text-muted-foreground line-clamp-3 whitespace-pre-line">
              {deletingLog.content}
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleConfirmDeleteLog}
            >
              刪除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog 1: Preceding item incomplete reminder */}
      <AlertDialog open={showPrecedingDialog} onOpenChange={setShowPrecedingDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              前序{incompletePreceding?.type === 'milestone' ? '里程碑' : '任務'}尚未完成
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  <span className="font-semibold text-foreground">{incompletePreceding?.name}</span>
                  {' '}尚有{' '}
                  <span className="font-semibold text-red-600">{incompletePreceding?.incompleteItems}</span>
                  {' '}個{incompletePreceding?.type === 'milestone' ? '任務' : '項目'}未完成（共 {incompletePreceding?.totalItems} 個）。
                </p>
                <p>依據專案流程，建議先完成前序{incompletePreceding?.type === 'milestone' ? '里程碑' : '任務'}再進行後續工作。</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-2 mt-2">
            <Button
              className="w-full gap-2"
              onClick={() => {
                setShowPrecedingDialog(false)
                setShowBatchCompleteConfirm(true)
              }}
            >
              <CheckCircle2 className="h-4 w-4" />
              前序{incompletePreceding?.type === 'milestone' ? '里程碑' : '任務'}皆已完成
            </Button>
            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={() => {
                setShowPrecedingDialog(false)
                setPrecedingDismissed(true)
              }}
            >
              繼續填寫目前任務
            </Button>
            <Button
              variant="ghost"
              className="w-full gap-2 text-muted-foreground"
              onClick={() => {
                setShowPrecedingDialog(false)
                onOpenChange(false)
              }}
            >
              <ArrowLeft className="h-4 w-4" />
              返回先完成前序{incompletePreceding?.type === 'milestone' ? '里程碑' : '任務'}
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog 2: Confirm batch mark preceding item as complete */}
      <AlertDialog open={showBatchCompleteConfirm} onOpenChange={setShowBatchCompleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認標記為已完成</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  此操作將把{' '}
                  <span className="font-semibold text-foreground">{incompletePreceding?.name}</span>
                  {' '}的所有未完成項目標記為 100% 完成：
                </p>
                <ul className="list-disc pl-5 space-y-1 text-sm">
                  <li>共 <span className="font-semibold">{incompletePreceding?.incompleteItems}</span> 個項目將標記為已完成</li>
                  <li>完成日期以各任務最後一筆工作紀錄日期為準</li>
                  <li>若無工作紀錄，則以今日日期為完成日</li>
                </ul>
                <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-3">
                  <p className="text-sm text-amber-800 dark:text-amber-300 font-medium">
                    標記完成後仍可透過任務面板調整狀態。
                  </p>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setShowBatchCompleteConfirm(false)
              setShowPrecedingDialog(true)
            }}>
              返回
            </AlertDialogCancel>
            <Button
              onClick={handleBatchCompletePreceding}
              disabled={batchCompleting}
              className="gap-2"
            >
              {batchCompleting ? (
                <><Loader2 className="h-4 w-4 animate-spin" />處理中...</>
              ) : (
                <><CheckCircle2 className="h-4 w-4" />確認全部完成</>
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
