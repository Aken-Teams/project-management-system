'use client'

import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { type Task, type Milestone } from '@/lib/mock-data'
import { cn } from '@/lib/utils'

interface GanttChartProps {
  tasks?: Task[]
  milestones?: Milestone[]
  startDate: string
  endDate: string
}

export function GanttChart({ tasks = [], milestones = [], startDate, endDate }: GanttChartProps) {
  const projectStart = new Date(startDate)
  const projectEnd = new Date(endDate)
  const totalDays = Math.ceil((projectEnd.getTime() - projectStart.getTime()) / (1000 * 60 * 60 * 24))
  
  // Generate months for header
  const months: { name: string; days: number; startDay: number }[] = []
  let currentDate = new Date(projectStart)
  let dayCount = 0
  
  while (currentDate <= projectEnd) {
    const monthName = currentDate.toLocaleDateString('zh-TW', { year: 'numeric', month: 'short' })
    const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate()
    const remainingDaysInMonth = daysInMonth - currentDate.getDate() + 1
    const daysToAdd = Math.min(remainingDaysInMonth, totalDays - dayCount)
    
    months.push({
      name: monthName,
      days: daysToAdd,
      startDay: dayCount
    })
    
    dayCount += daysToAdd
    currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1)
  }

  const calculatePosition = (itemStart: string, itemEnd: string) => {
    const start = new Date(itemStart)
    const end = new Date(itemEnd)
    
    const startOffset = Math.max(0, (start.getTime() - projectStart.getTime()) / (1000 * 60 * 60 * 24))
    const duration = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
    
    const left = (startOffset / totalDays) * 100
    const width = (duration / totalDays) * 100
    
    return { left: `${left}%`, width: `${Math.max(width, 1)}%` }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'done':
        return 'bg-success'
      case 'in-progress':
        return 'bg-primary'
      case 'blocked':
        return 'bg-destructive'
      default:
        return 'bg-muted-foreground'
    }
  }

  const getPriorityColor = (priority: 'low' | 'medium' | 'high') => {
    switch (priority) {
      case 'high':
        return 'border-destructive'
      case 'medium':
        return 'border-warning'
      case 'low':
        return 'border-muted'
    }
  }

  return (
    <div className="space-y-4">
      {/* Timeline Header */}
      <Card className="p-4">
        <div className="flex">
          <div className="w-64 shrink-0" />
          <div className="flex-1 relative">
            <div className="flex border-b">
              {months.map((month, index) => (
                <div
                  key={index}
                  style={{ width: `${(month.days / totalDays) * 100}%` }}
                  className="text-center py-2 text-sm font-medium border-r last:border-r-0"
                >
                  {month.name}
                </div>
              ))}
            </div>
            <div className="flex h-8 border-b text-xs text-muted-foreground">
              {Array.from({ length: Math.ceil(totalDays / 7) }).map((_, index) => (
                <div
                  key={index}
                  className="flex items-center justify-center border-r"
                  style={{ width: `${(7 / totalDays) * 100}%` }}
                >
                  W{index + 1}
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* Milestones */}
      {milestones.length > 0 && (
        <Card className="p-4">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">
              M
            </span>
            里程碑
          </h3>
          <div className="space-y-2">
            {milestones.map((milestone) => (
              <div key={milestone.id} className="flex items-center">
                <div className="w-64 shrink-0 pr-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium truncate">{milestone.name}</span>
                    <Badge 
                      variant="secondary" 
                      className={cn('ml-2 text-xs', getStatusColor(milestone.status))}
                    >
                      {milestone.progress}%
                    </Badge>
                  </div>
                </div>
                <div className="flex-1 relative h-8">
                  <div className="absolute inset-0 flex items-center">
                    {Array.from({ length: Math.ceil(totalDays / 7) }).map((_, index) => (
                      <div
                        key={index}
                        className="h-full border-r"
                        style={{ width: `${(7 / totalDays) * 100}%` }}
                      />
                    ))}
                  </div>
                  <div
                    className={cn(
                      'absolute h-6 rounded flex items-center justify-center text-xs font-medium text-white top-1',
                      getStatusColor(milestone.status)
                    )}
                    style={calculatePosition(
                      milestone.dueDate, 
                      new Date(new Date(milestone.dueDate).getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]
                    )}
                  >
                    <span className="truncate px-2">{milestone.name}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Tasks */}
      {tasks.length > 0 && (
        <Card className="p-4">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-secondary text-secondary-foreground text-xs">
              T
            </span>
            任務
          </h3>
          <div className="space-y-2">
            {tasks.map((task) => (
              <div key={task.id} className="flex items-center">
                <div className="w-64 shrink-0 pr-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm truncate">{task.title}</span>
                    <div className="flex items-center gap-1 ml-2">
                      <Badge 
                        variant="outline" 
                        className={cn('text-xs', getPriorityColor(task.priority))}
                      >
                        {task.priority === 'high' ? '高' : task.priority === 'medium' ? '中' : '低'}
                      </Badge>
                    </div>
                  </div>
                  {task.assignee && (
                    <span className="text-xs text-muted-foreground">{task.assignee}</span>
                  )}
                </div>
                <div className="flex-1 relative h-8">
                  <div className="absolute inset-0 flex items-center">
                    {Array.from({ length: Math.ceil(totalDays / 7) }).map((_, index) => (
                      <div
                        key={index}
                        className="h-full border-r"
                        style={{ width: `${(7 / totalDays) * 100}%` }}
                      />
                    ))}
                  </div>
                  <div
                    className={cn(
                      'absolute h-5 rounded flex items-center text-xs text-white top-1.5 border-2',
                      getStatusColor(task.status),
                      getPriorityColor(task.priority)
                    )}
                    style={calculatePosition(task.startDate, task.endDate)}
                  >
                    <div className="w-full relative">
                      <div 
                        className="h-full bg-white/30 rounded-l"
                        style={{ width: `${task.progress}%` }}
                      />
                      <span className="absolute inset-0 flex items-center justify-center truncate px-2 text-[10px] font-medium">
                        {task.progress}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Legend */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-4 text-xs">
          <span className="font-medium">圖例：</span>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-success" />
            <span>已完成</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-primary" />
            <span>進行中</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-muted-foreground" />
            <span>待辦</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-destructive" />
            <span>受阻</span>
          </div>
          <span className="ml-4">|</span>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded border-2 border-destructive bg-muted" />
            <span>高優先</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded border-2 border-warning bg-muted" />
            <span>中優先</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded border-2 border-muted bg-muted" />
            <span>低優先</span>
          </div>
        </div>
      </Card>
    </div>
  )
}
