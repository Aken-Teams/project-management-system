import type { TimelineMilestone, TimelineTask } from '@/components/timeline-table'

// ─── Minimal input shapes (accepts any object with required fields) ──

interface MilestoneInput {
  id: string
  durationWeeks: number
  startDate?: string
  endDate?: string
}

interface TaskInput {
  id: string
  milestoneId: string
  durationWeeks: number
  parentId?: string | null
}

// ─── Milestone date calculation ──────────────────────────────
// Sequential scheduling: each milestone starts where previous ends.
// effectiveWeeks = max(milestone.durationWeeks, sum of task durationWeeks)

export function calculateMilestoneDates<T extends MilestoneInput>(
  milestones: T[],
  projectStartDate: string,
  tasks: TaskInput[],
): T[] {
  if (!projectStartDate) return milestones

  let currentDate = new Date(projectStartDate)

  return milestones.map((milestone) => {
    const totalTaskWeeks = tasks
      .filter(t => t.milestoneId === milestone.id && !t.parentId)
      .reduce((sum, t) => sum + (t.durationWeeks || 0), 0)

    const effectiveWeeks = Math.max(milestone.durationWeeks || 0, totalTaskWeeks)

    if (effectiveWeeks <= 0) {
      return { ...milestone, startDate: undefined, endDate: undefined }
    }

    const startDate = new Date(currentDate)
    const daysToAdd = effectiveWeeks * 7 - 1
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

// ─── Task date calculation ───────────────────────────────────
// Tasks scheduled sequentially within their milestone's date range.

export function calculateTaskDates(
  tasks: TaskInput[],
  milestones: { id: string; startDate?: string }[],
): Map<string, { startDate: string; endDate: string }> {
  const result = new Map<string, { startDate: string; endDate: string }>()

  for (const ms of milestones) {
    if (!ms.startDate) continue
    // Only schedule parent tasks sequentially; subtasks inherit parent dates
    const msTasks = tasks.filter(t => t.milestoneId === ms.id && t.durationWeeks > 0 && !t.parentId)
    let currentDate = new Date(ms.startDate)

    for (const task of msTasks) {
      const taskStart = new Date(currentDate)
      const daysToAdd = task.durationWeeks * 7 - 1
      const taskEnd = new Date(currentDate)
      taskEnd.setDate(taskEnd.getDate() + daysToAdd)

      const dates = {
        startDate: taskStart.toISOString().split('T')[0],
        endDate: taskEnd.toISOString().split('T')[0],
      }
      result.set(task.id, dates)

      // Subtasks inherit parent's date range
      for (const sub of tasks.filter(t => t.parentId === task.id)) {
        result.set(sub.id, dates)
      }

      currentDate = new Date(taskEnd)
      currentDate.setDate(currentDate.getDate() + 1)
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
    const totalTaskWeeks = tasks
      .filter(t => t.milestoneId === ms.id && !t.parentId)
      .reduce((sum, t) => sum + (t.durationWeeks || 0), 0)
    // When tasks exist, keep durationWeeks in sync with task total
    // (both expand and shrink). When no tasks, leave duration as-is.
    if (totalTaskWeeks > 0 && totalTaskWeeks !== (ms.durationWeeks || 0)) {
      changed = true
      return { ...ms, durationWeeks: totalTaskWeeks }
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
  durationWeeks: number
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
    const msTasks = dbTasks.filter(t => t.milestoneId === ms.id && !t.parentId)
    const taskSumWeeks = msTasks.reduce((sum, t) => sum + (t.durationWeeks || 0), 0)

    let durationWeeks: number
    if (taskSumWeeks > 0) {
      durationWeeks = taskSumWeeks
    } else {
      // Calculate from date range
      const msStart = index === 0
        ? new Date(projectStartDate)
        : (() => {
            const prevDue = new Date(dbMilestones[index - 1].dueDate)
            prevDue.setDate(prevDue.getDate() + 1)
            return prevDue
          })()
      const msEnd = new Date(ms.dueDate)
      const diffDays = Math.max(0, Math.ceil((msEnd.getTime() - msStart.getTime()) / (1000 * 60 * 60 * 24))) + 1
      durationWeeks = Math.max(1, Math.ceil(diffDays / 7))
    }

    return { id: ms.id, name: ms.name, durationWeeks }
  })

  const tasks: TimelineTask[] = dbTasks.map(t => ({
    id: t.id,
    milestoneId: t.milestoneId,
    title: t.title,
    assignee: t.assignee,
    priority: t.priority as 'low' | 'medium' | 'high',
    durationWeeks: t.durationWeeks || 1,
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
    durationWeeks: number
    startDate: string
    endDate: string
    parentId?: string
  }[]
  tasksToUpdate: {
    id: string
    title?: string
    assignee?: string
    priority?: string
    durationWeeks?: number
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
        durationWeeks: t.durationWeeks,
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
    if (t.durationWeeks !== orig.durationWeeks) { changes.durationWeeks = t.durationWeeks; hasChange = true }
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
  const lastMs = [...currentMilestones].reverse().find(m => m.endDate && m.durationWeeks > 0)

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
