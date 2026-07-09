'use client'

import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { type Task, type Milestone, type TaskLog, type Project } from '@/lib/mock-data'
import { useAuth } from '@/lib/auth-context'
import { cn } from '@/lib/utils'
import {
  ArrowLeft,
  Calendar,
  CalendarClock,
  Clock,
  Flag,
  ListChecks,
  Send,
  TrendingDown,
  TrendingUp,
  Minus,
  Undo2,
  Pencil,
  Check,
  X,
  Loader2,
} from 'lucide-react'

interface MilestoneDetailSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  milestone: Milestone | null
  project: Project
  onTaskClick?: (task: Task) => void
  onTaskUpdate?: () => void
  readOnly?: boolean
}

const AVATAR_COLORS = [
  'bg-blue-600', 'bg-emerald-600', 'bg-violet-600', 'bg-amber-600',
  'bg-rose-600', 'bg-cyan-600', 'bg-pink-600', 'bg-teal-600',
  'bg-indigo-600', 'bg-orange-600', 'bg-lime-600', 'bg-fuchsia-600',
]

export function MilestoneDetailSheet({
  open,
  onOpenChange,
  milestone,
  project,
  onTaskClick,
  onTaskUpdate,
  readOnly,
}: MilestoneDetailSheetProps) {
  const { user } = useAuth()

  // Extension/delay request state
  const [showExtensionForm, setShowExtensionForm] = useState(false)
  const [extensionReason, setExtensionReason] = useState('')
  const [extensionDate, setExtensionDate] = useState('')
  const [extensionSupport, setExtensionSupport] = useState('')
  const [submittingExtension, setSubmittingExtension] = useState(false)
  const [editingDueDate, setEditingDueDate] = useState(false)
  const [draftDueDate, setDraftDueDate] = useState('')
  const [savingDate, setSavingDate] = useState(false)

  const handleSaveDueDate = async () => {
    if (!milestone || !draftDueDate) return
    setSavingDate(true)
    try {
      const res = await fetch(`/api/projects/${project.id}/milestones/${milestone.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dueDate: draftDueDate }),
      })
      if (res.ok) {
        setEditingDueDate(false)
        onTaskUpdate?.()
      }
    } finally {
      setSavingDate(false)
    }
  }

  // Tasks belonging to this milestone (parent tasks only)
  const msTasks = useMemo(() => {
    if (!milestone) return []
    return project.tasks.filter(t => t.milestoneId === milestone.id && !t.parentId)
  }, [milestone, project.tasks])

  // All tasks including subtasks for this milestone
  const allMsTasks = useMemo(() => {
    if (!milestone) return []
    return project.tasks.filter(t => t.milestoneId === milestone.id)
  }, [milestone, project.tasks])

  // Earliest log date per task
  const earliestLogDateMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const log of project.taskLogs) {
      const existing = map.get(log.taskId)
      if (!existing || log.logDate < existing) {
        map.set(log.taskId, log.logDate)
      }
    }
    return map
  }, [project.taskLogs])

  // Log count per task
  const logCountMap = useMemo(() => {
    const map = new Map<string, number>()
    for (const log of project.taskLogs) {
      map.set(log.taskId, (map.get(log.taskId) || 0) + 1)
    }
    return map
  }, [project.taskLogs])

  // Assignee color map
  const assigneeColorMap = useMemo(() => {
    const map = new Map<string, string>()
    const uniqueAssignees = [...new Set(project.tasks.map(t => t.assignee).filter(Boolean))]
    uniqueAssignees.sort().forEach((name, i) => {
      map.set(name, AVATAR_COLORS[i % AVATAR_COLORS.length])
    })
    return map
  }, [project.tasks])

  // Computed stats
  const stats = useMemo(() => {
    if (!milestone || msTasks.length === 0) return null

    const doneCount = msTasks.filter(t => t.progress >= 100 || t.status === 'done').length
    const inProgressCount = msTasks.filter(t => t.status === 'in-progress' && t.progress < 100).length
    const blockedCount = msTasks.filter(t => t.status === 'blocked').length
    const todoCount = msTasks.filter(t => t.status === 'todo' && t.progress === 0).length

    // Actual start: earliest log date among all tasks (fallback to completedAt for tasks with no logs)
    let actualStart: string | null = null
    for (const t of allMsTasks) {
      const taskStart = earliestLogDateMap.get(t.id) || t.completedAt || null
      if (taskStart && (!actualStart || taskStart < actualStart)) {
        actualStart = taskStart
      }
    }

    // Actual end: latest completedAt among parent tasks (only when ALL tasks are done)
    let actualEnd: string | null = null
    const allTasksDone = msTasks.length > 0 && msTasks.every(t => t.completedAt)
    if (allTasksDone) {
      for (const t of msTasks) {
        if (t.completedAt && (!actualEnd || t.completedAt > actualEnd)) {
          actualEnd = t.completedAt
        }
      }
    }

    // Planned start: earliest task start date
    const plannedStart = msTasks.reduce((min, t) =>
      new Date(t.startDate).getTime() < new Date(min).getTime() ? t.startDate : min
    , msTasks[0].startDate)

    // Time difference (only if all done)
    const plannedEnd = new Date(milestone.dueDate)
    const diffDays = milestone.progress >= 100 && actualEnd
      ? Math.round((plannedEnd.getTime() - new Date(actualEnd).getTime()) / (1000 * 60 * 60 * 24))
      : null

    return {
      doneCount,
      inProgressCount,
      blockedCount,
      todoCount,
      actualStart,
      actualEnd,
      plannedStart,
      diffDays,
    }
  }, [milestone, msTasks, allMsTasks, earliestLogDateMap])

  // Check pending delay for this milestone
  const hasPendingDelay = useMemo(() => {
    if (!milestone) return false
    return (project as Record<string, unknown>).pendingDelayMilestoneIds
      ? ((project as Record<string, unknown>).pendingDelayMilestoneIds as string[]).includes(milestone.id)
      : project.delayRequests?.some(dr =>
          dr.status === 'pending' &&
          dr.affectedMilestones?.some(am => am.milestoneId === milestone.id)
        ) ?? false
  }, [milestone, project])

  // Is milestone overdue?
  const isMilestoneOverdue = useMemo(() => {
    if (!milestone || milestone.progress >= 100) return false
    return new Date() > new Date(milestone.dueDate)
  }, [milestone])

  // Handler: undo completion for a task
  const handleUncompleteTask = async (task: Task) => {
    try {
      const res = await fetch(`/api/projects/${project.id}/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'in_progress', progress: 0 }),
      })
      if (!res.ok) throw new Error()
      onTaskUpdate?.()
    } catch {
      // ignore
    }
  }

  // Handler: submit delay request for this milestone
  const handleSubmitExtension = async () => {
    if (!milestone || !user) return
    setSubmittingExtension(true)
    try {
      const res = await fetch('/api/delay-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: project.id,
          requesterId: user.id,
          reason: extensionReason.trim(),
          canCatchUp: false,
          supportNeeded: extensionSupport.trim() || '',
          affectedMilestones: [{
            milestoneId: milestone.id,
            originalDate: milestone.dueDate,
            proposedDate: extensionDate || milestone.dueDate,
          }],
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || '送出失敗')
      }
      setShowExtensionForm(false)
      setExtensionReason('')
      setExtensionDate('')
      setExtensionSupport('')
      onTaskUpdate?.()
    } catch (err) {
      alert(err instanceof Error ? err.message : '送出延期申請失敗')
    } finally {
      setSubmittingExtension(false)
    }
  }

  if (!milestone) return null

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString('zh-TW', { year: 'numeric', month: 'numeric', day: 'numeric' })

  const effectiveStatus = (task: Task) => {
    if (task.progress >= 100) return 'done' as const
    if (task.progress > 0 && task.status === 'todo') return 'in-progress' as const
    return task.status
  }

  const isOverdue = (task: Task) => {
    if (effectiveStatus(task) === 'done') return false
    return new Date() > new Date(task.endDate)
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'done': return <Badge className="text-[10px] px-1.5 py-0 bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-700">已完成</Badge>
      case 'in-progress': return <Badge className="text-[10px] px-1.5 py-0 bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-700">進行中</Badge>
      case 'blocked': return <Badge variant="destructive" className="text-[10px] px-1.5 py-0">受阻</Badge>
      default: return <Badge className="text-[10px] px-1.5 py-0 bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-600">待辦</Badge>
    }
  }

  const getMsStatusBadge = (status: string) => {
    switch (status) {
      case 'done': return <Badge className="text-sm bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-700">已完成</Badge>
      case 'in-progress': return <Badge className="text-sm bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-700">進行中</Badge>
      case 'blocked': return <Badge variant="destructive" className="text-sm">受阻</Badge>
      default: return <Badge className="text-sm bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-600">待辦</Badge>
    }
  }

  const statusDot = (status: string) => status === 'done' ? '#10b981' : status === 'in-progress' ? '#3b82f6' : status === 'blocked' ? '#ef4444' : '#94a3b8'

  // 遞迴渲染任務樹（任意深度，6 層）——統一單列樣式、依 depth 縮排
  const renderTaskNode = (task: Task, depth: number): React.ReactNode => {
    const children = project.tasks.filter(t => t.parentId === task.id)
    const status = effectiveStatus(task)
    const overdue = isOverdue(task)
    return (
      <div key={task.id}>
        <div
          className={cn('flex items-center gap-2 py-2.5 pr-3 cursor-pointer hover:bg-muted/50 transition-colors', overdue && 'bg-red-50/40 dark:bg-red-950/10')}
          style={{ paddingLeft: 12 + depth * 18 }}
          onClick={() => onTaskClick?.(task)}
        >
          {depth > 0 && <span className="text-muted-foreground/40 text-sm shrink-0 -ml-3">└</span>}
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: statusDot(status) }} />
          <span className={cn('text-sm font-medium truncate flex-1 min-w-0', status === 'done' && 'text-muted-foreground line-through decoration-1')} title={task.title}>{task.title}</span>
          {task.assignee && <span className="text-xs text-muted-foreground whitespace-nowrap hidden sm:inline">{task.assignee}</span>}
          {overdue && <span className="text-xs font-medium text-red-600 dark:text-red-400 whitespace-nowrap shrink-0">逾期{Math.round((Date.now() - new Date(task.endDate).getTime()) / 86400000)}天</span>}
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="w-14"><Progress value={task.progress} className="h-1.5" /></div>
            <span className="text-xs font-medium tabular-nums w-9 text-right">{task.progress}%</span>
          </div>
        </div>
        {children.map(c => renderTaskNode(c, depth + 1))}
      </div>
    )
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="pb-4 border-b">
          <div className="flex items-center gap-2">
            <SheetTitle className="text-lg flex-1 min-w-0">{milestone.name}</SheetTitle>
            {getMsStatusBadge(milestone.status)}
          </div>
          <SheetDescription className="sr-only">里程碑詳情</SheetDescription>
        </SheetHeader>

        <div className="space-y-5 pt-5">
          {/* Progress section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">整體進度</span>
              <span className="text-sm font-semibold">{milestone.progress}%</span>
            </div>
            <Progress value={milestone.progress} className="h-2.5" />
            <p className="text-xs text-muted-foreground">進度由任務自動計算</p>
          </div>

          {/* 精簡資訊列（合併原本 4 張卡）*/}
          <div className="rounded-lg border divide-y text-sm">
            {/* 規劃期間（草稿階段可在此改到期日）*/}
            <div className="flex items-center justify-between gap-2 px-3 py-2.5">
              <span className="text-muted-foreground flex items-center gap-1.5"><Flag className="h-4 w-4" />規劃期間</span>
              {!readOnly && project.phase === 'draft' && editingDueDate ? (
                <span className="flex items-center gap-1.5">
                  <span className="font-medium">{stats?.plannedStart ? fmtDate(stats.plannedStart) : fmtDate(milestone.dueDate)} ~</span>
                  <input type="date" value={draftDueDate} onChange={e => setDraftDueDate(e.target.value)} className="text-xs border rounded px-1.5 py-0.5 bg-background" />
                  <button onClick={handleSaveDueDate} disabled={savingDate} className="text-green-600 hover:text-green-700">{savingDate ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}</button>
                  <button onClick={() => setEditingDueDate(false)} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
                </span>
              ) : (
                <span className="font-medium flex items-center gap-1.5">
                  {stats?.plannedStart ? `${fmtDate(stats.plannedStart)} ~ ` : '~ '}{fmtDate(milestone.dueDate)}
                  {!readOnly && project.phase === 'draft' && (
                    <button onClick={() => { setDraftDueDate(milestone.dueDate); setEditingDueDate(true) }} className="text-muted-foreground hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
                  )}
                </span>
              )}
            </div>
            {/* 實際期間 */}
            {(stats?.actualStart || stats?.actualEnd) && (
              <div className="flex items-center justify-between gap-2 px-3 py-2.5">
                <span className="text-muted-foreground flex items-center gap-1.5"><Clock className="h-4 w-4" />實際期間</span>
                <span className="font-medium">{stats.actualStart ? fmtDate(stats.actualStart) : '—'} ~ {stats.actualEnd ? fmtDate(stats.actualEnd) : '進行中'}</span>
              </div>
            )}
            {/* 任務（完成數 + 各狀態）*/}
            <div className="flex items-center justify-between gap-2 px-3 py-2.5">
              <span className="text-muted-foreground flex items-center gap-1.5"><ListChecks className="h-4 w-4" />任務</span>
              <span className="flex items-center gap-2 flex-wrap justify-end">
                <span className="font-medium">{stats?.doneCount ?? 0}/{msTasks.length} 完成</span>
                {!!stats?.inProgressCount && <span className="text-xs text-blue-600 dark:text-blue-400">進行中 {stats.inProgressCount}</span>}
                {!!stats?.blockedCount && <span className="text-xs text-red-600 dark:text-red-400">受阻 {stats.blockedCount}</span>}
                {!!stats?.todoCount && <span className="text-xs text-muted-foreground">待辦 {stats.todoCount}</span>}
              </span>
            </div>
          </div>

          {/* Time difference */}
          {stats?.diffDays !== null && stats?.diffDays !== undefined && (
            <div className={cn(
              'flex items-center gap-2 rounded-lg border p-3',
              stats.diffDays > 0 ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800' :
              stats.diffDays < 0 ? 'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800' :
              'bg-muted/50',
            )}>
              {stats.diffDays > 0 ? (
                <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              ) : stats.diffDays < 0 ? (
                <TrendingDown className="h-4 w-4 text-red-600 dark:text-red-400" />
              ) : (
                <Minus className="h-4 w-4 text-muted-foreground" />
              )}
              <span className={cn(
                'text-sm font-medium',
                stats.diffDays > 0 ? 'text-emerald-700 dark:text-emerald-400' :
                stats.diffDays < 0 ? 'text-red-700 dark:text-red-400' : '',
              )}>
                {stats.diffDays > 0 ? `提前 ${stats.diffDays} 天完成` :
                 stats.diffDays < 0 ? `延後 ${Math.abs(stats.diffDays)} 天完成` :
                 '準時完成'}
              </span>
            </div>
          )}

          {/* 延期按鈕 / 審核中（狀態數量已併入上方「任務」列）*/}
          {!readOnly && project.phase === 'active' && isMilestoneOverdue && milestone.progress < 100 && !hasPendingDelay && !showExtensionForm && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1 text-xs h-7 px-2 text-amber-700 border-amber-300 hover:bg-amber-50 dark:text-amber-400 dark:border-amber-700 dark:hover:bg-amber-950/30"
              onClick={() => setShowExtensionForm(true)}
            >
              <CalendarClock className="h-3 w-3" />
              提出延期
            </Button>
          )}
          {!readOnly && project.phase === 'active' && hasPendingDelay && (
            <Badge className="text-xs bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700 gap-1">
              <Clock className="h-3 w-3" />
              延期審核中
            </Badge>
          )}

          {/* Extension form (shown when "提出延期" button clicked) */}
          {!readOnly && project.phase === 'active' && showExtensionForm && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/30 dark:border-amber-800 dark:bg-amber-950/10 p-4 space-y-3 animate-in slide-in-from-top-2 duration-200">
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded flex items-center justify-center bg-amber-100 dark:bg-amber-900/30">
                  <CalendarClock className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                </div>
                <span className="text-sm font-medium">申請延期</span>
              </div>
              <div>
                <Label className="text-sm text-muted-foreground">延遲原因 <span className="text-red-500">*</span></Label>
                <Textarea
                  placeholder="說明延遲的原因..."
                  value={extensionReason}
                  onChange={e => setExtensionReason(e.target.value)}
                  rows={2}
                  className="text-sm mt-1.5 rounded-lg"
                />
              </div>
              <div>
                <Label className="text-sm text-muted-foreground">建議新日期</Label>
                <input
                  type="date"
                  value={extensionDate}
                  onChange={e => setExtensionDate(e.target.value)}
                  min={milestone.dueDate}
                  className="w-full text-sm border rounded-lg px-2.5 py-1.5 mt-1.5 bg-background"
                />
              </div>
              <div>
                <Label className="text-sm text-muted-foreground">需要協助</Label>
                <Textarea
                  placeholder="選填，說明是否需要額外資源或支援..."
                  value={extensionSupport}
                  onChange={e => setExtensionSupport(e.target.value)}
                  rows={2}
                  className="text-sm mt-1.5 rounded-lg"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 rounded-lg"
                  onClick={() => {
                    setShowExtensionForm(false)
                    setExtensionReason('')
                    setExtensionDate('')
                    setExtensionSupport('')
                  }}
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  取消
                </Button>
                <Button
                  size="sm"
                  className="gap-1.5 flex-1 rounded-lg shadow-sm"
                  disabled={!extensionReason.trim() || submittingExtension}
                  onClick={handleSubmitExtension}
                >
                  <Send className="h-3.5 w-3.5" />
                  送出延期申請
                </Button>
              </div>
            </div>
          )}

          {/* Task list */}
          <div className="space-y-1">
            <h3 className="text-sm font-medium mb-2">任務列表</h3>
            {msTasks.length === 0 ? (
              <div className="text-center py-6 text-sm text-muted-foreground">
                此里程碑尚未有任務
              </div>
            ) : (
              <div className="rounded-lg border divide-y overflow-hidden">
                {msTasks.map(task => renderTaskNode(task, 0))}
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
