import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { syncTaskProgressFromLogs, syncMilestoneStatus } from '@/lib/sync-milestone-status'

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

    const aLogs = authorId
      ? await prisma.taskLog.findMany({
          where: { projectId: id, authorId, logDate: { gte: start, lte: end } },
          orderBy: { logDate: 'asc' },
        })
      : []

    const notes = await prisma.weeklyReportNote.findMany({ where: { projectId: id, weekOf } })

    return NextResponse.json({
      aLogs: aLogs.map(l => ({
        id: l.id, taskId: l.taskId, logDate: l.logDate.toISOString().split('T')[0], content: l.content,
        attachments: l.attachments ? JSON.parse(l.attachments) : [],
        nextPlans: l.nextPlans ? JSON.parse(l.nextPlans) : [],
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
              content: e.content.trim(), lastEditedBy: body.actor || '',
              ...(attachmentsJson !== undefined ? { attachments: attachmentsJson } : {}),
              ...(nowPublish ? { publishedAt: nowPublish, publishedBy: body.actor || '' } : {}),
            },
          })
        } else {
          await prisma.taskLog.create({
            data: {
              taskId: te.taskId, projectId: id, authorId: body.authorId,
              logDate: new Date(e.logDate), content: e.content.trim(), reportOnly: true,
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

    // 註：A 的報告是「敘述」(reportOnly)，不驅動進度。進度只由標記完成/延期決定。

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to save weekly report:', error)
    return NextResponse.json({ error: '儲存週報失敗' }, { status: 500 })
  }
}
