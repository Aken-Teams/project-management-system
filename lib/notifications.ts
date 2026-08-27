/**
 * Notification helpers — create DB notifications directly via Prisma
 * (avoids HTTP round-trips from API routes back to /api/notifications)
 */
import { prisma } from '@/lib/db'
import type { NotificationType } from '@prisma/client'
import { isSameUser } from '@/lib/user-match'
import { todayUtc } from '@/lib/date-utils'
import { isRejectionTracked, FOLLOWUP_OVERDUE_DAYS } from '@/lib/report-cutoff'

// ─── Core ──────────────────────────────────────────────────────────────────

export async function createNotification({
  userId,
  type,
  title,
  message,
  projectId,
}: {
  userId: string
  type: NotificationType
  title: string
  message: string
  projectId?: string
}) {
  try {
    return await prisma.notification.create({
      data: { userId, type, title, message, projectId: projectId ?? null },
    })
  } catch {
    // Never let notification errors break the main flow
  }
}

// ─── Recipient helpers ──────────────────────────────────────────────────────

/** Find a user by email */
export async function getUserByEmail(email: string) {
  if (!email?.includes('@')) return null
  return prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true },
  })
}

/** 依「指派值」解析使用者：容錯 email / 姓名 / AD 帳號前綴（見 lib/user-match）。 */
export async function resolveAssignee(assignee: string | null | undefined) {
  if (!assignee) return null
  if (assignee.includes('@')) {
    const byEmail = await prisma.user.findUnique({ where: { email: assignee }, select: { id: true, name: true, email: true } })
    if (byEmail) return byEmail
  }
  const byName = await prisma.user.findFirst({ where: { name: assignee }, select: { id: true, name: true, email: true } })
  if (byName) return byName
  // 容錯 fallback：用首段 token 抓少量候選，再以 isSameUser 判定
  const token = assignee.trim().split(/\s+/)[0]
  if (token) {
    const cands = await prisma.user.findMany({
      where: { OR: [{ name: { contains: token } }, { email: { startsWith: token } }] },
      select: { id: true, name: true, email: true },
      take: 20,
    })
    return cands.find(u => isSameUser(assignee, u)) || null
  }
  return null
}

/** All active executives */
export async function getExecutives() {
  return prisma.user.findMany({
    where: { role: 'executive', isActive: true },
    select: { id: true, name: true },
  })
}

/** All S (Sign-off) role team members for a specific project */
export async function getProjectReviewers(projectId: string) {
  const members = await prisma.projectTeamMember.findMany({
    where: { projectId, role: 'S' },
    select: { userId: true, user: { select: { id: true, name: true } } },
  })
  return members.map(m => m.user)
}

// ─── 週報就緒 (weekly_report_ready) ─────────────────────────────────────────

/** A 送出本週報告 → 通知「該專案所有團隊成員」（排除送出者自己），讓大家(含 R)都知道 A 寫了什麼 */
export async function notifyWeeklyReportReady({
  projectId,
  projectName,
  actorName,
  actorUserId,
  weekOf,
}: {
  projectId: string
  projectName: string
  actorName: string
  actorUserId?: string
  weekOf?: string
}) {
  const members = await prisma.projectTeamMember.findMany({ where: { projectId }, select: { userId: true } })
  for (const m of members) {
    if (actorUserId && m.userId === actorUserId) continue // 不通知送出者自己
    await createNotification({
      userId: m.userId,
      type: 'weekly_report_ready',
      title: '本週報告已送出',
      message: `${actorName} 送出了「${projectName}」的本週報告${weekOf ? `（${weekOf}）` : ''}，可查看更新紀錄`,
      projectId,
    })
  }
}

