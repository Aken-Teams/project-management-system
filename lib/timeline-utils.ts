import type { TimelineMilestone, TimelineTask } from '@/components/timeline-table'

// ─── Minimal input shapes (accepts any object with required fields) ──

interface MilestoneInput {
  id: string
  durationDays: number
  startDate?: string
  endDate?: string
}

interface TaskInput {
  id: string
  milestoneId: string
  durationDays: number
  parentId?: string | null
  startDate?: string
}

// ─── Date helper ─────────────────────────────────────────────

export function daysBetween(start: string, end: string): number {
  const s = new Date(start)
  const e = new Date(end)
  return Math.round((e.getTime() - s.getTime()) / 86400000)
}

// ─── Milestone date calculation ──────────────────────────────
// Hybrid: milestones with explicit startDate use it (overlapping);
// milestones without startDate follow sequential/waterfall order.

export function calculateMilestoneDates<T extends MilestoneInput>(
  milestones: T[],
  projectStartDate: string,
  _tasks: TaskInput[],
): T[] {
  if (!projectStartDate) return milestones

  let sequentialDate = new Date(projectStartDate)

  return milestones.map((milestone) => {
    const effectiveDays = milestone.durationDays || 0

    if (effectiveDays <= 0) {
      return { ...milestone, startDate: undefined, endDate: undefined }
    }

    // Explicit startDate → overlapping; otherwise → sequential waterfall
    const msStart = milestone.startDate
      ? new Date(milestone.startDate)
      : new Date(sequentialDate)

    const endDate = new Date(msStart)
    endDate.setDate(endDate.getDate() + effectiveDays - 1)

    // Advance sequential cursor so the next milestone without startDate
    // follows after the latest end date seen so far
    const nextDay = new Date(endDate)
    nextDay.setDate(nextDay.getDate() + 1)
    if (nextDay > sequentialDate) {
      sequentialDate = nextDay
    }

    return {
      ...milestone,
      startDate: msStart.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
    }
  })
}

// ─── Shared: schedule tasks from milestone start ─────────────
// Hybrid: tasks with explicit startDate use it (overlapping);
// tasks without startDate follow sequential order within milestone.
// Same logic applies to subtasks within a parent task.

export interface ScheduledDate { startDate: Date; endDate: Date }

export function scheduleTasksFromStart(
  parentTasks: { id: string; durationDays: number; startDate?: string }[],
  allTasks: { id: string; durationDays: number; parentId?: string | null; startDate?: string }[],
  msStart: Date,
): Map<string, ScheduledDate> {
  const result = new Map<string, ScheduledDate>()
  let sequentialDate = new Date(msStart)

  for (const task of parentTasks) {
    const taskDays = Math.max(task.durationDays || 1, 1)
    const taskStart = task.startDate ? new Date(task.startDate) : new Date(sequentialDate)
    const taskEnd = new Date(taskStart)
    taskEnd.setDate(taskEnd.getDate() + taskDays - 1)
    result.set(task.id, { startDate: taskStart, endDate: taskEnd })

    // Schedule subtasks — hybrid sequential + overlapping
    const subtasks = allTasks.filter(t => t.parentId === task.id)
    let subSequential = new Date(taskStart)
    for (const sub of subtasks) {
      const subDays = Math.max(sub.durationDays || 1, 1)
      const subStart = sub.startDate ? new Date(sub.startDate) : new Date(subSequential)
      const subEnd = new Date(subStart)
      subEnd.setDate(subEnd.getDate() + subDays - 1)
      result.set(sub.id, { startDate: subStart, endDate: subEnd })

      const nextSubDay = new Date(subEnd)
      nextSubDay.setDate(nextSubDay.getDate() + 1)
      if (nextSubDay > subSequential) subSequential = nextSubDay
    }

    // Advance sequential cursor
    const nextDay = new Date(taskEnd)
    nextDay.setDate(nextDay.getDate() + 1)
    if (nextDay > sequentialDate) sequentialDate = nextDay
  }
  return result
}

// ─── Task date calculation ───────────────────────────────────
// Tasks use their own startDate; default to milestone start.

export function calculateTaskDates(
  tasks: TaskInput[],
  milestones: { id: string; startDate?: string; endDate?: string }[],
): Map<string, { startDate: string; endDate: string }> {
  const result = new Map<string, { startDate: string; endDate: string }>()

  for (const ms of milestones) {
    if (!ms.startDate) continue
    const msTasks = tasks.filter(t => t.milestoneId === ms.id && t.durationDays > 0 && !t.parentId)
    const msStartDate = new Date(ms.startDate)

    const scheduled = scheduleTasksFromStart(msTasks, tasks, msStartDate)
    for (const [id, dates] of scheduled) {
      result.set(id, {
        startDate: dates.startDate.toISOString().split('T')[0],
        endDate: dates.endDate.toISOString().split('T')[0],
      })
    }
  }
  return result
}

// ─── Auto-resize milestones to contain all tasks ─────────────
// With overlapping tasks, milestone must span from its start to
// the latest task end. Duration = max task end offset from ms start.

