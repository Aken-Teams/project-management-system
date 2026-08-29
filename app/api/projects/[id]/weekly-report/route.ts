import { NextRequest, NextResponse } from 'next/server'
import { safeJsonParse } from '@/lib/utils'
import { prisma } from '@/lib/db'
import { isReportVisible } from '@/lib/report-cutoff'
import { syncTaskProgressFromLogs, syncMilestoneStatus } from '@/lib/sync-milestone-status'
import { notifyWeeklyReportReady } from '@/lib/notifications'

type RouteContext = { params: Promise<{ id: string }> }

function weekBounds(weekOf: string) {
  const start = new Date(weekOf)
  const end = new Date(weekOf)
  end.setDate(end.getDate() + 6)
  end.setHours(23, 59, 59, 999)
  return { start, end }
}

// GET /api/projects/[id]/weekly-report?weekOf=YYYY-MM-DD&authorId=...
// 回傳：A 本週已寫的報告(依任務)+ 彙整說明，供撰寫台回填
export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params
    const weekOf = request.nextUrl.searchParams.get('weekOf')
    const authorId = request.nextUrl.searchParams.get('authorId') || ''
    // 無 weekOf：回傳整個專案的彙整說明（供「更新紀錄」逐週顯示父層/專案彙整）
    if (!weekOf) {
      const allNotes = await prisma.weeklyReportNote.findMany({ where: { projectId: id }, orderBy: { weekOf: 'desc' } })
      return NextResponse.json({
        aLogs: [],
        notes: allNotes.map(n => ({ weekOf: n.weekOf, taskId: n.taskId, content: n.content, author: n.author, submittedAt: n.submittedAt?.toISOString() ?? null })),
      })
    }
    const { start, end } = weekBounds(weekOf)

    // 依填報週載入 A 的報告（新資料有 weekOf）；舊資料無 weekOf 則退回用 logDate 落點
    const aLogs = authorId
      ? await prisma.taskLog.findMany({
          where: { projectId: id, authorId, OR: [{ weekOf }, { weekOf: null, logDate: { gte: start, lte: end } }] },
          orderBy: { logDate: 'asc' },
        })
      : []

    const notes = await prisma.weeklyReportNote.findMany({ where: { projectId: id, weekOf } })

    return NextResponse.json({
      aLogs: aLogs.map(l => ({
        id: l.id, taskId: l.taskId, logDate: l.logDate.toISOString().split('T')[0], content: l.content,
        attachments: l.attachments ? safeJsonParse(l.attachments, [] as unknown[]) : [],
        nextPlans: l.nextPlans ? safeJsonParse(l.nextPlans, [] as unknown[]) : [],
      })),
      notes: notes.map(n => ({ taskId: n.taskId, content: n.content })),
    })
  } catch (error) {
    console.error('Failed to load weekly report:', error)
    return NextResponse.json({ error: '載入週報失敗' }, { status: 500 })
  }
}

interface TaskEntry {
  taskId: string
  entries: { logDate: string; content: string; attachments?: { name: string; url: string; type: 'image' | 'file' }[] }[]
  nextPlans?: { content: string }[]
}
interface Body {
  weekOf: string
  actor?: string       // A 姓名
  authorId?: string    // A 的 userId（建立紀錄用）
  taskEntries?: TaskEntry[]
  notes?: { taskId?: string; content: string }[]
  submit?: boolean     // true = 正式送出（發布到更新紀錄）
}

