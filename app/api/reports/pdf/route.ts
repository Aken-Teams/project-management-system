import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { PROJECT_TYPE_LABELS } from '@/lib/mock-data'

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
        tasks: { orderBy: { sortOrder: 'asc' } },
        risks: { where: { status: 'open' } },
        teamMembers: {
          include: {
            user: { select: { name: true, email: true } },
          },
        },
      },
    })

    // Calculate summary statistics
    const totalTasks = projects.reduce((sum, p) => sum + p.tasks.length, 0)
    const doneTasks = projects.reduce(
      (sum, p) => sum + p.tasks.filter(t => t.status === 'done').length,
      0,
    )
    const totalMilestones = projects.reduce((sum, p) => sum + p.milestones.length, 0)
    const doneMilestones = projects.reduce(
      (sum, p) => sum + p.milestones.filter(m => m.status === 'done').length,
      0,
    )
    const totalBudget = projects.reduce((sum, p) => sum + p.budget, 0)
    const totalBudgetUsed = projects.reduce((sum, p) => sum + p.budgetUsed, 0)
    const totalRisks = projects.reduce((sum, p) => sum + p.risks.length, 0)

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
      padding: 24px 20px;
      font-size: 12px;
      background: #f8fafc;
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
  </style>
</head>
<body>
  <h1>專案報告</h1>
  <div class="subtitle">生成時間：${now}</div>

  <!-- Stats Overview -->
  <div class="grid grid-4 avoid-break" style="margin-bottom: 12px;">
    <div class="stat-card">
      <span class="stat-label">總專案數</span>
      <div class="stat-value">${projects.length}</div>
      <div class="stat-sub">共 ${projects.length} 個專案</div>
    </div>
    <div class="stat-card">
      <span class="stat-label">總任務數</span>
      <div class="stat-value">${totalTasks}</div>
      <div class="stat-sub">已完成 ${doneTasks} 個</div>
    </div>
    <div class="stat-card">
      <span class="stat-label">里程碑進度</span>
      <div class="stat-value">${doneMilestones}/${totalMilestones}</div>
      <div class="stat-sub">${totalMilestones > 0 ? Math.round((doneMilestones / totalMilestones) * 100) : 0}% 完成</div>
    </div>
    <div class="stat-card">
      <span class="stat-label">預算執行</span>
      <div class="stat-value">${totalBudget > 0 ? Math.round((totalBudgetUsed / totalBudget) * 100) : 0}%</div>
      <div class="stat-sub">${fmtMoney(totalBudgetUsed)} / ${fmtMoney(totalBudget)}</div>
    </div>
  </div>

  <!-- Charts Section -->
  <div class="grid grid-3 avoid-break" style="margin-bottom: 12px;">
    ${(() => {
      const inProgressTasks = projects.reduce((sum, p) => sum + p.tasks.filter(t => t.status === 'in_progress').length, 0)
      const blockedTasks = projects.reduce((sum, p) => sum + p.tasks.filter(t => t.status === 'blocked').length, 0)
      const todoTasks = totalTasks - doneTasks - inProgressTasks - blockedTasks

      const donePercent = totalTasks > 0 ? (doneTasks / totalTasks) * 100 : 0
      const inProgressPercent = totalTasks > 0 ? (inProgressTasks / totalTasks) * 100 : 0
      const blockedPercent = totalTasks > 0 ? (blockedTasks / totalTasks) * 100 : 0
      const todoPercent = totalTasks > 0 ? (todoTasks / totalTasks) * 100 : 0

      return `
        <div class="card">
          <div class="card-title">任務狀態分佈</div>
          <div class="donut-chart">
            <svg width="140" height="140" viewBox="0 0 140 140">
              <circle cx="70" cy="70" r="50" fill="none" stroke="#e2e8f0" stroke-width="20"/>
              ${totalTasks > 0 ? `
                <circle cx="70" cy="70" r="50" fill="none" stroke="#10b981" stroke-width="20"
                  stroke-dasharray="${2 * Math.PI * 50 * donePercent / 100} ${2 * Math.PI * 50}"
                  stroke-dashoffset="${2 * Math.PI * 50 * 0.25}"
                  transform="rotate(-90 70 70)"/>
                <circle cx="70" cy="70" r="50" fill="none" stroke="#3b82f6" stroke-width="20"
                  stroke-dasharray="${2 * Math.PI * 50 * inProgressPercent / 100} ${2 * Math.PI * 50}"
                  stroke-dashoffset="${2 * Math.PI * 50 * (0.25 - donePercent / 100)}"
                  transform="rotate(-90 70 70)"/>
                <circle cx="70" cy="70" r="50" fill="none" stroke="#94a3b8" stroke-width="20"
                  stroke-dasharray="${2 * Math.PI * 50 * todoPercent / 100} ${2 * Math.PI * 50}"
                  stroke-dashoffset="${2 * Math.PI * 50 * (0.25 - donePercent / 100 - inProgressPercent / 100)}"
                  transform="rotate(-90 70 70)"/>
                <circle cx="70" cy="70" r="50" fill="none" stroke="#ef4444" stroke-width="20"
                  stroke-dasharray="${2 * Math.PI * 50 * blockedPercent / 100} ${2 * Math.PI * 50}"
                  stroke-dashoffset="${2 * Math.PI * 50 * (0.25 - donePercent / 100 - inProgressPercent / 100 - todoPercent / 100)}"
                  transform="rotate(-90 70 70)"/>
              ` : ''}
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
      const greenProjects = projects.filter(p => p.status === 'green').length
      const yellowProjects = projects.filter(p => p.status === 'yellow').length
      const redProjects = projects.filter(p => p.status === 'red').length

      const greenPercent = projects.length > 0 ? (greenProjects / projects.length) * 100 : 0
      const yellowPercent = projects.length > 0 ? (yellowProjects / projects.length) * 100 : 0
      const redPercent = projects.length > 0 ? (redProjects / projects.length) * 100 : 0

      return `
        <div class="card">
          <div class="card-title">專案健康度</div>
          <div class="donut-chart">
            <svg width="140" height="140" viewBox="0 0 140 140">
              <circle cx="70" cy="70" r="50" fill="none" stroke="#e2e8f0" stroke-width="20"/>
              ${projects.length > 0 ? `
                <circle cx="70" cy="70" r="50" fill="none" stroke="#10b981" stroke-width="20"
                  stroke-dasharray="${2 * Math.PI * 50 * greenPercent / 100} ${2 * Math.PI * 50}"
                  stroke-dashoffset="${2 * Math.PI * 50 * 0.25}"
                  transform="rotate(-90 70 70)"/>
                <circle cx="70" cy="70" r="50" fill="none" stroke="#f59e0b" stroke-width="20"
                  stroke-dasharray="${2 * Math.PI * 50 * yellowPercent / 100} ${2 * Math.PI * 50}"
                  stroke-dashoffset="${2 * Math.PI * 50 * (0.25 - greenPercent / 100)}"
                  transform="rotate(-90 70 70)"/>
                <circle cx="70" cy="70" r="50" fill="none" stroke="#ef4444" stroke-width="20"
                  stroke-dasharray="${2 * Math.PI * 50 * redPercent / 100} ${2 * Math.PI * 50}"
                  stroke-dashoffset="${2 * Math.PI * 50 * (0.25 - greenPercent / 100 - yellowPercent / 100)}"
                  transform="rotate(-90 70 70)"/>
              ` : ''}
            </svg>
            <div class="donut-center">
              <div class="donut-value">${projects.length}</div>
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
            <svg width="140" height="140" viewBox="0 0 140 140">
              <circle cx="70" cy="70" r="50" fill="none" stroke="#e2e8f0" stroke-width="20"/>
              ${totalBudget > 0 ? `
                <circle cx="70" cy="70" r="50" fill="none" stroke="${isOverBudget ? '#ef4444' : budgetPercent > 80 ? '#f59e0b' : '#10b981'}" stroke-width="20"
                  stroke-dasharray="${2 * Math.PI * 50 * Math.min(budgetPercent, 100) / 100} ${2 * Math.PI * 50}"
                  stroke-dashoffset="${2 * Math.PI * 50 * 0.25}"
                  transform="rotate(-90 70 70)"/>
              ` : ''}
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
  ${projects.map((project, index) => {
    const statusClass =
      project.status === 'green' ? 'badge-green' :
      project.status === 'yellow' ? 'badge-yellow' : 'badge-red'
    const statusText =
      project.status === 'green' ? '正常' :
      project.status === 'yellow' ? '注意' : '風險'

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
            <div style="font-size: 14px; font-weight: 700; color: #0f172a; margin-top: 4px;">${project.progress}%</div>
            <div class="progress-bar" style="margin-top: 6px;">
              <div class="progress-fill" style="width: ${project.progress}%; background: #3b82f6;"></div>
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
            ${project.milestones.slice(0, 5).map(m => {
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
            ${project.milestones.length > 5 ? `<div style="text-align: center; color: #64748b; font-size: 10px; margin-top: 8px;">僅顯示前 5 個里程碑</div>` : ''}
          </div>
        ` : ''}

        ${project.tasks.length > 0 ? `
          <div class="card" style="margin-bottom: 12px;">
            <div class="card-title">任務摘要（${project.tasks.filter(t => t.status === 'done').length}/${project.tasks.length} 已完成）</div>
            <div class="grid grid-4">
              <div class="stat-card">
                <span class="stat-label">已完成</span>
                <div class="stat-value" style="font-size: 18px;">${project.tasks.filter(t => t.status === 'done').length}</div>
              </div>
              <div class="stat-card">
                <span class="stat-label">進行中</span>
                <div class="stat-value" style="font-size: 18px;">${project.tasks.filter(t => t.status === 'in_progress').length}</div>
              </div>
              <div class="stat-card">
                <span class="stat-label">受阻</span>
                <div class="stat-value" style="font-size: 18px;">${project.tasks.filter(t => t.status === 'blocked').length}</div>
              </div>
              <div class="stat-card">
                <span class="stat-label">待辦</span>
                <div class="stat-value" style="font-size: 18px;">${project.tasks.filter(t => t.status === 'todo').length}</div>
              </div>
            </div>
          </div>
        ` : ''}

        ${project.risks.length > 0 ? `
          <div class="card" style="margin-bottom: 12px;">
            <div class="card-title">未解決風險（${project.risks.length} 個）</div>
            ${project.risks.slice(0, 3).map(r => `
              <div class="risk-item">
                <div class="risk-title">${r.title}</div>
                <div class="risk-meta">
                  影響程度：${r.impact === 'high' ? '高' : r.impact === 'medium' ? '中' : '低'} |
                  發生機率：${r.probability === 'high' ? '高' : r.probability === 'medium' ? '中' : '低'}
                </div>
              </div>
            `).join('')}
            ${project.risks.length > 3 ? `<div style="text-align: center; color: #64748b; font-size: 10px; margin-top: 8px;">僅顯示前 3 個風險</div>` : ''}
          </div>
        ` : '<div class="card" style="margin-bottom: 12px;"><div style="color: #10b981; font-size: 12px;">✓ 無未解決風險</div></div>'}

        ${project.teamMembers.length > 0 && project.teamMembers.length <= 6 ? `
          <div class="card">
            <div class="card-title">團隊成員（${project.teamMembers.length} 人）</div>
            <table>
              <thead>
                <tr>
                  <th>姓名</th>
                  <th>Email</th>
                  <th>角色</th>
                  <th>職責</th>
                </tr>
              </thead>
              <tbody>
                ${project.teamMembers.map(tm => `
                  <tr>
                    <td>${tm.user.name}</td>
                    <td>${tm.user.email}</td>
                    <td>${tm.role === 'pm' ? 'PM' : tm.role === 'engineer' ? '工程師' : tm.role === 'qa' ? 'QA' : tm.role}</td>
                    <td>${tm.responsibility}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : project.teamMembers.length > 6 ? `
          <div class="card">
            <div class="card-title">團隊成員（${project.teamMembers.length} 人）</div>
            <div style="color: #64748b; font-size: 11px;">團隊成員眾多，詳細資訊請查看系統</div>
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
