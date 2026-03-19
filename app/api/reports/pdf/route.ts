import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { PROJECT_TYPE_LABELS } from '@/lib/mock-data'

// ─── Compute project status & progress from tasks/milestones (same logic as dashboard) ───
function computeProjectProgress(milestones: { progress: number }[]): number {
  if (milestones.length === 0) return 0
  const total = milestones.reduce((sum, m) => sum + m.progress, 0)
  return Math.round(total / milestones.length)
}

function computeProjectStatus(
  tasks: { status: string; endDate: Date }[],
  projectEndDate: Date,
): 'green' | 'yellow' | 'red' {
  if (tasks.length === 0) return 'green'

  const today = new Date().toISOString().split('T')[0]
  const overdueTasks = tasks.filter(t => t.status !== 'done' && t.endDate.toISOString().split('T')[0] < today)
  const blockedTasks = tasks.filter(t => t.status === 'blocked')
  const doneTasks = tasks.filter(t => t.status === 'done')

  if (doneTasks.length === tasks.length) return 'green'

  const overdueRatio = overdueTasks.length / tasks.length
  const blockedRatio = blockedTasks.length / tasks.length

  const projectEnd = projectEndDate.toISOString().split('T')[0]
  if (overdueRatio > 0.3 || blockedRatio > 0.2 || (projectEnd < today && doneTasks.length < tasks.length)) {
    return 'red'
  }

  if (overdueTasks.length > 0 || blockedTasks.length > 0) {
    return 'yellow'
  }

  return 'green'
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { projectIds } = body

    if (!projectIds || !Array.isArray(projectIds) || projectIds.length === 0) {
      return NextResponse.json(
        { error: '請選擇至少一個專案' },
        { status: 400 },
      )
    }

    // Fetch selected projects with full details
    const projects = await prisma.project.findMany({
      where: { id: { in: projectIds } },
      include: {
        owner: { select: { name: true } },
        milestones: { orderBy: { sortOrder: 'asc' } },
        tasks: {
          include: { children: true },
          orderBy: { sortOrder: 'asc' },
        },
        risks: { where: { status: 'open' } },
        teamMembers: {
          include: {
            user: { select: { name: true, email: true } },
          },
        },
        delayRequests: {
          include: {
            requester: { select: { name: true } },
            reviewer: { select: { name: true } },
            affectedMilestones: true,
            task: { select: { id: true, title: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        taskLogs: {
          include: { author: { select: { name: true } } },
          orderBy: { logDate: 'desc' },
        },
      },
    })

    // Compute actual status & progress for each project (same logic as dashboard)
    const projectsWithStatus = projects.map(p => {
      const parentTasks = p.tasks.filter(t => !t.parentId)
      const actualStatus = computeProjectStatus(parentTasks, p.endDate)
      const actualProgress = computeProjectProgress(p.milestones)
      return { ...p, actualStatus, actualProgress }
    })

    // Calculate summary statistics (parent tasks only, exclude subtasks)
    const totalTasks = projectsWithStatus.reduce((sum, p) => sum + p.tasks.filter(t => !t.parentId).length, 0)
    const doneTasks = projectsWithStatus.reduce(
      (sum, p) => sum + p.tasks.filter(t => !t.parentId && t.status === 'done').length,
      0,
    )
    const totalMilestones = projectsWithStatus.reduce((sum, p) => sum + p.milestones.length, 0)
    const doneMilestones = projectsWithStatus.reduce(
      (sum, p) => sum + p.milestones.filter(m => m.status === 'done').length,
      0,
    )
    const totalBudget = projectsWithStatus.reduce((sum, p) => sum + p.budget, 0)
    const totalBudgetUsed = projectsWithStatus.reduce((sum, p) => sum + p.budgetUsed, 0)
    // Build HTML content for PDF
    const now = new Date().toLocaleString('zh-TW', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })

    const fmtMoney = (n: number) => {
      if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`
      if (n >= 1000) return `$${(n / 1000).toFixed(0)}K`
      return `$${n}`
    }

    const html = `
<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <title>專案報告</title>
  <style>
    @page {
      size: A4 landscape;
      margin: 15mm;
    }
    @media print {
      .page-break {
        page-break-before: always;
        break-before: page;
        margin-top: 24px !important;
      }
      .avoid-break {
        page-break-inside: avoid;
        break-inside: avoid;
      }
      body {
        margin: 0;
        padding: 24px 20px !important;
      }
      * {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        color-adjust: exact !important;
      }
    }
    body {
      font-family: "Microsoft JhengHei", "微軟正黑體", sans-serif;
      line-height: 1.5;
      color: #0f172a;
      margin: 0;
      padding: 32px 40px;
      font-size: 12px;
      background: #f1f5f9;
    }
    h1 {
      font-size: 24px;
      font-weight: 700;
      color: #0f172a;
      margin: 0 0 4px 0;
    }
    .subtitle {
      color: #64748b;
      font-size: 12px;
      margin: 0 0 16px 0;
    }
    .card {
      background: white !important;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
      padding: 16px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      page-break-inside: avoid;
    }
    .card-title {
      font-size: 13px;
      font-weight: 600;
      color: #0f172a;
      margin: 0 0 12px 0;
    }
    .grid {
      display: grid;
      gap: 12px;
    }
    .grid-2 {
      grid-template-columns: 1fr 1fr;
    }
    .grid-3 {
      grid-template-columns: 1fr 1fr 1fr;
    }
    .grid-4 {
      grid-template-columns: 1fr 1fr 1fr 1fr;
    }
    .stat-card {
      background: white !important;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
      padding: 12px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .stat-label {
      font-size: 11px;
      color: #64748b;
      margin-bottom: 6px;
      display: block;
    }
    .stat-value {
      font-size: 20px;
      font-weight: 700;
      color: #0f172a;
    }
    .stat-sub {
      font-size: 11px;
      color: #64748b;
      margin-top: 4px;
    }
    .badge {
      display: inline-block;
      padding: 3px 10px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
    }
    .badge-green {
      background: #d1fae5 !important;
      color: #065f46 !important;
    }
    .badge-yellow {
      background: #fef3c7 !important;
      color: #92400e !important;
    }
    .badge-red {
      background: #fee2e2 !important;
      color: #991b1b !important;
    }
    .donut-chart {
      position: relative;
      width: 140px;
      height: 140px;
      margin: 0 auto;
    }
    .donut-center {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      text-align: center;
    }
    .donut-value {
      font-size: 22px;
      font-weight: 700;
      color: #0f172a;
    }
    .donut-label {
      font-size: 10px;
      color: #64748b;
    }
    .legend {
      margin-top: 12px;
    }
    .legend-item {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;
      font-size: 11px;
    }
    .legend-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .legend-label {
      color: #64748b;
      flex: 1;
    }
    .legend-value {
      font-weight: 600;
      color: #0f172a;
    }
    .project-item {
      padding: 10px;
      border-radius: 6px;
      border: 1px solid #e2e8f0;
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .project-info {
      flex: 1;
      min-width: 0;
    }
    .project-name {
      font-weight: 600;
      font-size: 12px;
      color: #0f172a;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .project-meta {
      font-size: 10px;
      color: #64748b;
      margin-top: 2px;
    }
    .mini-ring {
      width: 40px;
      height: 40px;
      flex-shrink: 0;
    }
    .milestone-item {
      background: #f8fafc !important;
      border-radius: 6px;
      border-left: 3px solid;
      padding: 10px;
      margin-bottom: 8px;
    }
    .milestone-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
    }
    .milestone-name {
      font-weight: 600;
      font-size: 11px;
      color: #0f172a;
    }
    .milestone-date {
      font-size: 10px;
      color: #64748b;
    }
    .progress-bar {
      height: 8px;
      background: #e2e8f0 !important;
      border-radius: 4px;
      overflow: hidden;
      margin: 4px 0;
    }
    .progress-fill {
      height: 100%;
      border-radius: 4px;
      transition: width 0.3s;
    }
    .milestone-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 4px;
      font-size: 10px;
    }
    .risk-item {
      padding: 10px;
      border-radius: 6px;
      border: 1px solid #e2e8f0;
      background: #fef2f2 !important;
      margin-bottom: 8px;
    }
    .risk-title {
      font-weight: 600;
      font-size: 11px;
      color: #0f172a;
      margin-bottom: 4px;
    }
    .risk-meta {
      font-size: 10px;
      color: #64748b;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10px;
      margin: 8px 0;
    }
    th, td {
      padding: 6px 8px;
      text-align: left;
      border: 1px solid #e2e8f0;
    }
    th {
      background: #f1f5f9 !important;
      font-weight: 600;
      color: #475569;
    }
    tbody tr:nth-child(even) {
      background: #f8fafc !important;
    }
    .task-status {
      display: inline-block;
      padding: 1px 6px;
      border-radius: 4px;
      font-size: 9px;
      font-weight: 600;
    }
    .task-status-done { background: #d1fae5 !important; color: #065f46 !important; }
    .task-status-inprogress { background: #dbeafe !important; color: #1e40af !important; }
    .task-status-blocked { background: #fee2e2 !important; color: #991b1b !important; }
    .task-status-todo { background: #f1f5f9 !important; color: #475569 !important; }
    .task-priority-high { color: #dc2626; font-weight: 600; }
    .task-priority-medium { color: #d97706; }
    .task-priority-low { color: #64748b; }
    .subtask-row td { padding-left: 24px !important; color: #64748b; }
    .workload-bar-container {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;
    }
    .workload-name {
      width: 80px;
      font-size: 10px;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      flex-shrink: 0;
    }
    .workload-bar {
      flex: 1;
      height: 14px;
      background: #e2e8f0 !important;
      border-radius: 4px;
      overflow: hidden;
      position: relative;
    }
    .workload-bar-fill {
      height: 100%;
      border-radius: 4px;
      position: absolute;
      top: 0;
      left: 0;
    }
    .workload-count {
      width: 40px;
      text-align: right;
      font-size: 10px;
      color: #64748b;
      flex-shrink: 0;
    }
    .activity-item {
      display: flex;
      gap: 8px;
      padding: 4px 0;
      border-bottom: 1px solid #f1f5f9;
      font-size: 10px;
    }
    .activity-date {
      color: #64748b;
      white-space: nowrap;
      flex-shrink: 0;
      width: 70px;
    }
    .activity-content {
      flex: 1;
      min-width: 0;
    }
    .activity-author {
      color: #64748b;
      flex-shrink: 0;
    }
    .delay-item {
      padding: 8px;
      border-radius: 6px;
      border: 1px solid #e2e8f0;
      margin-bottom: 6px;
    }
    .delay-status {
      display: inline-block;
      padding: 1px 6px;
      border-radius: 4px;
      font-size: 9px;
      font-weight: 600;
    }
    .delay-pending { background: #fef3c7 !important; color: #92400e !important; }
    .delay-approved { background: #d1fae5 !important; color: #065f46 !important; }
    .delay-rejected { background: #fee2e2 !important; color: #991b1b !important; }
  </style>
</head>
<body>
  <h1>專案報告</h1>
  <div class="subtitle">生成時間：${now}</div>

  <!-- Stats Overview -->
  ${(() => {
    const avgProgress = projectsWithStatus.length > 0
      ? Math.round(projectsWithStatus.reduce((sum, p) => sum + p.actualProgress, 0) / projectsWithStatus.length)
      : 0
    const totalRisksAndDelays = projectsWithStatus.reduce((sum, p) => sum + p.risks.length, 0)
    return `
  <div class="grid grid-4 avoid-break" style="margin-bottom: 16px;">
    <div class="stat-card">
      <span class="stat-label">整體進度</span>
      <div class="stat-value">${avgProgress}%</div>
      <div class="stat-sub">共 ${projectsWithStatus.length} 個專案</div>
    </div>
    <div class="stat-card">
      <span class="stat-label">預算執行</span>
      <div class="stat-value">${totalBudget > 0 ? Math.round((totalBudgetUsed / totalBudget) * 100) : 0}%</div>
      <div class="stat-sub">${fmtMoney(totalBudgetUsed)} / ${fmtMoney(totalBudget)}</div>
    </div>
    <div class="stat-card">
      <span class="stat-label">里程碑</span>
      <div class="stat-value">${doneMilestones}/${totalMilestones}</div>
      <div class="stat-sub">${totalMilestones > 0 ? Math.round((doneMilestones / totalMilestones) * 100) : 0}% 完成</div>
    </div>
    <div class="stat-card">
      <span class="stat-label">未解決風險</span>
      <div class="stat-value" style="color: ${totalRisksAndDelays > 0 ? '#dc2626' : '#0f172a'};">${totalRisksAndDelays}</div>
      <div class="stat-sub">個未解決風險</div>
    </div>
  </div>`
  })()}

  <!-- Charts Section -->
  <div class="grid grid-3 avoid-break" style="margin-bottom: 20px;">
    ${(() => {
      const inProgressTasks = projectsWithStatus.reduce((sum, p) => sum + p.tasks.filter(t => !t.parentId && t.status === 'in_progress').length, 0)
      const blockedTasks = projectsWithStatus.reduce((sum, p) => sum + p.tasks.filter(t => !t.parentId && t.status === 'blocked').length, 0)
      const todoTasks = totalTasks - doneTasks - inProgressTasks - blockedTasks

      const C = 2 * Math.PI * 50
      const taskSegs = [
        { v: doneTasks, color: '#10b981' },
        { v: inProgressTasks, color: '#3b82f6' },
        { v: todoTasks, color: '#94a3b8' },
        { v: blockedTasks, color: '#ef4444' },
      ]
      let taskAcc = 0
      const taskCircles = totalTasks > 0 ? taskSegs.filter(s => s.v > 0).map(s => {
        const dl = C * (s.v / totalTasks)
        const doff = C * (1 - taskAcc / totalTasks)
        taskAcc += s.v
        return `<circle cx="70" cy="70" r="50" fill="none" stroke="${s.color}" stroke-width="20" stroke-dasharray="${dl} ${C - dl}" stroke-dashoffset="${doff}"/>`
      }).join('') : ''

      return `
        <div class="card">
          <div class="card-title">任務狀態分佈</div>
          <div class="donut-chart">
            <svg width="140" height="140" viewBox="0 0 140 140" style="transform: rotate(-90deg); transform-origin: 50% 50%;">
              <circle cx="70" cy="70" r="50" fill="none" stroke="#e2e8f0" stroke-width="20"/>
              ${taskCircles}
            </svg>
            <div class="donut-center">
              <div class="donut-value">${totalTasks}</div>
              <div class="donut-label">總任務</div>
            </div>
          </div>
          <div class="legend">
            <div class="legend-item">
              <span class="legend-dot" style="background: #10b981;"></span>
              <span class="legend-label">已完成</span>
              <span class="legend-value">${doneTasks}</span>
            </div>
            <div class="legend-item">
              <span class="legend-dot" style="background: #3b82f6;"></span>
              <span class="legend-label">進行中</span>
              <span class="legend-value">${inProgressTasks}</span>
            </div>
            <div class="legend-item">
              <span class="legend-dot" style="background: #94a3b8;"></span>
              <span class="legend-label">待辦</span>
              <span class="legend-value">${todoTasks}</span>
            </div>
            <div class="legend-item">
              <span class="legend-dot" style="background: #ef4444;"></span>
              <span class="legend-label">受阻</span>
              <span class="legend-value">${blockedTasks}</span>
            </div>
          </div>
        </div>
      `
    })()}

    ${(() => {
      const greenProjects = projectsWithStatus.filter(p => p.actualStatus === 'green').length
      const yellowProjects = projectsWithStatus.filter(p => p.actualStatus === 'yellow').length
      const redProjects = projectsWithStatus.filter(p => p.actualStatus === 'red').length
      const totalP = projectsWithStatus.length

      const C = 2 * Math.PI * 50
      const healthSegs = [
        { v: greenProjects, color: '#10b981' },
        { v: yellowProjects, color: '#f59e0b' },
        { v: redProjects, color: '#ef4444' },
      ]
      let healthAcc = 0
      const healthCircles = totalP > 0 ? healthSegs.filter(s => s.v > 0).map(s => {
        const dl = C * (s.v / totalP)
        const doff = C * (1 - healthAcc / totalP)
        healthAcc += s.v
        return `<circle cx="70" cy="70" r="50" fill="none" stroke="${s.color}" stroke-width="20" stroke-dasharray="${dl} ${C - dl}" stroke-dashoffset="${doff}"/>`
      }).join('') : ''

      return `
        <div class="card">
          <div class="card-title">專案健康度</div>
          <div class="donut-chart">
            <svg width="140" height="140" viewBox="0 0 140 140" style="transform: rotate(-90deg); transform-origin: 50% 50%;">
              <circle cx="70" cy="70" r="50" fill="none" stroke="#e2e8f0" stroke-width="20"/>
              ${healthCircles}
            </svg>
            <div class="donut-center">
              <div class="donut-value">${totalP}</div>
              <div class="donut-label">專案</div>
            </div>
          </div>
          <div class="legend">
            <div class="legend-item">
              <span class="legend-dot" style="background: #10b981;"></span>
              <span class="legend-label">正常</span>
              <span class="legend-value">${greenProjects}</span>
            </div>
            <div class="legend-item">
              <span class="legend-dot" style="background: #f59e0b;"></span>
              <span class="legend-label">注意</span>
              <span class="legend-value">${yellowProjects}</span>
            </div>
            <div class="legend-item">
              <span class="legend-dot" style="background: #ef4444;"></span>
              <span class="legend-label">風險</span>
              <span class="legend-value">${redProjects}</span>
            </div>
          </div>
        </div>
      `
    })()}

    ${(() => {
      const budgetPercent = totalBudget > 0 ? Math.round((totalBudgetUsed / totalBudget) * 100) : 0
      const isOverBudget = budgetPercent > 100

      return `
        <div class="card">
          <div class="card-title">預算執行狀況</div>
          <div class="donut-chart">
            <svg width="140" height="140" viewBox="0 0 140 140" style="transform: rotate(-90deg); transform-origin: 50% 50%;">
              <circle cx="70" cy="70" r="50" fill="none" stroke="#e2e8f0" stroke-width="20"/>
              ${totalBudget > 0 ? (() => {
                const C = 2 * Math.PI * 50
                const dl = C * Math.min(budgetPercent, 100) / 100
                return `<circle cx="70" cy="70" r="50" fill="none" stroke="${isOverBudget ? '#ef4444' : budgetPercent > 80 ? '#f59e0b' : '#10b981'}" stroke-width="20" stroke-dasharray="${dl} ${C - dl}" stroke-dashoffset="${C}"/>`
              })() : ''}
            </svg>
            <div class="donut-center">
              <div class="donut-value" style="color: ${isOverBudget ? '#dc2626' : '#0f172a'};">${budgetPercent}%</div>
              <div class="donut-label">執行率</div>
            </div>
          </div>
          <div class="legend">
            <div class="legend-item">
              <span class="legend-dot" style="background: ${isOverBudget ? '#ef4444' : '#10b981'};"></span>
              <span class="legend-label">已使用</span>
              <span class="legend-value">${fmtMoney(totalBudgetUsed)}</span>
            </div>
            <div class="legend-item">
              <span class="legend-dot" style="background: #e2e8f0;"></span>
              <span class="legend-label">剩餘</span>
              <span class="legend-value">${fmtMoney(Math.max(totalBudget - totalBudgetUsed, 0))}</span>
            </div>
            <div class="legend-item" style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #e2e8f0;">
              <span style="color: #64748b; font-size: 10px;">總預算</span>
              <span class="legend-value">${fmtMoney(totalBudget)}</span>
            </div>
          </div>
        </div>
      `
    })()}
  </div>

  <!-- Projects Detail (each on separate page) -->
  ${projectsWithStatus.map((project, index) => {
    const statusClass =
      project.actualStatus === 'green' ? 'badge-green' :
      project.actualStatus === 'yellow' ? 'badge-yellow' : 'badge-red'
    const statusText =
      project.actualStatus === 'green' ? '正常' :
      project.actualStatus === 'yellow' ? '注意' : '風險'

    return `
      ${index > 0 ? '<div class="page-break"></div>' : ''}
      <div class="avoid-break" style="margin-bottom: 16px; padding-top: ${index > 0 ? '40px' : '0'};">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: ${index === 0 ? '20px' : '0'}; margin-bottom: 20px;">
          <h2 style="margin: 0; font-size: 20px; font-weight: 700;">${index + 1}. ${project.name}</h2>
          <span class="badge ${statusClass}">${statusText}</span>
        </div>

        <!-- Project Info Cards -->
        <div class="grid grid-4" style="margin-bottom: 12px;">
          <div class="stat-card">
            <span class="stat-label">專案編碼</span>
            <div style="font-size: 13px; font-weight: 600; color: #0f172a; margin-top: 4px;">${project.projectCode}</div>
          </div>
          <div class="stat-card">
            <span class="stat-label">專案類型</span>
            <div style="font-size: 13px; font-weight: 600; color: #0f172a; margin-top: 4px;">${PROJECT_TYPE_LABELS[project.projectType as keyof typeof PROJECT_TYPE_LABELS] || project.projectType}</div>
          </div>
          <div class="stat-card">
            <span class="stat-label">負責人</span>
            <div style="font-size: 13px; font-weight: 600; color: #0f172a; margin-top: 4px;">${project.owner.name}</div>
          </div>
          <div class="stat-card">
            <span class="stat-label">團隊規模</span>
            <div style="font-size: 13px; font-weight: 600; color: #0f172a; margin-top: 4px;">${project.teamMembers.length} 人</div>
          </div>
        </div>

        <div class="grid grid-3" style="margin-bottom: 12px;">
          <div class="stat-card">
            <span class="stat-label">專案期間</span>
            <div style="font-size: 11px; font-weight: 600; color: #0f172a; margin-top: 4px;">${new Date(project.startDate).toLocaleDateString('zh-TW')} ~ ${new Date(project.endDate).toLocaleDateString('zh-TW')}</div>
          </div>
          <div class="stat-card">
            <span class="stat-label">進度</span>
            <div style="font-size: 14px; font-weight: 700; color: #0f172a; margin-top: 4px;">${project.actualProgress}%</div>
            <div class="progress-bar" style="margin-top: 6px;">
              <div class="progress-fill" style="width: ${project.actualProgress}%; background: #3b82f6;"></div>
            </div>
          </div>
          <div class="stat-card">
            <span class="stat-label">預算</span>
            <div style="font-size: 11px; font-weight: 600; color: #0f172a; margin-top: 4px;">${fmtMoney(project.budgetUsed)} / ${fmtMoney(project.budget)}</div>
          </div>
        </div>

        ${project.milestones.length > 0 ? `
          <div class="card" style="margin-bottom: 12px;">
            <div class="card-title">里程碑進度（${project.milestones.filter(m => m.status === 'done').length}/${project.milestones.length} 已完成）</div>
            ${project.milestones.map(m => {
              const statusColor =
                m.status === 'done' ? '#10b981' :
                m.status === 'in_progress' ? '#3b82f6' :
                m.status === 'blocked' ? '#ef4444' : '#94a3b8'

              const statusText =
                m.status === 'done' ? '✓ 已完成' :
                m.status === 'in_progress' ? '→ 進行中' :
                m.status === 'blocked' ? '✕ 受阻' : '○ 待辦'

              return `
                <div class="milestone-item" style="border-left-color: ${statusColor};">
                  <div class="milestone-header">
                    <span class="milestone-name">${m.name}</span>
                    <span class="milestone-date">${new Date(m.dueDate).toLocaleDateString('zh-TW')}</span>
                  </div>
                  <div class="progress-bar">
                    <div class="progress-fill" style="width: ${m.progress}%; background: ${statusColor};"></div>
                  </div>
                  <div class="milestone-footer">
                    <span style="color: #64748b;">${statusText}</span>
                    <span style="font-weight: 600; color: #0f172a;">${m.progress}%</span>
                  </div>
                </div>
              `
            }).join('')}
          </div>
        ` : ''}

        ${(() => {
          const parentTasks = project.tasks.filter(t => !t.parentId)
          if (parentTasks.length === 0) return ''

          const fmtStatus = (s: string) => {
            if (s === 'done') return '<span class="task-status task-status-done">完成</span>'
            if (s === 'in_progress') return '<span class="task-status task-status-inprogress">進行中</span>'
            if (s === 'blocked') return '<span class="task-status task-status-blocked">受阻</span>'
            return '<span class="task-status task-status-todo">待辦</span>'
          }
          const fmtPriority = (p: string) => {
            if (p === 'high') return '<span class="task-priority-high">高</span>'
            if (p === 'medium') return '<span class="task-priority-medium">中</span>'
            return '<span class="task-priority-low">低</span>'
          }
          const fmtDate = (d: Date) => new Date(d).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })

          return project.milestones.map(ms => {
            const msTasks = parentTasks.filter(t => t.milestoneId === ms.id)
            if (msTasks.length === 0) return ''

            const msStatusColor =
              ms.status === 'done' ? '#10b981' :
              ms.status === 'in_progress' ? '#3b82f6' :
              ms.status === 'blocked' ? '#ef4444' : '#94a3b8'

            return `
              <div class="card" style="margin-bottom: 12px;">
                <div class="card-title" style="display: flex; align-items: center; gap: 6px;">
                  <span style="width: 8px; height: 8px; border-radius: 50%; background: ${msStatusColor}; flex-shrink: 0;"></span>
                  ${ms.name}
                  <span style="font-weight: 400; color: #64748b; margin-left: auto; font-size: 10px;">${ms.progress}% · 到期 ${fmtDate(ms.dueDate)}</span>
                </div>
                <table>
                  <thead>
                    <tr>
                      <th style="width: 30%;">任務名稱</th>
                      <th style="width: 10%;">負責人</th>
                      <th style="width: 10%;">狀態</th>
                      <th style="width: 8%;">優先</th>
                      <th style="width: 18%;">起迄</th>
                      <th style="width: 24%;">進度</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${msTasks.map(task => {
                      const subtasks = (task as typeof task & { children?: typeof project.tasks }).children || []
                      return `
                        <tr>
                          <td style="font-weight: 600;">${task.title}</td>
                          <td>${task.assignee}</td>
                          <td>${fmtStatus(task.status)}</td>
                          <td>${fmtPriority(task.priority)}</td>
                          <td style="white-space: nowrap;">${fmtDate(task.startDate)} ~ ${fmtDate(task.endDate)}</td>
                          <td>
                            <div style="display: flex; align-items: center; gap: 4px;">
                              <div class="progress-bar" style="flex: 1; height: 6px; margin: 0;">
                                <div class="progress-fill" style="width: ${task.progress}%; background: #3b82f6;"></div>
                              </div>
                              <span style="font-size: 9px; color: #64748b; width: 28px; text-align: right;">${task.progress}%</span>
                            </div>
                          </td>
                        </tr>
                        ${subtasks.map(sub => `
                          <tr class="subtask-row">
                            <td>└ ${sub.title}</td>
                            <td>${sub.assignee}</td>
                            <td>${fmtStatus(sub.status)}</td>
                            <td>${fmtPriority(sub.priority)}</td>
                            <td style="white-space: nowrap;">${fmtDate(sub.startDate)} ~ ${fmtDate(sub.endDate)}</td>
                            <td>
                              <div style="display: flex; align-items: center; gap: 4px;">
                                <div class="progress-bar" style="flex: 1; height: 6px; margin: 0;">
                                  <div class="progress-fill" style="width: ${sub.progress}%; background: #93c5fd;"></div>
                                </div>
                                <span style="font-size: 9px; color: #64748b; width: 28px; text-align: right;">${sub.progress}%</span>
                              </div>
                            </td>
                          </tr>
                        `).join('')}
                      `
                    }).join('')}
                  </tbody>
                </table>
              </div>
            `
          }).join('')
        })()}

        ${(() => {
          const parentTasks = project.tasks.filter(t => !t.parentId)
          if (parentTasks.length === 0) return ''
          const memberMap = new Map<string, { total: number; done: number }>()
          parentTasks.forEach(t => {
            const entry = memberMap.get(t.assignee) || { total: 0, done: 0 }
            entry.total++
            if (t.status === 'done') entry.done++
            memberMap.set(t.assignee, entry)
          })
          const members = [...memberMap.entries()]
            .sort((a, b) => b[1].total - a[1].total)
          const maxTasks = Math.max(...members.map(m => m[1].total), 1)

          return `
            <div class="card" style="margin-bottom: 12px;">
              <div class="card-title">團隊工作量</div>
              ${members.map(([name, { total, done }]) => `
                <div class="workload-bar-container">
                  <span class="workload-name">${name}</span>
                  <div class="workload-bar">
                    <div class="workload-bar-fill" style="width: ${(total / maxTasks) * 100}%; background: #93c5fd !important;"></div>
                    <div class="workload-bar-fill" style="width: ${(done / maxTasks) * 100}%; background: #10b981 !important;"></div>
                  </div>
                  <span class="workload-count">${done}/${total}</span>
                </div>
              `).join('')}
              <div style="display: flex; gap: 12px; font-size: 9px; color: #64748b; margin-top: 4px;">
                <span><span style="display: inline-block; width: 10px; height: 6px; border-radius: 2px; background: #10b981; vertical-align: middle;"></span> 已完成</span>
                <span><span style="display: inline-block; width: 10px; height: 6px; border-radius: 2px; background: #93c5fd; vertical-align: middle;"></span> 總任務</span>
              </div>
            </div>
          `
        })()}

        ${(() => {
          const logs = project.taskLogs || []
          const twoWeeksAgo = new Date()
          twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14)
          const recentLogs = logs.filter(l => new Date(l.logDate) >= twoWeeksAgo).slice(0, 30)
          if (recentLogs.length === 0) return ''

          const taskMap = new Map(project.tasks.map(t => [t.id, t]))

          return `
            <div class="card" style="margin-bottom: 12px;">
              <div class="card-title">近期活動記錄（最近兩週）</div>
              ${recentLogs.map(log => {
                const task = taskMap.get(log.taskId)
                const isDone = task && task.status === 'done'
                return `
                  <div class="activity-item" ${isDone ? 'style="background: #f0fdf4 !important;"' : ''}>
                    <span class="activity-date">${new Date(log.logDate).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })}</span>
                    <div class="activity-content">
                      <span style="font-weight: 600;">${task ? task.title : '(未知任務)'}</span>
                      ${isDone ? '<span class="task-status task-status-done" style="margin-left: 4px;">完成</span>' : ''}
                      <div style="color: #64748b; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${log.content.length > 100 ? log.content.slice(0, 100) + '...' : log.content}</div>
                    </div>
                    <span class="activity-author">${log.author.name}</span>
                  </div>
                `
              }).join('')}
            </div>
          `
        })()}

        ${project.risks.length > 0 ? `
          <div class="card" style="margin-bottom: 12px;">
            <div class="card-title">未解決風險（${project.risks.length} 個）</div>
            ${project.risks.map(r => `
              <div class="risk-item">
                <div class="risk-title">${r.title}</div>
                <div class="risk-meta">
                  影響程度：${r.impact === 'high' ? '高' : r.impact === 'medium' ? '中' : '低'} |
                  發生機率：${r.probability === 'high' ? '高' : r.probability === 'medium' ? '中' : '低'}
                  ${r.mitigation ? ` | 緩解措施：${r.mitigation.length > 60 ? r.mitigation.slice(0, 60) + '...' : r.mitigation}` : ''}
                </div>
              </div>
            `).join('')}
          </div>
        ` : '<div class="card" style="margin-bottom: 12px;"><div style="color: #10b981; font-size: 12px;">✓ 無未解決風險</div></div>'}

        ${(() => {
          const delays = project.delayRequests || []
          if (delays.length === 0) return ''

          return `
            <div class="card" style="margin-bottom: 12px;">
              <div class="card-title">延期申請（${delays.length} 筆）</div>
              ${delays.map(dr => {
                const statusClass = dr.status === 'pending' ? 'delay-pending' : dr.status === 'approved' ? 'delay-approved' : 'delay-rejected'
                const statusText = dr.status === 'pending' ? '待審' : dr.status === 'approved' ? '已核准' : '已拒絕'
                return `
                  <div class="delay-item">
                    <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
                      <span class="delay-status ${statusClass}">${statusText}</span>
                      ${dr.task ? `<span style="font-weight: 600; font-size: 11px;">${dr.task.title}</span>` : ''}
                      <span style="color: #64748b; font-size: 9px; margin-left: auto;">${dr.requester.name} · ${new Date(dr.createdAt).toLocaleDateString('zh-TW')}</span>
                    </div>
                    <div style="font-size: 10px; color: #475569; margin-bottom: 4px;">${dr.reason.length > 120 ? dr.reason.slice(0, 120) + '...' : dr.reason}</div>
                    ${dr.affectedMilestones.length > 0 ? `
                      <div style="font-size: 9px; color: #64748b;">
                        ${dr.affectedMilestones.map(am => {
                          const msName = project.milestones.find(m => m.id === am.milestoneId)?.name || am.milestoneId
                          return `${msName}: <span style="text-decoration: line-through;">${new Date(am.originalDate).toLocaleDateString('zh-TW')}</span> → <span style="font-weight: 600;">${new Date(am.proposedDate).toLocaleDateString('zh-TW')}</span>`
                        }).join(' | ')}
                      </div>
                    ` : ''}
                  </div>
                `
              }).join('')}
            </div>
          `
        })()}

        ${project.teamMembers.length > 0 ? `
          <div class="card">
            <div class="card-title">團隊成員（${project.teamMembers.length} 人）</div>
            <table>
              <thead>
                <tr>
                  <th>姓名</th>
                  <th>職稱</th>
                  <th>Email</th>
                  <th>角色</th>
                  <th>職責</th>
                </tr>
              </thead>
              <tbody>
                ${project.teamMembers.map(tm => `
                  <tr>
                    <td>${tm.user.name}</td>
                    <td>${tm.jobTitle || ''}</td>
                    <td>${tm.user.email}</td>
                    <td>${tm.role === 'R' ? '負責 (R)' : tm.role === 'A' ? '當責 (A)' : tm.role === 'C' ? '諮詢 (C)' : tm.role === 'I' ? '知會 (I)' : tm.role}</td>
                    <td>${tm.responsibility}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : ''}
      </div>
    `
  }).join('')}

  <script>
    // Auto-print when loaded (optional)
    // window.onload = () => window.print();
  </script>
</body>
</html>
    `

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    })
  } catch (error) {
    console.error('Failed to generate PDF:', error)
    return NextResponse.json(
      { error: '生成 PDF 失敗' },
      { status: 500 },
    )
  }
}
