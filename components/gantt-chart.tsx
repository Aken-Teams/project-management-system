'use client'

import { useRef, useState, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { type Task, type Milestone } from '@/lib/mock-data'
import { cn } from '@/lib/utils'
import { Diamond } from 'lucide-react'

interface GanttChartProps {
  tasks?: Task[]
  milestones?: Milestone[]
  startDate: string
  endDate: string
}

const STATUS_COLORS: Record<string, { bg: string; border: string }> = {
  'done': { bg: '#10b981', border: '#059669' },       // emerald
  'in-progress': { bg: '#3b82f6', border: '#2563eb' }, // blue
  'blocked': { bg: '#ef4444', border: '#dc2626' },     // red
  'todo': { bg: '#94a3b8', border: '#64748b' },         // slate
}

export function GanttChart({ tasks = [], milestones = [], startDate, endDate }: GanttChartProps) {
  const timelineRef = useRef<HTMLDivElement>(null)
  const [hoverX, setHoverX] = useState<number | null>(null)
  const [hoverDate, setHoverDate] = useState<string>('')

  // Auto-detect date range from actual data
  const allDates = [
    ...tasks.map(t => new Date(t.startDate).getTime()),
    ...tasks.map(t => new Date(t.endDate).getTime()),
    ...milestones.map(m => new Date(m.dueDate).getTime()),
    new Date(startDate).getTime(),
    new Date(endDate).getTime(),
  ]
  const rangeStart = new Date(Math.min(...allDates))
  rangeStart.setDate(1) // Align to 1st of month
  const rangeEnd = new Date(Math.max(...allDates))
  rangeEnd.setMonth(rangeEnd.getMonth() + 1, 0) // End of month

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

  // Today line — only show if today is within range
  const today = new Date()
  const todayPct = ((today.getTime() - rangeStart.getTime()) / (1000 * 60 * 60 * 24) / totalDays) * 100
  const showToday = todayPct >= 0 && todayPct <= 100

  // Hover crosshair handler
  const LEFT_COL = 224 // w-56 = 224px
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineRef.current) return
    const rect = timelineRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    if (x < LEFT_COL || x > rect.width) {
      setHoverX(null)
      return
    }
    setHoverX(x)
    // Calculate date from position
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

  const getPriorityBadgeClass = (priority: 'low' | 'medium' | 'high') => {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-700 border-red-300'
      case 'medium': return 'bg-amber-100 text-amber-700 border-amber-300'
      case 'low': return 'bg-slate-100 text-slate-500 border-slate-300'
    }
  }

  const getPriorityLabel = (p: string) => p === 'high' ? '高' : p === 'medium' ? '中' : '低'

  // Week grid count
  const weekCount = Math.ceil(totalDays / 7)

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
            <div className="w-56 shrink-0 px-3 py-2 border-r bg-muted/30">
              <span className="text-xs font-medium text-muted-foreground">任務名稱</span>
            </div>
            <div className="flex-1">
              <div className="flex">
                {months.map((month, i) => (
                  <div
                    key={i}
                    style={{ width: `${(month.days / totalDays) * 100}%` }}
                    className="text-center py-1.5 text-xs font-medium border-r last:border-r-0 bg-muted/30"
                  >
                    {month.name}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Milestones + Tasks grouped */}
          {tasksByMilestone.map(({ milestone, tasks: msTasks }, msIndex) => (
            <div key={milestone.id}>
              {/* Milestone header row */}
              <div className="flex items-center bg-muted/40 border-b">
                <div className="w-56 shrink-0 px-3 py-1.5 border-r">
                  <div className="flex items-center gap-2">
                    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-medium">
                      {msIndex + 1}
                    </div>
                    <span className="text-xs font-semibold truncate">{milestone.name}</span>
                    <Badge
                      className="text-[9px] px-1 py-0 shrink-0 text-white border-0"
                      style={{ backgroundColor: STATUS_COLORS[milestone.status]?.bg || STATUS_COLORS.todo.bg }}
                    >
                      {milestone.progress}%
                    </Badge>
                  </div>
                </div>
                <div className="flex-1 relative h-7">
                  {/* Week grid */}
                  {Array.from({ length: weekCount }).map((_, i) => (
                    <div key={i} className="absolute top-0 bottom-0 border-r border-dashed border-muted-foreground/10" style={{ left: `${(i * 7 / totalDays) * 100}%` }} />
                  ))}
                  {/* Milestone diamond */}
                  <div
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10"
                    style={{ left: `${toPercent(milestone.dueDate)}%` }}
                  >
                    <Diamond className="h-4 w-4 fill-primary text-primary" />
                  </div>
                  {/* Today line */}
                  {showToday && (
                    <div className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10" style={{ left: `${todayPct}%` }} />
                  )}
                </div>
              </div>

              {/* Tasks */}
              {msTasks.map((task, ti) => {
                const colors = STATUS_COLORS[task.status] || STATUS_COLORS.todo
                return (
                  <div
                    key={task.id}
                    className={cn(
                      'flex items-center border-b transition-colors',
                      ti % 2 === 0 ? 'bg-card' : 'bg-muted/15',
                    )}
                  >
                    <div className="w-56 shrink-0 px-3 py-1.5 border-r">
                      <div className="flex items-center gap-1.5">
                        <Badge className={cn('text-[9px] px-1 py-0 shrink-0', getPriorityBadgeClass(task.priority))}>
                          {getPriorityLabel(task.priority)}
                        </Badge>
                        <span className={cn(
                          'text-xs truncate',
                          task.status === 'done' && 'line-through text-muted-foreground',
                        )}>{task.title}</span>
                      </div>
                      {task.assignee && (
                        <span className="text-[10px] text-muted-foreground ml-6">{task.assignee}</span>
                      )}
                    </div>
                    <div className="flex-1 relative h-9">
                      {/* Week grid */}
                      {Array.from({ length: weekCount }).map((_, i) => (
                        <div key={i} className="absolute top-0 bottom-0 border-r border-dashed border-muted-foreground/10" style={{ left: `${(i * 7 / totalDays) * 100}%` }} />
                      ))}
                      {/* Task bar — using inline styles to guarantee color rendering */}
                      <div
                        className="absolute h-5 rounded-sm top-2 border"
                        style={{
                          ...barStyle(task.startDate, task.endDate),
                          backgroundColor: colors.bg,
                          borderColor: colors.border,
                        }}
                      >
                        {/* Progress fill overlay (lighter portion = completed) */}
                        {task.progress > 0 && task.progress < 100 && (
                          <div
                            className="absolute inset-y-0 left-0 bg-white/30 rounded-l-sm"
                            style={{ width: `${task.progress}%` }}
                          />
                        )}
                      </div>
                      {/* Today line */}
                      {showToday && (
                        <div className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10" style={{ left: `${todayPct}%` }} />
                      )}
                    </div>
                  </div>
                )
              })}

              {msTasks.length === 0 && (
                <div className="flex items-center border-b bg-card">
                  <div className="w-56 shrink-0 px-3 py-1.5 border-r">
                    <span className="text-xs text-muted-foreground italic ml-6">無任務</span>
                  </div>
                  <div className="flex-1 h-7" />
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* Legend */}
      <Card className="px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs">
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
            <Diamond className="h-3.5 w-3.5 fill-primary text-primary" />
            <span>里程碑</span>
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
