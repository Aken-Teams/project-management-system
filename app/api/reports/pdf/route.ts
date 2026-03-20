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
      },
    })

    // Compute actual status & progress for each project
    const projectsWithStatus = projects.map(p => {
      const parentTasks = p.tasks.filter(t => !t.parentId)
      const actualStatus = computeProjectStatus(parentTasks, p.endDate)
      const actualProgress = computeProjectProgress(p.milestones)
      return { ...p, actualStatus, actualProgress }
    })

    // Summary statistics
    const totalTasks = projectsWithStatus.reduce((sum, p) => sum + p.tasks.filter(t => !t.parentId).length, 0)
    const doneTasks = projectsWithStatus.reduce(
      (sum, p) => sum + p.tasks.filter(t => !t.parentId && t.status === 'done').length, 0,
    )
    const inProgressTasks = projectsWithStatus.reduce(
      (sum, p) => sum + p.tasks.filter(t => !t.parentId && t.status === 'in_progress').length, 0,
    )
    const totalMilestones = projectsWithStatus.reduce((sum, p) => sum + p.milestones.length, 0)
    const doneMilestones = projectsWithStatus.reduce(
      (sum, p) => sum + p.milestones.filter(m => m.status === 'done').length, 0,
    )
    const totalBudget = projectsWithStatus.reduce((sum, p) => sum + p.budget, 0)
    const totalBudgetUsed = projectsWithStatus.reduce((sum, p) => sum + p.budgetUsed, 0)
    const totalRisks = projectsWithStatus.reduce((sum, p) => sum + p.risks.length, 0)

    const now = new Date().toLocaleString('zh-TW', {
      year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
    const weekNum = getISOWeekNumber(new Date())
    const yearStr = new Date().getFullYear()

    const fmtMoney = (n: number) => {
      if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`
      if (n >= 1000) return `$${(n / 1000).toFixed(0)}K`
      return `$${n}`
    }
    const fmtDate = (d: Date) => new Date(d).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })
    const fmtDateFull = (d: Date) => new Date(d).toLocaleDateString('zh-TW')

    const avgProgress = projectsWithStatus.length > 0
      ? Math.round(projectsWithStatus.reduce((sum, p) => sum + p.actualProgress, 0) / projectsWithStatus.length)
      : 0
    const budgetPercent = totalBudget > 0 ? Math.round((totalBudgetUsed / totalBudget) * 100) : 0

    const greenCount = projectsWithStatus.filter(p => p.actualStatus === 'green').length
    const yellowCount = projectsWithStatus.filter(p => p.actualStatus === 'yellow').length
    const redCount = projectsWithStatus.filter(p => p.actualStatus === 'red').length

    // Determine today string for overdue checks
    const today = new Date().toISOString().split('T')[0]

    const html = `
<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <title>專案週報</title>
  <style>
    @page {
      size: A4 landscape;
      margin: 12mm 15mm;
    }
    @media print {
      body { margin: 0; padding: 0 !important; }
      .page-break { page-break-before: always; break-before: page; }
      .avoid-break { page-break-inside: avoid; break-inside: avoid; }
      * {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        color-adjust: exact !important;
      }
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: "Microsoft JhengHei", "微軟正黑體", "PingFang TC", sans-serif;
      line-height: 1.5;
      color: #1e293b;
      padding: 0;
      font-size: 11px;
      background: white;
    }

    /* ── Cover / Header ── */
    .report-header {
      background: linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%) !important;
      color: white !important;
      padding: 28px 32px 24px;
      margin-bottom: 0;
    }
    .report-header h1 {
      font-size: 22px;
      font-weight: 700;
      letter-spacing: 0.5px;
      margin-bottom: 2px;
      color: white !important;
    }
    .report-header .subtitle {
      font-size: 12px;
      opacity: 0.8;
      color: rgba(255,255,255,0.8) !important;
    }

    /* ── Stat strip (under header) ── */
    .stat-strip {
      display: flex;
      background: #f8fafc !important;
      border-bottom: 1px solid #e2e8f0;
      padding: 0;
    }
    .stat-strip-item {
      flex: 1;
      padding: 14px 20px;
      border-right: 1px solid #e2e8f0;
      text-align: center;
    }
    .stat-strip-item:last-child { border-right: none; }
    .stat-strip-label {
      font-size: 10px;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 4px;
    }
    .stat-strip-value {
      font-size: 20px;
      font-weight: 700;
      color: #0f172a;
    }
    .stat-strip-sub {
      font-size: 9px;
      color: #94a3b8;
      margin-top: 2px;
    }

    /* ── Section ── */
    .section {
      padding: 20px 32px;
    }
    .section-title {
      font-size: 13px;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 12px;
      padding-bottom: 6px;
      border-bottom: 2px solid #e2e8f0;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .section-title .count {
      background: #f1f5f9 !important;
      color: #64748b;
      font-size: 10px;
      padding: 1px 8px;
      border-radius: 10px;
      font-weight: 600;
    }

    /* ── Health indicators ── */
    .health-row {
      display: flex;
      gap: 6px;
      margin-left: auto;
      font-size: 10px;
      font-weight: 600;
    }
    .health-chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      border-radius: 10px;
    }
    .health-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
    }

    /* ── Project overview table ── */
    .overview-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
    }
    .overview-table th {
      background: #f1f5f9 !important;
      color: #475569;
      font-weight: 600;
      font-size: 10px;
      padding: 8px 10px;
      text-align: left;
      border-bottom: 2px solid #e2e8f0;
      white-space: nowrap;
    }
    .overview-table td {
      padding: 10px;
      border-bottom: 1px solid #f1f5f9;
      vertical-align: middle;
    }
    .overview-table tbody tr:hover {
      background: #fafbfc !important;
    }
    .overview-table .proj-name {
      font-weight: 600;
      color: #0f172a;
      font-size: 11px;
    }
    .overview-table .proj-meta {
      font-size: 9px;
      color: #94a3b8;
      margin-top: 1px;
    }

    /* ── Status dot ── */
    .status-dot {
      display: inline-block;
      width: 9px;
      height: 9px;
      border-radius: 50%;
      vertical-align: middle;
    }
    .status-green { background: #10b981 !important; }
    .status-yellow { background: #f59e0b !important; }
    .status-red { background: #ef4444 !important; }

    /* ── Badge ── */
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 600;
      white-space: nowrap;
    }
    .badge-green { background: #d1fae5 !important; color: #065f46 !important; }
    .badge-yellow { background: #fef3c7 !important; color: #92400e !important; }
    .badge-red { background: #fee2e2 !important; color: #991b1b !important; }
    .badge-blue { background: #dbeafe !important; color: #1e40af !important; }
    .badge-gray { background: #f1f5f9 !important; color: #475569 !important; }

    /* ── Progress bar ── */
    .progress-bar {
      height: 6px;
      background: #e2e8f0 !important;
      border-radius: 3px;
      overflow: hidden;
      width: 100%;
    }
    .progress-fill {
      height: 100%;
      border-radius: 3px;
    }
    .progress-inline {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .progress-inline .progress-bar { flex: 1; }
    .progress-inline .pct {
      font-size: 10px;
      font-weight: 600;
      color: #0f172a;
      width: 32px;
      text-align: right;
      flex-shrink: 0;
    }

    /* ── Project detail page ── */
    .project-page {
      padding: 0;
    }
    .project-header {
      padding: 20px 32px 16px;
      border-bottom: 1px solid #e2e8f0;
      display: flex;
      align-items: flex-start;
      gap: 16px;
    }
    .project-header-info { flex: 1; }
    .project-header h2 {
      font-size: 18px;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 4px;
    }
    .project-header .meta-row {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      font-size: 11px;
      color: #64748b;
      margin-top: 4px;
    }
    .project-header .meta-row .meta-item {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .project-header .meta-row .meta-label {
      color: #94a3b8;
      font-size: 10px;
    }

    /* ── Key metrics row ── */
    .metrics-row {
      display: flex;
      gap: 0;
      border-bottom: 1px solid #e2e8f0;
    }
    .metric-box {
      flex: 1;
      padding: 12px 20px;
      border-right: 1px solid #e2e8f0;
      text-align: center;
    }
    .metric-box:last-child { border-right: none; }
    .metric-box .label {
      font-size: 9px;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .metric-box .value {
      font-size: 18px;
      font-weight: 700;
      color: #0f172a;
      margin-top: 2px;
    }
    .metric-box .sub {
      font-size: 9px;
      color: #94a3b8;
      margin-top: 1px;
    }

    /* ── Content area ── */
    .content-area {
      padding: 16px 32px;
    }
    .content-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }
    .content-full {
      grid-column: 1 / -1;
    }

    /* ── Milestones compact ── */
    .ms-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10px;
    }
    .ms-table th {
      background: #f8fafc !important;
      color: #64748b;
      font-weight: 600;
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      padding: 6px 8px;
      text-align: left;
      border-bottom: 1px solid #e2e8f0;
    }
    .ms-table td {
      padding: 8px;
      border-bottom: 1px solid #f1f5f9;
      vertical-align: middle;
    }
    .ms-name {
      font-weight: 600;
      color: #0f172a;
    }
    .ms-date {
      color: #64748b;
      font-size: 9px;
      white-space: nowrap;
    }

    /* ── Card ── */
    .card {
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      overflow: hidden;
    }
    .card-header {
      background: #f8fafc !important;
      padding: 8px 12px;
      border-bottom: 1px solid #e2e8f0;
      font-size: 11px;
      font-weight: 600;
      color: #334155;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .card-body {
      padding: 10px 12px;
    }
    .card-empty {
      padding: 16px 12px;
      text-align: center;
      color: #94a3b8;
      font-size: 10px;
    }

    /* ── Issue / Risk items ── */
    .issue-item {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding: 6px 0;
      border-bottom: 1px solid #f8fafc;
      font-size: 10px;
    }
    .issue-item:last-child { border-bottom: none; }
    .issue-icon {
      width: 16px;
      height: 16px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 8px;
      font-weight: 700;
      flex-shrink: 0;
      margin-top: 1px;
    }
    .issue-icon-red { background: #fee2e2 !important; color: #dc2626 !important; }
    .issue-icon-yellow { background: #fef3c7 !important; color: #d97706 !important; }
    .issue-icon-blue { background: #dbeafe !important; color: #2563eb !important; }
    .issue-content { flex: 1; min-width: 0; }
    .issue-title { font-weight: 600; color: #0f172a; }
    .issue-meta { color: #94a3b8; font-size: 9px; margin-top: 1px; }

    /* ── Footer ── */
    .page-footer {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      padding: 6px 32px;
      font-size: 8px;
      color: #cbd5e1;
      display: flex;
      justify-content: space-between;
      border-top: 1px solid #f1f5f9;
    }

    /* ── Task status badge ── */
    .task-status {
      display: inline-block;
      padding: 1px 6px;
      border-radius: 3px;
      font-size: 9px;
      font-weight: 600;
    }
    .task-status-done { background: #d1fae5 !important; color: #065f46 !important; }
    .task-status-inprogress { background: #dbeafe !important; color: #1e40af !important; }
    .task-status-blocked { background: #fee2e2 !important; color: #991b1b !important; }
    .task-status-todo { background: #f1f5f9 !important; color: #475569 !important; }
  </style>
</head>
<body>

  <!-- ═══════════ PAGE 1: EXECUTIVE SUMMARY ═══════════ -->
  <div class="report-header">
    <h1>專案進度週報</h1>
    <div class="subtitle">${yearStr} 第 ${weekNum} 週 · ${now} 生成 · 共 ${projectsWithStatus.length} 個專案</div>
  </div>

  <!-- Key Stats Strip -->
  <div class="stat-strip avoid-break">
    <div class="stat-strip-item">
      <div class="stat-strip-label">整體進度</div>
      <div class="stat-strip-value">${avgProgress}%</div>
      <div class="stat-strip-sub">${doneTasks}/${totalTasks} 任務完成</div>
    </div>
    <div class="stat-strip-item">
      <div class="stat-strip-label">里程碑</div>
      <div class="stat-strip-value">${doneMilestones}/${totalMilestones}</div>
      <div class="stat-strip-sub">${totalMilestones > 0 ? Math.round((doneMilestones / totalMilestones) * 100) : 0}% 已完成</div>
    </div>
    <div class="stat-strip-item">
      <div class="stat-strip-label">預算執行</div>
      <div class="stat-strip-value">${budgetPercent}%</div>
      <div class="stat-strip-sub">${fmtMoney(totalBudgetUsed)} / ${fmtMoney(totalBudget)}</div>
    </div>
    <div class="stat-strip-item">
      <div class="stat-strip-label">任務進行中</div>
      <div class="stat-strip-value">${inProgressTasks}</div>
      <div class="stat-strip-sub">共 ${totalTasks} 個任務</div>
    </div>
    <div class="stat-strip-item">
      <div class="stat-strip-label">未解決風險</div>
      <div class="stat-strip-value" style="color: ${totalRisks > 0 ? '#dc2626' : '#0f172a'};">${totalRisks}</div>
      <div class="stat-strip-sub">需要關注</div>
    </div>
  </div>

  <!-- Project Overview Table -->
  <div class="section">
    <div class="section-title">
      專案總覽
      <div class="health-row">
        <span class="health-chip" style="background: #d1fae5 !important;"><span class="health-dot status-green"></span> 正常 ${greenCount}</span>
        <span class="health-chip" style="background: #fef3c7 !important;"><span class="health-dot status-yellow"></span> 注意 ${yellowCount}</span>
        <span class="health-chip" style="background: #fee2e2 !important;"><span class="health-dot status-red"></span> 風險 ${redCount}</span>
      </div>
    </div>
    <table class="overview-table">
      <thead>
        <tr>
          <th style="width: 28px;"></th>
          <th>專案名稱</th>
          <th>類型</th>
          <th>負責人</th>
          <th style="width: 180px;">進度</th>
          <th>里程碑</th>
          <th>預算</th>
          <th>風險</th>
          <th>關鍵議題</th>
        </tr>
      </thead>
      <tbody>
        ${projectsWithStatus.map(p => {
          const parentTasks = p.tasks.filter(t => !t.parentId)
          const overdueTasks = parentTasks.filter(t => t.status !== 'done' && t.endDate.toISOString().split('T')[0] < today)
          const blockedTasks = parentTasks.filter(t => t.status === 'blocked')

          // Key issue: most critical problem to surface
          let keyIssue = ''
          if (overdueTasks.length > 0 && blockedTasks.length > 0) {
            keyIssue = `${overdueTasks.length} 逾期 · ${blockedTasks.length} 受阻`
          } else if (overdueTasks.length > 0) {
            keyIssue = `${overdueTasks.length} 個任務逾期`
          } else if (blockedTasks.length > 0) {
            keyIssue = `${blockedTasks.length} 個任務受阻`
          } else if (p.risks.length > 0) {
            keyIssue = `${p.risks.length} 個風險待處理`
          } else {
            keyIssue = '—'
          }

          const statusClass = p.actualStatus === 'green' ? 'status-green' : p.actualStatus === 'yellow' ? 'status-yellow' : 'status-red'
          const progressColor = p.actualStatus === 'red' ? '#ef4444' : p.actualStatus === 'yellow' ? '#f59e0b' : '#3b82f6'

          const msCount = p.milestones.length
          const msDone = p.milestones.filter(m => m.status === 'done').length

          const bPct = p.budget > 0 ? Math.round((p.budgetUsed / p.budget) * 100) : 0

          return `
            <tr>
              <td><span class="status-dot ${statusClass}"></span></td>
              <td>
                <div class="proj-name">${p.name}</div>
                <div class="proj-meta">${p.projectCode} · ${fmtDateFull(p.startDate)} ~ ${fmtDateFull(p.endDate)}</div>
              </td>
              <td><span class="badge badge-gray">${PROJECT_TYPE_LABELS[p.projectType as keyof typeof PROJECT_TYPE_LABELS] || p.projectType}</span></td>
              <td style="white-space: nowrap;">${p.owner.name}</td>
              <td>
                <div class="progress-inline">
                  <div class="progress-bar">
                    <div class="progress-fill" style="width: ${p.actualProgress}%; background: ${progressColor} !important;"></div>
                  </div>
                  <span class="pct">${p.actualProgress}%</span>
                </div>
              </td>
              <td style="white-space: nowrap; font-size: 10px;">${msDone}/${msCount}</td>
              <td style="white-space: nowrap; font-size: 10px;">${bPct}%<span style="color: #94a3b8; margin-left: 2px;">(${fmtMoney(p.budget)})</span></td>
              <td style="text-align: center;">${p.risks.length > 0
                ? `<span style="color: #dc2626; font-weight: 600;">${p.risks.length}</span>`
                : '<span style="color: #94a3b8;">0</span>'}</td>
              <td style="font-size: 10px; color: ${keyIssue === '—' ? '#94a3b8' : '#dc2626'}; font-weight: ${keyIssue === '—' ? '400' : '600'};">${keyIssue}</td>
            </tr>
          `
        }).join('')}
      </tbody>
    </table>
  </div>

  <!-- ═══════════ PER-PROJECT DETAIL PAGES ═══════════ -->
  ${projectsWithStatus.map((project, index) => {
    const statusBadge =
      project.actualStatus === 'green' ? 'badge-green' :
      project.actualStatus === 'yellow' ? 'badge-yellow' : 'badge-red'
    const statusText =
      project.actualStatus === 'green' ? '正常' :
      project.actualStatus === 'yellow' ? '注意' : '風險'

    const parentTasks = project.tasks.filter(t => !t.parentId)
    const overdueTasks = parentTasks.filter(t => t.status !== 'done' && t.endDate.toISOString().split('T')[0] < today)
    const blockedTasks = parentTasks.filter(t => t.status === 'blocked')

    const pDone = parentTasks.filter(t => t.status === 'done').length
    const pInProg = parentTasks.filter(t => t.status === 'in_progress').length
    const bPct = project.budget > 0 ? Math.round((project.budgetUsed / project.budget) * 100) : 0

    // Pending delay requests
    const pendingDelays = (project.delayRequests || []).filter(d => d.status === 'pending')

    return `
    <div class="page-break"></div>
    <div class="project-page">

      <!-- Project Header -->
      <div class="project-header">
        <div class="project-header-info">
          <h2>${project.name} <span class="badge ${statusBadge}" style="vertical-align: middle; font-size: 11px; margin-left: 6px;">${statusText}</span></h2>
          <div class="meta-row">
            <span class="meta-item"><span class="meta-label">編碼</span> ${project.projectCode}</span>
            <span class="meta-item"><span class="meta-label">類型</span> ${PROJECT_TYPE_LABELS[project.projectType as keyof typeof PROJECT_TYPE_LABELS] || project.projectType}</span>
            <span class="meta-item"><span class="meta-label">負責人</span> ${project.owner.name}</span>
            <span class="meta-item"><span class="meta-label">團隊</span> ${project.teamMembers.length} 人</span>
            <span class="meta-item"><span class="meta-label">期間</span> ${fmtDateFull(project.startDate)} ~ ${fmtDateFull(project.endDate)}</span>
          </div>
        </div>
      </div>

      <!-- Key Metrics -->
      <div class="metrics-row avoid-break">
        <div class="metric-box">
          <div class="label">整體進度</div>
          <div class="value">${project.actualProgress}%</div>
        </div>
        <div class="metric-box">
          <div class="label">任務</div>
          <div class="value" style="font-size: 14px;">${pDone}<span style="font-weight: 400; color: #94a3b8; font-size: 12px;">/${parentTasks.length} 完成</span></div>
          <div class="sub">${pInProg} 進行中</div>
        </div>
        <div class="metric-box">
          <div class="label">里程碑</div>
          <div class="value" style="font-size: 14px;">${project.milestones.filter(m => m.status === 'done').length}<span style="font-weight: 400; color: #94a3b8; font-size: 12px;">/${project.milestones.length} 完成</span></div>
        </div>
        <div class="metric-box">
          <div class="label">預算執行</div>
          <div class="value" style="font-size: 14px;">${bPct}%</div>
          <div class="sub">${fmtMoney(project.budgetUsed)} / ${fmtMoney(project.budget)}</div>
        </div>
        <div class="metric-box">
          <div class="label">風險</div>
          <div class="value" style="color: ${project.risks.length > 0 ? '#dc2626' : '#10b981'};">${project.risks.length}</div>
        </div>
      </div>

      <!-- Content -->
      <div class="content-area">
        <div class="content-grid">

          <!-- LEFT: Milestones -->
          <div>
            <div class="card avoid-break">
              <div class="card-header">
                里程碑進度
                <span style="margin-left: auto; font-size: 9px; color: #94a3b8; font-weight: 400;">${project.milestones.filter(m => m.status === 'done').length}/${project.milestones.length} 已完成</span>
              </div>
              ${project.milestones.length > 0 ? `
              <table class="ms-table">
                <thead>
                  <tr>
                    <th style="width: 28px;"></th>
                    <th>名稱</th>
                    <th style="width: 70px;">到期日</th>
                    <th style="width: 140px;">進度</th>
                  </tr>
                </thead>
                <tbody>
                  ${project.milestones.map(m => {
                    const isOverdue = m.status !== 'done' && new Date(m.dueDate).toISOString().split('T')[0] < today
                    const sColor =
                      m.status === 'done' ? '#10b981' :
                      isOverdue ? '#ef4444' :
                      m.status === 'in_progress' ? '#3b82f6' :
                      m.status === 'blocked' ? '#ef4444' : '#94a3b8'
                    const sLabel =
                      m.status === 'done' ? '✓' :
                      isOverdue ? '!' :
                      m.status === 'in_progress' ? '→' :
                      m.status === 'blocked' ? '✕' : '○'
                    return `
                      <tr>
                        <td style="text-align: center;">
                          <span style="display: inline-block; width: 18px; height: 18px; border-radius: 50%; background: ${sColor}20 !important; color: ${sColor} !important; font-size: 10px; line-height: 18px; text-align: center; font-weight: 700;">${sLabel}</span>
                        </td>
                        <td>
                          <span class="ms-name" ${isOverdue ? 'style="color: #dc2626 !important;"' : ''}>${m.name}</span>
                          ${isOverdue ? '<span style="color: #ef4444; font-size: 8px; margin-left: 4px;">逾期</span>' : ''}
                        </td>
                        <td class="ms-date">${fmtDate(m.dueDate)}</td>
                        <td>
                          <div class="progress-inline">
                            <div class="progress-bar">
                              <div class="progress-fill" style="width: ${m.progress}%; background: ${sColor} !important;"></div>
                            </div>
                            <span class="pct" style="font-size: 9px;">${m.progress}%</span>
                          </div>
                        </td>
                      </tr>
                    `
                  }).join('')}
                </tbody>
              </table>
              ` : '<div class="card-empty">尚無里程碑</div>'}
            </div>
          </div>

          <!-- RIGHT: Issues & Risks -->
          <div>
            <!-- Overdue & Blocked Tasks -->
            <div class="card avoid-break" style="margin-bottom: 12px;">
              <div class="card-header">
                需關注事項
                <span style="margin-left: auto; font-size: 9px; color: ${(overdueTasks.length + blockedTasks.length) > 0 ? '#dc2626' : '#94a3b8'}; font-weight: ${(overdueTasks.length + blockedTasks.length) > 0 ? '600' : '400'};">
                  ${overdueTasks.length + blockedTasks.length} 項
                </span>
              </div>
              ${(overdueTasks.length + blockedTasks.length) > 0 ? `
              <div class="card-body">
                ${overdueTasks.slice(0, 5).map(t => `
                  <div class="issue-item">
                    <span class="issue-icon issue-icon-red">!</span>
                    <div class="issue-content">
                      <div class="issue-title">${t.title}</div>
                      <div class="issue-meta">逾期 · 負責人: ${t.assignee} · 到期: ${fmtDate(t.endDate)}</div>
                    </div>
                  </div>
                `).join('')}
                ${overdueTasks.length > 5 ? `<div style="font-size: 9px; color: #94a3b8; padding: 4px 0;">...還有 ${overdueTasks.length - 5} 個逾期任務</div>` : ''}
                ${blockedTasks.slice(0, 5).map(t => `
                  <div class="issue-item">
                    <span class="issue-icon issue-icon-yellow">✕</span>
                    <div class="issue-content">
                      <div class="issue-title">${t.title}</div>
                      <div class="issue-meta">受阻 · 負責人: ${t.assignee}</div>
                    </div>
                  </div>
                `).join('')}
                ${blockedTasks.length > 5 ? `<div style="font-size: 9px; color: #94a3b8; padding: 4px 0;">...還有 ${blockedTasks.length - 5} 個受阻任務</div>` : ''}
              </div>
              ` : '<div class="card-empty" style="color: #10b981;">✓ 無逾期或受阻任務</div>'}
            </div>

            <!-- Risks -->
            <div class="card avoid-break" style="margin-bottom: 12px;">
              <div class="card-header">
                風險
                <span style="margin-left: auto; font-size: 9px; color: ${project.risks.length > 0 ? '#dc2626' : '#94a3b8'}; font-weight: ${project.risks.length > 0 ? '600' : '400'};">
                  ${project.risks.length} 個未解決
                </span>
              </div>
              ${project.risks.length > 0 ? `
              <div class="card-body">
                ${project.risks.slice(0, 5).map(r => {
                  const impactColor = r.impact === 'high' ? 'issue-icon-red' : r.impact === 'medium' ? 'issue-icon-yellow' : 'issue-icon-blue'
                  const impactLabel = r.impact === 'high' ? '高' : r.impact === 'medium' ? '中' : '低'
                  return `
                    <div class="issue-item">
                      <span class="issue-icon ${impactColor}">${impactLabel}</span>
                      <div class="issue-content">
                        <div class="issue-title">${r.title}</div>
                        <div class="issue-meta">影響: ${impactLabel} · 機率: ${r.probability === 'high' ? '高' : r.probability === 'medium' ? '中' : '低'}${r.mitigation ? ` · ${r.mitigation.length > 40 ? r.mitigation.slice(0, 40) + '...' : r.mitigation}` : ''}</div>
                      </div>
                    </div>
                  `
                }).join('')}
                ${project.risks.length > 5 ? `<div style="font-size: 9px; color: #94a3b8; padding: 4px 0;">...還有 ${project.risks.length - 5} 個風險</div>` : ''}
              </div>
              ` : '<div class="card-empty" style="color: #10b981;">✓ 無未解決風險</div>'}
            </div>

            <!-- Pending Delays (compact) -->
            ${pendingDelays.length > 0 ? `
            <div class="card avoid-break">
              <div class="card-header">
                待審延期申請
                <span style="margin-left: auto; font-size: 9px; color: #d97706; font-weight: 600;">${pendingDelays.length} 件</span>
              </div>
              <div class="card-body">
                ${pendingDelays.slice(0, 3).map(dr => `
                  <div class="issue-item">
                    <span class="issue-icon issue-icon-yellow">⏱</span>
                    <div class="issue-content">
                      <div class="issue-title">${dr.task ? dr.task.title : '專案延期'}</div>
                      <div class="issue-meta">申請人: ${dr.requester.name} · ${dr.reason.length > 50 ? dr.reason.slice(0, 50) + '...' : dr.reason}</div>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
            ` : ''}
          </div>

        </div>
      </div>
    </div>
    `
  }).join('')}

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

function getISOWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}