/** R 送出工作紀錄 → 通知該專案當責 A（role='A' 成員） */
export async function notifyRecordUploadedToAccountable({
  projectId,
  projectName,
}: {
  projectId: string
  projectName: string
}) {
  const accountables = await prisma.projectTeamMember.findMany({
    where: { projectId, role: 'A' },
    select: { user: { select: { id: true } } },
  })
  const startOfToday = todayUtc()
  for (const a of accountables) {
    // 去重：同 A、同專案、專屬型別、「當日時間窗」已有一則就不再發（不看 uploaderName 子字串、不看已讀）
    const existing = await prisma.notification.findFirst({
      where: { userId: a.user.id, projectId, type: 'record_uploaded', createdAt: { gte: startOfToday } },
      select: { id: true },
    })
    if (existing) continue
    await createNotification({
      userId: a.user.id,
      type: 'record_uploaded',
      title: '有新的工作紀錄',
      message: `「${projectName}」本日有成員上傳工作紀錄，可查看並彙整`,
      projectId,
    })
  }
}

// ─── R 報告審核流程 (report_review_needed / report_published / report_done_review) ───

/** R 送出報告 → 通知其報告審核主管(R主管)去審核 */
export async function notifyReportReviewNeeded({
  projectId, projectName, reviewerEmail, rName, taskTitle,
}: {
  projectId: string
  projectName: string
  reviewerEmail: string
  rName: string
  taskTitle: string
}) {
  const reviewer = await getUserByEmail(reviewerEmail)
  if (!reviewer) return
  // 去重：同審核主管、同專案、當日窗，已有一則就不再發
  const existing = await prisma.notification.findFirst({
    where: { userId: reviewer.id, projectId, type: 'report_review_needed', createdAt: { gte: todayUtc() } },
    select: { id: true },
  })
  if (existing) return
  await createNotification({
    userId: reviewer.id,
    type: 'report_review_needed',
    title: '有待審核的報告',
    message: `「${projectName}」有成員（${rName}）送出報告待你審核`,
    projectId,
  })
}

/** R主管核准 → 通知該專案當責 A：此報告已進更新紀錄 */
export async function notifyReportPublishedToAccountable({
  projectId, projectName, rName, taskTitle,
}: {
  projectId: string
  projectName: string
  rName: string
  taskTitle: string
}) {
  const accountables = await prisma.projectTeamMember.findMany({
    where: { projectId, role: 'A' }, select: { user: { select: { id: true } } },
  })
  for (const a of accountables) {
    await createNotification({
      userId: a.user.id,
      type: 'report_published',
      title: '報告已進更新紀錄',
      message: `「${projectName}」${rName} 的「${taskTitle}」報告經審核主管核准，已進更新紀錄`,
      projectId,
    })
  }
}

/** R 回報100%完成、且已過 R主管核准 → 通知 A 去審核是否完成 */
export async function notifyReportDoneReviewToAccountable({
  projectId, projectName, rName, taskTitle,
}: {
  projectId: string
  projectName: string
  rName: string
  taskTitle: string
}) {
  const accountables = await prisma.projectTeamMember.findMany({
    where: { projectId, role: 'A' }, select: { user: { select: { id: true } } },
  })
  for (const a of accountables) {
    await createNotification({
      userId: a.user.id,
      type: 'report_done_review',
      title: '有任務待你審核完成',
      message: `「${projectName}」${rName} 回報「${taskTitle}」已100%完成，待你審核`,
      projectId,
    })
  }
}

/**
 * R主管遲遲未審核 → 通知該專案當責 A 去追主管。
 *   逾期定義：報告已送出(pending：未發布、未被駁回) 且送出至今超過 overdueDays 天，
 *            且該報告作者(R)有指定報告審核主管(R主管)。
 *   彙總：同專案多份逾期報告合併成「一則」通知；3 天內已通知過就跳過（不洗版）。
 */
