import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { safeJsonParse } from '@/lib/utils'
import { isSameUser } from '@/lib/user-match'
import { todayUtc } from '@/lib/date-utils'
import { notifyReportPublishedToAccountable, notifyReportDoneReviewToAccountable, notifyApprovalRevoked, notifyReportRejected } from '@/lib/notifications'
import { weekEndOf, shouldTrackReport, isOverdueForWeek, reportCountsForWeek, buildTrackTree, isTaskComplete } from '@/lib/report-tracking'
import { isReportVisible, isWithinRevokeWindow, REVOKE_WINDOW_DAYS } from '@/lib/report-cutoff'

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

  // 我督導的成員（跨專案）。相容「只存審核主管名字、沒存 email」的資料：email 或 name 任一對到我都算。
  const me = await prisma.user.findUnique({ where: { email }, select: { name: true } })
  const supervised = await prisma.projectTeamMember.findMany({
    where: {
      OR: [
        { reportReviewerEmail: email },
        ...(me?.name ? [{ reportReviewerName: me.name }] : []),
      ],
    },
    select: { projectId: true, userId: true, project: { select: { name: true } }, user: { select: { name: true, email: true } } },
  })
  if (supervised.length === 0) return NextResponse.json({ isReviewer: false, projects: [] })

  const monday = thisWeekMonday()
  const mondayDate = new Date(monday + 'T00:00:00.000Z')
  const sundayDate = new Date(mondayDate); sundayDate.setUTCDate(mondayDate.getUTCDate() + 7)

  const pairs = supervised.map(m => ({ projectId: m.projectId, authorId: m.userId }))

  // 當責在撰寫台「我的補充」寫的內容帶 reportOnly=true：不走審核流程，送出後直接進更新紀錄。
  //   審核相關的查詢一律排除，否則當責只要也被列在督導名單裡，她的補充就會變成一筆
  //   「待審報告」送進主管信箱，而它永遠不會被審。
  const notSupplement = { reportOnly: false }

  // 待審報告（尚未發布、未被駁回）— 用來找出「有待審筆的 任務×填報週」群組
  const pendingLogs = await prisma.taskLog.findMany({
    where: { ...notSupplement, publishedAt: null, reviewerRejectedAt: null, OR: pairs },
    select: { projectId: true, authorId: true, taskId: true, weekOf: true },
  })
  // 待審群組鍵（同一 任務×作者×填報週 只要有一筆待審，整組都要重審）
  const pendingKeys = new Set(pendingLogs.map(l => `${l.projectId}:${l.authorId}:${l.taskId}:${l.weekOf ?? '_'}`))
  // 取這些群組的「整週所有報告」（含先前已通過的），讓 R主管以週報視角看全部、重新審核一次
  const pendingTaskIds = [...new Set(pendingLogs.map(l => l.taskId))]
  const pendingAuthorIds = [...new Set(pendingLogs.map(l => l.authorId))]
  const groupLogs = pendingTaskIds.length === 0 ? [] : await prisma.taskLog.findMany({
    where: { ...notSupplement, taskId: { in: pendingTaskIds }, authorId: { in: pendingAuthorIds } },
    select: {
      id: true, projectId: true, authorId: true, taskId: true, weekOf: true,
      logDate: true, content: true, attachments: true, nextPlans: true,
      publishedAt: true, reviewerRejectedAt: true, createdAt: true, updatedAt: true,
      task: { select: { id: true, title: true, reportedDoneAt: true, completedAt: true } },
    },
    orderBy: { logDate: 'asc' },
  })

  // 已審核的報告（已發布=通過，或被駁回）— 近 60 天，供「已審核」分頁
  const sixtyDaysAgo = new Date(); sixtyDaysAgo.setUTCDate(sixtyDaysAgo.getUTCDate() - 60)
  const reviewedLogs = await prisma.taskLog.findMany({
    where: {
      ...notSupplement,
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
    where: { ...notSupplement, OR: pairs, weekOf: monday },
    select: { projectId: true, authorId: true },
  })
  // 相容舊資料(無 weekOf)：以 logDate 落在本週判斷
  const weekLogsByDate = await prisma.taskLog.findMany({
    where: { ...notSupplement, OR: pairs, weekOf: null, logDate: { gte: mondayDate, lt: sundayDate } },
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
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true, projectId: true, title: true, assignee: true, status: true, parentId: true, sortOrder: true,
      startDate: true, endDate: true, completedAt: true, reportedDoneAt: true, milestoneId: true,
      milestone: { select: { name: true } },
    },
  })
  // 該週的報告（用來判斷已填）：weekOf=該週 或 舊資料(無 weekOf)且 logDate 落在該週
  const trackLogs = await prisma.taskLog.findMany({
    where: {
      ...notSupplement,
      projectId: { in: projectIds },
      OR: [
        { weekOf: trackWeek },
        { weekOf: null, logDate: { gte: trackStartDate, lt: trackEndExclusive } },
      ],
    },
    select: { id: true, taskId: true, authorId: true, weekOf: true, logDate: true, publishedAt: true, reviewerRejectedAt: true, content: true, attachments: true, nextPlans: true },
  })

  // 任務層級的報告（不限週別）：流程時間軸要描述「這個任務的報告鏈」，
  //   只看所選週會把別週已完成的環節畫成沒發生（實際踩過：W30 交並核准，看 W35 全變空心）。
  const allTaskLogs = await prisma.taskLog.findMany({
    where: { ...notSupplement, projectId: { in: projectIds } },
    select: { taskId: true, authorId: true, createdAt: true, publishedAt: true, publishedBy: true, reviewerRejectedAt: true, reviewerNote: true },
    orderBy: { createdAt: 'asc' },
  })
  // 當責那一棒的資訊（誰在何時通過／完成），主管端要畫得出來才會與 A 端一致
  const taskMeta = await prisma.task.findMany({
    where: { projectId: { in: projectIds } },
    select: { id: true, reviewedAt: true, reviewedBy: true, completedAt: true, completedBy: true },
  })
  const metaById = new Map(taskMeta.map(t => [t.id, t]))

  // 分組：project → reviewee(R) → { pending submissions, submittedThisWeek, openTaskCount }
  type LogItem = { id: string; logDate: string; content: string; attachments: Att[]; nextPlans: { date?: string; content: string }[]; status: 'pending' | 'approved' | 'rejected'; createdAt?: string }
  type Sub = { taskId: string; taskTitle: string; weekOf: string | null; reportedDone: boolean; logs: LogItem[] }
  type ReviewedSub = { taskId: string; taskTitle: string; weekOf: string | null; outcome: 'approved' | 'rejected'; note: string | null; reviewedAt: string; logs: LogItem[] }
  type TrackItem = { taskId: string; taskTitle: string; depth: number; owned: boolean; done: boolean; msName: string | null; planStart: string; planEnd: string; overdue: boolean; reportedDone: boolean; filled: boolean; reviewState: 'none' | 'pending' | 'published' | 'rejected'; logs: LogItem[]
  // ↓ 任務層級（不限週別），供流程時間軸使用
  taskReviewState: 'none' | 'pending' | 'published' | 'rejected'
  taskSubmittedAt: string | null
  taskDecidedAt: string | null
  taskRejectNote: string | null
  /** 只靠 7/12 舊資料寬限而顯示，從未有人核准 → 沒有核准可撤回 */
  taskLegacy: boolean
  reviewedAt: string | null
  reviewedBy: string | null
  completedAt: string | null
  completedBy: string | null }
  type Reviewee = { authorId: string; authorName: string; authorEmail: string; pending: Sub[]; reviewed: ReviewedSub[]; submittedThisWeek: boolean; openTaskCount: number; tracking: TrackItem[] }
  const projMap = new Map<string, { projectId: string; projectName: string; reviewees: Map<string, Reviewee> }>()

  for (const m of supervised) {
    let p = projMap.get(m.projectId)
    if (!p) { p = { projectId: m.projectId, projectName: m.project.name, reviewees: new Map() }; projMap.set(m.projectId, p) }
    if (!p.reviewees.has(m.userId)) {
      const openTaskCount = openTasks.filter(t => t.projectId === m.projectId && isSameUser(t.assignee, { name: m.user.name, email: m.user.email })).length
      // 該成員在 trackWeek「該填」的任務，以樹狀（含結構祖先）呈現、標記已/未填
      const projTasks = trackTasks.filter(t => t.projectId === m.projectId)
      const mine = (t: typeof projTasks[number]) => isSameUser(t.assignee, { name: m.user.name, email: m.user.email })
      const ownedIds = new Set(
        projTasks
          .filter(t => mine(t)
            && shouldTrackReport(
              { assignee: t.assignee, status: t.status, startDate: fmt(t.startDate), endDate: fmt(t.endDate), completedAt: t.completedAt ? fmt(t.completedAt) : null },
              trackWeek, trackEnd,
            ))
          .map(t => t.id),
      )
      // 「已在追」的里程碑：只在這些里程碑底下補顯示成員的「已完成」任務，
      // 讓主管看得出 100% 的項目不是消失、而是完成（避免拉進無關的舊完成里程碑）。
      const trackedMs = new Set(projTasks.filter(t => ownedIds.has(t.id)).map(t => t.milestoneId ?? '_'))
      const doneIds = new Set(
        projTasks
          .filter(t => {
            if (!mine(t) || ownedIds.has(t.id)) return false
            if (!isTaskComplete({ status: t.status, startDate: fmt(t.startDate), completedAt: t.completedAt ? fmt(t.completedAt) : null })) return false
            if (!trackedMs.has(t.milestoneId ?? '_')) return false
            // 已完成任務只在「計畫區間與該週重疊」時顯示，離開計畫週就不再出現。
            // （未完成的任務走 owned/shouldTrackReport，逾期會持續每週追，直到真的完成。）
            const st = fmt(t.startDate)
            const en = t.endDate ? fmt(t.endDate) : st
            return st <= trackEnd && en >= trackWeek
          })
          .map(t => t.id),
      )
      const showIds = new Set<string>([...ownedIds, ...doneIds])
      const tracking: TrackItem[] = buildTrackTree(showIds, projTasks).map(({ node: t, depth }) => {
        const owned = ownedIds.has(t.id)
        const done = doneIds.has(t.id)
        const myWeekLogs = owned ? trackLogs.filter(l => l.taskId === t.id && l.authorId === m.userId
          && reportCountsForWeek({ weekOf: l.weekOf, logDate: fmt(l.logDate) }, trackWeek, trackEnd)) : []
        // 審核狀態：有未審筆→pending(審核中)；否則已發布→published；否則被駁回→rejected；無報告→none
        let reviewState: 'none' | 'pending' | 'published' | 'rejected' = 'none'
        if (myWeekLogs.length > 0) {
          if (myWeekLogs.some(l => !l.publishedAt && !l.reviewerRejectedAt)) reviewState = 'pending'
          else if (myWeekLogs.some(l => l.publishedAt)) reviewState = 'published'
          else reviewState = 'rejected'
        }
        const logs: LogItem[] = myWeekLogs
          .slice()
          .sort((a, b) => a.logDate.getTime() - b.logDate.getTime())
          .map(l => ({
            id: l.id,
            logDate: fmt(l.logDate),
            content: l.content,
            attachments: safeJsonParse<Att[]>(l.attachments, []),
            nextPlans: safeJsonParse<{ date?: string; content: string }[]>(l.nextPlans, []),
            status: l.publishedAt ? 'approved' : l.reviewerRejectedAt ? 'rejected' : 'pending',
          }))
        // 任務層級：這位成員在此任務的全部報告（不限週別）
        const myAllLogs = owned ? allTaskLogs.filter(l => l.taskId === t.id && l.authorId === m.userId) : []
        // 與前端 reportStateOf() 同一套判定（含 7/12 舊資料寬限），三個角色才會看到同一個狀態
        let taskReviewState: 'none' | 'pending' | 'published' | 'rejected' = 'none'
        let taskDecidedAt: string | null = null
        let taskRejectNote: string | null = null
        let taskLegacy = false
        if (myAllLogs.length > 0) {
          const pend = myAllLogs.filter(l => !l.reviewerRejectedAt && !isReportVisible(l))
          if (pend.length > 0) {
            taskReviewState = 'pending'
          } else {
            const visible = myAllLogs.filter(l => isReportVisible(l))
            if (visible.length > 0) {
              taskReviewState = 'published'
              const realPub = visible.filter(l => l.publishedAt)
              taskLegacy = realPub.length === 0 // 全靠寬限才顯示 → 沒有人真的按過核准
              taskDecidedAt = realPub.length > 0 ? realPub[realPub.length - 1].publishedAt!.toISOString() : null
            } else {
              taskReviewState = 'rejected'
              const rej = myAllLogs.filter(l => l.reviewerRejectedAt)
              taskDecidedAt = rej.length > 0 ? rej[rej.length - 1].reviewerRejectedAt!.toISOString() : null
              taskRejectNote = rej.length > 0 ? (rej[rej.length - 1].reviewerNote ?? null) : null
            }
          }
        }
        const meta = metaById.get(t.id)

        return {
          taskId: t.id, taskTitle: t.title, depth, owned, done,
          taskReviewState, taskLegacy,
          taskSubmittedAt: myAllLogs[0]?.createdAt.toISOString() ?? null,
          taskDecidedAt, taskRejectNote,
          reviewedAt: meta?.reviewedAt?.toISOString() ?? null,
          reviewedBy: meta?.reviewedBy ?? null,
          completedAt: meta?.completedAt?.toISOString() ?? null,
          completedBy: meta?.completedBy ?? null,
          msName: depth === 0 ? (t.milestone?.name ?? null) : null,
          planStart: fmt(t.startDate), planEnd: fmt(t.endDate),
          overdue: owned && isOverdueForWeek({ startDate: fmt(t.startDate), endDate: fmt(t.endDate) }, trackWeek),
          reportedDone: !!t.reportedDoneAt,
          filled: myWeekLogs.length > 0,
          reviewState,
          logs,
        }
      })
      p.reviewees.set(m.userId, {
        authorId: m.userId, authorName: m.user.name, authorEmail: m.user.email,
        pending: [], reviewed: [], submittedThisWeek: submittedSet.has(`${m.projectId}:${m.userId}`), openTaskCount, tracking,
      })
    }
  }

  // 塞入待審 submissions：以「待審群組」為單位，帶出該群組整週所有報告（含已通過的），R主管重審整週
  const subMap = new Map<string, Sub>() // key: project:author:task:week
  for (const l of groupLogs) {
    const week = l.weekOf || null
    const key = `${l.projectId}:${l.authorId}:${l.taskId}:${week ?? '_'}`
    if (!pendingKeys.has(key)) continue // 只收「有待審筆」的群組
    if (l.task.completedAt) continue
    const p = projMap.get(l.projectId); if (!p) continue
    const rv = p.reviewees.get(l.authorId); if (!rv) continue
    let s = subMap.get(key)
    if (!s) {
      s = { taskId: l.taskId, taskTitle: l.task.title, weekOf: week, reportedDone: !!l.task.reportedDoneAt, logs: [] }
      subMap.set(key, s)
      rv.pending.push(s)
    }
    const status: 'pending' | 'approved' | 'rejected' = l.publishedAt ? 'approved' : l.reviewerRejectedAt ? 'rejected' : 'pending'
    s.logs.push({
      id: l.id,
      logDate: l.logDate.toISOString().split('T')[0],
      content: l.content,
      attachments: safeJsonParse<Att[]>(l.attachments, []),
      nextPlans: safeJsonParse<{ date?: string; content: string }[]>(l.nextPlans, []),
      status,
      createdAt: l.createdAt.toISOString(),
    })
  }

  // 註：同一填報週內的多筆待審報告是「不同日」的每日工作紀錄（同日同作者後端已去重為一筆），
  // 都要完整呈現給 R主管逐筆審核，不可只顯示最新一筆，否則會漏掉其他天的更新。

  // 塞入已審核 submissions（排除「目前又有待審筆」的群組——它已回到待審核，不該同時出現在已審核）
  const reviewedMap = new Map<string, ReviewedSub>()
  for (const l of reviewedLogs) {
    const p = projMap.get(l.projectId); if (!p) continue
    const rv = p.reviewees.get(l.authorId); if (!rv) continue
    const week = l.weekOf || null
    const key = `${l.projectId}:${l.authorId}:${l.taskId}:${week ?? '_'}`
    if (pendingKeys.has(key)) continue
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
      status: l.publishedAt ? 'approved' : 'rejected',
    })
  }

  // 各專案的當責(A)姓名——流程圖的「下一棒」要顯示人名，沒有就只剩角色代號
  const accByProject = new Map<string, string>()
  for (const a of await prisma.projectTeamMember.findMany({
    where: { projectId: { in: projectIds }, role: 'A' },
    select: { projectId: true, user: { select: { name: true } } },
  })) {
    if (!accByProject.has(a.projectId)) accByProject.set(a.projectId, a.user.name)
  }

  const projects = Array.from(projMap.values()).map(p => ({
    projectId: p.projectId,
    projectName: p.projectName,
    accountableName: accByProject.get(p.projectId) ?? null,
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
  action: 'approve' | 'reject' | 'revoke'
  note?: string
}

export async function POST(request: NextRequest) {
  try {
    const body: ActionBody = await request.json()
    const { reviewerEmail, projectId, taskId, authorId, action } = body
    if (!reviewerEmail || !projectId || !taskId || !authorId || !action) {
      return NextResponse.json({ error: '必填欄位不完整' }, { status: 400 })
    }

    // 授權：呼叫者必須是「該作者(R)在此專案的報告審核主管」。
    //   相容名字-only 資料：email 或 name 任一對到即可。
    const authorMember = await prisma.projectTeamMember.findFirst({
      where: { projectId, userId: authorId },
      select: { reportReviewerEmail: true, reportReviewerName: true },
    })
    const reviewer = await prisma.user.findUnique({ where: { email: reviewerEmail }, select: { name: true } })
    const reviewerName = reviewer?.name || reviewerEmail
    const emailOk = !!authorMember?.reportReviewerEmail && authorMember.reportReviewerEmail.toLowerCase() === reviewerEmail.toLowerCase()
    const nameOk = !!authorMember?.reportReviewerName && !!reviewer?.name && authorMember.reportReviewerName === reviewer.name
    let authorized = emailOk || nameOk

    // 該作者未指定報告審核主管 → 由本專案的當責(A)代審。
    //   這與報告送出時的既有行為一致（task-logs/batch 在沒有主管時 routedTo='accountable'、
    //   直接通知當責），差別只在於此處把「審核權」也一併給 A，讓 A 不必再繞到撰寫台納入。
    const hasReviewer = !!(authorMember?.reportReviewerEmail || authorMember?.reportReviewerName)
    let viaAccountable = false
    if (!authorized && !hasReviewer) {
      const me = await prisma.user.findUnique({ where: { email: reviewerEmail }, select: { id: true } })
      if (me) {
        const acc = await prisma.projectTeamMember.findFirst({
          where: { projectId, userId: me.id, role: 'A' },
          select: { userId: true },
        })
        viaAccountable = !!acc
        authorized = viaAccountable
      }
    }

    if (!authorized) {
      return NextResponse.json({
        error: hasReviewer
          ? '你不是該成員的報告審核主管，無權審核'
          : '該成員未設報告審核主管，僅本專案的當責(A)可代為審核',
      }, { status: 403 })
    }

    // 目標：該 submission 中仍待審的 log（同專案/任務/作者/填報週）
    const week = body.weekOf ?? null
    const targetWhere = {
      projectId, taskId, authorId,
      weekOf: week,
      publishedAt: null,
      reviewerRejectedAt: null,
    }

    // ── 撤回核准：把已核准的報告退回「待審」──
    if (action === 'revoke') {
      const task = await prisma.task.findUnique({
        where: { id: taskId },
        select: { title: true, reviewedAt: true, completedAt: true, reportedDoneAt: true },
      })

      // 守衛①：當責已確認完成 → 要當責先撤回
      if (task?.reviewedAt || task?.completedAt) {
        return NextResponse.json({
          error: '任務已完成，須由當責先撤回完成確認才能撤回核准',
        }, { status: 409 })
      }

      // 守衛②：球已經傳到當責手上（執行者已回報完成、等當責確認）→ 一樣不能由上游抽回。
      //   撤回必須從最下游開始：當責要先駁回，球回到主管手上，才輪得到主管撤回自己的核准。
      if (task?.reportedDoneAt) {
        return NextResponse.json({
          error: '報告已轉給當責審核，須由當責先駁回才能撤回核准',
        }, { status: 409 })
      }

      // 守衛②：該週的週報已由當責送出 → 報告已對外發布，抽掉會讓已發出的內容憑空消失
      if (week) {
        const submittedNote = await prisma.weeklyReportNote.findFirst({
          where: { projectId, weekOf: week, submittedAt: { not: null } },
          select: { id: true },
        })
        if (submittedNote) {
          return NextResponse.json({
            error: `此報告已納入 ${week} 當週已送出的週報，不能直接撤回。請聯繫當責處理`,
          }, { status: 409 })
        }
      }

      // 守衛③：超過一個月的核准不能撤——甘特與里程碑無預警倒退的影響太大
      const approved = await prisma.taskLog.findFirst({
        where: { projectId, taskId, authorId, weekOf: week, publishedAt: { not: null } },
        orderBy: { publishedAt: 'desc' }, select: { publishedAt: true },
      })
      if (approved?.publishedAt && !isWithinRevokeWindow(approved.publishedAt)) {
        return NextResponse.json({
          error: `核准已超過 ${REVOKE_WINDOW_DAYS} 天，無法撤回。如需調整請與當責討論`,
        }, { status: 409 })
      }

      const res = await prisma.taskLog.updateMany({
        where: { projectId, taskId, authorId, weekOf: week, publishedAt: { not: null } },
        data: { publishedAt: null, publishedBy: null },
      })
      if (res.count === 0) {
        return NextResponse.json({ success: true, revoked: 0, noop: true })
      }

      await prisma.taskReviewEvent.create({
        data: {
          taskId, projectId, type: 'report_approve_revoked',
          actor: reviewerName, note: body.note?.trim() || null,
        },
      }).catch(() => {})

      const proj = await prisma.project.findUnique({ where: { id: projectId }, select: { name: true } })
      await notifyApprovalRevoked({
        projectId, projectName: proj?.name || '專案',
        taskId, taskTitle: task?.title || '任務',
        stage: 'approval', actorName: reviewerName, reason: body.note?.trim() || null,
      }).catch(() => {})

      return NextResponse.json({ success: true, revoked: res.count })
    }

    if (action === 'approve') {
      const now = new Date()
      const res = await prisma.taskLog.updateMany({
        where: targetWhere,
        data: { publishedAt: now, publishedBy: reviewerName },
      })
      // 沒有任何待審 log 被更新 → 這是重複點擊/已審過的 no-op，不再寫歷程、不再重複發通知。
      if (res.count === 0) {
        return NextResponse.json({ success: true, published: 0, noop: true })
      }
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
    // 沒有任何待審 log 被駁回 → 重複點擊/已駁回的 no-op，不再寫一筆「主管駁回」歷程（避免履歷洗版）。
    if (res.count === 0) {
      return NextResponse.json({ success: true, rejected: 0, noop: true })
    }
    await prisma.taskReviewEvent.create({ data: { taskId, projectId, type: 'report_rejected', actor: reviewerName, note: body.note.trim() } }).catch(() => {})

    // 報告被退 → 一併清掉 R 的「回報完成」宣告。
    //   曾經送過不代表現在還成立：R 修好報告後要自己重新判斷是真的完成、還是需要再花時間，
    //   不該由系統替他保留上一次的宣告。（客戶決策 2026-08-27）
    await prisma.task.updateMany({
      where: { id: taskId, reportedDoneAt: { not: null } },
      data: { reportedDoneAt: null, reportedDoneBy: null },
    }).catch(() => {})

    // 通知：被駁回的人一定要知道，否則只能自己回頭翻清單才會發現
    const proj = await prisma.project.findUnique({ where: { id: projectId }, select: { name: true } })
    const rejTask = await prisma.task.findUnique({ where: { id: taskId }, select: { title: true } })
    await notifyReportRejected({
      projectId, projectName: proj?.name || '專案',
      taskId, taskTitle: rejTask?.title || '任務',
      actorName: reviewerName, reason: body.note.trim(), routedTo: 'executor',
    }).catch(() => {})

    return NextResponse.json({ success: true, rejected: res.count })
  } catch (error) {
    console.error('report-review action failed:', error)
    return NextResponse.json({ error: '審核操作失敗' }, { status: 500 })
  }
}
