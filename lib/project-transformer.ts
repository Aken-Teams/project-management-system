import {
  projectTypeToFe,
  projectTierToFe,
  demandSourceToFe,
} from '@/lib/enum-mappers'
import { todayUtcStr, toUtcDateStr } from '@/lib/date-utils'
import { safeJsonParse } from '@/lib/utils'
// ─── Auto-compute project status & progress from tasks ─────

interface FeTask {
  status: string
  progress: number
  endDate: string
}

function computeProjectProgress(milestones: { progress: number }[]): number {
  if (milestones.length === 0) return 0
  const total = milestones.reduce((sum, m) => sum + m.progress, 0)
  return Math.round(total / milestones.length)
}

function computeProjectStatus(
  tasks: FeTask[],
  projectEndDate: Date,
): 'green' | 'yellow' | 'red' {
  if (tasks.length === 0) return 'green'

  const today = todayUtcStr()
  const overdueTasks = tasks.filter(t => t.status !== 'done' && t.endDate < today)
  const blockedTasks = tasks.filter(t => t.status === 'blocked')
  const doneTasks = tasks.filter(t => t.status === 'done')

  // All done → green
  if (doneTasks.length === tasks.length) return 'green'

  const overdueRatio = overdueTasks.length / tasks.length
  const blockedRatio = blockedTasks.length / tasks.length

  // Red: >30% overdue or >20% blocked, or project end date passed
  const projectEnd = toUtcDateStr(projectEndDate)
  if (overdueRatio > 0.3 || blockedRatio > 0.2 || (projectEnd < today && doneTasks.length < tasks.length)) {
    return 'red'
  }

  // Yellow: any overdue or blocked tasks
  if (overdueTasks.length > 0 || blockedTasks.length > 0) {
    return 'yellow'
  }

  return 'green'
}

/**
 * Transform a Prisma project (with relations) into the frontend Project shape.
 * Used by both POST /api/projects and GET /api/projects/[id].
 */
