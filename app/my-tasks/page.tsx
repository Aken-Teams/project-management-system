'use client'

import { useState, useMemo } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Progress } from '@/components/ui/progress'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { useProjectStore } from '@/lib/project-store'
import { useAuth } from '@/lib/auth-context'
import { type Project, type Task } from '@/lib/mock-data'
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
  const { projects, addTaskLog, completeTask, uncompleteTask, submitDelayRequest } = useProjectStore()

  const [selectedProjectId, setSelectedProjectId] = useState<string>('all')
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set())
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogTask, setDialogTask] = useState<{ task: Task; project: Project } | null>(null)
  const [logContent, setLogContent] = useState('')
  const [logDate, setLogDate] = useState(() => new Date().toISOString().split('T')[0])

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
    setDialogOpen(true)
  }

  const handleSubmitLog = () => {
    if (!dialogTask || !logContent.trim()) return
    addTaskLog(dialogTask.project.id, {
      taskId: dialogTask.task.id,
      author: user.name,
      logDate,
      content: logContent.trim(),
    })
    setLogContent('')
  }

  const handleCompleteTask = () => {
    if (!dialogTask) return
    completeTask(dialogTask.project.id, dialogTask.task.id, user.name)
    setDialogOpen(false)
  }

  const handleUncompleteTask = () => {
    if (!dialogTask) return
    uncompleteTask(dialogTask.project.id, dialogTask.task.id)
    setDialogOpen(false)
  }

  const handleRequestExtension = () => {
    if (!dialogTask) return
    const { task, project } = dialogTask
    const milestone = project.milestones.find(m => m.id === task.milestoneId)
    if (!milestone) return
    const proposedDate = new Date(task.endDate)
    proposedDate.setDate(proposedDate.getDate() + 14)
    submitDelayRequest(project.id, {
      requestedBy: user.name,
      requestedAt: new Date().toISOString(),
      reason: `任務「${task.title}」需要延期，目前截止日 ${task.endDate} 無法如期完成。`,
      affectedMilestones: [{
        milestoneId: milestone.id,
        originalDate: milestone.dueDate,
        proposedDate: proposedDate.toISOString().split('T')[0],
      }],
      canCatchUp: false,
      supportNeeded: '',
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

        {/* Project Cards with Tasks */}
        {filteredGroups.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">
            目前沒有指派給您的任務
          </Card>
        ) : (
          filteredGroups.map(({ project, milestoneGroups, completedCount: pCompleted, totalCount: pTotal }) => {
            const isCollapsed = collapsedProjects.has(project.id)

            return (
              <Card key={project.id}>
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
                  <span className="text-xs text-muted-foreground">{pCompleted}/{pTotal} 完成</span>
                </CardHeader>

                {!isCollapsed && (
                  <CardContent className="px-4 pb-4 pt-0 space-y-4">
                    {milestoneGroups.map(mg => (
                      <div key={mg.milestoneId}>
                        {/* Milestone section header */}
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-xs font-medium text-muted-foreground">{mg.milestoneName}</span>
                          <Badge variant="outline" className="text-[10px] font-mono px-1">
                            {new Date(mg.milestoneDueDate).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })}
                          </Badge>
                        </div>

                        {/* Tasks — flat list */}
                        <div className="space-y-1">
                          {mg.tasks.map(task => {
                            const status = computeTaskStatus(task, project.taskLogs)
                            const days = getDaysUntilDeadline(task)
                            const isCompleted = !!task.completedAt

                            return (
                              <button
                                key={task.id}
                                onClick={() => openTaskDialog(task, project)}
                                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors border hover:bg-muted/40 hover:border-primary/30"
                              >
                                {getStatusDot(status)}
                                <span className={cn(
                                  'text-sm flex-1 min-w-0 truncate',
                                  isCompleted && 'text-muted-foreground',
                                )}>
                                  {task.title}
                                </span>
                                {status === 'overdue' && (
                                  <Badge variant="secondary" className="text-[10px] bg-destructive/10 text-destructive shrink-0">
                                    逾期 {Math.abs(days)} 天
                                  </Badge>
                                )}
                                {status === 'at-risk' && (
                                  <Badge variant="secondary" className="text-[10px] bg-warning/10 text-warning shrink-0">
                                    剩 {days} 天
                                  </Badge>
                                )}
                                {isCompleted && (
                                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                                )}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                )}
              </Card>
            )
          })
        )}
      </div>

      {/* Task Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
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

            return (
              <>
                <DialogHeader>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(status)}
                    <DialogTitle className={cn('text-left', isCompleted && 'text-muted-foreground')}>
                      {task.title}
                    </DialogTitle>
                  </div>
                  <DialogDescription className="text-left">
                    {project.name}{milestone ? ` — ${milestone.name}` : ''}
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 mt-2">
                  {/* Task Info */}
                  <div className="space-y-2">
                    {task.description && (
                      <p className="text-sm text-muted-foreground">{task.description}</p>
                    )}
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Calendar className="h-3.5 w-3.5" />
                      <span>{new Date(task.startDate).toLocaleDateString('zh-TW')} ~ {new Date(task.endDate).toLocaleDateString('zh-TW')}</span>
                    </div>
                    {isCompleted && task.completedAt && (
                      <div className="flex items-center gap-2 text-xs text-green-600">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span>{new Date(task.completedAt).toLocaleDateString('zh-TW')} 完成</span>
                      </div>
                    )}
                  </div>

                  {/* Warning */}
                  {status === 'at-risk' && (
                    <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-950/20 dark:border-amber-700 text-xs text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      即將到期（剩 {days} 天），建議盡快提交紀錄或申請延期
                    </div>
                  )}
                  {status === 'overdue' && (
                    <div className="flex items-center gap-2 p-2.5 rounded-lg bg-red-50 border border-red-200 dark:bg-red-950/20 dark:border-red-700 text-xs text-red-700 dark:text-red-400">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      已逾期 {Math.abs(days)} 天，請完成任務或申請延期
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {!isCompleted ? (
                      <Button size="sm" className="gap-1.5" onClick={handleCompleteTask}>
                        <CircleCheck className="h-3.5 w-3.5" />
                        標記完成
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" className="gap-1.5 text-muted-foreground" onClick={handleUncompleteTask}>
                        <Undo2 className="h-3.5 w-3.5" />
                        取消完成
                      </Button>
                    )}
                    {(status === 'at-risk' || status === 'overdue') && (
                      <Button size="sm" variant="outline" className="gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-50" onClick={handleRequestExtension}>
                        <CalendarClock className="h-3.5 w-3.5" />
                        申請延期
                      </Button>
                    )}
                  </div>

                  <Separator />

                  {/* Work Log Form */}
                  {!isCompleted && (
                    <div className="space-y-3">
                      <Label className="text-sm font-medium">撰寫工作紀錄</Label>
                      <div className="flex items-center gap-2">
                        <Label className="text-xs text-muted-foreground shrink-0">日期</Label>
                        <input
                          type="date"
                          value={logDate}
                          onChange={e => setLogDate(e.target.value)}
                          className="text-sm border rounded px-2 py-1.5"
                        />
                      </div>
                      <Textarea
                        placeholder="描述您今天做了什麼..."
                        value={logContent}
                        onChange={e => setLogContent(e.target.value)}
                        rows={3}
                        className="text-sm"
                      />
                      <Button
                        size="sm"
                        className="gap-1.5"
                        disabled={!logContent.trim()}
                        onClick={handleSubmitLog}
                      >
                        <Send className="h-3.5 w-3.5" />
                        提交紀錄
                      </Button>
                    </div>
                  )}

                  {/* Log History */}
                  {taskLogs.length > 0 && (
                    <>
                      {!isCompleted && <Separator />}
                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">歷史紀錄 ({taskLogs.length})</Label>
                        <div className="space-y-2 max-h-[200px] overflow-y-auto">
                          {taskLogs.map(log => (
                            <div key={log.id} className="p-2.5 rounded-lg bg-muted/50 border text-sm">
                              <div className="flex justify-between mb-1">
                                <span className="text-xs font-medium">{log.author}</span>
                                <span className="text-xs text-muted-foreground">
                                  {new Date(log.logDate).toLocaleDateString('zh-TW')}
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground">{log.content}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </>
            )
          })()}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  )
}
