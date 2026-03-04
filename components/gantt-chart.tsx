'use client'

import { useRef, useState, useCallback, useMemo } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { type Task, type Milestone, type TaskLog } from '@/lib/mock-data'
import { type DepNode } from '@/lib/dependency-graph'
import { GanttDependencyOverlay } from '@/components/gantt-dependency-overlay'
import { cn } from '@/lib/utils'
import {
  ChevronRight,
  ChevronDown,
  AlertTriangle,
  Route,
} from 'lucide-react'

interface GanttChartProps {
  tasks?: Task[]
  milestones?: Milestone[]
  startDate: string
  endDate: string
  onTaskClick?: (task: Task) => void
  onMilestoneClick?: (milestone: Milestone) => void
  expandedMilestoneIds?: Set<string>
  onExpandedMilestoneIdsChange?: (ids: Set<string>) => void
  showDependencies?: boolean
  showBaseline?: boolean
  nodeMap?: Map<string, DepNode>
  selectedTaskId?: string | null
  onTaskHover?: (task: Task | null) => void
  noActivityMilestoneIds?: Set<string>
  overdueNotStartedTaskIds?: Set<string>
  taskLogs?: TaskLog[]
}

const STATUS_COLORS: Record<string, { bg: string; border: string }> = {
  'done': { bg: '#10b981', border: '#059669' },
  'in-progress': { bg: '#3b82f6', border: '#2563eb' },
  'overdue-not-started': { bg: '#f97316', border: '#ea580c' },
  'blocked': { bg: '#ef4444', border: '#dc2626' },
  'todo': { bg: '#94a3b8', border: '#64748b' },
}

// Plan bar colors (upper bar — planned schedule)
const PLAN_COLOR = { bg: '#e2e8f0', border: '#cbd5e1' }       // slate-200/300 — neutral, clearly "plan"

