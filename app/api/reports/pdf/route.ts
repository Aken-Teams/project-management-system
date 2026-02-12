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
      size: A4;
      margin: 20mm 25mm;
    }
    @media print {
      .page-break {
        page-break-before: always;
        break-before: page;
      }
      .avoid-break {
        page-break-inside: avoid;
        break-inside: avoid;
      }
      body { margin: 0; padding: 0; }
      .no-print { display: none; }
      * {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        color-adjust: exact !important;
      }
    }
    body {
      font-family: "Microsoft JhengHei", "微軟正黑體", sans-serif;
      line-height: 1.6;
      color: #1f2937;
      max-width: 100%;
      margin: 0;
      padding: 20px 30px;
      font-size: 13px;
      background: white;
    }
    h1 {
      text-align: center;
      color: #1e40af;
      margin: 0 0 8px 0;
      font-size: 26px;
      font-weight: 700;
    }
    .subtitle {
      text-align: center;
      color: #6b7280;
      margin: 0 0 25px 0;
      font-size: 13px;
      padding-bottom: 20px;
      border-bottom: 3px solid #e5e7eb;
    }
    h2 {
      color: #1e40af;
      border-bottom: 3px solid #3b82f6;
      padding: 8px 0 6px 0;
      margin: 25px 0 15px 0;
      font-size: 18px;
      font-weight: 700;
      background: linear-gradient(to right, #eff6ff, transparent);
      padding-left: 10px;
    }
    h3 {
      color: #1f2937;
      margin: 18px 0 10px 0;
      font-size: 15px;
      font-weight: 600;
      padding-left: 8px;
      border-left: 3px solid #3b82f6;
    }
    .section-divider {
      height: 2px;
      background: linear-gradient(to right, #3b82f6, transparent);
      margin: 20px 0;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 12px 0;
      font-size: 12px;
      page-break-inside: auto;
      border: 2px solid #9ca3af;
    }
    tr {
      page-break-inside: avoid;
      page-break-after: auto;
    }
    th, td {
      border: 1px solid #9ca3af;
      padding: 10px 12px;
      text-align: left;
      word-wrap: break-word;
      word-break: break-word;
      overflow-wrap: break-word;
    }
    th {
      background-color: #3b82f6 !important;
      color: white !important;
      font-weight: 600;
      font-size: 12px;
    }
    tr:nth-child(even) {
      background-color: #f3f4f6 !important;
    }
    tbody tr {
      background-color: #ffffff !important;
    }
    tbody tr:nth-child(even) {
      background-color: #f3f4f6 !important;
    }
    .summary-grid {
      display: table;
      width: 100%;
      margin: 15px 0;
      border-spacing: 8px;
    }
    .summary-row {
      display: table-row;
    }
    .summary-item {
      display: table-cell;
      width: 50%;
      background: #e0f2fe !important;
      padding: 14px;
      border-radius: 4px;
      border: 2px solid #93c5fd;
      border-left: 5px solid #3b82f6 !important;
      vertical-align: top;
    }
    .summary-label {
      font-size: 11px;
      color: #6b7280;
      margin-bottom: 4px;
      font-weight: 500;
    }
    .summary-value {
      font-size: 17px;
      font-weight: 700;
      color: #111827;
    }
    .chart-section {
      page-break-inside: avoid;
      margin: 20px 0;
      padding: 18px;
      background: #eff6ff !important;
      border-radius: 6px;
      border: 2px solid #93c5fd;
    }
    .chart-container {
      display: table;
      width: 100%;
      margin: 10px 0;
    }
    .chart-left {
      display: table-cell;
      width: 50%;
      text-align: center;
      vertical-align: middle;
      padding-right: 20px;
    }
    .chart-right {
      display: table-cell;
      width: 50%;
      vertical-align: middle;
    }
    .status-badge {
      display: inline-block;
      padding: 5px 14px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 700;
      border: 2px solid;
    }
    .status-green {
      background: #a7f3d0 !important;
      color: #065f46 !important;
      border-color: #10b981 !important;
    }
    .status-yellow {
      background: #fde68a !important;
      color: #92400e !important;
      border-color: #f59e0b !important;
    }
    .status-red {
      background: #fecaca !important;
      color: #991b1b !important;
      border-color: #ef4444 !important;
    }
    .project-section {
      page-break-inside: avoid;
      margin-bottom: 30px;
      padding-bottom: 20px;
      border-bottom: 1px dashed #d1d5db;
    }
    .project-header {
      background: linear-gradient(135deg, #3b82f6, #2563eb);
      color: white;
      padding: 10px 14px;
      border-radius: 4px;
      margin: 15px 0;
      font-size: 16px;
      font-weight: 700;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .info-table td:first-child {
      background: #dbeafe !important;
      font-weight: 600;
      width: 110px;
      color: #1e40af;
    }
    .milestone-item {
      margin-bottom: 14px;
      padding: 12px;
      background: #f8fafc !important;
      border-radius: 4px;
      border: 2px solid #cbd5e1;
      border-left: 4px solid !important;
    }
    .progress-bar-container {
      width: 100%;
      height: 12px;
      background: #e5e7eb !important;
      border: 2px solid #9ca3af;
      border-radius: 6px;
      overflow: hidden;
      margin: 8px 0;
    }
    .progress-bar {
      height: 100%;
      border-radius: 4px;
      box-shadow: inset 0 1px 2px rgba(0,0,0,0.1);
    }
  </style>
</head>
<body>
  <h1>專案報告</h1>
  <div class="subtitle">生成時間：${now}</div>

  <div class="avoid-break">
    <h2>總覽統計</h2>
    <div class="summary-grid">
      <div class="summary-row">
        <div class="summary-item">
          <div class="summary-label">總專案數</div>
          <div class="summary-value">${projects.length} 個</div>
        </div>
        <div class="summary-item">
          <div class="summary-label">總任務數</div>
          <div class="summary-value">${totalTasks} 個（已完成 ${doneTasks}）</div>
        </div>
      </div>
      <div class="summary-row">
        <div class="summary-item">
          <div class="summary-label">里程碑</div>
          <div class="summary-value">${doneMilestones} / ${totalMilestones} 已完成</div>
        </div>
        <div class="summary-item">
          <div class="summary-label">預算執行</div>
          <div class="summary-value">${fmtMoney(totalBudgetUsed)} / ${fmtMoney(totalBudget)}</div>
        </div>
      </div>
      <div class="summary-row">
        <div class="summary-item">
          <div class="summary-label">未解決風險</div>
          <div class="summary-value">${totalRisks} 個</div>
        </div>
        <div class="summary-item">
          <div class="summary-label">完成率</div>
          <div class="summary-value">${totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0}%</div>
        </div>
      </div>
    </div>
  </div>

  <div class="section-divider"></div>

  <div class="avoid-break chart-section">
    <h2 style="margin-top: 0;">任務狀態分佈</h2>
    ${(() => {
      const inProgressTasks = projects.reduce((sum, p) => sum + p.tasks.filter(t => t.status === 'in_progress').length, 0)
      const blockedTasks = projects.reduce((sum, p) => sum + p.tasks.filter(t => t.status === 'blocked').length, 0)
      const todoTasks = totalTasks - doneTasks - inProgressTasks - blockedTasks

      const donePercent = totalTasks > 0 ? (doneTasks / totalTasks) * 100 : 0
      const inProgressPercent = totalTasks > 0 ? (inProgressTasks / totalTasks) * 100 : 0
      const blockedPercent = totalTasks > 0 ? (blockedTasks / totalTasks) * 100 : 0
      const todoPercent = totalTasks > 0 ? (todoTasks / totalTasks) * 100 : 0

      return `
        <div class="chart-container">
          <div class="chart-left">
            <svg width="160" height="160" viewBox="0 0 160 160">
              <circle cx="80" cy="80" r="60" fill="none" stroke="#e5e7eb" stroke-width="18"/>
              ${totalTasks > 0 ? `
                <circle cx="80" cy="80" r="60" fill="none" stroke="#10b981" stroke-width="18"
                  stroke-dasharray="${2 * Math.PI * 60 * donePercent / 100} ${2 * Math.PI * 60}"
                  stroke-dashoffset="${2 * Math.PI * 60 * 0.25}"
                  transform="rotate(-90 80 80)"/>
                <circle cx="80" cy="80" r="60" fill="none" stroke="#3b82f6" stroke-width="18"
                  stroke-dasharray="${2 * Math.PI * 60 * inProgressPercent / 100} ${2 * Math.PI * 60}"
                  stroke-dashoffset="${2 * Math.PI * 60 * (0.25 - donePercent / 100)}"
                  transform="rotate(-90 80 80)"/>
                <circle cx="80" cy="80" r="60" fill="none" stroke="#9ca3af" stroke-width="18"
                  stroke-dasharray="${2 * Math.PI * 60 * todoPercent / 100} ${2 * Math.PI * 60}"
                  stroke-dashoffset="${2 * Math.PI * 60 * (0.25 - donePercent / 100 - inProgressPercent / 100)}"
                  transform="rotate(-90 80 80)"/>
                <circle cx="80" cy="80" r="60" fill="none" stroke="#ef4444" stroke-width="18"
                  stroke-dasharray="${2 * Math.PI * 60 * blockedPercent / 100} ${2 * Math.PI * 60}"
                  stroke-dashoffset="${2 * Math.PI * 60 * (0.25 - donePercent / 100 - inProgressPercent / 100 - todoPercent / 100)}"
                  transform="rotate(-90 80 80)"/>
              ` : ''}
              <text x="80" y="75" text-anchor="middle" font-size="22" font-weight="bold" fill="#111827">${totalTasks}</text>
              <text x="80" y="95" text-anchor="middle" font-size="11" fill="#6b7280">總任務</text>
            </svg>
          </div>
          <div class="chart-right">
            <table style="margin: 0; font-size: 12px;">
              <tbody>
                <tr>
                  <td style="border: none; background: none; padding: 6px 0; display: flex; align-items: center;">
                    <span style="width: 14px; height: 14px; background: #10b981; border-radius: 50%; display: inline-block; margin-right: 8px;"></span>
                    <span style="color: #6b7280; flex: 1;">已完成</span>
                    <span style="font-weight: 700; color: #111827;">${doneTasks} 個</span>
                  </td>
                </tr>
                <tr>
                  <td style="border: none; background: none; padding: 6px 0; display: flex; align-items: center;">
                    <span style="width: 14px; height: 14px; background: #3b82f6; border-radius: 50%; display: inline-block; margin-right: 8px;"></span>
                    <span style="color: #6b7280; flex: 1;">進行中</span>
                    <span style="font-weight: 700; color: #111827;">${inProgressTasks} 個</span>
                  </td>
                </tr>
                <tr>
                  <td style="border: none; background: none; padding: 6px 0; display: flex; align-items: center;">
                    <span style="width: 14px; height: 14px; background: #9ca3af; border-radius: 50%; display: inline-block; margin-right: 8px;"></span>
                    <span style="color: #6b7280; flex: 1;">待辦</span>
                    <span style="font-weight: 700; color: #111827;">${todoTasks} 個</span>
                  </td>
                </tr>
                <tr>
                  <td style="border: none; background: none; padding: 6px 0; display: flex; align-items: center;">
                    <span style="width: 14px; height: 14px; background: #ef4444; border-radius: 50%; display: inline-block; margin-right: 8px;"></span>
                    <span style="color: #6b7280; flex: 1;">受阻</span>
                    <span style="font-weight: 700; color: #111827;">${blockedTasks} 個</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      `
    })()}
  </div>

  <div class="section-divider"></div>

  <div class="avoid-break chart-section">
    <h2 style="margin-top: 0;">預算執行狀況</h2>
    ${(() => {
      const budgetPercent = totalBudget > 0 ? Math.round((totalBudgetUsed / totalBudget) * 100) : 0
      const isOverBudget = budgetPercent > 100

      return `
        <div class="chart-container">
          <div class="chart-left">
            <svg width="160" height="160" viewBox="0 0 160 160">
              <circle cx="80" cy="80" r="60" fill="none" stroke="#e5e7eb" stroke-width="18"/>
              ${totalBudget > 0 ? `
                <circle cx="80" cy="80" r="60" fill="none" stroke="${isOverBudget ? '#ef4444' : budgetPercent > 80 ? '#f59e0b' : '#10b981'}" stroke-width="18"
                  stroke-dasharray="${2 * Math.PI * 60 * Math.min(budgetPercent, 100) / 100} ${2 * Math.PI * 60}"
                  stroke-dashoffset="${2 * Math.PI * 60 * 0.25}"
                  transform="rotate(-90 80 80)"/>
              ` : ''}
              <text x="80" y="75" text-anchor="middle" font-size="22" font-weight="bold" fill="${isOverBudget ? '#dc2626' : '#111827'}">${budgetPercent}%</text>
              <text x="80" y="95" text-anchor="middle" font-size="11" fill="#6b7280">執行率</text>
            </svg>
          </div>
          <div class="chart-right">
            <table style="margin: 0; font-size: 12px; margin-bottom: 12px;">
              <tbody>
                <tr>
                  <td style="border: none; background: none; padding: 6px 0; display: flex; align-items: center;">
                    <span style="width: 14px; height: 14px; background: ${isOverBudget ? '#ef4444' : '#10b981'}; border-radius: 50%; display: inline-block; margin-right: 8px;"></span>
                    <span style="color: #6b7280; flex: 1;">已使用</span>
                    <span style="font-weight: 700; color: #111827;">${fmtMoney(totalBudgetUsed)}</span>
                  </td>
                </tr>
                <tr>
                  <td style="border: none; background: none; padding: 6px 0; display: flex; align-items: center;">
                    <span style="width: 14px; height: 14px; background: #e5e7eb; border-radius: 50%; display: inline-block; margin-right: 8px;"></span>
                    <span style="color: #6b7280; flex: 1;">剩餘</span>
                    <span style="font-weight: 700; color: #111827;">${fmtMoney(Math.max(totalBudget - totalBudgetUsed, 0))}</span>
                  </td>
                </tr>
              </tbody>
            </table>
            <div style="background: #dbeafe !important; padding: 12px 14px; border-radius: 4px; border: 2px solid #93c5fd; border-left: 5px solid #3b82f6 !important;">
              <div style="font-size: 11px; color: #1e40af; margin-bottom: 3px; font-weight: 600;">總預算</div>
              <div style="font-size: 16px; font-weight: 700; color: #111827;">${fmtMoney(totalBudget)}</div>
            </div>
          </div>
        </div>
      `
    })()}
  </div>

  <div class="section-divider"></div>

  ${projects.map((project, index) => {
    const statusClass =
      project.status === 'green' ? 'status-green' :
      project.status === 'yellow' ? 'status-yellow' : 'status-red'
    const statusText =
      project.status === 'green' ? '正常' :
      project.status === 'yellow' ? '注意' : '風險'

    return `
      ${index > 0 ? '<div class="page-break"></div>' : ''}
      <div class="project-section">
        <div class="project-header">
          ${index + 1}. ${project.name}
          <span class="status-badge ${statusClass}" style="float: right;">${statusText}</span>
        </div>

        <h3>基本資訊</h3>
        <table class="info-table">
          <tr><td>專案編碼</td><td>${project.projectCode}</td></tr>
          <tr><td>專案類型</td><td>${PROJECT_TYPE_LABELS[project.projectType as keyof typeof PROJECT_TYPE_LABELS] || project.projectType}</td></tr>
          <tr><td>負責人</td><td>${project.owner.name}</td></tr>
          <tr><td>專案期間</td><td>${new Date(project.startDate).toLocaleDateString('zh-TW')} ~ ${new Date(project.endDate).toLocaleDateString('zh-TW')}</td></tr>
          <tr><td>進度</td><td>${project.progress}%</td></tr>
          <tr><td>預算</td><td>${fmtMoney(project.budgetUsed)} / ${fmtMoney(project.budget)}</td></tr>
          <tr><td>團隊規模</td><td>${project.teamMembers.length} 人</td></tr>
        </table>

        ${project.milestones.length > 0 ? `
          <div class="avoid-break">
            <h3>里程碑進度（${project.milestones.filter(m => m.status === 'done').length}/${project.milestones.length} 已完成）</h3>
            <div style="margin: 12px 0;">
              ${project.milestones.map(m => {
                const statusColor =
                  m.status === 'done' ? '#10b981' :
                  m.status === 'in_progress' ? '#3b82f6' :
                  m.status === 'blocked' ? '#ef4444' : '#9ca3af'

                const statusText =
                  m.status === 'done' ? '✓ 已完成' :
                  m.status === 'in_progress' ? '→ 進行中' :
                  m.status === 'blocked' ? '✕ 受阻' : '○ 待辦'

                return `
                  <div class="milestone-item avoid-break" style="border-left-color: ${statusColor};">
                    <div style="display: table; width: 100%; margin-bottom: 5px;">
                      <div style="display: table-row;">
                        <div style="display: table-cell; font-weight: 600; font-size: 13px; color: #111827;">${m.name}</div>
                        <div style="display: table-cell; text-align: right; font-size: 11px; color: #6b7280; white-space: nowrap; padding-left: 10px;">${new Date(m.dueDate).toLocaleDateString('zh-TW')}</div>
                      </div>
                    </div>
                    <div class="progress-bar-container">
                      <div class="progress-bar" style="width: ${m.progress}%; background: ${statusColor};"></div>
                    </div>
                    <div style="display: table; width: 100%; margin-top: 4px;">
                      <div style="display: table-row;">
                        <div style="display: table-cell; font-size: 10px; color: #6b7280;">${statusText}</div>
                        <div style="display: table-cell; text-align: right; font-size: 12px; font-weight: 600; color: #374151;">${m.progress}%</div>
                      </div>
                    </div>
                  </div>
                `
              }).join('')}
            </div>
          </div>
        ` : ''}

        ${project.tasks.length > 0 ? `
          <h3>任務摘要（${project.tasks.filter(t => t.status === 'done').length}/${project.tasks.length} 已完成）</h3>
          <table>
            <tbody>
              <tr><td style="width: 120px; font-weight: 600;">已完成</td><td>${project.tasks.filter(t => t.status === 'done').length} 個</td></tr>
              <tr><td style="font-weight: 600;">進行中</td><td>${project.tasks.filter(t => t.status === 'in_progress').length} 個</td></tr>
              <tr><td style="font-weight: 600;">受阻</td><td>${project.tasks.filter(t => t.status === 'blocked').length} 個</td></tr>
              <tr><td style="font-weight: 600;">待辦</td><td>${project.tasks.filter(t => t.status === 'todo').length} 個</td></tr>
            </tbody>
          </table>
        ` : ''}

        ${project.risks.length > 0 ? `
          <h3>未解決風險（${project.risks.length} 個）</h3>
          <table>
            <thead>
              <tr>
                <th style="width: 50%;">風險標題</th>
                <th style="width: 15%;">影響程度</th>
                <th style="width: 15%;">發生機率</th>
                <th style="width: 20%;">狀態</th>
              </tr>
            </thead>
            <tbody>
              ${project.risks.map(r => `
                <tr>
                  <td>${r.title}</td>
                  <td>${r.impact === 'high' ? '高' : r.impact === 'medium' ? '中' : '低'}</td>
                  <td>${r.probability === 'high' ? '高' : r.probability === 'medium' ? '中' : '低'}</td>
                  <td>${r.status === 'open' ? '未解決' : r.status === 'mitigated' ? '已緩解' : '已關閉'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : '<p style="color: #16a34a; font-weight: 500;">✓ 無未解決風險</p>'}

        ${project.teamMembers.length > 0 ? `
          <h3>團隊成員（${project.teamMembers.length} 人）</h3>
          <table>
            <thead>
              <tr>
                <th style="width: 30%;">姓名</th>
                <th style="width: 35%;">Email</th>
                <th style="width: 20%;">角色</th>
                <th style="width: 15%;">職責</th>
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
