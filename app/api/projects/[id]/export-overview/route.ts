import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { safeJsonParse } from '@/lib/utils'
import ExcelJS from 'exceljs'

// ─── GET /api/projects/[id]/export-overview ──────────────
// 把「里程碑階段總覽」匯出成 Excel：
//   ① 階段總覽  一格一週。整個專案一眼看完，寬度控制在可貼 PPT 的範圍
//   ② 各階段細節  一格一天，每個階段一張。欄寬正常、人在 Excel 裡改得動
//   ③ 階段彙總  階段層級的表格版，要自己做圖或算數字時用
//   ④ 任務明細  一列一個任務的平表，有篩選器——要篩選、排序、樞紐都在這張做
// 篩選為什麼只放在平表：圖表分頁的任務名稱跨「計畫／實際」兩列合併，
//   而 Excel 篩選是以列為單位，合併範圍被篩時只會留下第一列——
//   篩出來會變成只剩計畫、實際整條消失，看起來就是錯的。
// 為什麼要拆成兩種粒度：Excel 的一欄固定代表一段時間，沒有「縮放」這回事。
//   整個專案做成一格一天要 380+ 欄，欄寬被迫壓到 5px，既調不動、標記也全擠在一起；
//   但一格一週又看不出長條確切落在哪一天。拆開之後兩邊都成立。
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
      tasks: {
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true, milestoneId: true, parentId: true, title: true, assignee: true,
          startDate: true, endDate: true, completedAt: true, status: true, progress: true,
        },
      },
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

  // ── 時間格（貼到 PPT 時寬度才控制得住）──
  //   對齊「專案起始日」而不是星期一。對齊星期一會讓第一格跑到專案開始之前
  //   （10/1 開工卻落在 9/29 那格），標記看起來就像提早了好幾天。
  //   格寬依專案長度調整，讓總欄數維持在可貼 PPT 的範圍。
  //   這張表一格＝一週，為的是欄寬維持正常、人改得動。要看確切是哪一天，
  //   請翻到該階段自己的那張細節表（一格一天）。
  const STEP = 7
  const weeks: { start: Date; end: Date }[] = []
  const cursor = new Date(minT)
  while (cursor.getTime() <= maxT) {
    const bs = new Date(cursor)
    const be = new Date(cursor); be.setUTCDate(be.getUTCDate() + STEP - 1)
    weeks.push({ start: bs, end: be })
    cursor.setUTCDate(cursor.getUTCDate() + STEP)
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

  // 年列 / 月列。總表一格＝一週，標到「日」反而會讓人以為那一欄就是那一天——
  //   要看確切日期請翻該階段的細節分頁（那裡才是一格一天）。
  const yearRow = ws.addRow([])
  const monthRow = ws.addRow([])
  yearRow.height = 16; monthRow.height = 18
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
  // 日列：每格標該週的起始日。只有年月時看不出長條確切落在哪一天，
  //   欄寬只有 3 個字，所以僅放日期數字（月份看上一列）。
  // 月列底下收一條線，當作時間軸與內容的分界
  for (let i = 0; i < weeks.length; i++) {
    const cell = ws.getCell(monthRow.number, firstWeekCol + i)
    cell.border = { ...(cell.border ?? {}), bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } } }
  }
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
    const planRow = ws.addRow([(isBottleneck ? '⚠ ' : '') + p.name, '計畫', fmt(p.start), fmt(p.end)])
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
    const actualRow = ws.addRow(['', '實際', prog > 0 ? fmt(p.start) : '', prog > 0 ? fmt(earnedEnd) : ''])
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
        cell.font = c === 2
          ? { size: 9, bold: true, color: { argb: 'FF475569' } }
          : { size: 9, color: { argb: 'FF64748B' } }
        cell.alignment = { horizontal: c === 2 ? 'center' : c >= 3 ? 'center' : 'left', vertical: 'middle' }
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
    ['淡色＝計畫區間', 'FFD1FAE5'], ['實心＝實際進度', 'FF10B981'],
    ['已完成', 'FF10B981'], ['進行中', 'FF3B82F6'], ['逾期', 'FFF59E0B'],
    ['未開始', 'FF94A3B8'], ['遲交', LATE_FILL], ['瓶頸(⚠)', 'FFFEF2F2'],
  ]
  // 色塊與文字分開並各自合併儲存格。塞在同一個 3 字寬的週欄裡，
  //   文字會溢到隔壁格，看起來像色塊畫歪了。
  // 排不下就換一列。原本是 `return`，等於沒聲沒息少印幾個圖例——
  //   偏偏被吃掉的都是排在後面的「遲交」「瓶頸」，剛好是最需要解釋的那兩個。
  const LG_STRIDE = 7
  const lgPerRow = Math.max(1, Math.floor(weeks.length / LG_STRIDE))
  let lgRow = legend
  LEGEND.forEach(([text, color], i) => {
    if (i > 0 && i % lgPerRow === 0) { lgRow = ws.addRow([]); lgRow.height = 16 }
    const base = firstWeekCol + (i % lgPerRow) * LG_STRIDE
    if (base + 5 > lastCol) return
    ws.mergeCells(lgRow.number, base, lgRow.number, base + 1)
    const sw = ws.getCell(lgRow.number, base)
    sw.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } }
    sw.border = { top: EDGE, bottom: EDGE, left: EDGE, right: EDGE }
    ws.mergeCells(lgRow.number, base + 2, lgRow.number, base + 5)
    const lb = ws.getCell(lgRow.number, base + 2)
    lb.value = text
    lb.font = { size: 9, color: { argb: 'FF334155' } }
    lb.alignment = { horizontal: 'left', vertical: 'middle' }
  })
  legend.height = 16
  const tip = ws.addRow([`說明：這張表每格 ${STEP} 天，用來看整體進度；確切日期請翻到各階段的細節分頁（一格＝一天）。每個階段上下兩列——上列「計畫」畫淡色、下列「實際」畫實心，兩條左右對齊，實際比計畫落後或超前用看的就知道；實際超出計畫截止的那一段轉紅代表遲交。階段名稱前的 ⚠ 為目前最落後的瓶頸。「標記」列的圈號對應下方的標記對照表（灰色＝計畫完成、紫色＝實際完成），確切日期以對照表為準。要篩選或排序請用「任務明細」分頁（一列一個任務，篩選器已掛好）。`])
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

  // ══ 每個階段一張：日級細節 ══
  //   一格一天，而且每個任務自己一列——總覽上圈號疊在一起看不懂的問題，
  //   在這裡根本不會發生，長條直接畫在它的日期上，旁邊就是日期文字。
  //   單一階段通常只有幾十天，所以欄寬可以維持正常，人在 Excel 裡調得動。
  const d0 = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  // 實心色 → 計畫列要用的淡色。計畫與實際同色系才看得出是同一件事的兩條
  const SOFT: Record<string, string> = {
    FF10B981: 'FFD1FAE5', FF3B82F6: 'FFDBEAFE', FFF59E0B: 'FFFEF3C7',
    FF94A3B8: 'FFF1F5F9', [LATE_FILL]: 'FFFEE2E2',
  }
  const usedNames = new Set(['階段總覽'])
  const sheetNameOf = (name: string) => {
    // Excel 工作表名稱上限 31 字，且不接受 : \ / ? * [ ]
    const base = (name.replace(/[:\\/?*[\]]/g, '-').slice(0, 27).trim()) || '階段'
    let out = base
    for (let n = 2; usedNames.has(out); n++) out = `${base.slice(0, 24)}(${n})`
    usedNames.add(out)
    return out
  }

  // 任務依樹狀排序（父在子前），子任務縮排，讀起來才看得出層級
  type TaskRow = typeof project.tasks[number]
  const kidsOf = new Map<string, TaskRow[]>()
  for (const t of project.tasks) {
    if (!t.parentId) continue
    const a = kidsOf.get(t.parentId); if (a) a.push(t); else kidsOf.set(t.parentId, [t])
  }
  const flatten = (list: TaskRow[], depth: number): { t: TaskRow; depth: number }[] =>
    list.flatMap(t => [{ t, depth }, ...flatten(kidsOf.get(t.id) ?? [], depth + 1)])

  for (const p of phases) {
    const roots = project.tasks.filter(t => t.milestoneId === p.id && !t.parentId)
    const items = flatten(roots, 0)

    // 日期範圍：階段計畫區間聯集所有任務的計畫與實際日期，前後各留 2 天當邊距
    const stamps = [p.start, p.end, ...items.flatMap(({ t }) =>
      [t.startDate ?? t.endDate, t.endDate, ...(t.completedAt ? [t.completedAt] : [])])]
    const lo = d0(new Date(Math.min(...stamps.map(d => d.getTime()))))
    const hi = d0(new Date(Math.max(...stamps.map(d => d.getTime()))))
    lo.setUTCDate(lo.getUTCDate() - 2); hi.setUTCDate(hi.getUTCDate() + 2)
    const days: Date[] = []
    for (const c = new Date(lo); c <= hi; c.setUTCDate(c.getUTCDate() + 1)) days.push(new Date(c))

    const LC = 6                       // 任務 / 負責人 / 類型 / 開始 / 結束 / 進度
    const firstDayCol = LC + 1
    const lastDayCol = LC + days.length
    const colOf = (d: Date) => {
      const i = Math.round((d0(d).getTime() - lo.getTime()) / DAY)
      return firstDayCol + Math.max(0, Math.min(days.length - 1, i))
    }

    const ds = wb.addWorksheet(sheetNameOf(p.name), {
      views: [{ state: 'frozen', xSplit: LC, ySplit: 6 }],
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    })
    ds.getColumn(1).width = 38
    ds.getColumn(2).width = 12
    ds.getColumn(3).width = 8
    ds.getColumn(4).width = 13
    ds.getColumn(5).width = 17   // 結束欄要放得下「2025-11-20（遲 5 天）」
    ds.getColumn(6).width = 8
    // 日欄 2.6：兩位數的日期放得下，拉寬拉窄也還在人能操作的範圍
    for (let i = 0; i < days.length; i++) ds.getColumn(firstDayCol + i).width = 2.6

    const tone0 = toneOf(p.status, p.progress, p.end, today)
    const dt = ds.addRow([`${p.name}　｜　階段細節（一格＝一天）`])
    dt.font = { bold: true, size: 14 }
    ds.mergeCells(1, 1, 1, lastDayCol)
    const dsub = ds.addRow([`計畫 ${fmt(p.start)} ~ ${fmt(p.end)}　|　狀態 ${tone0.text}　|　進度 ${p.progress}%　|　${project.projectCode} ${project.name}`])
    dsub.font = { size: 10, color: { argb: 'FF64748B' } }
    ds.mergeCells(2, 1, 2, lastDayCol)
    ds.addRow([])

    // 年 / 月 / 日。月份跨該月所有天數合併，一眼就分得出月份區段
    const dYear = ds.addRow([]); const dMon = ds.addRow([]); const dDay = ds.addRow([])
    dYear.height = 16; dMon.height = 18; dDay.height = 16
    const dSpan = (row: number, keyOf: (d: Date) => string, labelOf: (d: Date) => string, head: boolean) => {
      let i = 0
      while (i < days.length) {
        const key = keyOf(days[i])
        let j = i
        while (j + 1 < days.length && keyOf(days[j + 1]) === key) j++
        const c1 = firstDayCol + i, c2 = firstDayCol + j
        if (c2 > c1) ds.mergeCells(row, c1, row, c2)
        const cell = ds.getCell(row, c1)
        cell.value = labelOf(days[i])
        cell.alignment = { horizontal: 'center', vertical: 'middle' }
        cell.font = { size: head ? 10 : 9, bold: true, color: { argb: 'FF334155' } }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: head ? 'FFE0E7FF' : 'FFF1F5F9' } }
        i = j + 1
      }
    }
    dSpan(dYear.number, d => String(d.getUTCFullYear()), d => String(d.getUTCFullYear()), false)
    dSpan(dMon.number, d => `${d.getUTCFullYear()}-${d.getUTCMonth()}`, d => `${d.getUTCMonth() + 1}月`, true)
    for (let i = 0; i < days.length; i++) {
      const cell = ds.getCell(dDay.number, firstDayCol + i)
      cell.value = days[i].getUTCDate()
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
      cell.font = { size: 9, color: { argb: 'FF475569' } }
      // 週末上底色，用來數天數時有錨點，不然一整排數字看久了會跳行
      const wd = days[i].getUTCDay()
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: wd === 0 || wd === 6 ? 'FFE2E8F0' : 'FFF8FAFC' } }
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } } }
    }
    for (const [r, t] of [[4, '年'], [5, '月'], [6, '日']] as const) {
      const c = ds.getCell(r, 1); c.value = t
      c.font = { size: 9, bold: true, color: { argb: 'FF334155' } }
    }

    // 每個項目兩列：上「計畫」淡色、下「實際」實心——跟總覽同一套讀法。
    //   先前只畫一條、再把完成日塗深，結果是看的人分不出哪段是計畫哪段是實際。
    //   兩條上下對齊之後，實際比計畫短／長多少用看的就知道。
    const bar = (rowNum: number, from: Date, to: Date, color: string, solid: boolean, lateAfter?: Date) => {
      const a2 = colOf(from), b2 = colOf(to)
      const lateCol = lateAfter ? colOf(lateAfter) : Number.POSITIVE_INFINITY
      for (let c = a2; c <= b2; c++) {
        // 超出計畫截止的那一段轉紅：不分段的話，遲交一個月跟準時完成畫起來一樣
        const edge = c > lateCol ? LATE_FILL : color
        const cell = ds.getCell(rowNum, c)
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: solid ? edge : SOFT[edge] ?? edge } }
        cell.border = {
          top: { style: 'thin', color: { argb: edge } },
          bottom: { style: 'thin', color: { argb: edge } },
          left: c === a2 ? { style: 'thin', color: { argb: edge } } : undefined,
          right: c === b2 ? { style: 'thin', color: { argb: edge } } : undefined,
        }
      }
    }

    /** 畫一組「計畫 / 實際」。actTo 為 null 代表還沒有任何實際進度，實際列就留空。 */
    const pair = (opts: {
      name: string; who: string; bold: boolean; size: number
      planFrom: Date; planTo: Date
      actFrom: Date | null; actTo: Date | null
      lateAfter: Date | null; lateDays: number
      progress: number; color: string
    }) => {
      const r1 = ds.addRow([opts.name, opts.who, '計畫', fmt(opts.planFrom), fmt(opts.planTo), `${opts.progress}%`])
      const r2 = ds.addRow(['', '', '實際',
        opts.actFrom ? fmt(opts.actFrom) : '',
        opts.actTo ? `${fmt(opts.actTo)}${opts.lateDays > 0 ? `（遲 ${opts.lateDays} 天）` : ''}` : '',
        ''])
      r1.height = 18; r2.height = 18

      // 名稱／負責人／進度跨兩列垂直置中，讀起來才是同一個任務的一組
      for (const c of [1, 2, 6]) ds.mergeCells(r1.number, c, r2.number, c)
      ds.getCell(r1.number, 1).font = { size: opts.size, bold: opts.bold }
      ds.getCell(r1.number, 1).alignment = { vertical: 'middle' }
      ds.getCell(r1.number, 2).font = { size: 9, color: { argb: 'FF64748B' } }
      ds.getCell(r1.number, 2).alignment = { vertical: 'middle' }
      ds.getCell(r1.number, 6).font = { size: 9, color: { argb: 'FF64748B' } }
      ds.getCell(r1.number, 6).alignment = { horizontal: 'center', vertical: 'middle' }

      for (const r of [r1, r2]) {
        for (const c of [3, 4, 5]) {
          const cell = r.getCell(c)
          cell.font = { size: 9, color: { argb: 'FF64748B' } }
          cell.alignment = { horizontal: 'center', vertical: 'middle' }
          cell.numFmt = '@'
        }
        for (let c = firstDayCol; c <= lastDayCol; c++) r.getCell(c).border = { left: GRID, right: GRID }
      }
      // 「計畫 / 實際」這兩個字加深，掃過去才抓得到是哪一列
      r1.getCell(3).font = { size: 9, bold: true, color: { argb: 'FF475569' } }
      r2.getCell(3).font = { size: 9, bold: true, color: { argb: opts.lateDays > 0 ? LATE_FILL : 'FF475569' } }
      if (opts.lateDays > 0) r2.getCell(5).font = { size: 9, bold: true, color: { argb: LATE_FILL } }

      bar(r1.number, opts.planFrom, opts.planTo, opts.color, false)
      if (opts.actFrom && opts.actTo) {
        bar(r2.number, opts.actFrom, opts.actTo, opts.color, true, opts.lateAfter ?? undefined)
      }
      // 每組底下收一條線，兩個任務才不會黏在一起
      for (let c = 1; c <= lastDayCol; c++) {
        const cell = ds.getCell(r2.number, c)
        cell.border = { ...(cell.border ?? {}), bottom: EDGE }
      }
    }

    // 階段自己先畫一組當基準，底下任務才有東西可以對照
    const pLate = p.actualEnd != null && d0(p.actualEnd) > d0(p.end)
    pair({
      name: `【階段】${p.name}`, who: '', bold: true, size: 11,
      planFrom: p.start, planTo: p.end,
      actFrom: p.progress > 0 || p.actualEnd ? p.start : null,
      actTo: p.actualEnd ?? (p.progress > 0
        ? new Date(p.start.getTime() + (p.progress / 100) * Math.max(1, p.end.getTime() - p.start.getTime()))
        : null),
      lateAfter: pLate ? p.end : null,
      lateDays: pLate ? Math.round((d0(p.actualEnd!).getTime() - d0(p.end).getTime()) / DAY) : 0,
      progress: p.progress, color: tone0.fill,
    })
    ds.addRow([])

    for (const { t, depth } of items) {
      const tt = toneOf(t.status, t.progress, t.endDate, today)
      const planFrom = t.startDate ?? t.endDate
      const late = t.completedAt != null && d0(t.completedAt) > d0(t.endDate)
      // 還沒完成但有進度：用進度換算實際走到哪，跟總覽的 Actual 同一套算法
      const actTo = t.completedAt ?? (t.progress > 0
        ? new Date(planFrom.getTime() + (t.progress / 100) * Math.max(1, t.endDate.getTime() - planFrom.getTime()))
        : null)
      pair({
        name: `${'　　'.repeat(depth)}${t.title}`, who: t.assignee || '',
        bold: depth === 0, size: 10,
        planFrom, planTo: t.endDate,
        actFrom: actTo ? planFrom : null, actTo,
        lateAfter: late ? t.endDate : null,
        lateDays: late ? Math.round((d0(t.completedAt!).getTime() - d0(t.endDate).getTime()) / DAY) : 0,
        progress: t.progress, color: tt.fill,
      })
    }

    if (today >= lo && today <= hi) {
      const tc = colOf(today)
      for (let r = 4; r <= ds.rowCount; r++) {
        const cell = ds.getCell(r, tc)
        cell.border = { ...(cell.border ?? {}), right: { style: 'medium', color: { argb: 'FFE11D48' } } }
      }
      ds.getCell(3, tc).value = '今天'
      ds.getCell(3, tc).font = { size: 9, bold: true, color: { argb: 'FFE11D48' } }
    }

    // 圖例：深綠／紅／各種淡色不解釋的話沒人知道是什麼意思
    ds.addRow([])
    const dLegend: [string, string][] = [
      ['已完成', 'FF10B981'], ['進行中', 'FF3B82F6'], ['逾期', 'FFF59E0B'],
      ['未開始', 'FF94A3B8'], ['遲交段', LATE_FILL], ['週末', 'FFE2E8F0'],
    ]
    // 色塊 2 欄 + 文字 9 欄：日欄只有 2.6 寬，文字擠在色塊同一格會蓋掉顏色
    const SW = 2, TX = 9, STRIDE = SW + TX + 1
    const perRow = Math.max(1, Math.floor(days.length / STRIDE))
    let lgRow = ds.addRow([]); lgRow.height = 17
    lgRow.getCell(1).value = '圖例'
    lgRow.getCell(1).font = { bold: true, size: 10 }
    dLegend.forEach(([text, color], i) => {
      if (i > 0 && i % perRow === 0) { lgRow = ds.addRow([]); lgRow.height = 17 }
      const base = firstDayCol + (i % perRow) * STRIDE
      if (base + STRIDE - 1 > lastDayCol) return
      ds.mergeCells(lgRow.number, base, lgRow.number, base + SW - 1)
      const sw = ds.getCell(lgRow.number, base)
      sw.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } }
      sw.border = { top: EDGE, bottom: EDGE, left: EDGE, right: EDGE }
      ds.mergeCells(lgRow.number, base + SW, lgRow.number, base + SW + TX - 1)
      const lb = ds.getCell(lgRow.number, base + SW)
      lb.value = text
      lb.font = { size: 9, color: { argb: 'FF334155' } }
      lb.alignment = { horizontal: 'left', vertical: 'middle' }
    })

    const dtip = ds.addRow(['說明：一格＝一天。每個任務上下兩列——上列「計畫」畫淡色、下列「實際」畫實心，兩條左右對齊，實際比計畫長或短用看的就知道。實際超出計畫截止的那一段轉紅，並在「結束」欄註明遲幾天；還沒完成的任務，實際列畫到目前進度換算的位置。上方色塊為狀態配色，日期列灰底為週末，紅色直線為今天。'])
    dtip.getCell(1).font = { size: 9, color: { argb: 'FF64748B' } }
    ds.mergeCells(dtip.number, 1, dtip.number, lastDayCol)
  }

  // ══ 階段彙總：階段層級的平表 ══
  const raw = wb.addWorksheet('階段彙總')
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
  raw.views = [{ state: 'frozen', ySplit: 1 }]
  raw.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 8 } }
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

  // ══ 任務明細：一列一個任務的平表 ══
  //   圖表分頁為了好讀用了合併儲存格，代價是不能篩選。要篩選、排序、
  //   拉樞紐分析的人來這張——沒有任何合併、標題只有一列、篩選器已經掛好。
  const flat = wb.addWorksheet('任務明細', { views: [{ state: 'frozen', ySplit: 1 }] })
  const FLAT_COLS = [
    { header: '階段', width: 26 },
    { header: '層級', width: 11 },
    { header: '任務名稱', width: 40 },
    { header: '上層任務', width: 28 },
    { header: '負責人', width: 14 },
    { header: '計畫開始', width: 12 },
    { header: '計畫結束', width: 12 },
    { header: '計畫天數', width: 10 },
    { header: '實際完成日', width: 12 },
    { header: '與計畫差(天)', width: 13 },
    { header: '遲交', width: 8 },
    { header: '狀態', width: 10 },
    { header: '進度%', width: 9 },
    { header: '總覽標記', width: 10 },
  ]
  flat.columns = FLAT_COLS.map(c => ({ width: c.width }))
  const fh = flat.addRow(FLAT_COLS.map(c => c.header))
  fh.font = { bold: true, color: { argb: 'FF1E3A8A' } }
  fh.eachCell(c => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF2F7' } }
    c.border = { top: EDGE, bottom: EDGE }
  })

  const titleById = new Map(project.tasks.map(t => [t.id, t.title]))
  // 日期差一律走「整天」：completedAt 帶時分秒，直接相減會多算或少算一天
  const dayDiff = (a: Date, b: Date) => Math.round((d0(a).getTime() - d0(b).getTime()) / DAY)

  for (const ph of phases) {
    // 里程碑自己也要是一列。只當成「階段」欄的話，篩「層級＝里程碑」會篩不到東西，
    //   而且里程碑的計畫區間與實際完成日就沒有地方可以對照。
    const mDiff = ph.actualEnd ? dayDiff(ph.actualEnd, ph.end) : null
    const mTone = toneOf(ph.status, ph.progress, ph.end, today)
    const mr = flat.addRow([
      ph.name, '里程碑', ph.name, '', '',
      fmt(ph.start), fmt(ph.end), dayDiff(ph.end, ph.start) + 1,
      ph.actualEnd ? fmt(ph.actualEnd) : '',
      mDiff ?? '', mDiff != null && mDiff > 0 ? '是' : '',
      mTone.text, ph.progress, '',
    ])
    for (const c of [6, 7, 9]) mr.getCell(c).numFmt = '@'
    // 上底色＋粗體當分組線。這是一般資料列，沒有合併，篩選照樣吃得到
    mr.font = { size: 10, bold: true }
    mr.eachCell(c => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }
      c.border = { top: EDGE, bottom: EDGE }
    })
    if (mDiff != null && mDiff > 0) {
      for (const c of [9, 10, 11]) mr.getCell(c).font = { size: 10, bold: true, color: { argb: LATE_FILL } }
    }

    const roots = project.tasks.filter(t => t.milestoneId === ph.id && !t.parentId)
    for (const { t, depth } of flatten(roots, 0)) {
      const planFrom = t.startDate ?? t.endDate
      const diff = t.completedAt ? dayDiff(t.completedAt, t.endDate) : null
      const tone = toneOf(t.status, t.progress, t.endDate, today)
      const r = flat.addRow([
        ph.name,
        depth === 0 ? '任務' : `子任務 L${depth + 1}`,
        t.title,
        t.parentId ? (titleById.get(t.parentId) ?? '') : '',
        t.assignee || '',
        fmt(planFrom),
        fmt(t.endDate),
        dayDiff(t.endDate, planFrom) + 1,
        t.completedAt ? fmt(t.completedAt) : '',
        diff ?? '',
        diff != null && diff > 0 ? '是' : '',
        tone.text,
        t.progress,
        markerIds.has(t.id) ? '是' : '',
      ])
      // 日期欄位鎖成文字，否則 Excel 會把 2026-01-05 自動轉成別的格式
      for (const c of [6, 7, 9]) r.getCell(c).numFmt = '@'
      r.font = { size: 10 }
      if (diff != null && diff > 0) {
        for (const c of [9, 10, 11]) r.getCell(c).font = { size: 10, bold: true, color: { argb: LATE_FILL } }
      }
      r.eachCell(c => { c.border = { bottom: GRID } })
    }
  }
  flat.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: FLAT_COLS.length } }

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
