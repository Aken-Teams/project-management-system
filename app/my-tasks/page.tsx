'use client'

import { useState, useMemo } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'
import { Separator } from '@/components/ui/separator'
import { useProjectStore } from '@/lib/project-store'
import { useAuth } from '@/lib/auth-context'
import { type Project, type Task, type TaskLog } from '@/lib/mock-data'
import {
  computeTaskStatus,
  getStatusLabel,
  getStatusColor,
  getDaysUntilDeadline,
  type ComputedTaskStatus,
} from '@/lib/task-utils'
import { cn } from '@/lib/utils'
import {
  ClipboardList,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Calendar,
  ChevronDown,
  FileText,
  Send,
  Flag,
  User,
  Link2,
  CalendarClock,
  CircleCheck,
  Undo2,
} from 'lucide-react'

function getStatusBadge(status: ComputedTaskStatus) {
  return (
    <Badge className={cn('text-[10px] px-1.5 py-0', getStatusColor(status))}>
      {getStatusLabel(status)}
    </Badge>
  )
}

export default function MyTasksPage() {
  const { user } = useAuth()
  const { projects, addTaskLog, completeTask, uncompleteTask, submitDelayRequest } = useProjectStore()

  const [selectedProjectId, setSelectedProjectId] = useState<string>('all')
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(() => new Set())
  const [expandedMilestones, setExpandedMilestones] = useState<Set<string>>(() => new Set())
  const [selectedTask, setSelectedTask] = useState<{ task: Task; project: Project } | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [logContent, setLogContent] = useState('')
  const [logDate, setLogDate] = useState(() => new Date().toISOString().split('T')[0])

  if (!user) return null

  // Get all tasks assigned to the current user, grouped by project
  const userProjectTasks = useMemo(() => {
    const result: { project: Project; tasks: Task[] }[] = []
    projects.forEach(p => {
      const userTasks = p.tasks.filter(t => t.assignee === user.name)
      if (userTasks.length > 0) {
        result.push({ project: p, tasks: userTasks })
      }
    })
    return result
  }, [projects, user.name])

  // Expand all projects by default on first render
  useMemo(() => {
    if (expandedProjects.size === 0 && userProjectTasks.length > 0) {
      const ids = new Set(userProjectTasks.map(({ project }) => project.id))
      setExpandedProjects(ids)
      const msIds = new Set<string>()
      userProjectTasks.forEach(({ project, tasks }) => {
        tasks.forEach(t => msIds.add(`${project.id}-${t.milestoneId}`))
      })
      setExpandedMilestones(msIds)
    }
  }, [userProjectTasks])

  // Apply project filter
  const filteredProjectTasks = selectedProjectId === 'all'
    ? userProjectTasks
    : userProjectTasks.filter(({ project }) => project.id === selectedProjectId)

  // Stats
  const allUserTasks = userProjectTasks.flatMap(({ project, tasks }) =>
    tasks.map(t => ({ task: t, project }))
  )
  const totalTasks = allUserTasks.length
  const completedTasks = allUserTasks.filter(({ task }) => !!task.completedAt).length
  const atRiskTasks = allUserTasks.filter(({ task, project }) => {
    const status = computeTaskStatus(task, project.taskLogs)
    return status === 'at-risk' || status === 'overdue'
  })
  const dueThisWeek = allUserTasks.filter(({ task }) => {
    if (task.completedAt) return false
    const days = getDaysUntilDeadline(task)
    return days >= 0 && days <= 7
  })

  const toggleProject = (id: string) => {
    setExpandedProjects(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleMilestone = (key: string) => {
    setExpandedMilestones(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const openTaskSheet = (task: Task, project: Project) => {
    setSelectedTask({ task, project })
    setLogContent('')
    setLogDate(new Date().toISOString().split('T')[0])
    setSheetOpen(true)
  }

  const handleSubmitLog = () => {
    if (!selectedTask || !logContent.trim()) return
    addTaskLog(selectedTask.project.id, {
      taskId: selectedTask.task.id,
      author: user.name,
      logDate,
      content: logContent.trim(),
    })
    setLogContent('')
  }

  const handleCompleteTask = () => {
    if (!selectedTask) return
    completeTask(selectedTask.project.id, selectedTask.task.id, user.name)
    setSheetOpen(false)
  }

  const handleUncompleteTask = () => {
    if (!selectedTask) return
    uncompleteTask(selectedTask.project.id, selectedTask.task.id)
  }

  const handleRequestExtension = () => {
    if (!selectedTask) return
    const { task, project } = selectedTask
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
    setSheetOpen(false)
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardList className="h-6 w-6" />
            我的任務
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {user.name} — 查看與更新您負責的任務進度
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <FileText className="h-4 w-4" />
                總任務
              </div>
              <div className="text-2xl font-bold mt-1">{totalTasks}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center gap-2 text-sm text-emerald-600">
                <CheckCircle2 className="h-4 w-4" />
                已完成
              </div>
              <div className="text-2xl font-bold mt-1 text-emerald-600">{completedTasks}</div>
            </CardContent>
          </Card>
          <Card className={atRiskTasks.length > 0 ? 'border-amber-300 bg-amber-50/50 dark:bg-amber-950/10' : ''}>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center gap-2 text-sm text-amber-600">
                <AlertTriangle className="h-4 w-4" />
                注意 / 逾期
              </div>
              <div className="text-2xl font-bold mt-1 text-amber-600">{atRiskTasks.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center gap-2 text-sm text-blue-600">
                <CalendarClock className="h-4 w-4" />
                本週到期
              </div>
              <div className="text-2xl font-bold mt-1 text-blue-600">{dueThisWeek.length}</div>
            </CardContent>
          </Card>
        </div>

        {/* Project Filter */}
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
          {userProjectTasks.map(({ project }) => (
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

        {/* At-risk Warning Banner */}
        {atRiskTasks.length > 0 && selectedProjectId === 'all' && (
          <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-950/20 dark:border-amber-700">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm">
              <span className="font-medium text-amber-700 dark:text-amber-400">
                您有 {atRiskTasks.length} 個任務需要注意
              </span>
              <span className="text-amber-600 dark:text-amber-500">
                {' '}— 請盡快提交工作紀錄或考慮申請延期
              </span>
            </div>
          </div>
        )}

        {/* Task List — grouped by project then milestone */}
        {filteredProjectTasks.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">
            目前沒有指派給您的任務
          </Card>
        ) : (
          <div className="space-y-4">
            {filteredProjectTasks.map(({ project, tasks: userTasks }) => {
              const isProjectExpanded = expandedProjects.has(project.id)
              // Group tasks by milestone
              const milestoneGroups = new Map<string, { name: string; tasks: Task[] }>()
              userTasks.forEach(t => {
                const ms = project.milestones.find(m => m.id === t.milestoneId)
                const key = t.milestoneId
                if (!milestoneGroups.has(key)) {
                  milestoneGroups.set(key, { name: ms?.name || '未分類', tasks: [] })
                }
                milestoneGroups.get(key)!.tasks.push(t)
              })

              return (
                <Collapsible
                  key={project.id}
                  open={isProjectExpanded}
                  onOpenChange={() => toggleProject(project.id)}
                >
                  <Card>
                    <CollapsibleTrigger asChild>
                      <div className="flex items-center gap-3 p-4 cursor-pointer hover:bg-muted/50 transition-colors">
                        <ChevronDown className={cn(
                          'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                          !isProjectExpanded && '-rotate-90'
                        )} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-sm">{project.name}</h3>
                            <Badge variant="outline" className="text-[10px]">{project.projectCode}</Badge>
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                            <span>{userTasks.filter(t => !!t.completedAt).length}/{userTasks.length} 完成</span>
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              截止 {new Date(project.endDate).toLocaleDateString('zh-TW')}
                            </span>
                          </div>
                        </div>
                      </div>
                    </CollapsibleTrigger>

                    <CollapsibleContent>
                      <div className="px-4 pb-4 space-y-3">
                        {[...milestoneGroups.entries()].map(([msId, { name, tasks: msTasks }]) => {
                          const msKey = `${project.id}-${msId}`
                          const isMsExpanded = expandedMilestones.has(msKey)
                          const milestone = project.milestones.find(m => m.id === msId)

                          return (
                            <Collapsible
                              key={msId}
                              open={isMsExpanded}
                              onOpenChange={() => toggleMilestone(msKey)}
                            >
                              <CollapsibleTrigger asChild>
                                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/40 cursor-pointer hover:bg-muted/60 transition-colors">
                                  <ChevronDown className={cn(
                                    'h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform',
                                    !isMsExpanded && '-rotate-90'
                                  )} />
                                  <Flag className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                  <span className="text-xs font-medium">{name}</span>
                                  {milestone && (
                                    <span className="text-[10px] text-muted-foreground ml-auto">
                                      截止 {new Date(milestone.dueDate).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })}
                                    </span>
                                  )}
                                </div>
                              </CollapsibleTrigger>

                              <CollapsibleContent>
                                <div className="mt-1 divide-y">
                                  {msTasks.map(task => {
                                    const status = computeTaskStatus(task, project.taskLogs)
                                    const days = getDaysUntilDeadline(task)
                                    const taskLogs = project.taskLogs.filter(l => l.taskId === task.id)

                                    return (
                                      <div
                                        key={task.id}
                                        onClick={() => openTaskSheet(task, project)}
                                        className={cn(
                                          'flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/30 transition-colors rounded-sm',
                                          (status === 'at-risk' || status === 'overdue') && 'bg-amber-50/50 dark:bg-amber-950/10',
                                        )}
                                      >
                                        {/* Status dot */}
                                        {getStatusBadge(status)}

                                        {/* Title */}
                                        <span className={cn(
                                          'text-sm flex-1 min-w-0 truncate',
                                          status === 'completed' && 'text-muted-foreground',
                                        )}>
                                          {task.title}
                                        </span>

                                        {/* Log count */}
                                        {taskLogs.length > 0 && (
                                          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5 shrink-0">
                                            <FileText className="h-3 w-3" />
                                            {taskLogs.length}
                                          </span>
                                        )}

                                        {/* Due date / warning */}
                                        <span className={cn(
                                          'text-xs shrink-0',
                                          status === 'overdue' ? 'text-red-600 font-medium' :
                                          status === 'at-risk' ? 'text-amber-600' :
                                          'text-muted-foreground',
                                        )}>
                                          {status === 'overdue' ? `逾期 ${Math.abs(days)} 天` :
                                           status === 'at-risk' ? `${days} 天後到期` :
                                           status === 'completed' ? task.completedAt && new Date(task.completedAt).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' }) + ' 完成' :
                                           new Date(task.endDate).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })}
                                        </span>
                                      </div>
                                    )
                                  })}
                                </div>
                              </CollapsibleContent>
                            </Collapsible>
                          )
                        })}
                      </div>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>
              )
            })}
          </div>
        )}

        {/* Recent Logs Section */}
        {(() => {
          const recentLogs = userProjectTasks
            .flatMap(({ project }) =>
              project.taskLogs
                .filter(l => l.author === user.name)
                .map(l => ({ log: l, project }))
            )
            .sort((a, b) => new Date(b.log.createdAt).getTime() - new Date(a.log.createdAt).getTime())
            .slice(0, 8)

          if (recentLogs.length === 0) return null

          return (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  最近工作紀錄
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-2">
                  {recentLogs.map(({ log, project }) => {
                    const task = project.tasks.find(t => t.id === log.taskId)
                    return (
                      <div key={log.id} className="flex gap-3 text-sm">
                        <span className="text-xs text-muted-foreground shrink-0 w-16 pt-0.5">
                          {new Date(log.logDate).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })}
                        </span>
                        <div className="min-w-0">
                          <span className="text-xs text-muted-foreground">{task?.title} — </span>
                          <span className="text-xs">{log.content}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )
        })()}
      </div>

      {/* Task Detail Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          {selectedTask && (() => {
            const { task, project } = selectedTask
            const status = computeTaskStatus(task, project.taskLogs)
            const days = getDaysUntilDeadline(task)
            const taskLogs = project.taskLogs
              .filter(l => l.taskId === task.id)
              .sort((a, b) => new Date(b.logDate).getTime() - new Date(a.logDate).getTime())
            const milestone = project.milestones.find(m => m.id === task.milestoneId)
            const isCompleted = !!task.completedAt

            return (
              <>
                <SheetHeader>
                  <SheetTitle className="text-left">{task.title}</SheetTitle>
                  <SheetDescription className="text-left">
                    {project.name} — {milestone?.name}
                  </SheetDescription>
                </SheetHeader>

                <div className="space-y-5 mt-6">
                  {/* Status & Info */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {getStatusBadge(status)}
                    {isCompleted && task.completedAt && (
                      <Badge variant="outline" className="text-xs gap-1">
                        <CircleCheck className="h-3 w-3" />
                        {new Date(task.completedAt).toLocaleDateString('zh-TW')} 完成
                      </Badge>
                    )}
                  </div>

                  {/* At-risk / Overdue Warning */}
                  {status === 'at-risk' && (
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-950/20 dark:border-amber-700">
                      <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                      <div className="text-sm text-amber-700 dark:text-amber-400">
                        此任務將於 <strong>{days} 天後</strong>到期，建議盡快提交工作紀錄。
                      </div>
                    </div>
                  )}
                  {status === 'overdue' && (
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 dark:bg-red-950/20 dark:border-red-700">
                      <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                      <div className="flex-1 text-sm text-red-700 dark:text-red-400">
                        此任務已逾期 <strong>{Math.abs(days)} 天</strong>。請完成任務或申請延期。
                      </div>
                      <Button size="sm" variant="destructive" className="shrink-0 text-xs" onClick={handleRequestExtension}>
                        申請延期
                      </Button>
                    </div>
                  )}

                  {/* Task Details */}
                  <div className="space-y-3">
                    {task.description && (
                      <div>
                        <div className="text-xs font-medium text-muted-foreground mb-1">描述</div>
                        <p className="text-sm">{task.description}</p>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          開始日期
                        </div>
                        <span className="text-sm">{new Date(task.startDate).toLocaleDateString('zh-TW')}</span>
                      </div>
                      <div>
                        <div className={cn(
                          'text-xs font-medium mb-1 flex items-center gap-1',
                          status === 'overdue' ? 'text-red-600' : 'text-muted-foreground',
                        )}>
                          <Flag className="h-3 w-3" />
                          截止日期
                        </div>
                        <span className={cn('text-sm', status === 'overdue' && 'text-red-600 font-medium')}>
                          {new Date(task.endDate).toLocaleDateString('zh-TW')}
                        </span>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Complete / Uncomplete Actions */}
                  {!isCompleted ? (
                    <Button className="w-full gap-2" onClick={handleCompleteTask}>
                      <CircleCheck className="h-4 w-4" />
                      標記為已完成
                    </Button>
                  ) : (
                    <Button variant="outline" className="w-full gap-2 text-muted-foreground" onClick={handleUncompleteTask}>
                      <Undo2 className="h-4 w-4" />
                      取消完成標記
                    </Button>
                  )}

                  {/* Extension Request for at-risk */}
                  {status === 'at-risk' && (
                    <Button variant="outline" className="w-full gap-2 border-amber-300 text-amber-700 hover:bg-amber-50" onClick={handleRequestExtension}>
                      <CalendarClock className="h-4 w-4" />
                      申請延期
                    </Button>
                  )}

                  <Separator />

                  {/* Work Log Form */}
                  {!isCompleted && (
                    <div className="space-y-3">
                      <Label className="text-sm font-medium">撰寫工作紀錄</Label>
                      <div className="flex items-center gap-2">
                        <Label className="text-xs text-muted-foreground shrink-0">工作日期</Label>
                        <input
                          type="date"
                          value={logDate}
                          onChange={e => setLogDate(e.target.value)}
                          className="text-xs border rounded px-2 py-1"
                        />
                      </div>
                      <Textarea
                        placeholder="描述您今天做了什麼..."
                        value={logContent}
                        onChange={e => setLogContent(e.target.value)}
                        rows={3}
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
                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-muted-foreground">
                        歷史紀錄 ({taskLogs.length})
                      </Label>
                      <div className="space-y-2 max-h-[240px] overflow-y-auto">
                        {taskLogs.map(log => (
                          <div key={log.id} className="p-2.5 rounded-lg bg-muted/50 border text-sm">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-medium">{log.author}</span>
                              <span className="text-[10px] text-muted-foreground">
                                {new Date(log.logDate).toLocaleDateString('zh-TW')}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground">{log.content}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )
          })()}
        </SheetContent>
      </Sheet>
    </DashboardLayout>
  )
}