export function dbProjectToFrontend(
  proj: {
    id: string
    projectCode: string
    projectType: string
    projectTier: string | null
    demandSource: string | null
    name: string
    objective: string
    purpose: string
    scope: string
    roi: string
    roiGrossMargin: number | null
    roiAvgPrice: number | null
    roiCapacity: number | null
    createdReason: string
    expectedBenefits: string | null
    smartSpecific: string | null
    smartMeasurable: string | null
    smartAchievable: string | null
    smartRelevant: string | null
    smartTimeBound: string | null
    phase: string
    startDate: Date
    endDate: Date
    status: string
    progress: number
    budget: number
    budgetUsed: number
    ownerId: string
    budgetItems?: { actualCost: number | null; estimatedCost: number | null }[]
    createdAt: Date
    updatedAt: Date
    owner: { name: string }
    milestones: {
      id: string
      name: string
      startDate: Date | null
      dueDate: Date
      status: string
      progress: number
      sortOrder: number
      manualDates?: boolean
    }[]
    baselines: {
      id: string
      milestoneId: string
      name: string
      dueDate: Date
    }[]
    tasks: {
      id: string
      milestoneId: string
      title: string
      description: string
      assignee: string
      status: string
      priority: string
      startDate: Date
      endDate: Date
      durationDays: number
      progress: number
      completedAt: Date | null
      completedBy: string | null
      parentId: string | null
      originalStartDate: Date | null
      originalEndDate: Date | null
      manualDates?: boolean
      dependsOn: { prerequisiteId: string }[]
      children: {
        id: string
        title: string
        assignee: string
        status: string
        priority: string
        startDate: Date
        endDate: Date
        durationDays: number
        progress: number
        completedAt: Date | null
        completedBy: string | null
      }[]
    }[]
    risks: {
      id: string
      title: string
      description: string
      impact: string
      probability: string
      mitigation: string
      status: string
    }[]
    teamMembers: {
      id: string
      user: { name: string; email: string; jobTitle: string; organization: string; isActive: boolean }
      role: string
      jobTitle: string
      organization: string
      responsibility: string
    }[]
    weeklyUpdates: {
      id: string
      weekOf: Date
      updatedBy: { name: string }
      updatedAt: Date
      overallStatus: string
      overallNotes: string
      blockers: string
      nextWeekPlan: string
      keyAchievements: string
      milestoneUpdates: {
        milestoneId: string
        progress: number
        notes: string
      }[]
    }[]
    delayRequests: {
      id: string
      requester: { name: string }
      createdAt: Date
      reason: string
      canCatchUp: boolean
      supportNeeded: string
      status: string
      reviewer: { name: string } | null
      reviewedAt: Date | null
      reviewNotes: string | null
      supportResolved: boolean | null
      supportResolvedAt: Date | null
      supportResolvedBy: { name: string } | null
      supportResolvedNotes: string | null
      taskId: string | null
      task: { id: string; title: string } | null
      affectedMilestones: {
        milestoneId: string
        originalDate: Date
        proposedDate: Date
      }[]
    }[]
    taskLogs: {
      id: string
      taskId: string
      author: { name: string }
      logDate: Date
      content: string
      nextPlans: string | null
      attachments: string | null
      createdAt: Date
      publishedAt?: Date | null
    }[]
  },
) {
  const feMilestones = proj.milestones
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((m) => ({
      id: m.id,
      name: m.name,
      startDate: m.startDate ? m.startDate.toISOString().split('T')[0] : undefined,
      dueDate: m.dueDate.toISOString().split('T')[0],
      status: m.status === 'in_progress' ? ('in-progress' as const) : (m.status as 'todo' | 'done' | 'blocked'),
      progress: m.progress,
      manualDates: m.manualDates ?? false,
    }))

  // Build baseline from baselines table, fallback to current milestones
  const feBaseline = proj.baselines.length > 0
    ? proj.baselines.map((b) => {
        const ms = feMilestones.find((m) => m.id === b.milestoneId)
        return {
          id: b.milestoneId,
          name: b.name,
          dueDate: b.dueDate.toISOString().split('T')[0],
          status: ms?.status || ('todo' as const),
          progress: ms?.progress || 0,
        }
      })
    : feMilestones.map((m) => ({ ...m }))

  const feTasks = proj.tasks.map((t) => ({
    id: t.id,
    projectId: proj.id,
    milestoneId: t.milestoneId,
    title: t.title,
    description: t.description,
    assignee: t.assignee,
    status: t.status === 'in_progress' ? ('in-progress' as const) : (t.status as 'todo' | 'done' | 'blocked'),
    priority: t.priority as 'low' | 'medium' | 'high',
    durationDays: t.durationDays,
    startDate: t.startDate.toISOString().split('T')[0],
    endDate: t.endDate.toISOString().split('T')[0],
    manualDates: t.manualDates ?? false,
    dependencies: (t.dependsOn || []).map((d) => d.prerequisiteId),
    progress: t.progress,
    ...(t.completedAt ? { completedAt: t.completedAt.toISOString().split('T')[0] } : {}),
    ...(t.completedBy ? { completedBy: t.completedBy } : {}),
    ...(t.originalStartDate ? { originalStartDate: t.originalStartDate.toISOString().split('T')[0] } : {}),
    ...(t.originalEndDate ? { originalEndDate: t.originalEndDate.toISOString().split('T')[0] } : {}),
    ...(t.parentId ? { parentId: t.parentId } : {}),
    ...(t.children && t.children.length > 0 ? {
      subtasks: t.children.map((c) => ({
        id: c.id,
        title: c.title,
        status: c.status === 'in_progress' ? ('in-progress' as const) : (c.status as 'todo' | 'done' | 'blocked'),
        progress: c.progress,
        assignee: c.assignee,
        startDate: c.startDate.toISOString().split('T')[0],
        endDate: c.endDate.toISOString().split('T')[0],
        priority: c.priority as 'low' | 'medium' | 'high',
        durationDays: c.durationDays,
        ...(c.completedAt ? { completedAt: c.completedAt.toISOString().split('T')[0] } : {}),
        ...(c.completedBy ? { completedBy: c.completedBy } : {}),
      })),
    } : {}),
  }))

  const feRisks = proj.risks.map((r) => ({
    id: r.id,
    projectId: proj.id,
    title: r.title,
    description: r.description,
    impact: r.impact as 'low' | 'medium' | 'high',
    probability: r.probability as 'low' | 'medium' | 'high',
    mitigation: r.mitigation,
    status: r.status as 'open' | 'mitigated' | 'closed',
  }))

  const smartObjective =
    proj.smartSpecific || proj.smartMeasurable || proj.smartAchievable || proj.smartRelevant || proj.smartTimeBound
      ? {
          specific: proj.smartSpecific || '',
          measurable: proj.smartMeasurable || '',
          achievable: proj.smartAchievable || '',
          relevant: proj.smartRelevant || '',
          timeBound: proj.smartTimeBound || '',
        }
      : undefined

  const teamNames = proj.teamMembers.map((tm) => tm.user.name)

  const feWeeklyUpdates = proj.weeklyUpdates.map((wu) => ({
    id: wu.id,
    projectId: proj.id,
    weekOf: wu.weekOf.toISOString().split('T')[0],
    updatedBy: wu.updatedBy.name,
    updatedAt: wu.updatedAt.toISOString(),
    milestoneUpdates: wu.milestoneUpdates.map((mu) => ({
      milestoneId: mu.milestoneId,
      progress: mu.progress,
      notes: mu.notes,
    })),
    overallStatus: wu.overallStatus === 'on_time' ? ('on-time' as const) : ('delay' as const),
    overallNotes: wu.overallNotes,
    blockers: wu.blockers,
    nextWeekPlan: wu.nextWeekPlan,
    keyAchievements: wu.keyAchievements,
  }))

  const feDelayRequests = proj.delayRequests.map((dr) => ({
    id: dr.id,
    projectId: proj.id,
    requestedBy: dr.requester.name,
    requestedAt: dr.createdAt.toISOString(),
    reason: dr.reason,
    ...(dr.taskId ? { taskId: dr.taskId } : {}),
    ...(dr.task ? { taskTitle: dr.task.title } : {}),
    affectedMilestones: dr.affectedMilestones.map((am) => ({
      milestoneId: am.milestoneId,
      originalDate: am.originalDate.toISOString().split('T')[0],
      proposedDate: am.proposedDate.toISOString().split('T')[0],
    })),
    canCatchUp: dr.canCatchUp,
    supportNeeded: dr.supportNeeded,
    status: dr.status as 'pending' | 'approved' | 'rejected',
    ...(dr.reviewer ? { reviewedBy: dr.reviewer.name } : {}),
    ...(dr.reviewedAt ? { reviewedAt: dr.reviewedAt.toISOString() } : {}),
    ...(dr.reviewNotes ? { reviewNotes: dr.reviewNotes } : {}),
    ...(dr.supportResolved !== null ? { supportResolved: dr.supportResolved } : {}),
    ...(dr.supportResolvedAt ? { supportResolvedAt: dr.supportResolvedAt.toISOString() } : {}),
    ...(dr.supportResolvedBy ? { supportResolvedBy: dr.supportResolvedBy.name } : {}),
    ...(dr.supportResolvedNotes ? { supportResolvedNotes: dr.supportResolvedNotes } : {}),
  }))

  const feTaskLogs = proj.taskLogs.map((tl) => ({
    id: tl.id,
    taskId: tl.taskId,
    projectId: proj.id,
    author: tl.author.name,
    logDate: tl.logDate.toISOString().split('T')[0],
    content: tl.content,
    ...(tl.nextPlans ? { nextPlans: safeJsonParse(tl.nextPlans, [] as unknown[]) } : {}),
    ...(tl.attachments ? { attachments: safeJsonParse(tl.attachments, [] as unknown[]) } : {}),
    createdAt: tl.createdAt.toISOString(),
    publishedAt: tl.publishedAt ? tl.publishedAt.toISOString() : null,
    weekOf: (tl as { weekOf?: string | null }).weekOf ?? null,
  }))

  // Find the Accountable (A) member from team, fallback to project owner
  const accountableMember = proj.teamMembers.find((tm) => tm.role === 'A')
  const displayOwner = accountableMember ? accountableMember.user.name : proj.owner.name

  return {
    id: proj.id,
    projectCode: proj.projectCode,
    projectType: projectTypeToFe(proj.projectType),
    ...(proj.projectTier ? { projectTier: projectTierToFe(proj.projectTier as never) } : {}),
    ...(proj.demandSource ? { demandSource: demandSourceToFe(proj.demandSource as never) } : {}),
    phase: proj.phase as 'draft' | 'active',
    name: proj.name,
    objective: proj.objective,
    purpose: proj.purpose,
    scope: proj.scope,
    roi: proj.roi,
    roiGrossMargin: proj.roiGrossMargin,
    roiAvgPrice: proj.roiAvgPrice,
    roiCapacity: proj.roiCapacity,
    createdReason: proj.createdReason,
    expectedBenefits: proj.expectedBenefits || undefined,
    smartObjective,
    startDate: proj.startDate.toISOString().split('T')[0],
    endDate: proj.endDate.toISOString().split('T')[0],
    status: computeProjectStatus(feTasks.filter(t => !t.parentId), proj.endDate),
    progress: computeProjectProgress(feMilestones),
    budget: proj.budget,
    budgetUsed: proj.budgetItems
      ? proj.budgetItems.reduce((s, i) => s + (i.actualCost ?? 0), 0)
      : proj.budgetUsed,
    owner: displayOwner,
    team: teamNames,
    teamMembers: proj.teamMembers.map((tm) => ({
      id: tm.id,
      name: tm.user.name,
      email: tm.user.email,
      jobTitle: tm.jobTitle || tm.user.jobTitle || '',
      organization: tm.organization || tm.user.organization || '',
      role: tm.role as 'R' | 'A' | 'C' | 'I' | 'P' | 'S',
      responsibility: tm.responsibility,
      isActive: tm.user.isActive,
    })),
    milestones: feMilestones,
    baseline: feBaseline,
    tasks: feTasks,
    risks: feRisks,
    weeklyUpdates: feWeeklyUpdates,
    delayRequests: feDelayRequests,
    taskLogs: feTaskLogs,
    createdAt: proj.createdAt.toISOString(),
    updatedAt: proj.updatedAt.toISOString(),
  }
}

/**
 * Prisma include object for fetching a full project with all relations.
 */
export const projectFullInclude = {
  owner: true,
  milestones: { orderBy: { sortOrder: 'asc' as const } },
  baselines: true,
  tasks: {
    include: { dependsOn: true, children: true },
    orderBy: { sortOrder: 'asc' as const },
  },
  risks: true,
  teamMembers: { include: { user: true } },
  weeklyUpdates: {
    include: {
      updatedBy: true,
      milestoneUpdates: true,
    },
    orderBy: { weekOf: 'desc' as const },
  },
  delayRequests: {
    include: {
      requester: true,
      reviewer: true,
      supportResolvedBy: true,
      affectedMilestones: true,
      task: { select: { id: true, title: true } },
    },
    orderBy: { createdAt: 'desc' as const },
  },
  taskLogs: {
    include: { author: true },
    orderBy: { createdAt: 'desc' as const },
  },
  budgetItems: {
    select: { actualCost: true, estimatedCost: true },
  },
} as const
