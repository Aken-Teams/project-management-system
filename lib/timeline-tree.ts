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

  // ── Milestone dragged onto another milestone ──
  if (activeMs && overMs) {
    if (mode !== 'inside') {
      // edge → reorder milestones
      const from = milestones.findIndex(m => m.id === activeId)
      const to = milestones.findIndex(m => m.id === overId)
      if (from < 0 || to < 0) return null
      const ms = [...milestones]
      const [moved] = ms.splice(from, 1)
      ms.splice(to, 0, moved)
      return { tasks, milestones: ms }
    }
    // inside → demote milestone A into milestone B as a top-level task; A's tasks
    // become subtasks; A's subtasks flatten up (2-level max). A is removed.
    const newTaskId = `demoted-${activeId}`
    const newTask = {
      id: newTaskId, milestoneId: overMs.id, parentId: null,
      title: activeMs.name || '新任務', assignee: '', priority: 'medium',
      durationDays: activeMs.durationDays || 1, startDate: activeMs.startDate,
    } as unknown as T
    const aTasks = tasks.filter(t => t.milestoneId === activeId)
    const movedSubs = aTasks.map(t => ({ ...t, milestoneId: overMs.id, parentId: newTaskId }) as T)
    const rest = tasks.filter(t => t.milestoneId !== activeId)
    let i = -1
    rest.forEach((t, k) => { if (t.milestoneId === overMs.id) i = k })
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
