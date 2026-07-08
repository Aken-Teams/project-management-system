'use client'

import React, { useState, useMemo, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Checkbox } from '@/components/ui/checkbox'
import { GanttChart } from '@/components/gantt-chart'
import { TaskDetailSheet } from '@/components/task-detail-sheet'
import { MilestoneDetailSheet } from '@/components/milestone-detail-sheet'
import { buildDepGraph } from '@/lib/dependency-graph'
import { type Project, type Task, type Milestone, type TaskStatus } from '@/lib/mock-data'
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
  BarChart3,
  Settings2,
} from 'lucide-react'

interface MilestoneTaskViewProps {
  project: Project
  onTaskUpdate?: () => void
  readOnly?: boolean
}

// 暫時隱藏「列表檢視」，只留甘特圖。改回 true 即可恢復。
const SHOW_LIST_VIEW = false

export function MilestoneTaskView({ project, onTaskUpdate, readOnly }: MilestoneTaskViewProps) {
  const [viewMode, setViewMode] = useState<'list' | 'gantt'>('gantt')
  const [expandedMilestones, setExpandedMilestones] = useState<Set<string>>(new Set())
  // ADR-02: 甘特圖預設全展開（所有里程碑 + 所有有子項的任務，任意深度）。
  const [ganttExpandedMs, setGanttExpandedMs] = useState<Set<string>>(() =>
    new Set(project.milestones.map(m => m.id))
  )
  const [ganttExpandedTasks, setGanttExpandedTasks] = useState<Set<string>>(() =>
    new Set(project.tasks.filter(t => project.tasks.some(c => c.parentId === t.id)).map(t => t.id))
  )
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [taskDetailOpen, setTaskDetailOpen] = useState(false)
  const [selectedMilestone, setSelectedMilestone] = useState<Milestone | null>(null)
  const [milestoneDetailOpen, setMilestoneDetailOpen] = useState(false)
  const [statusFilter, setStatusFilter] = useState<Set<TaskStatus>>(new Set())
  const [assigneeFilter, setAssigneeFilter] = useState<Set<string>>(new Set())
  const [showDependencies, setShowDependencies] = useState(false)
  const [showBaseline, setShowBaseline] = useState(true)
  // Sync selectedTask / selectedMilestone when project data refreshes (e.g. after onTaskUpdate)
  useEffect(() => {
    if (selectedTask) {
      const updated = project.tasks.find(t => t.id === selectedTask.id)
      if (updated) setSelectedTask(updated)
    }
  }, [project.tasks]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (selectedMilestone) {
      const updated = project.milestones.find(m => m.id === selectedMilestone.id)
      if (updated) setSelectedMilestone(updated)
    }
  }, [project.milestones]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // Does a single task match the current status / assignee filters?
  const taskMatchesFilter = (task: Task) => {
    const es = task.progress >= 100 ? 'done' : task.status
    if (statusFilter.size > 0 && !statusFilter.has(es as TaskStatus)) return false
    if (assigneeFilter.size > 0 && !assigneeFilter.has(task.assignee)) return false
    return true
  }

  // ADR-02: filtering must drill through all 6 levels.
  // Keep a task if it matches, OR any of its descendants matches — so the
  // whole ancestor path down to a deep match stays visible.
  // Returns null when no filter is active (= keep everything).
  const keptTaskIds = useMemo<Set<string> | null>(() => {
    if (!hasFilters) return null
    const childrenOf = new Map<string, Task[]>()
    for (const t of project.tasks) {
      if (t.parentId) {
        const arr = childrenOf.get(t.parentId)
        if (arr) arr.push(t)
        else childrenOf.set(t.parentId, [t])
      }
    }
    const kept = new Set<string>()
    const visit = (task: Task): boolean => {
      let anyChildKept = false
      for (const c of childrenOf.get(task.id) || []) {
        if (visit(c)) anyChildKept = true
      }
      if (taskMatchesFilter(task) || anyChildKept) {
        kept.add(task.id)
        return true
      }
      return false
    }
    for (const t of project.tasks) {
      if (!t.parentId) visit(t)
    }
    return kept
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.tasks, statusFilter, assigneeFilter, hasFilters])

  // Count of tasks (any level) that actually match — for the "X/Y 任務" label.
  const matchedCount = useMemo(() => {
    if (!hasFilters) return project.tasks.length
    return project.tasks.filter(taskMatchesFilter).length
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.tasks, statusFilter, assigneeFilter, hasFilters])

  // Top-level kept tasks (for list view + per-milestone grouping).
  const filteredTasks = useMemo(() => {
    return project.tasks.filter(t => !t.parentId && (!keptTaskIds || keptTaskIds.has(t.id)))
  }, [project.tasks, keptTaskIds])

  // For Gantt chart: every kept task at any depth (matches + their ancestors).
  const ganttFilteredTasks = useMemo(() => {
    if (!keptTaskIds) return project.tasks
    return project.tasks.filter(t => keptTaskIds.has(t.id))
  }, [project.tasks, keptTaskIds])

  // For Gantt chart: only milestones that still contain a kept task.
  const ganttFilteredMilestones = useMemo(() => {
    if (!keptTaskIds) return project.milestones
    const msWithKept = new Set<string>()
    for (const t of project.tasks) {
      if (keptTaskIds.has(t.id) && t.milestoneId) msWithKept.add(t.milestoneId)
    }
    return project.milestones.filter(m => msWithKept.has(m.id))
  }, [project.milestones, project.tasks, keptTaskIds])

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

  const handleMilestoneClick = (milestone: Milestone) => {
    setSelectedMilestone(milestone)
    setMilestoneDetailOpen(true)
  }

  const getStatusBadge = (status: DisplayStatus) => {
    switch (status) {
      case 'done': return <Badge variant="outline" className="text-xs px-2 py-0.5 bg-emerald-100 text-emerald-700 border-emerald-300 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-700 dark:hover:bg-emerald-900/50">已完成</Badge>
      case 'in-progress': return <Badge variant="outline" className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 border-blue-300 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-700 dark:hover:bg-blue-900/50">進行中</Badge>
      case 'overdue-not-started': return <Badge variant="outline" className="text-xs px-2 py-0.5 bg-orange-100 text-orange-700 border-orange-300 hover:bg-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-700 dark:hover:bg-orange-900/50">逾期未開始</Badge>
      case 'blocked': return <Badge variant="outline" className="text-xs px-2 py-0.5 bg-red-100 text-red-700 border-red-300 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700 dark:hover:bg-red-900/50">受阻</Badge>
      default: return <Badge variant="outline" className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-600 dark:hover:bg-slate-700">待辦</Badge>
    }
  }

  const getStatusBadgeLarge = (status: DisplayStatus) => {
    switch (status) {
      case 'done': return <Badge variant="outline" className="text-sm bg-emerald-100 text-emerald-700 border-emerald-300 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-700 dark:hover:bg-emerald-900/50">已完成</Badge>
      case 'in-progress': return <Badge variant="outline" className="text-sm bg-blue-100 text-blue-700 border-blue-300 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-700 dark:hover:bg-blue-900/50">進行中</Badge>
      case 'overdue-not-started': return <Badge variant="outline" className="text-sm bg-orange-100 text-orange-700 border-orange-300 hover:bg-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-700 dark:hover:bg-orange-900/50">逾期未開始</Badge>
      case 'blocked': return <Badge variant="outline" className="text-sm bg-red-100 text-red-700 border-red-300 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700 dark:hover:bg-red-900/50">受阻</Badge>
      default: return <Badge variant="outline" className="text-sm bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-600 dark:hover:bg-slate-700">待辦</Badge>
    }
  }

  const getPriorityBadge = (priority: 'low' | 'medium' | 'high') => {
    switch (priority) {
      case 'high': return <Badge variant="outline" className="text-xs px-2 py-0.5 bg-red-100 text-red-700 border-red-300 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700 dark:hover:bg-red-900/50">高</Badge>
      case 'medium': return <Badge variant="outline" className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 border-amber-300 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700 dark:hover:bg-amber-900/50">中</Badge>
      case 'low': return <Badge variant="outline" className="text-xs px-2 py-0.5 bg-slate-100 text-slate-500 border-slate-300 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-600 dark:hover:bg-slate-700">低</Badge>
    }
  }

  // Normalize: progress >= 100 should always be treated as 'done'
  // Also detect "overdue-not-started": auto-progressed to in-progress but nobody has done anything
  type DisplayStatus = TaskStatus | 'overdue-not-started'
  const displayStatus = (task: Task): DisplayStatus => {
    if (task.progress >= 100) return 'done' as const
    if (task.status === 'in-progress' && task.progress === 0) {
      const hasLogs = project.taskLogs.some(tl => tl.taskId === task.id)
      if (!hasLogs) return 'overdue-not-started'
    }
    if (task.progress > 0 && task.status === 'todo') return 'in-progress' as const
    return task.status
  }
  // Keep effectiveStatus for logic that only cares about raw status (overdue check etc.)
  const effectiveStatus = (task: Task) => {
    if (task.progress >= 100) return 'done' as const
    if (task.progress > 0 && task.status === 'todo') return 'in-progress' as const
    return task.status
  }

  const isTaskOverdue = (task: Task) => {
    if (effectiveStatus(task) === 'done') return false
    return new Date() > new Date(task.endDate)
  }

  // Detect milestones where tasks should have started but nobody reported any progress
  const isMilestoneNoActivity = (milestoneId: string, tasks: Task[]) => {
    if (tasks.length === 0) return false
    const today = new Date()
    const hasStartedTasks = tasks.some(t => new Date(t.startDate) <= today)
    if (!hasStartedTasks) return false
    const allZeroProgress = tasks.every(t => t.progress === 0)
    if (!allZeroProgress) return false
    const hasLogs = project.taskLogs.some(tl => tasks.some(t => t.id === tl.taskId))
    return !hasLogs
  }

  // Pre-compute set of milestone IDs with no activity (for Gantt chart prop)
  const noActivityMilestoneIds = useMemo(() => {
    const ids = new Set<string>()
    for (const ms of project.milestones) {
      const msTasks = project.tasks.filter(t => t.milestoneId === ms.id && !t.parentId)
      if (isMilestoneNoActivity(ms.id, msTasks)) ids.add(ms.id)
    }
    return ids
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.milestones, project.tasks, project.taskLogs])

  // Pre-compute set of task IDs that are "overdue not started" (for Gantt chart orange bars)
  const overdueNotStartedTaskIds = useMemo(() => {
    const ids = new Set<string>()
    for (const t of project.tasks) {
      if (displayStatus(t) === 'overdue-not-started') ids.add(t.id)
    }
    return ids
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.tasks, project.taskLogs])

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

  // ADR-02: recursively render a task and its descendants (up to 6 levels) in list view.
  const listCols = readOnly
    ? 'grid-cols-[minmax(0,1fr)_80px_85px_52px_120px_90px]'
    : 'grid-cols-[minmax(0,1fr)_80px_85px_52px_120px_90px_60px]'
  const renderListTask = (task: Task, depth: number): React.ReactNode => {
    const overdue = isTaskOverdue(task)
    const children = project.tasks.filter(t => t.parentId === task.id)
    return (
      <div key={task.id}>
        <div
          onClick={() => handleTaskClick(task)}
          className={cn(`grid ${listCols} gap-3 items-center px-3 ${depth === 0 ? 'py-2.5' : 'py-2'} cursor-pointer hover:bg-muted/50 transition-colors rounded-sm`, overdue && 'bg-destructive/5')}
        >
          <div className="flex items-center gap-1.5 min-w-0" style={{ paddingLeft: `${depth * 20}px` }}>
            {depth > 0 && <span className="text-muted-foreground/30 text-xs select-none">└</span>}
            {overdue && <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />}
            <span className={cn('text-sm truncate', effectiveStatus(task) === 'done' && 'text-muted-foreground')}>{task.title}</span>
            {children.length > 0 && (
              <span className="text-[10px] text-muted-foreground bg-muted rounded-full px-1.5 py-0.5 shrink-0">
                {children.filter(s => s.progress >= 100 || s.status === 'done').length}/{children.length}
              </span>
            )}
          </div>
          <div>{getStatusBadge(displayStatus(task))}</div>
          <div className="flex items-center gap-1.5">
            <Progress value={task.progress} className="h-1.5 flex-1" />
            <span className="text-xs text-muted-foreground tabular-nums w-8 text-right">{task.progress}%</span>
          </div>
          <div className="flex justify-center">{getPriorityBadge(task.priority)}</div>
          <div className="flex items-center gap-1.5 min-w-0">
            {task.assignee ? (
              <>
                <Avatar className="h-6 w-6 shrink-0">
                  <AvatarFallback className={cn('text-[9px] text-white', getAvatarColor(task.assignee))}>
                    {task.assignee.split(' ').map(n => n[0]).join('')}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm truncate text-muted-foreground">{task.assignee}</span>
              </>
            ) : (
              <span className="text-xs text-muted-foreground/50">—</span>
            )}
          </div>
          <div className={cn('text-sm text-right', overdue ? 'text-destructive font-medium' : 'text-muted-foreground')}>
            {new Date(task.endDate).toLocaleDateString('zh-TW', { year: 'numeric', month: 'numeric', day: 'numeric' })}
          </div>
          {!readOnly && (
            <div className="flex justify-center">
              <button
                onClick={(e) => { e.stopPropagation(); handleTaskClick(task) }}
                className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-colors"
              >
                詳細
              </button>
            </div>
          )}
        </div>
        {children.map(c => renderListTask(c, depth + 1))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* View toggle + Filters */}
      <div className="flex items-center justify-between gap-3 flex-wrap rounded-xl border bg-muted/30 px-4 py-3">
        <div className="flex items-center gap-3 flex-wrap">
          {/* View toggle — 列表檢視暫時隱藏，只留甘特圖 */}
          {SHOW_LIST_VIEW && (
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
          )}

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

          {/* Assignee filter — same pill size as the status filters */}
          <Popover>
            <PopoverTrigger asChild>
              <button
                className={cn(
                  'inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border transition-all',
                  assigneeFilter.size > 0
                    ? 'bg-primary/10 text-primary border-primary/40 ring-1 ring-offset-1 ring-primary/40 font-medium'
                    : 'bg-background text-muted-foreground border-border hover:bg-muted',
                )}
              >
                <Users className="h-3 w-3" />
                負責人
                {assigneeFilter.size > 0 && (
                  <span className="ml-0.5 tabular-nums">{assigneeFilter.size}</span>
                )}
              </button>
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
              {matchedCount}/{project.tasks.length} 任務
            </span>
          )}
          <span className="text-sm">
            {project.milestones.filter(m => m.status === 'done').length}/{project.milestones.length} 里程碑完成
          </span>
          {viewMode === 'gantt' && (
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    'h-7 text-sm gap-1.5',
                    showBaseline
                      ? 'border-violet-400 bg-violet-50 text-violet-700 hover:bg-violet-100 dark:border-violet-600 dark:bg-violet-950 dark:text-violet-400 dark:hover:bg-violet-900'
                      : '',
                  )}
                >
                  <Settings2 className="h-3.5 w-3.5" />
                  進階選項
                  {showBaseline && (
                    <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[10px] rounded-full ml-0.5">
                      1
                    </Badge>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-52 p-3">
                <div className="space-y-3">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <Checkbox checked={showBaseline} onCheckedChange={(v) => setShowBaseline(!!v)} />
                    <BarChart3 className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-sm">Plan / Actual</span>
                  </label>
                </div>
              </PopoverContent>
            </Popover>
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
                  if (allExpanded) {
                    // Collapse all
                    if (viewMode === 'list') {
                      setExpandedMilestones(new Set())
                    } else {
                      setGanttExpandedMs(new Set())
                      setGanttExpandedTasks(new Set())
                    }
                  } else {
                    // Expand all milestones + all parent tasks with subtasks
                    const allMs = new Set(project.milestones.map(m => m.id))
                    if (viewMode === 'list') {
                      setExpandedMilestones(allMs)
                    } else {
                      setGanttExpandedMs(allMs)
                      const parentTaskIds = new Set(
                        project.tasks.filter(t => !t.parentId && project.tasks.some(s => s.parentId === t.id)).map(t => t.id)
                      )
                      setGanttExpandedTasks(parentTaskIds)
                    }
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
          tasks={ganttFilteredTasks}
          milestones={ganttFilteredMilestones}
          startDate={project.startDate}
          endDate={project.endDate}
          onTaskClick={handleTaskClick}
          onMilestoneClick={handleMilestoneClick}
          expandedMilestoneIds={ganttExpandedMs}
          onExpandedMilestoneIdsChange={setGanttExpandedMs}
          expandedTaskIds={ganttExpandedTasks}
          onExpandedTaskIdsChange={setGanttExpandedTasks}
          showDependencies={showDependencies}
          showBaseline={showBaseline}
          nodeMap={nodeMap}
          selectedTaskId={selectedTask?.id ?? null}
          noActivityMilestoneIds={noActivityMilestoneIds}
          overdueNotStartedTaskIds={overdueNotStartedTaskIds}
          taskLogs={project.taskLogs}
        />
      ) : (
        <div className="space-y-3">
          {project.milestones.map((milestone, index) => {
            const tasks = tasksByMilestone.get(milestone.id) || []
            const isExpanded = expandedMilestones.has(milestone.id)
            const doneTasks = tasks.filter(t => t.status === 'done').length
            const overdueTasks = tasks.filter(t => isTaskOverdue(t)).length
            const noActivity = isMilestoneNoActivity(milestone.id, tasks)

            return (
              <Collapsible
                key={milestone.id}
                open={isExpanded}
                onOpenChange={() => toggleMilestone(milestone.id)}
              >
                <Card>
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
                          {noActivity && (
                            <Badge variant="secondary" className="bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700 text-sm">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              尚無人回報進度
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
                      {!readOnly && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleMilestoneClick(milestone) }}
                          className="shrink-0 inline-flex items-center gap-1 rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-colors"
                        >
                          查看
                        </button>
                      )}
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
                            <div className={`grid ${readOnly ? 'grid-cols-[minmax(0,1fr)_80px_85px_52px_120px_90px]' : 'grid-cols-[minmax(0,1fr)_80px_85px_52px_120px_90px_60px]'} gap-3 px-3 py-2 text-sm font-medium text-muted-foreground uppercase tracking-wider`}>
                              <span>任務</span>
                              <span>狀態</span>
                              <span>進度</span>
                              <span className="text-center">優先</span>
                              <span>負責人</span>
                              <span className="text-right">截止日</span>
                              {!readOnly && <span className="text-center">查看</span>}
                            </div>
                            {tasks.map(task => renderListTask(task, 0))}
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
        onTaskUpdate={onTaskUpdate}
        readOnly={readOnly}
      />

      {/* Milestone Detail Sheet */}
      <MilestoneDetailSheet
        open={milestoneDetailOpen}
        onOpenChange={setMilestoneDetailOpen}
        milestone={selectedMilestone}
        project={project}
        onTaskClick={(task) => {
          setMilestoneDetailOpen(false)
          setSelectedTask(task)
          setTaskDetailOpen(true)
        }}
        onTaskUpdate={onTaskUpdate}
        readOnly={readOnly}
      />

    </div>
  )
}