// POST — A 送出/儲存本週報告（A 逐任務寫的報告；送出即發布 + 帶動進度）
export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params
    const body: Body = await request.json()
    if (!body.weekOf) return NextResponse.json({ error: '缺少 weekOf' }, { status: 400 })
    if (!body.authorId) return NextResponse.json({ error: '缺少 authorId' }, { status: 400 })
    const nowPublish = body.submit ? new Date() : null

    const touchedTaskIds = new Set<string>()

    for (const te of (body.taskEntries || [])) {
      const validEntries = te.entries.filter(e => e.content.trim() && e.logDate)
      const validPlans = (te.nextPlans || []).filter(p => p.content.trim())
      for (const e of validEntries) {
        const attachmentsJson = e.attachments?.length ? JSON.stringify(e.attachments) : undefined
        // 同任務+同日+同作者(A) 視為同一筆
        const existing = await prisma.taskLog.findFirst({
          where: { taskId: te.taskId, authorId: body.authorId, logDate: new Date(e.logDate) },
        })
        if (existing) {
          await prisma.taskLog.update({
            where: { id: existing.id },
            data: {
              // 從撰寫台寫的一律標記——不論是新建還是改既有那筆。漏標的話它會被當成
              // 執行者交的報告，跑進「待審」而永遠沒人審。
              content: e.content.trim(), lastEditedBy: body.actor || '', weekOf: body.weekOf, reportOnly: true,
              ...(attachmentsJson !== undefined ? { attachments: attachmentsJson } : {}),
              ...(nowPublish ? { publishedAt: nowPublish, publishedBy: body.actor || '' } : {}),
            },
          })
        } else {
          await prisma.taskLog.create({
            data: {
              taskId: te.taskId, projectId: id, authorId: body.authorId,
              logDate: new Date(e.logDate), content: e.content.trim(), reportOnly: true, weekOf: body.weekOf,
              ...(attachmentsJson !== undefined ? { attachments: attachmentsJson } : {}),
              ...(nowPublish ? { publishedAt: nowPublish, publishedBy: body.actor || '' } : {}),
            },
          })
        }
        touchedTaskIds.add(te.taskId)
      }
      // nextPlans 掛到本週最後一筆
      if (validPlans.length && validEntries.length) {
        const latestDate = [...validEntries].sort((a, b) => b.logDate.localeCompare(a.logDate))[0].logDate
        const latest = await prisma.taskLog.findFirst({ where: { taskId: te.taskId, authorId: body.authorId, logDate: new Date(latestDate) } })
        if (latest) await prisma.taskLog.update({ where: { id: latest.id }, data: { nextPlans: JSON.stringify(validPlans) } })
      }
    }

    // 彙整說明（父任務 / 專案層）
    for (const n of (body.notes || [])) {
      const taskId = n.taskId || ''
      const content = (n.content || '').trim()
      const existing = await prisma.weeklyReportNote.findUnique({ where: { projectId_weekOf_taskId: { projectId: id, weekOf: body.weekOf, taskId } } })
      if (!content && !existing) continue
      await prisma.weeklyReportNote.upsert({
        where: { projectId_weekOf_taskId: { projectId: id, weekOf: body.weekOf, taskId } },
        update: { content, author: body.actor || '', ...(body.submit ? { submittedAt: new Date() } : {}) },
        create: { projectId: id, weekOf: body.weekOf, taskId, content, author: body.actor || '', ...(body.submit ? { submittedAt: new Date() } : {}) },
      })
    }

    // 送出後：讓報告日期驅動時間進度（報告 log 也算），並更新受影響里程碑
    if (body.submit && touchedTaskIds.size > 0) {
      const allTasks = await prisma.task.findMany({
        where: { projectId: id },
        select: { id: true, parentId: true, milestoneId: true, durationDays: true, startDate: true, endDate: true, originalStartDate: true, progress: true, completedAt: true, assignee: true },
      })
      // 與 task-logs / my-tasks / projects 一致：只有已核准（或 7/12 前的舊資料）才驅動進度。
      //   不濾的話，當責在撰寫台按「儲存草稿」，那筆還沒送出的補充就會先把進度推上去，
      //   下次載入又用已核准重算掉回來——進度會來回跳。
      const allLogs = (await prisma.taskLog.findMany({
        where: { projectId: id },
        select: { taskId: true, logDate: true, createdAt: true, publishedAt: true, postDoneSupplement: true, author: { select: { name: true } } },
      })).filter(isReportVisible)
      await syncTaskProgressFromLogs(allTasks, allLogs)
      const affectedMs = new Set(allTasks.filter(t => touchedTaskIds.has(t.id)).map(t => t.milestoneId))
      for (const msId of affectedMs) await syncMilestoneStatus(msId, id)
    }

    // A 送出本週報告 → 通知該專案所有成員（含 R），讓大家知道 A 寫了什麼
    if (body.submit) {
      const proj = await prisma.project.findUnique({ where: { id }, select: { name: true } })
      await notifyWeeklyReportReady({
        projectId: id,
        projectName: proj?.name || '專案',
        actorName: body.actor || '當責',
        actorUserId: body.authorId,
        weekOf: body.weekOf,
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to save weekly report:', error)
    return NextResponse.json({ error: '儲存週報失敗' }, { status: 500 })
  }
}
