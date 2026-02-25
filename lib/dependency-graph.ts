import type { Project, Task, Milestone } from '@/lib/mock-data'

// ─── Types ──────────────────────────────────────────────────

export interface DepNode {
  task: Task
  milestone: Milestone | undefined
  prerequisites: Task[]
  dependents: Task[]
  depth: number
  isOnCriticalPath: boolean
}

export interface ImpactResult {
  directlyBlocked: Task[]
  indirectlyAffected: Task[]
  affectedMilestones: Milestone[]
  totalDelayChain: number
}

// ─── Graph Helpers ───────────────────────────────────────────

export function buildDepGraph(project: Project): Map<string, DepNode> {
  const taskMap = new Map(project.tasks.map(t => [t.id, t]))
  const milestoneMap = new Map(project.milestones.map(m => [m.id, m]))
  const nodeMap = new Map<string, DepNode>()

  // Only parent tasks participate in the dependency graph;
  // subtasks are internal to their parent and don't form cross-task links.
  // When a dependency chain passes through subtasks (stale DB data),
  // we resolve through them to find the actual parent predecessor.
  const parentTasks = project.tasks.filter(t => !t.parentId)

  for (const task of parentTasks) {
    const rawDeps = (task.dependencies || [])
      .map(id => taskMap.get(id))
      .filter(Boolean) as Task[]

    // Resolve through subtasks to find parent predecessors
    const prereqs: Task[] = []
    const seen = new Set<string>()
    const queue = [...rawDeps]
    while (queue.length > 0) {
      const dep = queue.shift()!
      if (seen.has(dep.id)) continue
      seen.add(dep.id)
      if (!dep.parentId) {
        prereqs.push(dep) // parent task — direct prerequisite
      } else {
        // subtask — follow its dependencies to find parent tasks behind it
        const subDeps = (dep.dependencies || [])
          .map(id => taskMap.get(id))
          .filter(Boolean) as Task[]
        queue.push(...subDeps)
      }
    }

    nodeMap.set(task.id, {
      task,
      milestone: milestoneMap.get(task.milestoneId),
      prerequisites: prereqs,
      dependents: [],
      depth: 0,
      isOnCriticalPath: false,
    })
  }

  for (const [, node] of nodeMap) {
    for (const prereq of node.prerequisites) {
      const prereqNode = nodeMap.get(prereq.id)
      if (prereqNode) prereqNode.dependents.push(node.task)
    }
  }

  // Compute depth (BFS from roots)
  const roots = [...nodeMap.values()].filter(n => n.prerequisites.length === 0)
  const visited = new Set<string>()
  const queue: { id: string; depth: number }[] = roots.map(r => ({ id: r.task.id, depth: 0 }))
  while (queue.length > 0) {
    const { id, depth } = queue.shift()!
    const node = nodeMap.get(id)!
    if (depth > node.depth) node.depth = depth
    for (const dep of node.dependents) {
      if (!visited.has(`${id}->${dep.id}`)) {
        visited.add(`${id}->${dep.id}`)
        queue.push({ id: dep.id, depth: node.depth + 1 })
      }
    }
  }

  // Critical path: longest chain
  const maxDepth = Math.max(0, ...[...nodeMap.values()].map(n => n.depth))
  const criticalTails = [...nodeMap.values()].filter(n => n.depth === maxDepth && n.dependents.length === 0)
  function markCritical(id: string) {
    const node = nodeMap.get(id)
    if (!node || node.isOnCriticalPath) return
    node.isOnCriticalPath = true
    if (node.prerequisites.length > 0) {
      const best = node.prerequisites.reduce((a, b) => {
        const da = nodeMap.get(a.id)?.depth ?? 0
        const db = nodeMap.get(b.id)?.depth ?? 0
        return da >= db ? a : b
      })
      markCritical(best.id)
    }
  }
  for (const tail of criticalTails) markCritical(tail.task.id)

  return nodeMap
}

export function computeImpact(taskId: string, nodeMap: Map<string, DepNode>): ImpactResult {
  const node = nodeMap.get(taskId)
  if (!node) return { directlyBlocked: [], indirectlyAffected: [], affectedMilestones: [], totalDelayChain: 0 }

  const directlyBlocked = node.dependents
  const indirectSet = new Set<string>()
  const milestoneSet = new Set<string>()

  const queue = [...node.dependents.map(t => t.id)]
  const visited = new Set<string>(queue)

  while (queue.length > 0) {
    const id = queue.shift()!
    const n = nodeMap.get(id)
    if (!n) continue
    if (n.task.milestoneId) milestoneSet.add(n.task.milestoneId)
    for (const dep of n.dependents) {
      if (!visited.has(dep.id)) {
        visited.add(dep.id)
        indirectSet.add(dep.id)
        queue.push(dep.id)
      }
    }
  }

  for (const t of directlyBlocked) {
    if (t.milestoneId) milestoneSet.add(t.milestoneId)
  }

  const indirect = [...indirectSet]
    .map(id => nodeMap.get(id)?.task)
    .filter(Boolean) as Task[]

  const milestones = [...milestoneSet]
    .map(id => {
      for (const [, n] of nodeMap) {
        if (n.milestone?.id === id) return n.milestone
      }
      return undefined
    })
    .filter(Boolean) as Milestone[]

  return {
    directlyBlocked,
    indirectlyAffected: indirect,
    affectedMilestones: milestones,
    totalDelayChain: visited.size,
  }
}
