/**
 * Notification helpers — create DB notifications directly via Prisma
 * (avoids HTTP round-trips from API routes back to /api/notifications)
 */
import { prisma } from '@/lib/db'
import type { NotificationType } from '@prisma/client'
import { isSameUser } from '@/lib/user-match'
import { todayUtc } from '@/lib/date-utils'

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
