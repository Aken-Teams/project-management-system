'use client'

import { useState, useRef, useCallback, useEffect, memo } from 'react'
import { cn } from '@/lib/utils'
import { MAX_TASK_DEPTH } from '@/lib/timeline-tree'
import {
  DndContext,
  closestCenter,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  PointerSensor,
  KeyboardSensor,
  type DragEndEvent,
  type DragOverEvent,
  type CollisionDetection,
} from '@dnd-kit/core'

// Row under the pointer = the drop target (matches the pointer-based before/inside/after
// mode). Falls back to rect/closest when the pointer is in a gap between rows.
const treeCollision: CollisionDetection = (args) => {
  const hits = pointerWithin(args)
  if (hits.length) return hits
  const rect = rectIntersection(args)
  return rect.length ? rect : closestCenter(args)
}
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Plus, Trash2, X, ChevronRight, ChevronDown, ChevronsUpDown, BarChart3, Milestone as MilestoneIcon, AlertTriangle, IndentIncrease, IndentDecrease } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
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
  completed?: boolean   // 目前是否為完成狀態（新增子任務到已完成父層時要提醒解除）
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
  onTaskAdd: (task: TimelineTask) => void
  // 新增子任務到「已完成父層」且使用者選擇解除完成時呼叫：立即解除該父層完成並通知父層負責人。
  onReopenParent?: (parentId: string) => void | Promise<void>
  onTaskRemove: (taskId: string) => void
  onTaskUpdate: (taskId: string, field: keyof TimelineTask, value: string | number) => void
  onTaskReorder: (oldIndex: number, newIndex: number) => void
  onTaskDateChange?: (taskId: string, field: 'startDate' | 'endDate', value: string) => void
  onGanttPreview?: () => void
  // Tree drag-move: reparent / convert between subtask · task · milestone (dates preserved)
  onItemMove?: (activeId: string, overId: string, mode: DropMode) => void
  // One-click nesting: indent a top-level task under the row above; outdent a subtask to a task
  onIndent?: (taskId: string) => void
  onOutdent?: (taskId: string) => void
  onMilestoneDemote?: (milestoneId: string) => void
  // Namespaces the collapse-state memory (localStorage). Pass the project id when
  // editing; a stable string (e.g. 'new-manual') for the create wizard.
  storageKey?: string
  // B-H1：有 pending 延期審核時鎖住時程編輯（新增/刪除/改名/日期/日曆天/拖曳/縮排/優先度全鎖），
  //   唯一仍可改的是「指派人」。避免審核期間又改動、破壞審核一致性。
  locked?: boolean
}

export type DropMode = 'inside' | 'before' | 'after'

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

// ─── Drop indicator helpers (tree drag-move) ────────────────
function dropRingClass(mode?: DropMode): string {
  if (!mode) return ''
  if (mode === 'inside') return 'ring-2 ring-inset ring-blue-500 bg-blue-50/60'
  if (mode === 'before') return 'shadow-[inset_0_3px_0_0_#3b82f6]'
  return 'shadow-[inset_0_-3px_0_0_#3b82f6]'
}
function DropBadge({ mode, inside, edge }: { mode?: DropMode; inside: string; edge: string }) {
  if (!mode) return null
  return (
    <span className="pointer-events-none absolute right-9 top-1/2 -translate-y-1/2 z-20 rounded bg-blue-500 text-white text-[11px] px-1.5 py-0.5 shadow whitespace-nowrap">
      {mode === 'inside' ? inside : edge}
    </span>
  )
}

