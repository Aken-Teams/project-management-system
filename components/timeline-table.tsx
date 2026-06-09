'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { cn } from '@/lib/utils'
import {
  DndContext,
  closestCenter,
  useSensor,
  useSensors,
  PointerSensor,
  KeyboardSensor,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Plus, Trash2, X, ChevronRight, ChevronDown, ChevronsUpDown, BarChart3, Milestone as MilestoneIcon, AlertTriangle, Lock, LockOpen } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// ─── Types ──────────────────────────────────────────────────
export interface TimelineMilestone {
  id: string
  name: string
  durationDays: number
  startDate?: string
  endDate?: string
  manualDates?: boolean
}

export interface TimelineTask {
  id: string
  milestoneId: string
  title: string
  assignee: string
  priority: 'low' | 'medium' | 'high'
  durationDays: number
  parentId?: string
  startDate?: string
  manualDates?: boolean
}

export interface TimelineTeamMember {
  id: string
  name: string
  role: string
  responsibility: string
}

export interface OverflowInfo {
  childEnd: string
  overflowDays: number
}

export interface TimelineTableProps {
  milestones: TimelineMilestone[]
  tasks: TimelineTask[]
  taskDates: Map<string, { startDate: string; endDate: string }>
  teamMembers: TimelineTeamMember[]
  overflows?: Map<string, OverflowInfo>
  onMilestoneUpdate: (index: number, field: 'name' | 'durationDays', value: string | number) => void
  onMilestoneRemove: (index: number) => void
  onMilestoneAdd: () => void
  onMilestoneReorder: (oldIndex: number, newIndex: number) => void
  onMilestoneDateChange?: (index: number, field: 'startDate' | 'endDate', value: string) => void
  onMilestoneToggleLock?: (index: number) => void
  onTaskAdd: (task: TimelineTask) => void
  onTaskRemove: (taskId: string) => void
  onTaskUpdate: (taskId: string, field: keyof TimelineTask, value: string | number) => void
  onTaskReorder: (oldIndex: number, newIndex: number) => void
  onTaskDateChange?: (taskId: string, field: 'startDate' | 'endDate', value: string) => void
  onTaskToggleLock?: (taskId: string) => void
  onGanttPreview?: () => void
}

// ─── Column grid class (shared across all rows) ─────────────
const GRID_COLS = 'grid grid-cols-[28px_1fr_72px_140px_140px_88px_52px_28px] gap-0 items-center'

// ─── DateInput (uncontrolled to bypass React 19 controlled-input rollback) ──
// React 19 resets controlled <input type="date"> values before the batched
// state update completes, fighting with the native calendar picker.
// Using an uncontrolled input + ref sync avoids this entirely.
function DateInput({ value, onCommit, className, min, max }: {
  value: string
  onCommit: (value: string) => void
  className?: string
  min?: string
  max?: string
}) {
  const ref = useRef<HTMLInputElement>(null)
  const onCommitRef = useRef(onCommit)
  onCommitRef.current = onCommit

  useEffect(() => {
    if (ref.current && ref.current.value !== value) {
      ref.current.value = value
    }
  }, [value])

  return (
    <input
      ref={ref}
      type="date"
      defaultValue={value}
      min={min}
      max={max}
      onChange={(e) => {
        if (e.target.value) onCommitRef.current(e.target.value)
      }}
      className={cn(
        'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        className,
      )}
    />
  )
}

