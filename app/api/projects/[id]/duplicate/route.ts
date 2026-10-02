import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// ─── POST /api/projects/[id]/duplicate ───────────────────
// 以現有專案為範本複製一份。基本資料一律帶，其餘由呼叫端勾選。
//   只有 admin / pm 能用——複製會一次生出整組里程碑與任務，
//   讓一般成員也能按等於開放任何人灌爆專案清單。

type Opts = {
  name?: string
  milestones?: boolean   // 里程碑與任務（含子任務、相依）
  team?: boolean         // 團隊成員與報告審核主管設定
  risks?: boolean        // 風險
  budget?: boolean       // 投資設備清單
  capex?: boolean        // 採購明細
  smart?: boolean        // SMART 與專案說明文字
}

/** 複製時一律歸零的欄位：這些是「執行過程」產生的，不該跟著範本走。 */
const RESET_TASK = {
  status: 'todo' as const,
  progress: 0,
  completedAt: null,
  completedBy: null,
  reportedDoneAt: null,
  reportedDoneBy: null,
  reviewedAt: null,
  reviewedBy: null,
  originalStartDate: null,
  originalEndDate: null,
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const email = request.headers.get('x-user-email')?.toLowerCase()
  if (!email) return NextResponse.json({ error: '未提供身分' }, { status: 401 })

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, role: true, name: true } })
  if (!user) return NextResponse.json({ error: '找不到使用者' }, { status: 403 })
  if (user.role !== 'admin' && user.role !== 'pm') {
    return NextResponse.json({ error: '只有系統管理員或專案經理可以複製專案' }, { status: 403 })
  }

  const opts: Opts = await request.json().catch(() => ({}))

  const src = await prisma.project.findUnique({
    where: { id },
    include: {
      milestones: { orderBy: { sortOrder: 'asc' } },
      tasks: { orderBy: { sortOrder: 'asc' } },
      teamMembers: true,
      risks: true,
      budgetItems: true,
      capexItems: true,
    },
  })
  if (!src) return NextResponse.json({ error: '找不到來源專案' }, { status: 404 })

  // ── 新專案編號：沿用建立專案那套序號，避免與既有編號衝突 ──
  const year = new Date().getFullYear()
  const prefix = src.projectCode.split('-')[0]
  const existingSeq = await prisma.projectCodeSequence.findUnique({
    where: { projectType_year: { projectType: src.projectType, year } },
  })
  let initSeq = 1
  if (!existingSeq) {
    const maxProject = await prisma.project.findFirst({
      where: { projectCode: { startsWith: `${prefix}-${year}-` } },
      orderBy: { projectCode: 'desc' },
      select: { projectCode: true },
    })
    if (maxProject) initSeq = parseInt(maxProject.projectCode.split('-').pop() || '0', 10) + 1
  }
  const sequence = await prisma.projectCodeSequence.upsert({
    where: { projectType_year: { projectType: src.projectType, year } },
    update: { lastSeq: { increment: 1 } },
    create: { projectType: src.projectType, year, lastSeq: initSeq },
  })
  const projectCode = `${prefix}-${year}-${String(sequence.lastSeq).padStart(3, '0')}`

  try {
    const created = await prisma.$transaction(async (tx) => {
      const proj = await tx.project.create({
        data: {
          projectCode,
          projectType: src.projectType,
          projectTier: src.projectTier,
          demandSource: src.demandSource,
          name: (opts.name?.trim() || `${src.name} (複製)`).slice(0, 200),
          objective: src.objective,
          purpose: src.purpose,
          scope: src.scope,
          roi: opts.smart ? src.roi : '',
          roiGrossMargin: opts.smart ? src.roiGrossMargin : null,
          roiAvgPrice: opts.smart ? src.roiAvgPrice : null,
          roiCapacity: opts.smart ? src.roiCapacity : null,
          createdReason: src.createdReason,
          expectedBenefits: opts.smart ? src.expectedBenefits : null,
          smartSpecific: opts.smart ? src.smartSpecific : null,
          smartMeasurable: opts.smart ? src.smartMeasurable : null,
          smartAchievable: opts.smart ? src.smartAchievable : null,
          smartRelevant: opts.smart ? src.smartRelevant : null,
          smartTimeBound: opts.smart ? src.smartTimeBound : null,
          startDate: src.startDate,
          endDate: src.endDate,
          // 複製出來的一律是草稿：開案與否要由人決定，不該跟著範本自動變成進行中
          phase: 'draft',
          budget: opts.budget ? src.budget : 0,
          // 擁有者改成按下複製的人，不是原專案的擁有者
          ownerId: user.id,
        },
      })

      // ── 里程碑與任務 ──
      if (opts.milestones) {
        const msIdMap = new Map<string, string>()
        for (const m of src.milestones) {
          const nm = await tx.milestone.create({
            data: {
              projectId: proj.id, name: m.name,
              startDate: m.startDate, dueDate: m.dueDate,
              sortOrder: m.sortOrder, status: 'todo', manualDates: m.manualDates,
            },
          })
          msIdMap.set(m.id, nm.id)
        }
        // 先建全部任務（父子關係第二輪再補，來源順序不保證父在子前）
        const taskIdMap = new Map<string, string>()
        for (const t of src.tasks) {
          const newMsId = msIdMap.get(t.milestoneId)
          if (!newMsId) continue
          const nt = await tx.task.create({
            data: {
              projectId: proj.id, milestoneId: newMsId,
              title: t.title,
              // 指派人跟著「複製成員」一起決定：沒複製成員卻留著名字，會變成指派給不在團隊裡的人
              assignee: opts.team ? t.assignee : '',
              priority: t.priority,
              startDate: t.startDate, endDate: t.endDate,
              durationDays: t.durationDays, sortOrder: t.sortOrder,
              ...RESET_TASK,
            },
          })
          taskIdMap.set(t.id, nt.id)
        }
        for (const t of src.tasks) {
          const nid = taskIdMap.get(t.id)
          if (!nid || !t.parentId) continue
          const np = taskIdMap.get(t.parentId)
          if (np) await tx.task.update({ where: { id: nid }, data: { parentId: np } })
        }
      }

      if (opts.team) {
        for (const tm of src.teamMembers) {
          await tx.projectTeamMember.create({
            data: {
              projectId: proj.id, userId: tm.userId, role: tm.role,
              reportReviewerName: tm.reportReviewerName, reportReviewerEmail: tm.reportReviewerEmail,
            },
          })
        }
      }

      if (opts.risks) {
        for (const r of src.risks) {
          await tx.risk.create({
            data: {
              projectId: proj.id, title: r.title, description: r.description, impact: r.impact,
              probability: r.probability, mitigation: r.mitigation, status: r.status,
            },
          })
        }
      }

      if (opts.budget) {
        for (const b of src.budgetItems) {
          await tx.projectBudgetItem.create({
            data: {
              projectId: proj.id, station: b.station, vendor: b.vendor, equipment: b.equipment,
              quantity: b.quantity, purchaseType: b.purchaseType,
              unitPrice: b.unitPrice, estimatedCost: b.estimatedCost,
              // 實際花費是執行結果，不複製
              actualCost: null, sortOrder: b.sortOrder,
            },
          })
        }
      }

      if (opts.capex) {
        for (const c of src.capexItems) {
          const { id: _omit, projectId: _omit2, createdAt: _omit3, updatedAt: _omit4, ...rest } = c
          await tx.capexItem.create({ data: { ...rest, projectId: proj.id } })
        }
      }

      return proj
    }, { timeout: 120000 })

    return NextResponse.json({
      success: true,
      id: created.id,
      projectCode: created.projectCode,
      name: created.name,
    })
  } catch (e) {
    console.error('duplicate project failed:', e)
    return NextResponse.json({ error: '複製失敗，請稍後再試' }, { status: 500 })
  }
}
