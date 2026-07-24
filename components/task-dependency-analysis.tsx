'use client'

import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  ChevronsUpDown,
  Info,
  Route,
  Network,
} from 'lucide-react'
import type { Project, Task, Milestone } from '@/lib/mock-data'

// ─── Types ──────────────────────────────────────────────────

interface DepNode {
  task: Task
  milestone: Milestone | undefined
  prerequisites: Task[]
  dependents: Task[]
  depth: number
  isOnCriticalPath: boolean
}

interface ImpactResult {
  directlyBlocked: Task[]
  indirectlyAffected: Task[]
  affectedMilestones: Milestone[]
  totalDelayChain: number
}

// ─── Constants ───────────────────────────────────────────────

const ROW_HEIGHT = 48
const BAR_HEIGHT = 20
const BAR_Y_OFFSET = (ROW_HEIGHT - BAR_HEIGHT) / 2
const HEADER_HEIGHT = 32
const MILESTONE_ROW_HEIGHT = 48
const LEFT_LABEL_WIDTH = 260
const DAY_WIDTH = 18
const MIN_BAR_WIDTH = 24

const STATUS_BAR_COLORS: Record<string, { fill: string; stroke: string }> = {
  done: { fill: '#86efac', stroke: '#4ade80' },
  'in-progress': { fill: '#93c5fd', stroke: '#60a5fa' },
  todo: { fill: '#cbd5e1', stroke: '#94a3b8' },
  blocked: { fill: '#fca5a5', stroke: '#f87171' },
}

const STATUS_LABELS: Record<string, string> = {
  done: '已完成',
  'in-progress': '進行中',
  todo: '待開始',
  blocked: '被阻擋',
}

const PRIORITY_COLORS: Record<string, string> = {
  high: 'text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-950/30',
  medium: 'text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-950/30',
  low: 'text-slate-500 bg-slate-50 dark:text-slate-400 dark:bg-slate-800/30',
}

const STATUS_DOT_COLORS: Record<string, string> = {
  done: 'bg-green-500',
  'in-progress': 'bg-blue-500',
  todo: 'bg-slate-400',
  blocked: 'bg-red-500',
}

// ─── Graph Helpers ───────────────────────────────────────────

function buildDepGraph(project: Project): Map<string, DepNode> {
  const taskMap = new Map(project.tasks.map(t => [t.id, t]))
  const milestoneMap = new Map(project.milestones.map(m => [m.id, m]))
  const nodeMap = new Map<string, DepNode>()

  for (const task of project.tasks) {
    const prereqs = (task.dependencies || [])
      .map(id => taskMap.get(id))
      .filter(Boolean) as Task[]
    nodeMap.set(task.id, {
      task,
      milestone: milestoneMap.get(task.milestoneId),
      prerequisites: prereqs,
      dependents: [],
      depth: 0,
      isOnCriticalPath: false,
    })
  }

  for (const [, node] of nodeMap) {
    for (const prereq of node.prerequisites) {
      const prereqNode = nodeMap.get(prereq.id)
      if (prereqNode) prereqNode.dependents.push(node.task)
    }
  }

  // Compute depth (BFS from roots)
  const roots = [...nodeMap.values()].filter(n => n.prerequisites.length === 0)
  const visited = new Set<string>()
  const queue: { id: string; depth: number }[] = roots.map(r => ({ id: r.task.id, depth: 0 }))
  while (queue.length > 0) {
    const { id, depth } = queue.shift()!
    const node = nodeMap.get(id)!
    if (depth > node.depth) node.depth = depth
    for (const dep of node.dependents) {
      if (!visited.has(`${id}->${dep.id}`)) {
        visited.add(`${id}->${dep.id}`)
        queue.push({ id: dep.id, depth: node.depth + 1 })
      }
    }
  }

  // Critical path: longest chain
  const maxDepth = Math.max(0, ...[...nodeMap.values()].map(n => n.depth))
  const criticalTails = [...nodeMap.values()].filter(n => n.depth === maxDepth && n.dependents.length === 0)
  function markCritical(id: string) {
    const node = nodeMap.get(id)
    if (!node || node.isOnCriticalPath) return
    node.isOnCriticalPath = true
    if (node.prerequisites.length > 0) {
      const best = node.prerequisites.reduce((a, b) => {
        const da = nodeMap.get(a.id)?.depth ?? 0
        const db = nodeMap.get(b.id)?.depth ?? 0
        return da >= db ? a : b
      })
      markCritical(best.id)
    }
  }
  for (const tail of criticalTails) markCritical(tail.task.id)

  return nodeMap
}

