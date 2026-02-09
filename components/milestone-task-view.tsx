'use client'

import React, { useState, useMemo } from 'react'
import { Card } from '@/components/ui/card'
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
  LayoutList,
  GanttChart as GanttIcon,
  AlertTriangle,
  User,
  Link2,
  Flag,
  Clock,
} from 'lucide-react'

interface MilestoneTaskViewProps {
  project: Project
}

export function MilestoneTaskView({ project }: MilestoneTaskViewProps) {
  const [viewMode, setViewMode] = useState<'list' | 'gantt'>('list')
  const [expandedMilestones, setExpandedMilestones] = useState<Set<string>>(
    () => new Set(project.milestones.map(m => m.id))
  )
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [taskDetailOpen, setTaskDetailOpen] = useState(false)

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

  const handleTaskClick = (task: Task) => {
    setSelectedTask(task)
    setTaskDetailOpen(true)
  }

  const getStatusBadge = (status: TaskStatus) => {
    switch (status) {
      case 'done': return <Badge className="text-[10px] px-1.5 py-0 bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-700">已完成</Badge>
      case 'in-progress': return <Badge className="text-[10px] px-1.5 py-0 bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-700">進行中</Badge>
      case 'blocked': return <Badge variant="destructive" className="text-[10px] px-1.5 py-0">受阻</Badge>
      default: return <Badge className="text-[10px] px-1.5 py-0 bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-600">待辦</Badge>
    }
  }

  const getStatusBadgeLarge = (status: TaskStatus) => {
    switch (status) {
      case 'done': return <Badge className="text-xs bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-700">已完成</Badge>
      case 'in-progress': return <Badge className="text-xs bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-700">進行中</Badge>
      case 'blocked': return <Badge variant="destructive" className="text-xs">受阻</Badge>
      default: return <Badge className="text-xs bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-600">待辦</Badge>
    }
  }

  const getPriorityBadge = (priority: 'low' | 'medium' | 'high') => {
    switch (priority) {
      case 'high': return <Badge className="text-[10px] px-1.5 py-0 bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700">高</Badge>
      case 'medium': return <Badge className="text-[10px] px-1.5 py-0 bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700">中</Badge>
      case 'low': return <Badge className="text-[10px] px-1.5 py-0 bg-slate-100 text-slate-500 border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-600">低</Badge>
    }
  }

  const getPriorityColor = (priority: 'low' | 'medium' | 'high') => {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-700 border-red-300'
      case 'medium': return 'bg-amber-100 text-amber-700 border-amber-300'
      case 'low': return 'bg-slate-100 text-slate-500 border-slate-300'
    }
  }

  const getPriorityText = (priority: 'low' | 'medium' | 'high') => {
    switch (priority) {
      case 'high': return '高'
      case 'medium': return '中'
      case 'low': return '低'
    }
  }

  const isTaskOverdue = (task: Task) => {
    if (task.status === 'done') return false
    return new Date() > new Date(task.endDate)
  }

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
            const doneTasks = tasks.filter(t => t.status === 'done').length
            const overdueTasks = tasks.filter(t => isTaskOverdue(t)).length

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
                          {getStatusBadgeLarge(milestone.status)}
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
                            {doneTasks}/{tasks.length} 完成
                          </span>
                          {overdueTasks > 0 && (
                            <span className="text-xs text-destructive flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {overdueTasks} 逾期
                            </span>
                          )}
                        </div>
                      </div>
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
                            <div className="grid grid-cols-[minmax(0,1fr)_60px_52px_100px_90px] gap-2 px-2 py-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                              <span>任務</span>
                              <span>狀態</span>
                              <span>優先</span>
                              <span>負責人</span>
                              <span className="text-right">截止日</span>
                            </div>
                            {tasks.map(task => {
                              const overdue = isTaskOverdue(task)
                              return (
                                <div
                                  key={task.id}
                                  onClick={() => handleTaskClick(task)}
                                  className={cn(
                                    'grid grid-cols-[minmax(0,1fr)_60px_52px_100px_90px] gap-2 items-center px-2 py-2 cursor-pointer hover:bg-muted/50 transition-colors rounded-sm',
                                    overdue && 'bg-destructive/5',
                                  )}
                                >
                                  {/* Title + overdue indicator */}
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    {overdue && <AlertTriangle className="h-3 w-3 text-destructive shrink-0" />}
                                    <span className={cn(
                                      'text-xs truncate',
                                      task.status === 'done' && 'line-through text-muted-foreground',
                                    )}>{task.title}</span>
                                  </div>
                                  {/* Status */}
                                  <div>{getStatusBadge(task.status)}</div>
                                  {/* Priority */}
                                  <div>{getPriorityBadge(task.priority)}</div>
                                  {/* Assignee */}
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <Avatar className="h-5 w-5 shrink-0">
                                      <AvatarFallback className={cn('text-[8px] text-white', getAvatarColor(task.assignee))}>
                                        {task.assignee.split(' ').map(n => n[0]).join('')}
                                      </AvatarFallback>
                                    </Avatar>
                                    <span className="text-xs truncate text-muted-foreground">{task.assignee}</span>
                                  </div>
                                  {/* Due date */}
                                  <div className={cn(
                                    'text-xs text-right',
                                    overdue ? 'text-destructive font-medium' : 'text-muted-foreground',
                                  )}>
                                    {new Date(task.endDate).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })}
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
          {selectedTask && (() => {
            const taskOverdue = isTaskOverdue(selectedTask)
            return (
              <>
                <SheetHeader>
                  <SheetTitle className="text-left">{selectedTask.title}</SheetTitle>
                  <SheetDescription className="text-left">
                    {project.milestones.find(m => m.id === selectedTask.milestoneId)?.name}
                  </SheetDescription>
                </SheetHeader>
                <div className="space-y-5 mt-6">
                  {/* Status & Priority & Overdue */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {getStatusBadgeLarge(selectedTask.status)}
                    <Badge className={cn('text-xs', getPriorityColor(selectedTask.priority))}>
                      {getPriorityText(selectedTask.priority)}優先
                    </Badge>
                    {taskOverdue && (
                      <Badge variant="destructive" className="text-xs gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        逾期
                      </Badge>
                    )}
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
                      <div className={cn(
                        'text-xs font-medium mb-1 flex items-center gap-1.5',
                        taskOverdue ? 'text-destructive' : 'text-muted-foreground',
                      )}>
                        <Flag className="h-3 w-3" />
                        結束日期
                      </div>
                      <span className={cn('text-sm', taskOverdue && 'text-destructive font-medium')}>
                        {new Date(selectedTask.endDate).toLocaleDateString('zh-TW')}
                      </span>
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
                </div>
              </>
            )
          })()}
        </SheetContent>
      </Sheet>
    </div>
  )
}
