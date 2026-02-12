'use client'

import { useMemo, useEffect, useState, useRef } from 'react'
import type { Task, Milestone } from '@/lib/mock-data'
import type { DepNode } from '@/lib/dependency-graph'

interface GanttDependencyOverlayProps {
  tasks: Task[]
  milestones: Milestone[]
  nodeMap: Map<string, DepNode>
  expandedMilestoneIds: Set<string>
  containerRef: React.RefObject<HTMLDivElement | null>
  toPercent: (date: string) => number
  hoveredTaskId: string | null
  selectedTaskId: string | null
  showBaseline?: boolean
}

interface TaskRect {
  y: number
  height: number
  leftPct: number
  rightPct: number
  /** Vertical offset for the actual bar center (relative to row top) */
  barCenterY: number
}

export function GanttDependencyOverlay({
  tasks,
  milestones,
  nodeMap,
  expandedMilestoneIds,
  containerRef,
  toPercent,
  hoveredTaskId,
  selectedTaskId,
  showBaseline,
}: GanttDependencyOverlayProps) {
  const [taskRects, setTaskRects] = useState<Map<string, TaskRect>>(new Map())
  const [containerWidth, setContainerWidth] = useState(0)
  const rafRef = useRef<number>(0)

  // Measure task row positions from DOM
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const measure = () => {
      const map = new Map<string, TaskRect>()
      const els = container.querySelectorAll<HTMLElement>('[data-task-id]')
      const containerRect = container.getBoundingClientRect()

      // Find the timeline area (right of LEFT_COL)
      const timelineEl = container.querySelector<HTMLElement>('[data-timeline-area]')
      const timelineWidth = timelineEl?.offsetWidth ?? (containerRect.width - 260)
      setContainerWidth(timelineWidth)

      els.forEach(el => {
        const taskId = el.getAttribute('data-task-id')
        if (!taskId) return

        const task = tasks.find(t => t.id === taskId)
        if (!task) return

        const elRect = el.getBoundingClientRect()
        const y = elRect.top - containerRect.top
        const height = elRect.height

        // Early-complete: arrow connects at the actual bar end (completedAt)
        const earlyComplete = showBaseline && task.completedAt &&
          new Date(task.completedAt).getTime() < new Date(task.endDate).getTime()

        map.set(taskId, {
          y,
          height,
          leftPct: toPercent(task.startDate),
          rightPct: toPercent(earlyComplete ? task.completedAt! : task.endDate),
          // h-14 row: actual bar center at top:26 + h-4/2 = 34; h-10 row: top:12 + h-4/2 = 20
          barCenterY: earlyComplete ? 34 : height / 2,
        })
      })

      setTaskRects(map)
    }

    measure()

    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(measure)
    })
    observer.observe(container)

    // Also re-measure on DOM changes (expand/collapse milestones)
    const mutObserver = new MutationObserver(() => {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(measure)
    })
    mutObserver.observe(container, { childList: true, subtree: true })

    return () => {
      observer.disconnect()
      mutObserver.disconnect()
      cancelAnimationFrame(rafRef.current)
    }
  }, [containerRef, tasks, expandedMilestoneIds, toPercent, showBaseline])

  // Build arrows
  const arrows = useMemo(() => {
    if (containerWidth === 0 || taskRects.size === 0) return []

    const result: {
      from: string
      to: string
      path: string
      headX: number
      headY: number
      isHighlighted: boolean
      isCritical: boolean
    }[] = []

    for (const [, node] of nodeMap) {
      for (const prereq of node.prerequisites) {
        const fromRect = taskRects.get(prereq.id)
        const toRect = taskRects.get(node.task.id)
        if (!fromRect || !toRect) continue

        // X positions: convert percentage to pixels
        const fromX = (fromRect.rightPct / 100) * containerWidth
        const fromY = fromRect.y + fromRect.barCenterY
        const toX = (toRect.leftPct / 100) * containerWidth
        const toY = toRect.y + toRect.barCenterY

        // Bezier curve
        const dx = Math.abs(toX - fromX)
        const cp = Math.max(30, dx * 0.4)
        const path = `M ${fromX} ${fromY} C ${fromX + cp} ${fromY}, ${toX - cp} ${toY}, ${toX} ${toY}`

        const isHighlighted =
          selectedTaskId === prereq.id || selectedTaskId === node.task.id ||
          hoveredTaskId === prereq.id || hoveredTaskId === node.task.id

        const fromNode = nodeMap.get(prereq.id)
        const isCritical = !!(fromNode?.isOnCriticalPath && node.isOnCriticalPath)

        result.push({
          from: prereq.id,
          to: node.task.id,
          path,
          headX: toX,
          headY: toY,
          isHighlighted,
          isCritical,
        })
      }
    }
    return result
  }, [nodeMap, taskRects, containerWidth, selectedTaskId, hoveredTaskId])

  if (arrows.length === 0) return null

  // Get the total height of the container
  const container = containerRef.current
  const svgHeight = container?.scrollHeight ?? 800

  return (
    <svg
      className="absolute top-0 right-0 pointer-events-none"
      style={{ left: 260, width: containerWidth, height: svgHeight }}
    >
      {/* Render non-highlighted arrows first, then highlighted ones on top */}
      {arrows
        .sort((a, b) => {
          if (a.isHighlighted && !b.isHighlighted) return 1
          if (!a.isHighlighted && b.isHighlighted) return -1
          if (a.isCritical && !b.isCritical) return 1
          if (!a.isCritical && b.isCritical) return -1
          return 0
        })
        .map((arrow, i) => (
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
            />
            {/* Arrow head */}
            <polygon
              points={`${arrow.headX},${arrow.headY} ${arrow.headX - 5},${arrow.headY - 5} ${arrow.headX - 5},${arrow.headY + 5}`}
              fill={
                arrow.isHighlighted
                  ? arrow.isCritical ? '#f59e0b' : '#3b82f6'
                  : arrow.isCritical ? '#f59e0b' : '#94a3b8'
              }
              opacity={arrow.isHighlighted ? 1 : 0.6}
            />
          </g>
        ))
      }
    </svg>
  )
}