function computeImpact(taskId: string, nodeMap: Map<string, DepNode>): ImpactResult {
  const node = nodeMap.get(taskId)
  if (!node) return { directlyBlocked: [], indirectlyAffected: [], affectedMilestones: [], totalDelayChain: 0 }

  const directlyBlocked = node.dependents
  const indirectSet = new Set<string>()
  const milestoneSet = new Set<string>()

  const queue = [...node.dependents.map(t => t.id)]
  const visited = new Set<string>(queue)

  while (queue.length > 0) {
    const id = queue.shift()!
    const n = nodeMap.get(id)
    if (!n) continue
    if (n.task.milestoneId) milestoneSet.add(n.task.milestoneId)
    for (const dep of n.dependents) {
      if (!visited.has(dep.id)) {
        visited.add(dep.id)
        indirectSet.add(dep.id)
        queue.push(dep.id)
      }
    }
  }

  for (const t of directlyBlocked) {
    if (t.milestoneId) milestoneSet.add(t.milestoneId)
  }

  const indirect = [...indirectSet]
    .map(id => nodeMap.get(id)?.task)
    .filter(Boolean) as Task[]

  const milestones = [...milestoneSet]
    .map(id => {
      for (const [, n] of nodeMap) {
        if (n.milestone?.id === id) return n.milestone
      }
      return undefined
    })
    .filter(Boolean) as Milestone[]

  return {
    directlyBlocked,
    indirectlyAffected: indirect,
    affectedMilestones: milestones,
    totalDelayChain: visited.size,
  }
}

// ─── Date utilities ──────────────────────────────────────────

function parseDate(s: string): Date {
  return new Date(s + 'T00:00:00')
}

function diffDays(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}

