'use client'

import { useState, useMemo } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Separator } from '@/components/ui/separator'
import { Progress } from '@/components/ui/progress'
import { useProjectStore } from '@/lib/project-store'
import { useAuth } from '@/lib/auth-context'
import { type Project, type Task, type Milestone } from '@/lib/mock-data'
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
  FileText,
  Send,
  Flag,
  CalendarClock,
  CircleCheck,
  Undo2,
  FolderOpen,
  ChevronRight,
} from 'lucide-react'

function getStatusBadge(status: ComputedTaskStatus) {
  return (
    <Badge className={cn('text-[10px] px-1.5 py-0', getStatusColor(status))}>
      {getStatusLabel(status)}
    </Badge>
  )
}

interface MilestoneGroup {
  milestone: Milestone
  project: Project
  tasks: Task[]
  completedCount: number
  totalCount: number
  worstStatus: ComputedTaskStatus
}

export default function MyTasksPage() {
  const { user } = useAuth()
  const { projects, addTaskLog, completeTask, uncompleteTask, submitDelayRequest } = useProjectStore()

  const [selectedProjectId, setSelectedProjectId] = useState<string>('all')
  const [selectedMilestone, setSelectedMilestone] = useState<MilestoneGroup | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  // Task detail in sheet
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null)
  const [logContent, setLogContent] = useState('')
  const [logDate, setLogDate] = useState(() => new Date().toISOString().split('T')[0])

  if (!user) return null

  // Build project → milestone groups for tasks assigned to current user
  const projectMilestoneGroups = useMemo(() => {
    const result: { project: Project; milestones: MilestoneGroup[] }[] = []

    projects.forEach(p => {
      const userTasks = p.tasks.filter(t => t.assignee === user.name)
      if (userTasks.length === 0) return

      // Group tasks by milestone
      const milestoneMap = new Map<string, Task[]>()
      userTasks.forEach(t => {
        const arr = milestoneMap.get(t.milestoneId) || []
        arr.push(t)
        milestoneMap.set(t.milestoneId, arr)
      })

      const milestoneGroups: MilestoneGroup[] = []
      milestoneMap.forEach((tasks, milestoneId) => {
        const milestone = p.milestones.find(m => m.id === milestoneId)
        if (!milestone) return

        const completedCount = tasks.filter(t => !!t.completedAt).length
        const statuses = tasks.map(t => computeTaskStatus(t, p.taskLogs))
        // Worst status priority: overdue > at-risk > on-track > not-started > completed
        const priority: ComputedTaskStatus[] = ['overdue', 'at-risk', 'on-track', 'not-started', 'completed']
        const worstStatus = priority.find(s => statuses.includes(s)) || 'on-track'

        milestoneGroups.push({
          milestone,
          project: p,
          tasks,
          completedCount,
          totalCount: tasks.length,
          worstStatus,
        })
      })

      // Sort milestones by due date
      milestoneGroups.sort((a, b) => new Date(a.milestone.dueDate).getTime() - new Date(b.milestone.dueDate).getTime())

      result.push({ project: p, milestones: milestoneGroups })
    })

    return result
  }, [projects, user.name])

  // Unique projects for filter
  const userProjects = projectMilestoneGroups.map(g => g.project)

  // Filter
  const filteredGroups = selectedProjectId === 'all'
    ? projectMilestoneGroups
    : projectMilestoneGroups.filter(g => g.project.id === selectedProjectId)

  // Stats
  const allTasks = projectMilestoneGroups.flatMap(g => g.milestones.flatMap(m => m.tasks))
  const totalTasks = allTasks.length
  const completedCount = allTasks.filter(t => !!t.completedAt).length
  const atRiskCount = projectMilestoneGroups.flatMap(g =>
    g.milestones.flatMap(m =>
      m.tasks.filter(t => {
        const s = computeTaskStatus(t, m.project.taskLogs)
        return s === 'at-risk' || s === 'overdue'
      })
    )
  ).length

  const openMilestoneSheet = (group: MilestoneGroup) => {
    setSelectedMilestone(group)
    setExpandedTaskId(null)
    setLogContent('')
    setLogDate(new Date().toISOString().split('T')[0])
    setSheetOpen(true)
  }

  const handleSubmitLog = (task: Task, project: Project) => {
    if (!logContent.trim()) return
    addTaskLog(project.id, {
      taskId: task.id,
      author: user.name,
      logDate,
      content: logContent.trim(),
    })
    setLogContent('')
  }

  const handleCompleteTask = (task: Task, project: Project) => {
    completeTask(project.id, task.id, user.name)
  }

  const handleUncompleteTask = (task: Task, project: Project) => {
    uncompleteTask(project.id, task.id)
  }

  const handleRequestExtension = (task: Task, project: Project) => {
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
  }

  function getMilestoneStatusColor(status: ComputedTaskStatus) {
    if (status === 'completed') return 'border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-950/20'
    if (status === 'overdue') return 'border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-950/20'
    if (status === 'at-risk') return 'border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20'
    return ''
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">我的任務</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {user.name} — {totalTasks} 個任務，{completedCount} 已完成{atRiskCount > 0 ? `，${atRiskCount} 需注意` : ''}
          </p>
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

        {/* Project → Milestone Groups */}
        {filteredGroups.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">
            目前沒有指派給您的任務
          </Card>
        ) : (
          filteredGroups.map(({ project, milestones }) => (
            <div key={project.id} className="space-y-3">
              {/* Project Header */}
              <div className="flex items-center gap-2">
                <FolderOpen className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold">{project.name}</h2>
                <span className="text-xs text-muted-foreground">
                  {milestones.reduce((s, m) => s + m.completedCount, 0)}/{milestones.reduce((s, m) => s + m.totalCount, 0)} 任務完成
                </span>
              </div>

              {/* Milestone Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {milestones.map(group => {
                  const progressPct = group.totalCount > 0
                    ? Math.round((group.completedCount / group.totalCount) * 100)
                    : 0

                  return (
                    <Card
                      key={group.milestone.id}
                      onClick={() => openMilestoneSheet(group)}
                      className={cn(
                        'cursor-pointer hover:shadow-md transition-all hover:border-primary/30',
                        getMilestoneStatusColor(group.worstStatus),
                      )}
                    >
                      <CardContent className="p-4 space-y-3">
                        {/* Status + Due */}
                        <div className="flex items-center justify-between">
                          {getStatusBadge(group.worstStatus)}
                          <span className="text-xs text-muted-foreground">
                            {new Date(group.milestone.dueDate).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })}
                          </span>
                        </div>

                        {/* Milestone Name */}
                        <h3 className="text-sm font-medium leading-snug line-clamp-2">
                          {group.milestone.name}
                        </h3>

                        {/* Progress bar + count */}
                        <div className="space-y-1.5">
                          <Progress value={progressPct} className="h-1.5" />
                          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                            <span>{group.completedCount}/{group.totalCount} 任務完成</span>
                            <span className="flex items-center gap-1">
                              詳細 <ChevronRight className="h-3 w-3" />
                            </span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Milestone Detail Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          {selectedMilestone && (() => {
            const { milestone, project, tasks } = selectedMilestone
            const progressPct = tasks.length > 0
              ? Math.round((tasks.filter(t => !!t.completedAt).length / tasks.length) * 100)
              : 0

            return (
              <>
                <SheetHeader>
                  <SheetTitle className="text-left">{milestone.name}</SheetTitle>
                  <SheetDescription className="text-left">
                    {project.name} — 到期日 {new Date(milestone.dueDate).toLocaleDateString('zh-TW')}
                  </SheetDescription>
                </SheetHeader>

                <div className="space-y-4 mt-5">
                  {/* Milestone Progress */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>進度</span>
                      <span>{progressPct}%</span>
                    </div>
                    <Progress value={progressPct} className="h-2" />
                  </div>

                  <Separator />

                  {/* Task List */}
                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-muted-foreground">
                      任務列表 ({tasks.length})
                    </Label>

                    {tasks.map(task => {
                      const status = computeTaskStatus(task, project.taskLogs)
                      const days = getDaysUntilDeadline(task)
                      const isCompleted = !!task.completedAt
                      const isExpanded = expandedTaskId === task.id
                      const taskLogs = project.taskLogs
                        .filter(l => l.taskId === task.id)
                        .sort((a, b) => new Date(b.logDate).getTime() - new Date(a.logDate).getTime())

                      return (
                        <div
                          key={task.id}
                          className={cn(
                            'rounded-lg border',
                            isExpanded ? 'bg-muted/30' : 'hover:bg-muted/20',
                          )}
                        >
                          {/* Task Row (clickable) */}
                          <button
                            className="w-full flex items-center gap-3 p-3 text-left"
                            onClick={() => setExpandedTaskId(isExpanded ? null : task.id)}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                {getStatusBadge(status)}
                                {isCompleted && task.completedAt && (
                                  <span className="text-[10px] text-muted-foreground">
                                    {new Date(task.completedAt).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })} 完成
                                  </span>
                                )}
                                {status === 'overdue' && (
                                  <span className="text-[10px] text-red-600 font-medium">逾期 {Math.abs(days)} 天</span>
                                )}
                                {status === 'at-risk' && (
                                  <span className="text-[10px] text-amber-600">{days} 天後到期</span>
                                )}
                              </div>
                              <span className={cn(
                                'text-sm font-medium',
                                isCompleted && 'text-muted-foreground line-through',
                              )}>
                                {task.title}
                              </span>
                            </div>
                            <ChevronRight className={cn(
                              'h-4 w-4 text-muted-foreground shrink-0 transition-transform',
                              isExpanded && 'rotate-90',
                            )} />
                          </button>

                          {/* Expanded Detail */}
                          {isExpanded && (
                            <div className="px-3 pb-3 space-y-3">
                              <Separator />

                              {/* Task info */}
                              {task.description && (
                                <p className="text-xs text-muted-foreground">{task.description}</p>
                              )}
                              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  {new Date(task.startDate).toLocaleDateString('zh-TW')} ~ {new Date(task.endDate).toLocaleDateString('zh-TW')}
                                </span>
                              </div>

                              {/* Warning */}
                              {status === 'at-risk' && (
                                <div className="flex items-center gap-2 p-2 rounded bg-amber-50 border border-amber-200 dark:bg-amber-950/20 dark:border-amber-700 text-xs text-amber-700 dark:text-amber-400">
                                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                                  即將到期，建議盡快提交紀錄或申請延期
                                </div>
                              )}
                              {status === 'overdue' && (
                                <div className="flex items-center gap-2 p-2 rounded bg-red-50 border border-red-200 dark:bg-red-950/20 dark:border-red-700 text-xs text-red-700 dark:text-red-400">
                                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                                  已逾期 {Math.abs(days)} 天，請完成或申請延期
                                </div>
                              )}

                              {/* Actions */}
                              <div className="flex items-center gap-2 flex-wrap">
                                {!isCompleted ? (
                                  <Button size="sm" className="gap-1 text-xs h-7" onClick={() => handleCompleteTask(task, project)}>
                                    <CircleCheck className="h-3 w-3" />
                                    標記完成
                                  </Button>
                                ) : (
                                  <Button size="sm" variant="outline" className="gap-1 text-xs h-7 text-muted-foreground" onClick={() => handleUncompleteTask(task, project)}>
                                    <Undo2 className="h-3 w-3" />
                                    取消完成
                                  </Button>
                                )}
                                {(status === 'at-risk' || status === 'overdue') && (
                                  <Button size="sm" variant="outline" className="gap-1 text-xs h-7 border-amber-300 text-amber-700 hover:bg-amber-50" onClick={() => handleRequestExtension(task, project)}>
                                    <CalendarClock className="h-3 w-3" />
                                    申請延期
                                  </Button>
                                )}
                              </div>

                              {/* Work Log Form */}
                              {!isCompleted && (
                                <div className="space-y-2 pt-1">
                                  <Label className="text-xs font-medium">撰寫工作紀錄</Label>
                                  <div className="flex items-center gap-2">
                                    <Label className="text-[10px] text-muted-foreground shrink-0">日期</Label>
                                    <input
                                      type="date"
                                      value={logDate}
                                      onChange={e => setLogDate(e.target.value)}
                                      className="text-xs border rounded px-2 py-1"
                                    />
                                  </div>
                                  <Textarea
                                    placeholder="描述您做了什麼..."
                                    value={logContent}
                                    onChange={e => setLogContent(e.target.value)}
                                    rows={2}
                                    className="text-xs"
                                  />
                                  <Button
                                    size="sm"
                                    className="gap-1 text-xs h-7"
                                    disabled={!logContent.trim()}
                                    onClick={() => handleSubmitLog(task, project)}
                                  >
                                    <Send className="h-3 w-3" />
                                    提交
                                  </Button>
                                </div>
                              )}

                              {/* Log History */}
                              {taskLogs.length > 0 && (
                                <div className="space-y-1.5">
                                  <Label className="text-[10px] text-muted-foreground">
                                    紀錄 ({taskLogs.length})
                                  </Label>
                                  <div className="space-y-1.5 max-h-[160px] overflow-y-auto">
                                    {taskLogs.map(log => (
                                      <div key={log.id} className="p-2 rounded bg-muted/50 border text-xs">
                                        <div className="flex justify-between mb-0.5">
                                          <span className="font-medium">{log.author}</span>
                                          <span className="text-[10px] text-muted-foreground">
                                            {new Date(log.logDate).toLocaleDateString('zh-TW')}
                                          </span>
                                        </div>
                                        <p className="text-muted-foreground">{log.content}</p>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </>
            )
          })()}
        </SheetContent>
      </Sheet>
    </DashboardLayout>
  )
}
