// ─── Tree move (reorder / reparent) for the timeline table ───
// Self-contained, absolute-date friendly (each item keeps its own dates; only
// parentId / milestoneId / order change). Used by the create wizard so it has the
// same drag-reparent + indent/outdent capability as the edit dialog.
//
// Enforces a 2-level tree (里程碑 ▸ 任務 ▸ 子任務): if a task that HAS children is
// nested under another task, its children flatten up to become siblings.

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
    // Otherwise DEMOTE into a destination milestone (dropped inside a milestone, OR
    // onto any task that belongs to another milestone): milestone A becomes a
    // top-level task there; A's tasks become subtasks; A's subtasks flatten up.
    const destMsId = overMs ? overMs.id : overTask ? overTask.milestoneId : null
    if (!destMsId || destMsId === activeId) return null
    const newTaskId = `demoted-${activeId}`
    const newTask = {
      id: newTaskId, milestoneId: destMsId, parentId: null,
      title: activeMs.name || '新任務', assignee: '', priority: 'medium',
      durationDays: activeMs.durationDays || 1, startDate: activeMs.startDate,
    } as unknown as T
    const aTasks = tasks.filter(t => t.milestoneId === activeId)
    const movedSubs = aTasks.map(t => ({ ...t, milestoneId: destMsId, parentId: newTaskId }) as T)
    const rest = tasks.filter(t => t.milestoneId !== activeId)
    let i = -1
    rest.forEach((t, k) => { if (t.milestoneId === destMsId) i = k })
    const newTasks = [...rest]
    newTasks.splice(i + 1, 0, newTask, ...movedSubs)
    return { tasks: newTasks, milestones: milestones.filter(m => m.id !== activeId) }
  }

  // Beyond milestone reorder we only move tasks/subtasks.
  if (!activeTask) return null

  // Can't drop an item into itself or its own subtree.
  const childIds = tasks.filter(t => t.parentId === activeId).map(t => t.id)
  const subtree = new Set<string>([activeId, ...childIds])
  if (subtree.has(overId)) return null

  // ── Resolve destination: target milestone + parent ──
  let targetMs: string
  let targetParentId: string | null
  if (overMs) {
    // Dropped on a milestone (any edge) → become a top-level task in it.
    targetMs = overMs.id
    targetParentId = null
  } else if (overTask) {
    targetMs = overTask.milestoneId
    if (mode === 'inside' && !overTask.parentId) {
      targetParentId = overTask.id            // nest under a top-level task
    } else if (overTask.parentId) {
      targetParentId = overTask.parentId      // become sibling of a subtask
    } else {
      targetParentId = null                   // before/after a top-level task
    }
  } else {
    return null
  }

  const rootBecomesSubtask = targetParentId !== null
  const root = { ...activeTask, milestoneId: targetMs, parentId: targetParentId } as T
  // Children follow: stay under root when root is top-level; flatten to root's new
  // parent when root itself becomes a subtask (keeps the 2-level invariant).
  const movedChildren = tasks
    .filter(t => t.parentId === activeId)
    .map(c => ({ ...c, milestoneId: targetMs, parentId: rootBecomesSubtask ? targetParentId : activeId }) as T)
  const moved: T[] = [root, ...movedChildren]

  const rest = tasks.filter(t => !subtree.has(t.id))

  // Insertion index — keep visual block order (a task's subtasks immediately follow it).
  const blockEnd = (id: string) => {
    let i = -1
    rest.forEach((t, k) => { if (t.id === id || t.parentId === id) i = k })
    return i
  }
  let at: number
  if (overMs) {
    let i = -1
    rest.forEach((t, k) => { if (t.milestoneId === overMs.id) i = k })
    at = i + 1 // after the milestone's last task (0 if it has none — renders under it anyway)
  } else {
    const ot = overTask!
    const overIdx = rest.findIndex(t => t.id === ot.id)
    if (mode === 'inside' && !ot.parentId) at = blockEnd(ot.id) + 1
    else if (ot.parentId) at = mode === 'before' ? overIdx : overIdx + 1
    else at = mode === 'before' ? overIdx : blockEnd(ot.id) + 1
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

  const newTasks = tasks
    .filter(t => t.id !== taskId) // the task itself becomes the milestone
    .map(t => t.parentId === taskId
      ? ({ ...t, milestoneId: newMsId, parentId: null }) as T // its subtasks → top-level tasks
      : t)

  const oldMsIdx = milestones.findIndex(m => m.id === task.milestoneId)
  const ms = [...milestones]
  ms.splice(oldMsIdx < 0 ? ms.length : oldMsIdx + 1, 0, newMs)
  return { tasks: newTasks, milestones: ms }
}
