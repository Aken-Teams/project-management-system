import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { autoProgressTasks, syncTaskProgressFromLogs, computeMilestoneStatus, computeWeightedProgress } from '@/lib/sync-milestone-status'
import { dbProjectToFrontend, projectFullInclude } from '@/lib/project-transformer'
import { notifyProjectOverdueIfNeeded } from '@/lib/notifications'
import {
  projectTypeToDb,
  projectTierToDb,
  demandSourceToDb,
} from '@/lib/enum-mappers'
import type { ProjectType as FeProjectType, ProjectTier as FeProjectTier, DemandSource as FeDemandSource } from '@/lib/mock-data'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(
  _request: NextRequest,
  { params }: RouteContext,
) {
  try {
    const { id } = await params

    const project = await prisma.project.findUnique({
      where: { id },
      include: projectFullInclude,
    })

    if (!project) {
      return NextResponse.json({ error: '找不到專案' }, { status: 404 })
    }

    // ── Compute task progress from task-log coverage FIRST ──
    // (must precede autoProgressTasks, which reads fresh progress to decide
    //  todo→in_progress vs blocked — Bug #10)
    await syncTaskProgressFromLogs(project.tasks, project.taskLogs)

    // ── Auto-progress: check deps, logs, startDate to set in_progress/blocked/todo ──
    await autoProgressTasks(project.tasks, project.taskLogs)

    // ── Auto-sync milestone statuses (now includes blocked) ──
    //   里程碑聚合「葉任務」(最底層原子工作)，與 syncMilestoneStatus / 甘特一致；
    //   父任務進度只反映它自己的報告，不進里程碑(避免父子工期重疊重複計)。
    const projParentIds = new Set(project.tasks.filter(t => t.parentId).map(t => t.parentId))
    for (const ms of project.milestones) {
      const msTasks = project.tasks.filter(t => t.milestoneId === ms.id)
      if (msTasks.length === 0) continue
      const leaves = msTasks.filter(t => !projParentIds.has(t.id))
      const basis = leaves.length > 0 ? leaves : msTasks
      const correctStatus = computeMilestoneStatus(basis)
      const correctProgress = computeWeightedProgress(basis)
      if (ms.status !== correctStatus || ms.progress !== correctProgress) {
        await prisma.milestone.update({
          where: { id: ms.id },
          data: { status: correctStatus, progress: correctProgress },
        })
        ;(ms as { status: string }).status = correctStatus
        ;(ms as { progress: number }).progress = correctProgress
      }
    }

    // ── Overdue check: notify PM at most once per 7 days（僅已開案專案）──
    if ((project as { phase?: string }).phase === 'active') {
      await notifyProjectOverdueIfNeeded({
        projectId: id,
        projectName: project.name,
        fallbackOwnerId: project.ownerId,
      })
    }

    // ── Date consistency repair: fix tasks outside milestone range ──
    //   已核准延期的任務要「保護」原始日期不被清（供甘特畫紅段）
    const delayedTaskIds = new Set<string>()
    for (const dr of project.delayRequests) {
      if (dr.status !== 'approved') continue
      if (dr.taskId) delayedTaskIds.add(dr.taskId)
      const ptc = dr.pendingTaskChanges as Array<{ taskId?: string }> | null
      if (Array.isArray(ptc)) for (const tc of ptc) { if (tc.taskId) delayedTaskIds.add(tc.taskId) }
    }
    await repairTaskDates(project, delayedTaskIds)

    const feProject = dbProjectToFrontend(project as Parameters<typeof dbProjectToFrontend>[0])

    return NextResponse.json(feProject)
  } catch (error) {
    console.error('Failed to fetch project:', error)
    return NextResponse.json(
      { error: '讀取專案失敗' },
      { status: 500 },
    )
  }
}

// ─── PUT /api/projects/[id] — Update project basic info ─────

interface UpdateProjectBody {
  name?: string
  projectType?: string
  projectTier?: string | null
  demandSource?: string | null
  objective?: string
  purpose?: string
  scope?: string
  roi?: string
  roiGrossMargin?: number | null
  roiAvgPrice?: number | null
  roiCapacity?: number | null
  createdReason?: string
  expectedBenefits?: string | null
  smartObjective?: {
    specific: string
    measurable: string
    achievable: string
    relevant: string
    timeBound: string
  } | null
  startDate?: string
  endDate?: string
  budget?: number
}