export function GanttChart({ tasks = [], milestones = [], startDate, endDate, onTaskClick, onMilestoneClick, expandedMilestoneIds, onExpandedMilestoneIdsChange, showDependencies, showBaseline, nodeMap, selectedTaskId, onTaskHover, noActivityMilestoneIds, overdueNotStartedTaskIds, taskLogs = [] }: GanttChartProps) {
  const timelineRef = useRef<HTMLDivElement>(null)
  const [hoverX, setHoverX] = useState<number | null>(null)
  const [hoverDate, setHoverDate] = useState<string>('')
  const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null)
  const [taskTooltip, setTaskTooltip] = useState<{ x: number; y: number; task: Task } | null>(null)
  const [msTooltip, setMsTooltip] = useState<{ x: number; y: number; milestone: Milestone; msTasks: Task[] } | null>(null)
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set())

  // Earliest log date per task (used as "actual start date")
  const earliestLogDateMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const log of taskLogs) {
      const existing = map.get(log.taskId)
      if (!existing || log.logDate < existing) {
        map.set(log.taskId, log.logDate)
      }
    }
    return map
  }, [taskLogs])

  // Helper: get actual start date (earliest log) or fall back to planned startDate
  const getActualStart = useCallback((taskId: string, plannedStart: string) => {
    return earliestLogDateMap.get(taskId) || plannedStart
  }, [earliestLogDateMap])

  // Use controlled state if provided, otherwise internal
  const [internalExpandedMs, setInternalExpandedMs] = useState<Set<string>>(new Set())
  const expandedMs = expandedMilestoneIds ?? internalExpandedMs
  const setExpandedMs = onExpandedMilestoneIdsChange ?? setInternalExpandedMs

  const toggleMs = useCallback((msId: string) => {
    const next = new Set(expandedMs)
    if (next.has(msId)) next.delete(msId)
    else next.add(msId)
    setExpandedMs(next)
  }, [expandedMs, setExpandedMs])

  // Auto-detect date range from actual data (including actual start/end dates)
  const allDates = [
    ...tasks.map(t => new Date(t.startDate).getTime()),
    ...tasks.map(t => new Date(t.endDate).getTime()),
    ...tasks.filter(t => t.completedAt).map(t => new Date(t.completedAt!).getTime()),
    ...milestones.map(m => new Date(m.dueDate).getTime()),
    ...[...earliestLogDateMap.values()].map(d => new Date(d).getTime()),
    new Date(startDate).getTime(),
    new Date(endDate).getTime(),
  ]
  const rangeStart = new Date(Math.min(...allDates))
  rangeStart.setDate(1)
  const rangeEnd = new Date(Math.max(...allDates))
  rangeEnd.setMonth(rangeEnd.getMonth() + 1, 0)

  const totalDays = Math.ceil((rangeEnd.getTime() - rangeStart.getTime()) / (1000 * 60 * 60 * 24)) + 1

  // Generate months for header
  const months: { name: string; days: number }[] = []
  const cur = new Date(rangeStart)
  let dayAcc = 0

  while (dayAcc < totalDays) {
    const monthName = cur.toLocaleDateString('zh-TW', { year: 'numeric', month: 'short' })
    const daysInMonth = new Date(cur.getFullYear(), cur.getMonth() + 1, 0).getDate()
    const remaining = daysInMonth - cur.getDate() + 1
    const daysToAdd = Math.min(remaining, totalDays - dayAcc)

    if (daysToAdd > 0) {
      months.push({ name: monthName, days: daysToAdd })
    }

    dayAcc += daysToAdd
    cur.setFullYear(cur.getFullYear(), cur.getMonth() + 1, 1)
  }

  const toPercent = (date: string) => {
    const d = new Date(date)
    const offset = (d.getTime() - rangeStart.getTime()) / (1000 * 60 * 60 * 24)
    return (offset / totalDays) * 100
  }

  const barStyle = (start: string, end: string) => {
    const left = toPercent(start)
    const right = toPercent(end)
    return { left: `${left}%`, width: `${Math.max(right - left, 0.6)}%` }
  }

  // Today line
  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]
  const todayPct = ((today.getTime() - rangeStart.getTime()) / (1000 * 60 * 60 * 24) / totalDays) * 100
  const showToday = todayPct >= 0 && todayPct <= 100

  // Hover crosshair
  const LEFT_COL = 260
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineRef.current) return
    const rect = timelineRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    if (x < LEFT_COL || x > rect.width) {
      setHoverX(null)
      return
    }
    setHoverX(x)
    const timelineWidth = rect.width - LEFT_COL
    const pct = (x - LEFT_COL) / timelineWidth
    const dayOffset = Math.round(pct * totalDays)
    const hoverD = new Date(rangeStart.getTime() + dayOffset * 86400000)
    setHoverDate(hoverD.toLocaleDateString('zh-TW', { month: 'long', day: 'numeric' }))
  }, [totalDays, rangeStart])

  const handleMouseLeave = useCallback(() => {
    setHoverX(null)
  }, [])

  // Group parent tasks by milestone (subtasks rendered under their parent)
  const tasksByMilestone = milestones.map(m => ({
    milestone: m,
    tasks: tasks.filter(t => t.milestoneId === m.id && !t.parentId),
  }))

  // Week grid count
  const weekCount = Math.ceil(totalDays / 7)

  // Helper: compute milestone bar span (planned)
  const getMilestoneBarRange = (ms: Milestone, msTasks: Task[]) => {
    if (msTasks.length === 0) return { start: ms.dueDate, end: ms.dueDate }
    const earliest = msTasks.reduce((min, t) =>
      new Date(t.startDate).getTime() < new Date(min).getTime() ? t.startDate : min
    , msTasks[0].startDate)
    return { start: earliest, end: ms.dueDate }
  }

  // Helper: get actual start for a single task (earliest log date, or completedAt as fallback)
  const getTaskActualStart = useCallback((t: Task): string | null => {
    return earliestLogDateMap.get(t.id) || t.completedAt || null
  }, [earliestLogDateMap])

  // Helper: compute milestone actual start (earliest actual start among its tasks)
  const getMilestoneActualStart = useCallback((msTasks: Task[]) => {
    let earliest: string | null = null
    for (const t of msTasks) {
      const actualStart = getTaskActualStart(t)
      if (actualStart && (!earliest || actualStart < earliest)) {
        earliest = actualStart
      }
    }
    return earliest
  }, [getTaskActualStart])

  const formatDate = (d: string) => {
    return new Date(d).toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' })
  }

  // Normalize: progress >= 100 → done, progress > 0 with todo → in-progress
  const effectiveStatus = (task: Task) => {
    if (task.progress >= 100) return 'done' as const
    if (task.progress > 0 && task.status === 'todo') return 'in-progress' as const
    return task.status
  }

  const isTaskOverdue = (task: Task) => {
    if (effectiveStatus(task) === 'done') return false
    return today > new Date(task.endDate)
  }

  // Time difference label for non-baseline mode (next to percentage)
  const getTimeDiffLabel = (task: { endDate: string; completedAt?: string | null; progress: number; status: string }) => {
    const plannedEnd = new Date(task.endDate)
    if (task.completedAt && (task.progress >= 100 || task.status === 'done')) {
      // Completed: compare actual completion vs planned end
      const actualEnd = new Date(task.completedAt)
      const diff = Math.round((plannedEnd.getTime() - actualEnd.getTime()) / (1000 * 60 * 60 * 24))
      if (diff > 0) return { text: `提前${diff}天`, color: '#10b981' }
      if (diff < 0) return { text: `延後${Math.abs(diff)}天`, color: '#ef4444' }
      return { text: '準時', color: '#10b981' }
    }
    if (task.progress < 100 && task.status !== 'done' && today > plannedEnd) {
      // In-progress & overdue
      const overdueDays = Math.round((today.getTime() - plannedEnd.getTime()) / (1000 * 60 * 60 * 24))
      if (overdueDays > 0) return { text: `逾期${overdueDays}天`, color: '#ef4444' }
    }
    return null
  }

  const handleTaskClick = (task: Task, e: React.MouseEvent) => {
    e.stopPropagation()
    onTaskClick?.(task)
  }

  // Week grid for timeline area
  const WeekGrid = () => (
    <>
      {Array.from({ length: weekCount }).map((_, i) => (
        <div key={i} className="absolute top-0 bottom-0 border-r border-dashed border-muted-foreground/10" style={{ left: `${(i * 7 / totalDays) * 100}%` }} />
      ))}
    </>
  )

  const TodayLine = () => showToday ? (
    <div className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10" style={{ left: `${todayPct}%` }} />
  ) : null

  return (
    <div className="space-y-3">
      <Card className="overflow-x-auto scrollbar-thin">
        <div
          ref={timelineRef}
          className="min-w-[900px] relative select-none"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          {/* Hover crosshair line */}
          {hoverX !== null && (
            <>
              <div
                className="absolute top-0 bottom-0 w-px bg-foreground/20 pointer-events-none z-30"
                style={{ left: hoverX }}
              />
              <div
                className="absolute top-1 pointer-events-none z-30 bg-foreground text-background text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap"
                style={{ left: hoverX + 6 }}
              >
                {hoverDate}
              </div>
            </>
          )}

          {/* Timeline Header */}
          <div className="flex sticky top-0 bg-card z-20 border-b">
            <div className="w-[260px] shrink-0 px-3 py-2 border-r bg-muted/30">
              <span className="text-sm font-medium text-muted-foreground">里程碑 / 任務</span>
            </div>
            <div className="flex-1">
              <div className="flex">
                {months.map((month, i) => (
                  <div
                    key={i}
                    style={{ width: `${(month.days / totalDays) * 100}%` }}
                    className="text-center py-1.5 text-sm font-medium border-r last:border-r-0 bg-muted/30"
                  >
                    {month.name}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Dependency overlay */}
          {showDependencies && nodeMap && (
            <GanttDependencyOverlay
              tasks={tasks}
              milestones={milestones}
              nodeMap={nodeMap}
              expandedMilestoneIds={expandedMs}
              containerRef={timelineRef}
              toPercent={toPercent}
              hoveredTaskId={hoveredTaskId}
              selectedTaskId={selectedTaskId ?? null}
              showBaseline={showBaseline}
            />
          )}

          {/* Milestones (collapsible) */}
          {tasksByMilestone.map(({ milestone, tasks: msTasks }, msIndex) => {
            const expanded = expandedMs.has(milestone.id)
            const msBar = getMilestoneBarRange(milestone, msTasks)
            const colors = STATUS_COLORS[milestone.status] || STATUS_COLORS.todo

            return (
              <div key={milestone.id}>
                {/* Milestone row — stronger background to distinguish from tasks */}
                <div
                  className={cn(
                    'flex items-center border-b cursor-pointer transition-colors',
                    'bg-muted/40 hover:bg-muted/60',
                  )}
                  onClick={() => toggleMs(milestone.id)}
                  onMouseMove={(e) => {
                    setMsTooltip({ x: e.clientX, y: e.clientY - 12, milestone, msTasks })
                  }}
                  onMouseLeave={() => setMsTooltip(null)}
                >
                  <div className="w-[260px] shrink-0 px-3 py-2 border-r">
                    <div className="flex items-center gap-1.5">
                      {msTasks.length > 0 ? (
                        expanded
                          ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                          : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <div className="w-4 shrink-0" />
                      )}
                      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-medium">
                        {msIndex + 1}
                      </div>
                      <span
                        className="text-sm font-semibold truncate hover:underline"
                        onClick={(e) => {
                          if (onMilestoneClick) {
                            e.stopPropagation()
                            onMilestoneClick(milestone)
                          }
                        }}
                      >{milestone.name}</span>
                      <Badge
                        className="text-[10px] px-1.5 py-0 shrink-0 text-white border-0"
                        style={{ backgroundColor: colors.bg }}
                      >
                        {milestone.progress}%
                      </Badge>
                      {noActivityMilestoneIds?.has(milestone.id) && (
                        <Badge className="text-[10px] px-1.5 py-0 shrink-0 bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700">
                          <AlertTriangle className="h-3 w-3 mr-0.5" />
                          尚無人回報
                        </Badge>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground ml-[38px] mt-0.5">
                      到期：{formatDate(milestone.dueDate)}
                    </div>
                  </div>
                  <div className={cn('flex-1 relative', showBaseline ? 'h-14' : 'h-10')}>
                    <WeekGrid />
                    {msTasks.length > 0 && showBaseline ? (() => {
                      const msActualStart = getMilestoneActualStart(msTasks) || msBar.start
                      return (
                      <>
                        {/* Plan bar (upper — dashed if done, solid otherwise) */}
                        <div
                          className="absolute h-3.5 rounded-sm"
                          style={{
                            ...barStyle(msBar.start, milestone.dueDate),
                            top: 4,
                            backgroundColor: milestone.progress >= 100 ? `${PLAN_COLOR.bg}80` : PLAN_COLOR.bg,
                            border: milestone.progress >= 100
                              ? `1px dashed ${PLAN_COLOR.border}`
                              : `1px solid ${PLAN_COLOR.border}`,
                          }}
                        />
                        {/* Actual bar (lower — extends to today for in-progress, to latest completion for done) */}
                        {milestone.progress > 0 && (
                          <div
                            className="absolute h-3.5 rounded-sm"
                            style={{
                              ...barStyle(msActualStart, milestone.progress >= 100
                                ? (msTasks.reduce<string>((latest, t) => t.completedAt && t.completedAt > latest ? t.completedAt : latest, msActualStart) || todayStr)
                                : todayStr),
                              top: 24,
                              backgroundColor: colors.bg,
                            }}
                          />
                        )}
                      </>
                      )
                    })() : msTasks.length > 0 ? (
                      /* Non-baseline milestone: single bar with progress fill */
                      <>
                        <div
                          className="absolute h-3.5 rounded-sm border"
                          style={{
                            ...barStyle(msBar.start, milestone.dueDate),
                            top: 12,
                            backgroundColor: `${colors.bg}30`,
                            borderColor: `${colors.border}50`,
                          }}
                        >
                          {milestone.progress > 0 && (
                            <div
                              className="absolute inset-y-0 left-0 rounded-l-sm"
                              style={{
                                width: `${Math.min(milestone.progress, 100)}%`,
                                backgroundColor: colors.bg,
                                borderRadius: milestone.progress >= 100 ? '0.125rem' : undefined,
                              }}
                            />
                          )}
                        </div>
                        {/* Milestone percentage + time diff */}
                        <span
                          className="absolute text-[10px] font-medium whitespace-nowrap"
                          style={{
                            left: `calc(${parseFloat(barStyle(msBar.start, milestone.dueDate).left) + parseFloat(barStyle(msBar.start, milestone.dueDate).width)}% + 4px)`,
                            top: 13,
                          }}
                        >
                          <span className="text-muted-foreground">{milestone.progress}%</span>
                          {(() => {
                            // Milestone time diff: check if all tasks done
                            const msDone = milestone.progress >= 100
                            const latestCompletion = msTasks.reduce<string | null>((latest, t) => {
                              if (!t.completedAt) return latest
                              return !latest || t.completedAt > latest ? t.completedAt : latest
                            }, null)
                            if (msDone && latestCompletion) {
                              const diff = getTimeDiffLabel({ endDate: milestone.dueDate, completedAt: latestCompletion, progress: 100, status: 'done' })
                              return diff ? <span style={{ color: diff.color }}>{' '}{diff.text}</span> : null
                            }
                            // In-progress milestone overdue
                            if (!msDone && today > new Date(milestone.dueDate)) {
                              const overdueDays = Math.round((today.getTime() - new Date(milestone.dueDate).getTime()) / (1000 * 60 * 60 * 24))
                              if (overdueDays > 0) return <span style={{ color: '#ef4444' }}>{' '}逾期{overdueDays}天</span>
                            }
                            return null
                          })()}
                        </span>
                      </>
                    ) : null}
                    <TodayLine />
                  </div>
                </div>

                {/* Expanded task rows — lighter background for clear distinction */}
                {expanded && msTasks.map((task, ti) => {
                  const taskDisplayStatus = overdueNotStartedTaskIds?.has(task.id) ? 'overdue-not-started' : effectiveStatus(task)
                  const taskColors = STATUS_COLORS[taskDisplayStatus] || STATUS_COLORS.todo
                  const taskOverdue = isTaskOverdue(task)
                  const isCritical = showDependencies && nodeMap?.get(task.id)?.isOnCriticalPath
                  const node = showDependencies ? nodeMap?.get(task.id) : undefined
                  const subtasks = tasks.filter(t => t.parentId === task.id)
                  return (
                    <div key={task.id}>
                    <div
                      data-task-id={task.id}
                      className={cn(
                        'flex items-center border-b transition-colors cursor-pointer',
                        selectedTaskId === task.id
                          ? 'bg-amber-50/60 hover:bg-amber-50 dark:bg-amber-950/20'
                          : ti % 2 === 0
                            ? 'bg-card hover:bg-accent/50'
                            : 'bg-muted/5 hover:bg-accent/50',
                      )}
                      onClick={(e) => handleTaskClick(task, e)}
                      onMouseEnter={() => {
                        setHoveredTaskId(task.id)
                        onTaskHover?.(task)
                      }}
                      onMouseMove={(e) => {
                        setTaskTooltip({ x: e.clientX, y: e.clientY - 12, task })
                      }}
                      onMouseLeave={() => {
                        setHoveredTaskId(null)
                        onTaskHover?.(null)
                        setTaskTooltip(null)
                      }}
                    >
                      <div className="w-[260px] shrink-0 px-3 py-1.5 border-r pl-10">
                        <div className="flex items-center gap-1.5">
                          {subtasks.length > 0 ? (
                            <button
                              className="shrink-0 p-0 hover:bg-muted rounded-sm"
                              onClick={(e) => {
                                e.stopPropagation()
                                setExpandedTasks(prev => {
                                  const next = new Set(prev)
                                  if (next.has(task.id)) next.delete(task.id)
                                  else next.add(task.id)
                                  return next
                                })
                              }}
                            >
                              {expandedTasks.has(task.id)
                                ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                                : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                              }
                            </button>
                          ) : (
                            <div className="w-3.5 shrink-0" />
                          )}
                          <div
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: taskColors.bg }}
                          />
                          <span className={cn(
                            'text-sm truncate',
                            effectiveStatus(task) === 'done' && 'text-muted-foreground',
                            taskOverdue && 'text-red-600 dark:text-red-400',
                          )}>{task.title}</span>
                          {subtasks.length > 0 && (
                            <span className="text-[10px] text-muted-foreground bg-muted rounded-full px-1.5 py-0.5 shrink-0">
                              {subtasks.filter(s => s.progress >= 100 || s.status === 'done').length}/{subtasks.length}
                            </span>
                          )}
                          {taskOverdue && (
                            <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                          )}
                          {isCritical && (
                            <Route className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                          )}
                        </div>
                        <div className="flex items-center gap-2 ml-4">
                          {task.assignee && (
                            <span className="text-sm text-muted-foreground">{task.assignee}</span>
                          )}
                        </div>
                      </div>
                      <div className={cn('flex-1 relative', showBaseline ? 'h-14' : 'h-10')} data-timeline-area>
                        <WeekGrid />
                        {showBaseline ? (
                          <>
                            {/* Plan bar (upper — dashed for completed, solid for in-progress) */}
                            <div
                              className="absolute h-3.5 rounded-sm"
                              style={{
                                ...barStyle(task.startDate, task.endDate),
                                top: 4,
                                backgroundColor: effectiveStatus(task) === 'done' ? `${PLAN_COLOR.bg}80` : PLAN_COLOR.bg,
                                border: effectiveStatus(task) === 'done'
                                  ? `1px dashed ${PLAN_COLOR.border}`
                                  : `1px solid ${PLAN_COLOR.border}`,
                              }}
                            />
                            {/* Actual bar (lower — uses actual start date from earliest log) */}
                            {effectiveStatus(task) === 'done' && task.completedAt ? (
                              <div
                                className="absolute h-3.5 rounded-sm"
                                style={{
                                  ...barStyle(getActualStart(task.id, task.startDate), task.completedAt),
                                  top: 24,
                                  backgroundColor: taskColors.bg,
                                  ...(isCritical ? { boxShadow: '0 0 0 1.5px #64748b' } : {}),
                                }}
                              />
                            ) : task.progress > 0 ? (
                              <div
                                className="absolute h-3.5 rounded-sm"
                                style={{
                                  ...barStyle(getActualStart(task.id, task.startDate), todayStr),
                                  top: 24,
                                  backgroundColor: taskColors.bg,
                                  ...(isCritical ? { boxShadow: '0 0 0 1.5px #64748b' } : {}),
                                }}
                              />
                            ) : null}
                            {/* Percentage label */}
                            <span
                              className="absolute text-[10px] font-medium text-muted-foreground whitespace-nowrap"
                              style={{
                                left: `calc(${parseFloat(barStyle(task.startDate, task.endDate).left) + parseFloat(barStyle(task.startDate, task.endDate).width)}% + 4px)`,
                                top: 5,
                              }}
                            >
                              {task.progress}%
                            </span>
                          </>
                        ) : (
                          /* Non-baseline: simple single bar with progress fill */
                          <>
                            <div
                              className="absolute h-3.5 rounded-sm border"
                              style={{
                                ...barStyle(task.startDate, task.endDate),
                                top: 12,
                                backgroundColor: `${taskColors.bg}30`,
                                borderColor: isCritical ? '#64748b' : `${taskColors.border}50`,
                                ...(isCritical ? { boxShadow: '0 0 0 1.5px #64748b' } : {}),
                              }}
                            >
                              {task.progress > 0 && (
                                <div
                                  className="absolute inset-y-0 left-0 rounded-l-sm"
                                  style={{
                                    width: `${Math.min(task.progress, 100)}%`,
                                    backgroundColor: taskColors.bg,
                                    borderRadius: task.progress >= 100 ? '0.125rem' : undefined,
                                  }}
                                />
                              )}
                            </div>
                            {/* Percentage label + time diff */}
                            <span
                              className="absolute text-[10px] font-medium whitespace-nowrap"
                              style={{
                                left: `calc(${parseFloat(barStyle(task.startDate, task.endDate).left) + parseFloat(barStyle(task.startDate, task.endDate).width)}% + 4px)`,
                                top: 13,
                              }}
                            >
                              <span className="text-muted-foreground">{task.progress}%</span>
                              {(() => {
                                const diff = getTimeDiffLabel(task)
                                return diff ? <span style={{ color: diff.color }}>{' '}{diff.text}</span> : null
                              })()}
                            </span>
                          </>
                        )}
                        <TodayLine />
                      </div>
                    </div>
                    {/* Subtask rows — deeper indent, collapsible */}
                    {expandedTasks.has(task.id) && subtasks.map(sub => {
                      const subDisplayStatus = overdueNotStartedTaskIds?.has(sub.id) ? 'overdue-not-started' : effectiveStatus(sub)
                      const subColors = STATUS_COLORS[subDisplayStatus] || STATUS_COLORS.todo
                      return (
                        <div
                          key={sub.id}
                          data-task-id={sub.id}
                          className={cn(
                            'flex items-center border-b transition-colors cursor-pointer bg-muted/5 hover:bg-accent/50',
                            selectedTaskId === sub.id && 'bg-amber-50/60 hover:bg-amber-50 dark:bg-amber-950/20',
                          )}
                          onClick={(e) => handleTaskClick(sub, e)}
                          onMouseMove={(e) => {
                            setTaskTooltip({ x: e.clientX, y: e.clientY - 12, task: sub })
                          }}
                          onMouseLeave={() => setTaskTooltip(null)}
                        >
                          <div className="w-[260px] shrink-0 px-3 py-1 border-r pl-14">
                            <div className="flex items-center gap-1.5">
                              <span className="text-muted-foreground/30 text-xs select-none">└</span>
                              <div
                                className="w-1.5 h-1.5 rounded-full shrink-0"
                                style={{ backgroundColor: subColors.bg }}
                              />
                              <span className={cn(
                                'text-sm truncate',
                                effectiveStatus(sub) === 'done' && 'text-muted-foreground',
                              )}>{sub.title}</span>
                            </div>
                            {sub.assignee && (
                              <span className="text-xs text-muted-foreground ml-6">{sub.assignee}</span>
                            )}
                          </div>
                          <div className={cn('flex-1 relative', showBaseline ? 'h-14' : 'h-10')} data-timeline-area>
                            <WeekGrid />
                            {showBaseline ? (
                              <>
                                {/* Plan bar (upper — dashed for completed, solid for in-progress) */}
                                <div
                                  className="absolute h-3 rounded-sm"
                                  style={{
                                    ...barStyle(sub.startDate, sub.endDate),
                                    top: 5,
                                    backgroundColor: effectiveStatus(sub) === 'done' ? `${PLAN_COLOR.bg}80` : PLAN_COLOR.bg,
                                    border: effectiveStatus(sub) === 'done'
                                      ? `1px dashed ${PLAN_COLOR.border}`
                                      : `1px solid ${PLAN_COLOR.border}`,
                                  }}
                                />
                                {/* Actual bar (lower — uses actual start date from earliest log) */}
                                {effectiveStatus(sub) === 'done' && sub.completedAt ? (
                                  <div
                                    className="absolute h-3 rounded-sm"
                                    style={{
                                      ...barStyle(getActualStart(sub.id, sub.startDate), sub.completedAt),
                                      top: 24,
                                      backgroundColor: subColors.bg,
                                    }}
                                  />
                                ) : sub.progress > 0 ? (
                                  <div
                                    className="absolute h-3 rounded-sm"
                                    style={{
                                      ...barStyle(getActualStart(sub.id, sub.startDate), todayStr),
                                      top: 24,
                                      backgroundColor: subColors.bg,
                                    }}
                                  />
                                ) : null}
                                {/* Percentage label */}
                                <span
                                  className="absolute text-[10px] font-medium text-muted-foreground whitespace-nowrap"
                                  style={{
                                    left: `calc(${parseFloat(barStyle(sub.startDate, sub.endDate).left) + parseFloat(barStyle(sub.startDate, sub.endDate).width)}% + 4px)`,
                                    top: 5,
                                  }}
                                >
                                  {sub.progress}%
                                </span>
                              </>
                            ) : (
                              /* Non-baseline subtask: simple single bar with progress fill */
                              <>
                                <div
                                  className="absolute h-3 rounded-sm border"
                                  style={{
                                    ...barStyle(sub.startDate, sub.endDate),
                                    top: 12,
                                    backgroundColor: `${subColors.bg}30`,
                                    borderColor: `${subColors.border}50`,
                                  }}
                                >
                                  {sub.progress > 0 && (
                                    <div
                                      className="absolute inset-y-0 left-0 rounded-l-sm"
                                      style={{
                                        width: `${Math.min(sub.progress, 100)}%`,
                                        backgroundColor: subColors.bg,
                                        borderRadius: sub.progress >= 100 ? '0.125rem' : undefined,
                                      }}
                                    />
                                  )}
                                </div>
                                <span
                                  className="absolute text-[10px] font-medium whitespace-nowrap"
                                  style={{
                                    left: `calc(${parseFloat(barStyle(sub.startDate, sub.endDate).left) + parseFloat(barStyle(sub.startDate, sub.endDate).width)}% + 4px)`,
                                    top: 13,
                                  }}
                                >
                                  <span className="text-muted-foreground">{sub.progress}%</span>
                                  {(() => {
                                    const diff = getTimeDiffLabel(sub)
                                    return diff ? <span style={{ color: diff.color }}>{' '}{diff.text}</span> : null
                                  })()}
                                </span>
                              </>
                            )}
                            <TodayLine />
                          </div>
                        </div>
                      )
                    })}
                    </div>
                  )
                })}

                {expanded && msTasks.length === 0 && (
                  <div className="flex items-center border-b bg-card">
                    <div className="w-[260px] shrink-0 px-3 py-1.5 border-r pl-10">
                      <span className="text-sm text-muted-foreground italic">無任務</span>
                    </div>
                    <div className="flex-1 h-10" />
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Task hover tooltip */}
        {taskTooltip && (() => {
          const t = taskTooltip.task
          const isDone = effectiveStatus(t) === 'done'
          const plannedStart = new Date(t.startDate)
          const plannedEnd = new Date(t.endDate)
          const actualStartStr = getTaskActualStart(t)
          const actualStart = actualStartStr ? new Date(actualStartStr) : null
          const actualEnd = t.completedAt ? new Date(t.completedAt) : null
          const diffDays = actualEnd
            ? Math.round((plannedEnd.getTime() - actualEnd.getTime()) / (1000 * 60 * 60 * 24))
            : null
          const fmtDate = (d: Date) => d.toLocaleDateString('zh-TW', { year: 'numeric', month: 'numeric', day: 'numeric' })
          const node = nodeMap?.get(t.id)
          return (
            <div
              className="fixed pointer-events-none z-50 bg-popover border rounded-lg shadow-lg px-3.5 py-2.5 text-sm min-w-[220px]"
              style={{
                left: taskTooltip.x,
                top: taskTooltip.y,
                transform: 'translate(-50%, -100%)',
              }}
            >
              <div className="font-medium mb-1.5 text-foreground">{t.title}</div>
              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
                <span className="text-muted-foreground">負責人</span>
                <span>{t.assignee || '—'}</span>
                <span className="text-muted-foreground">規劃期間</span>
                <span>{fmtDate(plannedStart)} ~ {fmtDate(plannedEnd)}</span>
                {(actualStart || actualEnd) && (
                  <>
                    <span className="text-muted-foreground">實際期間</span>
                    <span>
                      {actualStart ? fmtDate(actualStart) : '—'}
                      {' ~ '}
                      {actualEnd ? fmtDate(actualEnd) : '進行中'}
                    </span>
                  </>
                )}
                <span className="text-muted-foreground">完成度</span>
                <span>{t.progress}%</span>
                {diffDays !== null && (
                  <>
                    <span className="text-muted-foreground">時程差異</span>
                    <span className={diffDays > 0 ? 'text-emerald-600' : diffDays < 0 ? 'text-red-600' : ''}>
                      {diffDays > 0 ? `提前 ${diffDays} 天` : diffDays < 0 ? `延後 ${Math.abs(diffDays)} 天` : '準時完成'}
                    </span>
                  </>
                )}
              </div>
              {showDependencies && node && (node.prerequisites.length > 0 || node.dependents.length > 0) && (
                <div className="flex items-center gap-3 mt-1.5 pt-1.5 border-t text-xs text-muted-foreground">
                  <span>前置 <strong className="text-foreground">{node.prerequisites.length}</strong></span>
                  <span>後續 <strong className="text-foreground">{node.dependents.length}</strong></span>
                  {node.isOnCriticalPath && (
                    <span className="text-amber-600 dark:text-amber-400 flex items-center gap-0.5">
                      <Route className="h-3 w-3" />
                      關鍵路徑
                    </span>
                  )}
                </div>
              )}
            </div>
          )
        })()}

        {/* Milestone hover tooltip */}
        {msTooltip && (() => {
          const ms = msTooltip.milestone
          const msTks = msTooltip.msTasks
          const doneCount = msTks.filter(t => effectiveStatus(t) === 'done').length
          const msActualStartStr = getMilestoneActualStart(msTks)
          const msActualStart = msActualStartStr ? new Date(msActualStartStr) : null
          // Latest completion among tasks (only meaningful when ALL tasks are done)
          const allTasksDone = msTks.length > 0 && msTks.every(t => t.completedAt)
          const latestCompletion = allTasksDone ? msTks.reduce<Date | null>((latest, t) => {
            if (!t.completedAt) return latest
            const d = new Date(t.completedAt)
            return !latest || d > latest ? d : latest
          }, null) : null
          const plannedEnd = new Date(ms.dueDate)
          const diffDays = ms.progress >= 100 && latestCompletion
            ? Math.round((plannedEnd.getTime() - latestCompletion.getTime()) / (1000 * 60 * 60 * 24))
            : null
          const fmtDate = (d: Date) => d.toLocaleDateString('zh-TW', { year: 'numeric', month: 'numeric', day: 'numeric' })
          // Earliest planned start among tasks
          const earliestPlanned = msTks.length > 0
            ? new Date(msTks.reduce((min, t) => new Date(t.startDate).getTime() < new Date(min).getTime() ? t.startDate : min, msTks[0].startDate))
            : null
          return (
            <div
              className="fixed pointer-events-none z-50 bg-popover border rounded-lg shadow-lg px-3.5 py-2.5 text-sm min-w-[220px]"
              style={{
                left: msTooltip.x,
                top: msTooltip.y,
                transform: 'translate(-50%, -100%)',
              }}
            >
              <div className="font-medium mb-1.5 text-foreground">{ms.name}</div>
              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
                <span className="text-muted-foreground">任務數</span>
                <span>{doneCount}/{msTks.length} 完成</span>
                {earliestPlanned && (
                  <>
                    <span className="text-muted-foreground">規劃期間</span>
                    <span>{fmtDate(earliestPlanned)} ~ {fmtDate(plannedEnd)}</span>
                  </>
                )}
                {(msActualStart || latestCompletion) && (
                  <>
                    <span className="text-muted-foreground">實際期間</span>
                    <span>
                      {msActualStart ? fmtDate(msActualStart) : '—'}
                      {' ~ '}
                      {latestCompletion ? fmtDate(latestCompletion) : '進行中'}
                    </span>
                  </>
                )}
                <span className="text-muted-foreground">完成度</span>
                <span>{ms.progress}%</span>
                {diffDays !== null && (
                  <>
                    <span className="text-muted-foreground">時程差異</span>
                    <span className={diffDays > 0 ? 'text-emerald-600' : diffDays < 0 ? 'text-red-600' : ''}>
                      {diffDays > 0 ? `提前 ${diffDays} 天` : diffDays < 0 ? `延後 ${Math.abs(diffDays)} 天` : '準時完成'}
                    </span>
                  </>
                )}
              </div>
            </div>
          )
        })()}
      </Card>

      {/* Legend */}
      <Card className="px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm">
          <span className="font-medium text-muted-foreground">圖例：</span>
          <div className="flex items-center gap-1.5">
            <div className="w-3.5 h-3.5 rounded-sm" style={{ backgroundColor: '#10b981' }} />
            <span>已完成</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3.5 h-3.5 rounded-sm" style={{ backgroundColor: '#3b82f6' }} />
            <span>進行中</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3.5 h-3.5 rounded-sm" style={{ backgroundColor: '#f97316' }} />
            <span>逾期未開始</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3.5 h-3.5 rounded-sm" style={{ backgroundColor: '#94a3b8' }} />
            <span>待辦</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3.5 h-3.5 rounded-sm" style={{ backgroundColor: '#ef4444' }} />
            <span>受阻</span>
          </div>
          {showBaseline && (
            <>
              <span className="text-muted-foreground">|</span>
              <div className="flex items-center gap-1.5">
                <div className="w-3.5 h-2 rounded-sm border" style={{ backgroundColor: PLAN_COLOR.bg, borderColor: PLAN_COLOR.border }} />
                <span>Plan</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3.5 h-2 rounded-sm" style={{ backgroundColor: '#3b82f6' }} />
                <span>Actual</span>
              </div>
            </>
          )}
          {showToday && (
            <>
              <span className="text-muted-foreground">|</span>
              <div className="flex items-center gap-1.5">
                <div className="w-3.5 h-0.5 bg-red-500 rounded" />
                <span>今天</span>
              </div>
            </>
          )}
          {showDependencies && (
            <>
              <span className="text-muted-foreground">|</span>
              <div className="flex items-center gap-1.5">
                <svg width="24" height="10">
                  <style>{`@keyframes legend-flow { to { stroke-dashoffset: -20; } }`}</style>
                  <path d="M 0 5 C 8 5, 16 5, 24 5" stroke="#64748b" strokeWidth="2" fill="none" opacity="0.3" />
                  <path d="M 0 5 C 8 5, 16 5, 24 5" stroke="#64748b" strokeWidth="2" fill="none" strokeDasharray="12 8" style={{ animation: 'legend-flow 0.8s linear infinite' }} />
                </svg>
                <span>關鍵路徑</span>
              </div>
              <div className="flex items-center gap-1.5">
                <svg width="24" height="10"><path d="M 0 5 C 8 5, 16 5, 24 5" stroke="#94a3b8" strokeWidth="1.5" fill="none" strokeDasharray="4 2" /></svg>
                <span>相依關係</span>
              </div>
            </>
          )}
        </div>
      </Card>

    </div>
  )
}
