'use client'

import { useRef, useState, useCallback, useMemo } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { type Task, type Milestone } from '@/lib/mock-data'
import { cn } from '@/lib/utils'
import {
  ChevronRight,
  ChevronDown,
  AlertTriangle,
} from 'lucide-react'

interface GanttChartProps {
  tasks?: Task[]
  milestones?: Milestone[]
  baseline?: Milestone[]
  startDate: string
  endDate: string
  onTaskClick?: (task: Task) => void
  expandedMilestoneIds?: Set<string>
  onExpandedMilestoneIdsChange?: (ids: Set<string>) => void
}

const STATUS_COLORS: Record<string, { bg: string; border: string }> = {
  'done': { bg: '#10b981', border: '#059669' },
  'in-progress': { bg: '#3b82f6', border: '#2563eb' },
  'blocked': { bg: '#ef4444', border: '#dc2626' },
  'todo': { bg: '#94a3b8', border: '#64748b' },
}

const BASELINE_COLOR = { bg: '#fde68a', border: '#f59e0b' } // amber-200/500 — clearly visible

export function GanttChart({ tasks = [], milestones = [], baseline = [], startDate, endDate, onTaskClick, expandedMilestoneIds, onExpandedMilestoneIdsChange }: GanttChartProps) {
  const timelineRef = useRef<HTMLDivElement>(null)
  const [hoverX, setHoverX] = useState<number | null>(null)
  const [hoverDate, setHoverDate] = useState<string>('')

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

  // Build baseline lookup
  const baselineMap = useMemo(() => {
    const map = new Map<string, Milestone>()
    baseline.forEach(b => map.set(b.id, b))
    return map
  }, [baseline])

  // Auto-detect date range from actual data
  const allDates = [
    ...tasks.map(t => new Date(t.startDate).getTime()),
    ...tasks.map(t => new Date(t.endDate).getTime()),
    ...milestones.map(m => new Date(m.dueDate).getTime()),
    ...baseline.map(b => new Date(b.dueDate).getTime()),
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

  // Group tasks by milestone
  const tasksByMilestone = milestones.map(m => ({
    milestone: m,
    tasks: tasks.filter(t => t.milestoneId === m.id),
  }))

  // Week grid count
  const weekCount = Math.ceil(totalDays / 7)

  // Helper: compute milestone bar span
  const getMilestoneBarRange = (ms: Milestone, msTasks: Task[]) => {
    if (msTasks.length === 0) return { start: ms.dueDate, end: ms.dueDate }
    const earliest = msTasks.reduce((min, t) =>
      new Date(t.startDate).getTime() < new Date(min).getTime() ? t.startDate : min
    , msTasks[0].startDate)
    return { start: earliest, end: ms.dueDate }
  }

  const isDelayed = (ms: Milestone) => {
    const bl = baselineMap.get(ms.id)
    if (!bl) return false
    return new Date(ms.dueDate).getTime() > new Date(bl.dueDate).getTime()
  }

  const getDelayDays = (ms: Milestone) => {
    const bl = baselineMap.get(ms.id)
    if (!bl) return 0
    const diff = new Date(ms.dueDate).getTime() - new Date(bl.dueDate).getTime()
    return Math.round(diff / (1000 * 60 * 60 * 24))
  }

  const formatDate = (d: string) => {
    return new Date(d).toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' })
  }

  // Normalize: progress >= 100 should always be treated as 'done'
  const effectiveStatus = (task: Task) => {
    if (task.progress >= 100) return 'done' as const
    return task.status
  }

  const isTaskOverdue = (task: Task) => {
    if (effectiveStatus(task) === 'done') return false
    return today > new Date(task.endDate)
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
      <Card className="overflow-x-auto">
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

          {/* Milestones (collapsible) */}
          {tasksByMilestone.map(({ milestone, tasks: msTasks }, msIndex) => {
            const expanded = expandedMs.has(milestone.id)
            const delayed = isDelayed(milestone)
            const delayDays = getDelayDays(milestone)
            const msBar = getMilestoneBarRange(milestone, msTasks)
            const blMs = baselineMap.get(milestone.id)
            const colors = STATUS_COLORS[milestone.status] || STATUS_COLORS.todo

            return (
              <div key={milestone.id}>
                {/* Milestone row — stronger background to distinguish from tasks */}
                <div
                  className={cn(
                    'flex items-center border-b cursor-pointer transition-colors',
                    delayed
                      ? 'bg-red-50/80 hover:bg-red-50 dark:bg-red-950/20 dark:hover:bg-red-950/30'
                      : 'bg-muted/40 hover:bg-muted/60',
                  )}
                  onClick={() => toggleMs(milestone.id)}
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
                      <span className="text-sm font-semibold truncate">{milestone.name}</span>
                      <Badge
                        className="text-[10px] px-1.5 py-0 shrink-0 text-white border-0"
                        style={{ backgroundColor: colors.bg }}
                      >
                        {milestone.progress}%
                      </Badge>
                      {delayed && (
                        <span className="flex items-center gap-0.5 text-sm text-red-600 dark:text-red-400 shrink-0">
                          <AlertTriangle className="h-3 w-3" />
                          +{delayDays}天
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground ml-[38px] mt-0.5">
                      到期：{formatDate(milestone.dueDate)}
                      {blMs && delayed && (
                        <span className="text-red-500 ml-1">
                          (原定 {formatDate(blMs.dueDate)})
                        </span>
                      )}
                    </div>
                  </div>
                  <div className={cn('flex-1 relative', delayed && blMs ? 'h-14' : 'h-10')}>
                    <WeekGrid />
                    {/* Baseline bar (ghost) */}
                    {blMs && delayed && msTasks.length > 0 && (
                      <div
                        className="absolute h-4 rounded-sm border opacity-80"
                        style={{
                          ...barStyle(msBar.start, blMs.dueDate),
                          top: 4,
                          backgroundColor: BASELINE_COLOR.bg,
                          borderColor: BASELINE_COLOR.border,
                        }}
                      />
                    )}
                    {/* Actual milestone bar */}
                    {msTasks.length > 0 && (
                      <div
                        className="absolute h-4 rounded-sm border"
                        style={{
                          ...barStyle(msBar.start, milestone.dueDate),
                          top: delayed && blMs ? 26 : 12,
                          backgroundColor: colors.bg,
                          borderColor: colors.border,
                          opacity: 0.7,
                        }}
                      >
                        {milestone.progress > 0 && milestone.progress < 100 && (
                          <div
                            className="absolute inset-y-0 left-0 bg-white/30 rounded-l-sm"
                            style={{ width: `${milestone.progress}%` }}
                          />
                        )}
                      </div>
                    )}
                    <TodayLine />
                  </div>
                </div>

                {/* Expanded task rows — lighter background for clear distinction */}
                {expanded && msTasks.map((task, ti) => {
                  const taskColors = STATUS_COLORS[effectiveStatus(task)] || STATUS_COLORS.todo
                  const taskOverdue = isTaskOverdue(task)
                  return (
                    <div
                      key={task.id}
                      className={cn(
                        'flex items-center border-b transition-colors cursor-pointer',
                        ti % 2 === 0
                          ? 'bg-card hover:bg-accent/50'
                          : 'bg-muted/5 hover:bg-accent/50',
                      )}
                      onClick={(e) => handleTaskClick(task, e)}
                    >
                      <div className="w-[260px] shrink-0 px-3 py-1.5 border-r pl-10">
                        <div className="flex items-center gap-1.5">
                          <div
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: taskColors.bg }}
                          />
                          <span className={cn(
                            'text-sm truncate',
                            effectiveStatus(task) === 'done' && 'text-muted-foreground',
                            taskOverdue && 'text-red-600 dark:text-red-400',
                          )}>{task.title}</span>
                          {taskOverdue && (
                            <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                          )}
                        </div>
                        {task.assignee && (
                          <span className="text-sm text-muted-foreground ml-4">{task.assignee}</span>
                        )}
                      </div>
                      <div className="flex-1 relative h-10">
                        <WeekGrid />
                        <div
                          className="absolute h-4 rounded-sm top-3 border"
                          style={{
                            ...barStyle(task.startDate, task.endDate),
                            backgroundColor: taskColors.bg,
                            borderColor: taskColors.border,
                          }}
                        >
                          {task.progress > 0 && task.progress < 100 && (
                            <div
                              className="absolute inset-y-0 left-0 bg-white/30 rounded-l-sm"
                              style={{ width: `${task.progress}%` }}
                            />
                          )}
                        </div>
                        <TodayLine />
                      </div>
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
            <div className="w-3.5 h-3.5 rounded-sm" style={{ backgroundColor: '#94a3b8' }} />
            <span>待辦</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3.5 h-3.5 rounded-sm" style={{ backgroundColor: '#ef4444' }} />
            <span>受阻</span>
          </div>
          <span className="text-muted-foreground">|</span>
          <div className="flex items-center gap-1.5">
            <div className="w-3.5 h-2 rounded-sm border opacity-80" style={{ backgroundColor: BASELINE_COLOR.bg, borderColor: BASELINE_COLOR.border }} />
            <span>基線計畫</span>
          </div>
          {showToday && (
            <>
              <span className="text-muted-foreground">|</span>
              <div className="flex items-center gap-1.5">
                <div className="w-3.5 h-0.5 bg-red-500 rounded" />
                <span>今天</span>
              </div>
            </>
          )}
        </div>
      </Card>

    </div>
  )
}
