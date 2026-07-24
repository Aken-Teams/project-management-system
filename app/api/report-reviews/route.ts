import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { safeJsonParse } from '@/lib/utils'
import { isSameUser } from '@/lib/user-match'
import { todayUtc } from '@/lib/date-utils'
import { notifyReportPublishedToAccountable, notifyReportDoneReviewToAccountable } from '@/lib/notifications'

// 本週週一（UTC）YYYY-MM-DD
function thisWeekMonday(): string {
  const now = todayUtc()
  const dow = now.getUTCDay() // 0=Sun..6=Sat
  const diff = dow === 0 ? -6 : 1 - dow
  const mon = new Date(now)
  mon.setUTCDate(now.getUTCDate() + diff)
  return mon.toISOString().slice(0, 10)
}

// R 報告審核主管(R主管)的收件匣：BY 專案 → 各 R → 待審的「任務 × 填報週」報告。
//   待審 = 我督導的成員(其 ProjectTeamMember.reportReviewerEmail = 我) 所寫、
//         尚未核准(publishedAt=null)且未被駁回(reviewerRejectedAt=null) 的 TaskLog。

type Att = { name: string; url: string; type: 'image' | 'file' }

// ─── GET /api/report-reviews?email=<R主管 email> ───
export async function GET(request: NextRequest) {
  const email = request.nextUrl.searchParams.get('email')?.trim()
  if (!email) return NextResponse.json({ isReviewer: false, projects: [] })

  // 我督導的成員（跨專案）
  const supervised = await prisma.projectTeamMember.findMany({
    where: { reportReviewerEmail: email },
    select: { projectId: true, userId: true, project: { select: { name: true } }, user: { select: { name: true, email: true } } },
  })
  if (supervised.length === 0) return NextResponse.json({ isReviewer: false, projects: [] })

  const monday = thisWeekMonday()
  const mondayDate = new Date(monday + 'T00:00:00.000Z')
  const sundayDate = new Date(mondayDate); sundayDate.setUTCDate(mondayDate.getUTCDate() + 7)

  const pairs = supervised.map(m => ({ projectId: m.projectId, authorId: m.userId }))

  // 待審報告（尚未發布、未被駁回）
  const pendingLogs = await prisma.taskLog.findMany({
    where: { publishedAt: null, reviewerRejectedAt: null, OR: pairs },
    select: {
      id: true, projectId: true, authorId: true, taskId: true, weekOf: true,
      logDate: true, content: true, attachments: true, nextPlans: true,
      task: { select: { id: true, title: true, reportedDoneAt: true, completedAt: true } },
    },
    orderBy: { logDate: 'asc' },
  })

  // 本週已送出的報告（用來判斷「本週未送 → 需追」）
  const weekLogs = await prisma.taskLog.findMany({
    where: { OR: pairs, weekOf: monday },
    select: { projectId: true, authorId: true },
  })
  // 相容舊資料(無 weekOf)：以 logDate 落在本週判斷
  const weekLogsByDate = await prisma.taskLog.findMany({
    where: { OR: pairs, weekOf: null, logDate: { gte: mondayDate, lt: sundayDate } },
    select: { projectId: true, authorId: true },
  })
  const submittedSet = new Set<string>()
  for (const w of [...weekLogs, ...weekLogsByDate]) submittedSet.add(`${w.projectId}:${w.authorId}`)

  // 進行中任務數（供「需追」判斷）：該專案 status!=done 的任務，assignee 對到該 R
  const projectIds = [...new Set(supervised.map(m => m.projectId))]
  const openTasks = await prisma.task.findMany({
    where: { projectId: { in: projectIds }, status: { not: 'done' } },
    select: { projectId: true, assignee: true },
  })

  // 分組：project → reviewee(R) → { pending submissions, submittedThisWeek, openTaskCount }
  type Sub = { taskId: string; taskTitle: string; weekOf: string | null; reportedDone: boolean; logs: { id: string; logDate: string; content: string; attachments: Att[]; nextPlans: { date?: string; content: string }[] }[] }
  type Reviewee = { authorId: string; authorName: string; authorEmail: string; pending: Sub[]; submittedThisWeek: boolean; openTaskCount: number }
  const projMap = new Map<string, { projectId: string; projectName: string; reviewees: Map<string, Reviewee> }>()

  for (const m of supervised) {
    let p = projMap.get(m.projectId)
    if (!p) { p = { projectId: m.projectId, projectName: m.project.name, reviewees: new Map() }; projMap.set(m.projectId, p) }
    if (!p.reviewees.has(m.userId)) {
      const openTaskCount = openTasks.filter(t => t.projectId === m.projectId && isSameUser(t.assignee, { name: m.user.name, email: m.user.email })).length
      p.reviewees.set(m.userId, {
        authorId: m.userId, authorName: m.user.name, authorEmail: m.user.email,
        pending: [], submittedThisWeek: submittedSet.has(`${m.projectId}:${m.userId}`), openTaskCount,
      })
    }
  }

  // 塞入待審 submissions
  const subMap = new Map<string, Sub>() // key: project:author:task:week
  for (const l of pendingLogs) {
    if (l.task.completedAt) continue
    const p = projMap.get(l.projectId); if (!p) continue
    const rv = p.reviewees.get(l.authorId); if (!rv) continue
    const week = l.weekOf || null
    const key = `${l.projectId}:${l.authorId}:${l.taskId}:${week ?? '_'}`
    let s = subMap.get(key)
    if (!s) {
      s = { taskId: l.taskId, taskTitle: l.task.title, weekOf: week, reportedDone: !!l.task.reportedDoneAt, logs: [] }
      subMap.set(key, s)
      rv.pending.push(s)
    }
    s.logs.push({
      id: l.id,
      logDate: l.logDate.toISOString().split('T')[0],
      content: l.content,
      attachments: safeJsonParse<Att[]>(l.attachments, []),
      nextPlans: safeJsonParse<{ date?: string; content: string }[]>(l.nextPlans, []),
    })
  }

  const projects = Array.from(projMap.values()).map(p => ({
    projectId: p.projectId,
    projectName: p.projectName,
    reviewees: Array.from(p.reviewees.values()),
  }))

  return NextResponse.json({ isReviewer: true, weekOf: monday, projects })
}