export async function notifyReviewOverdueToAccountable({
  projectId,
  projectName,
  overdueDays = 3,
}: {
  projectId: string
  projectName: string
  overdueDays?: number
}) {
  const cutoff = new Date(Date.now() - overdueDays * 24 * 60 * 60 * 1000)
  const pending = await prisma.taskLog.findMany({
    where: { projectId, publishedAt: null, reviewerRejectedAt: null, createdAt: { lt: cutoff } },
    select: { authorId: true, taskId: true, weekOf: true },
  })
  if (pending.length === 0) return

  // 僅計入「作者有指定 R主管」的報告
  const members = await prisma.projectTeamMember.findMany({
    where: { projectId },
    select: { userId: true, reportReviewerEmail: true },
  })
  const hasReviewer = new Set(members.filter(m => m.reportReviewerEmail).map(m => m.userId))
  const overdueKeys = new Set(
    pending.filter(p => hasReviewer.has(p.authorId)).map(p => `${p.taskId}:${p.weekOf ?? '_'}`),
  )
  if (overdueKeys.size === 0) return

  const accountables = await prisma.projectTeamMember.findMany({
    where: { projectId, role: 'A' }, select: { user: { select: { id: true } } },
  })
  const dedupeSince = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
  for (const a of accountables) {
    const recent = await prisma.notification.findFirst({
      where: { userId: a.user.id, projectId, type: 'report_review_overdue', createdAt: { gte: dedupeSince } },
      select: { id: true },
    })
    if (recent) continue
    await createNotification({
      userId: a.user.id,
      type: 'report_review_overdue',
      title: '報告審核逾期',
      message: `「${projectName}」有 ${overdueKeys.size} 份報告的審核主管已逾 ${overdueDays} 天未審核，請追蹤主管`,
      projectId,
    })
  }
}

// ─── 完成被解除 (completion_reopened) ───────────────────────────────────────

/**
 * 某任務的「完成」被解除（底下新增子任務/工作，或手動取消完成）→
 * 通知「被解除的該任務負責人」＋「其往上所有仍為完成、且有指派人的父層負責人」。
 *   目的：父層負責人（尤其寫過報告、審核通過過的）必須被告知他的完成已失效，需重新確認/補報告。
 *   actorName：操作者姓名，避免通知操作者自己。
 */
export async function notifyCompletionReopened({
  projectId, projectName, taskId, actorName,
}: {
  projectId: string
  projectName: string
  taskId: string
  actorName?: string
}) {
  const all = await prisma.task.findMany({
    where: { projectId },
    select: { id: true, parentId: true, title: true, assignee: true, completedAt: true, status: true, reportedDoneAt: true },
  })
  const byId = new Map(all.map(t => [t.id, t]))
  const target = byId.get(taskId)
  if (!target) return

  // 由 target 往上收集鏈：target 自己 + 所有祖先
  const chain: typeof all = [target]
  let p = target.parentId ? byId.get(target.parentId) : undefined
  const seen = new Set<string>([target.id])
  while (p && !seen.has(p.id)) { chain.push(p); seen.add(p.id); p = p.parentId ? byId.get(p.parentId) : undefined }

  const notifiedUsers = new Set<string>()
  for (const t of chain) {
    // target 一定通知（它剛被解除完成）；祖先只在「仍為完成」時通知
    const wasCompleted = !!(t.completedAt || t.status === 'done' || t.reportedDoneAt)
    if (t.id !== taskId && !wasCompleted) continue
    const assignee = (t.assignee || '').trim()
    if (!assignee || assignee === '未指派') continue
    const user = await resolveAssignee(assignee)
    if (!user) continue
    if (actorName && user.name === actorName) continue // 不通知操作者自己
    if (notifiedUsers.has(user.id)) continue
    notifiedUsers.add(user.id)
    await createNotification({
      userId: user.id,
      type: 'completion_reopened',
      title: '已完成項目被重新開啟',
      message: `你負責的「${t.title}」因為底下新增或變更了工作，已被重新開啟為未完成，請確認並視需要補上報告（專案：${projectName}）`,
      projectId,
    })
  }
}

// ─── 審核撤回 (approval_revoked) ────────────────────────────────────────────

