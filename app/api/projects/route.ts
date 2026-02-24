import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import {
  projectTypeToDb,
  projectTierToDb,
  demandSourceToDb,
} from '@/lib/enum-mappers'
import { dbProjectToFrontend, projectFullInclude } from '@/lib/project-transformer'
import type { ProjectType as FeProjectType, ProjectTier as FeProjectTier, DemandSource as FeDemandSource } from '@/lib/mock-data'

// ─── GET /api/projects — List all projects ───────────────
export async function GET() {
  try {
    const projects = await prisma.project.findMany({
      include: projectFullInclude,
      orderBy: { createdAt: 'desc' },
    })

    const feProjects = projects.map((p) =>
      dbProjectToFrontend(p as Parameters<typeof dbProjectToFrontend>[0])
    )

    return NextResponse.json(feProjects)
  } catch (error) {
    console.error('Failed to fetch projects:', error)
    return NextResponse.json(
      { error: '讀取專案列表失敗' },
      { status: 500 },
    )
  }
}

// ─── Project code prefix map ─────────────────────────────
const CODE_PREFIX: Record<string, string> = {
  npi: 'NPI',
  cost_optimization: 'CST',
  quality_improvement: 'QAL',
  automation: 'AUT',
  product_strategy: 'PST',
  process_optimization: 'PRC',
  external_requirement: 'EXT',
}

// ─── Request body types ──────────────────────────────────
interface CreateProjectBody {
  projectType: string
  projectTier?: string
  demandSource?: string
  name: string
  objective: string
  purpose: string
  scope: string
  roi: string
  createdReason: string
  expectedBenefits?: string
  smartObjective?: {
    specific: string
    measurable: string
    achievable: string
    relevant: string
    timeBound: string
  }
  startDate: string
  endDate: string
  budget: number
  ownerName: string
  team: string[]
  teamMembers?: { name: string; role: string; jobTitle?: string; organization?: string; responsibility: string }[]
  milestones: { id: string; name: string; dueDate: string }[]
  tasks?: {
    milestoneId: string
    title: string
    description: string
    assignee: string
    priority: string
    durationWeeks: number
    startDate: string
    endDate: string
  }[]
  risks?: {
    title: string
    description: string
    impact: string
    probability: string
    mitigation: string
    status: string
  }[]
}

