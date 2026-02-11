'use client'

import React, { useState, useMemo } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { GanttChart } from '@/components/gantt-chart'
import { TaskDetailSheet } from '@/components/task-detail-sheet'
import { buildDepGraph } from '@/lib/dependency-graph'
import { type Project, type Task, type TaskStatus } from '@/lib/mock-data'
import { cn } from '@/lib/utils'
import {
  ChevronDown,
  Calendar,
  LayoutList,
  GanttChart as GanttIcon,
  AlertTriangle,
  Users,
  Clock,
  Filter,
  Network,
  X,
  ChevronsDownUp,
  ChevronsUpDown,
  TimerReset,
  Loader2,
} from 'lucide-react'

interface MilestoneTaskViewProps {
  project: Project
  onBaselineReset?: () => void
}

export function MilestoneTaskView({ project, onBaselineReset }: MilestoneTaskViewProps) {
  const [viewMode, setViewMode] = useState<'list' | 'gantt'>('list')
  const [expandedMilestones, setExpandedMilestones] = useState<Set<string>>(new Set())
  const [ganttExpandedMs, setGanttExpandedMs] = useState<Set<string>>(new Set())
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [taskDetailOpen, setTaskDetailOpen] = useState(false)
  const [statusFilter, setStatusFilter] = useState<Set<TaskStatus>>(new Set())
  const [assigneeFilter, setAssigneeFilter] = useState<Set<string>>(new Set())
  const [showDependencies, setShowDependencies] = useState(false)
  const [resettingBaseline, setResettingBaseline] = useState(false)
  const [baselineDialogOpen, setBaselineDialogOpen] = useState(false)

  // Check if any milestone has baseline delay
  const hasBaselineDelay = useMemo(() => {
    if (!project.baseline?.length) return false
    return project.milestones.some(ms => {
      const bl = project.baseline.find(b => b.id === ms.id)
      return bl && ms.dueDate > bl.dueDate
    })
  }, [project.milestones, project.baseline])

  // Compute dependency graph (only when toggle is on)
  const nodeMap = useMemo(() => {
    if (!showDependencies) return undefined
    return buildDepGraph(project)
  }, [showDependencies, project])

  // Unique assignees for filter
  const uniqueAssignees = useMemo(() => {
    return [...new Set(project.tasks.map(t => t.assignee).filter(Boolean))].sort()
  }, [project.tasks])

  const toggleStatusFilter = (status: TaskStatus) => {
    setStatusFilter(prev => {
      const next = new Set(prev)
      if (next.has(status)) next.delete(status)
      else next.add(status)
      return next
    })
  }

  const toggleAssigneeFilter = (name: string) => {
    setAssigneeFilter(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const clearFilters = () => {
    setStatusFilter(new Set())
    setAssigneeFilter(new Set())
  }

  const hasFilters = statusFilter.size > 0 || assigneeFilter.size > 0

  // Filter tasks
  const filteredTasks = useMemo(() => {
    return project.tasks.filter(task => {
      const es = task.progress >= 100 ? 'done' : task.status
      if (statusFilter.size > 0 && !statusFilter.has(es as TaskStatus)) return false
      if (assigneeFilter.size > 0 && !assigneeFilter.has(task.assignee)) return false
      return true
    })
  }, [project.tasks, statusFilter, assigneeFilter])

  const tasksByMilestone = useMemo(() => {
    const map = new Map<string, Task[]>()
    project.milestones.forEach(m => {
      map.set(m.id, filteredTasks.filter(t => t.milestoneId === m.id))
    })
    return map
  }, [project.milestones, filteredTasks])

  const toggleMilestone = (id: string) => {
    setExpandedMilestones(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleTaskClick = (task: Task) => {
    setSelectedTask(task)
    setTaskDetailOpen(true)
  }

  const getStatusBadge = (status: TaskStatus) => {
    switch (status) {
      case 'done': return <Badge className="text-[10px] px-1.5 py-0 bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-700">已完成</Badge>
      case 'in-progress': return <Badge className="text-[10px] px-1.5 py-0 bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-700">進行中</Badge>
      case 'blocked': return <Badge variant="destructive" className="text-[10px] px-1.5 py-0">受阻</Badge>
      default: return <Badge className="text-[10px] px-1.5 py-0 bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-600">待辦</Badge>
    }
  }

  const getStatusBadgeLarge = (status: TaskStatus) => {
    switch (status) {
      case 'done': return <Badge className="text-sm bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-700">已完成</Badge>
      case 'in-progress': return <Badge className="text-sm bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-700">進行中</Badge>
      case 'blocked': return <Badge variant="destructive" className="text-sm">受阻</Badge>
      default: return <Badge className="text-sm bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-600">待辦</Badge>
    }
  }

  const getPriorityBadge = (priority: 'low' | 'medium' | 'high') => {
    switch (priority) {
      case 'high': return <Badge className="text-[10px] px-1.5 py-0 bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700">高</Badge>
      case 'medium': return <Badge className="text-[10px] px-1.5 py-0 bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700">中</Badge>
      case 'low': return <Badge className="text-[10px] px-1.5 py-0 bg-slate-100 text-slate-500 border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-600">低</Badge>
    }
  }

  // Normalize: progress >= 100 should always be treated as 'done'
  const effectiveStatus = (task: Task) => {
    if (task.progress >= 100) return 'done' as const
    return task.status
  }

  const isTaskOverdue = (task: Task) => {
    if (effectiveStatus(task) === 'done') return false
    return new Date() > new Date(task.endDate)
  }

  // Sequential color assignment guarantees no collisions
  const AVATAR_COLORS = [
    'bg-blue-600', 'bg-emerald-600', 'bg-violet-600', 'bg-amber-600',
    'bg-rose-600', 'bg-cyan-600', 'bg-pink-600', 'bg-teal-600',
    'bg-indigo-600', 'bg-orange-600', 'bg-lime-600', 'bg-fuchsia-600',
    'bg-sky-600', 'bg-red-600', 'bg-green-600', 'bg-purple-600',
  ]

  const assigneeColorMap = useMemo(() => {
    const map = new Map<string, string>()
    const uniqueAssignees = [...new Set(project.tasks.map(t => t.assignee).filter(Boolean))]
    uniqueAssignees.sort().forEach((name, i) => {
      map.set(name, AVATAR_COLORS[i % AVATAR_COLORS.length])
    })
    return map
  }, [project.tasks])

  const getAvatarColor = (name: string) => {
    return assigneeColorMap.get(name) || AVATAR_COLORS[0]
  }

  const STATUS_OPTIONS: { value: TaskStatus; label: string; color: string }[] = [
    { value: 'in-progress', label: '進行中', color: 'bg-blue-100 text-blue-700 border-blue-300 hover:bg-blue-200' },
    { value: 'done', label: '已完成', color: 'bg-emerald-100 text-emerald-700 border-emerald-300 hover:bg-emerald-200' },
    { value: 'todo', label: '待辦', color: 'bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200' },
    { value: 'blocked', label: '受阻', color: 'bg-red-100 text-red-700 border-red-300 hover:bg-red-200' },
  ]

  return (
    <div className="space-y-4">
      {/* View toggle + Filters */}
      <div className="flex items-center justify-between gap-3 flex-wrap rounded-xl border bg-muted/30 px-4 py-3">
        <div className="flex items-center gap-3 flex-wrap">
          {/* View toggle */}
          <div className="flex items-center gap-1 rounded-lg border p-1">
            <Button
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="sm"
              className="gap-2 h-8"
              onClick={() => setViewMode('list')}
            >
              <LayoutList className="h-4 w-4" />
              列表檢視
            </Button>
            <Button
              variant={viewMode === 'gantt' ? 'default' : 'ghost'}
              size="sm"
              className="gap-2 h-8"
              onClick={() => setViewMode('gantt')}
            >
              <GanttIcon className="h-4 w-4" />
              甘特圖
            </Button>
          </div>

          {/* Status filter */}
          <div className="flex items-center gap-1.5">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            {STATUS_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => toggleStatusFilter(opt.value)}
                className={cn(
                  'text-[11px] px-2 py-0.5 rounded-full border transition-all',
                  statusFilter.has(opt.value)
                    ? cn(opt.color, 'ring-1 ring-offset-1 ring-current font-medium')
                    : 'bg-background text-muted-foreground border-border hover:bg-muted',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Assignee filter */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  'h-7 text-sm gap-1.5',
                  assigneeFilter.size > 0 && 'border-primary text-primary',
                )}
              >
                <Users className="h-3.5 w-3.5" />
                負責人
                {assigneeFilter.size > 0 && (
                  <Badge variant="secondary" className="h-4 px-1 text-[10px] ml-0.5">
                    {assigneeFilter.size}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-2" align="start">
              <div className="space-y-1 max-h-[240px] overflow-y-auto">
                {uniqueAssignees.map(name => (
                  <label
                    key={name}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-muted cursor-pointer text-sm"
                  >
                    <Checkbox
                      checked={assigneeFilter.has(name)}
                      onCheckedChange={() => toggleAssigneeFilter(name)}
                    />
                    {name}
                  </label>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          {/* Clear filters */}
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-sm gap-1 text-muted-foreground"
              onClick={clearFilters}
            >
              <X className="h-3 w-3" />
              清除篩選
            </Button>
          )}
        </div>

        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          {hasFilters && (
            <span className="text-sm">
              {filteredTasks.length}/{project.tasks.length} 任務
            </span>
          )}
          <span className="text-sm">
            {project.milestones.filter(m => m.status === 'done').length}/{project.milestones.length} 里程碑完成
          </span>
          {viewMode === 'gantt' && (
            <Button
              variant="outline"
              size="sm"
              className={cn(
                'h-7 text-sm gap-1.5',
                showDependencies
                  ? 'border-violet-400 bg-violet-50 text-violet-700 hover:bg-violet-100 dark:border-violet-600 dark:bg-violet-950 dark:text-violet-400 dark:hover:bg-violet-900'
                  : '',
              )}
              onClick={() => setShowDependencies(prev => !prev)}
            >
              <Network className="h-3.5 w-3.5" />
              相依關係
            </Button>
          )}
          {hasBaselineDelay && onBaselineReset && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-sm gap-1.5 border-amber-400 bg-amber-50 text-amber-700 hover:bg-amber-100 hover:text-amber-800 dark:border-amber-600 dark:bg-amber-950 dark:text-amber-400 dark:hover:bg-amber-900"
              disabled={resettingBaseline}
              onClick={() => setBaselineDialogOpen(true)}
            >
              {resettingBaseline ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TimerReset className="h-3.5 w-3.5" />}
              重設基線
            </Button>
          )}
          {(() => {
            const currentExpanded = viewMode === 'list' ? expandedMilestones : ganttExpandedMs
            const allExpanded = currentExpanded.size === project.milestones.length
            return (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-sm gap-1.5"
                onClick={() => {
                  const next = allExpanded ? new Set<string>() : new Set(project.milestones.map(m => m.id))
                  if (viewMode === 'list') {
                    setExpandedMilestones(next)
                  } else {
                    setGanttExpandedMs(next)
                  }
                }}
              >
                {allExpanded ? (
                  <>
                    <ChevronsDownUp className="h-3.5 w-3.5" />
                    全部收合
                  </>
                ) : (
                  <>
                    <ChevronsUpDown className="h-3.5 w-3.5" />
                    全部展開
                  </>
                )}
              </Button>
            )
          })()}
        </div>
      </div>

      {viewMode === 'gantt' ? (
        <GanttChart
          tasks={filteredTasks}
          milestones={project.milestones}
          baseline={project.baseline}
          startDate={project.startDate}
          endDate={project.endDate}
          onTaskClick={handleTaskClick}
          expandedMilestoneIds={ganttExpandedMs}
          onExpandedMilestoneIdsChange={setGanttExpandedMs}
          showDependencies={showDependencies}
          nodeMap={nodeMap}
          selectedTaskId={selectedTask?.id ?? null}
        />
      ) : (
        <div className="space-y-3">
          {project.milestones.map((milestone, index) => {
            const tasks = tasksByMilestone.get(milestone.id) || []
            const baselineMs = project.baseline.find(b => b.id === milestone.id)
            const isDelayed = baselineMs && milestone.dueDate > baselineMs.dueDate
            const delayDays = baselineMs
              ? Math.ceil((new Date(milestone.dueDate).getTime() - new Date(baselineMs.dueDate).getTime()) / (1000 * 60 * 60 * 24))
              : 0
            const isExpanded = expandedMilestones.has(milestone.id)
            const doneTasks = tasks.filter(t => t.status === 'done').length
            const overdueTasks = tasks.filter(t => isTaskOverdue(t)).length

            return (
              <Collapsible
                key={milestone.id}
                open={isExpanded}
                onOpenChange={() => toggleMilestone(milestone.id)}
              >
                <Card className={cn(isDelayed && 'border-warning/50')}>
                  <CollapsibleTrigger asChild>
                    <div className="flex items-center gap-3 p-4 cursor-pointer hover:bg-muted/50 transition-colors">
                      <ChevronDown className={cn(
                        'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                        !isExpanded && '-rotate-90'
                      )} />
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-medium">
                        {index + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium text-sm">{milestone.name}</h4>
                          {getStatusBadgeLarge(milestone.status)}
                          {isDelayed && (
                            <Badge variant="secondary" className="bg-warning text-warning-foreground text-sm">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              +{delayDays}天
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1">
                          <Progress value={milestone.progress} className="h-1.5 flex-1 max-w-[200px]" />
                          <span className="text-sm text-muted-foreground">{milestone.progress}%</span>
                          <span className="text-sm text-muted-foreground flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {new Date(milestone.dueDate).toLocaleDateString('zh-TW')}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            {doneTasks}/{tasks.length} 完成
                          </span>
                          {overdueTasks > 0 && (
                            <span className="text-sm text-destructive flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {overdueTasks} 逾期
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </CollapsibleTrigger>

                  <CollapsibleContent>
                    <div className="px-4 pb-3 pt-0">
                      <div className="border-t pt-2">
                        {tasks.length === 0 ? (
                          <div className="text-center py-6 text-sm text-muted-foreground">
                            此里程碑尚未有任務
                          </div>
                        ) : (
                          <div className="divide-y">
                            {/* Table header */}
                            <div className="grid grid-cols-[minmax(0,1fr)_68px_52px_120px_90px] gap-3 px-3 py-2 text-sm font-medium text-muted-foreground uppercase tracking-wider">
                              <span>任務</span>
                              <span>狀態</span>
                              <span>優先</span>
                              <span>負責人</span>
                              <span className="text-right">截止日</span>
                            </div>
                            {tasks.map(task => {
                              const overdue = isTaskOverdue(task)
                              return (
                                <div
                                  key={task.id}
                                  onClick={() => handleTaskClick(task)}
                                  className={cn(
                                    'grid grid-cols-[minmax(0,1fr)_68px_52px_120px_90px] gap-3 items-center px-3 py-2.5 cursor-pointer hover:bg-muted/50 transition-colors rounded-sm',
                                    overdue && 'bg-destructive/5',
                                  )}
                                >
                                  {/* Title + overdue indicator */}
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    {overdue && <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />}
                                    <span className={cn(
                                      'text-sm truncate',
                                      effectiveStatus(task) === 'done' && 'text-muted-foreground',
                                    )}>{task.title}</span>
                                  </div>
                                  {/* Status */}
                                  <div>{getStatusBadge(effectiveStatus(task))}</div>
                                  {/* Priority */}
                                  <div>{getPriorityBadge(task.priority)}</div>
                                  {/* Assignee */}
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <Avatar className="h-6 w-6 shrink-0">
                                      <AvatarFallback className={cn('text-[9px] text-white', getAvatarColor(task.assignee))}>
                                        {task.assignee.split(' ').map(n => n[0]).join('')}
                                      </AvatarFallback>
                                    </Avatar>
                                    <span className="text-sm truncate text-muted-foreground">{task.assignee}</span>
                                  </div>
                                  {/* Due date */}
                                  <div className={cn(
                                    'text-sm text-right',
                                    overdue ? 'text-destructive font-medium' : 'text-muted-foreground',
                                  )}>
                                    {new Date(task.endDate).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            )
          })}
        </div>
      )}

      {/* Task Detail Sheet */}
      <TaskDetailSheet
        open={taskDetailOpen}
        onOpenChange={setTaskDetailOpen}
        task={selectedTask}
        project={project}
        nodeMap={nodeMap ?? new Map()}
        onSelectTask={(t) => {
          setSelectedTask(t)
        }}
      />

      {/* Reset Baseline Dialog */}
      <Dialog open={baselineDialogOpen} onOpenChange={setBaselineDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>重設里程碑基線</DialogTitle>
            <DialogDescription>
              將目前的里程碑日期設為新的基線。原本的基線紀錄會被覆蓋，延遲標示將會清除。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBaselineDialogOpen(false)} disabled={resettingBaseline}>
              取消
            </Button>
            <Button
              disabled={resettingBaseline}
              onClick={async () => {
                setResettingBaseline(true)
                try {
                  const res = await fetch(`/api/projects/${project.id}/reset-baseline`, { method: 'POST' })
                  if (res.ok) {
                    setBaselineDialogOpen(false)
                    onBaselineReset?.()
                  }
                } finally {
                  setResettingBaseline(false)
                }
              }}
            >
              {resettingBaseline && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
              確認重設
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
