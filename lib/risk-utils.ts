import { type Project } from './mock-data'

export type AutoRiskType =
  | 'overdue-task'
  | 'blocked-chain'
  | 'pending-delay'
  | 'no-update'
  | 'milestone-delay'
  | 'support-needed'

export interface AutoRisk {
  id: string
  projectId: string
  type: AutoRiskType
  title: string
  description: string
  severity: 'low' | 'medium' | 'high'
  relatedTaskIds: string[]
  relatedMilestoneId?: string
  assignee?: string
}

const RISK_TYPE_LABELS: Record<AutoRiskType, string> = {
  'overdue-task': '任務逾期',
  'blocked-chain': '任務受阻',
  'pending-delay': '待審延期',
  'no-update': '長期無更新',
  'milestone-delay': '里程碑延誤',
  'support-needed': '需要協助',
}

export function getRiskTypeLabel(type: AutoRiskType): string {
  return RISK_TYPE_LABELS[type]
}

export function computeProjectRisks(project: Project): AutoRisk[] {
  const risks: AutoRisk[] = []
  const now = new Date()

  // 1. Overdue tasks — tasks past endDate and not completed
  project.tasks.forEach(task => {
    if (task.completedAt) return
    const endDate = new Date(task.endDate)
    if (now <= endDate) return

    const daysOverdue = Math.ceil((now.getTime() - endDate.getTime()) / (1000 * 60 * 60 * 24))
    risks.push({
      id: `risk-overdue-${task.id}`,
      projectId: project.id,
      type: 'overdue-task',
      title: `${task.title}`,
      description: `已逾期 ${daysOverdue} 天`,
      severity: daysOverdue > 14 ? 'high' : daysOverdue > 7 ? 'medium' : 'low',
      relatedTaskIds: [task.id],
      assignee: task.assignee,
    })
  })

  // 2. Blocked by dependencies — tasks whose start date has passed but upstream deps aren't done
  project.tasks.forEach(task => {
    if (task.completedAt) return
    if (task.dependencies.length === 0) return
    if (new Date(task.startDate) > now) return

    const unfinishedDeps = task.dependencies
      .map(depId => project.tasks.find(t => t.id === depId))
      .filter(dep => dep && !dep.completedAt)

    if (unfinishedDeps.length > 0) {
      // Skip if already captured as overdue (avoid duplicate noise)
      const isAlsoOverdue = now > new Date(task.endDate)
      if (isAlsoOverdue) return

      const depNames = unfinishedDeps.map(d => d!.title).join('、')
      risks.push({
        id: `risk-blocked-${task.id}`,
        projectId: project.id,
        type: 'blocked-chain',
        title: `${task.title}`,
        description: `前置任務未完成：${depNames}`,
        severity: 'medium',
        relatedTaskIds: [task.id, ...unfinishedDeps.map(d => d!.id)],
        assignee: task.assignee,
      })
    }
  })

  // 3. Pending delay requests
  project.delayRequests
    .filter(r => r.status === 'pending')
    .forEach(dr => {
      const daysPending = Math.ceil((now.getTime() - new Date(dr.requestedAt).getTime()) / (1000 * 60 * 60 * 24))
      const reasonPreview = dr.reason.length > 60 ? dr.reason.substring(0, 60) + '...' : dr.reason
      risks.push({
        id: `risk-delay-${dr.id}`,
        projectId: project.id,
        type: 'pending-delay',
        title: `延期申請待審核`,
        description: `${dr.requestedBy} 提出已 ${daysPending} 天 — ${reasonPreview}`,
        severity: daysPending > 3 ? 'high' : 'medium',
        relatedTaskIds: [],
        assignee: dr.requestedBy,
      })
    })

  // 4. No recent updates — in-progress tasks with no TaskLog in 7+ days
  const sevenDaysAgo = new Date(now)
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  project.tasks.forEach(task => {
    if (task.completedAt) return
    if (task.status !== 'in-progress') return
    if (new Date(task.startDate) > now) return
    // Skip if already overdue (avoid duplicate)
    if (now > new Date(task.endDate)) return

    const taskLogs = project.taskLogs.filter(l => l.taskId === task.id)
    const hasRecentLog = taskLogs.some(l => new Date(l.logDate) >= sevenDaysAgo)

    if (!hasRecentLog) {
      const lastLog = taskLogs.sort((a, b) => new Date(b.logDate).getTime() - new Date(a.logDate).getTime())[0]
      const lastDate = lastLog
        ? new Date(lastLog.logDate).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })
        : '無紀錄'
      risks.push({
        id: `risk-noupdate-${task.id}`,
        projectId: project.id,
        type: 'no-update',
        title: `${task.title}`,
        description: `超過 7 天未回報進度（最後更新：${lastDate}）`,
        severity: 'medium',
        relatedTaskIds: [task.id],
        assignee: task.assignee,
      })
    }
  })

  // 5. Milestone delay — milestones past dueDate and not done
  project.milestones.forEach(ms => {
    if (ms.status === 'done') return
    const dueDate = new Date(ms.dueDate)
    if (now <= dueDate) return

    const daysOverdue = Math.ceil((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))
    risks.push({
      id: `risk-milestone-${ms.id}`,
      projectId: project.id,
      type: 'milestone-delay',
      title: `${ms.name}`,
      description: `已超過預定日期 ${daysOverdue} 天，目前進度 ${ms.progress}%`,
      severity: daysOverdue > 14 ? 'high' : 'medium',
      relatedMilestoneId: ms.id,
      relatedTaskIds: [],
    })
  })

  // 6. Approved delay requests with unresolved support needs
  project.delayRequests
    .filter(r => r.status === 'approved' && r.supportNeeded && r.supportNeeded.trim() !== '' && !r.supportResolved)
    .forEach(dr => {
      risks.push({
        id: `risk-support-${dr.id}`,
        projectId: project.id,
        type: 'support-needed',
        title: `成員需要協助`,
        description: `${dr.requestedBy}：${dr.supportNeeded}`,
        severity: 'high',
        relatedTaskIds: [],
        assignee: dr.requestedBy,
      })
    })

  // Sort: high severity first, then medium, then low
  const severityOrder = { high: 0, medium: 1, low: 2 }
  risks.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])

  return risks
}
