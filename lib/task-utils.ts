import { type Task, type TaskLog } from './mock-data'

export type ComputedTaskStatus = 'completed' | 'on-track' | 'at-risk' | 'overdue' | 'not-started'

const AT_RISK_THRESHOLD_DAYS = 7
const NO_RECENT_LOG_DAYS = 7

export function computeTaskStatus(
  task: Task,
  taskLogs: TaskLog[],
  referenceDate: Date = new Date()
): ComputedTaskStatus {
  if (task.completedAt) return 'completed'

  const endDate = new Date(task.endDate)
  const startDate = new Date(task.startDate)

  if (referenceDate > endDate) return 'overdue'

  const taskSpecificLogs = taskLogs.filter(l => l.taskId === task.id)

  if (referenceDate < startDate && taskSpecificLogs.length === 0) return 'not-started'

  const daysToDeadline = Math.ceil(
    (endDate.getTime() - referenceDate.getTime()) / (1000 * 60 * 60 * 24)
  )

  if (daysToDeadline <= AT_RISK_THRESHOLD_DAYS) {
    const recentCutoff = new Date(referenceDate)
    recentCutoff.setDate(recentCutoff.getDate() - NO_RECENT_LOG_DAYS)
    const hasRecentLog = taskSpecificLogs.some(l => new Date(l.logDate) >= recentCutoff)
    if (!hasRecentLog) return 'at-risk'
  }

  return 'on-track'
}

export function computeTaskProgress(task: Task): number {
  if (task.completedAt) return 100

  const now = new Date()
  const start = new Date(task.startDate)
  const end = new Date(task.endDate)

  if (now <= start) return 0
  if (now >= end) return 95

  const elapsed = now.getTime() - start.getTime()
  const total = end.getTime() - start.getTime()
  return Math.min(95, Math.round((elapsed / total) * 100))
}

export function getStatusLabel(status: ComputedTaskStatus): string {
  switch (status) {
    case 'completed': return '已完成'
    case 'on-track': return '正常'
    case 'at-risk': return '注意'
    case 'overdue': return '逾期'
    case 'not-started': return '未開始'
  }
}

export function getStatusColor(status: ComputedTaskStatus): string {
  switch (status) {
    case 'completed': return 'bg-emerald-100 text-emerald-700 border-emerald-300'
    case 'on-track': return 'bg-blue-100 text-blue-700 border-blue-300'
    case 'at-risk': return 'bg-amber-100 text-amber-700 border-amber-300'
    case 'overdue': return 'bg-red-100 text-red-700 border-red-300'
    case 'not-started': return 'bg-slate-100 text-slate-600 border-slate-300'
  }
}

export function getAtRiskTasks(tasks: Task[], taskLogs: TaskLog[]): Task[] {
  return tasks.filter(t => {
    const status = computeTaskStatus(t, taskLogs)
    return status === 'at-risk' || status === 'overdue'
  })
}

export function getDaysUntilDeadline(task: Task): number {
  const now = new Date()
  const end = new Date(task.endDate)
  return Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}
