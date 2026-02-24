'use client'

import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
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
import { useAuth } from '@/lib/auth-context'
import { type Task, type TaskLog, type SubTask } from '@/lib/mock-data'
import {
  computeTaskStatus,
  getStatusLabel,
  getStatusColor,
  getDaysUntilDeadline,
  type ComputedTaskStatus,
} from '@/lib/task-utils'
import { cn } from '@/lib/utils'
import {
  AlertTriangle,
  Calendar,
  Send,
  CalendarClock,
  CircleCheck,
  Undo2,
  ChevronDown,
  CheckCircle2,
  Clock,
  AlertCircle,
  ListChecks,
  ArrowRight,
  ArrowLeft,
  Info,
  Mic,
  MicOff,
  ImagePlus,
  Paperclip,
  Loader2,
  Pencil,
  Trash2,
  Check,
  X,
  Plus,
} from 'lucide-react'

/** Add one day to a YYYY-MM-DD string */
function addOneDayStr(dateStr: string) {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + 1)
  return d.toISOString().split('T')[0]
}

/** Compute day difference between two YYYY-MM-DD strings (b - a) */
function dayDiff(a: string, b: string) {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24))
}

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

function getStatusBadge(status: ComputedTaskStatus) {
  return (
    <Badge className={cn('text-xs px-2 py-0.5 shrink-0', getStatusColor(status))}>
      {getStatusLabel(status)}
    </Badge>
  )
}

interface MilestoneTaskGroup {
  milestoneId: string
  milestoneName: string
  milestoneDueDate: string
  tasks: Task[]
}

interface MyTasksProject {
  id: string
  name: string
  startDate?: string
  userRole?: string
  milestones: { id: string; name: string; dueDate: string; status: string; progress: number; sortOrder?: number }[]
  tasks: Task[]
  taskLogs: TaskLog[]
  pendingDelayMilestoneIds?: string[]
  pendingDelayProposedDates?: Record<string, string>
}