function formatDate(d: Date): string {
  const m = d.getMonth() + 1
  const day = d.getDate()
  return `${m}/${day}`
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

// ─── Gantt Chart SVG ─────────────────────────────────────────

interface GanttRowData {
  type: 'milestone-header' | 'task'
  task?: Task
  milestone?: Milestone
  node?: DepNode
  y: number
}

function GanttChart({
  project,
  nodeMap,
  selectedTaskId,
  onSelectTask,
  onHeightChange,
}: {
  project: Project
  nodeMap: Map<string, DepNode>
  selectedTaskId: string | null
  onSelectTask: (id: string | null) => void
  onHeightChange?: (height: number) => void
}) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; task: Task; node: DepNode } | null>(null)

  // Collapse state: set of collapsed milestone IDs
  const [collapsedMs, setCollapsedMs] = useState<Set<string>>(new Set())
  const milestoneIds = useMemo(() => {
    const tasksByMs = new Map<string, boolean>()
    for (const t of project.tasks) tasksByMs.set(t.milestoneId, true)
    return project.milestones.filter(m => tasksByMs.has(m.id)).map(m => m.id)
  }, [project.milestones, project.tasks])

  const allCollapsed = collapsedMs.size === milestoneIds.length
  const toggleMs = useCallback((msId: string) => {
    setCollapsedMs(prev => {
      const next = new Set(prev)
      if (next.has(msId)) next.delete(msId)
      else next.add(msId)
      return next
    })
  }, [])
  const toggleAll = useCallback(() => {
    setCollapsedMs(prev => prev.size === milestoneIds.length ? new Set() : new Set(milestoneIds))
  }, [milestoneIds])

  // Build time range
  const timeRange = useMemo(() => {
    const allDates: Date[] = []
    for (const t of project.tasks) {
      allDates.push(parseDate(t.startDate))
      allDates.push(parseDate(t.endDate))
    }
    if (allDates.length === 0) {
      const now = new Date()
      return { start: now, end: addDays(now, 30), totalDays: 30 }
    }
    const minDate = new Date(Math.min(...allDates.map(d => d.getTime())))
    const maxDate = new Date(Math.max(...allDates.map(d => d.getTime())))
    // Add padding
    const start = addDays(minDate, -3)
    const end = addDays(maxDate, 7)
    return { start, end, totalDays: diffDays(start, end) }
  }, [project.tasks])

  // Group tasks by milestone (respects collapsed state)
  const rowLayout = useMemo(() => {
    const tasksByMs = new Map<string, Task[]>()

    for (const t of project.tasks) {
      const list = tasksByMs.get(t.milestoneId) || []
      list.push(t)
      tasksByMs.set(t.milestoneId, list)
    }

    const rows: GanttRowData[] = []
    let y = 0

    for (const ms of project.milestones) {
      const tasks = tasksByMs.get(ms.id) || []
      if (tasks.length === 0) continue

      rows.push({ type: 'milestone-header', milestone: ms, y })
      y += MILESTONE_ROW_HEIGHT

      if (!collapsedMs.has(ms.id)) {
        for (const task of tasks) {
          const node = nodeMap.get(task.id)
          rows.push({ type: 'task', task, milestone: ms, node, y })
          y += ROW_HEIGHT
        }
      }
    }

    return { rows, totalHeight: y }
  }, [project.milestones, project.tasks, nodeMap, collapsedMs])

  // Milestone time ranges (computed from child tasks)
  const milestoneRanges = useMemo(() => {
    const map = new Map<string, { startDate: Date; endDate: Date }>()
    const tasksByMs = new Map<string, Task[]>()
    for (const t of project.tasks) {
      const list = tasksByMs.get(t.milestoneId) || []
      list.push(t)
      tasksByMs.set(t.milestoneId, list)
    }
    for (const [msId, tasks] of tasksByMs) {
      const starts = tasks.map(t => parseDate(t.startDate).getTime())
      const ends = tasks.map(t => parseDate(t.endDate).getTime())
      map.set(msId, {
        startDate: new Date(Math.min(...starts)),
        endDate: new Date(Math.max(...ends)),
      })
    }
    return map
  }, [project.tasks])

  // Task position map: taskId → { x, y, width }
  const taskRects = useMemo(() => {
    const map = new Map<string, { x: number; y: number; width: number; centerY: number }>()
    for (const row of rowLayout.rows) {
      if (row.type !== 'task' || !row.task) continue
      const start = parseDate(row.task.startDate)
      const end = parseDate(row.task.endDate)
      const x = diffDays(timeRange.start, start) * DAY_WIDTH
      const w = Math.max(MIN_BAR_WIDTH, diffDays(start, end) * DAY_WIDTH)
      map.set(row.task.id, {
        x,
        y: row.y + BAR_Y_OFFSET,
        width: w,
        centerY: row.y + ROW_HEIGHT / 2,
      })
    }
    return map
  }, [rowLayout.rows, timeRange.start])

  // Generate week markers
  const weekMarkers = useMemo(() => {
    const markers: { x: number; label: string; isMonth: boolean }[] = []
    const current = new Date(timeRange.start)
    // Align to Monday
    current.setDate(current.getDate() - current.getDay() + 1)

    while (current <= timeRange.end) {
      const x = diffDays(timeRange.start, current) * DAY_WIDTH
      const isMonth = current.getDate() <= 7
      markers.push({ x, label: formatDate(current), isMonth })
      current.setDate(current.getDate() + 7)
    }
    return markers
  }, [timeRange])

  // Dependency arrows
  const arrows = useMemo(() => {
    const result: {
      from: string
      to: string
      path: string
      isHighlighted: boolean
      isCritical: boolean
    }[] = []

    for (const [, node] of nodeMap) {
      for (const prereq of node.prerequisites) {
        const fromRect = taskRects.get(prereq.id)
        const toRect = taskRects.get(node.task.id)
        if (!fromRect || !toRect) continue

        const fromX = fromRect.x + fromRect.width
        const fromY = fromRect.centerY
        const toX = toRect.x
        const toY = toRect.centerY

        // Bezier curve
        const dx = Math.abs(toX - fromX)
        const cp = Math.max(30, dx * 0.4)
        const path = `M ${fromX} ${fromY} C ${fromX + cp} ${fromY}, ${toX - cp} ${toY}, ${toX} ${toY}`

        const isHighlighted =
          selectedTaskId === prereq.id || selectedTaskId === node.task.id ||
          hoveredTaskId === prereq.id || hoveredTaskId === node.task.id

        const fromNode = nodeMap.get(prereq.id)
        const isCritical = !!(fromNode?.isOnCriticalPath && node.isOnCriticalPath)

        result.push({ from: prereq.id, to: node.task.id, path, isHighlighted, isCritical })
      }
    }
    return result
  }, [nodeMap, taskRects, selectedTaskId, hoveredTaskId])

  // Today line
  const todayDate = useMemo(() => new Date(), [])
  const todayX = useMemo(() => {
    return diffDays(timeRange.start, todayDate) * DAY_WIDTH
  }, [timeRange.start, todayDate])
  const showToday = todayX >= 0 && todayX <= timeRange.totalDays * DAY_WIDTH

  const chartWidth = timeRange.totalDays * DAY_WIDTH
  const chartHeight = rowLayout.totalHeight + HEADER_HEIGHT

  const handleBarMouseEnter = useCallback((e: React.MouseEvent, task: Task, node: DepNode) => {
    setHoveredTaskId(task.id)
    setTooltip({
      x: e.clientX,
      y: e.clientY - 10,
      task,
      node,
    })
  }, [])

  const handleBarMouseLeave = useCallback(() => {
    setHoveredTaskId(null)
    setTooltip(null)
  }, [])

  // Report height to parent for right panel sync
  useEffect(() => {
    if (!wrapperRef.current || !onHeightChange) return
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        onHeightChange(entry.contentRect.height)
      }
    })
    observer.observe(wrapperRef.current)
    return () => observer.disconnect()
  }, [onHeightChange])

  return (
    <div ref={wrapperRef} className="border rounded-lg bg-card overflow-hidden">
      {/* Legend */}
      <div className="flex items-center gap-4 px-4 py-2 border-b bg-muted/30 text-sm text-muted-foreground flex-wrap">
        <span className="font-medium">圖例：</span>
        {Object.entries(STATUS_BAR_COLORS).map(([status, { fill }]) => (
          <span key={status} className="flex items-center gap-1.5">
            <span className="w-3 h-2 rounded-sm inline-block" style={{ backgroundColor: fill }} />
            {STATUS_LABELS[status]}
          </span>
        ))}
        <span className="flex items-center gap-1.5 ml-2">
          <svg width="24" height="10" className="inline-block"><path d="M 0 5 C 8 5, 16 5, 24 5" stroke="#f59e0b" strokeWidth="2" fill="none" /></svg>
          關鍵路徑
        </span>
        <span className="flex items-center gap-1.5">
          <svg width="24" height="10" className="inline-block"><path d="M 0 5 C 8 5, 16 5, 24 5" stroke="#94a3b8" strokeWidth="1.5" fill="none" strokeDasharray="4 2" /></svg>
          相依關係
        </span>
        <span className="text-muted-foreground">|</span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-0.5 bg-red-500 rounded inline-block" style={{ borderTop: '1.5px dashed #ef4444' }} />
          今天
        </span>
      </div>

      <div className="flex">
        {/* Left label column */}
        <div className="shrink-0 border-r bg-muted/20" style={{ width: LEFT_LABEL_WIDTH }}>
          {/* Header */}
          <div className="flex items-center justify-between px-3 border-b bg-muted/40" style={{ height: HEADER_HEIGHT }}>
            <span className="text-sm font-medium text-muted-foreground">里程碑 / 任務</span>
            <button
              onClick={toggleAll}
              className="flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              title={allCollapsed ? '全部展開' : '全部收合'}
            >
              <ChevronsUpDown className="h-3 w-3" />
            </button>
          </div>
          {/* Rows */}
          <div>
            {rowLayout.rows.map((row, i) => {
              if (row.type === 'milestone-header') {
                const msId = row.milestone?.id || ''
                const isCollapsed = collapsedMs.has(msId)
                const msIdx = project.milestones.findIndex(m => m.id === msId)
                const msProgress = row.milestone?.progress ?? 0
                const msStatusColor = STATUS_BAR_COLORS[row.milestone?.status === 'in-progress' ? 'in-progress' : row.milestone?.status === 'done' ? 'done' : 'todo']
                return (
                  <div
                    key={`ms-${msId || i}`}
                    className="flex items-center gap-1.5 px-2 border-b border-border cursor-pointer bg-muted/40 hover:bg-muted/60 transition-colors"
                    style={{ height: MILESTONE_ROW_HEIGHT }}
                    onClick={() => toggleMs(msId)}
                  >
                    {isCollapsed
                      ? <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                    }
                    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-[11px] font-medium">
                      {msIdx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold truncate">
                          {row.milestone?.name}
                        </span>
                        <Badge
                          className="text-[11px] px-1 py-0 shrink-0 text-white border-0"
                          style={{ backgroundColor: msStatusColor.fill }}
                        >
                          {msProgress}%
                        </Badge>
                      </div>
                      <div className="text-sm text-muted-foreground mt-0.5">
                        到期：{row.milestone ? (() => { const d = parseDate(row.milestone.dueDate); return `${d.getMonth() + 1}月${d.getDate()}日` })() : ''}
                      </div>
                    </div>
                  </div>
                )
              }

              const isSelected = selectedTaskId === row.task?.id
              const isHovered = hoveredTaskId === row.task?.id
              const taskIdx = rowLayout.rows.filter(r => r.type === 'task').indexOf(row)

              return (
                <div
                  key={row.task?.id ?? i}
                  className={`flex items-center gap-2 px-3 pl-10 border-b border-border cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-amber-50 dark:bg-amber-950/20'
                      : isHovered
                        ? 'bg-amber-50/50 dark:bg-amber-950/10'
                        : taskIdx % 2 === 0
                          ? 'bg-card hover:bg-accent/50'
                          : 'bg-muted/5 hover:bg-accent/50'
                  }`}
                  style={{ height: ROW_HEIGHT }}
                  onClick={() => onSelectTask(isSelected ? null : row.task!.id)}
                  onMouseEnter={() => setHoveredTaskId(row.task!.id)}
                  onMouseLeave={() => { setHoveredTaskId(null); setTooltip(null) }}
                >
                  <div className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT_COLORS[row.task?.status || 'todo']}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm truncate">{row.task?.title}</span>
                      {row.node?.isOnCriticalPath && (
                        <Route className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                      )}
                    </div>
                    {row.task?.assignee && (
                      <span className="text-sm text-muted-foreground">{row.task.assignee}</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Right scrollable chart area */}
        <div ref={scrollRef} className="flex-1 overflow-x-auto relative">
          <svg
            ref={svgRef}
            width={chartWidth}
            height={chartHeight}
            className="block"
          >
            {/* Week column headers */}
            <g>
              {weekMarkers.map((marker, i) => (
                <g key={i}>
                  <line
                    x1={marker.x}
                    y1={0}
                    x2={marker.x}
                    y2={chartHeight}
                    stroke={marker.isMonth ? 'var(--border)' : 'var(--border)'}
                    strokeWidth={marker.isMonth ? 1 : 0.5}
                    opacity={marker.isMonth ? 0.8 : 0.4}
                  />
                  <text
                    x={marker.x + 4}
                    y={HEADER_HEIGHT / 2 + 4}
                    fontSize="10"
                    fill="var(--muted-foreground)"
                    opacity={0.7}
                  >
                    {marker.label}
                  </text>
                </g>
              ))}
              {/* Header bottom line */}
              <line x1={0} y1={HEADER_HEIGHT} x2={chartWidth} y2={HEADER_HEIGHT} stroke="var(--border)" strokeWidth={1} />
            </g>

            {/* Row backgrounds */}
            {rowLayout.rows.map((row, i) => {
              if (row.type === 'milestone-header') {
                const msRange = row.milestone ? milestoneRanges.get(row.milestone.id) : null
                const msX = msRange ? diffDays(timeRange.start, msRange.startDate) * DAY_WIDTH : 0
                const msW = msRange ? Math.max(MIN_BAR_WIDTH, diffDays(msRange.startDate, msRange.endDate) * DAY_WIDTH) : 0
                const barH = 16
                const barY = row.y + HEADER_HEIGHT + (MILESTONE_ROW_HEIGHT - barH) / 2
                const msStatusColor = STATUS_BAR_COLORS[row.milestone?.status === 'in-progress' ? 'in-progress' : row.milestone?.status === 'done' ? 'done' : 'todo']

                return (
                  <g key={`ms-bg-${i}`}>
                    {/* Milestone row background */}
                    <rect
                      x={0} y={row.y + HEADER_HEIGHT}
                      width={chartWidth} height={MILESTONE_ROW_HEIGHT}
                      fill="rgba(0, 0, 0, 0.02)"
                    />
                    {/* Bottom separator line */}
                    <line
                      x1={0} y1={row.y + HEADER_HEIGHT + MILESTONE_ROW_HEIGHT}
                      x2={chartWidth} y2={row.y + HEADER_HEIGHT + MILESTONE_ROW_HEIGHT}
                      stroke="var(--border)" strokeWidth={1} opacity={0.6}
                    />
                    {/* Milestone range bar */}
                    {msRange && (
                      <g>
                        <rect
                          x={msX}
                          y={barY}
                          width={msW}
                          height={barH}
                          rx={3}
                          fill={msStatusColor.fill}
                          stroke={msStatusColor.stroke}
                          strokeWidth={1}
                          opacity={0.7}
                        />
                        {/* Progress overlay */}
                        {(row.milestone?.progress ?? 0) > 0 && (row.milestone?.progress ?? 0) < 100 && (
                          <rect
                            x={msX}
                            y={barY}
                            width={msW * ((row.milestone?.progress ?? 0) / 100)}
                            height={barH}
                            rx={3}
                            fill="rgba(255, 255, 255, 0.3)"
                          />
                        )}
                      </g>
                    )}
                  </g>
                )
              }

              const isSelected = selectedTaskId === row.task?.id
              const taskIdx = rowLayout.rows.filter(r => r.type === 'task').indexOf(row)
              return (
                <g key={`row-bg-${i}`}>
                  <rect
                    x={0}
                    y={row.y + HEADER_HEIGHT}
                    width={chartWidth}
                    height={ROW_HEIGHT}
                    fill={
                      isSelected
                        ? 'rgba(245, 158, 11, 0.1)'
                        : taskIdx % 2 !== 0
                          ? 'rgba(0, 0, 0, 0.015)'
                          : 'transparent'
                    }
                    className="cursor-pointer"
                    onClick={() => onSelectTask(isSelected ? null : row.task!.id)}
                    onMouseEnter={() => setHoveredTaskId(row.task!.id)}
                    onMouseLeave={() => { setHoveredTaskId(null); setTooltip(null) }}
                  />
                  {/* Row separator line */}
                  <line
                    x1={0} y1={row.y + HEADER_HEIGHT + ROW_HEIGHT}
                    x2={chartWidth} y2={row.y + HEADER_HEIGHT + ROW_HEIGHT}
                    stroke="var(--border)" strokeWidth={1} opacity={0.4}
                  />
                </g>
              )
            })}

            {/* Dependency arrows (behind bars) */}
            <g>
              {arrows.map((arrow, i) => (
                <g key={i}>
                  <path
                    d={arrow.path}
                    fill="none"
                    stroke={
                      arrow.isHighlighted
                        ? arrow.isCritical ? '#f59e0b' : '#3b82f6'
                        : arrow.isCritical ? '#f59e0b' : '#94a3b8'
                    }
                    strokeWidth={arrow.isHighlighted ? 2.5 : arrow.isCritical ? 2 : 1.5}
                    strokeDasharray={arrow.isCritical ? 'none' : '6 3'}
                    opacity={arrow.isHighlighted ? 1 : 0.5}
                    style={{
                      transform: `translateY(${HEADER_HEIGHT}px)`,
                    }}
                  />
                  {/* Arrow head */}
                  <ArrowHead
                    arrow={arrow}
                    taskRects={taskRects}
                    headerOffset={HEADER_HEIGHT}
                  />
                </g>
              ))}
            </g>

            {/* Task bars */}
            {rowLayout.rows.map((row) => {
              if (row.type !== 'task' || !row.task) return null
              const rect = taskRects.get(row.task.id)
              if (!rect) return null

              const colors = STATUS_BAR_COLORS[row.task.status] || STATUS_BAR_COLORS.todo
              const isSelected = selectedTaskId === row.task.id
              const isHovered = hoveredTaskId === row.task.id
              const isCritical = row.node?.isOnCriticalPath

              return (
                <g
                  key={row.task.id}
                  className="cursor-pointer"
                  onClick={() => onSelectTask(isSelected ? null : row.task!.id)}
                  onMouseEnter={(e) => handleBarMouseEnter(e, row.task!, row.node!)}
                  onMouseLeave={handleBarMouseLeave}
                >
                  {/* Bar background */}
                  <rect
                    x={rect.x}
                    y={rect.y + HEADER_HEIGHT}
                    width={rect.width}
                    height={BAR_HEIGHT}
                    rx={3}
                    fill={colors.fill}
                    stroke={isSelected ? '#d97706' : isCritical ? '#f59e0b' : colors.stroke}
                    strokeWidth={isSelected ? 2 : isCritical ? 1.5 : 1}
                    opacity={isHovered ? 1 : 0.85}
                  />

                  {/* Progress overlay (white/lighter, matching gantt-chart.tsx style) */}
                  {row.task.progress > 0 && row.task.progress < 100 && (
                    <rect
                      x={rect.x}
                      y={rect.y + HEADER_HEIGHT}
                      width={rect.width * (row.task.progress / 100)}
                      height={BAR_HEIGHT}
                      rx={3}
                      fill="rgba(255, 255, 255, 0.3)"
                    />
                  )}

                  {/* Bar label */}
                  {rect.width > 60 && (
                    <text
                      x={rect.x + 6}
                      y={rect.y + HEADER_HEIGHT + BAR_HEIGHT / 2 + 4}
                      fontSize="10"
                      fill="#334155"
                      fontWeight="500"
                      className="pointer-events-none select-none"
                    >
                      <tspan>{row.task.title.length > rect.width / 7 ? row.task.title.slice(0, Math.floor(rect.width / 7)) + '...' : row.task.title}</tspan>
                    </text>
                  )}

                  {/* Dependency dots */}
                  {(row.node?.prerequisites?.length ?? 0) > 0 && (
                    <circle
                      cx={rect.x}
                      cy={rect.centerY + HEADER_HEIGHT}
                      r={4}
                      fill="white"
                      stroke={colors.stroke}
                      strokeWidth={1.5}
                    />
                  )}
                  {(row.node?.dependents?.length ?? 0) > 0 && (
                    <circle
                      cx={rect.x + rect.width}
                      cy={rect.centerY + HEADER_HEIGHT}
                      r={4}
                      fill="white"
                      stroke={colors.stroke}
                      strokeWidth={1.5}
                    />
                  )}
                </g>
              )
            })}

            {/* Today line */}
            {showToday && (
              <line
                x1={todayX}
                y1={0}
                x2={todayX}
                y2={chartHeight}
                stroke="#ef4444"
                strokeWidth={1.5}
                strokeDasharray="6 3"
                opacity={0.7}
              />
            )}
          </svg>

          {/* Tooltip */}
          {tooltip && (
            <div
              className="fixed pointer-events-none z-50 bg-popover border rounded-lg shadow-lg p-3 min-w-[200px]"
              style={{
                left: tooltip.x,
                top: tooltip.y,
                transform: 'translate(-50%, -100%)',
              }}
            >
              <div className="font-medium text-sm mb-1">{tooltip.task.title}</div>
              <div className="text-sm text-muted-foreground space-y-0.5">
                <div>{tooltip.task.startDate} ~ {tooltip.task.endDate}</div>
                <div>負責人：{tooltip.task.assignee}</div>
                <div>進度：{tooltip.task.progress}%</div>
                {tooltip.node.isOnCriticalPath && (
                  <div className="text-amber-600 dark:text-amber-400 font-medium mt-1">
                    關鍵路徑上的任務
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// SVG arrow head component
function ArrowHead({
  arrow,
  taskRects,
  headerOffset,
}: {
  arrow: { from: string; to: string; isCritical: boolean; isHighlighted: boolean }
  taskRects: Map<string, { x: number; y: number; width: number; centerY: number }>
  headerOffset: number
}) {
  const toRect = taskRects.get(arrow.to)
  if (!toRect) return null

  const x = toRect.x
  const y = toRect.centerY + headerOffset
  const size = 5

  return (
    <polygon
      points={`${x},${y} ${x - size},${y - size} ${x - size},${y + size}`}
      fill={
        arrow.isHighlighted
          ? arrow.isCritical ? '#f59e0b' : '#3b82f6'
          : arrow.isCritical ? '#f59e0b' : '#94a3b8'
      }
      opacity={arrow.isHighlighted ? 1 : 0.6}
    />
  )
}

// ─── Main Component ─────────────────────────────────────────

export function TaskDependencyAnalysis({ project }: { project: Project }) {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [ganttHeight, setGanttHeight] = useState<number>(0)

  const nodeMap = useMemo(() => buildDepGraph(project), [project])

  const hasDeps = useMemo(() => {
    return [...nodeMap.values()].filter(n => n.prerequisites.length > 0 || n.dependents.length > 0)
  }, [nodeMap])

  const criticalPath = useMemo(() => {
    return [...nodeMap.values()]
      .filter(n => n.isOnCriticalPath)
      .sort((a, b) => a.depth - b.depth)
  }, [nodeMap])

  const standalone = useMemo(() => {
    return [...nodeMap.values()].filter(n => n.prerequisites.length === 0 && n.dependents.length === 0)
  }, [nodeMap])

  const impact = useMemo(() => {
    if (!selectedTaskId) return null
    return computeImpact(selectedTaskId, nodeMap)
  }, [selectedTaskId, nodeMap])

  const selectedNode = selectedTaskId ? nodeMap.get(selectedTaskId) : null

  if (hasDeps.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Network className="h-10 w-10 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm font-medium">此專案尚未設定任務相依關係</p>
          <p className="text-sm text-muted-foreground mt-1">
            任務的 dependencies 欄位可定義前置任務，系統會自動分析影響鏈
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Summary stats bar */}
      <div className="flex items-center gap-0 rounded-lg border bg-card divide-x overflow-hidden">
        <div className="flex-1 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-0.5">
            <Network className="h-3.5 w-3.5" />
            相依關係
          </div>
          <span className="text-xl font-bold">{hasDeps.length}</span>
          <span className="text-sm text-muted-foreground ml-1">個任務有相依</span>
        </div>
        <div className="flex-1 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-0.5">
            <Route className="h-3.5 w-3.5" />
            關鍵路徑
          </div>
          <span className="text-xl font-bold">{criticalPath.length}</span>
          <span className="text-sm text-muted-foreground ml-1">個任務</span>
        </div>
        <div className="flex-1 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-0.5">
            <CheckCircle2 className="h-3.5 w-3.5" />
            獨立任務
          </div>
          <span className="text-xl font-bold">{standalone.length}</span>
          <span className="text-sm text-muted-foreground ml-1">個</span>
        </div>
      </div>

      {/* Gantt Chart + Impact Analysis */}
      <div className="grid gap-4 lg:grid-cols-5 items-start">
        {/* Left: Gantt Chart */}
        <div className="lg:col-span-3">
          <GanttChart
            project={project}
            nodeMap={nodeMap}
            selectedTaskId={selectedTaskId}
            onSelectTask={setSelectedTaskId}
            onHeightChange={setGanttHeight}
          />
        </div>

        {/* Right: Impact Analysis Panel */}
        <div
          className="lg:col-span-2 overflow-y-auto"
          style={ganttHeight > 0 ? { maxHeight: ganttHeight } : undefined}
        >
          <div>
            {selectedNode && impact ? (
              <Card>
                <div className="px-4 py-3 border-b bg-muted/30 relative">
                  <Badge className={`absolute top-3 right-4 text-sm px-2 py-0.5 ${PRIORITY_COLORS[selectedNode.task.priority]}`}>
                    {selectedNode.task.priority === 'high' ? '高' : selectedNode.task.priority === 'medium' ? '中' : '低'}優先
                  </Badge>
                  <div className="flex items-center gap-2 mb-1 pr-16">
                    <div className={`w-2.5 h-2.5 rounded-full ${STATUS_DOT_COLORS[selectedNode.task.status]}`} />
                    <h3 className="font-semibold text-base">{selectedNode.task.title}</h3>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <span>{selectedNode.milestone?.name}</span>
                    <span>{selectedNode.task.assignee}</span>
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    {selectedNode.task.startDate} ~ {selectedNode.task.endDate} ({selectedNode.task.durationDays}天)
                  </div>
                </div>

                <CardContent className="p-4 space-y-4">
                  {/* Prerequisites */}
                  <div>
                    <h4 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                      <ArrowRight className="h-3.5 w-3.5 rotate-180" />
                      前置任務 ({selectedNode.prerequisites.length})
                    </h4>
                    {selectedNode.prerequisites.length === 0 ? (
                      <p className="text-sm text-muted-foreground/60 italic">無前置任務（可隨時開始）</p>
                    ) : (
                      <div className="space-y-1.5">
                        {selectedNode.prerequisites.map(t => (
                          <div
                            key={t.id}
                            className="flex items-center gap-2 p-2 rounded-md border text-sm cursor-pointer hover:bg-muted/30"
                            onClick={() => setSelectedTaskId(t.id)}
                          >
                            <div className={`w-2 h-2 rounded-full ${STATUS_DOT_COLORS[t.status]}`} />
                            <span className="flex-1 truncate">{t.title}</span>
                            {t.status === 'done' ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                            ) : (
                              <Clock className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Impact Analysis */}
                  <div className="border-t pt-4">
                    <h4 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                      延遲影響分析
                    </h4>

                    {impact.totalDelayChain === 0 ? (
                      <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900">
                        <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
                          <CheckCircle2 className="h-4 w-4" />
                          <span className="font-medium">此任務延遲不會影響其他任務</span>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className={`p-3 rounded-lg border ${
                          impact.totalDelayChain >= 3
                            ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900'
                            : 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900'
                        }`}>
                          <div className={`flex items-center gap-2 text-sm font-medium ${
                            impact.totalDelayChain >= 3
                              ? 'text-red-700 dark:text-red-400'
                              : 'text-amber-700 dark:text-amber-400'
                          }`}>
                            <AlertTriangle className="h-4 w-4" />
                            若此任務延遲，將影響 {impact.totalDelayChain} 個後續任務
                          </div>
                          {impact.affectedMilestones.length > 0 && (
                            <p className="text-sm text-muted-foreground mt-1">
                              涉及里程碑：{impact.affectedMilestones.map(m => m.name).join('、')}
                            </p>
                          )}
                        </div>

                        {impact.directlyBlocked.length > 0 && (
                          <div>
                            <div className="text-sm font-medium text-muted-foreground mb-1.5">
                              直接影響（{impact.directlyBlocked.length}）
                            </div>
                            <div className="space-y-1">
                              {impact.directlyBlocked.map(t => (
                                <div
                                  key={t.id}
                                  className="flex items-center gap-2 p-2 rounded-md border text-sm cursor-pointer hover:bg-muted/30"
                                  onClick={() => setSelectedTaskId(t.id)}
                                >
                                  <div className={`w-2 h-2 rounded-full ${STATUS_DOT_COLORS[t.status]}`} />
                                  <span className="flex-1 truncate">{t.title}</span>
                                  <span className="text-sm text-muted-foreground">{t.assignee}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {impact.indirectlyAffected.length > 0 && (
                          <div>
                            <div className="text-sm font-medium text-muted-foreground mb-1.5">
                              間接影響（{impact.indirectlyAffected.length}）
                            </div>
                            <div className="space-y-1">
                              {impact.indirectlyAffected.map(t => (
                                <div
                                  key={t.id}
                                  className="flex items-center gap-2 p-2 rounded-md border border-dashed text-sm cursor-pointer hover:bg-muted/30"
                                  onClick={() => setSelectedTaskId(t.id)}
                                >
                                  <div className={`w-2 h-2 rounded-full ${STATUS_DOT_COLORS[t.status]} opacity-50`} />
                                  <span className="flex-1 truncate text-muted-foreground">{t.title}</span>
                                  <span className="text-sm text-muted-foreground">{t.assignee}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {selectedNode.isOnCriticalPath && (
                    <div className="border-t pt-3">
                      <div className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 rounded-md p-2.5 border border-amber-200 dark:border-amber-900">
                        <Route className="h-3.5 w-3.5 shrink-0" />
                        <span>此任務在<strong>關鍵路徑</strong>上，延遲會直接影響專案完成日期</span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="py-12 text-center">
                  <Info className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">點擊任務查看延遲影響分析</p>
                  <p className="text-sm text-muted-foreground/60 mt-1">
                    在甘特圖上點擊任一任務，系統會計算該任務延遲後的影響範圍
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* Footer info */}
      <p className="text-sm text-muted-foreground flex items-center gap-1.5">
        <Info className="h-3.5 w-3.5 shrink-0" />
        任務相依關係於開案時自動建立（依里程碑與任務順序）。關鍵路徑為最長的任務串接，決定了專案最短可完成時間。
      </p>
    </div>
  )
}
