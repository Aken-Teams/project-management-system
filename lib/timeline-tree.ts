// ─── Tree move (reorder / reparent) for the timeline table ───
// Self-contained, absolute-date friendly (each item keeps its own dates; only
// parentId / milestoneId / order change). Used by both create wizard and edit.
//
// ADR-02: supports a milestone + up to MAX_TASK_DEPTH nested task levels (6 total).
// A move that would exceed the depth cap is rejected (returns null) rather than
// silently flattening — the UI hides the actions that would over-nest.

// Milestone = level 1; a top-level task = task-depth 1; its child = 2; … up to 5.
export const MAX_TASK_DEPTH = 5

interface TreeTask {
  id: string
  milestoneId: string
  parentId?: string | null
  title?: string
  durationDays?: number
  startDate?: string
}
interface TreeMs {
  id: string
  name?: string
  durationDays?: number
  startDate?: string
}
export type TreeDropMode = 'inside' | 'before' | 'after'

// Task-depth (1 = top-level task). Milestone level is not counted here.
export function taskDepth(taskId: string, tasks: { id: string; parentId?: string | null }[]): number {
  const byId = new Map(tasks.map(t => [t.id, t]))
  let d = 1
  let cur = byId.get(taskId)
  const seen = new Set<string>()
  while (cur?.parentId && !seen.has(cur.id)) { seen.add(cur.id); d++; cur = byId.get(cur.parentId) }
  return d
}

// All descendant ids of a task (not incl. the task itself).
function descendantIds(rootId: string, tasks: { id: string; parentId?: string | null }[]): Set<string> {
  const out = new Set<string>()
  let changed = true
  while (changed) {
    changed = false
    for (const t of tasks) {
      if (t.parentId && (t.parentId === rootId || out.has(t.parentId)) && !out.has(t.id)) {
        out.add(t.id); changed = true
      }
    }
  }
  return out
}

export function moveTreeItem<
  T extends TreeTask,
  M extends TreeMs,