// ─── MilestoneRow ───────────────────────────────────────────
const MilestoneRow = memo(function MilestoneRow({
  milestone,
  index,
  canRemove,
  collapsed,
  taskCount,
  overflowInfo,
  onUpdate,
  onRemove,
  onToggleCollapse,
  onDateChange,
  onDemote,
  dropHint,
  dropBadge,
  locked,
}: {
  milestone: TimelineMilestone
  index: number
  canRemove: boolean
  collapsed: boolean
  taskCount: number
  overflowInfo?: OverflowInfo
  onUpdate: (index: number, field: 'name' | 'durationDays', value: string | number) => void
  onRemove: (index: number) => void
  onToggleCollapse: () => void
  onDateChange?: (index: number, field: 'startDate' | 'endDate', value: string) => void
  onDemote?: (milestoneId: string) => void
  dropHint?: DropMode
  dropBadge?: DropMode
  locked?: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: milestone.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(`${GRID_COLS} relative px-2 py-1.5 border-l-[3px] border-t border-t-border first:border-t-0 font-medium ${
        index % 2 === 0
          ? 'bg-indigo-50/60 border-l-indigo-400'
          : 'bg-amber-50/60 border-l-amber-400'
      }`, dropRingClass(dropHint))}
    >
      <DropBadge mode={dropBadge} inside="放入·成為任務" edge="成為里程碑" />
      {/* Drag（鎖定時不可拖曳） */}
      <div
        {...(locked ? {} : attributes)}
        {...(locked ? {} : listeners)}
        className={cn("flex items-center justify-center", locked ? "cursor-default opacity-30" : "cursor-grab active:cursor-grabbing")}
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
          readOnly={locked}
          className="h-8 border-0 bg-transparent font-medium text-sm focus-visible:ring-1 px-1.5"
        />
        {onDemote && !locked && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onDemote(milestone.id)}
            className="shrink-0 h-6 w-6 text-muted-foreground/60 hover:text-primary hover:bg-primary/10"
            title="降階：把這個里程碑變成相鄰里程碑底下的任務"
          >
            <IndentIncrease className="h-3.5 w-3.5" />
          </Button>
        )}
        {collapsed && taskCount > 0 && (
          <span className="shrink-0 text-[11px] text-muted-foreground bg-muted rounded-full px-1.5 py-0.5">
            {taskCount} 任務
          </span>
        )}
      </div>

      {/* Duration — ADR-01: milestone is independent (always editable) */}
      <div className="flex justify-center">
        <Input
          type="number"
          min={0}
          value={milestone.durationDays || ''}
          onChange={(e) => onUpdate(index, 'durationDays', Number(e.target.value) || 0)}
          disabled={locked}
          className="h-8 w-14 text-center text-sm border-0 bg-transparent focus-visible:ring-1 px-0"
        />
      </div>

      {/* Start date — ADR-01: always editable (absolute date), no envelope constraint */}
      <div className="flex justify-center">
        {onDateChange ? (
          <DateInput
            value={milestone.startDate || ''}
            onCommit={(v) => onDateChange(index, 'startDate', v)}
            className="h-8 w-full text-center text-sm border-0 bg-transparent focus-visible:ring-1 px-1"
          />
        ) : (
          <span className="text-sm text-muted-foreground">{milestone.startDate || '—'}</span>
        )}
      </div>

      {/* End date — ADR-01: always editable; only guard end ≥ start */}
      <div className="flex justify-center items-center gap-0.5">
        {onDateChange ? (
          <DateInput
            value={milestone.endDate || ''}
            min={milestone.startDate || undefined}
            onCommit={(v) => onDateChange(index, 'endDate', v)}
            className={cn("h-8 w-full text-center text-sm border-0 bg-transparent focus-visible:ring-1 px-1", overflowInfo && "text-amber-700")}
          />
        ) : (
          <span className={cn("text-sm text-muted-foreground", overflowInfo && "text-amber-700")}>{milestone.endDate || '—'}</span>
        )}
        {overflowInfo && (
          <span
            className="shrink-0 cursor-help"
            title={`任務結束日（${overflowInfo.childEnd}）超出里程碑結束日（${milestone.endDate}）${overflowInfo.overflowDays} 天`}
          >
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
          </span>
        )}
      </div>

      {/* Assignee (empty for milestone) */}
      <div />

      {/* Priority (empty for milestone) */}
      <div />

      {/* Delete（鎖定時不可刪除） */}
      <div className="flex justify-center">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-destructive"
          onClick={() => onRemove(index)}
          disabled={!canRemove || locked}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}, (a, b) =>
  a.milestone === b.milestone && a.index === b.index && a.canRemove === b.canRemove &&
  a.collapsed === b.collapsed && a.taskCount === b.taskCount && a.overflowInfo === b.overflowInfo &&
  a.onUpdate === b.onUpdate && a.onRemove === b.onRemove && a.onDateChange === b.onDateChange &&
  a.onDemote === b.onDemote && a.dropHint === b.dropHint && a.dropBadge === b.dropBadge && a.locked === b.locked)