export function autoExpandMilestones<T extends MilestoneInput>(
  milestones: T[],
  tasks: TaskInput[],
  projectStartDate?: string,
): { milestones: T[]; changed: boolean } {
  if (!projectStartDate) return { milestones, changed: false }

  let changed = false

  // Compute sequential milestone start dates (mirrors calculateMilestoneDates)
  let sequentialDate = new Date(projectStartDate)
  const msStartMap = new Map<string, string>()
  for (const ms of milestones) {
    const effectiveDays = ms.durationDays || 0
    if (effectiveDays <= 0) continue
    const msStart = ms.startDate
      ? new Date(ms.startDate)
      : new Date(sequentialDate)
    msStartMap.set(ms.id, msStart.toISOString().split('T')[0])
    const endDate = new Date(msStart)
    endDate.setDate(endDate.getDate() + effectiveDays - 1)
    const nextDay = new Date(endDate)
    nextDay.setDate(nextDay.getDate() + 1)
    if (nextDay > sequentialDate) sequentialDate = nextDay
  }

  const updated = milestones.map((ms) => {
    const msStartStr = msStartMap.get(ms.id)
    if (!msStartStr) return ms
    const msTasks = tasks.filter(t => t.milestoneId === ms.id && !t.parentId)
    if (msTasks.length === 0) return ms

    let maxEndOffset = 0
    for (const t of msTasks) {
      let offsetDays = 0
      if (t.startDate) {
        offsetDays = Math.max(0, daysBetween(msStartStr, t.startDate))
      }
      const endOffset = offsetDays + (t.durationDays || 1)
      maxEndOffset = Math.max(maxEndOffset, endOffset)
    }

    if (maxEndOffset > 0 && maxEndOffset > (ms.durationDays || 0)) {
      changed = true
      return { ...ms, durationDays: maxEndOffset }
    }
    return ms
  })
  return { milestones: updated, changed }
}

// ─── DB → TimelineTable format conversion ────────────────────

interface DbMilestone {
  id: string
  name: string
  startDate?: string | null
  dueDate: string
  status: string
  progress: number
}

interface DbTask {
  id: string
  milestoneId: string
  title: string
  assignee: string
  priority: string
  durationDays: number
  startDate: string
  endDate: string
  parentId?: string | null
}

export function dbToTimelineState(
  dbMilestones: DbMilestone[],
  dbTasks: DbTask[],
  projectStartDate: string,
): {
  milestones: TimelineMilestone[]
  tasks: TimelineTask[]
} {
  const milestones: TimelineMilestone[] = dbMilestones.map((ms, index) => {
    let msStart: Date
    if (ms.startDate) {
      // New overlapping model: milestone has its own startDate
      msStart = new Date(ms.startDate)
    } else {
      // Legacy waterfall: infer from previous milestone or project start
      msStart = index === 0
        ? new Date(projectStartDate)
        : (() => {
            const prevDue = new Date(dbMilestones[index - 1].dueDate)
            prevDue.setDate(prevDue.getDate() + 1)
            return prevDue
          })()
    }

    const msEnd = new Date(ms.dueDate)
    const dateSpanDays = Math.max(1, Math.ceil((msEnd.getTime() - msStart.getTime()) / (1000 * 60 * 60 * 24)) + 1)

    // Use actual date span, but ensure tasks fit
    const msTasks = dbTasks.filter(t => t.milestoneId === ms.id && !t.parentId)
    const taskSumDays = msTasks.reduce((sum, t) => sum + (t.durationDays || 0), 0)

    const durationDays = Math.max(dateSpanDays, taskSumDays, 1)

    return {
      id: ms.id,
      name: ms.name,
      durationDays,
      // Carry the explicit startDate so overlapping is preserved
      ...(ms.startDate ? { startDate: new Date(ms.startDate).toISOString().split('T')[0] } : {}),
    }
  })

  const tasks: TimelineTask[] = dbTasks.map(t => ({
    id: t.id,
    milestoneId: t.milestoneId,
    title: t.title,
    assignee: t.assignee,
    priority: t.priority as 'low' | 'medium' | 'high',
    durationDays: t.durationDays || 1,
    ...(t.parentId ? { parentId: t.parentId } : {}),
    // Carry explicit startDate for overlapping tasks
    ...(t.startDate ? { startDate: new Date(t.startDate).toISOString().split('T')[0] } : {}),
  }))

  return { milestones, tasks }
}

// ─── Diff computation for batch save ─────────────────────────

export interface WorkItemsDiff {
  milestonesToAdd: { name: string; dueDate: string; startDate?: string; sortOrder: number }[]
  milestonesToUpdate: { id: string; name?: string; dueDate?: string; startDate?: string; sortOrder?: number }[]
  milestonesToDelete: string[]
  tasksToAdd: {
    tempId: string
    milestoneId: string
    title: string
    assignee?: string
    priority: string
    durationDays: number
    startDate: string
    endDate: string
    parentId?: string
  }[]
  tasksToUpdate: {
    id: string
    title?: string
    assignee?: string
    priority?: string
    durationDays?: number
    startDate?: string
    endDate?: string
    milestoneId?: string
    sortOrder?: number
  }[]
  tasksToDelete: string[]
  projectEndDate?: string
}

