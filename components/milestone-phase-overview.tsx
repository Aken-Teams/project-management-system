'use client'

import { useMemo, useState, useEffect } from 'react'
import { ChevronDown, Flag, SlidersHorizontal, Rows3, Merge, Shrink, MoveHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { todayUtc } from '@/lib/date-utils'
import { useAuth } from '@/lib/auth-context'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Checkbox } from '@/components/ui/checkbox'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip'
import type { Project, Milestone } from '@/lib/mock-data'

const fmtDate = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '/')

// 階段 hover 卡：名稱 + 起訖日 + 天數 + 狀態/進度（狀態與顏色一律走 phaseTone，全圖一致）
function PhaseTip({ p, today }: { p: Phase; today: Date }) {
  const days = Math.round((p.end.getTime() - p.start.getTime()) / 86400000) + 1
  const v = phaseTone(p, today)
  return (
    <div className="space-y-0.5">
      <div className="font-semibold">{p.name}</div>
      <div className="tabular-nums">{fmtDate(p.start)} ~ {fmtDate(p.end)}（{days} 天）</div>
      <div className="text-muted-foreground">狀態：{v.label} · 進度 {p.progress}%</div>
    </div>
  )
}

// 里程碑階段總覽（仿範本）：階段 chevron（在日期上方）+ 年月軸 + Plan/Actual。
//   重疊階段可「分開」(自動分層) 或「合併」(單列)；並可勾選要顯示哪些階段。此設定只有 A / pm / admin 能調整。

const TIP = 14
const ARROW_HEAD = `polygon(0 0, calc(100% - ${TIP}px) 0, 100% 50%, calc(100% - ${TIP}px) 100%, 0 100%)`
const ARROW_MID = `polygon(0 0, calc(100% - ${TIP}px) 0, 100% 50%, calc(100% - ${TIP}px) 100%, 0 100%, ${TIP}px 50%)`
const arrowClip = (i: number) => (i === 0 ? ARROW_HEAD : ARROW_MID)

