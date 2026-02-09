'use client'

import React, { useState, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { GanttChart } from '@/components/gantt-chart'
import { type Project, type Task, type TaskStatus } from '@/lib/mock-data'
import { cn } from '@/lib/utils'
import {
  ChevronDown,
  Calendar,
  GripVertical,
  LayoutList,
  GanttChart as GanttIcon,
  AlertTriangle,
  User,
  Link2,
  Flag,
} from 'lucide-react'

interface MilestoneTaskViewProps {
  project: Project
  onTaskStatusChange: (taskId: string, newStatus: TaskStatus) => void
}

const statusColumns: { status: TaskStatus; title: string; color: string }[] = [
  { status: 'todo', title: '待辦', color: 'bg-muted-foreground' },
  { status: 'in-progress', title: '進行中', color: 'bg-primary' },
  { status: 'done', title: '已完成', color: 'bg-success' },
  { status: 'blocked', title: '受阻', color: 'bg-destructive' },
]

export function MilestoneTaskView({ project, onTaskStatusChange }: MilestoneTaskViewProps) {
  const [viewMode, setViewMode] = useState<'list' | 'gantt'>('list')
  const [expandedMilestones, setExpandedMilestones] = useState<Set<string>>(
    () => new Set(project.milestones.map(m => m.id))
  )
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [taskDetailOpen, setTaskDetailOpen] = useState(false)
  const [draggedTask, setDraggedTask] = useState<Task | null>(null)

  const tasksByMilestone = useMemo(() => {
    const map = new Map<string, Task[]>()
    project.milestones.forEach(m => {
      map.set(m.id, project.tasks.filter(t => t.milestoneId === m.id))
    })
    return map
  }, [project.milestones, project.tasks])

  const toggleMilestone = (id: string) => {
    setExpandedMilestones(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleDragStart = (e: React.DragEvent, task: Task) => {
    setDraggedTask(task)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = (e: React.DragEvent, targetStatus: TaskStatus, milestoneId: string) => {
    e.preventDefault()
    if (draggedTask && draggedTask.milestoneId === milestoneId && draggedTask.status !== targetStatus) {
      onTaskStatusChange(draggedTask.id, targetStatus)
    }
    setDraggedTask(null)
  }

  const handleTaskClick = (task: Task) => {
    setSelectedTask(task)
    setTaskDetailOpen(true)
  }

  const getStatusBadge = (status: TaskStatus) => {
    switch (status) {
      case 'done': return <Badge variant="default" className="text-xs">已完成</Badge>
      case 'in-progress': return <Badge variant="secondary" className="text-xs">進行中</Badge>
      case 'blocked': return <Badge variant="destructive" className="text-xs">受阻</Badge>
      default: return <Badge variant="outline" className="text-xs">待辦</Badge>
    }
  }

  const getPriorityColor = (priority: 'low' | 'medium' | 'high') => {
    switch (priority) {
      case 'high': return 'bg-destructive text-destructive-foreground'
      case 'medium': return 'bg-warning text-warning-foreground'
      case 'low': return 'bg-muted text-muted-foreground'
    }
  }

  const getPriorityText = (priority: 'low' | 'medium' | 'high') => {
    switch (priority) {
      case 'high': return '高'
      case 'medium': return '中'
      case 'low': return '低'
    }
  }

  const avatarColors = [
    'bg-blue-600', 'bg-emerald-600', 'bg-violet-600', 'bg-amber-600',
    'bg-rose-600', 'bg-cyan-600', 'bg-pink-600', 'bg-teal-600',
    'bg-indigo-600', 'bg-orange-600',
  ]

  const getAvatarColor = (name: string) => {
    let hash = 0
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash)
    }
    return avatarColors[Math.abs(hash) % avatarColors.length]
  }

  return (
    <div className="space-y-4">
      {/* View toggle */}
      <div className="flex items-center justify-between">
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
        {viewMode === 'list' && (
          <div className="text-sm text-muted-foreground">
            {project.milestones.filter(m => m.status === 'done').length}/{project.milestones.length} 里程碑完成
          </div>
        )}
      </div>

      {viewMode === 'gantt' ? (
        <GanttChart
          tasks={project.tasks}
          milestones={project.milestones}
          startDate={project.startDate}
          endDate={project.endDate}
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
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-medium">
                        {index + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium text-sm">{milestone.name}</h4>
                          {getStatusBadge(milestone.status)}
                          {isDelayed && (
                            <Badge variant="secondary" className="bg-warning text-warning-foreground text-xs">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              +{delayDays}天
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1">
                          <Progress value={milestone.progress} className="h-1.5 flex-1 max-w-[200px]" />
                          <span className="text-xs text-muted-foreground">{milestone.progress}%</span>
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {new Date(milestone.dueDate).toLocaleDateString('zh-TW')}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {tasks.length} 個任務
                          </span>
                        </div>
                      </div>
                    </div>
                  </CollapsibleTrigger>

                  <CollapsibleContent>
                    <div className="px-4 pb-4 pt-0">
                      <div className="border-t pt-3">
                        {tasks.length === 0 ? (
                          <div className="text-center py-6 text-sm text-muted-foreground">
                            此里程碑尚未有任務
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                            {statusColumns.map(column => {
                              const columnTasks = tasks.filter(t => t.status === column.status)
                              return (
                                <div
                                  key={column.status}
                                  className="flex flex-col"
                                  onDragOver={handleDragOver}
                                  onDrop={(e) => handleDrop(e, column.status, milestone.id)}
                                >
                                  <div className="flex items-center gap-2 mb-2">
                                    <div className={cn('w-2.5 h-2.5 rounded-full', column.color)} />
                                    <span className="text-xs font-medium">{column.title}</span>
                                    <Badge variant="secondary" className="text-[10px] h-4 px-1">
                                      {columnTasks.length}
                                    </Badge>
                                  </div>
                                  <div className="flex-1 space-y-1 min-h-[40px]">
                                    {columnTasks.map(task => (
                                      <div
                                        key={task.id}
                                        draggable
                                        onDragStart={(e) => handleDragStart(e, task)}
                                        onClick={() => handleTaskClick(task)}
                                        className={cn(
                                          'flex items-center gap-1.5 px-2 py-1.5 rounded-md border bg-card cursor-pointer hover:shadow-sm transition-shadow',
                                          draggedTask?.id === task.id && 'opacity-50'
                                        )}
                                      >
                                        <GripVertical className="h-3 w-3 text-muted-foreground shrink-0 cursor-move" />
                                        {task.assignee && (
                                          <Avatar className="h-4.5 w-4.5 shrink-0">
                                            <AvatarFallback className={cn('text-[8px] text-white', getAvatarColor(task.assignee))}>
                                              {task.assignee.split(' ').map(n => n[0]).join('')}
                                            </AvatarFallback>
                                          </Avatar>
                                        )}
                                        <span className="text-xs truncate flex-1">{task.title}</span>
                                        {task.priority === 'high' && (
                                          <div className="w-1.5 h-1.5 rounded-full bg-destructive shrink-0" title="高優先" />
                                        )}
                                      </div>
                                    ))}
                                    {columnTasks.length === 0 && (
                                      <div className="flex items-center justify-center h-[60px] border border-dashed rounded-lg">
                                        <span className="text-[10px] text-muted-foreground">拖曳至此</span>
                                      </div>
                                    )}
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
      <Sheet open={taskDetailOpen} onOpenChange={setTaskDetailOpen}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          {selectedTask && (
            <>
              <SheetHeader>
                <SheetTitle className="text-left">{selectedTask.title}</SheetTitle>
                <SheetDescription className="text-left">
                  {project.milestones.find(m => m.id === selectedTask.milestoneId)?.name}
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-5 mt-6">
                {/* Status & Priority */}
                <div className="flex items-center gap-2">
                  {getStatusBadge(selectedTask.status)}
                  <Badge variant="secondary" className={cn('text-xs', getPriorityColor(selectedTask.priority))}>
                    {getPriorityText(selectedTask.priority)}優先
                  </Badge>
                </div>

                {/* Progress */}
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-1.5">進度</div>
                  <div className="flex items-center gap-3">
                    <Progress value={selectedTask.progress} className="h-2 flex-1" />
                    <span className="text-sm font-medium">{selectedTask.progress}%</span>
                  </div>
                </div>

                {/* Description */}
                {selectedTask.description && (
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-1.5">描述</div>
                    <p className="text-sm">{selectedTask.description}</p>
                  </div>
                )}

                {/* Assignee */}
                <div className="flex items-center gap-3">
                  <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <User className="h-3 w-3" />
                    負責人
                  </div>
                  <div className="flex items-center gap-2">
                    <Avatar className="h-6 w-6">
                      <AvatarFallback className={cn('text-xs text-white', getAvatarColor(selectedTask.assignee))}>
                        {selectedTask.assignee.split(' ').map(n => n[0]).join('')}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm">{selectedTask.assignee}</span>
                  </div>
                </div>

                {/* Dates */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1.5">
                      <Calendar className="h-3 w-3" />
                      開始日期
                    </div>
                    <span className="text-sm">{new Date(selectedTask.startDate).toLocaleDateString('zh-TW')}</span>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1.5">
                      <Flag className="h-3 w-3" />
                      結束日期
                    </div>
                    <span className="text-sm">{new Date(selectedTask.endDate).toLocaleDateString('zh-TW')}</span>
                  </div>
                </div>

                {/* Dependencies */}
                {selectedTask.dependencies.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1.5">
                      <Link2 className="h-3 w-3" />
                      依賴任務
                    </div>
                    <div className="space-y-1">
                      {selectedTask.dependencies.map(depId => {
                        const depTask = project.tasks.find(t => t.id === depId)
                        return (
                          <div key={depId} className="flex items-center gap-2 text-sm p-1.5 rounded bg-muted/50">
                            {depTask ? (
                              <>
                                {getStatusBadge(depTask.status)}
                                <span className="truncate">{depTask.title}</span>
                              </>
                            ) : (
                              <span className="text-muted-foreground">{depId}</span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Quick status change */}
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-2">快速變更狀態</div>
                  <div className="flex flex-wrap gap-1.5">
                    {statusColumns.map(col => (
                      <Button
                        key={col.status}
                        variant={selectedTask.status === col.status ? 'default' : 'outline'}
                        size="sm"
                        className="text-xs h-7"
                        onClick={() => {
                          onTaskStatusChange(selectedTask.id, col.status)
                          setSelectedTask({ ...selectedTask, status: col.status })
                        }}
                      >
                        {col.title}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
