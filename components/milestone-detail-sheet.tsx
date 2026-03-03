'use client'

import { useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { type Task, type Milestone, type TaskLog, type Project } from '@/lib/mock-data'
import { cn } from '@/lib/utils'
import {
  Calendar,
  CheckCircle2,
  Clock,
  Flag,
  ListChecks,
  TrendingDown,
  TrendingUp,
  Minus,
} from 'lucide-react'

interface MilestoneDetailSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  milestone: Milestone | null
  project: Project
  onTaskClick?: (task: Task) => void
}

const AVATAR_COLORS = [
  'bg-blue-600', 'bg-emerald-600', 'bg-violet-600', 'bg-amber-600',
  'bg-rose-600', 'bg-cyan-600', 'bg-pink-600', 'bg-teal-600',
  'bg-indigo-600', 'bg-orange-600', 'bg-lime-600', 'bg-fuchsia-600',
]

export function MilestoneDetailSheet({
  open,
  onOpenChange,
  milestone,
  project,
  onTaskClick,
}: MilestoneDetailSheetProps) {
  // Tasks belonging to this milestone (parent tasks only)
  const msTasks = useMemo(() => {
    if (!milestone) return []
    return project.tasks.filter(t => t.milestoneId === milestone.id && !t.parentId)
  }, [milestone, project.tasks])

  // All tasks including subtasks for this milestone
  const allMsTasks = useMemo(() => {
    if (!milestone) return []
    return project.tasks.filter(t => t.milestoneId === milestone.id)
  }, [milestone, project.tasks])

  // Earliest log date per task
  const earliestLogDateMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const log of project.taskLogs) {
      const existing = map.get(log.taskId)
      if (!existing || log.logDate < existing) {
        map.set(log.taskId, log.logDate)
      }
    }
    return map
  }, [project.taskLogs])

  // Log count per task
  const logCountMap = useMemo(() => {
    const map = new Map<string, number>()
    for (const log of project.taskLogs) {
      map.set(log.taskId, (map.get(log.taskId) || 0) + 1)
    }
    return map
  }, [project.taskLogs])

  // Assignee color map
  const assigneeColorMap = useMemo(() => {
    const map = new Map<string, string>()
    const uniqueAssignees = [...new Set(project.tasks.map(t => t.assignee).filter(Boolean))]
    uniqueAssignees.sort().forEach((name, i) => {
      map.set(name, AVATAR_COLORS[i % AVATAR_COLORS.length])
    })
    return map
  }, [project.tasks])

  // Computed stats
  const stats = useMemo(() => {
    if (!milestone || msTasks.length === 0) return null

    const doneCount = msTasks.filter(t => t.progress >= 100 || t.status === 'done').length
    const inProgressCount = msTasks.filter(t => t.status === 'in-progress' && t.progress < 100).length
    const blockedCount = msTasks.filter(t => t.status === 'blocked').length
    const todoCount = msTasks.filter(t => t.status === 'todo' && t.progress === 0).length

    // Actual start: earliest log date among all tasks in this milestone
    let actualStart: string | null = null
    for (const t of allMsTasks) {
      const logDate = earliestLogDateMap.get(t.id)
      if (logDate && (!actualStart || logDate < actualStart)) {
        actualStart = logDate
      }
    }

    // Actual end: latest completedAt among parent tasks
    let actualEnd: string | null = null
    for (const t of msTasks) {
      if (t.completedAt && (!actualEnd || t.completedAt > actualEnd)) {
        actualEnd = t.completedAt
      }
    }

    // Planned start: earliest task start date
    const plannedStart = msTasks.reduce((min, t) =>
      new Date(t.startDate).getTime() < new Date(min).getTime() ? t.startDate : min
    , msTasks[0].startDate)

    // Time difference (only if all done)
    const plannedEnd = new Date(milestone.dueDate)
    const diffDays = milestone.progress >= 100 && actualEnd
      ? Math.round((plannedEnd.getTime() - new Date(actualEnd).getTime()) / (1000 * 60 * 60 * 24))
      : null

    return {
      doneCount,
      inProgressCount,
      blockedCount,
      todoCount,
      actualStart,
      actualEnd,
      plannedStart,
      diffDays,
    }
  }, [milestone, msTasks, allMsTasks, earliestLogDateMap])

  if (!milestone) return null

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString('zh-TW', { year: 'numeric', month: 'numeric', day: 'numeric' })

  const effectiveStatus = (task: Task) => {
    if (task.progress >= 100) return 'done' as const
    return task.status
  }

  const isOverdue = (task: Task) => {
    if (effectiveStatus(task) === 'done') return false
    return new Date() > new Date(task.endDate)
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'done': return <Badge className="text-[10px] px-1.5 py-0 bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-700">已完成</Badge>
      case 'in-progress': return <Badge className="text-[10px] px-1.5 py-0 bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-700">進行中</Badge>
      case 'blocked': return <Badge variant="destructive" className="text-[10px] px-1.5 py-0">受阻</Badge>
      default: return <Badge className="text-[10px] px-1.5 py-0 bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-600">待辦</Badge>
    }
  }

  const getMsStatusBadge = (status: string) => {
    switch (status) {
      case 'done': return <Badge className="text-sm bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-700">已完成</Badge>
      case 'in-progress': return <Badge className="text-sm bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-700">進行中</Badge>
      case 'blocked': return <Badge variant="destructive" className="text-sm">受阻</Badge>
      default: return <Badge className="text-sm bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-600">待辦</Badge>
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="pb-4 border-b">
          <div className="flex items-center gap-2">
            <SheetTitle className="text-lg">{milestone.name}</SheetTitle>
            {getMsStatusBadge(milestone.status)}
          </div>
          <SheetDescription className="sr-only">里程碑詳情</SheetDescription>
        </SheetHeader>

        <div className="space-y-5 pt-5">
          {/* Progress section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">整體進度</span>
              <span className="text-sm font-semibold">{milestone.progress}%</span>
            </div>
            <Progress value={milestone.progress} className="h-2.5" />
            <p className="text-xs text-muted-foreground">進度由任務自動計算</p>
          </div>

          {/* Date & Stats grid */}
          <div className="grid grid-cols-2 gap-3">
            {/* Due date */}
            <div className="rounded-lg border p-3 space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Calendar className="h-3.5 w-3.5" />
                到期日
              </div>
              <div className="text-sm font-medium">{fmtDate(milestone.dueDate)}</div>
            </div>

            {/* Task count */}
            <div className="rounded-lg border p-3 space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <ListChecks className="h-3.5 w-3.5" />
                任務統計
              </div>
              <div className="text-sm font-medium">
                {stats?.doneCount ?? 0}/{msTasks.length} 完成
              </div>
            </div>

            {/* Planned period */}
            {stats?.plannedStart && (
              <div className="rounded-lg border p-3 space-y-1">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Flag className="h-3.5 w-3.5" />
                  規劃期間
                </div>
                <div className="text-sm font-medium">
                  {fmtDate(stats.plannedStart)} ~ {fmtDate(milestone.dueDate)}
                </div>
              </div>
            )}

            {/* Actual period */}
            {(stats?.actualStart || stats?.actualEnd) && (
              <div className="rounded-lg border p-3 space-y-1">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  實際期間
                </div>
                <div className="text-sm font-medium">
                  {stats.actualStart ? fmtDate(stats.actualStart) : '—'}
                  {' ~ '}
                  {stats.actualEnd ? fmtDate(stats.actualEnd) : '進行中'}
                </div>
              </div>
            )}
          </div>

          {/* Time difference */}
          {stats?.diffDays !== null && stats?.diffDays !== undefined && (
            <div className={cn(
              'flex items-center gap-2 rounded-lg border p-3',
              stats.diffDays > 0 ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800' :
              stats.diffDays < 0 ? 'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800' :
              'bg-muted/50',
            )}>
              {stats.diffDays > 0 ? (
                <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              ) : stats.diffDays < 0 ? (
                <TrendingDown className="h-4 w-4 text-red-600 dark:text-red-400" />
              ) : (
                <Minus className="h-4 w-4 text-muted-foreground" />
              )}
              <span className={cn(
                'text-sm font-medium',
                stats.diffDays > 0 ? 'text-emerald-700 dark:text-emerald-400' :
                stats.diffDays < 0 ? 'text-red-700 dark:text-red-400' : '',
              )}>
                {stats.diffDays > 0 ? `提前 ${stats.diffDays} 天完成` :
                 stats.diffDays < 0 ? `延後 ${Math.abs(stats.diffDays)} 天完成` :
                 '準時完成'}
              </span>
            </div>
          )}

          {/* Status breakdown */}
          {stats && (
            <div className="flex items-center gap-2 flex-wrap">
              {stats.inProgressCount > 0 && (
                <Badge className="text-xs bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-700">
                  進行中 {stats.inProgressCount}
                </Badge>
              )}
              {stats.doneCount > 0 && (
                <Badge className="text-xs bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-700">
                  已完成 {stats.doneCount}
                </Badge>
              )}
              {stats.blockedCount > 0 && (
                <Badge variant="destructive" className="text-xs">
                  受阻 {stats.blockedCount}
                </Badge>
              )}
              {stats.todoCount > 0 && (
                <Badge className="text-xs bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-600">
                  待辦 {stats.todoCount}
                </Badge>
              )}
            </div>
          )}

          {/* Task list */}
          <div className="space-y-1">
            <h3 className="text-sm font-medium mb-2">任務列表</h3>
            {msTasks.length === 0 ? (
              <div className="text-center py-6 text-sm text-muted-foreground">
                此里程碑尚未有任務
              </div>
            ) : (
              <div className="space-y-1">
                {msTasks.map(task => {
                  const subtasks = project.tasks.filter(t => t.parentId === task.id)
                  const overdue = isOverdue(task)
                  const actualStartStr = earliestLogDateMap.get(task.id)
                  const logCount = logCountMap.get(task.id) || 0

                  return (
                    <div key={task.id}>
                      <div
                        className={cn(
                          'flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors',
                          overdue && 'border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-950/20',
                        )}
                        onClick={() => onTaskClick?.(task)}
                      >
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              'text-sm font-medium truncate',
                              effectiveStatus(task) === 'done' && 'text-muted-foreground line-through',
                            )}>
                              {task.title}
                            </span>
                            {getStatusBadge(effectiveStatus(task))}
                            {subtasks.length > 0 && (
                              <span className="text-[10px] text-muted-foreground bg-muted rounded-full px-1.5 py-0.5 shrink-0">
                                {subtasks.filter(s => s.progress >= 100 || s.status === 'done').length}/{subtasks.length}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            {task.assignee && (
                              <div className="flex items-center gap-1">
                                <Avatar className="h-4 w-4">
                                  <AvatarFallback className={cn('text-[7px] text-white', assigneeColorMap.get(task.assignee) || AVATAR_COLORS[0])}>
                                    {task.assignee.split(' ').map(n => n[0]).join('')}
                                  </AvatarFallback>
                                </Avatar>
                                {task.assignee}
                              </div>
                            )}
                            <span>{fmtDate(task.startDate)} ~ {fmtDate(task.endDate)}</span>
                            {actualStartStr && (
                              <span className="text-blue-600 dark:text-blue-400">
                                實際開始 {fmtDate(actualStartStr)}
                              </span>
                            )}
                            {logCount > 0 && (
                              <span>{logCount} 筆紀錄</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="w-16">
                            <Progress value={task.progress} className="h-1.5" />
                          </div>
                          <span className="text-xs font-medium tabular-nums w-8 text-right">{task.progress}%</span>
                        </div>
                      </div>

                      {/* Subtasks */}
                      {subtasks.map(sub => (
                        <div
                          key={sub.id}
                          className={cn(
                            'flex items-center gap-3 p-2 pl-8 rounded-lg cursor-pointer hover:bg-muted/50 transition-colors ml-3 border-l-2 border-muted',
                            isOverdue(sub) && 'border-l-red-300',
                          )}
                          onClick={() => onTaskClick?.(sub)}
                        >
                          <div className="flex-1 min-w-0 space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className={cn(
                                'text-sm truncate',
                                effectiveStatus(sub) === 'done' && 'text-muted-foreground line-through',
                              )}>
                                {sub.title}
                              </span>
                              {getStatusBadge(effectiveStatus(sub))}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              {sub.assignee && <span>{sub.assignee}</span>}
                              <span>{fmtDate(sub.endDate)}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <div className="w-12">
                              <Progress value={sub.progress} className="h-1" />
                            </div>
                            <span className="text-[10px] font-medium tabular-nums w-7 text-right">{sub.progress}%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
