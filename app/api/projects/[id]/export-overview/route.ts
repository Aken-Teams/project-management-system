import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { safeJsonParse } from '@/lib/utils'
import ExcelJS from 'exceljs'

// ─── GET /api/projects/[id]/export-overview ──────────────
// 把「里程碑階段總覽」匯出成 Excel：
//   ① 階段總覽  用儲存格畫出甘特，可直接複製貼到 PPT，顏色與文字都能再編輯
//   ② 原始資料  同一份內容的表格版，要自己做圖或算數字時用
// 單向匯出——在 Excel 改完不會回寫系統。

const DAY = 86400000
const fmt = (d: Date) => d.toISOString().slice(0, 10)
const mid = (d: Date) => `${d.getUTCMonth() + 1}/${d.getUTCDate()}`

/** 與畫面一致的狀態配色（已完成綠／逾期琥珀／進行中藍／未開始灰） */
function toneOf(status: string, progress: number, end: Date, today: Date) {
  if (status === 'done') return { fill: 'FF10B981', soft: 'FFD1FAE5', text: '已完成' }
  if (end < today) return { fill: 'FFF59E0B', soft: 'FFFEF3C7', text: '逾期' }
  if (status === 'in-progress' || status === 'in_progress' || status === 'blocked' || progress > 0)
    return { fill: 'FF3B82F6', soft: 'FFDBEAFE', text: '進行中' }
  return { fill: 'FF94A3B8', soft: 'FFF1F5F9', text: '未開始' }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const project = await prisma.project.findUnique({
    where: { id },
    select: {
      projectCode: true, name: true, startDate: true, endDate: true, progress: true,
      milestones: { orderBy: { sortOrder: 'asc' }, select: { id: true, name: true, startDate: true, dueDate: true, status: true, progress: true } },
      tasks: { select: { id: true, milestoneId: true, title: true, endDate: true, completedAt: true } },
    },
  })
  if (!project) return NextResponse.json({ error: '找不到專案' }, { status: 404 })

  // 當責在畫面上設定的「要標註哪些任務」，匯出時一併帶出，兩邊看到的重點一致
  const cfgRow = await prisma.systemSetting.findUnique({ where: { key: `phase_overview:${id}` } })
  const cfg = safeJsonParse<{ hidden?: string[]; markers?: string[]; markerSource?: string }>(cfgRow?.value ?? '', {})
  const hidden = new Set(Array.isArray(cfg.hidden) ? cfg.hidden : [])
  const markerIds = new Set(Array.isArray(cfg.markers) ? cfg.markers : [])
  const markerSource = cfg.markerSource === 'plan' || cfg.markerSource === 'both' ? cfg.markerSource : 'actual'

  const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z')

  // ── 階段（沿用畫面規則：沒有 startDate 就接續前一個階段）──
  type Phase = { id: string; name: string; start: Date; end: Date; status: string; progress: number; actualEnd: Date | null }
  const actualEndByMs = new Map<string, Date>()
  for (const t of project.tasks) {
    if (!t.completedAt) continue
    const cur = actualEndByMs.get(t.milestoneId)
    if (!cur || t.completedAt > cur) actualEndByMs.set(t.milestoneId, t.completedAt)
  }
  const phases: Phase[] = []
  for (const m of project.milestones) {
    if (hidden.has(m.id)) continue
    const end = m.dueDate
    const start = m.startDate ?? (phases.length > 0 ? phases[phases.length - 1].end : project.startDate)
    phases.push({
      id: m.id, name: m.name, start: start > end ? end : start, end,
      status: m.status, progress: m.progress, actualEnd: actualEndByMs.get(m.id) ?? null,
    })
  }
  if (phases.length === 0) return NextResponse.json({ error: '沒有可匯出的里程碑' }, { status: 400 })

  const minT = Math.min(project.startDate.getTime(), ...phases.map(p => p.start.getTime()))
  const maxT = Math.max(project.endDate.getTime(), ...phases.map(p => p.end.getTime()))

  // ── 週格（貼到 PPT 時寬度才控制得住；每格 = 一週）──
  const weeks: { start: Date; end: Date }[] = []
  const cursor = new Date(minT)
  cursor.setUTCDate(cursor.getUTCDate() - ((cursor.getUTCDay() + 6) % 7)) // 週一對齊
  while (cursor.getTime() <= maxT) {
    const ws = new Date(cursor)
    const we = new Date(cursor); we.setUTCDate(we.getUTCDate() + 6)
    weeks.push({ start: ws, end: we })
    cursor.setUTCDate(cursor.getUTCDate() + 7)
  }

  const LABEL_COLS = 4          // 名稱 / 類型 / 開始 / 結束
  const firstWeekCol = LABEL_COLS + 1
  const weekColOf = (d: Date) => {
    const i = weeks.findIndex(w => d >= w.start && d <= w.end)
    return (i === -1 ? (d < weeks[0].start ? 0 : weeks.length - 1) : i) + firstWeekCol
  }

  const wb = new ExcelJS.Workbook()
  wb.created = new Date()

  // ══ 工作表一：階段總覽（甘特）══
  const ws = wb.addWorksheet('階段總覽', {
    views: [{ state: 'frozen', xSplit: LABEL_COLS, ySplit: 5 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  })
  ws.getColumn(1).width = 30
  ws.getColumn(2).width = 8
  ws.getColumn(3).width = 12
  ws.getColumn(4).width = 12
  for (let i = 0; i < weeks.length; i++) ws.getColumn(firstWeekCol + i).width = 3.2

  const lastCol = LABEL_COLS + weeks.length

  const title = ws.addRow([`${project.projectCode}　${project.name}`])
  title.font = { bold: true, size: 14 }
  ws.mergeCells(1, 1, 1, lastCol)
  const sub = ws.addRow([`專案期間 ${fmt(project.startDate)} ~ ${fmt(project.endDate)}　|　整體進度 ${project.progress}%　|　匯出於 ${new Date().toLocaleString('zh-TW')}`])
  sub.font = { size: 10, color: { argb: 'FF64748B' } }
  ws.mergeCells(2, 1, 2, lastCol)
  ws.addRow([])

  // 年列 / 月列
  const yearRow = ws.addRow([])
  const monthRow = ws.addRow([])
  yearRow.height = 16; monthRow.height = 16
  const spanMerge = (row: number, keyOf: (w: { start: Date }) => string, labelOf: (w: { start: Date }) => string) => {
    let i = 0
    while (i < weeks.length) {
      const key = keyOf(weeks[i])
      let j = i
      while (j + 1 < weeks.length && keyOf(weeks[j + 1]) === key) j++
      const c1 = firstWeekCol + i, c2 = firstWeekCol + j
      if (c2 > c1) ws.mergeCells(row, c1, row, c2)
      const cell = ws.getCell(row, c1)
      cell.value = labelOf(weeks[i])
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
      cell.font = { size: 9, bold: row === 4, color: { argb: 'FF334155' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: row === 4 ? 'FFE0E7FF' : 'FFF1F5F9' } }
      i = j + 1
    }
  }
  spanMerge(4, w => String(w.start.getUTCFullYear()), w => String(w.start.getUTCFullYear()))
  spanMerge(5, w => `${w.start.getUTCFullYear()}-${w.start.getUTCMonth()}`, w => `${w.start.getUTCMonth() + 1}月`)
  for (const [r, t] of [[4, '年'], [5, '月']] as const) {
    const c = ws.getCell(r, 1); c.value = t
    c.font = { size: 9, bold: true, color: { argb: 'FF334155' } }
  }

  // 標記：彙整成「編號清單」。週欄只有 3 個字寬，直接塞長文字會互相覆蓋；
  //   儲存格註解在 Excel 又會被切成窄長條，中文斷行很難看。
  //   作法：時間軸上只放圈號，完整內容列在下方對照表——貼進 PPT 也不會跑版。
  const CIRCLE = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳'
  type Mark = { no: number; sym: string; col: number; date: Date; title: string; kind: 'plan' | 'actual'; phase: string }
  const marks: Mark[] = []
  const seenMark = new Set<string>()
  for (const p of phases) {
    for (const t of project.tasks) {
      if (!markerIds.has(t.id) || t.milestoneId !== p.id) continue
      // 先計畫、後實際——讀的人是拿實際去對照計畫，計畫是基準要先出現。
      //   即使兩個日期相同（準時完成）也兩筆都留：少了計畫那筆就沒有對照基準，
      //   看不出來是準時還是這任務根本沒排期。
      const entries: { d: Date; kind: 'plan' | 'actual' }[] = []
      if (markerSource !== 'actual') entries.push({ d: t.endDate, kind: 'plan' })
      if (markerSource !== 'plan' && t.completedAt) entries.push({ d: t.completedAt, kind: 'actual' })
      for (const e of entries) {
        // 去重的鍵要含類型，否則同日期的計畫與實際會互相吃掉
        const key = `${t.id}|${fmt(e.d)}|${e.kind}`
        if (seenMark.has(key)) continue
        seenMark.add(key)
        const no = marks.length + 1
        marks.push({
          no, sym: no <= CIRCLE.length ? CIRCLE[no - 1] : `(${no})`,
          col: weekColOf(e.d), date: e.d, title: t.title, kind: e.kind, phase: p.name,
        })
      }
    }
  }

  // 瓶頸：未完成且已開始的階段中，「完成度換算的進度」落後今天最多的那個。
  //   與畫面同一套判定，兩邊指到的階段才會一致。
  let bottleneckName: string | null = null
  let worstSlip = 0
  for (const p of phases) {
    if (p.status === 'done' || p.start > today) continue
    const prog = Math.max(0, Math.min(1, p.progress / 100))
    const earned = p.start.getTime() + prog * (p.end.getTime() - p.start.getTime())
    const slip = today.getTime() - earned
    if (slip > worstSlip) { worstSlip = slip; bottleneckName = p.name }
  }

  const LATE_FILL = 'FFDC2626'   // 遲交：超出計畫截止的那一段
  // 標記配色：計畫是基準用灰、實際是結果用紫。全部同色就分不出哪個是哪個。
  const MARK_COLOR = { plan: 'FF64748B', actual: 'FF6D28D9' } as const

  // 每個階段 2~3 列：Plan（計畫區間）／Actual（已完成部分）／標記（有勾選才有）
  const GRID = { style: 'hair' as const, color: { argb: 'FFE2E8F0' } }
  const EDGE = { style: 'thin' as const, color: { argb: 'FFCBD5E1' } }
  for (const p of phases) {
    const tone = toneOf(p.status, p.progress, p.end, today)
    const c1 = weekColOf(p.start), c2 = weekColOf(p.end)
    const mine = marks.filter(x => x.phase === p.name).sort((x, y) => x.col - y.col)
    const startRow = ws.rowCount + 1

    const isBottleneck = p.name === bottleneckName
    const planRow = ws.addRow([(isBottleneck ? '⚠ ' : '') + p.name, 'Plan', fmt(p.start), fmt(p.end)])
    planRow.height = 20
    for (let c = firstWeekCol; c <= lastCol; c++) ws.getCell(planRow.number, c).border = { left: GRID, right: GRID }
    for (let c = c1; c <= c2; c++) {
      const cell = ws.getCell(planRow.number, c)
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: tone.soft } }
      cell.border = {
        top: { style: 'thin', color: { argb: tone.fill } },
        bottom: { style: 'thin', color: { argb: tone.fill } },
        left: c === c1 ? { style: 'thin', color: { argb: tone.fill } } : GRID,
        right: c === c2 ? { style: 'thin', color: { argb: tone.fill } } : GRID,
      }
    }

    const prog = p.status === 'done' ? 1 : Math.max(0, Math.min(1, p.progress / 100))
    const earnedEnd = p.status === 'done'
      ? (p.actualEnd ?? p.end)
      : new Date(p.start.getTime() + prog * Math.max(1, p.end.getTime() - p.start.getTime()))
    const actualRow = ws.addRow(['', 'Actual', prog > 0 ? fmt(p.start) : '', prog > 0 ? fmt(earnedEnd) : ''])
    actualRow.height = 20
    for (let c = firstWeekCol; c <= lastCol; c++) ws.getCell(actualRow.number, c).border = { left: GRID, right: GRID }
    if (prog > 0) {
      const ac2 = weekColOf(earnedEnd)
      // 已完成但晚於計畫截止 → 超出的那一段標紅。
      //   不分段的話，遲交三個月跟準時完成畫出來一模一樣，看報告的人根本看不出來。
      const late = p.status === 'done' && p.actualEnd != null && p.actualEnd.getTime() > p.end.getTime()
      const planEndCol = weekColOf(p.end)
      for (let c = c1; c <= ac2; c++) {
        const inLate = late && c > planEndCol
        const fillColor = inLate ? LATE_FILL : tone.fill
        const cell = ws.getCell(actualRow.number, c)
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillColor } }
        cell.border = {
          left: c === c1 ? { style: 'thin', color: { argb: fillColor } } : GRID,
          right: c === ac2 ? { style: 'thin', color: { argb: fillColor } } : GRID,
        }
      }
      if (late) {
        const days = Math.round((p.actualEnd!.getTime() - p.end.getTime()) / DAY)
        actualRow.getCell(4).value = `${fmt(p.actualEnd!)}（遲 ${days} 天）`
        actualRow.getCell(4).font = { size: 9, bold: true, color: { argb: LATE_FILL } }
      }
    }

    let markRowNum = 0
    if (mine.length > 0) {
      const markRow = ws.addRow(['', '標記', '', ''])
      markRow.height = 18
      markRowNum = markRow.number
      for (let c = firstWeekCol; c <= lastCol; c++) ws.getCell(markRowNum, c).border = { left: GRID, right: GRID }
      // 同一週有多個標記就併在同一格，圈號不會互相蓋掉
      const byCol = new Map<number, Mark[]>()
      for (const mk of mine) {
        const arr = byCol.get(mk.col) ?? []; arr.push(mk); byCol.set(mk.col, arr)
      }
      for (const [col, list] of byCol) {
        const cell = ws.getCell(markRowNum, col)
        cell.value = list.map(x => x.sym).join('')
        // 同格混有計畫與實際時以實際為主色（那是比較要看的結果）
        const kind = list.some(x => x.kind === 'actual') ? 'actual' : 'plan'
        cell.font = { size: 10, bold: true, color: { argb: MARK_COLOR[kind] } }
        cell.alignment = { horizontal: 'center', vertical: 'middle' }
      }
    }

    // 階段名稱跨該階段所有列並垂直置中，讀起來才是一組
    const endRow = markRowNum || actualRow.number
    if (endRow > startRow) ws.mergeCells(startRow, 1, endRow, 1)
    const nameCell = ws.getCell(startRow, 1)
    // 瓶頸整格標紅——⚠ 跟著本文用預設色時看起來只是個怪符號，紅字才讀得出是警示
    nameCell.font = { bold: true, size: 11, ...(isBottleneck ? { color: { argb: LATE_FILL } } : {}) }
    if (isBottleneck) {
      nameCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF2F2' } }
    }
    nameCell.alignment = { vertical: 'middle', wrapText: true }
    for (let r = startRow; r <= endRow; r++) {
      for (let c = 2; c <= LABEL_COLS; c++) {
        const cell = ws.getCell(r, c)
        cell.font = { size: 9, color: { argb: 'FF64748B' } }
        if (c >= 3) cell.alignment = { horizontal: 'center' }
      }
      if (r === endRow) {
        for (let c = 1; c <= lastCol; c++) {
          const cell = ws.getCell(r, c)
          cell.border = { ...(cell.border ?? {}), bottom: EDGE }
        }
      }
    }
  }

  // 今天線
  if (today.getTime() >= minT && today.getTime() <= maxT) {
    const tc = weekColOf(today)
    for (let r = 4; r <= ws.rowCount; r++) {
      const cell = ws.getCell(r, tc)
      cell.border = { ...(cell.border ?? {}), right: { style: 'medium', color: { argb: 'FFE11D48' } } }
    }
    ws.getCell(3, tc).value = '今天'
    ws.getCell(3, tc).font = { size: 9, bold: true, color: { argb: 'FFE11D48' } }
  }

  // 圖例
  ws.addRow([])
  const legend = ws.addRow(['圖例', '', '', ''])
  legend.getCell(1).font = { bold: true, size: 9 }
  const LEGEND: [string, string][] = [
    ['已完成', 'FF10B981'], ['進行中', 'FF3B82F6'], ['逾期', 'FFF59E0B'],
    ['未開始', 'FF94A3B8'], ['遲交', LATE_FILL], ['瓶頸(⚠)', 'FFFEF2F2'],
  ]
  // 色塊與文字分開並各自合併儲存格。塞在同一個 3 字寬的週欄裡，
  //   文字會溢到隔壁格，看起來像色塊畫歪了。
  LEGEND.forEach(([text, color], i) => {
    const base = firstWeekCol + i * 7
    if (base + 5 > lastCol) return
    ws.mergeCells(legend.number, base, legend.number, base + 1)
    const sw = ws.getCell(legend.number, base)
    sw.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } }
    sw.border = { top: EDGE, bottom: EDGE, left: EDGE, right: EDGE }
    ws.mergeCells(legend.number, base + 2, legend.number, base + 5)
    const lb = ws.getCell(legend.number, base + 2)
    lb.value = text
    lb.font = { size: 9, color: { argb: 'FF334155' } }
    lb.alignment = { horizontal: 'left', vertical: 'middle' }
  })
  legend.height = 16
  const tip = ws.addRow(['說明：Plan 為計畫區間、Actual 為已完成部分；超出計畫截止的紅色段為遲交。階段名稱前的 ⚠ 為目前最落後的瓶頸。「標記」列的圈號對應下方的標記對照表（灰色＝計畫完成、紫色＝實際完成）。'])
  tip.getCell(1).font = { size: 9, color: { argb: 'FF64748B' } }
  ws.mergeCells(tip.number, 1, tip.number, lastCol)

  // ── 標記對照表：圈號 → 日期與任務名稱 ──
  //   這張表畫在甘特同一個工作表上，欄寬被週欄（3.2）綁住，
  //   直接一格一欄文字一定溢到隔壁。改用水平合併給每個欄位足夠的寬度。
  if (marks.length > 0) {
    // [起始欄, 佔幾欄]：編號 / 日期 / 類型 / 任務名稱 / 所屬階段
    //   日期要兩格才放得下 2025-10-01，只給一格（寬 8）會被切成 025-10-0
    const SPAN: [number, number][] = [[1, 1], [2, 2], [4, 1], [5, 13], [18, 10]]
    const putRow = (vals: (string | number)[], styler?: (c: ExcelJS.Cell, i: number) => void) => {
      const row = ws.addRow([])
      row.height = 17
      SPAN.forEach(([col, span], i) => {
        if (col + span - 1 > lastCol) return
        if (span > 1) ws.mergeCells(row.number, col, row.number, col + span - 1)
        const cell = ws.getCell(row.number, col)
        cell.value = vals[i] ?? ''
        cell.alignment = { vertical: 'middle', horizontal: i <= 2 ? 'center' : 'left' }
        styler?.(cell, i)
      })
      return row
    }

    ws.addRow([])
    const mh = ws.addRow(['標記對照'])
    mh.getCell(1).font = { bold: true, size: 11, color: { argb: 'FF6D28D9' } }

    putRow(['編號', '日期', '類型', '任務名稱', '所屬階段'], (c) => {
      c.font = { bold: true, size: 9, color: { argb: 'FF334155' } }
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }
      c.border = { top: EDGE, bottom: EDGE }
    })

    for (const mk of marks) {
      putRow(
        [mk.sym, fmt(mk.date), mk.kind === 'actual' ? '實際完成' : '計畫完成', mk.title, mk.phase],
        (c, i) => {
          c.border = { bottom: GRID }
          if (i === 0) c.font = { bold: true, size: 11, color: { argb: MARK_COLOR[mk.kind] } }
          else if (i === 1) { c.font = { size: 9 }; c.numFmt = '@' }
          else if (i === 2) c.font = { size: 9, bold: true, color: { argb: MARK_COLOR[mk.kind] } }
          else c.font = { size: 10 }
        },
      )
    }
  }

  // ══ 工作表二：原始資料 ══
  const raw = wb.addWorksheet('原始資料')
  raw.columns = [
    { header: '階段', width: 30 },
    { header: '計畫開始', width: 13 },
    { header: '計畫結束', width: 13 },
    { header: '計畫天數', width: 10 },
    { header: '狀態', width: 10 },
    { header: '進度%', width: 9 },
    { header: '實際完成日', width: 13 },
    { header: '與計畫差(天)', width: 13 },
  ]
  raw.getRow(1).font = { bold: true, color: { argb: 'FF1E3A8A' } }
  raw.getRow(1).eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF2F7' } } })
  for (const p of phases) {
    const tone = toneOf(p.status, p.progress, p.end, today)
    raw.addRow([
      p.name, fmt(p.start), fmt(p.end),
      Math.round((p.end.getTime() - p.start.getTime()) / DAY) + 1,
      tone.text, p.progress,
      p.actualEnd ? fmt(p.actualEnd) : '',
      p.actualEnd ? Math.round((p.actualEnd.getTime() - p.end.getTime()) / DAY) : '',
    ])
  }
  if (marks.length > 0) {
    raw.addRow([])
    const h = raw.addRow(['任務日期標記'])
    h.font = { bold: true, color: { argb: 'FF7C3AED' } }
    raw.addRow(['所屬階段', '類型', '日期', '任務名稱']).font = { bold: true }
    for (const p of phases) {
      for (const t of project.tasks) {
        if (!markerIds.has(t.id) || t.milestoneId !== p.id) continue
        if (markerSource !== 'plan' && t.completedAt) raw.addRow([p.name, '實際完成', fmt(t.completedAt), t.title])
        if (markerSource !== 'actual') raw.addRow([p.name, '計畫完成', fmt(t.endDate), t.title])
      }
    }
  }
  for (const col of [2, 3, 7]) raw.getColumn(col).numFmt = '@'

  const buf = await wb.xlsx.writeBuffer()
  const fileName = encodeURIComponent(`${project.projectCode}_階段總覽_${fmt(new Date())}.xlsx`)
  return new NextResponse(buf as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${fileName}`,
      'Cache-Control': 'no-store',
    },
  })
}