export async function POST(request: NextRequest) {
  try {
    const body: CreateProjectBody = await request.json()

    // ─── Validation ────────────────────────────────────
    if (!body.name?.trim()) {
      return NextResponse.json({ error: '專案名稱為必填' }, { status: 400 })
    }
    if (!body.projectType) {
      return NextResponse.json({ error: '專案類型為必填' }, { status: 400 })
    }
    if (!body.startDate || !body.endDate) {
      return NextResponse.json({ error: '開始日期和結束日期為必填' }, { status: 400 })
    }
    if (!body.milestones?.length) {
      return NextResponse.json({ error: '至少需要一個里程碑' }, { status: 400 })
    }

    // ─── Convert enums to DB format ────────────────────
    const dbProjectType = projectTypeToDb(body.projectType as FeProjectType)
    const dbProjectTier = body.projectTier
      ? projectTierToDb(body.projectTier as FeProjectTier)
      : null
    const dbDemandSource = body.demandSource
      ? demandSourceToDb(body.demandSource as FeDemandSource)
      : null

    // ─── Find or fallback owner ────────────────────────
    let owner = await prisma.user.findFirst({
      where: { name: body.ownerName },
    })
    if (!owner) {
      // Fallback: use first PM user
      owner = await prisma.user.findFirst({ where: { role: 'pm' } })
    }
    if (!owner) {
      return NextResponse.json({ error: '找不到專案負責人' }, { status: 400 })
    }

    // ─── Generate project code (atomic) ────────────────
    const currentYear = new Date().getFullYear()
    const sequence = await prisma.projectCodeSequence.update({
      where: {
        projectType_year: {
          projectType: dbProjectType,
          year: currentYear,
        },
      },
      data: { lastSeq: { increment: 1 } },
    })

    const prefix = CODE_PREFIX[dbProjectType as string] || 'PRJ'
    const projectCode = `${prefix}-${currentYear}-${String(sequence.lastSeq).padStart(3, '0')}`

    // ─── Create project with all relations in a transaction ─
    const project = await prisma.$transaction(async (tx) => {
      // 1. Create project
      const proj = await tx.project.create({
        data: {
          projectCode,
          projectType: dbProjectType,
          projectTier: dbProjectTier,
          demandSource: dbDemandSource,
          name: body.name.trim(),
          objective: body.objective || '',
          purpose: body.purpose || '',
          scope: body.scope || '',
          roi: body.roi || '',
          createdReason: body.createdReason || '',
          expectedBenefits: body.expectedBenefits || null,
          smartSpecific: body.smartObjective?.specific || null,
          smartMeasurable: body.smartObjective?.measurable || null,
          smartAchievable: body.smartObjective?.achievable || null,
          smartRelevant: body.smartObjective?.relevant || null,
          smartTimeBound: body.smartObjective?.timeBound || null,
          startDate: new Date(body.startDate),
          endDate: new Date(body.endDate),
          budget: body.budget || 0,
          ownerId: owner.id,
        },
      })

      // 2. Create milestones — build ID mapping (frontend temp ID → DB cuid)
      const milestoneIdMap = new Map<string, string>()
      const milestones = []

      for (let i = 0; i < body.milestones.length; i++) {
        const m = body.milestones[i]
        const milestone = await tx.milestone.create({
          data: {
            projectId: proj.id,
            name: m.name,
            dueDate: new Date(m.dueDate),
            sortOrder: i,
          },
        })
        milestoneIdMap.set(m.id, milestone.id)
        milestones.push(milestone)
      }

      // 3. Create milestone baselines (snapshot of initial plan)
      for (const milestone of milestones) {
        await tx.milestoneBaseline.create({
          data: {
            projectId: proj.id,
            milestoneId: milestone.id,
            name: milestone.name,
            dueDate: milestone.dueDate,
          },
        })
      }

      // 4. Create tasks (parent tasks first, then subtasks)
      //    Track tempId → realId for resolving subtask parentId
      const taskTempIdMap = new Map<string, string>()
      const tasks = []
      if (body.tasks?.length) {
        // Separate parent tasks and subtasks; create parents first
        const parentTaskInputs = body.tasks.filter((t: Record<string, unknown>) => !t.parentId && !t.parentTempId)
        const subtaskInputs = body.tasks.filter((t: Record<string, unknown>) => t.parentId || t.parentTempId)

        let sortIdx = 0
        for (const t of parentTaskInputs) {
          const dbMilestoneId = milestoneIdMap.get(t.milestoneId)
          if (!dbMilestoneId) continue

          const task = await tx.task.create({
            data: {
              projectId: proj.id,
              milestoneId: dbMilestoneId,
              title: t.title,
              description: t.description || '',
              assignee: t.assignee || '未指派',
              priority: (t.priority as 'low' | 'medium' | 'high') || 'medium',
              durationWeeks: t.durationWeeks || 0,
              startDate: new Date(t.startDate),
              endDate: new Date(t.endDate),
              sortOrder: sortIdx++,
            },
          })
          if (t.tempId) taskTempIdMap.set(t.tempId, task.id)
          tasks.push(task)
        }

        // Create subtasks with resolved parentId
        for (const t of subtaskInputs) {
          const resolvedParentId = t.parentTempId
            ? taskTempIdMap.get(t.parentTempId as string)
            : (t.parentId as string)
          if (!resolvedParentId) continue

          // Inherit milestoneId from parent
          const parent = tasks.find(p => p.id === resolvedParentId)
          const dbMilestoneId = parent?.milestoneId || milestoneIdMap.get(t.milestoneId)
          if (!dbMilestoneId) continue

          const task = await tx.task.create({
            data: {
              projectId: proj.id,
              milestoneId: dbMilestoneId,
              parentId: resolvedParentId,
              title: t.title,
              description: t.description || '',
              assignee: t.assignee || '未指派',
              priority: (t.priority as 'low' | 'medium' | 'high') || 'medium',
              durationWeeks: t.durationWeeks || 0,
              startDate: new Date(t.startDate),
              endDate: new Date(t.endDate),
              sortOrder: sortIdx++,
            },
          })
          if (t.tempId) taskTempIdMap.set(t.tempId, task.id)
        }
      }

      // 5. Auto-create task dependencies based on sequential order
      //    Only parent tasks participate in dependency chains (not subtasks)
      //    Within same milestone: task[i] → task[i+1]
      //    Between milestones: last task of milestone[n] → first task of milestone[n+1]
      const parentTasks = tasks.filter(t => !t.parentId)
      if (parentTasks.length > 1) {
        const tasksByMilestone = new Map<string, typeof parentTasks>()
        for (const task of parentTasks) {
          const list = tasksByMilestone.get(task.milestoneId) || []
          list.push(task)
          tasksByMilestone.set(task.milestoneId, list)
        }

        const orderedMilestoneIds = milestones.map((m) => m.id)
        let prevMilestoneLastTask: (typeof parentTasks)[number] | null = null

        for (const msId of orderedMilestoneIds) {
          const msTasks = tasksByMilestone.get(msId)
          if (!msTasks || msTasks.length === 0) continue

          // Cross-milestone: last task of prev milestone → first task of this milestone
          if (prevMilestoneLastTask) {
            await tx.taskDependency.create({
              data: {
                dependentId: msTasks[0].id,
                prerequisiteId: prevMilestoneLastTask.id,
              },
            })
          }

          // Within milestone: sequential chain
          for (let i = 1; i < msTasks.length; i++) {
            await tx.taskDependency.create({
              data: {
                dependentId: msTasks[i].id,
                prerequisiteId: msTasks[i - 1].id,
              },
            })
          }

          prevMilestoneLastTask = msTasks[msTasks.length - 1]
        }
      }

      // 6. Create risks
      const risks = []
      if (body.risks?.length) {
        for (const r of body.risks) {
          const risk = await tx.risk.create({
            data: {
              projectId: proj.id,
              title: r.title,
              description: r.description || '',
              impact: (r.impact as 'low' | 'medium' | 'high') || 'medium',
              probability: (r.probability as 'low' | 'medium' | 'high') || 'medium',
              mitigation: r.mitigation || '',
              status: (r.status as 'open' | 'mitigated' | 'closed') || 'open',
            },
          })
          risks.push(risk)
        }
      }

      // 7. Create team members
      if (body.teamMembers?.length) {
        for (const tm of body.teamMembers) {
          // Find user by name, or skip
          let memberUser = await tx.user.findFirst({
            where: { name: tm.name },
          })
          if (!memberUser) {
            // Auto-create user as member role
            memberUser = await tx.user.create({
              data: {
                name: tm.name,
                email: `${tm.name.toLowerCase().replace(/\s+/g, '.')}@auto.local`,
                role: 'member',
              },
            })
          }

          await tx.projectTeamMember.upsert({
            where: {
              projectId_userId: {
                projectId: proj.id,
                userId: memberUser.id,
              },
            },
            update: {
              role: tm.role as 'R' | 'A' | 'C' | 'I',
              jobTitle: tm.jobTitle?.trim() || '',
              organization: tm.organization?.trim() || '',
              responsibility: tm.responsibility || '',
            },
            create: {
              projectId: proj.id,
              userId: memberUser.id,
              role: tm.role as 'R' | 'A' | 'C' | 'I',
              jobTitle: tm.jobTitle?.trim() || '',
              organization: tm.organization?.trim() || '',
              responsibility: tm.responsibility || '',
            },
          })
        }
      }

      return { proj, milestones, tasks, risks }
    })

    // ─── Re-fetch with full relations (includes dependencies) ─
    const fullProject = await prisma.project.findUniqueOrThrow({
      where: { id: project.proj.id },
      include: projectFullInclude,
    })

    const feProject = dbProjectToFrontend(
      fullProject as Parameters<typeof dbProjectToFrontend>[0],
    )

    return NextResponse.json(feProject, { status: 201 })
  } catch (error) {
    console.error('Failed to create project:', error)
    return NextResponse.json(
      { error: '建立專案失敗，請稍後再試' },
      { status: 500 },
    )
  }
}