/**
 * 撤回審核 —— 通知「上下游」兩邊。
 *
 * 撤回是逆著流程往回退一棒，會同時影響兩種人：
 *   上游＝把東西交給我的人（他的成果被退回，要重做或重審）
 *   下游＝原本要接手的人（他的前提沒了，別再往下處理）
 * 兩邊都通知，才不會有人拿著過期的認知繼續動作。
 *
 * stage 指「被撤回的是哪一棒」：
 *   reported   R 取消回報完成      → 通知 R主管（無主管則當責）
 *   approval   R主管撤回核准       → 通知 R（作者）+ 當責
 *   confirm    當責撤回完成確認     → 通知 R（負責人）+ R主管
 */
export async function notifyApprovalRevoked({
  projectId, projectName, taskId, taskTitle, stage, actorName, reason,
}: {
  projectId: string
  projectName: string
  taskId: string
  taskTitle: string
  stage: 'reported' | 'approval' | 'confirm'
  actorName?: string | null
  reason?: string | null
}) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { assignee: true },
  })
  const members = await prisma.projectTeamMember.findMany({
    where: { projectId },
    select: {
      userId: true, role: true, reportReviewerName: true, reportReviewerEmail: true,
      user: { select: { id: true, name: true, email: true } },
    },
  })

  const executor = task?.assignee ? await resolveAssignee(task.assignee) : null
  const accountables = members.filter(m => m.role === 'A').map(m => m.user)
  // 執行者的報告審核主管（名字或 email 任一對到即可，相容只存名字的舊資料）
  const execMember = executor ? members.find(m => m.userId === executor.id) : null
  const reviewerRef = execMember?.reportReviewerEmail || execMember?.reportReviewerName || null
  const reviewer = reviewerRef
    ? (reviewerRef.includes('@')
      ? await prisma.user.findUnique({ where: { email: reviewerRef }, select: { id: true, name: true, email: true } })
      : await prisma.user.findFirst({ where: { name: reviewerRef }, select: { id: true, name: true, email: true } }))
    : null

  type Target = { id: string; name: string } | null
  let targets: Target[]
  let what: string
  switch (stage) {
    case 'reported':
      // 沒有審核主管時，報告本來就直接落到當責 → 撤回也通知當責
      targets = reviewer ? [reviewer] : accountables
      what = '取消了「已完成」的回報'
      break
    case 'approval':
      targets = [executor, ...accountables]
      what = '撤回了報告核准'
      break
    case 'confirm':
      targets = [executor, reviewer]
      what = '撤回了任務完成確認'
      break
  }

  const seen = new Set<string>()
  for (const t of targets) {
    if (!t) continue
    if (seen.has(t.id)) continue
    if (actorName && t.name === actorName) continue // 不通知操作者自己
    seen.add(t.id)
    await createNotification({
      userId: t.id,
      type: 'approval_revoked',
      title: '審核已被撤回',
      message: `${actorName || '有人'}${what}：「${taskTitle}」`
        + `${reason ? `，原因：${reason}` : ''}`
        + `（專案：${projectName}）`,
      projectId,
    })
  }
}

// ─── 駁回 (report_rejected) ─────────────────────────────────────────────────

/**
 * 駁回通知。收件人依「退到哪一棒」決定：
 *   routedTo='reviewer' 當責駁回、退回報告審核主管 → 通知主管（球在他手上）+ 執行者
 *   routedTo='executor' 主管駁回、或無主管時當責直接退回 → 通知執行者 + 當責（知情）
 *
 * 被駁回的人若沒收到通知，只能靠自己回頭翻清單才會發現——那等於沒有駁回。
 */