export function computeWorkItemsDiff(
  origMilestones: { id: string; name: string; dueDate: string; startDate?: string | null }[],
  origTasks: DbTask[],
  currentMilestones: TimelineMilestone[],
  currentTasks: TimelineTask[],
  taskDates: Map<string, { startDate: string; endDate: string }>,
): WorkItemsDiff {
  const origMsIds = new Set(origMilestones.map(m => m.id))
  const currentMsIds = new Set(currentMilestones.map(m => m.id))
  const origTaskIds = new Set(origTasks.map(t => t.id))
  const currentTaskIds = new Set(currentTasks.map(t => t.id))

  // Milestones to delete
  const milestonesToDelete = origMilestones
    .filter(m => !currentMsIds.has(m.id))
    .map(m => m.id)

  // Milestones to add (draft IDs)
  const milestonesToAdd = currentMilestones
    .filter(m => !origMsIds.has(m.id))
    .map(m => ({
      name: m.name,
      dueDate: m.endDate || '',
      startDate: m.startDate,
      sortOrder: currentMilestones.indexOf(m),
    }))

  // Milestones to update
  const milestonesToUpdate: WorkItemsDiff['milestonesToUpdate'] = []
  currentMilestones.forEach((m, idx) => {
    if (!origMsIds.has(m.id)) return
    const orig = origMilestones.find(o => o.id === m.id)!
    const changes: Record<string, unknown> = { id: m.id }
    let hasChange = false
    if (m.name !== orig.name) { changes.name = m.name; hasChange = true }
    if (m.endDate && m.endDate !== orig.dueDate) { changes.dueDate = m.endDate; hasChange = true }
    // Track startDate changes
    const origStart = orig.startDate || undefined
    if (m.startDate !== origStart) { changes.startDate = m.startDate || null; hasChange = true }
    const origIdx = origMilestones.findIndex(o => o.id === m.id)
    if (idx !== origIdx) { changes.sortOrder = idx; hasChange = true }
    if (hasChange) milestonesToUpdate.push(changes as WorkItemsDiff['milestonesToUpdate'][number])
  })

  // Tasks to delete
  const tasksToDelete = origTasks
    .filter(t => !currentTaskIds.has(t.id))
    .map(t => t.id)

  // Tasks to add (parent tasks first, then subtasks — so parent IDs resolve correctly)
  const newParentTasks = currentTasks.filter(t => !origTaskIds.has(t.id) && !t.parentId)
  const newSubtasks = currentTasks.filter(t => !origTaskIds.has(t.id) && t.parentId)
  const tasksToAdd = [...newParentTasks, ...newSubtasks]
    .map(t => {
      const dates = taskDates.get(t.id)
      return {
        tempId: t.id,
        milestoneId: t.milestoneId,
        title: t.title,
        assignee: t.assignee || undefined,
        priority: t.priority,
        durationDays: t.durationDays,
        startDate: dates?.startDate || '',
        endDate: dates?.endDate || '',
        ...(t.parentId ? { parentId: t.parentId } : {}),
      }
    })

  // Tasks to update
  const tasksToUpdate: WorkItemsDiff['tasksToUpdate'] = []
  currentTasks.forEach(t => {
    if (!origTaskIds.has(t.id)) return
    const orig = origTasks.find(o => o.id === t.id)!
    const dates = taskDates.get(t.id)
    const changes: Record<string, unknown> = { id: t.id }
    let hasChange = false
    if (t.title !== orig.title) { changes.title = t.title; hasChange = true }
    if ((t.assignee || '') !== (orig.assignee || '')) { changes.assignee = t.assignee; hasChange = true }
    if (t.priority !== orig.priority) { changes.priority = t.priority; hasChange = true }
    if (t.durationDays !== orig.durationDays) { changes.durationDays = t.durationDays; hasChange = true }
    if (dates?.startDate && dates.startDate !== orig.startDate) { changes.startDate = dates.startDate; hasChange = true }
    if (dates?.endDate && dates.endDate !== orig.endDate) { changes.endDate = dates.endDate; hasChange = true }
    if (t.milestoneId !== orig.milestoneId) { changes.milestoneId = t.milestoneId; hasChange = true }
    // sortOrder: position within milestone
    const tasksInMs = currentTasks.filter(ct => ct.milestoneId === t.milestoneId)
    const newSort = tasksInMs.indexOf(t)
    changes.sortOrder = newSort
    if (hasChange) tasksToUpdate.push(changes as WorkItemsDiff['tasksToUpdate'][number])
  })

  // Project end date = latest milestone end date
  const allEndDates = currentMilestones
    .filter(m => m.endDate && m.durationDays > 0)
    .map(m => m.endDate!)
  const projectEndDate = allEndDates.length > 0
    ? allEndDates.sort().pop()
    : undefined

  return {
    milestonesToAdd,
    milestonesToUpdate,
    milestonesToDelete,
    tasksToAdd,
    tasksToUpdate,
    tasksToDelete,
    projectEndDate,
  }
}