>(
  tasks: T[],
  milestones: M[],
  activeId: string,
  overId: string,
  mode: TreeDropMode,
): { tasks: T[]; milestones: M[] } | null {
  if (activeId === overId) return null

  const activeTask = tasks.find(t => t.id === activeId)
  const activeMs = milestones.find(m => m.id === activeId)
  const overTask = tasks.find(t => t.id === overId)
  const overMs = milestones.find(m => m.id === overId)

  // ── Milestone dragged ──
  if (activeMs) {
    // Dropped on another milestone's EDGE → reorder milestones.
    if (overMs && mode !== 'inside') {
      const from = milestones.findIndex(m => m.id === activeId)
      const to = milestones.findIndex(m => m.id === overId)
      if (from < 0 || to < 0) return null
      const ms = [...milestones]
      const [moved] = ms.splice(from, 1)
      ms.splice(to, 0, moved)
      return { tasks, milestones: ms }
    }
    // Otherwise DEMOTE into a destination milestone: milestone A becomes a top-level
    // task there; A's own top-level tasks become its children; deeper levels keep
    // their relative structure (shift one level deeper). Rejected if too deep.
    const destMsId = overMs ? overMs.id : overTask ? overTask.milestoneId : null
    if (!destMsId || destMsId === activeId) return null
    const aTasks = tasks.filter(t => t.milestoneId === activeId)
    let aMaxDepth = 0
    for (const t of aTasks) aMaxDepth = Math.max(aMaxDepth, taskDepth(t.id, aTasks))
    if (1 + aMaxDepth > MAX_TASK_DEPTH) return null
    const newTaskId = `demoted-${activeId}`
    const newTask = {
      id: newTaskId, milestoneId: destMsId, parentId: null,
      title: activeMs.name || '新任務', assignee: '', priority: 'medium',
      durationDays: activeMs.durationDays || 1, startDate: activeMs.startDate,
    } as unknown as T
    const movedSubs = aTasks.map(t => t.parentId
      ? ({ ...t, milestoneId: destMsId }) as T                       // keep relative parent
      : ({ ...t, milestoneId: destMsId, parentId: newTaskId }) as T) // A's top-level → child of newTask
    const rest = tasks.filter(t => t.milestoneId !== activeId)
    let di = -1
    rest.forEach((t, k) => { if (t.milestoneId === destMsId) di = k })
    const demoted = [...rest]
    demoted.splice(di + 1, 0, newTask, ...movedSubs)
    return { tasks: demoted, milestones: milestones.filter(m => m.id !== activeId) }
  }

  // ── Task / subtask dragged ──
  if (!activeTask) return null

  const subtreeIds = new Set<string>([activeId, ...descendantIds(activeId, tasks)])
  if (subtreeIds.has(overId)) return null // can't drop into itself / its own subtree

  // Resolve destination milestone + parent
  let targetMs: string
  let targetParentId: string | null
  if (overMs) {
    targetMs = overMs.id
    targetParentId = null // dropped on a milestone → top-level task
  } else if (overTask) {
    targetMs = overTask.milestoneId
    targetParentId = mode === 'inside' ? overTask.id : (overTask.parentId ?? null)
  } else {
    return null
  }

  // Depth guard: reject a move that would push the subtree past the cap.
  const oldRootDepth = taskDepth(activeId, tasks)
  let subtreeRel = 0
  for (const id of subtreeIds) subtreeRel = Math.max(subtreeRel, taskDepth(id, tasks) - oldRootDepth)
  const newRootDepth = targetParentId ? taskDepth(targetParentId, tasks) + 1 : 1
  if (newRootDepth + subtreeRel > MAX_TASK_DEPTH) return null

  // Move the WHOLE subtree (visual order preserved): root re-parents; descendants keep
  // their relative parentId and just follow into the new milestone.
  const moved = tasks.filter(t => subtreeIds.has(t.id)).map(t =>
    t.id === activeId
      ? ({ ...t, milestoneId: targetMs, parentId: targetParentId }) as T
      : ({ ...t, milestoneId: targetMs }) as T)
  const rest = tasks.filter(t => !subtreeIds.has(t.id))

  // Insertion index — keep the subtree a contiguous block placed at the target.
  const subtreeEnd = (id: string) => {
    const sub = new Set<string>([id, ...descendantIds(id, rest)])
    let i = -1
    rest.forEach((t, k) => { if (sub.has(t.id)) i = k })
    return i
  }
  let at: number
  if (overMs) {
    let i = -1
    rest.forEach((t, k) => { if (t.milestoneId === overMs.id) i = k })
    at = i + 1
  } else {
    const ot = overTask!
    const overIdx = rest.findIndex(t => t.id === ot.id)
    at = mode === 'before' ? overIdx : subtreeEnd(ot.id) + 1
  }

  const newTasks = [...rest]
  newTasks.splice(at < 0 ? newTasks.length : at, 0, ...moved)
  return { tasks: newTasks, milestones }
}

// ─── Promote a top-level task up to a milestone ──────────────
// The task becomes a new milestone (placed right after its current milestone);
// its subtasks become that milestone's top-level tasks. Mirrors the "升階" ladder:
// 子任務 → 任務 → 里程碑.
export function promoteTaskToMilestone<
  T extends TreeTask,
  M extends TreeMs,
>(
  tasks: T[],
  milestones: M[],
  taskId: string,
): { tasks: T[]; milestones: M[] } | null {
  const task = tasks.find(t => t.id === taskId)
  if (!task || task.parentId) return null // only top-level tasks can become milestones

  const newMsId = `ms-from-${taskId}`
  const newMs = {
    id: newMsId,
    name: task.title || '新里程碑',
    durationDays: task.durationDays || 1,
    startDate: task.startDate,
  } as unknown as M

  const subtree = descendantIds(taskId, tasks)
  const newTasks = tasks
    .filter(t => t.id !== taskId) // the task itself becomes the milestone
    .map(t => {
      if (!subtree.has(t.id)) return t
      // whole subtree moves into the new milestone; direct children become its
      // top-level tasks, deeper levels keep their relative structure.
      return t.parentId === taskId
        ? ({ ...t, milestoneId: newMsId, parentId: null }) as T
        : ({ ...t, milestoneId: newMsId }) as T
    })

  const oldMsIdx = milestones.findIndex(m => m.id === task.milestoneId)
  const ms = [...milestones]
  ms.splice(oldMsIdx < 0 ? ms.length : oldMsIdx + 1, 0, newMs)
  return { tasks: newTasks, milestones: ms }
}
