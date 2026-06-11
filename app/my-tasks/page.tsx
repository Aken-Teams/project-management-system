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
import { WeekPicker } from '@/components/ui/week-picker'
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
  Sparkles,
  FileText,
  ClipboardList,
  UserCheck,
  UserX,
  HelpCircle,
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
  const [helpOpen, setHelpOpen] = useState(false)
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
  const [editLogContentInterim, setEditLogContentInterim] = useState('')
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
  // Role-based tab state
  const [activeRole, setActiveRole] = useState<string>('')
  const [weeklyReportForms, setWeeklyReportForms] = useState<Record<string, { content: string; blockers: string; nextPlan: string }>>({})
  const [weeklyReportSubmitting, setWeeklyReportSubmitting] = useState<string | null>(null)
  const [existingReports, setExistingReports] = useState<Record<string, { id: string; content: string; blockers: string; nextPlan: string; updatedAt: string }>>({})
  const [weeklyReportLoading, setWeeklyReportLoading] = useState(false)
  // P-tab: procurement data
  const [procurementData, setProcurementData] = useState<Record<string, { budgetItems: any[]; capexItems: any[]; loading: boolean }>>({})
  // R-tab: weekly report dialog (task-based, matching Gantt chart design)
  const [rReportDialogOpen, setRReportDialogOpen] = useState(false)
  const [rReportDialogProject, setRReportDialogProject] = useState<MyTasksProject | null>(null)
  const [rReportWeekOf, setRReportWeekOf] = useState(() => {
    const now = new Date()
    const day = now.getDay()
    const diff = now.getDate() - day + (day === 0 ? -6 : 1)
    const monday = new Date(now)
    monday.setDate(diff)
    return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`
  })
  const [rSelectedTaskId, setRSelectedTaskId] = useState<string | null>(null)
  interface RLogRow { date: string; content: string; existingLogId?: string; attachments?: TaskLogAttachment[] }
  const [rLogRows, setRLogRows] = useState<RLogRow[]>([{ date: '', content: '' }])
  const [rLogNextWeekPlan, setRLogNextWeekPlan] = useState('')
  const [rSubmittingBatch, setRSubmittingBatch] = useState(false)
  const [rUploadingRowIdx, setRUploadingRowIdx] = useState<number | null>(null)
  const rRowFileInputRef = useRef<HTMLInputElement>(null)
  // A-tab: R member report dialog
  const [aRReportDialogOpen, setARReportDialogOpen] = useState(false)
  const [aRReportProject, setARReportProject] = useState<MyTasksProject | null>(null)
  const [aRReportData, setARReportData] = useState<{ reports: any[]; memberStatus: any[] }>({ reports: [], memberStatus: [] })
  const [aRReportLoading, setARReportLoading] = useState(false)
  const [aRReportWeekOf, setARReportWeekOf] = useState(() => {
    const now = new Date()
    const day = now.getDay()
    const diff = now.getDate() - day + (day === 0 ? -6 : 1)
    const monday = new Date(now)
    monday.setDate(diff)
    return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`
  })
  const [aRReportFilterUser, setARReportFilterUser] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const editFileInputRef = useRef<HTMLInputElement>(null)
  const editImageInputRef = useRef<HTMLInputElement>(null)

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

  // Compute user roles across all projects
  const ROLE_TAB_CONFIG: Record<string, { label: string; icon: string; desc: string }> = {
    MY: { label: '我的任務週報', icon: 'file', desc: '填寫被指派任務的工作週報（不分角色）' },
    A: { label: '當責', icon: 'clipboard', desc: '填寫週報、管理任務' },
    R: { label: '執行', icon: 'wrench', desc: '填寫工作週報' },
    P: { label: '採購', icon: 'shopping-cart', desc: '管理採購資訊' },
    C: { label: '諮詢', icon: 'message', desc: '查看專案進度' },
    I: { label: '知會', icon: 'bell', desc: '查看專案進度' },
    S: { label: '審核', icon: 'shield', desc: '審核延期申請' },
  }

  const userRolesMap = useMemo(() => {
    const map = new Map<string, MyTasksProject[]>()
    for (const p of apiProjects) {
      if (!p.userRole) continue
      const role = p.userRole
      if (!map.has(role)) map.set(role, [])
      map.get(role)!.push(p)
    }
    return map
  }, [apiProjects])

  // 「我的任務週報」：所有「有指派任務給我」的專案（不分 RACI 角色）
  const myReportProjects = useMemo(
    () => apiProjects.filter(p => !!user && p.tasks.some(t => t.assignee === user.name)),
    [apiProjects, user],
  )

  const availableRoles = useMemo(() => {
    // R 改由「我的任務週報(MY)」涵蓋，所以角色頁籤不再列 R
    const order = ['S', 'A', 'P', 'C', 'I']
    const roleTabs = order.filter(r => userRolesMap.has(r))
    return myReportProjects.length > 0 ? ['MY', ...roleTabs] : roleTabs
  }, [userRolesMap, myReportProjects])

  // Auto-set initial active role
  useEffect(() => {
    if (availableRoles.length > 0 && !availableRoles.includes(activeRole)) {
      setActiveRole(availableRoles[0])
    }
  }, [availableRoles, activeRole])

  const roleProjects = useMemo(() => userRolesMap.get(activeRole) || [], [userRolesMap, activeRole])

  // Fetch existing weekly reports for projects where I have assigned tasks
  useEffect(() => {
    if (!user || myReportProjects.length === 0) return
    setWeeklyReportLoading(true)
    const fetchReports = async () => {
      const reports: Record<string, { id: string; content: string; blockers: string; nextPlan: string; updatedAt: string }> = {}
      for (const p of myReportProjects) {
        try {
          const res = await fetch(`/api/member-weekly-reports?projectId=${p.id}&userId=${user.id}`)
          if (res.ok) {
            const data = await res.json()
            for (const r of data.reports) {
              const key = `${p.id}_${r.milestoneId}`
              reports[key] = { id: r.id, content: r.content, blockers: r.blockers, nextPlan: r.nextPlan, updatedAt: r.updatedAt }
            }
          }
        } catch { /* ignore */ }
      }
      setExistingReports(reports)
      setWeeklyReportLoading(false)
    }
    fetchReports()
  }, [user, myReportProjects])

  // Fetch procurement data for P-role projects
  const pProjects = useMemo(() => apiProjects.filter(p => p.userRole === 'P'), [apiProjects])
  useEffect(() => {
    if (!user || pProjects.length === 0) return
    for (const p of pProjects) {
      if (procurementData[p.id]) continue
      setProcurementData(prev => ({ ...prev, [p.id]: { budgetItems: [], capexItems: [], loading: true } }))
      Promise.all([
        fetch(`/api/projects/${p.id}/budget-items`).then(r => r.ok ? r.json() : []),
        fetch(`/api/projects/${p.id}/capex`).then(r => r.ok ? r.json() : []),
      ]).then(([budgetItems, capexItems]) => {
        setProcurementData(prev => ({ ...prev, [p.id]: { budgetItems, capexItems, loading: false } }))
      }).catch(() => {
        setProcurementData(prev => ({ ...prev, [p.id]: { budgetItems: [], capexItems: [], loading: false } }))
      })
    }
  }, [user, pProjects])

  // Build grouped data: project → milestone groups → tasks (filtered by active role)
  const projectGroups = useMemo(() => {
    if (!user) return []
    const result: { project: MyTasksProject; milestoneGroups: MilestoneTaskGroup[]; completedCount: number; totalCount: number; isPM: boolean }[] = []

    const roleFilteredProjects = activeRole
      ? apiProjects.filter(p => p.userRole === activeRole)
      : apiProjects

    roleFilteredProjects.forEach(p => {
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
  }, [apiProjects, user, activeRole])

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

  // ── Weekly report submit handler ──
  const handleSubmitWeeklyReport = async (projectId: string, milestoneId: string) => {
    if (!user) return
    const key = `${projectId}_${milestoneId}`
    const form = weeklyReportForms[key]
    if (!form?.content?.trim()) return

    setWeeklyReportSubmitting(key)
    try {
      const res = await fetch('/api/member-weekly-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          milestoneId,
          userId: user.id,
          content: form.content.trim(),
          blockers: form.blockers?.trim() || '',
          nextPlan: form.nextPlan?.trim() || '',
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || '送出失敗')
      }
      const report = await res.json()
      setExistingReports(prev => ({
        ...prev,
        [key]: { id: report.id, content: form.content.trim(), blockers: form.blockers?.trim() || '', nextPlan: form.nextPlan?.trim() || '', updatedAt: report.updatedAt },
      }))
      // Clear form
      setWeeklyReportForms(prev => {
        const next = { ...prev }
        delete next[key]
        return next
      })
    } catch (err) {
      alert(err instanceof Error ? err.message : '送出週報失敗')
    } finally {
      setWeeklyReportSubmitting(null)
    }
  }

  const handleEditWeeklyReport = (projectId: string, milestoneId: string) => {
    const key = `${projectId}_${milestoneId}`
    const existing = existingReports[key]
    if (existing) {
      setWeeklyReportForms(prev => ({
        ...prev,
        [key]: { content: existing.content, blockers: existing.blockers, nextPlan: existing.nextPlan },
      }))
    }
  }

  // Open R report dialog
  const openRReportDialog = (project: MyTasksProject) => {
    setRReportDialogProject(project)
    setRSelectedTaskId(null)
    setRLogRows([{ date: '', content: '' }])
    setRLogNextWeekPlan('')
    setRReportDialogOpen(true)
  }

  // Get user's assigned tasks for R dialog, grouped by milestone
  const rDialogTasksByMilestone = useMemo(() => {
    if (!rReportDialogProject || !user) return []
    const result: { milestone: { id: string; name: string; dueDate: string; status: string }; tasks: Task[] }[] = []
    for (const ms of rReportDialogProject.milestones) {
      if (ms.status === 'done') continue
      // All tasks assigned to the user under this milestone (top-level + subtasks)
      const assignedTasks = rReportDialogProject.tasks.filter(
        t => t.milestoneId === ms.id && t.assignee === user.name && !t.parentId
      )
      // Also include subtasks assigned to the user
      const parentIds = rReportDialogProject.tasks.filter(t => t.milestoneId === ms.id && !t.parentId).map(t => t.id)
      const assignedSubtasks = rReportDialogProject.tasks.filter(
        t => t.parentId && parentIds.includes(t.parentId) && t.assignee === user.name
      )
      const all = [...assignedTasks, ...assignedSubtasks]
      if (all.length > 0) {
        result.push({ milestone: ms, tasks: all })
      }
    }
    return result
  }, [rReportDialogProject, user])

  // Check which tasks have logs in the selected week
  const rTaskWeekStatus = useMemo(() => {
    if (!rReportDialogProject) return new Map<string, boolean>()
    const [y, m, d] = rReportWeekOf.split('-').map(Number)
    const weekStart = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const endDate = new Date(y, m - 1, d + 6)
    const weekEnd = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`
    const map = new Map<string, boolean>()
    for (const group of rDialogTasksByMilestone) {
      for (const task of group.tasks) {
        const hasLogs = rReportDialogProject.taskLogs.some(
          l => l.taskId === task.id && l.logDate >= weekStart && l.logDate <= weekEnd
        )
        map.set(task.id, hasLogs)
      }
    }
    return map
  }, [rReportDialogProject, rReportWeekOf, rDialogTasksByMilestone])

  // Prefill R log rows when task or week changes
  useEffect(() => {
    if (!rSelectedTaskId || !rReportDialogProject) return
    const [y, m, d] = rReportWeekOf.split('-').map(Number)
    const weekStart = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const endDate = new Date(y, m - 1, d + 6)
    const weekEnd = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`
    // 只載「自己」填的紀錄；別人的不自動代入
    const logs = rReportDialogProject.taskLogs
      .filter(l => l.taskId === rSelectedTaskId && l.logDate >= weekStart && l.logDate <= weekEnd && l.author === user?.name)
      .sort((a, b) => a.logDate.localeCompare(b.logDate))
    if (logs.length > 0) {
      setRLogRows(logs.map(l => ({
        date: l.logDate,
        content: l.content,
        existingLogId: l.id,
        attachments: l.attachments?.length ? [...l.attachments] : undefined,
      })))
      const latestWithPlans = [...logs].reverse().find(l => l.nextPlans?.length)
      setRLogNextWeekPlan(latestWithPlans?.nextPlans?.map(p => p.content).join('\n') || '')
    } else {
      setRLogRows([{ date: '', content: '' }])
      setRLogNextWeekPlan('')
    }
  }, [rSelectedTaskId, rReportWeekOf, rReportDialogProject, user?.name])

  // R dialog: select a task
  const handleRSelectTask = (taskId: string) => {
    setRSelectedTaskId(prev => prev === taskId ? null : taskId)
  }

  // R dialog: file upload for batch log rows
  const handleRRowFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0 || rUploadingRowIdx === null) return
    const idx = rUploadingRowIdx
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
        setRLogRows(prev => prev.map((r, i) =>
          i === idx ? { ...r, attachments: [...(r.attachments || []), ...uploaded] } : r
        ))
      }
    } catch { /* ignore */ } finally {
      setRUploadingRowIdx(null)
    }
  }

  // R dialog: 刪除工作紀錄列 / 附件（含確認視窗 + 實體刪檔）
  const [rPendingDelete, setRPendingDelete] = useState<
    | { kind: 'row'; idx: number }
    | { kind: 'att'; rowIdx: number; attIdx: number }
    | null
  >(null)
  const [rDeleting, setRDeleting] = useState(false)

  const deleteUploadedFile = (url?: string) =>
    url ? fetch(`/api/upload?url=${encodeURIComponent(url)}`, { method: 'DELETE' }).catch(() => {}) : Promise.resolve()

  const refreshRReportData = async () => {
    if (!user || !rReportDialogProject) return
    const res = await fetch(`/api/my-tasks?userId=${user.id}&userEmail=${encodeURIComponent(user.email)}`)
    if (res.ok) {
      const data = await res.json()
      setApiProjects(data.projects ?? [])
      const updated = (data.projects ?? []).find((p: MyTasksProject) => p.id === rReportDialogProject.id)
      if (updated) setRReportDialogProject(updated)
    }
  }

  const performRDelete = async () => {
    if (!rPendingDelete || !rReportDialogProject) return
    setRDeleting(true)
    try {
      if (rPendingDelete.kind === 'row') {
        const row = rLogRows[rPendingDelete.idx]
        if (row?.existingLogId) {
          await fetch(`/api/projects/${rReportDialogProject.id}/task-logs/${row.existingLogId}`, { method: 'DELETE' })
          await refreshRReportData()
        }
        await Promise.all((row?.attachments || []).map(a => deleteUploadedFile(a.url)))
        setRLogRows(prev => {
          const next = prev.filter((_, i) => i !== rPendingDelete.idx)
          return next.length > 0 ? next : [{ date: '', content: '' }]
        })
      } else {
        const { rowIdx, attIdx } = rPendingDelete
        const row = rLogRows[rowIdx]
        const removed = row?.attachments?.[attIdx]
        const newAtts = (row?.attachments || []).filter((_, i) => i !== attIdx)
        if (row?.existingLogId) {
          await fetch(`/api/projects/${rReportDialogProject.id}/task-logs/${row.existingLogId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ attachments: newAtts }),
          })
          await refreshRReportData()
        }
        await deleteUploadedFile(removed?.url)
        setRLogRows(prev => prev.map((r, i) =>
          i === rowIdx ? { ...r, attachments: newAtts.length ? newAtts : undefined } : r
        ))
      }
    } catch {
      // ignore
    } finally {
      setRDeleting(false)
      setRPendingDelete(null)
    }
  }

  // R dialog: batch submit logs (same API as Gantt chart)
  const handleRBatchSubmitLogs = async () => {
    if (!rSelectedTaskId || !user || !rReportDialogProject) return
    const entries = rLogRows
      .filter(r => r.content.trim() && r.date)
      .map(r => ({
        logDate: r.date,
        content: r.content.trim(),
        existingLogId: r.existingLogId,
        attachments: r.attachments?.length ? r.attachments : undefined,
      }))
    if (entries.length === 0) return

    setRSubmittingBatch(true)
    try {
      const nextPlans = rLogNextWeekPlan.trim()
        ? [{ content: rLogNextWeekPlan.trim() }]
        : []
      const res = await fetch(`/api/projects/${rReportDialogProject.id}/task-logs/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: rSelectedTaskId,
          userId: user.id,
          entries,
          ...(nextPlans.length > 0 ? { nextPlans } : {}),
        }),
      })
      if (!res.ok) throw new Error()
      // Refresh task data
      const refreshRes = await fetch(`/api/my-tasks?userId=${user.id}&userEmail=${encodeURIComponent(user.email)}`)
      if (refreshRes.ok) {
        const data = await refreshRes.json()
        setApiProjects(data.projects ?? [])
        // Update the dialog project reference
        const updated = (data.projects ?? []).find((p: MyTasksProject) => p.id === rReportDialogProject.id)
        if (updated) setRReportDialogProject(updated)
      }
    } catch {
      alert('提交失敗，請稍後再試')
    } finally {
      setRSubmittingBatch(false)
    }
  }

  // Open A-tab R member report dialog
  const fetchARReportData = useCallback(async (projectId: string, weekOf: string) => {
    setARReportLoading(true)
    try {
      const res = await fetch(`/api/member-weekly-reports?projectId=${projectId}&weekOf=${weekOf}`)
      if (res.ok) {
        const data = await res.json()
        setARReportData({ reports: data.reports || [], memberStatus: data.memberStatus || [] })
      }
    } catch { /* ignore */ }
    setARReportLoading(false)
  }, [])

  const openARReportDialog = async (project: MyTasksProject) => {
    setARReportProject(project)
    setARReportDialogOpen(true)
    fetchARReportData(project.id, aRReportWeekOf)
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
    if (!dialogTask || !user || !extensionDate) return
    const { task, project } = dialogTask
    const milestone = project.milestones.find(m => m.id === task.milestoneId)
    if (!milestone) return

    // Compute milestone impact from task extension
    const currentTaskEnd = new Date(task.endDate)
    const proposedTaskEnd = new Date(extensionDate)
    const extraDays = Math.round((proposedTaskEnd.getTime() - currentTaskEnd.getTime()) / 86400000)
    if (extraDays <= 0) { alert('新完成日必須晚於目前截止日'); return }

    const msTasks = project.tasks.filter(t => t.milestoneId === milestone.id && !t.parentId)
    const currentTotal = msTasks.reduce((sum, t) => sum + Math.max(t.durationDays, 1), 0)
    const newTotal = currentTotal + extraDays
    const msDueDate = new Date(milestone.dueDate)
    const effectiveStart = new Date(msDueDate)
    effectiveStart.setDate(effectiveStart.getDate() - currentTotal + 1)
    const newMsEnd = new Date(effectiveStart)
    newMsEnd.setDate(newMsEnd.getDate() + newTotal - 1)
    const milestoneDelta = Math.max(0, Math.round((newMsEnd.getTime() - msDueDate.getTime()) / 86400000))
    const proposedMilestoneDate = milestoneDelta > 0
      ? newMsEnd.toISOString().split('T')[0]
      : milestone.dueDate.split('T')[0]

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
            proposedDate: proposedMilestoneDate,
          }],
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || '送出失敗')
      }
      // Update local state to mark milestone as pending delay
      const proposedDate = proposedMilestoneDate
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
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">我的任務</h1>
            <button
              onClick={() => setHelpOpen(true)}
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="我的任務說明"
            >
              <HelpCircle className="h-5 w-5" />
            </button>
          </div>
          <p className="text-sm text-muted-foreground mt-1">{user.name} 的工作總覽</p>
        </div>

        {/* Role-based Tabs */}
        {availableRoles.length > 0 && (
          <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-lg w-fit">
            {availableRoles.map(role => {
              const cfg = ROLE_TAB_CONFIG[role]
              const count = role === 'MY' ? myReportProjects.length : (userRolesMap.get(role)?.length || 0)
              return (
                <button
                  key={role}
                  onClick={() => setActiveRole(role)}
                  className={cn(
                    'text-sm px-4 py-1.5 rounded-md transition-all font-medium flex items-center gap-1.5',
                    activeRole === role
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {role !== 'MY' && <span className="font-bold">{role}</span>}
                  <span>{cfg?.label || role}</span>
                  <span className="text-xs opacity-60">{count}</span>
                </button>
              )
            })}
          </div>
        )}

        {/* ═══ 我的任務週報 Tab — 依「被指派任務」(不分角色) ═══ */}
        {activeRole === 'MY' && myReportProjects.length > 0 && (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">專案</th>
                    <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">我的任務</th>
                    <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">本週週報</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {myReportProjects.map(project => {
                    // Count user's assigned tasks (non-done milestones)
                    const activeMsIds = new Set(project.milestones.filter(m => m.status !== 'done').map(m => m.id))
                    const myTasks = project.tasks.filter(t => t.assignee === user!.name && activeMsIds.has(t.milestoneId))
                    // Count tasks with logs this week
                    const [wy, wm, wd] = rReportWeekOf.split('-').map(Number)
                    const wkStart = rReportWeekOf
                    const wkEndDate = new Date(wy, wm - 1, wd + 6)
                    const wkEnd = `${wkEndDate.getFullYear()}-${String(wkEndDate.getMonth() + 1).padStart(2, '0')}-${String(wkEndDate.getDate()).padStart(2, '0')}`
                    const filledCount = myTasks.filter(t =>
                      project.taskLogs.some(l => l.taskId === t.id && l.logDate >= wkStart && l.logDate <= wkEnd)
                    ).length
                    return (
                      <tr key={project.id} className="border-b last:border-0">
                        <td className="px-4 py-3 font-medium">{project.name}</td>
                        <td className="px-4 py-3 text-center text-muted-foreground">{myTasks.length} 個任務</td>
                        <td className="px-4 py-3 text-center">
                          {myTasks.length === 0 ? (
                            <Badge variant="outline" className="text-xs text-muted-foreground">無任務</Badge>
                          ) : filledCount === myTasks.length ? (
                            <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-xs">
                              <Check className="h-3 w-3 mr-1" />全部已填
                            </Badge>
                          ) : filledCount > 0 ? (
                            <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                              {filledCount}/{myTasks.length} 已填
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs text-muted-foreground">待填寫</Badge>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button size="sm" variant="default" className="h-7 text-xs gap-1" onClick={() => openRReportDialog(project)}>
                            <FileText className="h-3 w-3" />填寫週報
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* ═══ P Tab — 採購管理 (Table Layout) ═══ */}
        {activeRole === 'P' && pProjects.length > 0 && (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">專案</th>
                    <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">預算項目</th>
                    <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">資本支出項目</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">預估金額</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {pProjects.map(project => {
                    const data = procurementData[project.id]
                    const budgetItems = data?.budgetItems || []
                    const capexItems = data?.capexItems || []
                    const isLoading = data?.loading ?? true
                    const totalEstimated = budgetItems.reduce((sum: number, b: any) => sum + (b.estimatedCost || 0), 0)

                    return (
                      <tr key={project.id} className="border-b last:border-0">
                        <td className="px-4 py-3 font-medium">{project.name}</td>
                        <td className="px-4 py-3 text-center">
                          {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mx-auto" /> : budgetItems.length}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mx-auto" /> : capexItems.length}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-xs">
                          {isLoading ? '-' : totalEstimated > 0 ? `$${totalEstimated.toLocaleString()}` : '-'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" asChild>
                            <a href={`/projects/${project.id}?tab=capex`}>
                              <ArrowRight className="h-3 w-3" />採購管理
                            </a>
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* ═══ S Tab — 審核 (Table Layout) ═══ */}
        {activeRole === 'S' && (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">專案</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {roleProjects.map(project => (
                    <tr key={project.id} className="border-b last:border-0">
                      <td className="px-4 py-3 font-medium">{project.name}</td>
                      <td className="px-4 py-3 text-right space-x-2">
                        <Button size="sm" variant="outline" className="h-7 text-xs" asChild>
                          <a href={`/projects/${project.id}`}>查看專案</a>
                        </Button>
                        <Button size="sm" variant="default" className="h-7 text-xs" asChild>
                          <a href="/approvals">前往審核中心</a>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* ═══ C/I Tabs — View-only (Table Layout) ═══ */}
        {(activeRole === 'C' || activeRole === 'I') && (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">專案</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {roleProjects.map(project => (
                    <tr key={project.id} className="border-b last:border-0">
                      <td className="px-4 py-3 font-medium">{project.name}</td>
                      <td className="px-4 py-3 text-right">
                        <Button size="sm" variant="outline" className="h-7 text-xs" asChild>
                          <a href={`/projects/${project.id}`}>查看專案</a>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* ═══ A Tab — 當責/PM 管理 (Table Layout) ═══ */}
        {activeRole === 'A' && (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">專案</th>
                    <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">任務進度</th>
                    <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">需注意</th>
                    <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">R 成員週報</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredGroups.map(({ project, milestoneGroups, completedCount: pCompleted, totalCount: pTotal }) => {
                    const pAtRisk = milestoneGroups.flatMap(m => m.tasks.filter(t => {
                      const s = computeTaskStatus(t, project.taskLogs)
                      return s === 'at-risk' || s === 'overdue' || s === 'overdue-not-started'
                    })).length

                    return (
                      <tr key={project.id} className="border-b last:border-0">
                        <td className="px-4 py-3">
                          <div className="font-medium">{project.name}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">{milestoneGroups.length} 個里程碑</div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="font-medium">{pCompleted}</span>
                          <span className="text-muted-foreground">/{pTotal}</span>
                          <span className={cn('ml-1.5 text-xs', pTotal > 0 && pCompleted === pTotal ? 'text-green-600' : 'text-muted-foreground')}>
                            ({pTotal > 0 ? Math.round((pCompleted / pTotal) * 100) : 0}%)
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {pAtRisk > 0 ? (
                            <Badge variant="destructive" className="text-xs">{pAtRisk}</Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => openARReportDialog(project)}>
                            <ClipboardList className="h-3 w-3" />查看 R 週報
                          </Button>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" asChild>
                            <a href={`/projects/${project.id}`}>
                              <ArrowRight className="h-3 w-3" />甘特圖
                            </a>
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
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
                                  <div className="px-3 pb-2 space-y-1.5">
                                    {attachments.filter(a => a.type === 'image').length > 0 && (
                                      <div className="flex flex-wrap gap-1.5">
                                        {attachments.filter(a => a.type === 'image').map((att) => (
                                          <div key={att.url} className="relative group/img">
                                            <img src={att.url} alt={att.name} className="h-14 w-14 object-cover rounded-lg border border-border" />
                                            <button
                                              onClick={() => setAttachments(prev => prev.filter(a => a.url !== att.url))}
                                              className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-background border border-border shadow-sm text-muted-foreground hover:text-destructive flex items-center justify-center"
                                            >
                                              <X className="h-2.5 w-2.5" />
                                            </button>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                    {attachments.filter(a => a.type === 'file').length > 0 && (
                                      <div className="flex flex-wrap gap-1.5">
                                        {attachments.filter(a => a.type === 'file').map((att) => (
                                          <div key={att.url} className="flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-lg border border-border/70 bg-muted/50 text-xs">
                                            <Paperclip className="h-3 w-3 text-muted-foreground shrink-0" />
                                            <span className="max-w-[120px] truncate">{att.name}</span>
                                            <button
                                              onClick={() => setAttachments(prev => prev.filter(a => a.url !== att.url))}
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
                                  // Pre-fill with task end date + 7 days
                                  if (dialogTask) {
                                    const d = new Date(dialogTask.task.endDate)
                                    d.setDate(d.getDate() + 7)
                                    setExtensionDate(d.toISOString().split('T')[0])
                                  }
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
                  <TabsContent value="history" className="flex-1 px-4 mt-0 overflow-y-auto">
                    {taskLogs.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-center">
                        <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
                          <Clock className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <p className="text-sm text-muted-foreground">尚無工作紀錄</p>
                        <p className="text-sm text-muted-foreground/60 mt-1">提交第一筆紀錄後會顯示在這裡</p>
                      </div>
                    ) : (
                      <div className="py-4 space-y-3">
                        {taskLogs.map((log) => (
                          <div key={log.id} className="group rounded-xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md">
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
                              /* ── Display mode ── */
                              <>
                                {/* Card header */}
                                <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border/40">
                                  <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                    <span className="text-[11px] font-semibold text-primary">
                                      {log.author.split(' ').map(n => n[0]).join('').slice(0, 2)}
                                    </span>
                                  </div>
                                  <span className="flex-1 text-sm font-medium">{log.author}</span>
                                  <div className="flex items-center gap-1 shrink-0">
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
                                    <span className="text-xs text-muted-foreground">
                                      {new Date(log.logDate).toLocaleDateString('zh-TW', { year: 'numeric', month: 'short', day: 'numeric' })}
                                    </span>
                                  </div>
                                </div>
                                {/* Card body */}
                                <div className="px-4 py-3 space-y-3">
                                  <p className="text-sm leading-relaxed">{log.content}</p>
                                  {log.attachments && log.attachments.filter(a => a.type === 'image').length > 0 && (
                                    <div className="grid grid-cols-3 gap-1.5">
                                      {log.attachments.filter(a => a.type === 'image').map((att, ai) => (
                                        <a key={ai} href={att.url} target="_blank" rel="noopener noreferrer"
                                          className="block overflow-hidden rounded-lg border border-border/50 hover:opacity-90 transition-opacity">
                                          <img src={att.url} alt={att.name} className="aspect-video w-full object-cover" />
                                        </a>
                                      ))}
                                    </div>
                                  )}
                                  {log.attachments && log.attachments.filter(a => a.type === 'file').length > 0 && (
                                    <div className="flex flex-wrap gap-1.5">
                                      {log.attachments.filter(a => a.type === 'file').map((att, ai) => (
                                        <a key={ai} href={att.url} target="_blank" rel="noopener noreferrer"
                                          className="flex items-center gap-1.5 pl-2.5 pr-3 py-1.5 rounded-lg border border-border/60 bg-muted/40 text-xs text-foreground hover:bg-muted transition-colors">
                                          <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                          <span className="max-w-[140px] truncate">{att.name}</span>
                                        </a>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                        ))}
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
                      <Label className="text-sm text-muted-foreground">任務預計完成日 <span className="text-red-500">*</span></Label>
                      <input
                        type="date"
                        value={extensionDate}
                        min={dialogTask ? (() => { const d = new Date(dialogTask.task.endDate); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0] })() : undefined}
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
                        disabled={!extensionReason.trim() || !extensionDate}
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

      {/* 刪除 R 週報填寫中的工作紀錄列 / 附件確認 */}
      <AlertDialog open={!!rPendingDelete} onOpenChange={open => { if (!open && !rDeleting) setRPendingDelete(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{rPendingDelete?.kind === 'att' ? '確認刪除附件' : '確認刪除工作紀錄'}</AlertDialogTitle>
            <AlertDialogDescription>
              {rPendingDelete?.kind === 'att'
                ? '確定要刪除這個附件嗎？此操作無法復原。'
                : '確定要刪除這筆工作紀錄嗎？此操作無法復原。'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={rDeleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={rDeleting}
              onClick={(e) => { e.preventDefault(); performRDelete() }}
            >
              {rDeleting ? '刪除中…' : '刪除'}
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

      {/* ── R Tab: Weekly Report Dialog (Task-based, matching Gantt chart design) ── */}
      <Dialog open={rReportDialogOpen} onOpenChange={(open) => {
        setRReportDialogOpen(open)
        if (!open) { setRReportDialogProject(null); setRSelectedTaskId(null) }
      }}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-6 pt-5 pb-3 border-b">
            <DialogTitle className="text-base">填寫週報</DialogTitle>
            {rReportDialogProject && (
              <DialogDescription className="text-sm">
                {rReportDialogProject.name} — 選擇任務填寫工作紀錄
              </DialogDescription>
            )}
          </DialogHeader>
          {rReportDialogProject && (
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {/* Week selector (matching Gantt chart WeekPicker) */}
              <WeekPicker
                value={rReportWeekOf}
                onChange={(v) => { setRReportWeekOf(v); setRSelectedTaskId(null) }}
              />

              {/* Task list grouped by milestone */}
              <div className="space-y-3">
                <div className="flex items-center gap-1.5">
                  <ListChecks className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground">我的任務</span>
                  {(() => {
                    const total = Array.from(rTaskWeekStatus.values()).length
                    const filled = Array.from(rTaskWeekStatus.values()).filter(Boolean).length
                    return total > 0 ? (
                      <span className={cn(
                        'text-[10px] px-1.5 py-0.5 rounded',
                        filled === total
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-muted text-muted-foreground',
                      )}>
                        {filled}/{total} 已填
                      </span>
                    ) : null
                  })()}
                </div>

                {rDialogTasksByMilestone.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">本週沒有指派給你的進行中任務</p>
                ) : (
                  rDialogTasksByMilestone.map(group => (
                    <div key={group.milestone.id} className="space-y-1">
                      {/* Milestone header */}
                      <div className="flex items-center gap-2 px-1">
                        <span className="text-xs font-medium text-muted-foreground">{group.milestone.name}</span>
                        <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0">
                          截止 {new Date(group.milestone.dueDate).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })}
                        </Badge>
                      </div>

                      {/* Task items */}
                      {group.tasks.map(task => {
                        const isSelected = rSelectedTaskId === task.id
                        const hasLogs = rTaskWeekStatus.get(task.id) || false
                        const taskStatus = computeTaskStatus(task, rReportDialogProject!.taskLogs)
                        const isSubtask = !!task.parentId

                        return (
                          <div key={task.id} className="space-y-0">
                            {/* Task row (clickable) */}
                            <button
                              type="button"
                              onClick={() => handleRSelectTask(task.id)}
                              className={cn(
                                'w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border text-left transition-all',
                                isSubtask && 'ml-4',
                                isSelected
                                  ? 'border-primary bg-primary/5 shadow-sm'
                                  : 'border-border hover:bg-muted/50 hover:border-muted-foreground/20',
                              )}
                            >
                              {getStatusDot(taskStatus)}
                              <span className={cn('text-sm flex-1 truncate', isSelected && 'font-medium')}>
                                {task.title}
                              </span>
                              {hasLogs ? (
                                <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-[10px] px-1.5 py-0 shrink-0">
                                  <Check className="h-2.5 w-2.5 mr-0.5" />已填
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground shrink-0">
                                  未填
                                </Badge>
                              )}
                              <ChevronDown className={cn(
                                'h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform',
                                isSelected && 'rotate-180',
                              )} />
                            </button>

                            {/* Expanded: log entry form (matching Gantt chart design) */}
                            {isSelected && (
                              <div className={cn('border border-t-0 rounded-b-lg px-4 py-4 space-y-4 bg-background', isSubtask && 'ml-4')}>
                                {/* Log entry table */}
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
                                        {rLogRows.map((row, idx) => {
                                          const attCount = row.attachments?.length || 0
                                          return (
                                            <tr key={idx} className="border-b border-border last:border-b-0">
                                              <td className="px-1.5 py-1.5 align-top">
                                                <input
                                                  type="date"
                                                  value={row.date}
                                                  onChange={e => {
                                                    const updated = [...rLogRows]
                                                    updated[idx] = { ...updated[idx], date: e.target.value }
                                                    setRLogRows(updated)
                                                  }}
                                                  className="w-full text-xs border rounded-md h-[34px] px-1.5 bg-background"
                                                />
                                                {row.existingLogId && (
                                                  <span className="text-[10px] text-amber-600 dark:text-amber-400 block mt-0.5 px-0.5">已有紀錄</span>
                                                )}
                                                {attCount > 0 && (
                                                  <div className="flex flex-wrap gap-1 mt-1">
                                                    {row.attachments!.map((att, ai) => att.type === 'image' ? (
                                                      <div key={ai} className="relative group/att">
                                                        <a href={att.url} target="_blank" rel="noopener">
                                                          <img src={att.url} alt={att.name} className="h-7 w-7 rounded object-cover border hover:opacity-80" />
                                                        </a>
                                                        <button
                                                          type="button"
                                                          onClick={() => setRPendingDelete({ kind: 'att', rowIdx: idx, attIdx: ai })}
                                                          className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-destructive text-white flex items-center justify-center opacity-0 group-hover/att:opacity-100 transition-opacity"
                                                          title="刪除附件"
                                                        >
                                                          <X className="h-2 w-2" />
                                                        </button>
                                                      </div>
                                                    ) : (
                                                      <div key={ai} className="relative group/att flex items-center gap-0.5 px-1 py-0.5 rounded bg-muted text-[9px]">
                                                        <a href={att.url} target="_blank" rel="noopener" className="flex items-center gap-0.5 hover:opacity-80 min-w-0">
                                                          <Paperclip className="h-2.5 w-2.5 shrink-0" />
                                                          <span className="truncate max-w-[50px]">{att.name}</span>
                                                        </a>
                                                        <button
                                                          type="button"
                                                          onClick={() => setRPendingDelete({ kind: 'att', rowIdx: idx, attIdx: ai })}
                                                          className="shrink-0 text-muted-foreground/60 hover:text-destructive"
                                                          title="刪除附件"
                                                        >
                                                          <X className="h-2.5 w-2.5" />
                                                        </button>
                                                      </div>
                                                    ))}
                                                  </div>
                                                )}
                                              </td>
                                              <td className="px-1.5 py-1.5 align-top">
                                                <textarea
                                                  ref={(el) => {
                                                    if (!el) return
                                                    el.style.height = '34px'
                                                    el.style.height = Math.min(el.scrollHeight, 240) + 'px'
                                                    el.style.overflowY = el.scrollHeight > 240 ? 'auto' : 'hidden'
                                                  }}
                                                  placeholder="工作內容..."
                                                  value={row.content}
                                                  onChange={e => {
                                                    const updated = [...rLogRows]
                                                    updated[idx] = { ...updated[idx], content: e.target.value }
                                                    setRLogRows(updated)
                                                    e.target.style.height = '34px'
                                                    e.target.style.height = Math.min(e.target.scrollHeight, 240) + 'px'
                                                    e.target.style.overflowY = e.target.scrollHeight > 240 ? 'auto' : 'hidden'
                                                  }}
                                                  rows={1}
                                                  className="w-full min-h-[34px] text-xs resize-none border rounded-md bg-background px-2 py-[7px] focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/30"
                                                />
                                              </td>
                                              <td className="px-0.5 py-1.5 align-top text-center">
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    setRUploadingRowIdx(idx)
                                                    rRowFileInputRef.current?.click()
                                                  }}
                                                  className={cn(
                                                    'inline-flex items-center justify-center w-[34px] h-[34px] border rounded-md bg-background hover:bg-muted transition-colors',
                                                    attCount > 0 ? 'text-primary border-primary/30' : 'text-muted-foreground/40',
                                                  )}
                                                  title="上傳附件"
                                                >
                                                  {rUploadingRowIdx === idx
                                                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                    : <Paperclip className="h-3.5 w-3.5" />
                                                  }
                                                </button>
                                              </td>
                                              <td className="px-0 py-1.5 align-top text-center">
                                                {(row.existingLogId || rLogRows.length > 1) ? (
                                                  <button
                                                    type="button"
                                                    onClick={() => setRPendingDelete({ kind: 'row', idx })}
                                                    className="inline-flex items-center justify-center w-[34px] h-[34px] rounded-md text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors"
                                                    title={row.existingLogId ? '刪除此紀錄' : '移除此列'}
                                                  >
                                                    <Trash2 className="h-3.5 w-3.5" />
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
                                      ref={rRowFileInputRef}
                                      type="file"
                                      multiple
                                      accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip"
                                      className="hidden"
                                      onChange={handleRRowFileSelect}
                                    />

                                    <button
                                      type="button"
                                      className="w-full text-xs text-primary hover:bg-primary/5 transition-colors py-2 border-t border-dashed border-primary/20"
                                      onClick={() => setRLogRows([...rLogRows, { date: '', content: '' }])}
                                    >
                                      + 新增一列
                                    </button>
                                  </div>
                                </div>

                                {/* Divider */}
                                <div className="border-t border-dashed border-border" />

                                {/* Next week plan */}
                                <div className="space-y-1.5">
                                  <div className="flex items-center gap-1.5">
                                    <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />
                                    <span className="text-xs font-medium text-muted-foreground">預計下周工作</span>
                                    <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded">選填</span>
                                  </div>
                                  <Textarea
                                    placeholder="預計下周要做什麼..."
                                    value={rLogNextWeekPlan}
                                    onChange={e => setRLogNextWeekPlan(e.target.value)}
                                    rows={2}
                                    className="min-h-[60px] text-sm resize-y"
                                  />
                                </div>

                                {/* Submit */}
                                <div className="flex justify-end">
                                  <Button
                                    size="sm"
                                    className="gap-1.5 rounded-lg shadow-sm text-sm"
                                    disabled={!rLogRows.some(r => r.content.trim() && r.date) || rLogRows.some(r => r.content.trim() && !r.date) || rSubmittingBatch}
                                    onClick={handleRBatchSubmitLogs}
                                  >
                                    {rSubmittingBatch ? (
                                      <><Loader2 className="h-3.5 w-3.5 animate-spin" />儲存中...</>
                                    ) : (
                                      <><Send className="h-3.5 w-3.5" />提交週報</>
                                    )}
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── A Tab: R Member Reports Dialog ── */}
      <Dialog open={aRReportDialogOpen} onOpenChange={(open) => {
        setARReportDialogOpen(open)
        if (!open) { setARReportProject(null); setARReportFilterUser(null) }
      }}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-6 pt-5 pb-3 border-b shrink-0">
            <DialogTitle className="text-base">R 成員週報</DialogTitle>
            {aRReportProject && (
              <DialogDescription className="text-sm">
                {aRReportProject.name} — 查看執行者提交的工作紀錄
              </DialogDescription>
            )}
          </DialogHeader>
          {aRReportProject && (
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {/* Week picker */}
              <WeekPicker
                value={aRReportWeekOf}
                onChange={(v) => {
                  setARReportWeekOf(v)
                  setARReportFilterUser(null)
                  fetchARReportData(aRReportProject.id, v)
                }}
              />

              {aRReportLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  {/* Clickable member filter badges */}
                  <div className="flex flex-wrap gap-2">
                    {aRReportData.memberStatus.length > 1 && (
                      <button
                        onClick={() => setARReportFilterUser(null)}
                        className={cn(
                          'flex items-center gap-1.5 text-sm px-2.5 py-1 rounded-full border transition-colors cursor-pointer',
                          aRReportFilterUser === null
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-muted/30 text-muted-foreground border-border hover:bg-muted/60',
                        )}
                      >
                        全部
                      </button>
                    )}
                    {aRReportData.memberStatus.map((m: any) => (
                      <button
                        key={m.userId}
                        onClick={() => setARReportFilterUser(prev => prev === m.userId ? null : m.userId)}
                        className={cn(
                          'flex items-center gap-1.5 text-sm px-2.5 py-1 rounded-full border transition-colors cursor-pointer',
                          aRReportFilterUser === m.userId
                            ? 'bg-primary text-primary-foreground border-primary'
                            : m.submitted
                              ? 'bg-green-50 border-green-200 text-green-700 dark:bg-green-950/20 dark:border-green-800 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-950/40'
                              : 'bg-red-50 border-red-200 text-red-700 dark:bg-red-950/20 dark:border-red-800 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950/40',
                        )}
                      >
                        {aRReportFilterUser !== m.userId && (m.submitted ? <UserCheck className="h-3.5 w-3.5" /> : <UserX className="h-3.5 w-3.5" />)}
                        {m.name}
                        {m.submitted && <span className="text-xs opacity-70">({m.reportCount})</span>}
                      </button>
                    ))}
                  </div>

                  {aRReportData.memberStatus.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">此專案尚無 R 角色成員</p>
                  )}

                  {/* Task logs per member */}
                  {aRReportData.memberStatus
                    .filter((m: any) => m.submitted && (!aRReportFilterUser || aRReportFilterUser === m.userId))
                    .map((member: any) => {
                    const memberLogs = aRReportData.reports.filter((r: any) => r.userId === member.userId)
                    // Group by milestone → task
                    const byMilestone = new Map<string, { name: string; logs: any[] }>()
                    for (const log of memberLogs) {
                      const key = log.milestoneId
                      if (!byMilestone.has(key)) byMilestone.set(key, { name: log.milestoneName, logs: [] })
                      byMilestone.get(key)!.logs.push(log)
                    }
                    return (
                      <div key={member.userId} className="border rounded-lg overflow-hidden">
                        <div className="px-4 py-2.5 bg-muted/30 flex items-center gap-2 sticky top-0 z-10">
                          <UserCheck className="h-4 w-4 text-green-600" />
                          <span className="text-sm font-medium">{member.name}</span>
                          <Badge variant="secondary" className="text-xs ml-auto">{memberLogs.length} 筆紀錄</Badge>
                        </div>
                        <div className="max-h-[50vh] overflow-y-auto divide-y">
                          {[...byMilestone.entries()].map(([msId, { name: msName, logs }]) => (
                            <div key={msId} className="px-4 py-3 space-y-3">
                              <div className="text-xs font-semibold text-muted-foreground">{msName}</div>
                              {logs.map((log: any) => {
                                let parsedNextPlans: { date?: string; content: string }[] = []
                                let parsedAttachments: { name: string; url: string; type?: string }[] = []
                                try { if (log.nextPlans) parsedNextPlans = JSON.parse(log.nextPlans) } catch {}
                                try { if (log.attachments) parsedAttachments = JSON.parse(log.attachments) } catch {}
                                return (
                                  <div key={log.id} className="pl-3 border-l-2 border-primary/20 space-y-1.5">
                                    {/* Header: task/subtask label + name + date */}
                                    <div className="flex items-center gap-2">
                                      <Badge variant="outline" className={cn('text-[10px] px-1 py-0 shrink-0', log.isSubtask ? 'border-amber-300 text-amber-600 dark:text-amber-400' : 'border-blue-300 text-blue-600 dark:text-blue-400')}>
                                        {log.isSubtask ? '子任務' : '任務'}
                                      </Badge>
                                      <span className="text-sm font-medium">{log.taskTitle}</span>
                                      <span className="text-[11px] text-muted-foreground ml-auto shrink-0 flex items-center gap-1">
                                        <Calendar className="h-3 w-3" />{log.logDate}
                                      </span>
                                    </div>
                                    {/* Content */}
                                    <p className="text-sm whitespace-pre-wrap leading-relaxed">{log.content}</p>
                                    {/* Next plans */}
                                    {parsedNextPlans.length > 0 && (
                                      <div className="text-xs bg-blue-50 dark:bg-blue-950/20 rounded px-2.5 py-1.5 space-y-0.5">
                                        <span className="font-medium text-blue-700 dark:text-blue-400">下週計畫：</span>
                                        {parsedNextPlans.map((p, pi) => (
                                          <div key={pi} className="text-blue-600 dark:text-blue-400 flex items-start gap-1">
                                            <span className="shrink-0">•</span>
                                            <span>{p.date ? `${p.date} ` : ''}{p.content}</span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                    {/* Attachments */}
                                    {parsedAttachments.length > 0 && (
                                      <div className="flex flex-wrap gap-1.5">
                                        {parsedAttachments.map((att, ai) => (
                                          <a
                                            key={ai}
                                            href={att.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded border bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                                          >
                                            <Paperclip className="h-3 w-3" />{att.name}
                                          </a>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}

                  {/* Show "not submitted" members when filtered */}
                  {aRReportFilterUser && aRReportData.memberStatus.find((m: any) => m.userId === aRReportFilterUser && !m.submitted) && (
                    <p className="text-sm text-muted-foreground text-center py-4">此成員本週尚未提交工作紀錄</p>
                  )}

                  {!aRReportFilterUser && aRReportData.memberStatus.filter((m: any) => m.submitted).length === 0 && aRReportData.memberStatus.length > 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">本週尚無 R 成員提交工作紀錄</p>
                  )}
                </>
              )}
            </div>
          )}
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

      {/* ── Help Dialog ── */}
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader className="pb-3">
            <DialogTitle className="text-xl">我的任務說明</DialogTitle>
            <DialogDescription>依專案角色 (SAPRCI) 分頁顯示您參與的專案任務</DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-blue-500" /> 頁面說明
              </h3>
              <p className="text-sm text-muted-foreground">
                最前面的<span className="text-blue-600 dark:text-blue-400 font-medium">「我的任務週報」</span>分頁，列出所有<span className="font-medium">有指派任務給您</span>的專案（不分角色），可在此填寫工作週報。
                其餘分頁依您在各專案中的<span className="text-blue-600 dark:text-blue-400 font-medium">專案角色 (SAPRCI)</span> 顯示，每個角色頁籤僅列出您擁有該角色的專案。
              </p>
            </div>

            <div>
              <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
                <ListChecks className="h-4 w-4 text-indigo-500" /> 各角色功能
              </h3>
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 text-muted-foreground">
                      <th className="text-left px-3 py-2 font-medium">專案角色</th>
                      <th className="text-center px-3 py-2 font-medium">頁籤</th>
                      <th className="text-left px-3 py-2 font-medium">功能說明</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { role: '', label: '我的任務週報', desc: '填寫「被指派任務」的工作週報（不分角色）', color: 'text-blue-600 dark:text-blue-400', tab: true },
                      { role: 'S', label: '簽核', desc: '查看專案進度、前往審核中心審核延期', color: 'text-emerald-600 dark:text-emerald-400', tab: true },
                      { role: 'A', label: '當責', desc: '查看所有任務進度、查看成員週報、管理任務', color: 'text-amber-600 dark:text-amber-400', tab: true },
                      { role: 'P', label: '採購', desc: '查看及管理專案的預算項目與資本支出', color: 'text-purple-600 dark:text-purple-400', tab: true },
                      { role: 'R', label: '執行', desc: '執行任務；被指派任務時於「我的任務週報」填報', color: 'text-blue-600 dark:text-blue-400', tab: false },
                      { role: 'C', label: '諮詢', desc: '查看專案進度總覽（唯讀）', color: 'text-muted-foreground', tab: true },
                      { role: 'I', label: '知會', desc: '查看專案進度總覽（唯讀）', color: 'text-muted-foreground', tab: true },
                    ].map((r, i) => (
                      <tr key={r.label} className={i % 2 !== 0 ? 'bg-muted/20' : ''}>
                        <td className="px-3 py-2">
                          {r.role ? (
                            <>
                              <span className={cn('font-bold', r.color)}>{r.role}</span>
                              <span className="text-muted-foreground ml-1 text-xs">({r.label})</span>
                            </>
                          ) : (
                            <span className={cn('font-medium', r.color)}>{r.label}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {r.tab ? <span className="text-emerald-600">✓</span> : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{r.desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
                <Info className="h-4 w-4 text-amber-500" /> 操作說明
              </h3>
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 text-muted-foreground">
                      <th className="text-left px-3 py-2 font-medium">操作</th>
                      <th className="text-center px-3 py-2 font-medium">S</th>
                      <th className="text-center px-3 py-2 font-medium">A</th>
                      <th className="text-center px-3 py-2 font-medium">P</th>
                      <th className="text-center px-3 py-2 font-medium">R</th>
                      <th className="text-center px-3 py-2 font-medium">C/I</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { op: '審核延期申請', S: true, A: false, P: false, R: false, CI: false },
                      { op: '查看所有任務進度', S: false, A: true, P: false, R: false, CI: false },
                      { op: '查看成員週報', S: false, A: true, P: false, R: false, CI: false },
                      { op: '管理預算/資本支出', S: false, A: false, P: true, R: false, CI: false },
                      { op: '填寫工作週報（有被指派任務時，不分角色）', S: true, A: true, P: true, R: true, CI: true },
                      { op: '查看專案概況', S: true, A: true, P: true, R: true, CI: true },
                      { op: '前往甘特圖', S: true, A: true, P: true, R: true, CI: true },
                    ].map((r, i) => (
                      <tr key={r.op} className={i % 2 !== 0 ? 'bg-muted/20' : ''}>
                        <td className="px-3 py-2 font-medium">{r.op}</td>
                        <td className="px-3 py-2 text-center">{r.S ? <span className="text-emerald-600">✓</span> : <span className="text-muted-foreground">✗</span>}</td>
                        <td className="px-3 py-2 text-center">{r.A ? <span className="text-emerald-600">✓</span> : <span className="text-muted-foreground">✗</span>}</td>
                        <td className="px-3 py-2 text-center">{r.P ? <span className="text-emerald-600">✓</span> : <span className="text-muted-foreground">✗</span>}</td>
                        <td className="px-3 py-2 text-center">{r.R ? <span className="text-emerald-600">✓</span> : <span className="text-muted-foreground">✗</span>}</td>
                        <td className="px-3 py-2 text-center">{r.CI ? <span className="text-emerald-600">✓</span> : <span className="text-muted-foreground">✗</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </DashboardLayout>
  )
}
