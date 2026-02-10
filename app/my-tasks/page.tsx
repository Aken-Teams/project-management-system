'use client'

import { useState, useMemo, useRef, useCallback } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { useProjectStore } from '@/lib/project-store'
import { useAuth } from '@/lib/auth-context'
import { type Project, type Task, type DelayRequest } from '@/lib/mock-data'
import Link from 'next/link'
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
  SkipForward,
  HelpCircle,
  ExternalLink,
} from 'lucide-react'

function getStatusDot(status: ComputedTaskStatus) {
  const colors: Record<ComputedTaskStatus, string> = {
    completed: 'bg-green-500',
    'on-track': 'bg-blue-500',
    'at-risk': 'bg-amber-500',
    overdue: 'bg-red-500',
    'not-started': 'bg-gray-300',
  }
  return <div className={cn('h-2 w-2 rounded-full shrink-0', colors[status])} />
}

function getStatusBadge(status: ComputedTaskStatus) {
  return (
    <Badge className={cn('text-[10px] px-1.5 py-0 shrink-0', getStatusColor(status))}>
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

export default function MyTasksPage() {
  const { user } = useAuth()
  const { projects, addTaskLog, completeTask, uncompleteTask, submitDelayRequest, resolveSupport, getUnresolvedSupportRequests } = useProjectStore()

  const [selectedProjectId, setSelectedProjectId] = useState<string>('all')
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set())
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogTask, setDialogTask] = useState<{ task: Task; project: Project } | null>(null)
  const [logContent, setLogContent] = useState('')
  const [logDate, setLogDate] = useState(() => new Date().toISOString().split('T')[0])
  const [showExtensionForm, setShowExtensionForm] = useState(false)
  const [extensionReason, setExtensionReason] = useState('')
  const [extensionDate, setExtensionDate] = useState('')
  const [extensionSupport, setExtensionSupport] = useState('')
  const [showActions, setShowActions] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [attachments, setAttachments] = useState<string[]>([])
  const [supportDialogOpen, setSupportDialogOpen] = useState(false)
  const [supportDialogItem, setSupportDialogItem] = useState<{ project: Project; request: DelayRequest } | null>(null)
  const [supportNotes, setSupportNotes] = useState('')
  const recognitionRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)

  if (!user) return null

  // Build grouped data: project → milestone groups → tasks
  const projectGroups = useMemo(() => {
    const result: { project: Project; milestoneGroups: MilestoneTaskGroup[]; completedCount: number; totalCount: number }[] = []

    projects.forEach(p => {
      const userTasks = p.tasks.filter(t => t.assignee === user.name)
      if (userTasks.length === 0) return

      const milestoneMap = new Map<string, Task[]>()
      userTasks.forEach(t => {
        const arr = milestoneMap.get(t.milestoneId) || []
        arr.push(t)
        milestoneMap.set(t.milestoneId, arr)
      })

      const milestoneGroups: MilestoneTaskGroup[] = []
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

      milestoneGroups.sort((a, b) => new Date(a.milestoneDueDate).getTime() - new Date(b.milestoneDueDate).getTime())

      const completedCount = userTasks.filter(t => !!t.completedAt).length
      result.push({ project: p, milestoneGroups, completedCount, totalCount: userTasks.length })
    })

    return result
  }, [projects, user.name])

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
        return s === 'at-risk' || s === 'overdue'
      })
    )
  ).length
  const onTrackCount = totalTasks - completedCount - atRiskCount

  // Support requests for PM/executive
  const unresolvedSupport = useMemo(() => {
    if (user.role === 'member') return []
    return getUnresolvedSupportRequests()
  }, [user.role, getUnresolvedSupportRequests])

  const handleResolveSupport = () => {
    if (!supportDialogItem) return
    resolveSupport(
      supportDialogItem.project.id,
      supportDialogItem.request.id,
      user.name,
      supportNotes.trim(),
    )
    setSupportDialogOpen(false)
    setSupportDialogItem(null)
    setSupportNotes('')
  }

  const toggleProject = (projectId: string) => {
    setCollapsedProjects(prev => {
      const next = new Set(prev)
      if (next.has(projectId)) next.delete(projectId)
      else next.add(projectId)
      return next
    })
  }

  const openTaskDialog = (task: Task, project: Project) => {
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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'file') => {
    const files = e.target.files
    if (!files) return
    const names = Array.from(files).map(f => `${type === 'image' ? '📷' : '📎'} ${f.name}`)
    setAttachments(prev => [...prev, ...names])
    e.target.value = ''
  }

  const handleSubmitLog = () => {
    if (!dialogTask || !logContent.trim()) return
    const content = attachments.length > 0
      ? `${logContent.trim()}\n\n附件：${attachments.join('、')}`
      : logContent.trim()
    addTaskLog(dialogTask.project.id, {
      taskId: dialogTask.task.id,
      author: user.name,
      logDate,
      content,
    })
    setLogContent('')
    setAttachments([])
    setShowActions(true)
  }

  const handleCompleteTask = () => {
    if (!dialogTask) return
    completeTask(dialogTask.project.id, dialogTask.task.id, user.name)
  }

  const handleUncompleteTask = () => {
    if (!dialogTask) return
    uncompleteTask(dialogTask.project.id, dialogTask.task.id)
  }

  const handleSubmitExtension = () => {
    if (!dialogTask || !extensionReason.trim()) return
    const { task, project } = dialogTask
    const milestone = project.milestones.find(m => m.id === task.milestoneId)
    if (!milestone) return
    const proposedDate = extensionDate || (() => {
      const d = new Date(task.endDate)
      d.setDate(d.getDate() + 14)
      return d.toISOString().split('T')[0]
    })()
    submitDelayRequest(project.id, {
      requestedBy: user.name,
      requestedAt: new Date().toISOString(),
      reason: extensionReason.trim(),
      affectedMilestones: [{
        milestoneId: milestone.id,
        originalDate: milestone.dueDate,
        proposedDate,
      }],
      canCatchUp: false,
      supportNeeded: extensionSupport.trim(),
    })
    setDialogOpen(false)
  }

  // Fresh task data for dialog
  const currentDialogTask = dialogTask
    ? projects.find(p => p.id === dialogTask.project.id)?.tasks.find(t => t.id === dialogTask.task.id)
    : null
  const currentDialogProject = dialogTask
    ? projects.find(p => p.id === dialogTask.project.id)
    : null

  return (
    <DashboardLayout>
      <div className="space-y-4">
        {/* Page Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">我的任務</h1>
          <p className="text-sm text-muted-foreground mt-1">{user.name} 的任務總覽</p>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-muted-foreground">總任務</span>
              <ListChecks className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="text-2xl font-bold">{totalTasks}</div>
            <p className="text-xs text-muted-foreground mt-1">{userProjects.length} 個專案</p>
          </Card>
          <Card className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-muted-foreground">已完成</span>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            </div>
            <div className="text-2xl font-bold text-green-600">{completedCount}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {totalTasks > 0 ? Math.round((completedCount / totalTasks) * 100) : 0}% 完成率
            </p>
          </Card>
          <Card className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-muted-foreground">進行中</span>
              <Clock className="h-4 w-4 text-blue-500" />
            </div>
            <div className="text-2xl font-bold text-blue-600">{onTrackCount}</div>
            <p className="text-xs text-muted-foreground mt-1">正常進行</p>
          </Card>
          <Card className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-muted-foreground">需注意</span>
              <AlertCircle className="h-4 w-4 text-amber-500" />
            </div>
            <div className="text-2xl font-bold text-amber-600">{atRiskCount}</div>
            <p className="text-xs text-muted-foreground mt-1">即將到期或逾期</p>
          </Card>
        </div>

        {/* Support Needs — PM/Executive only */}
        {unresolvedSupport.length > 0 && (
          <Card className="border-amber-200 bg-amber-50/30 dark:border-amber-900 dark:bg-amber-950/10">
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <HelpCircle className="h-4 w-4 text-amber-500" />
                待處理的支援需求
                <Badge className="bg-amber-100 text-amber-700 border-amber-300 text-xs ml-1">
                  {unresolvedSupport.length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3 pt-0 space-y-2">
              {unresolvedSupport.map(({ project, request }) => (
                <div key={request.id} className="flex items-start gap-3 p-3 rounded-lg border bg-background">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/30">
                    <HelpCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{request.requestedBy} 需要協助</span>
                      <Link href={`/projects/${project.id}`}>
                        <Badge variant="outline" className="text-[10px] cursor-pointer hover:bg-muted gap-1">
                          {project.name}
                          <ExternalLink className="h-2.5 w-2.5" />
                        </Badge>
                      </Link>
                    </div>
                    <p className="text-sm text-muted-foreground">{request.supportNeeded}</p>
                    <div className="text-xs text-muted-foreground">
                      延期原因：{request.reason.length > 40 ? request.reason.substring(0, 40) + '...' : request.reason}
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        size="sm"
                        variant="default"
                        className="h-7 text-xs gap-1"
                        onClick={() => {
                          setSupportDialogItem({ project, request })
                          setSupportNotes('')
                          setSupportDialogOpen(true)
                        }}
                      >
                        <CircleCheck className="h-3 w-3" />
                        標記已處理
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Project Filter */}
        {userProjects.length > 1 && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setSelectedProjectId('all')}
              className={cn(
                'text-xs px-3 py-1 rounded-full border transition-all',
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
                  'text-xs px-3 py-1 rounded-full border transition-all',
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
            {filteredGroups.map(({ project, milestoneGroups, completedCount: pCompleted, totalCount: pTotal }) => {
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
                    </CardTitle>
                    <span className="text-xs text-muted-foreground">{pCompleted}/{pTotal}</span>
                  </CardHeader>

                  {!isCollapsed && (
                    <CardContent className="px-4 pb-3 pt-0 flex-1">
                      <div className="divide-y divide-border">
                      {milestoneGroups.map(mg => (
                        <div key={mg.milestoneId} className="py-2 first:pt-0 last:pb-0">
                          {/* Milestone label */}
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-xs font-medium text-muted-foreground">{mg.milestoneName}</span>
                            <Badge variant="outline" className="text-[10px] font-mono px-1">
                              {new Date(mg.milestoneDueDate).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })}
                            </Badge>
                          </div>

                          {/* Tasks — compact lines */}
                          <div className="divide-y divide-border/40">
                            {mg.tasks.map(task => {
                              const status = computeTaskStatus(task, project.taskLogs)
                              const days = getDaysUntilDeadline(task)
                              const isCompleted = !!task.completedAt

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
                                  {status === 'overdue' && (
                                    <span className="text-xs text-destructive font-medium shrink-0">
                                      逾期{Math.abs(days)}天
                                    </span>
                                  )}
                                  {status === 'at-risk' && (
                                    <span className="text-xs text-amber-600 font-medium shrink-0">
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
                      ))}
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

            // Badge text with days info
            const badgeText = (() => {
              if (isCompleted) return '已完成'
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
                        status === 'overdue' ? 'bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400' :
                        status === 'at-risk' ? 'bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400' :
                        'bg-primary/10 text-primary'
                      )}>
                        {isCompleted ? <CheckCircle2 className="h-5 w-5" /> :
                         status === 'overdue' ? <AlertTriangle className="h-5 w-5" /> :
                         status === 'at-risk' ? <AlertCircle className="h-5 w-5" /> :
                         <ListChecks className="h-5 w-5" />}
                      </div>
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                          <DialogTitle className={cn('text-base text-left leading-tight', isCompleted && 'text-muted-foreground')}>
                            {task.title}
                          </DialogTitle>
                          <Badge className={cn('text-[10px] px-1.5 py-0 shrink-0', getStatusColor(status))}>
                            {badgeText}
                          </Badge>
                        </div>
                        <DialogDescription className="text-left text-xs">
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
                          <div className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400">
                            <div className="h-1 w-1 rounded-full bg-blue-500 animate-pulse" />
                            前置任務尚未完成
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
                              <p className="text-xs text-green-600/70 dark:text-green-400/70 mt-0.5">
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
                                      <Badge key={i} variant="secondary" className="text-xs gap-1 rounded-md py-0.5">
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
                                    className="gap-1.5 rounded-lg shadow-sm h-7 px-3 text-xs"
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
                                  className="gap-1.5 text-xs"
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

                            {(status === 'at-risk' || status === 'overdue') ? (
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
                            className="text-xs text-muted-foreground hover:text-foreground w-full text-center py-1 transition-colors"
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
                        <p className="text-xs text-muted-foreground/60 mt-1">提交第一筆紀錄後會顯示在這裡</p>
                      </div>
                    ) : (
                      <div className="py-4 max-h-[320px] overflow-y-auto">
                        <div className="relative pl-6">
                          {/* Timeline line */}
                          <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />

                          <div className="space-y-4">
                            {taskLogs.map((log, i) => (
                              <div key={log.id} className="relative">
                                {/* Timeline dot */}
                                <div className={cn(
                                  'absolute -left-6 top-1 h-3.5 w-3.5 rounded-full border-2 border-background',
                                  i === 0 ? 'bg-primary' : 'bg-muted-foreground/30'
                                )} />
                                <div className="space-y-1">
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-medium">{log.author}</span>
                                    <span className="text-[11px] text-muted-foreground tabular-nums">
                                      {new Date(log.logDate).toLocaleDateString('zh-TW', { year: 'numeric', month: 'short', day: 'numeric' })}
                                    </span>
                                  </div>
                                  <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">{log.content}</p>
                                </div>
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
                            <span className="text-xs font-medium text-muted-foreground">前置任務</span>
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
                            <span className="text-xs font-medium text-muted-foreground">後續任務</span>
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
                      <Label className="text-xs text-muted-foreground">延遲原因 <span className="text-red-500">*</span></Label>
                      <Textarea
                        placeholder="說明延遲的原因..."
                        value={extensionReason}
                        onChange={e => setExtensionReason(e.target.value)}
                        rows={2}
                        className="text-sm mt-1.5 rounded-lg"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">建議新日期</Label>
                      <input
                        type="date"
                        value={extensionDate}
                        onChange={e => setExtensionDate(e.target.value)}
                        className="w-full text-sm border rounded-lg px-2.5 py-1.5 mt-1.5 bg-background"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">需要協助</Label>
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

      {/* Support Resolution Dialog */}
      <Dialog open={supportDialogOpen} onOpenChange={(open) => {
        setSupportDialogOpen(open)
        if (!open) setSupportDialogItem(null)
      }}>
        <DialogContent className="sm:max-w-md">
          {supportDialogItem && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/30">
                    <HelpCircle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <DialogTitle className="text-base">處理支援需求</DialogTitle>
                    <DialogDescription className="text-xs mt-0.5">
                      {supportDialogItem.project.name} — {supportDialogItem.request.requestedBy}
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <div className="p-3 rounded-lg bg-muted/50 border space-y-2">
                  <div className="text-xs font-medium text-muted-foreground">需要的支援</div>
                  <p className="text-sm">{supportDialogItem.request.supportNeeded}</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50 border space-y-2">
                  <div className="text-xs font-medium text-muted-foreground">延遲原因</div>
                  <p className="text-sm">{supportDialogItem.request.reason}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">處理說明</Label>
                  <Textarea
                    placeholder="描述您如何處理此支援需求..."
                    value={supportNotes}
                    onChange={e => setSupportNotes(e.target.value)}
                    rows={3}
                    className="text-sm mt-1.5 rounded-lg"
                  />
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button size="sm" variant="outline" onClick={() => setSupportDialogOpen(false)}>
                  取消
                </Button>
                <Button size="sm" className="gap-1.5" onClick={handleResolveSupport}>
                  <CircleCheck className="h-3.5 w-3.5" />
                  確認已處理
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  )
}
