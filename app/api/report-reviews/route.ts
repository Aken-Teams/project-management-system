import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { safeJsonParse } from '@/lib/utils'
import { isSameUser } from '@/lib/user-match'
import { todayUtc } from '@/lib/date-utils'
import { notifyReportPublishedToAccountable, notifyReportDoneReviewToAccountable } from '@/lib/notifications'
import { weekEndOf, shouldTrackReport, isOverdueForWeek, reportCountsForWeek } from '@/lib/report-tracking'

const fmt = (d: Date) => d.toISOString().slice(0, 10)

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

  // 已審核的報告（已發布=通過，或被駁回）— 近 60 天，供「已審核」分頁
  const sixtyDaysAgo = new Date(); sixtyDaysAgo.setUTCDate(sixtyDaysAgo.getUTCDate() - 60)
  const reviewedLogs = await prisma.taskLog.findMany({
    where: {
      AND: [
        { OR: pairs },
        { OR: [{ publishedAt: { not: null } }, { reviewerRejectedAt: { not: null } }] },
        { updatedAt: { gte: sixtyDaysAgo } },
      ],
    },
    select: {
      id: true, projectId: true, authorId: true, taskId: true, weekOf: true,
      logDate: true, content: true, attachments: true, nextPlans: true,
      publishedAt: true, publishedBy: true, reviewerRejectedAt: true, reviewerNote: true,
      task: { select: { title: true } },
    },
    orderBy: { updatedAt: 'desc' },
    take: 300,
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

  // ── 填報追蹤（依 ?week 指定週，預設本週）：每個督導成員在該週「該填卻未填」的任務 ──
  const trackWeek = request.nextUrl.searchParams.get('week')?.trim() || monday
  const trackEnd = weekEndOf(trackWeek)
  const trackStartDate = new Date(trackWeek + 'T00:00:00.000Z')
  const trackEndExclusive = new Date(trackStartDate); trackEndExclusive.setUTCDate(trackStartDate.getUTCDate() + 7)

  // 追蹤範圍內所有任務（含祖先，用來組階層路徑 ctx）
  const trackTasks = await prisma.task.findMany({
    where: { projectId: { in: projectIds } },
    select: {
      id: true, projectId: true, title: true, assignee: true, status: true, parentId: true, sortOrder: true,
      startDate: true, endDate: true, completedAt: true, reportedDoneAt: true,
      milestone: { select: { name: true } },
    },
  })
  // 該週的報告（用來判斷已填）：weekOf=該週 或 舊資料(無 weekOf)且 logDate 落在該週
  const trackLogs = await prisma.taskLog.findMany({
    where: {
      projectId: { in: projectIds },
      OR: [
        { weekOf: trackWeek },
        { weekOf: null, logDate: { gte: trackStartDate, lt: trackEndExclusive } },
      ],
    },
    select: { taskId: true, authorId: true, weekOf: true, logDate: true },
  })
  // 每專案 id→task 索引，供 ctx 祖先鏈
  const taskIdxByProject = new Map<string, Map<string, (typeof trackTasks)[number]>>()
  for (const t of trackTasks) {
    let mp = taskIdxByProject.get(t.projectId)
    if (!mp) { mp = new Map(); taskIdxByProject.set(t.projectId, mp) }
    mp.set(t.id, t)
  }
  const ctxOf = (t: (typeof trackTasks)[number]) => {
    const idx = taskIdxByProject.get(t.projectId)
    const anc: string[] = []
    let cur = t.parentId ? idx?.get(t.parentId) : undefined
    while (cur) { anc.unshift(cur.title); cur = cur.parentId ? idx?.get(cur.parentId) : undefined }
    return [t.milestone?.name, ...anc].filter(Boolean).join(' › ')
  }

  // 分組：project → reviewee(R) → { pending submissions, submittedThisWeek, openTaskCount }
  type LogItem = { id: string; logDate: string; content: string; attachments: Att[]; nextPlans: { date?: string; content: string }[] }
  type Sub = { taskId: string; taskTitle: string; weekOf: string | null; reportedDone: boolean; logs: LogItem[] }
  type ReviewedSub = { taskId: string; taskTitle: string; weekOf: string | null; outcome: 'approved' | 'rejected'; note: string | null; reviewedAt: string; logs: LogItem[] }
  type TrackItem = { taskId: string; taskTitle: string; ctx: string; planStart: string; planEnd: string; overdue: boolean; reportedDone: boolean; filled: boolean }
  type Reviewee = { authorId: string; authorName: string; authorEmail: string; pending: Sub[]; reviewed: ReviewedSub[]; submittedThisWeek: boolean; openTaskCount: number; tracking: TrackItem[] }
  const projMap = new Map<string, { projectId: string; projectName: string; reviewees: Map<string, Reviewee> }>()

  for (const m of supervised) {
    let p = projMap.get(m.projectId)
    if (!p) { p = { projectId: m.projectId, projectName: m.project.name, reviewees: new Map() }; projMap.set(m.projectId, p) }
    if (!p.reviewees.has(m.userId)) {
      const openTaskCount = openTasks.filter(t => t.projectId === m.projectId && isSameUser(t.assignee, { name: m.user.name, email: m.user.email })).length
      // 該成員在 trackWeek「該填」的任務 + 是否已填
      const tracking: TrackItem[] = trackTasks
        .filter(t => t.projectId === m.projectId
          && isSameUser(t.assignee, { name: m.user.name, email: m.user.email })
          && shouldTrackReport(
            { assignee: t.assignee, status: t.status, startDate: fmt(t.startDate), endDate: fmt(t.endDate), completedAt: t.completedAt ? fmt(t.completedAt) : null },
            trackWeek, trackEnd,
          ))
        .map(t => ({
          taskId: t.id, taskTitle: t.title, ctx: ctxOf(t),
          planStart: fmt(t.startDate), planEnd: fmt(t.endDate),
          overdue: isOverdueForWeek({ startDate: fmt(t.startDate), endDate: fmt(t.endDate) }, trackWeek),
          reportedDone: !!t.reportedDoneAt,
          filled: trackLogs.some(l => l.taskId === t.id && l.authorId === m.userId
            && reportCountsForWeek({ weekOf: l.weekOf, logDate: fmt(l.logDate) }, trackWeek, trackEnd)),
        }))
        .sort((a, b) => (a.filled === b.filled ? 0 : a.filled ? 1 : -1))
      p.reviewees.set(m.userId, {
        authorId: m.userId, authorName: m.user.name, authorEmail: m.user.email,
        pending: [], reviewed: [], submittedThisWeek: submittedSet.has(`${m.projectId}:${m.userId}`), openTaskCount, tracking,
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

  // 塞入已審核 submissions
  const reviewedMap = new Map<string, ReviewedSub>()
  for (const l of reviewedLogs) {
    const p = projMap.get(l.projectId); if (!p) continue
    const rv = p.reviewees.get(l.authorId); if (!rv) continue
    const week = l.weekOf || null
    const key = `${l.projectId}:${l.authorId}:${l.taskId}:${week ?? '_'}`
    let s = reviewedMap.get(key)
    if (!s) {
      const rejected = !!l.reviewerRejectedAt
      s = {
        taskId: l.taskId, taskTitle: l.task.title, weekOf: week,
        outcome: rejected ? 'rejected' : 'approved',
        note: l.reviewerNote || null,
        reviewedAt: (l.reviewerRejectedAt || l.publishedAt || l.logDate).toISOString(),
        logs: [],
      }
      reviewedMap.set(key, s)
      rv.reviewed.push(s)
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

  return NextResponse.json({ isReviewer: true, weekOf: monday, trackWeek, projects })
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
