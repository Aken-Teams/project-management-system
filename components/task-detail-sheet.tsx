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
import { type Project, type Task, type TaskStatus } from '@/lib/mock-data'
import { type DepNode, computeImpact } from '@/lib/dependency-graph'
import { cn } from '@/lib/utils'
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clock,
  Flag,
  Route,
  User,
} from 'lucide-react'

interface TaskDetailSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  task: Task | null
  project: Project
  nodeMap: Map<string, DepNode>
  onSelectTask?: (task: Task) => void
}

const STATUS_DOT_COLORS: Record<string, string> = {
  done: 'bg-green-500',
  'in-progress': 'bg-blue-500',
  todo: 'bg-slate-400',
  blocked: 'bg-red-500',
}

const AVATAR_COLORS = [
  'bg-blue-600', 'bg-emerald-600', 'bg-violet-600', 'bg-amber-600',
  'bg-rose-600', 'bg-cyan-600', 'bg-pink-600', 'bg-teal-600',
  'bg-indigo-600', 'bg-orange-600', 'bg-lime-600', 'bg-fuchsia-600',
  'bg-sky-600', 'bg-red-600', 'bg-green-600', 'bg-purple-600',
]

export function TaskDetailSheet({ open, onOpenChange, task, project, nodeMap, onSelectTask }: TaskDetailSheetProps) {
  const assigneeColorMap = useMemo(() => {
    const map = new Map<string, string>()
    const names = [...new Set(project.tasks.map(t => t.assignee).filter(Boolean))].sort()
    names.forEach((name, i) => map.set(name, AVATAR_COLORS[i % AVATAR_COLORS.length]))
    return map
  }, [project.tasks])

  if (!task) return null

  const effectiveStatus = (t: Task): TaskStatus => t.progress >= 100 ? 'done' : t.status
  const isOverdue = (t: Task) => effectiveStatus(t) !== 'done' && new Date() > new Date(t.endDate)

  const node = nodeMap.get(task.id)
  const impact = computeImpact(task.id, nodeMap)
  const milestone = project.milestones.find(m => m.id === task.milestoneId)
  const taskOverdue = isOverdue(task)

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
      case 'done': return <Badge className="text-sm bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-700">已完成</Badge>
      case 'in-progress': return <Badge className="text-sm bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-700">進行中</Badge>
      case 'blocked': return <Badge variant="destructive" className="text-sm">受阻</Badge>
      default: return <Badge className="text-sm bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-600">待辦</Badge>
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
    switch (priority) { case 'high': return '高'; case 'medium': return '中'; case 'low': return '低' }
  }

  const getAvatarColor = (name: string) => assigneeColorMap.get(name) || AVATAR_COLORS[0]

  const handleSelectTask = (t: Task) => {
    onSelectTask?.(t)
  }

  const downstreamTasks = project.tasks.filter(t => t.dependencies.includes(task.id))

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md p-0 gap-0 overflow-hidden flex flex-col">
        {/* Header - fixed */}
        <div className="px-6 pt-5 pb-3 shrink-0">
          <SheetHeader>
            <div className="flex items-start gap-3">
              <div className={cn(
                'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                effectiveStatus(task) === 'done' ? 'bg-green-100 text-green-600 dark:bg-green-950 dark:text-green-400' :
                taskOverdue ? 'bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400' :
                effectiveStatus(task) === 'blocked' ? 'bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400' :
                'bg-primary/10 text-primary'
              )}>
                {effectiveStatus(task) === 'done' ? <Clock className="h-5 w-5" /> :
                 taskOverdue ? <AlertTriangle className="h-5 w-5" /> :
                 <Flag className="h-5 w-5" />}
              </div>
              <div className="flex-1 min-w-0 space-y-1">
                <SheetTitle className="text-base text-left leading-tight">{task.title}</SheetTitle>
                <SheetDescription className="text-left text-sm">
                  <span className="text-muted-foreground">{project.name}</span>
                  {milestone && <span className="text-muted-foreground"> · {milestone.name}</span>}
                  <span className="text-muted-foreground"> · </span>
                  <span className="font-mono text-muted-foreground/80">
                    {new Date(task.startDate).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })}
                    {' ~ '}
                    {new Date(task.endDate).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })}
                  </span>
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>
        </div>

        {/* Content - scrollable */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {/* Status badges + Progress */}
          <div className="px-6 py-4 border-t space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              {getStatusBadgeLarge(effectiveStatus(task))}
              <Badge className={cn('text-sm', getPriorityColor(task.priority))}>
                {getPriorityText(task.priority)}優先
              </Badge>
              {taskOverdue && (
                <Badge variant="destructive" className="text-sm gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  逾期
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-3">
              <Progress value={task.progress} className="h-2 flex-1" />
              <span className="text-sm font-medium tabular-nums">{task.progress}%</span>
            </div>
          </div>

          {/* Description */}
          {task.description && (
            <div className="px-6 py-3 border-t bg-muted/20">
              <p className="text-sm text-muted-foreground leading-relaxed">{task.description}</p>
            </div>
          )}

          {/* Info grid: Assignee + Dates */}
          <div className="px-6 py-4 border-t">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <div className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider flex items-center gap-1.5">
                  <User className="h-3 w-3" />
                  負責人
                </div>
                <div className="flex items-center gap-2">
                  <Avatar className="h-6 w-6">
                    <AvatarFallback className={cn('text-sm text-white', getAvatarColor(task.assignee))}>
                      {task.assignee.split(' ').map(n => n[0]).join('')}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium">{task.assignee}</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider flex items-center gap-1.5">
                  <Calendar className="h-3 w-3" />
                  開始日期
                </div>
                <span className="text-sm font-medium">{new Date(task.startDate).toLocaleDateString('zh-TW')}</span>
              </div>
              <div className="space-y-1.5">
                <div className={cn(
                  'text-[11px] font-medium uppercase tracking-wider flex items-center gap-1.5',
                  taskOverdue ? 'text-destructive/70' : 'text-muted-foreground/70',
                )}>
                  <Flag className="h-3 w-3" />
                  結束日期
                </div>
                <span className={cn('text-sm font-medium', taskOverdue && 'text-destructive')}>
                  {new Date(task.endDate).toLocaleDateString('zh-TW')}
                </span>
              </div>
            </div>
          </div>

          {/* Prerequisites */}
          {node && (
            <div className="px-6 py-4 border-t space-y-4">
              <div>
                <h4 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                  <ArrowRight className="h-3.5 w-3.5 rotate-180" />
                  前置任務 ({node.prerequisites.length})
                </h4>
                {node.prerequisites.length === 0 ? (
                  <p className="text-sm text-muted-foreground/60 italic">無前置任務（可隨時開始）</p>
                ) : (
                  <div className="space-y-1.5">
                    {node.prerequisites.map(t => (
                      <div
                        key={t.id}
                        className="flex items-center gap-2 p-2 rounded-md border text-sm cursor-pointer hover:bg-muted/30"
                        onClick={() => handleSelectTask(t)}
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

              {/* Downstream tasks */}
              {downstreamTasks.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                    <ArrowRight className="h-3.5 w-3.5" />
                    後續任務 ({downstreamTasks.length})
                  </h4>
                  <div className="space-y-1.5">
                    {downstreamTasks.map(t => (
                      <div
                        key={t.id}
                        className="flex items-center gap-2 p-2 rounded-md border text-sm cursor-pointer hover:bg-muted/30"
                        onClick={() => handleSelectTask(t)}
                      >
                        <div className={`w-2 h-2 rounded-full ${STATUS_DOT_COLORS[effectiveStatus(t)]}`} />
                        <span className="flex-1 truncate">{t.title}</span>
                        {getStatusBadge(effectiveStatus(t))}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Impact Analysis */}
          <div className="px-6 py-4 border-t">
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
                          onClick={() => handleSelectTask(t)}
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
                          onClick={() => handleSelectTask(t)}
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

          {/* Critical path indicator */}
          {node?.isOnCriticalPath && (
            <div className="px-6 py-4 border-t">
              <div className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 rounded-md p-2.5 border border-amber-200 dark:border-amber-900">
                <Route className="h-3.5 w-3.5 shrink-0" />
                <span>此任務在<strong>關鍵路徑</strong>上，延遲會直接影響專案完成日期</span>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
