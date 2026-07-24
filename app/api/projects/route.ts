import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import {
  projectTypeToDb,
  projectTierToDb,
  demandSourceToDb,
} from '@/lib/enum-mappers'

const AD_URL = process.env.AD_URL
const AD_API = process.env.AD_API

async function resolveAdEmail(name: string): Promise<string | null> {
  if (!AD_URL || !AD_API) return null
  try {
    // Fetch AD org tree → find member by displayName → get employee ID → fetch email
    const searchRes = await fetch(
      `${AD_URL}/ldap/api/v1/organizations/tree?domain=PANJIT`,
      { headers: { 'X-API-Key': AD_API } }
    )
    if (!searchRes.ok) return null
    const data = await searchRes.json()
    const members: { username: string; displayName: string }[] = []
    const flatten = (node: { members?: { username: string; displayName: string }[]; children?: unknown[] }) => {
      if (node.members) members.push(...node.members)
      if (node.children) (node.children as typeof node[]).forEach(flatten)
    }
    if (data.tree) flatten(data.tree)
    const match = members.find(m => m.displayName.toLowerCase() === name.toLowerCase())
    if (!match) return null
    // Use employee ID (工號) to fetch user detail
    const userRes = await fetch(
      `${AD_URL}/ldap/api/v1/users/${encodeURIComponent(match.username)}`,
      { headers: { 'X-API-Key': AD_API } }
    )
    if (!userRes.ok) return null
    const userData = await userRes.json()
    return userData?.user?.mail || null
  } catch {
    return null
  }
}
import { dbProjectToFrontend, projectFullInclude } from '@/lib/project-transformer'
import { notifyTasksAssignedOnCreate } from '@/lib/notifications'
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

