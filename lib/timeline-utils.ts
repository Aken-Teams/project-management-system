import type { TimelineMilestone, TimelineTask } from '@/components/timeline-table'

// ─── Minimal input shapes (accepts any object with required fields) ──

interface MilestoneInput {
  id: string
  durationDays: number
  startDate?: string
  endDate?: string
  manualDates?: boolean
}

interface TaskInput {
  id: string
  milestoneId: string
  durationDays: number
  parentId?: string | null
  startDate?: string
  manualDates?: boolean
}

// ─── Date helper ─────────────────────────────────────────────

export function daysBetween(start: string, end: string): number {
  const s = new Date(start)
  const e = new Date(end)
  return Math.round((e.getTime() - s.getTime()) / 86400000)
}

// ─── Milestone date calculation ──────────────────────────────
// Hybrid seed: milestones with explicit startDate use it (overlapping);
// milestones without startDate follow sequential/waterfall order.
//
// 方案 A（嚴格層級綁定）: a milestone that HAS tasks does not keep an
// independent range — its start/end are derived as the envelope of its
// tasks (earliest task start ～ latest task end). The seed start only
// anchors where undated tasks fall in sequence and where the next
// sequential (startDate-less) milestone begins.

export function calculateMilestoneDates<T extends MilestoneInput>(
  milestones: T[],
  projectStartDate: string,
  tasks: TaskInput[],
): T[] {
  if (!projectStartDate) return milestones

  let sequentialDate = new Date(projectStartDate)

  return milestones.map((milestone) => {
    const effectiveDays = milestone.durationDays || 0

    if (effectiveDays <= 0) {
      return { ...milestone, startDate: undefined, endDate: undefined }
    }

    // Seed: explicit startDate → overlapping; otherwise → sequential waterfall
    const seedStart = milestone.startDate
      ? new Date(milestone.startDate)
      : new Date(sequentialDate)

    let msStart = seedStart
    let msEnd = new Date(seedStart)
    msEnd.setDate(msEnd.getDate() + effectiveDays - 1)

    // 方案 A: milestone with tasks spans exactly its tasks' envelope
    // (earliest task start ～ latest task end).
    const msTopTasks = tasks.filter(t => t.milestoneId === milestone.id && !t.parentId)
    if (msTopTasks.length > 0) {
      const scheduled = scheduleTasksFromStart(msTopTasks, tasks, seedStart)
      let minStart: Date | null = null
      let maxEnd: Date | null = null
      for (const t of msTopTasks) {
        const d = scheduled.get(t.id)
        if (!d) continue
        if (!minStart || d.startDate < minStart) minStart = d.startDate
        if (!maxEnd || d.endDate > maxEnd) maxEnd = d.endDate
      }
      // Auto → snap to envelope. Manual → keep the user's own (widened) range,
      // but always at least the tasks' envelope (never narrower than children).
      if (minStart && maxEnd) {
        if (milestone.manualDates) {
          if (minStart < msStart) msStart = minStart
          if (maxEnd > msEnd) msEnd = maxEnd
        } else {
          msStart = minStart
          msEnd = maxEnd
        }
      }
    }

    // Advance sequential cursor so the next milestone without startDate
    // follows after the latest (envelope) end date seen so far
    const nextDay = new Date(msEnd)
    nextDay.setDate(nextDay.getDate() + 1)
    if (nextDay > sequentialDate) {
      sequentialDate = nextDay
    }

    return {
      ...milestone,
      startDate: msStart.toISOString().split('T')[0],
      endDate: msEnd.toISOString().split('T')[0],
    }
  })
}

// ─── Shared: schedule tasks from milestone start ─────────────
// Hybrid: tasks with explicit startDate use it (overlapping);
// tasks without startDate follow sequential order within milestone.
// Same logic applies to subtasks within a parent task.
//
// 方案 A（嚴格層級綁定）: a task that HAS subtasks does not keep an
// independent range — its start/end are derived as the envelope of its
// subtasks (earliest subtask start ～ latest subtask end). The task's own
// startDate/durationDays only seed where undated subtasks fall in sequence.

export interface ScheduledDate { startDate: Date; endDate: Date }