export async function notifyReportRejected({
  projectId, projectName, taskId, taskTitle, actorName, reason, routedTo,
}: {
  projectId: string
  projectName: string
  taskId: string
  taskTitle: string
  actorName?: string | null
  reason?: string | null
  routedTo: 'reviewer' | 'executor'
}) {
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { assignee: true } })
  const members = await prisma.projectTeamMember.findMany({
    where: { projectId },
    select: {
      userId: true, role: true, reportReviewerName: true, reportReviewerEmail: true,
      user: { select: { id: true, name: true, email: true } },
    },
  })
  const executor = task?.assignee ? await resolveAssignee(task.assignee) : null
  const accountables = members.filter(m => m.role === 'A').map(m => m.user)
  const execMember = executor ? members.find(m => m.userId === executor.id) : null
  const reviewerRef = execMember?.reportReviewerEmail || execMember?.reportReviewerName || null
  const reviewer = reviewerRef
    ? (reviewerRef.includes('@')
      ? await prisma.user.findUnique({ where: { email: reviewerRef }, select: { id: true, name: true } })
      : await prisma.user.findFirst({ where: { name: reviewerRef }, select: { id: true, name: true } }))
    : null

  const targets = routedTo === 'reviewer' ? [reviewer, executor] : [executor, ...accountables]
  const where = routedTo === 'reviewer' ? '已退回報告審核主管重新審核' : '已退回執行者重新處理'

  const seen = new Set<string>()
  for (const t of targets) {
    if (!t) continue
    if (seen.has(t.id)) continue
    if (actorName && t.name === actorName) continue // 不通知操作者自己
    seen.add(t.id)
    await createNotification({
      userId: t.id,
      type: 'report_rejected',
      title: '報告被駁回',
      message: `${actorName || '有人'}駁回了「${taskTitle}」，${where}`
        + `${reason ? `。原因：${reason}` : ''}`
        + `（專案：${projectName}）`,
      projectId,
    })
  }
}

// ─── 駁回未修正 / 草稿未送出 的逾期提醒 ───────────────────────────────────────

/**
 * 報告被駁回超過 N 天仍未重送 → 通知執行者與其審核主管。
 *
 * 沒有這個提醒時，被退件的報告會無限期擱置（實測有擱置 30 天的），
 * 而且 R 多半改在最新週另寫一筆，原本那週在更新紀錄就永久留白。
 * 同專案彙總成一則、3 天內不重複發，避免洗版。
 */
export async function notifyRejectionOverdue({ projectId, projectName }: { projectId: string; projectName: string }) {
  const cutoff = new Date(Date.now() - FOLLOWUP_OVERDUE_DAYS * 86400000)
  const stale = await prisma.taskLog.findMany({
    where: { projectId, publishedAt: null, reviewerRejectedAt: { not: null, lt: cutoff } },
    select: { authorId: true, taskId: true, reviewerRejectedAt: true, task: { select: { title: true } } },
  })
  // 8/26 以前的駁回不追蹤（客戶決策：舊資料不回頭要求補）
  const tracked = stale.filter(l => isRejectionTracked(l.reviewerRejectedAt))
  if (tracked.length === 0) return

  const members = await prisma.projectTeamMember.findMany({
    where: { projectId },
    select: { userId: true, reportReviewerEmail: true, reportReviewerName: true, user: { select: { id: true, name: true } } },
  })
  const since = new Date(Date.now() - 3 * 86400000) // 3 天內發過就不再發

  // 依作者彙總：一位 R 一則，附帶他被退的筆數
  const byAuthor = new Map<string, { count: number; titles: Set<string> }>()
  for (const l of tracked) {
    const e = byAuthor.get(l.authorId) ?? { count: 0, titles: new Set<string>() }
    e.count++; e.titles.add(l.task.title)
    byAuthor.set(l.authorId, e)
  }

  for (const [authorId, info] of byAuthor) {
    const m = members.find(x => x.userId === authorId)
    if (!m) continue
    const titles = [...info.titles].slice(0, 3).join('、') + (info.titles.size > 3 ? ` 等 ${info.titles.size} 項` : '')
    const msg = `「${projectName}」你有 ${info.count} 筆報告被駁回超過 ${FOLLOWUP_OVERDUE_DAYS} 天仍未重送（${titles}）。`
      + `請到「填寫週報 → 待修正」回到原本那一週修改，否則該週在更新紀錄會留白。`

    const recipients: string[] = [m.user.id]
    // 一併通知其審核主管，讓他知道自己退的件沒有下文
    const ref = m.reportReviewerEmail || m.reportReviewerName
    if (ref) {
      const rev = ref.includes('@')
        ? await prisma.user.findUnique({ where: { email: ref }, select: { id: true } })
        : await prisma.user.findFirst({ where: { name: ref }, select: { id: true } })
      if (rev) recipients.push(rev.id)
    }

    for (const userId of recipients) {
      const dup = await prisma.notification.findFirst({
        where: { userId, projectId, type: 'report_rejected', createdAt: { gte: since } },
        select: { id: true },
      })
      if (dup) continue
      await createNotification({
        userId,
        type: 'report_rejected',
        title: '有報告被駁回未修正',
        message: userId === m.user.id ? msg
          : `「${projectName}」${m.user.name} 有 ${info.count} 筆被你駁回的報告超過 ${FOLLOWUP_OVERDUE_DAYS} 天仍未重送（${titles}）`,
        projectId,
      })
    }
  }
}