// ─── POST /api/report-reviews — 核准 / 駁回一筆 submission ───
interface ActionBody {
  reviewerEmail: string
  projectId: string
  taskId: string
  authorId: string
  weekOf?: string | null
  action: 'approve' | 'reject'
  note?: string
}

export async function POST(request: NextRequest) {
  try {
    const body: ActionBody = await request.json()
    const { reviewerEmail, projectId, taskId, authorId, action } = body
    if (!reviewerEmail || !projectId || !taskId || !authorId || !action) {
      return NextResponse.json({ error: '必填欄位不完整' }, { status: 400 })
    }

    // 授權：呼叫者必須是「該作者(R)在此專案的報告審核主管」
    const authorMember = await prisma.projectTeamMember.findFirst({
      where: { projectId, userId: authorId },
      select: { reportReviewerEmail: true },
    })
    if (!authorMember?.reportReviewerEmail || authorMember.reportReviewerEmail.toLowerCase() !== reviewerEmail.toLowerCase()) {
      return NextResponse.json({ error: '你不是該成員的報告審核主管，無權審核' }, { status: 403 })
    }

    const reviewer = await prisma.user.findUnique({ where: { email: reviewerEmail }, select: { name: true } })
    const reviewerName = reviewer?.name || reviewerEmail

    // 目標：該 submission 中仍待審的 log（同專案/任務/作者/填報週）
    const week = body.weekOf ?? null
    const targetWhere = {
      projectId, taskId, authorId,
      weekOf: week,
      publishedAt: null,
      reviewerRejectedAt: null,
    }

    if (action === 'approve') {
      const now = new Date()
      const res = await prisma.taskLog.updateMany({
        where: targetWhere,
        data: { publishedAt: now, publishedBy: reviewerName },
      })
      // 審視歷程
      await prisma.taskReviewEvent.create({ data: { taskId, projectId, type: 'report_approved', actor: reviewerName, note: null } }).catch(() => {})
      // 通知：A 知道已進更新紀錄；若該任務已回報100%，另通知 A 審核完成
      const proj = await prisma.project.findUnique({ where: { id: projectId }, select: { name: true } })
      const task = await prisma.task.findUnique({ where: { id: taskId }, select: { title: true, reportedDoneAt: true, completedAt: true } })
      const author = await prisma.user.findUnique({ where: { id: authorId }, select: { name: true } })
      const ctx = { projectId, projectName: proj?.name || '專案', rName: author?.name || '成員', taskTitle: task?.title || '任務' }
      await notifyReportPublishedToAccountable(ctx)
      if (task?.reportedDoneAt && !task.completedAt) {
        await notifyReportDoneReviewToAccountable(ctx)
      }
      return NextResponse.json({ success: true, published: res.count })
    }

    // reject
    if (!body.note?.trim()) {
      return NextResponse.json({ error: '駁回需填寫原因' }, { status: 400 })
    }
    const res = await prisma.taskLog.updateMany({
      where: targetWhere,
      data: { reviewerRejectedAt: new Date(), reviewerRejectedBy: reviewerName, reviewerNote: body.note.trim() },
    })
    await prisma.taskReviewEvent.create({ data: { taskId, projectId, type: 'report_rejected', actor: reviewerName, note: body.note.trim() } }).catch(() => {})
    return NextResponse.json({ success: true, rejected: res.count })
  } catch (error) {
    console.error('report-review action failed:', error)
    return NextResponse.json({ error: '審核操作失敗' }, { status: 500 })
  }
}