export function scheduleTasksFromStart(
  parentTasks: { id: string; durationDays: number; startDate?: string; manualDates?: boolean }[],
  allTasks: { id: string; durationDays: number; parentId?: string | null; startDate?: string }[],
  msStart: Date,
): Map<string, ScheduledDate> {
  const result = new Map<string, ScheduledDate>()
  let sequentialDate = new Date(msStart)

  for (const task of parentTasks) {
    const taskDays = Math.max(task.durationDays || 1, 1)
    const taskStart = task.startDate ? new Date(task.startDate) : new Date(sequentialDate)
    let effectiveStart = taskStart
    let effectiveEnd = new Date(taskStart)
    effectiveEnd.setDate(effectiveEnd.getDate() + taskDays - 1)

    // Schedule subtasks first — hybrid sequential + overlapping — while
    // tracking the envelope (earliest start ～ latest end) across them.
    const subtasks = allTasks.filter(t => t.parentId === task.id)
    let subSequential = new Date(taskStart)
    let minSubStart: Date | null = null
    let maxSubEnd: Date | null = null
    for (const sub of subtasks) {
      const subDays = Math.max(sub.durationDays || 1, 1)
      const subStart = sub.startDate ? new Date(sub.startDate) : new Date(subSequential)
      const subEnd = new Date(subStart)
      subEnd.setDate(subEnd.getDate() + subDays - 1)
      result.set(sub.id, { startDate: subStart, endDate: subEnd })

      if (!minSubStart || subStart < minSubStart) minSubStart = subStart
      if (!maxSubEnd || subEnd > maxSubEnd) maxSubEnd = subEnd

      const nextSubDay = new Date(subEnd)
      nextSubDay.setDate(nextSubDay.getDate() + 1)
      if (nextSubDay > subSequential) subSequential = nextSubDay
    }

    // 方案 A: auto task snaps to its subtasks' envelope. A manual task keeps
    // its own (widened) range, but is always at least the subtasks' envelope —
    // it must never be narrower than its children (no parent < child).
    if (minSubStart && maxSubEnd) {
      if (task.manualDates) {
        if (minSubStart < effectiveStart) effectiveStart = minSubStart
        if (maxSubEnd > effectiveEnd) effectiveEnd = maxSubEnd
      } else {
        effectiveStart = minSubStart
        effectiveEnd = maxSubEnd
      }
    }
    result.set(task.id, { startDate: effectiveStart, endDate: effectiveEnd })

    // Advance sequential cursor past this task's (possibly expanded) end
    const nextDay = new Date(effectiveEnd)
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

    const msStartDate = new Date(msStartStr)
    const allMsTasks = tasks.filter(t => t.milestoneId === ms.id)
    const scheduled = scheduleTasksFromStart(msTasks, allMsTasks, msStartDate)

    let maxEndDate = msStartDate
    for (const [, dates] of scheduled) {
      if (dates.endDate > maxEndDate) maxEndDate = dates.endDate
    }
    const neededDays = Math.max(1, Math.ceil((maxEndDate.getTime() - msStartDate.getTime()) / 86400000) + 1)

    if (neededDays > (ms.durationDays || 0)) {
      changed = true
      return { ...ms, durationDays: neededDays }
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
  manualDates?: boolean
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
  manualDates?: boolean
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

    const durationDays = Math.max(dateSpanDays, 1)

    return {
      id: ms.id,
      name: ms.name,
      durationDays,
      manualDates: ms.manualDates ?? false,
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
    manualDates: t.manualDates ?? false,
    ...(t.parentId ? { parentId: t.parentId } : {}),
    // Carry explicit startDate for overlapping tasks
    ...(t.startDate ? { startDate: new Date(t.startDate).toISOString().split('T')[0] } : {}),
  }))

  return { milestones, tasks }
}

// ─── Diff computation for batch save ─────────────────────────

export interface WorkItemsDiff {
  milestonesToAdd: { name: string; dueDate: string; startDate?: string; sortOrder: number; manualDates?: boolean }[]
  milestonesToUpdate: { id: string; name?: string; dueDate?: string; startDate?: string; sortOrder?: number; manualDates?: boolean }[]
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
    sortOrder?: number
    manualDates?: boolean
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
    parentId?: string | null
    sortOrder?: number
    manualDates?: boolean
  }[]
  tasksToDelete: string[]
  projectEndDate?: string
}

export function computeWorkItemsDiff(
  origMilestones: { id: string; name: string; dueDate: string; startDate?: string | null; rawStartDate?: string | null; manualDates?: boolean }[],
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
      manualDates: m.manualDates ?? false,
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
    // Track startDate changes. Also re-sync drift: if the milestone's *stored*
    // start (rawStartDate) no longer matches its computed envelope start, correct
    // it — otherwise the saved milestone start silently drifts away from its tasks.
    const origStart = orig.startDate || undefined
    const rawStart = orig.rawStartDate || undefined
    const drifted = !!rawStart && !!m.startDate && rawStart !== m.startDate
    if (m.startDate !== origStart || drifted) { changes.startDate = m.startDate || null; hasChange = true }
    const origIdx = origMilestones.findIndex(o => o.id === m.id)
    if (idx !== origIdx) { changes.sortOrder = idx; hasChange = true }
    if ((m.manualDates ?? false) !== (orig.manualDates ?? false)) { changes.manualDates = m.manualDates ?? false; hasChange = true }
    if (hasChange) milestonesToUpdate.push(changes as WorkItemsDiff['milestonesToUpdate'][number])
  })

  // Tasks to delete
  const tasksToDelete = origTasks
    .filter(t => !currentTaskIds.has(t.id))
    .map(t => t.id)

  // Dense per-milestone sortOrder in visual order (each top-level task immediately
  // followed by its subtasks). Both the Gantt and the table sort each sibling group
  // by sortOrder, so keeping it dense & consistent makes saved order == on-screen order.
  const visualSortMap = (list: Array<{ id: string; milestoneId: string; parentId?: string | null }>): Map<string, number> => {
    const map = new Map<string, number>()
    for (const msId of [...new Set(list.map(t => t.milestoneId))]) {
      let idx = 0
      for (const top of list.filter(t => t.milestoneId === msId && !t.parentId)) {
        map.set(top.id, idx++)
        for (const sub of list.filter(s => s.parentId === top.id)) map.set(sub.id, idx++)
      }
    }
    return map
  }
  const currentSortMap = visualSortMap(currentTasks)
  const origSortMap = visualSortMap(origTasks)

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
        sortOrder: currentSortMap.get(t.id) ?? 0,
        manualDates: t.manualDates ?? false,
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
    if ((t.parentId ?? null) !== (orig.parentId ?? null)) { changes.parentId = t.parentId ?? null; hasChange = true }
    // sortOrder: dense per-milestone visual rank (see visualSortMap above).
    // Any insert/remove/move/reorder shifts ranks → all affected siblings re-emit.
    const newSort = currentSortMap.get(t.id) ?? 0
    const origSort = origSortMap.get(t.id) ?? -1
    if (newSort !== origSort) { changes.sortOrder = newSort; hasChange = true }
    if ((t.manualDates ?? false) !== (orig.manualDates ?? false)) { changes.manualDates = t.manualDates ?? false; hasChange = true }
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
