/**
 * Notification helpers — create DB notifications directly via Prisma
 * (avoids HTTP round-trips from API routes back to /api/notifications)
 */
import { prisma } from '@/lib/db'
import type { NotificationType } from '@prisma/client'

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

/** Find a user by email (task assignees are stored as email strings) */
export async function getUserByEmail(email: string) {
  if (!email?.includes('@')) return null
  return prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true },
  })
}

/** All active executives */
export async function getExecutives() {
  return prisma.user.findMany({
    where: { role: 'executive', isActive: true },
    select: { id: true, name: true },
  })
}

// ─── 任務指派 (task_assigned) ───────────────────────────────────────────────

export async function notifyTaskAssigned({
  assigneeEmail,
  taskTitle,
  projectId,
  projectName,
}: {
  assigneeEmail: string
  taskTitle: string
  projectId: string
  projectName: string
}) {
  const user = await getUserByEmail(assigneeEmail)
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
  const executives = await getExecutives()
  await Promise.all(executives.map(ex =>
    createNotification({
      userId: ex.id,
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
  const executives = await getExecutives()
  await Promise.all(executives.map(ex =>
    createNotification({
      userId: ex.id,
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
      : `您的延期申請（專案：${projectName}）已被駁回${suffix}`,
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
  pmId,
}: {
  projectId: string
  projectName: string
  pmId: string
}) {
  const now = new Date()
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  // Check for overdue incomplete milestones
  const overdueMilestone = await prisma.milestone.findFirst({
    where: {
      projectId,
      dueDate: { lt: now },
      status: { not: 'done' },
    },
  })
  if (!overdueMilestone) return

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