export async function PUT(
  request: NextRequest,
  { params }: RouteContext,
) {
  try {
    const { id } = await params
    const body: UpdateProjectBody = await request.json()

    // Check project exists
    const existing = await prisma.project.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: '找不到專案' }, { status: 404 })
    }

    // Build update data — only include fields that were provided
    const data: Record<string, unknown> = {}

    if (body.name !== undefined) {
      if (!body.name.trim()) {
        return NextResponse.json({ error: '專案名稱不可為空' }, { status: 400 })
      }
      data.name = body.name.trim()
    }
    if (body.projectType !== undefined) {
      data.projectType = projectTypeToDb(body.projectType as FeProjectType)
    }
    if (body.projectTier !== undefined) {
      data.projectTier = body.projectTier
        ? projectTierToDb(body.projectTier as FeProjectTier)
        : null
    }
    if (body.demandSource !== undefined) {
      data.demandSource = body.demandSource
        ? demandSourceToDb(body.demandSource as FeDemandSource)
        : null
    }
    if (body.objective !== undefined) data.objective = body.objective
    if (body.purpose !== undefined) data.purpose = body.purpose
    if (body.scope !== undefined) data.scope = body.scope
    if (body.roi !== undefined) data.roi = body.roi
    if (body.roiGrossMargin !== undefined) data.roiGrossMargin = body.roiGrossMargin ?? null
    if (body.roiAvgPrice !== undefined) data.roiAvgPrice = body.roiAvgPrice ?? null
    if (body.roiCapacity !== undefined) data.roiCapacity = body.roiCapacity ?? null
    if (body.createdReason !== undefined) data.createdReason = body.createdReason
    if (body.expectedBenefits !== undefined) data.expectedBenefits = body.expectedBenefits || null
    if (body.smartObjective !== undefined) {
      if (body.smartObjective) {
        data.smartSpecific = body.smartObjective.specific
        data.smartMeasurable = body.smartObjective.measurable
        data.smartAchievable = body.smartObjective.achievable
        data.smartRelevant = body.smartObjective.relevant
        data.smartTimeBound = body.smartObjective.timeBound
      } else {
        data.smartSpecific = null
        data.smartMeasurable = null
        data.smartAchievable = null
        data.smartRelevant = null
        data.smartTimeBound = null
      }
    }
    if (body.startDate !== undefined) data.startDate = new Date(body.startDate)
    if (body.endDate !== undefined) data.endDate = new Date(body.endDate)
    if (body.budget !== undefined) data.budget = body.budget

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: '沒有提供任何更新欄位' }, { status: 400 })
    }

    await prisma.project.update({ where: { id }, data })

    // Re-fetch full project
    const fullProject = await prisma.project.findUniqueOrThrow({
      where: { id },
      include: projectFullInclude,
    })

    const feProject = dbProjectToFrontend(fullProject as Parameters<typeof dbProjectToFrontend>[0])
    return NextResponse.json(feProject)
  } catch (error) {
    console.error('Failed to update project:', error)
    return NextResponse.json(
      { error: '更新專案失敗' },
      { status: 500 },
    )
  }
}

// ─── DELETE /api/projects/[id] — Delete project ─────────────

export async function DELETE(
  _request: NextRequest,
  { params }: RouteContext,
) {
  try {
    const { id } = await params

    const existing = await prisma.project.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: '找不到專案' }, { status: 404 })
    }

    // Cascade delete is handled by Prisma schema (onDelete: Cascade)
    await prisma.project.delete({ where: { id } })

    return NextResponse.json({ success: true, message: '專案已刪除' })
  } catch (error) {
    console.error('Failed to delete project:', error)
    return NextResponse.json(
      { error: '刪除專案失敗' },
      { status: 500 },
    )
  }
}

// ─── Date consistency repair ─────────────────────────────────
// Fixes task dates that are outside their milestone's date range.
// This self-heals data inconsistencies caused by sequential delay
// approvals or edits that stripped task dates.