/**
 * 當責寫了補充／彙整卻遲遲沒送出週報 → 通知當責本人。
 * 沒送出的補充不會進更新紀錄，寫了等於沒寫，但目前沒有任何提醒。
 */
export async function notifyUnsubmittedWeeklyDraft({ projectId, projectName }: { projectId: string; projectName: string }) {
  const cutoff = new Date(Date.now() - FOLLOWUP_OVERDUE_DAYS * 86400000)
  const drafts = await prisma.weeklyReportNote.findMany({
    where: { projectId, submittedAt: null, updatedAt: { lt: cutoff } },
    select: { weekOf: true, author: true, updatedAt: true },
  })
  if (drafts.length === 0) return

  const accountables = await prisma.projectTeamMember.findMany({
    where: { projectId, role: 'A' }, select: { user: { select: { id: true, name: true } } },
  })
  const weeks = [...new Set(drafts.map(d => d.weekOf))].sort()
  const since = new Date(Date.now() - 3 * 86400000)

  for (const a of accountables) {
    const dup = await prisma.notification.findFirst({
      where: { userId: a.user.id, projectId, type: 'weekly_report_ready', createdAt: { gte: since } },
      select: { id: true },
    })
    if (dup) continue
    await createNotification({
      userId: a.user.id,
      type: 'weekly_report_ready',
      title: '有週報草稿未送出',
      message: `「${projectName}」你有 ${weeks.length} 週的報告草稿寫了但還沒送出（${weeks.slice(0, 3).join('、')}${weeks.length > 3 ? ' 等' : ''}）。`
        + `未送出的內容不會進入更新紀錄。`,
      projectId,
    })
  }
}

// ─── 任務指派 (task_assigned) ───────────────────────────────────────────────

export async function notifyTaskAssigned({
  assignee,
  taskTitle,
  projectId,
  projectName,
}: {
  assignee: string            // 任務指派值（姓名，容錯 email）
  taskTitle: string
  projectId: string
  projectName: string
}) {
  const user = await resolveAssignee(assignee)
  if (!user) return
  await createNotification({
    userId: user.id,
    type: 'task_assigned',
    title: '新任務指派',
    message: `您被指派了任務「${taskTitle}」（專案：${projectName}）`,
    projectId,
  })
}

/**
 * 建立專案時批次指派 → 每個被指派者「一則彙總通知」（避免同一人被指派多個任務時洗版）。
 * assignees 為各任務的指派值（可重複、可含「未指派」）；同一人合併計數。
 */
export async function notifyTasksAssignedOnCreate({
  projectId,
  projectName,
  assignees,
}: {
  projectId: string
  projectName: string
  assignees: (string | null | undefined)[]
}) {
  const counts = new Map<string, number>()
  for (const a of assignees) {
    const name = (a || '').trim()
    if (!name || name === '未指派') continue
    counts.set(name, (counts.get(name) || 0) + 1)
  }
  for (const [assignee, count] of counts) {
    const user = await resolveAssignee(assignee)
    if (!user) continue
    await createNotification({
      userId: user.id,
      type: 'task_assigned',
      title: '新任務指派',
      message: `您在專案「${projectName}」被指派了 ${count} 個任務`,
      projectId,
    })
  }
}

