import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { autoProgressTasks, syncTaskProgressFromLogs, computeMilestoneStatus } from '@/lib/sync-milestone-status'
import { dbProjectToFrontend, projectFullInclude } from '@/lib/project-transformer'
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

    // ── Auto-progress: check deps, logs, startDate to set in_progress/blocked/todo ──
    await autoProgressTasks(project.tasks, project.taskLogs)

    // ── Compute task progress from task-log coverage ──
    await syncTaskProgressFromLogs(project.tasks, project.taskLogs)

    // ── Auto-sync milestone statuses (now includes blocked) ──
    for (const ms of project.milestones) {
      const msTasks = project.tasks.filter(t => t.milestoneId === ms.id && !t.parentId)
      if (msTasks.length === 0) continue
      const correctStatus = computeMilestoneStatus(msTasks)
      const correctProgress = Math.round(msTasks.reduce((s, t) => s + t.progress, 0) / msTasks.length)
      if (ms.status !== correctStatus || ms.progress !== correctProgress) {
        await prisma.milestone.update({
          where: { id: ms.id },
          data: { status: correctStatus, progress: correctProgress },
        })
        ;(ms as { status: string }).status = correctStatus
        ;(ms as { progress: number }).progress = correctProgress
      }
    }

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
  roiParams?: string | null
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
    if (body.roiParams !== undefined) data.roiParams = body.roiParams ?? null
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