async function repairTaskDates(project: {
  startDate: Date
  milestones: { id: string; dueDate: Date; sortOrder: number }[]
  tasks: { id: string; milestoneId: string; durationDays: number; startDate: Date; endDate: Date; sortOrder: number; parentId: string | null; originalStartDate: Date | null; originalEndDate: Date | null; manualDates: boolean }[]
}, protectedTaskIds: Set<string> = new Set()) {
  const sortedMs = [...project.milestones].sort((a, b) => a.sortOrder - b.sortOrder)
  let msCurrentStart = new Date(project.startDate)

  for (const ms of sortedMs) {
    const msStart = new Date(msCurrentStart)
    const msDueDate = new Date(ms.dueDate)

    // Get parent tasks for this milestone (sorted)
    const parentTasks = project.tasks
      .filter(t => t.milestoneId === ms.id && t.parentId == null)
      .sort((a, b) => a.sortOrder - b.sortOrder)

    if (parentTasks.length === 0) {
      msCurrentStart = addDay(msDueDate, 1)
      continue
    }

    // Overlap model: a milestone EXPANDS to fit its tasks, so a task is ALLOWED to
    // start before / outside the sequential waterfall position (that's overlap).
    // Only repair genuinely BROKEN dates (missing / NaN / end-before-start) — never
    // re-sequence valid tasks. The old "outside [msStart, msDueDate]" check was
    // silently overwriting user edits with a sequential layout on every load.
    const allMsTasks = project.tasks.filter(t => t.milestoneId === ms.id)
    const isBroken = (s: Date | null, e: Date | null) =>
      !s || !e || isNaN(s.getTime()) || isNaN(e.getTime()) || e.getTime() < s.getTime()
    const needsRepair = allMsTasks.some(t => isBroken(t.startDate, t.endDate))

    const needsSubRepair = !needsRepair && parentTasks.some(parent => {
      const subs = project.tasks.filter(t => t.parentId === parent.id)
      return subs.some(s => isBroken(s.startDate, s.endDate))
    })

    if (!needsRepair && !needsSubRepair) {
      msCurrentStart = addDay(msDueDate, 1)
      continue
    }

    // Repair: schedule all tasks from milestone start
    let taskCurrent = new Date(msStart)
    for (const task of parentTasks) {
      const days = Math.max(task.durationDays || 1, 1)
      // Respect manual dates: a user-overridden task keeps its own dates unless
      // it is itself broken. Only re-sequence auto (non-manual) tasks. (Bug #7)
      const taskManualKeep = task.manualDates && !isBroken(task.startDate, task.endDate)
      const taskStart = (needsRepair && !taskManualKeep) ? new Date(taskCurrent) : new Date(task.startDate)
      const taskEnd = (needsRepair && !taskManualKeep) ? addDay(taskCurrent, days - 1) : new Date(task.endDate)

      if (needsRepair && (task.startDate.getTime() !== taskStart.getTime() ||
          task.endDate.getTime() !== taskEnd.getTime())) {
        await prisma.task.update({
          where: { id: task.id },
          data: {
            startDate: taskStart,
            endDate: taskEnd,
            originalStartDate: null,
            originalEndDate: null,
          },
        })
        ;(task as { startDate: Date }).startDate = taskStart
        ;(task as { endDate: Date }).endDate = taskEnd
        ;(task as { originalStartDate: Date | null }).originalStartDate = null
        ;(task as { originalEndDate: Date | null }).originalEndDate = null
      }

      // Repair subtasks — always runs when needsRepair or needsSubRepair
      const subtasks = project.tasks
        .filter(t => t.parentId === task.id)
        .sort((a, b) => a.sortOrder - b.sortOrder)
      if (subtasks.length > 0) {
        let subCurrent = new Date(taskStart)
        for (const sub of subtasks) {
          const subDays = Math.max(sub.durationDays || 1, 1)
          // Respect manual dates on subtasks too (Bug #7)
          const subManualKeep = sub.manualDates && !isBroken(sub.startDate, sub.endDate)
          const subStart = subManualKeep ? new Date(sub.startDate) : new Date(subCurrent)
          const subEnd = subManualKeep ? new Date(sub.endDate) : addDay(subCurrent, subDays - 1)
          if (!subManualKeep && (sub.startDate.getTime() !== subStart.getTime() ||
              sub.endDate.getTime() !== subEnd.getTime())) {
            await prisma.task.update({
              where: { id: sub.id },
              data: {
                startDate: subStart,
                endDate: subEnd,
                originalStartDate: null,
                originalEndDate: null,
              },
            })
            ;(sub as { startDate: Date }).startDate = subStart
            ;(sub as { endDate: Date }).endDate = subEnd
            ;(sub as { originalStartDate: Date | null }).originalStartDate = null
            ;(sub as { originalEndDate: Date | null }).originalEndDate = null
          }
          subCurrent = addDay(subEnd, 1)
        }
      }

      taskCurrent = addDay(taskEnd, 1)
    }

    msCurrentStart = addDay(msDueDate, 1)
  }

  // Broad cleanup: clear stale originalStartDate/originalEndDate.
  // Originals are stale when they don't overlap with current dates
  // (e.g., originals in April but task is now in December).
  for (const task of project.tasks) {
    // 有已核准延期的任務 → 保留原始日期，供甘特畫延期紅段（否則非重疊會被誤清）
    if (protectedTaskIds.has(task.id)) continue
    if (task.originalStartDate && task.originalEndDate) {
      // No overlap: original range is entirely before or after current range
      const stale =
        task.originalEndDate.getTime() < task.startDate.getTime() ||
        task.originalStartDate.getTime() > task.endDate.getTime()
      if (stale) {
        await prisma.task.update({
          where: { id: task.id },
          data: { originalStartDate: null, originalEndDate: null },
        })
        ;(task as { originalStartDate: Date | null }).originalStartDate = null
        ;(task as { originalEndDate: Date | null }).originalEndDate = null
      }
    }
  }
}

function addDay(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}
