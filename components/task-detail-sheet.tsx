'use client'

import { useMemo, useState, useEffect, useRef, useCallback } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Slider } from '@/components/ui/slider'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
  Calendar,
  CalendarClock,
  CheckCircle2,
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

  // Progress slider
  const [editProgress, setEditProgress] = useState<number>(0)
  const [savingProgress, setSavingProgress] = useState(false)

  // Completion date
  const [completedDate, setCompletedDate] = useState(() => new Date().toISOString().split('T')[0])

  // Log submission
  const [logContent, setLogContent] = useState('')
  const [logNextPlans, setLogNextPlans] = useState<NextPlanItem[]>([{ content: '', date: '' }])
  const [logDate, setLogDate] = useState(() => new Date().toISOString().split('T')[0])
  const [existingLogId, setExistingLogId] = useState<string | null>(null)
  const [showActions, setShowActions] = useState(false)
  const [logContentInterim, setLogContentInterim] = useState('')
  const [attachments, setAttachments] = useState<TaskLogAttachment[]>([])
  const [uploadingFiles, setUploadingFiles] = useState(false)

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
  const [deletingLog, setDeletingLog] = useState<TaskLog | null>(null)

  // Completion confirmation step
  const [showCompleteDateStep, setShowCompleteDateStep] = useState(false)

  // Optimistic completion state: null = use task prop, true/false = override
  const [optimisticCompleted, setOptimisticCompleted] = useState<boolean | null>(null)

  // Subtask log import
  const [importSubLogsOpen, setImportSubLogsOpen] = useState(false)
  const [importSubLogsLoading, setImportSubLogsLoading] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)

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
      setLogContent('')
      setLogNextPlans([{ content: '', date: '' }])
      setLogDate(new Date().toISOString().split('T')[0])
      setCompletedDate(new Date().toISOString().split('T')[0])
      setShowActions(false)
      setShowCompleteDateStep(false)
      setShowExtensionForm(false)
      setExtensionReason('')
      setExtensionDate('')
      setExtensionSupport('')
      setLogContentInterim('')
      setAttachments([])
      setUploadingFiles(false)
      setEditingLogId(null)
      setOptimisticCompleted(null)
    }
  }, [open, task?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Prefill from existing log when logDate matches
  useEffect(() => {
    if (!task || !open) return
    const logs = project.taskLogs.filter(l => l.taskId === task.id)
    const existing = logs.find(l => l.logDate === logDate)
    if (existing) {
      setExistingLogId(existing.id)
      setLogContent(existing.content)
      setLogNextPlans(existing.nextPlans?.length ? [...existing.nextPlans] : [{ content: '', date: '' }])
    } else {
      setExistingLogId(null)
      setLogContent('')
      setLogNextPlans([{ content: '', date: '' }])
    }
  }, [logDate, task?.id, open, project.taskLogs]) // eslint-disable-line react-hooks/exhaustive-deps

  const hasProgressChange = task ? editProgress !== task.progress : false

  // ── Progress save ──
  const handleSaveProgress = async () => {
    if (!task || !hasProgressChange) return
    setSavingProgress(true)
    try {
      const body: Record<string, unknown> = { progress: editProgress }
      if (editProgress >= 100) {
        body.status = 'done'
        body.completedBy = user?.name ?? ''
        body.completedAt = completedDate
      } else if (editProgress > 0 && task.status === 'todo') {
        body.status = 'in_progress'
      }
      await fetch(`/api/projects/${project.id}/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      onTaskUpdate?.()
    } finally {
      setSavingProgress(false)
    }
  }

  // ── File/image select ──
  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    // Copy to array BEFORE clearing input (clearing value may empty the FileList reference)
    const fileArray = Array.from(files)
    e.target.value = ''
    setUploadingFiles(true)
    try {
      const uploaded: TaskLogAttachment[] = []
      for (const file of fileArray) {
        const fd = new FormData()
        fd.append('file', file)
        const res = await fetch('/api/upload', { method: 'POST', body: fd })
        if (res.ok) {
          uploaded.push(await res.json())
        } else {
          const err = await res.json().catch(() => ({}))
          alert(`上傳失敗：${err.error || res.status}`)
        }
      }
      if (uploaded.length > 0) setAttachments(prev => [...prev, ...uploaded])
    } catch (err) {
      console.error('Upload error:', err)
      alert('上傳失敗，請確認網路連線')
    } finally {
      setUploadingFiles(false)
    }
  }, [])

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

  const handleImportSubLogsRaw = () => {
    const entries = getSubtaskLogsContent()
    if (!entries) return
    const text = entries.map(e => `【${e.title}】(${e.progress}%)\n${e.content}`).join('\n\n')
    setLogContent(prev => prev ? `${prev}\n\n${text}` : text)
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
      setLogContent(prev => prev ? `${prev}\n\n${summary}` : summary)
    } catch {
      handleImportSubLogsRaw()
    }
    setImportSubLogsLoading(false)
    setImportSubLogsOpen(false)
  }

  // ── Log submission (create or update) ──
  const handleSubmitLog = async () => {
    if (!task || !logContent.trim() || !user) return

    const content = logContent.trim()
    const validPlans = logNextPlans.filter(p => p.content.trim())

    try {
      if (existingLogId) {
        const res = await fetch(`/api/projects/${project.id}/task-logs/${existingLogId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content,
            logDate,
            nextPlans: validPlans.length > 0 ? validPlans : null,
            attachments: attachments.length > 0 ? attachments : null,
          }),
        })
        if (!res.ok) throw new Error()
      } else {
        const res = await fetch(`/api/projects/${project.id}/task-logs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            taskId: task.id,
            userId: user.id,
            logDate,
            content,
            ...(validPlans.length > 0 ? { nextPlans: validPlans } : {}),
            ...(attachments.length > 0 ? { attachments } : {}),
          }),
        })
        if (!res.ok) throw new Error()
      }
      onTaskUpdate?.()
    } catch {
      // fail silently
    }

    setLogContent('')
    setLogNextPlans([{ content: '', date: '' }])
    setLogContentInterim('')
    setExistingLogId(null)
    setAttachments([])
    setShowActions(true)
  }

  // ── Log editing ──
  const handleStartEditLog = (log: TaskLog) => {
    setEditingLogId(log.id)
    setEditLogContent(log.content)
    setEditLogNextPlans(log.nextPlans?.length ? [...log.nextPlans] : [{ content: '', date: '' }])
    setEditLogDate(log.logDate)
  }

  const handleCancelEditLog = () => {
    setEditingLogId(null)
    setEditLogContent('')
    setEditLogNextPlans([])
    setEditLogDate('')
  }

  const handleSaveEditLog = async (log: TaskLog) => {
    if (!editLogContent.trim()) return
    try {
      const res = await fetch(`/api/projects/${log.projectId}/task-logs/${log.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editLogContent.trim(), logDate: editLogDate, nextPlans: editLogNextPlans.filter(p => p.content.trim()) }),
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

  // ── Delay request submission ──
  const handleSubmitExtension = async () => {
    if (!task || !user) return
    const milestone = project.milestones.find(m => m.id === task.milestoneId)
    if (!milestone) return

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
          affectedMilestones: [{
            milestoneId: milestone.id,
            originalDate: milestone.dueDate,
            proposedDate: extensionDate || milestone.dueDate,
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
                  <SheetDescription className="text-left text-sm">
                    <span className="text-muted-foreground">{project.name}</span>
                    {milestone && <span className="text-muted-foreground"> · {milestone.name}</span>}
                    <span className="text-muted-foreground"> · </span>
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
            {readOnly || isCompleted || hasSubtasks ? (
              <div className="space-y-1.5">
                <div className="flex items-center gap-3">
                  <Progress value={task.progress} className="h-2 flex-1" />
                  <span className="text-sm font-medium tabular-nums">{task.progress}%</span>
                </div>
                {hasSubtasks && !readOnly && !isCompleted && (
                  <p className="text-xs text-muted-foreground">
                    進度由子任務自動計算
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <Slider
                    value={[editProgress]}
                    onValueChange={([v]) => setEditProgress(v)}
                    max={100}
                    step={5}
                    className="flex-1"
                  />
                  <span className="text-sm font-bold tabular-nums w-[40px] text-right">{editProgress}%</span>
                  {hasProgressChange && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 shrink-0"
                      onClick={handleSaveProgress}
                      disabled={savingProgress}
                    >
                      {savingProgress ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    </Button>
                  )}
                </div>
                {hasProgressChange && editProgress >= 100 && (
                  <div className="flex items-center gap-2">
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">完成日期</span>
                    <input
                      type="date"
                      value={completedDate}
                      min={(() => {
                        const earliestLog = taskLogs.length > 0
                          ? taskLogs.reduce((min, l) => l.logDate < min ? l.logDate : min, taskLogs[0].logDate)
                          : null
                        return earliestLog || task.startDate
                      })()}
                      onChange={e => setCompletedDate(e.target.value)}
                      className="text-sm border rounded-lg px-2.5 py-1.5 bg-background"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Tabs */}
          {!readOnly && !showExtensionForm ? (
            <Tabs defaultValue="log" className="flex-1 flex flex-col min-h-0">
              <div className="px-6 pt-1 pb-0 border-t shrink-0">
                <TabsList className="w-full bg-transparent h-auto p-0 rounded-none gap-0">
                  <TabsTrigger value="log" className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none pb-2.5 pt-2 text-sm">
                    工作紀錄
                  </TabsTrigger>
                  <TabsTrigger value="history" className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none pb-2.5 pt-2 text-sm">
                    過往紀錄
                    {taskLogs.length > 0 && (
                      <Badge variant="secondary" className="ml-1.5 h-4 min-w-4 px-1 text-[10px] rounded-full">
                        {taskLogs.length}
                      </Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="info" className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none pb-2.5 pt-2 text-sm">
                    任務資訊
                  </TabsTrigger>
                </TabsList>
              </div>

              {/* Tab: 工作紀錄 */}
              <TabsContent value="log" className="flex-1 overflow-y-auto px-6 mt-0">
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
                  ) : !showActions ? (
                    /* Step 1: Input form */
                    <>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">填寫日期</span>
                        <input
                          type="date"
                          value={logDate}
                          onChange={e => setLogDate(e.target.value)}
                          className="text-sm border rounded-lg px-2.5 py-1.5 bg-background"
                        />
                        {existingLogId && (
                          <span className="text-[11px] text-amber-600 dark:text-amber-400">
                            此日期已有紀錄，將更新該筆資料
                          </span>
                        )}
                      </div>

                      <div className={cn(
                        'rounded-xl border bg-muted/30 transition-colors overflow-hidden',
                        'border-muted-foreground/20 focus-within:border-primary/40 focus-within:bg-background'
                      )}>
                        {/* Import subtask logs */}
                        {(task.subtasks || []).length > 0 && (
                          <div className="flex justify-end px-3 pt-2">
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
                        <Textarea
                          placeholder="描述您今天做了什麼..."
                          value={logContent + (logContentInterim ? (logContent ? ' ' : '') + logContentInterim : '')}
                          onChange={e => { setLogContent(e.target.value); setLogContentInterim('') }}
                          rows={5}
                          className="text-sm resize-none border-0 bg-transparent shadow-none focus-visible:ring-0 rounded-none"
                        />

                        {/* Attachments inside box */}
                        {attachments.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 px-3 pb-2">
                            {attachments.map((att, i) => (
                              <Badge key={i} variant="secondary" className="text-sm gap-1 rounded-md py-0.5 max-w-[180px]">
                                {att.type === 'image' ? (
                                  <img src={att.url} alt={att.name} className="h-4 w-4 rounded object-cover" />
                                ) : (
                                  <Paperclip className="h-3 w-3 shrink-0" />
                                )}
                                <span className="truncate">{att.name}</span>
                                <button
                                  onClick={() => setAttachments(prev => prev.filter((_, j) => j !== i))}
                                  className="ml-0.5 text-muted-foreground hover:text-foreground shrink-0"
                                >
                                  ×
                                </button>
                              </Badge>
                            ))}
                          </div>
                        )}

                        {/* Toolbar */}
                        <div className="flex items-center justify-between px-2 py-1.5 border-t border-border/40">
                          <div className="flex items-center gap-0.5">
                            <VoiceInputButton
                              className="h-7 w-7"
                              onTranscript={(text) => { setLogContent(prev => prev ? `${prev} ${text}` : text); setLogContentInterim('') }}
                              onInterimTranscript={setLogContentInterim}
                            />
                            <button
                              type="button"
                              onClick={() => imageInputRef.current?.click()}
                              disabled={uploadingFiles}
                              className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
                              title="上傳圖片"
                            >
                              <ImagePlus className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => fileInputRef.current?.click()}
                              disabled={uploadingFiles}
                              className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
                              title="上傳檔案"
                            >
                              <Paperclip className="h-4 w-4" />
                            </button>
                            {uploadingFiles && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground ml-1" />}
                          </div>
                        </div>
                      </div>

                      {/* Hidden file inputs */}
                      <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileSelect} />
                      <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileSelect} />

                      {/* Next plans (optional, multiple items) */}
                      <div className="rounded-lg border border-dashed border-border p-3 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-xs font-medium text-muted-foreground">預計後續工作</span>
                            <span className="text-[10px] text-muted-foreground/50">選填</span>
                          </div>
                        </div>
                        <div className="space-y-2">
                          {logNextPlans.map((item, idx) => (
                            <div key={idx} className="flex gap-2 items-start">
                              <div className="flex-1 space-y-1.5">
                                <input
                                  type="date"
                                  value={item.date || ''}
                                  min={(() => {
                                    const d = new Date(logDate)
                                    d.setDate(d.getDate() + 1)
                                    return d.toISOString().split('T')[0]
                                  })()}
                                  onChange={e => {
                                    const updated = [...logNextPlans]
                                    updated[idx] = { ...updated[idx], date: e.target.value }
                                    setLogNextPlans(updated)
                                  }}
                                  className="h-7 text-xs border rounded px-2 bg-background text-muted-foreground w-full"
                                />
                                <Textarea
                                  placeholder="預計要做什麼事項..."
                                  className="min-h-[60px] text-sm resize-none border-0 bg-muted/30 shadow-none focus-visible:ring-0"
                                  value={item.content}
                                  onChange={e => {
                                    const updated = [...logNextPlans]
                                    updated[idx] = { ...updated[idx], content: e.target.value }
                                    setLogNextPlans(updated)
                                  }}
                                />
                              </div>
                              {logNextPlans.length > 1 && (
                                <button
                                  type="button"
                                  className="mt-1 p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                                  onClick={() => setLogNextPlans(logNextPlans.filter((_, i) => i !== idx))}
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
                          onClick={() => setLogNextPlans([...logNextPlans, { content: '', date: '' }])}
                        >
                          <span className="text-sm leading-none">+</span> 新增一筆
                        </button>
                      </div>

                      {/* Submit + Skip */}
                      <div className="flex items-center justify-between">
                        <Button
                          size="sm"
                          variant="secondary"
                          className="gap-1.5 text-sm"
                          onClick={() => setShowActions(true)}
                        >
                          跳過，直接操作
                          <ArrowRight className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          className="gap-1.5 rounded-lg shadow-sm px-4 text-sm"
                          disabled={!logContent.trim()}
                          onClick={handleSubmitLog}
                        >
                          {existingLogId ? (
                            <><Save className="h-3.5 w-3.5" />更新</>
                          ) : (
                            <><Send className="h-3.5 w-3.5" />提交</>
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
                            預設為今天，不可早於實際開始日期
                          </p>
                        </div>

                        {/* Progress warning */}
                        {editProgress < 100 && (
                          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-950/20 dark:border-amber-800">
                            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                            <p className="text-sm text-amber-700 dark:text-amber-400">
                              目前進度為 <span className="font-semibold">{editProgress}%</span>，標記完成後將自動更新為 100%
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
                              <p className="text-sm font-medium text-muted-foreground">標記完成</p>
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
                              <p className="text-sm font-medium text-muted-foreground">標記完成</p>
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
                              <p className="text-sm font-medium">標記完成</p>
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
              </TabsContent>

              {/* Tab: 過往紀錄 */}
              <TabsContent value="history" className="flex-1 px-6 mt-0 overflow-hidden">
                {taskLogs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
                      <Clock className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground">尚無工作紀錄</p>
                    <p className="text-sm text-muted-foreground/60 mt-1">提交第一筆紀錄後會顯示在這裡</p>
                  </div>
                ) : (
                  <div className="py-4 max-h-[400px] overflow-y-auto">
                    <div className="relative pl-6">
                      {/* Timeline line */}
                      <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />

                      <div className="space-y-4">
                        {taskLogs.map((log, i) => (
                          <div key={log.id} className="relative group">
                            {/* Timeline dot */}
                            <div className={cn(
                              'absolute -left-6 top-1 h-3.5 w-3.5 rounded-full border-2 border-background',
                              i === 0 ? 'bg-primary' : 'bg-muted-foreground/30'
                            )} />

                            {editingLogId === log.id ? (
                              /* Inline edit mode */
                              <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium">{log.author}</span>
                                  <input
                                    type="date"
                                    value={editLogDate}
                                    onChange={e => setEditLogDate(e.target.value)}
                                    className="h-7 text-sm border rounded px-2 bg-background"
                                  />
                                </div>
                                <Textarea
                                  value={editLogContent}
                                  onChange={e => setEditLogContent(e.target.value)}
                                  className="text-sm min-h-[60px] resize-none"
                                  placeholder="工作內容"
                                />
                                <div className="rounded-md border border-dashed border-border p-2.5 space-y-2">
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
                                            min={(() => {
                                              const d = new Date(editLogDate)
                                              d.setDate(d.getDate() + 1)
                                              return d.toISOString().split('T')[0]
                                            })()}
                                            onChange={e => {
                                              const updated = [...editLogNextPlans]
                                              updated[idx] = { ...updated[idx], date: e.target.value }
                                              setEditLogNextPlans(updated)
                                            }}
                                            className="h-6 text-xs border rounded px-1.5 bg-background text-muted-foreground w-full"
                                          />
                                          <Textarea
                                            value={item.content}
                                            onChange={e => {
                                              const updated = [...editLogNextPlans]
                                              updated[idx] = { ...updated[idx], content: e.target.value }
                                              setEditLogNextPlans(updated)
                                            }}
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
                                <div className="flex items-center gap-1.5 justify-end">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 px-2 text-sm"
                                    onClick={handleCancelEditLog}
                                  >
                                    <X className="h-3.5 w-3.5 mr-1" />
                                    取消
                                  </Button>
                                  <Button
                                    size="sm"
                                    className="h-7 px-2 text-sm"
                                    disabled={!editLogContent.trim()}
                                    onClick={() => handleSaveEditLog(log)}
                                  >
                                    <Check className="h-3.5 w-3.5 mr-1" />
                                    儲存
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              /* Display mode */
                              <div className="space-y-1">
                                <div className="flex items-center justify-between">
                                  <span className="text-sm font-medium">{log.author}</span>
                                  <div className="flex items-center gap-1">
                                    {user && log.author === user.name && (
                                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Button
                                          size="icon"
                                          variant="ghost"
                                          className="h-6 w-6 text-muted-foreground hover:text-foreground"
                                          onClick={() => handleStartEditLog(log)}
                                        >
                                          <Pencil className="h-3 w-3" />
                                        </Button>
                                        <Button
                                          size="icon"
                                          variant="ghost"
                                          className="h-6 w-6 text-muted-foreground hover:text-destructive"
                                          onClick={() => setDeletingLog(log)}
                                        >
                                          <Trash2 className="h-3 w-3" />
                                        </Button>
                                      </div>
                                    )}
                                    <span className="text-[11px] text-muted-foreground tabular-nums">
                                      {new Date(log.logDate).toLocaleDateString('zh-TW', { year: 'numeric', month: 'short', day: 'numeric' })}
                                    </span>
                                  </div>
                                </div>
                                <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">{log.content}</p>
                                {log.attachments && log.attachments.length > 0 && (
                                  <div className="mt-1.5 space-y-1.5">
                                    {/* Image thumbnails */}
                                    {log.attachments.filter(a => a.type === 'image').length > 0 && (
                                      <div className="flex flex-wrap gap-1.5">
                                        {log.attachments.filter(a => a.type === 'image').map((att, ai) => (
                                          <a key={ai} href={att.url} target="_blank" rel="noopener noreferrer">
                                            <img
                                              src={att.url}
                                              alt={att.name}
                                              className="h-20 w-20 object-cover rounded-lg border border-border/50 hover:opacity-80 transition-opacity"
                                            />
                                          </a>
                                        ))}
                                      </div>
                                    )}
                                    {/* File links */}
                                    {log.attachments.filter(a => a.type === 'file').map((att, ai) => (
                                      <a
                                        key={ai}
                                        href={att.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                                      >
                                        <Paperclip className="h-3 w-3 shrink-0" />
                                        <span className="truncate">{att.name}</span>
                                      </a>
                                    ))}
                                  </div>
                                )}
                                {log.nextPlans && log.nextPlans.length > 0 && (
                                  <div className="mt-1.5 pl-3 border-l-2 border-primary/20 space-y-1.5">
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
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
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

                  {/* Info grid: Assignee + Dates */}
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <div className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider flex items-center gap-1.5">
                        <User className="h-3 w-3" />
                        負責人
                      </div>
                      <div className="flex items-center gap-2">
                        <Avatar className="h-6 w-6">
                          <AvatarFallback className={cn('text-sm text-white', getAvatarColor(task.assignee))}>
                            {task.assignee.split(' ').map(n => n[0]).join('')}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm font-medium">{task.assignee}</span>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <div className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider flex items-center gap-1.5">
                        <Calendar className="h-3 w-3" />
                        開始日期
                      </div>
                      <span className="text-sm font-medium">{new Date(task.startDate).toLocaleDateString('zh-TW')}</span>
                    </div>
                    <div className="space-y-1.5">
                      <div className={cn(
                        'text-[11px] font-medium uppercase tracking-wider flex items-center gap-1.5',
                        isOverdue ? 'text-destructive/70' : 'text-muted-foreground/70',
                      )}>
                        <Flag className="h-3 w-3" />
                        結束日期
                      </div>
                      <span className={cn('text-sm font-medium', isOverdue && 'text-destructive')}>
                        {new Date(task.endDate).toLocaleDateString('zh-TW')}
                      </span>
                    </div>
                  </div>
                  {task.completedAt && (
                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-1.5">
                        <div className="text-[11px] font-medium text-emerald-600/70 dark:text-emerald-400/70 uppercase tracking-wider flex items-center gap-1.5">
                          <CheckCircle2 className="h-3 w-3" />
                          完成日期
                        </div>
                        <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                          {new Date(task.completedAt).toLocaleDateString('zh-TW')}
                        </span>
                      </div>
                      {task.completedBy && (
                        <div className="space-y-1.5">
                          <div className="text-[11px] font-medium text-emerald-600/70 dark:text-emerald-400/70 uppercase tracking-wider flex items-center gap-1.5">
                            <User className="h-3 w-3" />
                            完成者
                          </div>
                          <span className="text-sm font-medium">{task.completedBy}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Upstream tasks */}
                  {upstreamTasks.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="h-5 w-5 rounded flex items-center justify-center bg-blue-100 dark:bg-blue-900/30">
                          <ArrowLeft className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                        </div>
                        <span className="text-sm font-medium text-muted-foreground">前置任務</span>
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
                        <span className="text-sm font-medium text-muted-foreground">後續任務</span>
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
                      延遲影響分析
                    </h4>

                    {impact.totalDelayChain === 0 ? (
                      <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900">
                        <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
                          <CheckCircle2 className="h-4 w-4" />
                          <span className="font-medium">此任務延遲不會影響其他任務</span>
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
          ) : readOnly ? (
            /* Read-only: show info directly without tabs */
            <div className="flex-1 min-h-0 overflow-y-auto">
              <div className="px-6 py-4 space-y-4">
                {/* Description */}
                {task.description && (
                  <div className="p-3 rounded-xl bg-muted/30 border border-border/50">
                    <p className="text-sm text-muted-foreground leading-relaxed">{task.description}</p>
                  </div>
                )}

                {/* Info grid */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider flex items-center gap-1.5">
                      <User className="h-3 w-3" />
                      負責人
                    </div>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-6 w-6">
                        <AvatarFallback className={cn('text-sm text-white', getAvatarColor(task.assignee))}>
                          {task.assignee.split(' ').map(n => n[0]).join('')}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-medium">{task.assignee}</span>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider flex items-center gap-1.5">
                      <Calendar className="h-3 w-3" />
                      開始日期
                    </div>
                    <span className="text-sm font-medium">{new Date(task.startDate).toLocaleDateString('zh-TW')}</span>
                  </div>
                  <div className="space-y-1.5">
                    <div className={cn(
                      'text-[11px] font-medium uppercase tracking-wider flex items-center gap-1.5',
                      isOverdue ? 'text-destructive/70' : 'text-muted-foreground/70',
                    )}>
                      <Flag className="h-3 w-3" />
                      結束日期
                    </div>
                    <span className={cn('text-sm font-medium', isOverdue && 'text-destructive')}>
                      {new Date(task.endDate).toLocaleDateString('zh-TW')}
                    </span>
                  </div>
                </div>

                {/* Dependencies */}
                {upstreamTasks.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="h-5 w-5 rounded flex items-center justify-center bg-blue-100 dark:bg-blue-900/30">
                        <ArrowLeft className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                      </div>
                      <span className="text-sm font-medium text-muted-foreground">前置任務</span>
                    </div>
                    <div className="space-y-1.5 ml-7">
                      {upstreamTasks.map(({ task: dep, status: depStatus }) => (
                        <div key={dep.id} className="flex items-center gap-2.5 text-sm py-2 px-3 rounded-lg bg-muted/30 border border-border/50">
                          {getStatusDot(depStatus)}
                          <span className="flex-1 truncate">{dep.title}</span>
                          {getComputedStatusBadge(depStatus)}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {downstreamTasks.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="h-5 w-5 rounded flex items-center justify-center bg-purple-100 dark:bg-purple-900/30">
                        <ArrowRight className="h-3 w-3 text-purple-600 dark:text-purple-400" />
                      </div>
                      <span className="text-sm font-medium text-muted-foreground">後續任務</span>
                    </div>
                    <div className="space-y-1.5 ml-7">
                      {downstreamTasks.map(({ task: dep, status: depStatus }) => (
                        <div key={dep.id} className="flex items-center gap-2.5 text-sm py-2 px-3 rounded-lg bg-muted/30 border border-border/50">
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
                    延遲影響分析
                  </h4>

                  {impact.totalDelayChain === 0 ? (
                    <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900">
                      <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
                        <CheckCircle2 className="h-4 w-4" />
                        <span className="font-medium">此任務延遲不會影響其他任務</span>
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
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
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
                <Label className="text-sm text-muted-foreground">建議新日期</Label>
                <input
                  type="date"
                  value={extensionDate}
                  onChange={e => setExtensionDate(e.target.value)}
                  className="w-full text-sm border rounded-lg px-2.5 py-1.5 mt-1.5 bg-background"
                />
              </div>
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
                  disabled={!extensionReason.trim()}
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
    </>
  )
}