// ─── 延期申請 (delay_submitted) ────────────────────────────────────────────

export async function notifyDelaySubmitted({
  requesterName,
  projectId,
  projectName,
}: {
  requesterName: string
  projectId: string
  projectName: string
}) {
  const reviewers = await getProjectReviewers(projectId)
  await Promise.all(reviewers.map(r =>
    createNotification({
      userId: r.id,
      type: 'delay_submitted',
      title: '延期申請待審核',
      message: `${requesterName} 提出延期申請（專案：${projectName}），請前往審核`,
      projectId,
    })
  ))
}

// ─── 支援需求 (support_needed) ─────────────────────────────────────────────

export async function notifySupportNeeded({
  requesterName,
  projectId,
  projectName,
  detail,
}: {
  requesterName: string
  projectId: string
  projectName: string
  detail: string
}) {
  const reviewers = await getProjectReviewers(projectId)
  await Promise.all(reviewers.map(r =>
    createNotification({
      userId: r.id,
      type: 'support_needed',
      title: '支援需求',
      message: `${requesterName} 在專案「${projectName}」提出支援需求：${detail.slice(0, 60)}${detail.length > 60 ? '…' : ''}`,
      projectId,
    })
  ))
}

// ─── 審核結果 (delay_approved / delay_rejected) ────────────────────────────

export async function notifyDelayReviewed({
  requesterId,
  projectId,
  projectName,
  approved,
  reviewNotes,
}: {
  requesterId: string
  projectId: string
  projectName: string
  approved: boolean
  reviewNotes?: string
}) {
  const suffix = reviewNotes ? `（${reviewNotes.slice(0, 40)}${reviewNotes.length > 40 ? '…' : ''}）` : ''
  await createNotification({
    userId: requesterId,
    type: approved ? 'delay_approved' : 'delay_rejected',
    title: approved ? '延期申請已核准' : '延期申請已駁回',
    message: approved
      ? `您的延期申請（專案：${projectName}）已通過審核${suffix}`
      : `您的延期申請（專案：${projectName}）已被駁回${suffix}。原時程未調整，請調整週報的工作日期或改用可達成的時程。`,
    projectId,
  })
}

// ─── 逾期提醒 (task_overdue) ───────────────────────────────────────────────

/**
 * Check if a project has overdue milestones and notify the PM if so.
 * Deduplicates by skipping if an unread task_overdue notification for this
 * project was already sent within the last 7 days.
 */
export async function notifyProjectOverdueIfNeeded({
  projectId,
  projectName,
  fallbackOwnerId,
}: {
  projectId: string
  projectName: string
  fallbackOwnerId: string
}) {
  const now = new Date()
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  // 用 UTC 日曆日的「今天」判逾期，與甘特/里程碑視圖一致（當天到期不算逾期，B-3/B-4）。
  //   否則 cron 會在到期當天就發逾期信、但 UI 當天還不顯示紅 → 使用者誤判為 bug。
  const today = todayUtc()

  // Check for overdue incomplete milestones
  const overdueMilestone = await prisma.milestone.findFirst({
    where: {
      projectId,
      dueDate: { lt: today },
      status: { not: 'done' },
    },
  })
  if (!overdueMilestone) return

  // Use the Accountable (A) team member as the PM to notify;
  // fall back to project.ownerId if no such team member is set
  const accountable = await prisma.projectTeamMember.findFirst({
    where: { projectId, role: 'A' },
    select: { userId: true },
  })
  const pmId = accountable?.userId ?? fallbackOwnerId

  // Deduplicate: skip if already notified in the last 7 days
  const recent = await prisma.notification.findFirst({
    where: {
      userId: pmId,
      type: 'task_overdue',
      projectId,
      createdAt: { gte: sevenDaysAgo },
    },
  })
  if (recent) return

  await createNotification({
    userId: pmId,
    type: 'task_overdue',
    title: '專案進度逾期',
    message: `專案「${projectName}」有里程碑已逾期，請確認進度`,
    projectId,
  })
}
