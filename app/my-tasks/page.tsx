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
import { type Task, type TaskLog, type TaskLogAttachment, type SubTask, type Project } from '@/lib/mock-data'
import { VoiceInputButton } from '@/components/voice-input-button'
import { ProjectEditDialog, type ProjectEditData } from '@/components/project-edit-dialog'
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
  ImagePlus,
  Paperclip,
  Loader2,
  Pencil,
  ChevronsUpDown,
  Trash2,
  Check,
  X,
  Plus,
  Settings2,
  Sparkles,
  FileText,
} from 'lucide-react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

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

/** Compute parent task progress as weighted average of subtask progress (by durationDays) */
function computeParentProgress(subtasks: SubTask[]): number {
  if (!subtasks || subtasks.length === 0) return -1 // -1 means no subtasks, use task's own progress
  const totalDays = subtasks.reduce((sum, s) => sum + (s.durationDays || 1), 0)
  if (totalDays === 0) return 0
  const weightedSum = subtasks.reduce((sum, s) => sum + (s.progress || 0) * (s.durationDays || 1), 0)
  return Math.round(weightedSum / totalDays)
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
  const [logContentInterim, setLogContentInterim] = useState('')
  const [attachments, setAttachments] = useState<TaskLogAttachment[]>([])
  const [uploadingFiles, setUploadingFiles] = useState(false)
  const [editingLogId, setEditingLogId] = useState<string | null>(null)
  const [editLogContent, setEditLogContent] = useState('')
  const [editLogDate, setEditLogDate] = useState('')
  const [editLogAttachments, setEditLogAttachments] = useState<TaskLogAttachment[]>([])
  const [editUploadingFiles, setEditUploadingFiles] = useState(false)
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
  // Inline subtask creation on card
  const [addingSubtaskForId, setAddingSubtaskForId] = useState<string | null>(null)
  const [inlineSubtaskTitle, setInlineSubtaskTitle] = useState('')
  const [inlineSubtaskDays, setInlineSubtaskDays] = useState(1)
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set())
  const [collapsedMilestones, setCollapsedMilestones] = useState<Set<string>>(new Set())
  // PM project edit dialog
  const [editProjectOpen, setEditProjectOpen] = useState(false)
  const [editProject, setEditProject] = useState<Project | null>(null)
  const [editProjectLoading, setEditProjectLoading] = useState<string | null>(null)
  const [importSubLogsOpen, setImportSubLogsOpen] = useState(false)
  const [importSubLogsLoading, setImportSubLogsLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const editFileInputRef = useRef<HTMLInputElement>(null)

  // Fetch tasks from API
  useEffect(() => {
    if (!user) return
    setLoading(true)
    fetch(`/api/my-tasks?userId=${user.id}&userEmail=${encodeURIComponent(user.email)}`)
      .then(res => res.ok ? res.json() : Promise.reject())
      .then(data => {
        const projects = data.projects ?? []
        setApiProjects(projects)
        // Default: all milestones collapsed
        const allMsIds = new Set<string>()
        for (const p of projects) {
          for (const m of p.milestones) allMsIds.add(m.id)
        }
        setCollapsedMilestones(allMsIds)
      })
      .catch(() => setApiProjects([]))
      .finally(() => setLoading(false))
  }, [user])

  // Build grouped data: project → milestone groups → tasks
  const projectGroups = useMemo(() => {
    if (!user) return []
    const result: { project: MyTasksProject; milestoneGroups: MilestoneTaskGroup[]; completedCount: number; totalCount: number; isPM: boolean }[] = []

    apiProjects.forEach(p => {
      const isPM = p.userRole === 'A'
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

  const allProjectsCollapsed = filteredGroups.length > 0 && filteredGroups.every(g => collapsedProjects.has(g.project.id))
  const toggleAllProjects = () => {
    if (allProjectsCollapsed) {
      setCollapsedProjects(new Set())
    } else {
      setCollapsedProjects(new Set(filteredGroups.map(g => g.project.id)))
    }
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
    setLogContentInterim('')
    setUploadingFiles(false)
    setEditingLogId(null)
    setDialogOpen(true)
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

  // ── PM: Open project edit dialog ──
  const handleOpenProjectEdit = async (projectId: string) => {
    setEditProjectLoading(projectId)
    try {
      const res = await fetch(`/api/projects/${projectId}`)
      if (!res.ok) throw new Error('載入專案失敗')
      const proj: Project = await res.json()
      setEditProject(proj)
      setEditProjectOpen(true)
    } catch (err) {
      alert(err instanceof Error ? err.message : '載入專案失敗')
    } finally {
      setEditProjectLoading(null)
    }
  }

  const handleEditProjectSave = async (data: ProjectEditData) => {
    if (!editProject) return
    const res = await fetch(`/api/projects/${editProject.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) throw new Error('儲存失敗')
  }

  // ── Add subtask inline on card ──
  const handleAddSubtaskInline = async (parentTask: Task, project: MyTasksProject) => {
    if (!inlineSubtaskTitle.trim() || !user) return

    try {
      const res = await fetch(`/api/projects/${project.id}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          milestoneId: parentTask.milestoneId,
          parentId: parentTask.id,
          title: inlineSubtaskTitle.trim(),
          assignee: user.name,
          priority: 'medium',
          startDate: parentTask.startDate,
          endDate: parentTask.endDate,
          durationDays: inlineSubtaskDays,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || '新增子任務失敗')
      }
      const newSubtask = await res.json()
      setApiProjects(prev => prev.map(p =>
        p.id === project.id
          ? {
              ...p,
              tasks: p.tasks.map(t =>
                t.id === parentTask.id
                  ? { ...t, subtasks: [...(t.subtasks || []), { ...newSubtask, status: newSubtask.status === 'in_progress' ? 'in-progress' : newSubtask.status }] }
                  : t
              ),
            }
          : p
      ))
      setInlineSubtaskTitle('')
      setInlineSubtaskDays(1)
      setAddingSubtaskForId(null)
    } catch (err) {
      alert(err instanceof Error ? err.message : '新增子任務失敗')
    }
  }

  // ── Delete subtask inline on card ──
  const handleDeleteSubtask = async (subtaskId: string, parentTask: Task, project: MyTasksProject) => {
    try {
      const res = await fetch(`/api/projects/${project.id}/tasks/${subtaskId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('刪除失敗')
      setApiProjects(prev => prev.map(p =>
        p.id === project.id
          ? {
              ...p,
              tasks: p.tasks.map(t =>
                t.id === parentTask.id
                  ? { ...t, subtasks: (t.subtasks || []).filter(s => s.id !== subtaskId) }
                  : t
              ),
            }
          : p
      ))
    } catch (err) {
      alert(err instanceof Error ? err.message : '刪除子任務失敗')
    }
  }

  /** Gather subtask log content for the current dialog task on the selected logDate */
  const getSubtaskLogsContent = useCallback(() => {
    if (!dialogTask) return null
    const task = dialogTask.task
    const project = dialogTask.project
    const subtasks = task.subtasks || []
    if (subtasks.length === 0) return null

    const entries: { title: string; progress: number; content: string }[] = []
    for (const sub of subtasks) {
      // Find the most recent log for this subtask on or before logDate
      const subLogs = project.taskLogs
        .filter(l => l.taskId === sub.id)
        .sort((a, b) => new Date(b.logDate).getTime() - new Date(a.logDate).getTime())
      const latestLog = subLogs.find(l => l.logDate <= logDate) || subLogs[0]
      if (latestLog) {
        entries.push({ title: sub.title, progress: sub.progress, content: latestLog.content })
      }
    }
    return entries.length > 0 ? entries : null
  }, [dialogTask, logDate])

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
          taskTitle: dialogTask?.task.title || '',
        }),
      })
      if (!res.ok) throw new Error()
      const { summary } = await res.json()
      setLogContent(prev => prev ? `${prev}\n\n${summary}` : summary)
    } catch {
      // Fallback to raw if AI fails
      handleImportSubLogsRaw()
    }
    setImportSubLogsLoading(false)
    setImportSubLogsOpen(false)
  }

  if (!user) return null

  const handleSubmitLog = async () => {
    if (!dialogTask || !logContent.trim()) return
    const content = logContent.trim()

    try {
      const res = await fetch(`/api/projects/${dialogTask.project.id}/task-logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: dialogTask.task.id,
          userId: user.id,
          logDate,
          content,
          ...(attachments.length > 0 ? { attachments } : {}),
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
    setLogContentInterim('')
    setAttachments([])
    setShowActions(true)
  }

  const handleStartEditLog = (log: TaskLog) => {
    setEditingLogId(log.id)
    setEditLogContent(log.content)
    setEditLogDate(log.logDate)
    setEditLogAttachments(log.attachments ? [...log.attachments] : [])
  }

  const handleCancelEditLog = () => {
    setEditingLogId(null)
    setEditLogContent('')
    setEditLogDate('')
    setEditLogAttachments([])
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
    if (!dialogTask || !editLogContent.trim()) return
    try {
      const res = await fetch(`/api/projects/${log.projectId}/task-logs/${log.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: editLogContent.trim(),
          logDate: editLogDate,
          attachments: editLogAttachments.length > 0 ? editLogAttachments : null,
        }),
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

        {/* Expand/Collapse All */}
        {filteredGroups.length > 1 && (
          <div className="flex justify-end">
            <button
              onClick={toggleAllProjects}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronsUpDown className="h-4 w-4" />
              {allProjectsCollapsed ? '全部展開' : '全部收合'}
            </button>
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
                      {isPM && <Badge variant="secondary" className="text-xs px-1.5 py-0.5">當責 A</Badge>}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">{pCompleted}/{pTotal}</span>
                      {isPM && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0"
                          title="編輯專案"
                          onClick={e => {
                            e.stopPropagation()
                            handleOpenProjectEdit(project.id)
                          }}
                          disabled={editProjectLoading === project.id}
                        >
                          {editProjectLoading === project.id
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <Settings2 className="h-3.5 w-3.5" />
                          }
                        </Button>
                      )}
                    </div>
                  </CardHeader>

                  {!isCollapsed && (
                    <CardContent className="px-4 pb-3 pt-0 flex-1">
                      <div className="divide-y divide-border">
                      {milestoneGroups.map(mg => {
                        const milestone = project.milestones.find(m => m.id === mg.milestoneId)
                        const msPendingDelay = (project.pendingDelayMilestoneIds || []).includes(mg.milestoneId)
                        const isMsCollapsed = collapsedMilestones.has(mg.milestoneId)

                        return (
                        <div key={mg.milestoneId} className="py-2 first:pt-0 last:pb-0">
                          {/* Milestone label */}
                          <div
                            className="flex items-center gap-1.5 mb-0.5 cursor-pointer group/ms"
                            onClick={() => setCollapsedMilestones(prev => {
                              const next = new Set(prev)
                              if (next.has(mg.milestoneId)) next.delete(mg.milestoneId)
                              else next.add(mg.milestoneId)
                              return next
                            })}
                          >
                            <ChevronDown className={cn(
                              'h-3 w-3 text-muted-foreground transition-transform shrink-0',
                              isMsCollapsed && '-rotate-90',
                            )} />
                            <span className="text-sm font-medium text-muted-foreground">{mg.milestoneName}</span>
                            {/* Date badge — unified style */}
                            <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0">
                              {new Date(mg.milestoneDueDate).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })}
                            </Badge>
                            {/* PM: pending delay or edit button */}
                            {isPM && milestone && (
                              msPendingDelay ? (
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
                              )
                            )}
                            {/* Progress indicator */}
                            {milestone && (
                              <span className="ml-auto flex items-center gap-1 shrink-0">
                                <span className="text-[10px] font-medium tabular-nums" style={{ color: milestone.progress >= 100 ? 'var(--color-green-600)' : milestone.progress >= 50 ? 'var(--color-blue-600)' : undefined }}>
                                  {milestone.progress}%
                                </span>
                                <span className="h-1 w-10 rounded-full bg-muted overflow-hidden">
                                  <span
                                    className={cn(
                                      'block h-full rounded-full transition-all',
                                      milestone.progress >= 100 ? 'bg-green-500' : milestone.progress >= 50 ? 'bg-blue-500' : 'bg-amber-500',
                                    )}
                                    style={{ width: `${Math.min(100, milestone.progress)}%` }}
                                  />
                                </span>
                              </span>
                            )}
                          </div>

                          {/* Collapsed milestone hint */}
                          {isMsCollapsed && mg.tasks.length > 0 && (
                            <div className="ml-5 text-[11px] text-muted-foreground py-0.5">
                              {mg.tasks.filter(t => !!t.completedAt).length}/{mg.tasks.length} 個任務完成
                            </div>
                          )}

                          {/* Tasks + Subtasks — compact lines */}
                          {!isMsCollapsed && <div className="divide-y divide-border/40">
                            {mg.tasks.map(task => {
                              const status = computeTaskStatus(task, project.taskLogs)
                              const days = getDaysUntilDeadline(task)
                              const isCompleted = !!task.completedAt
                              const taskPendingDelay = (project.pendingDelayMilestoneIds || []).includes(task.milestoneId)
                              const subtasks = task.subtasks || []
                              const isAddingSub = addingSubtaskForId === task.id

                              const hasSubtasks = subtasks.length > 0
                              const isSubExpanded = expandedTasks.has(task.id)

                              return (
                                <div key={task.id}>
                                  {/* Parent task row */}
                                  <div className="flex items-center gap-0.5">
                                    {/* Subtask expand/collapse toggle */}
                                    {hasSubtasks ? (
                                      <button
                                        onClick={e => {
                                          e.stopPropagation()
                                          setExpandedTasks(prev => {
                                            const next = new Set(prev)
                                            if (next.has(task.id)) next.delete(task.id)
                                            else next.add(task.id)
                                            return next
                                          })
                                        }}
                                        className="h-5 w-5 flex items-center justify-center shrink-0 rounded hover:bg-muted/60 text-muted-foreground transition-transform"
                                      >
                                        <ChevronDown className={cn('h-3 w-3 transition-transform', !isSubExpanded && '-rotate-90')} />
                                      </button>
                                    ) : (
                                      <div className="w-5 shrink-0" />
                                    )}
                                    <button
                                      onClick={() => openTaskDialog(task, project)}
                                      className="flex-1 flex items-center gap-2 px-1 py-1.5 text-left transition-colors hover:bg-muted/40 rounded-sm min-w-0"
                                    >
                                      {getStatusDot(status)}
                                      <span className={cn('text-sm flex-1 min-w-0 truncate', isCompleted && 'text-muted-foreground')}>
                                        {task.title}
                                      </span>
                                      {isPM && task.assignee && (
                                        <span className="text-[11px] text-muted-foreground shrink-0 max-w-[60px] truncate">{task.assignee}</span>
                                      )}
                                      {taskPendingDelay && (status === 'overdue' || status === 'overdue-not-started') ? (
                                        <span className="text-[11px] text-amber-600 font-medium shrink-0">延期申請中</span>
                                      ) : status === 'overdue' ? (
                                        <span className="text-[11px] text-destructive font-medium shrink-0">逾期{Math.abs(days)}天</span>
                                      ) : status === 'overdue-not-started' ? (
                                        <span className="text-[11px] text-orange-600 font-medium shrink-0">逾期未開始</span>
                                      ) : null}
                                      {status === 'at-risk' && (
                                        <span className="text-[11px] text-amber-600 font-medium shrink-0">剩{days}天</span>
                                      )}
                                      {isCompleted && <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />}
                                    </button>
                                    {/* Add subtask button */}
                                    <button
                                      onClick={e => {
                                        e.stopPropagation()
                                        if (isAddingSub) {
                                          setAddingSubtaskForId(null)
                                        } else {
                                          setAddingSubtaskForId(task.id)
                                          setInlineSubtaskTitle('')
                                          setInlineSubtaskDays(1)
                                          setExpandedTasks(prev => new Set(prev).add(task.id))
                                        }
                                      }}
                                      className="h-6 w-6 flex items-center justify-center shrink-0 rounded hover:bg-muted/60 text-muted-foreground hover:text-primary transition-colors"
                                      title="新增子任務"
                                    >
                                      <Plus className="h-3 w-3" />
                                    </button>
                                  </div>
                                  {/* Subtask count hint when collapsed */}
                                  {hasSubtasks && !isSubExpanded && !isAddingSub && (
                                    <button
                                      onClick={() => setExpandedTasks(prev => new Set(prev).add(task.id))}
                                      className="ml-12 text-[11px] text-muted-foreground hover:text-foreground transition-colors py-0.5"
                                    >
                                      {subtasks.length} 個子任務
                                    </button>
                                  )}
                                  {/* Inline add subtask form */}
                                  {isAddingSub && (() => {
                                    const usedDays = subtasks.reduce((sum, s) => sum + (s.durationDays || 1), 0)
                                    const remainingDays = Math.max(0, task.durationDays - usedDays)
                                    const canAdd = remainingDays > 0
                                    const effectiveMax = Math.max(1, remainingDays)
                                    return (
                                      <div className="ml-6 py-1 px-1 space-y-1">
                                        <div className="flex items-center gap-1.5">
                                          <div className="h-1.5 w-1.5 rounded-full bg-gray-300 shrink-0" />
                                          <input
                                            type="text"
                                            placeholder="子任務名稱"
                                            value={inlineSubtaskTitle}
                                            onChange={e => setInlineSubtaskTitle(e.target.value)}
                                            onKeyDown={e => {
                                              if (e.key === 'Enter' && inlineSubtaskTitle.trim() && canAdd) handleAddSubtaskInline(task, project)
                                              if (e.key === 'Escape') setAddingSubtaskForId(null)
                                            }}
                                            className="flex-1 text-sm border rounded px-2 py-1 bg-background min-w-0"
                                            autoFocus
                                          />
                                          <input
                                            type="number"
                                            min={1}
                                            max={effectiveMax}
                                            value={Math.min(inlineSubtaskDays, effectiveMax)}
                                            onChange={e => setInlineSubtaskDays(Math.min(Math.max(1, Number(e.target.value) || 1), effectiveMax))}
                                            className="w-12 text-xs border rounded px-1.5 py-1 bg-background text-center"
                                            title={`天數（剩餘 ${remainingDays} 天）`}
                                            disabled={!canAdd}
                                          />
                                          <span className="text-sm text-muted-foreground shrink-0">天</span>
                                          <Button
                                            size="sm"
                                            className="h-6 text-xs px-2"
                                            disabled={!inlineSubtaskTitle.trim() || !canAdd}
                                            onClick={() => handleAddSubtaskInline(task, project)}
                                          >
                                            新增
                                          </Button>
                                          <button
                                            onClick={() => setAddingSubtaskForId(null)}
                                            className="h-6 w-6 flex items-center justify-center text-muted-foreground hover:text-foreground"
                                          >
                                            <X className="h-3 w-3" />
                                          </button>
                                        </div>
                                        {!canAdd && (
                                          <p className="ml-4 text-[11px] text-destructive">
                                            已用完此任務的 {task.durationDays} 天配額，如需更多時間請提出延期申請
                                          </p>
                                        )}
                                        {canAdd && (
                                          <p className="ml-4 text-[11px] text-muted-foreground">
                                            此任務共 {task.durationDays} 天，已分配 {usedDays} 天，剩餘 {remainingDays} 天
                                          </p>
                                        )}
                                      </div>
                                    )
                                  })()}
                                  {/* Subtask rows — indented (collapsed by default) */}
                                  {isSubExpanded && subtasks.map(sub => {
                                    // Build a Task-like object so subtask opens in the same dialog
                                    const subAsTask: Task = {
                                      id: sub.id,
                                      projectId: task.projectId,
                                      milestoneId: task.milestoneId,
                                      title: sub.title,
                                      description: '',
                                      assignee: sub.assignee,
                                      status: sub.status,
                                      priority: sub.priority,
                                      durationDays: sub.durationDays || 1,
                                      startDate: sub.startDate,
                                      endDate: sub.endDate,
                                      dependencies: [],
                                      progress: sub.progress,
                                      parentId: task.id,
                                      completedAt: sub.completedAt,
                                      completedBy: sub.completedBy,
                                    }
                                    const subStatus = computeTaskStatus(subAsTask, project.taskLogs)
                                    const subCompleted = !!sub.completedAt || sub.status === 'done'
                                    return (
                                      <div key={sub.id} className="group/sub flex items-center ml-10 pr-1">
                                        <button
                                          onClick={() => openTaskDialog(subAsTask, project)}
                                          className="flex-1 flex items-center gap-2 py-1 text-left transition-colors hover:bg-muted/40 rounded-sm min-w-0"
                                        >
                                          {getStatusDot(subStatus)}
                                          <span className={cn('text-xs flex-1 min-w-0 truncate', subCompleted && 'text-muted-foreground')}>
                                            {sub.title}
                                          </span>
                                          {isPM && sub.assignee && (
                                            <span className="text-[10px] text-muted-foreground shrink-0 max-w-[50px] truncate">{sub.assignee}</span>
                                          )}
                                          <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0">{sub.progress}%</Badge>
                                          {subCompleted && <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />}
                                        </button>
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            if (confirm(`確定要刪除子任務「${sub.title}」嗎？`)) {
                                              handleDeleteSubtask(sub.id, task, project)
                                            }
                                          }}
                                          className="h-5 w-5 flex items-center justify-center text-muted-foreground/0 group-hover/sub:text-muted-foreground hover:!text-destructive transition-colors shrink-0"
                                          title="刪除子任務"
                                        >
                                          <X className="h-3 w-3" />
                                        </button>
                                      </div>
                                    )
                                  })}
                                </div>
                              )
                            })}
                          </div>}
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
          {!currentDialogTask && <DialogTitle className="sr-only">任務</DialogTitle>}
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
                <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileSelect} />
                <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileSelect} />

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
                                'border-muted-foreground/20 focus-within:border-primary/40 focus-within:bg-background'
                              )}>
                                {/* Import subtask logs button — only for parent tasks with subtasks */}
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
                                  rows={3}
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

                                {/* Toolbar inside box */}
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
                                    {/* Attachments in edit mode */}
                                    <div className="space-y-1.5">
                                      {editLogAttachments.length > 0 && (
                                        <div className="flex flex-wrap gap-1.5">
                                          {editLogAttachments.map((att, i) => (
                                            <Badge key={i} variant="secondary" className="text-xs gap-1 rounded-md py-0.5 max-w-[180px]">
                                              {att.type === 'image'
                                                ? <img src={att.url} alt={att.name} className="h-3.5 w-3.5 rounded object-cover" />
                                                : <Paperclip className="h-3 w-3 shrink-0" />}
                                              <span className="truncate">{att.name}</span>
                                              <button onClick={() => setEditLogAttachments(prev => prev.filter((_, j) => j !== i))} className="ml-0.5 text-muted-foreground hover:text-destructive shrink-0">×</button>
                                            </Badge>
                                          ))}
                                        </div>
                                      )}
                                      <div className="flex items-center gap-1">
                                        <button type="button" onClick={() => editFileInputRef.current?.click()} disabled={editUploadingFiles}
                                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50">
                                          <Paperclip className="h-3.5 w-3.5" />新增附件
                                        </button>
                                        {editUploadingFiles && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                                      </div>
                                      <input ref={editFileInputRef} type="file" multiple className="hidden" onChange={handleEditFileSelect} />
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
                                    {log.attachments && log.attachments.length > 0 && (
                                      <div className="mt-1.5 space-y-1.5">
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

                      {upstreamTasks.length === 0 && downstreamTasks.length === 0 && (
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

      {/* ── PM Project Edit Dialog ── */}
      {editProjectOpen && editProject && (
        <ProjectEditDialog
          open={editProjectOpen}
          onOpenChange={open => {
            setEditProjectOpen(open)
            if (!open) setEditProject(null)
          }}
          project={editProject}
          defaultTab="workitems"
          onSave={handleEditProjectSave}
          onWorkItemsChange={async () => {
            // Refresh my-tasks data after workitems change
            if (user) {
              const res = await fetch(`/api/my-tasks?userId=${user.id}&userEmail=${encodeURIComponent(user.email)}`)
              if (res.ok) {
                const data = await res.json()
                setApiProjects(data.projects ?? [])
              }
            }
          }}
        />
      )}

    </DashboardLayout>
  )
}
