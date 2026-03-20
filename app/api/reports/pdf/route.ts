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
  if (overdueRatio > 0.3 || blockedRatio > 0.2 || (projectEnd < today && doneTasks.length < tasks.length)) return 'red'
  if (overdueTasks.length > 0 || blockedTasks.length > 0) return 'yellow'
  return 'green'
}

function getISOWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}

// SVG donut helper
function svgDonut(
  size: number, strokeWidth: number,
  segments: { value: number; color: string }[],
): string {
  const r = (size - strokeWidth) / 2
  const C = 2 * Math.PI * r
  const cx = size / 2
  const cy = size / 2
  const total = segments.reduce((s, seg) => s + seg.value, 0)
  if (total === 0) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#e2e8f0" stroke-width="${strokeWidth}"/>
    </svg>`
  }
  let acc = 0
  const circles = segments.filter(s => s.value > 0).map(s => {
    const dl = C * (s.value / total)
    const doff = C * (1 - acc / total)
    acc += s.value
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s.color}" stroke-width="${strokeWidth}" stroke-dasharray="${dl} ${C - dl}" stroke-dashoffset="${doff}"/>`
  }).join('')
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="transform: rotate(-90deg); transform-origin: 50% 50%;">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#e2e8f0" stroke-width="${strokeWidth}"/>
    ${circles}
  </svg>`
}

// Mini progress ring for project cards
function miniRingSvg(value: number, color: string): string {
  const size = 40, sw = 4
  const r = (size - sw) / 2
  const C = 2 * Math.PI * r
  const dl = C * (value / 100)
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="transform: rotate(-90deg);">
    <circle cx="20" cy="20" r="${r}" fill="none" stroke="#e2e8f0" stroke-width="${sw}"/>
    <circle cx="20" cy="20" r="${r}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-dasharray="${dl} ${C - dl}" stroke-linecap="round"/>
  </svg>`
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { projectIds } = body

    if (!projectIds || !Array.isArray(projectIds) || projectIds.length === 0) {
      return NextResponse.json({ error: '請選擇至少一個專案' }, { status: 400 })
    }

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
          include: { user: { select: { name: true, email: true } } },
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

    const projectsWithStatus = projects.map(p => {
      const parentTasks = p.tasks.filter(t => !t.parentId)
      const actualStatus = computeProjectStatus(parentTasks, p.endDate)
      const actualProgress = computeProjectProgress(p.milestones)
      return { ...p, actualStatus, actualProgress }
    })

    // ── Aggregate stats ──
    const totalProjects = projectsWithStatus.length
    const totalTasks = projectsWithStatus.reduce((s, p) => s + p.tasks.filter(t => !t.parentId).length, 0)
    const doneTasks = projectsWithStatus.reduce((s, p) => s + p.tasks.filter(t => !t.parentId && t.status === 'done').length, 0)
    const inProgressTasks = projectsWithStatus.reduce((s, p) => s + p.tasks.filter(t => !t.parentId && t.status === 'in_progress').length, 0)
    const totalMilestones = projectsWithStatus.reduce((s, p) => s + p.milestones.length, 0)
    const doneMilestones = projectsWithStatus.reduce((s, p) => s + p.milestones.filter(m => m.status === 'done').length, 0)
    const totalBudget = projectsWithStatus.reduce((s, p) => s + p.budget, 0)
    const totalBudgetUsed = projectsWithStatus.reduce((s, p) => s + p.budgetUsed, 0)
    const totalRisks = projectsWithStatus.reduce((s, p) => s + p.risks.length, 0)
    const avgProgress = totalProjects > 0 ? Math.round(projectsWithStatus.reduce((s, p) => s + p.actualProgress, 0) / totalProjects) : 0
    const budgetPercent = totalBudget > 0 ? Math.round((totalBudgetUsed / totalBudget) * 100) : 0

    const greenCount = projectsWithStatus.filter(p => p.actualStatus === 'green').length
    const yellowCount = projectsWithStatus.filter(p => p.actualStatus === 'yellow').length
    const redCount = projectsWithStatus.filter(p => p.actualStatus === 'red').length

    // Tier counts
    const t1Count = projectsWithStatus.filter(p => p.projectTier === 'T1').length
    const t2Count = projectsWithStatus.filter(p => p.projectTier === 'T2').length
    const t3Count = projectsWithStatus.filter(p => p.projectTier === 'T3').length
    const cipCount = projectsWithStatus.filter(p => p.projectTier === 'CIP').length

    const now = new Date().toLocaleString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    const weekNum = getISOWeekNumber(new Date())
    const yearStr = new Date().getFullYear()
    const today = new Date().toISOString().split('T')[0]

    const fmtMoney = (n: number) => { if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`; if (n >= 1000) return `$${(n / 1000).toFixed(0)}K`; return `$${n}` }
    const fmtDate = (d: Date) => new Date(d).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })
    const fmtDateFull = (d: Date) => new Date(d).toLocaleDateString('zh-TW')

    // ── Donut SVGs ──
    const healthDonut = svgDonut(140, 24, [
      { value: greenCount, color: '#10b981' },
      { value: yellowCount, color: '#f59e0b' },
      { value: redCount, color: '#ef4444' },
    ])
    const tierDonut = svgDonut(140, 24, [
      { value: t1Count, color: '#3b82f6' },
      { value: t2Count, color: '#10b981' },
      { value: t3Count, color: '#f59e0b' },
      { value: cipCount, color: '#8b5cf6' },
    ])
    const budgetDonutColor = budgetPercent > 100 ? '#ef4444' : budgetPercent > 80 ? '#f59e0b' : '#10b981'
    const budgetDonut = svgDonut(140, 24, [
      { value: Math.min(budgetPercent, 100), color: budgetDonutColor },
      { value: Math.max(100 - budgetPercent, 0), color: '#e2e8f0' },
    ])

    // ── Task/status helpers ──
    const fmtStatus = (s: string) => {
      if (s === 'done') return '<span class="ts ts-done">完成</span>'
      if (s === 'in_progress') return '<span class="ts ts-ip">進行中</span>'
      if (s === 'blocked') return '<span class="ts ts-blocked">受阻</span>'
      return '<span class="ts ts-todo">待辦</span>'
    }
    const fmtPriority = (p: string) => {
      if (p === 'high') return '<span style="color:#dc2626;font-weight:600;">高</span>'
      if (p === 'medium') return '<span style="color:#d97706;">中</span>'
      return '<span style="color:#94a3b8;">低</span>'
    }

    const html = `
<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <title>專案週報</title>
  <style>
    @page { size: A4 landscape; margin: 12mm 15mm; }
    @media print {
      body { margin: 0; padding: 0 !important; }
      .page-break { page-break-before: always; break-before: page; }
      .avoid-break { page-break-inside: avoid; break-inside: avoid; }
      * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: "Microsoft JhengHei", "微軟正黑體", "PingFang TC", sans-serif;
      line-height: 1.5; color: #1e293b; font-size: 11px; background: #f8fafc;
    }

    /* ── Header ── */
    .rpt-hd { background: linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%) !important; color: white !important; padding: 24px 32px 20px; }
    .rpt-hd h1 { font-size: 22px; font-weight: 700; letter-spacing: .5px; margin-bottom: 2px; color: white !important; }
    .rpt-hd .sub { font-size: 11px; color: rgba(255,255,255,.75) !important; }

    /* ── Dashboard Stat Cards ── */
    .dash-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; padding: 16px 32px; }
    .dash-card { background: white !important; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 16px; }
    .dash-card .lbl { font-size: 11px; color: #64748b; display: flex; align-items: center; gap: 6px; margin-bottom: 8px; }
    .dash-card .lbl svg { width: 14px; height: 14px; }
    .dash-card .vals { display: flex; align-items: baseline; gap: 10px; }
    .dash-card .big { font-size: 24px; font-weight: 700; color: #0f172a; }
    .dash-card .sm { font-size: 12px; color: #64748b; }
    .dash-card .bar-wrap { margin-top: 8px; }
    .bar-bg { height: 6px; background: #e2e8f0 !important; border-radius: 3px; overflow: hidden; }
    .bar-fg { height: 100%; border-radius: 3px; }
    .tier-row { display: flex; gap: 16px; margin-top: 4px; }
    .tier-num { font-size: 20px; font-weight: 700; }
    .tier-lbl { font-size: 10px; color: #94a3b8; }

    /* ── Donut section ── */
    .donut-section { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; padding: 0 32px 16px; }
    .donut-card { background: white !important; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; }
    .donut-card .title { font-size: 12px; font-weight: 600; color: #0f172a; margin-bottom: 12px; }
    .donut-wrap { position: relative; width: 140px; height: 140px; margin: 0 auto; }
    .donut-center { position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%); text-align: center; }
    .donut-center .dv { font-size: 22px; font-weight: 700; color: #0f172a; }
    .donut-center .dl { font-size: 10px; color: #64748b; }
    .legend { margin-top: 12px; }
    .leg-item { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; font-size: 11px; }
    .leg-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
    .leg-lbl { color: #64748b; flex: 1; }
    .leg-val { font-weight: 600; color: #0f172a; }

    /* ── Project Cards Grid ── */
    .proj-grid-section { padding: 0 32px 20px; }
    .proj-grid-title { font-size: 13px; font-weight: 700; color: #0f172a; margin-bottom: 10px; }
    .proj-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
    .proj-card { background: white !important; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; display: flex; align-items: center; gap: 10px; }
    .proj-card .ring { position: relative; width: 40px; height: 40px; flex-shrink: 0; }
    .proj-card .ring-pct { position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%); font-size: 9px; font-weight: 700; color: #0f172a; }
    .proj-card .info { flex: 1; min-width: 0; }
    .proj-card .pname { font-weight: 600; font-size: 11px; color: #0f172a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .proj-card .pmeta { font-size: 9px; color: #94a3b8; margin-top: 2px; display: flex; align-items: center; gap: 4px; }
    .proj-card .tier-badge { font-size: 9px; font-weight: 600; padding: 1px 6px; border-radius: 4px; background: #dbeafe !important; color: #1e40af !important; }
    .sdot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; }
    .sdot-g { background: #10b981 !important; }
    .sdot-y { background: #f59e0b !important; }
    .sdot-r { background: #ef4444 !important; }

    /* ── Section dividers ── */
    .sec { padding: 20px 32px; }
    .sec-title { font-size: 13px; font-weight: 700; color: #0f172a; margin-bottom: 12px; padding-bottom: 6px; border-bottom: 2px solid #e2e8f0; display: flex; align-items: center; gap: 8px; }
    .health-row { display: flex; gap: 6px; margin-left: auto; font-size: 10px; font-weight: 600; }
    .hchip { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 10px; }
    .hdot { width: 7px; height: 7px; border-radius: 50%; }

    /* ── Overview table ── */
    .ov-table { width: 100%; border-collapse: collapse; font-size: 11px; }
    .ov-table th { background: #f1f5f9 !important; color: #475569; font-weight: 600; font-size: 10px; padding: 8px 10px; text-align: left; border-bottom: 2px solid #e2e8f0; white-space: nowrap; }
    .ov-table td { padding: 10px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
    .ov-pn { font-weight: 600; color: #0f172a; font-size: 11px; }
    .ov-pm { font-size: 9px; color: #94a3b8; margin-top: 1px; }

    /* ── Status / Badge ── */
    .status-dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; vertical-align: middle; }
    .sg { background: #10b981 !important; } .sy { background: #f59e0b !important; } .sr { background: #ef4444 !important; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 600; white-space: nowrap; }
    .bg { background: #d1fae5 !important; color: #065f46 !important; }
    .by { background: #fef3c7 !important; color: #92400e !important; }
    .br { background: #fee2e2 !important; color: #991b1b !important; }
    .bb { background: #dbeafe !important; color: #1e40af !important; }
    .bgr { background: #f1f5f9 !important; color: #475569 !important; }

    /* ── Progress bar ── */
    .pb { height: 6px; background: #e2e8f0 !important; border-radius: 3px; overflow: hidden; width: 100%; }
    .pf { height: 100%; border-radius: 3px; }
    .pi { display: flex; align-items: center; gap: 6px; }
    .pi .pb { flex: 1; }
    .pi .pct { font-size: 10px; font-weight: 600; color: #0f172a; width: 32px; text-align: right; flex-shrink: 0; }

    /* ── Project detail page ── */
    .proj-hd { padding: 18px 32px 14px; background: linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%) !important; color: white !important; }
    .proj-hd h2 { font-size: 18px; font-weight: 700; color: white !important; margin-bottom: 4px; }
    .meta-row { display: flex; flex-wrap: wrap; gap: 16px; font-size: 11px; color: rgba(255,255,255,.7) !important; margin-top: 4px; }
    .meta-item { display: flex; align-items: center; gap: 4px; }
    .meta-lbl { color: rgba(255,255,255,.5) !important; font-size: 10px; }

    .metrics { display: flex; border-bottom: 1px solid #e2e8f0; background: white !important; }
    .mbox { flex: 1; padding: 12px 20px; border-right: 1px solid #e2e8f0; text-align: center; }
    .mbox:last-child { border-right: none; }
    .mbox .ml { font-size: 9px; color: #94a3b8; text-transform: uppercase; letter-spacing: .3px; }
    .mbox .mv { font-size: 18px; font-weight: 700; color: #0f172a; margin-top: 2px; }
    .mbox .ms { font-size: 9px; color: #94a3b8; margin-top: 1px; }

    .content { padding: 16px 32px; }
    .cgrid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; align-items: start; }

    /* ── Cards ── */
    .card { border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; background: white !important; }
    .card-hd { background: #f8fafc !important; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-size: 11px; font-weight: 600; color: #334155; display: flex; align-items: center; gap: 6px; }
    .card-bd { padding: 10px 12px; }
    .card-empty { padding: 16px 12px; text-align: center; color: #94a3b8; font-size: 10px; }

    /* ── Milestone table ── */
    .mst { width: 100%; border-collapse: collapse; font-size: 10px; }
    .mst th { background: #f8fafc !important; color: #64748b; font-weight: 600; font-size: 9px; text-transform: uppercase; letter-spacing: .3px; padding: 6px 8px; text-align: left; border-bottom: 1px solid #e2e8f0; }
    .mst td { padding: 8px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }

    /* ── Task table (full detail) ── */
    .tsk-tbl { width: 100%; border-collapse: collapse; font-size: 10px; margin-bottom: 4px; }
    .tsk-tbl th { background: #f8fafc !important; color: #64748b; font-weight: 600; font-size: 9px; padding: 5px 8px; text-align: left; border-bottom: 1px solid #e2e8f0; }
    .tsk-tbl td { padding: 5px 8px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
    .tsk-tbl .sub-row td { padding-left: 24px !important; color: #64748b; }
    .ms-banner { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; background: #f8fafc !important; }
    .ms-banner .ms-icon { width: 20px; height: 20px; border-radius: 50%; font-size: 10px; line-height: 20px; text-align: center; font-weight: 700; }
    .ms-banner .ms-nm { font-weight: 600; font-size: 11px; color: #0f172a; }
    .ms-banner .ms-info { margin-left: auto; font-size: 9px; color: #94a3b8; display: flex; gap: 12px; }

    /* ── Task status badges ── */
    .ts { display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 9px; font-weight: 600; }
    .ts-done { background: #d1fae5 !important; color: #065f46 !important; }
    .ts-ip { background: #dbeafe !important; color: #1e40af !important; }
    .ts-blocked { background: #fee2e2 !important; color: #991b1b !important; }
    .ts-todo { background: #f1f5f9 !important; color: #475569 !important; }

    /* ── Issue items ── */
    .iss { display: flex; align-items: flex-start; gap: 8px; padding: 6px 0; border-bottom: 1px solid #f8fafc; font-size: 10px; }
    .iss:last-child { border-bottom: none; }
    .iss-ic { width: 16px; height: 16px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 8px; font-weight: 700; flex-shrink: 0; margin-top: 1px; }
    .iss-r { background: #fee2e2 !important; color: #dc2626 !important; }
    .iss-y { background: #fef3c7 !important; color: #d97706 !important; }
    .iss-b { background: #dbeafe !important; color: #2563eb !important; }
    .iss-c { flex: 1; min-width: 0; }
    .iss-t { font-weight: 600; color: #0f172a; }
    .iss-m { color: #94a3b8; font-size: 9px; margin-top: 1px; }
  </style>
</head>
<body>

<!-- ═══════════════════════════════════════════════════════════
     PAGE 1: DASHBOARD OVERVIEW (matches report dashboard UI)
     ═══════════════════════════════════════════════════════════ -->
<div class="rpt-hd">
  <h1>專案報告</h1>
  <div class="sub">檢視專案進度與統計分析 · ${yearStr} 第 ${weekNum} 週 · ${now} 生成</div>
</div>

<!-- 4 stat cards -->
<div class="dash-stats avoid-break">
  <div class="dash-card">
    <div class="lbl">
      <svg viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
      專案層級
    </div>
    <div class="tier-row">
      <div style="text-align:center;"><div class="tier-num" style="color:#3b82f6;">${t1Count}</div><div class="tier-lbl">T1</div></div>
      <div style="text-align:center;"><div class="tier-num" style="color:#10b981;">${t2Count}</div><div class="tier-lbl">T2</div></div>
      <div style="text-align:center;"><div class="tier-num" style="color:#f59e0b;">${t3Count}</div><div class="tier-lbl">T3</div></div>
      <div style="text-align:center;"><div class="tier-num" style="color:#8b5cf6;">${cipCount}</div><div class="tier-lbl">CIP</div></div>
    </div>
  </div>
  <div class="dash-card">
    <div class="lbl">
      <svg viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
      預算執行
    </div>
    <div class="vals">
      <span class="big">${budgetPercent}%</span>
    </div>
    <div class="bar-wrap"><div class="bar-bg"><div class="bar-fg" style="width:${Math.min(budgetPercent, 100)}%; background:${budgetPercent > 100 ? '#ef4444' : '#3b82f6'} !important;"></div></div></div>
    <div style="font-size:10px; color:#94a3b8; margin-top:4px;">${fmtMoney(totalBudgetUsed)} / ${fmtMoney(totalBudget)}</div>
  </div>
  <div class="dash-card">
    <div class="lbl">
      <svg viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
      里程碑
    </div>
    <div class="vals">
      <span class="big">${doneMilestones}</span><span class="sm">/${totalMilestones}</span>
    </div>
  </div>
  <div class="dash-card">
    <div class="lbl">
      <svg viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
      健康度
    </div>
    <div class="vals">
      <span class="big">${greenCount}</span><span class="sm">/${totalProjects}</span>
    </div>
    <div style="font-size:10px; color:${redCount > 0 ? '#dc2626' : '#94a3b8'}; margin-top:4px;">${redCount > 0 ? `${redCount} 個專案有風險` : '所有專案正常'}</div>
  </div>
</div>

<!-- 3 donut charts -->
<div class="donut-section avoid-break">
  <div class="donut-card">
    <div class="title">專案健康度</div>
    <div class="donut-wrap">
      ${healthDonut}
      <div class="donut-center"><div class="dv">${totalProjects}</div><div class="dl">專案</div></div>
    </div>
    <div class="legend">
      <div class="leg-item"><span class="leg-dot" style="background:#10b981 !important;"></span><span class="leg-lbl">正常</span><span class="leg-val">${greenCount}</span></div>
      ${yellowCount > 0 ? `<div class="leg-item"><span class="leg-dot" style="background:#f59e0b !important;"></span><span class="leg-lbl">注意</span><span class="leg-val">${yellowCount}</span></div>` : ''}
      <div class="leg-item"><span class="leg-dot" style="background:#ef4444 !important;"></span><span class="leg-lbl">風險</span><span class="leg-val">${redCount}</span></div>
    </div>
  </div>
  <div class="donut-card">
    <div class="title">專案層級分佈</div>
    <div class="donut-wrap">
      ${tierDonut}
      <div class="donut-center"><div class="dv">${totalProjects}</div><div class="dl">專案</div></div>
    </div>
    <div class="legend">
      <div class="leg-item"><span class="leg-dot" style="background:#3b82f6 !important;"></span><span class="leg-lbl">T1</span><span class="leg-val">${t1Count}</span></div>
      <div class="leg-item"><span class="leg-dot" style="background:#10b981 !important;"></span><span class="leg-lbl">T2</span><span class="leg-val">${t2Count}</span></div>
      ${t3Count > 0 ? `<div class="leg-item"><span class="leg-dot" style="background:#f59e0b !important;"></span><span class="leg-lbl">T3</span><span class="leg-val">${t3Count}</span></div>` : ''}
      ${cipCount > 0 ? `<div class="leg-item"><span class="leg-dot" style="background:#8b5cf6 !important;"></span><span class="leg-lbl">CIP</span><span class="leg-val">${cipCount}</span></div>` : ''}
    </div>
  </div>
  <div class="donut-card">
    <div class="title">預算執行</div>
    <div class="donut-wrap">
      ${budgetDonut}
      <div class="donut-center"><div class="dv" style="color:${budgetPercent > 100 ? '#dc2626' : '#0f172a'};">${budgetPercent}%</div><div class="dl">執行率</div></div>
    </div>
    <div class="legend">
      <div class="leg-item"><span class="leg-dot" style="background:${budgetDonutColor} !important;"></span><span class="leg-lbl">已使用</span><span class="leg-val">${fmtMoney(totalBudgetUsed)}</span></div>
      <div class="leg-item"><span class="leg-dot" style="background:#e2e8f0 !important;"></span><span class="leg-lbl">剩餘</span><span class="leg-val">${fmtMoney(Math.max(totalBudget - totalBudgetUsed, 0))}</span></div>
    </div>
  </div>
</div>

<!-- Project cards grid (各專案進度) -->
<div class="proj-grid-section avoid-break">
  <div class="proj-grid-title">各專案進度</div>
  <div class="proj-grid">
    ${projectsWithStatus.map(p => {
      const sc = p.actualStatus === 'green' ? 'sdot-g' : p.actualStatus === 'yellow' ? 'sdot-y' : 'sdot-r'
      const ringColor = p.actualStatus === 'red' ? '#ef4444' : p.actualStatus === 'yellow' ? '#f59e0b' : '#3b82f6'
      const parentTaskCount = p.tasks.filter(t => !t.parentId).length
      const doneTaskCount = p.tasks.filter(t => !t.parentId && t.status === 'done').length
      const msDone = p.milestones.filter(m => m.status === 'done').length
      const tierLabel = p.projectTier || ''
      return `
        <div class="proj-card">
          <div class="ring">
            ${miniRingSvg(p.actualProgress, ringColor)}
            <span class="ring-pct">${p.actualProgress}%</span>
          </div>
          <div class="info">
            <div class="pname">${p.name}</div>
            <div class="pmeta">
              <span class="sdot ${sc}"></span>
              ${doneTaskCount}/${parentTaskCount} 任務　${msDone}/${p.milestones.length} 里程碑
            </div>
          </div>
          ${tierLabel ? `<span class="tier-badge">${tierLabel}</span>` : ''}
        </div>
      `
    }).join('')}
  </div>
</div>

<!-- ═══════════════════════════════════════════════════════════
     PAGE 2: EXECUTIVE SUMMARY TABLE
     ═══════════════════════════════════════════════════════════ -->
<div class="page-break"></div>
<div class="rpt-hd" style="padding: 18px 32px 14px;">
  <h1 style="font-size:18px;">專案進度總覽</h1>
  <div class="sub">${yearStr} 第 ${weekNum} 週 · 共 ${totalProjects} 個專案</div>
</div>

<div class="sec" style="padding-top: 16px;">
  <div class="sec-title">
    專案總覽
    <div class="health-row">
      <span class="hchip" style="background:#d1fae5 !important;"><span class="hdot sg"></span> 正常 ${greenCount}</span>
      ${yellowCount > 0 ? `<span class="hchip" style="background:#fef3c7 !important;"><span class="hdot sy"></span> 注意 ${yellowCount}</span>` : ''}
      <span class="hchip" style="background:#fee2e2 !important;"><span class="hdot sr"></span> 風險 ${redCount}</span>
    </div>
  </div>
  <table class="ov-table">
    <thead><tr>
      <th style="width:28px;"></th><th>專案名稱</th><th>層級</th><th>類型</th><th>負責人</th>
      <th style="width:160px;">進度</th><th>里程碑</th><th>預算</th><th>風險</th><th>關鍵議題</th>
    </tr></thead>
    <tbody>
    ${projectsWithStatus.map(p => {
      const pt = p.tasks.filter(t => !t.parentId)
      const overdue = pt.filter(t => t.status !== 'done' && t.endDate.toISOString().split('T')[0] < today)
      const blocked = pt.filter(t => t.status === 'blocked')
      let issue = '—'
      if (overdue.length > 0 && blocked.length > 0) issue = `${overdue.length} 逾期 · ${blocked.length} 受阻`
      else if (overdue.length > 0) issue = `${overdue.length} 個任務逾期`
      else if (blocked.length > 0) issue = `${blocked.length} 個任務受阻`
      else if (p.risks.length > 0) issue = `${p.risks.length} 個風險`
      const sc = p.actualStatus === 'green' ? 'sg' : p.actualStatus === 'yellow' ? 'sy' : 'sr'
      const pc = p.actualStatus === 'red' ? '#ef4444' : p.actualStatus === 'yellow' ? '#f59e0b' : '#3b82f6'
      const bPct = p.budget > 0 ? Math.round((p.budgetUsed / p.budget) * 100) : 0
      return `<tr>
        <td><span class="status-dot ${sc}"></span></td>
        <td><div class="ov-pn">${p.name}</div><div class="ov-pm">${p.projectCode} · ${fmtDateFull(p.startDate)} ~ ${fmtDateFull(p.endDate)}</div></td>
        <td><span class="badge bb">${p.projectTier || '—'}</span></td>
        <td><span class="badge bgr">${PROJECT_TYPE_LABELS[p.projectType as keyof typeof PROJECT_TYPE_LABELS] || p.projectType}</span></td>
        <td style="white-space:nowrap;">${p.owner.name}</td>
        <td><div class="pi"><div class="pb"><div class="pf" style="width:${p.actualProgress}%;background:${pc} !important;"></div></div><span class="pct">${p.actualProgress}%</span></div></td>
        <td style="white-space:nowrap;font-size:10px;">${p.milestones.filter(m => m.status === 'done').length}/${p.milestones.length}</td>
        <td style="white-space:nowrap;font-size:10px;">${bPct}%</td>
        <td style="text-align:center;">${p.risks.length > 0 ? `<span style="color:#dc2626;font-weight:600;">${p.risks.length}</span>` : '<span style="color:#94a3b8;">0</span>'}</td>
        <td style="font-size:10px;color:${issue === '—' ? '#94a3b8' : '#dc2626'};font-weight:${issue === '—' ? '400' : '600'};">${issue}</td>
      </tr>`
    }).join('')}
    </tbody>
  </table>
</div>

<!-- ═══════════════════════════════════════════════════════════
     PER-PROJECT DETAIL PAGES
     ═══════════════════════════════════════════════════════════ -->
${projectsWithStatus.map(project => {
  const sb = project.actualStatus === 'green' ? 'bg' : project.actualStatus === 'yellow' ? 'by' : 'br'
  const st = project.actualStatus === 'green' ? '正常' : project.actualStatus === 'yellow' ? '注意' : '風險'
  const parentTasks = project.tasks.filter(t => !t.parentId)
  const overdueTasks = parentTasks.filter(t => t.status !== 'done' && t.endDate.toISOString().split('T')[0] < today)
  const blockedTasks = parentTasks.filter(t => t.status === 'blocked')
  const pDone = parentTasks.filter(t => t.status === 'done').length
  const pInProg = parentTasks.filter(t => t.status === 'in_progress').length
  const bPct = project.budget > 0 ? Math.round((project.budgetUsed / project.budget) * 100) : 0
  const pendingDelays = (project.delayRequests || []).filter(d => d.status === 'pending')

  return `
  <div class="page-break"></div>

  <!-- Header -->
  <div class="proj-hd">
    <h2>${project.name} <span class="badge ${sb}" style="vertical-align:middle;font-size:11px;margin-left:6px;">${st}</span></h2>
    <div class="meta-row">
      <span class="meta-item"><span class="meta-lbl">編碼</span> ${project.projectCode}</span>
      <span class="meta-item"><span class="meta-lbl">類型</span> ${PROJECT_TYPE_LABELS[project.projectType as keyof typeof PROJECT_TYPE_LABELS] || project.projectType}</span>
      <span class="meta-item"><span class="meta-lbl">層級</span> ${project.projectTier || '—'}</span>
      <span class="meta-item"><span class="meta-lbl">負責人</span> ${project.owner.name}</span>
      <span class="meta-item"><span class="meta-lbl">團隊</span> ${project.teamMembers.length} 人</span>
      <span class="meta-item"><span class="meta-lbl">期間</span> ${fmtDateFull(project.startDate)} ~ ${fmtDateFull(project.endDate)}</span>
    </div>
  </div>

  <!-- Metrics -->
  <div class="metrics avoid-break">
    <div class="mbox"><div class="ml">整體進度</div><div class="mv">${project.actualProgress}%</div></div>
    <div class="mbox"><div class="ml">任務</div><div class="mv" style="font-size:14px;">${pDone}<span style="font-weight:400;color:#94a3b8;font-size:12px;">/${parentTasks.length} 完成</span></div><div class="ms">${pInProg} 進行中</div></div>
    <div class="mbox"><div class="ml">里程碑</div><div class="mv" style="font-size:14px;">${project.milestones.filter(m => m.status === 'done').length}<span style="font-weight:400;color:#94a3b8;font-size:12px;">/${project.milestones.length} 完成</span></div></div>
    <div class="mbox"><div class="ml">預算</div><div class="mv" style="font-size:14px;">${bPct}%</div><div class="ms">${fmtMoney(project.budgetUsed)} / ${fmtMoney(project.budget)}</div></div>
    <div class="mbox"><div class="ml">風險</div><div class="mv" style="color:${project.risks.length > 0 ? '#dc2626' : '#10b981'};">${project.risks.length}</div></div>
  </div>

  <!-- Content: two columns -->
  <div class="content">
    <div class="cgrid">

      <!-- LEFT: Milestones overview -->
      <div>
        <div class="card avoid-break">
          <div class="card-hd">
            里程碑進度
            <span style="margin-left:auto;font-size:9px;color:#94a3b8;font-weight:400;">${project.milestones.filter(m => m.status === 'done').length}/${project.milestones.length} 已完成</span>
          </div>
          ${project.milestones.length > 0 ? `
          <table class="mst">
            <thead><tr><th style="width:28px;"></th><th>名稱</th><th style="width:65px;">到期</th><th style="width:130px;">進度</th></tr></thead>
            <tbody>
            ${project.milestones.map(m => {
              const isOd = m.status !== 'done' && new Date(m.dueDate).toISOString().split('T')[0] < today
              const sc = m.status === 'done' ? '#10b981' : isOd ? '#ef4444' : m.status === 'in_progress' ? '#3b82f6' : m.status === 'blocked' ? '#ef4444' : '#94a3b8'
              const sl = m.status === 'done' ? '✓' : isOd ? '!' : m.status === 'in_progress' ? '→' : m.status === 'blocked' ? '✕' : '○'
              return `<tr>
                <td style="text-align:center;"><span style="display:inline-block;width:18px;height:18px;border-radius:50%;background:${sc}20 !important;color:${sc} !important;font-size:10px;line-height:18px;text-align:center;font-weight:700;">${sl}</span></td>
                <td><span style="font-weight:600;color:${isOd ? '#dc2626' : '#0f172a'};">${m.name}</span>${isOd ? '<span style="color:#ef4444;font-size:8px;margin-left:4px;">逾期</span>' : ''}</td>
                <td style="color:#64748b;font-size:9px;white-space:nowrap;">${fmtDate(m.dueDate)}</td>
                <td><div class="pi"><div class="pb"><div class="pf" style="width:${m.progress}%;background:${sc} !important;"></div></div><span class="pct" style="font-size:9px;">${m.progress}%</span></div></td>
              </tr>`
            }).join('')}
            </tbody>
          </table>` : '<div class="card-empty">尚無里程碑</div>'}
        </div>
      </div>

      <!-- RIGHT: Issues & Risks (compact summary — full detail in task pages) -->
      <div>
        <div class="card" style="margin-bottom:12px;">
          <div class="card-hd">需關注事項 <span style="margin-left:auto;font-size:9px;color:${(overdueTasks.length + blockedTasks.length) > 0 ? '#dc2626' : '#94a3b8'};font-weight:${(overdueTasks.length + blockedTasks.length) > 0 ? '600' : '400'};">${overdueTasks.length + blockedTasks.length} 項</span></div>
          ${(overdueTasks.length + blockedTasks.length) > 0 ? `<div class="card-bd">
            ${overdueTasks.slice(0, 3).map(t => `<div class="iss"><span class="iss-ic iss-r">!</span><div class="iss-c"><div class="iss-t">${t.title}</div><div class="iss-m">逾期 · ${t.assignee} · 到期 ${fmtDate(t.endDate)}</div></div></div>`).join('')}
            ${overdueTasks.length > 3 ? `<div style="font-size:9px;color:#94a3b8;padding:4px 0;">...還有 ${overdueTasks.length - 3} 個逾期任務</div>` : ''}
            ${blockedTasks.slice(0, 3).map(t => `<div class="iss"><span class="iss-ic iss-y">✕</span><div class="iss-c"><div class="iss-t">${t.title}</div><div class="iss-m">受阻 · ${t.assignee}</div></div></div>`).join('')}
            ${blockedTasks.length > 3 ? `<div style="font-size:9px;color:#94a3b8;padding:4px 0;">...還有 ${blockedTasks.length - 3} 個受阻任務</div>` : ''}
          </div>` : '<div class="card-empty" style="color:#10b981;">✓ 無逾期或受阻任務</div>'}
        </div>
        <div class="card" style="margin-bottom:12px;">
          <div class="card-hd">風險 <span style="margin-left:auto;font-size:9px;color:${project.risks.length > 0 ? '#dc2626' : '#94a3b8'};font-weight:${project.risks.length > 0 ? '600' : '400'};">${project.risks.length} 個</span></div>
          ${project.risks.length > 0 ? `<div class="card-bd">
            ${project.risks.slice(0, 3).map(r => {
              const ic = r.impact === 'high' ? 'iss-r' : r.impact === 'medium' ? 'iss-y' : 'iss-b'
              const il = r.impact === 'high' ? '高' : r.impact === 'medium' ? '中' : '低'
              return `<div class="iss"><span class="iss-ic ${ic}">${il}</span><div class="iss-c"><div class="iss-t">${r.title}</div><div class="iss-m">影響: ${il} · 機率: ${r.probability === 'high' ? '高' : r.probability === 'medium' ? '中' : '低'}${r.mitigation ? ` · ${r.mitigation.length > 40 ? r.mitigation.slice(0, 40) + '...' : r.mitigation}` : ''}</div></div></div>`
            }).join('')}
            ${project.risks.length > 3 ? `<div style="font-size:9px;color:#94a3b8;padding:4px 0;">...還有 ${project.risks.length - 3} 個風險</div>` : ''}
          </div>` : '<div class="card-empty" style="color:#10b981;">✓ 無未解決風險</div>'}
        </div>
        ${pendingDelays.length > 0 ? `<div class="card">
          <div class="card-hd">待審延期 <span style="margin-left:auto;font-size:9px;color:#d97706;font-weight:600;">${pendingDelays.length} 件</span></div>
          <div class="card-bd">
            ${pendingDelays.slice(0, 2).map(dr => `<div class="iss"><span class="iss-ic iss-y">⏱</span><div class="iss-c"><div class="iss-t">${dr.task ? dr.task.title : '專案延期'}</div><div class="iss-m">${dr.requester.name} · ${dr.reason.length > 50 ? dr.reason.slice(0, 50) + '...' : dr.reason}</div></div></div>`).join('')}
            ${pendingDelays.length > 2 ? `<div style="font-size:9px;color:#94a3b8;padding:4px 0;">...還有 ${pendingDelays.length - 2} 件待審</div>` : ''}
          </div>
        </div>` : ''}
      </div>
    </div>
  </div>

  <!-- Milestone → Task → Subtask Detail (separate page) -->
  ${(() => {
    // Only milestones with tasks
    const msWithTasks = project.milestones.filter(ms => parentTasks.some(t => t.milestoneId === ms.id))
    if (msWithTasks.length === 0) return ''

    return `
    <div class="page-break"></div>
    <div style="padding:14px 32px;background:linear-gradient(135deg,#1e3a5f 0%,#2d5a87 100%) !important;margin-bottom:16px;">
      <div style="font-size:16px;font-weight:700;color:white !important;margin-bottom:2px;">${project.name}</div>
      <div style="font-size:11px;color:rgba(255,255,255,.7) !important;">里程碑與任務明細</div>
    </div>
    <div style="padding:0 32px;">
      ${msWithTasks.map(ms => {
        const msTasks = parentTasks.filter(t => t.milestoneId === ms.id)
        const isOd = ms.status !== 'done' && new Date(ms.dueDate).toISOString().split('T')[0] < today
        const msColor = ms.status === 'done' ? '#10b981' : isOd ? '#ef4444' : ms.status === 'in_progress' ? '#3b82f6' : ms.status === 'blocked' ? '#ef4444' : '#94a3b8'
        const msIcon = ms.status === 'done' ? '✓' : isOd ? '!' : ms.status === 'in_progress' ? '→' : ms.status === 'blocked' ? '✕' : '○'
        const msDone = msTasks.filter(t => t.status === 'done').length

        return `
          <div class="card avoid-break" style="margin-bottom:10px;">
            <div class="ms-banner">
              <span class="ms-icon" style="background:${msColor}20 !important;color:${msColor} !important;">${msIcon}</span>
              <span class="ms-nm" ${isOd ? 'style="color:#dc2626;"' : ''}>${ms.name}${isOd ? ' <span style="color:#ef4444;font-size:9px;">(逾期)</span>' : ''}</span>
              <span class="ms-info">
                <span>進度 <b style="color:#0f172a;">${ms.progress}%</b></span>
                <span>任務 <b style="color:#0f172a;">${msDone}/${msTasks.length}</b></span>
                <span>到期 ${fmtDate(ms.dueDate)}</span>
              </span>
            </div>
            <table class="tsk-tbl">
              <thead><tr>
                <th style="width:28%;">任務名稱</th>
                <th style="width:9%;">負責人</th>
                <th style="width:8%;">狀態</th>
                <th style="width:6%;">優先</th>
                <th style="width:15%;">起迄</th>
                <th style="width:20%;">進度</th>
              </tr></thead>
              <tbody>
              ${msTasks.map(task => {
                const subtasks = (task as typeof task & { children?: typeof project.tasks }).children || []
                const taskIsOd = task.status !== 'done' && task.endDate.toISOString().split('T')[0] < today
                return `
                  <tr ${taskIsOd ? 'style="background:#fef2f2 !important;"' : ''}>
                    <td style="font-weight:600;${taskIsOd ? 'color:#dc2626;' : ''}">${task.title}${taskIsOd ? ' <span style="color:#ef4444;font-size:8px;">逾期</span>' : ''}</td>
                    <td>${task.assignee}</td>
                    <td>${fmtStatus(task.status)}</td>
                    <td>${fmtPriority(task.priority)}</td>
                    <td style="white-space:nowrap;font-size:9px;">${fmtDate(task.startDate)} ~ ${fmtDate(task.endDate)}</td>
                    <td><div class="pi"><div class="pb" style="height:5px;"><div class="pf" style="width:${task.progress}%;background:#3b82f6 !important;"></div></div><span class="pct" style="font-size:9px;">${task.progress}%</span></div></td>
                  </tr>
                  ${subtasks.map(sub => {
                    const subIsOd = sub.status !== 'done' && sub.endDate.toISOString().split('T')[0] < today
                    return `
                    <tr class="sub-row" ${subIsOd ? 'style="background:#fef2f2 !important;"' : ''}>
                      <td style="padding-left:24px !important;color:#64748b;">└ ${sub.title}${subIsOd ? ' <span style="color:#ef4444;font-size:8px;">逾期</span>' : ''}</td>
                      <td style="color:#64748b;">${sub.assignee}</td>
                      <td>${fmtStatus(sub.status)}</td>
                      <td>${fmtPriority(sub.priority)}</td>
                      <td style="white-space:nowrap;font-size:9px;color:#64748b;">${fmtDate(sub.startDate)} ~ ${fmtDate(sub.endDate)}</td>
                      <td><div class="pi"><div class="pb" style="height:5px;"><div class="pf" style="width:${sub.progress}%;background:#93c5fd !important;"></div></div><span class="pct" style="font-size:9px;color:#64748b;">${sub.progress}%</span></div></td>
                    </tr>`
                  }).join('')}
                `
              }).join('')}
              </tbody>
            </table>
          </div>
        `
      }).join('')}
    </div>
    `
  })()}
  `
}).join('')}

</body>
</html>`

    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  } catch (error) {
    console.error('Failed to generate PDF:', error)
    return NextResponse.json({ error: '生成 PDF 失敗' }, { status: 500 })
  }
}
