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
}

// ─── Date helper ─────────────────────────────────────────────

export function daysBetween(start: string, end: string): number {
  const s = new Date(start)
  const e = new Date(end)
  return Math.round((e.getTime() - s.getTime()) / 86400000)
}

// ─── Milestone date calculation ──────────────────────────────
// Sequential scheduling: each milestone starts where previous ends.
// effectiveDays = max(milestone.durationDays, sum of task durationDays)

export function calculateMilestoneDates<T extends MilestoneInput>(
  milestones: T[],
  projectStartDate: string,
  tasks: TaskInput[],
): T[] {
  if (!projectStartDate) return milestones

  let currentDate = new Date(projectStartDate)

  return milestones.map((milestone) => {
    const totalTaskDays = tasks
      .filter(t => t.milestoneId === milestone.id && !t.parentId)
      .reduce((sum, t) => sum + (t.durationDays || 0), 0)

    const effectiveDays = Math.max(milestone.durationDays || 0, totalTaskDays)

    if (effectiveDays <= 0) {
      return { ...milestone, startDate: undefined, endDate: undefined }
    }

    const startDate = new Date(currentDate)
    const daysToAdd = effectiveDays - 1
    const endDate = new Date(currentDate)
    endDate.setDate(endDate.getDate() + daysToAdd)

    currentDate = new Date(endDate)
    currentDate.setDate(currentDate.getDate() + 1)

    return {
      ...milestone,
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
    }
  })
}

// ─── Shared: schedule tasks sequentially from a start date ───
// Used by calculateTaskDates (frontend), delay cascade (backend),
// and date-repair (project load). Keeps all three in sync.

export interface ScheduledDate { startDate: Date; endDate: Date }

export function scheduleTasksFromStart(
  parentTasks: { id: string; durationDays: number }[],
  allTasks: { id: string; durationDays: number; parentId?: string | null }[],
  msStart: Date,
): Map<string, ScheduledDate> {
  const result = new Map<string, ScheduledDate>()
  let currentDate = new Date(msStart)

  for (const task of parentTasks) {
    const taskDays = Math.max(task.durationDays || 1, 1)
    const taskStart = new Date(currentDate)
    const taskEnd = new Date(currentDate)
    taskEnd.setDate(taskEnd.getDate() + taskDays - 1)
    result.set(task.id, { startDate: taskStart, endDate: taskEnd })

    // Schedule subtasks sequentially within parent's date range
    const subtasks = allTasks.filter(t => t.parentId === task.id)
    if (subtasks.length > 0) {
      let subCurrent = new Date(taskStart)
      for (const sub of subtasks) {
        const subDays = Math.max(sub.durationDays || 1, 1)
        const subStart = new Date(subCurrent)
        const subEnd = new Date(subCurrent)
        subEnd.setDate(subEnd.getDate() + subDays - 1)
        result.set(sub.id, { startDate: subStart, endDate: subEnd })
        subCurrent = new Date(subEnd)
        subCurrent.setDate(subCurrent.getDate() + 1)
      }
    }

    currentDate = new Date(taskEnd)
    currentDate.setDate(currentDate.getDate() + 1)
  }
  return result
}

// ─── Task date calculation ───────────────────────────────────
// Tasks scheduled sequentially from milestone start (matches cascade behavior).

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

// ─── Auto-resize milestones to match task duration ───────────
// Expands when tasks exceed milestone duration, AND shrinks when
// tasks are removed so milestone duration matches actual task sum.

export function autoExpandMilestones<T extends MilestoneInput>(
  milestones: T[],
  tasks: TaskInput[],
): { milestones: T[]; changed: boolean } {
  let changed = false
  const updated = milestones.map((ms) => {
    const totalTaskDays = tasks
      .filter(t => t.milestoneId === ms.id && !t.parentId)
      .reduce((sum, t) => sum + (t.durationDays || 0), 0)
    // Only EXPAND when tasks exceed milestone duration.
    // Never shrink — this preserves delay gaps (milestone span > task sum).
    if (totalTaskDays > 0 && totalTaskDays > (ms.durationDays || 0)) {
      changed = true
      return { ...ms, durationDays: totalTaskDays }
    }
    return ms
  })
  return { milestones: updated, changed }
}

// ─── DB → TimelineTable format conversion ────────────────────

interface DbMilestone {
  id: string
  name: string
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
    // Always compute from actual date range (preserves delay gaps)
    const msStart = index === 0
      ? new Date(projectStartDate)
      : (() => {
          const prevDue = new Date(dbMilestones[index - 1].dueDate)
          prevDue.setDate(prevDue.getDate() + 1)
          return prevDue
        })()
    const msEnd = new Date(ms.dueDate)
    const dateSpanDays = Math.max(1, Math.ceil((msEnd.getTime() - msStart.getTime()) / (1000 * 60 * 60 * 24)) + 1)

    // Use actual date span, but ensure tasks fit
    const msTasks = dbTasks.filter(t => t.milestoneId === ms.id && !t.parentId)
    const taskSumDays = msTasks.reduce((sum, t) => sum + (t.durationDays || 0), 0)

    const durationDays = Math.max(dateSpanDays, taskSumDays, 1)

    return { id: ms.id, name: ms.name, durationDays }
  })

  const tasks: TimelineTask[] = dbTasks.map(t => ({
    id: t.id,
    milestoneId: t.milestoneId,
    title: t.title,
    assignee: t.assignee,
    priority: t.priority as 'low' | 'medium' | 'high',
    durationDays: t.durationDays || 1,
    ...(t.parentId ? { parentId: t.parentId } : {}),
  }))

  return { milestones, tasks }
}

// ─── Diff computation for batch save ─────────────────────────

export interface WorkItemsDiff {
  milestonesToAdd: { name: string; dueDate: string; sortOrder: number }[]
  milestonesToUpdate: { id: string; name?: string; dueDate?: string; sortOrder?: number }[]
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
  origMilestones: { id: string; name: string; dueDate: string }[],
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

  // Project end date = last milestone with content
  const lastMs = [...currentMilestones].reverse().find(m => m.endDate && m.durationDays > 0)

  return {
    milestonesToAdd,
    milestonesToUpdate,
    milestonesToDelete,
    tasksToAdd,
    tasksToUpdate,
    tasksToDelete,
    projectEndDate: lastMs?.endDate,
  }
}