import { generateCodePrefix, BUILTIN_CODE_PREFIX } from '@/lib/code-prefix'

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
  teamMembers?: { name: string; role: string; jobTitle?: string; organization?: string; responsibility: string; email?: string; reportReviewerName?: string; reportReviewerEmail?: string }[]
  milestones: { id: string; name: string; dueDate: string; startDate?: string }[]
  tasks?: {
    milestoneId: string
    title: string
    description: string
    assignee: string
    priority: string
    durationDays: number
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
  budgetItems?: {
    station?: string
    vendor?: string
    equipment: string
    quantity?: number
    purchaseType?: string
    unitPrice?: number | null
    estimatedCost?: number | null
    actualCost?: number | null
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
    // Look up prefix from DB first, then fallback to built-in map, then auto-generate
    const typeConfig = await prisma.projectTypeConfig.findUnique({
      where: { key: dbProjectType },
      select: { codePrefix: true, label: true },
    })
    const prefix = typeConfig?.codePrefix
      ?? BUILTIN_CODE_PREFIX[dbProjectType]
      ?? generateCodePrefix(typeConfig?.label ?? dbProjectType)

    // When no sequence record exists (e.g. after a DB migration), initialize
    // from the highest existing project code to avoid unique constraint conflicts
    const existingSeq = await prisma.projectCodeSequence.findUnique({
      where: { projectType_year: { projectType: dbProjectType, year: currentYear } },
    })

    let initSeq = 1
    if (!existingSeq) {
      const maxProject = await prisma.project.findFirst({
        where: { projectCode: { startsWith: `${prefix}-${currentYear}-` } },
        orderBy: { projectCode: 'desc' },
        select: { projectCode: true },
      })
      if (maxProject) {
        initSeq = parseInt(maxProject.projectCode.split('-').pop() || '0', 10) + 1
      }
    }

    const sequence = await prisma.projectCodeSequence.upsert({
      where: { projectType_year: { projectType: dbProjectType, year: currentYear } },
      update: { lastSeq: { increment: 1 } },
      create: { projectType: dbProjectType, year: currentYear, lastSeq: initSeq },
    })

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
            startDate: m.startDate ? new Date(m.startDate) : undefined,
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
      const taskMsMap = new Map<string, string>() // created task id → its milestoneId (any depth)
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
              durationDays: t.durationDays || 0,
              startDate: new Date(t.startDate),
              endDate: new Date(t.endDate),
              sortOrder: sortIdx++,
            },
          })
          if (t.tempId) taskTempIdMap.set(t.tempId, task.id)
          taskMsMap.set(task.id, dbMilestoneId)
          tasks.push(task)
        }

        // Create subtasks with resolved parentId — multi-pass so ANY nesting depth
        // works regardless of input order (a child is always created after its
        // parent, whose real id must be resolved first). (ADR-02)
        let remaining = subtaskInputs
        let guard = 0
        while (remaining.length && guard++ < 20) {
          const pending: typeof remaining = []
          for (const t of remaining) {
            const resolvedParentId = t.parentTempId
              ? taskTempIdMap.get(t.parentTempId as string)
              : (t.parentId as string)
            if (!resolvedParentId) { pending.push(t); continue }

            // Inherit milestoneId from the (already-created) parent, any depth.
            const dbMilestoneId = taskMsMap.get(resolvedParentId) || milestoneIdMap.get(t.milestoneId as string)
            if (!dbMilestoneId) { pending.push(t); continue }

            const task = await tx.task.create({
              data: {
                projectId: proj.id,
                milestoneId: dbMilestoneId,
                parentId: resolvedParentId,
                title: t.title,
                description: t.description || '',
                assignee: t.assignee || '未指派',
                priority: (t.priority as 'low' | 'medium' | 'high') || 'medium',
                durationDays: t.durationDays || 0,
                startDate: new Date(t.startDate),
                endDate: new Date(t.endDate),
                sortOrder: sortIdx++,
              },
            })
            if (t.tempId) taskTempIdMap.set(t.tempId as string, task.id)
            taskMsMap.set(task.id, dbMilestoneId) // so deeper children resolve their milestone
          }
          if (pending.length === remaining.length) break // no progress → unresolvable
          remaining = pending
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
          // Find user by email first (most reliable), then by name
          let memberUser = tm.email
            ? await tx.user.findUnique({ where: { email: tm.email } })
            : null
          if (!memberUser) {
            memberUser = await tx.user.findFirst({ where: { name: tm.name } })
          }
          if (!memberUser) {
            // Resolve real email: use provided email, or look up via AD
            let resolvedEmail = tm.email && tm.email.includes('@') && !tm.email.endsWith('@auto.local')
              ? tm.email
              : null
            if (!resolvedEmail) {
              resolvedEmail = await resolveAdEmail(tm.name)
            }
            const finalEmail = resolvedEmail
              || `${tm.name.toLowerCase().replace(/\s+/g, '.')}@auto.local`
            // Check if a user with that email already exists (e.g. from AD login)
            memberUser = await tx.user.findUnique({ where: { email: finalEmail } })
            if (!memberUser) {
              memberUser = await tx.user.create({
                data: {
                  name: tm.name,
                  email: finalEmail,
                  role: 'member',
                  jobTitle: tm.jobTitle?.trim() || '',
                  organization: tm.organization?.trim() || '',
                },
              })
            }
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
              reportReviewerName: tm.reportReviewerName?.trim() || null,
              reportReviewerEmail: tm.reportReviewerEmail?.trim() || null,
            },
            create: {
              projectId: proj.id,
              userId: memberUser.id,
              role: tm.role as 'R' | 'A' | 'C' | 'I',
              jobTitle: tm.jobTitle?.trim() || '',
              organization: tm.organization?.trim() || '',
              responsibility: tm.responsibility || '',
              reportReviewerName: tm.reportReviewerName?.trim() || null,
              reportReviewerEmail: tm.reportReviewerEmail?.trim() || null,
            },
          })
        }
      }

      // 8. Create budget items
      if (body.budgetItems?.length) {
        await tx.projectBudgetItem.createMany({
          data: body.budgetItems.map((item, i) => ({
            projectId: proj.id,
            station: item.station ?? '',
            vendor: item.vendor ?? '',
            equipment: item.equipment ?? '',
            quantity: item.quantity ?? 1,
            purchaseType: item.purchaseType ?? '',
            unitPrice: item.unitPrice ?? null,
            estimatedCost: item.estimatedCost ?? null,
            actualCost: item.actualCost ?? null,
            sortOrder: i,
          })),
        })
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

    // 建案完成 → 通知被指派者（每人一則彙總，站內通知不受草稿/開案影響）
    if (body.tasks?.length) {
      notifyTasksAssignedOnCreate({
        projectId: fullProject.id,
        projectName: fullProject.name,
        assignees: body.tasks.map((t: Record<string, unknown>) => t.assignee as string | undefined),
      }).catch((e) => console.error('notifyTasksAssignedOnCreate failed', e))
    }

    return NextResponse.json(feProject, { status: 201 })
  } catch (error) {
    console.error('Failed to create project:', error)
    return NextResponse.json(
      { error: '建立專案失敗，請稍後再試' },
      { status: 500 },
    )
  }
}

