import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import ExcelJS from 'exceljs'

// ─── GET /api/projects/[id]/export-schedule ──────────────
// 匯出專案時程（里程碑 › 任務 › 子任務）為可編輯的 Excel。
//   欄位與系統內的時程表一致，讓人在 Excel 上討論、調整後再回填系統。
//   注意：這是單向匯出，改完的檔案不會自動匯回。

const fmt = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : '')

const STATUS_TEXT: Record<string, string> = {
  todo: '未開始', in_progress: '進行中', blocked: '受阻', done: '已完成',
}
const PRIORITY_TEXT: Record<string, string> = {
  low: '低', medium: '中', high: '高', urgent: '緊急',
}

const COLUMNS = [
  { header: '層級', width: 10 },
  { header: '里程碑 / 任務名稱', width: 42 },
  { header: '負責人', width: 16 },
  { header: '開始日期', width: 13 },
  { header: '結束日期', width: 13 },
  { header: '日曆天', width: 9 },
  { header: '優先度', width: 9 },
  { header: '進度%', width: 9 },
  { header: '狀態', width: 10 },
  { header: '實際完成日', width: 13 },
  { header: '備註', width: 30 },
]

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const project = await prisma.project.findUnique({
    where: { id },
    select: {
      projectCode: true, name: true, startDate: true, endDate: true, progress: true,
      milestones: { orderBy: { sortOrder: 'asc' }, select: { id: true, name: true, startDate: true, dueDate: true, status: true, progress: true } },
      tasks: {
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true, milestoneId: true, parentId: true, title: true, assignee: true,
          startDate: true, endDate: true, durationDays: true, priority: true,
          progress: true, status: true, completedAt: true,
        },
      },
    },
  })
  if (!project) return NextResponse.json({ error: '找不到專案' }, { status: 404 })

  const wb = new ExcelJS.Workbook()
  wb.created = new Date()
  const ws = wb.addWorksheet('專案時程', {
    views: [{ state: 'frozen', ySplit: 3 }],   // 凍結標題，捲動時欄位名仍看得到
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  })
  ws.columns = COLUMNS.map(c => ({ width: c.width }))

  // ── 抬頭 ──
  const title = ws.addRow([`${project.projectCode}　${project.name}`])
  title.font = { bold: true, size: 14 }
  ws.mergeCells(1, 1, 1, COLUMNS.length)
  const sub = ws.addRow([
    `專案期間 ${fmt(project.startDate)} ~ ${fmt(project.endDate)}　|　整體進度 ${project.progress}%　|　匯出時間 ${new Date().toLocaleString('zh-TW')}`,
  ])
  sub.font = { size: 10, color: { argb: 'FF64748B' } }
  ws.mergeCells(2, 1, 2, COLUMNS.length)

  // ── 欄位列 ──
  const head = ws.addRow(COLUMNS.map(c => c.header))
  head.font = { bold: true, color: { argb: 'FF1E3A8A' } }
  head.alignment = { vertical: 'middle' }
  head.eachCell(c => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF2F7' } }
    c.border = { top: { style: 'thin', color: { argb: 'FFCBD5E1' } }, bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } } }
  })

  // ── 內容：里程碑 → 其下任務（依樹狀，父在子前）──
  const childrenOf = new Map<string, typeof project.tasks>()
  for (const t of project.tasks) {
    if (!t.parentId) continue
    const a = childrenOf.get(t.parentId)
    if (a) a.push(t); else childrenOf.set(t.parentId, [t])
  }

  const addTask = (t: typeof project.tasks[number], depth: number) => {
    const row = ws.addRow([
      depth === 0 ? '任務' : `子任務 L${depth + 1}`,
      `${'    '.repeat(depth + 1)}${t.title}`,
      t.assignee || '',
      fmt(t.startDate),
      fmt(t.endDate),
      t.durationDays || '',
      PRIORITY_TEXT[t.priority] ?? t.priority,
      t.progress,
      STATUS_TEXT[t.status] ?? t.status,
      fmt(t.completedAt),
      '',
    ])
    if (t.completedAt) row.getCell(9).font = { color: { argb: 'FF15803D' } }
    for (const c of (childrenOf.get(t.id) ?? [])) addTask(c, depth + 1)
  }

  for (const m of project.milestones) {
    const msRow = ws.addRow([
      '里程碑', m.name, '', fmt(m.startDate), fmt(m.dueDate), '', '', m.progress,
      STATUS_TEXT[m.status] ?? m.status, '', '',
    ])
    msRow.font = { bold: true }
    msRow.eachCell(c => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }
    })
    // 該里程碑底下的頂層任務（子任務由 addTask 遞迴帶出）
    for (const t of project.tasks) {
      if (t.milestoneId !== m.id || t.parentId) continue
      addTask(t, 0)
    }
  }

  // 日期欄位用文字格式，避免 Excel 把 2026-01-05 自動轉成別的格式
  for (const col of [4, 5, 10]) ws.getColumn(col).numFmt = '@'
  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: COLUMNS.length } }

  const buf = await wb.xlsx.writeBuffer()
  const fileName = encodeURIComponent(`${project.projectCode}_專案時程_${fmt(new Date())}.xlsx`)
  return new NextResponse(buf as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${fileName}`,
      'Cache-Control': 'no-store',
    },
  })
}