// ─── TaskRow ────────────────────────────────────────────────
const TaskRow = memo(function TaskRow({
  task,
  startDate,
  endDate,
  teamMembers,
  subtaskCount,
  collapsed,
  msIndex,
  overflowInfo,
  onRemove,
  onUpdate,
  onToggleAddSubtask,
  onToggleCollapse,
  onDateChange,
  onIndent,
  onOutdent,
  depth,
  dropHint,
  locked,
}: {
  task: TimelineTask
  startDate?: string
  endDate?: string
  teamMembers: TimelineTeamMember[]
  subtaskCount: number
  collapsed: boolean
  msIndex: number
  overflowInfo?: OverflowInfo
  onRemove: (id: string) => void
  onUpdate: (id: string, field: keyof TimelineTask, value: string | number) => void
  onToggleAddSubtask: () => void
  onToggleCollapse: () => void
  onDateChange?: (taskId: string, field: 'startDate' | 'endDate', value: string) => void
  onIndent?: (taskId: string) => void
  onOutdent?: (taskId: string) => void
  depth: number
  dropHint?: DropMode
  locked?: boolean
}) {
  // ADR-02: task-depth 1 = top-level task; children go deeper up to MAX_TASK_DEPTH.
  const canNestDeeper = depth < MAX_TASK_DEPTH
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(`${GRID_COLS} group relative px-2 py-1 hover:bg-muted/20 transition-colors text-sm border-l-[3px] ${
        subtaskCount > 0
          ? msIndex % 2 === 0 ? 'border-l-indigo-300 bg-indigo-50/30' : 'border-l-amber-300 bg-amber-50/30'
          : msIndex % 2 === 0 ? 'border-l-indigo-200' : 'border-l-amber-200'
      }`, dropRingClass(dropHint))}
    >
      <DropBadge mode={dropHint} inside="放入·成為子任務" edge="成為任務" />
      {/* Drag（鎖定時不可拖曳） */}
      <div
        {...(locked ? {} : attributes)}
        {...(locked ? {} : listeners)}
        className={cn("flex items-center justify-center", locked ? "cursor-default opacity-30" : "cursor-grab active:cursor-grabbing")}
      >
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40" />
      </div>

      {/* Name (indented by depth) */}
      <div className="flex items-center gap-1 min-w-0 pr-2" style={{ paddingLeft: `${depth * 14}px` }}>
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
          readOnly={locked}
          className="h-7 text-sm border-0 bg-transparent focus-visible:ring-1 px-1 truncate"
          placeholder="任務名稱"
        />
        {subtaskCount > 0 && collapsed && (
          <span className="shrink-0 text-[11px] text-blue-600 bg-blue-50 rounded-full px-1.5 py-0.5 font-medium" title="天數與日期由子任務自動計算">
            {subtaskCount} 子任務
          </span>
        )}
        {onIndent && canNestDeeper && !locked && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onIndent(task.id)}
            className="shrink-0 h-6 w-6 text-muted-foreground/60 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-primary hover:bg-primary/10 transition-opacity"
            title="縮排：變成上一列項目的子項（往下一層）"
          >
            <IndentIncrease className="h-3.5 w-3.5" />
          </Button>
        )}
        {onOutdent && !locked && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onOutdent(task.id)}
            className="shrink-0 h-6 w-6 text-muted-foreground/60 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-primary hover:bg-primary/10 transition-opacity"
            title={depth <= 1 ? '升階：把這個任務變成里程碑' : '升階：往上移一層（變成上層項目的同層）'}
          >
            <IndentDecrease className="h-3.5 w-3.5" />
          </Button>
        )}
        {canNestDeeper && !locked && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onToggleAddSubtask}
            className="shrink-0 h-6 w-6 text-muted-foreground/60 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-primary hover:bg-primary/10 transition-opacity"
            title="在這底下新增一個子項（多一層）"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* Duration — ADR-01: task is independent of subtasks (always editable) */}
      <div className="flex justify-center">
        <Input
          type="number"
          min={1}
          value={task.durationDays || ''}
          onChange={(e) => onUpdate(task.id, 'durationDays', Number(e.target.value) || 0)}
          disabled={locked}
          className="h-7 w-12 text-center text-sm border-0 bg-transparent focus-visible:ring-1 px-0"
        />
      </div>

      {/* Start date — ADR-01: always editable (absolute date) */}
      <div className="flex justify-center">
        {onDateChange ? (
          <DateInput
            value={startDate || ''}
            onCommit={(v) => onDateChange(task.id, 'startDate', v)}
            className="h-7 w-full text-center text-sm border-0 bg-transparent focus-visible:ring-1 px-1"
          />
        ) : (
          <span className="text-sm text-muted-foreground">{startDate || '—'}</span>
        )}
      </div>

      {/* End date — ADR-01: always editable; only guard end ≥ start */}
      <div className="flex justify-center items-center gap-0.5">
        {onDateChange ? (
          <DateInput
            value={endDate || ''}
            min={startDate || undefined}
            onCommit={(v) => onDateChange(task.id, 'endDate', v)}
            className={cn("h-7 w-full text-center text-sm border-0 bg-transparent focus-visible:ring-1 px-1", overflowInfo && "text-amber-700")}
          />
        ) : (
          <span className={cn("text-sm text-muted-foreground", overflowInfo && "text-amber-700")}>{endDate || '—'}</span>
        )}
        {overflowInfo && (
          <span
            className="shrink-0 cursor-help"
            title={`子任務結束日（${overflowInfo.childEnd}）超出任務結束日（${endDate}）${overflowInfo.overflowDays} 天`}
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
          <SelectContent className="max-h-[200px]">
            <SelectItem value=" ">未指派</SelectItem>
            {teamMembers.filter(m => m.name.trim()).map((m) => (
              <SelectItem key={m.id} value={m.name}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Priority (click to cycle)（鎖定時不可改） */}
      <div className="flex justify-center">
        <button
          type="button"
          onClick={locked ? undefined : cyclePriority}
          disabled={locked}
          className="transition-opacity"
        >
          <Badge
            variant="outline"
            className={cn(`text-[11px] px-1.5 py-0 ${p.className}`, locked ? "cursor-default opacity-70" : "cursor-pointer")}
          >
            {p.label}
          </Badge>
        </button>
      </div>

      {/* Remove（鎖定時隱藏） */}
      <div className="flex justify-center">
        {!locked && (
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
        )}
      </div>
    </div>
  )
}, (a, b) =>
  a.task === b.task && a.startDate === b.startDate && a.endDate === b.endDate &&
  a.teamMembers === b.teamMembers && a.subtaskCount === b.subtaskCount && a.collapsed === b.collapsed &&
  a.msIndex === b.msIndex && a.overflowInfo === b.overflowInfo &&
  a.onRemove === b.onRemove && a.onUpdate === b.onUpdate && a.onDateChange === b.onDateChange &&
  a.onIndent === b.onIndent && a.onOutdent === b.onOutdent && a.depth === b.depth && a.dropHint === b.dropHint &&
  a.locked === b.locked)

// ─── InlineTaskInput ────────────────────────────────────────
function InlineTaskInput({
  milestoneId,
  milestoneName,
  milestoneCompleted,
  teamMembers,
  msIndex,
  onAdd,
}: {
  milestoneId: string
  milestoneName?: string
  milestoneCompleted?: boolean
  teamMembers: TimelineTeamMember[]
  msIndex: number
  onAdd: (task: TimelineTask) => void
}) {
  const [title, setTitle] = useState('')
  const [durationDays, setDurationDays] = useState(1)
  const [assignee, setAssignee] = useState('')
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium')
  const [msPromptOpen, setMsPromptOpen] = useState(false)

  const doAdd = () => {
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

  const handleAdd = () => {
    if (!title.trim()) return
    // 新增任務到已完成(100%)的里程碑 → 先告知它將不再 100%（里程碑無指派人，僅提醒）
    if (milestoneCompleted) { setMsPromptOpen(true); return }
    doAdd()
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
    <>
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
            <SelectContent className="max-h-[200px]">
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
              className={`text-[11px] px-1.5 py-0 cursor-pointer opacity-60 hover:opacity-100 ${p.className}`}
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

    {/* 新增任務到已完成里程碑 → 告知它將不再 100%（里程碑無指派人，僅提醒） */}
    <AlertDialog open={msPromptOpen} onOpenChange={setMsPromptOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            里程碑{milestoneName ? `「${milestoneName}」` : ''}<span className="text-emerald-600">已完成</span>
          </AlertDialogTitle>
          <AlertDialogDescription>
            新增任務後，此里程碑將<span className="font-semibold text-foreground">不再是 100%</span>，會回到進行中。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction onClick={() => { setMsPromptOpen(false); doAdd() }}>
            知道了，繼續新增
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  )
}


// ─── InlineSubtaskInput ─────────────────────────────────────
function InlineSubtaskInput({
  parentTask,
  teamMembers,
  msIndex,
  onAdd,
  onReopenParent,
  onCancel,
}: {
  parentTask: TimelineTask
  teamMembers: TimelineTeamMember[]
  msIndex: number
  onAdd: (task: TimelineTask) => void
  onReopenParent?: (parentId: string) => void | Promise<void>
  onCancel: () => void
}) {
  const [title, setTitle] = useState('')
  const [assignee, setAssignee] = useState('')
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium')
  const [durationDays, setDurationDays] = useState(1)
  const [reopenPromptOpen, setReopenPromptOpen] = useState(false)

  const doAdd = () => {
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

  const handleAdd = () => {
    if (!title.trim()) return
    // 新增子任務到「已完成」父層 → 先問要不要解除父層完成（會通知父層負責人）
    if (parentTask.completed && onReopenParent) { setReopenPromptOpen(true); return }
    doAdd()
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
    <>
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
            <SelectContent className="max-h-[200px]">
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
              className={`text-[11px] px-1.5 py-0 cursor-pointer opacity-60 hover:opacity-100 ${p.className}`}
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

    {/* 新增子任務到已完成父層 → 選擇解除完成或維持完成 */}
    <AlertDialog open={reopenPromptOpen} onOpenChange={setReopenPromptOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            父任務「{parentTask.title}」<span className="text-emerald-600">已完成</span>
          </AlertDialogTitle>
          <AlertDialogDescription>
            在它底下新增子項目，會讓父任務<span className="font-semibold text-foreground">不再是 100%</span>。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-1.5 text-sm">
          <p><span className="font-semibold text-blue-600">解除完成</span>：標回未完成，並<span className="font-medium">通知父層負責人</span>。</p>
          <p><span className="font-semibold text-muted-foreground">維持完成</span>：照常新增，父層暫時維持完成。</p>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => { setReopenPromptOpen(false); doAdd() }}>維持完成，只新增</AlertDialogCancel>
          <AlertDialogAction onClick={async () => { setReopenPromptOpen(false); await onReopenParent?.(parentTask.id); doAdd() }}>
            解除完成並新增
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
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
  onTaskAdd,
  onReopenParent,
  onTaskRemove,
  onTaskUpdate,
  onTaskReorder,
  onTaskDateChange,
  onGanttPreview,
  onItemMove,
  onIndent,
  onOutdent,
  onMilestoneDemote,
  storageKey,
  locked = false,
}: TimelineTableProps) {
  const collapseStoreKey = storageKey ? `tl-collapse:${storageKey}` : null
  // Default = all milestones collapsed; a saved per-project state (localStorage)
  // overrides it. Seeded lazily so a stored state survives refresh.
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => {
    if (collapseStoreKey && typeof window !== 'undefined') {
      try {
        const saved = window.localStorage.getItem(collapseStoreKey)
        if (saved) return new Set<string>(JSON.parse(saved) as string[])
      } catch { /* ignore malformed */ }
    }
    return new Set<string>()
  })
  const didInitCollapse = useRef(false)

  // On first load with no saved state, default to all-collapsed (once milestones exist).
  useEffect(() => {
    if (didInitCollapse.current) return
    if (milestones.length === 0) return
    const hasSaved = collapseStoreKey && typeof window !== 'undefined'
      && window.localStorage.getItem(collapseStoreKey) !== null
    if (!hasSaved) setCollapsedIds(new Set(milestones.map((m) => m.id)))
    didInitCollapse.current = true
  }, [milestones, collapseStoreKey])

  // Persist collapse state per project after init.
  useEffect(() => {
    if (!didInitCollapse.current || !collapseStoreKey || typeof window === 'undefined') return
    try { window.localStorage.setItem(collapseStoreKey, JSON.stringify([...collapsedIds])) } catch { /* quota */ }
  }, [collapsedIds, collapseStoreKey])
  const [addingSubtaskForId, setAddingSubtaskForId] = useState<string | null>(null)
  const [dropHint, setDropHint] = useState<{ overId: string; mode: DropMode; activeIsMs: boolean } | null>(null)
  // Mirror of the last-shown drop hint — drop applies exactly what the badge showed (WYSIWYG)
  const dropHintRef = useRef<{ overId: string; mode: DropMode } | null>(null)


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
    // Small activation distance: distinguishes a click from a drag and avoids the
    // pointer getting "stuck" when grabbing the handle near inputs/buttons.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // Build flat list of sortable IDs in render order: [ms1, task1a, sub1a1, task1b, ms2, ...]
  // Subtasks are included (independently draggable); collapsed branches are skipped.
  const flatIds: string[] = []
  for (const ms of milestones) {
    flatIds.push(ms.id)
    if (collapsedIds.has(ms.id)) continue
    for (const t of tasks.filter((t) => t.milestoneId === ms.id && !t.parentId)) {
      flatIds.push(t.id)
      if (collapsedIds.has(t.id)) continue
      for (const st of tasks.filter((s) => s.parentId === t.id)) flatIds.push(st.id)
    }
  }

  // Determine drop position within the hovered row using the actual pointer
  // position (initial pointer + drag delta) — far more accurate than the dragged
  // element's box. Middle 70% = inside (nest), top/bottom 15% = before/after.
  // Wider "inside" band makes reparent-drag far easier to hit on short (~30px) rows.
  const computeMode = (event: DragEndEvent | DragOverEvent): DropMode => {
    const overRect = event.over?.rect
    if (!overRect || overRect.height === 0) return 'inside'
    const act = event.activatorEvent as PointerEvent | undefined
    let pointerY: number
    if (act && typeof act.clientY === 'number') {
      pointerY = act.clientY + event.delta.y
    } else {
      const r = event.active.rect.current.translated
      pointerY = r ? r.top + r.height / 2 : overRect.top + overRect.height / 2
    }
    const rel = (pointerY - overRect.top) / overRect.height
    // Milestone drags favour reordering (wide before/after edges); task drags favour
    // nesting (wide middle "inside" band). Keeps both operations easy to hit.
    const activeIsMs = milestones.some((m) => m.id === String(event.active.id))
    const [lo, hi] = activeIsMs ? [0.35, 0.65] : [0.15, 0.85]
    return rel < lo ? 'before' : rel > hi ? 'after' : 'inside'
  }

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) {
      if (dropHintRef.current) { setDropHint(null); dropHintRef.current = null }
      return
    }
    const overId = String(over.id)
    const mode = computeMode(event)
    // Skip redundant state updates — only re-render when the target/mode actually
    // changes, otherwise dragging over a long list re-renders every row constantly.
    const prev = dropHintRef.current
    if (prev && prev.overId === overId && prev.mode === mode) return
    const activeIsMs = milestones.some((m) => m.id === String(active.id))
    dropHintRef.current = { overId, mode }
    setDropHint({ overId, mode, activeIsMs })
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const hint = dropHintRef.current
    setDropHint(null)
    dropHintRef.current = null
    const { active, over } = event
    if (!over || active.id === over.id) return

    const activeId = String(active.id)
    const overId = String(over.id)
    // Apply exactly the hint last shown for this row; only recompute as a fallback.
    const mode: DropMode = hint && hint.overId === overId ? hint.mode : computeMode(event)

    // Tree move (reparent / convert) handled by parent when provided
    if (onItemMove) {
      onItemMove(activeId, overId, mode)
      return
    }

    // ── Fallback: same-level reorder only ──
    const isMilestoneDrag = milestones.some((m) => m.id === activeId)
    if (isMilestoneDrag) {
      const isMilestoneTarget = milestones.some((m) => m.id === overId)
      if (!isMilestoneTarget) return
      const oldIndex = milestones.findIndex((m) => m.id === activeId)
      const newIndex = milestones.findIndex((m) => m.id === overId)
      if (oldIndex !== -1 && newIndex !== -1) onMilestoneReorder(oldIndex, newIndex)
    } else {
      const draggedTask = tasks.find((t) => t.id === activeId)
      const targetTask = tasks.find((t) => t.id === overId)
      if (!draggedTask || !targetTask) return
      if (draggedTask.milestoneId !== targetTask.milestoneId) return
      const oldIndex = tasks.findIndex((t) => t.id === activeId)
      const newIndex = tasks.findIndex((t) => t.id === overId)
      if (oldIndex !== -1 && newIndex !== -1) onTaskReorder(oldIndex, newIndex)
    }
  }

  // ADR-02: recursively render a task and its descendants (up to MAX_TASK_DEPTH).
  const renderTaskTree = (task: TimelineTask, msIndex: number, depth: number) => {
    const children = tasks.filter((t) => t.parentId === task.id)
    const isCollapsed = collapsedIds.has(task.id)
    return (
      <div key={task.id}>
        <TaskRow
          task={task}
          depth={depth}
          startDate={taskDates.get(task.id)?.startDate}
          endDate={taskDates.get(task.id)?.endDate}
          teamMembers={teamMembers}
          subtaskCount={children.length}
          collapsed={isCollapsed}
          msIndex={msIndex}
          overflowInfo={overflows?.get(task.id)}
          dropHint={dropHint?.overId === task.id ? dropHint.mode : undefined}
          onRemove={onTaskRemove}
          onUpdate={onTaskUpdate}
          onToggleAddSubtask={() => setAddingSubtaskForId((prev) => (prev === task.id ? null : task.id))}
          onToggleCollapse={() => toggleCollapse(task.id)}
          onDateChange={locked ? undefined : onTaskDateChange}
          onIndent={onIndent}
          onOutdent={onOutdent}
          locked={locked}
        />
        {!isCollapsed && (
          <>
            {children.map((c) => renderTaskTree(c, msIndex, depth + 1))}
            {!locked && addingSubtaskForId === task.id && (
              <InlineSubtaskInput
                parentTask={task}
                teamMembers={teamMembers}
                msIndex={msIndex}
                onAdd={(subtask) => onTaskAdd(subtask)}
                onReopenParent={onReopenParent}
                onCancel={() => setAddingSubtaskForId(null)}
              />
            )}
          </>
        )}
      </div>
    )
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
        <DndContext sensors={sensors} collisionDetection={treeCollision} onDragOver={handleDragOver} onDragEnd={handleDragEnd} onDragCancel={() => { setDropHint(null); dropHintRef.current = null }}>
        <SortableContext items={flatIds} strategy={verticalListSortingStrategy}>
          {milestones.map((milestone, msIndex) => {
            const msParentTasks = tasks.filter((t) => t.milestoneId === milestone.id && !t.parentId)
            const isCollapsed = collapsedIds.has(milestone.id)
            return (
              <div key={milestone.id}>
                <MilestoneRow
                  milestone={milestone}
                  index={msIndex}
                  canRemove={milestones.length > 1}
                  collapsed={isCollapsed}
                  taskCount={msParentTasks.length}
                  overflowInfo={overflows?.get(milestone.id)}
                  dropHint={dropHint?.overId === milestone.id ? dropHint.mode : undefined}
                  dropBadge={dropHint?.overId === milestone.id && !(dropHint.activeIsMs && dropHint.mode !== 'inside') ? dropHint.mode : undefined}
                  onUpdate={onMilestoneUpdate}
                  onRemove={onMilestoneRemove}
                  onToggleCollapse={() => toggleCollapse(milestone.id)}
                  onDateChange={locked ? undefined : onMilestoneDateChange}
                  onDemote={onMilestoneDemote}
                  locked={locked}
                />
                {!isCollapsed && (
                  <>
                    {msParentTasks.map((task) => renderTaskTree(task, msIndex, 1))}
                    {!locked && <InlineTaskInput
                      milestoneId={milestone.id}
                      milestoneName={milestone.name}
                      milestoneCompleted={(() => { const mt = tasks.filter(t => t.milestoneId === milestone.id); return mt.length > 0 && mt.every(t => t.completed) })()}
                      teamMembers={teamMembers} msIndex={msIndex} onAdd={onTaskAdd} />}
                  </>
                )}
              </div>
            )
          })}
        </SortableContext>
      </DndContext>
      </div>

      {/* Add milestone（鎖定時隱藏） */}
      {!locked && (
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
      )}
    </div>
  )
}
