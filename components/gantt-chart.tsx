'use client'

import { useRef, useState, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
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
  expandedTaskIds?: Set<string>
  onExpandedTaskIdsChange?: (ids: Set<string>) => void
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
const PLAN_COLOR = { bg: '#fef3c7', border: '#f59e0b' }       // amber-100/500 — warm yellow, matches mockup
const EXTENSION_COLOR = { bg: '#fee2e2', border: '#fca5a5' }   // red-100/300 — delay extension segment

export function GanttChart({ tasks = [], milestones = [], startDate, endDate, onTaskClick, onMilestoneClick, expandedMilestoneIds, onExpandedMilestoneIdsChange, expandedTaskIds, onExpandedTaskIdsChange, showDependencies, showBaseline, nodeMap, selectedTaskId, onTaskHover, noActivityMilestoneIds, overdueNotStartedTaskIds, taskLogs = [] }: GanttChartProps) {
  const timelineRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const xScrollRef = useRef<HTMLDivElement>(null)
  const [hoverX, setHoverX] = useState<number | null>(null)
  const [hoverDate, setHoverDate] = useState<string>('')
  const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null)
  const [taskTooltip, setTaskTooltip] = useState<{ x: number; y: number; task: Task } | null>(null)
  const [msTooltip, setMsTooltip] = useState<{ x: number; y: number; milestone: Milestone; msTasks: Task[] } | null>(null)
  // Default: expand ALL milestones (ADR-02 — deep trees are easier to read fully open).
  const [internalExpandedMs, setInternalExpandedMs] = useState<Set<string>>(() =>
    new Set(milestones.map(m => m.id)),
  )
  const expandedMs = expandedMilestoneIds ?? internalExpandedMs
  const setExpandedMs = onExpandedMilestoneIdsChange ?? setInternalExpandedMs

  const toggleMs = useCallback((msId: string) => {
    const next = new Set(expandedMs)
    if (next.has(msId)) next.delete(msId)
    else next.add(msId)
    setExpandedMs(next)
  }, [expandedMs, setExpandedMs])

  // Default: expand ALL tasks that have children, at any depth (ADR-02).
  const [internalExpandedTasks, setInternalExpandedTasks] = useState<Set<string>>(() =>
    new Set(tasks.filter(t => tasks.some(c => c.parentId === t.id)).map(t => t.id)),
  )
  const expandedTasks = expandedTaskIds ?? internalExpandedTasks
  const setExpandedTasks = onExpandedTaskIdsChange ?? setInternalExpandedTasks

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
    // 結束日「含當天」：右緣算到結束日的隔天起點，避免長條短一天、
    // 以及同日/單日長條被最小寬度撐到凸出規劃結束日。
    const endNext = new Date(end)
    endNext.setDate(endNext.getDate() + 1)
    const right = toPercent(endNext.toISOString().split('T')[0])
    // 最小寬度只當「避免 0 寬」的安全值；不可大到讓單日長條凸出結束日
    // （寬視圖下 1 天可能 < 0.6%，舊值 0.6 會把實際長條撐出去一天）。
    return { left: `${left}%`, width: `${Math.max(right - left, 0.1)}%` }
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

  // Helper: compute milestone bar span (planned).
  // ADR-01/02: the milestone owns its OWN absolute start/due (shown in the edit table),
  // independent of its tasks. Draw the bar from that range so the Gantt matches the
  // table and covers deep descendants regardless of nesting depth.
  const getMilestoneBarRange = (ms: Milestone, _msTasks: Task[]) => {
    return { start: ms.startDate || ms.dueDate, end: ms.dueDate }
  }

  // Helper: get actual start for a single task (earliest log date, or completedAt as fallback)
  const getTaskActualStart = useCallback((t: Task): string | null => {
    return earliestLogDateMap.get(t.id) || t.completedAt || null
  }, [earliestLogDateMap])

  // Helper: 里程碑實際起點 = 該里程碑「底層所有任務(任意深度)報告的最小日」
  const getMilestoneActualStart = useCallback((msTasks: Task[]) => {
    if (msTasks.length === 0) return null
    const msId = msTasks[0].milestoneId
    let earliest: string | null = null
    for (const t of tasks) {
      if (t.milestoneId !== msId) continue
      const s = earliestLogDateMap.get(t.id) || t.completedAt || null
      if (s && (!earliest || s < earliest)) earliest = s
    }
    return earliest
  }, [tasks, earliestLogDateMap])

  // Helper: 里程碑是否有活動（任意深度任一任務有報告或已完成）
  const milestoneHasActivity = useCallback((msTasks: Task[]) => {
    if (msTasks.length === 0) return false
    const msId = msTasks[0].milestoneId
    return tasks.some(t => t.milestoneId === msId && (earliestLogDateMap.has(t.id) || !!t.completedAt))
  }, [earliestLogDateMap, tasks])

  const formatDate = (d: string) => {
    return new Date(d).toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' })
  }

  // Plan bar colors: visually indicate how reality compares to the plan
  const getPlanBarColors = (planEnd: string, progress: number, completedAt?: string | null, status?: string) => {
    const isDone = !!completedAt || status === 'done'
    const plannedEnd = new Date(planEnd)
    if (isDone && completedAt) {
      return new Date(completedAt) > plannedEnd
        ? { bg: '#fee2e2', border: '#fca5a5' }   // red — completed late
        : { bg: '#dcfce7', border: '#86efac' }   // green — on time / early
    }
    if (isDone) return { bg: '#dcfce7', border: '#86efac' }
    if (progress > 0 && today > plannedEnd) return { bg: '#ffedd5', border: '#fdba74' } // orange — overdue in-progress
    if (progress > 0) return { bg: '#dbeafe', border: '#93c5fd' }  // blue — on track
    if (today > plannedEnd) return { bg: '#ffedd5', border: '#fdba74' } // orange — overdue not started
    return PLAN_COLOR // gray — not started
  }

  // ISO week number helper
  const getISOWeek = (date: Date) => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
    return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  }

  // Generate week cells for timeline sub-header (ISO W1–W52, Monday–Sunday)
  const weekCells = useMemo(() => {
    const cells: { label: string; days: number }[] = []
    const d = new Date(rangeStart)
    let acc = 0
    while (acc < totalDays) {
      const dow = d.getDay()
      // Days until next Monday (= end of this ISO week + 1)
      const toNextMonday = dow === 1 ? 7 : dow === 0 ? 1 : 8 - dow
      const days = Math.min(toNextMonday, totalDays - acc)
      const wn = getISOWeek(d)
      cells.push({ label: `W${wn}`, days })
      acc += days
      d.setDate(d.getDate() + days)
    }
    return cells
  }, [rangeStart, totalDays])

  // Normalize: completedAt or status=done → done, progress > 0 with todo → in-progress
  const effectiveStatus = (task: Task) => {
    if (task.completedAt || task.status === 'done') return 'done' as const
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

  // ADR-02: render a task at depth ≥ 3 (below a top-level task) and its descendants
  // recursively, so the Gantt shows all 6 levels. Uses each item's own stored dates
  // & progress (kept correct by the recursive progress sync).
  const renderGanttSub = (sub: Task, depth: number): React.ReactNode => {
    const subChildren = tasks.filter(t => t.parentId === sub.id)
    const subHasChildren = subChildren.length > 0
    const subExpanded = expandedTasks.has(sub.id)
    const subDisplayStatus = overdueNotStartedTaskIds?.has(sub.id) ? 'overdue-not-started' : effectiveStatus(sub)
    const subColors = STATUS_COLORS[subDisplayStatus] || STATUS_COLORS.todo
    return (
      <div key={sub.id}>
        <div
          data-task-id={sub.id}
          className={cn(
            'flex items-center border-b transition-colors bg-muted/5',
            selectedTaskId === sub.id && 'bg-amber-50/60 dark:bg-amber-950/20',
          )}
        >
          <div
            className={cn(
              'w-[320px] shrink-0 px-3 py-1 border-r sticky left-0 z-10',
              subHasChildren && 'cursor-pointer hover:bg-accent',
              selectedTaskId === sub.id ? 'bg-amber-50 dark:bg-amber-950' : 'bg-card',
            )}
            style={{ paddingLeft: `${depth * 16 + 8}px` }}
            onClick={() => {
              if (subHasChildren) {
                const n = new Set(expandedTasks)
                if (n.has(sub.id)) n.delete(sub.id); else n.add(sub.id)
                setExpandedTasks(n)
              }
            }}
          >
            <div className="flex items-center gap-1.5">
              {subHasChildren ? (
                <span className="shrink-0">
                  {subExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                </span>
              ) : (
                <span className="text-muted-foreground/30 text-xs select-none">└</span>
              )}
              <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: subColors.bg }} />
              <span className={cn('text-sm truncate', effectiveStatus(sub) === 'done' && 'text-muted-foreground')} title={sub.title}>{sub.title}</span>
              {subHasChildren && (
                <span className="text-[10px] text-muted-foreground bg-muted rounded-full px-1.5 py-0.5 shrink-0">
                  {subChildren.filter(c => c.progress >= 100 || c.status === 'done').length}/{subChildren.length}
                </span>
              )}
            </div>
            {sub.assignee && <span className="text-xs text-muted-foreground ml-6">{sub.assignee}</span>}
          </div>
          <div
            className={cn('flex-1 relative cursor-pointer hover:bg-accent/50 transition-colors', showBaseline ? 'h-14' : 'h-10')}
            data-timeline-area
            onClick={(e) => handleTaskClick(sub, e)}
            onMouseMove={(e) => setTaskTooltip({ x: e.clientX, y: e.clientY - 12, task: sub })}
            onMouseLeave={() => setTaskTooltip(null)}
          >
            <WeekGrid />
            {showBaseline ? (() => {
              const subPlanColors = getPlanBarColors(sub.endDate, sub.progress, sub.completedAt, sub.status)
              const subIsDone = effectiveStatus(sub) === 'done'
              return (
                <>
                  <div className="absolute h-3 rounded-sm" style={{ ...barStyle(sub.startDate, sub.endDate), top: 5, backgroundColor: subPlanColors.bg, border: subIsDone ? `1px dashed ${subPlanColors.border}` : `1px solid ${subPlanColors.border}` }} />
                  {subIsDone && sub.completedAt ? (
                    <div className="absolute h-3 rounded-sm" style={{ ...barStyle(getActualStart(sub.id, sub.startDate), sub.completedAt), top: 24, backgroundColor: subColors.bg }} />
                  ) : earliestLogDateMap.has(sub.id) ? (
                    <div className="absolute h-3 rounded-sm" style={{ ...barStyle(getActualStart(sub.id, sub.startDate), todayStr), top: 24, backgroundColor: subColors.bg }} />
                  ) : null}
                  <span className="absolute text-[10px] font-medium whitespace-nowrap" style={{ left: `calc(${parseFloat(barStyle(sub.startDate, sub.endDate).left) + parseFloat(barStyle(sub.startDate, sub.endDate).width)}% + 4px)`, top: 5 }}>
                    <span className="text-muted-foreground">{sub.progress}%</span>
                    {(() => { const diff = getTimeDiffLabel(sub); return diff ? <span style={{ color: diff.color }}>{' '}{diff.text}</span> : null })()}
                  </span>
                </>
              )
            })() : (
              <>
                <div className="absolute h-5 rounded-sm overflow-hidden" style={{ ...barStyle(sub.startDate, sub.endDate), top: 10, backgroundColor: PLAN_COLOR.bg, border: `1px solid ${PLAN_COLOR.border}80` }}>
                  <div className="h-full rounded-sm" style={{ width: `${Math.min(sub.progress, 100)}%`, backgroundColor: subColors.bg }} />
                </div>
                <span className="absolute text-[10px] font-medium whitespace-nowrap" style={{ left: `calc(${parseFloat(barStyle(sub.startDate, sub.endDate).left) + parseFloat(barStyle(sub.startDate, sub.endDate).width)}% + 4px)`, top: 13 }}>
                  <span className="text-muted-foreground">{sub.progress}%</span>
                  {(() => { const diff = getTimeDiffLabel(sub); return diff ? <span style={{ color: diff.color }}>{' '}{diff.text}</span> : null })()}
                </span>
              </>
            )}
            <TodayLine />
          </div>
        </div>
        {subHasChildren && subExpanded && subChildren.map(c => renderGanttSub(c, depth + 1))}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <Card className="overflow-hidden">
        {/* Fixed Header — synced with body horizontal scroll */}
        <div ref={headerRef} className="overflow-hidden border-b">
          <div style={{ minWidth: Math.max(900, 260 + weekCells.length * 32) }}>
            <div className="flex">
              <div className="w-[320px] shrink-0 border-r bg-muted flex flex-col justify-center px-3">
                <span className="text-sm font-medium text-muted-foreground">里程碑 / 任務</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex">
                  {months.map((month, i) => (
                    <div
                      key={i}
                      style={{ width: `${(month.days / totalDays) * 100}%` }}
                      className="text-center py-1.5 text-sm font-medium border-r last:border-r-0 bg-muted"
                    >
                      {month.name}
                    </div>
                  ))}
                </div>
                <div className="flex border-t">
                  {weekCells.map((week, i) => (
                    <div
                      key={i}
                      style={{ width: `${(week.days / totalDays) * 100}%` }}
                      className="text-center py-0.5 text-[10px] text-muted-foreground/70 border-r last:border-r-0 bg-card overflow-hidden whitespace-nowrap"
                    >
                      {week.days >= 5 ? week.label : ''}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Scrollable Body */}
        <div
          ref={bodyRef}
          className="overflow-y-auto overflow-x-hidden scrollbar-thin max-h-[70vh]"
          onScroll={() => {
            if (bodyRef.current && headerRef.current) {
              headerRef.current.scrollLeft = bodyRef.current.scrollLeft
            }
          }}
        >
        <div
          ref={timelineRef}
          className="relative select-none"
          style={{ minWidth: Math.max(900, 260 + weekCells.length * 32) }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          {/* Hover crosshair line */}
          {hoverX !== null && (
            <div
              className="absolute top-0 bottom-0 w-px bg-foreground/20 pointer-events-none z-30"
              style={{ left: hoverX }}
            >
              <div
                className="absolute top-1 left-1.5 bg-foreground text-background text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap"
              >
                {hoverDate}
              </div>
            </div>
          )}

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
            // 方案 A：里程碑的有效結束 = 任務 envelope 的最晚結束（與編輯表一致）。
            // 里程碑長條、到期標籤、逾期判斷都用這個，不用可能不同步的 dueDate。
            const msEnd = msBar.end

            // 里程碑進度 = 聚合「葉任務」(實際做的最底層)，依 durationDays 加權
            const msLeaves = tasks.filter(t => t.milestoneId === milestone.id && !tasks.some(c => c.parentId === t.id))
            const msBasis = msLeaves.length > 0 ? msLeaves : msTasks
            const msAggregatedProgress = (() => {
              if (msBasis.length === 0) return milestone.progress
              const totalDays = msBasis.reduce((s, t) => s + Math.max(t.durationDays || 1, 1), 0)
              if (totalDays <= 0) return 0
              return Math.round(msBasis.reduce((s, t) => s + t.progress * Math.max(t.durationDays || 1, 1), 0) / totalDays)
            })()
            const msAllDoneAgg = msBasis.length > 0 && msBasis.every(t => t.status === 'done' || t.progress >= 100)
            const msDisplayStatus = msAllDoneAgg ? 'done' : msAggregatedProgress > 0 ? 'in-progress' : milestone.status
            const colors = STATUS_COLORS[msDisplayStatus] || STATUS_COLORS.todo

            return (
              <div key={milestone.id}>
                {/* Milestone row — stronger background to distinguish from tasks */}
                <div
                  className={cn(
                    'flex items-center border-b transition-colors',
                    'bg-muted/40',
                  )}
                >
                  <div
                    className="w-[320px] shrink-0 px-3 py-2 border-r cursor-pointer hover:bg-muted transition-colors sticky left-0 z-10 bg-card"
                    onClick={() => msTasks.length > 0 && toggleMs(milestone.id)}
                  >
                    <div className="flex items-center gap-1.5">
                      {msTasks.length > 0 ? (
                        <span className="shrink-0">
                          {expanded
                            ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            : <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          }
                        </span>
                      ) : (
                        <div className="w-4 shrink-0" />
                      )}
                      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-medium">
                        {msIndex + 1}
                      </div>
                      {/* 名稱獨佔第一行，完整顯示（不被徽章擠壓）*/}
                      <span className="text-sm font-semibold truncate" title={milestone.name}>{milestone.name}</span>
                    </div>
                    {/* 徽章 + 到期移到第二行，避免擠壓名稱 */}
                    <div className="flex items-center gap-1.5 flex-wrap ml-[38px] mt-0.5">
                      <Badge
                        className="text-[10px] px-1.5 py-0 shrink-0 text-white border-0"
                        style={{ backgroundColor: colors.bg }}
                      >
                        {msAggregatedProgress}%
                      </Badge>
                      <span className="text-sm text-muted-foreground">到期：{formatDate(msEnd)}</span>
                      {!milestoneHasActivity(msTasks) && (
                        <Badge className="text-[10px] px-1.5 py-0 shrink-0 bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700">
                          <AlertTriangle className="h-3 w-3 mr-0.5" />
                          尚無人回報
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div
                    className={cn('flex-1 relative cursor-pointer hover:bg-muted/40 transition-colors', 'h-14')}
                    onClick={() => onMilestoneClick?.(milestone)}
                    onMouseMove={(e) => {
                      setMsTooltip({ x: e.clientX, y: e.clientY - 12, milestone, msTasks })
                    }}
                    onMouseLeave={() => setMsTooltip(null)}
                  >
                    <WeekGrid />
                    {msTasks.length > 0 && showBaseline ? (() => {
                      const msActualStart = getMilestoneActualStart(msTasks) || msBar.start
                      const msCompletedAt = msAllDoneAgg
                        ? msTasks.reduce<string | null>((latest, t) => t.completedAt && (!latest || t.completedAt > latest) ? t.completedAt : latest, null)
                        : null
                      const msPlanColors = getPlanBarColors(msEnd, msAggregatedProgress, msCompletedAt, msDisplayStatus)
                      const msDone = msAllDoneAgg
                      // Milestone has extension only if any task's duration actually increased
                      const msHasExtension = msTasks.some(t => {
                        if (!t.originalEndDate || !t.originalStartDate) return false
                        const origSpan = new Date(t.originalEndDate).getTime() - new Date(t.originalStartDate).getTime()
                        const curSpan = new Date(t.endDate).getTime() - new Date(t.startDate).getTime()
                        return curSpan > origSpan
                      })
                      // If extension exists, derive original range from tasks' original dates
                      const msOrigStart = msHasExtension
                        ? (msTasks.reduce<string | null>((e, t) => {
                            const o = t.originalStartDate || t.startDate
                            return !e || o < e ? o : e
                          }, null) || msBar.start)
                        : msBar.start
                      const msOrigEnd = msHasExtension
                        ? msTasks.reduce<string | null>((l, t) => {
                            const o = t.originalEndDate || t.endDate
                            return !l || o > l ? o : l
                          }, null)
                        : null
                      const msPlanEnd = msHasExtension && msOrigEnd ? msOrigEnd : msEnd
                      return (
                      <>
                        {/* Plan bar (upper — original plan portion) */}
                        <div
                          className="absolute h-3.5 rounded-sm"
                          style={{
                            ...barStyle(msOrigStart, msPlanEnd),
                            top: 4,
                            backgroundColor: msPlanColors.bg,
                            border: msDone
                              ? `1px dashed ${msPlanColors.border}`
                              : `1px solid ${msPlanColors.border}`,
                            ...(msHasExtension ? { borderRight: 'none', borderTopRightRadius: 0, borderBottomRightRadius: 0 } : {}),
                          }}
                        />
                        {/* Milestone extension segment (delay period — light red) */}
                        {msHasExtension && (
                          <div
                            className="absolute h-3.5 rounded-r-sm"
                            style={{
                              ...barStyle(msOrigEnd!, msEnd),
                              top: 4,
                              backgroundColor: EXTENSION_COLOR.bg,
                              border: msDone
                                ? `1px dashed ${EXTENSION_COLOR.border}`
                                : `1px solid ${EXTENSION_COLOR.border}`,
                              borderLeft: 'none',
                            }}
                          />
                        )}
                        {/* Actual bar (lower — extends to today for in-progress, to latest completion for done) */}
                        {(msAggregatedProgress > 0 || milestoneHasActivity(msTasks)) && (
                          <div
                            className="absolute h-3.5 rounded-sm"
                            style={{
                              ...barStyle(msActualStart, msAllDoneAgg
                                ? (msTasks.reduce<string>((latest, t) => t.completedAt && t.completedAt > latest ? t.completedAt : latest, msActualStart) || todayStr)
                                : todayStr),
                              top: 24,
                              backgroundColor: colors.bg,
                            }}
                          />
                        )}
                      </>
                      )
                    })() : msTasks.length > 0 ? (() => {
                      /* Non-baseline milestone: plan bar + extension + actual bar */
                      // Milestone has extension only if any task's duration actually increased
                      const nbMsHasExtension = msTasks.some(t => {
                        if (!t.originalEndDate || !t.originalStartDate) return false
                        const origSpan = new Date(t.originalEndDate).getTime() - new Date(t.originalStartDate).getTime()
                        const curSpan = new Date(t.endDate).getTime() - new Date(t.startDate).getTime()
                        return curSpan > origSpan
                      })
                      const nbMsOrigEnd = nbMsHasExtension
                        ? msTasks.reduce<string | null>((l, t) => {
                            const o = t.originalEndDate || t.endDate
                            return !l || o > l ? o : l
                          }, null)
                        : null
                      const nbMsPlanEnd = nbMsHasExtension && nbMsOrigEnd ? nbMsOrigEnd : msEnd
                      return (
                      <>
                        {/* Single merged milestone bar — plan outline with progress fill */}
                        <div
                          className="absolute h-5 rounded-sm overflow-hidden"
                          style={{
                            ...barStyle(msBar.start, msEnd),
                            top: 10,
                            backgroundColor: PLAN_COLOR.bg,
                            border: `1px solid ${PLAN_COLOR.border}80`,
                          }}
                        >
                          <div className="h-full rounded-sm" style={{ width: `${msAggregatedProgress}%`, backgroundColor: colors.bg }} />
                        </div>
                        {/* Milestone percentage + time diff */}
                        <span
                          className="absolute text-[10px] font-medium whitespace-nowrap"
                          style={{
                            left: `calc(${parseFloat(barStyle(msBar.start, msEnd).left) + parseFloat(barStyle(msBar.start, msEnd).width)}% + 4px)`,
                            top: 13,
                          }}
                        >
                          <span className="text-muted-foreground">{msAggregatedProgress}%</span>
                          {(() => {
                            // Milestone time diff: check if all tasks done
                            const msDone = msAllDoneAgg
                            const latestCompletion = msTasks.reduce<string | null>((latest, t) => {
                              if (!t.completedAt) return latest
                              return !latest || t.completedAt > latest ? t.completedAt : latest
                            }, null)
                            if (msDone && latestCompletion) {
                              const diff = getTimeDiffLabel({ endDate: msEnd, completedAt: latestCompletion, progress: 100, status: 'done' })
                              return diff ? <span style={{ color: diff.color }}>{' '}{diff.text}</span> : null
                            }
                            // In-progress milestone overdue
                            if (!msDone && today > new Date(msEnd)) {
                              const overdueDays = Math.round((today.getTime() - new Date(msEnd).getTime()) / (1000 * 60 * 60 * 24))
                              if (overdueDays > 0) return <span style={{ color: '#ef4444' }}>{' '}逾期{overdueDays}天</span>
                            }
                            return null
                          })()}
                        </span>
                      </>
                      )
                    })() : (() => {
                      // No tasks yet: still draw the milestone's own span (start～due) as a
                      // simple plan bar so a milestone-only row (e.g. straight from a template)
                      // is visible instead of an empty row. (Bug #13)
                      if (!msBar.start || !msEnd) return null
                      return (
                        <div
                          className="absolute h-5 rounded-sm overflow-hidden"
                          style={{
                            ...barStyle(msBar.start, msEnd),
                            top: 10,
                            backgroundColor: PLAN_COLOR.bg,
                            border: `1px solid ${PLAN_COLOR.border}80`,
                          }}
                        >
                          <div className="h-full rounded-sm" style={{ width: `${milestone.progress}%`, backgroundColor: colors.bg }} />
                        </div>
                      )
                    })()}
                    <TodayLine />
                  </div>
                </div>

                {/* Expanded task rows — lighter background for clear distinction */}
                {expanded && msTasks.map((task, ti) => {
                  const subtasks = tasks.filter(t => t.parentId === task.id)
                  const hasSubtasks = subtasks.length > 0

                  // 新模型：任務/子任務(含父層)一律顯示「自己的進度」，不聚合子層（只有里程碑聚合）
                  const aggregatedProgress = task.progress
                  const parentAllDone = false
                  // 甘特「實際條」以手動為主：只看任務自己的報告，不由子層聚合（% 才聚合）
                  const parentHasActivity = earliestLogDateMap.has(task.id)
                  const parentActualStart = earliestLogDateMap.get(task.id) || null
                  const parentLatestCompletion = parentAllDone
                    ? subtasks.reduce<string | null>((latest, s) => s.completedAt && (!latest || s.completedAt > latest) ? s.completedAt : latest, null)
                    : null
                  const displayProgress = hasSubtasks ? aggregatedProgress : task.progress
                  const displayDone = parentAllDone || effectiveStatus(task) === 'done'

                  const taskDisplayStatus = hasSubtasks
                    ? (parentAllDone ? 'done' : aggregatedProgress > 0 ? 'in-progress' : (overdueNotStartedTaskIds?.has(task.id) ? 'overdue-not-started' : effectiveStatus(task)))
                    : (overdueNotStartedTaskIds?.has(task.id) ? 'overdue-not-started' : effectiveStatus(task))
                  const taskColors = STATUS_COLORS[taskDisplayStatus] || STATUS_COLORS.todo
                  const taskOverdue = isTaskOverdue(task)
                  const isCritical = showDependencies && nodeMap?.get(task.id)?.isOnCriticalPath
                  const node = showDependencies ? nodeMap?.get(task.id) : undefined
                  return (
                    <div key={task.id}>
                    <div
                      data-task-id={task.id}
                      className={cn(
                        'flex items-center border-b transition-colors',
                        selectedTaskId === task.id
                          ? 'bg-amber-50/60 dark:bg-amber-950/20'
                          : ti % 2 === 0
                            ? 'bg-card'
                            : 'bg-muted/5',
                      )}
                      onMouseEnter={() => {
                        setHoveredTaskId(task.id)
                        onTaskHover?.(task)
                      }}
                      onMouseLeave={() => {
                        setHoveredTaskId(null)
                        onTaskHover?.(null)
                        setTaskTooltip(null)
                      }}
                    >
                      <div
                        className={cn(
                          'w-[320px] shrink-0 px-3 py-1.5 border-r pl-10 transition-colors sticky left-0 z-10',
                          selectedTaskId === task.id
                            ? 'bg-amber-50 dark:bg-amber-950'
                            : ti % 2 === 0 ? 'bg-card' : 'bg-muted',
                          subtasks.length > 0 ? 'cursor-pointer hover:bg-accent' : '',
                        )}
                        onClick={() => {
                          if (subtasks.length > 0) {
                            setExpandedTasks(prev => {
                              const next = new Set(prev)
                              if (next.has(task.id)) next.delete(task.id)
                              else next.add(task.id)
                              return next
                            })
                          }
                        }}
                      >
                        <div className="flex items-center gap-1.5">
                          {subtasks.length > 0 ? (
                            <span className="shrink-0">
                              {expandedTasks.has(task.id)
                                ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                                : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                              }
                            </span>
                          ) : (
                            <div className="w-3.5 shrink-0" />
                          )}
                          <div
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: taskColors.bg }}
                          />
                          <span className={cn(
                            'text-sm truncate',
                            displayDone && 'text-muted-foreground',
                            taskOverdue && 'text-red-600 dark:text-red-400',
                          )} title={task.title}>{task.title}</span>
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
                      <div
                        className={cn('flex-1 relative cursor-pointer hover:bg-accent/50 transition-colors', 'h-14')}
                        data-timeline-area
                        onClick={(e) => handleTaskClick(task, e)}
                        onMouseMove={(e) => {
                          setTaskTooltip({ x: e.clientX, y: e.clientY - 12, task })
                        }}
                      >
                        <WeekGrid />
                        {showBaseline ? (() => {
                          const taskPlanColors = getPlanBarColors(task.endDate, displayProgress, parentLatestCompletion || task.completedAt, displayDone ? 'done' : task.status)
                          const taskIsDone = displayDone
                          // Extension = task duration actually increased (not just shifted)
                          const hasExtension = task.originalEndDate && task.originalStartDate && (() => {
                            const origSpan = new Date(task.originalEndDate!).getTime() - new Date(task.originalStartDate!).getTime()
                            const curSpan = new Date(task.endDate).getTime() - new Date(task.startDate).getTime()
                            return curSpan > origSpan
                          })()
                          // Extended task: plan = original dates; shifted/normal: plan = current dates
                          const planStart = hasExtension ? task.originalStartDate! : task.startDate
                          const planEnd = hasExtension ? task.originalEndDate! : task.endDate
                          return (
                          <>
                            {/* Plan bar (upper — original plan portion) */}
                            <div
                              className="absolute h-3.5 rounded-sm"
                              style={{
                                ...barStyle(planStart, planEnd),
                                top: 4,
                                backgroundColor: taskPlanColors.bg,
                                border: taskIsDone
                                  ? `1px dashed ${taskPlanColors.border}`
                                  : `1px solid ${taskPlanColors.border}`,
                                ...(hasExtension ? { borderRight: 'none', borderTopRightRadius: 0, borderBottomRightRadius: 0 } : {}),
                              }}
                            />
                            {/* Extension segment (delay period — light red) */}
                            {hasExtension && (
                              <div
                                className="absolute h-3.5 rounded-r-sm"
                                style={{
                                  ...barStyle(task.originalEndDate!, task.endDate),
                                  top: 4,
                                  backgroundColor: EXTENSION_COLOR.bg,
                                  border: taskIsDone
                                    ? `1px dashed ${EXTENSION_COLOR.border}`
                                    : `1px solid ${EXTENSION_COLOR.border}`,
                                  borderLeft: 'none',
                                }}
                              />
                            )}
                            {/* Actual bar (lower — uses actual start date from earliest log; for parent tasks, aggregates subtask data) */}
                            {(taskIsDone && (task.completedAt || parentLatestCompletion)) ? (
                              <div
                                className="absolute h-3.5 rounded-sm"
                                style={{
                                  ...barStyle(
                                    hasSubtasks && parentActualStart ? parentActualStart : getActualStart(task.id, task.startDate),
                                    parentLatestCompletion || task.completedAt || todayStr,
                                  ),
                                  top: 24,
                                  backgroundColor: taskColors.bg,
                                  ...(isCritical ? { boxShadow: '0 0 0 1.5px #64748b' } : {}),
                                }}
                              />
                            ) : (earliestLogDateMap.has(task.id) || parentHasActivity) ? (
                              <div
                                className="absolute h-3.5 rounded-sm"
                                style={{
                                  ...barStyle(
                                    hasSubtasks && parentActualStart ? parentActualStart : getActualStart(task.id, task.startDate),
                                    todayStr,
                                  ),
                                  top: 24,
                                  backgroundColor: taskColors.bg,
                                  ...(isCritical ? { boxShadow: '0 0 0 1.5px #64748b' } : {}),
                                }}
                              />
                            ) : null}
                            {/* Percentage + time diff label (after full bar including extension) */}
                            <span
                              className="absolute text-[10px] font-medium whitespace-nowrap"
                              style={{
                                left: `calc(${parseFloat(barStyle(task.startDate, task.endDate).left) + parseFloat(barStyle(task.startDate, task.endDate).width)}% + 4px)`,
                                top: 5,
                              }}
                            >
                              <span className="text-muted-foreground">{displayProgress}%</span>
                              {(() => {
                                const diff = getTimeDiffLabel(hasSubtasks ? { ...task, progress: displayProgress, completedAt: parentLatestCompletion || task.completedAt, status: displayDone ? 'done' : task.status } : task)
                                return diff ? <span style={{ color: diff.color }}>{' '}{diff.text}</span> : null
                              })()}
                            </span>
                          </>
                          )
                        })() : (() => {
                          /* Non-baseline: single merged bar — plan outline with progress fill */
                          return (
                          <>
                            <div
                              className="absolute h-5 rounded-sm overflow-hidden"
                              style={{
                                ...barStyle(task.startDate, task.endDate),
                                top: 10,
                                backgroundColor: PLAN_COLOR.bg,
                                border: `1px solid ${PLAN_COLOR.border}80`,
                                ...(isCritical ? { boxShadow: '0 0 0 1.5px #64748b' } : {}),
                              }}
                            >
                              <div className="h-full rounded-sm" style={{ width: `${displayProgress}%`, backgroundColor: taskColors.bg }} />
                            </div>
                            {/* Percentage label + time diff */}
                            <span
                              className="absolute text-[10px] font-medium whitespace-nowrap"
                              style={{
                                left: `calc(${parseFloat(barStyle(task.startDate, task.endDate).left) + parseFloat(barStyle(task.startDate, task.endDate).width)}% + 4px)`,
                                top: 13,
                              }}
                            >
                              <span className="text-muted-foreground">{displayProgress}%</span>
                              {(() => {
                                const diff = getTimeDiffLabel(hasSubtasks ? { ...task, progress: displayProgress, completedAt: parentLatestCompletion || task.completedAt, status: displayDone ? 'done' : task.status } : task)
                                return diff ? <span style={{ color: diff.color }}>{' '}{diff.text}</span> : null
                              })()}
                            </span>
                          </>
                          )
                        })()}
                        <TodayLine />
                      </div>
                    </div>
                    {/* Subtask rows — recursive, any depth up to level 6 (ADR-02) */}
                    {expandedTasks.has(task.id) && subtasks.map(sub => renderGanttSub(sub, 3))}
                    </div>
                  )
                })}

                {expanded && msTasks.length === 0 && (
                  <div className="flex items-center border-b bg-card">
                    <div className="w-[320px] shrink-0 px-3 py-1.5 border-r pl-10 sticky left-0 z-10 bg-card">
                      <span className="text-sm text-muted-foreground italic">無任務</span>
                    </div>
                    <div className="flex-1 h-10" />
                  </div>
                )}
              </div>
            )
          })}
        </div>
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
          if (typeof document === 'undefined') return null
          // Portal to <body>: escapes the transformed preview dialog so position:fixed
          // anchors to the viewport (tooltip stays on the cursor). (same as msTooltip)
          return createPortal(
            <div
              className="fixed pointer-events-none z-[100] bg-popover border rounded-lg shadow-lg px-3.5 py-2.5 text-sm min-w-[220px]"
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
            </div>,
            document.body,
          )
        })()}

        {/* Milestone hover tooltip */}
        {msTooltip && (() => {
          const ms = msTooltip.milestone
          const msTks = msTooltip.msTasks
          // 完成度/完成數與甘特一致：聚合「葉任務」(不用頂層父任務)
          const msLeavesTip = tasks.filter(t => t.milestoneId === ms.id && !tasks.some(c => c.parentId === t.id))
          const msBasisTip = msLeavesTip.length > 0 ? msLeavesTip : msTks
          const liveProgress = (() => {
            if (msBasisTip.length === 0) return ms.progress
            const totalDays = msBasisTip.reduce((s, t) => s + Math.max(t.durationDays || 1, 1), 0)
            if (totalDays <= 0) return 0
            return Math.round(msBasisTip.reduce((s, t) => s + t.progress * Math.max(t.durationDays || 1, 1), 0) / totalDays)
          })()
          const doneCount = msBasisTip.filter(t => effectiveStatus(t) === 'done').length
          const msActualStartStr = getMilestoneActualStart(msTks)
          const msActualStart = msActualStartStr ? new Date(msActualStartStr) : null
          // Latest completion among tasks (only meaningful when ALL tasks are done)
          const allTasksDone = msTks.length > 0 && msTks.every(t => t.completedAt)
          const latestCompletion = allTasksDone ? msTks.reduce<Date | null>((latest, t) => {
            if (!t.completedAt) return latest
            const d = new Date(t.completedAt)
            return !latest || d > latest ? d : latest
          }, null) : null
          const plannedEnd = new Date(getMilestoneBarRange(ms, msTks).end)
          const diffDays = liveProgress >= 100 && latestCompletion
            ? Math.round((plannedEnd.getTime() - latestCompletion.getTime()) / (1000 * 60 * 60 * 24))
            : null
          const fmtDate = (d: Date) => d.toLocaleDateString('zh-TW', { year: 'numeric', month: 'numeric', day: 'numeric' })
          // Earliest planned start — tasks' envelope, or the milestone's own start
          // when it has no tasks yet (so the plan dates always show). (Bug #13)
          const earliestPlanned = msTks.length > 0
            ? new Date(msTks.reduce((min, t) => new Date(t.startDate).getTime() < new Date(min).getTime() ? t.startDate : min, msTks[0].startDate))
            : (ms.startDate ? new Date(ms.startDate) : null)
          if (typeof document === 'undefined') return null
          // Portal to <body>: the Gantt can live inside a transformed dialog (Radix
          // centering uses transform), which would re-anchor position:fixed to the
          // dialog instead of the viewport and throw the tooltip far from the cursor.
          return createPortal(
            <div
              className="fixed pointer-events-none z-[100] bg-popover border rounded-lg shadow-lg px-3.5 py-2.5 text-sm min-w-[220px]"
              style={{
                left: msTooltip.x,
                top: msTooltip.y,
                transform: 'translate(-50%, -100%)',
              }}
            >
              <div className="font-medium mb-1.5 text-foreground">{ms.name}</div>
              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
                <span className="text-muted-foreground">任務數</span>
                <span>{doneCount}/{msBasisTip.length} 完成</span>
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
                <span>{liveProgress}%</span>
                {diffDays !== null && (
                  <>
                    <span className="text-muted-foreground">時程差異</span>
                    <span className={diffDays > 0 ? 'text-emerald-600' : diffDays < 0 ? 'text-red-600' : ''}>
                      {diffDays > 0 ? `提前 ${diffDays} 天` : diffDays < 0 ? `延後 ${Math.abs(diffDays)} 天` : '準時完成'}
                    </span>
                  </>
                )}
              </div>
            </div>,
            document.body,
          )
        })()}

        {/* Horizontal scrollbar — only under timeline area */}
        <div className="flex border-t">
          <div className="w-[320px] shrink-0" />
          <div
            ref={xScrollRef}
            className="flex-1 overflow-x-auto scrollbar-thin"
            onScroll={() => {
              if (xScrollRef.current) {
                if (bodyRef.current) bodyRef.current.scrollLeft = xScrollRef.current.scrollLeft
                if (headerRef.current) headerRef.current.scrollLeft = xScrollRef.current.scrollLeft
              }
            }}
          >
            <div style={{ width: Math.max(640, weekCells.length * 32), height: 1 }} />
          </div>
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
          <span className="text-muted-foreground">|</span>
          <div className="flex items-center gap-1.5">
            <div className="w-3.5 h-2 rounded-sm border" style={{ backgroundColor: PLAN_COLOR.bg, borderColor: PLAN_COLOR.border }} />
            <span>原始計畫</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3.5 h-2 rounded-sm border" style={{ backgroundColor: EXTENSION_COLOR.bg, borderColor: EXTENSION_COLOR.border }} />
            <span>延期</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3.5 h-2 rounded-sm" style={{ backgroundColor: '#3b82f6' }} />
            <span>實際執行</span>
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