export default function MyTasksPage() {
  const { user } = useAuth()

  const [apiProjects, setApiProjects] = useState<MyTasksProject[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all')
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set())
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogTask, setDialogTask] = useState<{ task: Task; project: MyTasksProject } | null>(null)
  const [logContent, setLogContent] = useState('')
  const [logDate, setLogDate] = useState(() => new Date().toISOString().split('T')[0])
  const [showExtensionForm, setShowExtensionForm] = useState(false)
  const [extensionReason, setExtensionReason] = useState('')
  const [extensionDate, setExtensionDate] = useState('')
  const [extensionSupport, setExtensionSupport] = useState('')
  const [showActions, setShowActions] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [attachments, setAttachments] = useState<string[]>([])
  const [editingLogId, setEditingLogId] = useState<string | null>(null)
  const [editLogContent, setEditLogContent] = useState('')
  const [editLogDate, setEditLogDate] = useState('')
  const [deletingLog, setDeletingLog] = useState<TaskLog | null>(null)
  const [msDateDialogOpen, setMsDateDialogOpen] = useState(false)
  const [msDateDialogData, setMsDateDialogData] = useState<{
    milestoneId: string
    milestoneName: string
    projectId: string
    projectName: string
    currentStartDate: string
    currentDueDate: string
    nextMilestoneDueDate: string | null
    nextMilestoneName: string | null
    proposedDate: string
  } | null>(null)
  const [addingSubtask, setAddingSubtask] = useState(false)
  const [subtaskTitle, setSubtaskTitle] = useState('')
  const [subtaskAssignee, setSubtaskAssignee] = useState('')
  const recognitionRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)

  // Fetch tasks from API
  useEffect(() => {
    if (!user) return
    setLoading(true)
    fetch(`/api/my-tasks?userId=${user.id}&userEmail=${encodeURIComponent(user.email)}`)
      .then(res => res.ok ? res.json() : Promise.reject())
      .then(data => setApiProjects(data.projects ?? []))
      .catch(() => setApiProjects([]))
      .finally(() => setLoading(false))
  }, [user])

  // Build grouped data: project → milestone groups → tasks
  const projectGroups = useMemo(() => {
    if (!user) return []
    const result: { project: MyTasksProject; milestoneGroups: MilestoneTaskGroup[]; completedCount: number; totalCount: number; isPM: boolean }[] = []

    apiProjects.forEach(p => {
      const isPM = p.userRole === 'pm'
      // PM sees all top-level tasks; members see only their assigned tasks
      const visibleTasks = isPM
        ? p.tasks.filter(t => !t.parentId)
        : p.tasks.filter(t => t.assignee === user.name && !t.parentId)
      if (visibleTasks.length === 0 && !isPM) return
      // PM can see projects with milestones even if no tasks yet
      if (visibleTasks.length === 0 && isPM && p.milestones.length === 0) return

      const milestoneMap = new Map<string, Task[]>()
      visibleTasks.forEach(t => {
        const arr = milestoneMap.get(t.milestoneId) || []
        arr.push(t)
        milestoneMap.set(t.milestoneId, arr)
      })

      // For PM, include milestones even if they have no tasks
      const milestoneGroups: MilestoneTaskGroup[] = []
      if (isPM) {
        p.milestones.forEach(m => {
          milestoneGroups.push({
            milestoneId: m.id,
            milestoneName: m.name,
            milestoneDueDate: m.dueDate,
            tasks: milestoneMap.get(m.id) || [],
          })
        })
      } else {
        milestoneMap.forEach((tasks, milestoneId) => {
          const milestone = p.milestones.find(m => m.id === milestoneId)
          if (!milestone) return
          milestoneGroups.push({
            milestoneId,
            milestoneName: milestone.name,
            milestoneDueDate: milestone.dueDate,
            tasks,
          })
        })
      }

      milestoneGroups.sort((a, b) => new Date(a.milestoneDueDate).getTime() - new Date(b.milestoneDueDate).getTime())

      const completedCount = visibleTasks.filter(t => !!t.completedAt).length
      result.push({ project: p, milestoneGroups, completedCount, totalCount: visibleTasks.length, isPM })
    })

    return result
  }, [apiProjects, user])

  const userProjects = projectGroups.map(g => g.project)

  const filteredGroups = selectedProjectId === 'all'
    ? projectGroups
    : projectGroups.filter(g => g.project.id === selectedProjectId)

  // Stats
  const allTasks = projectGroups.flatMap(g => g.milestoneGroups.flatMap(m => m.tasks))
  const totalTasks = allTasks.length
  const completedCount = allTasks.filter(t => !!t.completedAt).length
  const atRiskCount = projectGroups.flatMap(g =>
    g.milestoneGroups.flatMap(m =>
      m.tasks.filter(t => {
        const s = computeTaskStatus(t, g.project.taskLogs)
        return s === 'at-risk' || s === 'overdue' || s === 'overdue-not-started'
      })
    )
  ).length
  const onTrackCount = totalTasks - completedCount - atRiskCount

  const toggleProject = (projectId: string) => {
    setCollapsedProjects(prev => {
      const next = new Set(prev)
      if (next.has(projectId)) next.delete(projectId)
      else next.add(projectId)
      return next
    })
  }

  const openTaskDialog = (task: Task, project: MyTasksProject) => {
    setDialogTask({ task, project })
    setLogContent('')
    setLogDate(new Date().toISOString().split('T')[0])
    setShowExtensionForm(false)
    setExtensionReason('')
    setExtensionDate('')
    setExtensionSupport('')
    setShowActions(false)
    setAttachments([])
    setIsListening(false)
    setEditingLogId(null)
    setAddingSubtask(false)
    setSubtaskTitle('')
    setSubtaskAssignee('')
    setDialogOpen(true)
  }

  // Voice input using Web Speech API
  const toggleVoiceInput = useCallback(() => {
    if (isListening) {
      setIsListening(false)
      if (recognitionRef.current) {
        clearTimeout(recognitionRef.current)
        recognitionRef.current = null
      }
      // @ts-expect-error SpeechRecognition not typed
      window._speechRecognition?.stop()
      return
    }
    const SpeechRecognition = (window as unknown as Record<string, unknown>).SpeechRecognition || (window as unknown as Record<string, unknown>).webkitSpeechRecognition
    if (!SpeechRecognition) {
      alert('您的瀏覽器不支援語音輸入')
      return
    }
    // @ts-expect-error SpeechRecognition constructor
    const recognition = new SpeechRecognition()
    recognition.lang = 'zh-TW'
    recognition.continuous = true
    recognition.interimResults = true
    // @ts-expect-error assign to window
    window._speechRecognition = recognition
    recognition.onresult = (event: Record<string, unknown>) => {
      const results = event.results as SpeechRecognitionResultList
      let transcript = ''
      for (let i = 0; i < results.length; i++) {
        transcript += results[i][0].transcript
      }
      setLogContent(prev => {
        const base = prev.replace(/\[語音輸入中...\]$/, '').trimEnd()
        return base ? `${base} ${transcript}` : transcript
      })
    }
    recognition.onend = () => setIsListening(false)
    recognition.onerror = () => setIsListening(false)
    recognition.start()
    setIsListening(true)
  }, [isListening])

  // ── PM: Submit milestone date change as a delay request ──
  const handleMilestoneDateChange = async () => {
    if (!msDateDialogData || !user) return
    const { milestoneId, milestoneName, projectId, currentDueDate, proposedDate } = msDateDialogData
    if (proposedDate === currentDueDate) {
      setMsDateDialogOpen(false)
      setMsDateDialogData(null)
      return
    }

    try {
      const res = await fetch('/api/delay-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          requesterId: user.id,
          type: 'date_change',
          reason: `PM 調整里程碑「${milestoneName}」預定日期：${currentDueDate} → ${proposedDate}`,
          canCatchUp: true,
          affectedMilestones: [{
            milestoneId,
            originalDate: currentDueDate,
            proposedDate,
          }],
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || '送出失敗')
      }
      // Optimistic update
      setApiProjects(prev => prev.map(p =>
        p.id === projectId
          ? {
              ...p,
              pendingDelayMilestoneIds: [...(p.pendingDelayMilestoneIds || []), milestoneId],
              pendingDelayProposedDates: { ...(p.pendingDelayProposedDates || {}), [milestoneId]: proposedDate },
            }
          : p
      ))
    } catch (err) {
      alert(err instanceof Error ? err.message : '送出延期申請失敗')
    }
    setMsDateDialogOpen(false)
    setMsDateDialogData(null)
  }

  // ── Add subtask to a parent task ──
  const handleAddSubtask = async () => {
    if (!dialogTask || !subtaskTitle.trim()) return
    const { project, task } = dialogTask

    try {
      const res = await fetch(`/api/projects/${project.id}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          milestoneId: task.milestoneId,
          parentId: task.id,
          title: subtaskTitle.trim(),
          assignee: subtaskAssignee.trim() || task.assignee,
          priority: 'medium',
          startDate: task.startDate,
          endDate: task.endDate,
          durationWeeks: 1,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || '新增子任務失敗')
      }
      const newSubtask = await res.json()
      // Optimistic update
      setApiProjects(prev => prev.map(p =>
        p.id === project.id
          ? {
              ...p,
              tasks: p.tasks.map(t =>
                t.id === task.id
                  ? { ...t, subtasks: [...(t.subtasks || []), { ...newSubtask, status: newSubtask.status === 'in_progress' ? 'in-progress' : newSubtask.status }] }
                  : t
              ),
            }
          : p
      ))
      setSubtaskTitle('')
      setSubtaskAssignee('')
      setAddingSubtask(false)
    } catch (err) {
      alert(err instanceof Error ? err.message : '新增子任務失敗')
    }
  }

  if (!user) return null

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'file') => {
    const files = e.target.files
    if (!files) return
    const names = Array.from(files).map(f => `${type === 'image' ? '📷' : '📎'} ${f.name}`)
    setAttachments(prev => [...prev, ...names])
    e.target.value = ''
  }

  const handleSubmitLog = async () => {
    if (!dialogTask || !logContent.trim()) return
    const content = attachments.length > 0
      ? `${logContent.trim()}\n\n附件：${attachments.join('、')}`
      : logContent.trim()

    try {
      const res = await fetch(`/api/projects/${dialogTask.project.id}/task-logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: dialogTask.task.id,
          userId: user.id,
          logDate,
          content,
        }),
      })
      if (!res.ok) throw new Error()
      const newLog: TaskLog = await res.json()
      // Optimistic update: add the new log to local state
      setApiProjects(prev => prev.map(p =>
        p.id === dialogTask.project.id
          ? { ...p, taskLogs: [newLog, ...p.taskLogs] }
          : p
      ))
    } catch {
      // Silently fail — log will appear on next reload
    }

    setLogContent('')
    setAttachments([])
    setShowActions(true)
  }

  const handleStartEditLog = (log: TaskLog) => {
    setEditingLogId(log.id)
    setEditLogContent(log.content)
    setEditLogDate(log.logDate)
  }

  const handleCancelEditLog = () => {
    setEditingLogId(null)
    setEditLogContent('')
    setEditLogDate('')
  }

  const handleSaveEditLog = async (log: TaskLog) => {
    if (!dialogTask || !editLogContent.trim()) return
    try {
      const res = await fetch(`/api/projects/${log.projectId}/task-logs/${log.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editLogContent.trim(), logDate: editLogDate }),
      })
      if (!res.ok) throw new Error()
      const updated: TaskLog = await res.json()
      setApiProjects(prev => prev.map(p =>
        p.id === log.projectId
          ? { ...p, taskLogs: p.taskLogs.map(tl => tl.id === log.id ? updated : tl) }
          : p
      ))
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
      setApiProjects(prev => prev.map(p =>
        p.id === log.projectId
          ? { ...p, taskLogs: p.taskLogs.filter(tl => tl.id !== log.id) }
          : p
      ))
    } catch {
      // fail silently
    }
  }

  const handleCompleteTask = async () => {
    if (!dialogTask) return
    const { project, task } = dialogTask
    const now = new Date().toISOString().split('T')[0]
    try {
      const res = await fetch(`/api/projects/${project.id}/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'done' as const, progress: 100, completedBy: user.name }),
      })
      if (!res.ok) throw new Error()
      // Optimistic update
      setApiProjects(prev => prev.map(p =>
        p.id === project.id
          ? {
              ...p,
              tasks: p.tasks.map(t =>
                t.id === task.id
                  ? { ...t, status: 'done' as const, progress: 100, completedAt: now, completedBy: user.name }
                  : t
              ),
            }
          : p
      ))
    } catch {
      // ignore
    }
  }

  const handleUncompleteTask = async () => {
    if (!dialogTask) return
    const { project, task } = dialogTask
    try {
      const res = await fetch(`/api/projects/${project.id}/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'in_progress', progress: 0 }),
      })
      if (!res.ok) throw new Error()
      // Optimistic update
      setApiProjects(prev => prev.map(p =>
        p.id === project.id
          ? {
              ...p,
              tasks: p.tasks.map(t =>
                t.id === task.id
                  ? { ...t, status: 'in-progress' as const, progress: 0, completedAt: undefined, completedBy: undefined }
                  : t
              ),
            }
          : p
      ))
    } catch {
      // ignore
    }
  }

  const handleSubmitExtension = async () => {
    if (!dialogTask || !user) return
    const { task, project } = dialogTask
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
      // Update local state to mark milestone as pending delay
      const proposedDate = extensionDate || milestone.dueDate
      setApiProjects(prev => prev.map(p =>
        p.id === project.id
          ? {
              ...p,
              pendingDelayMilestoneIds: [...(p.pendingDelayMilestoneIds || []), milestone.id],
              pendingDelayProposedDates: { ...(p.pendingDelayProposedDates || {}), [milestone.id]: proposedDate },
            }
          : p
      ))
      setShowExtensionForm(false)
      setShowActions(true)
      setExtensionReason('')
      setExtensionDate('')
      setExtensionSupport('')
    } catch (err) {
      alert(err instanceof Error ? err.message : '送出延期申請失敗')
    }
  }

  // Fresh task data for dialog
  const currentDialogTask = dialogTask
    ? apiProjects.find(p => p.id === dialogTask.project.id)?.tasks.find(t => t.id === dialogTask.task.id)
    : null
  const currentDialogProject = dialogTask
    ? apiProjects.find(p => p.id === dialogTask.project.id)
    : null

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">載入任務中...</p>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="space-y-4">
        {/* Page Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">我的任務</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {user.name} 的任務總覽
            {projectGroups.some(g => g.isPM) && (
              <span className="ml-2 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">PM 管理模式</span>
            )}
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-muted-foreground">總任務</span>
              <ListChecks className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="text-2xl font-bold">{totalTasks}</div>
            <p className="text-sm text-muted-foreground mt-1">{userProjects.length} 個專案</p>
          </Card>
          <Card className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-muted-foreground">已完成</span>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            </div>
            <div className="text-2xl font-bold text-green-600">{completedCount}</div>
            <p className="text-sm text-muted-foreground mt-1">
              {totalTasks > 0 ? Math.round((completedCount / totalTasks) * 100) : 0}% 完成率
            </p>
          </Card>
          <Card className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-muted-foreground">進行中</span>
              <Clock className="h-4 w-4 text-blue-500" />
            </div>
            <div className="text-2xl font-bold text-blue-600">{onTrackCount}</div>
            <p className="text-sm text-muted-foreground mt-1">正常進行</p>
          </Card>
          <Card className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-muted-foreground">需注意</span>
              <AlertCircle className="h-4 w-4 text-amber-500" />
            </div>
            <div className="text-2xl font-bold text-amber-600">{atRiskCount}</div>
            <p className="text-sm text-muted-foreground mt-1">逾期未開始、即將到期或逾期</p>
          </Card>
        </div>

        {/* Project Filter */}
        {userProjects.length > 1 && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setSelectedProjectId('all')}
              className={cn(
                'text-sm px-3 py-1 rounded-full border transition-all',
                selectedProjectId === 'all'
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-muted-foreground border-border hover:bg-muted',
              )}
            >
              全部專案
            </button>
            {userProjects.map(project => (
              <button
                key={project.id}
                onClick={() => setSelectedProjectId(project.id)}
                className={cn(
                  'text-sm px-3 py-1 rounded-full border transition-all',
                  selectedProjectId === project.id
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background text-muted-foreground border-border hover:bg-muted',
                )}
              >
                {project.name}
              </button>
            ))}
          </div>
        )}

        {/* Project Cards — 3 per row */}
        {filteredGroups.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">
            目前沒有指派給您的任務
          </Card>
        ) : (
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {filteredGroups.map(({ project, milestoneGroups, completedCount: pCompleted, totalCount: pTotal, isPM }) => {
              const isCollapsed = collapsedProjects.has(project.id)

              return (
                <Card key={project.id} className="flex flex-col">
                  {/* Project Header */}
                  <CardHeader
                    className="py-3 px-4 flex flex-row items-center justify-between cursor-pointer hover:bg-muted/30 transition-colors"
                    onClick={() => toggleProject(project.id)}
                  >
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <ChevronDown className={cn(
                        'h-4 w-4 text-muted-foreground transition-transform',
                        isCollapsed && '-rotate-90',
                      )} />
                      {project.name}
                      {isPM && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">PM</Badge>}
                    </CardTitle>
                    <span className="text-sm text-muted-foreground">{pCompleted}/{pTotal}</span>
                  </CardHeader>

                  {!isCollapsed && (
                    <CardContent className="px-4 pb-3 pt-0 flex-1">
                      <div className="divide-y divide-border">
                      {milestoneGroups.map(mg => {
                        const milestone = project.milestones.find(m => m.id === mg.milestoneId)
                        const msPendingDelay = (project.pendingDelayMilestoneIds || []).includes(mg.milestoneId)

                        return (
                        <div key={mg.milestoneId} className="py-2 first:pt-0 last:pb-0">
                          {/* Milestone label */}
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-sm font-medium text-muted-foreground">{mg.milestoneName}</span>
                            {isPM && milestone ? (
                              <>
                                <span className="text-[10px] font-mono text-muted-foreground">
                                  {new Date(mg.milestoneDueDate).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })}
                                </span>
                                {msPendingDelay ? (
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-300 bg-amber-50 text-amber-600 dark:border-amber-700 dark:bg-amber-950/20">
                                    審核中
                                  </Badge>
                                ) : (
                                  <button
                                    onClick={e => {
                                      e.stopPropagation()
                                      const sortedMs = [...project.milestones].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
                                      const msIdx = sortedMs.findIndex(m => m.id === mg.milestoneId)
                                      const msStartDate = msIdx > 0
                                        ? addOneDayStr(sortedMs[msIdx - 1].dueDate)
                                        : (project.startDate || sortedMs[0]?.dueDate || '')
                                      const nextMs = msIdx >= 0 && msIdx < sortedMs.length - 1 ? sortedMs[msIdx + 1] : null
                                      setMsDateDialogData({
                                        milestoneId: mg.milestoneId,
                                        milestoneName: mg.milestoneName,
                                        projectId: project.id,
                                        projectName: project.name,
                                        currentStartDate: msStartDate,
                                        currentDueDate: milestone.dueDate,
                                        nextMilestoneDueDate: nextMs?.dueDate ?? null,
                                        nextMilestoneName: nextMs?.name ?? null,
                                        proposedDate: milestone.dueDate,
                                      })
                                      setMsDateDialogOpen(true)
                                    }}
                                    className="inline-flex items-center gap-0.5 text-[10px] text-primary/70 hover:text-primary transition-colors group"
                                    title="提出延期申請（需審核）"
                                  >
                                    <Pencil className="h-3 w-3" />
                                    <span className="group-hover:underline">提出延期</span>
                                  </button>
                                )}
                                {milestone.progress > 0 && (
                                  <span className="text-[10px] text-muted-foreground">{milestone.progress}%</span>
                                )}
                              </>
                            ) : (
                              <Badge variant="outline" className="text-[10px] font-mono px-1">
                                {new Date(mg.milestoneDueDate).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })}
                              </Badge>
                            )}
                          </div>

                          {/* Tasks — compact lines */}
                          <div className="divide-y divide-border/40">
                            {mg.tasks.map(task => {
                              const status = computeTaskStatus(task, project.taskLogs)
                              const days = getDaysUntilDeadline(task)
                              const isCompleted = !!task.completedAt
                              const taskPendingDelay = (project.pendingDelayMilestoneIds || []).includes(task.milestoneId)

                              return (
                                <button
                                  key={task.id}
                                  onClick={() => openTaskDialog(task, project)}
                                  className="w-full flex items-center gap-2 px-1 py-1.5 text-left transition-colors hover:bg-muted/40 rounded-sm"
                                >
                                  {getStatusDot(status)}
                                  <span className={cn(
                                    'text-sm flex-1 min-w-0 truncate',
                                    isCompleted && 'text-muted-foreground',
                                  )}>
                                    {task.title}
                                  </span>
                                  {/* PM view: show assignee */}
                                  {isPM && task.assignee && (
                                    <span className="text-[11px] text-muted-foreground shrink-0 max-w-[60px] truncate">
                                      {task.assignee}
                                    </span>
                                  )}
                                  {taskPendingDelay && (status === 'overdue' || status === 'overdue-not-started') ? (
                                    <span className="text-sm text-amber-600 font-medium shrink-0">
                                      延期申請中
                                    </span>
                                  ) : status === 'overdue' ? (
                                    <span className="text-sm text-destructive font-medium shrink-0">
                                      逾期{Math.abs(days)}天
                                    </span>
                                  ) : status === 'overdue-not-started' ? (
                                    <span className="text-sm text-orange-600 font-medium shrink-0">
                                      逾期未開始
                                    </span>
                                  ) : null}
                                  {status === 'at-risk' && (
                                    <span className="text-sm text-amber-600 font-medium shrink-0">
                                      剩{days}天
                                    </span>
                                  )}
                                  {isCompleted && (
                                    <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
                                  )}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                        )
                      })}
                      </div>
                    </CardContent>
                  )}
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {/* Task Dialog — Tab-based */}
      <Dialog open={dialogOpen} onOpenChange={(open) => {
        setDialogOpen(open)
        if (!open) setShowExtensionForm(false)
      }}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
          {currentDialogTask && currentDialogProject && (() => {
            const task = currentDialogTask
            const project = currentDialogProject
            const status = computeTaskStatus(task, project.taskLogs)
            const days = getDaysUntilDeadline(task)
            const isCompleted = !!task.completedAt
            const milestone = project.milestones.find(m => m.id === task.milestoneId)
            const taskLogs = project.taskLogs
              .filter(l => l.taskId === task.id)
              .sort((a, b) => new Date(b.logDate).getTime() - new Date(a.logDate).getTime())

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

            // Check if this task's milestone has a pending delay request
            const hasPendingDelay = (project.pendingDelayMilestoneIds || []).includes(task.milestoneId)
            const pendingProposedDate = (project.pendingDelayProposedDates || {})[task.milestoneId]

            // Badge text with days info
            const badgeText = (() => {
              if (isCompleted) return '已完成'
              if (hasPendingDelay && (status === 'overdue' || status === 'overdue-not-started')) return '延期申請中'
              if (status === 'overdue') return `逾期${Math.abs(days)}天`
              if (status === 'at-risk') return `剩${days}天`
              return getStatusLabel(status)
            })()

            return (
              <>
                {/* Header */}
                <div className="px-6 pt-5 pb-3">
                  <DialogHeader>
                    <div className="flex items-start gap-3">
                      <div className={cn(
                        'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                        isCompleted ? 'bg-green-100 text-green-600 dark:bg-green-950 dark:text-green-400' :
                        hasPendingDelay && (status === 'overdue' || status === 'overdue-not-started') ? 'bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400' :
                        status === 'overdue' ? 'bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400' :
                        status === 'overdue-not-started' ? 'bg-orange-100 text-orange-600 dark:bg-orange-950 dark:text-orange-400' :
                        status === 'at-risk' ? 'bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400' :
                        'bg-primary/10 text-primary'
                      )}>
                        {isCompleted ? <CheckCircle2 className="h-5 w-5" /> :
                         hasPendingDelay && (status === 'overdue' || status === 'overdue-not-started') ? <Clock className="h-5 w-5" /> :
                         status === 'overdue' ? <AlertTriangle className="h-5 w-5" /> :
                         status === 'overdue-not-started' ? <AlertTriangle className="h-5 w-5" /> :
                         status === 'at-risk' ? <AlertCircle className="h-5 w-5" /> :
                         <ListChecks className="h-5 w-5" />}
                      </div>
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                          <DialogTitle className={cn('text-base text-left leading-tight', isCompleted && 'text-muted-foreground')}>
                            {task.title}
                          </DialogTitle>
                          <Badge className={cn('text-xs px-2 py-0.5 shrink-0',
                            hasPendingDelay && (status === 'overdue' || status === 'overdue-not-started')
                              ? 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300'
                              : getStatusColor(status)
                          )}>
                            {badgeText}
                          </Badge>
                        </div>
                        <DialogDescription className="text-left text-sm">
                          <span className="text-muted-foreground">{project.name}</span>
                          {milestone && <span className="text-muted-foreground"> · {milestone.name}</span>}
                          <span className="text-muted-foreground"> · </span>
                          <span className="font-mono text-muted-foreground/80">
                            {new Date(task.startDate).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })}
                            {' ~ '}
                            {new Date(task.endDate).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })}
                          </span>
                        </DialogDescription>
                        {hasBlockedUpstream && (
                          <div className="flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400">
                            <div className="h-1 w-1 rounded-full bg-blue-500 animate-pulse" />
                            前置任務尚未完成
                          </div>
                        )}
                        {hasPendingDelay && pendingProposedDate && (
                          <div className="flex items-center gap-1.5 text-sm text-amber-600 dark:text-amber-400">
                            <div className="h-1 w-1 rounded-full bg-amber-500 animate-pulse" />
                            已申請延期至 {new Date(pendingProposedDate).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })}（等待審核）
                          </div>
                        )}
                      </div>
                    </div>
                  </DialogHeader>
                </div>

                {/* Hidden file inputs */}
                <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={e => handleFileSelect(e, 'image')} />
                <input ref={fileInputRef} type="file" className="hidden" onChange={e => handleFileSelect(e, 'file')} />

                {/* 3 Tabs — hidden when extension form is open */}
                {!showExtensionForm && <Tabs defaultValue="log" className="flex-1 flex flex-col min-h-0">
                  <div className="px-6 pt-1 pb-0 border-b">
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

                  {/* Tab: 工作紀錄 — input form + two-step flow */}
                  <TabsContent value="log" className="flex-1 overflow-y-auto px-6 mt-0">
                    <div className="py-4 space-y-4">
                      {isCompleted ? (
                        <div className="flex items-center gap-3 p-4 rounded-xl bg-green-50 border border-green-100 dark:bg-green-950/20 dark:border-green-900">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-100 dark:bg-green-900">
                            <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-green-700 dark:text-green-400">此任務已完成</p>
                            {task.completedAt && (
                              <p className="text-sm text-green-600/70 dark:text-green-400/70 mt-0.5">
                                完成於 {new Date(task.completedAt).toLocaleDateString('zh-TW')}
                              </p>
                            )}
                          </div>
                        </div>
                      ) : !showActions ? (
                        /* Step 1: Input form */
                        showExtensionForm ? (
                          /* When extension form is open, hide input area */
                          null
                        ) : (
                          <>
                            <div className="flex items-center gap-2">
                              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-sm text-muted-foreground">填寫日期</span>
                              <input
                                type="date"
                                value={logDate}
                                onChange={e => setLogDate(e.target.value)}
                                className="text-sm border rounded-lg px-2.5 py-1.5 bg-background"
                              />
                            </div>

                            {/* Editable chat-style input box */}
                            <>
                              <div className={cn(
                                'rounded-xl border bg-muted/30 transition-colors overflow-hidden',
                                isListening && 'border-red-400 ring-2 ring-red-100 dark:ring-red-900/30',
                                !isListening && 'border-muted-foreground/20 focus-within:border-primary/40 focus-within:bg-background'
                              )}>
                                <Textarea
                                  placeholder="描述您今天做了什麼..."
                                  value={logContent}
                                  onChange={e => setLogContent(e.target.value)}
                                  rows={3}
                                  className="text-sm resize-none border-0 bg-transparent shadow-none focus-visible:ring-0 rounded-none"
                                />

                                {/* Attachments inside box */}
                                {attachments.length > 0 && (
                                  <div className="flex flex-wrap gap-1.5 px-3 pb-2">
                                    {attachments.map((name, i) => (
                                      <Badge key={i} variant="secondary" className="text-sm gap-1 rounded-md py-0.5">
                                        {name}
                                        <button
                                          onClick={() => setAttachments(prev => prev.filter((_, j) => j !== i))}
                                          className="ml-0.5 text-muted-foreground hover:text-foreground"
                                        >
                                          ×
                                        </button>
                                      </Badge>
                                    ))}
                                  </div>
                                )}

                                {/* Toolbar inside box */}
                                <div className="flex items-center justify-between px-2 py-1.5 border-t border-border/40">
                                  <div className="flex items-center gap-0.5">
                                    <button
                                      type="button"
                                      onClick={toggleVoiceInput}
                                      className={cn(
                                        'p-1.5 rounded-md transition-all',
                                        isListening
                                          ? 'bg-red-100 text-red-600 animate-pulse dark:bg-red-900/50'
                                          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                                      )}
                                      title={isListening ? '停止語音' : '語音輸入'}
                                    >
                                      {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => imageInputRef.current?.click()}
                                      className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                                      title="上傳圖片"
                                    >
                                      <ImagePlus className="h-4 w-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => fileInputRef.current?.click()}
                                      className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                                      title="上傳檔案"
                                    >
                                      <Paperclip className="h-4 w-4" />
                                    </button>
                                  </div>
                                  <Button
                                    size="sm"
                                    className="gap-1.5 rounded-lg shadow-sm h-7 px-3 text-sm"
                                    disabled={!logContent.trim()}
                                    onClick={handleSubmitLog}
                                  >
                                    <Send className="h-3 w-3" />
                                    提交
                                  </Button>
                                </div>
                              </div>

                              {/* Skip button */}
                              <div className="flex justify-end">
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  className="gap-1.5 text-sm"
                                  onClick={() => setShowActions(true)}
                                >
                                  跳過，直接操作
                                  <ArrowRight className="h-3 w-3" />
                                </Button>
                              </div>
                            </>
                          </>
                        )
                      ) : (
                        /* Step 2: Action buttons (after submit/skip) */
                        <div className="space-y-3 animate-in fade-in slide-in-from-bottom-3 duration-300">
                          <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                            <CheckCircle2 className="h-4 w-4 shrink-0" />
                            <span>紀錄已提交，請選擇下一步操作</span>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <button
                              className="group flex items-center gap-3 p-3 rounded-xl border border-primary/30 bg-primary/5 hover:bg-primary/10 transition-all text-left"
                              onClick={handleCompleteTask}
                            >
                              <CircleCheck className="h-5 w-5 shrink-0 text-primary" />
                              <div>
                                <p className="text-sm font-medium">標記完成</p>
                                <p className="text-[11px] text-muted-foreground">已完成所有工作</p>
                              </div>
                            </button>

                            {(status === 'at-risk' || status === 'overdue' || status === 'overdue-not-started') ? (
                              hasPendingDelay ? (
                                <div
                                  className="flex items-center gap-3 p-3 rounded-xl border border-amber-300 bg-amber-50/50 dark:border-amber-700 dark:bg-amber-950/20 text-left opacity-70"
                                >
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
                                onClick={() => setDialogOpen(false)}
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
                      <div className="py-4 max-h-[320px] overflow-y-auto">
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
                                  /* ── Inline edit mode ── */
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
                                    />
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
                                  /* ── Display mode ── */
                                  <div className="space-y-1">
                                    <div className="flex items-center justify-between">
                                      <span className="text-sm font-medium">{log.author}</span>
                                      <div className="flex items-center gap-1">
                                        {log.author === user.name && (
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
                      {task.description && (
                        <div className="p-3 rounded-xl bg-muted/30 border border-border/50">
                          <p className="text-sm text-muted-foreground leading-relaxed">{task.description}</p>
                        </div>
                      )}

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
                                {getStatusBadge(depStatus)}
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
                                {getStatusBadge(depStatus)}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Subtasks */}
                      {!task.parentId && (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <div className="h-5 w-5 rounded flex items-center justify-center bg-indigo-100 dark:bg-indigo-900/30">
                              <ListChecks className="h-3 w-3 text-indigo-600 dark:text-indigo-400" />
                            </div>
                            <span className="text-sm font-medium text-muted-foreground">子任務</span>
                            {task.subtasks && task.subtasks.length > 0 && (
                              <span className="text-xs text-muted-foreground">
                                {task.subtasks.filter(s => s.completedAt || s.status === 'done').length}/{task.subtasks.length}
                              </span>
                            )}
                          </div>
                          {task.subtasks && task.subtasks.length > 0 && (
                            <div className="space-y-1.5 ml-7">
                              {task.subtasks.map(sub => (
                                <div key={sub.id} className="flex items-center gap-2.5 text-sm py-2 px-3 rounded-lg bg-muted/30 border border-border/50">
                                  {getStatusDot(sub.status === 'done' ? 'completed' : sub.status === 'in-progress' ? 'on-track' : sub.status === 'blocked' ? 'overdue' : 'not-started')}
                                  <span className={cn('flex-1 truncate', sub.status === 'done' && 'text-muted-foreground')}>{sub.title}</span>
                                  {sub.assignee && <span className="text-[11px] text-muted-foreground">{sub.assignee}</span>}
                                  <Badge variant="outline" className="text-[10px] px-1">{sub.progress}%</Badge>
                                </div>
                              ))}
                            </div>
                          )}
                          {/* Add subtask form */}
                          {addingSubtask ? (
                            <div className="ml-7 space-y-2 p-3 rounded-lg border border-dashed border-border">
                              <input
                                type="text"
                                placeholder="子任務標題"
                                value={subtaskTitle}
                                onChange={e => setSubtaskTitle(e.target.value)}
                                className="w-full text-sm border rounded-lg px-2.5 py-1.5 bg-background"
                                autoFocus
                              />
                              <input
                                type="text"
                                placeholder="負責人（選填，預設為父任務負責人）"
                                value={subtaskAssignee}
                                onChange={e => setSubtaskAssignee(e.target.value)}
                                className="w-full text-sm border rounded-lg px-2.5 py-1.5 bg-background"
                              />
                              <div className="flex gap-2">
                                <Button size="sm" className="gap-1 text-sm h-7" disabled={!subtaskTitle.trim()} onClick={handleAddSubtask}>
                                  <Plus className="h-3 w-3" /> 新增
                                </Button>
                                <Button size="sm" variant="ghost" className="text-sm h-7" onClick={() => { setAddingSubtask(false); setSubtaskTitle(''); setSubtaskAssignee('') }}>
                                  取消
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="ml-7">
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1.5 text-sm h-7"
                                onClick={() => setAddingSubtask(true)}
                              >
                                <Plus className="h-3 w-3" /> 新增子任務
                              </Button>
                            </div>
                          )}
                        </div>
                      )}

                      {upstreamTasks.length === 0 && downstreamTasks.length === 0 && (!task.subtasks || task.subtasks.length === 0) && !!task.parentId && (
                        <div className="flex flex-col items-center justify-center py-8 text-center">
                          <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
                            <Info className="h-5 w-5 text-muted-foreground" />
                          </div>
                          <p className="text-sm text-muted-foreground">此任務無上下游依賴關係</p>
                        </div>
                      )}
                    </div>
                  </TabsContent>
                </Tabs>}

                {/* Extension Form (expandable) */}
                {showExtensionForm && (
                  <div className="px-6 py-4 border-t bg-amber-50/30 dark:bg-amber-950/10 space-y-3 animate-in slide-in-from-bottom-2 duration-200">
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

                {/* Bottom bar: only for completed tasks (undo) */}
                {isCompleted && (
                  <div className="px-6 py-3 border-t flex items-center bg-muted/20">
                    <Button size="sm" variant="ghost" className="gap-1.5 text-muted-foreground hover:text-foreground" onClick={handleUncompleteTask}>
                      <Undo2 className="h-3.5 w-3.5" />
                      取消完成
                    </Button>
                  </div>
                )}
              </>
            )
          })()}
        </DialogContent>
      </Dialog>

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

      {/* ── Milestone Date Change Dialog ── */}
      <Dialog open={msDateDialogOpen} onOpenChange={open => { if (!open) { setMsDateDialogOpen(false); setMsDateDialogData(null) } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-primary" />
              提出里程碑延期申請
            </DialogTitle>
            <DialogDescription>
              調整里程碑預定完成日期，送出後需經主管審核才會生效。
            </DialogDescription>
          </DialogHeader>
          {msDateDialogData && (() => {
            const { milestoneName, projectName, currentStartDate, currentDueDate, proposedDate, nextMilestoneDueDate, nextMilestoneName } = msDateDialogData
            const shift = dayDiff(currentDueDate, proposedDate)
            const willAffectNext = nextMilestoneDueDate
              ? new Date(proposedDate) >= new Date(nextMilestoneDueDate)
              : false
            const isNoChange = proposedDate === currentDueDate
            const isEarlier = shift < 0

            return (
              <div className="space-y-4">
                {/* Info section */}
                <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">專案</span>
                    <span className="font-medium">{projectName}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">里程碑</span>
                    <span className="font-medium">{milestoneName}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">目前區間</span>
                    <span className="font-mono text-xs">{currentStartDate} ~ {currentDueDate}</span>
                  </div>
                </div>

                {/* Date picker */}
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">新的預定完成日</Label>
                  <input
                    type="date"
                    value={proposedDate}
                    min={currentStartDate}
                    onChange={e => setMsDateDialogData(prev => prev ? { ...prev, proposedDate: e.target.value } : prev)}
                    className="w-full h-9 text-sm border rounded-md px-3 bg-background"
                  />
                </div>

                {/* Shift info */}
                {!isNoChange && (
                  <div className={cn(
                    'rounded-lg border p-3 space-y-1.5',
                    isEarlier ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/20' : 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20'
                  )}>
                    <div className="flex items-center gap-2 text-sm font-medium">
                      {isEarlier ? (
                        <ArrowLeft className="h-4 w-4 text-green-600" />
                      ) : (
                        <ArrowRight className="h-4 w-4 text-amber-600" />
                      )}
                      <span className={isEarlier ? 'text-green-700 dark:text-green-400' : 'text-amber-700 dark:text-amber-400'}>
                        {isEarlier ? `提前 ${Math.abs(shift)} 天` : `延後 ${shift} 天`}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {currentDueDate} <ArrowRight className="inline h-3 w-3 mx-0.5" /> {proposedDate}
                    </div>
                  </div>
                )}

                {/* Impact warning */}
                {willAffectNext && !isNoChange && (
                  <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/20 p-3">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                      <div className="space-y-0.5">
                        <p className="text-sm font-medium text-red-700 dark:text-red-400">將影響後續里程碑</p>
                        <p className="text-xs text-red-600/80 dark:text-red-400/70">
                          新的完成日已超過下一個里程碑「{nextMilestoneName}」的預定日（{nextMilestoneDueDate}），
                          審核通過後系統將自動順延後續里程碑與任務日期。
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {!willAffectNext && !isNoChange && shift > 0 && (
                  <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/20 p-3">
                    <div className="flex items-start gap-2">
                      <Info className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                      <p className="text-xs text-blue-600/80 dark:text-blue-400/70">
                        此延期不會影響後續里程碑，僅調整本里程碑的預定完成日。
                      </p>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex justify-end gap-2 pt-1">
                  <Button
                    variant="outline"
                    onClick={() => { setMsDateDialogOpen(false); setMsDateDialogData(null) }}
                  >
                    取消
                  </Button>
                  <Button
                    disabled={isNoChange}
                    onClick={handleMilestoneDateChange}
                  >
                    <Send className="h-4 w-4 mr-1.5" />
                    送出延期申請
                  </Button>
                </div>
              </div>
            )
          })()}
        </DialogContent>
      </Dialog>

    </DashboardLayout>
  )
}
