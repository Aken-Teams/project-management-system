'use client'

import { useState } from 'react'
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
import { GripVertical, Plus, Trash2, X, ChevronRight, ChevronDown, ChevronsUpDown } from 'lucide-react'
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
  durationWeeks: number
  startDate?: string
  endDate?: string
}

export interface TimelineTask {
  id: string
  milestoneId: string
  title: string
  assignee: string
  priority: 'low' | 'medium' | 'high'
  durationWeeks: number
}

export interface TimelineTeamMember {
  id: string
  name: string
  role: string
  responsibility: string
}

export interface TimelineTableProps {
  milestones: TimelineMilestone[]
  tasks: TimelineTask[]
  taskDates: Map<string, { startDate: string; endDate: string }>
  teamMembers: TimelineTeamMember[]
  onMilestoneUpdate: (index: number, field: 'name' | 'durationWeeks', value: string | number) => void
  onMilestoneRemove: (index: number) => void
  onMilestoneAdd: () => void
  onMilestoneReorder: (oldIndex: number, newIndex: number) => void
  onTaskAdd: (task: TimelineTask) => void
  onTaskRemove: (taskId: string) => void
  onTaskUpdate: (taskId: string, field: keyof TimelineTask, value: string | number) => void
  onTaskReorder: (oldIndex: number, newIndex: number) => void
}

// ─── Column grid class (shared across all rows) ─────────────
const GRID_COLS = 'grid grid-cols-[28px_1fr_72px_100px_100px_88px_52px_28px] gap-0 items-center'

// ─── MilestoneRow ───────────────────────────────────────────
function MilestoneRow({
  milestone,
  index,
  canRemove,
  collapsed,
  taskCount,
  onUpdate,
  onRemove,
  onToggleCollapse,
}: {
  milestone: TimelineMilestone
  index: number
  canRemove: boolean
  collapsed: boolean
  taskCount: number
  onUpdate: (index: number, field: 'name' | 'durationWeeks', value: string | number) => void
  onRemove: (index: number) => void
  onToggleCollapse: () => void
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
      className={`${GRID_COLS} px-2 py-1.5 bg-muted/40 border-t first:border-t-0 font-medium`}
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
      </div>

      {/* Duration */}
      <div className="flex justify-center">
        <Input
          type="number"
          min={0}
          value={milestone.durationWeeks || ''}
          onChange={(e) => onUpdate(index, 'durationWeeks', Number(e.target.value) || 0)}
          className="h-8 w-14 text-center text-sm border-0 bg-transparent focus-visible:ring-1 px-0"
        />
      </div>

      {/* Start date */}
      <div className="text-center text-sm text-muted-foreground">
        {milestone.startDate || '—'}
      </div>

      {/* End date */}
      <div className="text-center text-sm text-muted-foreground">
        {milestone.endDate || '—'}
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
  onRemove,
  onUpdate,
}: {
  task: TimelineTask
  startDate?: string
  endDate?: string
  teamMembers: TimelineTeamMember[]
  onRemove: (id: string) => void
  onUpdate: (id: string, field: keyof TimelineTask, value: string | number) => void
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${GRID_COLS} px-2 py-1 hover:bg-muted/20 transition-colors text-sm`}
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
        <span className="text-muted-foreground/30 text-sm select-none">└</span>
        <span className="truncate">{task.title}</span>
      </div>

      {/* Duration */}
      <div className="flex justify-center">
        <Input
          type="number"
          min={1}
          value={task.durationWeeks || ''}
          onChange={(e) => onUpdate(task.id, 'durationWeeks', Number(e.target.value) || 0)}
          className="h-7 w-12 text-center text-sm border-0 bg-transparent focus-visible:ring-1 px-0"
        />
      </div>

      {/* Start date */}
      <div className="text-center text-sm text-muted-foreground">
        {startDate || '—'}
      </div>

      {/* End date */}
      <div className="text-center text-sm text-muted-foreground">
        {endDate || '—'}
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
            {teamMembers.map((m) => (
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
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
    </div>
  )
}

// ─── InlineTaskInput ────────────────────────────────────────
function InlineTaskInput({
  milestoneId,
  teamMembers,
  onAdd,
}: {
  milestoneId: string
  teamMembers: TimelineTeamMember[]
  onAdd: (task: TimelineTask) => void
}) {
  const [title, setTitle] = useState('')
  const [durationWeeks, setDurationWeeks] = useState(1)
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
      durationWeeks,
    })
    setTitle('')
    setDurationWeeks(1)
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
    <div className={`${GRID_COLS} px-2 py-0.5`}>
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
            value={durationWeeks}
            onChange={(e) => setDurationWeeks(Number(e.target.value) || 1)}
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

// ─── TimelineTable (main export) ────────────────────────────
export function TimelineTable({
  milestones,
  tasks,
  taskDates,
  teamMembers,
  onMilestoneUpdate,
  onMilestoneRemove,
  onMilestoneAdd,
  onMilestoneReorder,
  onTaskAdd,
  onTaskRemove,
  onTaskUpdate,
  onTaskReorder,
}: TimelineTableProps) {
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set())

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
  const flatIds: string[] = []
  for (const ms of milestones) {
    flatIds.push(ms.id)
    for (const t of tasks.filter((t) => t.milestoneId === ms.id)) {
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
      {/* Toolbar: expand/collapse all */}
      <div className="flex items-center justify-end px-3 py-2 bg-muted/30 border-b">
        <button
          type="button"
          onClick={toggleAll}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronsUpDown className="h-4 w-4" />
          {allCollapsed ? '全部展開' : '全部收合'}
        </button>
      </div>

      {/* Header */}
      <div
        className={`${GRID_COLS} px-2 py-2.5 bg-muted/60 border-b text-sm font-medium text-muted-foreground tracking-wide`}
      >
        <span />
        <span className="pl-1.5">名稱</span>
        <span className="text-center">期程(週)</span>
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
            const msTasks = tasks.filter((t) => t.milestoneId === milestone.id)
            const isCollapsed = collapsedIds.has(milestone.id)
            return (
              <div key={milestone.id}>
                <MilestoneRow
                  milestone={milestone}
                  index={msIndex}
                  canRemove={milestones.length > 1}
                  collapsed={isCollapsed}
                  taskCount={msTasks.length}
                  onUpdate={onMilestoneUpdate}
                  onRemove={onMilestoneRemove}
                  onToggleCollapse={() => toggleCollapse(milestone.id)}
                />
                {!isCollapsed && (
                  <>
                    {msTasks.map((task) => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        startDate={taskDates.get(task.id)?.startDate}
                        endDate={taskDates.get(task.id)?.endDate}
                        teamMembers={teamMembers}
                        onRemove={onTaskRemove}
                        onUpdate={onTaskUpdate}
                      />
                    ))}
                    <InlineTaskInput milestoneId={milestone.id} teamMembers={teamMembers} onAdd={onTaskAdd} />
                  </>
                )}
              </div>
            )
          })}
        </SortableContext>
      </DndContext>

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