function parseDate(s?: string | null): Date | null {
  if (!s) return null
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

type Phase = { id: string; name: string; status: Milestone['status']; progress: number; start: Date; end: Date; lane: number }

type PhaseModel = {
  phases: Phase[]; laneCount: number; pct: (d: Date) => number
  months: { left: number; width: number; label: string; year: number }[]
  years: { left: number; width: number; year: number }[]
  todayInRange: boolean; todayPct: number
}

// 單一狀態解析：決定顏色與標籤（全圖 — 階段/Plan/Actual/tooltip/圖例 — 共用，確保口徑一致）。
//   與詳細甘特圖口徑一致：以「進度」為主 — 有進度即進行中；不把里程碑層級的 blocked 另標「受阻」
//   （blocked 只是底下有任務卡在相依，里程碑其實仍在推進；受阻細節留在任務層看）。
//   優先序：已完成 → 逾期 → 進行中(有進度) → 未開始
function phaseTone(p: Phase, today: Date) {
  const overdue = p.status !== 'done' && p.end < today
  if (p.status === 'done') return { key: 'done', label: '已完成', line: 'bg-emerald-500', soft: 'bg-emerald-50 dark:bg-emerald-900/40', text: 'text-emerald-800 dark:text-emerald-200' }
  if (overdue) return { key: 'overdue', label: '逾期', line: 'bg-amber-500', soft: 'bg-amber-50 dark:bg-amber-900/40', text: 'text-amber-800 dark:text-amber-200' }
  if (p.status === 'in-progress' || p.status === 'blocked' || p.progress > 0) return { key: 'in-progress', label: '進行中', line: 'bg-blue-500', soft: 'bg-blue-50 dark:bg-blue-900/40', text: 'text-blue-800 dark:text-blue-200' }
  return { key: 'todo', label: '未開始', line: 'bg-slate-400', soft: 'bg-slate-50 dark:bg-slate-800/60', text: 'text-slate-700 dark:text-slate-200' }
}

export function MilestonePhaseOverview({ project }: { project: Project }) {
  const { user } = useAuth()
  // 預設收合（避免與下方甘特疊成兩排時間軸而顯亂）；展開/收合狀態記在 localStorage（個人偏好）
  const [collapsed, setCollapsed] = useState(true)
  const collapseKey = `phaseOverviewCollapsed:${project.id}`
  useEffect(() => {
    try { const v = localStorage.getItem(collapseKey); if (v !== null) setCollapsed(v === '1') } catch { /* ignore */ }
  }, [collapseKey])
  const toggleCollapsed = () => setCollapsed(c => {
    const next = !c
    try { localStorage.setItem(collapseKey, next ? '1' : '0') } catch { /* ignore */ }
    return next
  })
  const today = todayUtc()

  // 只有 A（當責）或 pm / admin 能調整篩選
  const canCurate = useMemo(() => {
    if (!user) return false
    if (user.role === 'pm' || user.role === 'admin') return true
    const email = user.email?.toLowerCase()
    return (project.teamMembers || []).some(tm => tm.role === 'A' && tm.email?.toLowerCase() === email)
  }, [user, project.teamMembers])

  // 設定：mode（separate 分開 / merge 合併）、hidden（隱藏的里程碑）— 存後端(SystemSetting)，全域共用
  const [mode, setMode] = useState<'separate' | 'merge'>('separate')
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  // axis：fit＝全部貼合可視寬度(專案長時擠一起)；timeline＝依時間軸給固定寬度、可橫向滑動、顯示月份
  const [axis, setAxis] = useState<'fit' | 'timeline'>('fit')

  // 載入（所有檢視者都套用 A 存好的設定）
  useEffect(() => {
    let alive = true
    fetch(`/api/projects/${project.id}/phase-overview`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((d: { mode: string; hidden: string[]; axis?: string }) => {
        if (!alive) return
        setMode(d.mode === 'merge' ? 'merge' : 'separate')
        setHidden(new Set(Array.isArray(d.hidden) ? d.hidden : []))
        setAxis(d.axis === 'timeline' ? 'timeline' : 'fit')
      })
      .catch(() => { /* 用預設 */ })
    return () => { alive = false }
  }, [project.id])

  // 只有 A / pm / admin「主動變更」才寫回後端（純事件觸發，載入不會呼叫）
  const persist = (nextMode: 'separate' | 'merge', nextHidden: Set<string>, nextAxis: 'fit' | 'timeline') => {
    if (!canCurate || !user?.email) return
    fetch(`/api/projects/${project.id}/phase-overview`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-user-email': user.email },
      body: JSON.stringify({ mode: nextMode, hidden: [...nextHidden], axis: nextAxis }),
    }).catch(() => { /* 忽略 */ })
  }
  const changeMode = (m: 'separate' | 'merge') => { setMode(m); persist(m, hidden, axis) }
  const changeAxis = (a: 'fit' | 'timeline') => { setAxis(a); persist(mode, hidden, a) }
  const setShown = (id: string, show: boolean) => {
    const s = new Set(hidden)
    if (show) s.delete(id); else s.add(id)
    setHidden(s); persist(mode, s, axis)
  }
  const showAll = () => { setHidden(new Set()); persist(mode, new Set(), axis) }

  const model = useMemo(() => {
    const ms = project.milestones.filter(m => !hidden.has(m.id))
    if (ms.length === 0) return null

    const projStart = parseDate(project.startDate) ?? parseDate(ms[0].dueDate)!
    const base: Omit<Phase, 'lane'>[] = []
    for (let i = 0; i < ms.length; i++) {
      const m = ms[i]
      const end = parseDate(m.dueDate)
      if (!end) continue
      let start = parseDate(m.startDate)
      if (!start) start = base.length > 0 ? base[base.length - 1].end : projStart
      if (start > end) start = end
      base.push({ id: m.id, name: m.name, status: m.status, progress: m.progress, start, end })
    }
    if (base.length === 0) return null

    // 分層：merge → 全部第 0 層（單列，重疊時互相覆蓋）；separate → 貪婪分層讓所有階段都看得到
    let laneCount = 1
    const phases: Phase[] = base.map(p => ({ ...p, lane: 0 }))
    if (mode === 'separate') {
      const laneEnds: number[] = []
      phases.forEach(p => {
        let lane = laneEnds.findIndex(e => e <= p.start.getTime())
        if (lane === -1) { lane = laneEnds.length; laneEnds.push(p.end.getTime()) }
        else laneEnds[lane] = p.end.getTime()
        p.lane = lane
      })
      laneCount = Math.max(1, laneEnds.length)
    }

    const projEnd = parseDate(project.endDate)
    const minT = Math.min(projStart.getTime(), ...phases.map(p => p.start.getTime()))
    const maxT = Math.max(projEnd?.getTime() ?? 0, ...phases.map(p => p.end.getTime()))
    const span = Math.max(1, maxT - minT)
    const pct = (d: Date) => Math.max(0, Math.min(100, ((d.getTime() - minT) / span) * 100))

    const months: { left: number; width: number; label: string; year: number }[] = []
    const cur = new Date(Date.UTC(new Date(minT).getUTCFullYear(), new Date(minT).getUTCMonth(), 1))
    const endCap = new Date(maxT)
    while (cur <= endCap) {
      const next = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 1))
      const left = pct(cur)
      months.push({ left, width: pct(next) - left, label: `${cur.getUTCMonth() + 1}月`, year: cur.getUTCFullYear() })
      cur.setUTCMonth(cur.getUTCMonth() + 1)
    }
    const years: { left: number; width: number; year: number }[] = []
    for (const m of months) {
      const last = years[years.length - 1]
      if (last && last.year === m.year) last.width += m.width
      else years.push({ left: m.left, width: m.width, year: m.year })
    }

    const todayInRange = today.getTime() >= minT && today.getTime() <= maxT
    const todayPct = today.getTime() >= maxT ? 100 : today.getTime() <= minT ? 0 : pct(today)

    return { phases, laneCount, pct, months, years, todayInRange, todayPct }
  }, [project.milestones, project.startDate, project.endDate, today, mode, hidden])

  const doneCount = model?.phases.filter(p => p.status === 'done').length ?? 0
  const LABEL_W = 'w-14'
  const STAGE_LANE = 32, STAGE_SEG = 30
  const PLAN_LANE = 26, PLAN_SEG = 22

  return (
    <div className="rounded-xl border bg-card">
      {/* Header（左：收合；右：篩選，只有 A/pm/admin 顯示） */}
      <div className="flex items-center gap-2 px-4 py-2.5">
        <button onClick={toggleCollapsed} className="flex items-center gap-2 flex-1 text-left">
          <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', collapsed && '-rotate-90')} />
          <Flag className="h-4 w-4 text-primary" />
          <span className="font-medium text-sm">里程碑階段總覽</span>
          <span className="text-xs text-muted-foreground">{doneCount}/{model?.phases.length ?? 0} 階段完成 · 整體 {project.progress}%</span>
        </button>
        {canCurate && (
          <Popover>
            <PopoverTrigger asChild>
              <button className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border text-muted-foreground hover:bg-muted transition-colors">
                <SlidersHorizontal className="h-3.5 w-3.5" />顯示設定
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" collisionPadding={12} className="w-72 p-3.5 space-y-3 overflow-y-auto" style={{ maxHeight: 'var(--radix-popover-content-available-height)' }}>
              <div className="space-y-1.5">
                <div className="text-xs font-semibold text-muted-foreground">重疊階段</div>
                <div className="grid grid-cols-2 gap-1.5">
                  <button onClick={() => changeMode('separate')}
                    className={cn('inline-flex items-center justify-center gap-1 text-xs py-1.5 rounded-md border transition-colors',
                      mode === 'separate' ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted')}>
                    <Rows3 className="h-3.5 w-3.5" />分開
                  </button>
                  <button onClick={() => changeMode('merge')}
                    className={cn('inline-flex items-center justify-center gap-1 text-xs py-1.5 rounded-md border transition-colors',
                      mode === 'merge' ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted')}>
                    <Merge className="h-3.5 w-3.5" />合併
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">分開：分層不遮擋；合併：擠成一列</p>
              </div>
              <div className="space-y-1.5 border-t pt-2.5">
                <div className="text-xs font-semibold text-muted-foreground">時間軸寬度</div>
                <div className="grid grid-cols-2 gap-1.5">
                  <button onClick={() => changeAxis('fit')}
                    className={cn('inline-flex items-center justify-center gap-1 text-xs py-1.5 rounded-md border transition-colors',
                      axis === 'fit' ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted')}>
                    <Shrink className="h-3.5 w-3.5" />貼合
                  </button>
                  <button onClick={() => changeAxis('timeline')}
                    className={cn('inline-flex items-center justify-center gap-1 text-xs py-1.5 rounded-md border transition-colors',
                      axis === 'timeline' ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted')}>
                    <MoveHorizontal className="h-3.5 w-3.5" />展開時間軸
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">貼合：全部縮入畫面；展開時間軸：固定月寬、顯示月份、可橫向滑動（適合長專案）</p>
              </div>
              <div className="space-y-1.5 border-t pt-2.5">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold text-muted-foreground">顯示階段</div>
                  <button className="text-xs text-primary hover:underline" onClick={showAll}>全選</button>
                </div>
                <div className="max-h-52 overflow-y-auto space-y-0.5">
                  {project.milestones.map(m => (
                    <label key={m.id} className="flex items-center gap-2 px-1 py-1 rounded hover:bg-muted/60 cursor-pointer text-xs">
                      <Checkbox checked={!hidden.has(m.id)} onCheckedChange={(c) => setShown(m.id, !!c)} />
                      <span className="truncate">{m.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>

      {!collapsed && (!model ? (
        <div className="px-4 pb-4 text-sm text-muted-foreground text-center py-6">無可顯示的里程碑階段（請在「顯示設定」勾選）</div>
      ) : (
        <PhaseBody model={model} today={today} project={project} axis={axis} LABEL_W={LABEL_W} STAGE_LANE={STAGE_LANE} STAGE_SEG={STAGE_SEG} PLAN_LANE={PLAN_LANE} PLAN_SEG={PLAN_SEG} />
      ))}
    </div>
  )
}

function PhaseBody({ model, today, project, axis, LABEL_W, STAGE_LANE, STAGE_SEG, PLAN_LANE, PLAN_SEG }: {
  model: PhaseModel; today: Date; project: Project; axis: 'fit' | 'timeline'
  LABEL_W: string; STAGE_LANE: number; STAGE_SEG: number; PLAN_LANE: number; PLAN_SEG: number
}) {
  const { phases, laneCount, pct, months, years, todayInRange, todayPct } = model
  const stageH = laneCount * STAGE_LANE
  const planH = laneCount * PLAN_LANE
  // 展開時間軸：每月固定像素寬，讓內容超出容器 → 觸發橫向捲動、月份也放得下顯示
  const MONTH_PX = 52
  const LABEL_PX = 64 // 對齊左側 w-14 標籤 + gap
  const trackPx = months.length * MONTH_PX // 定位區(flex-1)的實際像素寬
  const timelinePx = LABEL_PX + trackPx
  const showMonth = (mWidth: number) => axis === 'timeline' || mWidth > 3
  // 時間軸模式：只給 minWidth（不鎖 width）→ 內容比容器長時撐開捲動、比容器短時仍填滿容器不縮水
  const innerStyle = { minWidth: axis === 'timeline' ? timelinePx : 720 }
  // 階段/Plan 的最小寬：貼合模式用百分比(避免細到看不見)；時間軸模式改用固定像素→短階段不被灌大
  const minStagePct = axis === 'timeline' ? (18 / trackPx) * 100 : 4
  const minPlanPct = axis === 'timeline' ? (16 / trackPx) * 100 : 3

  const TodayLine = ({ height }: { height: number }) =>
    todayInRange ? <div className="absolute top-0 w-px bg-rose-500/80 z-20 pointer-events-none" style={{ left: `${todayPct}%`, height }} /> : null

  // 每月一條垂直虛線表格線（仿甘特圖內表格），放各軌道底層
  const GridLines = () => (
    <>
      {months.map((m, i) => (
        <div key={i} className="absolute top-0 bottom-0 border-l border-dashed border-border/60 pointer-events-none" style={{ left: `${m.left}%` }} />
      ))}
    </>
  )

  return (
    <TooltipProvider delayDuration={100}>
    <div className="px-4 pb-4 pt-1 overflow-x-auto">
      <div className="space-y-1" style={innerStyle}>
        {/* ① 階段 chevron */}
        <div className="flex items-stretch gap-2">
          <div className={cn(LABEL_W, 'shrink-0 flex items-center text-[11px] font-semibold text-muted-foreground')}>階段</div>
          <div className="relative flex-1" style={{ height: stageH }}>
            {phases.map((p, i) => {
              const tone = phaseTone(p, today)
              const left = pct(p.start)
              const width = Math.max(pct(p.end) - left, minStagePct)
              const clip = arrowClip(i)
              return (
                <Tooltip key={p.id}>
                  <TooltipTrigger asChild>
                    <div
                      className={cn('absolute cursor-default', tone.line)}
                      style={{ left: `${left}%`, width: `${width}%`, top: p.lane * STAGE_LANE, height: STAGE_SEG, clipPath: clip }}>
                      <div className={cn('absolute inset-[2px] flex items-center pr-3', i === 0 ? 'pl-2.5' : 'pl-4', tone.soft, tone.text)} style={{ clipPath: clip }}>
                        <span className="text-xs font-semibold truncate">{p.name}</span>
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs"><PhaseTip p={p} today={today} /></TooltipContent>
                </Tooltip>
              )
            })}
            <TodayLine height={stageH} />
          </div>
        </div>

        {/* ② 年 / 月軸 */}
        <div className="flex gap-2 pt-0.5">
          <div className={cn(LABEL_W, 'shrink-0')} />
          <div className="relative flex-1 h-5 bg-primary/10 rounded-t border-y border-border/50">
            {years.map((y, i) => (
              <div key={i} className="absolute top-0 h-5 flex items-center justify-center text-[11px] font-semibold text-foreground/70 border-l border-border/50"
                style={{ left: `${y.left}%`, width: `${y.width}%` }}>{y.year}</div>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <div className={cn(LABEL_W, 'shrink-0')} />
          <div className="relative flex-1 h-5 bg-primary/[0.04] border-b border-border/50">
            {months.map((m, i) => (
              <div key={i} className="absolute top-0 h-5 flex items-center justify-center text-[11px] text-muted-foreground border-l border-border/40"
                style={{ left: `${m.left}%`, width: `${m.width}%` }}>{showMonth(m.width) ? m.label : ''}</div>
            ))}
          </div>
        </div>

        {/* ③ Plan chevron */}
        <div className="flex items-stretch gap-2 pt-1.5">
          <div className={cn(LABEL_W, 'shrink-0 flex items-center text-[11px] font-semibold text-muted-foreground')}>Plan</div>
          <div className="relative flex-1" style={{ height: planH }}>
            <GridLines />
            {phases.map((p, i) => {
              const tone = phaseTone(p, today)
              const left = pct(p.start)
              const width = Math.max(pct(p.end) - left, minPlanPct)
              const clip = arrowClip(i)
              return (
                <Tooltip key={p.id}>
                  <TooltipTrigger asChild>
                    <div
                      className={cn('absolute cursor-default', tone.line)}
                      style={{ left: `${left}%`, width: `${width}%`, top: p.lane * PLAN_LANE, height: PLAN_SEG, clipPath: clip }}>
                      <div className={cn('absolute inset-[1.5px] flex items-center pr-3 bg-background', tone.text, i === 0 ? 'pl-2' : 'pl-4')} style={{ clipPath: clip }}>
                        <span className="text-[11px] font-semibold truncate">{p.name}</span>
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs"><PhaseTip p={p} today={today} /></TooltipContent>
                </Tooltip>
              )
            })}
            <TodayLine height={planH} />
          </div>
        </div>

        {/* ④ Actual — 完成度長條（earned value）：長度＝完成度%×規劃區間；端點對比今天線 → 落後(琥珀斜線缺口)/超前(綠) */}
        <div className="flex items-stretch gap-2 mt-1">
          <div className={cn(LABEL_W, 'shrink-0 flex items-center text-[11px] font-semibold text-muted-foreground')}>Actual</div>
          <div className="relative flex-1" style={{ height: planH }}>
            <GridLines />
            {phases.map((p) => {
              const done = p.status === 'done'
              const started = p.start <= today
              const prog = done ? 1 : Math.max(0, Math.min(1, p.progress / 100))
              // 未開始 / 尚未動工 → 不畫實際段
              if (!done && !(started && prog > 0)) return null
              const span = Math.max(1, p.end.getTime() - p.start.getTime())
              const earnedEnd = new Date(p.start.getTime() + prog * span) // 完成度映射到規劃時間軸
              const top = p.lane * PLAN_LANE
              const dayMs = 86400000
              const varDays = Math.round((today.getTime() - earnedEnd.getTime()) / dayMs) // >0 落後、<0 超前
              const label = done ? '已完成'
                : varDays > 0 ? `落後約 ${varDays} 天`
                  : varDays < 0 ? `超前約 ${-varDays} 天` : '準時'
              // 分段：已完成(藍/綠) + 落後缺口(琥珀斜線) 或 超前段(綠)
              const solidEnd = done ? p.end : (earnedEnd < today ? earnedEnd : today)
              const segs: { l: number; r: number; kind: 'earned' | 'behind' | 'ahead' }[] = [
                { l: pct(p.start), r: pct(solidEnd), kind: 'earned' },
              ]
              if (!done && earnedEnd.getTime() > today.getTime()) segs.push({ l: pct(today), r: pct(earnedEnd), kind: 'ahead' })
              else if (!done && earnedEnd.getTime() < today.getTime()) segs.push({ l: pct(earnedEnd), r: pct(today), kind: 'behind' })
              return (
                <Tooltip key={p.id}>
                  <TooltipTrigger asChild>
                    <div className="absolute cursor-default" style={{ left: 0, right: 0, top, height: PLAN_SEG }}>
                      {segs.map((s, si) => s.kind === 'behind' ? (
                        <div key={si} className="absolute h-full rounded-sm border border-dashed border-amber-400"
                          style={{ left: `${s.l}%`, width: `${Math.max(s.r - s.l, 0.4)}%`, backgroundImage: 'repeating-linear-gradient(45deg, rgba(245,158,11,.28) 0 5px, transparent 5px 10px)' }} />
                      ) : (
                        <div key={si} className={cn('absolute h-full rounded-sm flex items-center', done ? 'bg-emerald-500' : s.kind === 'ahead' ? 'bg-emerald-500' : 'bg-blue-500')}
                          style={{ left: `${s.l}%`, width: `${Math.max(s.r - s.l, 0.6)}%` }}>
                          {si === 0 && <span className="text-[11px] font-bold text-white truncate px-2">{p.name}</span>}
                        </div>
                      ))}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    <div className="space-y-0.5">
                      <div className="font-semibold">{p.name}</div>
                      <div className={cn(varDays > 0 && !done ? 'text-amber-600 dark:text-amber-400 font-medium' : varDays < 0 && !done ? 'text-emerald-600 dark:text-emerald-400 font-medium' : 'text-muted-foreground')}>完成度 {p.progress}% · {label}</div>
                      <div className="tabular-nums text-muted-foreground">實際完成到 {fmtDate(earnedEnd)}（今天 {fmtDate(today)}）</div>
                    </div>
                  </TooltipContent>
                </Tooltip>
              )
            })}
            <TodayLine height={planH} />
          </div>
        </div>
      </div>

      {/* 圖例 */}
      <div className="flex items-center gap-3 pt-2 text-xs text-muted-foreground flex-wrap">
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-emerald-500" />已完成</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-blue-500" />進行中</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-amber-500" />逾期</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-slate-400" />未開始</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm border border-dashed border-amber-400" style={{ backgroundImage: 'repeating-linear-gradient(45deg, rgba(245,158,11,.28) 0 3px, transparent 3px 6px)' }} />落後（Actual 未達今天）</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-3 bg-rose-500/70" style={{ clipPath: 'polygon(0 0,100% 50%,0 100%)' }} />今天</span>
      </div>
    </div>
    </TooltipProvider>
  )
}