// ─── MilestoneRow ───────────────────────────────────────────
function MilestoneRow({
  milestone,
  index,
  canRemove,
  collapsed,
  taskCount,
  overflowInfo,
  envelopeStart,
  envelopeEnd,
  onUpdate,
  onRemove,
  onToggleCollapse,
  onDateChange,
  onToggleLock,
}: {
  milestone: TimelineMilestone
  index: number
  canRemove: boolean
  collapsed: boolean
  taskCount: number
  overflowInfo?: OverflowInfo
  envelopeStart?: string
  envelopeEnd?: string
  onUpdate: (index: number, field: 'name' | 'durationDays', value: string | number) => void
  onRemove: (index: number) => void
  onToggleCollapse: () => void
  onDateChange?: (index: number, field: 'startDate' | 'endDate', value: string) => void
  onToggleLock?: (index: number) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: milestone.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  // 方案 A：有任務的里程碑，起訖 = 任務最早開始～最晚結束（envelope）。
  // 預設鎖定（唯讀 envelope）；解鎖（manualDates）後可手動加寬，但卡死不可低於子層。
  const hasTasks = taskCount > 0
  const isManual = hasTasks && !!milestone.manualDates
  const isAutoLocked = hasTasks && !isManual
  // 手動值與子層 envelope 不一致（父層大於子層）→ ⚠ 提醒
  const inconsistent = !!isManual && (
    (!!envelopeStart && !!milestone.startDate && milestone.startDate !== envelopeStart) ||
    (!!envelopeEnd && !!milestone.endDate && milestone.endDate !== envelopeEnd)
  )
  const derivedDuration = hasTasks && milestone.startDate && milestone.endDate
    ? Math.round((new Date(milestone.endDate).getTime() - new Date(milestone.startDate).getTime()) / 86400000) + 1
    : (milestone.durationDays || 0)

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${GRID_COLS} px-2 py-1.5 border-l-[3px] border-t border-t-border first:border-t-0 font-medium ${
        index % 2 === 0
          ? 'bg-indigo-50/60 border-l-indigo-400'
          : 'bg-amber-50/60 border-l-amber-400'
      }`}
    >
      {/* Drag */}
      <div
        {...attributes}
        {...listeners}
        className="flex items-center justify-center cursor-grab active:cursor-grabbing"
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>

      {/* Name + collapse toggle */}
      <div className="pr-2 flex items-center gap-0.5">
        <MilestoneIcon className="h-3.5 w-3.5 text-primary shrink-0" />
        <button
          type="button"
          onClick={onToggleCollapse}
          className="flex items-center justify-center h-6 w-6 shrink-0 rounded hover:bg-muted transition-colors"
        >
          {collapsed
            ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          }
        </button>
        <Input
          value={milestone.name}
          onChange={(e) => onUpdate(index, 'name', e.target.value)}
          placeholder="里程碑名稱"
          className="h-8 border-0 bg-transparent font-medium text-sm focus-visible:ring-1 px-1.5"
        />
        {collapsed && taskCount > 0 && (
          <span className="shrink-0 text-[10px] text-muted-foreground bg-muted rounded-full px-1.5 py-0.5">
            {taskCount} 任務
          </span>
        )}
        {hasTasks && onToggleLock && (
          <button
            type="button"
            onClick={() => onToggleLock(index)}
            className={cn(
              'shrink-0 flex items-center justify-center h-6 w-6 rounded transition-colors',
              isManual ? 'text-amber-600 hover:bg-amber-100' : 'text-muted-foreground/50 hover:bg-muted hover:text-foreground',
            )}
            title={isManual ? '手動模式：日期可加寬（不可低於子層）。點擊改回自動貼齊' : '自動貼齊子層。點擊解鎖以手動加寬'}
          >
            {isManual ? <LockOpen className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>

      {/* Duration */}
      <div className="flex justify-center">
        {hasTasks ? (
          <span className="h-8 w-14 flex items-center justify-center text-sm text-muted-foreground" title="由任務日期自動計算（最早開始～最晚結束）">
            {derivedDuration}
          </span>
        ) : (
          <Input
            type="number"
            min={0}
            value={milestone.durationDays || ''}
            onChange={(e) => onUpdate(index, 'durationDays', Number(e.target.value) || 0)}
            className="h-8 w-14 text-center text-sm border-0 bg-transparent focus-visible:ring-1 px-0"
          />
        )}
      </div>

      {/* Start date — locked(read-only envelope) / manual(editable, 不可晚於最早任務) / 無任務(自由) */}
      <div className="flex justify-center">
        {isAutoLocked ? (
          <span className="text-sm text-muted-foreground" title="由任務自動計算">{milestone.startDate || '—'}</span>
        ) : (isManual || !hasTasks) && onDateChange ? (
          <DateInput
            value={milestone.startDate || ''}
            max={isManual ? (envelopeStart || undefined) : undefined}
            onCommit={(v) => onDateChange(index, 'startDate', v)}
            className={cn("h-8 w-full text-center text-sm border-0 bg-transparent focus-visible:ring-1 px-1", isManual && "text-amber-700")}
          />
        ) : (
          <span className="text-sm text-muted-foreground">{milestone.startDate || '—'}</span>
        )}
      </div>

      {/* End date — locked / manual(不可早於最晚任務) / 無任務(自由) */}
      <div className="flex justify-center items-center gap-0.5">
        {isAutoLocked ? (
          <span className="text-sm text-muted-foreground">{milestone.endDate || '—'}</span>
        ) : (isManual || !hasTasks) && onDateChange ? (
          <DateInput
            value={milestone.endDate || ''}
            min={isManual ? (envelopeEnd || undefined) : (milestone.startDate || undefined)}
            onCommit={(v) => onDateChange(index, 'endDate', v)}
            className={cn("h-8 w-full text-center text-sm border-0 bg-transparent focus-visible:ring-1 px-1", (overflowInfo || isManual) && "text-amber-700")}
          />
        ) : (
          <span className={cn("text-sm text-muted-foreground", overflowInfo && "text-amber-700")}>{milestone.endDate || '—'}</span>
        )}
        {(overflowInfo || inconsistent) && (
          <span
            className="shrink-0 cursor-help"
            title={overflowInfo
              ? `任務結束日（${overflowInfo.childEnd}）超出里程碑結束日（${milestone.endDate}）${overflowInfo.overflowDays} 天`
              : `手動加寬中：里程碑範圍大於任務（任務 ${envelopeStart ?? ''}～${envelopeEnd ?? ''}）。理想應與任務一致`}
          >
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
          </span>
        )}
      </div>

      {/* Assignee (empty for milestone) */}
      <div />

      {/* Priority (empty for milestone) */}
      <div />

      {/* Delete */}
      <div className="flex justify-center">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-destructive"
          onClick={() => onRemove(index)}
          disabled={!canRemove}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}

// ─── TaskRow ────────────────────────────────────────────────
function TaskRow({
  task,
  startDate,
  endDate,
  teamMembers,
  subtaskCount,
  collapsed,
  msIndex,
  overflowInfo,
  envelopeStart,
  envelopeEnd,
  onRemove,
  onUpdate,
  onToggleAddSubtask,
  onToggleCollapse,
  onDateChange,
  onToggleLock,
}: {
  task: TimelineTask
  startDate?: string
  endDate?: string
  teamMembers: TimelineTeamMember[]
  subtaskCount: number
  collapsed: boolean
  msIndex: number
  overflowInfo?: OverflowInfo
  envelopeStart?: string
  envelopeEnd?: string
  onRemove: (id: string) => void
  onUpdate: (id: string, field: keyof TimelineTask, value: string | number) => void
  onToggleAddSubtask: () => void
  onToggleCollapse: () => void
  onDateChange?: (taskId: string, field: 'startDate' | 'endDate', value: string) => void
  onToggleLock?: (taskId: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const cyclePriority = () => {
    const order: Array<'low' | 'medium' | 'high'> = ['low', 'medium', 'high']
    const idx = order.indexOf(task.priority)
    onUpdate(task.id, 'priority', order[(idx + 1) % order.length])
  }

  const priorityConfig = {
    high: { label: '高', className: 'bg-red-100 text-red-700 border-red-200 hover:bg-red-200' },
    medium: { label: '中', className: 'bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-200' },
    low: { label: '低', className: 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200' },
  }

  const p = priorityConfig[task.priority]

  // 方案 A：有子任務的任務，日期 = 子任務最早開始～最晚結束（envelope）。
  // 預設鎖定（唯讀 envelope）；解鎖（manualDates）後可手動加寬，但卡死不可低於子層。
  const hasSubtasks = subtaskCount > 0
  const isManual = hasSubtasks && !!task.manualDates
  const isAutoLocked = hasSubtasks && !isManual
  const inconsistent = !!isManual && (
    (!!envelopeStart && !!startDate && startDate !== envelopeStart) ||
    (!!envelopeEnd && !!endDate && endDate !== envelopeEnd)
  )
  const derivedDuration = hasSubtasks && startDate && endDate
    ? Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000) + 1
    : (task.durationDays || 0)

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${GRID_COLS} px-2 py-1 hover:bg-muted/20 transition-colors text-sm border-l-[3px] ${
        subtaskCount > 0
          ? msIndex % 2 === 0 ? 'border-l-indigo-300 bg-indigo-50/30' : 'border-l-amber-300 bg-amber-50/30'
          : msIndex % 2 === 0 ? 'border-l-indigo-200' : 'border-l-amber-200'
      }`}
    >
      {/* Drag */}
      <div
        {...attributes}
        {...listeners}
        className="flex items-center justify-center cursor-grab active:cursor-grabbing"
      >
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40" />
      </div>

      {/* Name (indented) */}
      <div className="pl-4 flex items-center gap-1 min-w-0 pr-2">
        {subtaskCount > 0 ? (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="shrink-0 flex items-center justify-center h-5 w-5 rounded hover:bg-blue-100 transition-colors"
            title={collapsed ? '展開子任務' : '收合子任務'}
          >
            {collapsed
              ? <ChevronRight className="h-3 w-3 text-blue-500" />
              : <ChevronDown className="h-3 w-3 text-blue-500" />
            }
          </button>
        ) : (
          <span className="text-muted-foreground/30 text-sm select-none shrink-0 w-5 text-center">└</span>
        )}
        <Input
          value={task.title}
          onChange={(e) => onUpdate(task.id, 'title', e.target.value)}
          className="h-7 text-sm border-0 bg-transparent focus-visible:ring-1 px-1 truncate"
          placeholder="任務名稱"
        />
        {subtaskCount > 0 && (
          <span className="shrink-0 text-[10px] text-blue-600 bg-blue-50 rounded-full px-1.5 py-0.5 font-medium" title="天數與日期由子任務自動計算">
            {subtaskCount} 子任務
          </span>
        )}
        {hasSubtasks && onToggleLock && (
          <button
            type="button"
            onClick={() => onToggleLock(task.id)}
            className={cn(
              'shrink-0 flex items-center justify-center h-6 w-6 rounded transition-colors',
              isManual ? 'text-amber-600 hover:bg-amber-100' : 'text-muted-foreground/50 hover:bg-muted hover:text-foreground',
            )}
            title={isManual ? '手動模式：日期可加寬（不可低於子任務）。點擊改回自動貼齊' : '自動貼齊子任務。點擊解鎖以手動加寬'}
          >
            {isManual ? <LockOpen className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
          </button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onToggleAddSubtask}
          className="shrink-0 h-6 w-6 text-muted-foreground/50 hover:text-primary hover:bg-primary/10"
          title="新增子任務"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Duration (auto-calculated when parent has subtasks) */}
      <div className="flex justify-center">
        {hasSubtasks ? (
          <span className="h-7 w-12 flex items-center justify-center text-sm text-muted-foreground" title="由子任務日期自動計算（最早開始～最晚結束）">
            {derivedDuration}
          </span>
        ) : (
          <Input
            type="number"
            min={1}
            value={task.durationDays || ''}
            onChange={(e) => onUpdate(task.id, 'durationDays', Number(e.target.value) || 0)}
            className="h-7 w-12 text-center text-sm border-0 bg-transparent focus-visible:ring-1 px-0"
          />
        )}
      </div>

      {/* Start date — locked(read-only) / manual(可加寬,不可晚於最早子任務) / 葉節點(自由) */}
      <div className="flex justify-center">
        {isAutoLocked ? (
          <span className="text-sm text-muted-foreground" title="由子任務自動計算">{startDate || '—'}</span>
        ) : (isManual || !hasSubtasks) && onDateChange ? (
          <DateInput
            value={startDate || ''}
            max={isManual ? (envelopeStart || undefined) : undefined}
            onCommit={(v) => onDateChange(task.id, 'startDate', v)}
            className={cn("h-7 w-full text-center text-sm border-0 bg-transparent focus-visible:ring-1 px-1", isManual && "text-amber-700")}
          />
        ) : (
          <span className="text-sm text-muted-foreground">{startDate || '—'}</span>
        )}
      </div>

      {/* End date — locked / manual(不可早於最晚子任務) / 葉節點(自由) */}
      <div className="flex justify-center items-center gap-0.5">
        {isAutoLocked ? (
          <span className="text-sm text-muted-foreground" title="由子任務自動計算">{endDate || '—'}</span>
        ) : (isManual || !hasSubtasks) && onDateChange ? (
          <DateInput
            value={endDate || ''}
            min={isManual ? (envelopeEnd || undefined) : (startDate || undefined)}
            onCommit={(v) => onDateChange(task.id, 'endDate', v)}
            className={cn("h-7 w-full text-center text-sm border-0 bg-transparent focus-visible:ring-1 px-1", (overflowInfo || isManual) && "text-amber-700")}
          />
        ) : (
          <span className={cn("text-sm text-muted-foreground", overflowInfo && "text-amber-700")}>{endDate || '—'}</span>
        )}
        {(overflowInfo || inconsistent) && (
          <span
            className="shrink-0 cursor-help"
            title={overflowInfo
              ? `子任務結束日（${overflowInfo.childEnd}）超出任務結束日（${endDate}）${overflowInfo.overflowDays} 天`
              : `手動加寬中：任務範圍大於子任務（子任務 ${envelopeStart ?? ''}～${envelopeEnd ?? ''}）。理想應與子任務一致`}
          >
            <AlertTriangle className="h-3 w-3 text-amber-500" />
          </span>
        )}
      </div>

      {/* Assignee */}
      <div>
        <Select
          value={task.assignee || ' '}
          onValueChange={(v) => onUpdate(task.id, 'assignee', v)}
        >
          <SelectTrigger className="h-7 border-0 bg-transparent text-sm focus:ring-1 px-1.5">
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value=" ">未指派</SelectItem>
            {teamMembers.filter(m => m.name.trim()).map((m) => (
              <SelectItem key={m.id} value={m.name}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Priority (click to cycle) */}
      <div className="flex justify-center">
        <button
          type="button"
          onClick={cyclePriority}
          className="transition-opacity"
        >
          <Badge
            variant="outline"
            className={`text-[10px] px-1.5 py-0 cursor-pointer ${p.className}`}
          >
            {p.label}
          </Badge>
        </button>
      </div>

      {/* Remove */}
      <div className="flex justify-center">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-destructive"
          onClick={() => onRemove(task.id)}
          title="刪除任務"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  )
}

// ─── InlineTaskInput ────────────────────────────────────────
function InlineTaskInput({
  milestoneId,
  teamMembers,
  msIndex,
  onAdd,
}: {
  milestoneId: string
  teamMembers: TimelineTeamMember[]
  msIndex: number
  onAdd: (task: TimelineTask) => void
}) {
  const [title, setTitle] = useState('')
  const [durationDays, setDurationDays] = useState(1)
  const [assignee, setAssignee] = useState('')
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium')

  const handleAdd = () => {
    if (!title.trim()) return
    onAdd({
      id: `draft-task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      milestoneId,
      title: title.trim(),
      assignee,
      priority,
      durationDays,
    })
    setTitle('')
    setDurationDays(1)
    setAssignee('')
    setPriority('medium')
  }

  const cyclePriority = () => {
    const order: Array<'low' | 'medium' | 'high'> = ['low', 'medium', 'high']
    const idx = order.indexOf(priority)
    setPriority(order[(idx + 1) % order.length])
  }

  const priorityConfig = {
    high: { label: '高', className: 'bg-red-100 text-red-700 border-red-200 hover:bg-red-200' },
    medium: { label: '中', className: 'bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-200' },
    low: { label: '低', className: 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200' },
  }

  const p = priorityConfig[priority]

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAdd()
    }
  }

  return (
    <div className={`${GRID_COLS} px-2 py-0.5 border-l-[3px] ${msIndex % 2 === 0 ? 'border-l-indigo-200' : 'border-l-amber-200'}`}>
      {/* Drag placeholder */}
      <div />

      {/* Title */}
      <div className="pl-4">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="+ 新增任務..."
          className="h-7 border-0 bg-transparent text-sm text-muted-foreground placeholder:text-muted-foreground/40 focus-visible:ring-0 focus-visible:border-b focus-visible:border-primary focus-visible:rounded-none px-1.5"
        />
      </div>

      {/* Duration */}
      <div className="flex justify-center">
        {title.trim() && (
          <Input
            type="number"
            min={1}
            value={durationDays}
            onChange={(e) => setDurationDays(Number(e.target.value) || 1)}
            onKeyDown={handleKeyDown}
            className="h-7 w-12 text-center text-sm border-0 bg-transparent focus-visible:ring-1 px-0 text-muted-foreground"
          />
        )}
      </div>

      {/* Start date placeholder */}
      <div />

      {/* End date placeholder */}
      <div />

      {/* Assignee */}
      <div>
        {title.trim() && (
          <Select
            value={assignee || ' '}
            onValueChange={(v) => setAssignee(v === ' ' ? '' : v)}
          >
            <SelectTrigger className="h-7 border-0 bg-transparent text-sm focus:ring-1 px-1.5 text-muted-foreground">
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value=" ">未指派</SelectItem>
              {teamMembers.map((m) => (
                <SelectItem key={m.id} value={m.name}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Priority */}
      <div className="flex justify-center">
        {title.trim() && (
          <button type="button" onClick={cyclePriority} className="transition-opacity">
            <Badge
              variant="outline"
              className={`text-[10px] px-1.5 py-0 cursor-pointer opacity-60 hover:opacity-100 ${p.className}`}
            >
              {p.label}
            </Badge>
          </button>
        )}
      </div>

      {/* Add button */}
      <div className="flex justify-center">
        {title.trim() && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-primary"
            onClick={handleAdd}
          >
            <Plus className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  )
}

// ─── SubtaskRow ─────────────────────────────────────────────
function SubtaskRow({
  task,
  startDate,
  endDate,
  teamMembers,
  msIndex,
  onRemove,
  onUpdate,
  onDateChange,
}: {
  task: TimelineTask
  startDate?: string
  endDate?: string
  teamMembers: TimelineTeamMember[]
  msIndex: number
  onRemove: (id: string) => void
  onUpdate: (id: string, field: keyof TimelineTask, value: string | number) => void
  onDateChange?: (taskId: string, field: 'startDate' | 'endDate', value: string) => void
}) {
  const cyclePriority = () => {
    const order: Array<'low' | 'medium' | 'high'> = ['low', 'medium', 'high']
    const idx = order.indexOf(task.priority)
    onUpdate(task.id, 'priority', order[(idx + 1) % order.length])
  }

  const priorityConfig = {
    high: { label: '高', className: 'bg-red-100 text-red-700 border-red-200 hover:bg-red-200' },
    medium: { label: '中', className: 'bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-200' },
    low: { label: '低', className: 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200' },
  }

  const p = priorityConfig[task.priority]

  return (
    <div className={`${GRID_COLS} px-2 py-0.5 hover:bg-muted/20 transition-colors text-sm border-l-[3px] ${
      msIndex % 2 === 0 ? 'border-l-indigo-100 bg-indigo-50/10' : 'border-l-amber-200 bg-amber-50/10'
    }`}>
      {/* No drag for subtasks */}
      <div />

      {/* Name (deeper indent) */}
      <div className="pl-10 flex items-center gap-1 min-w-0 pr-2">
        <span className="text-muted-foreground/20 text-xs select-none">└</span>
        <Input
          value={task.title}
          onChange={(e) => onUpdate(task.id, 'title', e.target.value)}
          className="h-7 text-sm border-0 bg-transparent focus-visible:ring-1 px-1 truncate"
          placeholder="子任務名稱"
        />
      </div>

      {/* Duration */}
      <div className="flex justify-center">
        <Input
          type="number"
          min={1}

          value={task.durationDays || ''}
          onChange={(e) => onUpdate(task.id, 'durationDays', Math.max(1, Number(e.target.value) || 1))}
          className="h-7 w-14 text-center text-sm border-0 bg-transparent focus-visible:ring-1 px-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
      </div>

      {/* Start date */}
      <div className="flex justify-center">
        {onDateChange ? (
          <DateInput
            value={startDate || ''}
            onCommit={(v) => onDateChange(task.id, 'startDate', v)}
            className="h-7 w-full text-center text-sm border-0 bg-transparent focus-visible:ring-1 px-1"
          />
        ) : (
          <span className="text-sm text-muted-foreground">{startDate || ''}</span>
        )}
      </div>

      {/* End date */}
      <div className="flex justify-center">
        {onDateChange ? (
          <DateInput
            value={endDate || ''}
            min={startDate || undefined}
            onCommit={(v) => onDateChange(task.id, 'endDate', v)}
            className="h-7 w-full text-center text-sm border-0 bg-transparent focus-visible:ring-1 px-1"
          />
        ) : (
          <span className="text-sm text-muted-foreground">{endDate || ''}</span>
        )}
      </div>

      {/* Assignee */}
      <div>
        <Select
          value={task.assignee || ' '}
          onValueChange={(v) => onUpdate(task.id, 'assignee', v)}
        >
          <SelectTrigger className="h-7 border-0 bg-transparent text-sm focus:ring-1 px-1.5">
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value=" ">未指派</SelectItem>
            {teamMembers.filter(m => m.name.trim()).map((m) => (
              <SelectItem key={m.id} value={m.name}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Priority */}
      <div className="flex justify-center">
        <button type="button" onClick={cyclePriority} className="transition-opacity">
          <Badge
            variant="outline"
            className={`text-[10px] px-1.5 py-0 cursor-pointer ${p.className}`}
          >
            {p.label}
          </Badge>
        </button>
      </div>

      {/* Remove */}
      <div className="flex justify-center">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-destructive"
          onClick={() => onRemove(task.id)}
          title="刪除子任務"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  )
}

// ─── InlineSubtaskInput ─────────────────────────────────────
function InlineSubtaskInput({
  parentTask,
  teamMembers,
  msIndex,
  onAdd,
  onCancel,
}: {
  parentTask: TimelineTask
  teamMembers: TimelineTeamMember[]
  msIndex: number
  onAdd: (task: TimelineTask) => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState('')
  const [assignee, setAssignee] = useState('')
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium')
  const [durationDays, setDurationDays] = useState(1)

  const handleAdd = () => {
    if (!title.trim()) return
    onAdd({
      id: `draft-subtask-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      milestoneId: parentTask.milestoneId,
      title: title.trim(),
      assignee,
      priority,
      durationDays,
      parentId: parentTask.id,
    })
    setTitle('')
    setAssignee('')
    setPriority('medium')
    setDurationDays(1)
  }

  const cyclePriority = () => {
    const order: Array<'low' | 'medium' | 'high'> = ['low', 'medium', 'high']
    const idx = order.indexOf(priority)
    setPriority(order[(idx + 1) % order.length])
  }

  const priorityConfig = {
    high: { label: '高', className: 'bg-red-100 text-red-700 border-red-200 hover:bg-red-200' },
    medium: { label: '中', className: 'bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-200' },
    low: { label: '低', className: 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200' },
  }

  const p = priorityConfig[priority]

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAdd()
    }
    if (e.key === 'Escape') {
      onCancel()
    }
  }

  return (
    <div className={`${GRID_COLS} px-2 py-0.5 border-l-[3px] ${msIndex % 2 === 0 ? 'border-l-indigo-100' : 'border-l-amber-100'}`}>
      <div />

      {/* Title */}
      <div className="pl-10">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="+ 新增子任務..."
          className="h-7 border-0 bg-transparent text-sm text-muted-foreground placeholder:text-muted-foreground/40 focus-visible:ring-0 focus-visible:border-b focus-visible:border-primary focus-visible:rounded-none px-1.5"
          autoFocus
        />
      </div>

      {/* Duration */}
      <div className="flex justify-center">
        {title.trim() && (
          <Input
            type="number"
            min={1}
  
            value={durationDays}
            onChange={(e) => setDurationDays(Math.max(1, Number(e.target.value) || 1))}
            className="h-7 w-14 text-center text-sm border-0 bg-transparent focus-visible:ring-1 px-1 text-muted-foreground [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
        )}
      </div>

      {/* Start date placeholder */}
      <div />

      {/* End date placeholder */}
      <div />

      {/* Assignee */}
      <div>
        {title.trim() && (
          <Select
            value={assignee || ' '}
            onValueChange={(v) => setAssignee(v === ' ' ? '' : v)}
          >
            <SelectTrigger className="h-7 border-0 bg-transparent text-sm focus:ring-1 px-1.5 text-muted-foreground">
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value=" ">未指派</SelectItem>
              {teamMembers.map((m) => (
                <SelectItem key={m.id} value={m.name}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Priority */}
      <div className="flex justify-center">
        {title.trim() && (
          <button type="button" onClick={cyclePriority} className="transition-opacity">
            <Badge
              variant="outline"
              className={`text-[10px] px-1.5 py-0 cursor-pointer opacity-60 hover:opacity-100 ${p.className}`}
            >
              {p.label}
            </Badge>
          </button>
        )}
      </div>

      {/* Add / Cancel buttons */}
      <div className="flex justify-center">
        {title.trim() ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-primary"
            onClick={handleAdd}
          >
            <Plus className="h-3 w-3" />
          </Button>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-muted-foreground/60"
            onClick={onCancel}
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  )
}

// ─── TimelineTable (main export) ────────────────────────────
export function TimelineTable({
  milestones,
  tasks,
  taskDates,
  teamMembers,
  overflows,
  onMilestoneUpdate,
  onMilestoneRemove,
  onMilestoneAdd,
  onMilestoneReorder,
  onMilestoneDateChange,
  onMilestoneToggleLock,
  onTaskAdd,
  onTaskRemove,
  onTaskUpdate,
  onTaskReorder,
  onTaskDateChange,
  onTaskToggleLock,
  onGanttPreview,
}: TimelineTableProps) {
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set())
  const [addingSubtaskForId, setAddingSubtaskForId] = useState<string | null>(null)

  // Envelope (子層最早開始 ～ 最晚結束) of a parent's children, from computed dates.
  const envelopeOf = (childIds: string[]): { start?: string; end?: string } => {
    let start: string | undefined
    let end: string | undefined
    for (const id of childIds) {
      const d = taskDates.get(id)
      if (!d) continue
      if (!start || d.startDate < start) start = d.startDate
      if (!end || d.endDate > end) end = d.endDate
    }
    return { start, end }
  }

  const toggleCollapse = (msId: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev)
      if (next.has(msId)) next.delete(msId)
      else next.add(msId)
      return next
    })
  }

  const allCollapsed = milestones.length > 0 && milestones.every((m) => collapsedIds.has(m.id))

  const toggleAll = () => {
    if (allCollapsed) {
      setCollapsedIds(new Set())
    } else {
      setCollapsedIds(new Set(milestones.map((m) => m.id)))
    }
  }

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // Build flat list of sortable IDs: [ms1, task1a, task1b, ms2, task2a, ...]
  // Exclude subtasks — they follow their parent and are not independently sortable
  const flatIds: string[] = []
  for (const ms of milestones) {
    flatIds.push(ms.id)
    for (const t of tasks.filter((t) => t.milestoneId === ms.id && !t.parentId)) {
      flatIds.push(t.id)
    }
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const activeId = String(active.id)
    const overId = String(over.id)

    const isMilestoneDrag = milestones.some((m) => m.id === activeId)

    if (isMilestoneDrag) {
      // Milestone → milestone reorder
      const isMilestoneTarget = milestones.some((m) => m.id === overId)
      if (!isMilestoneTarget) return
      const oldIndex = milestones.findIndex((m) => m.id === activeId)
      const newIndex = milestones.findIndex((m) => m.id === overId)
      if (oldIndex !== -1 && newIndex !== -1) {
        onMilestoneReorder(oldIndex, newIndex)
      }
    } else {
      // Task → task reorder (same milestone only)
      const draggedTask = tasks.find((t) => t.id === activeId)
      const targetTask = tasks.find((t) => t.id === overId)
      if (!draggedTask || !targetTask) return
      if (draggedTask.milestoneId !== targetTask.milestoneId) return
      const oldIndex = tasks.findIndex((t) => t.id === activeId)
      const newIndex = tasks.findIndex((t) => t.id === overId)
      if (oldIndex !== -1 && newIndex !== -1) {
        onTaskReorder(oldIndex, newIndex)
      }
    }
  }

  return (
    <div className="rounded-lg border overflow-hidden">
      {/* Toolbar: preview + expand/collapse all */}
      <div className="flex items-center justify-end gap-3 px-3 py-2 bg-muted/30 border-b">
        {onGanttPreview && (
          <button
            type="button"
            onClick={onGanttPreview}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <BarChart3 className="h-4 w-4" />
            預覽甘特圖
          </button>
        )}
        <button
          type="button"
          onClick={toggleAll}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronsUpDown className="h-4 w-4" />
          {allCollapsed ? '全部展開' : '全部收合'}
        </button>
      </div>

      {/* Scrollable area with sticky header */}
      <div className="max-h-[60vh] overflow-y-auto">
        {/* Header */}
        <div
          className={`${GRID_COLS} px-2 py-2.5 bg-muted border-b text-sm font-medium text-muted-foreground tracking-wide sticky top-0 z-10`}
        >
          <span />
          <span className="pl-1.5">名稱</span>
          <span className="text-center">日曆天</span>
          <span className="text-center">開始日期</span>
          <span className="text-center">結束日期</span>
          <span className="text-center">指派人</span>
          <span className="text-center">優先度</span>
          <span />
        </div>

        {/* Rows */}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={flatIds} strategy={verticalListSortingStrategy}>
          {milestones.map((milestone, msIndex) => {
            const msParentTasks = tasks.filter((t) => t.milestoneId === milestone.id && !t.parentId)
            const isCollapsed = collapsedIds.has(milestone.id)
            const msEnvelope = envelopeOf(msParentTasks.map(t => t.id))
            return (
              <div key={milestone.id}>
                <MilestoneRow
                  milestone={milestone}
                  index={msIndex}
                  canRemove={milestones.length > 1}
                  collapsed={isCollapsed}
                  taskCount={msParentTasks.length}
                  overflowInfo={overflows?.get(milestone.id)}
                  envelopeStart={msEnvelope.start}
                  envelopeEnd={msEnvelope.end}
                  onUpdate={onMilestoneUpdate}
                  onRemove={onMilestoneRemove}
                  onToggleCollapse={() => toggleCollapse(milestone.id)}
                  onDateChange={onMilestoneDateChange}
                  onToggleLock={onMilestoneToggleLock}
                />
                {!isCollapsed && (
                  <>
                    {msParentTasks.map((task) => {
                      const subtasks = tasks.filter((st) => st.parentId === task.id)
                      const subtasksCollapsed = collapsedIds.has(task.id)
                      const taskEnvelope = envelopeOf(subtasks.map(st => st.id))
                      return (
                        <div key={task.id}>
                          <TaskRow
                            task={task}
                            startDate={taskDates.get(task.id)?.startDate}
                            endDate={taskDates.get(task.id)?.endDate}
                            teamMembers={teamMembers}
                            subtaskCount={subtasks.length}
                            collapsed={subtasksCollapsed}
                            msIndex={msIndex}
                            overflowInfo={overflows?.get(task.id)}
                            envelopeStart={taskEnvelope.start}
                            envelopeEnd={taskEnvelope.end}
                            onRemove={onTaskRemove}
                            onUpdate={onTaskUpdate}
                            onToggleAddSubtask={() =>
                              setAddingSubtaskForId(prev => prev === task.id ? null : task.id)
                            }
                            onToggleCollapse={() => toggleCollapse(task.id)}
                            onDateChange={onTaskDateChange}
                            onToggleLock={onTaskToggleLock}
                          />
                          {!subtasksCollapsed && subtasks.map((st) => (
                            <SubtaskRow
                              key={st.id}
                              task={st}
                              startDate={taskDates.get(st.id)?.startDate}
                              endDate={taskDates.get(st.id)?.endDate}
                              teamMembers={teamMembers}
                              msIndex={msIndex}
                              onRemove={onTaskRemove}
                              onUpdate={onTaskUpdate}
                              onDateChange={onTaskDateChange}
                            />
                          ))}
                          {!subtasksCollapsed && addingSubtaskForId === task.id && (
                            <InlineSubtaskInput
                              parentTask={task}
                              teamMembers={teamMembers}
                              msIndex={msIndex}
                              onAdd={(subtask) => {
                                onTaskAdd(subtask)
                              }}
                              onCancel={() => setAddingSubtaskForId(null)}
                            />
                          )}
                        </div>
                      )
                    })}
                    <InlineTaskInput milestoneId={milestone.id} teamMembers={teamMembers} msIndex={msIndex} onAdd={onTaskAdd} />
                  </>
                )}
              </div>
            )
          })}
        </SortableContext>
      </DndContext>
      </div>

      {/* Add milestone */}
      <div className="px-3 py-2 border-t border-dashed">
        <button
          type="button"
          onClick={onMilestoneAdd}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
        >
          <Plus className="h-4 w-4" />
          新增里程碑
        </button>
      </div>
    </div>
  )
}
